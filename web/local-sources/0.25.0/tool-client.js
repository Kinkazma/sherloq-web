import {classicalContextPreviewCandidate} from './classical-context-preview.js?v=0.25.0';
import {medianContextPreviewCandidate} from './median-context-preview.js?v=0.25.0';
import {resamplingContextPreviewContract} from './resampling-context-parameter-preview.js?v=0.25.0';
import {nativeClonePreview} from './native-clone-preview.js?v=0.25.0';
import {createRetainedResultRetirement} from './retained-result-retirement.js?v=0.25.0';
import {readRitaStrictProjection} from './unified-engine/src/rita-strict-projection.js';
import {readNativeContextScalar} from './native-context-scalar.js?v=0.25.0';
import {readCatnetNativeScalar} from './catnet-native-scalar.js?v=0.25.0';
import {prepareCatnetScopedBlobRequest,analyzeCatnetScopedBlob,catnetScopedToolResult} from './catnet-scoped-client.js?v=0.25.0';
import {previewGhostContexts} from './ghost-context-parameter-preview.js?v=0.25.0';
import {createGhostSurfacePreview,ghostSurfacePreviewContract} from './ghost-surface-preview.js?v=0.25.0';
import {sourceRegionDetectionInput} from './source-region-preparation.js?v=0.25.0';
import {assertM2SourceRegionTask} from './unified-engine/src/m2-source-region-input.js';
import {withM2NativeSourceTransport} from './unified-engine/src/m2-native-source-client.js';
import {compileOriginalSourceRegions} from './unified-engine/src/source-region-geometry.js';
import {sourceRegionDomainShape,assertSourceRegionOperation} from './unified-engine/src/source-region-capabilities.js';
import {ocrDisplay,updateOcrPresentation,renderOcrWindow} from './ocr-presentation.js?v=0.25.0';
import {createParameterPreview,supportsScopedParameterPreview} from './tool-parameter-preview.js?v=0.25.0';
import {createParameterRegionSampler} from './parameter-preview-source-regions.js?v=0.25.0';
import {createAdaptivePreview} from './adaptive-preview.js?v=0.25.0';
import {renderRetainedPreview,updateRetainedParameters,retainedPreviewWorkingBytes,renderRetainedWindow,planRetainedPreview} from './retained-parameter-preview.js?v=0.25.0';
import {parameterPreviewPolicy,retainedNativeBasisStatus} from './parameter-preview-policy.js?v=0.25.0';
import {isExtensionTool,extensionConfiguration} from './extension-tools.js?v=0.25.0';
import {dtdFrame} from './dtd-presentation.js?v=0.25.0';
import {comprintFrame} from './comprint-presentation.js?v=0.25.0';
import {extensionSourcePresentation,responseSourceSurface,responseProxyKey} from './extension-source-presentation.js?v=0.25.0';
import {truforHeatFrame} from './trufor-palette.js?v=0.25.0';
import {ritaFrame,ritaDisplayThreshold,ritaDisplayOpacity} from './rita-presentation.js?v=0.25.0';
import {displayGeometry} from './unified-engine/src/display-sampling.js';
import {localFeaturePolicy} from './feature-policy.js?v=0.25.0';
import {composeCloneFrame,sampleCloneField,d2AnalysisKey,neuralDisplays} from './neural-clone-ui.js?v=0.25.0';
import {samplePixels} from './unified-engine/src/display-sampling.js';
import {individualModels,m2ToolClient} from './tool-models.js?v=0.25.0';
import {createWorkerEngine} from './unified-engine/src/worker-client.js';
import {D2PRL_MODEL_IDENTITY} from './unified-engine/src/d2prl-model-identity.js';
import {createExportSink} from './export-sink.js?v=0.25.0';
import {exportSinkScopeFor} from './export-sink-owner.js?v=0.25.0';
import {exportPresentationRaster} from './raster-export-client.js?v=0.25.0';
import {createCloneWindowPresenter,cloneScientificField} from './neural-window-presentation.js?v=0.25.0';
import {EngineError,checkAbort} from './unified-engine/src/errors.js';
import {composeBiomeWindow,biomePresentationWorkingBytes} from './detection-biome-presentation.js?v=0.25.0';

// Dense native counters may exceed JS's exact-number range. Keep their decimal
// values as strings in JSON; borrow scientific typed arrays without copying them.
export function jsonExportValue(value){
 if(typeof value==='bigint')return value.toString();
 if(ArrayBuffer.isView(value))return value instanceof BigInt64Array||value instanceof BigUint64Array?Array.from(value,String):value;
 if(Array.isArray(value))return value.map(jsonExportValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key,item])=>!(key==='parameterViews'&&Array.isArray(item)&&item.every(view=>view?.retainedParameterView))).map(([k,v])=>[k,jsonExportValue(v)]));
 return value;
}

export function sparseNpzPreparationBytes(result){
 const bound=v=>ArrayBuffer.isView(v)?v.length*32+2:v===null||typeof v!=='object'?typeof v==='string'?v.length*6+2:32:Object.entries(v).reduce((n,[k,x])=>n+k.length*6+bound(x)+4,2);
 // The native NPZ keeps numeric arrays AND a nested JSON mirror of their rows.
 // Allow both representations and their row headers before serialization.
 return 65536+8*(bound(result.data)+bound(result.provenance)+bound(result.style)+bound(result.visible));
}

