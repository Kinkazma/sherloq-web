import "../../../../runtime-context.js?v=0.31.0";
import {getExecutionScheduler} from '../../execution-scheduler.js';
import {installWorkerMessageProtocol,workerMessageFailure} from '../../worker-message-protocol.js';
import {EngineError,checkAbort,deserializeEngineError} from '../../errors.js';
import {copyTypedArray} from '../../allocation.js';
import {planPoolRectangle} from './splicebuster-pool-gpu.mjs';

const OWNER='splicebuster-gpu';
const DEFAULT_DEVICE_RESERVE=32*1024**2; // Policy overhead, not measured driver RSS.
const retire=(budget,backing,kind)=>{const bytes=backing?.();if(bytes&&kind!=='gpu-mapped')budget.notifyBackingRelease?.(kind,bytes);};
const errorFrom=data=>{if(!data||typeof data.code!=='string'||typeof data.message!=='string')throw workerMessageFailure(OWNER,'message','invalid-error');return deserializeEngineError(data);};
const dropInputs=data=>{if(data?.returnedInputs){data.returnedInputs.spam=null;data.returnedInputs.weights=null;data.returnedInputs=null;}};
export const gpuPoolJobBytes=plan=>plan.inputBytes+plan.weightBytes+plan.gpuBytes+plan.hostOutputBytes*2+plan.hostParameterBytes;

/** Shared-Budget host for one serialized GPU worker lane.
 * Source raw arrays remain caller-owned and immutable until pool settles.
 * Returned sums own their reservation independently of service lifetime.
 */
