import {energyFrameBudget,assertEnergyFrameBudget} from './energy-frame-budget.js';
import {renderEnergySurface} from './energy-surface-render.js';
import {energyHistogramAnalysis} from './energy-native-fields.js';
import {compileOriginalSourceRegions} from './unified-engine/src/source-region-geometry.js';
import {sourceRegionDomainShape} from './unified-engine/src/source-region-capabilities.js';
import {samplePixels} from './unified-engine/src/display-sampling.js';
import {EngineError,serializeEngineError,deserializeEngineError,normalizeResourceError} from './unified-engine/src/errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './unified-engine/src/worker-message-protocol.js';
import {renderEnergy} from './energy-render.js';
import {createEnergyParameterPreview} from './energy-parameter-preview.js';
import {resolveComputeProfile} from './resource-policy.js';
import {energyExportChunks} from './streaming-export.js';
import {validateParams} from './unified-engine/src/ela.js';
import {estimateElaClassicAuto,calibrateElaClassicDisplay} from './ela-auto-estimate.js';
import {createEnergyHistogram} from './energy-histogram.js';
import {createAdaptivePreview} from './adaptive-preview.js';
let engine,lastEnergy=null,lastClassic=null,lastPixels=null,energyMaxima={},energySignedRanges={},parameterDraft=false,parameterDraftKind=null,parameterPreview=null,controller,displayRevision=0,queue=Promise.resolve(),consumerBudget=0,failed=false;
let automaticSource=null,automaticEstimate=null;
let histogramOwner=null;
const descriptors=new Map(),acks=new Map();
const adaptivePreview=createAdaptivePreview({persist:false});
const previewNow=()=>globalThis.performance?.now?.()??Date.now();
const cancelled=()=>Object.assign(Error('Cancelled'),{code:'CANCELLED'});
function sharedEnergyParams(input){const defaults={quality:0,block:32,minimum:3,profile:'standard',histogramLow:10,histogramHigh:990,shadow:50,highlight:50};if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!Object.hasOwn(defaults,key)))throw new EngineError('INVALID_INPUT','Explicit scientific Energy parameters required.');return{...defaults,...input};}
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
 if(!['identity','rectangle'].includes(sourceRegionDomainShape(domain)))throw new EngineError('SOURCE_SCOPE_PREVIEW_UNSUPPORTED','A provisional raster cannot read excluded samples inside the source envelope.');return domain;
}
async function energyView(presentation,preview){
 const desc=energySourceDescriptor(lastEnergy);
 const choice=preview?adaptivePreviewPlan(preview,presentation?.view==='scores'&&presentation?.field==='both'?desc.width*2:desc.width,desc.height,'ela/view/'+(presentation?.view??'overlay')+'/'+(presentation?.field??'high')+'/'+(presentation?.scoreView??'map')):null,started=previewNow();
 // Rendering consumes source rows without an imagePixels full-raster copy.
 const bounds=choice?{maxWidth:choice.side,maxHeight:choice.side}:null;assertEnergyFrameBudget(energyFrameBudget({width:desc.width,height:desc.height,presentation,previousBytes:lastPixels?.data?.byteLength??0,preview:bounds}),consumerBudget);
 const source={width:desc.width,height:desc.height,readPixels:rect=>windowPixels(desc.surface,rect),readSampled:async tile=>(await engine.readDisplay({surfaceId:desc.surface.id,revision:desc.surface.revision,tile},{signal:controller.signal})).pixels},options={engine,signal:controller.signal,preview:choice?{...preview,maxWidth:choice.side,maxHeight:choice.side}:undefined,observedMaxima:energyMaxima,signedRanges:energySignedRanges};
 const pixels=lastEnergy.planeSurfaces?await renderEnergySurface(lastEnergy,source,presentation,{...options,rgbBudgetReserved:true}):await renderEnergy(lastEnergy.data,source,presentation,options);
 if(choice)pixels.adaptivePreview=observePreview(choice,started,pixels);
 if(!pixels.preview){if(pixels.presentation?.observedMaxima)Object.assign(energyMaxima,pixels.presentation.observedMaxima);if(pixels.presentation?.signedRanges)Object.assign(energySignedRanges,pixels.presentation.signedRanges);}return pixels;
}
async function disposeParameterPreview(){const owner=parameterPreview;parameterPreview=null;await owner?.dispose();}
async function disposeEnergyHistogram(){const owner=histogramOwner;histogramOwner=null;await owner?.dispose();}
function nativeEnergyHistogram(){
 return histogramOwner??=createEnergyHistogram({engine,bins:256,maximumWindowBytes:1024**2,readOriginal:async(analysis,rect,signal)=>{
  const descriptor=energySourceDescriptor(analysis);
  return(await engine.readPixels({surfaceId:descriptor.surface.id,revision:descriptor.surface.revision,rect},{signal})).pixels;
 }});
}
async function releaseClassicSurface(){const previous=lastClassic;lastClassic=null;if(previous?.surface)await engine.releaseSurface(previous.surface.id);}
function energyParameterPreview(){return parameterPreview??=createEnergyParameterPreview({engine,readOriginal:async(analysis,tile,signal)=>{const descriptor=energySourceDescriptor(analysis);return(await engine.readDisplay({surfaceId:descriptor.surface.id,revision:descriptor.surface.revision,tile},{signal})).pixels;}});}
function previewBounds(preview={}){const {maxWidth=2048,maxHeight=2048}=preview;if(![maxWidth,maxHeight].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=2048))throw new EngineError('INVALID_INPUT','Invalid parameter preview bounds.');return Math.min(maxWidth,maxHeight);}
function adaptivePreviewPlan(preview,width,height,key){const bound=previewBounds(preview),maxPixels=Math.min(2048**2,Math.floor(Math.max(0,consumerBudget-(lastPixels?.data?.byteLength??0))/6));if(maxPixels<1)throw new EngineError('UI_MEMORY_BUDGET','No admitted memory for a provisional preview.');return adaptivePreview.plan({key,width,height,maxSide:bound,maxPixels,feedback:preview?.adaptiveFeedback});}
function previewWorkingBytes(){const memory=engine.capabilities()?.memory;return memory&&Number.isFinite(memory.budgetBytes)&&Number.isFinite(memory.policyAvailableBytes)?Math.max(0,Math.floor(Math.min(memory.budgetBytes/3,memory.policyAvailableBytes))):128*1024**2;}
function observePreview(plan,started,pixels){const milliseconds=previewNow()-started,count=pixels.width*pixels.height;adaptivePreview.observe(plan,{milliseconds,pixels:count});return{token:plan.token,milliseconds,setupMilliseconds:0,cold:false,pixels:count};}
function immutablePreviewPixels(pixels){
 if(!pixels?.preview||![pixels.width,pixels.height].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=2048)||pixels.width*pixels.height>Math.floor(consumerBudget/6)||pixels.format!=='rgb8'||!(pixels.data instanceof Uint8Array)||pixels.data.length!==pixels.width*pixels.height*3)throw new EngineError('INVALID_INPUT','Invalid bounded parameter preview raster.');
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
  const inspected=await engine.inspectHeaders({blob:source.blob},{signal});
  estimate=await estimateElaClassicAuto({width:descriptor.width,height:descriptor.height,sourceSha256:payload.sourceSha256,header:inspected.header,readRect:(rect,hooks)=>engine.readPixels({surfaceId:descriptor.surface.id,revision:descriptor.surface.revision,rect},hooks)},{signal,onProgress:progress=>self.postMessage({id,progress}),reserveMemory:async bytes=>{const lease=await engine.reserveExternalMemory({bytes});return()=>engine.releaseExternalMemory(lease.id);}});
  if(signal.aborted)throw cancelled();
  headerMetrics=inspected.metrics;automaticEstimate={imageId:payload.imageId,sourceSha256:payload.sourceSha256,width:descriptor.width,height:descriptor.height,domainKey,estimate,headerMetrics};
 }
 const reference=estimate.evidence?.kind==='current-file-tables'?estimate.evidence.referenceQuality:null,quality=estimate.quality??(Number.isInteger(reference)&&reference>=1&&reference<=100?reference:null)??params.quality;
 if(!Number.isInteger(quality)||quality<1||quality>100)throw new EngineError('INVALID_INPUT','Automatic ELA produced an invalid recompression reference.');
 const nativeBytes=descriptor.width*descriptor.height*3;
 if(!Number.isSafeInteger(nativeBytes))throw new EngineError('RESULT_MEMORY_BUDGET','The native calibration dimensions exceed the addressable result grid.');
 const step=Math.max(1,Math.ceil(Math.max(descriptor.width,descriptor.height)/320)),tile={x:0,y:0,w:descriptor.width,h:descriptor.height,step},sampleWidth=Math.ceil(descriptor.width/step),sampleHeight=Math.ceil(descriptor.height/step);
  output=await engine.run({id:'ela-auto-calibration-'+id,imageId:payload.imageId,operation:'ela.classic',params:{quality,scale:1,contrast:0,linear:true,grayscale:false},backend:'cpu',regions:[],...(region?{sourceRegionDomain:region.sourceRegionDomain}:{})},{signal,onProgress:progress=>self.postMessage({id,progress:{...progress,phase:'auto-calibration-'+progress.phase}})});
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
async function handle({id,action,payload,options}){
 if(failed)return;
 try{
  if(!engine){
   const profile=resolveComputeProfile(options?.computeProfile||'aggressive',options?.resourceHints);
   consumerBudget=Math.min(Math.max(0,options?.uiRGBBudgetBytes||0),Math.floor(profile.memoryBudgetBytes/3));
   const budget=profile.memoryBudgetBytes-Math.max(0,options?.uiReserveBytes||0)-consumerBudget;
   if(budget<32*1024**2)throw Object.assign(Error('UI reservations leave insufficient engine memory'),{code:'UI_MEMORY_BUDGET'});
   const moduleURL=new URL('./unified-engine/src/index.js',import.meta.url).href;let createEngine;
   try{({createEngine}=await import('./unified-engine/src/index.js'));}
   catch(cause){throw new EngineError('WORKER_LOAD_FAILED',cause?.message||'Browser engine module could not be loaded.',{cause,details:{phase:'module-load',moduleURL}});}
   if(failed)return;
   try{engine=createEngine({...options,memoryBudgetBytes:budget,onTemporarySession:session=>self.postMessage({temporarySession:session})});}
   catch(cause){const error=normalizeResourceError(cause),failure=error?.code?error:new EngineError('WORKER_INITIALIZATION_FAILED',cause?.message||'Browser engine could not be initialized.',{cause});failure.details={...failure.details,phase:'engine-create',moduleURL};throw failure;}
  }
  if(action==='capabilities'){self.postMessage({id,result:await engine.capabilities()});return;}
  controller=new AbortController();let result;
  if(action==='load'){
   await disposeParameterPreview();
   await disposeEnergyHistogram();
   result=await engine.loadBlob(payload,{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})});
   await releaseClassicSurface();
   automaticSource=payload.blob?{imageId:payload.id,sourceSha256:result.sha256,blob:payload.blob}:null;automaticEstimate=null;
   descriptors.set(payload.id,result);lastEnergy=null;lastClassic=null;lastPixels=null;parameterDraft=false;parameterDraftKind=null;energyMaxima={};energySignedRanges={};displayRevision++;
  }else if(action==='read-display')result={pixels:await displayTile(payload.display,payload.tile)};
  else if(action==='read-window')result={pixels:await windowPixels(payload.display,payload.rect)};
  else if(action==='export-raster'){
   if(parameterDraft)throw new EngineError('PREVIEW_NOT_EXPORTABLE','Finish the exact calculation before exporting a changed-parameter view.');
   if(payload.display.kind==='result'&&(!lastPixels||payload.display.revision!==displayRevision))throw Object.assign(Error('Stale result surface'),{code:'INVALID_INPUT'});
   if(payload.display.kind==='result'&&lastPixels.preview)throw Object.assign(Error('An approximate energy preview cannot be exported; wait for the exact view.'),{code:'PREVIEW_NOT_EXPORTABLE'});
   let descriptor,failure;
   try{descriptor=payload.display.kind==='result'?await engine.exportPixelBuffer({pixels:lastPixels,...payload.options,storage:'temporary'},{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})}):await engine.exportSurface({surfaceId:payload.display.id,revision:payload.display.revision,...payload.options,storage:'temporary'},{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})});
    for(let offset=0;offset<descriptor.byteLength;offset+=1024**2){const {bytes}=await engine.readExport({exportId:descriptor.id,revision:descriptor.revision,offset,length:Math.min(1024**2,descriptor.byteLength-offset)},{signal:controller.signal});const sequence=offset/1024**2+1;await new Promise((resolve,reject)=>{acks.set(id,{sequence,resolve,reject});self.postMessage({id,chunk:bytes,sequence},[bytes.buffer]);});}
    result={descriptor};
   }catch(error){failure=error;throw error;}
   finally{if(descriptor)try{await engine.releaseExport(descriptor.id);}catch(cleanup){if(!failure)throw cleanup;failure.details={...failure.details,cleanup:serializeEngineError(cleanup)};}}
  }
