import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {EngineError,checkAbort,requireValue,deserializeEngineError,normalizeResourceError,serializeEngineError,projectWaveletRetirementFailure,waveletRetirementOmission} from './errors.js';
import {AdaptiveConcurrency} from './adaptive-concurrency.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
import {runWithResourceRecovery,reclaimForResourceRecovery} from './resource-recovery.js';

// Local resource owners only: this registry is not a cache and never crosses RPC.
const poolOwners=new WeakMap();
// Dedicated metadata owner, not a cache and not a global failure history.
// Credit covers one active collection plus its bounded transport copy. Direct
// Core callers opt in explicitly and must bracket their own serialized call.
export const WAVELET_RETIREMENT_DIAGNOSTIC_BYTES=65536;
const retirementDiagnostics=new WeakMap();
export function createWaveletRetirementDiagnostics(budget){
 requireValue(!retirementDiagnostics.has(budget),'Transform diagnostics already owned.');
 const release=budget.reserve(WAVELET_RETIREMENT_DIAGNOSTIC_BYTES);let active=null,closing=false,retired=false,ordinal=0;
 const finish=()=>{if(retired)return;retired=true;retirementDiagnostics.delete(budget);release();};
 const owner={
  begin({sequence=null,method='direct'}={}){if(retired)return null;requireValue(!active&&!closing,'Transform diagnostic operation is already active.');active={ordinal:++ordinal,sequence,method,attempts:0,entries:[],omitted:0,closed:false};return active;},
  attempt(){const token=active;if(!token||token.closed)return;const attemptOrdinal=++token.attempts;let observed=0;
   const capture=(reason,{entryOrdinal=0,firstInSet=false,origin='cleanup-owner'}={})=>{if(active!==token||token.closed)return;observed++;if(token.entries.length>=32){token.omitted++;return;}try{token.entries.push(projectWaveletRetirementFailure(reason,{attemptOrdinal,entryOrdinal,firstInSet,origin}));}catch{token.omitted++;}};
   Object.defineProperty(capture,'observed',{get:()=>observed});return capture;
  },
  snapshot(token){if(!token||active!==token||token.closed)return [];const entries=token.entries.slice();if(token.omitted){const marker=waveletRetirementOmission(token.omitted+(entries.length===32?1:0));if(entries.length===32)entries[31]=marker;else entries.push(marker);}return entries;},
  end(token){if(!token||active!==token)return;token.closed=true;token.entries.length=0;active=null;if(closing)finish();},
  close(){closing=true;if(!active)finish();},
  get closed(){return retired;}
 };
 retirementDiagnostics.set(budget,owner);return owner;
}