export class SplicebusterGpuService {
 constructor(budget,{workerFactory=url=>new Worker(url,{type:'module'}),workerURL=new URL('./pool-rpc-worker.mjs',import.meta.url),deviceReserveBytes=DEFAULT_DEVICE_RESERVE}={}){
  if(!budget||typeof budget.reserve!=='function')throw new EngineError('INVALID_INPUT','Shared Budget required');
  if(!Number.isSafeInteger(deviceReserveBytes)||deviceReserveBytes<0)throw new EngineError('INVALID_INPUT','Invalid GPU device overhead bound');
  this.budget=budget;this.scheduler=getExecutionScheduler(budget);this.factory=workerFactory;this.workerURL=workerURL;this.deviceReserveBytes=deviceReserveBytes;
  this.worker=null;this.protocol=null;this.pendingRpc=new Map();this.sequence=0;this.limits=null;this.initPromise=null;this.closing=null;this.disposed=false;this.pendingJobs=0;this.tail=Promise.resolve();this.job=null;
  this.metrics={initializations:0,pools:0,readbacks:0,workerTerminations:0,forcedTerminations:0,peakJobBytes:0};
  this.unreclaim=budget.registerAsyncReclaimer?.(async()=>{if(this.pendingJobs||this.initPromise||this.job||!this.worker)return 0;await this._shutdownWorker();return 0;},{allocationKind:'gpu',owner:OWNER,label:'splicebuster-gpu-idle-device'});
 }
 async _reserve(bytes,{signal,operation}={}){
  checkAbort(signal);try{return this.budget.reserve(bytes);}catch(error){if(error.code!=='MEMORY_LIMIT'||!this.budget.reclaim)throw error;await this.budget.reclaim(bytes,{signal,owner:OWNER,operation});checkAbort(signal);return this.budget.reserve(bytes);}
 }
 _breakWorker(error){
  if(!this.worker)return;
  const worker=this.worker;this.worker=null;this.protocol?.dispose();this.protocol=null;
  this.job&&(this.job.failure=error);this.job?.controller.abort();
  this.readyReject?.(error);this.readyReject=null;
  worker.terminate();this.metrics.workerTerminations++;this.metrics.forcedTerminations++;
  for(const request of this.pendingRpc.values()){request.cleanup();request.reject(error);}this.pendingRpc.clear();this.limits=null;
  this.deviceRelease?.();this.deviceRelease=null;
 }
 _post(data,transfers=[]){if(!this.worker||!this.protocol)throw new EngineError('DISPOSED','GPU worker is unavailable');try{this.protocol.post(data,transfers);}catch(cause){const error=workerMessageFailure(OWNER,'post','serialization-failed');error.cause=cause;this._breakWorker(error);throw error;}}
 _rpc(command,parameters={}, {signal,transfers=[],onEvent}={}){
  checkAbort(signal);const id=++this.sequence;
  return new Promise((resolve,reject)=>{
   const abort=()=>{if(this.pendingRpc.has(id)&&this.worker)this._rpc('cancel',{jobId:id}).catch(error=>this._breakWorker(error));};
   const cleanup=()=>signal?.removeEventListener('abort',abort);
   this.pendingRpc.set(id,{resolve,reject,onEvent,cleanup,command});signal?.addEventListener('abort',abort,{once:true});
   try{this._post({id,command,...parameters},transfers);if(signal?.aborted)abort();}
   catch(error){this.pendingRpc.delete(id);cleanup();reject(error);}
  });
 }
 async _message(data){
  if(data.event==='worker-ready'){
   if(this.workerReady)throw workerMessageFailure(OWNER,'message','duplicate-worker-ready');this.workerReady=true;this.readyResolve?.();this.readyResolve=null;this.readyReject=null;return;
  }
  const request=this.pendingRpc.get(data.id);
  if(!request)throw workerMessageFailure(OWNER,'message','unknown-request-id');
  if(data.event){if(!['submitted','readback-ready','readback-done'].includes(data.event))throw workerMessageFailure(OWNER,'message','unknown-event');await request.onEvent?.(data);return;}
  this.pendingRpc.delete(data.id);request.cleanup();request.resolve(data);
 }
 async _ensureWorker(operation,signal){
  if(this.worker){await this.workerReadyPromise;return;}
  const release=await this._reserve(this.deviceReserveBytes,{signal,operation});this.deviceRelease=release;
  const abortBeforeReady=()=>{if(this.worker&&!this.workerReady)this._breakWorker(new EngineError('CANCELLED','GPU worker loading cancelled'));};
  try{
   this.workerReady=false;this.workerReadyPromise=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject;});
   this.worker=this.factory(this.workerURL);
   this.protocol=installWorkerMessageProtocol(this.worker,data=>this._message(data),{label:OWNER,onFailure:error=>this._breakWorker(error)});
   this.worker.onerror=event=>{const error=workerMessageFailure(OWNER,'error',event.message??'worker-error');error.cause=event.error;this._breakWorker(error);};
   signal?.addEventListener('abort',abortBeforeReady,{once:true});if(signal?.aborted)abortBeforeReady();
   operation?.setState('io');await this.workerReadyPromise;checkAbort(signal);
  }catch(error){if(this.worker)this._breakWorker(error);else{this.deviceRelease?.();this.deviceRelease=null;}throw error;}
  finally{signal?.removeEventListener('abort',abortBeforeReady);}
 }
 async initialize({signal,parent}={}){
  checkAbort(signal);if(this.disposed)throw new EngineError('DISPOSED','GPU service disposed');
  if(this.closing)await this.closing;
  if(this.limits)return {...this.limits};
  if(this.initPromise){await this.initPromise;checkAbort(signal);return {...this.limits};}
  const operation=this.budget.beginOperation?.({owner:OWNER,id:'initialize',parent});
  const task=(async()=>{
   let lease;
   try{
    await this._ensureWorker(operation,signal);
    lease=await this.scheduler.acquire({cpu:1,signal,operation,resourceOwner:OWNER,label:OWNER+'/initialize'});
    const response=await this._rpc('init',{}, {signal});if(response.error)throw errorFrom(response.error);checkAbort(signal);if(this.disposed)throw new EngineError('DISPOSED','GPU service disposed');
    const limits=response.limits;
    if(!response.ready||!limits||!['maxBufferSize','maxStorageBufferBindingSize','maxComputeWorkgroupsPerDimension'].every(k=>Number.isSafeInteger(limits[k])&&limits[k]>0))throw workerMessageFailure(OWNER,'message','invalid-limits');
    this.limits={...limits};this.metrics.initializations++;operation?.commit();return {...this.limits};
   }catch(error){await this._shutdownWorker();throw error;}finally{lease?.release();operation?.release();}
  })();this.initPromise=task;
  try{return await task;}finally{if(this.initPromise===task)this.initPromise=null;this.budget.notifyReclaimable?.();}
 }
 pool(raw,options={}){
  if(this.disposed)return Promise.reject(new EngineError('DISPOSED','GPU service disposed'));
  this.pendingJobs++;
  const run=this.tail.then(()=>this._pool(raw,options));this.tail=run.then(()=>{},()=>{});
  return run.finally(()=>{this.pendingJobs--;this.budget.notifyReclaimable?.();});
 }
 async _pool(raw,{ky=16,kx=16,maximumGpuBytes=Infinity,signal,parent,onProgress}={}){
  checkAbort(signal);if(this.disposed)throw new EngineError('DISPOSED','GPU service disposed');
  await this.initialize({signal,parent});checkAbort(signal);
  const [rows,cols,features]=raw.shape??[],plan=planPoolRectangle({rows,cols,features,ky,kx},this.limits,maximumGpuBytes);
  if(!(raw.spam instanceof Float32Array)||raw.spam.byteLength!==plan.inputBytes||!(raw.weights instanceof Float32Array)||raw.weights.byteLength!==plan.weightBytes)throw new EngineError('INVALID_INPUT','Raw features do not match their shape');
  const operation=this.budget.beginOperation?.({owner:OWNER,id:'pool',parent}),controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
  const job={controller,operation,plan,gpuLease:null,cpuLease:null,gpuBacking:null,mappedBacking:null,parameterBacking:null,outputBacking:null,phase:'staging',failure:null};this.job=job;
  const started=performance.now(),inputRecords=[];let reservation,cloned,response,ownedResult,cloneLease;
  const needed=gpuPoolJobBytes(plan);
  try{
   reservation=await this._reserve(needed,{signal:controller.signal,operation});this.metrics.peakJobBytes=Math.max(this.metrics.peakJobBytes,needed);
   job.gpuBacking=this.budget.registerBacking?.('gpu',plan.gpuBytes,{owner:OWNER,label:'pool-device-buffers',operation,state:'reserved'});
   job.parameterBacking=this.budget.registerBacking?.('array-buffer',plan.hostParameterBytes,{owner:OWNER,label:'pool-uniform-staging',operation,state:'reserved'});
   job.outputBacking=this.budget.registerBacking?.('array-buffer',plan.hostOutputBytes,{owner:OWNER,label:'pool-readback-output',operation,state:'reserved'});
   cloneLease=await this.scheduler.acquire({cpu:1,signal:controller.signal,operation,resourceOwner:OWNER,label:OWNER+'/input-copy',domains:{'array-buffer':plan.inputBytes+plan.weightBytes}});
   cloned={shape:[...raw.shape]};
   for(const name of ['spam','weights']){cloned[name]=copyTypedArray(raw[name],{label:'splicebuster-gpu-'+name,operation});inputRecords.push(this.budget.registerBacking?.('array-buffer',cloned[name].byteLength,{owner:OWNER,label:'pool-input-'+name,operation,identity:cloned[name].buffer}));}
   cloneLease.release();cloneLease=null;checkAbort(controller.signal);
   job.gpuLease=await this.scheduler.acquire({cpu:0,gpu:1,signal:controller.signal,operation,resourceOwner:OWNER,label:OWNER+'/compute',domains:{gpu:plan.gpuBytes}});
   const onEvent=async data=>{
    try{
     if(!data.plan||!['rows','cols','features','ky','kx','count','gpuBytes','outputBytes'].every(k=>data.plan[k]===plan[k]))throw workerMessageFailure(OWNER,'message','mismatched-pooling-plan');
     if(data.event==='submitted'){
      if(job.phase!=='staging')throw workerMessageFailure(OWNER,'message','duplicate-submission');job.phase='gpu';job.gpuBacking?.materialize();job.parameterBacking?.materialize();
     }else if(data.event==='readback-ready'){
      if(job.phase!=='gpu')throw workerMessageFailure(OWNER,'message','unexpected-readback-ready');job.phase='waiting-readback';
      job.gpuLease?.release();job.gpuLease=null;
      job.gpuBacking?.resize(plan.gpuBytes-plan.outputBytes);job.mappedBacking=this.budget.registerBacking?.('gpu-mapped',plan.outputBytes,{owner:OWNER,label:'pool-mapped-readback',operation});
      onProgress?.({phase:'gpu-readback-ready',...data});
      job.cpuLease=await this.scheduler.acquire({cpu:1,signal:controller.signal,operation,resourceOwner:OWNER,label:OWNER+'/readback-copy',domains:{'array-buffer':plan.hostOutputBytes}});checkAbort(controller.signal);
      job.phase='readback';this._post({id:data.id,command:'readback-execute'});
     }else{
      if(job.phase!=='readback')throw workerMessageFailure(OWNER,'message','unexpected-readback-done');job.phase='retiring';job.outputBacking?.materialize();
      job.cpuLease?.release();job.cpuLease=null;retire(this.budget,job.mappedBacking,'gpu-mapped');job.mappedBacking=null;job.gpuBacking?.resize(plan.gpuBytes);
      this.metrics.readbacks++;
     }
     onProgress?.({phase:data.event,...data});
    }catch(error){job.failure=error;controller.abort();}
   };
   response=await this._rpc('pool',{raw:cloned,options:{ky,kx,maximumGpuBytes}},{signal:controller.signal,onEvent,transfers:[cloned.spam.buffer,cloned.weights.buffer]});
   if(!response.inputReleased)throw workerMessageFailure(OWNER,'message','missing-input-release');
   if(response.error){const error=errorFrom(response.error);if(error.details?.retiredGpuBytes)job.gpuBacking?.materialize(Math.min(plan.gpuBytes,error.details.retiredGpuBytes));throw job.failure??error;}
   if(job.failure)throw job.failure;checkAbort(controller.signal);
   const remote=response.result;
   if(job.phase!=='retiring'||!(remote?.sums instanceof Float32Array)||remote.sums.byteLength!==plan.outputBytes)throw workerMessageFailure(OWNER,'message','invalid-pool-output');
   job.outputBacking?.materialize();const outputLease=reservation.split(plan.hostOutputBytes),backing=job.outputBacking;job.outputBacking=null;
   let released=false;
   ownedResult={sums:remote.sums,plan,timing:{wallTimeMs:performance.now()-started,workerWallTimeMs:remote.wallTimeMs},metrics:remote.metrics,
    pin:()=>backing?.pin?.(),release:()=>{if(released)return;retire(this.budget,backing,'array-buffer');released=true;ownedResult.sums=null;outputLease();}};
   remote.sums=null;this.metrics.pools++;operation?.commit();return ownedResult;
  }catch(error){if(ownedResult)ownedResult.release();if(error.code==='WORKER_MESSAGE_FAILED')this._breakWorker(error);throw job.failure??error;}
  finally{
   dropInputs(response);if(response?.result)response.result.sums=null;
   if(cloned){cloned.spam=null;cloned.weights=null;cloned=null;}
   // On a healthy worker, _rpc settles only after buffer destruction and input
   // return. On a broken transport, _breakWorker terminates the owning worker.
   for(const backing of inputRecords)retire(this.budget,backing,'array-buffer');
   // A mapped readback still destroyed at the final ACK is retired GPU
   // backing, unlike the ordinary unmap transition in readback-done.
   const mappedRetired=job.mappedBacking?.();if(mappedRetired)this.budget.notifyBackingRelease?.('gpu',mappedRetired);
   retire(this.budget,job.gpuBacking,'gpu');retire(this.budget,job.parameterBacking,'array-buffer');retire(this.budget,job.outputBacking,'array-buffer');
   cloneLease?.release();job.gpuLease?.release();job.cpuLease?.release();reservation?.();signal?.removeEventListener('abort',abort);if(this.job===job)this.job=null;operation?.release();
  }
 }
 async _shutdownWorker(){
  if(this.closing)return this.closing;
  const close=(async()=>{
   const worker=this.worker;if(!worker)return;
   try{if(this.workerReady){const response=await this._rpc('dispose');if(response.error)throw errorFrom(response.error);if(!response.disposed)throw workerMessageFailure(OWNER,'message','invalid-disposal');}}
   finally{if(this.worker===worker){this.protocol?.dispose();this.protocol=null;worker.terminate();this.worker=null;this.metrics.workerTerminations++;this.limits=null;this.deviceRelease?.();this.deviceRelease=null;}}
  })();this.closing=close;try{return await close;}finally{if(this.closing===close)this.closing=null;}
 }
 async dispose(){
  if(this.disposed){await this.tail;await this.closing;return;}
  this.disposed=true;this.job?.controller.abort();await this.tail;
  if(this.initPromise)try{await this.initPromise;}catch{}
  try{await this._shutdownWorker();}finally{this.unreclaim?.();this.unreclaim=null;}
 }
}
