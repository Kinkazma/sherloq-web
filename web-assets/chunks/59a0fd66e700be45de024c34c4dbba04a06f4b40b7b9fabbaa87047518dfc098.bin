import "../../runtime-context.js?v=0.33.2";
import {attachWorkerMessageError} from './worker-message-protocol.js';
import {EngineError,checkAbort,serializeEngineError,deserializeEngineError} from './errors.js';
import {onceDenseRetirement} from './dense-owner-retirement.js';
import {withRetirementOwner} from './owner-retirement-error.js';
// A useful codec job owns one worker. Wait for already-started storage replies
// before returning, so cancellation cannot race their destination's disposal.
export async function mediaCodecJob(action,payload,{signal,onProgress,onRequest=()=>{}}={}){
 checkAbort(signal);
 const worker=new Worker(new URL('./media-codec-worker.js',import.meta.url),{type:'module'}),requests=new Set();let stopped=false,detachMessageError=()=>{};
 let handoffRequested=false,failed=false,primary;
 try{return await new Promise((resolve,reject)=>{
  const finish=fn=>value=>{if(stopped)return;stopped=true;signal?.removeEventListener('abort',abort);fn(value);};
  const ok=finish(resolve),fail=finish(reject),abort=()=>fail(new EngineError('CANCELLED','Media operation cancelled.'));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  worker.onerror=e=>fail(new EngineError('WORKER_FAILED',e.message||'Media codec worker failed.'));
  detachMessageError=attachWorkerMessageError(worker,()=>fail(new EngineError('WORKER_MESSAGE_FAILED','Media codec message could not be read.')));
  worker.onmessage=event=>{
   if(stopped)return;
   let data;try{data=event.data;}catch(cause){fail(new EngineError('WORKER_MESSAGE_FAILED','Media codec response envelope could not be read.',{cause}));return;}
   if(!data||typeof data!=='object'||Array.isArray(data)||!['progress','request','error','done'].some(key=>Object.hasOwn(data,key)&&data[key])){fail(new EngineError('WORKER_MESSAGE_FAILED','Media codec response envelope could not be read.'));return;}
   if(data.progress){try{onProgress?.(data.progress);}catch(error){fail(error);}return;}
   if(data.request){
    const task=(async()=>{try{
     checkAbort(signal);
     const value=await onRequest(data.request,data.value);
     if(data.request==='decode-header'&&value?.action==='hp-source-handoff')handoffRequested=true;
     checkAbort(signal);
     if(!stopped)worker.postMessage({reply:data.sequence,value},value?.bytes?.buffer instanceof ArrayBuffer?[value.bytes.buffer]:[]);
    }
     catch(error){if(!stopped)try{worker.postMessage({reply:data.sequence,error:serializeEngineError(error)});}catch(postError){fail(new EngineError('WORKER_MESSAGE_FAILED','Media reply could not be sent.',{cause:error,details:{postError:String(postError)}}));}}})();
    requests.add(task);task.finally(()=>requests.delete(task));return;
   }
   if(data.error)fail(deserializeEngineError(data.error));else if(data.done)ok(data.value);
  };
  try{worker.postMessage({action,payload});}catch(error){fail(error);}
 });}catch(error){failed=true;primary=error;throw error;}
 finally{
  stopped=true;
  detachMessageError();
  if(handoffRequested||payload.encodedInput?.mode==='seekable'){
   const terminate=onceDenseRetirement(()=>worker.terminate());
   const retirement={dispose:onceDenseRetirement(async()=>{
    await terminate();
    const done=worker.done;
    if(done&&typeof done.then==='function')await done;
    await Promise.allSettled([...requests]);
   })};
   try{await retirement.dispose();}
   catch(error){throw withRetirementOwner(failed?primary:error,retirement,error);}
  }else{
   worker.terminate();
   await Promise.allSettled([...requests]);
  }
 }
}
