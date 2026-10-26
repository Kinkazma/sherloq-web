import {noisesnifferOwnerRetirement as ownerRetirement} from './noisesniffer-owner-retirement.js';
import {createAutomaticCompleteElaProvider} from './automatic-complete-ela-provider.js';
import {createAutomaticNativeTextPreparation} from './automatic-native-text.js';
import {createAutomaticUnpreparedForgeryscope} from './automatic-unprepared-forgeryscope.js';
import {createAutomaticPreparedForgeryscope} from './automatic-prepared-forgeryscope.js';
import {prepareAutomaticStrictContext} from './automatic-strict-context.js';
import {createAutomaticPreparedSparse} from './automatic-prepared-sparse.js';
import {createAutomaticPreparedDense} from './automatic-prepared-dense.js';
import {automaticPreparedD2prlRequest} from './automatic-prepared-d2prl-request.js';
import {sparseStrictImageRecord} from './sparse-strict-source.js';
import {compileForgeryscopeScientificScope} from './forgeryscope-scientific-scope.js';
import {EngineError,requireValue,checkAbort,normalizeResourceError} from './errors.js';
import {createAutomaticAnalyzer} from './automatic-analyzer.js';
import {automaticSelection} from './automatic-analysis-plan.js';
import {detectPanels} from './auto-zones.js';
import {detectSegmentedPanels} from './auto-zones-stream.js';
import {createAutomaticUnpreparedClones} from './automatic-unprepared-clones.js';
import {pairedBiomes} from './copy-biomes.js';
import {biomeSides,verifyCopyGeometry,createGeometryKernel} from './copy-geometry.js';
import {copyPalette} from './copy-subbiomes.js';
import {createForgeryscopeAnalyzer} from './forgeryscope-analyzer.js';
import {retireForgeryscopeOwners} from './forgeryscope-source-analyzer.js';
import {createCloneCorroboration} from './clone-corroboration.js';
import {CLONE_SOURCES} from './clone-relations.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession} from './temporary-storage.js';
import {createNumericSurface} from './numeric-surface.js';
import {payloadBytes} from './pixel-operations.js';

