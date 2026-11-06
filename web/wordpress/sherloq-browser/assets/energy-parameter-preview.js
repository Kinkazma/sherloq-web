import {recompressionSizingIdentity} from './recompression-controls.js?v=0.32.0';
import {selectionIdentity} from './unified-engine/src/recompression-probe.js';
import {createContextEnergyParameterPreview} from './energy-context-parameter-preview.js?v=0.32.0';
import {createEnergyPreviewStatisticsOwner} from './energy-preview-statistics-owner.js?v=0.32.0';
import {energyFieldAvailable,sampleEnergyField,energyPlaneCount,energyNativeFieldNames} from './energy-native-fields.js?v=0.32.0';
import {renderEnergy} from './energy-render.js?v=0.32.0';
import {EngineError,serializeEngineError} from './unified-engine/src/errors.js';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
import {createAdaptivePreview,ADAPTIVE_PREVIEW_MAX_SIDE,ADAPTIVE_PREVIEW_MAX_PIXELS} from './adaptive-preview.js?v=0.32.0';

const MiB=1024**2;
// Isolate a retained cache release from the large per-render lexical context.
function preparationCacheRelease(release,lease){return()=>release(lease);}
const fail=(code,message)=>{throw new EngineError(code,message);};
const check=signal=>{if(signal?.aborted)fail('CANCELLED','Cancelled');};
// The temporary arrays belong only to an explicitly provisional presentation.
// The retained native analysis and its planes are read, never rewritten.
export function createEnergyParameterPreview(options={}){return createContextEnergyParameterPreview({...options,loadCodec:async()=>options.dependencies?.jpegCodec??(await import('./unified-engine/src/jpeg.js')).jpegCodec,createSingle:child=>createSingleEnergyParameterPreview({...options,...child,exactNative:null,dependencies:{...options.dependencies,...child.dependencies}}),fallback:createSingleEnergyParameterPreview(options)});}
function createSingleEnergyParameterPreview({engine,readOriginal,dependencies={},adaptive=createAdaptivePreview(),exactNative}={}){
 const render=dependencies.renderEnergy??renderEnergy;
 let modules,initializationMilliseconds=0;
 async function operations(){if(modules)return modules;const start=performance.now();modules=Promise.all([
  dependencies.energyParams?{energyParams:dependencies.energyParams}:import('./unified-engine/src/energy-pipeline.js'),
  import('./unified-engine/src/energy-auto.js'),
  dependencies.prepareEnergy?{prepareEnergy:dependencies.prepareEnergy}:import('./unified-engine/src/energy-prepare.js'),
  dependencies.segmentEnergy&&dependencies.energyColor?{segmentEnergy:dependencies.segmentEnergy,energyColor:dependencies.energyColor}:import('./unified-engine/src/energy-segment.js'),
  import('./unified-engine/src/energy-preparation-context.js')
 ]).then(parts=>Object.assign({},...parts,dependencies));try{return await modules;}finally{initializationMilliseconds+=performance.now()-start;}}
 let qualifiedLog=null,logLease=null,codecLease=null,codecPromise=null,statisticsOwner=null,disposed=false,closed=false,retiring=null,active=false,finishActive;
 const retiredInputLeases=new Set();
 const releasedLeases=new WeakSet();
 const planeCache=new Map();let nativeGrid=null,preparedCache=null,referenceSerial=0;const references=new WeakMap();
 const reference=value=>{if(!value||typeof value!=='object')return null;if(!references.has(value))references.set(value,++referenceSerial);return references.get(value);};
 function nativeGridKey(analysis,width,height,step){const d=analysis.data,preparedIdentity=d.metadata?.energy?.preparedIdentity;if(energyPlaneCount(analysis)===1&&typeof preparedIdentity==='string'&&preparedIdentity)return JSON.stringify(['verified-synthesis-preparation',analysis.provenance.originalSha256,analysis.provenance.decode??null,analysis.sourceRegionDomain?.fingerprint??null,analysis.synthesis?.key??d.metadata?.synthesis?.key??null,preparedIdentity,width,height,step,1]);const field=name=>{const handle=analysis.planeSurfaces?.[name]??(name==='energy_low_score'?analysis.surface:null);if(handle)return[handle.id,handle.revision,handle.width,handle.height,handle.format];const q=/^energy_plane_(\d)$/.exec(name);return reference(q?(Array.isArray(d.energy_planes)?d.energy_planes[+q[1]]:d.energy_planes):d[name]);};return JSON.stringify([analysis.id,analysis.provenance.originalSha256,analysis.sourceRegionDomain?.fingerprint??null,analysis.sourceRegionSourceSurface?.id,analysis.sourceRegionSourceSurface?.revision,reference(analysis),width,height,step,energyPlaneCount(analysis),analysis.synthesis?.key??null,...energyNativeFieldNames(analysis).map(field)]);}
 async function clearPreparedCache(){const previous=preparedCache;if(!previous)return;previous.retiring=true;await release(previous.lease);if(preparedCache===previous)preparedCache=null;}
 async function retirePreparationInput(entry){
  const input=entry?.preparationInput;if(!input)return;input.retiring=true;input.controller.abort();await input.task?.catch(()=>{});if(input.owner)await input.owner.capture.dispose();else await release(input.lease);
  for(const grid of new Set([entry,nativeGrid]))if(grid?.preparationInput===input){grid.preparationInput=null;grid.bytes-=input.bytes;grid.leases=grid.leases.filter(lease=>lease!==input.lease);}
 }
 async function clearNativeGrid(){await clearPreparedCache();await retirePreparationInput(nativeGrid);const previous=nativeGrid;nativeGrid=null;for(const lease of previous?.leases??[])retiredInputLeases.add(lease);await retireCompositeOwners([...retiredInputLeases].map(lease=>()=>release(lease)));}
 let activeDone=Promise.resolve();
 async function release(lease,failure){const provided=arguments.length>1;if(!lease||releasedLeases.has(lease))return;try{const ack=await engine.releaseExternalMemory(lease.id);if(ack===false||ack===0)fail('BUSY','The Energy preview workspace is still awaiting its retirement ACK.');releasedLeases.add(lease);retiredInputLeases.delete(lease);}catch(error){retiredInputLeases.add(lease);if(!provided)throw error;try{failure.details={...failure.details,cleanup:serializeEngineError(error)};}catch{/* A frozen or primitive primary must stay primary; the lease awaits ACK. */}}}
 async function logarithm(){
  if(qualifiedLog)return qualifiedLog;const start=performance.now();logLease=await engine.reserveExternalMemory({bytes:512*1024});
  try{const {energyLogData}=dependencies.energyLogData?dependencies:await import('./unified-engine/src/energy-log-data.js'),{referenceLogFunction}=dependencies.referenceLogFunction?dependencies:await import('./unified-engine/src/energy-log-reference.js');qualifiedLog=referenceLogFunction({minimumBits:973078528,maximumBits:1157627904},new Uint8Array(energyLogData().buffer));return qualifiedLog;}
  catch(error){await release(logLease,error);logLease=null;throw error;}finally{initializationMilliseconds+=performance.now()-start;}
 }
 async function codec(){
  if(dependencies.sharedCodec)return dependencies.sharedCodec();
  if(!codecLease)codecLease=await engine.reserveExternalMemory({bytes:32*MiB});
  if(codecPromise)return codecPromise;const start=performance.now();codecPromise=dependencies.jpegCodec?Promise.resolve(dependencies.jpegCodec):import('./unified-engine/src/jpeg.js').then(m=>m.jpegCodec);try{return await codecPromise;}finally{initializationMilliseconds+=performance.now()-start;}
 }
 async function residualPlanes(original,quality,identity,signal,{params,imageId}={}){
  const levels=quality<=5?[quality,quality+5,quality+10]:quality>=96?[quality-10,quality-5,quality]:[quality-5,quality,quality+5],sn=original.width*original.height,planes=new Float32Array(3*sn),recompressed=[],probes=[];
  const describe=dependencies.describeEnergy??(await import('./unified-engine/src/energy-primitives.js')).describeEnergy;
  for(let i=0;i<3;i++){
   check(signal);if(disposed)fail('CANCELLED','Energy draft owner disposed.');
   const key=identity+'/'+levels[i];let entry=planeCache.get(key);
   if(entry){planeCache.delete(key);planeCache.set(key,entry);}
   else{
    while(planeCache.size>=5){const [oldKey,old]=planeCache.entries().next().value;planeCache.delete(oldKey);await release(old.lease);}
    const lease=await engine.reserveExternalMemory({bytes:sn*4});let failure;
    try{
     let owned,decoded;
     try{
      if(params?.recompression!==undefined){if(typeof engine.recompressPreviewPixels!=='function')fail('DRAFT_CODEC_UNAVAILABLE','The selected recompression codec is unavailable for this provisional Energy view.');owned=await engine.recompressPreviewPixels({imageId,pixels:original,params,quality:levels[i],paletteAxis:'relative'},{signal});decoded=owned.pixels;}
      else{const jpeg=await codec();decoded=await jpeg.recompress(original,levels[i],{signal});}check(signal);
     if(decoded?.width!==original.width||decoded.height!==original.height||decoded.format!=='rgb8'||!(decoded.data instanceof Uint8Array)||decoded.data.length!==3*sn)fail('INVALID_INPUT','Draft JPEG recompression changed the sampled source.');
     const described=await describe(original,decoded,{signal});check(signal);
     if(!(described?.energy instanceof Float32Array)||described.energy.length!==sn)fail('INVALID_INPUT','Invalid provisional JPEG residual plane.');
     entry={energy:described.energy,lease,...(owned?{codecProvenance:owned.provenance}:{} )};planeCache.set(key,entry);recompressed.push(levels[i]);
     }finally{await owned?.release();}
    }catch(error){failure=error;throw error;}finally{if(!entry)await release(lease,failure);}
   }
   planes.set(entry.energy,i*sn);if(entry.codecProvenance)probes.push(entry.codecProvenance);
  }
  return{planes,levels,recompressed,...(probes.length?{probes}:{} )};
 }
 return {
  async render(analysis,{params,presentation={view:'overlay',opacity:70},preview={},signal:valueSignal,sourceSignal,backend='auto',prepareInputsOnly=false}={}){
   // Idle capture owns immutable Source/grid inputs, independently of a value
   // gesture. Only the private Source signal may interrupt an admitted capture.
   if(disposed)fail('DISPOSED','Energy draft owner disposed.');if(active)fail('BUSY','An energy draft is already running.');check(valueSignal);const signal=prepareInputsOnly?sourceSignal??valueSignal:valueSignal;check(signal);
   active=true;activeDone=new Promise(resolve=>{finishActive=resolve;});const started=performance.now(),startedAt=Date.now(),initializationBefore=initializationMilliseconds;try{
   if(preparedCache?.retiring)await clearPreparedCache();if(retiredInputLeases.size||nativeGrid?.preparationInput?.retiring||nativeGrid?.preparationInput?.owner?.retiring)await clearNativeGrid();check(signal);
   const {energyParams,energyProfile,estimateEnergy,energyDeviations,prepareEnergy:prepare,segmentEnergy:segment,energyColor:color,createEnergyDraftPreparationOwner,energyDraftPreparationPlan,retainEnergyPreparationContext}=await operations();check(signal);
   const p=energyParams(params),d=analysis?.data,{width,height}=d??{},n=width*height,nativeParams=analysis?.provenance?.params;
   if(!nativeParams)fail('DRAFT_BASE_UNAVAILABLE','A retained native energy analysis is required.');if(!['auto','cpu','webgpu'].includes(backend))fail('INVALID_INPUT','Invalid Energy preview backend.');
   const planeCount=energyPlaneCount(analysis),synthesis=planeCount===1,nativeQuality=synthesis?null:d?.metadata?.quality??(nativeParams.quality||null),quality=synthesis?null:p.quality||nativeQuality;
   if(!synthesis&&(!Number.isInteger(quality)||quality<1||quality>100))fail('DRAFT_BASE_UNAVAILABLE','The native resolved JPEG quality is unavailable.');
   const selected=!synthesis&&p.recompression!==undefined,recipe=synthesis?'synthesis-native-1':selectionIdentity({...p,quality}),nativeRecipe=synthesis?recipe:selectionIdentity({...nativeParams,quality:nativeQuality}),changedQuality=!synthesis&&(quality!==nativeQuality||recipe!==nativeRecipe);
   if(prepareInputsOnly&&changedQuality)return{prepared:false,retained:true,reason:'changed-quality'};
   if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(n)||!energyNativeFieldNames(analysis).every(name=>energyFieldAvailable(analysis,name)))fail('DRAFT_BASE_UNAVAILABLE','Complete retained native energy fields and reference scope are required for this provisional view.');
   const domain=analysis.sourceRegionDomain;if(changedQuality&&domain&&domain.countIncluded!==domain.width*domain.height)fail('SOURCE_SCOPE_PREVIEW_UNSUPPORTED','A changed-quality draft cannot recompress excluded source pixels.');
   const {maxWidth=ADAPTIVE_PREVIEW_MAX_SIDE,maxHeight=ADAPTIVE_PREVIEW_MAX_SIDE,maxPixels=ADAPTIVE_PREVIEW_MAX_PIXELS,maxWorkingBytes:availableWorkingBytes=128*MiB}=preview;if(![maxWidth,maxHeight].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=ADAPTIVE_PREVIEW_MAX_SIDE)||!Number.isSafeInteger(maxPixels)||maxPixels<1||!Number.isSafeInteger(availableWorkingBytes)||availableWorkingBytes<0)fail('INVALID_INPUT','Invalid energy draft bounds.');
   // The caller reports free memory after these retained input owners. They
   // already replace the same bytes in the frame below, or retire with ACK
   // before a new grid. Credit only those live owners, never setup/other leases.
   const maxWorkingBytes=availableWorkingBytes+(nativeGrid?.bytes??0)+(preparedCache?.bytes??0);if(!Number.isSafeInteger(maxWorkingBytes))fail('INVALID_INPUT','Invalid retained energy draft workspace.');
   const summaries=d.energy_summary??d.metadata?.energy?.panels;if(!Array.isArray(summaries))fail('DRAFT_BASE_UNAVAILABLE','Native reference panels are unavailable.');
   let profile;if(p.profile==='manual')profile={quantiles:[p.histogramLow/1000,p.histogramHigh/1000],thresholds:[p.shadow/10,p.highlight/10]};
   else if(p.profile==='standard')profile=energyProfile(null,'standard');
   else if(!changedQuality&&p.profile===nativeParams.profile)profile=d.metadata?.energy;
   const automatic=!profile&&(p.profile==='sensitive'||p.profile==='conservative');
   if(!automatic&&(!profile?.quantiles||!profile?.thresholds))fail('DRAFT_PROFILE_UNAVAILABLE','Energy profile parameters unavailable.');
   const nativeQuantiles=d.metadata?.energy?.quantiles,reprepare=prepareInputsOnly||changedQuality||automatic||!Array.isArray(nativeQuantiles)||profile.quantiles.some((q,i)=>q!==nativeQuantiles[i]);
   const overhead=2*MiB+8192*summaries.length+(changedQuality&&!selected&&!codecLease?32*MiB:0);if(maxWorkingBytes<overhead+160)fail('MEMORY_LIMIT','The retained native result leaves no admitted energy preview workspace.');
   const contextSamplingStep=preview.contextSamplingStep;if(contextSamplingStep!==undefined&&(!Number.isSafeInteger(contextSamplingStep)||contextSamplingStep<1||!Number.isSafeInteger(contextSamplingStep*contextSamplingStep)))fail('INVALID_INPUT','A positive exact common Energy context sampling step is required.');
   const perSampleWorkspace=128-(3-planeCount)*4,admissionPerSample=160-(3-planeCount)*4,admittedPixels=Math.min(maxPixels,ADAPTIVE_PREVIEW_MAX_PIXELS,Math.floor((maxWorkingBytes-overhead)/admissionPerSample)),costKey='ela/biomes/'+(synthesis?'synthesis-native-1':changedQuality?'quality':'native-planes')+'/'+p.profile+'/'+presentation.view+'/'+(reprepare?'histogram-prepare':'native-prepared')+'/backend='+backend+(selected?'/'+recompressionSizingIdentity(p):''),plan=contextSamplingStep===undefined&&adaptive&&preview.adaptive!==false?adaptive.plan({key:costKey,width,height,sourceIdentity:analysis.provenance.originalSha256??analysis.imageId,maxSide:Math.min(maxWidth,maxHeight),maxPixels:admittedPixels,sampling:'integer',integerHalving:preview.integerHalving===true,feedback:preview.adaptiveFeedback,continuity:preview.continuity}):null;if(plan){plan.token.startedAt=startedAt;plan.token.startedClock=started;}
   let step=contextSamplingStep??plan?.step??Math.max(1,Math.ceil(width/maxWidth),Math.ceil(height/maxHeight));if(contextSamplingStep===undefined&&!plan&&Math.ceil(width/step)*Math.ceil(height/step)>admittedPixels){let low=step,high=Math.max(width,height);while(low<high){const middle=low+Math.floor((high-low)/2);if(Math.ceil(width/middle)*Math.ceil(height/middle)<=admittedPixels)high=middle;else low=middle+1;}step=low;}
   const sw=Math.ceil(width/step),sh=Math.ceil(height/step),sn=sw*sh;
   if(contextSamplingStep!==undefined){if(sw>maxWidth||sh>maxHeight||sn>maxPixels)fail('INVALID_INPUT','The common Energy context grid exceeds its preview bounds.');if(sn>admittedPixels)fail('MEMORY_LIMIT','The common Energy context grid exceeds its admitted workspace.');}
   // Native contexts are already retained by the scientific basis. Idle work
   // must never call the exact-native callback or start another native result.
   if(prepareInputsOnly&&step===1)return{prepared:false,retained:true,reason:'native-grid',samplingStep:1};
   let block=p.block;while(Math.floor(height/block)*Math.floor(width/block)>16384)block+=8;
   if(Math.floor(height/block)*Math.floor(width/block)<25)fail('INVALID_INPUT','Image too small for the requested native energy cells.');
   const panels=[],ids=new Set();for(const panel of summaries){const b=panel?.bbox;if(!Number.isSafeInteger(panel?.id)||panel.id<=0||ids.has(panel.id)||!Array.isArray(b)||b.length!==4||!b.every(Number.isSafeInteger)||b[0]<0||b[1]<0||b[2]>width||b[3]>height||b[0]>=b[2]||b[1]>=b[3])fail('INVALID_INPUT','Invalid native reference panel.');ids.add(panel.id);const bbox=[Math.ceil(b[0]/step),Math.ceil(b[1]/step),Math.ceil(b[2]/step),Math.ceil(b[3]/step)];if(bbox[0]<bbox[2]&&bbox[1]<bbox[3])panels.push({...panel,bbox});}
   if(prepareInputsOnly&&!panels.length)return{prepared:false,retained:true,reason:'empty-panels',samplingStep:step};
   // A complete grid may ask the worker for a privately owned result of the
   // real native pipeline. A decline keeps the historical draft path.
   // Context children never enter this callback. Synthèse keeps its one plane.
   if(step===1&&typeof exactNative==='function'){
    const answer=await exactNative(analysis,{params:p,presentation,backend,preview:{...preview,maxWidth,maxHeight,maxPixels,maxWorkingBytes},signal});check(signal);if(disposed)fail('CANCELLED','Energy draft owner disposed.');
    if(answer){const milliseconds=performance.now()-started,setupMilliseconds=initializationMilliseconds-initializationBefore+(answer.metrics?.setupMilliseconds??0),cold=setupMilliseconds>0||answer.metrics?.cold===true,adaptiveMetrics=plan?{token:plan.token,milliseconds,setupMilliseconds,cold,pixels:sn,feedback:null}:null,metrics={...answer.metrics,schema:'energy-parameter-preview-timing/1',milliseconds,setupMilliseconds,cold,admittedPixels,requestedBackend:backend,adaptivePreview:adaptiveMetrics};return{...answer,pixels:{...answer.pixels,logicalWidth:width,logicalHeight:height,preview:true},presentation:{...answer.presentation,preview:true,exact:false,nativeResolution:true,params:{...p}},draft:{...answer.draft,baseResultId:analysis.id,sourceSha256:analysis.provenance.originalSha256,params:{...p},exact:answer.draft?.nativeScientificCandidate===true,samplingStep:1,sampleWidth:width,sampleHeight:height,areaScale:1,metrics},metrics};}
   }
   // Bound source, residual primitives, successive automatic preparations and
   // segmentation scratch independently from the leased JPEG/plane cache.
   const gridIdentity=nativeGridKey(analysis,width,height,step);if(nativeGrid&&nativeGrid.key!==gridIdentity)await clearNativeGrid();check(signal);for(const[key,entry]of planeCache)if(!key.startsWith(gridIdentity+'/')){planeCache.delete(key);await release(entry.lease);}
   const cacheHit=!!nativeGrid,needsPlanes=reprepare&&!changedQuality,planesHit=!!nativeGrid?.planes,entry=nativeGrid?{...nativeGrid,leases:[...nativeGrid.leases]}:{key:gridIdentity,leases:[],bytes:0},added=[];
   // Only an already aggregated one-plane source opts into retained preparation.
   // The new lease replaces the same bytes in the existing frame workspace.
   const preparationKey=!prepareInputsOnly&&synthesis&&reprepare&&!automatic?JSON.stringify([gridIdentity,profile.quantiles,backend]):null;
   if(preparedCache&&preparedCache.key!==preparationKey)await clearPreparedCache();
   const preparationHit=!!preparedCache,preparationBytes=preparationKey?12*sn+8192*panels.length:0,draftPolygons=panels.map(({bbox:[x0,y0,x1,y1]})=>[[x0,y0],[x1-1,y0],[x1-1,y1-1],[x0,y1-1]]),draftPanelIds=panels.map(p=>p.id),inputKey=reprepare&&!changedQuality&&step>1?JSON.stringify([gridIdentity,backend,analysis.sourceCeiling??null,[analysis.sourceRegionDomain?.fingerprint??null,analysis.sourceRegionOrigin??null,analysis.sourceRegionSourceSurface?.id??null,analysis.sourceRegionSourceSurface?.revision??null],d.metadata?.energy?.residualIdentity??null,draftPolygons,draftPanelIds]):null;
   let preparationLease,preparationStored=false,lease,frameExpansion,failure,failed=false,committed=false;
   const sampledPreparationContext={eligible:!!inputKey,hit:false,used:0,identity:null,captureMilliseconds:0,cacheBytes:0};
   try{
    // Move ownership of the sampled native inputs out of the frame workspace.
    // Total admission remains the previous128B/sample envelope: cached buffers
    // are counted once, and the rest stays available to preparation/rendering.
    const extra=(cacheHit?0:15*sn)+(needsPlanes&&!planesHit?4*planeCount*sn:0);
    if(extra){const cached=await engine.reserveExternalMemory({bytes:extra});added.push(cached);entry.leases.push(cached);entry.bytes+=extra;}
    if(entry.preparationInput&&inputKey&&entry.preparationInput.key!==inputKey)await retirePreparationInput(entry);
    const candidateInputPlan=inputKey&&!preparationHit&&(!dependencies.prepareEnergy||dependencies.createEnergyDraftPreparationOwner)?energyDraftPreparationPlan(sw,sh,planeCount,draftPolygons,draftPanelIds,1):null;
    const futurePreparationBytes=prepareInputsOnly&&synthesis&&!automatic?12*sn+8192*panels.length:preparationBytes;
    const baseFrameBytes=perSampleWorkspace*sn-(entry.bytes-(entry.preparationInput?.bytes??0))-futurePreparationBytes+2*MiB+8192*panels.length,preparationArrayBytes=(45-(3-planeCount)*4-8)*sn+8192+panels.length*2048,minimumInputScratch=Math.max(preparationArrayBytes+(candidateInputPlan?.workingBytes??0),automatic?preparationArrayBytes+2*(12*sn+panels.length*2048):0),inputPlan=candidateInputPlan&&baseFrameBytes-candidateInputPlan.bytes>=minimumInputScratch?candidateInputPlan:null;
    if(candidateInputPlan&&!inputPlan&&entry.preparationInput)await retirePreparationInput(entry);
    if(inputPlan&&!entry.preparationInput){
     let inputLease;try{inputLease=await engine.reserveExternalMemory({bytes:inputPlan.bytes});}catch(error){if(error?.code!=='MEMORY_LIMIT')throw error;}
     if(inputLease){const input={key:inputKey,lease:inputLease,bytes:inputPlan.bytes,controller:new AbortController(),owner:null,task:null,retiring:false};input.signal=sourceSignal?AbortSignal.any([sourceSignal,input.controller.signal]):input.controller.signal;entry.preparationInput=input;entry.leases.push(inputLease);entry.bytes+=input.bytes;added.push(inputLease);}
    }
    if(prepareInputsOnly&&!entry.preparationInput)return{prepared:false,retained:true,reason:'input-cache-unavailable',samplingStep:step};
    if(preparationKey&&!preparationHit)preparationLease=await engine.reserveExternalMemory({bytes:preparationBytes});
    lease=await engine.reserveExternalMemory({bytes:perSampleWorkspace*sn-entry.bytes-preparationBytes+2*MiB+8192*panels.length});check(signal);
    const nativeSampleStarted=performance.now(),grid={width:sw,height:sh,step,maxWindowRows:sh};
    if(!cacheHit){
     const original=await readOriginal(analysis,{x:0,y:0,w:width,h:height,step},signal);check(signal);
     if(original?.width!==sw||original.height!==sh||original.data?.length!==3*sn||original.data.BYTES_PER_ELEMENT!==1)fail('INVALID_INPUT','The sampled source dimensions differ from the native plane grid.');
     entry.original=original;entry.scope=await sampleEnergyField(analysis,'energy_scope',grid,{engine,signal});entry.low=await sampleEnergyField(analysis,'energy_low_score',grid,{engine,signal});entry.high=await sampleEnergyField(analysis,'energy_high_score',grid,{engine,signal});
    }
    if(needsPlanes&&!planesHit){entry.planes=new Float32Array(planeCount*sn);for(let q=0;q<planeCount;q++){check(signal);entry.planes.set(await sampleEnergyField(analysis,'energy_plane_'+q,grid,{engine,signal}),q*sn);}}
    // Complete source/field samples belong to this immutable native grid, not
    // to the cancellable segmentation or RGB frame that consumes them.
    check(signal);if(disposed)fail('CANCELLED','Energy draft owner disposed.');
    nativeGrid=entry;committed=true;
    const nativeSampleMilliseconds=performance.now()-nativeSampleStarted;
    const {original,scope,low,high}=entry,sampledPlanes=needsPlanes?entry.planes:null;
    const smallOriginal={width:sw,height:sh,format:'rgb8',data:original.data},residual=changedQuality?await residualPlanes(smallOriginal,quality,gridIdentity+(selected||nativeParams.recompression?'/'+recipe:''),signal,{params:p,imageId:analysis.imageId}):null,planes=residual?.planes??sampledPlanes;
    const preparationStarted=performance.now(),preparationPhases={},preparationScoreRuntimes=[],preparationNativeContext={eligible:reprepare&&!changedQuality&&step===1,requested:false,available:false,used:0,identity:null,lookupMilliseconds:0,reason:'not-required'};let preparationScoreGpuSubmissions=0,preparationProviderMilliseconds=0;let prepared={energy_scope:scope,energy_low_score:low,energy_high_score:high,energy_summary:panels};
    async function captureInput(log){
     const input=entry.preparationInput;if(!input||input.key!==inputKey)return null;
     sampledPreparationContext.hit=!!input.owner?.handle;sampledPreparationContext.cacheBytes=input.bytes;
     if(!input.task){
      input.owner=createEnergyDraftPreparationOwner({image:smallOriginal,planes,draftSourceScope:scope,polygons:draftPolygons,panelIds:draftPanelIds,minimumPanelSamples:1,key:input.key,signal:input.signal,release:preparationCacheRelease(release,input.lease)});
      const capturedStarted=performance.now();input.task=(async()=>{
       try{await prepare(smallOriginal,planes,profile?.quantiles??nativeQuantiles??[.1,.9],log,{signal:input.signal,panelDetector:async()=>draftPolygons,minimumPanelSamples:1,draftSourceScope:scope,panelIds:draftPanelIds,planeCount,draftPreparationKey:input.key,draftPreparationGeometry:draftPolygons,draftInputCapture:input.owner.capture,inputsOnly:true});if(!input.owner.handle)fail('INVALID_INPUT','Sampled Energy input capture did not produce a complete context.');return input.owner.handle;}
       catch(error){await retireCompositeOwners([()=>input.owner.capture.dispose()],{primary:error});if(error?.code==='MEMORY_ALLOCATION'&&error.details?.allocationKind==='array-buffer'&&error.details?.label?.startsWith('energy-draft-context-')&&!input.signal.aborted)return null;throw error;}
       finally{sampledPreparationContext.captureMilliseconds=performance.now()-capturedStarted;}
      })();void input.task.catch(()=>{});
     }
     const context=await input.task;check(signal);if(disposed)fail('CANCELLED','Energy draft owner disposed.');
     if(context)sampledPreparationContext.identity=context.identity;
     else{const bytes=input.bytes;await retirePreparationInput(entry);if(!prepareInputsOnly)frameExpansion=await engine.reserveExternalMemory({bytes});sampledPreparationContext.cacheBytes=0;}
     return context;
    }
    if(prepareInputsOnly){
     // No provider, statistics runtime, scores, segmentation, RGB or draft
     // publication belongs to an idle input capture. The frame funds its sort.
     const context=await captureInput(await logarithm());check(signal);
     const milliseconds=performance.now()-started,setupMilliseconds=initializationMilliseconds-initializationBefore;
     return{prepared:!!context,retained:true,reason:context?'sampled-inputs-ready':'input-cache-declined',samplingStep:step,sampleWidth:sw,sampleHeight:sh,metrics:{schema:'energy-preview-input-preparation-timing/1',milliseconds,setupMilliseconds,nativeSampleMilliseconds,sampledPreparationContext,requestedBackend:backend}};
    }
    if(preparationHit){preparationNativeContext.reason='prepared-cache';prepared=preparedCache.value;if(prepared.scoreRuntime)preparationScoreRuntimes.push({cached:true,totalMs:0,originalExecution:prepared.scoreRuntime});}
    else if(reprepare){
     const providerStarted=performance.now(),scoreGpu=backend!=='cpu'&&panels.length&&typeof engine.energyPreviewScoreProvider==='function'?await engine.energyPreviewScoreProvider({imageId:analysis.imageId,workspaceId:lease.id}):undefined;preparationProviderMilliseconds=performance.now()-providerStarted;if(backend==='webgpu'&&panels.length&&!scoreGpu)fail('GPU_UNAVAILABLE','The image-owned Energy score GPU provider is unavailable.');check(signal);if(disposed)fail('CANCELLED','Energy draft owner disposed.');
     // Native capture is optional and read-only. The engine proves the complete
     // source/basis/context membership; sampled or changed-quality grids keep
     // their historical preparation. Never crop a whole-image native context.
     let nativePreparationContext=null;
     if(preparationNativeContext.eligible&&panels.length&&typeof engine.energyPreviewPreparationContext==='function'){
      preparationNativeContext.requested=true;const contextStarted=performance.now();
      nativePreparationContext=await engine.energyPreviewPreparationContext({imageId:analysis.imageId,workspaceId:lease.id,basisId:analysis.id,width:sw,height:sh,planeCount});
      preparationNativeContext.lookupMilliseconds=performance.now()-contextStarted;check(signal);if(disposed)fail('CANCELLED','Energy draft owner disposed.');
      if(nativePreparationContext!==null&&nativePreparationContext!==undefined&&typeof nativePreparationContext.prepare!=='function')fail('DRAFT_BASE_UNAVAILABLE','Invalid image-owned Energy preparation context.');
      preparationNativeContext.available=!!nativePreparationContext;preparationNativeContext.reason=nativePreparationContext?'native-context':'native-context-miss';
      if(typeof nativePreparationContext?.identity==='string')preparationNativeContext.identity=nativePreparationContext.identity;
     }else preparationNativeContext.reason=!preparationNativeContext.eligible?(changedQuality?'changed-quality':'sampled-grid'):panels.length?'unavailable-api':'empty-panels';
     let statisticsRuntime;
     if(!nativePreparationContext&&step>1&&panels.length){statisticsOwner??=createEnergyPreviewStatisticsOwner({engine,...(dependencies.statisticsRuntimeFactory?{runtimeFactory:dependencies.statisticsRuntimeFactory}:{})});const statistics=await statisticsOwner.get({signal});statisticsRuntime=statistics.runtime;initializationMilliseconds+=statistics.setupMilliseconds;check(signal);}
     const log=await logarithm(),polygons=draftPolygons,preparations=new Map();let sampledContext=null;
     if(!nativePreparationContext)sampledContext=await captureInput(log);
     const prepareAt=async quantiles=>{
      const key=quantiles.join('/');if(preparations.has(key))return preparations.get(key);
      const controls={signal,scoreGpu,scoreBackend:backend,scoreMemoization:true,...(statisticsRuntime?{statisticsRuntime}:{}),onTiming:(key,milliseconds)=>{if(Number.isFinite(milliseconds)&&milliseconds>=0)preparationPhases[key]=(preparationPhases[key]??0)+milliseconds;},onGpuSubmitted:()=>{preparationScoreGpuSubmissions++;}};
      let result;
      if(!panels.length)result={energy_scope:scope,energy_low_score:new Float32Array(sn),energy_high_score:new Float32Array(sn),energy_summary:[]};
      else if(nativePreparationContext){preparationNativeContext.used++;result=await nativePreparationContext.prepare(quantiles,log,controls);}
      else{const unpin=sampledContext?retainEnergyPreparationContext(sampledContext):null;try{if(sampledContext)sampledPreparationContext.used++;result=await prepare(smallOriginal,planes,quantiles,log,{...controls,panelDetector:async()=>polygons,minimumPanelSamples:1,draftSourceScope:scope,panelIds:draftPanelIds,planeCount,...(sampledContext?{preparationContext:sampledContext,draftPreparationKey:inputKey,draftPreparationGeometry:polygons}:{})});}finally{unpin?.();}}
      if(result.scoreRuntime)preparationScoreRuntimes.push({quantiles:[...quantiles],...result.scoreRuntime});preparations.set(key,result);return result;
     };
     if(automatic){
      const reference=await prepareAt([.1,.9]),estimate=await estimateEnergy({...reference,energy_planes:planes,energyPlaneCount:planeCount},log,{signal,planeCount}),proposal=await prepareAt(estimate.quantiles),thresholds=await energyDeviations(proposal,{signal});
      profile=energyProfile({...estimate,thresholds},p.profile);
     }
     prepared=await prepareAt(profile.quantiles);
     if(preparationLease){check(signal);if(disposed)fail('CANCELLED','Energy draft owner disposed.');preparedCache={key:preparationKey,value:prepared,lease:preparationLease,bytes:preparationBytes};preparationLease=null;preparationStored=true;}
    }
    const preparationMilliseconds=performance.now()-preparationStarted;
    // A source sample represents step² native pixels. Project only the area
    // gates, using the native block itself; scores and thresholds keep their units.
    const segmentationStarted=performance.now(),segmented=await segment({width:sw,height:sh,...prepared,metadata:{block}},{thresholds:profile.thresholds,minimum:p.minimum},{signal,draftSpatialScale:step});check(signal);const segmentationMilliseconds=performance.now()-segmentationStarted;
    const renderingStarted=performance.now(),draftData={width:sw,height:sh,...prepared,energy_labels:segmented.labels,regionColors:segmented.regions.map(r=>({id:r.id,rgb:color(r)}))},frame=await render(draftData,{width:sw,height:sh,data:original.data},presentation,{signal});check(signal);const renderingMilliseconds=performance.now()-renderingStarted;
    const draft={nativeSampleCache:{hit:cacheHit,qualityPlanesHit:needsPlanes&&planesHit,bytes:entry.bytes,sampleWidth:sw,sampleHeight:sh,sourceReads:cacheHit?0:1,numericFieldsRead:(cacheHit?0:3)+(needsPlanes&&!planesHit?planeCount:0)},preparationCache:{hit:preparationHit,stored:preparationStored,bytes:preparedCache?.bytes??0},baseResultId:analysis.id,sourceSha256:analysis.provenance.originalSha256,energyPlaneCount:planeCount,...(synthesis?{synthesis:analysis.synthesis??true}:{}),params:{...p},exact:false,samplingStep:step,sampleWidth:sw,sampleHeight:sh,...(synthesis?{reusedNativeSynthesisPlane:true,quality:null,qualities:[]}:selected?{reusedNativePlanes:!changedQuality,recompression:{selection:p.recompression.codec,experimental:true,referenceQuality:quality,levels:residual?.levels??d.metadata?.qualities,probes:residual?.probes??d.metadata?.recompression?.levels}}:{reusedNativeJpeg:!changedQuality,jpegQuality:quality,jpegQualities:residual?.levels??d.metadata?.qualities}),recompressedQualities:residual?.recompressed??[],repreparedHistogram:reprepare,estimatedDraftProfile:automatic,nativeBlock:block,areaScale:step*step,minimumSamples:p.minimum*block*block/(step*step),strongSamples:block*block/(step*step),nativePanelIds:panels.map(p=>p.id),referenceScope:'nearest native energy_scope; no points outside native reference panels',regionCount:segmented.regions.length};
    if(disposed)fail('CANCELLED','Energy draft owner disposed.');
    // Only a current draw/rAF receipt calibrates the next grid. A newer
    // compute-only row would otherwise reject the preceding painted feedback.
    const milliseconds=performance.now()-started,setupMilliseconds=initializationMilliseconds-initializationBefore,cold=setupMilliseconds>0,adaptiveMetrics=plan?{token:plan.token,milliseconds,setupMilliseconds,cold,pixels:sn,feedback:null}:null,metrics={schema:'energy-parameter-preview-timing/1',milliseconds,setupMilliseconds,cold,admittedPixels,phaseMilliseconds:{nativeSamples:nativeSampleMilliseconds,preparation:preparationMilliseconds,segmentation:segmentationMilliseconds,rendering:renderingMilliseconds},preparationPhaseMilliseconds:preparationPhases,preparationScoreRuntimes,preparationScoreGpuSubmissions,preparationProviderMilliseconds,preparationNativeContext,sampledPreparationContext,requestedBackend:backend,adaptivePreview:adaptiveMetrics};
    return{pixels:{...frame,logicalWidth:width,logicalHeight:height,preview:true},presentation:{...presentation,view:presentation.view,preview:true,nativeResolution:step===1,exact:false,method:synthesis?'native-synthesis-energy-plane-samples':changedQuality?(selected?'sampled-original-selected-codec-energy':'sampled-original-jpeg-energy'):'native-energy-plane-samples',sourceSha256:draft.sourceSha256,sampleWidth:sw,sampleHeight:sh,params:{...p}},draft:{...draft,metrics},metrics};
   }catch(error){failed=true;failure=error;const input=entry.preparationInput;if(input&&!input.owner&&!input.task)await retireCompositeOwners([()=>retirePreparationInput(entry)],{primary:error});throw error;}finally{await retireCompositeOwners([()=>release(lease),()=>release(preparationLease),()=>release(frameExpansion),...(!committed?added.map(cached=>()=>release(cached)):[])],failed?{primary:failure}:{});}
   }finally{active=false;finishActive();}
  },
  dispose(){if(closed)return Promise.resolve();if(retiring)return retiring;disposed=true;nativeGrid?.preparationInput?.controller.abort();const task=(async()=>{await activeDone;qualifiedLog=null;await retireCompositeOwners([()=>clearNativeGrid(),()=>statisticsOwner?.dispose(),async()=>{if(logLease){await release(logLease);logLease=null;}},async()=>{if(codecLease){await release(codecLease);codecLease=null;codecPromise=null;}},...[...planeCache].map(([key,entry])=>async()=>{await release(entry.lease);planeCache.delete(key);})]);closed=true;})();retiring=task;void task.finally(()=>{if(retiring===task)retiring=null;}).catch(()=>{});return task;}
 };
}
