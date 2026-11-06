// Resolution is an explicit input-domain choice. The fine 7C engine and its
// certification are unchanged inside each independently owned resolution.
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
const check=signal=>{if(signal?.aborted)throw fail('CANCELLED','Proxy 7C operation cancelled.');};
const snapshot=value=>{const copy=structuredClone(value);const freeze=x=>{if(x&&typeof x==='object'){for(const y of Object.values(x))freeze(y);Object.freeze(x);}return x;};return freeze(copy);};
export function canonicalMaxSide(value=512){
 if(value===0||value==='native')return'native';
 if(![256,512,1024,2048].includes(value))throw fail('INVALID_INPUT','maxSide must be256,512,1024,2048,0 or native.');
 return value;
}
export function readRowsForSource(source){
 if(!source?.immutable||!Number.isSafeInteger(source.width)||!Number.isSafeInteger(source.height)||typeof source.sampleAt!=='function')throw fail('INVALID_INPUT','An immutable RGB16 source is required.');
 return{width:source.width,height:source.height,passes:1,async readRows(top,rows,target,{signal}={}){
  check(signal);if(!Number.isSafeInteger(top)||!Number.isSafeInteger(rows)||top<0||rows<1||top>source.height-rows||!(target instanceof Uint16Array)||target.length!==source.width*rows*3)throw fail('INVALID_INPUT','Invalid RGB16 source row range.');
  const first=top*source.width*3;
  if(typeof source.readRgb16Span==='function')source.readRgb16Span(target,first);
  else{const flat=source.data;if(flat instanceof Uint16Array){if(flat.buffer===target.buffer)throw fail('INVALID_INPUT','An independent RGB16 destination is required.');target.set(flat.subarray(first,first+target.length));}else for(let i=0;i<target.length;i++)target[i]=source.sampleAt(first+i);}
  check(signal);
 }};
}

