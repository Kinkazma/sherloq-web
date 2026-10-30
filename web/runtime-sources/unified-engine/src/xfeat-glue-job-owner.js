import "../../runtime-context.js?v=0.30.0";
// SHERLOQ single-job Worker owner. Ready precedes all native work; publication
// follows the child's session/device retirement ACK. Unknown debt stays owned.
import {EngineError} from './errors.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});void promise.catch(()=>{});return{promise,resolve,reject};};
const acknowledge=async action=>{const value=await action?.();if(value===0||value===false)throw value;};
export function createGlueJobOwner({worker,id,signal,releaseMemory,releaseExecution,onPending=()=>{},onClosed=()=>{},timeoutMs=10000,retainTransport=false}){
 if(!worker||!Number.isSafeInteger(id)||id<1)throw new EngineError('INVALID_INPUT','A dedicated Glue worker and positive job identity are required.');
 const ready=deferred(),result=deferred();let posted=false,readySeen=false,ack=false,finished=false,failed=false,primary,closing,closed=false,terminated=false,memoryReleased=false,executionReleased=false,control=null,serial=0,lastToken=0;
 const markPrimary=error=>{if(!failed){failed=true;primary=error;}};
 const cancelled=()=>new EngineError('CANCELLED','Sparse Glue cancelled.');
 const settle=packet=>{finished=true;if(failed)result.reject(primary);else if(Object.hasOwn(packet,'error')){markPrimary(packet.error);result.reject(primary);}else result.resolve(packet.result);};
 const pending=error=>{onPending(owner,error);return error;};
 const post=value=>worker.postMessage(value);
 const cancel=()=>{
  if(closed||finished&&ack)return;markPrimary(cancelled());
  if(!posted){ack=true;ready.reject(primary);settle({});return;}
  try{post({cancelGlue:{id}});}catch(error){attachGpuCleanup(primary,error);pending(error);}
 };
 const abort=()=>cancel();signal?.addEventListener('abort',abort,{once:true});
 const owner={id,worker,
  get state(){return{posted,ready:readySeen,ack,finished,failed,closed,terminated,retainTransport,memoryReleased,executionReleased,retirementPending:!ack};},
  get completion(){return result.promise;},
  async run(job){await ready.promise;if(signal?.aborted)cancel();if(failed)throw primary;if(posted)throw new EngineError('BUSY','Sparse Glue job already posted.');posted=true;try{post({glueJob:{...job,id}});}catch(error){markPrimary(error);settle({});throw error;}return result.promise;},
  cancel,
  callbackFailure(error){markPrimary(error);cancel();},
  transportFailure(error){
   if(ack)return;
   markPrimary(error);
   // Static module initialization creates no session/device. A posted job,
   // however, needs an actual child retirement ACK even after a JS error.
   if(!posted){ack=true;ready.reject(primary);settle({});}else{settle({});pending(error);}
  },
  handle(packet){
   if(packet?.glueReady===true){if(readySeen||posted)throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected Glue ready handshake.');readySeen=true;ready.resolve();return true;}
   const completion=packet?.glueComplete,retired=packet?.glueRetired;
   if(completion){if(!posted||completion.id!==id||finished)throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected Glue completion identity.');if(completion.cleanupAck!==true&&!Object.hasOwn(completion,'error'))throw new EngineError('WORKER_MESSAGE_FAILED','Glue output cannot precede its retirement ACK.');if(completion.cleanupAck===true)ack=true;settle(completion);return true;}
   if(retired){
    if(!posted||retired.id!==id||retired.token!==lastToken||!lastToken)throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected Glue retirement identity/token.');
    if(retired.cleanupAck!==true){const error=Object.hasOwn(retired,'error')?retired.error:new EngineError('WORKER_FAILED','Glue cleanup has no retirement ACK.');const waiter=control;control=null;waiter?.reject(error);pending(error);return true;}
    ack=true;const waiter=control;control=null;waiter?.resolve();return true;
   }
   return false;
  },
  close(){
   if(closed)return Promise.resolve();if(closing)return closing;
   closing=(async()=>{
    if(!posted){if(!failed)markPrimary(cancelled());ack=true;ready.reject(primary);if(!finished)settle({});}
    if(!ack){
     if(!finished)cancel();
     const waiter=deferred();control=waiter;const token=++serial;lastToken=token;
     const timer=setTimeout(()=>{if(control===waiter)control=null;waiter.reject(new EngineError('WORKER_FAILED','Glue retirement acknowledgement timed out.',{details:{glueRetirementPending:true}}));},timeoutMs);
     try{post({retireGlue:{id,token}});await waiter.promise;}finally{clearTimeout(timer);}
    }
    if(!ack)throw new EngineError('WORKER_FAILED','Glue retirement still requires ACK.');
    if(!terminated&&!retainTransport){worker.terminate();terminated=true;}
    let cleanupFailed=false,cleanupPrimary;const attempt=async action=>{try{await action();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}else attachGpuCleanup(cleanupPrimary,error);}};
    await attempt(async()=>{if(!memoryReleased){await acknowledge(releaseMemory);memoryReleased=true;}});
    await attempt(async()=>{if(!executionReleased){await acknowledge(releaseExecution);executionReleased=true;}});
    if(cleanupFailed)throw cleanupPrimary;
    closed=true;signal?.removeEventListener('abort',abort);onClosed(owner);
   })();
   void closing.catch(error=>{closing=null;pending(error);});return closing;
  }
 };
 if(signal?.aborted)cancel();return owner;
}
