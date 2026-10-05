import "../../runtime-context.js?v=0.14.5";
// Decisions use only resource hints and timings of completed requested work.
// No synthetic input, repeated task, warm-up or candidate sweep is executed.
export class AdaptiveConcurrency {
 constructor(){this.states=new Map();}
 select(key,maximum,budget,bytesForCount,minimum=1){
  const state=this.states.get(key),ceiling=Math.min(maximum,state?.ceiling??maximum);
  // Recomputable cache can be evicted; live inputs, outputs and reservations cannot.
  const room=Math.max(0,budget.limit-budget.retained-budget.active);
  let count=ceiling;while(count>minimum&&bytesForCount(count)>room)count--;
  if(bytesForCount(count)>room)count=minimum;
  return {count,maximum,ceiling,resourceReduced:count<ceiling,policy:'immediate-useful-work',priorUsefulSamples:state?.samples??0,reason:state?.reason??'Aggressive capacity-based start'};
 }
 observe(key,{count,maximum,milliseconds,units=1}){
  if(!Number.isFinite(milliseconds)||milliseconds<=0||!Number.isFinite(units)||units<=0)return;
  const cost=milliseconds/units,old=this.states.get(key),state=old??{ceiling:maximum,samples:0,healthy:0,cost,count,reason:'Aggressive capacity-based start'};
  if(old&&count===old.count&&cost>old.cost*1.5&&count>1){state.ceiling=Math.max(1,Math.floor(count/2));state.reason='Reduced after slower completed useful work';state.healthy=0;}
  else if(++state.healthy>=3&&state.ceiling<maximum){state.ceiling++;state.healthy=0;state.reason='Recovered one worker after three completed useful tasks';}
  state.cost=old&&count===old.count?old.cost*.75+cost*.25:cost;
  state.count=count;state.samples++;this.states.clear();this.states.set(key,state);
 }
 reduce(key,count){const old=this.states.get(key);this.states.clear();this.states.set(key,{...(old??{samples:0,cost:0,count,healthy:0}),ceiling:Math.max(1,Math.floor(count/2)),reason:'Reduced after a worker or memory resource failure',healthy:0});}
 clear(){this.states.clear();}
}
export function isWorkerResourceFailure(error){return ['MEMORY_LIMIT','MEMORY_ALLOCATION','WORKER_RESOURCE','WORKER_FAILED'].includes(error?.code)||error instanceof RangeError||error?.name==='QuotaExceededError';}
