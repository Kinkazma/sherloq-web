import "../../runtime-context.js?v=0.24.0";
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
export function createSourceRegionRuntime({budget,images,surfaces,resultSurfaces,getImage,withBusy,runLegacy,retireAnalysis,knownHeapBytes,version,profile,cpuKernel,codec}){
 const records=new Map(),contexts=new Map();let clock=0;
 async function retire(entry){
  if(!records.has(entry.id))return;records.delete(entry.id);const removed=new Set();for(const[key,value]of contexts)if(value.entry===entry){contexts.delete(key);removed.add(value);}for(const value of removed)value.release();
  try{await resultSurfaces.clear(entry.id);}finally{try{await retireAnalysis?.(entry.id);}finally{try{await disposeSegmentedImage(entry.record);}finally{surfaces.delete(entry.record.surface.descriptor.id);images.delete(entry.id);budget.retained-=entry.record.retainedBytes;budget.clearPrefix(entry.id+'\0');budget.clearDependencies(entry.id);}}}
 }
 async function clear(originalId){for(const entry of [...records.values()])if(originalId===undefined||entry.originalId===originalId||entry.id===originalId)await retire(entry);}
 async function derived(originalId,original,domain,{signal}={}){
  const id=await sourceRegionCacheIdentity(originalId,domain);checkAbort(signal);let entry=records.get(id);if(!entry&&images.has(id))throw new EngineError('SOURCE_SCOPE_IDENTITY_COLLISION','An internal original-source domain identifier is already occupied.');if(entry){entry.last=++clock;return entry;}
  const orphans=[...records.values()].filter(row=>row.originalId===originalId&&!resultSurfaces.hasFor(row.id)&&![...contexts.values()].some(c=>c.entry===row)).sort((a,b)=>b.last-a.last);for(const old of orphans.slice(1))await retire(old);checkAbort(signal);
  const bytes=sourceRegionTransportBytes(domain.descriptor),release=budget.reserve(bytes);let record;
  try{record=createSourceRegionRecord(original,domain,{budget});checkAbort(signal);release();budget.retain(bytes);record.retainedBytes=bytes;entry={id,record,originalId,domain,last:++clock};images.set(id,record);surfaces.set(record.surface.descriptor.id,{imageId:id,record});records.set(id,entry);return entry;}
  catch(error){await record?.surface.dispose();throw error;}finally{release();}
 }
 function clearContexts(operations){const accepted=new Set(operations),removed=new Set();for(const[key,context]of contexts)if(accepted.has(context.task.operation)){contexts.delete(key);removed.add(context);}for(const context of removed)if(![...contexts.values()].includes(context))context.release();}
 function remember(answer,task,original,entry,domain,localization,reservation){if(!entry)return false;const ids=[answer.analysisId,answer.data?.metadata?.analysisId,answer.data?.metadata?.resultId].filter(x=>typeof x==='string');if(!ids.length)return false;let context=ids.map(id=>contexts.get(id)).find(c=>c?.entry===entry&&c.task.operation===task.operation&&c.domain.fingerprint===domain.fingerprint);if(context){for(const[key,value]of contexts)if(value===context)contexts.delete(key);for(const id of ids)contexts.set(id,context);return false;}const release=reservation??budget.reserve(4096+(localization?sourceRegionTransportBytes(localization)*2:0));clearContexts([task.operation]);context={task:{id:task.id,imageId:task.imageId,operation:task.operation},original,entry,domain,localization,release};for(const id of ids)contexts.set(id,context);return!!reservation;}
 function cachedContext(request){return contexts.get(request.analysisId??request.resultId);}
 function internalRequest(request){const context=cachedContext(request);if(!context)return request;if(request.imageId!==undefined&&![context.task.imageId,context.entry.id].includes(request.imageId))throw new EngineError('SOURCE_REGIONS_INVALID','The retained analysis belongs to another original source.');return{...request,...(request.imageId===undefined?{}:{imageId:context.entry.id})};}
 async function continuation(answer,request,{presentation=true}={}){const context=cachedContext(request);if(!context)return answer;const{task,original,entry,domain,localization}=context;let pixels,sourceSurface;try{if(presentation){pixels=createRgbSurface(entry.record.store,{width:domain.width,height:domain.height,budget,ownsStore:false});sourceSurface=resultSurfaces.publish(entry.id,{surface:pixels,sourceRegionPresentation:true});}remember(answer,task,original,entry,domain,localization);return sourceRegionResult(answer,{task,original,domain,sourceSurface,cacheIdentity:entry.id,localization});}catch(error){if(sourceSurface)await resultSurfaces.release(sourceSurface.id);else await pixels?.dispose();throw error;}}
 async function histogram(task,original,entry,view,{signal,onProgress}={}){
  const params=histogramParams(task.params),key=entry.id+'\0source-region/histogram',started=performance.now();let output,resident;
  try{resident=budget.reserve(knownHeapBytes());let base=budget.get(key)?.value;const hit=!!base;if(!base){base=await sourceRegionHistogram(view,params,{budget,signal,onProgress:f=>onProgress?.({id:task.id,phase:'kernel',fraction:f})});checkAbort(signal);budget.put(key,{value:base,byteLength:payloadBytes(base)},[task.imageId]);}output=budget.reserve(payloadBytes(base)*2);const owned=structuredClone(base);histogramView(owned,params);checkAbort(signal);return{id:task.id,imageId:entry.id,operation:task.operation,status:'ok',...owned,layers:[],provenance:{engine:version,operation:task.operation,params,backend:'cpu',originalSha256:original.sha256,kernelParity:'Exact maintained histogram over admitted original samples; no excluded observations.'},metrics:{totalMs:performance.now()-started,cache:{result:hit,analysis:hit},memory:budget.snapshot()}};}
  finally{output?.();resident?.();}
 }
 async function requireIdentity(task,{signal}={},code='SOURCE_SCOPE_UNSUPPORTED'){
  if(!task.sourceRegionDomain)return;const domain=await withBusy(async()=>{const metadata=budget.reserve(knownHeapBytes()+sourceRegionTransportBytes(task.sourceRegionDomain)*4+65536);try{return await prepareSourceRegionDomain(getImage(task.imageId),task.sourceRegionDomain,{signal});}finally{metadata();}});if(sourceRegionDomainShape(domain)!=='identity')throw new EngineError(code,'This request needs a separately qualified native-domain adapter.');
 }
 return{
  capabilities:registeredSourceRegionCapabilities,internalRequest,rawResult:(answer,request)=>sourceRegionRawResult(answer,cachedContext(request)),continuation,clearContexts,get size(){return records.size;},owns:id=>records.has(id),clear,requireIdentity,
  async deriveInput(input,{signal}={}){
   if(!['preparation-envelope','analysis-rectangle'].includes(input.purpose))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','A native source reader must declare its preparation or scientific rectangle purpose.');
   return withBusy(async()=>{let resident,metadata,presentation,sourceSurface;
    try{resident=budget.reserve(knownHeapBytes());metadata=budget.reserve(sourceRegionTransportBytes(input.sourceRegionDomain)*4+65536);const original=getImage(input.imageId),domain=await prepareSourceRegionDomain(original,input.sourceRegionDomain,{signal});if(input.purpose==='analysis-rectangle'&&!['identity','rectangle'].includes(sourceRegionDomainShape(domain)))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','A scientific native reader requires a completely admitted rectangle; an envelope with holes cannot substitute for its membership.');const entry=await derived(input.imageId,original,domain,{signal}),context=input.purpose==='analysis-rectangle'?'admitted-native-rectangle':'envelope-not-scientific-membership';
     checkAbort(signal);presentation=createRgbSurface(entry.record.store,{width:domain.width,height:domain.height,budget,ownsStore:false});sourceSurface=resultSurfaces.publish(entry.id,{surface:presentation,sourceRegionPresentation:true});
     return{width:domain.width,height:domain.height,originalSha256:original.sha256,sourceRegionSourceSurface:sourceSurface,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],purpose:input.purpose,sourceRegionContext:context,...(input.purpose==='analysis-rectangle'?{analysisContext:context}:{preparationContext:context}),provenance:{originalEncodedBytesPreserved:true,encodedSourceRewritten:false,sourceRegionFingerprint:domain.fingerprint,sourceRegionOrigin:[...domain.origin],purpose:input.purpose,sourceRegionContext:context}};
    }catch(error){if(presentation){if(sourceSurface)await resultSurfaces.release(sourceSurface.id);else await presentation.dispose();}throw error;}
    finally{metadata?.();resident?.();}
   });
  },
  async run(task,hooks={}){
   const{signal,onProgress}=hooks,original=getImage(task.imageId);let domain,entry,view,metadata,coordinateMetadata,contextLease,effectiveTask=task;
   try{
    await withBusy(async()=>{let resident;try{resident=budget.reserve(knownHeapBytes());checkAbort(signal);metadata=budget.reserve(sourceRegionTransportBytes(task.sourceRegionDomain)*4+65536);domain=await prepareSourceRegionDomain(original,task.sourceRegionDomain,{signal});admitSourceRegionOperation(task.operation,domain,PIXEL_OPERATIONS[task.operation]?.validate(task.params)??task.params,task);if(sourceRegionDomainShape(domain)!=='identity'){coordinateMetadata=budget.reserve(sourceRegionCoordinateBytes(task)*4);effectiveTask=await localizeSourceRegionTask(task,domain,{signal});entry=await derived(task.imageId,original,domain,{signal});view=await createSourceRegionView({...original.surface,sha256:original.sha256},domain.descriptor,{budget,signal});}}finally{resident?.();}});
    if(entry&&['analysis.complete','analysis.clones','ai.clones.d2prl','ai.clones.segmentation'].includes(task.operation))contextLease=budget.reserve(4096+(effectiveTask.sourceRegionLocalization?sourceRegionTransportBytes(effectiveTask.sourceRegionLocalization)*2:0));const retainedId=effectiveTask.params?.refilterOf??effectiveTask.params?.reprojectOf;if(retainedId){const context=contexts.get(retainedId);if(context&&context.entry.id!==(entry?.id??task.imageId))throw new EngineError('CACHE_MISS','This retained analysis belongs to another original-source crop.');}const internal={...effectiveTask,imageId:entry?.id??task.imageId,sourceRegionDomain:undefined};let answer;
    if(!entry)answer=await runLegacy(internal,hooks);
    else if(task.operation==='inspection.histogram')answer=await withBusy(()=>histogram(task,original,entry,view,hooks));
    else if(task.operation==='subimages.detect')answer=await withBusy(()=>withM3Pixels([entry.record],{signal,onProgress},async()=>{const segmented=entry.record.segmented;entry.record.segmented=false;try{return await runLegacy(internal,hooks);}finally{entry.record.segmented=segmented;}}));
    else{
     const adapter=registeredSourceRegionAdapter(task.operation,domain);
     if(adapter)answer=await withBusy(async()=>{let resident;try{resident=budget.reserve(knownHeapBytes());return await adapter.run({task:{...internal,sourceRegionDomain:domain.descriptor},original,derived:entry.record,view,domain,budget,signal,onProgress,profile,cpuKernel,codec,runLegacy:input=>runLegacy({...internal,...input,imageId:entry.id,sourceRegionDomain:undefined},hooks),publishResult:(id,record)=>resultSurfaces.publishBundle(id,record),publishTable:(id,record)=>resultSurfaces.publish(id,record)});}finally{resident?.();}});
     else answer=await runLegacy(internal,hooks);
    }
    checkAbort(signal);if(remember(answer,task,original,entry,domain,effectiveTask.sourceRegionLocalization,contextLease))contextLease=null;let sourceSurface=original.surface.descriptor,presentation;
    try{if(entry){presentation=createRgbSurface(entry.record.store,{width:domain.width,height:domain.height,budget,ownsStore:false});sourceSurface=resultSurfaces.publish(entry.id,{surface:presentation,sourceRegionPresentation:true});}return sourceRegionResult(answer,{task,original,domain,sourceSurface,cacheIdentity:entry?.id,identity:!entry,localization:effectiveTask.sourceRegionLocalization});}
    catch(error){if(presentation){if(sourceSurface.id===presentation.descriptor.id)await resultSurfaces.release(sourceSurface.id);else await presentation.dispose();}throw error;}
   }catch(error){const retained=error.details?.retainedAnalysis;if(entry&&retained?.analysisId)if(remember({analysisId:retained.analysisId},task,original,entry,domain,effectiveTask.sourceRegionLocalization,contextLease))contextLease=null;throw error;}finally{view?.dispose();coordinateMetadata?.();contextLease?.();metadata?.();}
  },
  async checkPreview(task,{signal,alreadyBusy=false}={}){
   const original=getImage(task.imageId);
   if(!task.sourceRegionDomain)return{task,original,image:original,domain:null};
   const prepare=async()=>{let resident,metadata;
    try{resident=budget.reserve(knownHeapBytes());metadata=budget.reserve(sourceRegionTransportBytes(task.sourceRegionDomain)*4+65536);const domain=await prepareSourceRegionDomain(original,task.sourceRegionDomain,{signal}),shape=sourceRegionDomainShape(domain);
     // A provisional raster may sample an admitted rectangle. It cannot turn
     // holes into black observations or silently sample their full envelope.
     if(!['identity','rectangle'].includes(shape))throw new EngineError('SOURCE_SCOPE_PREVIEW_UNSUPPORTED','This preview requires a completely admitted native rectangle. Excluded samples cannot be read by its proxy.');
     admitSourceRegionOperation(task.operation,domain,PIXEL_OPERATIONS[task.operation]?.validate(task.params)??task.params,task);checkAbort(signal);
     const effective=shape==='identity'?task:await localizeSourceRegionTask(task,domain,{signal}),entry=shape==='identity'?null:await derived(task.imageId,original,domain,{signal});
     return{task:{...effective,imageId:entry?.id??task.imageId,sourceRegionDomain:undefined},original,image:entry?.record??original,domain};
    }finally{metadata?.();resident?.();}
   };
   return alreadyBusy?prepare():withBusy(prepare);
  }
 };
}
