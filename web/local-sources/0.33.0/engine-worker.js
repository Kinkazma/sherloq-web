import {validateElaParentGrant} from './ela-parent-budget.js?v=0.33.0';
import {synthesizeElaClassic} from './ela-synthesis-worker.js?v=0.33.0';
import {sampleElaSynthesisSurface} from './ela-synthesis-preview.js?v=0.33.0';
import {previewEqualizationFamily} from './preview-cost-family.js?v=0.33.0';
import {selectedElaAutoPlan,estimateSelectedElaAuto,createSelectedElaAutoCache} from './ela-auto-selected.js?v=0.33.0';
import {recompressionIdentity,recompressionSizingIdentity} from './recompression-controls.js?v=0.33.0';
import {isEnergyContextCollection,selectEnergyContext,createEnergyContextView} from './energy-context-selection.js?v=0.33.0';
import {readEnergyWindow} from './energy-native-fields.js?v=0.33.0';
import {createElaNativeContextAuto} from './ela-auto-native-contexts.js?v=0.33.0';
import {energyFrameBudget,assertEnergyFrameBudget} from './energy-frame-budget.js?v=0.33.0';
import {renderEnergySurface,admitEnergySurfacePreview} from './energy-surface-render.js?v=0.33.0';
import {energyHistogramAnalysis} from './energy-native-fields.js?v=0.33.0';
import {compileOriginalSourceRegions} from './unified-engine/src/source-region-geometry.js';
import {sourceRegionDomainShape} from './unified-engine/src/source-region-capabilities.js';
import {samplePixels} from './unified-engine/src/display-sampling.js';
import {EngineError,serializeEngineError,deserializeEngineError,normalizeResourceError} from './unified-engine/src/errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './unified-engine/src/worker-message-protocol.js';
import {renderEnergy} from './energy-render.js?v=0.33.0';
import {createEnergyParameterPreview} from './energy-parameter-preview.js?v=0.33.0';
import {createEnergyNativePreviewCandidate} from './energy-native-preview-candidate.js?v=0.33.0';
import {resolveComputeProfile} from './resource-policy.js?v=0.33.0';
import {energyExportChunks} from './streaming-export.js?v=0.33.0';
import {validateParams} from './unified-engine/src/ela.js';
import {estimateElaClassicAuto,calibrateElaClassicDisplay} from './ela-auto-estimate.js?v=0.33.0';
import {createContextEnergyHistogram as createEnergyHistogram} from './energy-context-histogram.js?v=0.33.0';
import {createAdaptivePreview,ADAPTIVE_PREVIEW_MAX_SIDE,ADAPTIVE_PREVIEW_MAX_PIXELS} from './adaptive-preview.js?v=0.33.0';
let contextEnergyView,energyContextKey=null,classicProportionalIdentity=null;
let parentBudgetGrant=null;
let engine,lastEnergy=null,lastClassic=null,lastPixels=null,energyMaxima={},energySignedRanges={},parameterDraft=false,parameterDraftKind=null,parameterPreview=null,controller,displayRevision=0,queue=Promise.resolve(),consumerBudget=0,failed=false;
const PROVISIONAL_ACTIONS=new Set(['preview-classic','preview-energy-parameters','view-energy','prepare-visible-preview','energy-histogram']);
let activeCommand=null;const cancelledPreviewCommands=new Set();
let selectedElaAutoCache=null;
let automaticSource=null,automaticEstimate=null,automaticNativeContextOwner=null;
let histogramOwner=null;
let successfulSynthesisEnergyCohort=null;
let visibleEnergyModules,visibleEnergySourceKey=null;
let normalNativePreview=null;
const adoptedNormalNativeOwners=new WeakMap(),normalNativeRetirements=new Set();
const resultSourceOwners=[];
const descriptors=new Map(),acks=new Map();
const adaptivePreview=createAdaptivePreview({persist:false}),previewWarmFamilies=new Set();
const previewNow=()=>globalThis.performance?.now?.()??Date.now();
const cancelled=()=>Object.assign(Error('Cancelled'),{code:'CANCELLED'});
function sharedEnergyParams(input){const defaults={quality:0,block:32,minimum:3,profile:'standard',histogramLow:10,histogramHigh:990,shadow:50,highlight:50};if(!input||typeof input!=='object'||Array.isArray(input))throw new EngineError('INVALID_INPUT','Explicit scientific Energy parameters required.');const{recompression,...base}=input;if(Object.keys(base).some(key=>!Object.hasOwn(defaults,key)))throw new EngineError('INVALID_INPUT','Explicit scientific Energy parameters required.');return{...defaults,...base,...(recompression===undefined?{}:{recompression:validateParams({recompression}).recompression})};}
async function windowPixels(display,rect){
 if(parameterDraft&&['result','native-result'].includes(display.kind))throw Object.assign(Error('Finish the exact calculation before reading pixels of changed parameters.'),{code:'PREVIEW_NOT_EXPORTABLE'});
 if(display.kind==='result'){
  if(!lastPixels||display.revision!==displayRevision)throw Error('Stale result surface');
  if(lastPixels.preview)throw Object.assign(Error('An approximate energy preview cannot provide native pixels; wait for the exact view.'),{code:'PREVIEW_NOT_EXPORTABLE'});
  const {x,y,width,height}=rect;
  if(![x,y,width,height].every(Number.isSafeInteger)||x<0||y<0||width<=0||height<=0||x+width>lastPixels.width||y+height>lastPixels.height)throw Error('Invalid result window');
  assertEnergyFrameBudget(energyFrameBudget({width,height,previousBytes:lastPixels.data.byteLength}),consumerBudget);
  const data=new Uint8Array(width*height*3);for(let row=0;row<height;row++)data.set(lastPixels.data.subarray(((y+row)*lastPixels.width+x)*3,((y+row)*lastPixels.width+x+width)*3),row*width*3);
  return {width,height,format:'rgb8',data};
 }
 return (await engine.readPixels({surfaceId:display.id,revision:display.revision,rect},{signal:controller.signal})).pixels;
}
async function displayTile(display,tile){
 if(display.kind==='result'){
  if(!lastPixels||display.revision!==displayRevision)throw Error('Stale result surface');
  if(lastPixels.preview){
   const {x,y,w,h,step=1}=tile,lw=lastPixels.logicalWidth,lh=lastPixels.logicalHeight,ow=Math.ceil(w/step),oh=Math.ceil(h/step);
   if(![x,y,w,h,step].every(Number.isSafeInteger)||x<0||y<0||w<=0||h<=0||step<=0||x>lw-w||y>lh-h||ow*oh>8*1024**2)throw Error('Invalid preview display window');
   assertEnergyFrameBudget(energyFrameBudget({width:ow,height:oh,previousBytes:lastPixels.data.byteLength}),consumerBudget);
   const data=new Uint8Array(ow*oh*3);
   for(let row=0;row<oh;row++){if(controller.signal.aborted)throw cancelled();const sy=Math.min(lastPixels.height-1,Math.floor((y+row*step+.5)*lastPixels.height/lh));
    for(let col=0;col<ow;col++){const sx=Math.min(lastPixels.width-1,Math.floor((x+col*step+.5)*lastPixels.width/lw)),from=(sy*lastPixels.width+sx)*3,to=(row*ow+col)*3;data[to]=lastPixels.data[from];data[to+1]=lastPixels.data[from+1];data[to+2]=lastPixels.data[from+2];}
   }
   return{width:ow,height:oh,format:'rgb8',data};
  }
  assertEnergyFrameBudget(energyFrameBudget({width:Math.ceil(tile.w/(tile.step??1)),height:Math.ceil(tile.h/(tile.step??1)),previousBytes:lastPixels.data.byteLength}),consumerBudget);
  const frame=await samplePixels(lastPixels,tile,{signal:controller.signal});try{return frame.pixels;}finally{frame.release();}
 }
 return (await engine.readDisplay({surfaceId:display.id,revision:display.revision,tile},{signal:controller.signal})).pixels;
}

