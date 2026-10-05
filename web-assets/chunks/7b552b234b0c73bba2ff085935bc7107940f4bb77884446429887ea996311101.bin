import "../../runtime-context.js?v=0.14.5";
import {resolveComputeProfile} from './profiles.js';
import {EngineError,checkAbort} from './errors.js';
// Exactly one worker, one internal codec thread. Abort terminates even synchronous
// wasm; the next load recreates the worker. B must reload the source after abort.
export function createWorkerEngine(options={}) {
 const profile=resolveComputeProfile(options.computeProfile??'aggressive',options.resourceHints);
 options={...options,memoryBudgetBytes:options.memoryBudgetBytes??profile.memoryBudgetBytes,resourceHints:profile.hints};
 let worker,serial=0,disposed=false,active=false,ready;
 const pending=new Map();
 function reset(error) {
  worker?.terminate();worker=null;ready=null;
  for(const p of pending.values()){p.cleanup();p.reject(error);}pending.clear();active=false;
 }
 function send(method,args=[],{signal,onProgress}={}) {
  checkAbort(signal);
  if(disposed)return Promise.reject(new EngineError('DISPOSED','Engine disposed.'));
  const sequence=++serial;
  return new Promise((resolve,reject)=>{
   const abort=()=>{const error=new EngineError('CANCELLED','Task cancelled; reload image before the next run.');error.imagesCleared=true;reset(error);};
   const cleanup=()=>signal?.removeEventListener('abort',abort);
   pending.set(sequence,{resolve,reject,cleanup,onProgress});signal?.addEventListener('abort',abort,{once:true});
   try{worker.postMessage({sequence,method,args,options:method==='init'?options:undefined});}catch(e){pending.delete(sequence);cleanup();reject(e);}
  });
 }
 function ensure() {
  if(disposed)throw new EngineError('DISPOSED','Engine disposed.');
  if(!worker){
   worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
   worker.onmessage=({data})=>{const p=pending.get(data.sequence);if(!p)return;if(data.progress){p.onProgress?.(data.progress);return;}pending.delete(data.sequence);p.cleanup();data.error?p.reject(new EngineError(data.error.code,data.error.message)):p.resolve(data.result);};
   worker.onerror=()=>reset(new EngineError('WORKER_FAILED','Worker stopped; reload image.'));
   ready=send('init');
  }
  return ready;
 }
 async function call(method,args=[],hooks={}) {
  checkAbort(hooks.signal);if(active)throw new EngineError('BUSY','Another worker task is active.');active=true;
  try{await ensure();return await send(method,args,hooks);}finally{active=false;}
 }
 return {
  capabilities:()=>call('capabilities'),load:(input,hooks)=>call('load',[input],hooks),run:(task,hooks)=>call('run',[task],hooks),
  imagePixels:id=>call('imagePixels',[id]),original:id=>call('original',[id]),unload:id=>call('unload',[id]),
  dispose(){disposed=true;reset(new EngineError('DISPOSED','Engine disposed.'));}
 };
}
