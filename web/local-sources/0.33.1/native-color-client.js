import {removeTerminatedTemporarySession} from './unified-engine/src/temporary-storage.js';
import {EngineError,requireValue,checkAbort,deserializeEngineError} from './unified-engine/src/errors.js';

const MiB=1024**2,CONSUMER_BYTES=48*MiB;
// The grant includes the transferred native CMYK16 window, exact 16-bit bins,
// cumulative/snapshot arrays and local/global presentations outside the child's
// own Budget. Original's loan survives until worker AND storage close ACKs.
export async function createNativeColorClient({blob,sourceSha256,width,height,parentBudgetSource,signal,onProgress=()=>{},workerFactory=(url,options)=>new Worker(url,options),removeTemporarySession=removeTerminatedTemporarySession}={}){
 requireValue(blob instanceof Blob&&[width,height].every(n=>Number.isSafeInteger(n)&&n>0)&&Number.isSafeInteger(width*height),'A native Original Blob and grid are required.');
 requireValue(parentBudgetSource&&typeof parentBudgetSource.getClient==='function','Native colour inspection needs the real Original resource owner.');
 const parent=parentBudgetSource,current=()=>parent.file===blob&&parent.hash===sourceSha256&&parent.source?.width===width&&parent.source?.height===height&&parent.isCurrent?.()!==false;
 const assertCurrent=()=>{checkAbort(signal);if(!current())throw new EngineError('CANCELLED','The Original colour source changed.');};
 let worker,grant,serial=0,closing=false,closed=false,retiredWorker=false,workerTermination,disposal,fatalError,temporarySessionId,readTail=Promise.resolve();const pending=new Map(),sessions=new Map();
 const message=action=>new EngineError('CANCELLED','Native colour '+action+' was cancelled.');
 function failAll(error){for(const entry of pending.values())entry.reject(error);pending.clear();}
 function request(action,payload){
  if(fatalError)return Promise.reject(fatalError);if(!worker||closed||closing&&action!=='dispose')return Promise.reject(message(action));
  const id=++serial;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});try{worker.postMessage({id,action,payload});}catch(error){pending.delete(id);reject(error);}});
 }
 function abort(){if(closed)return;closing=true;try{worker?.postMessage({action:'cancel'});}catch{}void dispose().catch(()=>{});}
 async function terminateWorker(){if(retiredWorker)return;if(!workerTermination)workerTermination=Promise.resolve(worker?.terminate()).then(()=>{retiredWorker=true;});return workerTermination;}
 async function dispose(){
  if(closed)return;if(disposal)return disposal;closing=true;
  return disposal=(async()=>{
   if(worker&&!retiredWorker){if(!fatalError){worker.postMessage({action:'cancel'});const ack=await request('dispose');if(ack?.disposed!==true)throw new EngineError('BUSY','Native colour retirement was not acknowledged.');sessions.clear();}await terminateWorker();}
   for(const [id,backend]of sessions){if(backend)await removeTemporarySession(id,backend);else{if(typeof navigator!=='undefined'&&typeof navigator.storage?.getDirectory==='function')await removeTemporarySession(id,'opfs');if(typeof indexedDB!=='undefined')await removeTemporarySession(id,'indexeddb');}sessions.delete(id);}
   if(grant){const ack=await grant.release();if(ack===false||ack===0)throw new EngineError('BUSY','Original native-colour credit retirement was not acknowledged.');grant=null;}
   closed=true;signal?.removeEventListener('abort',abort);failAll(message('reader'));worker=null;
  })().finally(()=>{disposal=null;});
 }
 try{
  assertCurrent();const signature=new Uint8Array(await blob.slice(0,4).arrayBuffer());assertCurrent();
  const tiff=signature[0]===73&&signature[1]===73||signature[0]===77&&signature[1]===77,jpeg=signature[0]===255&&signature[1]===216;
  if(!tiff&&!jpeg)throw new EngineError('NATIVE_COLOR_UNSUPPORTED','This source has no qualified native colour-window reader.');
  const preferred=Math.max(128*MiB,4*width*height+96*MiB),choices=(tiff?[32*MiB]:[preferred,...[256*MiB,192*MiB,128*MiB].filter(value=>value<preferred)]).filter((value,index,array)=>array.indexOf(value)===index).sort((a,b)=>b-a).map(engineBytes=>({engineBytes,totalBytes:engineBytes+CONSUMER_BYTES}));
  requireValue(choices.every(choice=>Number.isSafeInteger(choice.totalBytes)),'Native colour grant exceeds the safe integer range.');
  const owner=await parent.getClient();assertCurrent();grant=await owner.reserveNativeWorkspace({imageId:parent.imageId,sourceSha256,width,height,choices});assertCurrent();
  requireValue(grant&&Number.isSafeInteger(grant.engineBytes)&&grant.engineBytes>0&&typeof grant.release==='function'&&choices.some(choice=>choice.engineBytes===grant.engineBytes&&choice.totalBytes===grant.bytes),'Original did not return a matching native colour grant.');
  temporarySessionId='native-color-'+crypto.randomUUID();worker=workerFactory(new URL('./native-color-worker.js?v=0.33.1',import.meta.url),{type:'module'});sessions.set(temporarySessionId,null);
  worker.onmessage=({data})=>{
   if(closed||retiredWorker)return;
   if(data?.temporarySession){const item=data.temporarySession;if(typeof item.id==='string'&&typeof item.backend==='string')sessions.set(item.id,item.backend);return;}
   const entry=pending.get(data?.id);if(!entry)return;if(data.progress){try{onProgress(data.progress);}catch{}return;}pending.delete(data.id);data.error?entry.reject(deserializeEngineError(data.error)):entry.resolve(data.result);
  };
  const fatal=event=>{if(closed||fatalError)return;fatalError=new EngineError('WORKER_FAILED',event?.message||'Native colour worker failed.');failAll(fatalError);void dispose().catch(()=>{});};worker.onerror=fatal;worker.onmessageerror=fatal;
  signal?.addEventListener('abort',abort,{once:true});assertCurrent();
  const loaded=await request('load',{blob,sourceSha256,width,height,memoryBudgetBytes:grant.engineBytes,temporarySessionId});assertCurrent();
  const capability=loaded?.capability;requireValue(capability&&capability.width===width&&capability.height===height&&capability.sourceSha256===sourceSha256,'Native colour capabilities differ from Original.');
  return{capability,metrics:loaded.metrics??null,readPixels(rect){const task=readTail.then(async()=>{assertCurrent();if(closing)throw message('read');const answer=await request('read',{rect});assertCurrent();if(closing)throw message('read');const pixels=answer?.pixels;requireValue(pixels&&['cmyk8','cmyk16','rgb8','rgb16','gray8','gray16'].includes(pixels.format)&&pixels.width===rect.width&&pixels.height===rect.height&&pixels.channels===capability.channels.length&&pixels.depth===capability.depth&&(pixels.depth===16?pixels.data instanceof Uint16Array:pixels.data instanceof Uint8Array)&&pixels.data.length===rect.width*rect.height*pixels.channels,'Native colour transport returned another sample grid.');return pixels;});readTail=task.catch(()=>{});return task;},dispose};
 }catch(error){try{await dispose();}catch(cleanup){if(Object.isExtensible(error)){error.cleanupError=cleanup;error.cleanupOwner={dispose};}}throw error;}
}
