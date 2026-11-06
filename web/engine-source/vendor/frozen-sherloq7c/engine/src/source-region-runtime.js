import{segmentationIndependentSourceAdmitted}from'./segmentation-independent-capability.js';
import{compileOriginalSourceRegions}from'./source-region-geometry.js';
import {automaticClonesSourceTask} from './automatic-clones-source-task.js';
import {automaticCompleteSourceTask} from './automatic-complete-source-task.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {sourceRegionRawResult} from './source-region-raw-result.js';
import {localizeSourceRegionTask,sourceRegionCoordinateBytes} from './source-region-localize.js';
import {createRgbSurface} from './rgb-surface.js';
import {withM3Pixels} from './m3-source.js';
import {createSourceRegionRecord} from './source-region-record.js';
import {createSourceRegionView} from './source-region-view.js';
import {sourceRegionHistogram} from './source-region-histogram.js';
import {histogramParams} from './histogram.js';
import {payloadBytes,histogramView,PIXEL_OPERATIONS} from './pixel-operations.js';
import {disposeSegmentedImage} from './image-sources.js';
import {prepareSourceRegionDomain,admitSourceRegionOperation,registeredSourceRegionAdapter,registeredSourceRegionCapabilities,sourceRegionCacheIdentity,sourceRegionResult,sourceRegionDomainShape,sourceRegionTransportBytes} from './source-region-dispatch.js';
import {EngineError,checkAbort} from './errors.js';

/** Internal source variants share the encoded owner, not mutable scoped pixels.
 * Live published result handles survive; orphan variants are kept in a small LRU. */
