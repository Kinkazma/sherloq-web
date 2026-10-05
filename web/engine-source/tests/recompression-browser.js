import {createWorkerEngine} from '../src/worker-client.js';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export async function recompressionBrowserTest(){
 const ref=await(await fetch('/tests/data/recompression-native.json')).json(),f=ref.cases.at(-1),bytes=new Uint8Array(await(await fetch('/tests/data/'+f.file)).arrayBuffer());
 const engine=createWorkerEngine({resourceHints:{hardwareConcurrency:2}});
 try{await engine.load({id:'i',bytes});const curve=await engine.run({id:'curve',imageId:'i',operation:'jpeg.recompression'});assert(curve.data.raw.every((v,i)=>v===f.raw[i]),'101 native losses');assert(curve.metrics.workers===2,'Two useful codec workers');assert(curve.metrics.scheduling.preflightExecutions===0,'No preflight');
 const quality=await engine.run({id:'quality',imageId:'i',operation:'jpeg.quality'});assert(quality.metrics.recompressions===0,'Shared loss cache');assert(quality.data.raw.every((v,i)=>v===f.raw[i+1]),'Cached native quality losses');
 const csv=await engine.exportResult(curve,{format:'csv'});assert(new TextDecoder().decode(csv.bytes).trim().split('\r\n').length===102,'101 CSV rows');
 await engine.unload('i');await engine.load({id:'i',bytes});const controller=new AbortController();let cancelled=false;try{await engine.run({id:'abort',imageId:'i',operation:'jpeg.recompression'},{signal:controller.signal,onProgress:e=>{if(e.phase==='kernel'&&e.fraction>0)controller.abort();}});}catch(e){cancelled=e.code==='CANCELLED'&&e.imagesCleared;}assert(cancelled,'Hard worker cancellation clears sources');
 await engine.load({id:'i',bytes});const recovered=await engine.run({id:'recover',imageId:'i',operation:'jpeg.recompression'});assert(recovered.data.raw.every((v,i)=>v===f.raw[i]),'Reload/recompute after cancellation');return {status:'passed',qualities:101,different:0,workers:curve.metrics.workers,preflightExecutions:0,sharedCacheRecompressions:quality.metrics.recompressions,cancellation:'hard worker abort, explicit reload, exact recovery'};
 }finally{engine.dispose();}
}
