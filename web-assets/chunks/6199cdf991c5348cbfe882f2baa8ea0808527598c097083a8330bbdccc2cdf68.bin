import {byteRange,byteLength as rangeLength,byteView} from './memory-range.js';
import {EngineError,checkAbort} from './errors.js';
import {resourceValueArbiter} from './resource-value.js';

// A second-level cache of immutable, actually requested pages. Each bank is
// shared once across every field worker; their Wasm L1 caches remain separate.
const KiB=1024,MiB=KiB*KiB,BLOCK=4096,SLOTS=1024,BANK_BYTES=BLOCK*SLOTS,META_BYTES=SLOTS*4*4;
// Publication envelopes survive postMessage in their owners and in suspended
// worker handlers. Clear their aliases as well as the cache's active views.
function forgetPublishedBanks(descriptor,ids){
 if(!descriptor?.banks)return;const kept=[];
 for(const bank of descriptor.banks){if(!ids||ids.has(bank.id)){bank.data=null;bank.metadata=null;}else kept.push(bank);}
 descriptor.banks.splice(0,descriptor.banks.length,...kept);
}
function forgetPublication(descriptor){forgetPublishedBanks(descriptor);if(descriptor)descriptor.statistics=null;}
function waitForRetirement(promise,signal){
 checkAbort(signal);if(!signal)return promise;
 return new Promise((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(new EngineError('CANCELLED','Shared cache retirement cancelled.'));};signal.addEventListener('abort',abort,{once:true});promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});});
}
const managers=new WeakMap();
export function getSharedReadCache(budget){
 if(typeof SharedArrayBuffer!=='function'||globalThis.crossOriginIsolated!==true)return null;
 let value=managers.get(budget);if(value)return value;
 value=new SharedReadCache(budget);managers.set(budget,value);return value;
}
class SharedReadCache{
 constructor(budget){this.budget=budget;this.id=crypto.randomUUID();this.nextStore=1;this.ids=new WeakMap();this.banks=[];this.retiring=new Set();this.retirement=null;this.peers=new Set();this.bytes=0;this.serial=0;this.reclaiming=false;this.closed=false;this.blockedExternalBytes=null;this.recoveryGrowthCeiling=Infinity;this.statistics=null;this.releaseStatistics=null;this.retirementMetrics={count:0,releasedBytes:0,ackWaitMs:0,last:null};this.unregister=budget.registerAsyncReclaimer?.(request=>this.reclaim(request),{allocationKind:'array-buffer',priority:100,owner:'patchmatch',label:'shared-read-cache'});this.value=resourceValueArbiter(budget);this.valueScore=0;this.valueSample=null;this.valueMetrics={savedMsPerSecond:0,missMeanMs:0,hitMeanMs:0};this.unregisterValue=this.value.registerCache({bytes:()=>this.banks.length*(BANK_BYTES+META_BYTES),score:()=>this.valueScore,reclaim:bytes=>this.reclaim({shortfallBytes:bytes})});this.unsubscribe=budget.subscribe?.(()=>this.rebalance());}
 updateValue(){
  if(!this.statistics)return;const now=performance.now(),read=i=>Atomics.load(this.statistics,i)>>>0,current={at:now,hits:read(0),missUs:read(4),missSamples:read(5),hitUs:read(6),hitSamples:read(7)},old=this.valueSample;
  if(old&&now-old.at<100)return;
  if(old){const delta=key=>(current[key]-old[key])>>>0,misses=delta('missSamples'),hits=delta('hitSamples'),missMs=misses?delta('missUs')/misses/1000:this.valueMetrics.missMeanMs,hitMs=hits?delta('hitUs')/hits/1000:this.valueMetrics.hitMeanMs,savedMs=delta('hits')*Math.max(0,missMs-hitMs);this.valueMetrics={savedMsPerSecond:savedMs*1000/Math.max(1,now-old.at),missMeanMs:missMs,hitMeanMs:hitMs};this.valueScore=this.valueMetrics.savedMsPerSecond/Math.max(1,this.bytes);}
  this.valueSample=current;
 }
 storeId(store){let id=this.ids.get(store);if(!id){id=this.nextStore++;this.ids.set(store,id);}return id;}
 snapshot(){const statistic=index=>this.statistics?Atomics.load(this.statistics,index)>>>0:0;return {bytes:this.bytes,banks:this.banks.length,recoveryGrowthCeilingBytes:Number.isFinite(this.recoveryGrowthCeiling)?this.recoveryGrowthCeiling:null,hits:statistic(0),misses:statistic(1),fills:statistic(2),collisions:statistic(3),value:{...this.valueMetrics,score:this.valueScore,arbitration:this.value.snapshot()},retirement:{...this.retirementMetrics,last:this.retirementMetrics.last&&{...this.retirementMetrics.last}}};}
 describe(){return {id:this.id,blockBytes:BLOCK,slots:SLOTS,banks:this.banks.map(({id,data,metadata})=>({id,data,metadata})),statistics:this.statistics.buffer};}
 connect({dormant=false}={}){
  if(!this.statistics){
   // Optional acceleration is admitted only when a useful reader connects.
   // A real backing-pool failure leaves the transport working without a cache;
   // a later reader may use newly available memory without a permanent cap.
   if(this.budget.recovering&&!dormant)return {descriptor:null,transfer:[],release(){},activate(){}};
   let release;try{release=this.budget.reserve(32);this.statistics=new Int32Array(new SharedArrayBuffer(32));this.releaseStatistics=release;this.backingStatistics=this.budget.registerBacking?.('array-buffer',32,{owner:'patchmatch',label:'shared-cache-statistics'});this.bytes+=32;}catch(error){release?.();if(error.code==='MEMORY_LIMIT'||error instanceof RangeError)return {descriptor:null,transfer:[],release(){}};throw error;}
  }
  const channel=new MessageChannel(),peer={port:channel.port1,waiting:new Map(),closed:false,active:!dormant};this.peers.add(peer);
  peer.port.onmessage=({data})=>{if(data?.ack){peer.waiting.get(data.ack)?.();peer.waiting.delete(data.ack);}if(data?.closed){peer.closed=true;peer.port.close();forgetPublication(peer.publication);this.peers.delete(peer);for(const done of peer.waiting.values())done();peer.waiting.clear();this.clearIdle();}};peer.port.start();
  if(!dormant)this.rebalance(true);
  peer.publication={...this.describe(),banks:dormant?[]:this.describe().banks,port:channel.port2};
  let released=false;return {descriptor:peer.publication,transfer:[channel.port2],activate:()=>{if(released||peer.closed||peer.active)return;peer.active=true;this.rebalance(true);peer.port.postMessage({update:this.describe()});},release:()=>{if(released)return;released=true;peer.closed=true;peer.port.close();forgetPublication(peer.publication);this.peers.delete(peer);for(const done of peer.waiting.values())done();peer.waiting.clear();if(!this.peers.size)this.clearIdle();}};
 }
 rebalance(first=false){
  if(!this.closed&&!this.reclaiming&&this.budget.total()>this.budget.limit){void this.reclaim({shortfallBytes:this.budget.total()-this.budget.limit}).catch(error=>{this.lastReclaimError={code:error.code??error.name,message:error.message};});return;}
  if(this.closed||this.reclaiming||![...this.peers].some(peer=>peer.active)||this.budget.recovering)return;
  this.updateValue();
  const externalBytes=this.budget.total()-this.bytes;
  if(this.blockedExternalBytes!==null){
   if(externalBytes>this.blockedExternalBytes)return;
   this.blockedExternalBytes=null;
  }
  // Grow only after useful misses have filled the existing capacity. A budget
  // release alone never commits a synthetic full-memory allocation.
  const fills=Atomics.load(this.statistics,2)>>>0,capacity=this.banks.length*SLOTS;
  if(this.banks.length&&fills<capacity/2)return;
  const room=Math.min(this.value.cacheHeadroom(this.valueScore)-64*MiB,this.recoveryGrowthCeiling-this.budget.total());
  const wanted=Math.min(Math.max(1,this.banks.length),Math.floor(room/(BANK_BYTES+META_BYTES)));
  for(let i=0;i<wanted;i++){
   let release;try{release=this.budget.reserve(BANK_BYTES+META_BYTES);const bank={id:++this.serial,data:new SharedArrayBuffer(BANK_BYTES),metadata:new SharedArrayBuffer(META_BYTES),release};bank.backing=this.budget.registerBacking?.('array-buffer',BANK_BYTES+META_BYTES,{owner:'patchmatch',label:'shared-read-cache',reclaimable:true});this.banks.push(bank);this.bytes+=BANK_BYTES+META_BYTES;}catch(error){release?.();if(error.code==='MEMORY_LIMIT'||error instanceof RangeError){
    // Our failed reserve/release emits Budget notifications too. Only a real
    // cumulative decrease of at least one complete bank permits another
    // attempt. Transient reader scopes never raise this failure-time baseline.
    this.blockedExternalBytes=this.budget.total()-this.bytes-BANK_BYTES-META_BYTES;break;
   }throw error;}
  }
  if(wanted>0)this.broadcast();
 }
 broadcast(){const description=this.describe();for(const peer of this.peers)if(peer.active)peer.port.postMessage({update:description});}
 async retire(banks,{allocationFailure=false}={}){
  if(!banks.length)return 0;const started=performance.now(),before=this.snapshot();const ids=banks.map(bank=>bank.id),ack=crypto.randomUUID();
  // New clients must never receive a bank whose retirement is already waiting
  // for old readers. Keep its owner/reservation until every old reader ACKs.
  for(const bank of banks){const index=this.banks.indexOf(bank);if(index>=0)this.banks.splice(index,1);this.retiring.add(bank);}
  const idSet=new Set(ids);for(const peer of this.peers)forgetPublishedBanks(peer.publication,idSet);
  await Promise.all([...this.peers].map(peer=>new Promise(resolve=>{peer.waiting.set(ack,resolve);peer.port.postMessage({retire:ids,ack});})));
  let freed=0;for(const bank of banks){this.retiring.delete(bank);bank.data=null;bank.metadata=null;bank.backing?.();bank.release();freed+=BANK_BYTES+META_BYTES;}
  this.bytes-=freed;
  // Keep the retired headroom for useful allocations. Optional cache may use
  // subsequent external releases, but cannot immediately refill its own loss.
  // This is a cache-only ceiling for these readers, not a worker/RAM quota.
  if(allocationFailure)this.recoveryGrowthCeiling=Math.min(this.recoveryGrowthCeiling,this.budget.total());
  const ackWaitMs=performance.now()-started,metrics=this.retirementMetrics;metrics.count++;metrics.releasedBytes+=freed;metrics.ackWaitMs+=ackWaitMs;metrics.last={releasedBytes:freed,ackWaitMs,remainingBytes:this.bytes,hitsBefore:before.hits,missesBefore:before.misses,hitsAfter:Atomics.load(this.statistics,0)>>>0,missesAfter:Atomics.load(this.statistics,1)>>>0};if(freed)this.budget.notifyBackingRelease?.('array-buffer',freed);Atomics.store(this.statistics,2,0);return freed;
 }
 async reclaim({shortfallBytes=0,bytes=0,all=false,signal,reason,recoveryAttempt=1}={}){
  checkAbort(signal);if(this.retirement)return waitForRetirement(this.retirement,signal);this.reclaiming=true;
  // Escalate only disposable acceleration after a real allocator refusal.
  // Four unchanged retries retire 1/8, 1/4, 1/2, then the remaining cache;
  // a tiny failed allocation must not produce five identical 4 MiB retries.
  const relief=reason==='allocation'?Math.ceil(this.banks.length*Math.min(1,2**(Math.max(1,recoveryAttempt)-4))):0;
  const count=all?this.banks.length:Math.min(this.banks.length,Math.max(relief,Math.ceil(Math.max(shortfallBytes,bytes?1:0)/(BANK_BYTES+META_BYTES))));
  const retirement=this.retire([...this.retiring,...(count?[...this.banks].sort((a,b)=>{const hits=bank=>{const values=new Int32Array(bank.metadata);let total=0;for(let i=3;i<values.length;i+=4)total+=Atomics.load(values,i)>>>0;return total;};return hits(a)-hits(b);}).slice(0,count):[])],{allocationFailure:reason==='allocation'}).finally(()=>{this.retirement=null;this.reclaiming=false;if(!this.peers.size)this.clearIdle();});this.retirement=retirement;
  // Cancellation ends the request, not ownership: retirement still waits for
  // ACKs before releasing backing and admitting another useful allocation.
  return waitForRetirement(retirement,signal);
 }
 clearIdle(){if(this.peers.size||this.reclaiming)return;const freed=this.bytes;for(const bank of [...this.banks,...this.retiring]){bank.data=null;bank.metadata=null;bank.backing?.();bank.release();}this.banks.length=0;this.retiring.clear();this.bytes=0;this.blockedExternalBytes=null;this.recoveryGrowthCeiling=Infinity;this.statistics=null;this.releaseStatistics?.();this.releaseStatistics=null;this.backingStatistics?.();this.backingStatistics=null;if(freed)this.budget.notifyBackingRelease?.('array-buffer',freed);}
}

