import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Budget} from '../src/cache.js';
import {EngineError,checkAbort,requireValue} from '../src/errors.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {allocateOwnedTypedArray} from '../src/allocation.js';
import {scientificParameters,geometry,planFeatureBands} from '../src/splicebuster/planning.mjs';
import {createSplicebusterRetirement as retirement,createSplicebusterRetirementRegistry as registry,createSplicebusterResultOwnership as ownership} from '../src/splicebuster/retirement.mjs';

for(const raw of [Object.freeze({code:'STORAGE_CLOSE'}),null,0,undefined])test('retirement preserves raw refusal '+String(raw)+' and retries only unacknowledged owners',async()=>{
 const calls={buffer:0,left:0,right:0,parent:0,lease:0};let fail=true;
 const owner=retirement({independent:[()=>calls.buffer++],children:[()=>{calls.left++;if(fail){fail=false;throw raw;}},()=>calls.right++],parents:[()=>calls.parent++],final:[()=>calls.lease++]});
 let rejected=false;try{await owner.release();}catch(error){rejected=true;assert.equal(error,raw);}assert.equal(rejected,true);assert.deepEqual(calls,{buffer:1,left:1,right:1,parent:0,lease:0});assert.equal(owner.retired,false);
 await owner.release();await owner.release();assert.deepEqual(calls,{buffer:1,left:2,right:1,parent:1,lease:1});assert.equal(owner.retired,true);
});
test('parent refusal retains final leases and concurrent retry shares one physical retirement',async()=>{
 let attempts=0,final=0,finish;const gate=new Promise(r=>finish=r),fault=Error('close refused');
 const owner=retirement({parents:[async()=>{if(++attempts===1)throw fault;await gate;}],final:[()=>final++]});await assert.rejects(owner.release(),e=>e===fault);
 const a=owner.release(),b=owner.release();assert.equal(a,b);await Promise.resolve();assert.equal(final,0);finish();await Promise.all([a,b]);assert.equal(attempts,2);assert.equal(final,1);
});
test('logical result and pin close once while physical ACK can be retried',async()=>{
 const pending=registry();let tries=0;const owner=retirement({children:[()=>{if(++tries===1)throw Error('bank refused');}]}),result=ownership(owner,pending.retire),unpin=result.pin();
 await result.release();assert.throws(()=>result.pin(),{code:'INVALID_INPUT'});await assert.rejects(unpin(),/bank refused/);assert.equal(pending.pending,1);assert.equal(tries,1);
 await unpin();await result.release();await pending.drain();assert.equal(tries,2);assert.equal(pending.pending,0);assert.equal(owner.retired,true);
});