export function resultResources(result){
 const surfaces=new Map(),tables=new Map();const visit=value=>{if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||value.retainedParameterView)return;
  if(typeof value.id==='string'&&Number.isInteger(value.revision)){if(Number.isInteger(value.rowCount)&&Array.isArray(value.columns))tables.set(value.id,value);else if(Number.isInteger(value.width)&&Number.isInteger(value.height)&&typeof value.format==='string')surfaces.set(value.id,value);}
  for(const v of Object.values(value))visit(v);
 };visit(result);return {surfaces:[...surfaces.values()],tables:[...tables.values()]};
}
// Configuration belongs to the engine, which can outlive an individual tool
// document. Query its actual state so retries and other documents cannot leave
// a client-side variant flag out of sync with the guarded native adapter.
export async function configureSegmentationModel(engine,model,hooks={}){
 checkAbort(hooks.signal);
 const capabilities=await engine.capabilities(),operation=capabilities.operations?.find(value=>value.id==='ai.clones.segmentation');
 if(!operation||!Object.hasOwn(operation,'configuredVariant'))throw new EngineError('UNSUPPORTED_OPERATION','Segmentation configuration state is unavailable.');
 checkAbort(hooks.signal);
 if(operation.configuredVariant===model.variant)return;
 if(operation.configuredVariant!==null)await engine.unloadSegmentationModel();
 checkAbort(hooks.signal);
 await engine.loadSegmentationModel(model,hooks);
}
export async function configureExtensionModels(engine,configuration,hooks={}){
 checkAbort(hooks.signal);const caps=await engine.capabilities();checkAbort(hooks.signal);
 if(!caps.extensions?.configured)await engine.loadExtensionModels(configuration,hooks);
}
export async function createToolClient({computeProfile='maximum',onProgress=()=>{},onInvalidated=()=>{},onParameterExportRetired,engineFactory=createWorkerEngine,m2Factory=m2ToolClient,memoryBudgetBytes,m2MemoryBudgetBytes=Infinity,resourceHints}={}){
 const deployment=await (await fetch(new URL('./integrated-config.json?v=0.25.0',import.meta.url))).json();
 const base=new URL(deployment.assetBase,new URL('./integrated-config.json?v=0.25.0',import.meta.url));
 const asset=name=>new URL(name,base).href;
 const engine=engineFactory({computeProfile,...(resourceHints?{resourceHints}:{}),...(memoryBudgetBytes?{memoryBudgetBytes}:{}),...(deployment.memoryExtensionId?{memoryExtensionId:deployment.memoryExtensionId}:{})});
 const cloneWindowPresenter=createCloneWindowPresenter({reserve:bytes=>engine.reserveExternalMemory({bytes}),release:lease=>engine.releaseExternalMemory(lease.id)});
 let queue=Promise.resolve(),disposed=false,controller,source,result,reference,mask,prnu,median,quality,m3Loaded=false,m3OcrLoaded=false,d2Loaded=false,segmentationModels,m2=null,m2Method=null,m2PresentationSource=null;
 let parameterPreview=null,parameterReferenceInput=null,parameterPreviewReader=null,parameterPreviewKey=null,parameterPreviewRetirement=Promise.resolve(),parameterPreviewBarrier=null;const retiringParameterPreviews=new Set();
 const retainedPreviews=new Set();let disposal,ghostSurfacePreview,coreResultRetirement,publicResultRetirement,retainedController;
 // A live presenter still owns its buffers. Only a finally-started retirement
 // may be retried by another lifecycle operation; never wait for it in this lane.
 const retainedParameterPreviewLeases=new Map();
 async function releaseRetainedParameterPreviewLease(lease){const record=retainedParameterPreviewLeases.get(lease.id);if(record)record.retiring=true;const ack=await engine.releaseExternalMemory(lease.id);if(ack===false||ack===0)throw new EngineError('PREVIEW_UNAVAILABLE','Preview RGB retirement was not acknowledged.');if(responseProxy?.lease.id===lease.id)responseProxy=null;if(ritaProxy?.lease.id===lease.id)ritaProxy=null;retainedParameterPreviewLeases.delete(lease.id);}
 async function drainRetainedParameterPreviewLeases(){let failed=false,primary;for(const record of [...retainedParameterPreviewLeases.values()])if(record.retiring)try{await releaseRetainedParameterPreviewLease(record.lease);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
 const ritaNumericPreviewLeases=new Map();
 async function releaseRitaNumericPreviewLease(record){record.retiring=true;const ack=await record.owner.releaseExternalMemory(record.lease.id);if(ack===false||ack===0)throw new EngineError('PREVIEW_UNAVAILABLE','RITA numeric workspace retirement was not acknowledged.');ritaNumericPreviewLeases.delete(record.lease.id);}
 async function drainRitaNumericPreviewLeases(){for(const record of [...ritaNumericPreviewLeases.values()])if(record.retiring)await releaseRitaNumericPreviewLease(record);}
 const nativeClonePreviewLeases=new Map();
 async function releaseNativeClonePreviewLease(lease){const record=nativeClonePreviewLeases.get(lease.id);if(record)record.retiring=true;await engine.releaseExternalMemory(lease.id);nativeClonePreviewLeases.delete(lease.id);}
 async function drainNativeClonePreviewLeases(){let failed=false,primary;for(const record of [...nativeClonePreviewLeases.values()])if(record.retiring)try{await releaseNativeClonePreviewLease(record.lease);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}

 const retainedRetirement=createRetainedResultRetirement({resources:resultResources,releaseSurface:id=>engine.releaseSurface(id),releaseTable:id=>engine.releaseTable(id),protectedResources:()=>{const current=resultResources(result);return{surfaces:[...current.surfaces,...[...sourceAliases].map(id=>({id})),...(source?.surface?[source.surface]:[])],tables:current.tables};}});
 const displayAdaptive=createAdaptivePreview();
 async function drainRetainedPreviewWorkspaces(){await drainRitaNumericPreviewLeases();await drainNativeClonePreviewLeases();await drainRetainedParameterPreviewLeases();}
 function hasRetiringRetainedPreviewWorkspace(){return [...retainedParameterPreviewLeases.values(),...nativeClonePreviewLeases.values()].some(record=>record.retiring);}
 function retainedPreviewFailureCode(error){try{return error?.code;}catch{return undefined;}}
 // These callers already own the engine queue. Do not enqueue their ACK into
 // the lane they occupy, or wait for another live presenter in that same lane.
 async function serialRetainedPreviewWorkspace(bytes,action){
  await drainRetainedPreviewWorkspaces();
  let complete;const done=new Promise(resolve=>complete=resolve);retainedPreviews.add(done);
  let lease,record,failed=false,primary;
  try{
   lease=await engine.reserveExternalMemory({bytes});record={lease,retiring:false};retainedParameterPreviewLeases.set(lease.id,record);
   return await action();
  }catch(error){failed=true;primary=error;if(record){record.failed=true;record.primary=error;}throw error;}
  finally{
   try{if(lease)await releaseRetainedParameterPreviewLease(lease);}
   catch(cleanup){
    // The record and its credit survive primitive/frozen primaries and NACKs.
    if(record)record.cleanupError=cleanup;
    if(!failed)throw cleanup;
    try{if(Object.isExtensible(primary))primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];}catch{}
   }finally{retainedPreviews.delete(done);complete();}
  }
 }
 async function previewPixelsBudget(bytesPerPixel=40,fixedBytes=256*1024){
  const memory=(await engine.capabilities()).memory??{};
  const budget=memory.budgetBytes??memoryBudgetBytes??64*1024**2;
  const used=(memory.retainedBytes??0)+(memory.cacheBytes??0)+(memory.activeReservationBytes??0)+(memory.knownHeapCapacityBytes??0);
  const available=Math.max(0,budget-used-fixedBytes),pixels=Math.min(2048**2,Math.floor(available/bytesPerPixel));
  if(pixels<16**2)throw new EngineError('PREVIEW_UNAVAILABLE','No bounded workspace is available for a provisional display.');return pixels;
 }
 async function displayPreviewPlan(display){
  const key='response/'+(display.ritaPresentation?'rita':display.comprintPresentation?'comprint':'dtd')+'/'+(display.ritaPresentation?.mode??display.comprintPresentation?.mode??display.dtdPresentation?.mode??'map');
  const plan=displayAdaptive.plan({key,width:display.width,height:display.height,maxSide:2048,maxPixels:await previewPixelsBudget(40)});
  return{...display,responsePreview:true,previewStep:plan.step,adaptivePreview:{token:plan.token}};
 }

 let d2Analysis=null,responseProxy=null,ritaProxy=null;let sourceInput;const sourceAliases=new Set(),preparationSources=new Set();
 const invalidated=()=>{for(const reader of preparationSources)reader.invalidate();preparationSources.clear();void clearResponseProxy().catch(()=>{});void clearRitaProxy().catch(()=>{});d2Analysis=null;const resultLost=!!result&&!result.m2Result;if(!result?.m2Result)result=null;source=reference=mask=prnu=median=quality=null;m3Loaded=m3OcrLoaded=d2Loaded=false;onInvalidated({resultLost});};
 engine.onSourceInvalidation?.(invalidated);
 const resolve=value=>Array.isArray(value)?value.map(resolve):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='url'?asset(v):resolve(v)])):value;
 const enqueue=fn=>{const task=queue.then(()=>{if(disposed)throw Object.assign(Error('Outil fermé'),{code:'CANCELLED'});return fn();});queue=task.catch(()=>{});return task;};
 const retiredM2Failures=new WeakSet();
 const hooks=()=>({signal:controller?.signal,onProgress});
 const work=async(fn,{signal:outerSignal}={})=>{const local=controller=new AbortController(),abort=()=>local.abort(outerSignal?.reason);outerSignal?.addEventListener('abort',abort,{once:true});if(outerSignal?.aborted)abort();try{checkAbort(local.signal);return await fn();}catch(error){if(m2&&!retiredM2Failures.has(error)&&['WORKER_FAILED','WORKER_MESSAGE_FAILED','WORKER_LOAD_FAILED','DISPOSED'].includes(error?.code)){const failed=m2;m2=null;m2Method=null;if(result?.m2Result)result=null;await failed.dispose().catch(()=>{});}if(error?.imagesCleared){for(const reader of preparationSources)reader.invalidate();preparationSources.clear();d2Analysis=null;source=result=reference=mask=prnu=median=quality=null;m3Loaded=m3OcrLoaded=d2Loaded=false;}throw error;}finally{outerSignal?.removeEventListener('abort',abort);if(controller===local)controller=null;}};
 async function clearGhostSurfacePreview(){const old=ghostSurfacePreview;if(!old)return;try{await old.dispose();if(ghostSurfacePreview===old)ghostSurfacePreview=null;}catch(error){throw error;}}
 async function release(){
   await drainRetainedPreviewWorkspaces();
   await cloneWindowPresenter.drain();
   await retainedRetirement.drain();
  await clearGhostSurfacePreview();await clearResponseProxy();await clearRitaProxy();
  if(!result){coreResultRetirement=null;if(m2PresentationSource){await m2PresentationSource.dispose();m2PresentationSource=null;}return;}
  if(result.m2Result){await m2.release(result.m2Result.id);result=null;if(m2PresentationSource){await m2PresentationSource.dispose();m2PresentationSource=null;}return;}
  const previous=result;
  if(coreResultRetirement?.result!==previous){const resources=resultResources(previous);coreResultRetirement={result:previous,surfaces:new Set(resources.surfaces.filter(s=>s.id!==source?.surface.id).map(s=>s.id)),tables:new Set(resources.tables.map(t=>t.id))};}
  const pending=coreResultRetirement,failures=[];
  // Successful ACKs retire only their own handles. Keep the public result and
  // every remaining owner reachable if another surface or table needs a retry.
  for(const id of [...pending.surfaces])try{await engine.releaseSurface(id);pending.surfaces.delete(id);}catch(error){failures.push(error);}
  for(const id of [...pending.tables])try{await engine.releaseTable(id);pending.tables.delete(id);}catch(error){failures.push(error);}
  if(!pending.surfaces.size&&!pending.tables.size){if(result===previous)result=null;if(coreResultRetirement===pending)coreResultRetirement=null;}
  if(failures.length){const primary=failures[0];if(failures.length>1&&Object.isExtensible(primary))try{primary.cleanupErrors=failures.slice(1);}catch{}throw primary;}
 }
 function clearParameterPreview(){const previous=parameterPreviewRetirement,old=parameterPreview,reader=parameterPreviewReader;parameterPreview=null;parameterPreviewReader=null;parameterPreviewKey=null;if(old||reader)retiringParameterPreviews.add({old,reader});const retiring=(async()=>{await previous.catch(()=>{});const failures=[];for(const record of [...retiringParameterPreviews]){try{await record.old?.dispose();await record.reader?.dispose();retiringParameterPreviews.delete(record);}catch(error){failures.push(error);}}if(failures.length)throw failures[0];})();parameterPreviewRetirement=retiring;return retiring;}
 async function settleParameterPreview(){await parameterPreviewRetirement;await parameterPreview?.settle();}
 function beforeQueuedParameterPreview(retire){
  // Preserve the ordered source/run queue while allowing its own preview ACK
  // to finish after earlier reads and before the action waiting for that ACK.
  const barrier={before:parameterPreviewBarrier?.before??queue};parameterPreviewBarrier=barrier;
  let pending;try{pending=Promise.resolve(retire());}catch(error){pending=Promise.reject(error);}
  return pending.finally(()=>{if(parameterPreviewBarrier===barrier)parameterPreviewBarrier=null;});
 }
 function updateParameterPreviewReservation(lease,state){const update=()=>engine.updateExternalCache({id:lease.id,...state});return parameterPreviewBarrier?parameterPreviewBarrier.before.then(update):enqueue(update);}
 async function parameterSource({side=192,maxSide=side,signal}={},paired=false,domain=null){
  return enqueue(async()=>{
   checkAbort(signal);await closePreparationSources({pendingOnly:true});let image;
   if(paired){
    const blob=parameterReferenceInput;if(!blob)throw new EngineError('INVALID_INPUT','A comparison reference is required.');
    if(reference?.blob!==blob){if(reference){const old=reference;await engine.unload(old.id);reference=null;}const id='reference-'+crypto.randomUUID(),descriptor=await engine.loadBlob({id,blob,layout:'segmented'});reference={id,blob,surface:descriptor.surface};}
    image=reference;
   }else{if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'});sourceAliases.add(source.surface.id);}image=source;if(domain&&['native-regions','membership'].includes(sourceRegionDomainShape(domain))){if(!parameterPreviewReader||parameterPreviewReader.sourceRegionDomain.fingerprint!==domain.fingerprint){await parameterPreviewReader?.dispose();parameterPreviewReader=createParameterRegionSampler({engine,source,domain});}return parameterPreviewReader.read({maxSide,signal});}if(domain&&sourceRegionDomainShape(domain)==='rectangle'){if(!parameterPreviewReader||parameterPreviewReader.sourceRegionDomain.fingerprint!==domain.fingerprint){await parameterPreviewReader?.dispose();parameterPreviewReader=await acquireSourceRegionReaderNow({sourceRegionDomain:domain,purpose:'analysis-rectangle'},{ownerQueue:true});}image={id:source.id,sha256:source.sha256,surface:parameterPreviewReader.sourceRegionSourceSurface};}}
   if(!image?.surface)throw new EngineError('CACHE_MISS','Preview source is unavailable.');
   const d=image.surface,step=Math.max(1,Math.ceil(Math.max(d.width,d.height)/Math.max(1,Math.min(2048,maxSide)))),lease=await engine.reserveExternalMemory({bytes:Math.ceil(d.width/step)*Math.ceil(d.height/step)*3});
   try{const {pixels}=await engine.readDisplay({surfaceId:d.id,revision:d.revision,tile:{x:0,y:0,w:d.width,h:d.height,step}});checkAbort(signal);return {pixels,logicalWidth:d.width,logicalHeight:d.height,sourceIdentity:domain?[image.sha256??image.id,domain.fingerprint]:image.sha256??image.id};}
   finally{await engine.releaseExternalMemory(lease.id);}
  });
 }
 async function sourceRegionTask(task,extras={}, {admit=true,signal}={}){
  const input=task.sourceRegionDomain??extras.sourceRegionDomain;if(input===undefined||input===null)return task;
  checkAbort(signal);const domain=await compileOriginalSourceRegions(input);checkAbort(signal);
  const d=source?.surface;if(!d||source.sha256!==domain.sourceSha256||d.width!==domain.sourceWidth||d.height!==domain.sourceHeight)throw new EngineError('SOURCE_REGIONS_INVALID','These original-source regions belong to another source or native grid.');
  if(task.sourceRegionDomain&&extras.sourceRegionDomain&&task.sourceRegionDomain!==extras.sourceRegionDomain){const other=await compileOriginalSourceRegions(extras.sourceRegionDomain);if(other.fingerprint!==domain.fingerprint)throw new EngineError('SOURCE_REGIONS_INVALID','Task and source-region transport disagree.');}
  if(admit){if(task.operation?.startsWith('m2.'))assertM2SourceRegionTask(task,domain);else{const capabilities=(await engine.capabilities()).sourceRegions;checkAbort(signal);assertSourceRegionOperation(task.operation,{shape:sourceRegionDomainShape(domain),params:task.params,task,capabilities});}}
  return{...task,sourceRegionDomain:domain.descriptor};
 }
 async function closePreparationSources({pendingOnly=false}={}){let failed=false,primary;for(const reader of [...preparationSources]){if(pendingOnly&&!reader.retiring)continue;try{await reader.close();}catch(error){if(!failed){failed=true;primary=error;}}}if(failed)throw primary;}
 function acquireSourceRegionReader(options={}){const{sourceRegionDomain,purpose,scientificConsumer}=options;return enqueue(()=>acquireSourceRegionReaderNow({sourceRegionDomain,purpose,scientificConsumer}));}
 function acquirePreparationSource(options={}){return acquireSourceRegionReader({...options,purpose:'preparation-envelope'});}
 // M2 owns the outer tool queue while it requests source windows. Its borrowed
 // reader uses a separate serialized lane, never enqueuing behind that M2 run.
 async function acquireSourceRegionReaderNow({sourceRegionDomain,purpose,scientificConsumer='m2.cfa'}={}, {ownerQueue=false}={}){
   if(!['analysis-rectangle','preparation-envelope','analysis-native-contexts'].includes(purpose))throw new EngineError('INVALID_INPUT','An explicit native source-reader purpose is required.');
   if(!source?.surface)throw new EngineError('NOT_FOUND','The original preparation source is no longer loaded.');
   const task=await sourceRegionTask({imageId:source.id,sourceRegionDomain},{},{admit:false});
   if(!task.sourceRegionDomain)throw new EngineError('SOURCE_REGIONS_INVALID','An explicit original-source domain is required for native preparation.');
   if(purpose==='analysis-rectangle'&&!['identity','rectangle'].includes(sourceRegionDomainShape(task.sourceRegionDomain)))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','A scientific native reader cannot replace holes by their enclosing rectangle.');
   const answer=await engine.deriveSourceRegionInput({imageId:source.id,sourceRegionDomain:task.sourceRegionDomain,purpose,...(purpose==='analysis-native-contexts'?{scientificConsumer}:{})}),display=answer.sourceRegionSourceSurface;
   let closed=false,invalid=false,retired=false,surfaceReleased=false,closing,disposal,readerQueue=Promise.resolve();const leases=new Map();
   const schedule=fn=>{if(!ownerQueue)return enqueue(fn);const task=readerQueue.then(fn);readerQueue=task.catch(()=>{});return task;};
   const close=()=>{if(retired)return Promise.resolve();if(closing)return closing;closed=true;return closing=(async()=>{let failed=false,primary;for(const lease of [...leases.values()])try{await engine.releaseExternalMemory(lease.id);leases.delete(lease.id);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;if(!invalid&&!surfaceReleased){await engine.releaseSurface(display.id);surfaceReleased=true;}retired=true;preparationSources.delete(owner);})().finally(()=>{closing=null;});};
   const owner={get retiring(){return closed&&!retired;},close(){closed=true;return ownerQueue?readerQueue.then(close):close();},invalidate(){closed=invalid=true;leases.clear();}};preparationSources.add(owner);
   return{width:answer.width,height:answer.height,format:'rgb8',sha256:answer.originalSha256,origin:answer.sourceRegionOrigin,sourceRegionDomain:answer.sourceRegionDomain,sourceRegionSourceSurface:display,purpose,sourceRegionContext:answer.sourceRegionContext,...(purpose!=='preparation-envelope'?{analysisContext:answer.analysisContext}:{preparationContext:answer.preparationContext}),provenance:answer.provenance,
    readWindow:(rect,{signal}={})=>schedule(async()=>{
     checkAbort(signal);if(closed)throw new EngineError('DISPOSED','Native preparation source is closed.');
     const {x,y,width,height}=rect??{},bytes=width*height*3;
     if(![x,y,width,height].every(Number.isSafeInteger)||x<0||y<0||width<1||height<1||x+width>answer.width||y+height>answer.height||!Number.isSafeInteger(bytes)||bytes>1024**2)throw new EngineError('INVALID_INPUT','Native preparation reads must fit one MiB of original RGB pixels.');
     // Window plus the provider's bounded transferable copy remain admitted together.
     const lease=await engine.reserveExternalMemory({bytes:bytes*2+65536});leases.set(lease.id,lease);let published=false,failed=false,primary;
     try{const output=await engine.readPixels({surfaceId:display.id,revision:display.revision,rect:{x,y,width,height}});checkAbort(signal);if(closed)throw new EngineError('DISPOSED','Native preparation source closed during its read.');
      if(output.pixels?.format!=='rgb8'||output.pixels.width!==width||output.pixels.height!==height||!(output.pixels.data instanceof Uint8Array)||output.pixels.data.length!==bytes)throw new EngineError('INVALID_RESULT','Native preparation returned another RGB grid.');
      published=true;let releasing;return{pixels:output.pixels,release(){if(!leases.has(lease.id))return Promise.resolve();if(releasing)return releasing;return releasing=schedule(async()=>{if(leases.has(lease.id))try{await engine.releaseExternalMemory(lease.id);leases.delete(lease.id);}catch(error){closed=true;throw error;}}).finally(()=>{releasing=null;});}};
     }catch(error){failed=true;primary=error;throw error;}finally{if(!published&&leases.has(lease.id))try{await engine.releaseExternalMemory(lease.id);leases.delete(lease.id);}catch(error){closed=true;if(failed){if(primary!==null&&(typeof primary==='object'||typeof primary==='function')&&Object.isExtensible(primary))try{primary.cleanupError=error;}catch{}}else throw error;}}
    }),
    dispose(){if(retired)return Promise.resolve();if(disposal)return disposal;closed=true;return disposal=schedule(close).finally(()=>{disposal=null;});}
   };
 }
 async function previewParameters(task,{field,signal,extras={},adaptiveFeedback,previewControl,heldPreviewIntent}={}){
  const intent=heldPreviewIntent?structuredClone(heldPreviewIntent):null;
  const held=(answer,family)=>{
   if(!answer||!intent||task.operation==='detail.frequency')return answer;
   let calculatedParams=answer.params??answer.preview?.params??answer.metrics?.previewParams??task.params;
   if(family==='native-postprocess'&&policy.strategy==='safire-grouping'&&Number.isFinite(answer.preview?.effectiveMinimum))calculatedParams={...calculatedParams,minimum:answer.preview.effectiveMinimum};
   return{...answer,heldPreview:{version:1,family,operation:task.operation,requested:intent,calculated:{params:structuredClone(calculatedParams??{}),view:structuredClone(task.view??{})},producerRequested:{params:structuredClone(task.params??{}),view:structuredClone(task.view??{})}}};
  };
  checkAbort(signal);task=await sourceRegionTask(task,extras,{admit:false,signal});const domain=task.sourceRegionDomain,shape=domain?sourceRegionDomainShape(domain):'identity',policy=parameterPreviewPolicy(task.toolId??task.operation,field,task.params),sameDomain=(result?.sourceRegionDomain?.fingerprint??null)===(domain?.fingerprint??null),previewSource=sameDomain?(result?.sourceRegionSourceSurface??source?.surface):source?.surface;
  // Enter the retained transaction before taking its engine queue. Its RGB
  // callback must use private direct readers, never enqueue behind itself.
  if(policy.strategy==='d2prl-refilter'){
   if(task.operation!=='ai.clones.d2prl'||field!=='minimum'||!sameDomain)return null;
   const currentSource=source,currentResult=result,analysis=d2Analysis,started=performance.now(),layer=extras.neuralView??'overlay';
   const current=()=>!disposed&&!signal?.aborted&&source===currentSource&&!!currentSource&&result===currentResult&&!!currentResult&&d2Analysis===analysis&&!!analysis;
   const assertCurrent=()=>{checkAbort(signal);if(!current())throw new EngineError('CANCELLED','Retained D2PRL preview owner changed.');};
   if(!current()||!retainedNativeBasisStatus(policy,{source,result},task).available)return null;
   let answer;
   await updateRetained(task,{field,signal,temporaryD2:true,isCurrent:current,onRetainedResult:async(next,context)=>{
    assertCurrent();if(!context.isCurrent())return false;
    const minimum=next?.data?.metadata?.min_component,analysisId=next?.data?.metadata?.analysisId;
    if(next?.operation!=='ai.clones.d2prl'||next.metrics?.inferences!==0||minimum!==task.params?.minimum||analysisId!==analysis.analysisId)throw new EngineError('PREVIEW_UNAVAILABLE','The temporary D2PRL refilter differs from its native bank or minimum.');
    // Borrow the committed crop only for this local reader. Adding it to next
    // would make successor retirement mistake the donor's handle for its own.
    const displayOutput=currentResult.sourceRegionSourceSurface?{...next,sourceRegionSourceSurface:currentResult.sourceRegionSourceSurface,sourceRegionOrigin:currentResult.sourceRegionOrigin,sourceRegionDomain:currentResult.sourceRegionDomain}:next;
    const display=neuralDisplays(displayOutput,'en')?.find(value=>value.display.cloneView===layer)?.display;
    if(!display)return false;
    const maxPixels=await previewPixelsBudget(40,65536);assertCurrent();
    const plan=planRetainedPreview({output:next,operation:task.operation,params:task.params,view:{...task.view,mode:layer},field,source:previewSource,maxPixels});
    if(!plan||plan.logicalWidth!==display.width||plan.logicalHeight!==display.height)return false;
    await serialRetainedPreviewWorkspace(plan.pixels*40+65536,async()=>{
     assertCurrent();if(!context.isCurrent())return;
     const pixels=await clonePixels(display,{x:0,y:0,w:display.width,h:display.height,step:plan.step},{assertCurrent});
     assertCurrent();if(!context.isCurrent())return;
     if(pixels?.format!=='rgb8'||pixels.width!==plan.width||pixels.height!==plan.height||!(pixels.data instanceof Uint8Array)||pixels.data.length!==plan.pixels*3)throw new EngineError('PREVIEW_UNAVAILABLE','The temporary D2PRL RGB differs from its admitted display grid.');
     const milliseconds=performance.now()-started;
     answer={operation:task.operation,pixels:{...pixels,logicalWidth:display.width,logicalHeight:display.height,previewCoordinates:'source'},logicalWidth:display.width,logicalHeight:display.height,params:{minimum},provisional:true,exact:false,approximate:true,exportable:false,...(next.sourceRegionDomain?{sourceRegionDomain:next.sourceRegionDomain,sourceRegionOrigin:[...next.sourceRegionOrigin]}:{}),metrics:{inferences:0,retainedD2Refilter:true,calculatedMinimum:minimum,nativeAnalysisId:analysisId,displayLayer:layer,displayStep:plan.step,maximumFramePixels:plan.pixels,totalMs:milliseconds,adaptivePreview:{token:plan.token,milliseconds,setupMilliseconds:0,cold:false,pixels:plan.pixels}}};
    });
    return false;
   }});
   return current()?answer??null:null;
  }
  const nativeScopedPixel=!!domain&&['native-regions','membership'].includes(shape)&&(policy.kind==='pixel-proxy'||policy.fallback==='pixel-proxy')&&supportsScopedParameterPreview(task.operation);
  const nativeGhostScientific=!!domain&&['native-regions','membership'].includes(shape)&&task.operation==='jpeg.ghosts'&&policy.kind==='pixel-proxy'&&['low','high','step','x','y'].includes(field);
  const nativeGhostRetained=sameDomain&&policy.kind==='retained'&&policy.strategy==='ghosts'&&ghostSurfacePreviewContract({output:result,params:task.params,view:task.view});
  const nativeSafireGrouping=sameDomain&&result?.operation===task.operation&&['native-regions','membership'].includes(shape)&&task.operation==='ai.sources.safire'&&policy.kind==='retained'&&policy.strategy==='safire-grouping';
  const nativeResearchView=sameDomain&&result?.operation===task.operation&&['native-regions','membership'].includes(shape)&&['ai.sources.safire','ai.localization.focal','ai.localization.adaifl'].includes(task.operation)&&policy.kind==='retained'&&policy.strategy==='research'&&['view.mode','researchView'].includes(field)&&result?.data?.metadata?.strictSourceRegions?.schema==='sherloq.strict-research/1'&&Array.isArray(result?.data?.fragments);
  const nativeNoisesnifferRetained=sameDomain&&result?.operation===task.operation&&['native-regions','membership'].includes(shape)&&task.operation==='noise.noisesniffer'&&policy.kind==='retained'&&policy.strategy==='noisesniffer-native-cache'&&['blockSize','samplesPerBin','lowFrequencyFraction','cellSize','lowNoiseFraction','view'].includes(field)&&result?.metrics?.sourceRegionStatistics===true;
  // Display-only clone previews borrow a verified native crop and complete
  // tables. RGB in its envelope is background, never an analysis observation.
  const clonePrior=task.operation==='tampering.copyMove.dense'?result?.provenance?.sourceRegionOriginalParams:result?.provenance?.params??result?.data?.params;
  const cloneParams=task.params??{},cloneParamsEqual=clonePrior&&new Set([...Object.keys(cloneParams),...Object.keys(clonePrior)]).size===Object.keys(cloneParams).length&&Object.keys(cloneParams).every(key=>Object.hasOwn(clonePrior,key)&&JSON.stringify(cloneParams[key])===JSON.stringify(clonePrior[key]));
  const cloneSurface=result?.sourceRegionSourceSurface,cloneGrid=result?.provenance?.sourceRegionGrid;
  const nativeClonesView=sameDomain&&policy.kind==='retained'&&policy.strategy==='clones'&&['tampering.copyMove.sparse','tampering.copyMove.dense'].includes(task.operation)&&result?.operation===task.operation&&['native-regions','membership'].includes(shape)&&result?.provenance?.originalSha256===source?.sha256&&cloneParamsEqual&&cloneSurface?.format==='rgb8'&&typeof cloneSurface.id==='string'&&Number.isSafeInteger(cloneSurface.revision)&&cloneSurface.revision>0&&cloneSurface.width===domain.width&&cloneSurface.height===domain.height&&cloneGrid?.width===domain.width&&cloneGrid.height===domain.height&&cloneGrid.sourceWidth===source.surface.width&&cloneGrid.sourceHeight===source.surface.height&&JSON.stringify(result.sourceRegionOrigin)===JSON.stringify(domain.origin)&&retainedNativeBasisStatus({...policy,nativeBasis:'required',nativeBasisMutableParams:[]},{source,result},task).available;
  const classicalZoned=!!domain&&shape!=='identity'&&['tampering.copyMove.brisk','tampering.copyMove.orb','tampering.copyMove.akaze'].includes(task.operation)&&policy.kind==='retained'&&policy.strategy==='clones-classical';
  const nativeClassicalRetained=classicalZoned&&sameDomain&&classicalContextPreviewCandidate({output:result,source,domain,operation:task.operation,params:task.params});
  if(classicalZoned&&!nativeClassicalRetained)return null;
  const nativeMedianRetained=sameDomain&&policy.kind==='retained'&&policy.strategy==='median'&&['native-regions','membership'].includes(shape)&&medianContextPreviewCandidate({output:result,source,domain,params:task.params,backend:task.backend??'auto'})&&retainedNativeBasisStatus(policy,{source,result},task).available;
  const resamplingContext=sameDomain&&policy.kind==='retained'&&policy.strategy==='resampling'&&['native-regions','membership'].includes(shape)?resamplingContextPreviewContract({output:result,source,domain,task,field}):null;
  const nativeResamplingRetained=!!resamplingContext;
  const nativeSsgRetained=sameDomain&&policy.strategy==='ssg-localization'&&result?.data?.params?.algorithm==='SSG';
   if(nativeSsgRetained){const currentSource=source,currentResult=result,assertCurrent=()=>{checkAbort(signal);if(disposed||source!==currentSource||result!==currentResult)throw new EngineError('CANCELLED','SSG retained preview source or result changed.');};
    if(!currentSource||typeof engine.previewParameters!=='function')return null;
    return enqueue(async()=>{assertCurrent();const maxPixels=await previewPixelsBudget(40);assertCurrent();const args={output:currentResult,operation:task.operation,params:task.params,view:task.view,field,source:previewSource,signal},plan=planRetainedPreview({...args,maxSide:512,maxPixels});if(!plan)return null;return serialRetainedPreviewWorkspace(plan.pixels*40+65536,async()=>{const started=performance.now();try{
     const answer=await engine.previewParameters({...task,id:'ssg-parameter-preview-'+crypto.randomUUID(),imageId:currentSource.id},{preview:{maxSide:plan.side,maxPixels:plan.pixels,targetMs:50,presentationGrid:{width:plan.width,height:plan.height,step:plan.step,logicalWidth:plan.logicalWidth,logicalHeight:plan.logicalHeight}},signal});assertCurrent();if(!answer?.ssgMaskDraft)return null;
     const rendered=await renderRetainedPreview({...args,adaptivePlan:plan,ssgMaskDraft:answer.ssgMaskDraft,readSource:g=>engine.readDisplay({surfaceId:previewSource.id,revision:previewSource.revision,tile:g},{signal}).then(r=>r.pixels)});assertCurrent();return rendered&&{...rendered,...(domain?{sourceRegionDomain:domain,sourceRegionOrigin:[...domain.origin]}:{}),metrics:{...rendered.metrics,nativeAnalysisCalls:0,inferenceCalls:0,adaptivePreview:{token:plan.token,milliseconds:performance.now()-started,setupMilliseconds:0,cold:false,pixels:rendered.pixels.width*rendered.pixels.height}}};
    }catch(error){if(['PREVIEW_UNAVAILABLE','CACHE_MISS'].includes(retainedPreviewFailureCode(error)))return null;throw error;}});});
   }
   if(!['identity','rectangle'].includes(shape)&&!(shape==='membership'&&sameDomain&&task.operation==='inspection.histogram'&&policy.kind==='retained')&&!nativeGhostRetained&&!nativeGhostScientific&&!nativeSafireGrouping&&!nativeResearchView&&!nativeNoisesnifferRetained&&!nativeScopedPixel&&!nativeClonesView&&!nativeMedianRetained&&!nativeResamplingRetained&&!nativeClassicalRetained)return null;
  if(shape==='rectangle'||nativeScopedPixel||nativeSafireGrouping||nativeResearchView||nativeNoisesnifferRetained||nativeMedianRetained||nativeResamplingRetained||nativeClassicalRetained){const capabilities=(await engine.capabilities()).sourceRegions;try{assertSourceRegionOperation(task.operation,{shape,params:task.params,task,capabilities});}catch(error){if(error.code==='SOURCE_SCOPE_UNSUPPORTED')return null;throw error;}}
  if(nativeGhostScientific){const currentSource=source,currentResult=result,assertCurrent=()=>{checkAbort(signal);if(disposed||source!==currentSource||result!==currentResult)throw new EngineError('CANCELLED','Scoped Ghost source or result changed.');};return enqueue(async()=>held(await previewGhostContexts({engine,task,source:currentSource,domain,signal,assertCurrent,memoryBudgetBytes}),'ghost-hybrid'));}
  if(policy.kind==='retained'&&['safire-grouping','stereo-native-cache','zero-native-cache','noisesniffer-native-cache'].includes(policy.strategy)){
   const currentResult=result,currentSource=source,assertCurrent=()=>{checkAbort(signal);if(disposed||result!==currentResult||source!==currentSource)throw new EngineError('CANCELLED','Preview source or result changed.');};if(!currentResult||!currentSource||!sameDomain)return null;
   const maxPixels=await enqueue(()=>previewPixelsBudget(40));assertCurrent();const plan=planRetainedPreview({output:currentResult,operation:task.operation,params:task.params,view:task.view,field,source:previewSource,maxPixels});if(!plan)return null;
   try{return await enqueue(async()=>{
    assertCurrent();
    if(typeof engine.previewParameters!=='function')throw new EngineError('PREVIEW_UNAVAILABLE','This engine does not expose retained parameter previews.');
    return serialRetainedPreviewWorkspace(plan.pixels*8+65536,async()=>{const started=performance.now();let rendered;
    {
     assertCurrent();const memory=(await engine.capabilities()).memory??{};assertCurrent();const budget=memory.budgetBytes??memoryBudgetBytes??64*1024**2,available=memory.policyAvailableBytes??Math.max(0,budget-(memory.retainedBytes??0)-(memory.cacheBytes??0)-(memory.activeReservationBytes??0)),maxWorkingBytes=Math.max(0,Math.floor(Math.min(budget/3,available))),targetMs=policy.targetMs??(policy.strategy==='safire-grouping'?200:50);
     const answer=await engine.previewParameters({id:'parameter-preview-'+crypto.randomUUID(),imageId:currentSource.id,operation:task.operation,params:task.params,view:task.view,backend:task.backend??'auto',...(domain?{sourceRegionDomain:domain}:{})},{preview:{maxSide:plan.side,maxPixels:plan.pixels,maxWorkingBytes,targetMs},signal});assertCurrent();
     const pixels=answer?.pixels;if(!pixels||pixels.format!=='rgb8'||!(pixels.data instanceof Uint8Array)||pixels.data.length!==pixels.width*pixels.height*3||pixels.width*pixels.height>plan.pixels||pixels.width>2048||pixels.height>2048)throw new EngineError('INVALID_INPUT','Retained preview exceeded its admitted transport frame.');
     rendered={...answer,exact:false,provisional:true,metrics:{...answer.metrics,adaptivePreview:{token:plan.token,milliseconds:performance.now()-started,setupMilliseconds:answer.metrics?.setupMilliseconds??0,cold:!!answer.metrics?.cold,pixels:pixels.width*pixels.height}}};
    }
    assertCurrent();return held(rendered,'native-postprocess');});
   });}catch(error){if(hasRetiringRetainedPreviewWorkspace())throw error;const code=retainedPreviewFailureCode(error);if(nativeNoisesnifferRetained&&['PREVIEW_UNAVAILABLE','CACHE_MISS'].includes(code))return null;if(policy.fallback!=='pixel-proxy'||!['PREVIEW_UNAVAILABLE','CACHE_MISS'].includes(code))throw error;}
  }
  if(policy.kind==='retained'&&policy.strategy==='histogram'&&result&&sameDomain){
   // A histogram gesture reads the retained 1024 bins, never a pixel raster.
   // Keep its small summary workspace independent from image-preview budgets.
   const currentResult=result,currentSource=source,current=()=>!disposed&&result===currentResult&&source===currentSource;
   const assertCurrent=()=>{checkAbort(signal);if(!current())throw new EngineError('CANCELLED','Histogram source or result changed.');};
   return enqueue(async()=>{
    assertCurrent();
    return serialRetainedPreviewWorkspace(65536,async()=>{assertCurrent();const answer=await renderRetainedPreview({output:currentResult,operation:task.operation,params:task.params,view:task.view,field,signal});assertCurrent();return held(answer&&{...answer,...(domain?{sourceRegionDomain:domain,sourceRegionOrigin:[...domain.origin]}:{})},'retained-tables');});
   });
  }
  if(policy.kind==='retained'&&policy.strategy==='ghosts'&&result&&sameDomain){
   const currentResult=result,currentSource=source,assertCurrent=()=>{checkAbort(signal);if(disposed||result!==currentResult||source!==currentSource)throw new EngineError('CANCELLED','Ghost source or result changed.');};
   return enqueue(async()=>{
    assertCurrent();const args={output:currentResult,operation:task.operation,params:task.params,view:task.view,field,signal},native=ghostSurfacePreviewContract(args),maxPixels=await previewPixelsBudget(native?.spatial?15:native?12:3,native?131072:65536);assertCurrent();const plan=planRetainedPreview({...args,maxPixels});if(!plan)return null;
    return serialRetainedPreviewWorkspace(plan.pixels*3+65536,async()=>{let rendered;
    {
     assertCurrent();let answer;
     if(native){
      // Read only retained scalar/membership handles. Numeric RPCs deliberately
      // settle before checking cancellation, preserving the native result owner.
      ghostSurfacePreview??=createGhostSurfacePreview({readSource:(d,tile)=>engine.readDisplay({surfaceId:d.id,revision:d.revision,tile}).then(r=>r.pixels),readPlane:(d,rect)=>engine.readPlane({surfaceId:d.id,revision:d.revision,rect}),readMask:(d,rect)=>engine.readMask({surfaceId:d.id,revision:d.revision,rect}),reserve:(request,hooks)=>engine.reserveExternalCache?engine.reserveExternalCache(request,hooks):engine.reserveExternalMemory(request),release:held=>engine.releaseExternalCache?engine.releaseExternalCache(held.id):engine.releaseExternalMemory(held.id),...(engine.updateExternalCache?{updateReservation:(held,state)=>engine.updateExternalCache({id:held.id,...state})}:{})});
      answer=await ghostSurfacePreview.preview({...args,plan});
     }else answer=await renderRetainedPreview({...args,adaptivePlan:plan});
     assertCurrent();rendered=answer&&{...answer,...(domain?{sourceRegionDomain:domain,sourceRegionOrigin:[...domain.origin]}:{})};
    }
    assertCurrent();return held(rendered,'ghost-hybrid');});
   });
  }
  if(policy.kind==='retained'&&result&&sameDomain&&policy.fallback!=='pixel-proxy'){
   const currentResult=result,currentSource=source,assertCurrent=()=>{checkAbort(signal);if(disposed||result!==currentResult||source!==currentSource)throw new EngineError('CANCELLED','Retained preview source or result changed.');};
   // This preview borrows native data across queued source reads. Disposal must
   // wait for its owned lease, even after new work has been disabled.
   let complete;const done=new Promise(resolve=>complete=resolve);retainedPreviews.add(done);let lease,failure,failed=false;
   try{
    assertCurrent();const args={output:currentResult,operation:task.operation,params:task.params,view:task.view,field,source:previewSource,signal,...(nativeResamplingRetained?{resamplingContext,assertResamplingCurrent:assertCurrent}:{}),...(nativeMedianRetained?{medianSource:currentSource,medianDomain:domain,isCurrent:()=>!disposed&&source===currentSource&&result===currentResult}:{}),readTile:(display,tile)=>client.readTile(display,tile),readTable:(table,offset,length)=>client.readTable(table,offset,length)};
    if(nativeClassicalRetained)Object.assign(args,{classicalSource:currentSource,classicalDomain:domain,isCurrent:()=>!disposed&&result===currentResult&&source===currentSource&&!signal?.aborted});
    await enqueue(()=>drainRetainedPreviewWorkspaces());assertCurrent();
    const maxPixels=await enqueue(()=>{assertCurrent();return previewPixelsBudget(40,retainedPreviewWorkingBytes({maxSide:1,operation:task.operation,medianContexts:nativeMedianRetained,classicalContexts:nativeClassicalRetained})-40+256*1024);});assertCurrent();
    if(policy.strategy==='clones'&&retainedNativeBasisStatus(policy,{source,result},task).available){
     await enqueue(()=>drainNativeClonePreviewLeases());assertCurrent();
     const fullPixels=await enqueue(()=>previewPixelsBudget(40,65536));assertCurrent();
     try{
      const exact=await nativeClonePreview({task,field,source:previewSource,maxPixels:fullPixels,signal,
       isCurrent:()=>!disposed&&source===currentSource&&result===currentResult&&!signal?.aborted,
       renderRetained:updateRetained,readDisplay:(display,tile)=>engine.readDisplay({surfaceId:display.id,revision:display.revision,tile:{x:tile.x,y:tile.y,w:tile.width,h:tile.height,step:tile.step}},{signal}),
       reserve:bytes=>enqueue(async()=>{assertCurrent();const held=await engine.reserveExternalMemory({bytes});nativeClonePreviewLeases.set(held.id,{lease:held,retiring:false});return held;}),
       release:held=>{const record=nativeClonePreviewLeases.get(held.id);if(record)record.retiring=true;return enqueue(()=>releaseNativeClonePreviewLease(held));}});
      assertCurrent();if(exact)return exact;
     }catch(error){if(nativeClonePreviewLeases.size||!['MEMORY_LIMIT','CACHE_MISS','PREVIEW_UNAVAILABLE'].includes(error?.code))throw error;}
    }
    const plan=planRetainedPreview({...args,maxPixels});if(!plan)return null;
    lease=await enqueue(async()=>{assertCurrent();const held=await engine.reserveExternalMemory({bytes:retainedPreviewWorkingBytes({plan,operation:task.operation,medianContexts:nativeMedianRetained,classicalContexts:nativeClassicalRetained})});retainedParameterPreviewLeases.set(held.id,{lease:held,retiring:false});return held;});assertCurrent();
    const answer=await renderRetainedPreview({...args,adaptivePlan:plan});assertCurrent();
    return held(answer&&{...answer,...(domain?{sourceRegionDomain:domain,sourceRegionOrigin:[...domain.origin]}:{})},'retained-tables');
   }catch(error){failed=true;failure=error;throw error;}finally{
    try{if(lease){const cleanup=queue.then(()=>releaseRetainedParameterPreviewLease(lease));queue=cleanup.catch(()=>{});try{await cleanup;}catch(error){if(!failed)throw error;try{if(Object.isExtensible(failure))failure.cleanupErrors=[...(failure.cleanupErrors??[]),error];}catch{}}}if(!failed)assertCurrent();}
    finally{retainedPreviews.delete(done);complete();}
   }
  }
  if(policy.kind!=='pixel-proxy'&&policy.fallback!=='pixel-proxy')return null;
  if(shape!=='identity'&&extras.reference)return null;
  parameterReferenceInput=extras.reference;
  await ensureParameterPreview(domain,nativeScopedPixel,signal);
  const answer=await parameterPreview.preview({...task,field,...(task.operation==='detail.frequency'?{...(adaptiveFeedback?{adaptiveFeedback}:{}),...(previewControl?{previewControl}:{})}:{}),sourceIdentity:domain?[source?.sha256??source?.id,domain.fingerprint]:source?.sha256??source?.id,logicalWidth:domain?.width??source?.surface.width,logicalHeight:domain?.height??source?.surface.height,signal});return held(answer?{...answer,...(domain?{sourceRegionDomain:domain,sourceRegionOrigin:[...domain.origin]}:{})}:null,task.operation==='jpeg.ghosts'?'ghost-hybrid':'derived-pixel');
 }
 async function ensureParameterPreview(domain,nativeScopedPixel,signal){
  const key=JSON.stringify([source?.id,source?.sha256,domain?.fingerprint??null]);if(parameterPreviewKey!==key){await clearParameterPreview();checkAbort(signal);parameterPreviewKey=key;}
  parameterPreview??=createParameterPreview({sourceRegions:nativeScopedPixel,readSource:request=>parameterSource(request,false,domain),readReference:request=>parameterSource(request,true),reserve:({bytes,label},{onReclaim}={})=>enqueue(()=>engine.reserveExternalCache?engine.reserveExternalCache({bytes,label},{onReclaim}):engine.reserveExternalMemory({bytes})),release:lease=>engine.releaseExternalCache?engine.releaseExternalCache(lease.id):engine.releaseExternalMemory(lease.id),...(engine.updateExternalCache?{updateReservation:updateParameterPreviewReservation}:{})});

  return parameterPreview;
 }
 async function prepareParameterPreview(task,{expectedResult,isCurrent,signal}={}){
  if(!['detail.gradient','inspection.adjust','detail.frequency','detail.echo','noise.separation'].includes(task?.operation)||typeof isCurrent!=='function')return{prepared:false,reason:'unqualified-operation-or-adoption'};
  const currentSource=source,currentResult=result,current=()=>!disposed&&source===currentSource&&!!currentSource&&result===currentResult&&expectedResult===currentResult&&!!currentResult&&currentResult.operation===task.operation&&isCurrent();
  if(!current())return{prepared:false,reason:'not-current'};
  try{
   const prepared=await enqueue(async()=>{checkAbort(signal);if(!current())return null;const submitted=await sourceRegionTask(task,{}, {signal});if(!current())return null;const domain=submitted.sourceRegionDomain;if(!domain||!['native-regions','membership'].includes(sourceRegionDomainShape(domain))||(currentResult.sourceRegionDomain?.fingerprint??null)!==domain.fingerprint)return null;return{domain};});
   if(!prepared||!current())return{prepared:false,reason:'not-current-or-unqualified-domain'};
   const owner=await ensureParameterPreview(prepared.domain,true,signal);if(!current())return{prepared:false,reason:'not-current'};
   return await owner.prepare({signal,isCurrent:current});
  }catch(error){if(error?.code==='MEMORY_LIMIT')return{prepared:false,reason:'budget',code:error.code};if(error?.code==='CANCELLED')return{prepared:false,reason:'not-current',code:error.code};throw error;}
 }
  // A prepared download can own its file while native export inputs have
  // already retired. Only this existing ACK may rearm the optional UI worker.
  function watchParameterExportRetirement(owner,expectedSource,expectedResult){
   if(typeof onParameterExportRetired!=='function'||!parameterPreview||!expectedSource||!expectedResult)return;
   void owner.closed.then(()=>{
    if(!disposed&&source===expectedSource&&result===expectedResult)onParameterExportRetired({client,source:expectedSource,result:expectedResult});
   }).catch(()=>{console.warn('Optional parameter worker preparation after export was unavailable.');});
  }
  async function segmentationModel(variant){
  segmentationModels??=await individualModels();const model=segmentationModels.segmentation?.[variant];
  if(!model)throw new EngineError('MODEL_UNAVAILABLE','Segmentation model is not configured.',{details:{variant}});
  return {...resolve(model),variant};
 }
 async function configure(operation,params={}){
  if(operation==='ai.clones.d2prl'&&!d2Loaded){await engine.loadD2prlModel({...D2PRL_MODEL_IDENTITY,url:asset('d2prl/model.json')},hooks());d2Loaded=true;}
  const needsOcr=operation==='tampering.copyMove.sparse'&&params.algorithm==='SIFT + G2NN + RANSAC + Panels + Text';
  if((operation.startsWith('ai.sources.')||operation.startsWith('ai.localization.')||operation==='tampering.copyMove.sparse')&&(!m3Loaded||needsOcr&&!m3OcrLoaded)){
   const manifest=await individualModels();let language;
   // Learned matching and ordinary SIFT do not use OCR. Fetch it only for the
   // requested Panels + Text pass; a failed fetch leaves the image intact.
   if(needsOcr){
    const requestedUrl=asset('ocr/eng.traineddata'),response=await fetch(requestedUrl,{signal:controller?.signal});
    if(!response.ok)throw new EngineError('ASSET_HTTP','OCR dependency could not load.',{details:{requestedUrl,receivedUrl:response.url||requestedUrl,status:response.status,file:'ocr/eng.traineddata',sha256:deployment.englishSha256}});
    language={data:new Uint8Array(await response.arrayBuffer()),sha256:deployment.englishSha256};
   }
   await engine.loadM3Models({models:resolve(manifest.m3),...(language?{language}:{})},hooks());m3Loaded=true;m3OcrLoaded=!!language;
  }
  if(operation==='various.median'&&!median){const manifest=await individualModels();if(!manifest.median)throw Error('Choisissez un modèle médian XGBoost.');const response=await fetch(asset(manifest.median.url),{signal:controller?.signal});if(!response.ok)throw Error('Modèle médian absent.');await engine.loadMedianModel({id:'median-model',blob:await response.blob()},hooks());median='median-model';}
 }
 async function clonePixels(display,tile,{assertCurrent=()=>{}}={}){
  assertCurrent();
  if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}
  if(display.cloneWindowPlacement){
   if(display.cloneWindowSourceSha256&&source?.sha256!==display.cloneWindowSourceSha256)throw new EngineError('CACHE_MISS','The independent window belongs to another Original image.');
   return cloneWindowPresenter.render(display,tile,{compose:composeCloneFrame,readField:async(key,local)=>{const d=display.cloneFields[key];return(await engine.readDisplay({surfaceId:d.id,revision:d.revision,tile:local,render:{range:d.range??[0,1]}},hooks())).pixels;},readOriginal:async window=>(await engine.readDisplay({surfaceId:source.surface.id,revision:source.surface.revision,tile:window},hooks())).pixels});
  }
  const field=display.cloneView==='overlay'?'map':display.cloneView;
  const read=async key=>{
   if(display.m2Result)return sampleCloneField(m2,display,key,tile);
   const d=display.cloneFields[key],p=(await engine.readDisplay({surfaceId:d.id,revision:d.revision,tile,render:{range:d.range??[0,1]}},hooks())).pixels;assertCurrent();
   return Float32Array.from({length:p.width*p.height},(_,i)=>p.data[i*3]/255);
  };
  const values=await read(field),support=display.cloneFields.analyzed?await read('analyzed'):null;
  const mask=display.cloneView==='overlay'&&display.cloneMasked?await read('mask'):null;
  // D2 strict fields are local to the admitted source crop. Its owned RGB
  // handle applies the same Original offset as the native projected fields.
  const baseSource=display.sourceRegionSourceSurface??source.surface;
  if(display.sourceRegionSourceSurface&&(baseSource.width!==display.width||baseSource.height!==display.height))throw new EngineError('CACHE_MISS','The retained D2PRL source crop differs from its native field grid.');
  const base=display.cloneView==='mask'?null:(await engine.readDisplay({surfaceId:baseSource.id,revision:baseSource.revision,tile},hooks())).pixels.data;
  assertCurrent();
  return composeCloneFrame({width:Math.ceil(tile.w/(tile.step??1)),height:Math.ceil(tile.h/(tile.step??1)),values,support,mask,base,view:display.cloneView,masked:display.cloneMasked});
 }
 async function biomePixels(display,window,sampled=false){
  if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}if(!source)throw new EngineError('CACHE_MISS','The original biome source is unavailable.');
  const original={width:source.surface.width,height:source.surface.height,sha256:source.sha256};if(display.width!==original.width||display.height!==original.height)throw new EngineError('INVALID_INPUT','Biome presentation dimensions differ from the original image.');
  const step=sampled?window.step??1:1,width=sampled?Math.ceil(window.w/step):window.width,height=sampled?Math.ceil(window.h/step):window.height,bytes=biomePresentationWorkingBytes(width,height,original.width,original.height,{scoped:!!display.biomePresentation.scope}),lease=await engine.reserveExternalMemory({bytes});
  try{const args={surfaceId:source.surface.id,revision:source.surface.revision,...(sampled?{tile:window}:{rect:window})},base=(await engine[sampled?'readDisplay':'readPixels'](args,hooks())).pixels;return composeBiomeWindow(base,display.biomePresentation.groups,window,{scope:display.biomePresentation.scope,source:original,signal:controller?.signal});}
  finally{await engine.releaseExternalMemory(lease.id);}
 }
 async function clearResponseProxy(){const old=responseProxy;if(old){await releaseRetainedParameterPreviewLease(old.lease);if(responseProxy===old)responseProxy=null;}}
 async function prepareResponseProxy(display){
  await drainRetainedPreviewWorkspaces();
  const p=display.comprintPresentation??display.dtdPresentation;if(!p)return null;
  const score=p.score,side=display.adaptivePreview?.token?.side??128;
  if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}
  const baseSource=responseSourceSurface(display,source?.surface),key=responseProxyKey(display,baseSource,side);
  if(responseProxy?.key===key)return responseProxy;
  await clearResponseProxy();
  const step=Math.max(1,Math.ceil(Math.max(display.width,display.height)/side)),tile={x:0,y:0,w:display.width,h:display.height,step},g=displayGeometry(display,tile),comprint=!!display.comprintPresentation,valueBytes=comprint?8:4,span=(g.width-1)*step+1;
  const lease=await engine.reserveExternalMemory({bytes:g.width*g.height*(valueBytes+6)+span*valueBytes});retainedParameterPreviewLeases.set(lease.id,{lease,retiring:false});let retained=false;
  try{
   const values=comprint?new Float64Array(g.width*g.height):new Float32Array(g.width*g.height),[lo,hi]=comprint?score.range??[0,1]:[0,1];
   for(let y=0;y<g.height;y++){
    checkAbort(controller?.signal);const answer=await engine.readPlane({surfaceId:score.id,revision:score.revision,rect:{x:0,y:y*step,width:span,height:1}},hooks());
    for(let x=0;x<g.width;x++){const value=answer.plane.data[x*step],level=Number.isFinite(value)?Math.round(Math.max(0,Math.min(1,(value-lo)/(hi-lo||1)))*255):NaN;values[y*g.width+x]=comprint?(Number.isFinite(value)?Math.round(value):NaN):lo+level/255*(hi-lo||1);}
   }
   const base=(await engine.readDisplay({surfaceId:baseSource.id,revision:baseSource.revision,tile},hooks())).pixels.data;
   responseProxy={key,width:g.width,height:g.height,step,values,base,lease};retained=true;return responseProxy;
  }finally{if(!retained)await releaseRetainedParameterPreviewLease(lease);}
 }
 async function responseProxyPixels(display,tile){
  const proxy=await prepareResponseProxy(display),g=displayGeometry(display,tile),comprint=!!display.comprintPresentation,p=display.comprintPresentation??display.dtdPresentation,overlay=p.mode.endsWith('overlay');
  if(g.width>2048||g.height>2048)throw new EngineError('INVALID_INPUT','Response preview exceeds its bounded grid.');
  return serialRetainedPreviewWorkspace(g.width*g.height*((comprint?8:4)+3+(overlay?3:0)),async()=>{
   const values=comprint?new Float64Array(g.width*g.height):new Float32Array(g.width*g.height),base=overlay?new Uint8Array(g.width*g.height*3):undefined;
   for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const px=Math.min(proxy.width-1,Math.round((g.x+x*g.step)/proxy.step)),py=Math.min(proxy.height-1,Math.round((g.y+y*g.step)/proxy.step)),from=py*proxy.width+px,to=y*g.width+x;values[to]=proxy.values[from];if(base)base.set(proxy.base.subarray(from*3,from*3+3),to*3);}
   const cutoff=comprint?Math.round(Math.max(0,p.threshold??0)):displayThresholdForProxy(p.threshold,.5);
   return comprint?comprintFrame(g.width,g.height,values,{range:p.score.range,mode:p.mode,opacity:p.opacity,threshold:cutoff,base}):dtdFrame(g.width,g.height,values,{opacity:p.opacity,threshold:cutoff,base});
  });
 }
 const displayThresholdForProxy=(value,fallback)=>Math.round((Number.isFinite(value)?value:fallback)*255)/255;
 async function activationPixels(display,tile){
  const g=displayGeometry(display,tile),comprint=!!display.comprintPresentation,presentation=display.comprintPresentation??display.dtdPresentation,score=presentation.score,overlay=presentation.mode.endsWith('overlay'),valueBytes=comprint?8:4;
  if(overlay&&!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}
  const baseSource=overlay?responseSourceSurface(display,source?.surface):null;
  const span=(g.width-1)*g.step+1,rows=g.step===1?Math.max(1,Math.min(32,Math.floor(1024**2/(span*valueBytes)))):1;
  const lease=await engine.reserveExternalMemory({bytes:g.width*g.height*(valueBytes+3+(overlay?3:0))+span*rows*valueBytes});
  try{
   const values=comprint?new Float64Array(g.width*g.height):new Float32Array(g.width*g.height);
   for(let row=0;row<g.height;row+=rows){
    checkAbort(controller?.signal);const count=Math.min(rows,g.height-row),rect={x:g.x,y:g.y+row*g.step,width:span,height:count},part=await engine.readPlane({surfaceId:score.id,revision:score.revision,rect},hooks());
    for(let y=0;y<count;y++)for(let x=0;x<g.width;x++)values[(row+y)*g.width+x]=part.plane.data[y*span+x*g.step];
   }
   const base=overlay?(await engine.readDisplay({surfaceId:baseSource.id,revision:baseSource.revision,tile},hooks())).pixels.data:undefined;
   return comprint?comprintFrame(g.width,g.height,values,{base,opacity:presentation.opacity,threshold:presentation.threshold,mode:presentation.mode,range:score.range}):dtdFrame(g.width,g.height,values,{base,opacity:presentation.opacity,threshold:presentation.threshold});
  }finally{await engine.releaseExternalMemory(lease.id);}
 }
 async function truforPalettePixels(display,tile){
  const g=displayGeometry(display,tile),bytes=g.width*g.height*7+m2.ready.windowBytes,lease=await m2.reserveExternalMemory({bytes});
  try{const values=await sampleCloneField(m2,{...display,cloneFields:display.truforFields},'map',tile);return truforHeatFrame(g.width,g.height,values);}
  finally{await m2.releaseExternalMemory(lease.id);}
 }
 async function clearRitaProxy(){const old=ritaProxy;if(old){await releaseRetainedParameterPreviewLease(old.lease);if(ritaProxy===old)ritaProxy=null;}}
 function ritaResultId(display){
  const id=display.ritaPresentation?.score?.m2Result??display.m2Result;
  if(!m2||!id||result?.m2Result?.id!==id)throw new EngineError('CACHE_MISS','The native RITA result is unavailable.');
  if(display.width!==result.m2Result.width||display.height!==result.m2Result.height||display.ritaPresentation?.score?.field!=='map')throw new EngineError('INVALID_INPUT','RITA display geometry or score identity differs from the native result.');
  return id;
 }
 const ritaWindowElements=()=>Math.max(1,Math.floor(Math.min(4*1024**2,m2.ready.windowBytes)/4));
 // Retained scores are sampled through bounded contiguous strips. Wide or
 // sparse requests also split horizontally; no numeric RPC exceeds 4 MiB.
 async function readRitaValues(display,g){
  const id=ritaResultId(display);if(result?.data?.metadata?.fragmented)return readRitaStrictProjection({width:display.width,height:display.height,pixels:result.data.pixelCount,fragments:result.data.metadata.fragments,windowBytes:m2.ready.windowBytes,readArray:(key,offset,count)=>m2.readArray(id,key,offset,count)},{x:g.x,y:g.y,w:g.w,h:g.h,step:g.step},{signal:controller?.signal});
  const out=new Float32Array(g.width*g.height),limit=ritaWindowElements(),span=(g.width-1)*g.step+1,field=display.ritaPresentation.score.field??'map';
  const read=async(offset,length)=>{const values=await m2.readArray(id,field,offset,length);if(!(values instanceof Float32Array)||values.length!==length)throw new EngineError('INVALID_INPUT','Invalid native RITA score window.');return values;};
  for(let row=0;row<g.height;){
   checkAbort(controller?.signal);
   if(span<=limit){
    const count=Math.min(g.height-row,Math.max(1,Math.floor((limit-span)/(display.width*g.step))+1)),length=(count-1)*g.step*display.width+span,values=await read((g.y+row*g.step)*display.width+g.x,length);
    for(let y=0;y<count;y++)for(let x=0;x<g.width;x++)out[(row+y)*g.width+x]=values[y*g.step*display.width+x*g.step];
    row+=count;
   }else{
    const columns=Math.max(1,Math.floor((limit-1)/g.step)+1);
    for(let x=0;x<g.width;x+=columns){const count=Math.min(columns,g.width-x),values=await read((g.y+row*g.step)*display.width+g.x+x*g.step,(count-1)*g.step+1);for(let at=0;at<count;at++)out[row*g.width+x+at]=values[at*g.step];}
    row++;
   }
  }
  return out;
 }
 async function ensureRitaSource(display){
  if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}
  const base=result?.sourceRegionSourceSurface??source?.surface;if(!base||base.width!==display.width||base.height!==display.height)throw new EngineError('CACHE_MISS','The original RITA image is unavailable.');return base;
 }
 async function prepareRitaProxy(display){
  await drainRetainedPreviewWorkspaces();
  const id=ritaResultId(display),side=display.adaptivePreview?.token?.side??128,key=id+':'+display.ritaPresentation.score.revision+':'+side;
  if(ritaProxy?.key===key)return ritaProxy;
  await clearRitaProxy();const baseSource=await ensureRitaSource(display);
  const step=Math.max(1,Math.ceil(Math.max(display.width,display.height)/side)),tile={x:0,y:0,w:display.width,h:display.height,step},g=displayGeometry(display,tile),count=g.width*g.height;
  // Retain the tiny score/base proxy and admit the RGB frame workspace once.
  // The dragging path below performs no worker messages or budget RPCs.
  const lease=await engine.reserveExternalMemory({bytes:count*13});retainedParameterPreviewLeases.set(lease.id,{lease,retiring:false});let transient,numeric,numericRecord,retained=false;
  try{
   transient=await engine.reserveExternalMemory({bytes:count*4});retainedParameterPreviewLeases.set(transient.id,{lease:transient,retiring:false});numeric=await m2.reserveExternalMemory({bytes:ritaWindowElements()*4});numericRecord={owner:m2,lease:numeric,retiring:false};ritaNumericPreviewLeases.set(numeric.id,numericRecord);
   const values=await readRitaValues(display,g),levels=new Uint8Array(count),validity=new Uint8Array(count);
   for(let i=0;i<count;i++)if(Number.isFinite(values[i])){validity[i]=1;levels[i]=Math.round(Math.max(0,Math.min(1,values[i]))*255);}
   const base=(await engine.readDisplay({surfaceId:baseSource.id,revision:baseSource.revision,tile},hooks())).pixels.data;
   ritaProxy={key,width:g.width,height:g.height,step,levels,validity,base,lease};retained=true;return ritaProxy;
  }finally{const failures=[];if(numericRecord)try{await releaseRitaNumericPreviewLease(numericRecord);}catch(e){failures.push(e);}if(transient)try{await releaseRetainedParameterPreviewLease(transient);}catch(e){failures.push(e);}if(!retained)try{await releaseRetainedParameterPreviewLease(lease);}catch(e){failures.push(e);}if(failures.length)throw failures[0];}
 }
 async function ritaProxyPixels(display,tile){
  const proxy=await prepareRitaProxy(display),g=displayGeometry(display,tile),p=display.ritaPresentation;
  if(g.width>2048||g.height>2048)throw new EngineError('INVALID_INPUT','RITA preview exceeds its bounded grid.');
  if(g.x===0&&g.y===0&&g.step===proxy.step&&g.width===proxy.width&&g.height===proxy.height)return ritaFrame(g.width,g.height,proxy.levels,{base:p.mode==='overlay'?proxy.base:undefined,validity:proxy.validity,quantized:true,mode:p.mode,threshold:ritaDisplayThreshold(p.threshold),opacity:p.opacity});
  const count=g.width*g.height,levels=new Uint8Array(count),validity=new Uint8Array(count),base=p.mode==='overlay'?new Uint8Array(count*3):undefined;
  for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const px=Math.min(proxy.width-1,Math.round((g.x+x*g.step)/proxy.step)),py=Math.min(proxy.height-1,Math.round((g.y+y*g.step)/proxy.step)),from=py*proxy.width+px,to=y*g.width+x;levels[to]=proxy.levels[from];validity[to]=proxy.validity[from];if(base)base.set(proxy.base.subarray(from*3,from*3+3),to*3);}
  return ritaFrame(g.width,g.height,levels,{base,validity,quantized:true,mode:p.mode,threshold:ritaDisplayThreshold(p.threshold),opacity:p.opacity});
 }
 async function ritaPixels(display,tile){
  ritaResultId(display);const g=displayGeometry(display,tile),p=display.ritaPresentation,overlay=p.mode==='overlay',lease=await engine.reserveExternalMemory({bytes:g.width*g.height*(overlay?10:7)});let numeric;
  try{
   numeric=await m2.reserveExternalMemory({bytes:ritaWindowElements()*4});const values=await readRitaValues(display,g);
   const baseSource=overlay?await ensureRitaSource(display):null;
   const base=overlay?(await engine.readDisplay({surfaceId:baseSource.id,revision:baseSource.revision,tile},hooks())).pixels.data:undefined;
   return ritaFrame(g.width,g.height,values,{base,mode:p.mode,threshold:p.threshold,opacity:p.opacity});
  }finally{if(numeric)await m2.releaseExternalMemory(numeric.id);await engine.releaseExternalMemory(lease.id);}
 }
 async function retainedPixels(display,tile){
  const cells=Math.ceil(tile.w/(tile.step??1))*Math.ceil(tile.h/(tile.step??1)),lease=await engine.reserveExternalMemory({bytes:cells*64+65536});
  try{if(display.ocrPresentation)return await renderOcrWindow(display,tile,(source,tile)=>engine.readDisplay({surfaceId:source.id,revision:source.revision,tile},hooks()).then(answer=>answer.pixels));return await renderRetainedWindow({display,tile,readSource:request=>{const base=display.sourceRegionSourceSurface??result?.sourceRegionSourceSurface??source.surface;return engine.readDisplay({surfaceId:base.id,revision:base.revision,tile:request}).then(answer=>answer.pixels);}});}
  finally{await engine.releaseExternalMemory(lease.id);}
 }
 async function pixels(display,rect){
  if(display.retainedParameterView)return retainedPixels(display,{x:rect.x,y:rect.y,w:rect.width,h:rect.height,step:1});
  if(display.responsePreview)throw new EngineError('INVALID_INPUT','A transient preview cannot be exported.');
  if(display.ritaPresentation)return ritaPixels(display,{x:rect.x,y:rect.y,w:rect.width,h:rect.height,step:1});
  if(display.dtdPresentation||display.comprintPresentation)return activationPixels(display,{x:rect.x,y:rect.y,w:rect.width,h:rect.height,step:1});
  if(display.truforPalette)return truforPalettePixels(display,{x:rect.x,y:rect.y,w:rect.width,h:rect.height,step:1});
  if(display.biomePresentation)return biomePixels(display,rect);
  if(display.cloneView)return clonePixels(display,{x:rect.x,y:rect.y,w:rect.width,h:rect.height,step:1});
  if(sourceAliases.has(display.id)){if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}if(source)display=source.surface;}
  if(display.m2Result){const frame=await m2.renderWindow(display.m2Result,display.view,rect);try{const data=new Uint8Array(frame.bytes);for(let at=0;at<data.length;at+=m2.ready.windowBytes)data.set(await m2.readExport(frame.id,at,Math.min(m2.ready.windowBytes,data.length-at)),at);return {width:frame.width,height:frame.height,format:'rgb8',data};}finally{await m2.releaseExport(frame.id);}}
  if(display.pixels){const input=display.pixels,data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)data.set(input.data.subarray(((y+rect.y)*input.width+rect.x)*3,((y+rect.y)*input.width+rect.x+rect.width)*3),y*rect.width*3);return {width:rect.width,height:rect.height,format:'rgb8',data};}
  const input={surfaceId:display.id,revision:display.revision,rect};
  if(display.format==='rgb8')return (await engine.readPixels(input,hooks())).pixels;
  const read=display.format==='mask8'?await engine.readMask(input,hooks()):display.format==='rgb-flags8'?await engine.readFlags(input,hooks()):await engine.readPlane(input,hooks());
  const plane=read.plane??read.mask??read.flags??read.pixels,values=plane.data;const data=new Uint8Array(rect.width*rect.height*3),[lo,hi]=display.range??[0,1];
  for(let i=0;i<rect.width*rect.height;i++){if(display.format==='rgb-flags8'){for(let c=0;c<3;c++)data[i*3+c]=values[i*3+c]?255:0;}else{const value=display.format==='mask8'?(values[i]?255:0):Math.max(0,Math.min(255,Math.round((values[i]-lo)/(hi-lo||1)*255)));data.fill(value,i*3,i*3+3);}}return {width:rect.width,height:rect.height,format:'rgb8',data};
 }
 async function stream(descriptor,sink,owner){owner.after(()=>engine.releaseExport(descriptor.id));for(let offset=0;offset<descriptor.byteLength;offset+=1024**2){const {bytes}=await engine.readExport({exportId:descriptor.id,revision:descriptor.revision,offset,length:Math.min(1024**2,descriptor.byteLength-offset)},hooks());await sink.write(bytes);}}
   async function updateRetained(task,{isCurrent=()=>true,field,signal,onRetainedResult,temporaryD2=false}={}){
   // Normalize only the hidden default alias to this client's loaded handle.
   if(task.operation==='various.median'&&task.params?.modelId===''&&median==='median-model')task={...task,params:{...task.params,modelId:median}};
   const policy=parameterPreviewPolicy(task.toolId??task.operation,field??'',task.params);
   // Cancellation may clear the engine source and every retained owner.
   // Decline reuse; the ordinary native run reloads the same Original and
   // validates its zones. A live retained owner still validates its domain.
   const d2Refilter=task.operation==='ai.clones.d2prl'&&policy.strategy==='d2prl-refilter',safireGrouping=policy.strategy==='safire-grouping',nativeTables=['median','clones'].includes(policy.strategy);
   if(temporaryD2&&!d2Refilter)throw new EngineError('INVALID_INPUT','Only a retained D2PRL refilter may be a temporary non-publishing transaction.');
   if(policy.strategy!=='ssg-localization'&&!safireGrouping&&!nativeTables&&!d2Refilter)return enqueue(async()=>{if(coreResultRetirement||!source||!result||!isCurrent()||!retainedNativeBasisStatus(policy,{source,result},task).available)return null;task=await sourceRegionTask(task,{},{admit:false});if(!isCurrent()||(result?.sourceRegionDomain?.fingerprint??null)!==(task.sourceRegionDomain?.fingerprint??null))return null;const next=task.operation==='various.ocr'?updateOcrPresentation(result,task.params,result?.sourceRegionSourceSurface??source?.surface):updateRetainedParameters({output:result,operation:task.operation,params:task.params,view:task.view});if(next&&isCurrent()){if(next.parameterViews&&next.sourceRegionDomain)next.parameterViews=next.parameterViews.map(view=>({...view,sourceRegionDomain:next.sourceRegionDomain,sourceRegionOrigin:next.sourceRegionOrigin,sourceRegionSourceSurface:next.sourceRegionSourceSurface}));result=next;return next;}return null;});
   let retirement;const scheduleRetirement=output=>{retainedRetirement.track(output);const pending=queue.then(()=>retainedRetirement.retire(output));queue=pending.catch(()=>{});return pending;};
   const transaction=enqueue(async()=>{const previous=result,currentSource=source;if(coreResultRetirement||!previous||!currentSource||!isCurrent()||!retainedNativeBasisStatus(policy,{source,result},task).available||(nativeTables?typeof engine.renderRetainedNativeParameters!=='function':!safireGrouping&&!d2Refilter&&(previous.data?.params?.algorithm!=='SSG'||typeof engine.localizeRetainedParameters!=='function')))return null;
    const local=new AbortController(),abort=()=>local.abort(signal?.reason);retainedController=local;signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const current=()=>!disposed&&!local.signal.aborted&&isCurrent()&&result===previous&&source===currentSource;let next,accepted=false;
    try{checkAbort(local.signal);await retainedRetirement.drain();if(!current())return null;task=await sourceRegionTask(task,{},{admit:false,signal:local.signal});if(!current()||(previous.sourceRegionDomain?.fingerprint??null)!==(task.sourceRegionDomain?.fingerprint??null))return null;
     if(d2Refilter){
      const mode=task.cloneWindowMode??'independent';
      if(!d2Analysis||d2Analysis.key!==d2AnalysisKey({...task,imageId:currentSource.id})||previous.cloneWindowMode!==mode||previous.provenance?.cloneWindowMode!==mode)return null;
      const p=task.params??{};
      next=await engine.run({...task,...(temporaryD2?{retainedD2Preview:true}:{}),id:'d2prl-refilter-'+crypto.randomUUID(),imageId:currentSource.id,regions:undefined,params:{minimum:p.minimum??500,refilterOf:d2Analysis.analysisId,...(p.exclusions!==undefined?{exclusions:p.exclusions}:{}),...(p.scientificScope?{scientificScope:p.scientificScope}:{})}},{signal:local.signal,onProgress});
      if(next?.metrics?.inferences!==0)throw new EngineError('INTERNAL','A retained D2PRL refilter must report zero new inferences.');
     }else next=await(nativeTables?engine.renderRetainedNativeParameters({task:{...task,id:'native-tables-'+crypto.randomUUID(),imageId:currentSource.id},retained:{operation:previous.operation,sourceSha256:currentSource.sha256,domainFingerprint:previous.sourceRegionDomain?.fingerprint??null,cloneWindowMode:previous.cloneWindowMode??previous.provenance?.cloneWindowMode,params:previous.provenance?.params??previous.data?.params??{},data:previous.data,provenance:previous.provenance,semantics:previous.semantics}},{signal:local.signal}):safireGrouping?engine.run({...task,id:'safire-regroup-'+crypto.randomUUID(),imageId:currentSource.id,retainedNativeOnly:true},{signal:local.signal,onProgress}):engine.localizeRetainedParameters({...task,id:'ssg-localization-'+crypto.randomUUID(),imageId:currentSource.id},{signal:local.signal,onProgress}));if(!next)return null;if(!current()){retirement=scheduleRetirement(next);return null;}
     // Keep the accepted native frame alive until its UI successor is adopted.
     // A rejected/obsolete presentation never replaces the scientific owner.
     if(onRetainedResult&&await onRetainedResult(next,{previous,isCurrent:current})===false||!current()){retirement=scheduleRetirement(next);return null;}
     result=next;accepted=true;retirement=scheduleRetirement(previous);return next;
    }catch(error){if(next&&!accepted)retirement=scheduleRetirement(next);throw error;}
    finally{signal?.removeEventListener('abort',abort);if(retainedController===local)retainedController=null;}
   });
   return transaction.then(async next=>{try{await retirement;}catch(error){if(!next)throw error;next.metrics={...next.metrics,retainedCleanup:{pending:true,code:error.code??'RETIREMENT_FAILED',message:error.message}};}return next;},async error=>{try{await retirement;}catch(cleanup){if(Object.isExtensible(error))error.cleanupErrors=[...(error.cleanupErrors??[]),cleanup];}throw error;});
  }
