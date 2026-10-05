export async function checkSegmentedRecompression(engine,blob,ref){
 const assert=(ok,message)=>{if(!ok)throw Error(message);},loaded=await engine.loadBlob({id:'i',blob});assert(loaded.provenance.layout==='segmented-scanlines','source not segmented');
 const task={id:'curve',imageId:'i',operation:'jpeg.recompression'},first=await engine.run(task);
 assert(first.data.raw.length===101&&first.data.raw.every((v,i)=>v===ref.raw[i]),'native losses differ');assert(first.metrics.recompressions===101,'101 useful tasks');
 const second=await engine.run(task);assert(second.metrics.recompressions===0&&second.metrics.cache.scalarHits===101,'historical cache not reused');
 const quality=await engine.run({id:'quality',imageId:'i',operation:'jpeg.quality'});assert(quality.data.raw.every((v,i)=>v===ref.raw[i+1]),'quality raw differs');assert(quality.metrics.recompressions===0,'quality recomputed raw losses');assert(quality.data.estimate.quality===85,'table estimate differs');
 const csv=await engine.exportResult(first,{format:'csv'});assert(new TextDecoder().decode(csv.bytes).trim().split('\r\n').length===102,'CSV rows');
 const memory=(await engine.capabilities()).memory;assert(memory.activeReservationBytes===0,'memory reservation leaked');await engine.unload('i');
 return {status:'passed',workers:first.metrics.workers,preflightExecutions:first.metrics.scheduling?.preflightExecutions,nativeValues:101,dimensions:[ref.width,ref.height],sourceLayout:loaded.provenance.layout,storage:loaded.metrics.storage,codecHeapMaximumBytes:first.metrics.codecHeapMaximumBytes,codecHeapCapacityBytes:first.metrics.codecHeapCapacityBytes,cacheReuseBothPanels:true,tableEstimate:85,csvRows:102,peakAccountedBytes:memory.peakAccountedBytes};
}
