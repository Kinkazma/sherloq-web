import{isSsgStrictPreparedSource}from'./ssg-strict-source.js';
import{allocateTypedArray}from'./allocation.js';
import{requireValue,checkAbort,createCooperator,EngineError}from'./errors.js';
import{WaveletStripPool,appendWaveletCleanup}from'./wavelet-strip-pool.js';
import{ssgNormalizationObservation}from'./ssg-normalization-observer.js';
const MiB=1024**2,thenable=x=>x&&typeof x.then==='function';
const attemptAll=actions=>{let failed=false,primary;const pending=[];const fail=e=>{if(!failed){failed=true;primary=e;}else appendWaveletCleanup(primary,e);};for(const run of actions)try{const answer=run();if(thenable(answer))pending.push(Promise.resolve(answer).catch(fail));}catch(e){fail(e);}const finish=()=>{if(failed)throw primary;};return pending.length?Promise.all(pending).then(finish):finish();};
// Exact same source owner/context identity only. Two tagged internal consumers.
// Fresh writable copies on hit; never expose a cached buffer to either caller.
export async function createSsgPreparedContextReuse(source,{budget,signal,maxBytes=64*MiB}={}){
 requireValue(source&&isSsgStrictPreparedSource(source)&&Object.isFrozen(source)&&Array.isArray(source.contexts)&&source.contexts.every(Object.isFrozen)&&budget?.registerReclaimer&&budget?.registerBacking,'Certified source and actual shared budget required');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)return source;
 const allowed=new WeakSet(source.contexts),entries=new Map(),loans=new Set(),jobs=new Set(),life=new AbortController(),pool=new WaveletStripPool(budget,{workerFactory:null,resourceOwner:'ssg'});
 let closed=false,unregister,disabled=false,bytes=0;const stats={misses:0,hits:0,captured:0,declined:0,evicted:0,cachedBytes:0,peakCachedBytes:0,copyMs:0};
 const available=()=>budget.limit-budget.total();
 const array=(Type,length,owners,label)=>{
  const r={data:null,fee:null,backing:null,pending:null,done:false};owners.add(r);const size=length*Type.BYTES_PER_ELEMENT;r.fee=budget.reserve(size);r.data=allocateTypedArray(Type,length,{label});r.backing=budget.registerBacking('array-buffer',size,{owner:'ssg-prepared-context',label,identity:r.data.buffer});return r;
 };
 const advance=r=>{
  if(r.pending)return r.pending;if(r.done)return;
  const step=(run,accept)=>{const answer=run();if(thenable(answer)){const task=Promise.resolve(answer).then(()=>{accept();r.pending=null;return advance(r);});r.pending=task;void task.finally(()=>{if(r.pending===task)r.pending=null;}).catch(()=>{});return task;}accept();return advance(r);};
  if(r.backing)return step(r.backing,()=>{r.backing=null;r.data=null;});
  if(r.fee)return step(r.fee,()=>{r.fee=null;});r.data=null;r.done=true;
 };
 const retireEntry=e=>{
  if(e.pending)return e.pending;if(e.done)return;if(e.pins)throw new EngineError('BUSY','Prepared context copy still reads its cache');e.retiring=true;
  const finish=()=>{if(e.meta){const answer=e.meta();if(thenable(answer))return Promise.resolve(answer).then(()=>{e.meta=null;return finish();});e.meta=null;}e.done=true;entries.delete(e.context);bytes-=e.bytes;stats.cachedBytes=bytes;stats.evicted++;};
  const result=attemptAll([...e.owners].map(r=>()=>advance(r))),answer=thenable(result)?Promise.resolve(result).then(finish):finish();if(thenable(answer)){const task=Promise.resolve(answer);e.pending=task;void task.finally(()=>{if(e.pending===task)e.pending=null;}).catch(()=>{});return task;}return answer;
 };
 const retireIdle=()=>attemptAll([...entries.values()].filter(e=>!e.pins).map(e=>()=>retireEntry(e)));
 const copy=async(to,from,selected)=>{const a=new Uint8Array(to.buffer,to.byteOffset,to.byteLength),b=new Uint8Array(from.buffer,from.byteOffset,from.byteLength),cooperate=createCooperator(selected);for(let at=0;at<b.length;at+=MiB){checkAbort(selected);a.set(b.subarray(at,Math.min(b.length,at+MiB)),at);await cooperate();}checkAbort(selected);};
 const loan=(value,release)=>{
  let requested=false,done=false,pending,finish;const ack=new Promise(r=>finish=r);const item={get requested(){return requested;},get done(){return done;},ack,published:false,release(){if(done)return pending;if(pending)return pending;requested=true;const task=Promise.resolve().then(release).then(()=>{done=true;loans.delete(item);finish();});pending=task;void task.finally(()=>{if(!done&&pending===task)pending=null;}).catch(()=>{});return task;}};loans.add(item);return{item,value:{...value,release:item.release}};
 };
 const rawClose=async()=>{
  closed=true;life.abort();await Promise.all([...jobs].map(job=>job.catch(()=>{})));
  await attemptAll([...loans].map(l=>()=>l.requested?l.release():l.published?l.ack:l.release()));
  await retireIdle();if(unregister){await unregister();unregister=null;}await source.dispose();
 };
 const parent=pool.ownCleanup(rawClose);
 const wrapper={...source,
  async read(context,options={}){
   checkAbort(options.signal);if(closed)throw new EngineError('DISPOSED','Prepared context source is retiring');
   const selected=AbortSignal.any([signal,options.signal,life.signal].filter(Boolean));checkAbort(selected);let finish;const job=new Promise(r=>finish=r);jobs.add(job);let held,entry,readTrace,cacheCreation=false;
   try{
    // A scientifically valid cache is never returned while its old retirement
    // debt remains. Existing registry owns such a failed entry until ACK.
    await attemptAll([...entries.values()].filter(e=>e.retiring).map(e=>()=>retireEntry(e)));checkAbort(selected);
    const n=context.width*context.height,charge=11*n+4096,headroom=options.nativeHeadroomBytes??0;requireValue(Number.isSafeInteger(headroom)&&headroom>=0,'Native headroom must come from its unchanged planner');
    const reusable=!disabled&&allowed.has(context)&&['wordbank','fields'].includes(options.normalizationConsumer);entry=reusable?entries.get(context):null;
    if(options.normalizationConsumer==='fields'&&entry?.ready){
     if(available()<charge+headroom){await retireIdle();entry=null;}
     else{
      entry.pins++;const owners=new Set();held=loan({},()=>attemptAll([...owners].map(r=>()=>advance(r))));
      readTrace=ssgNormalizationObservation(source)?.begin(context,'fields','prepared-byte-copy');const at=performance.now();
      try{const rgb=array(Uint8Array,n*3,owners,'fresh context RGB8 copy'),gray=array(Float64Array,n,owners,'fresh context f64 copy');await copy(rgb.data,entry.rgb.data,selected);await copy(gray.data,entry.gray.data,selected);checkAbort(selected);held.value={...entry.shape,rgb:rgb.data,gray:gray.data,analysisOrigin:[...entry.shape.analysisOrigin],metadata:structuredClone(entry.shape.metadata),release:held.item.release};}
      finally{entry.pins--;stats.copyMs+=performance.now()-at;}
      await retireEntry(entry);entry=null;checkAbort(selected);stats.hits++;readTrace?.finish({computedComplete:true,failed:false,retirementFailures:0,copyMs:performance.now()-at});readTrace=null;held.item.published=true;return held.value;
     }
    }
    if(entry){await retireEntry(entry);entry=null;}
    stats.misses++;const value=await source.read(context,{...options,signal:selected});held=loan(value,()=>value.release());checkAbort(selected);
    if(reusable&&options.normalizationConsumer==='wordbank'&&charge<=maxBytes&&bytes+charge<=maxBytes&&available()>=charge+headroom){
     cacheCreation=true;entry={context,bytes:charge,meta:null,owners:new Set(),rgb:null,gray:null,pins:1,ready:false,retiring:false,done:false,pending:null};entries.set(context,entry);bytes+=charge;stats.cachedBytes=bytes;stats.peakCachedBytes=Math.max(stats.peakCachedBytes,bytes);
     try{entry.meta=budget.reserve(4096);entry.rgb=array(Uint8Array,n*3,entry.owners,'bounded prepared RGB8');entry.gray=array(Float64Array,n,entry.owners,'bounded prepared gray f64');const at=performance.now();await copy(entry.rgb.data,value.rgb,selected);await copy(entry.gray.data,value.gray,selected);stats.copyMs+=performance.now()-at;entry.shape={...value,rgb:undefined,gray:undefined,release:undefined,analysisOrigin:[...value.analysisOrigin],metadata:structuredClone(value.metadata)};entry.ready=true;cacheCreation=false;stats.captured++;}
     finally{entry.pins--;}
    }else stats.declined++;
    checkAbort(selected);held.item.published=true;return held.value;
   }catch(primary){let acknowledged=true;if(entry&&!entry.pins)try{await retireEntry(entry);}catch(cleanup){acknowledged=false;appendWaveletCleanup(primary,cleanup);}if(cacheCreation&&acknowledged&&['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(primary?.code)&&!selected.aborted){try{await retireIdle();}catch(cleanup){acknowledged=false;appendWaveletCleanup(primary,cleanup);}if(acknowledged){disabled=true;stats.declined++;held.item.published=true;return held.value;}}if(held)try{await held.item.release();}catch(cleanup){appendWaveletCleanup(primary,cleanup);}readTrace?.finish({computedComplete:false,failed:true,retirementFailures:1});throw primary;}
   finally{jobs.delete(job);finish();}
  },
  async prepareNative(requiredBytes){requireValue(Number.isSafeInteger(requiredBytes)&&requiredBytes>=0,'Native planner bytes required');await attemptAll([...entries.values()].filter(e=>e.retiring).map(e=>()=>retireEntry(e)));if(available()<requiredBytes)await retireIdle();},
  reclaimIdleSync(requiredBytes=0){if(available()>=requiredBytes&&![...entries.values()].some(e=>e.retiring))return 0;const before=budget.total(),answer=retireIdle();if(thenable(answer)){void Promise.resolve(answer).catch(()=>{});throw new EngineError('BUSY','Prepared context retirement awaits ACK');}return Math.max(0,before-budget.total());},
  dispose:()=>parent.retire(),
  get preparedContextStats(){return{...stats,closed,disabled,entries:entries.size,loans:loans.size};}
 };
 try{unregister=budget.registerReclaimer(required=>wrapper.reclaimIdleSync(required),{owner:'ssg-prepared-context',label:'idle exact prepared contexts',allocationKind:'array-buffer'});checkAbort(signal);return Object.freeze(wrapper);}catch(primary){try{await parent.retire();}catch(cleanup){appendWaveletCleanup(primary,cleanup);}throw primary;}
}