function ownPool(pool){let owners=poolOwners.get(pool.budget);if(!owners)poolOwners.set(pool.budget,owners=new Set());owners.add(pool);}
function disownPool(pool){if(pool.workers.size||pool.cleanupOwners.size)return;const owners=poolOwners.get(pool.budget);owners?.delete(pool);if(!owners?.size)poolOwners.delete(pool.budget);}
function appendCleanup(primary,error){try{if(primary&&typeof primary==='object'&&Object.isExtensible(primary)){const old=primary.cleanupErrors;primary.cleanupErrors=[...(Array.isArray(old)?old:[]),error];}}catch{}}
export const appendWaveletCleanup=appendCleanup;
export async function retireWaveletPlans(owners,capture){const results=await Promise.allSettled([...owners].map(async owner=>{await owner.dispose();owners.delete(owner);}));const failure=results.find(row=>row.status==='rejected');if(capture){for(let i=0;i<results.length;i++){const row=results[i];if(row.status==='rejected')try{capture(row.reason,{entryOrdinal:i,firstInSet:row===failure,origin:'plans'});}catch{}}}if(failure)throw failure.reason;}
// Scalar walk before allocating snapshot rows; includes all historical endpoints and local cleanup owners.
export function waveletStripOwnershipMetadataBytes(budget){let pools=0,slots=0,cleanups=0;for(const pool of poolOwners.get(budget)??[]){pools++;slots+=pool.workers.size;cleanups+=pool.cleanupOwners.size;}const bytes=8192+1024*(pools+slots+cleanups);requireValue(Number.isSafeInteger(bytes),'Transform ownership metadata exceeds safe accounting.');return bytes;}
export function waveletStripOwnershipSnapshot(budget){return Object.freeze({budget,pools:Object.freeze([...(poolOwners.get(budget)??[])].map(pool=>Object.freeze({owner:pool,epoch:pool.ownershipEpoch,maximum:pool.maximum,workerHeapBytes:pool.workerHeapBytes,workerPixelBytes:pool.workerPixelBytes,slots:Object.freeze([...pool.workers.values()].map(slot=>Object.freeze({owner:slot,bytes:slot.bytes,heapBytes:slot.heapBytes,heapAllowance:slot.heapAllowance,busy:slot.busy,retiring:!!slot.retirement,terminationReturned:slot.retirement?.terminated===true,resourceAcknowledged:false}))),cleanupOwners:Object.freeze([...pool.cleanupOwners].map(owner=>Object.freeze({owner,requested:owner.requested,pending:!!owner.pending,failed:owner.failed,endpointsAcknowledged:owner.endpointsAcknowledged})))})))});}
export function waveletStripOwnershipCurrent(snapshot){const owners=poolOwners.get(snapshot?.budget)??new Set();return !!snapshot&&snapshot.pools.length===owners.size&&snapshot.pools.every(row=>owners.has(row.owner)&&row.owner.ownershipEpoch===row.epoch&&row.owner.maximum===row.maximum&&row.owner.workerHeapBytes===row.workerHeapBytes&&row.owner.workerPixelBytes===row.workerPixelBytes&&row.slots.length===row.owner.workers.size&&row.slots.every(slot=>row.owner.workers.get(slot.owner.worker)===slot.owner&&slot.owner.bytes===slot.bytes&&slot.owner.heapBytes===slot.heapBytes&&slot.owner.heapAllowance===slot.heapAllowance&&slot.owner.busy===slot.busy&&!!slot.owner.retirement===slot.retiring)&&row.cleanupOwners.length===row.owner.cleanupOwners.size&&row.cleanupOwners.every(owner=>row.owner.cleanupOwners.has(owner.owner)&&owner.owner.requested===owner.requested&&!!owner.owner.pending===owner.pending&&owner.owner.failed===owner.failed&&owner.owner.endpointsAcknowledged===owner.endpointsAcknowledged));}
export function hasPendingWaveletStripOwners(budget){for(const pool of poolOwners.get(budget)??[])if(pool.retirementTask||[...pool.workers.values()].some(slot=>slot.retirement)||[...pool.cleanupOwners].some(owner=>owner.requested))return true;return false;}
export async function retireWaveletStripOwners(budget,{pendingOnly=false}={}){let failed=false,primary;for(const pool of [...(poolOwners.get(budget)??[])]){if(pendingOnly&&!pool.retirementTask&&![...pool.workers.values()].some(slot=>slot.retirement)&&![...pool.cleanupOwners].some(owner=>owner.requested))continue;try{await pool.retireOwned({pendingOnly});}catch(error){if(!failed){failed=true;primary=error;}else appendCleanup(primary,error);}}if(failed)throw primary;}

