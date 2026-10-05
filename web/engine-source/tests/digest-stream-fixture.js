export async function checkSegmentedDigest(engine,blob,reference){
 const assert=(ok,message)=>{if(!ok)throw Error(message);},loaded=await engine.loadBlob({id:'i',blob});assert(loaded.provenance.layout==='segmented-scanlines','Source must be segmented');assert(!loaded.operationConstraints?.['file.digest'],'Stale hash restriction');
 const events=[],task={id:'hash',imageId:'i',operation:'file.digest'},result=await engine.run(task,{onProgress:e=>events.push(e)});
 for(const [name,values]of Object.entries(reference.hashes))assert(result.data.imageHashes[name].length===values.length&&result.data.imageHashes[name].every((v,i)=>v===values[i]),name+' native mismatch');
 assert(result.data.hashes['SHA2-256']===reference.sha256,'Original SHA256 mismatch');assert(Object.keys(result.data.hashes).length===10,'Missing byte digest');assert(result.provenance.layout==='segmented','Wrong provenance');
 assert(events.some(e=>e.phase==='perceptual-hashes')&&events.every((e,i)=>!i||e.fraction>=events[i-1].fraction),'Monotone progress');
 result.data.imageHashes.Average[0]^=255;const cached=await engine.run(task);assert(cached.metrics.cache.result,'Digest cache missed');assert(cached.data.imageHashes.Average[0]===reference.hashes.Average[0],'Mutable cache');
 const exported=JSON.parse(new TextDecoder().decode((await engine.exportResult(cached,{format:'json'})).bytes));assert(Object.keys(exported.data.imageHashes).length===6,'JSON image hashes');
 const memory=(await engine.capabilities()).memory;assert(!memory.activeReservationBytes,'Reservation leak');await engine.unload('i');
 return {status:'passed',dimensions:[reference.width,reference.height],nativeHashes:6,cryptographicHashes:10,sourceLayout:loaded.provenance.layout,storage:loaded.metrics.storage,...result.metrics,peakAccountedBytes:memory.peakAccountedBytes,cacheOwnership:true,jsonExport:true,monotoneProgress:true};
}