export function createProxyController(options,runtime){
 const {createEngine,createPolicy,createResidentSource,createPngSource,resample}=runtime??{};
 if([createEngine,createPolicy,createResidentSource,resample].some(f=>typeof f!=='function'))throw fail('INVALID_INPUT','Proxy 7C runtime factories are required.');
 const defaultMaxSide=canonicalMaxSide(options.maxSide??512),maxCachedResolutions=options.maxCachedResolutions??5;
 if(!Number.isInteger(maxCachedResolutions)||maxCachedResolutions<1||maxCachedResolutions>5)throw fail('INVALID_INPUT','maxCachedResolutions must be1 through5.');
 const policy=createPolicy(options),budget=policy.budget;
 const {maxSide:ignoredSide,maxCachedResolutions:ignoredCount,...engineOptions}=options;
 const sources=new WeakMap(),cache=new Map(),pending=new Set(),pendingTasks=new Set(),outputs=new Set();let closed=false,busy=false,nextSourceId=1;
 const idle=()=>{if(closed)throw fail('DISPOSED','Proxy 7C engine is closed.');if(busy)throw fail('BUSY','Await the current proxy 7C operation.');};
 const recordFor=source=>{
  let record=sources.get(source);
  if(!record){
   if(!source?.immutable||source.nativeBitDepth!==16||typeof source.retain!=='function'||typeof source.maxAt!=='function'||typeof source.sampleAt!=='function'||!Number.isSafeInteger(source.width)||!Number.isSafeInteger(source.height))throw fail('INVALID_INPUT','A native immutable retained RGB16 source is required.');
   record={id:nextSourceId++,original:source,width:source.width,height:source.height,entries:new Map()};sources.set(source,record);
  }return record;
 };
 const domainKey=(record,maxSide)=>maxSide==='native'||Math.max(record.width,record.height)<=maxSide?'native':maxSide;
 async function retire(entry){
  if(entry.retired)return;if(entry.pins)throw fail('BUSY','A proxy resolution is in use.');entry.retiring=true;
  try{
   if(entry.core){await entry.core.dispose();entry.core=null;}
   if(entry.ownedSource){entry.ownedSource.release();entry.ownedSource=null;}
   if(entry.originalRelease){entry.originalRelease();entry.originalRelease=null;}
   entry.input=null;entry.record.entries.delete(entry.maxSide);entry.record=null;entry.retired=true;cache.delete(entry.key);pending.delete(entry);
  }catch(error){pending.add(entry);throw error;}
 }
 // A compound failure must retain every pre-existing cleanup owner. The
 // retry queue is also private, so a later run/dispose cannot forget the job.
 async function cleanupAfterFailure(error,steps){
  const cleanups=[],previousRetry=error?.retryCleanup;if(typeof previousRetry==='function')cleanups.push(()=>previousRetry.call(error));
  cleanups.push(...steps);
  if(!cleanups.length)return error;
  const retry=async()=>{while(cleanups.length){await cleanups[0]();cleanups.shift();}pendingTasks.delete(retry);};
  pendingTasks.add(retry);
  try{await retry();return error;}
  catch(cleanupError){
   const primary=error&&typeof error==='object'&&Object.isExtensible(error)?error:Object.assign(new AggregateError([error,cleanupError],'Proxy operation and retirement failed.',{cause:error}),{code:error?.code??'CLEANUP_FAILED'});
   const earlier=[primary.cleanupError,...(primary.cleanupErrors??[])].filter(Boolean);
   primary.cleanupError=cleanupError;primary.cleanupErrors=[...new Set([...earlier,cleanupError])];primary.retryCleanup=retry;return primary;
  }
 }
 async function retryPending(){for(const task of [...pendingTasks])await task();for(const entry of [...pending])await retire(entry);}
 function touch(entry){cache.delete(entry.key);cache.set(entry.key,entry);}
 async function trim(){while(cache.size>=maxCachedResolutions){const entry=[...cache.values()].find(x=>!x.pins&&!x.retiring);if(!entry)throw fail('BUSY','Every proxy resolution is in use.');await retire(entry);}}
 async function resolution(record,maxSide,hooks){
  let entry=record.entries.get(maxSide);if(entry&&!entry.retired&&!entry.retiring){touch(entry);return{entry,sourceHit:true};}
  await trim();check(hooks.signal);
  entry={key:record.id+':'+maxSide,record,maxSide,pins:0,retired:false,retiring:false,core:null,input:null,ownedSource:null,originalRelease:record.original.retain(),resampling:null};
  let scaled;
  try{
   entry.core=createEngine({...engineOptions,budget,memoryBudgetBytes:budget.limit,cacheZeroTargets:engineOptions.cacheZeroTargets??true,cacheZeroTargets16:engineOptions.cacheZeroTargets16??true,maxCachedPairs:engineOptions.maxCachedPairs??'budget'});
   if(maxSide==='native'||Math.max(record.original.width,record.original.height)<=maxSide){entry.input=record.original;entry.resampling={method:'identity',reduced:false,upscaled:false,elapsedMs:0};}
   else{
    scaled=await resample(record.original,{maxSide,budget,signal:hooks.signal,onProgress:hooks.onProgress});check(hooks.signal);
    if(!(scaled?.data instanceof Uint16Array)||!Number.isSafeInteger(scaled.width)||!Number.isSafeInteger(scaled.height)||scaled.width<1||scaled.height<1||scaled.data.length!==3*scaled.width*scaled.height||Math.max(scaled.width,scaled.height)>maxSide||scaled.width>record.original.width||scaled.height>record.original.height||typeof scaled.release!=='function')throw fail('INVALID_INPUT','Invalid owned RGB16 proxy returned by the resampler.');
    // Adoption is conservative: the resident source reserves its own backing
    // before the resampler drops its lease. The short overlap is accounted.
    entry.input=entry.ownedSource=await entry.core.createSource({width:scaled.width,height:scaled.height,data:scaled.data,immutable:true},{signal:hooks.signal});
    entry.resampling=snapshot(scaled.metrics??{});scaled.release();scaled=null;
   }
   check(hooks.signal);record.entries.set(maxSide,entry);cache.set(entry.key,entry);return{entry,sourceHit:false};
  }catch(error){
   const cleanups=[];if(scaled)cleanups.push(()=>{scaled.release();scaled=null;});cleanups.push(()=>retire(entry));
   throw await cleanupAfterFailure(error,cleanups);
  }
 }
 function domainMetrics(inner,entry,maxSide,sourceHit){
  const record=entry.record,reduced=entry.input.width!==record.width||entry.input.height!==record.height,native=!reduced;
  const domain={kind:native?'native':'proxy',width:entry.input.width,height:entry.input.height,originalWidth:record.width,originalHeight:record.height,certifiesOriginalNative:native};
  return snapshot({...inner,resolution:native?'native':'proxy',requestedResolution:maxSide==='native'?'native':'proxy',maxSide,originalWidth:record.width,originalHeight:record.height,width:entry.input.width,height:entry.input.height,certificateDomain:domain,
   proxy:{enabled:!native,requested:maxSide!=='native',reduced,upscaled:false,maxSide,sourceIdentity:record.id,originalWidth:record.width,originalHeight:record.height,width:entry.input.width,height:entry.input.height,sourceCacheHit:sourceHit,originalResidentBytes:record.original.byteLength,resampling:entry.resampling,outputResolution:native?'native-domain-rgb16':'reduced-domain-rgb16'}});
 }
 function publish(inner,entry,maxSide,sourceHit){
  const metrics=domainMetrics(inner.metrics??{},entry,maxSide,sourceHit);let released=false,retiring=null;
  const open=()=>{if(released||retiring)throw fail('DISPOSED','Proxy result is closed or retiring.');};
  const result={width:inner.width,height:inner.height,bitDepth:inner.bitDepth??16,storage:inner.storage??'memory',materialized:inner.materialized??false,metrics,
   async readWindow(...args){open();return inner.readWindow(...args);},async pipeRows(...args){open();return inner.pipeRows(...args);},async pipePng(...args){open();return inner.pipePng(...args);},
   release(){
    if(released)return;if(retiring)return retiring;
    const finish=()=>{released=true;outputs.delete(result);inner=null;};
    // Invoke immediately: preserve a synchronous inner owner's contract.
    // A refused release leaves the owner intact for the caller's retry.
    const outcome=inner.release();
    if(outcome&&typeof outcome.then==='function'){retiring=Promise.resolve(outcome).then(finish).finally(()=>{retiring=null;});return retiring;}
    finish();return outcome;
   }
  };outputs.add(result);return result;
 }
 function publishSource(original){recordFor(original);return original;}
 const api={budget,
  get executionModel(){return'unified-native';},
  async createSource(input,opts={}){
   idle();busy=true;let original;
   try{
    check(opts.signal);original=await createResidentSource(input,{...opts,budget,segmentBytes:policy.segmentBytes});check(opts.signal);
    return publishSource(original);
   }catch(error){throw await cleanupAfterFailure(error,original?[()=>{original.release();original=null;}]:[]);}finally{busy=false;}
  },
  async createPngSource(input,opts={}){
   idle();if(typeof createPngSource!=='function')throw fail('INVALID_INPUT','A PNG16 source factory is required.');busy=true;let original;
   try{check(opts.signal);original=await createPngSource(input,{...opts,budget,segmentBytes:policy.segmentBytes});check(opts.signal);return publishSource(original);}
   catch(error){throw await cleanupAfterFailure(error,original?[()=>{original.release();original=null;}]:[]);}finally{busy=false;}
  },
  async run(source,params={},hooks={}){
   idle();const record=recordFor(source),maxSide=canonicalMaxSide(params.maxSide??defaultMaxSide);check(hooks.signal);busy=true;let entry,inner;
   try{
    await retryPending();const prepared=await resolution(record,domainKey(record,maxSide),hooks);entry=prepared.entry;entry.pins++;
    const {maxSide:ignored,...scientific}=params;
    inner=await entry.core.run(entry.input,{...scientific,backend:hooks.backend??scientific.backend??'auto'},hooks);check(hooks.signal);
    const result=publish(inner,entry,maxSide,prepared.sourceHit);inner=null;touch(entry);return result;
   }catch(error){if(inner)throw await cleanupAfterFailure(error,[async()=>{await inner.release();inner=null;}]);throw error;}finally{if(entry)entry.pins--;busy=false;}
  },
  hasCachedSource(source,{maxSide=defaultMaxSide}={}){const record=sources.get(source),entry=record?.entries.get(domainKey(record,canonicalMaxSide(maxSide)));return!!(entry&&!entry.retired&&!entry.retiring);},
  getPreparedSource(source,{maxSide=defaultMaxSide}={}){
   idle();const record=recordFor(source),entry=record.entries.get(domainKey(record,canonicalMaxSide(maxSide)));if(!entry||entry.retiring||entry.retired)throw fail('INVALID_INPUT','This resolution has not been prepared.');
   // Read-only owned inspection lease, useful for comparing the actual proxy
   // with RGB16 output. No mutable data bank or native state is exposed.
   let input=entry.input,release=input.retain(),live=true;
   const open=()=>{if(!live)throw fail('DISPOSED','Prepared-source inspection lease is closed.');};
   return Object.freeze({width:input.width,height:input.height,immutable:true,nativeBitDepth:16,sampleAt(i){open();return input.sampleAt(i);},maxAt(i){open();return input.maxAt(i);},
    readRgb16Span(target,first=0){open();if(typeof input.readRgb16Span==='function')return input.readRgb16Span(target,first);if(!(target instanceof Uint16Array)||!Number.isSafeInteger(first)||first<0||first>3*input.width*input.height-target.length)throw fail('INVALID_INPUT','Invalid prepared RGB16 span.');const flat=input.data;if(flat instanceof Uint16Array){if(flat.buffer===target.buffer)throw fail('INVALID_INPUT','Independent RGB16 destination required.');target.set(flat.subarray(first,first+target.length));}else for(let i=0;i<target.length;i++)target[i]=input.sampleAt(first+i);return target;},
    release(){if(live){release();live=false;input=null;release=null;}}});
  },
  updateResourceHints(hints){idle();return policy.updateResourceHints(hints);},
  memory(){return{closed,busy,defaultMaxSide,maxCachedResolutions,retainedOutputs:outputs.size,pendingRetirements:pending.size+pendingTasks.size,pendingCleanupJobs:pendingTasks.size,budgetBytes:budget.total(),budgetPeak:budget.peak,policy:policy.snapshot?.(),resources:budget.resourceSnapshot?.(),resident:null,bounded:[...cache.values()].at(-1)?.core?.memory?.().bounded??null,resolutions:[...cache.values()].map(e=>({sourceIdentity:e.record.id,maxSide:e.maxSide,width:e.input?.width,height:e.input?.height,pins:e.pins,retiring:e.retiring,engine:e.core?.memory?.()}))};},
  async clearCache(){idle();busy=true;try{await retryPending();for(const entry of [...cache.values()])await retire(entry);}finally{busy=false;}},
  async dispose(){if(busy)throw fail('BUSY','Await cancellation before closing proxy 7C.');closed=true;const errors=[];for(const task of [...pendingTasks])try{await task();}catch(error){errors.push(error);}for(const entry of new Set([...pending,...cache.values()]))try{await retire(entry);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Proxy resolution retirement remains pending.');}
 };return api;
}
