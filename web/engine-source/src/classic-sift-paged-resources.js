import {EngineError,checkAbort,requireValue,deserializeEngineError,serializeEngineError} from './errors.js';
import {ResourceRecoveryController,recoverResourceFailure} from './resource-recovery.js';
import {classicSiftRetirement,classicSiftRetireAll} from './classic-sift-retirement.js';

// The parent owns every credit until the child acknowledges retirement. The
// phase lease is transferred, rather than acquiring a second CPU/GPU lease.
export class ClassicSiftPagedResources{
 constructor(options){Object.assign(this,options);this.preparedAt=performance.now();this.controller=new AbortController();this.signal=options.signal?AbortSignal.any([options.signal,this.controller.signal]):this.controller.signal;this.extraMemory=[];this.backings=new Map();this.retiredIds=new Set();this.controllers=new Map();this.pressure=[];this.closed=false;this.closing=null;}
 async phase(kind,domains={}){
  checkAbort(this.signal);requireValue(kind==='cpu'||kind==='gpu','Invalid SIFT phase.');
  if(kind==='gpu'&&!this.gpuPrepared){this.gpuPrepared=true;this.preparationGate?.sample('preparation',performance.now()-this.preparedAt);}if(kind==='cpu'&&this.gpuAt){this.preparationGate?.sample('service',performance.now()-this.gpuAt);this.gpuAt=0;}
  if(kind==='gpu'&&this.lease?.gpu){if(this.lease.cpu)await this.lease.releaseCpu(this.lease.cpu);return;}if(kind==='cpu'&&this.lease?.cpu&&!this.lease.gpu)return;
  const previous=this.lease;this.lease=null;const request={cpu:kind==='cpu'?1:0,gpu:kind==='gpu'?1:0,signal:this.signal,domains,operation:this.operation,resourceOwner:this.owner,label:'classic-sift-'+kind};
  const lease=await(previous?this.scheduler.transition(previous,request):this.scheduler.acquire(request));try{checkAbort(this.signal);}catch(error){await lease.release();throw error;}this.lease=lease;if(kind==='gpu'){this.gpuAt=performance.now();this.onGpuAdmitted?.();}
 }
 async message(data){
  // Retirement remains legal after cancellation; only new useful work aborts.
  if(data.action==='release'){await this.releaseBacking(data.backingId);return;}
  if(this.closed)throw new EngineError('CANCELLED','SIFT tile resources closed.');
  if(data.action==='phase'){await this.phase(data.kind,data.domains);return;}
  if(data.action==='backing'){
   checkAbort(this.signal);const{backingId:id,kind,bytes,label}=data;requireValue(Number.isSafeInteger(id)&&!this.backings.has(id)&&Number.isSafeInteger(bytes)&&bytes>=0,'Invalid SIFT backing.');
   // Mappings are independent reported extents, not presumed aliases.
   const charged=[...this.backings.values()].reduce((sum,b)=>sum+b.bytes,0);
   if(charged+bytes>this.workspaceBytes){const extra=charged+bytes-this.workspaceBytes,phase=this.lease?.gpu?'gpu':'cpu';await this.lease?.release();this.lease=null;const admission=await this.scheduler.acquire({cpu:0,bytes:extra,domains:{[kind]:extra},signal:this.signal,operation:this.operation,resourceOwner:this.owner,label:'classic-sift-backing'});try{checkAbort(this.signal);const memory=admission.retainMemory(extra);this.extraMemory.push(memory);this.workspaceBytes+=extra;}finally{await admission.release();}await this.phase(phase);checkAbort(this.signal);}
   const item={kind,bytes,backing:null,release:null,notified:false};this.backings.set(id,item);item.release=classicSiftRetirement([async()=>{item.retiredBytes=await item.backing?.();item.backing=null;},()=>{if(!item.notified){if(kind!=='gpu-mapped'&&item.retiredBytes!==0)this.budget.notifyBackingRelease?.(kind,item.retiredBytes??bytes);item.notified=true;}}],()=>{this.backings.delete(id);this.retiredIds.add(id);});item.backing=this.budget.registerBacking?.(kind,bytes,{owner:this.owner,label,operation:this.operation});return;
  }
  if(data.action==='recover'){
   checkAbort(this.signal);const error=deserializeEngineError(data.error),key=String(data.label);let controller=this.controllers.get(key);if(!controller){controller=new ResourceRecoveryController();this.controllers.set(key,controller);}const decision=controller.fail(error,{operation:'classic-sift:'+key,phase:key,memory:this.budget.snapshot()});if(!decision.retry)throw decision.error;
   await this.lease?.release();this.lease=null;this.operation?.setState('recovery');const release=this.budget.beginRecovery?.({owner:this.owner,operation:this.operation,kind:data.kind,requestedBytes:data.bytes});if(release)this.pressure.push(release);
   await recoverResourceFailure(decision,{controller,budget:this.budget,signal:this.signal,operation:'classic-sift:'+key,owner:this.owner,resourceOperation:this.operation,onRecovery:this.onProgress,onReclaim:this.onProgress,onWait:this.onProgress});await this.phase(data.phase??'cpu');return;
  }
  if(data.action==='recovered'){this.controllers.get(String(data.label))?.success();await classicSiftRetireAll(this.pressure.map(free=>async()=>{await free();this.pressure.splice(this.pressure.indexOf(free),1);}));return;}
  throw new EngineError('INVALID_INPUT','Invalid SIFT resource operation.');
 }
 retainMemory(bytes){const available=[...this.memoryReservations,...this.extraMemory];requireValue(available.reduce((sum,release)=>sum+(release?.bytes??0),0)>=bytes,'SIFT output exceeds admission.');const parts=[];for(const memory of available){const n=Math.min(bytes,memory?.bytes??0);if(n){parts.push(memory.split(n));bytes-=n;}}return classicSiftRetirement(parts.map(release=>()=>release()));}
 adoptBacking(id){const item=this.backings.get(id);requireValue(item,'Unknown SIFT output backing.');this.backings.delete(id);return classicSiftRetirement([async()=>{item.retiredBytes=await item.backing?.();item.backing=null;},()=>{if(!item.notified){if(item.kind!=='gpu-mapped'&&item.retiredBytes!==0)this.budget.notifyBackingRelease?.(item.kind,item.retiredBytes??item.bytes);item.notified=true;}}]);}
 async releaseBacking(id){const item=this.backings.get(id);if(!item&&this.retiredIds.has(id))return;requireValue(item,'Unknown SIFT backing retirement.');await item.release();}
 close(){if(this.closing)return this.closing;this.closed=true;this.controller.abort();const task=(async()=>{await classicSiftRetireAll([...this.backings.values()].map(item=>()=>item.release()));if(this.backings.size)return;await classicSiftRetireAll(this.extraMemory.map(free=>async()=>{await free();this.extraMemory.splice(this.extraMemory.indexOf(free),1);}));await classicSiftRetireAll(this.pressure.map(free=>async()=>{await free();this.pressure.splice(this.pressure.indexOf(free),1);}));await this.lease?.release();this.lease=null;})();this.closing=task;void task.finally(()=>{if(this.closing===task)this.closing=null;}).catch(()=>{});return task;}
}
export const classicSiftResourceError=error=>serializeEngineError(error,'WORKER_FAILED');
