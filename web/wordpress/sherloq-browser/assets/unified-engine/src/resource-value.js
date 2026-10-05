import "../../runtime-context.js?v=0.14.5";
// Compare acceleration over the same one-second horizon, using only completed
// requested work. Scores are estimates of saved wall milliseconds per byte,
// never measurements of physical CPU/GPU occupancy.
export class ResourceValueArbiter {
 constructor(budget){this.budget=budget;this.demands=new Map();this.caches=new Set();this.pending=null;this.decisions=0;this.last=null;}
 registerCache(cache){this.caches.add(cache);return()=>this.caches.delete(cache);}
 request(key,{bytes,active=1,remaining=1,serviceMs=null}={}){
  if(!(bytes>0)||remaining<=active){this.demands.delete(key);return;}
  const score=serviceMs>0?Math.min(1000,serviceMs*remaining/Math.max(1,active))/((Math.max(1,active)+1)*bytes):null;
  this.demands.set(key,{bytes,score,active,remaining});
  if(this.pending||this.budget.total()+bytes<=this.budget.limit)return;
  const candidates=[...this.caches].filter(cache=>cache.bytes()>0&&(score===null||cache.score()<score)).sort((a,b)=>a.score()-b.score());
  if(!candidates.length)return;
  this.decisions++;this.last={reason:score===null?'first-useful-worker':'worker-estimated-time-gain',requestedBytes:bytes,workerScore:score,cacheScore:candidates[0].score()};
  let freed=0;this.pending=(async()=>{for(const cache of candidates){const needed=this.budget.total()+bytes-this.budget.limit;if(needed<=0)break;freed+=await cache.reclaim(needed);}})().catch(error=>{this.last={...this.last,error:{code:error.code??error.name,message:error.message}};}).finally(()=>{this.pending=null;if(freed>0)this.budget.changed();});
 }
 release(key){this.demands.delete(key);}
 cacheHeadroom(score){let reserved=0;for(const demand of this.demands.values())if(demand.score===null||demand.score>=score)reserved=Math.max(reserved,demand.bytes);return Math.max(0,this.budget.limit-this.budget.total()-reserved);}
 snapshot(){return {decisions:this.decisions,pendingWorkers:this.demands.size,last:this.last&&{...this.last},basis:'estimated time saved from useful work; one-second horizon'};}
}
const arbiters=new WeakMap();
export function resourceValueArbiter(budget){let value=arbiters.get(budget);if(!value){value=new ResourceValueArbiter(budget);arbiters.set(budget,value);}return value;}
