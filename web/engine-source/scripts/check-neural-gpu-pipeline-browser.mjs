// Development regression only. No reference data or probes enter the runtime.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url)),fixtures=process.env.NEURAL_GPU_FIXTURES;
if(!fixtures)throw Error('Set NEURAL_GPU_FIXTURES to the existing build directory containing trufor-npp, trufor-unfused and m2-neural-runtime.');
// A minimal ONNX Add graph exercises real ORT output ownership across reuse.
const varint=value=>{const bytes=[];do{bytes.push((value&127)|(value>127?128:0));value=Math.floor(value/128);}while(value);return Buffer.from(bytes);};
const integer=(field,value)=>Buffer.concat([varint(field*8),varint(value)]),message=(field,value)=>{const bytes=typeof value==='string'?Buffer.from(value):value;return Buffer.concat([varint(field*8+2),varint(bytes.length),bytes]);};
const shape=message(1,integer(1,4)),value=name=>Buffer.concat([message(1,name),message(2,message(1,Buffer.concat([integer(1,1),message(2,shape)])))]);
const graph=Buffer.concat([message(1,Buffer.concat([message(1,'x'),message(1,'x'),message(2,'y'),message(4,'Add')])),message(2,'owned-output-regression'),message(11,value('x')),message(12,value('y'))]);
const tinyModel=Buffer.concat([integer(1,8),message(2,'sherloq-development-test'),message(7,graph),message(8,integer(2,13))]);
const server=createServer(async(req,res)=>{
 try{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  const name=new URL(req.url,'http://localhost').pathname;
  if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Neural pipeline parity</title>');return;}
  if(name==='/tiny-add.onnx'){res.setHeader('Content-Type','application/octet-stream');res.end(tinyModel);return;}
  const base=path.resolve(name.startsWith('/fixtures/')?fixtures:root),file=path.resolve(base,'.'+(name.startsWith('/fixtures/')?name.slice(9):name));
  if(!file.startsWith(base+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
 await page.goto('http://127.0.0.1:'+server.address().port);
 const report=await page.evaluate(async()=>{
  const read=async name=>{const response=await fetch('/fixtures/'+name);if(!response.ok)throw Error('Missing parity fixture '+name);return response;};
  const json=async name=>(await read(name)).json(),f32=async name=>new Float32Array(await(await read(name)).arrayBuffer());
  const {createNoiseprintPlusGPU}=await import('/src/noiseprint-plus-gpu.js'),gpu=await createNoiseprintPlusGPU();
  const program=await json('trufor-npp/native.program.json'),weights=await f32('trufor-npp/native.weights.f32'),reference=await json('trufor-unfused/reference.json'),records=[];
  try{
   for(const item of reference.cases){
    const input={data:await f32('trufor-unfused/'+item.files.rgb.file),dims:item.files.rgb.shape};
    const result=await gpu.run(program,weights,input),native=await f32('trufor-npp/native-'+item.id+'.f32');let different=0,maximum=0;
    for(let i=0;i<native.length;i++){different+=!Object.is(native[i],result.data[i]);maximum=Math.max(maximum,Math.abs(native[i]-result.data[i]));}
    records.push({id:item.id,shape:input.dims,values:result.data.length,nativeValues:native.length,different,maximum,metrics:result.metrics});
   }
  }finally{gpu.dispose();}
  const {createCfaGPU}=await import('/src/cfa-gpu.js'),{runCfaProgramHybrid}=await import('/src/cfa-program.js'),{cfaPostprocess}=await import('/src/cfa-postprocess.js');
  const createCfa=(await import('/fixtures/cfa-m2/operators.mjs')).default,cfaModule=await createCfa({wasmMemory:new WebAssembly.Memory({initial:256,maximum:16384})}),cfaManifest=await json('cfa-m2/program-manifest.json'),cfaReference=await json('cfa-m2/reference.json'),cfaRecords=[];
  const cfa=await createCfaGPU(),legacy=await createCfaGPU();legacy.supportsResident=false;
  try{for(const model of cfaManifest.models){
   const program=await json('cfa-m2/'+model.program.file),weights=await f32('cfa-m2/'+model.weights.file);
   for(const item of cfaReference.models.find(r=>r.variant===model.variant).cases){
    const input={data:await f32('cfa-m2/'+item.inputFile),dims:item.inputShape},before={...cfa.metrics},oldBefore={...legacy.metrics},oldStart=performance.now(),reference=await runCfaProgramHybrid(cfaModule,program,weights,input,legacy),legacyMilliseconds=performance.now()-oldStart,start=performance.now(),result=await runCfaProgramHybrid(cfaModule,program,weights,input,cfa),milliseconds=performance.now()-start;
    let different=0,maximum=0;for(let i=0;i<result.data.length;i++){different+=!Object.is(reference.data[i],result.data[i]);maximum=Math.max(maximum,Math.abs(reference.data[i]-result.data[i]));}
    const probabilities=Float32Array.from(result.data,x=>Math.exp(x)),post=cfaPostprocess(probabilities,item.local.length);let probabilityError=0;for(let i=0;i<probabilities.length;i++)probabilityError=Math.max(probabilityError,Math.abs(probabilities[i]-item.probabilities[i]));
    cfaRecords.push({variant:model.variant,label:item.label,milliseconds,legacyMilliseconds,readbackBytes:cfa.metrics.readbackBytes-before.readbackBytes,legacyReadbackBytes:legacy.metrics.readbackBytes-oldBefore.readbackBytes,different,maximum,probabilityError,localDifferences:post.local.reduce((n,x,i)=>n+(x!==item.local[i]),0),best:post.best,nativeBest:item.metadata.best_grid,metrics:result.gpu});
   }
  }}finally{cfa.dispose();legacy.dispose();}
  const {NeuralGraphPool}=await import('/src/neural-graph-pool.js'),{Budget}=await import('/src/cache.js'),budget=new Budget(256*1024**2);
  const tiny=new Uint8Array(await(await fetch('/tiny-add.onnx')).arrayBuffer()),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',tiny))].map(value=>value.toString(16).padStart(2,'0')).join('');
  const pool=new NeuralGraphPool(budget,{maxWorkers:2},{assets:{add:{url:new URL('/tiny-add.onnx',location.href).href,bytes:tiny.byteLength,sha256}},runtimes:{wasm:{factoryUrl:new URL('/fixtures/m2-neural-runtime/wasm-factory.mjs',location.href).href,ortUrl:new URL('/vendor/d2prl/ort.wasm.min.mjs',location.href).href,wasmUrl:new URL('/vendor/d2prl/ort-wasm-simd-threaded.wasm',location.href).href}}}),outputs=[];
  try{for(const numbers of [[1,2,3,4],[4,3,2,1]]){
   const input=Float32Array.from(numbers),result=await pool.run('add',{x:{data:input,dims:[4]}},{backend:'cpu',workspaceBytes:1024**2,outputBytes:16});
   try{outputs.push({values:[...result.result.y.data],input:[...input],copiedOutputBytes:result.metrics.copiedOutputBytes,threads:result.metrics.threads});}finally{result.release();}
  }}finally{pool.dispose();}
  const cfaModel=cfaManifest.models[0],cfaCase=cfaReference.models[0].cases[0],cfaBudget=new Budget(512*1024**2),cfaPool=new NeuralGraphPool(cfaBudget,{maxWorkers:2},{assets:{cfa:{url:new URL('/fixtures/cfa-m2/'+cfaModel.weights.file,location.href).href,bytes:cfaModel.weights.bytes,sha256:cfaModel.weights.sha256,program:{url:new URL('/fixtures/cfa-m2/'+cfaModel.program.file,location.href).href,bytes:cfaModel.program.bytes,sha256:cfaModel.program.sha256}}},runtimes:{webgpu:{executor:'cfa',factoryUrl:new URL('/fixtures/cfa-m2/operators.mjs',location.href).href,wasmUrl:new URL('/fixtures/cfa-m2/operators.wasm',location.href).href}}});let cfaWorker;
  try{
   const result=await cfaPool.run('cfa',{rgb:{data:await f32('cfa-m2/'+cfaCase.inputFile),dims:cfaCase.inputShape},block:{type:'int32',data:Int32Array.of(32),dims:[]}},{backend:'webgpu',workspaceBytes:32*1024**2,outputBytes:cfaCase.probabilities.length*4});
   try{let maximum=0;for(let i=0;i<result.result.log_probabilities.data.length;i++)maximum=Math.max(maximum,Math.abs(Math.exp(result.result.log_probabilities.data[i])-cfaCase.probabilities[i]));cfaWorker={maximum,metrics:result.metrics,runtime:result.runtime};}finally{result.release();}
  }finally{cfaPool.dispose();}
  cfaWorker.remainingBudgetBytes=cfaBudget.total();
  const {createDenseDistanceGPU}=await import('/src/dense-distance-gpu.js'),denseBudget=new Budget(128*1024**2),dense=await createDenseDistanceGPU({budget:denseBudget,maxPairs:256}),denseRecords=[];
  try{for(const dimensions of [12,128]){
   const pairCount=2049,queryDescriptors=new Float32Array(pairCount*dimensions),candidateDescriptors=new Float32Array(queryDescriptors.length),best=new Float32Array(pairCount),exact=new Float32Array(pairCount);let random=729;
   const next=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return (random>>>0)/2**32;};
   for(let pair=0;pair<pairCount;pair++){
    const scale=pair%17===0?2**-140:pair%19===0?2**100:2**(Math.floor(next()*40)-20);let total=0;
    for(let k=0;k<dimensions;k++){const at=pair*dimensions+k;queryDescriptors[at]=(next()-.5)*scale;candidateDescriptors[at]=(next()-.5)*scale;const d=Math.fround(queryDescriptors[at]-candidateDescriptors[at]);total=Math.fround(total+Math.fround(d*d));}
    exact[pair]=total;best[pair]=pair%3===0?total*.8:pair%3===1?total:total*1.2;
   }
   const result=await dense.batch({queryDescriptors,candidateDescriptors,dimensions,pairCount,best});let invalidRejections=0,rejected=0,refinements=0;
   for(let i=0;i<pairCount;i++){if(result[i]===Infinity){rejected++;if(exact[i]<best[i])invalidRejections++;}else if(Number.isNaN(result[i]))refinements++;else throw Error('GPU returned an unrefined winning distance');}
   denseRecords.push({dimensions,pairCount,invalidRejections,rejected,refinements,metrics:dense.metrics});
  }}finally{dense.dispose();}
  const ortPassed=outputs.every(output=>output.copiedOutputBytes===0&&output.values.every((value,index)=>value===2*output.input[index]))&&budget.total()===0;
  return {records,cfaRecords,cfaWorker,denseRecords,denseRemainingBudgetBytes:denseBudget.total(),ortOutputs:outputs,remainingBudgetBytes:budget.total(),passed:cfaWorker.maximum<=1e-3&&cfaWorker.remainingBudgetBytes===0&&cfaWorker.metrics.cpuGranted===1&&cfaWorker.metrics.gpuGranted===1&&denseBudget.total()===0&&denseRecords.every(record=>record.invalidRejections===0&&record.rejected>0&&record.refinements>0)&&ortPassed&&records.every(record=>record.values===record.nativeValues&&record.different===0)&&cfaRecords.every(record=>record.different===0&&record.probabilityError<=1e-3&&record.localDifferences===0&&record.best===record.nativeBest),preflightExecutions:0};
 });
 console.log(JSON.stringify({...report,browser:browser.version()}));if(!report.passed)process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
