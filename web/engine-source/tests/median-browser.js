import {createWorkerEngine} from '../src/worker-client.js';
import {medianGeometry,medianRender} from '../src/median.js';
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const same=(a,b,message)=>{assert(a.length===b.length,message+' length');for(let i=0;i<a.length;i++)assert(a[i]===b[i],message+' at '+i);};
const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
const read=async name=>{const response=await fetch(new URL('../fixtures/median/'+name,import.meta.url));assert(response.ok,'Fixture response');return new Uint8Array(await response.arrayBuffer());};
export async function medianBrowserTest(){
 const reference=JSON.parse(new TextDecoder().decode(await read('pipeline-reference.json'))),response=await fetch('/__local_median_model__');assert(response.ok,'Pass --median-model with a local checkpoint to this development runner.');const blob=await response.blob();
 const options={memoryBudgetBytes:1024**3,resourceHints:{hardwareConcurrency:4}},engine=createWorkerEngine(options),proof={schema:1,images:[],renders:0,maxProbabilityError:0,maxMeanError:0,modelBundled:false,modelSha256:reference.modelSha256,fixtureSource:'synthetic seed220023, no private image',timingScope:'Functional recipe; timings include RPC and are not an isolated speedup benchmark'};
 let lastInput;
 try{
  const loaded=await engine.loadMedianModel({id:'model',blob});assert(loaded.sha256===reference.modelSha256&&loaded.features===128,'Qualified model fingerprint');proof.model={features:loaded.features,trees:loaded.trees,nodes:loaded.nodes,retainedBytes:loaded.retainedBytes,loadMetrics:loaded.metrics};
  for(const item of reference.cases){
   const data=await read(item.rgbFile);assert(await sha(data)===item.rgbSha256,'RGB fixture identity');lastInput={id:'image',bytes:data,pixels:{width:item.width,height:item.height,format:'rgb8',data},provenance:{source:'synthetic-rgb-fixture'}};await engine.load(lastInput);
   const firstStart=performance.now();let first;
   for(const [i,expected] of item.renders.entries()){
    const actual=await engine.run({id:'median',imageId:'image',operation:'various.median',params:{modelId:'model',...expected.params}});if(!i)first={rpcMs:performance.now()-firstStart,metrics:actual.metrics};
    assert(actual.metrics.cache.analysis===(i!==0),'Analysis cache across rendering parameters');assert(await sha(actual.pixels.data)===expected.rgbSha256,'Native RGB render '+JSON.stringify([item.width,item.height,expected.params]));
    same(actual.masks.valid.data,expected.valid,'Valid grid');same(actual.masks.decisions.data,expected.decisions,'Decision grid');same(actual.data.variances,item.variances,'Variance grid');same(actual.data.margins,item.margins,'Float32 margin grid');
    for(let j=0;j<item.probabilities.length;j++){proof.maxProbabilityError=Math.max(proof.maxProbabilityError,Math.abs(actual.data.probabilities[j]-item.probabilities[j]));assert(Math.abs(actual.data.probabilities[j]-item.probabilities[j])<=1e-7,'Probability bound');assert(Math.abs(actual.data.filtered[j]-expected.filtered[j])<=1e-7,'Filtered probability bound');}
    proof.maxMeanError=Math.max(proof.maxMeanError,Math.abs(actual.data.mean-expected.mean));assert(Math.abs(actual.data.mean-expected.mean)<=1e-7,'Mean bound');proof.renders++;
    if(i===0){assert(first.metrics.scheduling.preflightExecutions===0&&first.metrics.scheduling.taskExecutions===1,'No preflight executions');const exported=JSON.parse(new TextDecoder().decode((await engine.exportResult(actual)).bytes));assert(exported.provenance.references[0].originalSha256===loaded.sha256,'Model provenance export');actual.data.probabilities.fill(99);actual.pixels.data.fill(0);}
   }
   proof.images.push({width:item.width,height:item.height,renders:item.renders.length,first});await engine.unload('image');
  }
  // Independent synthetic grids exercise values immediately around threshold .4
  // and cv.convertScaleAbs rounding, without relying on this model's outputs.
  for(const item of reference.synthetic){const analysis={geometry:medianGeometry(item.width,item.height),probabilities:Float32Array.from(item.probabilities),variances:Float64Array.from(item.variances)};for(const expected of item.renders){const actual=await medianRender(analysis,expected.params);assert(await sha(actual.pixels.data)===expected.rgbSha256,'Synthetic render');same(actual.decisions,expected.decisions,'Synthetic decision');proof.renders++;}}
  await engine.unload('model');proof.cleanup=(await engine.capabilities()).memory;assert(proof.cleanup.retainedBytes===0&&proof.cleanup.cacheBytes===0&&proof.cleanup.activeReservationBytes===0,'Model/image/cache cleanup');
  await engine.load(lastInput);await engine.loadMedianModel({id:'model',blob});const controller=new AbortController();let cancelled;
  try{await engine.run({id:'cancel',imageId:'image',operation:'various.median',params:{modelId:'model'}},{signal:controller.signal,onProgress:()=>controller.abort()});}catch(error){cancelled=error;}assert(cancelled?.code==='CANCELLED'&&cancelled.imagesCleared,'Hard cancellation clears image/model');
  await engine.load(lastInput);let missing;try{await engine.run({id:'missing',imageId:'image',operation:'various.median',params:{modelId:'model'}});}catch(error){missing=error;}assert(missing?.code==='NOT_FOUND','Model reload required after cancellation');
  await engine.loadMedianModel({id:'model',blob});const recovered=await engine.run({id:'resume',imageId:'image',operation:'various.median',params:{modelId:'model',...reference.cases.at(-1).renders[0].params}});assert(await sha(recovered.pixels.data)===reference.cases.at(-1).renders[0].rgbSha256,'Exact recovery');proof.cancellation='Worker terminated during useful analysis; explicit image and local model reload recovered native output';
  await engine.unload('image');const large=JSON.parse(new TextDecoder().decode(await read('large-reference.json'))),jpeg=await read(large.file);assert(await sha(jpeg)===large.jpegSha256,'Large JPEG identity');await engine.loadBlob({id:'large',blob:new Blob([jpeg])});
  let largeFirst;
  for(const [i,expected] of large.renders.entries()){
   const result=await engine.run({id:'large',imageId:'large',operation:'various.median',params:{modelId:'model',...expected.params}});if(i===0)largeFirst=result.metrics;
   assert(result.metrics.cache.analysis===(i!==0),'Large analysis cache');assert(await sha(result.pixels.data)===expected.rgbSha256,'Large native RGB');assert(await sha(result.masks.valid.data)===expected.validSha256,'Large valid grid');assert(await sha(result.masks.decisions.data)===expected.decisionSha256,'Large decision grid');same(result.data.margins,large.margins,'Large margins');same(result.data.variances,large.variances,'Large variance');
   for(let j=0;j<large.probabilities.length;j++){const error=Math.abs(result.data.probabilities[j]-large.probabilities[j]);assert(error<=1e-7,'Large probability bound');proof.maxProbabilityError=Math.max(proof.maxProbabilityError,error);}assert(Math.abs(result.data.mean-expected.mean)<=1e-7,'Large mean');
  }
  proof.large={width:large.width,height:large.height,views:large.renders.length,sourceSha256:large.jpegSha256,metrics:largeFirst};await engine.unload('large');await engine.loadBlob({id:'large',blob:new Blob([jpeg])});const mid=new AbortController();let stopped;
  try{await engine.run({id:'mid-batch',imageId:'large',operation:'various.median',params:{modelId:'model'}},{signal:mid.signal,onProgress:event=>{if(event.fraction>0&&event.fraction<1)mid.abort();}});}catch(error){stopped=error;}assert(stopped?.code==='CANCELLED'&&stopped.imagesCleared,'Cancel during unfinished block batches');const afterAbort=(await engine.capabilities()).memory;assert(afterAbort.retainedBytes===0&&afterAbort.cacheBytes===0&&afterAbort.activeReservationBytes===0,'Fresh worker after large cancellation');proof.large.cancelledBetweenUsefulBatches=true;
 }finally{await engine.dispose();}
 const serial=createWorkerEngine({...options,cpuKernel:'single'});
 try{await serial.load(lastInput);await serial.loadMedianModel({id:'model',blob});const result=await serial.run({id:'serial',imageId:'image',operation:'various.median',params:{modelId:'model',...reference.cases.at(-1).renders[0].params}});assert(await sha(result.pixels.data)===reference.cases.at(-1).renders[0].rgbSha256,'Single CPU parity');same(result.data.margins,reference.cases.at(-1).margins,'Single CPU margins');proof.singleCpu=result.metrics;}finally{await serial.dispose();}
 const limited=createWorkerEngine({memoryBudgetBytes:256*1024**2});try{let error;try{await limited.loadMedianModel({id:'limited',blob});}catch(e){error=e;}assert(error?.code==='MEMORY_LIMIT','JSON parse admission');const state=await limited.capabilities();assert(state.memory.retainedBytes===0&&state.memory.activeReservationBytes===0,'Failed load releases reservation');proof.insufficientMemory='Explicit MEMORY_LIMIT before model parse under256MiB';}finally{await limited.dispose();}
 proof.status='passed';return proof;
}
