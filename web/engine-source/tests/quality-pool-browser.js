import {createWorkerEngine} from '../src/worker-client.js';
const assert=(v,m)=>{if(!v)throw new Error(m);};
export async function qualityPoolBrowserTest(){
 const bytes=new Uint8Array(await(await fetch(new URL('../fixtures/bench-1024.jpg',import.meta.url))).arrayBuffer()),reference=createWorkerEngine({cpuKernel:'single'}),engine=createWorkerEngine({resourceHints:{hardwareConcurrency:4}});
 try{
  await reference.load({id:'i',bytes});const expected=await reference.run({id:'serial',imageId:'i',operation:'jpeg.quality'});await engine.load({id:'i',bytes});const result=await engine.run({id:'parallel',imageId:'i',operation:'jpeg.quality'});
  for(let i=0;i<100;i++){assert(result.data.raw[i]===expected.data.raw[i],'Raw loss '+i);assert(result.data.curve[i]===expected.data.curve[i],'Curve '+i);}assert(result.data.minimum===expected.data.minimum,'Minimum');assert(result.metrics.scheduling.preflightExecutions===0&&result.metrics.scheduling.taskExecutions===1,'One useful pass without preflight');assert(result.metrics.memory.retainedBytes===(await engine.capabilities()).memory.retainedBytes,'Released worker reservation');
  const warm=await engine.run({id:'cached',imageId:'i',operation:'jpeg.quality'});assert(warm.metrics.cache.result&&warm.metrics.workers===0,'Cached result does not claim active workers');
  await engine.unload('i');const state=await engine.capabilities();assert(state.memory.retainedBytes===0&&state.memory.cacheBytes===0,'Unload memory');await engine.load({id:'i',bytes});
  const abort=new AbortController();let cancelled=false;try{await engine.run({id:'abort',imageId:'i',operation:'jpeg.quality'},{signal:abort.signal,onProgress:e=>{if(e.phase==='kernel'&&e.fraction>0)abort.abort();}});}catch(e){cancelled=e.code==='CANCELLED'&&e.imagesCleared;}assert(cancelled,'Parallel hard cancellation');await engine.load({id:'i',bytes});await engine.run({id:'recover',imageId:'i',operation:'colors.stats'});
  return {schema:1,status:'passed',exact:true,workers:result.metrics.workers,metrics:result.metrics,cancellation:'Parallel abort and reload verified',cache:'No repeat recompressions',limits:['One generated 1 MP image; four-core candidate cap for this lifecycle test']};
 }finally{engine.dispose();reference.dispose();}
}