else if(action==='export-energy'){
   if(!lastEnergy||payload.resultId!==lastEnergy.id)throw Error('Stale energy result');
   if(parameterDraft)throw new EngineError('PREVIEW_NOT_EXPORTABLE','Changed analysis parameters are provisional; finish the exact calculation before exporting raw energy.');
   let part=0,bytes=0;
   for await(const chunk of energyExportChunks(lastEnergy,payload.format)){
    if(controller.signal.aborted)throw cancelled();const data=chunk.slice(),sequence=++part;
    await new Promise((resolve,reject)=>{acks.set(id,{sequence,resolve,reject});self.postMessage({id,chunk:data,sequence},[data.buffer]);});bytes+=chunk.length;
   }
   result={streamed:true,bytesWritten:bytes,mime:payload.format==='npz'?'application/zip':'application/json'};
  }else if(action==='view-energy'){
   if(!lastEnergy||payload.resultId!==lastEnergy.id)throw Error('Stale energy result');
   const pixels=await energyView(payload.presentation,payload.preview);result={display:resultDisplay(pixels),...(pixels.presentation?{presentation:pixels.presentation}:{}),...(pixels.adaptivePreview?{metrics:{adaptivePreview:pixels.adaptivePreview}}:{})};
  }else if(action==='energy-histogram'){
   if(!lastEnergy||payload?.resultId!==lastEnergy.id||payload.imageId!==lastEnergy.imageId)throw new EngineError('HISTOGRAM_NATIVE_REQUIRED','An exact current native Energy result and source are required.');
   energySourceDescriptor(lastEnergy);
   if(parameterDraft)throw new EngineError('PREVIEW_NOT_EXPORTABLE','Finish the exact calculation before requesting histograms of changed analysis parameters.');
   result={histogram:await nativeEnergyHistogram().get(energyHistogramAnalysis(lastEnergy,engine),{signal:controller.signal,referencePanelId:payload.referencePanelId,qualityIndex:payload.qualityIndex,panelId:null})};
  }else if(action==='estimate-ela-auto'){
   result=await automaticEla(payload,id);
  }else if(action==='commit-energy-ela'){
   const ela=validateParams(payload.params),requested=sharedEnergyParams(payload.energyParams),native=lastEnergy?.provenance?.params,quality=lastEnergy?.data?.metadata?.quality;
   const fields=['block','minimum','profile','histogramLow','histogramHigh','shadow','highlight'];const normalizedNative=native?sharedEnergyParams(native):null;
   if(!lastEnergy||payload.resultId!==lastEnergy.id||payload.imageId!==lastEnergy.imageId||!descriptors.has(payload.imageId))throw new EngineError('INVALID_INPUT','Stale energy source or result for ELA presentation commit.');
   if(parameterDraftKind==='energy'||!Number.isInteger(quality)||quality<1||quality>100||ela.quality!==quality||requested.quality!==quality||!native||!fields.every(key=>requested[key]===normalizedNative[key]))throw new EngineError('ENERGY_BASE_CHANGED','The ELA quality or scientific energy recipe changed; an exact native calculation is required.');
   const pixels=await energyView(payload.presentation);result={display:resultDisplay(pixels),...(pixels.presentation?{presentation:pixels.presentation}:{}),elaParameters:ela,reusedNativeEnergy:true,baseQuality:quality};
   parameterDraft=false;parameterDraftKind=null;
  }else if(action==='preview-energy-parameters'){
   if(!lastEnergy||payload.resultId!==lastEnergy.id)throw new EngineError('INVALID_INPUT','Stale energy result for parameter preview.');
   previewBounds(payload.preview);parameterDraft=true;parameterDraftKind='energy';
   const draft=await energyParameterPreview().render(lastEnergy,{params:payload.params,presentation:payload.presentation,preview:{...payload.preview,maxWorkingBytes:previewWorkingBytes(),maxPixels:Math.min(2048**2,Math.floor(Math.max(0,consumerBudget-(lastPixels?.data?.byteLength??0))/6))},signal:controller.signal});
   const pixels=immutablePreviewPixels(draft.pixels);result={display:resultDisplay(draft.pixels),presentation:draft.presentation,draft:draft.draft,pixels,...(draft.metrics?{metrics:draft.metrics}:{})};
  }else if(action==='preview-classic'){
   const original=descriptors.get(payload.imageId),domain=await previewSourceDomain(payload.imageId,payload.sourceRegionDomain),descriptor=domain?{...original,width:domain.width,height:domain.height}:original;previewBounds(payload.preview);
   if(!descriptor||payload.resultId!==undefined&&(!lastClassic||payload.resultId!==lastClassic.id||payload.imageId!==lastClassic.imageId))throw new EngineError('INVALID_INPUT','Stale Classic source or result for parameter preview.');
   parameterDraft=true;parameterDraftKind='classic';
   const plan=adaptivePreviewPlan(payload.preview,descriptor.width,descriptor.height,'ela/classic/'+(lastClassic?.quality===payload.params?.quality?'retained':'recompress')),side=plan.side,started=previewNow();
   const draft=await engine.previewElaClassic({imageId:payload.imageId,params:payload.params,side,...(domain?{sourceRegionDomain:domain.descriptor}:{})},{signal:controller.signal}),pixels=draft.pixels;
   if(!pixels||pixels.width>side||pixels.height>side||pixels.format!=='rgb8'||pixels.data?.length!==pixels.width*pixels.height*3||draft.logicalWidth!==descriptor.width||draft.logicalHeight!==descriptor.height)throw new EngineError('INVALID_INPUT','Classic preview dimensions differ from its native source.');
   const backing={...pixels,logicalWidth:descriptor.width,logicalHeight:descriptor.height,preview:true},snapshot=immutablePreviewPixels(backing);result={display:resultDisplay(backing),presentation:{...draft.presentation,preview:true},pixels:snapshot,...(draft.sourceRegionDomain?{sourceRegionDomain:draft.sourceRegionDomain,sourceRegionOrigin:draft.sourceRegionOrigin}:{}),metrics:{adaptivePreview:observePreview(plan,started,backing)}};
  }else if(action==='run'){
   await disposeParameterPreview();
   const {presentation,...task}=payload;lastPixels=null;
   const original=descriptors.get(payload.imageId),domain=payload.sourceRegionDomain?await compileOriginalSourceRegions(payload.sourceRegionDomain):null,descriptor=domain?{width:domain.width,height:domain.height}:original;
   if(!original||domain&&(domain.sourceSha256!==original.sha256||domain.sourceWidth!==original.width||domain.sourceHeight!==original.height))throw new EngineError('SOURCE_REGIONS_INVALID','The calculation belongs to another original source.');
   const segmentedEnergy=payload.operation==='ela.energy'&&domain&&sourceRegionDomainShape(domain)!=='identity',required=segmentedEnergy?energyFrameBudget({width:descriptor.width,height:descriptor.height,presentation}).requiredBytes:descriptor.width*descriptor.height*(payload.operation==='ela.energy'?40:3);
   if(required>consumerBudget)throw Object.assign(Error('Result and presentation buffers exceed currently available memory; this operation still requires resident result arrays'),{code:'RESULT_MEMORY_BUDGET'});
   lastEnergy=null;energyMaxima={};energySignedRanges={};
   const output=await engine.run(task,{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})});
   let nextClassic=null,published=false,failure;
   try{
   if(output.operation==='ela.classic')nextClassic={id:output.id,imageId:output.imageId,quality:output.provenance?.params?.quality,...(output.layout==='surface'&&output.surface?{surface:output.surface}:{})};
   if(controller.signal.aborted)throw cancelled();
   if(payload.operation==='ela.energy'){
    lastEnergy=output;const rendered=await energyView(presentation),display=resultDisplay(rendered);
    const {data,pixels,...meta}=output;result={...meta,data:{metadata:data.metadata,regions:data.regions,regionColors:data.regionColors},display,...(rendered.presentation?{presentation:rendered.presentation}:{})};
   }else {const {pixels,...meta}=output;result={...meta,display:output.layout==='surface'&&output.surface?{...output.surface,kind:'native-result'}:resultDisplay(pixels)};}
   if(lastClassic?.surface?.id!==nextClassic?.surface?.id)await releaseClassicSurface();
   lastClassic=nextClassic;published=true;
   parameterDraft=false;parameterDraftKind=null;
   }catch(error){failure=error;throw error;}
   finally{if(!published&&nextClassic?.surface)try{await engine.releaseSurface(nextClassic.surface.id);}catch(cleanup){if(!failure)throw cleanup;failure.details={...failure.details,cleanup:serializeEngineError(cleanup)};}}
  }else throw Error('Unknown worker action');
  self.postMessage({id,result},result?.pixels?.data?[result.pixels.data.buffer]:[]);
 }catch(error){if(!failed)self.postMessage({id,error:serializeEngineError(error)});}
 finally{acks.delete(id);}
}
installWorkerMessageProtocol(self,data=>{
 if(typeof data.action!=='string'||data.action!=='cancel'&&(!Number.isSafeInteger(data.id)||data.id<=0))throw workerMessageFailure('ela-endpoint','message','invalid-command');
 if(data.action==='export-ack'){if(!Number.isSafeInteger(data.sequence)||data.sequence<=0||data.error!==undefined&&typeof data.error!=='string'&&(!data.error||typeof data.error.code!=='string'||typeof data.error.message!=='string'))throw workerMessageFailure('ela-endpoint','message','invalid-export-ack');const ack=acks.get(data.id);if(ack?.sequence===data.sequence){acks.delete(data.id);data.error?ack.reject(typeof data.error==='object'?deserializeEngineError(data.error):new EngineError('EXPORT_FAILED',String(data.error))):ack.resolve();}return;}
 if(data.action==='cancel'){controller?.abort();for(const ack of acks.values())ack.reject(cancelled());return;}
 // Pixel-window requests and calculations must not race the engine's BUSY guard.
 queue=queue.then(()=>handle(data));return queue;
},{label:'ela-endpoint',onFailure:error=>{if(failed)return;failed=true;controller?.abort();for(const ack of acks.values())ack.reject(error);acks.clear();self.postMessage({fatal:serializeEngineError(error)});}});