// Independent complete-axis strips only; global thresholds remain in the owner.
// Workers survive compatible axes/stages. The operation owner calls clear() at
// its final boundary; pressure may retire only idle instances beforehand.
export class WaveletStripPool{
 constructor(budget,{resourceOwner='transform',resourceOperation,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,adaptive=new Map(),workerHeapBytes=12*1024**2,workerPixelBytes=192,workerURL=new URL('./wavelet-strip-worker.js',import.meta.url),workerFactory=globalThis.Worker?()=>new Worker(workerURL,{type:'module'}):null}={}){
  this.budget=budget;this.resourceOwner=resourceOwner;this.resourceOperation=resourceOperation;this.workerHeapBytes=workerHeapBytes;this.workerPixelBytes=workerPixelBytes;this.maximum=maxWorkers;this.factory=workerFactory;this.workerURL=String(workerURL);this.adaptive=adaptive;
  this.workers=new Map();this.cleanupOwners=new Set();this.retirementTask=null;this.ownershipEpoch=0;this.clearing=false;this.peak=1;this.completed=0;this.plans=[];this.running=false;this.starts=0;this.reuses=0;this.retired=0;this.retries=0;
 }
 registerReclaimer(){
  if(this.unreclaim)return;
  this.unreclaim=this.budget.registerReclaimer(bytes=>{
   for(const slot of [...this.workers.values()].filter(s=>s.retirement||!s.busy).sort((a,b)=>b.bytes-a.bytes)){
    if(this.budget.total()+bytes<=this.budget.limit)break;
    this.drop(slot);
   }
  },{allocationKind:'wasm',owner:this.resourceOwner,label:'idle-transform-workers'});
 }
 changed(){this.ownershipEpoch++;}
 // A local adapter owner is registered before it can await. A failed endpoint
 // or store retirement must retain this callback and every remaining credit.
 ownCleanup(cleanup){
  requireValue(typeof cleanup==='function','A transform cleanup owner is required.');
  const owner={requested:false,pending:null,failed:false,error:undefined,endpoints:false,endpointsAcknowledged:false};this.cleanupOwners.add(owner);ownPool(this);this.changed();
  const api={retire:({endpoints=false,retryEndpoints=false,endpointsAcknowledged=false}={})=>{
   if(!this.cleanupOwners.has(owner))return Promise.resolve();owner.requested=true;owner.endpoints||=endpoints;if(endpointsAcknowledged)owner.endpointsAcknowledged=true;this.changed();if(owner.pending)return owner.pending;
   // Capture after pending/coalescence: a late callback keeps this invocation token.
   const capture=retirementDiagnostics.get(this.budget)?.attempt();let cleanupStarted=false;
   const task=Promise.resolve().then(async()=>{if(owner.endpoints&&!owner.endpointsAcknowledged){this.clear({retryRetiring:retryEndpoints});owner.endpointsAcknowledged=true;this.changed();}cleanupStarted=true;await cleanup(capture);this.cleanupOwners.delete(owner);this.changed();disownPool(this);}).catch(error=>{if(cleanupStarted&&capture&&!capture.observed)capture(error);owner.failed=true;owner.error=error;this.changed();throw error;});owner.pending=task;
   void task.finally(()=>{if(owner.pending===task){owner.pending=null;this.changed();}}).catch(()=>{});return task;
  }};owner.api=api;return api;
 }
 retireOwned({pendingOnly=false}={}){
  if(this.retirementTask)return this.retirementTask;
  const selected=[...this.cleanupOwners].filter(owner=>!pendingOnly||owner.requested);for(const owner of selected)owner.requested=true;this.changed();
  const task=Promise.resolve().then(async()=>{
   const allEndpoints=!pendingOnly||selected.some(owner=>owner.endpoints&&!owner.endpointsAcknowledged);this.clear({retryRetiring:true,pendingOnly:!allEndpoints});
   let failed=false,primary;for(const owner of selected)try{await owner.api.retire({endpointsAcknowledged:allEndpoints&&this.workers.size===0});}catch(error){if(!failed){failed=true;primary=error;}else appendCleanup(primary,error);}if(failed)throw primary;
  });this.retirementTask=task;void task.finally(()=>{if(this.retirementTask===task)this.retirementTask=null;}).catch(()=>{});return task;
 }
 drop(slot,error=new EngineError('CANCELLED','Transform worker retired.')){
  if(!slot||!this.workers.has(slot.worker))return;
  const retirement=slot.retirement??={quiesced:false,terminated:false,pendingRejected:false,attempting:false,failed:false,error:undefined};
  if(retirement.attempting)throw new EngineError('BUSY','Transform endpoint retirement is already active.');
  retirement.attempting=true;this.changed();
  try{
   if(!retirement.pendingRejected){const pending=slot.pending;slot.pending=null;pending?.reject(error);retirement.pendingRejected=true;}
   if(!retirement.quiesced){slot.executionController.abort();slot.protocol?.dispose();slot.worker.onerror=null;retirement.quiesced=true;}
   if(!retirement.terminated){slot.worker.terminate();retirement.terminated=true;this.changed();}
   // Successful API return is not a claim about physical browser/GC retirement.
   while(slot.releases.length){slot.releases[0]();slot.releases.shift();}
   const retired=slot.backing?.();slot.backing=null;if(retired)this.budget.notifyBackingRelease?.('wasm',retired);
   this.workers.delete(slot.worker);this.retired++;this.changed();if(!this.workers.size){this.unreclaim?.();this.unreclaim=null;}disownPool(this);
  }catch(failure){retirement.failed=true;retirement.error=failure;this.changed();throw failure;}
  finally{retirement.attempting=false;}
 }
 clear({retryRetiring=false,pendingOnly=false}={}){
  if(this.clearing)throw new EngineError('BUSY','Transform pool retirement is already active.');
  this.clearing=true;let failed=false,primary;
  try{
   this.controller?.abort();cancelScheduledWorkerCalls(this);
   for(const slot of [...this.workers.values()]){
    if(pendingOnly&&!slot.retirement)continue;
    try{if(slot.retirement&&!retryRetiring&&slot.retirement.failed)throw slot.retirement.error;this.drop(slot,new EngineError('CANCELLED','Transform strips stopped.'));}
    catch(error){if(!failed){failed=true;primary=error;}else appendCleanup(primary,error);}
   }
   if(!this.workers.size){this.unreclaim?.();this.unreclaim=null;disownPool(this);}
   if(failed)throw primary;
  }finally{this.clearing=false;}
 }