async function analyzerFixture(){
 const budget=new Budget(64*1024**2),counts={spam:0,valid:0,session:0},fault=Object.freeze({code:'STORAGE_CLOSE',message:'injected bank retirement'}),sessionFault=Error('session retirement');let session;
 class ResourceWorkerPool{constructor(){}async run(op){if(op==='prepareRaw')return {shape:[19,19,50],release(){}};if(op==='poolRows')return {shape:[4,4],spam:new Float32Array(16*50),valid:new Uint8Array(16),release(){}};throw Error('Unexpected Native operation '+op);}clearIdle(){}snapshot(){return {retainedBytes:0};}dispose(){}}
 const createTemporarySession=async()=>session??=(function(){const free=budget.reserve(128);return{dispose(){if(++counts.session===1)throw sessionFault;free();}}})();
 const createNumericBank=async(Type,shape,{label,getTemporarySession})=>{await getTemporarySession();const free=budget.reserve(32),key=label==='sb-spam'?'spam':'valid';return{async write(){},async flush(){},dispose(){counts[key]++;if(key==='spam'&&counts.spam<=2)throw fault;free();}};};
 const source=(await readFile(new URL('../src/splicebuster/analyzer.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export function createSplicebusterAnalyzer','function createSplicebusterAnalyzer')+'\ncreateSplicebusterAnalyzer;';
 const factory=vm.runInNewContext(source,{Budget,EngineError,checkAbort,requireValue,getExecutionScheduler,allocateOwnedTypedArray,ResourceWorkerPool,createNumericBank,createTemporarySession,scientificParameters,geometry,planFeatureBands,createSplicebusterRetirement:retirement,createSplicebusterRetirementRegistry:registry,createSplicebusterResultOwnership:ownership,CPU_RUNTIME:{bytes:0},SCIENTIFIC_REVISION:'mock-retirement',runWithResourceRecovery:fn=>fn(),Uint8Array,Uint8ClampedArray,Float32Array,Float64Array,Blob,AbortController,performance,crypto,console});
 const analyzer=factory({budget,maxWorkers:1,storage:'temporary'});return {analyzer,budget,counts,fault,sessionFault};
}
test('analyzer keeps failed local banks/session and source budget until clearCache obtains every ACK',async()=>{
 const f=await analyzerFixture();await assert.rejects(f.analyzer.analyze({width:160,height:160,data:new Uint8Array(160*160*3)},{},{backend:'cpu'}),e=>e===f.fault);
 assert.deepEqual(f.counts,{spam:2,valid:1,session:0});assert.ok(f.budget.total()>=160*160*3);
 await assert.rejects(f.analyzer.clearCache(),e=>e===f.sessionFault);assert.deepEqual(f.counts,{spam:3,valid:1,session:1});assert.ok(f.budget.total()>=160*160*3);
 await f.analyzer.clearCache();assert.deepEqual(f.counts,{spam:3,valid:1,session:2});assert.equal(f.budget.total(),0);await f.analyzer.dispose();
});
test('analyzer dispose blocks new admission yet remains retryable after a parent storage refusal',async()=>{
 const f=await analyzerFixture();await assert.rejects(f.analyzer.analyze({width:160,height:160,data:new Uint8Array(160*160*3)},{},{backend:'cpu'}));
 await assert.rejects(f.analyzer.dispose(),e=>e===f.sessionFault);assert.ok(f.budget.total()>0);await assert.rejects(f.analyzer.analyze({width:160,height:160,data:new Uint8Array(160*160*3)}),{code:'DISPOSED'});
 await f.analyzer.dispose();assert.equal(f.budget.total(),0);assert.deepEqual(f.counts,{spam:3,valid:1,session:2});
});

const {createM2WorkerHost}=await import('../src/m2-worker-host.js');
const {createM2WorkerClient}=await import('../src/m2-worker-client.js');
async function hostFixture({invalidModel=false,pinFaults=1,resultFaultEnabled=true}={}){
 let budget,pinAttempts=0,resultAttempts=0,logicalPins=0,unpinFault=pinFaults,resultFault=resultFaultEnabled;const messages=[];
 const factory=({budget:b,sourceAccounted})=>{budget=b;assert.equal(sourceAccounted,true);return {async analyze(){const free=budget.reserve(128),data={width:20,height:14,segmented:true,map:Float64Array.of(0,1,2,3,4,5),valid:new Uint8Array(6).fill(1),mapShape:[2,3],range0:Float64Array.of(4.5,8.5),range1:Float64Array.of(4.5,8.5,12.5),mu:new Float64Array(invalidModel?25:50),Sigma:new Float64Array(625),L:new Float64Array(1250),outliersProb:.02,metadata:{minimum:0,maximum:5,stride:4}};
 return {data,pin(){logicalPins++;let decremented=false;return async()=>{pinAttempts++;if(!decremented){logicalPins--;decremented=true;}if(unpinFault>0){unpinFault--;throw Object.assign(Error('pin refused'),{code:'PIN_CLOSE'});}};},async release(){assert.equal(logicalPins,0);resultAttempts++;if(resultFault){resultFault=false;throw Object.assign(Error('bank refused'),{code:'BANK_CLOSE'});}free();}};},clearCache(){},dispose(){}};};
 const host=createM2WorkerHost({post:m=>messages.push(m),analyzerFactories:{splicebuster:factory}});let serial=0;
 const call=async(operation,args={})=>{const id=++serial;await host.handle({id,operation,args});return messages.find(m=>m.id===id&&(Object.hasOwn(m,'value')||Object.hasOwn(m,'error')));};
 await call('initialize',{memoryBudgetBytes:16*1024**2,methods:{splicebuster:{}}});const r=await call('analyze',{method:'splicebuster',image:{width:20,height:14,data:new Uint8Array(840)}});
 return {call,result:r.value,get budget(){return budget},counts:()=>({pinAttempts,resultAttempts,logicalPins})};
}
test('host retains NPZ, result, source and metadata through independent pin and bank refusals',async()=>{
 const f=await hostFixture(),exported=await f.call('beginExport',{resultId:f.result.id});assert(exported.value.bytes>0);await f.call('releaseResult',{resultId:f.result.id});
 assert.equal((await f.call('releaseExport',{exportId:exported.value.id})).error.code,'PIN_CLOSE');assert.deepEqual(f.counts(),{pinAttempts:1,resultAttempts:0,logicalPins:0});assert.ok(f.budget.total()>840);
 assert.equal((await f.call('releaseExport',{exportId:exported.value.id})).error.code,'BANK_CLOSE');assert.deepEqual(f.counts(),{pinAttempts:2,resultAttempts:1,logicalPins:0});assert.ok(f.budget.total()>840);
 assert.equal((await f.call('releaseExport',{exportId:exported.value.id})).value,true);assert.deepEqual(f.counts(),{pinAttempts:2,resultAttempts:2,logicalPins:0});assert.equal(f.budget.total(),0);await f.call('dispose');
});
test('host graceful Splicebuster disposal keeps pending owners for retry and blocks new analysis',async()=>{
 const f=await hostFixture();assert.equal((await f.call('dispose')).error.code,'BANK_CLOSE');assert.ok(f.budget.total()>840);assert.equal((await f.call('analyze',{method:'splicebuster'})).error.code,'DISPOSED');
 assert.ok((await f.call('dispose')).value);assert.equal(f.budget.total(),0);assert.equal(f.counts().resultAttempts,2);
});
test('Splicebuster client keeps its worker until graceful disposal ACK then terminates once',async()=>{
 const worker={messages:[],terminations:0,postMessage(m){this.messages.push(m);},terminate(){this.terminations++;},emit(data){this.onmessage?.({data});}},opening=createM2WorkerClient({methods:{splicebuster:{}}},{workerFactory:()=>worker});
 worker.emit({id:worker.messages[0].id,value:{windowBytes:4*1024**2}});const client=await opening,first=client.dispose();assert.equal(worker.messages.at(-1).args.gracefulNativeSources,true);
 worker.emit({id:worker.messages.at(-1).id,error:{code:'BANK_CLOSE',message:'retry required'}});await assert.rejects(first,{code:'BANK_CLOSE'});assert.equal(worker.terminations,0);assert.equal(typeof worker.onmessage,'function');await assert.rejects(client.analyze('splicebuster',{}),{code:'DISPOSED'});
 const retry=client.dispose();worker.emit({id:worker.messages.at(-1).id,value:{retainedBytes:0}});await retry;assert.equal(worker.terminations,1);assert.equal(worker.onmessage,null);await client.dispose();assert.equal(worker.terminations,1);
});

test('failed NPZ construction preserves its primary error and retains its refused local scope for retry',async()=>{
 const f=await hostFixture({invalidModel:true,pinFaults:2,resultFaultEnabled:false}),exported=await f.call('beginExport',{resultId:f.result.id});
 assert.equal(exported.error.code,'INVALID_INPUT');assert.match(exported.error.message,/mu/);assert.equal(f.counts().pinAttempts,2);assert.ok(f.budget.total()>840);
 assert.ok((await f.call('clearCache')).value);assert.equal(f.counts().pinAttempts,3);assert.equal(f.counts().resultAttempts,0);assert.ok(f.budget.total()>840);
 assert.equal((await f.call('releaseResult',{resultId:f.result.id})).value,true);assert.equal(f.budget.total(),0);await f.call('dispose');
});
