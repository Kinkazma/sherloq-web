import "../../runtime-context.js?v=0.14.5";
import {resourceValueArbiter} from './resource-value.js';
import {createReusableBuffer} from './reusable-buffer.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {EngineError,checkAbort,requireValue,deserializeEngineError,normalizeResourceError,serializeEngineError} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {createReservationScope} from './reservation-scope.js';
import {runWithResourceRecovery,reclaimForResourceRecovery} from './resource-recovery.js';

// A worker owns its actual heap allowance across useful tiles. Only the tile's
// computation holds a CPU grant; preparation/storage do not. Idle instances are
// synchronously reclaimable and their memory is released after termination.
export class ElasticWorkerPool {
 constructor(budget,{maxWorkers=globalThis.navigator?.hardwareConcurrency??1,workerBytes,ioBytes=0,workBuffers={},workerFactory,label='tiles',resourceOwner=label}={}){
  requireValue(Number.isInteger(maxWorkers)&&maxWorkers>0&&Number.isSafeInteger(workerBytes)&&workerBytes>0&&Number.isSafeInteger(ioBytes)&&ioBytes>=0&&typeof workerFactory==='function','Invalid elastic worker pool.');
  this.budget=budget;this.scheduler=getExecutionScheduler(budget,{maxWorkers});this.maximum=Math.min(maxWorkers,this.scheduler.capacity.cpu);this.workerBytes=workerBytes;this.ioBytes=ioBytes;this.factory=workerFactory;this.label=label;this.resourceOwner=resourceOwner;this.value=resourceValueArbiter(budget);this.workBuffers=Object.entries(workBuffers).map(([name,{Type=Uint8Array,length}])=>{requireValue(Number.isSafeInteger(length)&&length>=0&&Number.isInteger(Type.BYTES_PER_ELEMENT)&&Number.isSafeInteger(length*Type.BYTES_PER_ELEMENT),'Invalid reusable worker buffer.');return {name,Type,length,bytes:length*Type.BYTES_PER_ELEMENT};});this.slots=[];this.disposed=false;this.running=false;
  this.metrics={created:0,reclaimed:0,peakWorkers:0,peakComputing:0,computing:0,completed:0,computeMs:0,preparationMs:0,storageMs:0,heapBytes:0,resourceRecoveries:0};
  this.unreclaim=budget.registerReclaimer(bytes=>{for(const slot of [...this.slots]){if(budget.total()+bytes<=budget.limit)break;if(!slot.busy){this.drop(slot);this.metrics.reclaimed++;}}});
 }
 drop(slot,error){if(!this.slots.includes(slot))return;slot.worker?.terminate();for(const buffer of slot.buffers?.values()??[])buffer.dispose();slot.reject?.(error??new EngineError('CANCELLED','Elastic worker retired.'));slot.reject=null;this.slots.splice(this.slots.indexOf(slot),1);slot.release?.();slot.backing?.();if(slot.heapBytes)this.budget.notifyBackingRelease?.('wasm',slot.heapBytes);}
 bufferGrowth(slot){return this.workBuffers.reduce((bytes,item)=>bytes+(slot?.buffers?.get(item.name)?.byteLength>=item.bytes?0:item.bytes),0);}
 snapshot(){return {...this.metrics,residentWorkers:this.slots.length,residentAllowanceBytes:this.slots.length*this.workerBytes+this.slots.reduce((sum,slot)=>sum+[...slot.buffers.values()].reduce((n,buffer)=>n+buffer.byteLength,0),0),maximum:this.maximum,policy:'per-useful-tile CPU admission; reclaimable persistent workers'};}
 async run(total,{prepare,consume,consumeIdempotent=false,isCommitted=()=>false,onCommitted,signal,onProgress,phase=this.label}={}){
  requireValue(Number.isSafeInteger(total)&&total>=0&&typeof prepare==='function'&&typeof consume==='function'&&typeof consumeIdempotent==='boolean'&&!this.running&&!this.disposed,'Invalid elastic tile run.');
  checkAbort(signal);this.running=true;const controller=new AbortController(),joined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;this.controller=controller;let next=0,completed=0,active=0,pumping=false,failure;for(let index=0;index<total;index++)if(isCommitted(index))completed++;
  const stop=()=>{for(const slot of [...this.slots])if(slot.busy)this.drop(slot,new EngineError('CANCELLED','Elastic tile run cancelled.'));};joined.addEventListener('abort',stop,{once:true});
  const lane=async(index,slot)=>{
    let memory,cpu,input,io,hooks,ownedResult,stage='admission';const operation=this.budget.beginOperation?.({owner:this.resourceOwner,id:phase+'/tile/'+index});
    const cleanupAttempt=(failed,primary)=>{
     const errors=[],clean=action=>{try{action();}catch(error){errors.push(error);}};
     clean(()=>input?.release?.());input=null;hooks=null;clean(()=>io?.close());io=null;clean(()=>cpu?.release());cpu=null;clean(()=>memory?.release());memory=null;
     if(failed&&['worker-start','compute'].includes(stage)){clean(()=>this.drop(slot));slot=null;}
     else for(const buffer of slot?.buffers?.values()??[])clean(()=>buffer.park());
     if(errors.length){clean(()=>this.drop(slot));slot=null;if(primary){primary.details={...primary.details,cleanupErrors:errors.map(error=>serializeEngineError(error))};}else throw errors[0];}
    };
    const recoveryOptions={budget:this.budget,owner:this.resourceOwner,resourceOperation:operation,signal:joined,operation:phase+'/tile/'+index,phase:()=>stage,onRecovery:event=>{if(event.phase==='resource-recovery')this.metrics.resourceRecoveries++;this.metrics.lastRecovery={index,stage,code:event.error.code,message:event.error.message,consecutiveFailures:event.decision.consecutiveFailures};onProgress?.({...event,tile:index,tileStage:stage,execution:this.snapshot()});},onReclaim:event=>onProgress?.({...event,tile:index,tileStage:stage,execution:this.snapshot()}),onWait:event=>onProgress?.({...event,tile:index,tileStage:stage,execution:this.snapshot()})};
    try{
     ownedResult=await runWithResourceRecovery(async()=>{try{
     stage='admission';for(const buffer of slot?.buffers?.values()??[])if(!buffer.busy)buffer.hold();const bufferGrowth=this.bufferGrowth(slot);
     memory=await this.scheduler.acquire({cpu:0,bytes:this.ioBytes+bufferGrowth+(slot?0:this.workerBytes),domains:{wasm:slot?0:this.workerBytes,'array-buffer':this.ioBytes+bufferGrowth},signal:joined,operation,resourceOwner:this.resourceOwner,label:phase+'/buffers'});checkAbort(joined);
     stage='worker-start';
     if(!slot){slot={worker:null,busy:true,release:memory.retainMemory(this.workerBytes),reject:null,heapBytes:0,buffers:new Map(this.workBuffers.map(item=>[item.name,createReusableBuffer({budget:this.budget,owner:this.resourceOwner,label:this.label+'/'+item.name})]))};slot.backing=this.budget.registerBacking?.('wasm',this.workerBytes,{owner:this.resourceOwner,label:phase+'/worker',state:'reserved'});this.slots.push(slot);slot.worker=this.factory();this.metrics.created++;this.metrics.peakWorkers=Math.max(this.metrics.peakWorkers,this.slots.length);}
     // Window and storage readers share one reusable, already-admitted I/O
     // scope. Every live buffer still owns a release, including after abort.
     io=this.ioBytes?createReservationScope(memory.retainMemory(this.ioBytes)):null;
     stage='prepare';const buffers=Object.fromEntries(this.workBuffers.map(item=>[item.name,slot.buffers.get(item.name).checkout(item.Type,item.length,{reserve:bytes=>memory.retainMemory(bytes),operation})]));
     hooks={signal:joined,reserveInput:io?.reserve,reserveIO:io?.reserve,resourceOperation:operation,buffers,takeBackBuffer:(name,buffer)=>{requireValue(slot.buffers.has(name),'Unknown returned worker buffer.');slot.buffers.get(name).takeBack(buffer);}};operation?.setState('io');
     let start=performance.now();input=await prepare(index,hooks);this.metrics.preparationMs+=performance.now()-start;checkAbort(joined);
     cpu=await this.scheduler.acquire({cpu:1,signal:joined,operation,resourceOwner:this.resourceOwner,label:phase});checkAbort(joined);
     stage='compute';start=performance.now();this.metrics.computing++;this.metrics.peakComputing=Math.max(this.metrics.peakComputing,this.metrics.computing);let result;
     try{
      result=await new Promise((resolve,reject)=>{
       slot.reject=reject;const protocol=installWorkerMessageProtocol(slot.worker,data=>{if(data.progress)return;if(!Object.hasOwn(data,'error')&&(!data.result||typeof data.result!=='object'))throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected elastic worker response.');slot.reject=null;data.error?reject(deserializeEngineError(data.error)):resolve(data.result);},{label:this.label,onFailure:error=>{slot.worker?.terminate();slot.reject=null;reject(error);}});
       slot.worker.onerror=event=>protocol.fail(new EngineError('WORKER_FAILED',event.message||'Elastic worker failed.',{cause:event.error}));
       protocol.post(input.message,input.transfer??[]);
      });
     }finally{this.metrics.computing--;this.metrics.computeMs+=performance.now()-start;cpu.release();cpu=null;}
     input.ack?.(result,hooks);checkAbort(joined);this.metrics.heapBytes=Math.max(this.metrics.heapBytes,result.heapBytes??0);slot.heapBytes=Math.max(slot.heapBytes,result.heapBytes??0);slot.backing?.materialize(Math.min(this.workerBytes,slot.heapBytes));
     input.release?.();input=null;return result;
     }catch(caught){const error=normalizeResourceError(caught);cleanupAttempt(true,error);throw error;}},{...recoveryOptions,reclaim:async event=>{cleanupAttempt(true,event.error);return reclaimForResourceRecovery(this.budget,event.error,{signal:joined,owner:this.resourceOwner,resourceOperation:operation,onReclaim:event.recordReclamation});}});
     // The computed result stays owned by this busy lane. A partial publish is
     // retried only when the caller explicitly guarantees idempotent writes.
     stage='consume';const publish=async()=>{operation?.setState('io');const start=performance.now();try{return await consume(index,ownedResult,hooks);}finally{this.metrics.storageMs+=performance.now()-start;}};
     if(consumeIdempotent)await runWithResourceRecovery(publish,recoveryOptions);else await publish();
     onCommitted?.(index);operation?.commit();this.metrics.completed++;onProgress?.({phase,completed:++completed,total,execution:this.snapshot()});
    }catch(error){failure??=normalizeResourceError(error);controller.abort();}
    finally{ownedResult=null;hooks=null;try{cleanupAttempt(false);}catch(error){failure??=normalizeResourceError(error);controller.abort();this.drop(slot);slot=null;}finally{if(slot){slot.busy=false;slot.backing?.setReclaimable(true);}operation?.release();active--;pump();}}
  };
  let finish;const done=new Promise(resolve=>{finish=resolve;});
  const pump=()=>{
   if(pumping)return;pumping=true;
   try{
    while(!joined.aborted&&next<total&&active<this.maximum){
     if(isCommitted(next)){next++;continue;}
     const slot=this.slots.find(value=>!value.busy),bytes=this.ioBytes+this.bufferGrowth(slot)+(slot?0:this.workerBytes);
     // A new lane must fit alongside work already in flight. Queuing speculative
     // worker allocations would evict the worker that just finished instead of
     // reusing it. With no local work left, normal scheduler reclamation/admission
     // handles external owners or reports a genuinely insufficient budget.
     if(active&&this.budget.total()+bytes>this.budget.limit){this.value.request(this,{bytes,active,remaining:total-completed,serviceMs:this.metrics.completed?(this.metrics.computeMs+this.metrics.preparationMs+this.metrics.storageMs)/this.metrics.completed:null});break;}
     this.value.release(this);
     if(slot){slot.busy=true;slot.backing?.setReclaimable(false);}active++;void lane(next++,slot);
    }
    if(!active&&(joined.aborted||next===total))finish();
   }finally{pumping=false;}
  };
  const unsubscribe=this.budget.subscribe(pump);
  try{pump();await done;if(failure)throw failure;checkAbort(joined);return this.snapshot();}
  finally{this.value.release(this);unsubscribe();joined.removeEventListener('abort',stop);this.running=false;this.controller=null;}
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.controller?.abort();this.unreclaim();for(const slot of [...this.slots])this.drop(slot);}
}
