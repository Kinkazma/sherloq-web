import {COMPUTE_PROFILES} from './profiles.js';

const MiB=1024**2;
// Host free memory excludes our materialized backing, but reservations are not
// resident bytes. Adding the latter would create fictitious room on every poll.
export class LiveMemoryPolicy {
 constructor(budget,{profile='aggressive',ceiling=Infinity,now=Date.now}={}){this.budget=budget;this.fraction=COMPUTE_PROFILES[profile].ramFraction;this.ceiling=ceiling;this.now=now;this.last=null;this.growth=null;this.revision=0;}
 update(hints){
  const {systemMemoryAvailableBytes:available,systemMemoryCapacityBytes:capacity,systemMemoryObservedAt:at}=hints??{},age=this.now()-at;
  if(!Number.isSafeInteger(available)||!Number.isSafeInteger(capacity)||capacity<=0||available<0||available>capacity||!Number.isFinite(age)||age<0||age>5000||at<=(this.last?.observedAt??-Infinity))return {accepted:false,reason:'invalid-stale-or-repeated-observation',...this.snapshot()};
  let owned=0;for(const backing of this.budget.resources.backings)if(backing.kind==='array-buffer'||backing.kind==='wasm')owned+=backing.materializedBytes;
  const target=Math.min(this.ceiling,Math.max(32*MiB,Math.floor(Math.min(capacity*this.fraction,owned+available*this.fraction)/MiB)*MiB));
  const previous=this.budget.limit,deadband=Math.max(32*MiB,previous*.03);
  let reason='within-hysteresis',next=previous;
  if(target<previous-deadband){next=target;this.growth=null;reason='host-headroom-decreased';}
  else if(target>previous+deadband){
   // Two distinct observations confirm a rise; shrink promptly, regrow without
   // chasing one noisy sample. No task, GC or capacity experiment is executed.
   if(this.growth!==null){next=Math.min(target,this.growth);this.growth=null;reason='host-headroom-increased';}else{this.growth=target;reason='awaiting-growth-confirmation';}
  }else this.growth=null;
  this.last={observedAt:at,availableBytes:available,capacityBytes:capacity,materializedCpuBackingBytes:owned,targetBytes:target,reason};
  if(next!==previous){this.budget.setLimit(next);this.revision++;}
  return {accepted:true,...this.snapshot()};
 }
 snapshot(){return {revision:this.revision,budgetBytes:this.budget.limit,observation:this.last&&{...this.last},policy:'future-admissions-only; materialized CPU backing plus host headroom; no allocation guarantee'};}
}
