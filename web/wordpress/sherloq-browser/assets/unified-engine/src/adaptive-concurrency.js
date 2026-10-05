import "../../runtime-context.js?v=0.14.5";
import {normalizeResourceError,resourceAllocationKind} from './errors.js';
// Decisions use only resource hints and timings of completed requested work.
// No synthetic input, repeated task, warm-up or candidate sweep is executed.
export class AdaptiveConcurrency {
 constructor(){this.states=new Map();this.selections=new Map();}
 select(key,maximum,budget,bytesForCount,minimum=1){
  const state=this.states.get(key),room=Math.max(0,budget.limit-budget.retained-budget.active);
  const released=kind=>budget.backingReleased?.get(kind)??0;
  if(state?.failure){const fence=state.failure,kind=fence.kind;
   const opportunity=kind==='policy'?room>=fence.room+fence.bytes:kind?released(kind)>fence.released:budget.limit>fence.limit;
   if(opportunity){state.ceiling=maximum;state.failure=null;state.reason='Capacity reconsidered after relevant resource release';}
  }
  const ceiling=Math.min(maximum,state?.ceiling??maximum);
  // Recomputable cache can be evicted; live inputs, outputs and reservations cannot.
  let count=ceiling;while(count>minimum&&bytesForCount(count)>room)count--;
  if(bytesForCount(count)>room)count=minimum;
  this.selections.delete(key);if(this.selections.size>=64)this.selections.delete(this.selections.keys().next().value);
  this.selections.set(key,{budget,room,bytes:Math.max(1,bytesForCount(Math.max(minimum+1,count))-bytesForCount(Math.max(minimum,count-1))),limit:budget.limit});
  return {count,maximum,ceiling,resourceReduced:count<ceiling,policy:'immediate-useful-work',priorUsefulSamples:state?.samples??0,reason:state?.reason??'Aggressive capacity-based start'};
 }
 observe(key,{count,maximum,milliseconds,computeMilliseconds,waitMilliseconds=0,ioMilliseconds=0,units=1}){
  if(!Number.isFinite(milliseconds)||milliseconds<=0||!Number.isFinite(units)||units<=0)return;
  const cost=milliseconds/units,old=this.states.get(key),state=old??{ceiling:maximum,samples:0,cost,count,reason:'Aggressive capacity-based start'};
  // Wall time includes I/O, scheduling, publication and recovery. It cannot
  // establish CPU contention. Only explicitly measured compute service does.
  const computeCost=Number.isFinite(computeMilliseconds)&&computeMilliseconds>0?computeMilliseconds/units:null;
  const contention=computeCost!==null&&old?.computeCost>0&&count===old.count&&computeCost>old.computeCost*1.5&&waitMilliseconds+ioMilliseconds<milliseconds*.2;
  if(contention&&count>1){state.ceiling=Math.max(1,Math.ceil(count*.75));state.reason='Reduced after measured compute contention';}
  else if(state.ceiling<maximum){state.ceiling=Math.min(maximum,Math.max(state.ceiling+1,state.ceiling*2));state.reason='Recovered capacity at a useful completion';state.failure=null;}
  state.cost=old&&count===old.count?old.cost*.75+cost*.25:cost;state.computeCost=computeCost;
  state.count=count;state.samples++;this.remember(key,state);
 }
 remember(key,state){this.states.delete(key);if(this.states.size>=64)this.states.delete(this.states.keys().next().value);this.states.set(key,state);}
 reduce(key,count,{error}={}){const old=this.states.get(key),selected=this.selections.get(key),normalized=normalizeResourceError(error),kind=normalized?.code==='MEMORY_LIMIT'?'policy':resourceAllocationKind(normalized);this.remember(key,{...(old??{samples:0,cost:0,count}),ceiling:Math.max(1,Math.floor(count/2)),reason:'Reduced after a worker or memory resource failure',failure:selected?{kind,room:Math.max(0,selected.budget.limit-selected.budget.retained-selected.budget.active),bytes:selected.bytes,limit:selected.budget.limit,released:selected.budget.backingReleased?.get(kind)??0}:null});}
 clear(){this.states.clear();this.selections.clear();}
}
export function isWorkerResourceFailure(error){return ['MEMORY_LIMIT','MEMORY_ALLOCATION','WORKER_RESOURCE','WORKER_FAILED'].includes(normalizeResourceError(error)?.code)||error?.name==='QuotaExceededError';}
