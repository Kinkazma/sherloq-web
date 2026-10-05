import {createWorkerEngine} from '../src/worker-client.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
import {storageInventory} from './source-api-browser.js';

const assert=(value,message)=>{if(!value)throw Error(message);};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function testDigest96mp(){
 const reference=await(await fetch('/digest-reference')).json(),before=await storageInventory(),budgetBytes=256*1024**2;
 const engine=createWorkerEngine({memoryBudgetBytes:budgetBytes,resourceHints:{hardwareConcurrency:4}}),started=performance.now(),times={},events=[];let archive;
 const progress=event=>{events.push(event);if(event.phase!==events.at(-2)?.phase)console.log('DIGEST96',event.phase);};
 const verify=data=>{
  assert(equal(data.hashes,reference.hashes),'Ten independent byte hashes');
  assert(Object.keys(data.imageHashes).length===6,'Six native image hashes');
  for(const [name,values] of Object.entries(reference.imageHashes))assert(equal(Array.from(data.imageHashes[name]),values),'Native image hash '+name);
 };
 try{
  const blob=await(await fetch('/digest-original')).blob();let at=performance.now();
  const source=await engine.loadBlob({id:'digest96',blob,layout:'segmented'},{onProgress:progress});times.loadMs=performance.now()-at;
  assert(source.width===12000&&source.height===8000&&source.sha256===reference.sha256,'Original96MP source');
  const task={id:'digest',imageId:'digest96',operation:'file.digest'};at=performance.now();
  const result=await engine.run(task,{onProgress:progress});times.analysisMs=performance.now()-at;verify(result.data);
  result.data.imageHashes.Average[0]^=255;
  at=performance.now();const cached=await engine.run({...task,id:'cached'});times.cacheMs=performance.now()-at;
  assert(cached.metrics.cache.result&&cached.metrics.workers===0,'Owned cache without recalculation');verify(cached.data);
  at=performance.now();archive=await engine.exportResultFile(cached,{storage:'temporary'},{onProgress:progress});times.exportMs=performance.now()-at;
  await engine.unload('digest96');
  const chunks=[],hash=await createSHA256();let bytes=0;
  for(let offset=0;offset<archive.byteLength;offset+=1024**2){const part=await engine.readExport({exportId:archive.id,revision:archive.revision,offset,length:Math.min(1024**2,archive.byteLength-offset)});chunks.push(part.bytes);hash.update(part.bytes);bytes+=part.bytes.length;}
  assert(hash.digest('hex')===archive.sha256&&bytes===archive.byteLength,'Complete JSON after source unload');
  const encoded=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){encoded.set(chunk,offset);offset+=chunk.length;}
  const exported=JSON.parse(new TextDecoder().decode(encoded));verify(exported.data);assert(exported.provenance.originalSha256===reference.sha256,'Export original provenance');
  const exportInfo={bytes,sha256:archive.sha256,afterSourceUnload:true};await engine.releaseExport(archive.id);archive=null;
  const memory=(await engine.capabilities()).memory;assert(memory.retainedBytes+memory.cacheBytes+memory.activeReservationBytes===0,'Final memory ownership');
  await engine.dispose();assert(equal(before,await storageInventory()),'Temporary storage cleanup');
  return {passed:true,scope:'Full96MP original, ten byte digests and six native perceptual hashes; owned cache and full JSON read after unload. Existing small cancellation/backend proofs reused.',dimensions:[12000,8000],sourceSha256:reference.sha256,sourceBytes:blob.size,sourceLayout:source.provenance.layout,storage:source.metrics.storage,budgetBytes,times,totalMs:performance.now()-started,metrics:cached.metrics,finalMemory:memory,export:exportInfo,nativeHashes:reference.imageHashes,cryptographicHashes:reference.hashes,events,storageCleanup:true};
 }finally{if(archive)await engine.releaseExport(archive.id);await engine.dispose();}
}