export function createSharedReadCacheClient(descriptor){
 if(!descriptor)return null;
 const {id,port,blockBytes,slots}=descriptor;let statistics=new Int32Array(descriptor.statistics),banks=[],closed=false,disposal,missSequence=0,hitSequence=0;const pending=new Map(),children=new Set(),retirements=new Set();
 const describe=()=>({id,blockBytes,slots,banks:banks.map(bank=>({id:bank.id,data:bank.data.buffer,metadata:bank.metadata.buffer})),statistics:statistics.buffer});
 const removeChild=child=>{children.delete(child);child.port.close();forgetPublication(child.publication);for(const done of child.waiting.values())done();child.waiting.clear();};
 const retireChildren=(ids,ack)=>{const idSet=new Set(ids);return Promise.all([...children].map(child=>new Promise(resolve=>{forgetPublishedBanks(child.publication,idSet);child.waiting.set(ack,resolve);child.port.postMessage({retire:ids,ack});})));};
 function update(value){const old=new Map(banks.map(bank=>[bank.id,bank]));banks=value.banks.map(bank=>old.get(bank.id)??{id:bank.id,data:new Uint8Array(bank.data),metadata:new Int32Array(bank.metadata)});}
 update(descriptor);forgetPublication(descriptor);descriptor=null;
 port.onmessage=async({data})=>{if(data.update){if(closed)return;update(data.update);for(const child of children)child.port.postMessage({update:describe()});return;}if(data.retire){
  const ids=new Set(data.retire),removed=banks.filter(bank=>ids.has(bank.id));banks=banks.filter(bank=>!ids.has(bank.id));
  // Another request may name a bank already removed by an earlier retirement
  // (including dispose). Its empty local list is not proof that readers ACKed.
  const retirement=Promise.all([...retirements,retireChildren(data.retire,data.ack),Promise.allSettled(removed.flatMap(bank=>[...(pending.get(bank.id)??[])]))]).then(()=>{for(const bank of removed){bank.data=null;bank.metadata=null;pending.delete(bank.id);}port.postMessage({ack:data.ack});});
  retirements.add(retirement);try{await retirement;}finally{retirements.delete(retirement);}
 }};port.start();
 function cachedRead(storeId,source,target,offset){
  const original=target;target=byteRange(target);const length=rangeLength(target);
  if(closed)throw new EngineError('DISPOSED','Shared read cache closed.');
  // The native page reader uses one aligned page. Larger/seam-crossing reads
  // preserve their original transport; no eager prefetch is manufactured.
  const page=Math.floor(offset/blockBytes),within=offset%blockBytes;
  if(!banks.length||within+length>blockBytes||page>0xffffffff)return source.readInto(original,offset);
  const hash=(Math.imul(storeId,2654435761)^page)>>>0,slot=hash%(banks.length*slots),bank=banks[Math.floor(slot/slots)],index=slot%slots,at=index*4;
  if(Atomics.compareExchange(bank.metadata,at,0,1)!==0){Atomics.add(statistics,3,1);return source.readInto(original,offset);}
  const out=bank.data.subarray(index*blockBytes,index*blockBytes+Math.min(blockBytes,source.byteLength-page*blockBytes));
  if(Atomics.load(bank.metadata,at+1)===storeId&&Atomics.load(bank.metadata,at+2)===(page|0)){
   const sampled=(hitSequence++&63)===0,started=sampled?performance.now():0;try{byteView(target).set(out.subarray(within,within+length));Atomics.add(statistics,0,1);Atomics.add(bank.metadata,at+3,1);if(sampled){Atomics.add(statistics,6,Math.min(0x7fffffff,Math.round((performance.now()-started)*1000)));Atomics.add(statistics,7,1);}return original;}finally{Atomics.store(bank.metadata,at,0);}
  }
  Atomics.add(statistics,1,1);const sampled=(missSequence++&63)===0,started=sampled?performance.now():0;
  const finish=()=>{try{byteView(target).set(out.subarray(within,within+length));Atomics.store(bank.metadata,at+1,storeId);Atomics.store(bank.metadata,at+2,page|0);Atomics.add(statistics,2,1);if(sampled){Atomics.add(statistics,4,Math.min(0x7fffffff,Math.round((performance.now()-started)*1000)));Atomics.add(statistics,5,1);}return original;}finally{Atomics.store(bank.metadata,at,0);}};
  const fail=error=>{Atomics.store(bank.metadata,at+1,0);Atomics.store(bank.metadata,at,0);throw error;};
  try{const result=source.readInto(out,page*blockBytes);if(result&&typeof result.then==='function'){const promise=Promise.resolve(result).then(finish,fail);let active=pending.get(bank.id);if(!active){active=new Set();pending.set(bank.id,active);}active.add(promise);promise.then(()=>active.delete(promise),()=>active.delete(promise));return promise;}return finish();}catch(error){return fail(error);}
 }
 return {wrap(storeId,source){return {...source,cacheStoreId:storeId,readInto:(target,offset=0)=>cachedRead(storeId,source,target,offset)};},
  exportConnection(){if(closed)throw new EngineError('DISPOSED','Shared read cache closed.');const channel=new MessageChannel(),child={port:channel.port1,waiting:new Map(),publication:{...describe(),port:channel.port2}};children.add(child);child.port.onmessage=({data})=>{if(data.ack){child.waiting.get(data.ack)?.();child.waiting.delete(data.ack);}if(data.closed)removeChild(child);};child.port.start();let released=false;return {descriptor:child.publication,transfer:[channel.port2],release(){if(released)return;released=true;removeChild(child);}};},
  dispose(){if(disposal)return disposal;closed=true;return disposal=(async()=>{
   // Banks removed from publication can still be owned by an earlier relay
   // retirement. Its real child ACK must precede removing/closing that child.
   await Promise.all([...retirements,retireChildren(banks.map(bank=>bank.id),crypto.randomUUID()),Promise.allSettled([...pending.values()].flatMap(set=>[...set]))]);
   for(const child of children)removeChild(child);for(const bank of banks){bank.data=null;bank.metadata=null;}banks.length=0;pending.clear();statistics=null;port.postMessage({closed:true});port.close();
  })();}};
}
