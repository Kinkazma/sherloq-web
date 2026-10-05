import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import init,{WasmReader} from '../vendor/c2pa/c2pa.js';import {c2paParams,c2paSettings,summarizeC2pa} from '../src/c2pa-report.js';
const root=new URL('./data/c2pa/',import.meta.url),ref=JSON.parse(await readFile(new URL('reference.json',root)));
test('C2PA parent preserves a transported native allocation cause and releases its worker reservation',async t=>{
 const {validateC2paSource}=await import('../src/c2pa-validation.js'),{Budget}=await import('../src/cache.js'),{EngineError,serializeEngineError}=await import('../src/errors.js'),budget=new Budget(1024**3),prior=globalThis.Worker;let terminated=false;
 globalThis.Worker=class{postMessage(){queueMicrotask(()=>this.onmessage({data:{failure:serializeEngineError(new EngineError('MEMORY_ALLOCATION','Native allocation refused',{cause:new Error('alloc::rust_oom'),details:{allocationKind:'wasm',currentBytes:128*1024**2}}))}}));}terminate(){terminated=true;}};
 t.after(()=>{if(prior===undefined)delete globalThis.Worker;else globalThis.Worker=prior;});
 await assert.rejects(validateC2paSource(new Blob(['input']),{}, {budget}),error=>error.code==='MEMORY_ALLOCATION'&&error.details.allocationKind==='wasm'&&error.cause.message==='alloc::rust_oom');
 assert.equal(budget.total(),0);assert.equal(terminated,true);
});
test('bounded official SDK and native state policy match current c2patool offline cases',async()=>{
 const wasm=await init({module_or_path:await readFile(new URL('../vendor/c2pa/c2pa_bg.wasm',import.meta.url))});
 const originalFetch=globalThis.fetch;let network=0;globalThis.fetch=()=>{network++;throw Error('network forbidden');};
 try{for(const row of ref.cases){const trust=row.trust?await readFile(new URL(row.trust,root),'utf8'):null,metadata={trust_configured:trust!==null};let reader,result;
  try{reader=await WasmReader.fromBytes('image/jpeg',new Uint8Array(await readFile(new URL(row.file,root))),JSON.stringify(c2paSettings(trust)));const report=JSON.parse(reader.json());result=summarizeC2pa(report,metadata);assert.deepEqual(report.validation_results,row.validationResults,row.file+' statuses');}catch(error){if(error instanceof assert.AssertionError)throw error;result=summarizeC2pa(null,metadata,error);}finally{reader?.free();}
  assert.deepEqual(Object.fromEntries(Object.keys(row.states).map(key=>[key,result[key]])),row.states,row.file+' trust '+row.trust);
 }assert.equal(network,0);assert.throws(()=>wasm.memory.grow(2048),RangeError);}finally{globalThis.fetch=originalFetch;}
});
test('trust configuration admits inline PEM only; unknown and failure remain distinct',()=>{
 assert.deepEqual(c2paParams(),{trustAnchors:null});for(const trustAnchors of ['',false,'https://example.com/root.pem','a'.repeat(8*1024**2+1)])assert.throws(()=>c2paParams({trustAnchors}),{code:'INVALID_INPUT'});
 assert.throws(()=>c2paParams({externalManifest:new Blob()}),{code:'INVALID_INPUT'});
 assert.equal(summarizeC2pa(null,{trust_configured:false},'malformed input').manifest,'read_error');
 const r=summarizeC2pa({active_manifest:'x',validation_results:{activeManifest:{success:[{code:'claimSignature.validated'}],failure:[{code:'claimSignature.mismatch'}]}}},{trust_configured:false});assert.equal(r.signature,'invalid');assert.equal(r.integrity,'unknown');
});
