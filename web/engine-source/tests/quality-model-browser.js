import {createWorkerEngine} from '../src/worker-client.js';
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const same=(a,b,message)=>{assert(a.length===b.length,message+' length');for(let i=0;i<a.length;i++)assert(Object.is(a[i],b[i]),message+' at '+i+': '+a[i]+' != '+b[i]);};
const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
const read=async name=>{const response=await fetch(new URL('../fixtures/'+name,import.meta.url));assert(response.ok,'Fixture response');return new Uint8Array(await response.arrayBuffer());};
export async function qualityModelBrowserTest(){
 const reference=JSON.parse(new TextDecoder().decode(await read('quality-model/reference.json'))),response=await fetch('/__local_quality_model__');assert(response.ok,'Pass --quality-model with the explicitly converted local model');
 const blob=await response.blob(),engine=createWorkerEngine({memoryBudgetBytes:512*1024**2,computeProfile:'aggressive'}),proof={schema:1,status:'running',weightsBundled:false,sourceModelSha256:reference.sourceModelSha256,images:[],normalizedSamples:0,scoreDifferences:0,displayDifferences:0};
 const task={id:'quality',imageId:'image',operation:'jpeg.quality',params:{modelId:'model'}};let lastInput;
 try{
  const started=performance.now(),loaded=await engine.loadQualityModel({id:'model',blob});assert(loaded.sha256==='bc0c961a9ac7bf0fbabb0316eb5cb34665d7987b678fb8b64b487f10908f04f2'&&loaded.features===100,'Qualified model fingerprint');proof.model={sha256:loaded.sha256,features:loaded.features,trees:loaded.trees,nodes:loaded.nodes,retainedBytes:loaded.retainedBytes,rpcMs:performance.now()-started,metrics:loaded.metrics};
  for(const item of reference.cases){
   const bytes=await read('quality-model/'+item.file);assert(await sha(bytes)===item.originalSha256,'Original fixture identity');lastInput={id:'image',blob:new Blob([bytes])};const before=performance.now(),source=await engine.loadBlob(lastInput);assert(source.width===item.width&&source.height===item.height,'Native decoded size');assert(await sha((await engine.imagePixels('image')).data)===item.rgbSha256,'Native RGB identity');
   const cold=performance.now(),actual=await engine.run(task),rpcMs=performance.now()-cold;
   same(actual.data.raw,item.raw,'Native gray means '+item.file);same(actual.data.curve,item.curve,'Native normalized curve '+item.file);assert(actual.data.minimum===item.minimum,'Native final minimum');assert(actual.data.prediction===item.prediction,'Native learned quality '+item.file);assert(actual.data.prediction.toFixed(1)===item.display,'Native displayed quality');assert(actual.data.quantization===null&&actual.data.metadataError===null&&actual.data.modelError===null,'Learned branch');
   if(item.width*item.height>=1024**2){assert(actual.metrics.workers>1,'Useful parallel JPEG qualities');assert(actual.metrics.scheduling.preflightExecutions===0,'No runtime preflight');}
   const json=JSON.parse(new TextDecoder().decode((await engine.exportResult(actual)).bytes));assert(json.data.prediction===item.prediction&&json.provenance.references[0].originalSha256===loaded.sha256,'JSON result/model provenance');const csv=await engine.exportResult(actual,{format:'csv'});assert(csv.mime.includes('csv')&&csv.bytes.length>0,'Curve CSV export');
   const cached=await engine.run(task);assert(cached.metrics.cache.result,'Result cache');assert(cached.data.prediction===item.prediction,'Cached exact prediction');const noModel=await engine.run({...task,params:{modelId:null}});assert(noModel.data.prediction===null&&noModel.data.modelError,'Explicit absent model');assert(noModel.metrics.cache.stages['loss-curve'],'Curve reused without model');
   proof.images.push({file:item.file,width:item.width,height:item.height,prediction:actual.data.prediction,minimum:actual.data.minimum,rpcMs,functionalSequenceMs:performance.now()-before,metrics:actual.metrics});proof.normalizedSamples+=100;await engine.unload('image');
  }
  const jpeg=await read('synthetic.jpg');await engine.loadBlob({id:'image',blob:new Blob([jpeg])});const table=await engine.run(task);assert(table.data.estimate&&table.data.prediction===null&&table.data.modelError===null,'JPEG table priority');await engine.unload('image');
  await engine.unload('model');let state=(await engine.capabilities()).memory;assert(state.retainedBytes===0&&state.cacheBytes===0&&state.activeReservationBytes===0,'Complete release');proof.cleanup=state;
  await engine.loadBlob(lastInput);await engine.loadQualityModel({id:'model',blob});const controller=new AbortController();let error;
  try{await engine.run(task,{signal:controller.signal,onProgress:e=>{if(e.fraction>0&&e.fraction<1)controller.abort();}});}catch(e){error=e;}assert(error?.code==='CANCELLED'&&error.imagesCleared,'Cancel useful recompressions');
  state=(await engine.capabilities()).memory;assert(state.retainedBytes===0&&state.cacheBytes===0&&state.activeReservationBytes===0,'Fresh worker after cancellation');
  await engine.loadBlob(lastInput);let missing;try{await engine.run(task);}catch(e){missing=e;}assert(missing?.code==='NOT_FOUND','Reload model required');await engine.loadQualityModel({id:'model',blob});const resumed=await engine.run(task);assert(resumed.data.prediction===reference.cases.at(-1).prediction,'Native recovery');proof.cancellation='Useful recompression cancelled; image/model explicitly reloaded and native result recovered';
 }finally{await engine.dispose();}
 proof.status='passed';return proof;
}