const client={
  previewParameters,prepareParameterPreview,acquirePreparationSource,acquireSourceRegionReader,
  updateRetainedParameters:updateRetained,cancelRetainedParameters(){retainedController?.abort();},
  deployment,get source(){return source;},get result(){return result;},capabilities:()=>enqueue(()=>engine.capabilities()),
  reserveExport:async(bytes,display)=>{const owner=display?.m2Result?m2:engine;if(!owner)throw Error('No export source');const lease=await enqueue(()=>owner.reserveExternalMemory({bytes}));return()=>owner.releaseExternalMemory(lease.id);},
  load:input=>{const previewDone=beforeQueuedParameterPreview(clearParameterPreview);return enqueue(()=>work(async()=>{await previewDone;await drainRetainedPreviewWorkspaces();d2Analysis=null;await m2?.retirePendingNativeSources?.();await release();await closePreparationSources();if(source){const old=source;await engine.unload(old.id);source=null;}if(sourceInput&&(sourceInput.id!==input.id||sourceInput.blob!==input.blob))sourceAliases.clear();sourceInput=input;source=await engine.loadBlob({...input,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);return source;}));},
  release:()=>{if(publicResultRetirement)return publicResultRetirement;const task=enqueue(release);publicResultRetirement=task;void task.finally(()=>{if(publicResultRetirement===task)publicResultRetirement=null;}).catch(()=>{});return task;},
  detectSubimages:(options={})=>enqueue(()=>work(async()=>{
   await closePreparationSources({pendingOnly:true});if(!sourceInput?.blob)throw Object.assign(Error('Source not loaded'),{code:'INVALID_INPUT'});
   // The shipped detector has a full-memory API. Load an explicit temporary
   // input in the SAME engine budget and release it, preserving the current result.
   let detectedDomain,detectionInput;
   if(options.sourceRegionDomain){
    const requested=await sourceRegionTask({imageId:source.id,sourceRegionDomain:options.sourceRegionDomain},{},{admit:false,signal:controller?.signal});
    detectionInput=await sourceRegionDetectionInput(requested.sourceRegionDomain,{strict:options.strictSourceRegions??false});checkAbort(controller?.signal);
    const task=await sourceRegionTask({id:'detect-'+crypto.randomUUID(),imageId:source.id,operation:'subimages.detect',params:{},backend:'cpu',sourceRegionDomain:detectionInput.domain},{},{signal:controller?.signal});
    detectedDomain=detectionInput.requestedDomain;
    if(sourceRegionDomainShape(task.sourceRegionDomain)!=='identity'){const output=await engine.run(task,hooks());try{return{...output.data,sourceRegionDomain:detectedDomain,sourceRegionOrigin:detectionInput.origin,sourceRegionPreparation:detectionInput.preparation};}finally{const owned=resultResources(output);for(const surface of owned.surfaces)if(surface.id!==source.surface.id)await engine.releaseSurface(surface.id);for(const table of owned.tables)await engine.releaseTable(table.id);}}
   }
   const reusable=source?.availableOperations?.includes('subimages.detect');
   const id=reusable?source.id:'subimages-'+crypto.randomUUID();let opened=false,failed=false,failure,retirement;
   const temporaryOwner={get retiring(){return opened;},invalidate(){opened=false;preparationSources.delete(temporaryOwner);},close(){if(!opened)return Promise.resolve();if(retirement)return retirement;retirement=Promise.resolve().then(()=>engine.unload(id)).then(()=>{opened=false;preparationSources.delete(temporaryOwner);}).finally(()=>{retirement=null;});return retirement;}};
   try{
    if(!reusable){const input=await engine.loadBlob({id,blob:sourceInput.blob,layout:'auto'},hooks());opened=true;preparationSources.add(temporaryOwner);
     if(input.sha256!==source?.sha256)throw new EngineError('SOURCE_CHANGED','The subimage detector input no longer matches the loaded original source.');
     if(input.availableOperations&&!input.availableOperations.includes('subimages.detect'))throw Object.assign(Error('SUBIMAGES_MEMORY'),{code:'MEMORY_LIMIT'});}
    const output=await engine.run({id:'detect-'+crypto.randomUUID(),imageId:id,operation:'subimages.detect',params:{},backend:'cpu'},hooks());return detectedDomain?{...output.data,sourceRegionDomain:detectedDomain,sourceRegionOrigin:detectionInput.origin,sourceRegionPreparation:detectionInput.preparation}:output.data;
   }catch(error){failed=true;failure=error;throw error;}
   finally{if(opened)try{await temporaryOwner.close();}catch(cleanupError){if(failed){if(failure!==null&&(typeof failure==='object'||typeof failure==='function')&&Object.isExtensible(failure))try{failure.cleanupError=cleanupError;}catch{}}else throw cleanupError;}}
  },{signal:options.signal})),
  run:(task,extras={})=>{const previewDone=beforeQueuedParameterPreview(()=>['various.illuminant','noise.planes','colors.stats','detail.gradient','inspection.adjust','detail.echo','detail.frequency','noise.separation','noise.minmax','pixels.defects','detail.wavelets','noise.blocking'].includes(task.operation)?settleParameterPreview():clearParameterPreview());return enqueue(()=>work(async()=>{
   await previewDone;await drainRetainedPreviewWorkspaces();await closePreparationSources({pendingOnly:true});localFeaturePolicy.assertTaskAvailable(task);task=await sourceRegionTask(task,extras,{signal:controller?.signal});
   // CAT-Net keeps Original encoded bytes and stages the new native result.
   // The old published result is retired only after the replacement is ready.
   if(task.operation==='m2.catnet'&&task.sourceRegionDomain&&sourceRegionDomainShape(task.sourceRegionDomain)!=='identity'){
    const request=await prepareCatnetScopedBlobRequest({blob:sourceInput?.blob,domain:task.sourceRegionDomain,sourceSha256:source.sha256,params:task.params},hooks());
    let candidate=m2Method==='catnet'?m2:null,staged,committed=false;const ownsCandidate=!candidate;
    try{
     if(!candidate){const caps=await engine.capabilities(),memory=caps.memory,reserve=memory.retainedBytes+memory.cacheBytes+memory.knownHeapCapacityBytes+64*1024**2;candidate=withM2NativeSourceTransport(await m2Factory({method:'catnet',memoryBudgetBytes:Math.max(32*1024**2,Math.min(m2MemoryBudgetBytes,memory.budgetBytes-reserve)),computeProfile}));}
     staged=await analyzeCatnetScopedBlob({client:candidate,request,acquirePresentation:domain=>acquireSourceRegionReaderNow({sourceRegionDomain:domain,purpose:'preparation-envelope'},{ownerQueue:true}),...hooks(),backend:task.backend});
     const output=catnetScopedToolResult(task,source,staged);checkAbort(controller?.signal);
     await release();if(m2&&m2!==candidate)await m2.dispose();m2=candidate;m2Method='catnet';m2PresentationSource=staged.presentation;result=output;committed=true;
     for(const key of['reference','mask','prnu']){const old=key==='reference'?reference:key==='mask'?mask:prnu;if(old){await engine.unload(old.id);if(key==='reference')reference=null;else if(key==='mask')mask=null;else prnu=null;}}
     return result;
    }catch(error){if(!committed){const failures=[];try{await staged?.retire();}catch(e){failures.push(e);}if(ownsCandidate){if(error&&typeof error==='object')retiredM2Failures.add(error);try{await candidate?.dispose();}catch(e){failures.push(e);}}if(failures.length&&Object.isExtensible(error))error.cleanupErrors=failures;}throw error;}
   }
   await release();
   // Auxiliary images/databases belong to their tool; the original and evictable
   // analysis caches survive tool changes without pinning unrelated workspaces.
   if(reference&&task.operation!=='comparison.image'){const old=reference;await engine.unload(old.id);reference=null;}
   if(mask&&(!extras.mask||!['tampering.copyMove.brisk','tampering.copyMove.akaze','tampering.copyMove.orb'].includes(task.operation))){const old=mask;await engine.unload(old.id);mask=null;}
   if(prnu&&task.operation!=='noise.prnu'){const old=prnu;await engine.unload(old.id);prnu=null;}
   if(task.operation.startsWith('m2.')){const method=task.operation.slice(3);if(m2&&m2Method!==method){await m2.dispose();m2=null;}if(!m2){const caps=await engine.capabilities(),memory=caps.memory;const reserve=memory.retainedBytes+memory.cacheBytes+memory.knownHeapCapacityBytes+64*1024**2;m2=withM2NativeSourceTransport(await m2Factory({method,memoryBudgetBytes:Math.max(32*1024**2,Math.min(m2MemoryBudgetBytes,memory.budgetBytes-reserve)),computeProfile}));m2Method=method;}let reader;const shape=task.sourceRegionDomain&&sourceRegionDomainShape(task.sourceRegionDomain),nativeRectangle=shape==='rectangle',nativeContexts=['cfa','trufor','rita'].includes(method)&&['native-regions','membership'].includes(shape);if(nativeRectangle||nativeContexts)reader=await acquireSourceRegionReaderNow({sourceRegionDomain:task.sourceRegionDomain,purpose:nativeContexts?'analysis-native-contexts':'analysis-rectangle',...(nativeContexts?{scientificConsumer:'m2.'+method}:{})},{ownerQueue:true});const descriptor=reader?await m2[nativeContexts?'analyzeNativeContexts':'analyzeNativeRectangle'](method,reader,task.params,{...hooks(),backend:task.backend}):await m2.analyzeBlob(method,extras.file,task.params,{...hooks(),backend:task.backend,expectedSourceSha256:source.sha256});let metadata;try{metadata=await m2.metadata(descriptor);}catch(error){await m2.release(descriptor.id);throw error;}const resultDomain=reader?.sourceRegionDomain??task.sourceRegionDomain,resultSource=reader?.sourceRegionSourceSurface??(resultDomain?source.surface:undefined);const ritaModes=['overlay','probability','mask'],ritaInitial=ritaModes.includes(task.view?.mode)?task.view.mode:'overlay';const views=method==='forgeryscope'?[]:method==='rita'?[ritaInitial,...ritaModes.filter(mode=>mode!==ritaInitial)]:method==='trufor'?['map','confidence','noiseprint_pp']:[0,1,2];result={id:task.id,imageId:source.id,operation:task.operation,status:'ok',data:metadata,provenance:{...metadata.provenance,...(resultDomain?{sourceRegionDomain:resultDomain,sourceRegionOrigin:[...resultDomain.origin],originalEncodedBytesPreserved:true}:{})},metrics:metadata.metrics,...(resultDomain?{sourceRegionDomain:resultDomain,sourceRegionOrigin:[...resultDomain.origin],sourceRegionSourceSurface:resultSource}:{}),m2Result:descriptor,views:views.map(view=>({id:'m2-'+descriptor.id+'-'+(resultDomain?resultDomain.fingerprint+'-':'')+view,revision:1,width:descriptor.width,height:descriptor.height,format:'rgb8',m2Result:descriptor.id,view,...(resultDomain?{sourceRegionDomain:resultDomain,sourceRegionOrigin:[...resultDomain.origin]}:{}),...(method==='rita'?{ritaPresentation:{mode:view,score:{id:'m2-score-'+descriptor.id,revision:1,m2Result:descriptor.id,field:'map'},threshold:ritaDisplayThreshold(task.view?.threshold),opacity:ritaDisplayOpacity(task.view?.opacity)}}:{})}))};if(method==='trufor'&&descriptor.fields?.map)result.views.push({...result.views[0],id:'m2-'+descriptor.id+'-'+(resultDomain?resultDomain.fingerprint+'-':'')+'map-alternative',view:'map_alternative',truforPalette:!metadata.metadata?.fragmented,truforFields:descriptor.fields});return result;}
   if(m2){await m2.dispose();m2=null;m2Method=null;}
   if(isExtensionTool(task.operation)){
    const input={...task,imageId:source.id},configuration=extensionConfiguration();
    if(typeof engine.runConfiguredExtension==='function')result=await engine.runConfiguredExtension(input,configuration,hooks());
    else{await configureExtensionModels(engine,configuration,hooks());result=await engine.run(input,hooks());}
    result=extensionSourcePresentation(result);return result;
   }
   if(task.operation==='various.ocr'){
    const configuration=await (await import('./ocr-models.js?v=0.25.0')).ocrConfiguration({algorithm:task.params?.algorithm}),input={...task,imageId:source.id,backend:task.params?.algorithm==='tesseract'?'cpu':task.backend??'auto'};
    if(typeof engine.runConfiguredOcr==='function')result=await engine.runConfiguredOcr(input,configuration,hooks());
    else{await engine.loadOcrModels(configuration,hooks());result=await engine.run(input,hooks());}
    result.parameterViews=[ocrDisplay(result,result.sourceRegionSourceSurface??source.surface)];if(result.sourceRegionDomain)result.parameterViews=result.parameterViews.map(view=>({...view,sourceRegionDomain:result.sourceRegionDomain,sourceRegionOrigin:result.sourceRegionOrigin,sourceRegionSourceSurface:result.sourceRegionSourceSurface}));return result;
   }
   await configure(task.operation,task.params);const params={...task.params};
   if(task.operation==='comparison.image'){if(!extras.reference)throw Error('Choisissez une image de référence.');if(reference?.blob!==extras.reference){if(reference){const old=reference;await engine.unload(old.id);reference=null;}const id='reference-'+crypto.randomUUID();const descriptor=await engine.loadBlob({id,blob:extras.reference,layout:'segmented'},hooks());reference={id,blob:extras.reference,surface:descriptor.surface};}params.referenceImageId=reference.id;}
   if(task.operation==='noise.prnu'){if(!prnu||prnu.file!==extras.database||prnu.training!==extras.training||prnu.camera!==extras.camera){if(prnu){const old=prnu;await engine.unload(old.id);prnu=null;}const id='prnu-'+crypto.randomUUID();if(extras.database)await engine.loadPrnuDatabase({id,blob:extras.database},hooks());else if(extras.training?.length)await engine.buildPrnuDatabase({id,queryImageId:source.id,singleCamera:extras.camera||'Camera',files:extras.training,outputLayout:'pages'},hooks());else throw Error('Choisissez une base PRNU ou des images d’apprentissage.');prnu={id,file:extras.database,training:extras.training,camera:extras.camera};}params.databaseId=prnu.id;}
   if(['tampering.copyMove.brisk','tampering.copyMove.akaze','tampering.copyMove.orb'].includes(task.operation)&&extras.mask){if(mask?.blob!==extras.mask){if(mask){const old=mask;await engine.unload(old.id);mask=null;}const id='mask-'+crypto.randomUUID();await engine.loadBlob({id,blob:extras.mask,layout:'segmented'},hooks());mask={id,blob:extras.mask};}params.maskImageId=mask.id;}
   if(task.operation==='various.median')params.modelId=median;
   if(task.operation==='jpeg.quality'){if(!quality){const manifest=await individualModels();if(manifest.quality){const response=await fetch(asset(manifest.quality.url),{signal:controller?.signal});if(!response.ok)throw Error('Modèle de qualité JPEG absent.');await engine.loadQualityModel({id:'quality-model',blob:await response.blob()},hooks());quality='quality-model';}}params.modelId=quality??null;}
   if(task.operation==='metadata.structure'||task.operation==='metadata.location'){const originalBlob=await engine.originalBlob(source.id);result={id:task.id,imageId:source.id,operation:task.operation,status:'ok',provenance:{engine:deployment.engineVersion,originalSha256:source.sha256,operation:task.operation,input:'original-encoded-bytes'},...await engine.inspectMetadata({blob:originalBlob,sourceSha256:source.sha256,mode:task.operation==='metadata.structure'?'headers':'location'},hooks())};}
   else {
    const key=task.operation==='ai.clones.d2prl'?d2AnalysisKey({...task,imageId:source.id}):null;
    const previous=key&&d2Analysis?.key===key?d2Analysis:null;
    if(task.operation==='ai.clones.d2prl')d2Analysis=null;
    if(task.operation==='ai.clones.segmentation'){
     const model=await segmentationModel(params.variant),input={...task,imageId:source.id,params};
     // The workspace pool performs configuration and inference in one existing
     // engine queue admission. A standalone engine has no competing documents.
     if(typeof engine.runConfiguredSegmentation==='function')result=await engine.runConfiguredSegmentation(input,model,hooks());
     else{await configureSegmentationModel(engine,model,hooks());result=await engine.run(input,hooks());}
    }else if(previous){
     const refilter={...task,imageId:source.id,regions:undefined,params:{minimum:params.minimum,exclusions:params.exclusions??[],...(params.scientificScope?{scientificScope:params.scientificScope}:{}),refilterOf:previous.analysisId}};
     try{result=await engine.run(refilter,hooks());}
     catch(error){if(error.code!=='CACHE_MISS')throw error;result=await engine.run({...task,imageId:source.id,params},hooks());}
    }else result=await engine.run({...task,imageId:source.id,params},hooks());
    const analysisId=result.data?.metadata?.analysisId;
    if(key&&analysisId)d2Analysis={key,analysisId};
   }return result;
  }));},
  readTable:(table,offset=0,length=128)=>enqueue(()=>engine.readTable({tableId:table.id,revision:table.revision,offset,length},hooks())),
  // Batch decisions read scientific values, never colours from a rendered map.
  readScalar:(descriptor,rect,field,options={})=>enqueue(async()=>{
   if((['m2.trufor','m2.rita'].includes(result?.operation)&&result.data?.metadata?.fragmented)||(result?.operation==='jpeg.comprint'&&result.metrics?.sourceRegionPolicy==='native-comprint-contexts-global-statistics'))return readNativeContextScalar({result,source,rect,field,expected:descriptor,signal:options.signal,windowBytes:m2?.ready?.windowBytes,readArray:(...args)=>m2.readArray(...args),readPlane:async(d,rect)=>(await engine.readPlane({surfaceId:d.id,revision:d.revision,rect},hooks())).plane.data});
   if(result?.operation==='m2.catnet'&&result.data?.metadata?.fragmented)return readCatnetNativeScalar({client:m2,result,source,rect,field,expected:descriptor,signal:options.signal});
   if(result?.m2Result){
    const name=field??'map',out=new Float32Array(rect.width*rect.height);
    for(let y=0;y<rect.height;y++)out.set(await m2.readArray(result.m2Result.id,name,(rect.y+y)*result.m2Result.width+rect.x,rect.width),y*rect.width);
    return out;
   }
   const input={surfaceId:descriptor.id,revision:descriptor.revision,rect};
   const answer=await engine[descriptor.format==='mask8'?'readMask':'readPlane'](input,hooks());
   return (answer.mask??answer.labels??answer.plane??answer.pixels).data;
  }),
  derive:patches=>enqueue(()=>work(async()=>{
   const scope=exportSinkScopeFor(client);await scope.retryFailed();const owner=scope.begin();let memoryLease;
   try{
    const derived=await engine.deriveOriginal({imageId:source.id,patches,output:'archive',storage:'temporary'},hooks());
    owner.after(()=>engine.releaseExport(derived.archive.id));owner.after(async()=>{if(memoryLease){await engine.releaseExternalMemory(memoryLease.id);memoryLease=null;}});
    const sink=await owner.open(createExportSink,{memoryBudgetBytes:Math.max(1,derived.sizeBytes),signal:controller.signal,mime:'application/octet-stream'});
    if(sink.storage==='memory')memoryLease=await engine.reserveExternalMemory({bytes:derived.sizeBytes+2*1024**2});
    for(let offset=0;offset<derived.archive.byteLength;offset+=1024**2){const {bytes}=await engine.readExport({exportId:derived.archive.id,revision:derived.archive.revision,offset,length:Math.min(1024**2,derived.archive.byteLength-offset)},hooks());await sink.write(bytes);}
    const artifact=owner.finish(sink,await sink.finish());checkAbort(controller.signal);const{archive,...report}=derived;return{...report,...owner.borrow(artifact)};
   }catch(error){return owner.fail(error);}
  })),
  loadModel:(kind,file)=>enqueue(()=>work(async()=>{
   await closePreparationSources({pendingOnly:true});const id=kind+'-'+crypto.randomUUID();let staged=false,retirement,failed=false,primary;
   const owner={get retiring(){return staged;},invalidate(){staged=false;preparationSources.delete(owner);},close(){if(!staged)return Promise.resolve();if(retirement)return retirement;retirement=Promise.resolve().then(()=>engine.unload(id)).then(()=>{staged=false;preparationSources.delete(owner);}).finally(()=>{retirement=null;});return retirement;}};
   try{await engine[kind==='median'?'loadMedianModel':'loadQualityModel']({id,blob:file},hooks());staged=true;preparationSources.add(owner);const old=kind==='median'?median:quality;if(old)await engine.unload(old);if(kind==='median')median=id;else quality=id;staged=false;preparationSources.delete(owner);}
   catch(error){failed=true;primary=error;throw error;}
   finally{if(staged)try{await owner.close();}catch(cleanup){if(failed){if(primary!==null&&(typeof primary==='object'||typeof primary==='function')&&Object.isExtensible(primary))try{primary.cleanupError=cleanup;}catch{}}else throw cleanup;}}
  })),
  previewResponseDisplay:(display,{signal,isCurrent=()=>true}={})=>enqueue(async()=>{
   const basis=result,nativeSource=source,current=()=>!disposed&&!signal?.aborted&&result===basis&&!!basis&&source===nativeSource&&!!nativeSource&&isCurrent()===true;
   const check=()=>{if(!current())throw new EngineError('CANCELLED','Response preview owner changed.');};check();
   if(!['ai.text.doctamper','jpeg.comprint','m2.rita'].includes(basis.operation)||!(display.ritaPresentation||display.dtdPresentation||display.comprintPresentation))return null;
   const plan=await displayPreviewPlan(display);check();const count=Math.ceil(display.width/plan.previewStep)*Math.ceil(display.height/plan.previewStep);
   return serialRetainedPreviewWorkspace(count*40+65536,async()=>{check();const started=performance.now(),pixels=await(plan.ritaPresentation?ritaProxyPixels(plan,{x:0,y:0,w:display.width,h:display.height,step:plan.previewStep}):responseProxyPixels(plan,{x:0,y:0,w:display.width,h:display.height,step:plan.previewStep}));check();
    if(pixels?.format!=='rgb8'||!(pixels.data instanceof Uint8Array)||pixels.data.length!==count*3||pixels.width*pixels.height!==count)throw new EngineError('PREVIEW_UNAVAILABLE','Response RGB differs from its admitted grid.');
    const requested=plan.ritaPresentation??plan.comprintPresentation??plan.dtdPresentation,calculated={...requested,threshold:plan.ritaPresentation?ritaDisplayThreshold(requested.threshold):plan.comprintPresentation?Math.round(Math.max(0,requested.threshold??0)):displayThresholdForProxy(requested.threshold,.5)};
    return{...plan,pixels:{...pixels,data:pixels.data.slice(),logicalWidth:display.width,logicalHeight:display.height,preview:true},requestedPresentation:structuredClone(requested),calculatedPresentation:structuredClone(calculated),provisional:true,approximate:true,exportable:false,adaptivePreview:{token:plan.adaptivePreview.token,milliseconds:performance.now()-started,setupMilliseconds:0,cold:false,pixels:count}};
   });
  }),
  planDisplayPreview:display=>enqueue(()=>displayPreviewPlan(display)),
  prepareDisplayPreview:display=>enqueue(async()=>{const bounded=await displayPreviewPlan(display);await(bounded.ritaPresentation?prepareRitaProxy(bounded):prepareResponseProxy(bounded));}),
  readWindow:(display,rect)=>enqueue(()=>pixels(display,rect)),
  readTile:(display,tile)=>enqueue(async()=>{
   if(display.retainedParameterView)return retainedPixels(display,tile);
   if(display.responsePreview){const started=performance.now(),pixels=await(display.ritaPresentation?ritaProxyPixels(display,tile):responseProxyPixels(display,tile));if(display.adaptivePreview?.token){Object.assign(display.adaptivePreview,{milliseconds:performance.now()-started,setupMilliseconds:0,cold:false,pixels:pixels.width*pixels.height});displayAdaptive.observe(display.adaptivePreview.token,display.adaptivePreview);}return pixels;}
   if(display.ritaPresentation)return ritaPixels(display,tile);
   if(display.dtdPresentation||display.comprintPresentation)return activationPixels(display,tile);
   if(display.truforPalette)return truforPalettePixels(display,tile);
   if(display.biomePresentation)return biomePixels(display,tile,true);
   if(display.cloneView)return clonePixels(display,tile);
   if(sourceAliases.has(display.id)){if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}if(source)display=source.surface;}
   if(display.m2Result)return (await m2.readDisplay(display.m2Result,display.view,tile)).pixels;
   if(display.pixels){const frame=await samplePixels({...display.pixels,format:'rgb8'},tile);try{return frame.pixels;}finally{frame.release();}}
   return (await engine.readDisplay({surfaceId:display.id,revision:display.revision,tile,render:display.format==='rgb8'?undefined:{range:display.range??[0,1]}},hooks())).pixels;
  }),
  export:(format,selected,options={})=>enqueue(()=>work(async()=>{
   if(selected?.responsePreview)throw new EngineError('INVALID_INPUT','A transient preview cannot be exported.');
   // Resolve only aliases retained for this Original source, as display reads
   // do after shared-worker invalidation. Result handles keep their own owner.
   if(sourceAliases.has(selected?.id)){if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}if(source)selected=source.surface;}
    const scope=exportSinkScopeFor(client);await scope.retryFailed();const exportOwner=scope.begin();
    watchParameterExportRetirement(exportOwner,source,result);
    try{
   if((selected?.retainedParameterView||selected?.m2Result||selected?.cloneView)&&['png','webp','avif','heic','tiff'].includes(format)){const surface={width:selected.width,height:selected.height,readPixels:rect=>pixels(selected,rect)},owner=selected?.m2Result?m2:engine;const artifact=await exportPresentationRaster(surface,{...options,format},{signal:controller.signal,onOwner:exportOwner.adopt,reserve:async bytes=>{const lease=await owner.reserveExternalMemory({bytes});return()=>owner.releaseExternalMemory(lease.id);}});exportOwner.complete();return exportOwner.borrow(artifact);}
   if(selected?.cloneView&&!selected.m2Result){if(['npz','csv'].includes(format))selected=cloneScientificField(selected);else if(format==='json')selected=undefined;}
   const nativeResult=result?.parameterViews?Object.fromEntries(Object.entries(result).filter(([key])=>key!=='parameterViews')):result;
   let sink;
   sink=await exportOwner.open(createExportSink,{memoryBudgetBytes:32*1024**2,signal:controller.signal,mime:format==='json'?'application/json':format==='csv'?'text/csv':['png','webp','avif','heic','tiff'].includes(format)?'image/'+format:'application/zip'});
    if(format==='npz'&&result?.m2Result){const descriptor=await m2.beginExport(result.m2Result.id,hooks()),owner=m2;exportOwner.after(()=>owner.releaseExport(descriptor.id));for(let offset=0;offset<descriptor.bytes;offset+=owner.ready.windowBytes)await sink.write(await owner.readExport(descriptor.id,offset,Math.min(owner.ready.windowBytes,descriptor.bytes-offset)));}
    else if(format==='npz'&&result?.operation==='tampering.copyMove.dense')await stream(await engine.exportSurface({surfaceId:result.surface.id,revision:result.surface.revision,format:'npz',storage:'temporary'},hooks()),sink,exportOwner);
    else if(format==='npz'&&result?.operation==='noise.noisesniffer'){let offset=0;for(;;){const page=await engine.readNpz({surfaceId:result.surface.id,revision:result.surface.revision,offset,length:1024**2},hooks());await sink.write(page.bytes);if(page.done)break;offset=page.nextOffset;}}
    else if(format==='csv'&&(['float32','float64','int32'].includes(selected?.format)||selected?.cloneExportOrigin&&selected.format==='mask8')){await sink.write(new TextEncoder().encode('x,y,value\r\n'));const origin=selected.cloneExportOrigin??[0,0];for(let y=0;y<selected.height;y++){const answer=await engine[selected.format==='mask8'?'readMask':'readPlane']({surfaceId:selected.id,revision:selected.revision,rect:{x:0,y,width:selected.width,height:1}},hooks()),plane=answer.plane??answer.mask;let text='';for(let x=0;x<selected.width;x++)text+=(x+origin[0])+','+(y+origin[1])+','+plane.data[x]+'\r\n';await sink.write(new TextEncoder().encode(text));}}
    else if(format==='csv'&&selected?.columns){let offset=0;do{const page=await engine.readTableCsv({tableId:selected.id,revision:selected.revision,offset,length:1024},hooks());await sink.write(page.bytes);offset=page.nextOffset;if(page.done)break;}while(true);}
    else if(format==='prnu'){if(!prnu)throw Error('Aucune base PRNU.');await stream(await engine.createPrnuDatabaseExport(prnu.id,hooks()),sink,exportOwner);}
    else if(selected?.id&&!selected.columns)await stream(await engine.exportSurface({...options,surfaceId:selected.id,revision:selected.revision,format,render:format==='npz'?undefined:{range:selected.range??[0,1]},storage:'temporary'},hooks()),sink,exportOwner);
    else if(format==='json')await stream(await engine.exportResultFile(jsonExportValue(result),{format:'json',storage:'temporary'},hooks()),sink,exportOwner);
    else {let maxBytes=32*1024**2;if(format==='npz'&&result.operation==='tampering.copyMove.sparse'){const needed=sparseNpzPreparationBytes(result);const {memory}=await engine.capabilities();maxBytes=Math.max(1,Math.floor(Math.min(Math.max(maxBytes,needed),memory.policyAvailableBytes-memory.knownHeapCapacityBytes)));}const output=await engine.exportResult(nativeResult,{format,maxBytes},hooks());await sink.write(output.bytes);}
    return exportOwner.borrow(exportOwner.finish(sink,await sink.finish()));
   }catch(error){return exportOwner.fail(error);}
  })),
  cancel(){controller?.abort();retainedController?.abort();},
  dispose(){if(disposal)return disposal;disposed=true;controller?.abort();retainedController?.abort();const previewDone=beforeQueuedParameterPreview(clearParameterPreview);const task=queue.then(async()=>{await previewDone;await Promise.allSettled([...retainedPreviews]);const failures=[];for(const action of[()=>retainedRetirement.drain(),()=>clearResponseProxy(),()=>clearRitaProxy(),()=>clearGhostSurfacePreview(),async()=>{await drainRetainedPreviewWorkspaces();await m2?.dispose();await closePreparationSources();await cloneWindowPresenter.dispose();await engine.dispose();}])try{await action();}catch(error){failures.push(error);}if(failures.length){const primary=failures[0];if(failures.length>1&&Object.isExtensible(primary))try{primary.cleanupErrors=failures.slice(1);}catch{}throw primary;}});disposal=task;void task.catch(()=>{if(disposal===task)disposal=null;});return task;}
 };
 return client;
}
