import {createWorkerEngine} from '../src/worker-client.js';
import {storageInventory} from './source-api-browser.js';
const assert=(value,message)=>{if(!value)throw Error(message);};
function verify(data,reference){
 const compare=(actual,expected)=>{for(const [key,value] of Object.entries(expected)){if(['seconds','jpeglib_version'].includes(key))continue;const got=actual[key];if(Array.isArray(value))assert(JSON.stringify(Array.from(got))===JSON.stringify(value),'Native array '+key);else assert(got===value,'Native field '+key);}};
 const {records,...rest}=reference;compare(data,rest);for(let i=0;i<9;i++)compare(data.records[i],records[i]);
}
export async function testContiguousDct(){
 const before=await storageInventory(),NativeWorker=globalThis.Worker,budgetBytes=2*1024**3,reference=await(await fetch('/dct-reference')).json(),started=performance.now(),times={};let engine,archive,last=0;const progress=event=>{if(performance.now()-last>2000){last=performance.now();console.log('DCTCONTIG',JSON.stringify(event));}};
 globalThis.Worker=class extends NativeWorker{constructor(url,options){super(new URL(url,location.href).pathname==='/src/worker.js'?new URL('./dct-no-opfs-worker.js',import.meta.url):url,options);}};
 try{
  engine=createWorkerEngine({memoryBudgetBytes:budgetBytes});const blob=await(await fetch('/dct-original')).blob();let at=performance.now();const source=await engine.loadBlob({id:'i',blob},{onProgress:progress});times.loadMs=performance.now()-at;
  assert(source.metrics.path==='existing-full-memory'&&source.sha256===reference.sha256&&source.width===10000&&source.height===5000,'Actual full original contiguous load');
  const task={id:'dct-idb',imageId:'i',operation:'jpeg.multiple'};at=performance.now();const result=await engine.run(task,{onProgress:progress});times.analysisMs=performance.now()-at;verify(result.data,reference.expected);
  assert(result.provenance.layout==='contiguous'&&result.metrics.coefficientStores===3,'Owned coefficient backing for contiguous source');
  const cached=await engine.run({...task,id:'cached'});assert(cached.metrics.cache.result,'DCT cache');verify(cached.data,reference.expected);
  archive=await engine.exportResultFile(cached,{storage:'temporary'});assert(archive.metrics.temporaryBackend==='indexeddb','Forced real IndexedDB environment');await engine.unload('i');
  const bytes=(await engine.readExport({exportId:archive.id,revision:archive.revision,offset:0,length:archive.byteLength})).bytes;verify(JSON.parse(new TextDecoder().decode(bytes)).data,reference.expected);assert(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('')===archive.sha256,'Every encoded JSON byte');const exportInfo={bytes:bytes.length,sha256:archive.sha256,afterSourceUnload:true};await engine.releaseExport(archive.id);archive=null;
  const memory=(await engine.capabilities()).memory;assert(memory.retainedBytes+memory.cacheBytes+memory.activeReservationBytes===0,'Owned memory after unload');await engine.dispose();assert(JSON.stringify(before)===JSON.stringify(await storageInventory()),'No owned storage left');
  return {passed:true,scope:'Public worker regression: actual50MP contiguous JPEG load, full native DCT evidence, own IndexedDB fallback, cache and full JSON after unload. Shared coefficient arithmetic/memory96MP proofs remain separate.',source,budgetBytes,metrics:result.metrics,times,totalMs:performance.now()-started,finalMemory:memory,export:exportInfo,storageCleanup:true};
 }finally{if(archive)await engine.releaseExport(archive.id);await engine?.dispose();globalThis.Worker=NativeWorker;}
}
