import {EngineError,checkAbort,serializeEngineError,deserializeEngineError} from './errors.js';
// A useful codec job owns one worker. Wait for already-started storage replies
// before returning, so cancellation cannot race their destination's disposal.
export async function mediaCodecJob(action,payload,{signal,onProgress,onRequest=()=>{}}={}){
 checkAbort(signal);
 const worker=new Worker(new URL('./media-codec-worker.js',import.meta.url),{type:'module'}),requests=new Set();let stopped=false;
 try{return await new Promise((resolve,reject)=>{
  const finish=fn=>value=>{if(stopped)return;stopped=true;signal?.removeEventListener('abort',abort);fn(value);};
  const ok=finish(resolve),fail=finish(reject),abort=()=>fail(new EngineError('CANCELLED','Media operation cancelled.'));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  worker.onerror=e=>fail(new EngineError('WORKER_FAILED',e.message||'Media codec worker failed.'));
  worker.onmessageerror=()=>fail(new EngineError('WORKER_MESSAGE_FAILED','Media codec message could not be read.'));
  worker.onmessage=({data})=>{
   if(stopped)return;
   if(data.progress){try{onProgress?.(data.progress);}catch(error){fail(error);}return;}
   if(data.request){
    const task=(async()=>{try{checkAbort(signal);const value=await onRequest(data.request,data.value);checkAbort(signal);if(!stopped)worker.postMessage({reply:data.sequence,value},value?.bytes?.buffer instanceof ArrayBuffer?[value.bytes.buffer]:[]);}
     catch(error){if(!stopped)try{worker.postMessage({reply:data.sequence,error:serializeEngineError(error)});}catch(postError){fail(new EngineError('WORKER_MESSAGE_FAILED','Media reply could not be sent.',{cause:error,details:{postError:String(postError)}}));}}})();
    requests.add(task);task.finally(()=>requests.delete(task));return;
   }
   if(data.error)fail(deserializeEngineError(data.error));else if(data.done)ok(data.value);
  };
  try{worker.postMessage({action,payload});}catch(error){fail(error);}
 });}finally{stopped=true;worker.terminate();await Promise.allSettled([...requests]);}
}
