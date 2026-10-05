import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort,requireValue} from './errors.js';
import {ResourceRegistry} from './resource-registry.js';
import {createReservationTransaction} from './reservation-transaction.js';
export class Budget {
 constructor(limit) {this.limit=limit;this._retained=0;this._active=0;this._recoveries=0;this.cacheBytes=0;this.peak=0;this.cache=new Map();this.dependencies=new Map();this.reclaimers=new Set();this.asyncReclaimers=new Set();this.reclaimerOptions=new WeakMap();this.lastAllocationReclaim=null;this.resourceProducers=new Set();this.resourceWaiters=new Map();this.unscopedResourceWaiters=new Map();this.resourceListeners=new Set();this.resourceAdmissionListeners=new Set();this.backingReleased=new Map();this.backingReusable=new Map();this.resourceCommits=new Map();this.resourceNotificationPending=false;this.reclaimableRevision=0;this.resources=new ResourceRegistry(this);this.reclaimPending=Promise.resolve();this.listeners=new Set();this.notificationPending=false;}
 // A caller holds this token from an actual allocation refusal through reclaim
 // and useful retry/commit, releasing it in finally on success or cancellation.
 // Nested/concurrent recoveries block optional cache growth until all finish;
 // reads, reclamation, useful allocations and the policy limit are unchanged.
 get recovering(){return this._recoveries>0;}
 beginRecovery(options){
  const pressure=this.resources.beginPressure(options);this._recoveries++;this.changed();let released=false,listener;
  const release=()=>{if(released)return;released=true;if(listener)this.resourceListeners.delete(listener);pressure();this._recoveries--;this.changed();};
  Object.defineProperty(release,'released',{get:()=>released});
  // Recovery serializes growth until the retried operation makes a useful
  // commit, not until a multi-hour parent field finishes. Only descendants of
  // that operation count, and only after the actual retry has been admitted.
  release.resume=()=>{const operation=options?.operation;if(released||listener||!operation)return;const revision=operation.usefulRevision;listener=()=>{if(operation.closed||operation.usefulRevision>revision)release();};this.resourceListeners.add(listener);};
  return release;
 }
 registerBacking(...args){return this.resources.registerBacking(...args);}
 isBackingUnderPressure(kind){return this.resources.underPressure(kind);}
 beginOperation(options){return this.resources.beginOperation(options);}
 resourceSnapshot(options){return {...this.resources.snapshot(options),lastAllocationReclaim:this.lastAllocationReclaim?structuredClone(this.lastAllocationReclaim):null};}
 // Empty reclaimers and zero-sized reservation cleanup are idempotent. A false
 // release notification would wake admission, which calls those reclaimers
 // again, starving worker replies in an infinite microtask loop.
 get retained(){return this._retained;}
 set retained(value){if(value===this._retained)return;this._retained=value;this.changed();}
 get active(){return this._active;}
 set active(value){if(value===this._active)return;this._active=value;this.changed();}
 subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
 // Existing reservations remain owned and valid even above a new admission
 // target. Only future growth is deferred; releases wake admission immediately.
 setLimit(bytes){requireValue(Number.isSafeInteger(bytes)&&bytes>0,'Invalid live memory budget.');if(bytes===this.limit)return;this.limit=bytes;this.reclaimableRevision++;this.changed();this.resourceChanged();}
 changed(){if(this.notificationPending||!this.listeners.size)return;this.notificationPending=true;queueMicrotask(()=>{this.notificationPending=false;for(const listener of this.listeners)listener();});}
 total(){return this.retained+this.active+this.cacheBytes;}
 beginReservationScope(){return createReservationTransaction(this);}
 room(bytes,{onReclaim}={}) {
  if(this.total()+bytes>this.limit)for(const reclaim of this.reclaimers){const before=this.total();reclaim(bytes);onReclaim?.({owner:this.reclaimerOptions.get(reclaim)?.owner??null,label:this.reclaimerOptions.get(reclaim)?.label??reclaim.name??null,kind:this.reclaimerOptions.get(reclaim)?.allocationKind??null,retiredBytes:0,accountedBytes:Math.max(0,before-this.total())});if(this.total()+bytes<=this.limit)break;}
  while(this.total()+bytes>this.limit&&this.cache.size) this.remove(this.cache.keys().next().value);
  if(this.total()+bytes>this.limit) throw new EngineError('MEMORY_LIMIT','Image or task exceeds the memory budget.',{details:{requestedBytes:bytes,availableBytes:Math.max(0,this.limit-this.total()),shortfallBytes:this.total()+bytes-this.limit,budgetBytes:this.limit}});
 }
 registerReclaimer(reclaim,options={}){this.reclaimers.add(reclaim);this.reclaimerOptions.set(reclaim,options);return()=>{this.reclaimers.delete(reclaim);this.reclaimerOptions.delete(reclaim);};}
 registerAsyncReclaimer(reclaim,options={}){requireValue(typeof reclaim==='function','An asynchronous reclaimer is required.');this.asyncReclaimers.add(reclaim);this.reclaimerOptions.set(reclaim,options);this.notifyReclaimable();return()=>{this.asyncReclaimers.delete(reclaim);this.reclaimerOptions.delete(reclaim);};}
 reclaim(bytes,{signal,owner,operation}={}){
  requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Invalid reclaim request.');requireValue(operation===undefined||this.resources.has(operation),'Invalid reclaim operation.');
  const run=async()=>{
   checkAbort(signal);const before=this.total();
   // Synchronous cache/idle-runtime eviction goes first. Asynchronous owners
   // keep their reservation until storage writes and worker acknowledgements
   // finish; a promise is never counted as already-freed memory.
   try{this.room(bytes);}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;}
   for(const reclaim of [...this.asyncReclaimers]){
    if(this.total()+bytes<=this.limit)break;checkAbort(signal);
    await reclaim({bytes,shortfallBytes:Math.max(0,this.total()+bytes-this.limit),signal,owner,operation});
   }
   checkAbort(signal);return Math.max(0,before-this.total());
  };
  const result=this.reclaimPending.then(run,run);this.reclaimPending=result.then(()=>{},()=>{});return result;
 }
 // Allocation refusal is distinct from policy headroom. Release owners in
 // the failing backing domain first; returning an idle Wasm reservation cannot
 // masquerade as making SAB/ArrayBuffer backing eligible for collection.
 reclaimAllocation(bytes,{signal,kind='array-buffer',owner:requestOwner,operation,onReclaim,recoveryAttempt=1}={}){
  requireValue(Number.isSafeInteger(bytes)&&bytes>=0&&['array-buffer','wasm','gpu'].includes(kind),'Invalid backing allocation reclaim request.');requireValue(operation===undefined||this.resources.has(operation),'Invalid allocation reclaim operation.');
  const run=async()=>{
   checkAbort(signal);const report={kind,requestedBytes:bytes,targetedReleasedBytes:0,otherAccountedBytes:0,ownersVisited:0,completed:false,owners:[]};this.lastAllocationReclaim=report;
   const owners=[...[...this.reclaimers].map(reclaim=>({reclaim,synchronous:true,...this.reclaimerOptions.get(reclaim)})),...[...this.asyncReclaimers].map(reclaim=>({reclaim,synchronous:false,...this.reclaimerOptions.get(reclaim)}))].filter(owner=>owner.allocationKind===kind).sort((a,b)=>(b.priority??0)-(a.priority??0)),visited=new Set();
   try{
    for(const owner of owners){
     if(report.targetedReleasedBytes>=bytes&&!owner.discardOnAllocationFailure)continue;checkAbort(signal);visited.add(owner.reclaim);report.ownersVisited++;
     const releasedBefore=this.backingReleased.get(kind)??0,before=this.total();
     const request={bytes,shortfallBytes:Math.max(0,bytes-report.targetedReleasedBytes),signal,owner:requestOwner,operation,reason:'allocation',allocationKind:kind,recoveryAttempt,all:!!owner.discardOnAllocationFailure};
     const returned=owner.synchronous?owner.reclaim(Math.max(0,this.limit-this.total())+request.shortfallBytes,request):await owner.reclaim(request);
     const notified=(this.backingReleased.get(kind)??0)-releasedBefore,freed=owner.synchronous?notified:Number.isSafeInteger(returned)&&returned>0?returned:0;
     report.owners.push({owner:owner.owner??null,label:owner.label??owner.reclaim.name??null,kind,retiredBytes:Number.isSafeInteger(freed)&&freed>0?freed:0,accountedBytes:Math.max(0,before-this.total())});
     if(Number.isSafeInteger(freed)&&freed>0){
      report.targetedReleasedBytes+=freed;
      // Some typed owners notify at retirement; older typed owners only
      // return the retired extent. Never count both as separate releases.
      const alreadyNotified=(this.backingReleased.get(kind)??0)-releasedBefore;
      if(freed>alreadyNotified)this.notifyBackingRelease(kind,freed-alreadyNotified);
     }
    }
    checkAbort(signal);
    if(report.targetedReleasedBytes<bytes){
     const before=this.total(),needed=Math.max(0,bytes-report.targetedReleasedBytes),roomRequest=Math.max(0,this.limit-this.total())+needed;
     try{this.room(roomRequest,{onReclaim:value=>report.owners.push(value)});}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;}
     for(const reclaim of [...this.asyncReclaimers]){if(this.total()+roomRequest<=this.limit)break;if(visited.has(reclaim))continue;checkAbort(signal);const previous=this.total(),metadata=this.reclaimerOptions.get(reclaim)??{};await reclaim({bytes:roomRequest,shortfallBytes:Math.max(0,this.total()+roomRequest-this.limit),signal,owner:requestOwner,operation});report.owners.push({owner:metadata.owner??null,label:metadata.label??reclaim.name??null,kind:metadata.allocationKind??null,retiredBytes:0,accountedBytes:Math.max(0,previous-this.total())});}
     report.otherAccountedBytes=Math.max(0,before-this.total());
    }
    checkAbort(signal);report.completed=true;return report.targetedReleasedBytes;
   }finally{this.lastAllocationReclaim={...report};onReclaim?.({...report});}
  };
  const result=this.reclaimPending.then(run,run);this.reclaimPending=result.then(()=>{},()=>{});return result;
 }
 // Only explicitly admitted independent work is evidence that waiting can
 // help. Session lifetimes may publish phase commits, but are inactive here.
 beginResourceProducer(owner,{active=false,commitOnRelease=true}={}){
  requireValue(typeof owner==='string'&&owner.length>0,'A resource producer owner is required.');
  const producer={owner,active:!!active};this.resourceProducers.add(producer);this.resourceChanged();let closed=false;
  const commit=()=>{this.resourceCommits.set(owner,(this.resourceCommits.get(owner)??0)+1);this.resourceChanged();};
  const release=()=>{if(closed)return;closed=true;this.resourceProducers.delete(producer);if(commitOnRelease)commit();else this.resourceChanged();};
  release.commit=()=>{if(!closed)commit();};release.setActive=value=>{if(closed)return;producer.active=!!value;this.resourceChanged();};return release;
 }
 // This reports references retired after ACK/commit, not completion of browser GC.
 notifyBackingRelease(kind,bytes){requireValue(['array-buffer','wasm','gpu'].includes(kind)&&Number.isSafeInteger(bytes)&&bytes>=0,'Invalid backing release.');if(!bytes)return;this.backingReleased.set(kind,(this.backingReleased.get(kind)??0)+bytes);this.resourceChanged();}
 // Aggregate diagnostic only: an allocator-specific free range is not usable
 // by another arena, and several noncontiguous holes are not one large block.
 notifyReusableBacking(kind,bytes){requireValue(['array-buffer','wasm','gpu'].includes(kind)&&Number.isSafeInteger(bytes)&&bytes>=0,'Invalid reusable backing extent.');if(!bytes)return;this.backingReusable.set(kind,(this.backingReusable.get(kind)??0)+bytes);this.resourceChanged();}
 // A new reclaimable owner, unlike a heartbeat, can make a previous admission actionable.
 notifyReclaimable(){this.reclaimableRevision++;this.resourceChanged();}
 resourceChanged(){if(this.resourceNotificationPending)return;this.resourceNotificationPending=true;queueMicrotask(()=>{this.resourceNotificationPending=false;for(const listener of [...this.resourceListeners,...this.resourceAdmissionListeners])listener();});}
 registerReusableBacking(kind,canReuse){
  requireValue(['array-buffer','wasm','gpu'].includes(kind)&&typeof canReuse==='function','Invalid reusable allocator.');
  this.reusableAllocators??=new Map();const id='allocator:'+crypto.randomUUID(),entry={kind,canReuse,revision:0};this.reusableAllocators.set(id,entry);let closed=false;
  return {id,changed:()=>{if(closed)return;entry.revision++;this.resourceChanged();},release:()=>{if(closed)return;closed=true;this.reusableAllocators.delete(id);this.resourceChanged();}};
 }
 resourceProgressSnapshot(owner,kind,operation,reuseScope){return {...this.resources.progress(owner,kind,operation),...(kind==='policy'?{availableBytes:Math.max(0,this.limit-this.total())}:{}),reuseRevision:this.reusableAllocators?.get(reuseScope)?.revision??0};}
 // A physical recovery continuation must win its domain turn before useful
 // allocation retries. Credit/backing/reuse notifications re-evaluate this
 // wait, but cannot grant all contenders at once: priority lasts until the
 // operation commits or releases its pressure. No polling or capacity probe.
 waitForRecoveryTurn({kind,operation,signal}={}){
  checkAbort(signal);if(!operation||!['array-buffer','wasm','gpu'].includes(kind))return Promise.resolve({reason:'unscoped-recovery'});
  requireValue(this.resources.has(operation),'Invalid recovery continuation.');
  return new Promise((resolve,reject)=>{
   let done=false,waiting=false;const record=this.resources.operations.get(operation.key),previous={state:record.state,resource:record.resource,dependencies:record.dependencies.slice()};
   const finish=(error)=>{if(done)return;done=true;this.resourceListeners.delete(inspect);signal?.removeEventListener('abort',abort);if(waiting&&operation.state==='queued')operation.setState(previous.state,{resource:previous.resource,dependencies:previous.dependencies});error?reject(error):resolve({reason:'recovery-turn'});};
   const abort=()=>finish(new EngineError('CANCELLED','Recovery admission cancelled.'));
   const inspect=()=>{if(signal?.aborted)return abort();if(operation.closed)return finish(new EngineError('CANCELLED','Recovery operation closed.'));const pressure=this.resources.blockingPressure(kind,operation);if(!pressure)return finish();waiting=true;operation.setState('queued',{resource:kind,dependencies:[pressure.operation]});const error=this.resources.dependencyCycleError(operation,kind);if(error)finish(error);};
   this.resourceListeners.add(inspect);signal?.addEventListener('abort',abort,{once:true});inspect();
  });
 }
 // Policy waits observe available credit, not physical backing retirement. A
 // supplied allocator scope may also avoid a new reservation by reusing one
 // actual contiguous range; publication alone is never an opportunity.
 waitForResourceOpportunity({owner,kind,bytes,after,signal,operation,reuseScope,reuseBytes=bytes}={}){
  requireValue(typeof owner==='string'&&owner.length>0&&['array-buffer','wasm','gpu','policy'].includes(kind)&&Number.isSafeInteger(bytes)&&bytes>0,'Invalid resource opportunity request.');checkAbort(signal);
  requireValue(operation===undefined||this.resources.has(operation),'Invalid waiting operation.');requireValue(Number.isSafeInteger(reuseBytes)&&reuseBytes>0,'Invalid reusable allocation extent.');
  const scoped=operation?this.resources.waitingOperations:this.unscopedResourceWaiters,key=operation?.key??owner;scoped.set(key,(scoped.get(key)??0)+1);
  after??=this.resourceProgressSnapshot(owner,kind,operation,reuseScope);this.resourceWaiters.set(owner,(this.resourceWaiters.get(owner)??0)+1);this.resourceChanged();
  return new Promise((resolve,reject)=>{
   let done=false,unsubscribeBudget;
   const finish=(error,reason)=>{if(done)return;done=true;this.resourceListeners.delete(inspect);unsubscribeBudget?.();signal?.removeEventListener('abort',abort);const count=this.resourceWaiters.get(owner)-1;if(count)this.resourceWaiters.set(owner,count);else this.resourceWaiters.delete(owner);const scopedCount=scoped.get(key)-1;if(scopedCount)scoped.set(key,scopedCount);else scoped.delete(key);this.resourceChanged();error?reject(error):resolve({reason,...this.resourceProgressSnapshot(owner,kind,operation,reuseScope)});};
   const abort=()=>finish(new EngineError('CANCELLED','Resource opportunity wait cancelled.'));
   const inspect=()=>{if(signal?.aborted)return abort();const now=this.resourceProgressSnapshot(owner,kind,operation,reuseScope);if(kind==='policy'){if(now.availableBytes>=bytes)return finish(null,'admission-credit');}else if(now.releasedBytes-after.releasedBytes>=bytes)return finish(null,'backing-released');const allocator=this.reusableAllocators?.get(reuseScope);if(allocator&&(allocator.kind===kind||kind==='policy')&&allocator.revision>(after.reuseRevision??0)&&allocator.canReuse(reuseBytes))return finish(null,'backing-reusable');if(!now.independentProducers)return finish(null,'no-independent-producer');};
   this.resourceListeners.add(inspect);if(kind==='policy')unsubscribeBudget=this.subscribe(inspect);signal?.addEventListener('abort',abort,{once:true});inspect();
  });
 }
 reserve(bytes) {
  this.room(bytes);this.active+=bytes;this.peak=Math.max(this.peak,this.total());
  const owned=initial=>{
   let remaining=initial,closed=false;
   const release=()=>{if(closed)return;closed=true;this.active-=remaining;remaining=0;};
   // Transfer ownership without an unaccounted gap or a duplicate reservation.
   // Callers release a transferred share only after its actual owner is freed.
   release.split=size=>{requireValue(!closed&&Number.isSafeInteger(size)&&size>=0&&size<=remaining,'Invalid reservation split.');remaining-=size;return owned(size);};
   Object.defineProperty(release,'bytes',{get:()=>remaining});return release;
  };
  return owned(bytes);
 }
 retain(bytes){this.room(bytes);this.retained+=bytes;this.peak=Math.max(this.peak,this.total());}
 // take moves an owned entry without retiring its backing. Eviction callbacks
 // are synchronous ownership releases, never asynchronous work counted early.
 take(key){const v=this.cache.get(key);if(v){this.cacheBytes-=v.byteLength;this.cache.delete(key);this.dependencies.delete(key);this.changed();}return v;}
 remove(key){const v=this.take(key);v?.onEvict?.();}
 get(key){const v=this.cache.get(key);if(v){this.cache.delete(key);this.cache.set(key,v);}return v;}
 put(key,value,dependencies=[]){if(this.cache.get(key)===value){this.get(key);return true;}let accepted=false;try{this.remove(key);if(value.byteLength+this.retained+this.active>this.limit)return false;this.room(value.byteLength);this.cache.set(key,value);if(dependencies.length)this.dependencies.set(key,dependencies.slice());this.cacheBytes+=value.byteLength;this.peak=Math.max(this.peak,this.total());accepted=true;return true;}finally{if(!accepted)value.onEvict?.();}}
 clearPrefix(prefix){for(const key of this.cache.keys()) if(key.startsWith(prefix))this.remove(key);}
 clearDependencies(id){for(const [key,ids] of this.dependencies)if(ids.includes(id))this.remove(key);}
 clear(){let failure;for(const key of [...this.cache.keys()])try{this.remove(key);}catch(error){failure??=error;}this.dependencies.clear();this.cacheBytes=0;this.retained=0;if(failure)throw failure;}
 snapshot(){return {budgetBytes:this.limit,policyAvailableBytes:Math.max(0,this.limit-this.total()),retainedBytes:this.retained,cacheBytes:this.cacheBytes,activeReservationBytes:this.active,peakAccountedBytes:this.peak,activeRecoveries:this._recoveries,...(this.lastAllocationReclaim?{allocationRequestedBytes:this.lastAllocationReclaim.requestedBytes,allocationTargetedReleasedBytes:this.lastAllocationReclaim.targetedReleasedBytes,allocationOtherAccountedBytes:this.lastAllocationReclaim.otherAccountedBytes}:{})};}
}
