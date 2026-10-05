import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort,requireValue,deserializeEngineError,serializeEngineError} from './errors.js';
import {ResourceRecoveryController,recoverResourceFailure} from './resource-recovery.js';

// One owner follows a useful native tile through CPU, GPU and publication.
// Its policy envelope is charged once; backing reports explain that envelope
// rather than adding the same memory again when it crosses a worker boundary.
export class SiftPagedResources{
 constructor({budget,scheduler,operation,owner,signal,onProgress,heapBytes,workspaceBytes,memoryReservations=[],reservationScope,lease,preparationGate,onGpuAdmitted}){Object.assign(this,{budget,scheduler,operation,owner,signal,onProgress,heapBytes,workspaceBytes,memoryReservations,reservationScope,lease,preparationGate,onGpuAdmitted});this.preparedAt=performance.now();this.controller=new AbortController();this.signal=signal?AbortSignal.any([signal,this.controller.signal]):this.controller.signal;this.extraMemory=[];this.backings=new Map();this.sequence=0;this.controllers=new Map();this.closed=false;}
 async phase(kind,domains={}){
  checkAbort(this.signal);requireValue(kind==='cpu'||kind==='gpu','Invalid SIFT phase.');
  if(kind==='gpu'&&!this.gpuPrepared){this.gpuPrepared=true;this.preparationGate?.sample('preparation',performance.now()-this.preparedAt);}if(kind==='cpu'&&this.gpuAt){this.preparationGate?.sample('service',performance.now()-this.gpuAt);this.gpuAt=0;}
  if(kind==='gpu'&&this.lease?.gpu){if(this.lease.cpu)this.lease.releaseCpu(this.lease.cpu);return;}
  if(kind==='cpu'&&this.lease?.cpu&&!this.lease.gpu)return;
  this.lease?.release();this.lease=null;
  const lease=await this.scheduler.acquire({cpu:kind==='cpu'?1:0,gpu:kind==='gpu'?1:0,signal:this.signal,domains,operation:this.operation,resourceOwner:this.owner,label:'sift-'+kind});
  try{checkAbort(this.signal);}catch(error){lease.release();throw error;}this.lease=lease;if(kind==='gpu'){this.gpuAt=performance.now();this.onGpuAdmitted?.();}
 }
 async message(data){
  if(this.closed)throw new EngineError('CANCELLED','SIFT tile resource owner closed.');
  if(data.action==='phase'){await this.phase(data.kind,data.domains);return {};}
  if(data.action==='backing'){
   const {backingId:id,kind,bytes,label}=data;requireValue(Number.isSafeInteger(id)&&!this.backings.has(id)&&Number.isSafeInteger(bytes)&&bytes>=0,'Invalid SIFT backing.');
   const charged=[...this.backings.values()].reduce((sum,b)=>sum+(b.kind==='gpu-mapped'?0:b.bytes),0);
   if(kind!=='gpu-mapped'&&charged+bytes>this.workspaceBytes){const extra=charged+bytes-this.workspaceBytes,phase=this.lease?.gpu?'gpu':'cpu';this.lease?.release();this.lease=null;const admission=await this.scheduler.acquire({cpu:0,bytes:extra,domains:{[kind]:extra},signal:this.signal,operation:this.operation,resourceOwner:this.owner,label:'sift-backing'});try{checkAbort(this.signal);const retained=admission.retainMemory(extra),memory=this.reservationScope?this.reservationScope.track(retained):retained;this.extraMemory.push(memory);this.workspaceBytes+=extra;}finally{admission.release();}await this.phase(phase);checkAbort(this.signal);}
   const release=this.budget.registerBacking?.(kind,bytes,{owner:this.owner,label,operation:this.operation});this.backings.set(id,{kind,bytes,release});return {};
  }
  if(data.action==='release'){this.releaseBacking(data.backingId);return {};}
  if(data.action==='recover'){
   const error=deserializeEngineError(data.error),key=String(data.label);let controller=this.controllers.get(key);if(!controller){controller=new ResourceRecoveryController();this.controllers.set(key,controller);}
   const decision=controller.fail(error,{operation:'sift:'+key,phase:key,memory:this.budget.snapshot()});
   if(!decision.retry)throw decision.error;
   this.lease?.release();this.lease=null;this.operation?.setState('recovery');
   const release=this.budget.beginRecovery?.({owner:this.owner,operation:this.operation,kind:data.kind,requestedBytes:data.bytes});
   // Keep pressure through the useful retried allocation, not only reclamation.
   this.pressure??=[];if(release)this.pressure.push(release);
   await recoverResourceFailure(decision,{controller,budget:this.budget,signal:this.signal,operation:'sift:'+key,owner:this.owner,resourceOperation:this.operation,onRecovery:this.onProgress,onReclaim:this.onProgress,onWait:this.onProgress});
   await this.phase(data.phase??'cpu');return {};
  }
  if(data.action==='recovered'){this.controllers.get(String(data.label))?.success();for(const free of this.pressure??[])free();this.pressure=[];return {};}
  throw new EngineError('INVALID_INPUT','Invalid SIFT resource operation.');
 }
 retainMemory(bytes){const available=[...this.memoryReservations,...this.extraMemory];requireValue(available.reduce((sum,release)=>sum+(release?.bytes??0),0)>=bytes,'SIFT output exceeds its actual admission.');const parts=[];for(const memory of available){const size=Math.min(bytes,memory?.bytes??0);if(size){parts.push(memory.split(size));bytes-=size;}}let closed=false;return()=>{if(closed)return;closed=true;for(const release of parts)release();};}
 adoptBacking(id){const backing=this.backings.get(id);if(!backing)return null;this.backings.delete(id);return()=>{backing.release?.();if(backing.kind!=='gpu-mapped')this.budget.notifyBackingRelease?.(backing.kind,backing.bytes);};}
 releaseBacking(id){const backing=this.backings.get(id);if(!backing)return;this.backings.delete(id);backing.release?.();if(backing.kind!=='gpu-mapped')this.budget.notifyBackingRelease?.(backing.kind,backing.bytes);}
 close(){if(this.closed)return;this.closed=true;this.controller.abort();this.lease?.release();this.lease=null;for(const id of this.backings.keys())this.releaseBacking(id);for(const release of this.extraMemory)release();this.extraMemory=[];for(const free of this.pressure??[])free();this.pressure=[];}
}

export function siftResourceError(error){return serializeEngineError(error,'WORKER_FAILED');}