export function createSourceRegionRuntime({budget,images,surfaces,resultSurfaces,getImage,withBusy,runLegacy,runGeneration,runSegmentation,retireAnalysis,knownHeapBytes,version,profile,cpuKernel,codec,referencesFor,medianPool,cloningGroupPool,pagedAkazeExtract,accountedPrnuHeapBytes=()=>0}){
 const records=new Map(),contexts=new Map(),retirements=new Map();let clock=0;
 function retire(entry){
  if(records.get(entry.id)!==entry)return;
  let state=retirements.get(entry.id);if(!state){state={results:false,analysis:false,pixels:false};retirements.set(entry.id,state);}
  if(state.pending)return state.pending;
  const task=Promise.resolve().then(async()=>{
   // Derived RGB and its source mapping must outlive every result and native
   // analysis ACK. Successful stages are not repeated after a later failure.
   if(!state.results){await resultSurfaces.clear(entry.id);state.results=true;}
   if(!state.analysis){await retireAnalysis?.(entry.id);state.analysis=true;}
   if(!state.pixels){await disposeSegmentedImage(entry.record);state.pixels=true;}
   const removed=new Set([...contexts.values()].filter(value=>value.entry===entry));
   for(const value of removed){await value.release();for(const[key,context]of contexts)if(context===value)contexts.delete(key);}
   surfaces.delete(entry.record.surface.descriptor.id);if(images.get(entry.id)===entry.record)images.delete(entry.id);records.delete(entry.id);
   budget.retained-=entry.record.retainedBytes;budget.clearPrefix(entry.id+'\0');budget.clearDependencies(entry.id);retirements.delete(entry.id);
  });
  state.pending=task;void task.finally(()=>{if(state.pending===task)state.pending=null;}).catch(()=>{});return task;
 }
 async function clear(originalId){for(const entry of [...records.values()])if(originalId===undefined||entry.originalId===originalId||entry.id===originalId)await retire(entry);}
 async function derived(originalId,original,domain,{signal}={}){
  const id=await sourceRegionCacheIdentity(originalId,domain);checkAbort(signal);let entry=records.get(id);if(entry&&retirements.has(id)){await retire(entry);checkAbort(signal);entry=null;}if(!entry&&images.has(id))throw new EngineError('SOURCE_SCOPE_IDENTITY_COLLISION','An internal original-source domain identifier is already occupied.');if(entry){entry.last=++clock;if(entry.domain!==domain){entry.domain=domain;entry.record.sourceRegionDomain=domain.descriptor;entry.record.provenance={...entry.record.provenance,sourceRegionDomain:domain.descriptor};}return entry;}
  const orphans=[...records.values()].filter(row=>row.originalId===originalId&&!resultSurfaces.hasFor(row.id)&&![...contexts.values()].some(c=>c.entry===row)).sort((a,b)=>b.last-a.last);for(const old of orphans.slice(1))await retire(old);checkAbort(signal);
  const bytes=sourceRegionTransportBytes(domain.descriptor,{allowAliases:true}),release=budget.reserve(bytes);let record;
  try{record=createSourceRegionRecord(original,domain,{budget});checkAbort(signal);release();budget.retain(bytes);record.retainedBytes=bytes;entry={id,record,originalId,domain,last:++clock};images.set(id,record);surfaces.set(record.surface.descriptor.id,{imageId:id,record});records.set(id,entry);return entry;}
  catch(error){await record?.surface.dispose();throw error;}finally{release();}
 }
 function clearContexts(operations){const accepted=new Set(operations),removed=new Set();for(const[key,context]of contexts)if(accepted.has(context.task.operation)){contexts.delete(key);removed.add(context);}for(const context of removed)if(![...contexts.values()].includes(context))context.release();}
 function remember(answer,task,original,entry,domain,localization,reservation){if(!entry)return false;const ids=[answer.analysisId,answer.data?.metadata?.analysisId,answer.data?.metadata?.resultId].filter(x=>typeof x==='string');if(!ids.length)return false;let context=ids.map(id=>contexts.get(id)).find(c=>c?.entry===entry&&c.task.operation===task.operation&&c.domain===domain&&c.localization===localization);if(context){for(const[key,value]of contexts)if(value===context)contexts.delete(key);for(const id of ids)contexts.set(id,context);return false;}const release=reservation??budget.reserve(4096+(localization?sourceRegionTransportBytes(localization)*2:0));clearContexts([task.operation]);context={task:{id:task.id,imageId:task.imageId,operation:task.operation},original,entry,domain,localization,release};for(const id of ids)contexts.set(id,context);return!!reservation;}
 function cachedContext(request){const context=contexts.get(request.analysisId??request.resultId);if(context&&retirements.has(context.entry.id))throw new EngineError('CACHE_MISS','The retained source context is being retired. Retry cleanup before reusing its analysis.');return context;}
 function internalRequest(request){const context=cachedContext(request);if(!context)return request;if(request.imageId!==undefined&&![context.task.imageId,context.entry.id].includes(request.imageId))throw new EngineError('SOURCE_REGIONS_INVALID','The retained analysis belongs to another original source.');return{...request,...(request.imageId===undefined?{}:{imageId:context.entry.id})};}
 async function continuation(answer,request,{presentation=true}={}){const context=cachedContext(request);if(!context)return answer;const{task,original,entry,domain,localization}=context;let pixels,sourceSurface;try{if(presentation){pixels=createRgbSurface(entry.record.store,{width:domain.width,height:domain.height,budget,ownsStore:false});sourceSurface=resultSurfaces.publish(entry.id,{surface:pixels,sourceRegionPresentation:true});}remember(answer,task,original,entry,domain,localization);return sourceRegionResult(answer,{task,original,domain,sourceSurface,cacheIdentity:entry.id,localization});}catch(error){if(sourceSurface)await resultSurfaces.release(sourceSurface.id);else await pixels?.dispose();throw error;}}
 async function decorateRetained(answer,submitted,context,{signal}={}){
  if(!context.domain)return answer;
  const{original,entry,domain,task}=context;let pixels,sourceSurface;
  try{checkAbort(signal);if(entry){pixels=createRgbSurface(entry.record.store,{width:domain.width,height:domain.height,budget,ownsStore:false});sourceSurface=resultSurfaces.publish(entry.id,{surface:pixels,sourceRegionPresentation:true});}const result=sourceRegionResult(answer,{task:submitted,original,domain,sourceSurface:sourceSurface??original.surface.descriptor,cacheIdentity:entry?.id,identity:!entry,localization:task.sourceRegionLocalization});checkAbort(signal);return result;}
  catch(error){await retireCompositeOwners([()=>sourceSurface?resultSurfaces.release(sourceSurface.id):pixels?.dispose()],{primary:error});throw error;}
 }
 async function histogram(task,original,entry,view,{signal,onProgress}={}){
  const params=histogramParams(task.params),key=entry.id+'\0source-region/histogram',started=performance.now();let output,resident;
  try{resident=budget.reserve(knownHeapBytes());let base=budget.get(key)?.value;const hit=!!base;if(!base){base=await sourceRegionHistogram(view,params,{budget,signal,onProgress:f=>onProgress?.({id:task.id,phase:'kernel',fraction:f})});checkAbort(signal);budget.put(key,{value:base,byteLength:payloadBytes(base)},[task.imageId]);}output=budget.reserve(payloadBytes(base)*2);const owned=structuredClone(base);histogramView(owned,params);checkAbort(signal);return{id:task.id,imageId:entry.id,operation:task.operation,status:'ok',...owned,layers:[],provenance:{engine:version,operation:task.operation,params,backend:'cpu',originalSha256:original.sha256,kernelParity:'Exact maintained histogram over admitted original samples; no excluded observations.'},metrics:{totalMs:performance.now()-started,cache:{result:hit,analysis:hit},memory:budget.snapshot()}};}
  finally{output?.();resident?.();}
 }
 async function requireIdentity(task,{signal}={},code='SOURCE_SCOPE_UNSUPPORTED'){
  if(!task.sourceRegionDomain)return;const domain=await withBusy(async()=>{const metadata=budget.reserve(knownHeapBytes()+sourceRegionTransportBytes(task.sourceRegionDomain,{allowAliases:true})*4+65536);try{return await prepareSourceRegionDomain(getImage(task.imageId),task.sourceRegionDomain,{signal});}finally{metadata();}});if(sourceRegionDomainShape(domain)!=='identity')throw new EngineError(code,'This request needs a separately qualified native-domain adapter.');
 }
 return{
  decoratePreviewMetadata(answer,request){
   const context=cachedContext(request);if(!context)return answer;
   const{task,original,entry,domain,localization}=context;
   if(getImage(task.imageId)!==original||getImage(entry.id)!==entry.record)throw new EngineError('CACHE_MISS','The committed preview source context changed.');
   const{sourceRegionSourceSurface,...value}=sourceRegionResult(answer,{task,original,domain,cacheIdentity:entry.id,localization});
   return{...value,originalSha256:original.sha256};
  },
  async borrowRetainedD2Preview(task,{signal}={}){
   if(task?.retainedD2Preview!==true||task.operation!=='ai.clones.d2prl'||typeof task.params?.refilterOf!=='string'||!task.params.refilterOf)throw new EngineError('INVALID_INPUT','A temporary D2PRL preview requires its retained native analysis.');
   checkAbort(signal);const original=getImage(task.imageId),context=cachedContext({analysisId:task.params.refilterOf});let metadata;
   const current=()=>getImage(task.imageId)===original&&(!context||cachedContext({analysisId:task.params.refilterOf})===context&&context.original===original&&getImage(context.entry.id)===context.entry.record);
   try{
    if(!task.sourceRegionDomain){if(context)throw new EngineError('CACHE_MISS','A retained scoped D2PRL bank requires the same Original domain.');return{task,isCurrent:current,decorate:answer=>answer,release(){}};}
    metadata=budget.reserve(sourceRegionTransportBytes(task.sourceRegionDomain,{allowAliases:true})*4+sourceRegionCoordinateBytes(task)*4+65536);
    const domain=await prepareSourceRegionDomain(original,task.sourceRegionDomain,{signal});checkAbort(signal);
    if(!current())throw new EngineError('CACHE_MISS','The retained D2PRL source owner changed.');
    if(sourceRegionDomainShape(domain)==='identity'){
     if(context)throw new EngineError('CACHE_MISS','The retained D2PRL bank belongs to another domain.');
     return{task:{...task,sourceRegionDomain:undefined},isCurrent:current,decorate:answer=>{const{sourceRegionSourceSurface,...value}=sourceRegionResult(answer,{task,original,domain,identity:true});return value;},release:metadata};
    }
    if(!context||context.task.operation!==task.operation||context.task.imageId!==task.imageId||context.domain.fingerprint!==domain.fingerprint)throw new EngineError('CACHE_MISS','A temporary D2PRL preview can only borrow its completed Original domain.');
    const localized=await localizeSourceRegionTask(task,context.domain,{signal,strictNeuralFragments:true});checkAbort(signal);
    if(!current())throw new EngineError('CACHE_MISS','The retained D2PRL source owner changed.');
    return{task:{...localized,imageId:context.entry.id,sourceRegionDomain:undefined},isCurrent:current,decorate:answer=>{const{sourceRegionSourceSurface,...value}=sourceRegionResult(answer,{task,original,domain:context.domain,cacheIdentity:context.entry.id,localization:context.localization});return value;},release:metadata};
   }catch(error){metadata?.();throw error;}
  },
  peekNativePreviewOwner(id){const entry=records.get(id);return entry?Object.freeze({entry,record:entry.record,originalId:entry.originalId,domain:entry.domain,retiring:retirements.has(id)}):undefined;},
  capabilities:registeredSourceRegionCapabilities,internalRequest,rawResult:(answer,request)=>sourceRegionRawResult(answer,cachedContext(request)),continuation,decorateRetained,clearContexts,get size(){return records.size;},owns:id=>records.has(id),clear,requireIdentity,
  async deriveInput(input,{signal}={}){
   if(!['preparation-envelope','analysis-rectangle','analysis-native-contexts'].includes(input.purpose)||input.purpose==='analysis-native-contexts'&&!['m2.cfa','m2.trufor','m2.rita'].includes(input.scientificConsumer))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','A native source reader must declare its preparation or scientific rectangle purpose.');
   return withBusy(async()=>{let resident,metadata,presentation,sourceSurface;
    try{resident=budget.reserve(knownHeapBytes());metadata=budget.reserve(sourceRegionTransportBytes(input.sourceRegionDomain,{allowAliases:true})*4+65536);const original=getImage(input.imageId),domain=await prepareSourceRegionDomain(original,input.sourceRegionDomain,{signal});if(input.purpose==='analysis-rectangle'&&!['identity','rectangle'].includes(sourceRegionDomainShape(domain)))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','A scientific native reader requires a completely admitted rectangle; an envelope with holes cannot substitute for its membership.');const entry=await derived(input.imageId,original,domain,{signal}),context=input.purpose==='analysis-rectangle'?'admitted-native-rectangle':input.purpose==='analysis-native-contexts'?('native-'+input.scientificConsumer.slice(3)+'-contexts-only'):'envelope-not-scientific-membership';
     checkAbort(signal);presentation=createRgbSurface(entry.record.store,{width:domain.width,height:domain.height,budget,ownsStore:false});sourceSurface=resultSurfaces.publish(entry.id,{surface:presentation,sourceRegionPresentation:true});
     return{width:domain.width,height:domain.height,originalSha256:original.sha256,sourceRegionSourceSurface:sourceSurface,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],purpose:input.purpose,sourceRegionContext:context,...(input.purpose!=='preparation-envelope'?{analysisContext:context}:{preparationContext:context}),provenance:{originalEncodedBytesPreserved:true,encodedSourceRewritten:false,sourceRegionFingerprint:domain.fingerprint,sourceRegionOrigin:[...domain.origin],purpose:input.purpose,sourceRegionContext:context}};
    }catch(error){if(presentation){if(sourceSurface)await resultSurfaces.release(sourceSurface.id);else await presentation.dispose();}throw error;}
    finally{metadata?.();resident?.();}
   });
  },
  async run(task,hooks={}){
   if(task.operation==='ai.clones.segmentation'&&segmentationIndependentSourceAdmitted(task)){return withBusy(async()=>{let metadata,resident;try{const original=getImage(task.imageId),d=original.surface?.descriptor??original.pixels;resident=budget.reserve(knownHeapBytes());metadata=budget.reserve(sourceRegionTransportBytes(task.sourceRegionDomain,{allowAliases:true})*4+65536);const domain=await compileOriginalSourceRegions(task.sourceRegionDomain);if(domain.sourceSha256!==original.sha256||domain.sourceWidth!==d.width||domain.sourceHeight!==d.height)throw new EngineError('SOURCE_REGIONS_INVALID','Independent windows belong to another Original source');checkAbort(hooks.signal);const answer=await runSegmentation({task,original,domain,...hooks,knownHeapBytes:knownHeapBytes()});checkAbort(hooks.signal);return{...answer,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[0,0],sourceRegionAdmissionOrigin:[...domain.origin],sourceRegionSourceSurface:original.surface.descriptor,provenance:{...answer.provenance,originalSha256:original.sha256,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[0,0],outputCoordinates:'Original pixels',originalEncodedBytesPreserved:true}};}finally{metadata?.();resident?.();}});}
   const{signal,onProgress}=hooks,original=getImage(task.imageId);let domain,entry,view,metadata,coordinateMetadata,contextLease,scopeTask,effectiveTask=task;
   try{
    await withBusy(async()=>{let resident;try{resident=budget.reserve(knownHeapBytes());checkAbort(signal);metadata=budget.reserve(sourceRegionTransportBytes(task.sourceRegionDomain,{allowAliases:true})*4+65536);domain=await prepareSourceRegionDomain(original,task.sourceRegionDomain,{signal});admitSourceRegionOperation(task.operation,domain,PIXEL_OPERATIONS[task.operation]?.validate(task.params)??task.params,task);if(sourceRegionDomainShape(domain)!=='identity'){scopeTask=task.operation==='analysis.complete'?await automaticCompleteSourceTask(task,domain,{budget,signal}):task.operation==='analysis.clones'?await automaticClonesSourceTask(task,domain,{budget,signal}):null;const localizedInput=scopeTask?.task??task;coordinateMetadata=budget.reserve(sourceRegionCoordinateBytes(localizedInput)*4);effectiveTask=await localizeSourceRegionTask(localizedInput,domain,{signal,strictAutomaticFragments:['analysis.complete','analysis.clones'].includes(task.operation),strictNeuralFragments:task.operation==='ai.clones.d2prl',strictDenseFragments:task.operation==='tampering.copyMove.dense',strictSparseFragments:task.operation==='tampering.copyMove.sparse'});entry=await derived(task.imageId,original,domain,{signal});view=await createSourceRegionView({...original.surface,sha256:original.sha256},domain.descriptor,{budget,signal});}}finally{resident?.();}});
    if(entry&&['analysis.complete','analysis.clones','ai.clones.d2prl','ai.clones.segmentation'].includes(task.operation))contextLease=budget.reserve(4096+(effectiveTask.sourceRegionLocalization?sourceRegionTransportBytes(effectiveTask.sourceRegionLocalization)*2:0));const retainedId=effectiveTask.params?.refilterOf??effectiveTask.params?.reprojectOf;if(retainedId){const context=contexts.get(retainedId);if(context&&context.entry.id!==(entry?.id??task.imageId))throw new EngineError('CACHE_MISS','This retained analysis belongs to another original-source crop.');}const internal={...effectiveTask,imageId:entry?.id??task.imageId,sourceRegionDomain:undefined};let answer;
    if(!entry)answer=await runLegacy(internal,hooks);
    else if(['analysis.complete','analysis.clones'].includes(task.operation))answer=await registeredSourceRegionAdapter(task.operation,domain).run({task:{...internal,sourceRegionDomain:domain.descriptor},signal,runLegacy:input=>runLegacy({...internal,...input,imageId:entry.id,sourceRegionDomain:undefined},hooks)});
    else if(task.operation==='inspection.histogram')answer=await withBusy(()=>histogram(task,original,entry,view,hooks));
    else if(task.operation==='subimages.detect'&&sourceRegionDomainShape(domain)==='rectangle')answer=await withBusy(()=>withM3Pixels([entry.record],{signal,onProgress},async()=>{const segmented=entry.record.segmented;entry.record.segmented=false;try{return await runLegacy(internal,hooks);}finally{entry.record.segmented=segmented;}}));
    else{
     const adapter=registeredSourceRegionAdapter(task.operation,domain);
     if(adapter)answer=await withBusy(async()=>{let resident;try{const admittedPrnuHeap=accountedPrnuHeapBytes();resident=budget.reserve(knownHeapBytes());return await adapter.run({accountedPrnuHeapBytes:admittedPrnuHeap,task:{...internal,sourceRegionDomain:domain.descriptor},original,derived:entry.record,view,domain,budget,signal,onProgress,version,profile,cpuKernel,codec,references:referencesFor?.(internal)??[],medianPool,cloningGroupPool,pagedAkazeExtract:(gray,mask,width,height,nativeHooks)=>pagedAkazeExtract(gray,mask,width,height,nativeHooks,original),runGeneration:(nativeTask,nativeImage,nativeHooks)=>runGeneration(nativeTask,nativeImage,{...hooks,...nativeHooks}),runLegacy:input=>runLegacy({...internal,...input,imageId:entry.id,sourceRegionDomain:undefined},hooks),publishResult:(id,record)=>resultSurfaces.publishBundle(id,record),publishTable:(id,record)=>resultSurfaces.publish(id,record),releaseResult:id=>resultSurfaces.release(id)});}finally{resident?.();}});
     else answer=await runLegacy(internal,hooks);
    }
    checkAbort(signal);if(remember(answer,task,original,entry,domain,effectiveTask.sourceRegionLocalization,contextLease))contextLease=null;let sourceSurface=original.surface.descriptor,presentation;
    try{if(entry){presentation=createRgbSurface(entry.record.store,{width:domain.width,height:domain.height,budget,ownsStore:false});sourceSurface=resultSurfaces.publish(entry.id,{surface:presentation,sourceRegionPresentation:true});}return sourceRegionResult(answer,{task,original,domain,sourceSurface,cacheIdentity:entry?.id,identity:!entry,localization:effectiveTask.sourceRegionLocalization});}
    catch(error){if(presentation){if(sourceSurface.id===presentation.descriptor.id)await resultSurfaces.release(sourceSurface.id);else await presentation.dispose();}throw error;}
   }catch(error){const retained=error.details?.retainedAnalysis;if(entry&&retained?.analysisId)if(remember({analysisId:retained.analysisId},task,original,entry,domain,effectiveTask.sourceRegionLocalization,contextLease))contextLease=null;throw error;}finally{try{await view?.dispose();}finally{scopeTask?.release();coordinateMetadata?.();contextLease?.();metadata?.();}}
  },
  async checkPreview(task,{signal,retainedNativeTables=false}={}){
   const original=getImage(task.imageId);
   if(!task.sourceRegionDomain)return{task,original,image:original,domain:null};
   return withBusy(async()=>{let resident,metadata;
    try{resident=budget.reserve(knownHeapBytes());metadata=budget.reserve(sourceRegionTransportBytes(task.sourceRegionDomain,{allowAliases:true})*4+65536);const domain=await prepareSourceRegionDomain(original,task.sourceRegionDomain,{signal}),shape=sourceRegionDomainShape(domain);
     // A provisional raster may sample an admitted rectangle. It cannot turn
     // holes into black observations or silently sample their full envelope.
     const previewAdapter=registeredSourceRegionAdapter(task.operation,domain),nativeFragmentPreview=previewAdapter?.previewOperations?.includes(task.operation)===true&&(!previewAdapter.previewParameterRules?.algorithm||previewAdapter.previewParameterRules.algorithm.oneOf.includes(task.params?.algorithm));
     if(!['identity','rectangle'].includes(shape)&&!nativeFragmentPreview&&!retainedNativeTables)throw new EngineError('SOURCE_SCOPE_PREVIEW_UNSUPPORTED','This preview requires a completely admitted native rectangle. Excluded samples cannot be read by its proxy.');
     admitSourceRegionOperation(task.operation,domain,PIXEL_OPERATIONS[task.operation]?.validate(task.params)??task.params,task);checkAbort(signal);
     const effective=shape==='identity'?task:await localizeSourceRegionTask(task,domain,{signal,strictSparseFragments:task.operation==='tampering.copyMove.sparse',strictDenseFragments:retainedNativeTables&&task.operation==='tampering.copyMove.dense'}),entry=shape==='identity'?null:await derived(task.imageId,original,domain,{signal});
     return{task:{...effective,imageId:entry?.id??task.imageId,sourceRegionDomain:undefined},original,image:entry?.record??original,domain,entry};
    }finally{metadata?.();resident?.();}
   });
  }
 };
}