function resultDisplay(pixels){if(controller?.signal.aborted)throw cancelled();lastPixels=pixels;return {kind:'result',id:'result',revision:++displayRevision,width:pixels.logicalWidth??pixels.width,height:pixels.logicalHeight??pixels.height,format:'rgb8',...(pixels.preview?{preview:true,previewStep:Math.max(1,Math.ceil(Math.max(pixels.logicalWidth/pixels.width,pixels.logicalHeight/pixels.height)))}:{})};}
function energySourceDescriptor(analysis){
 const original=descriptors.get(analysis.imageId),sourceSha256=analysis.provenance?.originalSha256??analysis.data?.metadata?.sourceSha256,surface=analysis.sourceRegionSourceSurface??original?.surface;
 if(!original||original.sha256!==sourceSha256||!surface||surface.width!==analysis.data?.width||surface.height!==analysis.data?.height)throw new EngineError('INVALID_INPUT','The retained energy source differs from its admitted native grid.');
 return{...original,width:surface.width,height:surface.height,surface};
}
async function previewSourceDomain(imageId,input){
 const original=descriptors.get(imageId);if(!original)throw new EngineError('INVALID_INPUT','The native source is unavailable.');if(!input)return null;
 const domain=await compileOriginalSourceRegions(input);if(domain.sourceSha256!==original.sha256||domain.sourceWidth!==original.width||domain.sourceHeight!==original.height)throw new EngineError('SOURCE_REGIONS_INVALID','The preview belongs to another original source.');
 return domain;
}
function energyContextOptions(payload={}){if(!isEnergyContextCollection(lastEnergy))return{};const selection=selectEnergyContext(lastEnergy,payload),key=lastEnergy.id+'/'+(selection.context?.id??'empty');if(key!==energyContextKey){energyMaxima={};energySignedRanges={};energyContextKey=key;}return{sourceFragment:selection.context?.id??undefined,planFingerprint:selection.planFingerprint};}
async function energyView(presentation,preview,selection={}){
 const desc=energySourceDescriptor(lastEnergy),scoped=isEnergyContextCollection(lastEnergy),picked=scoped?energyContextOptions(selection):null;
 // Consumer RGB and engine workspace have independent real owners. Admit the
 // grid actually selected by latency sizing: native bands and sampled planes
 // have different working sets. Final results and other layouts keep theirs.
 const planPreview=bound=>adaptivePreviewPlan(bound,presentation?.view==='scores'&&presentation?.field==='both'?desc.width*2:desc.width,desc.height,'ela/view/'+(presentation?.view??'overlay')+'/'+(presentation?.field??'high')+'/'+(presentation?.scoreView??'map'),undefined,'proportional');
 let choice=preview?planPreview(preview):null;
 let previewMemoryAdmission;
 if(choice&&!scoped&&lastEnergy.planeSurfaces){const capability=await engine.capabilities();previewMemoryAdmission=admitEnergySurfacePreview(lastEnergy,presentation,{preview:{maxWidth:choice.side,maxHeight:choice.side},memory:capability.memory,directNumericSampling:typeof engine.samplePlane==='function',prepaidNumericWorkspace:capability.sourceAccess?.numericSamplingExternalWorkspace===true,rgbBudgetReserved:true});if(previewMemoryAdmission.maxSide<choice.side)choice=planPreview({...preview,maxWidth:previewMemoryAdmission.maxSide,maxHeight:previewMemoryAdmission.maxSide});}
 const started=previewNow();
 // Rendering consumes source rows without an imagePixels full-raster copy.
 const bounds=choice?{maxWidth:choice.side,maxHeight:choice.side}:null;assertEnergyFrameBudget(energyFrameBudget({width:desc.width,height:desc.height,presentation,previousBytes:lastPixels?.data?.byteLength??0,preview:bounds}),consumerBudget);
 const source={width:desc.width,height:desc.height,readPixels:rect=>windowPixels(desc.surface,rect),readSampled:async tile=>(await engine.readDisplay({surfaceId:desc.surface.id,revision:desc.surface.revision,tile},{signal:controller.signal})).pixels},options={engine,signal:controller.signal,preview:choice?{...preview,maxWidth:choice.side,maxHeight:choice.side}:undefined,observedMaxima:energyMaxima,signedRanges:energySignedRanges};
 const pixels=scoped?await (contextEnergyView??=createEnergyContextView({engine,readOriginal:async(analysis,tile,signal)=>{const original=energySourceDescriptor(analysis);return(await engine.readDisplay({surfaceId:original.surface.id,revision:original.surface.revision,tile},{signal})).pixels;}})).render(lastEnergy,presentation,{...options,...picked}):lastEnergy.planeSurfaces?await renderEnergySurface(lastEnergy,source,presentation,{...options,rgbBudgetReserved:true}):await renderEnergy(lastEnergy.data,source,presentation,options);
 if(choice){pixels.adaptivePreview=observePreview(choice,started,pixels);pixels.preview=true;pixels.logicalWidth??=pixels.width;pixels.logicalHeight??=pixels.height;if(previewMemoryAdmission)pixels.previewMemoryAdmission=previewMemoryAdmission;}
 if(!pixels.preview){if(pixels.presentation?.observedMaxima)Object.assign(energyMaxima,pixels.presentation.observedMaxima);if(pixels.presentation?.signedRanges)Object.assign(energySignedRanges,pixels.presentation.signedRanges);}return pixels;
}
async function disposeParameterPreview(){const owner=parameterPreview;await owner?.dispose();if(parameterPreview===owner){parameterPreview=null;visibleEnergySourceKey=null;}}
async function disposeEnergyHistogram(){const owner=histogramOwner;await owner?.dispose();if(histogramOwner===owner)histogramOwner=null;}
async function retireSynthesisEnergyOwners(primary){
 const provided=arguments.length>0;successfulSynthesisEnergyCohort=null;let failed=false,failure;for(const close of[disposeParameterPreview,disposeEnergyHistogram])try{await close();}catch(error){if(!failed){failed=true;failure=error;}}
 if(failed){if(provided){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.energyOwnerCleanupError=failure;throw primary;}throw failure;}
}
function synthesisEnergyRequestCohort(payload,original,domain){
 if(payload.synthesis!==true||payload.operation!=='ela.energy'||!original?.sha256||!original.surface||!payload.synthesisParams||typeof payload.synthesisParams!=='object')return null;
 let p;try{p=validateParams(payload.synthesisParams);}catch{return null;}
 // Synthèse owns a fixed native recipe; these parameters only present that base.
 const {quality,scale,contrast,linear,grayscale,equalization,...recipe}=p;
 return JSON.stringify(['synthesis-energy-owner-cohort/1',payload.imageId,original.sha256,original.provenance??null,original.sourceFormat??null,original.surface.id,original.surface.revision,original.width,original.height,domain?.fingerprint??null,domain?[domain.width,domain.height,domain.origin??null]:null,recipe]);
}
function verifiedSynthesisEnergyCohort(output,requestCohort){
 if(!requestCohort||output?.operation!=='ela.energy'||(output.data?.energyPlaneCount??output.data?.metadata?.energy?.planeCount??output.synthesis?.energyPlaneCount)!==1)return null;
 const key=output.synthesis?.key?.key??output.synthesis?.key,contexts=output.data?.contexts??output.data?.metadata?.fragments,profiles=Array.isArray(contexts)?contexts.filter(c=>c.evaluable!==false).map(c=>c.nativeMetadata?.energy):[output.data?.metadata?.energy];
 if(typeof key!=='string'||!key||!profiles.length||!profiles.every(e=>typeof e?.preparedIdentity==='string'&&e.preparedIdentity&&typeof e.residualIdentity==='string'&&e.residualIdentity))return null;
 return Object.freeze({requestCohort,key,resultId:output.id});
}
function nativeEnergyHistogram(){
 return histogramOwner??=createEnergyHistogram({engine,bins:256,maximumWindowBytes:1024**2,readOriginal:async(analysis,rect,signal)=>{
  const descriptor=energySourceDescriptor(analysis);
  return(await engine.readPixels({surfaceId:descriptor.surface.id,revision:descriptor.surface.revision,rect},{signal})).pixels;
 }});
}
function classicOwnedSurfaceIds(owner){return new Set([owner?.surface?.id,(resultSourceOwners.includes(owner?.comparisonSurface?.id)?null:owner?.comparisonSurface?.id),...(owner?.auxiliarySurfaces??[]).map(surface=>surface.id)].filter(Boolean));}
async function releaseClassicOwner(owner,keep){const retained=classicOwnedSurfaceIds(keep);let failure;for(const id of classicOwnedSurfaceIds(owner))if(!retained.has(id))try{await engine.releaseSurface(id);}catch(error){failure??=error;}if(failure)throw failure;}
async function releaseClassicSurface(keep){const previous=lastClassic;lastClassic=null;await releaseClassicOwner(previous,keep);}
const energyExportOwners=new Set();
async function closeEnergyExport(owner){if(owner.pending)return owner.pending;const task=(async()=>{await owner.ready;if(owner.descriptor)await engine.releaseExport(owner.descriptor.id);energyExportOwners.delete(owner);})();owner.pending=task;void task.finally(()=>{if(owner.pending===task)owner.pending=null;}).catch(()=>{});return task;}
async function retireEnergyExports(){let failed=false,primary;for(const owner of energyExportOwners)try{await closeEnergyExport(owner);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
const energyRetirements=new WeakMap();
async function releaseEnergySurfaces(analysis=lastEnergy){
 if(!analysis)return;await retireEnergyExports();await contextEnergyView?.dispose();contextEnergyView=null;const adopted=adoptedNormalNativeOwners.get(analysis);if(adopted){await retireNormalNative(adopted);adoptedNormalNativeOwners.delete(analysis);if(lastEnergy===analysis){lastEnergy=null;energyContextKey=null;}return;}let item=energyRetirements.get(analysis);if(!item){const original=descriptors.get(analysis.imageId)?.surface?.id,ids=new Set([analysis.surface?.id,...Object.values(analysis.planeSurfaces??{}).map(value=>value?.id),...Object.values(analysis.maskSurfaces??{}).map(value=>value?.id),analysis.sourceRegionSourceSurface?.id].filter(id=>id&&id!==original&&!resultSourceOwners.includes(id)));item={ids};energyRetirements.set(analysis,item);}if(item.pending)return item.pending;
 const task=(async()=>{let failed=false,primary;for(const id of item.ids)try{const ack=await engine.releaseSurface(id);if(ack===false||ack===0)throw new EngineError('BUSY','Previous Energy surface retirement awaits acknowledgement.');item.ids.delete(id);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;if(lastEnergy===analysis){lastEnergy=null;energyContextKey=null;}})();item.pending=task;void task.finally(()=>{if(item.pending===task)item.pending=null;}).catch(()=>{});return task;
}
function retainResultSource(analysis){const id=analysis.sourceRegionSourceSurface?.id,original=descriptors.get(analysis.imageId)?.surface?.id;if(id&&id!==original&&!resultSourceOwners.includes(id))resultSourceOwners.push(id);}
async function releaseRetiredResultSources(keep=1){
 let failure;while(resultSourceOwners.length>keep){const id=resultSourceOwners.shift();try{await engine.releaseSurface(id);}catch(error){failure??=error;}}if(failure)throw failure;
}
async function retireNormalNative(owner){normalNativeRetirements.add(owner);await owner.release();normalNativeRetirements.delete(owner);}
async function disposeNormalNativePreview(){for(const owner of [...normalNativeRetirements])await retireNormalNative(owner);const owner=normalNativePreview;await owner?.dispose();if(normalNativePreview===owner)normalNativePreview=null;}
async function renderNormalNativePreview(analysis,presentation,{signal,scratchProof,onSourceRead}={}){
 const desc=energySourceDescriptor(analysis);assertEnergyFrameBudget(energyFrameBudget({width:desc.width,height:desc.height,presentation,previousBytes:lastPixels?.data?.byteLength??0,snapshotCopies:1}),consumerBudget);
 const check=()=>{if(signal?.aborted)throw cancelled();const now=energySourceDescriptor(analysis);if(now.surface.id!==desc.surface.id||now.surface.revision!==desc.surface.revision)throw cancelled();};let sourceReadMs=0,copyBytes=0,copy=null,sourceCopyDeclined=null;
 const source={width:desc.width,height:desc.height,readPixels:async rect=>{check();const started=previewNow();try{const pixels=(await engine.readPixels({surfaceId:desc.surface.id,revision:desc.surface.revision,rect},{signal})).pixels;check();return pixels;}finally{sourceReadMs+=previewNow()-started;}},readSampled:async tile=>(await engine.readDisplay({surfaceId:desc.surface.id,revision:desc.surface.revision,tile},{signal})).pixels};
 const n=desc.width*desc.height,requiredBytes=3*n+3*desc.width*Math.min(256,desc.height),needOriginal=(presentation?.view??'overlay')==='overlay'||presentation?.view==='scores'&&presentation?.scoreView==='overlay',whole=!analysis.sourceRegionDomain||sourceRegionDomainShape(analysis.sourceRegionDomain)==='identity',funded=scratchProof&&typeof scratchProof.leaseId==='string'&&[scratchProof.reservedBytes,scratchProof.ownedBytes,scratchProof.availableBytes].every(Number.isSafeInteger)&&scratchProof.ownedBytes>=0&&scratchProof.availableBytes===scratchProof.reservedBytes-scratchProof.ownedBytes&&scratchProof.availableBytes>=requiredBytes;
 try{
  if(!analysis.planeSurfaces&&whole&&needOriginal&&n<=ADAPTIVE_PREVIEW_MAX_PIXELS&&funded){check();try{copy=new Uint8Array(3*n);}catch(error){if(!(error instanceof RangeError)||Object.isFrozen(error))throw error;sourceCopyDeclined='allocation';}if(copy){copyBytes=copy.byteLength;for(let y=0;y<desc.height;y+=256){check();const rows=Math.min(256,desc.height-y),part=await source.readPixels({x:0,y,width:desc.width,height:rows});if(part.width!==desc.width||part.height!==rows||part.format!=='rgb8'||!(part.data instanceof Uint8Array)||part.data.length!==desc.width*rows*3)throw new EngineError('INVALID_INPUT','The financed native Original copy has an invalid RGB band.');copy.set(part.data,y*desc.width*3);}check();source.data=copy;}}
  const options={engine,signal,rgbBudgetReserved:true,observedMaxima:{},signedRanges:{}};return await (analysis.planeSurfaces?renderEnergySurface(analysis,source,presentation,options):renderEnergy(analysis.data,source,presentation,options));
 }finally{delete source.data;copy=null;onSourceRead?.({sourceReadMs,copyBytes,sourceCopyDeclined,scratchProof:scratchProof?{...scratchProof,requiredBytes,copyAdmitted:copyBytes>0}:null});}
}
function normalNativeCandidate(){return normalNativePreview??=createEnergyNativePreviewCandidate({engine,describeSource:energySourceDescriptor,render:renderNormalNativePreview});}
function exactNormalNativePreview(analysis,options){if(analysis.sourceRegionDomain&&sourceRegionDomainShape(analysis.sourceRegionDomain)!=='identity')return null;const desc=energySourceDescriptor(analysis),frame=energyFrameBudget({width:desc.width,height:desc.height,presentation:options.presentation,previousBytes:lastPixels?.data?.byteLength??0,snapshotCopies:1});if(frame.requiredBytes>consumerBudget)return null;return normalNativeCandidate().preview(analysis,options);}
function energyParameterPreview(){return parameterPreview??=createEnergyParameterPreview({engine,exactNative:exactNormalNativePreview,readOriginal:async(analysis,tile,signal)=>{const descriptor=energySourceDescriptor(analysis);return(await engine.readDisplay({surfaceId:descriptor.surface.id,revision:descriptor.surface.revision,tile},{signal})).pixels;}});}
function previewBounds(preview={}){const {maxWidth=ADAPTIVE_PREVIEW_MAX_SIDE,maxHeight=ADAPTIVE_PREVIEW_MAX_SIDE}=preview;if(![maxWidth,maxHeight].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=ADAPTIVE_PREVIEW_MAX_SIDE))throw new EngineError('INVALID_INPUT','Invalid parameter preview bounds.');return Math.min(maxWidth,maxHeight);}
function adaptivePreviewPlan(preview,width,height,key,sourceIdentity=String(lastEnergy?.provenance?.originalSha256??lastEnergy?.imageId??lastClassic?.imageId??'no-source')+'/'+String(energyContextKey??''),sampling='integer'){const bound=previewBounds(preview),maxPixels=Math.min(ADAPTIVE_PREVIEW_MAX_PIXELS,Math.floor(Math.max(0,consumerBudget-(lastPixels?.data?.byteLength??0))/6));if(maxPixels<1)throw new EngineError('UI_MEMORY_BUDGET','No admitted memory for a provisional preview.');return adaptivePreview.plan({key,width,height,sourceIdentity,sampling,maxSide:bound,maxPixels,feedback:preview?.adaptiveFeedback,continuity:preview?.continuity});}
function previewWorkingBytes(){const memory=engine.capabilities()?.memory;if(!memory||!Number.isFinite(memory.budgetBytes)||!Number.isFinite(memory.policyAvailableBytes))return 128*1024**2;const heap=Number.isFinite(memory.knownHeapCapacityBytes)?Math.max(0,Math.ceil(memory.knownHeapCapacityBytes)):0;return Math.max(0,Math.floor(Math.min(memory.budgetBytes/3,memory.policyAvailableBytes-heap)));}
function observePreview(plan,started,pixels,metrics={}){const milliseconds=previewNow()-started,count=pixels.width*pixels.height,first=!previewWarmFamilies.has(plan.key),setupMilliseconds=Number.isFinite(metrics.setupMilliseconds)?Math.max(0,metrics.setupMilliseconds):0,cold=first||metrics.cold===true,initializationUnknown=cold&&setupMilliseconds===0;previewWarmFamilies.add(plan.key);const measurement={milliseconds,setupMilliseconds,cold,initializationUnknown,pixels:count};adaptivePreview.observe(plan,measurement);return{token:plan.token,...measurement};}
function immutablePreviewPixels(pixels){
 if(!pixels?.preview||![pixels.width,pixels.height].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=ADAPTIVE_PREVIEW_MAX_SIDE)||pixels.width*pixels.height>Math.floor(consumerBudget/6)||pixels.format!=='rgb8'||!(pixels.data instanceof Uint8Array)||pixels.data.length!==pixels.width*pixels.height*3)throw new EngineError('INVALID_INPUT','Invalid bounded parameter preview raster.');
 // Transfer only an independent small RGB snapshot. The worker keeps its own
 // display backing for existing readers and native export guards.
 assertEnergyFrameBudget(energyFrameBudget({width:pixels.width,height:pixels.height,previousBytes:lastPixels?.data?.byteLength??0,snapshotCopies:1}),consumerBudget);
 return{...pixels,data:pixels.data.slice()};
}
async function automaticEla(payload,id){
 if(!Number.isInteger(payload?.params?.quality))throw new EngineError('INVALID_INPUT','Automatic ELA requires the current explicit quality preference.');
 const params=validateParams(payload.params),original=descriptors.get(payload?.imageId),source=automaticSource,signal=controller.signal;
 if(!source||!(source.blob instanceof Blob)||source.blob.size<=0||source.imageId!==payload.imageId||source.sourceSha256!==payload.sourceSha256||!original||original.sha256!==payload.sourceSha256||typeof payload.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(payload.sourceSha256)||![original.width,original.height].every(v=>Number.isSafeInteger(v)&&v>0)||original.surface?.width!==original.width||original.surface?.height!==original.height)throw new EngineError('INVALID_INPUT','Automatic ELA requires the current native source, exact dimensions and SHA256.');
 if(signal.aborted)throw cancelled();
 if(params.recompression&&await selectedElaAutoPlan(params,original,{signal})){const protectedSurfaceIds=[lastClassic?.surface?.id,lastClassic?.comparisonSurface?.id,...(lastClassic?.auxiliarySurfaces??[]).map(s=>s.id),lastEnergy?.surface?.id,...Object.values(lastEnergy?.planeSurfaces??{}).map(s=>s?.id),...Object.values(lastEnergy?.maskSurfaces??{}).map(s=>s?.id),lastEnergy?.sourceRegionSourceSurface?.id,...resultSourceOwners].filter(Boolean);return estimateSelectedElaAuto({engine,cache:(selectedElaAutoCache??=createSelectedElaAutoCache({engine})),payload:{...payload,params},original,id,signal,onProgress:progress=>self.postMessage({id,progress}),maximumContiguousBytes:consumerBudget,protectedSurfaceIds});}
 if(payload.sourceRegionDomain){
  automaticNativeContextOwner??=createElaNativeContextAuto({engine,maximumContiguousBytes:consumerBudget});
  const protectedSurfaceIds=[lastClassic?.surface?.id,lastClassic?.comparisonSurface?.id,...(lastClassic?.auxiliarySurfaces??[]).map(s=>s.id),lastEnergy?.surface?.id,...Object.values(lastEnergy?.planeSurfaces??{}).map(s=>s?.id),lastEnergy?.sourceRegionSourceSurface?.id,...resultSourceOwners].filter(Boolean);
  return automaticNativeContextOwner.estimate(payload,{original,source,id,signal,protectedSurfaceIds,onProgress:progress=>self.postMessage({id,progress})});
 }
 let region,descriptor=original,output,surface,pixelLease,sampleLease,sampleOwner,failure;
 try{
 // Header evidence belongs to the original encoded file. Pixel evidence and
 // native visibility calibration belong to the admitted rectangle instead.
 // The scientific reader refuses holes before observing any excluded pixels.
 if(payload.sourceRegionDomain){
  region=await engine.deriveSourceRegionInput({imageId:payload.imageId,sourceRegionDomain:payload.sourceRegionDomain,purpose:'analysis-rectangle'},{signal});
  if(region.originalSha256!==payload.sourceSha256||region.sourceRegionSourceSurface?.format!=='rgb8')throw new EngineError('INVALID_INPUT','Automatic ELA source region differs from its encoded source.');
  descriptor={...original,width:region.width,height:region.height,surface:region.sourceRegionSourceSurface};
 }
 const domainKey=region?.provenance?.sourceRegionFingerprint??'full-source';
 const cached=automaticEstimate?.imageId===payload.imageId&&automaticEstimate.sourceSha256===payload.sourceSha256&&automaticEstimate.width===descriptor.width&&automaticEstimate.height===descriptor.height&&automaticEstimate.domainKey===domainKey;
 let estimate,headerMetrics;
 if(cached){({estimate,headerMetrics}=automaticEstimate);}
 else{
  const inspected=await engine.inspectHeaders({blob:source.blob,imageId:payload.imageId},{signal});
  estimate=await estimateElaClassicAuto({width:descriptor.width,height:descriptor.height,sourceSha256:payload.sourceSha256,header:inspected.header,readRect:(rect,hooks)=>engine.readPixels({surfaceId:descriptor.surface.id,revision:descriptor.surface.revision,rect},hooks)},{signal,onProgress:progress=>self.postMessage({id,progress}),reserveMemory:async bytes=>{const lease=await engine.reserveExternalMemory({bytes});return()=>engine.releaseExternalMemory(lease.id);}});
  if(signal.aborted)throw cancelled();
  headerMetrics=inspected.metrics;automaticEstimate={imageId:payload.imageId,sourceSha256:payload.sourceSha256,width:descriptor.width,height:descriptor.height,domainKey,estimate,headerMetrics};
 }
 const reference=estimate.evidence?.kind==='current-file-tables'?estimate.evidence.referenceQuality:null,quality=estimate.quality??(Number.isInteger(reference)&&reference>=1&&reference<=100?reference:null)??params.quality;
 if(!Number.isInteger(quality)||quality<1||quality>100)throw new EngineError('INVALID_INPUT','Automatic ELA produced an invalid recompression reference.');
 const nativeBytes=descriptor.width*descriptor.height*3;
 if(!Number.isSafeInteger(nativeBytes))throw new EngineError('RESULT_MEMORY_BUDGET','The native calibration dimensions exceed the addressable result grid.');
 const step=Math.max(1,Math.ceil(Math.max(descriptor.width,descriptor.height)/320)),tile={x:0,y:0,w:descriptor.width,h:descriptor.height,step},sampleWidth=Math.ceil(descriptor.width/step),sampleHeight=Math.ceil(descriptor.height/step);
  output=await engine.run({id:'ela-auto-calibration-'+id,imageId:payload.imageId,operation:'ela.classic',params:{quality,scale:1,contrast:0,linear:true,grayscale:false},backend:payload.backend??'auto',regions:[],...(region?{sourceRegionDomain:region.sourceRegionDomain}:{})},{signal,onProgress:progress=>self.postMessage({id,progress:{...progress,phase:'auto-calibration-'+progress.phase}})});
  // Calibration has its own owner; it never becomes the displayed or retained
  // scientific result. A segmented output already owns native budgeted storage.
  if(output.layout==='surface'&&output.surface){
   if(output.surface.id===descriptor.surface.id||output.surface.id===lastClassic?.surface?.id)throw new EngineError('INVALID_INPUT','Calibration returned an existing source or displayed surface.');
   surface=output.surface;
  }
  if(signal.aborted)throw cancelled();
  if(output.id!=='ela-auto-calibration-'+id||output.imageId!==payload.imageId||output.operation!=='ela.classic'||output.status!=='ok'||output.provenance?.originalSha256!==payload.sourceSha256)throw new EngineError('INVALID_INPUT','Native calibration differs from its requested source.');
  const shape=surface??output.pixels;
  if(shape?.width!==descriptor.width||shape?.height!==descriptor.height||shape.format!=='rgb8')throw new EngineError('INVALID_INPUT','Native calibration dimensions differ from the original.');
  if(!surface){if(!(output.pixels.data instanceof Uint8Array)||output.pixels.data.length!==nativeBytes)throw new EngineError('INVALID_INPUT','Native calibration RGB storage is incomplete.');if(nativeBytes>consumerBudget)throw new EngineError('RESULT_MEMORY_BUDGET','The contiguous native calibration output exceeds the available result budget.');pixelLease=await engine.reserveExternalMemory({bytes:nativeBytes});}
  sampleLease=await engine.reserveExternalMemory({bytes:sampleWidth*sampleHeight*3+256*4});
  let sample,readMetrics;
  if(surface){const read=await engine.readDisplay({surfaceId:surface.id,revision:surface.revision,tile},{signal});sample=read.pixels;readMetrics=read.metrics;}
  else{sampleOwner=await samplePixels(output.pixels,tile,{signal});sample=sampleOwner.pixels;readMetrics=sampleOwner.metrics;}
  if(signal.aborted)throw cancelled();
  if(sample?.width!==sampleWidth||sample.height!==sampleHeight)throw new EngineError('INVALID_INPUT','Calibration samples differ from the declared native grid.');
  const calibration=calibrateElaClassicDisplay(sample,{...params,quality});
  return{imageId:payload.imageId,sourceSha256:payload.sourceSha256,width:original.width,height:original.height,...(region?{sourceRegionDomain:region.sourceRegionDomain,analysisGrid:{width:descriptor.width,height:descriptor.height,origin:[...region.sourceRegionOrigin]}}:{}),parameters:calibration.params,estimate,calibration,calibrationMetrics:{estimateReused:!!cached,referenceSelection:estimate.quality!==null?'identified-compatible-reference':reference===quality?'nearest-current-table-reference':'current-user-quality-preserved',header:headerMetrics,native:output.metrics,nativeCalibration:{quality,scale:1,contrast:0,linear:true,grayscale:false,width:descriptor.width,height:descriptor.height},sampling:{coordinates:'native-pixels',resize:false,width:sampleWidth,height:sampleHeight,step,bytes:sample.data.byteLength},read:readMetrics}};
 }catch(error){failure=error;throw error;}
 finally{
  const cleanupErrors=[];
  const ownedSurfaces=new Set([surface?.id,output?.sourceRegionSourceSurface?.id,region?.sourceRegionSourceSurface?.id].filter(value=>value&&value!==original.surface.id&&value!==lastClassic?.surface?.id));
  for(const cleanup of [()=>sampleOwner?.release(),()=>sampleLease&&engine.releaseExternalMemory(sampleLease.id),()=>pixelLease&&engine.releaseExternalMemory(pixelLease.id),...[...ownedSurfaces].map(surfaceId=>()=>engine.releaseSurface(surfaceId))])try{await cleanup();}catch(error){cleanupErrors.push(serializeEngineError(error));}
  if(cleanupErrors.length){if(failure)failure.details={...failure.details,cleanup:cleanupErrors};else throw new EngineError('CLEANUP_FAILED','Automatic ELA calibration could not release its temporary resources.',{details:{cleanup:cleanupErrors}});}
 }
}
function synthesisSurfaceIds(output){return new Set([output?.surface?.id,output?.sourceRegionSourceSurface?.id,...Object.values(output?.planeSurfaces??{}).map(value=>value?.id)].filter(Boolean));}
async function retireSynthesisOutput(output,keep){const protectedIds=new Set([...synthesisSurfaceIds(keep),...classicOwnedSurfaceIds(lastClassic),...synthesisSurfaceIds(lastEnergy),...resultSourceOwners]);let failed=false,primary;for(const sid of synthesisSurfaceIds(output))if(!protectedIds.has(sid)&&![...descriptors.values()].some(source=>source.surface?.id===sid))try{await engine.releaseSurface(sid);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
async function runSynthesisTask(task,{params,presentation,onProgress,retireForMemoryRetry}={}){
 let nativeFailure,cleanupFailed=false;
 const scientificEngine=retireForMemoryRetry?new Proxy(engine,{get(target,name){const method=Reflect.get(target,name,target);if(typeof method!=='function')return method;if(name==='releaseSurface'||name==='disposeElaSynthesis')return async(...args)=>{try{return await Reflect.apply(method,target,args);}catch(error){cleanupFailed=true;throw error;}};return method.bind(target);}}):engine;
 const attempt=async()=>{
 const source=descriptors.get(task.imageId),protectedIds=[...classicOwnedSurfaceIds(lastClassic),...synthesisSurfaceIds(lastEnergy),...resultSourceOwners];let base,output,failed=false,primary;
 try{
  base=await synthesizeElaClassic({engine:scientificEngine,task:{...task,operation:'ela.classic',params:params??task.params},source,signal:controller.signal,onProgress,protectedSurfaceIds:protectedIds});
  if(task.operation==='ela.energy'){
   if(typeof engine.runElaSynthesisEnergy!=='function')throw new EngineError('UNSUPPORTED_OPERATION','Direct synthesis Energy is unavailable in this engine.');
   output=await engine.runElaSynthesisEnergy({...task,key:base.synthesis.key},{signal:controller.signal,onProgress});output={...output,synthesis:{...base.synthesis,...output.synthesis,energyInput:'synthesis-residual-rgb'}};
  }else if((presentation?.scale??1)!==1||(presentation?.contrast??0)!==0||presentation?.grayscale===true){
   output=await engine.renderElaSynthesis({id:task.id,imageId:task.imageId,key:base.synthesis.key,sourceRegionDomain:task.sourceRegionDomain,presentation},{signal:controller.signal});
  }else output=base;
  if(output!==base)output={...output,synthesis:{...output.synthesis,cacheHit:base.synthesis.cacheHit},metrics:{...output.metrics,synthesisFrameAnalysisRequests:base.metrics?.nativeAnalysisRequests??0,synthesisComputation:base.metrics}};
  if(controller.signal.aborted)throw cancelled();
 }catch(error){failed=true;primary=error;nativeFailure=error;throw error;}
 finally{
  if(base&&base!==output)try{await retireSynthesisOutput(base,output);}catch(error){cleanupFailed=true;if(failed){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.synthesisCleanupError=error;}else{try{await retireSynthesisOutput(output);}catch(cleanup){if(error&&typeof error==='object'&&Object.isExtensible(error))error.synthesisRetirementError=cleanup;}throw error;}}
  if(failed&&output)try{await retireSynthesisOutput(output);}catch(error){cleanupFailed=true;if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.synthesisRetirementError=error;}
 }
 return output;
 };
 try{return await attempt();}catch(error){if(!retireForMemoryRetry||error!==nativeFailure||cleanupFailed||error?.synthesisCleanupError||error?.synthesisRetirementError||error?.cleanupErrors?.length||error?.code!=='MEMORY_LIMIT'||controller.signal.aborted)throw error;await retireForMemoryRetry(error);if(controller.signal.aborted)throw cancelled();return attempt();}
}
async function previewSynthesis(payload){
 const basis=lastClassic?.synthesis?lastClassic:lastEnergy?.synthesis?lastEnergy:null;
 if(!basis||payload.resultId!==basis.id||payload.imageId!==basis.imageId)throw new EngineError('DRAFT_BASE_MISMATCH','Synthesis preview belongs to another retained base.');
 const domain=await previewSourceDomain(payload.imageId,payload.sourceRegionDomain);
 if((domain?.fingerprint??null)!==(basis.sourceRegionDomain?.fingerprint??null))throw new EngineError('DRAFT_BASE_MISMATCH','Synthesis preview belongs to another source domain.');
 previewBounds(payload.preview);parameterDraft=true;parameterDraftKind='classic';const p=validateParams(payload.params),descriptor=basis.surface,plan=adaptivePreviewPlan(payload.preview,descriptor.width,descriptor.height,'ela/synthesis/presentation/'+(p.grayscale?'gray':'rgb'),String(basis.synthesis.key.key),'proportional'),started=previewNow();let view,failed=false,primary;
 try{
  view=await engine.renderElaSynthesis({imageId:payload.imageId,key:basis.synthesis.key,sourceRegionDomain:payload.sourceRegionDomain,presentation:{scale:p.scale,contrast:p.contrast,grayscale:p.grayscale}},{signal:controller.signal});
  const frameBytes=plan.width*plan.height*3,available=consumerBudget-(lastPixels?.data?.byteLength??0)-2*frameBytes;if(available<3)throw new EngineError('UI_MEMORY_BUDGET','No admitted synthesis preview read workspace.');
  const sampled=await sampleElaSynthesisSurface({engine,surface:view.surface,width:plan.width,height:plan.height,maximumReadBytes:Math.min(4*1024**2,available),signal:controller.signal}),pixels=sampled.pixels,snapshot=immutablePreviewPixels(pixels),metrics={...sampled.metrics,adaptivePreview:observePreview(plan,started,pixels,sampled.metrics),synthesis:true};
  return{display:resultDisplay(pixels),pixels:snapshot,...(domain?{sourceRegionDomain:domain.descriptor}:{}),presentation:{view:'classic-preview',preview:true,nativeResolution:pixels.width===descriptor.width&&pixels.height===descriptor.height,method:'synthesis-native-pixel-samples',params:{...p},sourceSha256:descriptors.get(payload.imageId).sha256},metrics};
 }catch(error){failed=true;primary=error;throw error;}finally{if(view)try{await retireSynthesisOutput(view,lastClassic?.surface?{surface:lastClassic.surface}:null);}catch(error){if(failed){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.synthesisRetirementError=error;}else throw error;}}
}
async function handle({id,action,payload,options}){
 if(failed)return;
 try{
  if(cancelledPreviewCommands.delete(id)&&PROVISIONAL_ACTIONS.has(action))throw cancelled();
  if(action==='dispose'){
   if(parentBudgetGrant&&JSON.stringify(options?.parentBudgetGrant)!==JSON.stringify(parentBudgetGrant))throw new EngineError('INVALID_INPUT','ELA retirement belongs to another financed worker epoch.');
   await retireSynthesisEnergyOwners();await disposeNormalNativePreview();if(lastEnergy&&adoptedNormalNativeOwners.has(lastEnergy))await releaseEnergySurfaces();await retireEnergyExports();
   await contextEnergyView?.dispose();contextEnergyView=null;
   await selectedElaAutoCache?.dispose();selectedElaAutoCache=null;
   await automaticNativeContextOwner?.dispose();automaticNativeContextOwner=null;
   await engine?.dispose();engine=null;lastEnergy=lastClassic=lastPixels=null;automaticSource=automaticEstimate=null;descriptors.clear();resultSourceOwners.length=0;parentBudgetGrant=null;
   self.postMessage({id,result:{disposed:true}});return;
  }
  const offeredGrant=options?.parentBudgetGrant?validateElaParentGrant(options.parentBudgetGrant):null;
  if(engine&&JSON.stringify(offeredGrant)!==JSON.stringify(parentBudgetGrant))throw new EngineError('INVALID_INPUT','ELA request belongs to another financed worker epoch.');
  if(!engine){
   const profile=resolveComputeProfile(options?.computeProfile||'aggressive',options?.resourceHints);
   consumerBudget=offeredGrant?offeredGrant.consumerBytes:Math.min(Math.max(0,options?.uiRGBBudgetBytes||0),Math.floor(profile.memoryBudgetBytes/3));
   const budget=offeredGrant?offeredGrant.engineBytes:profile.memoryBudgetBytes-Math.max(0,options?.uiReserveBytes||0)-consumerBudget;
   if(offeredGrant&&(offeredGrant.consumerBytes!==options.uiRGBBudgetBytes||offeredGrant.uiReserveBytes!==options.uiReserveBytes))throw new EngineError('INVALID_INPUT','ELA UI reservations differ from the financed envelope.');
   if(budget<32*1024**2)throw Object.assign(Error('UI reservations leave insufficient engine memory'),{code:'UI_MEMORY_BUDGET'});
   const moduleURL=new URL('./unified-engine/src/index.js',import.meta.url).href;let createEngine;
   try{({createEngine}=await import('./unified-engine/src/index.js'));}
   catch(cause){throw new EngineError('WORKER_LOAD_FAILED',cause?.message||'Browser engine module could not be loaded.',{cause,details:{phase:'module-load',moduleURL}});}
   if(failed)return;
   try{engine=createEngine({...options,memoryBudgetBytes:budget,onTemporarySession:session=>self.postMessage({temporarySession:session})});}
   catch(cause){const error=normalizeResourceError(cause),failure=error?.code?error:new EngineError('WORKER_INITIALIZATION_FAILED',cause?.message||'Browser engine could not be initialized.',{cause});failure.details={...failure.details,phase:'engine-create',moduleURL};throw failure;}
  }
  if(!parentBudgetGrant&&offeredGrant)parentBudgetGrant=structuredClone(offeredGrant);
  if(action==='capabilities'){self.postMessage({id,result:{...await engine.capabilities(),...(parentBudgetGrant?{parentBudgetGrant}:{})}});return;}
  controller=new AbortController();activeCommand={id,action};let result,nextSuccessfulEnergyCohort;
  if(action==='load'){
   if(parentBudgetGrant&&payload.id!==parentBudgetGrant.imageId)throw new EngineError('INVALID_INPUT','ELA load belongs to another financed Original.');
   await selectedElaAutoCache?.dispose();selectedElaAutoCache=null;
   const previousAutomaticOwner=automaticNativeContextOwner;automaticNativeContextOwner=null;await previousAutomaticOwner?.dispose();
   await retireSynthesisEnergyOwners();await disposeNormalNativePreview();
   await releaseEnergySurfaces();
   await releaseRetiredResultSources(0);
   result=await engine.loadBlob(payload,{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})});
   if(parentBudgetGrant&&(result.sha256!==parentBudgetGrant.sourceSha256||result.width!==parentBudgetGrant.width||result.height!==parentBudgetGrant.height))throw new EngineError('INVALID_INPUT','ELA decoded Original differs from the financed source proof.');
   await releaseClassicSurface();
   automaticSource=payload.blob?{imageId:payload.id,sourceSha256:result.sha256,blob:payload.blob}:null;automaticEstimate=null;
   descriptors.set(payload.id,result);lastEnergy=null;lastClassic=null;lastPixels=null;parameterDraft=false;parameterDraftKind=null;energyMaxima={};energySignedRanges={};displayRevision++;
  }else if(action==='read-display')result={pixels:await displayTile(payload.display,payload.tile)};
  else if(action==='read-window')result={pixels:await windowPixels(payload.display,payload.rect)};
  else if(action==='export-raster'){
   if(parameterDraft)throw new EngineError('PREVIEW_NOT_EXPORTABLE','Finish the exact calculation before exporting a changed-parameter view.');
   if(payload.display.kind==='result'&&(!lastPixels||payload.display.revision!==displayRevision))throw Object.assign(Error('Stale result surface'),{code:'INVALID_INPUT'});
   if(payload.display.kind==='result'&&lastPixels.preview)throw Object.assign(Error('An approximate energy preview cannot be exported; wait for the exact view.'),{code:'PREVIEW_NOT_EXPORTABLE'});
   const is7c=payload.sherloq7c===true&&payload.display.kind==='native-result'&&payload.options?.format==='png'&&payload.options?.bitDepth===16,streamInfo=is7c?engine.sherloqPngStreamInfo?.({surfaceId:payload.display.id,revision:payload.display.revision}):null;
   if(streamInfo){const{createSHA256}=await import('./unified-engine/vendor/hash-wasm/hashes.js');const hash=await createSHA256();let byteLength=0,sequence=0;await engine.pipeSherloqPng({surfaceId:payload.display.id,revision:payload.display.revision},new WritableStream({async write(chunk){if(controller.signal.aborted)throw cancelled();const bytes=chunk.slice();hash.update(bytes);byteLength+=bytes.byteLength;const part=++sequence;await new Promise((resolve,reject)=>{acks.set(id,{sequence:part,resolve,reject});self.postMessage({id,chunk:bytes,sequence:part},[bytes.buffer]);});}}),{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})});result={descriptor:{...streamInfo,byteLength,sha256:hash.digest('hex')}};}else{
   let descriptor,failure;
   try{descriptor=payload.display.kind==='result'?await engine.exportPixelBuffer({pixels:lastPixels,...payload.options,storage:is7c?'memory':'temporary'},{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})}):await engine.exportSurface({surfaceId:payload.display.id,revision:payload.display.revision,...payload.options,storage:is7c?'memory':'temporary'},{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})});
    for(let offset=0;offset<descriptor.byteLength;offset+=1024**2){const {bytes}=await engine.readExport({exportId:descriptor.id,revision:descriptor.revision,offset,length:Math.min(1024**2,descriptor.byteLength-offset)},{signal:controller.signal});const sequence=offset/1024**2+1;await new Promise((resolve,reject)=>{acks.set(id,{sequence,resolve,reject});self.postMessage({id,chunk:bytes,sequence},[bytes.buffer]);});}
    result={descriptor};
   }catch(error){failure=error;throw error;}
   finally{if(descriptor)try{await engine.releaseExport(descriptor.id);}catch(cleanup){if(!failure)throw cleanup;failure.details={...failure.details,cleanup:serializeEngineError(cleanup)};}}
   }
  }
