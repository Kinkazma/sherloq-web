import {createWorkerEngine} from '../src/worker-client.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
import {storageInventory} from './source-api-browser.js';
const assert=(value,message)=>{if(!value)throw Error(message);},equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function compare(actual,expected,path='',errors={max:0,count:0,sum:0}){
 for(const [key,value] of Object.entries(expected)){
  if(['seconds','jpeglib_version'].includes(key))continue;
  const got=actual[key],label=path+'/'+key;
  if(Array.isArray(value)){assert(equal(Array.from(got),value),'Exact native array '+label);}
  else if(typeof value==='number'&&!Number.isInteger(value)){const difference=Math.abs(got-value);assert(difference<=1e-12,'Native numeric field '+label);errors.max=Math.max(errors.max,difference);errors.sum+=difference;errors.count++;}
  else assert(got===value,'Exact native field '+label);
 }return errors;
}
function verify(data,reference){const {records,...rest}=reference;const errors=compare(data,rest);for(let i=0;i<9;i++)compare(data.records[i],records[i],'records/'+i,errors);return {...errors,mean:errors.count?errors.sum/errors.count:0};}
export async function testDct96mp(){
 const reference=await(await fetch('/dct-reference')).json(),before=await storageInventory(),budgetBytes=256*1024**2,engine=createWorkerEngine({memoryBudgetBytes:budgetBytes,resourceHints:{hardwareConcurrency:4}}),started=performance.now(),events=[],times={};let archive,last='',lastTime=0;
 const progress=event=>{const now=performance.now();if(event.phase!==last||now-lastTime>2000){last=event.phase;lastTime=now;events.push(event);console.log('DCT96',JSON.stringify(event));}};
 try{
  const backends=await new Promise((resolve,reject)=>{const worker=new Worker(new URL('./jpeg-dct-storage-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(data.error.message)):resolve(data.results);};worker.onerror=event=>{worker.terminate();reject(Error(event.message));};worker.postMessage({});});
  const blob=await(await fetch('/dct-original')).blob();let at=performance.now();const source=await engine.loadBlob({id:'dct96',blob,layout:'segmented'},{onProgress:progress});times.loadMs=performance.now()-at;
  assert(source.width===12000&&source.height===8000&&source.sha256===reference.sha256,'Original96MP retained');assert(source.availableOperations.includes('jpeg.multiple'),'Public segmented capability');
  const task={id:'dct',imageId:'dct96',operation:'jpeg.multiple'};at=performance.now();const result=await engine.run(task,{onProgress:progress});times.analysisMs=performance.now()-at;
  const numeric=verify(result.data,reference.expected);assert(result.metrics.coefficientStores>0,'Real external global coefficient storage');
  result.data.records[0].histogram.fill(0);const cached=await engine.run({...task,id:'cached'});assert(cached.metrics.cache.result&&cached.metrics.workers===0,'Owned cached evidence');verify(cached.data,reference.expected);
  at=performance.now();archive=await engine.exportResultFile(cached,{storage:'temporary'},{onProgress:progress});times.exportMs=performance.now()-at;await engine.unload('dct96');
  const bytes=new Uint8Array(archive.byteLength),hash=await createSHA256();for(let offset=0;offset<bytes.length;offset+=1024**2){const part=await engine.readExport({exportId:archive.id,revision:archive.revision,offset,length:Math.min(1024**2,bytes.length-offset)});bytes.set(part.bytes,offset);hash.update(part.bytes);}
  assert(hash.digest('hex')===archive.sha256,'Full archive hash after unload');const exported=JSON.parse(new TextDecoder().decode(bytes));verify(exported.data,reference.expected);assert(exported.provenance.originalSha256===reference.sha256,'Export source identity');
  const exportInfo={bytes:bytes.length,sha256:archive.sha256,afterSourceUnload:true};await engine.releaseExport(archive.id);archive=null;
  await engine.loadBlob({id:'cancel',blob,layout:'segmented'});const controller=new AbortController();let cancellation;
  try{await engine.run({...task,id:'cancel-dct',imageId:'cancel'},{signal:controller.signal,onProgress:event=>{if(event.phase==='dct-coefficients'&&event.fraction>.15)controller.abort();}});}catch(error){cancellation=error;}
  assert(cancellation?.code==='CANCELLED'&&cancellation.cancellationMode==='storage-closed-before-worker-termination','Public cancellation cleanup');assert(!cancellation.temporaryCleanupFailures?.length,'No cancellation storage errors');
  const small=await(await fetch('/fixtures/double-jpeg-progressive.jpg')).blob();await engine.loadBlob({id:'recovered',blob:small,layout:'segmented'});const recovered=await engine.run({...task,id:'recovered',imageId:'recovered'});assert(recovered.status==='ok'&&recovered.data.progressive&&!recovered.metrics.cache.result,'Reload progressive JPEG');await engine.unload('recovered');
  const memory=(await engine.capabilities()).memory;assert(memory.retainedBytes+memory.cacheBytes+memory.activeReservationBytes===0,'Final owned memory');await engine.dispose();assert(equal(before,await storageInventory()),'Temporary inventory restored');
  return {passed:true,scope:'Actual public96MP stored-DCT evidence on rich original, complete histograms/native scores and decisions, cache, full JSON after unload, cancellation and progressive reload; not a new compression-history claim.',dimensions:[12000,8000],sourceSha256:reference.sha256,sourceBytes:blob.size,budgetBytes,storage:source.metrics.storage,metrics:result.metrics,numeric,times,totalMs:performance.now()-started,export:exportInfo,cancellation:cancellation.cancellationMode,finalMemory:memory,storageCleanup:true,backends,events};
 }finally{if(archive)await engine.releaseExport(archive.id);await engine.dispose();}
}