 create(bytes){
  if([...this.cleanupOwners].some(owner=>owner.requested)||[...this.workers.values()].some(slot=>slot.retirement))throw new EngineError('BUSY','A transform endpoint still awaits retirement acknowledgement.');
  const release=this.budget.reserve(bytes);let worker,slot;
  try{
   worker=this.factory();slot={worker,bytes,releases:[release],busy:true,pending:null,error:null,executionController:new AbortController(),stage:'worker-start',index:null,key:null,heapBytes:0,heapAllowance:this.workerHeapBytes};
   // Possession begins before protocol/backing setup, which can reject.
   this.workers.set(worker,slot);ownPool(this);this.changed();this.registerReclaimer();
   const fail=error=>{slot.error=normalizeResourceError(error);this.changed();slot.executionController.abort();const pending=slot.pending;slot.pending=null;pending?.reject(slot.error);};
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
   this.starts++;return slot;
  }catch(error){if(slot){try{this.drop(slot,error);}catch(cleanup){appendCleanup(error,cleanup);}}else release();throw error;}
 }
 hold(slot,bytes){
  if(slot.retirement||[...this.cleanupOwners].some(owner=>owner.requested))throw new EngineError('BUSY','A retiring transform endpoint cannot be reused.');
  this.changed();slot.busy=true;slot.backing?.setReclaimable(false);
  try{if(bytes>slot.bytes){slot.releases.push(this.budget.reserve(bytes-slot.bytes));slot.bytes=bytes;}this.reuses++;return slot;}
  catch(error){slot.busy=false;slot.backing?.setReclaimable(true);throw error;}
 }
 park(slot){
  if(slot.retirement)return;this.changed();
  // Transferred inputs and consumed output copies are no longer retained by
  // this endpoint. Only its native heap remains resident between stages.
  const resident=Math.max(this.workerHeapBytes,slot.heapBytes);let excess=slot.bytes-resident;
  while(excess>0){const release=slot.releases.pop(),bytes=release.bytes;if(bytes<=excess){release();excess-=bytes;}else{release.split(excess)();slot.releases.push(release);excess=0;}}
  slot.bytes=resident;slot.busy=false;slot.backing?.setReclaimable(true);
 }
 memoryForConcurrency(count,perWorker,prepareBytes,localLanes=0){
  const slots=[...this.workers.values()].filter(slot=>!slot.error&&!slot.retirement).sort((a,b)=>Number(b.busy)-Number(a.busy)||b.bytes-a.bytes);
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
  checkAbort(signal);if([...this.cleanupOwners].some(owner=>owner.requested))throw new EngineError('BUSY','A transform cleanup still awaits acknowledgement.');this.running=true;
  const perWorker=this.workerHeapBytes+pixels*this.workerPixelBytes,maximum=Math.min(count,this.maximum);let localLanes=0;
  let adaptive=this.adaptive.get(key);if(!adaptive){adaptive=new AdaptiveConcurrency();if(this.adaptive.size>=64)this.adaptive.delete(this.adaptive.keys().next().value);this.adaptive.set(key,adaptive);}
  const projected=n=>this.memoryForConcurrency(n,perWorker,prepareBytes,localLanes),plan=adaptive.select(key,maximum,this.budget,projected);if(this.plans.length>=64)this.plans.shift();this.plans.push(plan);let ceiling=plan.ceiling;
  const controller=new AbortController(),joined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;this.controller=controller;
  let next=0,failure,hasFailure=false,active=0,pumping=false,done,localStarted=false,runPeak=1;const cleanupFailures=[];let primaryFailed=false,primary;const remember=error=>{if(!hasFailure){hasFailure=true;failure=error;}else appendCleanup(failure,error);};
  const finished=new Promise(resolve=>{done=resolve;}),started=performance.now(),abort=()=>{if(this.clearing)return;try{this.clear();}catch(error){cleanupFailures.push(error);}};joined.addEventListener('abort',abort,{once:true});
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
        if(slot&&(slot.error||['worker-start','compute'].includes(stage))){try{this.drop(slot,error);slot=null;}catch(cleanup){cleanupFailures.push(cleanup);appendCleanup(error,cleanup);}}
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
   }catch(error){remember(error);controller.abort();}
   finally{try{if(slot&&this.workers.has(slot.worker))this.park(slot);}catch(cleanup){remember(cleanup);controller.abort();}finally{if(!useWorker)localLanes--;active--;pump();}}
  };
  const pump=()=>{
   if(pumping)return;pumping=true;
   try{
    while(!joined.aborted&&this.factory&&next<count&&active<ceiling){
     const idle=[...this.workers.values()].filter(s=>!s.busy&&!s.error&&!s.retirement).sort((a,b)=>(a.bytes>=perWorker?0:1)-(b.bytes>=perWorker?0:1)||a.bytes-b.bytes)[0];
     const required=perWorker+(idle?Math.max(0,idle.heapAllowance-this.workerHeapBytes):0),growth=idle?Math.max(0,required-idle.bytes):perWorker;
     // prepare() owns source-window reservations, not a duplicate in worker RAM.
     if(this.budget.total()+growth+(active+1)*prepareBytes>this.budget.limit)break;
     let slot;
     try{slot=idle?this.hold(idle,required):null;}catch(error){remember(error);controller.abort();break;}
     active++;runPeak=Math.max(runPeak,active);this.peak=Math.max(this.peak,active);void lane(slot,true);
    }
    if(!joined.aborted&&next<count&&!active&&!localStarted){localStarted=true;localLanes++;active++;void lane(null,false);}
    if(!active&&(joined.aborted||next===count))done();
   }finally{pumping=false;}
  };
  const unsubscribe=this.budget.subscribe(pump);
  try{pump();await finished;if(hasFailure)throw failure;checkAbort(joined);adaptive.observe(key,{count:runPeak,maximum,milliseconds:performance.now()-started,units:count});}
  catch(error){
   primaryFailed=true;primary=error;for(const cleanup of cleanupFailures)appendCleanup(primary,cleanup);
   // Opaque script/worker failure is not evidence that concurrency is too high.
   if(['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY','WORKER_RESOURCE'].includes(normalizeResourceError(error)?.code))adaptive.reduce(key,runPeak,{error});
   throw error;
  }finally{unsubscribe();joined.removeEventListener('abort',abort);this.controller=null;this.running=false;if(hasFailure||joined.aborted)try{this.clear();}catch(cleanup){if(!primaryFailed)throw cleanup;appendCleanup(primary,cleanup);}}
 }
 metrics(){return {workers:this.peak,completedStripJobs:this.completed,residentWorkers:this.workers.size,workerStarts:this.starts,workerReuses:this.reuses,retiredWorkers:this.retired,stripRetries:this.retries,...(this.lastRecovery?{lastStripRecovery:this.lastRecovery}:{}),preflightExecutions:0,policy:'persistent reclaimable workers, per-useful-strip shared CPU admission'};}
}
