/* Private Splicebuster adapter. Original GRIP-UNINA terms: ./LICENSE.txt. */
import {EngineError,checkAbort,requireValue,deserializeEngineError} from '../errors.js';
import {getExecutionScheduler} from '../execution-scheduler.js';
import {installWorkerMessageProtocol} from '../worker-message-protocol.js';
import {registerArrayViews} from '../allocation.js';

const MiB=1024**2;
export function arrayBytes(value,seen=new Set()) {
 if(ArrayBuffer.isView(value)){if(seen.has(value.buffer))return 0;seen.add(value.buffer);return value.buffer.byteLength;}
 if(!value||typeof value!=='object')return 0;
 return Object.values(value).reduce((n,v)=>n+arrayBytes(v,seen),0);
}
function arrays(value,result={}) {
 if(!value||typeof value!=='object')return result;
 for(const [key,v] of Object.entries(value))if(ArrayBuffer.isView(v))result[key]=v;
 return result;
}

/** One shared admission coordinator; each slot owns its worker/heap until retired.
 * Reservations fund policy bytes. Registry backings separately track ownership.
 */
export class ResourceWorkerPool {
 constructor(budget,{kind='statistics',maxWorkers=1,workerURL=new URL('./compute-worker.mjs',import.meta.url),
   workerFactory=url=>new Worker(url,{type:'module'}),runtime=null,guardBytes=4*MiB}={}) {
  requireValue(budget&&Number.isSafeInteger(maxWorkers)&&maxWorkers>0,'Shared budget and positive worker count required.');
  this.budget=budget;this.scheduler=getExecutionScheduler(budget);this.kind=kind;this.maximum=maxWorkers;
  this.workerURL=workerURL;this.factory=workerFactory;this.runtime=runtime;this.guardBytes=guardBytes;
  this.slots=new Set();this.waiters=[];this.next=0;this.disposed=false;
  this.metrics={jobs:0,createdWorkers:0,retiredWorkers:0,peakWorkers:0,initializationMs:0,computeMs:0};
  this.unregister=budget.registerReclaimer(()=>this.clearIdle(),{owner:'splicebuster',allocationKind:kind==='statistics'?'wasm':'array-buffer',label:'splicebuster-'+kind+'-idle'});
 }
 clearIdle(){for(const slot of [...this.slots])if(!slot.busy)this.retire(slot);}
 retire(slot,error=new EngineError('CANCELLED','Splicebuster worker retired.')) {
  if(slot.closed)return;slot.closed=true;slot.abort?.();slot.reject?.(error);slot.protocol?.dispose();slot.worker?.terminate();
  slot.worker=null;slot.reject=null;this.slots.delete(slot);
  for(const backing of slot.backings){const bytes=backing.release();if(bytes)this.budget.notifyBackingRelease(backing.kind,bytes);}
  this.budget.retained-=slot.resident;this.budget.changed();this.metrics.retiredWorkers++;this.wake();
 }
 wake(){for(const resolve of this.waiters.splice(0))resolve();}
 async acquireSlot(cap,signal,ticket) {
  for(;;){
   checkAbort(signal);if(this.disposed)throw new EngineError('DISPOSED','Splicebuster pool disposed.');
   let slot=[...this.slots].find(s=>!s.busy&&s.cap>=cap);
   if(slot){slot.busy=true;slot.operation=ticket;for(const b of slot.backings)b.release.setReclaimable(false);return slot;}
   const small=[...this.slots].find(s=>!s.busy);if(small)this.retire(small);
   if(this.slots.size<this.maximum){
    const resident=cap+this.guardBytes+2*(this.runtime?.bytes??0);this.budget.retain(resident);
    slot={id:++this.next,cap,resident,busy:true,operation:ticket,closed:false,loaded:false,backings:[]};
    try{
     if(cap)slot.backings.push({kind:'wasm',release:this.budget.registerBacking('wasm',cap,{owner:'splicebuster',label:'sb-statistics-heap-'+slot.id,state:'reserved'})});
     // The fixed JS guard is policy headroom, not a measured ArrayBuffer.
     if(this.runtime?.bytes)slot.backings.push({kind:'array-buffer',release:this.budget.registerBacking('array-buffer',2*this.runtime.bytes,{owner:'splicebuster',label:'sb-worker-staging-'+slot.id,state:'reserved'})});
     slot.worker=this.factory(this.workerURL);this.slots.add(slot);this.metrics.createdWorkers++;this.metrics.peakWorkers=Math.max(this.metrics.peakWorkers,this.slots.size);
     return slot;
    }catch(error){for(const b of slot.backings)b.release();this.budget.retained-=resident;throw error;}
   }
   ticket?.setState('queued',{resource:'worker-slot',dependencies:[...this.slots].filter(s=>s.busy&&s.operation).map(s=>s.operation.key)});
   await new Promise((resolve,reject)=>{
    const done=()=>{signal?.removeEventListener('abort',abort);resolve();};
    const abort=()=>{const i=this.waiters.indexOf(done);if(i>=0)this.waiters.splice(i,1);reject(new EngineError('CANCELLED','Waiting for a worker cancelled.'));};
    this.waiters.push(done);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   });ticket?.setState('ready');
  }
 }
 async run(operation,inputs,{heapMaximumBytes=0,workspaceBytes=0,outputBytes=0,signal,onProgress,parent,phase=operation}={}) {
  requireValue([heapMaximumBytes,workspaceBytes,outputBytes].every(n=>Number.isSafeInteger(n)&&n>=0),'Explicit worker memory bounds required.');
  checkAbort(signal);let slot,release,lease,protocol,inputBacking,outputBacking,outputRelease,abortWorker;
  const controller=new AbortController(),abortLocal=()=>controller.abort(),jobSignal=controller.signal;
  const ticket=this.budget.beginOperation({owner:'splicebuster',id:`${this.kind}/${phase}/${++this.next}`,parent});
  signal?.addEventListener('abort',abortLocal,{once:true});
  const before=performance.now(),inputBytes=arrayBytes(inputs);
  try {
   slot=await this.acquireSlot(heapMaximumBytes,jobSignal,ticket);slot.abort=abortLocal;checkAbort(jobSignal);
   // Includes the worker's input clone, scratch and two output copies. The
   // caller's source/read windows have a separate, still-live owner.
   release=this.budget.reserve(inputBytes+workspaceBytes+2*outputBytes);
   inputBacking=this.budget.registerBacking('array-buffer',inputBytes+workspaceBytes,{owner:'splicebuster',label:`sb-${this.kind}-${phase}-scratch`,operation:ticket,state:'reserved'});
   const result=await new Promise((resolve,reject)=>{
    slot.reject=reject;let admitted=false,executed=false,done=false;
    abortWorker=()=>this.retire(slot,new EngineError('CANCELLED','Splicebuster calculation cancelled.'));
    jobSignal.addEventListener('abort',abortWorker,{once:true});
    protocol=installWorkerMessageProtocol(slot.worker,async data=>{
     if(data.id!==slot.id)throw new EngineError('WORKER_PROTOCOL','Splicebuster response identity mismatch.');
     if(data.progress){await onProgress?.(data.progress);return;}
     if(data.executionReady){
      if(admitted)throw new EngineError('WORKER_PROTOCOL','Duplicate execution request.');admitted=true;
      ticket.setState('ready');const granted=await this.scheduler.acquire({cpu:1,domains:{wasm:slot.cap,'array-buffer':inputBytes+workspaceBytes+2*outputBytes},signal:jobSignal,operation:ticket,resourceOwner:'splicebuster',label:'splicebuster/'+this.kind+'/'+phase});
      if(slot.closed||jobSignal.aborted){granted.release();return;}lease=granted;
      checkAbort(jobSignal);executed=true;protocol.post({command:'execute',id:slot.id});return;
     }
     if(data.error){done=true;jobSignal.removeEventListener('abort',abortWorker);reject(deserializeEngineError(data.error));return;}
     if(!executed||done||!data.result||typeof data.result!=='object'||Array.isArray(data.result)||!Number.isSafeInteger(data.heapBytes)||data.heapBytes<0||data.heapBytes>slot.cap)
      throw new EngineError('WORKER_PROTOCOL','Invalid Splicebuster result or heap extent.');
     done=true;jobSignal.removeEventListener('abort',abortWorker);slot.loaded=true;
     slot.backings.find(b=>b.kind==='wasm')?.release.materialize(data.heapBytes);
     resolve(data);
    },{label:'splicebuster-'+this.kind,onFailure:error=>{jobSignal.removeEventListener('abort',abortWorker);reject(error);}});
    slot.protocol=protocol;slot.worker.onerror=e=>protocol.fail(new EngineError('WORKER_EXECUTION',e.message,{cause:e.error}));
    ticket.setState('io');protocol.post({command:'run',id:slot.id,kind:this.kind,operation,inputs,runtime:this.runtime,heapMaximumBytes:slot.cap});
   });
   checkAbort(signal);
   const views=arrays(result.result),bytes=arrayBytes(views);
   requireValue(bytes<=outputBytes,'Splicebuster output exceeded admitted bound.');
   outputRelease=release.split(bytes);outputBacking=registerArrayViews(this.budget,views,{owner:'splicebuster',label:`sb-${this.kind}-${phase}-output`,operation:ticket});
   let closed=false;const backing=outputBacking;outputBacking=null;
   const owned=outputRelease;outputRelease=null;
   const value={...result.result,timing:{...result.timing,totalMs:performance.now()-before},release(){if(closed)return;closed=true;backing();owned();}};
   ticket.commit();this.metrics.jobs++;this.metrics.computeMs+=result.timing?.computeMs??0;this.metrics.initializationMs+=result.timing?.initializationMs??0;
   return value;
  }catch(error){controller.abort();if(slot)this.retire(slot,error);throw error;}
  finally {
   signal?.removeEventListener('abort',abortLocal);jobSignal.removeEventListener('abort',abortWorker);controller.abort();lease?.release();protocol?.dispose();outputBacking?.();outputRelease?.();const retired=inputBacking?.();if(retired)this.budget.notifyBackingRelease('array-buffer',retired);
   release?.();ticket.release();
   if(slot&&!slot.closed){slot.reject=null;slot.abort=null;slot.protocol=null;slot.operation=null;slot.busy=false;for(const b of slot.backings)b.release.setReclaimable(true);this.budget.notifyReclaimable();}
   this.wake();
  }
 }
 snapshot(){return {...this.metrics,workers:this.slots.size,retainedBytes:[...this.slots].reduce((n,s)=>n+s.resident,0),busyWorkers:[...this.slots].filter(s=>s.busy).length};}
 dispose(){if(this.disposed)return;this.disposed=true;this.unregister();for(const s of [...this.slots])this.retire(s,new EngineError('DISPOSED','Splicebuster pool disposed.'));this.wake();}
}