else if(action==='export-energy'){
   if(!lastEnergy||payload.resultId!==lastEnergy.id)throw Error('Stale energy result');
   if(parameterDraft)throw new EngineError('PREVIEW_NOT_EXPORTABLE','Changed analysis parameters are provisional; finish the exact calculation before exporting raw energy.');
   let part=0,bytes=0;
   const selected=energyContextOptions(payload);await retireEnergyExports();let nativeExport,exportOwner,exportFailed=false;try{if(payload.format==='npz'&&(isEnergyContextCollection(lastEnergy)||lastEnergy.layout==='surface')){exportOwner={descriptor:null};energyExportOwners.add(exportOwner);exportOwner.ready=Promise.resolve().then(()=>engine.exportSurface({surfaceId:lastEnergy.surface.id,revision:lastEnergy.surface.revision,format:'npz',storage:'temporary'},{signal:controller.signal})).then(value=>(nativeExport=exportOwner.descriptor=value),error=>{energyExportOwners.delete(exportOwner);throw error;});nativeExport=await exportOwner.ready;}
   const chunks=nativeExport?(async function*(){for(let offset=0;offset<nativeExport.byteLength;offset+=1024**2){const {bytes}=await engine.readExport({exportId:nativeExport.id,revision:nativeExport.revision,offset,length:Math.min(1024**2,nativeExport.byteLength-offset)},{signal:controller.signal});yield bytes;}})():energyExportChunks(lastEnergy,payload.format,{engine,signal:controller.signal});
   for await(const chunk of chunks){
    if(controller.signal.aborted)throw cancelled();const data=chunk.slice(),sequence=++part;
    await new Promise((resolve,reject)=>{acks.set(id,{sequence,resolve,reject});self.postMessage({id,chunk:data,sequence},[data.buffer]);});bytes+=chunk.length;
   }
   result={streamed:true,bytesWritten:bytes,mime:payload.format==='npz'?'application/zip':'application/json',...selected};}catch(error){exportFailed=true;throw error;}finally{if(exportOwner)try{await closeEnergyExport(exportOwner);}catch(error){if(!exportFailed)throw error;}}
  }else if(action==='view-energy'){
   if(!lastEnergy||payload.resultId!==lastEnergy.id)throw Error('Stale energy result');
   const pixels=await energyView(payload.presentation,payload.preview,payload),snapshot=pixels.preview?immutablePreviewPixels(pixels):null;result={display:resultDisplay(pixels),...(snapshot?{pixels:snapshot}:{}),...(pixels.presentation?{presentation:pixels.presentation}:{}),...(pixels.adaptivePreview||pixels.numericSampling||pixels.previewMemoryAdmission?{metrics:{...(pixels.adaptivePreview?{adaptivePreview:pixels.adaptivePreview}:{}),...(pixels.numericSampling?{numericSampling:pixels.numericSampling}:{}),...(pixels.previewMemoryAdmission?{previewMemoryAdmission:pixels.previewMemoryAdmission}:{})}}:{})};
   // A successful exact view restores the retained scientific recipe after a
   // cancelled parameter gesture. A sampled view or failed render stays dirty.
   if(!pixels.preview){parameterDraft=false;parameterDraftKind=null;}
  }else if(action==='energy-histogram'){
   if(!lastEnergy||payload?.resultId!==lastEnergy.id||payload.imageId!==lastEnergy.imageId)throw new EngineError('HISTOGRAM_NATIVE_REQUIRED','An exact current native Energy result and source are required.');
   energySourceDescriptor(lastEnergy);
   if(parameterDraft)throw new EngineError('PREVIEW_NOT_EXPORTABLE','Finish the exact calculation before requesting histograms of changed analysis parameters.');
   result={histogram:await nativeEnergyHistogram().get(isEnergyContextCollection(lastEnergy)?lastEnergy:energyHistogramAnalysis(lastEnergy,engine),{signal:controller.signal,referencePanelId:payload.referencePanelId,qualityIndex:payload.qualityIndex,...energyContextOptions(payload),sourceFragment:payload.sourceFragment,panelId:null})};
   if(controller.signal.aborted)throw cancelled();
  }else if(action==='synthesis-budget-plan'){
   result=await engine.elaSynthesisBudgetPlan(payload,{signal:controller.signal});
  }else if(action==='estimate-ela-auto'){
   result=await automaticEla(payload,id);
  }else if(action==='commit-energy-ela'){
   const ela=validateParams(payload.params),requested=sharedEnergyParams(payload.energyParams),native=lastEnergy?.provenance?.params,quality=isEnergyContextCollection(lastEnergy)?selectEnergyContext(lastEnergy,payload).context?.nativeMetadata?.quality:lastEnergy?.data?.metadata?.quality;
   const fields=['block','minimum','profile','histogramLow','histogramHigh','shadow','highlight'];const normalizedNative=native?sharedEnergyParams(native):null;
   if(!lastEnergy||payload.resultId!==lastEnergy.id||payload.imageId!==lastEnergy.imageId||!descriptors.has(payload.imageId))throw new EngineError('INVALID_INPUT','Stale energy source or result for ELA presentation commit.');
   if(parameterDraftKind==='energy'||!native||!fields.every(key=>requested[key]===normalizedNative[key])||JSON.stringify(requested.recompression??null)!==JSON.stringify(normalizedNative.recompression??null)||!lastEnergy.synthesis&&(!Number.isInteger(quality)||quality<1||quality>100||ela.quality!==quality||requested.quality!==quality||JSON.stringify(ela.recompression??null)!==JSON.stringify(requested.recompression??null)))throw new EngineError('ENERGY_BASE_CHANGED','The ELA quality or scientific energy recipe changed; an exact native calculation is required.');
   const pixels=await energyView(payload.presentation,undefined,payload);result={display:resultDisplay(pixels),...(pixels.presentation?{presentation:pixels.presentation}:{}),elaParameters:ela,reusedNativeEnergy:true,baseQuality:quality};
   parameterDraft=false;parameterDraftKind=null;
  }else if(action==='preview-energy-parameters'){
   if(!lastEnergy||payload.resultId!==lastEnergy.id)throw new EngineError('INVALID_INPUT','Stale energy result for parameter preview.');
   const domain=await previewSourceDomain(lastEnergy.imageId,payload.sourceRegionDomain);if((domain?.fingerprint??null)!==(lastEnergy.sourceRegionDomain?.fingerprint??null))throw new EngineError('DRAFT_BASE_MISMATCH','The draft domain differs from its retained native Energy contexts.');
   previewBounds(payload.preview);parameterDraft=true;parameterDraftKind='energy';
   const draft=await energyParameterPreview().render(lastEnergy,{...energyContextOptions(payload),params:payload.params,presentation:payload.presentation,backend:payload.backend??'auto',preview:{...payload.preview,maxWorkingBytes:previewWorkingBytes(),maxPixels:Math.min(ADAPTIVE_PREVIEW_MAX_PIXELS,Math.floor(Math.max(0,consumerBudget-(lastPixels?.data?.byteLength??0))/6))},signal:controller.signal});
   const pixels=immutablePreviewPixels(draft.pixels);result={display:resultDisplay(draft.pixels),presentation:draft.presentation,draft:draft.draft,pixels,...(draft.metrics?{metrics:draft.metrics}:{})};
  }else if(action==='prepare-visible-preview'){
   const descriptor=descriptors.get(payload?.imageId),domain=await previewSourceDomain(payload?.imageId,payload?.sourceRegionDomain),basis=[lastClassic,lastEnergy].find(value=>value?.id===payload?.resultId&&value.imageId===payload.imageId);
   if(!descriptor||descriptor.sha256!==payload?.sourceSha256||!basis||(basis.sourceRegionDomain?.fingerprint??null)!==(domain?.fingerprint??null))throw new EngineError('CANCELLED','The visible ELA preparation no longer owns its native result, source or domain.');
   if(payload.mode!==undefined&&!['classic','scores','biomes'].includes(payload.mode))throw new EngineError('INVALID_INPUT','Invalid visible ELA mode.');
   const moduleStarted=previewNow(),preparedModules=payload.mode&&payload.mode!=='classic'?['energy-pipeline','energy-auto','energy-prepare','energy-segment']:[];
   if(preparedModules.length){visibleEnergyModules??=Promise.all([import('./unified-engine/src/energy-pipeline.js'),import('./unified-engine/src/energy-auto.js'),import('./unified-engine/src/energy-prepare.js'),import('./unified-engine/src/energy-segment.js')]).catch(error=>{visibleEnergyModules=null;throw error;});await visibleEnergyModules;}
   if(controller.signal.aborted)throw cancelled();const modulePreparationMilliseconds=previewNow()-moduleStarted;
   if(payload.mode==='biomes'){
    if(basis!==lastEnergy||typeof payload.sourceKey!=='string'||!payload.sourceKey)throw new EngineError('CANCELLED','The visible Biomes preparation requires its retained Energy basis and Source key.');
    previewBounds(payload.preview);visibleEnergySourceKey=payload.sourceKey;
    result=await energyParameterPreview().warmInputs(lastEnergy,{...energyContextOptions(payload),params:lastEnergy.provenance.params,presentation:payload.presentation,backend:payload.backend??'auto',preview:{...payload.preview,maxWorkingBytes:previewWorkingBytes(),maxPixels:Math.min(ADAPTIVE_PREVIEW_MAX_PIXELS,Math.floor(Math.max(0,consumerBudget-(lastPixels?.data?.byteLength??0))/6))},signal:controller.signal});
   }else result=await engine.prepareElaClassicPreview({...payload,...(domain?{sourceRegionDomain:domain.descriptor}:{})},{signal:controller.signal});result={...result,preparedModules,metrics:{...result.metrics,modulePreparationMilliseconds}};
  }else if(action==='park-visible-preview'){
   if(payload.mode==='biomes'){if(payload.sourceKey===visibleEnergySourceKey)await disposeParameterPreview();result={parked:true};}
   else result=await engine.parkElaClassicPreview(payload,{signal:controller.signal});
  }else if(action==='preview-classic'&&payload.synthesis){result=await previewSynthesis(payload);
  }else if(action==='preview-classic'){
   const original=descriptors.get(payload.imageId),domain=await previewSourceDomain(payload.imageId,payload.sourceRegionDomain),descriptor=domain?{...original,width:domain.width,height:domain.height}:original;previewBounds(payload.preview);
   if(!descriptor||payload.resultId!==undefined&&(!lastClassic||payload.resultId!==lastClassic.id||payload.imageId!==lastClassic.imageId))throw new EngineError('INVALID_INPUT','Stale Classic source or result for parameter preview.');
   parameterDraft=true;parameterDraftKind='classic';
   const samplingIdentity=JSON.stringify([descriptor.sha256??payload.imageId,domain?.fingerprint??null,recompressionIdentity(payload.params)]),sampling=classicProportionalIdentity===samplingIdentity?'proportional':'integer';
   const plan=adaptivePreviewPlan(payload.preview,descriptor.width,descriptor.height,'ela/classic/'+recompressionSizingIdentity(payload.params)+'/'+previewEqualizationFamily(payload.params)+'/backend='+(payload.backend??'auto')+'/'+(lastClassic?.recompressionIdentity===recompressionIdentity(payload.params)?'retained':'recompress'),String(descriptor.sha256??payload.imageId)+'/'+String(domain?.fingerprint??''),sampling),side=plan.side,started=previewNow();
   const draft=await engine.previewElaClassic({imageId:payload.imageId,params:payload.params,side,backend:payload.backend??'auto',...(domain?{sourceRegionDomain:domain.descriptor}:{})},{signal:controller.signal}),pixels=draft.pixels;
   if(!pixels||pixels.width>side||pixels.height>side||pixels.format!=='rgb8'||pixels.data?.length!==pixels.width*pixels.height*3||draft.logicalWidth!==descriptor.width||draft.logicalHeight!==descriptor.height)throw new EngineError('INVALID_INPUT','Classic preview dimensions differ from its native source.');
   classicProportionalIdentity=draft.nativePixelSamples===true&&draft.presentation?.sampling?.method==='nearest-native-pixel-center'?samplingIdentity:null;
   const backing={...pixels,logicalWidth:descriptor.width,logicalHeight:descriptor.height,preview:true},snapshot=immutablePreviewPixels(backing);result={display:resultDisplay(backing),presentation:{...draft.presentation,preview:true},pixels:snapshot,...(draft.sourceRegionDomain?{sourceRegionDomain:draft.sourceRegionDomain,sourceRegionOrigin:draft.sourceRegionOrigin}:{}),metrics:{...draft.metrics,adaptivePreview:observePreview(plan,started,backing,draft.metrics)}};
  }else if(action==='run'){
   const {presentation,synthesis,synthesisParams,synthesisPresentation,...task}=payload;
   const original=descriptors.get(payload.imageId),domain=payload.sourceRegionDomain?await compileOriginalSourceRegions(payload.sourceRegionDomain):null,descriptor=domain?{width:domain.width,height:domain.height}:original;
   if(!original||domain&&(domain.sourceSha256!==original.sha256||domain.sourceWidth!==original.width||domain.sourceHeight!==original.height))throw new EngineError('SOURCE_REGIONS_INVALID','The calculation belongs to another original source.');
   const requestCohort=synthesisEnergyRequestCohort(payload,original,domain),candidateSynthesisKey=lastEnergy?.synthesis?.key?.key??lastEnergy?.synthesis?.key,canAdoptSynthesis=!!synthesis&&requestCohort!==null&&successfulSynthesisEnergyCohort?.requestCohort===requestCohort&&successfulSynthesisEnergyCohort?.key===candidateSynthesisKey;
   let normalAdoption=(!synthesis||canAdoptSynthesis)&&!!synthesis===!!lastEnergy?.synthesis&&task.operation==='ela.energy'&&lastEnergy?.imageId===task.imageId&&normalNativePreview?await normalNativePreview.take({analysis:lastEnergy,params:task.params,presentation,pixels:lastPixels,backend:task.backend??'auto',domain}):null,normalFailed=false,normalPrimary;
   if(normalAdoption?.output.layout==='surface')task.resultLayout='surface';lastPixels=null;
   try{const normalCommitStarted=previewNow();
   const previousCohort=successfulSynthesisEnergyCohort,retainedOwners=!!(parameterPreview||histogramOwner)&&requestCohort!==null&&previousCohort?.requestCohort===requestCohort;
   if(!retainedOwners)await retireSynthesisEnergyOwners();
   const segmentedEnergy=payload.operation==='ela.energy'&&(task.resultLayout==='surface'||domain&&sourceRegionDomainShape(domain)!=='identity'||descriptor.width*descriptor.height*40>consumerBudget);
   if(segmentedEnergy&&!synthesis)task.resultLayout='surface';
   const required=segmentedEnergy?energyFrameBudget({width:descriptor.width,height:descriptor.height,presentation}).requiredBytes:descriptor.width*descriptor.height*(payload.operation==='ela.energy'?40:3);
   if(!synthesis&&required>consumerBudget)throw Object.assign(Error('Result and presentation buffers exceed currently available memory; this operation still requires resident result arrays'),{code:'RESULT_MEMORY_BUDGET'});
   await disposeNormalNativePreview();
   await releaseEnergySurfaces();await releaseRetiredResultSources();energyMaxima={};energySignedRanges={};
   const normalPixels=normalAdoption?.pixels,output=normalAdoption?{...normalAdoption.output,metrics:{backend:normalAdoption.output.provenance?.backend??'cpu',kernel:synthesis?'reused-exact-synthesis-native-preview':'reused-exact-normal-native-preview',totalMs:previewNow()-normalCommitStarted,energyRecompressions:0,energyQualityPlanesComputed:0,energyPanelDetections:0,energyCodecMs:0,energyPrimitivesMs:0,energyPreparationMs:0,energySegmentationMs:0,energyProfileMs:0,energyScoreGpuSubmissions:0,nativeAnalysisRequests:0,...(synthesis?{synthesisFrameAnalysisRequests:0,synthesisEnergyPlanesComputed:0,energyPreparationsComputed:0,energySegmentationsComputed:0,energyAutomaticProfilesComputed:0}:{}),workers:0,promotedPreview:true,previewExecution:normalAdoption.output.metrics,cache:{result:true,previewExact:true},memory:engine.capabilities().memory}}:synthesis?await runSynthesisTask(task,{params:synthesisParams,presentation:synthesisPresentation,onProgress:progress=>self.postMessage({id,progress}),...(retainedOwners?{retireForMemoryRetry:error=>retireSynthesisEnergyOwners(error)}:{})}):await engine.run(task,{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})});
   if(normalAdoption){adoptedNormalNativeOwners.set(output,normalAdoption);normalAdoption=null;}
   let nextClassic=null,published=false,publicationFailed=false,failure;
   try{
   nextSuccessfulEnergyCohort=verifiedSynthesisEnergyCohort(output,requestCohort);if(retainedOwners&&(!nextSuccessfulEnergyCohort||nextSuccessfulEnergyCohort.key!==previousCohort.key))await retireSynthesisEnergyOwners();
   if(output.operation==='ela.classic'){const comparison=output.sourceRegionSourceSurface,originalSurface=descriptors.get(output.imageId)?.surface;nextClassic={id:output.id,imageId:output.imageId,...(output.synthesis?{synthesis:output.synthesis}:{}),sourceRegionDomain:output.sourceRegionDomain??null,auxiliarySurfaces:Object.values(output.planeSurfaces??{}),quality:output.provenance?.params?.quality,recompressionIdentity:recompressionIdentity(output.provenance?.params),...(output.layout==='surface'&&output.surface?{surface:output.surface}:{}),...(comparison?.id&&comparison.id!==originalSurface?.id?{comparisonSurface:comparison}:{})};}
   if(controller.signal.aborted)throw cancelled();
   if(payload.operation==='ela.energy'){
    lastEnergy=output;const rendered=normalPixels??await energyView(presentation),display=resultDisplay(rendered);
    const {data,pixels,...meta}=output;result={...meta,data:{width:data.width,height:data.height,metadata:data.metadata,regions:data.regions,regionColors:data.regionColors,...(data.contextLayout?{contextLayout:data.contextLayout,contexts:data.contexts,coverage:data.coverage}:{})},display,...(rendered.presentation?{presentation:rendered.presentation}:{})};
   }else {const {pixels,...meta}=output;result={...meta,display:output.layout==='surface'&&output.surface?{...output.surface,kind:'native-result'}:resultDisplay(pixels)};}
   await releaseClassicSurface(nextClassic);
   // Keep the current comparison alias and one preceding successful source.
   // A new run implies the UI adopted the preceding reply; failed runs retain
   // its still-visible comparison source. Scientific plane handles are separate.
   retainResultSource(output);
   // Successful publication transfers comparison ownership to the bounded
   // source registry. A failed unpublished Classic owner keeps its own alias.
   if(nextClassic)delete nextClassic.comparisonSurface;
   lastClassic=nextClassic;published=true;
   if(output.metrics?.promotedPreview)output.metrics.totalMs=previewNow()-normalCommitStarted;
   parameterDraft=false;parameterDraftKind=null;
   }catch(error){publicationFailed=true;failure=error;throw error;}
   finally{if(!published)for(const cleanup of [()=>nextClassic&&releaseClassicOwner(nextClassic,lastClassic),()=>output.operation==='ela.energy'&&releaseEnergySurfaces(output)])try{await cleanup();}catch(cleanup){if(!publicationFailed)throw cleanup;if(typeof failure==='object'&&Object.isExtensible(failure))failure.details={...failure.details,cleanup:serializeEngineError(cleanup)};}}
   }catch(error){normalFailed=true;normalPrimary=error;throw error;}
   finally{if(normalAdoption)try{await retireNormalNative(normalAdoption);}catch(cleanup){if(!normalFailed)throw cleanup;if(normalPrimary&&typeof normalPrimary==='object'&&Object.isExtensible(normalPrimary))normalPrimary.nativeCandidateCleanup=serializeEngineError(cleanup);}}
  }else throw Error('Unknown worker action');
  self.postMessage({id,result},result?.pixels?.data?[result.pixels.data.buffer]:[]);
  if(action==='run')successfulSynthesisEnergyCohort=nextSuccessfulEnergyCohort??null;
 }catch(error){if(!failed){const normalized=error?.name==='AbortError'||activeCommand?.id===id&&controller?.signal.aborted?new EngineError('CANCELLED','The provisional calculation was cancelled.',{cause:error}):normalizeResourceError(error),failure=normalized?.code!==undefined&&typeof normalized.code!=='string'?new EngineError('INTERNAL',normalized?.message??'Worker calculation failed.',{cause:normalized}):normalized;self.postMessage({id,error:serializeEngineError(failure)});}}
 finally{acks.delete(id);cancelledPreviewCommands.delete(id);if(activeCommand?.id===id)activeCommand=null;}
}
installWorkerMessageProtocol(self,data=>{
 if(typeof data.action!=='string'||data.action!=='cancel'&&(!Number.isSafeInteger(data.id)||data.id<=0))throw workerMessageFailure('ela-endpoint','message','invalid-command');
 if(data.action==='export-ack'){if(!Number.isSafeInteger(data.sequence)||data.sequence<=0||data.error!==undefined&&typeof data.error!=='string'&&(!data.error||typeof data.error.code!=='string'||typeof data.error.message!=='string'))throw workerMessageFailure('ela-endpoint','message','invalid-export-ack');const ack=acks.get(data.id);if(ack?.sequence===data.sequence){acks.delete(data.id);data.error?ack.reject(typeof data.error==='object'?deserializeEngineError(data.error):new EngineError('EXPORT_FAILED',String(data.error))):ack.resolve();}return;}
 if(data.action==='cancel'){controller?.abort();for(const ack of acks.values())ack.reject(cancelled());return;}
 if(data.action==='cancel-preview'){if(activeCommand?.id===data.id&&PROVISIONAL_ACTIONS.has(activeCommand.action))controller?.abort();else{cancelledPreviewCommands.add(data.id);while(cancelledPreviewCommands.size>128)cancelledPreviewCommands.delete(cancelledPreviewCommands.values().next().value);}return;}
 // Source retirement is observed immediately, ahead of the serial queue. A
 // value's cancel-preview only aborts its command and leaves idle inputs alive.
 if(data.action==='dispose'||data.action==='load'||data.action==='park-visible-preview'&&data.payload?.mode==='biomes'&&data.payload?.sourceKey===visibleEnergySourceKey)parameterPreview?.cancelSource?.();
 // Pixel-window requests and calculations must not race the engine's BUSY guard.
 queue=queue.then(()=>handle(data));return queue;
},{label:'ela-endpoint',onFailure:error=>{if(failed)return;failed=true;controller?.abort();for(const ack of acks.values())ack.reject(error);acks.clear();self.postMessage({fatal:serializeEngineError(error)});}});
