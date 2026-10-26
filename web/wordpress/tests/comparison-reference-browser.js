// Run in the application's ordinary browser harness. Uses real native workers.
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';
import {createWorkerEngine} from '../sherloq-browser/assets/unified-engine/src/worker-client.js';
import {encodeParameterPreviewPng} from '../sherloq-browser/assets/tool-parameter-preview.js';
export async function comparisonReferencePreviewContract(){
 const check=(value,message)=>{if(!value)throw Error(message)},width=32,height=32,loads=[];let client,engine;
 const source=k=>new Blob([encodeParameterPreviewPng({width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>(i*37+(i>>>4)*13+k*17)&255)})],{type:'image/png'});
 try{
  client=await createToolClient({memoryBudgetBytes:384*1024**2,engineFactory:options=>{
   engine=createWorkerEngine(options);return{...engine,loadBlob:async input=>{loads.push(input.id);return engine.loadBlob(input)}};
  }});
  await client.load({id:'comparison-contract-source',blob:source(0)});const reference=source(1),params={view:'ssim',metrics:false,equalized:false,grayscale:false};
  const first=await client.run({id:'comparison-native-first',operation:'comparison.image',params},{reference}),native=(await engine.readPixels({surfaceId:first.surface.id,revision:first.surface.revision})).pixels;
  const draft=await client.previewParameters({operation:'comparison.image',params},{field:'equalized',extras:{reference}});
  check(draft?.exact===false&&draft.metrics.scientificFinalChanged===false,'Native-first paired preview must be available and provisional.');
  check(draft.pixels.logicalWidth===width&&draft.pixels.logicalHeight===height,'Paired preview must preserve the original grid identity.');
  check(loads.filter(id=>id.startsWith('reference-')).length===1,'Preview must reuse the admitted native reference rather than decode it twice.');
  const kept=(await engine.readPixels({surfaceId:first.surface.id,revision:first.surface.revision})).pixels;
  check(kept.data.length===native.data.length&&kept.data.every((v,i)=>v===native.data[i]),'A provisional view must not mutate the native result.');
  const final=await client.run({id:'comparison-final',operation:'comparison.image',params},{reference});
  check(final.metrics.completedMetricJobs===0,'Final view must reuse the native raw-map cache.');
  await client.run({id:'retire-reference',operation:'colors.stats',params:{mode:'min',inclusive:false}});await client.release();await engine.unload(client.source.id);
  const memory=(await engine.capabilities()).memory;
  check(!memory.retainedBytes&&!memory.cacheBytes&&!memory.activeReservationBytes,'All result, source, reference and preview owners must retire.');
  return{passed:true,nativeGrid:[width,height],previewGrid:[draft.pixels.width,draft.pixels.height],referenceLoads:1,finalMetricJobs:final.metrics.completedMetricJobs,memory};
 }finally{await client?.dispose()}
}
