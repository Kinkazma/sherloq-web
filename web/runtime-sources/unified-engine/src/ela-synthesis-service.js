import "../../runtime-context.js?v=0.31.0";
import {resolveElaSynthesisAxis,ELA_SYNTHESIS_RECIPE} from './ela-synthesis-axis.js';
import {createElaSynthesisAccumulator} from './ela-synthesis-accumulator.js';
import {createElaSynthesisCache,elaSynthesisCacheKey} from './ela-synthesis-cache.js';
import {elaSynthesisPresentation} from './ela-synthesis-presentation.js';
import {prepareSourceRegionDomain} from './source-region-dispatch.js';
import {sourceRegionDomainShape} from './source-region-capabilities.js';
import {createSourceRegionView} from './source-region-view.js';
import {contiguousSurface} from './image-sources.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {migrationWorkspaceBytes,missingMigrationWorkspaceBytes} from './migration-workspace.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

const stable=value=>value===undefined||value===null?'null':Array.isArray(value)?'['+value.map(stable).join(',')+']':typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}':JSON.stringify(value);
const same=(a,b)=>stable(a)===stable(b);
function readerCleanupFailure(primary,cleanup,owner){if(primary&&typeof primary==='object'&&Object.isExtensible(primary)){primary.synthesisReaderCleanupError=cleanup;primary.cleanupOwner=owner;return primary;}const error=new AggregateError([primary,cleanup],'Synthesis reader retirement was not acknowledged.',{cause:primary});error.primary=primary;error.cleanupErrors=[cleanup];error.cleanupOwner=owner;error.code='CLEANUP_FAILED';return error;}
export function createElaSynthesisService({budget,getImage,getSurface,publish,onTemporarySession,nativeHeadroomFor=()=>budget.limit,nativeHeadroomPlanFor,beforeAccumulator,cache=createElaSynthesisCache({budget}),createAccumulator=createElaSynthesisAccumulator}={}){
 const jobs=new Map(),volatile=new Map(),volatileOwners=new Set(),verified=new Map(),pendingReaders=new Set();let closed=false;
 async function closePendingReader(reader){const ack=await reader.close();if(ack===false||ack===0)throw new EngineError('BUSY','Synthesis reader retirement was not acknowledged.');pendingReaders.delete(reader);}
 async function retirePendingReaders(){for(const reader of [...pendingReaders])await closePendingReader(reader);}
 const pendingReaderOwner={dispose:retirePendingReaders};
 const alive=()=>{if(closed)throw new EngineError('DISPOSED','Synthesis service is closed.');};
 async function preparation({imageId,params={},sourceRegionDomain},{signal}={}){
  alive();checkAbort(signal);await retirePendingReaders();checkAbort(signal);const original=getImage(imageId),surface=original.surface,descriptor=surface.descriptor,sha256=original.sha256,revision=descriptor.revision;
  const domain=sourceRegionDomain?await prepareSourceRegionDomain(original,sourceRegionDomain,{signal}):null,axis=await resolveElaSynthesisAxis(original,params,{signal});
  checkAbort(signal);if(getImage(imageId)!==original||original.surface!==surface||original.sha256!==sha256||surface.descriptor!==descriptor||descriptor.revision!==revision)throw new EngineError('STALE_RESULT','The synthesis Original changed during metadata preparation.');
  return{imageId,params,sourceRegionDomain,original,domain,axis,grid:domain??descriptor};
 }
 function nativeHeadroom(prepared){const{imageId,sourceRegionDomain,original,domain,axis}=prepared;return Math.max(...axis.states.map(state=>nativeHeadroomFor({imageId,operation:'ela.classic',params:state.params,sourceRegionDomain},{original,domain,sourceRegionDomain})));}
 const jobFor=id=>{alive();const job=jobs.get(id);if(!job)throw new EngineError('NOT_FOUND','Synthesis owner no longer exists.');requireValue(getImage(job.imageId)===job.original,'The synthesis Original owner changed.');return job;};
 async function releaseFrame(job){if(!job?.frameOwner)return;await job.frameOwner.dispose();job.frameOwner=null;}
 async function releaseNativeResources(job){await retireCompositeOwners([...(job.nativeResources??[])].map(([key,owner])=>async()=>{await owner.dispose();job.nativeResources.delete(key);}));}
 async function retire(job){await retireCompositeOwners([()=>releaseFrame(job),()=>releaseNativeResources(job),()=>job.accumulator?.dispose(),()=>job.reader?.close()]);jobs.delete(job.id);}
 // The public lease owns a logical reader, not the optional native tier.
 // Retire native bytes only between reads; never wait for an active read from
 // a Budget reclaimer (the read itself may need that Budget to make progress).
 async function retireNativeBase(entry){
  if(!entry.base||entry.activeNativeReads)return 0;if(entry.nativeRetirement)return entry.nativeRetirement;
  entry.nativeRetiring=true;const before=budget.total(),base=entry.base,task=Promise.resolve().then(async()=>{
   const ack=await base.surface.dispose();if(ack===false||ack===0)throw new EngineError('BUSY','Native synthesis base retirement was not acknowledged.');
   entry.base=null;return Math.max(0,before-budget.total());
  });entry.nativeRetirement=task;void task.catch(()=>{if(entry.nativeRetirement===task)entry.nativeRetirement=null;});return task;
 }
 async function retireVolatile(entry){if(entry.closed||entry.refs)return 0;if(entry.retirement)return entry.retirement;entry.retiring=true;const before=budget.total(),task=Promise.resolve().then(async()=>{
  await retireNativeBase(entry);if(entry.base)throw new EngineError('BUSY','A native synthesis read is still active.');
  if(entry.archive){const ack=await entry.archive.close();if(ack===false||ack===0)throw new EngineError('BUSY','Verified synthesis archive lease retirement was not acknowledged.');entry.archive=null;}
  entry.closed=true;volatileOwners.delete(entry);if(volatile.get(entry.key.key)===entry)volatile.delete(entry.key.key);return Math.max(0,before-budget.total());
 });entry.retirement=task;void task.catch(()=>{if(entry.retirement===task)entry.retirement=null;});return task;}
 const reclaimVolatile=entry=>entry.refs?(entry.archive?retireNativeBase(entry):Promise.resolve(0)):retireVolatile(entry);
 async function readVolatile(entry,target,offset){
  if(entry.base&&!entry.nativeRetiring){const base=entry.base;entry.activeNativeReads=(entry.activeNativeReads??0)+1;try{return await base.readInto(target,offset);}finally{entry.activeNativeReads--;if(!entry.activeNativeReads)budget.notifyReclaimable?.();}}
  requireValue(entry.archive,'The native synthesis base is retiring.');return entry.archive.readInto(target,offset);
 }
 async function retireVerified(entry){if(entry.refs)return 0;if(entry.retirement)return entry.retirement;entry.retiring=true;const before=budget.total(),task=Promise.resolve().then(()=>entry.reader.close()).then(()=>{if(verified.get(entry.key)===entry)verified.delete(entry.key);entry.closed=true;return Math.max(0,before-budget.total());});entry.retirement=task;void task.catch(()=>{entry.retiring=false;entry.retirement=null;});return task;}
 const unregister=budget.registerAsyncReclaimer?.(async({all=false,shortfallBytes=0}={})=>{let freed=0;for(const entry of [...volatileOwners]){freed+=await reclaimVolatile(entry);if(!all&&freed>=shortfallBytes)break;}for(const entry of [...verified.values()]){if(!all&&freed>=shortfallBytes)break;if(!entry.refs)freed+=await retireVerified(entry);}return freed;},{allocationKind:'array-buffer',owner:'ela-synthesis',label:'idle-native-synthesis-base'});
 function readerLease(entry,descriptor,read){requireValue(!entry.closed&&!entry.retiring,'Synthesis reader is retiring.');entry.refs++;let closing=null;const pending=new Set();return{...descriptor,readInto(target,offset){if(closing||entry.closed)throw new EngineError('DISPOSED','Synthesis reader is closed.');const task=Promise.resolve().then(()=>read(target,offset));pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task;},adopt(){requireValue(!closing&&!entry.closed,'Synthesis reader is closed.');},close(){if(closing)return closing;return closing=(async()=>{await Promise.allSettled([...pending]);entry.refs--;if(entry.refs===0)budget.notifyReclaimable?.();})();}};}
 function volatileReader(entry){requireValue(!entry.closed&&!entry.retiring,'Native synthesis base was retired.');const lease=readerLease(entry,{meta:entry.meta,manifest:entry.manifest??{persistent:false,backend:'native-segmented'},byteLength:entry.meta.width*entry.meta.height*3},(target,offset)=>readVolatile(entry,target,offset));
  if(entry.nativeMedianCache)Object.defineProperty(lease,'nativeMedianCache',{enumerable:true,get:()=>Object.freeze({...entry.nativeMedianCache,readTier:entry.base&&!entry.nativeRetiring?'native':'archive',nativeResidentBytes:entry.base?entry.meta.width*entry.meta.height*3:0,nativeRetiring:!!entry.nativeRetiring,activeNativeReads:entry.activeNativeReads??0})});return lease;
 }
 function verifiedReader(entry){return readerLease(entry,{meta:entry.reader.meta,manifest:entry.reader.manifest,byteLength:entry.reader.byteLength},(target,offset)=>entry.reader.readInto(target,offset));}
 async function readerFor(key,options={}){checkAbort(options.signal);if(options.isCurrent&&options.isCurrent()!==true)throw new EngineError('STALE_RESULT','The synthesis owner changed.');const entry=options.forceArchive?null:[...volatileOwners].reverse().find(value=>value.key.key===key.key&&value.key.canonical===key.canonical&&!value.closed&&!value.retiring&&value.original===options.original);if(entry)return volatileReader(entry);let known=verified.get(key.key);if(known?.retiring){await known.retirement;known=null;}if(known&&!known.closed)return verifiedReader(known);
  const reader=await cache.reader({key,...options});if(!reader)return null;pendingReaders.add(reader);try{await reader.adopt?.();checkAbort(options.signal);known={key:key.key,reader,refs:0,closed:false,retiring:false};const lease=verifiedReader(known);verified.set(key.key,known);pendingReaders.delete(reader);return lease;}catch(error){try{await closePendingReader(reader);}catch(cleanup){throw readerCleanupFailure(error,cleanup,pendingReaderOwner);}throw error;}
 }
 async function retainNativeFallback(key,meta,base,original,{onOwned}={}){const old=[...volatileOwners].reverse().find(value=>value.key.key===key.key&&value.key.canonical===key.canonical&&!value.closed&&!value.retiring&&value.original===original),entry={key:Object.freeze({key:key.key,canonical:key.canonical}),meta,base,original,refs:0,closed:false,retiring:!!old,retirement:null};
  // A duplicate is still an owned final image. Register it before retirement
  // or any await; a NACK must retain both its handle and existing credit.
  volatileOwners.add(entry);if(!old)volatile.set(entry.key.key,entry);onOwned?.();budget.notifyReclaimable?.();
  if(!old)return volatileReader(entry);const retained=volatileReader(old);try{await retireVolatile(entry);return retained;}catch(error){await retained.close();throw error;}
 }
 // Keep a real, adopted archive lease behind the public logical reader.
 // Only an in-memory median backed by a persistent non-memory archive earns
 // an optional hot tier. Other cases retire that existing base with ACK and
 // use the archive directly, avoiding duplicate RAM or an extra I/O layer.
 async function retainCommittedNativeBase(key,validated,base,original,{onNativeOwned,onArchiveOwned}={}){
  const d=base?.surface?.descriptor,meta=validated?.meta,manifest=validated?.manifest;
  requireValue(d?.format==='rgb8'&&d.width===meta?.width&&d.height===meta?.height&&validated.byteLength===d.width*d.height*3&&typeof base.readInto==='function'&&manifest&&typeof manifest.persistent==='boolean'&&typeof manifest.backend==='string','A verified committed reader matching the existing native median is required.');
  const optional=manifest.persistent===true&&manifest.backend!=='memory'&&d.storage==='memory',entry={key:Object.freeze({key:key.key,canonical:key.canonical}),meta,manifest,base,archive:optional?validated:null,original,refs:0,closed:false,retiring:!optional,retirement:null,activeNativeReads:0,nativeRetiring:false,nativeRetirement:null,
   ...(optional?{nativeMedianCache:Object.freeze({schema:'sherloq.native-median-cache/1',reusedExistingMedian:true,copiedRgbBytes:0,storage:d.storage,verifiedArchiveBackend:manifest.backend})}:{})};
  // Register before callbacks or awaits: a NACK always retains an owner and
  // its original credit, including a base which will not become a hot tier.
  volatileOwners.add(entry);if(optional)volatile.set(entry.key.key,entry);onNativeOwned?.();if(optional)onArchiveOwned?.();budget.notifyReclaimable?.();
  if(!optional){await retireVolatile(entry);return validated;}return volatileReader(entry);
 }
 async function identity(original,params,domain,axis,signal){
  const d=original.surface.descriptor,sourceContexts=[];let view;const fees=[];
  try{
   if(domain){view=await createSourceRegionView({...original.surface,sha256:original.sha256},domain.descriptor,{budget,signal});for(const rect of view.admittedRectangles()){checkAbort(signal);fees.push(budget.reserve(256));sourceContexts.push({...rect,x:rect.x+domain.origin[0],y:rect.y+domain.origin[1]});}}
   else sourceContexts.push({x:0,y:0,width:d.width,height:d.height});
   const whole=domain&&domain.origin[0]===0&&domain.origin[1]===0&&domain.width===d.width&&domain.height===d.height&&domain.countIncluded===d.width*d.height,semanticDomain=domain&&!whole?{schema:'sherloq.ela-synthesis-domain/1',origin:[...domain.origin],width:domain.width,height:domain.height,sourceWidth:domain.sourceWidth,sourceHeight:domain.sourceHeight,countIncluded:domain.countIncluded}:null;
   return await elaSynthesisCacheKey({sourceSha256:original.sha256,width:d.width,height:d.height,decode:original.provenance??{},domain:semanticDomain,sourceContexts,recipe:ELA_SYNTHESIS_RECIPE,codecOptions:{codec:axis.codec,lossless:axis.states[0].plan.stage.lossless},axis:axis.states.map(({value,plan})=>{const {requestedQuality,...stage}=plan.stage;return{value,stage};})},{budget,signal});
  }finally{await view?.dispose();for(const fee of fees)fee();}
 }
 async function publication(job,id,reader,presentation,cacheHit,metrics={},current=()=>{}){
  current();await reader.adopt?.();current();const contains=job.domain&&sourceRegionDomainShape(job.domain)!=='identity'?(x,y)=>job.domain.contains(x,y):undefined,record=elaSynthesisPresentation(reader,{budget,presentation,contains});let surface;try{surface=publish(job.imageId,record);}catch(error){await record.surface.dispose();throw error;}const persisted=reader.manifest?.persistent===true;return{id,imageId:job.imageId,operation:'ela.classic',status:'ok',layout:'surface',surface,layers:[{id:'ela-synthesis',kind:'rgb',surfaceId:surface.id,origin:[0,0],range:[0,255]}],...(job.domain?{sourceRegionDomain:job.domain.descriptor,sourceRegionOrigin:[...job.domain.origin]}:{}),synthesis:{key:job.key,axis:job.axis,recipe:ELA_SYNTHESIS_RECIPE,cacheHit,persisted,storageBackend:reader.manifest?.backend??'unknown'},provenance:{operation:'ela.classic',originalSha256:job.original.sha256,decode:structuredClone(job.original.provenance),params:{quality:null,...ELA_SYNTHESIS_RECIPE.ela,equalization:structuredClone(job.axis.states[0].params.equalization)},synthesis:{recipe:ELA_SYNTHESIS_RECIPE,axis:job.axis,cacheKey:job.key.key},backend:'native-per-frame',semantics:'Channel-wise median of independently recompressed Original ELA RGB8 frames after each frame’s global Histogram100 HSV-V mapping.'},metrics:{...metrics,...record.metrics,...(reader.nativeMedianCache?{nativeMedianCache:reader.nativeMedianCache}:{}),cache:{synthesis:cacheHit,persisted},synthesisFrames:job.axis.count,nativeAnalysisRequests:cacheHit?0:job.axis.count,memory:budget.snapshot()}};
 }
 async function opened({imageId,key,sourceRegionDomain},{signal}={}){
  alive();checkAbort(signal);const original=getImage(imageId),reader=await readerFor(key,{signal,original});requireValue(reader,'The synthesis cache entry is unavailable.');let success=false;
  try{const parsed=JSON.parse(key.canonical);requireValue(parsed.sourceSha256===original.sha256&&parsed.width===original.surface.descriptor.width&&parsed.height===original.surface.descriptor.height&&same(parsed.decode,original.provenance??{})&&same(parsed.recipe,ELA_SYNTHESIS_RECIPE),'The cached synthesis belongs to another Original or decoding recipe.');
   const axis=reader.meta.synthesisAxis;requireValue(axis?.states?.length===parsed.axis.length,'Cached synthesis axis metadata is incomplete.');const descriptor=sourceRegionDomain===undefined?reader.meta.sourceRegionDomain:sourceRegionDomain,domain=descriptor?await prepareSourceRegionDomain(original,descriptor,{signal}):null,actual=await identity(original,{},domain,axis,signal);requireValue(actual.key===key.key&&actual.canonical===key.canonical,'The synthesis source membership or native context order changed.');checkAbort(signal);success=true;return{imageId,original,key,axis,domain,reader};
  }finally{if(!success)await reader.close();}
 }
 // One request owns one validated reader/domain through aliasing and publish.
 // This is a transaction lease, not a second cache or a retained pixel copy.
 async function openView(request,hooks={}){
  const key=Object.freeze({key:request.key?.key,canonical:request.key?.canonical}),base=await opened({...request,key},hooks);
  try{
  const surface=base.original.surface,descriptor=surface.descriptor,identity={sha256:base.original.sha256,id:descriptor.id,revision:descriptor.revision,width:descriptor.width,height:descriptor.height,decode:stable(base.original.provenance??{}),axis:stable(base.axis)};let reader=base.reader,publishing,transferred=false,closing=false,retiring;
  const current=()=>{alive();checkAbort(hooks.signal);if(closing)throw new EngineError('CANCELLED','The synthesis view was retired.');const original=getImage(base.imageId),d=original.surface?.descriptor;requireValue(original===base.original&&original.surface===surface&&original.sha256===identity.sha256&&d?.id===identity.id&&d.revision===identity.revision&&d.width===identity.width&&d.height===identity.height&&stable(original.provenance??{})===identity.decode&&stable(base.axis)===identity.axis,'The validated synthesis Original or axis owner changed.');};
  return{
   context:Object.freeze({imageId:base.imageId,original:base.original,domain:base.domain}),
   render({id,presentation={}}={}){requireValue(!closing&&!publishing&&!transferred,'The synthesis view lease is no longer publishable.');publishing=(async()=>{current();const answer=await publication(base,id??'ela-synthesis-view-'+crypto.randomUUID(),reader,presentation,true,{},current);transferred=true;reader=null;return answer;})();return publishing;},
   close(){closing=true;if(retiring)return retiring;return retiring=(async()=>{if(publishing)await Promise.allSettled([publishing]);if(!transferred&&reader){await reader.close();reader=null;}})();}
  };
  }catch(error){await retireCompositeOwners([()=>base.reader.close()],{primary:error});throw error;}
 }
 return{
  context(id){const job=jobFor(id);return{imageId:job.imageId,original:job.original,domain:job.domain};},
  frame({id,index,owner}){const job=jobFor(id),state=job.axis.states[index];requireValue(job.accumulator&&!job.reader&&!job.frameOwner&&Number.isSafeInteger(index)&&index===job.accumulator.appended&&state&&owner?.active===true&&owner.original===job.original&&owner.index===index,'A live ordered synthesis frame is required.');job.frameOwner=owner;owner.nativeResources=job.nativeResources??=new Map();return{imageId:job.imageId,original:job.original,domain:job.domain,params:structuredClone(state.params)};},
  releaseFrame({id}){return releaseFrame(jobs.get(id));},
  openView,
  async describe(request,hooks={}){const view=await openView(request,hooks);try{return view.context;}finally{await view.close();}},
  async axis({imageId,params={}},hooks={}){alive();return resolveElaSynthesisAxis(getImage(imageId),params,hooks);},
  async budgetPlan(request,hooks={},context={}){
   const prepared=await preparation(request,hooks),{imageId,original,domain,axis,grid}=prepared,frameBytes=grid.width*grid.height*3,coldMatrixBytes=frameBytes*axis.count,computeReservationBytes=context.computeReservationBytes??0;
   requireValue([frameBytes,coldMatrixBytes,computeReservationBytes].every(value=>Number.isSafeInteger(value)&&value>=0),'Safe synthesis workspace sizes are required.');
   const surface=original.surface,descriptor=surface.descriptor,sourceIdentity={sha256:original.sha256,id:descriptor.id,revision:descriptor.revision,width:descriptor.width,height:descriptor.height},current=()=>!closed&&getImage(imageId)===original&&original.surface===surface&&original.sha256===sourceIdentity.sha256&&surface.descriptor.id===sourceIdentity.id&&surface.descriptor.revision===sourceIdentity.revision&&surface.descriptor.width===sourceIdentity.width&&surface.descriptor.height===sourceIdentity.height,key=await identity(original,prepared.params,domain,axis,hooks.signal);let reader,cacheFailure,failed=false,primary;
   try{
    try{reader=await readerFor(key,{signal:hooks.signal,isCurrent:current,original});}catch(error){checkAbort(hooks.signal);if(['CANCELLED','STALE_RESULT'].includes(error?.code)||pendingReaders.size)throw error;cacheFailure={code:error?.code??error?.name??'CACHE_UNAVAILABLE',message:error?.message};}
    if(reader)pendingReaders.add(reader);checkAbort(hooks.signal);if(!current())throw new EngineError('STALE_RESULT','The synthesis Original changed during cache validation.');
    const matrixBytes=reader?0:coldMatrixBytes;
   const headrooms=!reader&&nativeHeadroomPlanFor?axis.states.map(state=>nativeHeadroomPlanFor({imageId,operation:'ela.classic',params:state.params,sourceRegionDomain:prepared.sourceRegionDomain},{original,domain,sourceRegionDomain:prepared.sourceRegionDomain})):null,nativeHeadroomBytes=reader?0:headrooms?Math.max(...headrooms.map(value=>value.computeBytes)):nativeHeadroom(prepared);requireValue(Number.isSafeInteger(nativeHeadroomBytes)&&nativeHeadroomBytes>=0,'A complete native synthesis headroom is required.');
   const known=reader?true:headrooms?headrooms.every(value=>value.known===true&&Number.isSafeInteger(value.bytes)&&value.bytes>=0):nativeHeadroomBytes!==budget.limit,nativeHeadroomUnclippedBytes=known?(headrooms?Math.max(...headrooms.map(value=>value.bytes)):nativeHeadroomBytes):null;
   // Same bank/migration gate as the maintained accumulator. A verified median
   // reader is reused by begin; no session, raw frame store or job is created.
   const bankBytes=reader?0:Math.min(4*1024**2,matrixBytes),migrationBytes=reader?0:original.session?.backend!=='opfs'?migrationWorkspaceBytes(matrixBytes,original.session):0,migrationBytesMissing=missingMigrationWorkspaceBytes(budget,migrationBytes),occupiedBytes=budget.total(),budgetBytes=budget.limit;
   const reductionMaximumWorkingBytes=reader?0:Math.min(16*1024**2,Math.floor(budgetBytes/8)),maximumReductionWorkingBytes=reader?0:16*1024**2,nativePhaseBytes=occupiedBytes+computeReservationBytes+matrixBytes+bankBytes+migrationBytesMissing+(nativeHeadroomUnclippedBytes??nativeHeadroomBytes),reductionPhaseBytes=reader?0:occupiedBytes+computeReservationBytes+matrixBytes+bankBytes+migrationBytesMissing+frameBytes+maximumReductionWorkingBytes;
   const requiredBytes=Math.max(nativePhaseBytes,reductionPhaseBytes);requireValue(Number.isSafeInteger(requiredBytes),'Safe complete synthesis workspace is required.');
   const backingPressure=budget.isBackingUnderPressure?.('array-buffer')===true,binding={imageId,sourceSha256:original.sha256,sourceSurface:{id:original.surface.descriptor.id??null,revision:original.surface.descriptor.revision??null,width:original.surface.descriptor.width,height:original.surface.descriptor.height},domainFingerprint:domain?.fingerprint??null,domainShape:domain?sourceRegionDomainShape(domain):'identity',sourceLayout:original.segmented?'segmented':original.pixels?'contiguous':'surface',codec:axis.codec,axisStages:axis.states.map(state=>{const{requestedQuality,...stage}=state.plan.stage;return stage;}),profile:context.profile?structuredClone(context.profile):null,cpuKernel:context.cpuKernel??null};
   return{schema:'sherloq.ela-synthesis-budget-plan/1',binding,width:grid.width,height:grid.height,count:axis.count,frameBytes,matrixBytes,coldMatrixBytes,budgetBytes,occupiedBytes,computeReservationBytes,bankBytes,migrationWorkspaceBytes:migrationBytes,migrationBytesMissing,nativeHeadroomBytes,nativeHeadroomUnclippedBytes,reductionMaximumWorkingBytes,maximumReductionWorkingBytes,nativePhaseBytes,reductionPhaseBytes,known,reason:reader?'verified-native-median-cache':known?'complete-native-live-set':'native-headroom-unqualified',nativeWorkspaceBytes:known?requiredBytes:null,ramAdmittedNow:known&&!backingPressure&&nativePhaseBytes<=budgetBytes,backingPressure,cacheLookupPerformed:true,cacheHit:!!reader,frameBankRequired:!reader,...(cacheFailure?{cacheFailure}:{}),admissionOnly:true};
   }catch(error){failed=true;primary=error;throw error;}finally{if(reader)try{await closePendingReader(reader);}catch(cleanup){throw readerCleanupFailure(failed?primary:undefined,cleanup,pendingReaderOwner);}}
  },
  async begin({imageId,params={},sourceRegionDomain},{signal}={}){
   const prepared=await preparation({imageId,params,sourceRegionDomain},{signal}),{original,domain,axis,grid:d}=prepared,key=await identity(original,params,domain,axis,signal);
   const current=()=>!closed&&getImage(imageId)===original;let reader,accumulator,cacheFailure=null;
   try{try{reader=await readerFor(key,{signal,isCurrent:current,original});}catch(error){checkAbort(signal);if(['CANCELLED','STALE_RESULT'].includes(error?.code)||pendingReaders.size)throw error;cacheFailure={code:error?.code??error?.name??'CACHE_UNAVAILABLE',message:error?.message};}checkAbort(signal);if(!reader){await beforeAccumulator?.({imageId,key,axis,domain},{signal});checkAbort(signal);accumulator=await createAccumulator({width:d.width,height:d.height,count:axis.count,budget,nativeHeadroomBytes:nativeHeadroom(prepared),temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,onTemporarySession},{signal});}
    checkAbort(signal);const id=crypto.randomUUID(),job={id,imageId,original,domain,axis,key,reader,accumulator,cacheFailure,backends:{},frameMetrics:[]};jobs.set(id,job);return{id,imageId,sourceSha256:original.sha256,width:d.width,height:d.height,axis,key,cacheHit:!!reader,persisted:reader?.manifest?.persistent===true,...(cacheFailure?{cacheFailure}:{}),...(domain?{sourceRegionDomain:domain.descriptor}:{})};
   }catch(error){await retireCompositeOwners([()=>reader?.close(),()=>accumulator?.dispose()],{primary:error});throw error;}
  },
  async append({id,result},{signal,onProgress}={}){
   const job=jobFor(id),index=job.accumulator?.appended,state=job.axis.states[index];checkAbort(signal);requireValue(job.accumulator&&!job.reader&&state&&result?.imageId===job.imageId&&result.operation==='ela.classic'&&result.status==='ok'&&result.provenance?.originalSha256===job.original.sha256&&same(result.sourceRegionDomain?.fingerprint,job.domain?.fingerprint),'Synthesis frame belongs to another Original, result or source domain.');
   if(job.frameOwner)requireValue(job.frameOwner.index===index&&job.frameOwner.resultId===result.id,'Synthesis append differs from its owned native frame.');
   const actual=result.provenance.params,expected=state.params;for(const field of ['quality','scale','contrast','linear','grayscale','recompression','equalization'])requireValue(same(actual?.[field],expected[field]),'Synthesis frame recipe differs: '+field);
   let surface,borrowed,fee;try{
    if(result.surface){surface=getSurface(result.surface.id);requireValue(result.surface.id!==job.original.surface.descriptor.id&&surface?.descriptor.revision===result.surface.revision,'Synthesis frame surface revision changed.');}
    else{requireValue(result.pixels?.data instanceof Uint8Array,'A live native synthesis surface or RGB8 frame is required.');fee=budget.reserve(result.pixels.data.byteLength);surface=borrowed=contiguousSurface(result.pixels,budget);}
    const started=performance.now(),answer=await job.accumulator.append(surface,{index,signal,onProgress}),appendedAt=performance.now(),backend=result.metrics?.backend??result.provenance.backend??'cpu';job.backends[backend]=(job.backends[backend]??0)+1;await releaseFrame(job);job.frameMetrics.push({backend,recompressions:result.metrics?.recompressions??null,totalMs:result.metrics?.totalMs??null,equalization:result.metrics?.equalization?structuredClone(result.metrics.equalization):null,nativeFrame:result.metrics?.synthesisFrame?structuredClone(result.metrics.synthesisFrame):null,appendMilliseconds:appendedAt-started,frameRetirementMilliseconds:performance.now()-appendedAt});return answer;
   }finally{await borrowed?.dispose();fee?.();}
  },
  async finish({id,resultId='ela-synthesis-'+id},{signal,onProgress}={}){
   const job=jobFor(id);checkAbort(signal);const cacheHit=!!job.reader;let base,writer,reader=job.reader,computationMetrics;
   try{
    if(!reader){base=await job.accumulator.finish({signal,onProgress});computationMetrics=base.metrics;const d=base.surface.descriptor,meta={width:d.width,height:d.height,frames:['median'],format:'rgb8',order:'frame-major-row-major-rgb',synthesisAxis:job.axis,sourceRegionDomain:job.domain?.descriptor??null};
     try{writer=await cache.writer({key:job.key,meta,signal});let sequence=0;const columns=Math.min(d.width,16384),rows=columns===d.width?Math.max(1,Math.min(32,Math.floor(16384/columns))):1;
      for(let y=0;y<d.height;y+=rows)for(let x=0;x<d.width;x+=columns){checkAbort(signal);const part=await base.surface.readWindow({x,y,width:Math.min(columns,d.width-x),height:Math.min(rows,d.height-y)},{signal});try{await writer.append({sequence:sequence++,bytes:part.pixels.data});}finally{await part.release();}}
      await writer.commit();writer=null;checkAbort(signal);reader=await readerFor(job.key,{signal,original:job.original,forceArchive:true});requireValue(reader,'The committed synthesis median is not readable.');
     }catch(error){checkAbort(signal);if(['CANCELLED','STALE_RESULT'].includes(error?.code))throw error;job.cacheFailure={code:error?.code??error?.name??'CACHE_UNAVAILABLE',message:error?.message};await retireCompositeOwners([()=>writer?.abort()],{primary:error});writer=null;reader=await retainNativeFallback(job.key,meta,base,job.original,{onOwned:()=>{base=null;}});}
    }
    if(base&&reader){const committed=reader;reader=await retainCommittedNativeBase(job.key,committed,base,job.original,{onNativeOwned:()=>{base=null;},onArchiveOwned:()=>{reader=null;}});}
    const metrics={...computationMetrics,frameBackends:job.backends,frameMetrics:job.frameMetrics,...(job.cacheFailure?{cacheFailure:job.cacheFailure}:{})};await base?.surface.dispose();base=null;job.reader=null;await retire(job);checkAbort(signal);const answer=await publication(job,resultId,reader,{},cacheHit,metrics);reader=null;return answer;
   }catch(error){await retireCompositeOwners([()=>writer?.abort(),()=>reader?.close(),()=>retire(job)],{primary:error});throw error;}
   finally{await base?.surface.dispose();}
  },
  async render({id,presentation={},...request},hooks={}){const view=await openView(request,hooks);let failed=false,primary;try{return await view.render({id,presentation});}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>view.close()],failed?{primary}:{});}},
  async borrowBase(request,hooks={}){const base=await opened(request,hooks);let success=false;try{await base.reader.adopt?.();const record=elaSynthesisPresentation(base.reader,{budget});success=true;return{surface:record.surface,axis:base.axis,domain:base.domain,key:base.key,persisted:base.reader.manifest?.persistent===true,close:()=>record.surface.dispose()};}finally{if(!success)await base.reader.close();}},
  async prepareNative(bytes,{signal}={}){for(const job of jobs.values()){if(budget.total()+bytes<=budget.limit)break;checkAbort(signal);await job.accumulator?.prepareNative(bytes,{signal});}for(const entry of [...volatileOwners]){if(budget.total()+bytes<=budget.limit)break;checkAbort(signal);await reclaimVolatile(entry);}for(const entry of [...verified.values()]){if(budget.total()+bytes<=budget.limit)break;checkAbort(signal);if(!entry.refs)await retireVerified(entry);}checkAbort(signal);},
  dispose(id){const job=jobs.get(id);return job?retire(job):Promise.resolve();},
  async clear(imageId){for(const job of [...jobs.values()])if(imageId===undefined||job.imageId===imageId)await retire(job);},
  async retireSource(original){for(const entry of [...volatileOwners])if(entry.original===original){if(entry.refs)throw new EngineError('BUSY','Published native synthesis readers must retire before their Original session.');await retireVolatile(entry);}},
  async close(){closed=true;await retirePendingReaders();for(const job of [...jobs.values()])await retire(job);for(const entry of [...volatileOwners]){requireValue(entry.refs===0,'A native synthesis fallback is still borrowed.');await retireVolatile(entry);}for(const entry of [...verified.values()]){requireValue(entry.refs===0,'A verified synthesis cache reader is still borrowed.');await retireVerified(entry);}await cache.close();unregister?.();},
  hasFor:imageId=>[...jobs.values()].some(job=>job.imageId===imageId),
  hasSourceOwner:original=>[...volatileOwners].some(entry=>entry.original===original)
 };
}
