import "../../runtime-context.js?v=0.15.1";
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {EngineError,checkAbort,requireValue,deserializeEngineError,normalizeResourceError,serializeEngineError} from './errors.js';
import {AdaptiveConcurrency} from './adaptive-concurrency.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
import {runWithResourceRecovery,reclaimForResourceRecovery} from './resource-recovery.js';

// Independent complete-axis strips only; global thresholds remain in the owner.
// Workers survive compatible axes/stages. The operation owner calls clear() at
// its final boundary; pressure may retire only idle instances beforehand.
export class WaveletStripPool{
 constructor(budget,{resourceOwner='transform',resourceOperation,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,adaptive=new Map(),workerHeapBytes=12*1024**2,workerPixelBytes=192,workerURL=new URL('./wavelet-strip-worker.js',import.meta.url),workerFactory=globalThis.Worker?()=>new Worker(workerURL,{type:'module'}):null}={}){
  this.budget=budget;this.resourceOwner=resourceOwner;this.resourceOperation=resourceOperation;this.workerHeapBytes=workerHeapBytes;this.workerPixelBytes=workerPixelBytes;this.maximum=maxWorkers;this.factory=workerFactory;this.workerURL=String(workerURL);this.adaptive=adaptive;
  this.workers=new Map();this.peak=1;this.completed=0;this.plans=[];this.running=false;this.starts=0;this.reuses=0;this.retired=0;this.retries=0;
 }
 registerReclaimer(){
  if(this.unreclaim)return;
  this.unreclaim=this.budget.registerReclaimer(bytes=>{
   for(const slot of [...this.workers.values()].filter(s=>!s.busy).sort((a,b)=>b.bytes-a.bytes)){
    if(this.budget.total()+bytes<=this.budget.limit)break;
    this.drop(slot);
   }
  },{allocationKind:'wasm',owner:this.resourceOwner,label:'idle-transform-workers'});
 }
 drop(slot,error=new EngineError('CANCELLED','Transform worker retired.')){
  if(!slot||!this.workers.has(slot.worker))return;
  this.workers.delete(slot.worker);slot.executionController.abort();slot.protocol?.dispose();slot.worker.onerror=null;
  try{slot.worker.terminate();}finally{
   const pending=slot.pending;slot.pending=null;pending?.reject(error);
   for(const release of slot.releases)release();slot.releases.length=0;
   const retired=slot.backing?.();if(retired)this.budget.notifyBackingRelease?.('wasm',retired);
   this.retired++;
  }
 }
 clear(){
  this.controller?.abort();cancelScheduledWorkerCalls(this);
  for(const slot of [...this.workers.values()])this.drop(slot,new EngineError('CANCELLED','Transform strips stopped.'));
  this.unreclaim?.();this.unreclaim=null;
 }
 create(bytes){
  const release=this.budget.reserve(bytes);let worker,slot;
  try{
   worker=this.factory();slot={worker,bytes,releases:[release],busy:true,pending:null,error:null,executionController:new AbortController(),stage:'worker-start',index:null,key:null,heapBytes:0,heapAllowance:this.workerHeapBytes};
   const fail=error=>{slot.error=normalizeResourceError(error);slot.executionController.abort();const pending=slot.pending;slot.pending=null;pending?.reject(slot.error);};
   // An import can fail while preparation or CPU admission awaits. Install now
   // and retain failure even when no RPC is pending yet.
   slot.protocol=installWorkerMessageProtocol(worker,data=>{
    if(!slot.pending)throw workerMessageFailure('transform-strip','message','unexpected-response');
    if(data.error?typeof data.error!=='object':!data.result||typeof data.result!=='object')throw workerMessageFailure('transform-strip','message','missing-result');
    const pending=slot.pending,error=data.error?deserializeEngineError(data.error):null;
    slot.pending=null;error?pending.reject(error):pending.resolve(data.result);
   },{label:'transform-strip',onFailure:fail});
   worker.onerror=event=>slot.protocol.fail(new EngineError('WORKER_FAILED',event?.message||'Transform worker failed.',{cause:event?.error,details:{workerEvent:{type:event?.type,filename:event?.filename,line:event?.lineno,column:event?.colno}}}));
   slot.backing=this.budget.registerBacking?.('wasm',this.workerHeapBytes,{owner:this.resourceOwner,label:'transform-worker',state:'reserved'});
   this.workers.set(worker,slot);this.starts++;this.registerReclaimer();return slot;
  }catch(error){slot?.protocol?.dispose();worker?.terminate();slot?.backing?.();release();throw error;}
 }
 hold(slot,bytes){
  slot.busy=true;slot.backing?.setReclaimable(false);
  try{if(bytes>slot.bytes){slot.releases.push(this.budget.reserve(bytes-slot.bytes));slot.bytes=bytes;}this.reuses++;return slot;}
  catch(error){slot.busy=false;slot.backing?.setReclaimable(true);throw error;}
 }
 park(slot){
  // Transferred inputs and consumed output copies are no longer retained by
  // this endpoint. Only its native heap remains resident between stages.
  const resident=Math.max(this.workerHeapBytes,slot.heapBytes);let excess=slot.bytes-resident;
  while(excess>0){const release=slot.releases.pop(),bytes=release.bytes;if(bytes<=excess){release();excess-=bytes;}else{release.split(excess)();slot.releases.push(release);excess=0;}}
  slot.bytes=resident;slot.busy=false;slot.backing?.setReclaimable(true);
 }
 memoryForConcurrency(count,perWorker,prepareBytes,localLanes=0){
  const slots=[...this.workers.values()].filter(slot=>!slot.error).sort((a,b)=>Number(b.busy)-Number(a.busy)||b.bytes-a.bytes);
  let bytes=count*prepareBytes;
  for(let i=0;i<Math.max(0,count-localLanes);i++){const slot=slots[i],required=perWorker+(slot?Math.max(0,slot.heapAllowance-this.workerHeapBytes):0);bytes+=slot?Math.max(0,required-slot.bytes):required;}
  return bytes;
 }
 annotate(caught,{key,index,stage,slot}){
  let error=normalizeResourceError(caught);if(!error||typeof error!=='object')error=new EngineError('WORKER_FAILED',String(caught),{cause:caught});
  error.details={...error.details,transformStrip:{key,index,stage,workerURL:this.workerURL,workerAllowanceBytes:slot?.bytes??null,completedStripJobs:this.completed}};
  return error;
 }
 async run({count,pixels,key,prepare,consume,local,signal,prepareBytes=0,consumeIdempotent=false,isCommitted=()=>false,onCommitted,onRecovery}){
  requireValue(!this.running&&Number.isSafeInteger(count)&&count>=0&&typeof prepare==='function'&&typeof consume==='function'&&typeof local==='function','Invalid transform strip run.');
  checkAbort(signal);this.running=true;
  const perWorker=this.workerHeapBytes+pixels*this.workerPixelBytes,maximum=Math.min(count,this.maximum);let localLanes=0;
  let adaptive=this.adaptive.get(key);if(!adaptive){adaptive=new AdaptiveConcurrency();if(this.adaptive.size>=64)this.adaptive.delete(this.adaptive.keys().next().value);this.adaptive.set(key,adaptive);}
  const projected=n=>this.memoryForConcurrency(n,perWorker,prepareBytes,localLanes),plan=adaptive.select(key,maximum,this.budget,projected);if(this.plans.length>=64)this.plans.shift();this.plans.push(plan);let ceiling=plan.ceiling;
  const controller=new AbortController(),joined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;this.controller=controller;
  let next=0,failure,active=0,pumping=false,done,localStarted=false,runPeak=1;
  const finished=new Promise(resolve=>{done=resolve;}),started=performance.now(),abort=()=>this.clear();joined.addEventListener('abort',abort,{once:true});
  const lane=async(initialSlot,useWorker)=>{
   let slot=initialSlot;
   try{
    while(next<count){
     checkAbort(joined);const index=next++;if(isCommitted(index))continue;
     const usefulStarted=performance.now();let stage='worker-start';
     const operation=this.budget.beginOperation?.({owner:this.resourceOwner,id:String(key)+'/strip/'+index,parent:this.resourceOperation});
     const recoveryOptions={budget:this.budget,owner:this.resourceOwner,resourceOperation:operation,signal:joined,operation:String(key)+'/strip/'+index,phase:()=>stage,onRecovery:event=>{
      if(event.phase==='resource-recovery')this.retries++;
      this.lastRecovery={index,stage,error:event.error,phase:event.phase};onRecovery?.({...event,index,stripStage:stage});
     }};
     try{
      const result=await runWithResourceRecovery(async()=>{
       try{
        checkAbort(joined);stage='worker-start';
        if(useWorker&&!slot)slot=this.create(perWorker);
        if(slot){slot.key=key;slot.index=index;slot.stage=stage;if(slot.error)throw slot.error;}
        stage='prepare';if(slot)slot.stage=stage;operation?.setState('io');
        // postMessage may have detached every input. Re-read the same strip on
        // retry; committed outputs and other lanes are untouched.
        const job=await prepare(index);checkAbort(joined);if(slot?.error)throw slot.error;
        stage='admission';if(slot)slot.stage=stage;
        const value=await scheduledWorkerCall(this,()=>{
         stage='compute';if(slot)slot.stage=stage;
         if(!slot)return local(job);
         if(slot.error)throw slot.error;
         return new Promise((resolve,reject)=>{
          slot.pending={resolve,reject};
          const buffers=[...new Set(Object.values(job).filter(ArrayBuffer.isView).map(v=>v.buffer).filter(buffer=>buffer instanceof ArrayBuffer))];
          try{slot.protocol.post(job,buffers);}catch(error){slot.pending=null;reject(error);}
         });
        },{signal:slot?AbortSignal.any([joined,slot.executionController.signal]):joined,label:'transform-strip',operation});
        if(slot&&Number.isSafeInteger(value.heapBytes)&&value.heapBytes>=0){
         if(value.heapBytes>slot.heapBytes){slot.heapBytes=value.heapBytes;slot.backing?.resize(slot.heapBytes);}
         if(value.heapBytes>slot.heapAllowance){const extra=value.heapBytes-slot.heapAllowance;slot.releases.push(this.budget.reserve(extra));slot.bytes+=extra;slot.heapAllowance=value.heapBytes;}
        }
        return value;
       }catch(caught){
        // Endpoint cancellation wakes a queued grant, but its loading failure
        // is the cause. A simultaneous genuine preparation error stays primary.
        const primary=slot?.error&&caught?.code==='CANCELLED'&&!joined.aborted?slot.error:caught;
        const error=this.annotate(primary,{key,index,stage,slot});
        if(slot?.error&&slot.error!==primary)error.details.workerFailure=serializeEngineError(slot.error);
        if(slot&&(slot.error||['worker-start','compute'].includes(stage))){this.drop(slot,error);slot=null;}
        throw error;
       }
      },{...recoveryOptions,reclaim:event=>reclaimForResourceRecovery(this.budget,event.error,{signal:joined,owner:this.resourceOwner,resourceOperation:operation,onReclaim:event.recordReclamation})});
      checkAbort(joined);stage='consume';if(slot)slot.stage=stage;operation?.setState('io');
      const publish=async()=>{try{return await consume(result,index);}catch(error){throw this.annotate(error,{key,index,stage,slot});}};
      // Publication is retried only with an explicit idempotence contract. Its
      // successful computation and exact output remain owned while retrying.
      if(consumeIdempotent)await runWithResourceRecovery(publish,recoveryOptions);else await publish();
      onCommitted?.(index);operation?.commit();this.completed++;
      adaptive.observe(key,{count:active,maximum,milliseconds:performance.now()-usefulStarted,units:1});ceiling=adaptive.select(key,maximum,this.budget,projected).ceiling;pump();
     }finally{operation?.release();}
    }
   }catch(error){failure??=error;controller.abort();}
   finally{if(slot&&this.workers.has(slot.worker))this.park(slot);if(!useWorker)localLanes--;active--;pump();}
  };
  const pump=()=>{
   if(pumping)return;pumping=true;
   try{
    while(!joined.aborted&&this.factory&&next<count&&active<ceiling){
     const idle=[...this.workers.values()].filter(s=>!s.busy&&!s.error).sort((a,b)=>(a.bytes>=perWorker?0:1)-(b.bytes>=perWorker?0:1)||a.bytes-b.bytes)[0];
     const required=perWorker+(idle?Math.max(0,idle.heapAllowance-this.workerHeapBytes):0),growth=idle?Math.max(0,required-idle.bytes):perWorker;
     // prepare() owns source-window reservations, not a duplicate in worker RAM.
     if(this.budget.total()+growth+(active+1)*prepareBytes>this.budget.limit)break;
     let slot;
     try{slot=idle?this.hold(idle,required):null;}catch(error){failure??=error;controller.abort();break;}
     active++;runPeak=Math.max(runPeak,active);this.peak=Math.max(this.peak,active);void lane(slot,true);
    }
    if(!joined.aborted&&next<count&&!active&&!localStarted){localStarted=true;localLanes++;active++;void lane(null,false);}
    if(!active&&(joined.aborted||next===count))done();
   }finally{pumping=false;}
  };
  const unsubscribe=this.budget.subscribe(pump);
  try{pump();await finished;if(failure)throw failure;checkAbort(joined);adaptive.observe(key,{count:runPeak,maximum,milliseconds:performance.now()-started,units:count});}
  catch(error){
   // Opaque script/worker failure is not evidence that concurrency is too high.
   if(['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY','WORKER_RESOURCE'].includes(normalizeResourceError(error)?.code))adaptive.reduce(key,runPeak,{error});
   throw error;
  }finally{unsubscribe();joined.removeEventListener('abort',abort);this.controller=null;this.running=false;if(failure||joined.aborted)this.clear();}
 }
 metrics(){return {workers:this.peak,completedStripJobs:this.completed,residentWorkers:this.workers.size,workerStarts:this.starts,workerReuses:this.reuses,retiredWorkers:this.retired,stripRetries:this.retries,...(this.lastRecovery?{lastStripRecovery:this.lastRecovery}:{}),preflightExecutions:0,policy:'persistent reclaimable workers, per-useful-strip shared CPU admission'};}
}
