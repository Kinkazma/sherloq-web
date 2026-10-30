import "../../runtime-context.js?v=0.30.0";
// SHERLOQ context reuse. The compiled runtime/device remain explicitly funded;
// job ACK releases execution only, context ACK later releases persistent memory.
import {EngineError,deserializeWorkerError} from './errors.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
import {createGlueJobOwner} from './xfeat-glue-job-owner.js';
export function createGlueResidentContext({worker,releaseMemory,budget,pendingOwners,onRuntimeError=()=>{},onClosed=()=>{},timeoutMs=10000,admittedBytes=0,identity,windowIdentity=false,beforeTerminate,onControl}){
 let ready=false,everPosted=false,current=null,busy=false,borrowers=0,closed=false,closing=null,closeAck=false,terminated=false,memoryReleased=false,serial=0,closeWaiter=null,closeToken=0,poisoned=false,unregister,retirementEvidence=null;
 const failedRuntime=error=>{onRuntimeError(error);poisoned=true;return error;};
 const context={identity,windowIdentity,worker,admittedBytes,
  get state(){return{ready,everPosted,busy,borrowers,closed,closing:!!closing,closeAck,terminated,memoryReleased,poisoned,pending:current&&!current.state.closed?1:0,admittedBytes,retirementEvidence};},
  borrow(){if(closed||closing||poisoned)throw new EngineError('DISPOSED','Glue context is retiring.');borrowers++;let done=false;return()=>{if(!done){done=true;borrowers--;}};},
  cancel(){current?.cancel();},
  async drain(){if(current&&!current.state.closed)await current.close();},
  async run(job,{id,signal,onProgress,releaseExecution,onOwner=()=>{}}){
   if(closed||closing||busy||poisoned)throw new EngineError('BUSY','Glue context is unavailable.');busy=true;let failed=false,primary,result;
   const port={postMessage(packet){if(packet.glueJob)everPosted=true;worker.postMessage(packet);},terminate(){throw new EngineError('INTERNAL','A job cannot terminate its retained Glue context.');}};
   const owner=current=createGlueJobOwner({worker:port,id,signal,retainTransport:true,releaseMemory:()=>{},releaseExecution,onClosed:entry=>{pendingOwners.delete(entry);if(current===entry)busy=false;},timeoutMs});owner.onProgress=onProgress;pendingOwners.add(owner);onOwner(owner);if(ready)owner.handle({glueReady:true});
   try{result=await owner.run(job);}catch(error){failed=true;primary=error;}
   finally{try{await owner.close();}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}}
   if(failed)throw primary;return{...result,metadata:{...result.metadata,residentContext:true,residentContextAdmittedBytes:admittedBytes}};
  },
  close(){
   if(closed)return Promise.resolve();if(closing)return closing;
   closing=(async()=>{
    current?.cancel();await context.drain();if(borrowers)throw new EngineError('BUSY','Glue context is borrowed by an admitted request.');
    if(!closeAck&&everPosted){
     const token=++serial;closeToken=token;
     await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(closeWaiter?.token===token)closeWaiter=null;reject(new EngineError('WORKER_FAILED','Glue context retirement timed out.',{details:{glueRetirementPending:true}}));},timeoutMs);closeWaiter={token,resolve:()=>{clearTimeout(timer);resolve();},reject:error=>{clearTimeout(timer);reject(error);}};try{worker.postMessage({closeGlue:{token}});}catch(error){closeWaiter=null;clearTimeout(timer);reject(error);}});
    }else if(!everPosted)closeAck=true;
    if(!closeAck)throw new EngineError('WORKER_FAILED','Glue context has no physical retirement ACK.');
    if(!terminated){const ack=await beforeTerminate?.();if(ack===0||ack===false)throw ack;worker.terminate();terminated=true;}
    if(!memoryReleased){const value=await releaseMemory();if(value===0||value===false)throw value;memoryReleased=true;}
    closed=true;unregister?.();unregister=null;onClosed(context);
   })();void closing.catch(()=>{closing=null;});return closing;
  }
 };
 worker.onmessage=({data})=>{try{
  if(onControl?.(data)===true)return;
  if(data.glueReady===true){if(ready)throw new EngineError('WORKER_MESSAGE_FAILED','Duplicate Glue context ready.');ready=true;current?.handle(data);return;}
  if(data.glueClosed){const packet=data.glueClosed;if(packet.token!==closeToken||!closeToken)throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected Glue context retirement token.');if(packet.cleanupAck===true){closeAck=true;retirementEvidence=packet.retirement;const waiter=closeWaiter;closeWaiter=null;if(Object.hasOwn(packet,'error'))waiter?.reject(deserializeWorkerError(packet.error));else waiter?.resolve();}else{const waiter=closeWaiter;closeWaiter=null;waiter?.reject(deserializeWorkerError(packet.error));}return;}
  if(!current)throw new EngineError('WORKER_MESSAGE_FAILED','Glue response has no job owner.');
  if(data.progress!==undefined){try{current.onProgress?.(data.progress);}catch(error){current.callbackFailure(error);}return;}
  if(data.glueComplete&&Object.hasOwn(data.glueComplete,'error')){const error=deserializeWorkerError(data.glueComplete.error);if(error.code!=='CANCELLED')failedRuntime(error);data={...data,glueComplete:{...data.glueComplete,error}};}
  if(data.glueRetired&&Object.hasOwn(data.glueRetired,'error'))data={...data,glueRetired:{...data.glueRetired,error:deserializeWorkerError(data.glueRetired.error)}};
  if(!current.handle(data))throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected Glue context response.');
 }catch(error){current?.transportFailure(failedRuntime(error));closeWaiter?.reject(error);closeWaiter=null;}};
 worker.onerror=event=>{const error=failedRuntime(new EngineError('WORKER_FAILED',event.message));current?.transportFailure(error);closeWaiter?.reject(error);closeWaiter=null;};
 unregister=budget?.registerAsyncReclaimer?.(async()=>{if(busy||borrowers||closing)return 0;const before=budget.total();await context.close();return Math.max(0,before-budget.total());},{owner:'sift',label:'private-glue-idle-context',allocationKind:'array-buffer'});
 return context;
}
