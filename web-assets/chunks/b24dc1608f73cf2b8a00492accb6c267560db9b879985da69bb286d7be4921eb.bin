import {EngineError,checkAbort} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';

// A JPEG quality is an indivisible stream. Between completed quality batches,
// admit more real streams from the current budget/CPU capacity. Idle instances
// keep their accounted heaps and may be reclaimed only after termination.
export class ElasticQualityWorkers {
 constructor({budget,maxWorkers,workerBytes,windowBytes=0,states,create,initialize,signal}){
  this.budget=budget;this.scheduler=getExecutionScheduler(budget,{maxWorkers});this.maximum=Math.max(1,Math.min(maxWorkers,this.scheduler.capacity.cpu));this.workerBytes=workerBytes;this.windowBytes=windowBytes;this.states=states;this.create=create;this.initialize=initialize;this.signal=signal;this.closed=false;this.metrics={created:0,reclaimed:0,peakWorkers:0,batches:0,batchWorkers:[]};
  this.unregister=budget.registerReclaimer(bytes=>{for(const state of states){if(budget.total()+bytes<=budget.limit)break;if(!state.retired&&!state.busy&&!state.pending){this.retire(state);this.metrics.reclaimed++;}}},{allocationKind:'wasm',owner:'ela',label:'idle-quality-heaps'});
 }
 retire(state){if(state.retired)return;state.retired=true;state.worker.terminate();state.releaseHeap();}
 async take(remaining,{operation}={}){
  checkAbort(this.signal);if(this.closed)throw new EngineError('DISPOSED','Quality pool disposed.');
  let maximum=Math.min(remaining,this.maximum,Math.max(1,this.scheduler.capacity.cpu-this.scheduler.used.cpu));const selected=this.states.filter(state=>!state.retired).slice(0,maximum),initializing=[];
  for(const state of selected)state.busy=true;
  try{
   while(selected.length<maximum){
    const needed=this.workerBytes+this.windowBytes;
    if(this.budget.total()+needed>this.budget.limit){operation?.setState('waiting-child');await this.budget.reclaim?.(needed,{signal:this.signal,owner:operation?.owner??'ela'});operation?.setState('ready');}
    let releaseHeap;
    if(this.budget.total()+needed>this.budget.limit){
     if(selected.length)break;
     // No local quality is in flight. Wait for another admitted group to
     // release RAM without holding a CPU or repeating a completed quality.
     const admission=await this.scheduler.acquire({cpu:0,bytes:needed,signal:this.signal,operation,resourceOwner:operation?.owner??'ela',label:'quality-stream-buffers'});
     try{checkAbort(this.signal);releaseHeap=admission.retainMemory(this.workerBytes);}finally{admission.release();}
     maximum=Math.min(remaining,this.maximum,Math.max(1,this.scheduler.capacity.cpu-this.scheduler.used.cpu));
    }else releaseHeap=this.budget.reserve(this.workerBytes);
    let state;
    try{state=this.create();state.releaseHeap=releaseHeap;state.busy=true;state.retired=false;this.states.push(state);selected.push(state);this.metrics.created++;this.metrics.peakWorkers=Math.max(this.metrics.peakWorkers,this.states.filter(item=>!item.retired).length);initializing.push(this.initialize(state));}catch(error){if(!state)releaseHeap();throw error;}
   }
   await Promise.all(initializing);checkAbort(this.signal);this.metrics.batches++;this.metrics.batchWorkers.push(selected.length);return selected;
  }catch(error){await Promise.allSettled(initializing);this.finish(selected);throw error;}
 }
 finish(states){for(const state of states)state.busy=false;}
 snapshot(){return {...this.metrics,batchWorkers:this.metrics.batchWorkers.slice(),residentWorkers:this.states.filter(state=>!state.retired).length,maximum:this.maximum,policy:'replan after each completed useful quality batch'};}
 dispose(){if(this.closed)return;this.closed=true;this.unregister();for(const state of this.states)this.retire(state);}
}