const geometry={pairedBiomes,biomeSides,verifyCopyGeometry,createGeometryKernel,copyPalette};
const actions=new Set(['selectTab','setPresentation','setRelation','setOpacity','setEla','setElaFamilies','setForgeryscopeBranch','setEnabledSources','setHidden','focus','setD2prlMinimum','setElaNativeContext']);
// One live automatic analysis shares D2PRL's raw-grid identity. Starting a new
// scope invalidates its prior handle; completed exports and surfaces stay owned.
export function createAutomaticRuntime({budget,profile,version,getD2prl,getLanguage,publishResult,exports,onTemporarySession}){
 let current,forge,modelRelease,modelRetirement,disposal;const previewRetirements=new Set(),drainPreviewRetirements=async()=>{for(const retire of [...previewRetirements])await retire();};
 const find=id=>{if(!current||current.id!==id||current.retirement?.started)throw new EngineError('NOT_FOUND','Automatic analysis no longer exists.');return current;};
 function rememberD2Execution(record,value){
  const free=budget.reserve(payloadBytes(value)*2+8192);let copy;try{copy=structuredClone(value);}catch(error){free();throw error;}
  record.d2ProvenanceRelease?.();record.d2Jobs=copy;record.d2ProvenanceRelease=free;
 }
 const interrupted=(error,signal)=>signal?.aborted||['CANCELLED','ABORTED'].includes(error?.code);
 function retainedError(record,caught,{signal,presentation=false}={}){
  const error=normalizeResourceError(caught);
  // Explicit clear/dispose owns destruction. An interrupted useful run keeps
  // its checkpoint even before the first whole detector result is published.
  if(current!==record||!record.analyzer||record.retirement?.started)return error;
  const cancelled=interrupted(error,signal),state=record.analyzer.snapshot();
  if(!cancelled&&(!presentation||!state.completed.length))return error;
  if(cancelled)record.interrupted=true;
  if(error.details?.retainedAnalysis?.analysisId===record.id)return error;
  return new EngineError(error.code??'INTERNAL',error.message,{cause:error,details:{...error.details,retainedAnalysis:{analysisId:record.id,completed:[...state.completed],state}}});
 }
 // Model configuration outlives every per-analysis provider. Keep each
 // refused ACK reachable; acknowledged model/credit owners never repeat.
 function retireModel(){
  if(!modelRetirement){
   const previous=forge,previousRelease=modelRelease;
   const modelOwner=ownerRetirement([async()=>{await previous?.dispose();if(forge===previous)forge=null;}]);
   const creditOwner=ownerRetirement([async()=>{await previousRelease?.();if(modelRelease===previousRelease)modelRelease=null;}]);
   modelRetirement=ownerRetirement([async()=>{await modelOwner();await creditOwner();}],{onRetired(){modelRetirement=null;}});
  }
  return modelRetirement();
 }
 async function settleDisposal(){if(disposal)await disposal;if(modelRetirement)await retireModel();await drainPreviewRetirements();}
 async function clear(){await drainPreviewRetirements();
  const old=current;if(!old)return;
  // Each stage acknowledges before its dependencies can retire. Independent
  // detector owners share a stage; model caches and source readers do not.
  // Refused ACKs leave this record and every later stage reachable for retry.
  old.retirement??=ownerRetirement([async()=>{
   old.retirementStages??=[
    ownerRetirement([()=>old.analyzer?.dispose()]),
    ownerRetirement([()=>old.dense?.dispose(),()=>old.sparse?.dispose(),()=>old.forgeryscopeProvider?.dispose()]),
    ownerRetirement([()=>forge?.clearCache()]),
    ownerRetirement([()=>old.sparseSession?.dispose(),()=>old.nativeText?.dispose()]),
    ownerRetirement([()=>old.nativeTextLoan?.release()]),
    ownerRetirement([()=>old.strictPrepared?.release()]),
    ownerRetirement([()=>old.rgbLease?.release()]),
    ownerRetirement([()=>old.taskRelease?.(),()=>old.controlRelease?.(),()=>old.d2ProvenanceRelease?.()])
   ];
   for(const retire of old.retirementStages)await retire();
  }],{onRetired(){if(current===old)current=null;}});
  return old.retirement();
 }
 async function frame(record,{filters,view=[]}={},hooks={}){
  requireValue(Array.isArray(view)&&view.every(a=>a&&actions.has(a.method)),'Explicit automatic view actions required.');
  for(const action of view)record.analyzer.view[action.method](action.value);
  const preserveError=caught=>retainedError(record,caught,{signal:hooks.signal,presentation:true});
  let lease,primaryError;try{lease=await record.analyzer.prepare(filters,hooks);checkAbort(hooks.signal);const elaNativeContexts=lease.groups?.ela?.nativeContextPresentation??null;if(elaNativeContexts)record.analyzer.view.setElaNativeContexts(elaNativeContexts.contexts);const shown=record.analyzer.visible(lease),state=record.analyzer.snapshot(),bytes=payloadBytes(lease.entries)+6*payloadBytes(elaNativeContexts)+payloadBytes(state)+2*payloadBytes(record.d2Jobs??null)+8192,free=budget.reserve(bytes);
   try{record.interrupted=false;return {id:record.taskId,imageId:record.imageId,operation:record.operation,status:Object.values(state.states).includes('failed')||Object.values(state.nativeContextAvailability??{}).some(v=>['partial','not-evaluable'].includes(v.status))?'partial':'ok',analysisId:record.id,selection:structuredClone(record.selection),data:{...(elaNativeContexts?{elaNativeContexts:structuredClone(elaNativeContexts)}:{}),entries:structuredClone(shown),allEntryCount:lease.entries.length,state,filters:structuredClone(lease.filters),view:record.analyzer.view.getState()},layers:shown.map(e=>({id:e.id,kind:e.pixel_mask?'mask':'polygons',source:e.source,origin:e.origin??[0,0],field:'data.entries',entryId:e.id})),provenance:{engine:version,operation:record.operation,requestedCloneWindowMode:record.analyzer.plan.cloneWindowMode,originalSha256:record.image.sha256,decode:structuredClone(record.image.provenance),coordinates:'original-pixel-centres',...(record.strictPrepared?{automaticStrictContext:{candidateFingerprint:record.strictPrepared.candidateDomain.fingerprint,contextFingerprint:record.strictPrepared.contextDomain.fingerprint,groups:{...record.strictGroups},...(record.d2Jobs?{d2Jobs:structuredClone(record.d2Jobs)}:{})}}:{}),numericalQualification:'Per-engine proofs; M2 Forgeryscope polygon/score differences remain measured, not hidden.'},metrics:{preflightExecutions:0,cache:{analysis:record.reused},memory:budget.snapshot()}};}finally{free();}
  }catch(caught){throw primaryError=preserveError(caught);}
  finally{try{await retireForgeryscopeOwners([()=>lease?.release()],primaryError?{primary:primaryError}:{});if(!primaryError)checkAbort(hooks.signal);}catch(cleanup){throw preserveError(cleanup);}}
 }
 return {
  configured(){return {forgeryscope:!!forge,ocr:!!getLanguage(),d2prl:!!getD2prl()?.configured()};},
  async load(input,{signal}={}){
   requireValue(input&&Object.keys(input).every(k=>k==='forgeryscope'),'Use loadM3Models for OCR and loadD2prlModel for D2PRL.');
   await settleDisposal();await clear();let candidate,release,failure,failed=false;
   try{if(input.forgeryscope){const c=input.forgeryscope;requireValue(c.assets&&c.runtimes&&typeof c.preparationFactoryUrl==='string'&&typeof c.siftFactoryUrl==='string','Explicit Forgeryscope assets, runtimes and preparation/SIFT factory URLs required.');release=budget.reserve(payloadBytes(c)*2);const config=structuredClone(c),preparationFactory=(await import(config.preparationFactoryUrl)).default,siftFactory=(await import(config.siftFactoryUrl)).default;checkAbort(signal);candidate=createForgeryscopeAnalyzer({...config,preparationFactory,siftFactory,budget,computeProfile:profile.id,resourceHints:profile.hints});}
    await retireModel();forge=candidate;modelRelease=release;candidate=null;release=null;return this.configured();
   }catch(error){failed=true;failure=error;throw error;}finally{await retireForgeryscopeOwners([()=>candidate?.dispose(),()=>release?.()],failed?{primary:failure}:{});}
  },
  async run(task,image,hooks={}){
   await settleDisposal();const p=task.params??{};requireValue(Object.keys(p).every(k=>['selection','d2Minimum','ela','maxConcurrent','excludedFeatures','scientificScope'].includes(k)),'Unknown automatic analysis parameter.');requireValue(!task.regions?.length,'Automatic polygons belong in params.selection.');requireValue(['auto','cpu',undefined].includes(task.backend),'Automatic analysis supports auto or reference CPU.');
   const cloneWindowMode=task.cloneWindowMode??'independent';requireValue(['independent','global'].includes(cloneWindowMode),'Invalid automatic clone window mode.');
   checkAbort(hooks.signal);const key=JSON.stringify([task.imageId,task.operation,p,task.backend??'auto',cloneWindowMode]);
   if(current?.retirement?.started)await clear();
   if(current?.key===key){current.taskId=task.id;current.reused=true;return frame(current,{},hooks);}
   await clear();const r={id:crypto.randomUUID(),key,image,imageId:task.imageId,operation:task.operation,taskId:task.id,reused:false};current=r;
   let rgbPending;
   async function rgb(signal){
    if(image.pixels)return image.pixels;if(r.rgbLease)return r.rgbLease.pixels;
    if(!rgbPending){const d=image.surface.descriptor;rgbPending=image.surface.readWindow({x:0,y:0,width:d.width,height:d.height},{signal}).then(lease=>{r.rgbLease=lease;return lease.pixels;}).finally(()=>{rgbPending=null;});}return rgbPending;
   }
   try{
    checkAbort(hooks.signal);const shape=image.surface?.descriptor??image.pixels;let selection=p.selection;if(p.scientificScope){compileForgeryscopeScientificScope(p.scientificScope,{width:shape.width,height:shape.height,sourceSha256:image.sha256});selection??={regions:p.scientificScope.regions.map(r=>r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]]),envelope:null,disabled:[]};}
    if(selection===undefined){let polygons;
     if(image.segmented){const detected=await detectSegmentedPanels(image,{budget,signal:hooks.signal,onProgress:hooks.onProgress});try{polygons=structuredClone(detected.polygons);}finally{detected.dispose();}}
     else{const releases=[];try{polygons=await detectPanels(image.pixels,{signal:hooks.signal,account:n=>releases.push(budget.reserve(n)),onProgress:fraction=>hooks.onProgress?.({phase:'automatic-panels',fraction})});}finally{releases.forEach(f=>f());}}
     selection=automaticSelection(shape.width,shape.height,polygons);
    }
    r.controlRelease=budget.reserve(payloadBytes(selection)*3+8192);r.selection=structuredClone(selection);
    let preparedTask=task,scientificScope=p.scientificScope;
    if(['analysis.clones','analysis.complete'].includes(task.operation)&&scientificScope?.status==='ready'&&scientificScope.regions.length>0&&(scientificScope.searchRegions??scientificScope.regions).length>0&&scientificScope.text?.status!=='complete'){
     let seed;try{seed=await prepareAutomaticStrictContext(image,task,{budget,signal:hooks.signal});r.nativeText=createAutomaticNativeTextPreparation({budget,profile});r.nativeTextLoan=await r.nativeText.prepare(seed,{language:getLanguage(),signal:hooks.signal,onProgress:hooks.onProgress});preparedTask=r.nativeTextLoan.task;scientificScope=r.nativeTextLoan.scientificScope;}finally{seed?.release();}
    }
    const preparedMode=['analysis.clones','analysis.complete'].includes(task.operation)&&scientificScope!==undefined;
    let contextPending;
    async function strictContext(options={}){
     if(!preparedMode)return null;checkAbort(options.signal);
     if(r.strictPrepared)return r.strictPrepared;
     if(!contextPending){if(!r.strictTask){const free=budget.reserve(payloadBytes(preparedTask)*2+8192);try{r.strictTask=structuredClone(preparedTask);r.taskRelease=free;}catch(error){free();throw error;}}contextPending=prepareAutomaticStrictContext(image,r.strictTask,{budget,signal:options.signal}).then(value=>r.strictPrepared=value).finally(()=>{contextPending=null;});}
     const value=await contextPending;checkAbort(options.signal);return value;
    }
    const strictRecord=()=>r.strictRecord??=sparseStrictImageRecord(image,budget);
    const dense={clearCheckpoint(key){return r.dense?.clearCheckpoint(key);},async analyze(params,options){const context=await strictContext(options);if(context){r.dense??=createAutomaticPreparedDense(strictRecord(),budget,{geometry,profile,getContext:strictContext});r.strictGroups={...r.strictGroups,patchmatch:cloneWindowMode==='global'?'native-explicit-common-bank-before-descriptors-texture-highpass-NCC':'native-independent-windows-before-descriptors-texture-highpass-NCC'};}else r.dense??=createAutomaticUnpreparedClones(strictRecord(),budget,profile,{kind:'dense',geometry,selection:r.selection,task});return r.dense.analyze(params,{...options,cloneWindowMode});}};
    // SIFT and OCR borrow bounded original rows/windows. Preserve their source's
    // temporary-storage context, including reflected extraction passes.
    const sparseStorage={get temporarySession(){return image.session??r.sparseSession;},async getTemporarySession(options={}){
     if(image.ensureTemporarySession)return image.ensureTemporarySession(options);
     checkAbort(options.signal);if(r.sparseSession)return r.sparseSession;
     r.sparseSessionPending??=createTemporarySession({budget,signal:options.signal}).then(session=>{r.sparseSession=session;onTemporarySession?.({id:session.id,backend:session.backend});return session;}).finally(()=>{r.sparseSessionPending=null;});
     return r.sparseSessionPending;
    }};
    const sparse={clearCheckpoint(key){return r.sparse?.clearCheckpoint(key);},async analyze(params,options){const context=await strictContext(options),language=getLanguage();if(context){if(options.scientificScope?.text?.status!=='complete')throw new EngineError('SCIENTIFIC_PREPARATION_INCOMPLETE','Strict Panels + Text requires its actual completed text preparation.');r.sparse??=createAutomaticPreparedSparse(strictRecord(),budget,profile,{getContext:strictContext});r.strictGroups={...r.strictGroups,sift:cloneWindowMode==='global'?'prepared-native-reflected-SIFT-G2NN-explicit-common-bank':'prepared-native-reflected-SIFT-G2NN-autonomous-windows'};}else{if(!options.scientificScope&&!language)throw new EngineError('MODEL_UNAVAILABLE','Load verified English OCR weights through loadM3Models({models:{},language}) for SIFT Panels + Text.');r.sparse??=createAutomaticUnpreparedClones(strictRecord(),budget,profile,{kind:'sparse',selection:r.selection,task});}return r.sparse.analyze(params,{...options,cloneWindowMode,language,storageContext:sparseStorage});}};
    const d2prl={releaseCheckpoint(key){return getD2prl()?.releaseCheckpoint?.(key);},async runOwned(request,source,options){const adapter=getD2prl();if(!adapter?.configured())throw new EngineError('MODEL_UNAVAILABLE','Load the pinned D2PRL manifest through loadD2prlModel.');let nativeRequest;if(request.retainedD2Preview===true){requireValue(find(r.id)===r&&r.d2Source&&typeof request.params?.refilterOf==='string','Temporary D2PRL refilter requires its exact retained source.');return adapter.runOwned({...request,cloneWindowMode},r.d2Source,{...options,cloneWindowMode});}try{const context=await strictContext(options);if(context&&!request.params?.refilterOf){nativeRequest=await automaticPreparedD2prlRequest(context,{id:request.id,imageId:request.imageId,minimum:request.params.minimum,cpu:request.backend==='cpu'},{budget,signal:options.signal});request=nativeRequest.task;rememberD2Execution(r,{requestedJobs:nativeRequest.metadata,actualNativePipelines:null,executionStatus:'not-received'});}request={...request,cloneWindowMode};let answer;try{const nativeSource=context?strictRecord():image.segmented?image:{...image,pixels:await rgb(options.signal)};answer=await adapter.runOwned(request,nativeSource,{...options,cloneWindowMode});checkAbort(options.signal);const metadata=answer.data?.metadata;if(metadata?.strictSourceContext){
      const modes=[answer.cloneWindowMode,answer.provenance?.cloneWindowMode,metadata.cloneWindowMode,metadata.strictSourceContext.cloneWindowMode].filter(v=>v!==undefined),effective=modes[0];
      requireValue(['independent','global'].includes(effective)&&modes.every(v=>v===effective)&&effective===cloneWindowMode,'D2 native result mode contradicts its requested or retained provenance.');
      const nativePipelines=metadata.nativePipelines??(metadata.strictSourceContext.empty===true?[]:null);requireValue(Array.isArray(nativePipelines),'D2 strict result lacks its actual native pipeline receipts.');
      rememberD2Execution(r,{requestedJobs:r.d2Jobs?.requestedJobs??null,actualNativePipelines:nativePipelines,cloneWindowMode:effective,executionStatus:'received',inferences:metadata.inferences??answer.metrics?.inferences??null});
      r.strictGroups={...r.strictGroups,d2prl:effective==='global'?'native-strict-adapter-explicit-union-common-bank':'native-strict-adapter-independent-declared-window-jobs'};
     }const value=answer;r.d2Source=nativeSource;answer=null;return value;}catch(primary){await retireForgeryscopeOwners([()=>answer?.release()],{primary});throw primary;}}finally{nativeRequest?.release();}},readRawOwned(request){return getD2prl().readRawOwned(request);}};
    const forgeryscope={async analyzeSelection(source,plan,options={}){if(!forge)throw new EngineError('MODEL_UNAVAILABLE','Load Forgeryscope assets and runtime URLs through loadAutomaticModels.');const provider=r.forgeryscopeProvider??=createAutomaticUnpreparedForgeryscope(forge,{image:strictRecord(),selection:r.selection,task,budget});return provider.analyzeSelection(source,plan,{...options,cloneWindowMode});},async analyze(source,params,options={}){if(!forge)throw new EngineError('MODEL_UNAVAILABLE','Load Forgeryscope assets and runtime URLs through loadAutomaticModels.');const provider=r.forgeryscopeProvider??=createAutomaticPreparedForgeryscope(forge,{getContext:strictContext,budget,admitGlobal:()=>true});const result=await provider.analyze(source,params,{...options,cloneWindowMode:task.cloneWindowMode??'independent'});if(result.metadata?.strict_native_contexts)r.strictGroups={...r.strictGroups,forgeryscope:result.cloneWindowMode==='independent'?'independent-native-window-decisions':'explicit-global-native-window-context-union'};return result;}};
    const completeEla=task.operation==='analysis.complete'&&preparedMode?createAutomaticCompleteElaProvider({...p.ela,image,budget,getContext:strictContext,maxWorkers:profile.maxWorkers,onTemporarySession}):undefined;
    r.analyzer=await createAutomaticAnalyzer({image,imageId:task.imageId,selection:r.selection,budget,engines:{dense,sparse,geometry,d2prl,forgeryscope,...(completeEla?{ela:completeEla}:{})},complete:task.operation==='analysis.complete',cpu:task.backend==='cpu',d2Minimum:p.d2Minimum,excludedFeatures:p.excludedFeatures,scientificScope,cloneWindowMode,maxConcurrent:p.maxConcurrent,ela:{...p.ela,maxWorkers:profile.maxWorkers,onTemporarySession}});
    await r.analyzer.run({...hooks,onState:state=>hooks.onProgress?.({phase:'automatic-state',state})});checkAbort(hooks.signal);return await frame(r,{},hooks);
   }catch(caught){const error=retainedError(r,caught,{signal:hooks.signal});if(current===r&&error?.details?.retainedAnalysis?.analysisId!==r.id)await retireForgeryscopeOwners([clear],{primary:error});throw error;}
  },
  async resume(request,hooks={}){
   const r=find(request.analysisId);
   try{
    checkAbort(hooks.signal);
    // A cancelled presentation may follow fully completed detectors. Resume
    // only that presentation; ordinary completed analyses still cannot rerun.
    if(!(r.interrupted&&request.groups===undefined&&r.analyzer.snapshot().resumable?.length===0))await r.analyzer.resume({groups:request.groups},{...hooks,onState:state=>hooks.onProgress?.({phase:'automatic-state',state})});
    checkAbort(hooks.signal);return await frame(r,{},hooks);
   }catch(error){throw retainedError(r,error,{signal:hooks.signal});}
  },
  async update(request,hooks){return frame(find(request.analysisId),request,hooks);},
  async render(request,{signal,onProgress}={}){
   const r=find(request.analysisId),a=r.analyzer,{width,height}=a.plan;
   requireValue(request.layer===undefined||['corroboration','ela-preview','energy-low','energy-high'].includes(request.layer),'Unknown automatic layer.');
   if(request.layer&&request.layer!=='corroboration'){
    const raw=a.acquireResults();let surface,published=false;
    try{const ela=raw.values.ela;if(!ela)throw new EngineError('RESULT_UNAVAILABLE','ELA group has no completed result.');
     if(request.layer==='ela-preview'){const original=ela.previewFor?ela.previewFor(a.view.getState().elaNativeContextId):ela.preview.surface,id=crypto.randomUUID();let closed=false;const retire=ownerRetirement([()=>raw.release()]);surface={descriptor:{...original.descriptor,id},async readWindow(rect,hooks){if(closed)throw new EngineError('DISPOSED','Automatic layer disposed.');const value=await original.readWindow(rect,hooks);return {...value,surfaceId:id};},dispose(){closed=true;return retire();}};}
     else if(ela.energyPreview&&ela.energy){const original=ela.energyPreview(request.layer==='energy-low'?'energy_low_score':'energy_high_score',a.view.getState().elaNativeContextId),id=crypto.randomUUID();let closed=false;const retire=ownerRetirement([()=>raw.release()]);surface={descriptor:{...original.descriptor,id},async readWindow(rect,hooks){if(closed)throw new EngineError('DISPOSED','Automatic Energy presentation disposed.');const value=await original.readWindow(rect,hooks);return{...value,surfaceId:id};},dispose(){closed=true;return retire();}};}
     else{const store=ela.energy?.[request.layer==='energy-low'?'energy_low_score':'energy_high_score'];if(!store)throw new EngineError('RESULT_UNAVAILABLE','Enable the ELA background energy calculation for this layer.');surface=createNumericSurface(store,{width,height,format:'float32',budget,semantics:'Native JPEG residual energy score; not a probability.',dispose:()=>raw.release()});}
     const bundle=publishResult(r.imageId,{surface});published=true;return {...bundle,analysisId:r.id,view:a.view.getState(),layers:[{id:request.layer,kind:surface.descriptor.format==='rgb8'?'rgb':'scalar',surfaceId:bundle.surface.id,origin:[0,0]}]};
    }finally{if(!published){if(surface)await surface.dispose();else await raw.release();}}
   }
   let lease,engine,store,session,surface,published=false;
   try{lease=await a.prepare({}, {signal,onProgress});const entries=a.visible(lease).filter(e=>CLONE_SOURCES.includes(e.source));engine=createCloneCorroboration({budget});
    const headroom=budget.reserve(64*1024**2);try{store=await createSegmentedBytes(width*height*4,{budget,signal,storage:'auto',getTemporarySession:async()=>{if(!session){session=await createTemporarySession({budget,signal});onTemporarySession?.({id:session.id,backend:session.backend});}return session;}});}finally{headroom();}
    await engine.stripes({width,height,entries,excluded:a.plan.excluded,byContext:true},strip=>store.write(new Uint8Array(strip.values.buffer,strip.values.byteOffset,strip.values.byteLength),strip.top*width*4),{signal,onProgress:fraction=>onProgress?.({phase:'automatic-corroboration',fraction})});await store.flush();checkAbort(signal);
    surface=createNumericSurface(store,{width,height,format:'int32',budget,semantics:'Count of distinct detector × search-context votes; D2PRL at most one; ELA never votes.',dispose:async()=>{try{await store.dispose();}finally{await session?.dispose();}}});
    const bundle=publishResult(r.imageId,{surface});published=true;return {...bundle,analysisId:r.id,view:a.view.getState(),layers:[{id:'corroboration',kind:'count',surfaceId:bundle.surface.id,origin:[0,0]}]};
   }finally{engine?.dispose();await lease?.release();if(!published){if(surface)await surface.dispose();else try{await store?.dispose();}finally{await session?.dispose();}}}
  },
  async previewD2(request,hooks={}){
   await drainPreviewRetirements();const r=find(request.analysisId),a=r.analyzer,image=r.image,source=r.d2Source,committedView=a.view.getState(),committedFilterIdentity=a.previewD2FilterIdentity();requireValue(request.layer==='corroboration'&&Number.isInteger(request.minimum)&&request.minimum>=0&&request.minimum<=5000&&source&&request.expectedView&&JSON.stringify(request.expectedView)===JSON.stringify(committedView),'Retained automatic D2PRL minimum, layer and committed view required.');
   const check=()=>{checkAbort(hooks.signal);requireValue(find(request.analysisId)===r&&r.analyzer===a&&r.image===image&&r.d2Source===source&&a.previewD2FilterIdentity()===committedFilterIdentity&&JSON.stringify(a.view.getState())===JSON.stringify(committedView),'Automatic preview source, basis or view changed.');};
   const {width,height}=a.plan;let lease,engine,store,session,surface,storageRetirement,retirement,published=false,failed=false;
   const release=()=>{if(!retirement){const steps=[()=>engine?.dispose(),()=>lease?.release(),async()=>{if(surface)await surface.dispose();else{storageRetirement??=ownerRetirement([()=>store?.dispose(),()=>session?.dispose()]);await storageRetirement();}}];retirement=ownerRetirement(steps,{onRetired(){previewRetirements.delete(retirement);}});previewRetirements.add(retirement);}return retirement();};
   try{check();lease=await a.prepareD2Preview({minimum:request.minimum,filters:request.filters,expectedView:request.expectedView},hooks);check();requireValue(lease.inferences===0&&lease.calculatedMinimum===request.minimum,'Automatic D2PRL preview must not perform inference.');const entries=lease.selectedEntries.filter(e=>CLONE_SOURCES.includes(e.source));engine=createCloneCorroboration({budget});
    const headroom=budget.reserve(64*1024**2);try{store=await createSegmentedBytes(width*height*4,{budget,signal:hooks.signal,storage:'auto',getTemporarySession:async()=>{if(!session){session=await createTemporarySession({budget,signal:hooks.signal});onTemporarySession?.({id:session.id,backend:session.backend});}return session;}});}finally{headroom();}check();
    await engine.stripes({width,height,entries,excluded:a.plan.excluded,byContext:true},strip=>store.write(new Uint8Array(strip.values.buffer,strip.values.byteOffset,strip.values.byteLength),strip.top*width*4),{signal:hooks.signal,onProgress:fraction=>hooks.onProgress?.({phase:'automatic-corroboration',fraction})});check();await store.flush();check();
    const calculatedView=lease.calculatedView;await lease.release();lease=null;check();engine.dispose();engine=null;storageRetirement=ownerRetirement([()=>store.dispose(),()=>session?.dispose()]);const plane=createNumericSurface(store,{width,height,format:'int32',budget,semantics:'Count of distinct detector × search-context votes; D2PRL at most one; ELA never votes.',dispose(){}}),closePlane=ownerRetirement([()=>plane.dispose()]);surface={...plane,dispose:ownerRetirement([async()=>{await closePlane();await storageRetirement();}])};check();const bundle=publishResult(r.imageId,{surface});published=true;return{...bundle,analysisId:r.id,calculatedMinimum:request.minimum,calculatedView,inferences:0,metrics:{inferences:0},originalSha256:image.sha256,...(image.sourceRegionDomain?{sourceRegionDomain:image.sourceRegionDomain,sourceRegionOrigin:image.sourceRegionOrigin??image.provenance?.sourceRegionOrigin}:{}),provisional:true,exportable:false};
   }catch(error){failed=true;throw error;}finally{if(!published)try{await release();}catch(error){if(!failed)throw error;}}
  },
  async export(request,hooks){const r=find(request.analysisId);let archive;try{const options=r.image.sourceRegionDomain?{...request.options,provenance:{...request.options?.provenance,originalSha256:r.image.sha256,sourceRegionDomain:r.image.sourceRegionDomain,sourceRegionOrigin:r.image.provenance.sourceRegionOrigin,encodedSourceRewritten:false,originalEncodedBytesPreserved:true}}:request.options??{};archive=await r.analyzer.export(options,request,{...hooks,onTemporarySession});const descriptor=exports.adopt(archive,{imageId:r.imageId,analysisId:r.id,operation:r.operation,originalSha256:r.image.sha256,width:r.analyzer.plan.width,height:r.analyzer.plan.height});archive=null;return descriptor;}finally{await archive?.dispose();}},
  clear,
  async clearImage(id){if(current?.imageId===id)await clear();},
  dispose(){if(disposal)return disposal;const task=Promise.resolve().then(async()=>{await clear();await retireModel();});disposal=task;void task.finally(()=>{if(disposal===task)disposal=null;}).catch(()=>{});return task;},
  get active(){return !!current;}
 };
}
