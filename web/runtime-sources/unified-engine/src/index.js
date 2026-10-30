import "../../runtime-context.js?v=0.30.0";
import {equalizationPixels} from './equalization-pixels.js';
import {equalizationPlan} from './equalization-settings.js';
import {equalizationSurface} from './equalization-presentation.js';
import {efficientLoFtrComparisonTask} from './efficient-loftr-comparison-task.js';
import {d2prlUsefulAdmission} from './d2prl-useful-admission.js';
import {registerNeuralWindowEngineBudget} from './neural-window-engine-link.js';
import {nativeUsefulOwner,nativeUsefulCacheKey,nativeUsefulEvidence,supportsNativeUsefulOperation} from './native-useful-operation.js';
import {hasObservedNlmGpuRetirements,drainObservedNlmGpuRetirements} from './observed-nlm-gpu-retirement.js';
import {hasMedianGpuRetirements,drainMedianGpuRetirements} from './median-gpu-retirement.js';
import {computeStoredDoubleJpeg} from './double-jpeg-service.js';
import {createZeroRetainedPreview} from './zero-retained-preview.js';
import {disposeGhostJpegService,hasGhostJpegResources} from './ghost-jpeg-service.js';
import {EnergyScoreGpu} from './energy-score-gpu.js';
import {ENERGY_SCORE_AUTO_ENABLED} from './energy-score-policy.js';
import {disposeJpegGrayCurveService,hasJpegGrayCurveResources,forgetJpegGrayCurvePolicy} from './jpeg-gray-curve-gpu.js';
import {previewCachedResampling} from './resampling-em-preview.js';
import {previewCachedFourier,createFourierPreviewOwner} from './resampling-fourier-preview.js';
import {getElaGpuService,disposeElaGpuService} from './ela-gpu.js';
import {copyTypedArray} from './allocation.js';
import {hasPendingFileGrayOwners,retireFileGrayOwners} from './file-gray-retirement.js';
import {prepareWaveletPreviewHeadroom} from './wavelet-preview-headroom.js';
import {sourceRegionDomainShape} from './source-region-capabilities.js';
import {previewSourceRegionClassic} from './source-region-classic-preview.js';
import{segmentationCapabilityDeclaration,SEGMENTATION_WINDOW_VARIANTS}from'./segmentation-window-capabilities.js';
import {createLearnedSparseWindowRegistration} from './learned-sparse-window-registration.js';
import {createStrictColdNoisesnifferPreview} from './noisesniffer-strict-cold-preview.js';
import {retireFailedRetainedAnswer} from './retained-answer-release.js';
import {borrowRetainedSparseTraceParent} from './retained-sparse-trace-parent.js';
import {renderRetainedNativeTables,assertRetainedNativeRender} from './retained-native-render.js';
import {createSourceRegionGhostPreview} from './source-region-ghost-preview.js';
import {createSourceRegionView} from './source-region-view.js';
import {withRawReadLifetime} from './raw-read-lifetime.js';
import {externalPreviewNativeHeadroom,externalPreviewScopedGradientHeadroom,externalPreviewScopedAdjustHeadroom,externalPreviewScopedEchoHeadroom,externalPreviewScopedFrequencyHeadroom,externalPreviewScopedSeparationHeadroom,externalPreviewScopedMinmaxHeadroom,externalPreviewScopedDefectsHeadroom} from './external-preview-admission.js';
import {sourceRegionCoordinateBytes} from './source-region-localize.js';
import {prepareSourceRegionDomain,sourceRegionTransportBytes} from './source-region-dispatch.js';
import {createExternalMemoryCache} from './external-memory-cache.js';
import {createSourceRegionRuntime} from './source-region-runtime.js';
import {ocrPayloadBytes,validateOcrParams} from './ocr-analyzer.js';
import {previewCachedNoisesniffer} from './noisesniffer-preview.js';
import {previewCachedZero,previewCachedStereo,reservePreview,previewUnavailable,hasCachedPreviewSamples,retireCachedPreviewSamples} from './cached-parameter-preview.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {readDisplayFrame} from './display-sampling.js';
import {rasterPresentation} from './raster-presentation.js';
import {inspectExtendedImage,loadExtendedImage} from './media-image-source.js';
import {isCameraRaw} from './media-format.js';
import {browserMemoryObservation} from './browser-memory.js';
export {browserMemoryObservation,readSystemMemoryHints,readExtensionMemoryHints} from './browser-memory.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {createCloningSurface} from './cloning-surface.js';
import {pagedJpegDctHistograms} from './jpeg-dct-paged.js';
import {doubleJpegAdmission,doubleJpegHistogramResult} from './double-jpeg.js';
import {segmentedAdjust} from './segmented-adjust.js';
import {adjustHeapBytes,releaseAdjustWasm} from './adjust-math.js';
import {segmentedSeparation} from './segmented-separation.js';
import {separationHeapBytes,separationRuntimeState,releaseSeparationWasm} from './separation-math.js';
import {nlmOwnerState} from './nlm-useful-work-contract.js';
import {segmentedMedian} from './segmented-median.js';
import {segmentedContrast} from './segmented-contrast.js';
import {contrastHeapBytes,releaseContrastWasm} from './contrast-math.js';
import {segmentedIlluminant} from './segmented-illuminant.js';
import {AdaptiveConcurrency} from './adaptive-concurrency.js';
import {LiveMemoryPolicy} from './live-memory-policy.js';
import {segmentedEcho} from './segmented-echo.js';
import {echoHeapBytes} from './echo-math.js';
import {segmentedGradient} from './segmented-gradient.js';
import {gradientHeapBytes,releaseGradientWasm} from './gradient-math.js';
import {segmentedColorSpaces} from './segmented-color-spaces.js';
import {withM3Pixels} from './m3-source.js';
import {DENSE_OPERATION,denseCapability} from './dense-adapter.js';
import {M3_OPERATIONS} from './m3-adapter.js';
import {EXTENSION_OPERATIONS,extensionCapabilities,createExtensionsAdapter} from './extensions-adapter.js';
import {readPrnuHdf5Blob,writePrnuHdf5Pages} from './prnu-hdf5-pages.js';
import {retainPrnuArchive,originalPrnuArchive} from './prnu-archive.js';
import {segmentedPlots} from './segmented-plots.js';
import {plotsStreamHeapBytes} from './plots-stream-math.js';
import {segmentedResamplingAnalysis} from './segmented-resampling-analysis.js';
import {segmentedStereogram} from './segmented-stereogram.js';
import {stereoStreamHeapBytes} from './stereo-stream-kernel.js';
import {segmentedNoisesniffer} from './segmented-noisesniffer.js';
import {noisesnifferStreamHeapBytes} from './noisesniffer-stream-math.js';
import {segmentedComparison} from './segmented-comparison.js';
import {segmentedResamplingFourier} from './segmented-resampling.js';
import {FourierViewGpu} from './resampling-fourier-gpu.js';
import {rebaseFourierViewReservation} from './resampling-fourier-view-budget.js';
import {resamplingStreamHeapBytes} from './resampling-stream-math.js';
import {segmentedPrnuIdentification} from './segmented-prnu-identification.js';
import {prnuStreamHeapBytes} from './prnu-stream-math.js';
import {readPrnuStoredDatabase} from './prnu-storage.js';
import {segmentedFrequency} from './segmented-frequency.js';
import {frequencyStreamHeapBytes} from './frequency-stream-math.js';
import {segmentedBlocking} from './segmented-blocking.js';
import {segmentedWavelet} from './segmented-wavelet.js';
import {waveletStreamHeapBytes} from './wavelet-stream-math.js';
import {retireWaveletStripOwners,hasPendingWaveletStripOwners,createWaveletRetirementDiagnostics,appendWaveletCleanup,WaveletStripPool} from './wavelet-strip-pool.js';
import {segmentedPca} from './segmented-pca.js';
import {pcaStreamHeapBytes} from './pca-stream-math.js';
import {createSegmentedThumbnailAnalysis,segmentedThumbnailResult} from './thumbnail-analysis.js';
import {createSegmentedEnergyCache} from './segmented-energy.js';
import {segmentedEnergyResult} from './segmented-energy-result.js';
import {createSegmentedZeroAnalysis,segmentedZeroResult} from './segmented-zero.js';
import {segmentedElaBiomes} from './segmented-ela-biomes.js';
import {segmentedGhostMaps,segmentedGhostShape} from './segmented-ghosts.js';
import {segmentedEla} from './segmented-ela.js';
import {createClassicPreviewCache} from './ela-classic-preview.js';
import {createRasterExports} from './raster-export.js';
import {validateTiffHeader} from './tiff-stream.js';
import {validatePngHeader} from './png-stream.js';
import {inspectTiffSource} from './tiff-header-source.js';
import {inspectPngSource} from './png-header-source.js';
import {inspectExiftool,exiftoolParams} from './exiftool.js';
import {imageHeader} from './image-headers.js';
import {segmentedRecompressionLosses} from './segmented-recompression.js';
import {validateC2paSource} from './c2pa-validation.js';
import {deriveOriginalBytes,deriveOriginalArchive} from './derive-original.js';
import {sourceFileInfo} from './source-file.js';
import {segmentedDefects} from './segmented-defects.js';
import {segmentedMinmax} from './segmented-minmax.js';
import {segmentedMagnifier} from './segmented-magnifier.js';
import {segmentedBitPlanes} from './segmented-planes.js';
import {segmentedPixelStats,createResultSurfaces} from './segmented-results.js';
import {contiguousSurface,loadSegmentedJpeg,loadSegmentedPng,loadSegmentedTiff,disposeSegmentedImage,requireSegmentedOperation} from './image-sources.js';
import {createBlobSource} from './blob-source.js';
import {createOwnedByteSource} from './owned-byte-source.js';
import {inspectJpegBlob,jpegCodec} from './jpeg.js';
import {inspectOriginalJpeg} from './jpeg-source-evidence.js';
import {segmentedHistogram} from './segmented-histogram.js';
import {EngineError,requireValue,checkAbort,checkpoint,createCooperator} from './errors.js';
import {DEFAULT_ELA_PARAMS,DEFAULT_ENERGY_PROFILE,validateParams,validatePixels,elaBase,elaRender} from './ela.js';
import {JPEG_OPTIONS} from './jpeg.js';
import {imageCodec} from './codecs.js';
import {zeroHeapBytes} from './zero.js';
import {waveletHeapBytes} from './wavelets.js';
import {compileMedianModel} from './median-model.js';
import {compileQualityModel} from './quality-model.js';
import {qualityHeapBytes} from './quality-arithmetic.js';
import {resamplingHeapBytes} from './resampling-math.js';
import {cloningHeapBytes} from './cloning-math.js';
import {medianHeapBytes} from './median-features.js';
import {toneTable,fusedCpu} from './ela-lut.js';
import {LutPool} from './lut-pool.js';
import {ZeroPool} from './zero-pool.js';
import {NoisesnifferPool} from './noisesniffer-pool.js';
import {QualityPool} from './quality-pool.js';
import {MedianPool} from './median-pool.js';
import {ResamplingViewPool} from './resampling-view-pool.js';
import {CloningGroupPool} from './cloning-group-pool.js';
import {FrequencyGpu} from './frequency-gpu.js';
import {resolveComputeProfile} from './profiles.js';
export {COMPUTE_PROFILES,resolveComputeProfile} from './profiles.js';
import {Budget} from './cache.js';
import {writePrnuDatabase,prnuHdf5HeapBytes} from './prnu-hdf5.js';
import {buildPrnuStoredSnapshot} from './prnu-stored-builder.js';
import {PIXEL_OPERATIONS,pixelCapabilities,payloadBytes,ownedPayloadBytes,histogramView} from './pixel-operations.js';
export {createElaEnergyControls} from './ela-energy-controls.js';
export {createAnalysisScopeController} from './analysis-scope.js';
export {createCloneCorroboration,colorizeCounts,COUNT_COLORS} from './clone-corroboration.js';
export {annotateRelations,pairRelations,visibleCloneEntries,biomePaintOrder,CLONE_SOURCES,CLASSICAL_SOURCES,AI_SOURCES,ELA_SOURCE} from './clone-relations.js';
export {createAutomaticAnalysisView} from './automatic-analysis-view.js';
export async function createAutomaticAnalyzer(options){return (await import('./automatic-analyzer.js')).createAutomaticAnalyzer(options);}
export {D2PRL_MODEL_IDENTITY} from './d2prl-model-identity.js';
export {SEGMENTATION_MODELS as SEGMENTATION_MODEL_IDENTITIES} from '../experiments/segmentation/models.js';
export {createForgeryscopeAnalyzer} from './forgeryscope-analyzer.js';
import {exportAnalysis,jsonExportBound} from './exports.js';
export {exportAnalysis};
export {pipeRasterExport} from './raster-export-stream.js';
export {EngineError,DEFAULT_ELA_PARAMS,DEFAULT_ENERGY_PROFILE};
const VERSION='0.37.0-methods.1',RUNTIME_RESERVE=32*1024**2;
// These pipelines admit their live arrays while computing. Once compute has
// returned, its scratch lifetimes have ended: transfer existing credit to the
// completed source without either dropping its ownership or reserving it twice.
// The subsequent structuredClone needs exactly one additional owned backing.
function completeScientificWorkspace(reservations,bytes,reserveMemory){
 const admitted=reservations.reduce((sum,release)=>sum+release.bytes,0);
 if(admitted<bytes)reserveMemory(bytes-admitted);
 let remaining=bytes;const source=[];
 for(const release of reservations){const keep=Math.min(remaining,release.bytes);if(keep){source.push(release.split(keep));remaining-=keep;}release();}
 reservations.splice(0,reservations.length,...source);
}
const copyPixels=p=>({...p,data:p.data.slice()});
const sha=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
export function createEngine({memoryBudgetBytes,codec=imageCodec,cpuKernel='auto',computeProfile='aggressive',resourceHints,onTemporarySession,onExternalCacheReclaim,waveletRetirementDiagnostics=false,neuralWindowGpuAvailable=false}={}) {
 const explicitMemoryCeiling=memoryBudgetBytes??Infinity,profile=resolveComputeProfile(computeProfile,resourceHints);memoryBudgetBytes??=profile.memoryBudgetBytes;
 requireValue(Number.isSafeInteger(memoryBudgetBytes)&&memoryBudgetBytes>0,'Positive memory budget required.');
 requireValue(['auto','single','reference'].includes(cpuKernel),'Invalid CPU kernel.');
 requireValue(typeof waveletRetirementDiagnostics==='boolean','Transform diagnostic opt-in must be boolean.');requireValue(typeof neuralWindowGpuAvailable==='boolean','Passive Window GPU capability must be boolean.');let retirementDiagnostics;
 const budget=new Budget(memoryBudgetBytes),images=new Map(),surfaces=new Map(),pool=new LutPool(budget,profile),qualityPool=new QualityPool(budget,profile),zeroPool=new ZeroPool(budget,profile),noisesnifferPool=new NoisesnifferPool(budget,profile),frequencyGpu=new FrequencyGpu(budget,profile),medianPool=new MedianPool(budget,profile),resamplingViewPool=new ResamplingViewPool(budget,profile),cloningGroupPool=new CloningGroupPool(budget,profile);let busy=false,disposed=false,shutdownStarted=false,shutdownTask,shutdownPlan;
 registerNeuralWindowEngineBudget(budget,profile,neuralWindowGpuAvailable);
 const externalMemory=new Map(),externalCaches=createExternalMemoryCache({budget,margin:()=>knownHeapBytes(),retire:request=>{if(typeof onExternalCacheReclaim!=='function')throw new EngineError('UNAVAILABLE','External cache acknowledgement channel is unavailable.');return onExternalCacheReclaim(request);}});
 const classicPreview=createClassicPreviewCache({budget,codec}),elaCachedExecutions=new WeakMap();
 const classicPreviewSourceOwners=new Set();
 async function retireClassicPreviewSources(){let failed=false,primary;for(const owner of [...classicPreviewSourceOwners])try{await owner.dispose();classicPreviewSourceOwners.delete(owner);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
 const execution=getExecutionScheduler(budget,{maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1,maxGpuJobs:computeProfile==='maximum'?2:1});
 const liveMemory=new LiveMemoryPolicy(budget,{profile:computeProfile,ceiling:explicitMemoryCeiling});
 const analysisCodec=codec.workingSetBytes?Object.assign(Object.create(codec),Object.fromEntries(['decode','decodeGray'].filter(method=>typeof codec[method]==='function').map(method=>[method,async(bytes,hooks)=>{
  const extra=codec.workingSetBytes(bytes.byteLength,codec.inspect(bytes)),release=extra?budget.reserve(extra):null;
  try{return await codec[method](bytes,hooks);}finally{release?.();}
 }]))):codec;
 const rasterExports=createRasterExports(budget,{onTemporarySession}),resultSurfaces=createResultSurfaces(surfaces),echoAdaptive=new AdaptiveConcurrency(),separationAdaptive=new AdaptiveConcurrency(),adjustAdaptive=new AdaptiveConcurrency(),segmentedQualityAdaptive=new AdaptiveConcurrency(),segmentedGhostAdaptive=new AdaptiveConcurrency(),segmentedZeroAdaptive=new AdaptiveConcurrency(),segmentedEnergyAdaptive=new AdaptiveConcurrency();
 let d2prl,segmentation,m3,automatic,pagedAkaze,dense,extensions,ocr,ocrConfigurationKey;
 const extensionsAdapter=()=>extensions??=createExtensionsAdapter({budget,scheduler:execution,profile:{...profile,maxWorkers:execution.capacity.cpu,memoryBudgetBytes:budget.limit},version:VERSION,onTemporarySession,publishResult:(id,record)=>resultSurfaces.publishBundle(id,record),releaseSurface:id=>resultSurfaces.release(id)});
 const segmentationAdapter=async()=>segmentation??=((await import('./segmentation-independent-capability.js')).segmentationIndependentProductAvailable()?(await import('./segmentation-product-adapter.js')).createSegmentationProductAdapter({budget,profile:{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},version:VERSION,publishResult:(imageId,record)=>resultSurfaces.publishBundle(imageId,record),releaseSurface:id=>resultSurfaces.release(id)}):(await import('./segmentation-adapter.js')).createSegmentationAdapter({budget,profile:{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},version:VERSION,publishResult:(imageId,record)=>resultSurfaces.publishBundle(imageId,record)}));
 const d2prlAdapter=async()=>d2prl??=(await import('./d2prl-adapter.js')).createD2prlAdapter({budget,profile:{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},version:VERSION,publishResult:(imageId,record)=>resultSurfaces.publishBundle(imageId,record)});
 const knownHeapBytes=()=>Math.max(codec.memoryBytes?.()??0,imageCodec.memoryBytes())+waveletHeapBytes()+zeroHeapBytes()+prnuHdf5HeapBytes()+medianHeapBytes()+qualityHeapBytes()+resamplingHeapBytes()+cloningHeapBytes()+gradientHeapBytes()+echoHeapBytes()+contrastHeapBytes()+separationHeapBytes()+adjustHeapBytes()+pcaStreamHeapBytes()+waveletStreamHeapBytes()+frequencyStreamHeapBytes()+prnuStreamHeapBytes()+resamplingStreamHeapBytes()+noisesnifferStreamHeapBytes()+stereoStreamHeapBytes()+plotsStreamHeapBytes();
 const denseAdapter=async()=>dense??=(await import('./dense-adapter.js')).createDenseAdapter({budget,profile:{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},version:VERSION,publishResult:(id,record)=>resultSurfaces.publish(id,record),releasePublished:id=>resultSurfaces.release(id)});
 const m3Adapter=async()=>m3??=(await import('./m3-adapter.js')).createM3Adapter({budget,profile:{...profile,cpuKernel,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},version:VERSION,publishResult:(id,record)=>resultSurfaces.publish(id,record),sparseWindows:createLearnedSparseWindowRegistration()});
 const ocrAdapter=async configuration=>(await import('./ocr-analyzer.js')).createOcrAnalyzer({budget,profile:{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},configuration});
 const automaticAdapter=async()=>automatic??=(await import('./automatic-runtime.js')).createAutomaticRuntime({budget,profile:{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},version:VERSION,getD2prl:()=>d2prl,getLanguage:()=>m3?.automaticLanguage(),publishResult:(id,record)=>resultSurfaces.publishBundle(id,record),exports:rasterExports,onTemporarySession});
 function alive(){if(disposed)throw new EngineError('DISPOSED','Engine is disposed.');if(shutdownStarted)throw new EngineError(shutdownTask?'BUSY':'DISPOSED','Engine shutdown must finish before this source can be used.');}
 function idle(){alive();if(busy)throw new EngineError('BUSY','Another engine task is active.');}
 function asset(id){alive();const value=images.get(id);if(!value)throw new EngineError('NOT_FOUND','Source not loaded.');return value;}
 function image(id){const im=asset(id);requireValue(im.kind==='image','This source is not an image.');return im;}
 function attachSurface(id,record){record.surface??=contiguousSurface(record.pixels,budget);surfaces.set(record.surface.descriptor.id,{imageId:id,record});return record.surface.descriptor;}
 function identity(id){requireValue(typeof id==='string'&&id.length>0&&id.length<=128&&!id.includes('\0'),'Invalid id.');}
 async function retireRecordOwner(record,key,method='dispose'){const owner=record?.[key];if(typeof owner?.[method]!=='function')return;await owner[method]();if(record[key]===owner)record[key]=null;}
 async function retireComparisonReferenceOwners(id){const reference=images.get(id),pending=[];for(const value of images.values()){const owner=value.comparisonDomainOwner;if(owner&&(owner.reference?.id===id||owner.reference?.surface===reference?.surface))pending.push(retireRecordOwner(value,'comparisonDomainOwner'));}const answers=await Promise.allSettled(pending),failed=answers.find(x=>x.status==='rejected');if(failed)throw failed.reason;}
 const sourceRegions=createSourceRegionRuntime({budget,images,surfaces,resultSurfaces,getImage:image,withBusy:async callback=>{idle();busy=true;try{return await callback();}finally{busy=false;}},runSegmentation:context=>segmentationAdapter().then(adapter=>adapter.runSource(context)),runGeneration:async(task,image,hooks)=>{const batch=await extensionsAdapter().run(task,image,{...hooks,knownHeapBytes:Math.max(RUNTIME_RESERVE,knownHeapBytes()),methods:task.operation==='ai.text.doctamper'?['doctamper']:task.operation==='jpeg.comprint'?['comprint']:task.operation==='ai.generation.spai'?['spai']:['bfree']});const result=batch.results[0];return{...result,metrics:{...batch.metrics,...result.metrics}};},runLegacy:async(task,hooks)=>{const previous=busy;busy=false;try{return await api.run(task,hooks);}finally{busy=previous;}},retireAnalysis:async id=>{const record=images.get(id);const settled=await Promise.allSettled([retireRecordOwner(record,'comparisonDomainOwner'),retireRecordOwner(record,'prnuDomainOwner'),extensions?.clearImages(id),m3?.clearImages(id),dense?.clearImage(id),automatic?.clearImage(id),d2prl?.clearImage(id),segmentation?.clearImage(id),retireRecordOwner(record,'strictDenseOwner')]);const failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;},knownHeapBytes:()=>Math.max(RUNTIME_RESERVE,knownHeapBytes()),version:VERSION,profile,cpuKernel,codec:analysisCodec,pagedAkazeExtract:async(gray,mask,width,height,hooks,im)=>{pagedAkaze??=new (await import('./akaze-paged.js')).PagedAkazeFeatureEngine(budget,{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1});return pagedAkaze.extract({width,height,grayscale:true,data:gray},{historical:true,mask,storageContext:{temporarySession:im.session,getTemporarySession:im.ensureTemporarySession},signal:hooks.signal,onProgress:e=>hooks.onProgress?.(e.fraction)});},accountedPrnuHeapBytes:()=>prnuStreamHeapBytes(),medianPool:cpuKernel==='auto'?medianPool:null,cloningGroupPool:cpuKernel==='auto'?cloningGroupPool:null,referencesFor:task=>{const operation=PIXEL_OPERATIONS[task.operation];if(!operation?.references)return[];const params=operation.validate(task.params),ids=operation.references(params);return ids.map(id=>{identity(id);const value=asset(id);requireValue(value.kind===(operation.referenceKind??'image'),'Reference source has the wrong kind for this operation.');return{id,...value};});}});
 async function runPixels(task,{signal,onProgress}={}){
  const operation=PIXEL_OPERATIONS[task.operation],p=operation.validate(task.params),im=image(task.imageId);
  const referenceIds=operation.references?.(p)??[],references=referenceIds.map(id=>{identity(id);const value=asset(id);requireValue(value.kind===(operation.referenceKind??'image'),'Reference source has the wrong kind for this operation.');if(value.segmented&&!value.pixels)throw new EngineError('UNSUPPORTED_LAYOUT','This reference requires a segmented adapter.');return {id,...value};}),dependencies=referenceIds.length?[task.imageId,...referenceIds]:[];
  const referenceKey=references.length?'/references/'+JSON.stringify(references.map(r=>[r.id,r.sha256])):'';
  const initialHeapBytes=Math.max(RUNTIME_RESERVE,knownHeapBytes()),release=budget.reserve(initialHeapBytes+im.pixels.data.length*operation.scratchFactor+operation.extraBytes+(operation.admissionBytes?.(im.pixels,p,im.bytes)??0));busy=true;
  const workspaceReservations=[],reserveMemory=bytes=>{requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Invalid workspace reservation.');const free=budget.reserve(bytes);workspaceReservations.push(free);return free;},releaseWorkspace=()=>{for(const free of workspaceReservations)free();workspaceReservations.length=0;};
  const backend=task.backend??'auto',start=performance.now(),key=task.imageId+'\0op/'+task.operation+'/'+(operation.backends?backend+'/':'')+JSON.stringify(task.operation==='inspection.histogram'?{}:(operation.cacheParams?.(p)??p))+referenceKey;
  const scientificOwnership=operation.resultMemory==='owned-source-copy';let borrowedCache;
  try{
   await checkpoint(signal);let stored=budget.get(key),result=stored?.value;const cached=!!result;
   const stageCache={};const memo=async(name,compute)=>{const stageKey=task.imageId+'\0stage/'+task.operation+referenceKey+'/'+name,hit=budget.get(stageKey);stageCache[name]=!!hit;if(hit)return hit.value;const value=await compute();checkAbort(signal);budget.put(stageKey,{value,byteLength:payloadBytes(value)},dependencies);return value;};
   const memoMany=async(names,compute,shared=false)=>{const namespace=shared?'jpeg-gray-loss-v1':task.operation+referenceKey;const values=new Map(),missing=[];for(const name of names){const hit=budget.get(task.imageId+'\0stage/'+namespace+'/'+name);stageCache[name]=!!hit;if(hit)values.set(name,hit.value);else missing.push(name);}if(missing.length){const computed=await compute(missing);checkAbort(signal);requireValue(computed.length===missing.length,'Invalid batch result count.');for(let i=0;i<missing.length;i++){values.set(missing[i],computed[i]);budget.put(task.imageId+'\0stage/'+namespace+'/'+missing[i],{value:computed[i],byteLength:payloadBytes(computed[i])},shared?[]:dependencies);}}return names.map(name=>values.get(name));};
   const memoImage=async(name,compute)=>{const stageKey=task.imageId+'\0stage/'+task.operation+'/image-only/'+name,hit=budget.get(stageKey);stageCache[name]=!!hit;if(hit)return hit.value;const value=await compute();checkAbort(signal);budget.put(stageKey,{value,byteLength:payloadBytes(value)});return value;};
   if(!result)result=await operation.compute(im.pixels,p,{signal,onProgress:fraction=>onProgress?.({id:task.id,phase:'kernel',fraction}),onGpuSubmitted:detail=>onProgress?.({id:task.id,...detail})},{bytes:im.bytes,sourceFile:im.sourceFile,sourceSha256:im.sha256,references,extractThumbnail:()=>inspectExiftool(im.blob??im.bytes,{mode:'thumbnail'},{budget,signal,expectedSha256:im.sha256,onProgress:fraction=>onProgress?.({id:task.id,phase:'thumbnail-extraction',fraction})}),codec:analysisCodec,memo,memoMany,memoImage,memoJpegLosses:(names,compute)=>memoMany(names,compute,true),reserveMemory,backend,cpuKernel,pagedAkazeExtract:async(gray,mask,width,height,hooks)=>{pagedAkaze??=new (await import('./akaze-paged.js')).PagedAkazeFeatureEngine(budget,{...profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1});return pagedAkaze.extract({width,height,grayscale:true,data:gray},{historical:true,mask,storageContext:{temporarySession:im.session,getTemporarySession:im.ensureTemporarySession},signal:hooks.signal,onProgress:e=>hooks.onProgress?.(e.fraction)});},cloningGroupPool:cpuKernel==='auto'?cloningGroupPool:null,zeroPool:cpuKernel==='auto'?zeroPool:null,noisesnifferPool:cpuKernel==='auto'||backend==='webgpu'?noisesnifferPool:null,frequencyGpu:backend!=='cpu'&&(cpuKernel==='auto'||backend==='webgpu')?frequencyGpu:null,medianPool:cpuKernel==='auto'?medianPool:null,qualityPool:codec===imageCodec&&cpuKernel==='auto'?qualityPool:null,ghostJpegGpu:codec===imageCodec&&cpuKernel!=='reference',jpegGrayGpu:codec===imageCodec&&cpuKernel!=='reference',energyScoreGpu:task.operation==='ela.energy'&&(backend==='webgpu'||ENERGY_SCORE_AUTO_ENABLED&&backend==='auto')&&cpuKernel!=='reference'?()=>im.energyScoreGpu??=new EnergyScoreGpu(budget):null,budget,profile});
   checkAbort(signal);const resultBytes=scientificOwnership?ownedPayloadBytes(result):payloadBytes(result);
   if(scientificOwnership){
    // A cache eviction cannot retire arrays still used by this copy. Taking its
    // owner and pinning the same bytes are synchronous, with no allocation or
    // asynchronous admission gap. Restore the entry even if cloning is aborted.
    if(cached){borrowedCache=budget.take(key);reserveMemory(resultBytes);}
    // Codec/scoring heaps may have grown inside the admitted kernel envelope.
    // They outlive scratch, so carry their actual growth through publication.
    completeScientificWorkspace(workspaceReservations,resultBytes+Math.max(0,knownHeapBytes()-initialHeapBytes),reserveMemory);
    reserveMemory(resultBytes);
   }else if(operation.dynamicResultBudget)reserveMemory(resultBytes*3);
   const owned=structuredClone(result);delete owned.engineMetrics;if(task.operation==='inspection.histogram')histogramView(owned,p);
   if(task.operation==='tampering.resampling.fourier'&&backend==='webgpu'&&cpuKernel!=='reference')rebaseFourierViewReservation({budget,reservation:release,workspaces:workspaceReservations,knownHeapBytes:knownHeapBytes(),resultBytes,ownedBytes:payloadBytes(owned),pixels:owned.data.geometry.outputSide**2});
   const viewStart=performance.now(),viewMetrics=operation.view?await operation.view(owned,p,{signal},{image:im.pixels,resamplingViewPool:cpuKernel==='auto'?resamplingViewPool:null,...(task.operation==='tampering.resampling.fourier'?{backend:cpuKernel==='reference'?'cpu':backend,fourierViewGpu:backend==='webgpu'&&cpuKernel!=='reference'?(im.fourierPresentationGpu??=new FourierViewGpu(budget)):null}:{})}):null;const viewMs=performance.now()-viewStart;checkAbort(signal);
   const provenance={engine:VERSION,operation:task.operation,params:p,backend:(task.operation==='tampering.resampling.fourier'?viewMetrics?.backend:undefined)??result.engineMetrics?.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:operation.native,...(references.length?{references:references.map(r=>r.kind==='image'?{imageId:r.id,originalSha256:r.sha256,decode:structuredClone(r.provenance)}:{id:r.id,kind:r.kind,originalSha256:r.sha256,...structuredClone(r.provenance)})}:{}),kernelParity:operation.parity??'bit-exact pixels/masks on synthetic native fixtures; see fixtures/pixel-reference.json',semantics:result.semantics};
   onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);
   releaseWorkspace();release();if(!cached||borrowedCache)budget.put(key,borrowedCache??{value:result,byteLength:resultBytes},dependencies);borrowedCache=null;
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...owned,layers:owned.layers??(owned.pixels?[{id:task.operation,kind:'rgb',origin:[0,0],range:[0,255]}]:[]),provenance,metrics:{totalMs:performance.now()-start,cache:{result:cached,...(Object.keys(stageCache).length?{stages:stageCache}:{}),...(operation.view?{analysis:cached,view:false}:{})},kernel:'cpu-reference',workers:cached&&!operation.view?0:1,...(cached?{}:result.engineMetrics),...(operation.view?{viewMs}:{}),...(task.operation==='tampering.resampling.fourier'?viewMetrics:{}),memory:{...budget.snapshot(),codecHeapCapacityBytes:(codec.memoryBytes?.()??0)+waveletHeapBytes()+zeroHeapBytes(),hdf5HeapCapacityBytes:prnuHdf5HeapBytes(),medianHeapCapacityBytes:medianHeapBytes(),qualityHeapCapacityBytes:qualityHeapBytes(),resamplingHeapCapacityBytes:resamplingHeapBytes(),cloningHeapCapacityBytes:cloningHeapBytes()}}};
  }finally{releaseWorkspace();release();if(borrowedCache)budget.put(key,borrowedCache,dependencies);busy=false;}
 }
 async function readSurfaceWindow({surfaceId,revision,rect},format,{signal}={}){
   idle();const entry=surfaces.get(surfaceId);if(!entry)throw new EngineError('NOT_FOUND','Pixel surface no longer exists.');requireValue((Array.isArray(format)?format:[format]).includes(entry.record.surface.descriptor.format),'Use the matching RGB, numeric, mask or flag window API.');requireValue(revision===entry.record.surface.descriptor.revision,'Stale pixel surface revision.');busy=true;let window,resident;
   try{resident=budget.reserve(knownHeapBytes());window=await entry.record.surface.readWindow(rect,{signal});const {release,...result}=window;return {...result,imageId:entry.imageId,metrics:{outboundBytes:result.pixels.data.byteLength,memory:budget.snapshot()}};}finally{window?.release();resident?.();busy=false;}
 }
 async function readTablePage({tableId,revision,...range},csv,{signal}={}){
  idle();const entry=surfaces.get(tableId);if(!entry)throw new EngineError('NOT_FOUND','Result table no longer exists.');
  const table=entry.record.surface;requireValue(['uint32-table','float64-table','float32-table'].includes(table.descriptor.format),'Use the matching table or pixel API.');requireValue(revision===table.descriptor.revision,'Stale table revision.');busy=true;let page,resident;
  try{resident=budget.reserve(knownHeapBytes());page=await table[csv?'readCsv':'readRows'](range,{signal});const {release,...result}=page;return {...result,imageId:entry.imageId,metrics:{outboundBytes:(result.bytes??result.data).byteLength,memory:budget.snapshot()}};}
  finally{page?.release();resident?.();busy=false;}
 }
 async function runSegmentedJpegCurve(task,im,{signal,onProgress}){
  const operation=PIXEL_OPERATIONS[task.operation],p=operation.validate(task.params),references=p.modelId?[{id:p.modelId,...asset(p.modelId)}]:[];
  if(references.length)requireValue(references[0].kind==='jpeg-quality-model','A JPEG-quality model is required.');
  busy=true;let resident;const started=performance.now(),stagePrefix=task.imageId+'\0stage/';
  try{
   resident=budget.reserve(knownHeapBytes()+128*1024+65536);let cacheHits=0;
   const context={references,jpegHeader:task.operation==='jpeg.quality'?await inspectOriginalJpeg(im,{signal}):null,
    memoImage:async(name,compute)=>{const key=stagePrefix+task.operation+'/image-only/'+name,hit=budget.get(key);if(hit){cacheHits++;return hit.value;}const value=await compute();checkAbort(signal);budget.put(key,{value,byteLength:payloadBytes(value)});return value;},
    segmentedLosses:async(qualities,hooks)=>{
     const values=new Map(),missing=[];for(const q of qualities){const hit=budget.get(stagePrefix+'jpeg-gray-loss-v1/'+(q===0&&cpuKernel!=='reference'&&codec===imageCodec?1:q));if(hit){values.set(q,hit.value);cacheHits++;}else missing.push(q);}
     let metrics={workers:0,recompressions:0,kernel:'jpeg-recompression-cached'};
     if(missing.length){const result=await segmentedRecompressionLosses(im.surface,missing,{image:im,budget,signal,backend:task.backend??'auto',gpuAllowed:cpuKernel!=='reference'&&codec===imageCodec,profile,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1,adaptive:segmentedQualityAdaptive,onProgress:f=>hooks.onProgress?.((qualities.length-missing.length+f*missing.length)/qualities.length),onQuality:(q,value)=>{values.set(q,value);budget.put(stagePrefix+'jpeg-gray-loss-v1/'+q,{value,byteLength:8});}});metrics=result.metrics;}
     return {raw:Float64Array.from(qualities,q=>values.get(q)),metrics};
    }};
   const result=await operation.compute(im.surface.descriptor,p,{signal,onProgress:fraction=>onProgress?.({id:task.id,phase:'jpeg-scanlines',fraction})},context);checkAbort(signal);
   const owned=structuredClone(result);delete owned.engineMetrics;onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...owned,layers:[],provenance:{engine:VERSION,operation:task.operation,params:p,originalSha256:im.sha256,decode:structuredClone(im.provenance),native:operation.native,kernelParity:'Global scanline JPEG curve qualified against native losses; see docs/JPEG-RECOMPRESSION.md',backend:result.engineMetrics?.backend??'cpu',layout:'segmented',semantics:result.semantics,...(references.length?{references:references.map(r=>({id:r.id,originalSha256:r.sha256}))}:{})},metrics:{...result.engineMetrics,totalMs:performance.now()-started,cache:{result:false,scalarHits:cacheHits},memory:budget.snapshot()}};
  }finally{resident?.();busy=false;}
 }
 async function runExiftool(task,im,{signal,onProgress}){
  const params=exiftoolParams(task.params);busy=true;let resident;const started=performance.now();
  try{
   resident=budget.reserve(knownHeapBytes());
   const source=im.segmented?im.source.blob():(im.blob??im.bytes);
   const result=await inspectExiftool(source,params,{budget,signal,expectedSha256:im.sha256,onProgress:fraction=>onProgress?.({id:task.id,phase:'exiftool',fraction})});
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',data:result.data,warnings:result.warnings,layers:[],provenance:{engine:VERSION,operation:task.operation,originalSha256:im.sha256,native:'ExifTool 13.55',backend:'cpu',input:'original-bytes',params,sourceFile:structuredClone(im.sourceFile),semantics:result.semantics},metrics:{...result.metrics,totalMs:performance.now()-started,memory:budget.snapshot()}};
  }finally{resident?.();busy=false;}
 }
 async function runC2pa(task,im,{signal,onProgress}){
  const params=PIXEL_OPERATIONS[task.operation].validate(task.params);busy=true;let resident;const started=performance.now();
  try{
   resident=budget.reserve(knownHeapBytes());
   const original=im.originalSource??im,source=original.segmented?original.source.blob():(original.bytes??original.blob);
   const result=await validateC2paSource(source,params,{budget,sourceSha256:original.sha256,sourceIntegrity:original.source?.integrity?.(),signal,onProgress:fraction=>onProgress?.({id:task.id,phase:'c2pa-validation',fraction})});
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',data:result.data,layers:[],provenance:{engine:VERSION,operation:task.operation,originalSha256:im.sha256,native:PIXEL_OPERATIONS[task.operation].native,backend:'cpu',input:'original-bytes',layout:im.segmented?'segmented':'contiguous',params:{trustConfigured:params.trustAnchors!==null,trustSha256:result.data.metadata.trust_sha256??null},semantics:result.semantics},metrics:{...result.metrics,totalMs:performance.now()-started,memory:budget.snapshot()}};
  }finally{resident?.();busy=false;}
 }
 async function runPagedJpegEvidence(task,im,{signal,onProgress}){
  const operation=PIXEL_OPERATIONS[task.operation],p=operation.validate(task.params),key=task.imageId+'\0paged-jpeg-evidence',started=performance.now();
  const source=im.segmented?im.source:{byteLength:im.bytes.length,async read(offset,length,{signal}={}){checkAbort(signal);return {bytes:im.bytes.subarray(offset,offset+length),release(){}};}};
  let resident;busy=true;
  try{
   resident=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes()));checkAbort(signal);
   let result=budget.get(key)?.value;const cached=!!result;
   if(!result){
    const old=im.doubleJpegOwner;await old?.dispose();if(im.doubleJpegOwner===old)im.doubleJpegOwner=null;result=await computeStoredDoubleJpeg(im,{budget,signal,started,onTemporarySession,onOwner:owner=>{im.doubleJpegOwner=owner;},onProgress:event=>onProgress?.({id:task.id,...event})});
   }
   checkAbort(signal);const owned=structuredClone(result);onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);
   if(!cached)budget.put(key,{value:result,byteLength:payloadBytes(result)});
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...owned,provenance:{engine:VERSION,operation:task.operation,params:p,backend:'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:operation.native,kernelParity:operation.parity,input:'original-stored-jpeg-coefficients',layout:im.segmented?'segmented':'contiguous',semantics:result.semantics},metrics:{...result.engineMetrics,nativeAnalysisCalls:cached?0:1,totalMs:performance.now()-started,workers:cached?0:1,cache:{result:cached},memory:budget.snapshot()}};
  }finally{resident?.();busy=false;}
 }
 async function runOriginalBytes(task,im,p,{signal,onProgress}){
  const operation=PIXEL_OPERATIONS[task.operation],key=task.imageId+'\0source-bytes/'+task.operation+'/'+JSON.stringify(p),started=performance.now();let release,outputRelease;busy=true;
  try{
   // Hash-WASM state allowance is separate from JPEG/other known heap capacity.
   // Window staging and the defensive output copy fit the smaller hex allowance.
   release=budget.reserve(knownHeapBytes()+(task.operation==='file.digest'?32*1024**2:task.operation==='metadata.structure'?4*1024**2:256*1024));checkAbort(signal);
   let result=budget.get(key)?.value;const cached=!!result,stageCache={};
   const memo=async(name,compute)=>{const stageKey=task.imageId+'\0stage/'+task.operation+'/'+name,hit=budget.get(stageKey);stageCache[name]=!!hit;if(hit)return hit.value;const value=await compute();checkAbort(signal);budget.put(stageKey,{value,byteLength:payloadBytes(value)});return value;};
   if(!result)result=await operation.compute(null,p,{signal,onProgress:fraction=>onProgress?.({id:task.id,phase:p.imageHashes&&fraction>=.8?'perceptual-hashes':'original-bytes',fraction})},im.segmented?{source:im.source,sourceFile:im.sourceFile,sourceSha256:im.originalEncodedChannel?.sha256??im.sha256,surface:p.imageHashes?im.surface:undefined,memo,reserveMemory:n=>budget.reserve(n)}:{bytes:im.bytes,sourceFile:im.sourceFile,sourceSha256:im.originalEncodedChannel?.sha256??im.sha256,memo});
   checkAbort(signal);if(task.operation==='metadata.structure')outputRelease=budget.reserve(payloadBytes(result)*3);const owned=structuredClone(result);onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);
   outputRelease?.();outputRelease=null;release();release=null;if(!cached)budget.put(key,{value:result,byteLength:payloadBytes(result)});
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...owned,layers:[],provenance:{engine:VERSION,operation:task.operation,params:p,backend:'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:operation.native,kernelParity:task.operation==='metadata.structure'?operation.parity:task.operation==='file.digest'?(p.imageHashes?'Ten original-byte and six native perceptual hashes; bounded row preparation, see docs/DIGEST-STREAM.md':'Ten original-byte digests matched against independent streaming hashes'):'Original-byte window copied exactly',input:p.imageHashes?'original-bytes-and-rgb8':'original-bytes',layout:im.segmented?'segmented':'contiguous',semantics:result.semantics},metrics:{...result.engineMetrics,totalMs:performance.now()-started,workers:cached?0:1,cache:{result:cached,...(task.operation==='file.digest'?{stages:stageCache}:{})},memory:budget.snapshot()}};
  }finally{outputRelease?.();release?.();busy=false;}
 }
 async function runSegmentedThumbnail(task,im,{signal,onProgress}={}){
  idle();const operation=PIXEL_OPERATIONS['metadata.thumbnail'],p=operation.validate(task.params),started=performance.now();busy=true;let resident,record,published=false;
  try{resident=budget.reserve(knownHeapBytes());const cached=!!im.thumbnailAnalysis;if(!cached)im.thumbnailAnalysis=await createSegmentedThumbnailAnalysis(im,{budget,signal,onProgress:e=>onProgress?.({id:task.id,...e})});record=await segmentedThumbnailResult(im.thumbnailAnalysis,{budget});const provenance={engine:VERSION,operation:'metadata.thumbnail',params:p,backend:'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:'ExifTool 13.55 ThumbnailImage + native thumbnail.py',layout:'segmented',semantics:record.semantics};
   onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);const bundle=record.surface?resultSurfaces.publishBundle(task.imageId,record):{};published=true;
   return {id:task.id,imageId:task.imageId,operation:'metadata.thumbnail',status:'ok',...(record.surface?{layout:'surface',...bundle}:{}),data:record.data,layers:record.surface?[{id:'thumbnail-resized',kind:'rgb',surfaceId:bundle.surface.id,origin:[0,0],range:[0,255]},{id:'thumbnail-difference',kind:'rgb',surfaceId:bundle.rgbSurfaces.difference.id,origin:[0,0],range:[0,255]}]:[],semantics:record.semantics,provenance,metrics:{...(cached?{workers:0}:im.thumbnailAnalysis.metrics),cache:{analysis:cached,result:false},temporaryBackend:im.session?.backend??null,totalMs:performance.now()-started,memory:budget.snapshot()}};
  }catch(error){if(record?.surface&&!published)await Promise.allSettled([record.surface.dispose(),...Object.values(record.rgbRecords).map(r=>r.surface.dispose())]);throw error;}finally{resident?.();busy=false;}
 }
 async function runSegmentedEnergy(task,im,{signal,onProgress}={}){
  idle();const operation=PIXEL_OPERATIONS['ela.energy'],p=operation.validate(task.params),started=performance.now();busy=true;let resident,record,published=false;
  try{resident=budget.reserve(knownHeapBytes());im.energyCache??=createSegmentedEnergyCache(im,budget,{maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1,adaptive:segmentedEnergyAdaptive});const computed=await im.energyCache.analyze(p,{signal,scoreBackend:task.backend??'auto',scoreGpu:(task.backend==='webgpu'||ENERGY_SCORE_AUTO_ENABLED&&(task.backend??'auto')==='auto')&&cpuKernel!=='reference'?(im.energyScoreGpu??=new EnergyScoreGpu(budget)):null,onProgress:e=>onProgress?.({id:task.id,...e})});record=await segmentedEnergyResult(computed.analysis,{budget});
   const provenance={engine:VERSION,operation:'ela.energy',params:p,backend:computed.metrics.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:operation.native,layout:'segmented',kernelParity:'Every scientific array and region exact on 51 native complete pipelines',semantics:record.semantics};record.provenance=structuredClone(provenance);for(const child of Object.values(record.planeRecords))child.provenance=record.provenance;
   onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);const bundle=resultSurfaces.publishBundle(task.imageId,record);published=true;const planes={energy_low_score:bundle.surface,...bundle.planeSurfaces};
   return {id:task.id,imageId:task.imageId,operation:'ela.energy',status:'ok',layout:'surface',...bundle,planeSurfaces:planes,data:record.data,layers:[{id:'energy-low',kind:'scalar',surfaceId:planes.energy_low_score.id,origin:[0,0],width:record.data.width,height:record.data.height},{id:'energy-high',kind:'scalar',surfaceId:planes.energy_high_score.id,origin:[0,0],width:record.data.width,height:record.data.height},{id:'energy-regions',kind:'labels',surfaceId:planes.energy_labels.id,origin:[0,0],width:record.data.width,height:record.data.height}],semantics:record.semantics,provenance,metrics:{...computed.metrics,temporaryBackend:im.session?.backend??null,totalMs:performance.now()-started,memory:budget.snapshot()}};
  }catch(error){if(record&&!published)await Promise.allSettled([record.surface.dispose(),...Object.values(record.planeRecords).map(r=>r.surface.dispose())]);throw error;}finally{resident?.();busy=false;}
 }
 async function runSegmentedZero(task,im,{signal,onProgress}={}){
  idle();const operation=PIXEL_OPERATIONS['jpeg.zero'],p=operation.validate(task.params),started=performance.now();busy=true;let resident,record,published=false;
  try{resident=budget.reserve(knownHeapBytes());const cached=im.zeroAnalysis?.missingEnabled===p.missing;
   if(!cached){const old=im.zeroAnalysis;await old?.dispose();if(im.zeroAnalysis===old)im.zeroAnalysis=null;im.zeroAnalysis=await createSegmentedZeroAnalysis(im,p,{budget,signal,reference:cpuKernel==='reference',maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1,adaptive:segmentedZeroAdaptive,backend:cpuKernel==='reference'?'cpu':task.backend??'auto',onOwner:value=>{im.zeroAnalysis=value;},onProgress:e=>onProgress?.({id:task.id,...e})});}
   record=await segmentedZeroResult(im.zeroAnalysis,p,{budget});record.provenance={engine:VERSION,operation:'jpeg.zero',params:p,backend:im.zeroAnalysis.metrics.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:operation.native,layout:'segmented',kernelParity:'Native compact votes, global components/significance and closing on declared corpus',semantics:record.semantics};onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);const bundle=resultSurfaces.publishBundle(task.imageId,record);published=true;
   return {id:task.id,imageId:task.imageId,operation:'jpeg.zero',status:'ok',layout:'surface',...bundle,data:record.data,layers:[{id:'zero-view',kind:'rgb',surfaceId:bundle.surface.id,origin:[0,0],range:[0,255]},...Object.entries(bundle.maskSurfaces).map(([id,mask])=>({id,kind:'mask',surfaceId:mask.id,origin:[0,0],range:mask.range,semantics:mask.semantics}))],semantics:record.semantics,provenance:record.provenance,metrics:{...(cached?{kernel:'cached-zero-global',workers:0}:im.zeroAnalysis.metrics),cache:{analysis:cached,result:false},temporaryBackend:im.session?.backend??null,totalMs:performance.now()-started,memory:budget.snapshot()}};
  }catch(error){if(record&&!published)await Promise.allSettled([record.surface.dispose(),...Object.values(record.maskRecords).map(r=>r.surface.dispose())]);throw error;}finally{resident?.();busy=false;}
 }
 async function runSegmentedBiomes(task,im,{signal,onProgress}={}){
  idle();const operation=PIXEL_OPERATIONS['ela.biomes'],p=operation.validate(task.params),prefix=task.imageId+'\0segmented/ela-biomes/',key=prefix+JSON.stringify(p),ghostPrefix=task.imageId+'\0segmented/ghost/plane/',started=performance.now(),releases=[];busy=true;
  const reserveMemory=n=>{const free=budget.reserve(n);releases.push(free);return free;},stageCache={},memo=async(name,compute)=>{const hit=budget.get(prefix+'stage/'+name);stageCache[name]=!!hit;if(hit)return hit.value;const value=await compute();checkAbort(signal);budget.put(prefix+'stage/'+name,{value,byteLength:payloadBytes(value)});return value;},memoMany=async(names,compute)=>{const values=new Map(),missing=[];for(const name of names){const hit=budget.get(prefix+'stage/'+name);stageCache[name]=!!hit;if(hit)values.set(name,hit.value);else missing.push(name);}if(missing.length){const computed=await compute(missing);checkAbort(signal);for(let i=0;i<missing.length;i++){values.set(missing[i],computed[i]);budget.put(prefix+'stage/'+missing[i],{value:computed[i],byteLength:payloadBytes(computed[i])});}}return names.map(name=>values.get(name));};
  let borrowedCache,resident,initialHeapBytes;
  try{
   initialHeapBytes=knownHeapBytes();resident=budget.reserve(initialHeapBytes);const hit=budget.get(key);let result=hit?.value;
   if(!result)result=await segmentedElaBiomes(im,p,{budget,signal,backend:cpuKernel==='reference'?'cpu':(task.backend??'auto'),cpuKernel,reserveMemory,memo,memoMany,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1,adaptive:segmentedGhostAdaptive,onProgress:e=>onProgress?.({id:task.id,...e}),getGhostPlane:(x,y,q)=>budget.get(ghostPrefix+x+'/'+y+'/'+q)?.value,putGhostPlane:(x,y,q,value)=>budget.put(ghostPrefix+x+'/'+y+'/'+q,{value,byteLength:value.byteLength})});
   checkAbort(signal);const resultBytes=ownedPayloadBytes(result);if(hit){borrowedCache=budget.take(key);reserveMemory(resultBytes);}
   completeScientificWorkspace(releases,resultBytes+Math.max(0,knownHeapBytes()-initialHeapBytes),reserveMemory);reserveMemory(resultBytes);
   const owned=structuredClone(result);delete owned.engineMetrics;onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);for(const free of releases)free();resident();if(!hit||borrowedCache)budget.put(key,borrowedCache??{value:result,byteLength:resultBytes});borrowedCache=null;
   return {id:task.id,imageId:task.imageId,operation:'ela.biomes',status:'ok',...owned,provenance:{engine:VERSION,operation:'ela.biomes',params:p,backend:result.engineMetrics?.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:operation.native,layout:'segmented',kernelParity:operation.parity,semantics:result.semantics},metrics:{...(hit?{workers:0,cellRecompressions:0,ghostPhasesComputed:0,kernel:'cached-ela-cells'}:result.engineMetrics),cache:{result:!!hit,stages:stageCache},totalMs:performance.now()-started,memory:budget.snapshot()}};
  }finally{for(const free of releases)free();resident?.();if(borrowedCache)budget.put(key,borrowedCache);busy=false;}
 }
 async function runSegmentedGhost(task,im,{signal,onProgress}={}){
  idle();const operation=PIXEL_OPERATIONS['jpeg.ghosts'],p=operation.validate(task.params),shape=segmentedGhostShape(im,p);busy=true;let release;const started=performance.now(),prefix=task.imageId+'\0segmented/ghost/',key=prefix+'cube/'+JSON.stringify([p.low,p.high,p.step,p.x,p.y]);
  try{release=budget.reserve(knownHeapBytes()+shape.admissionBytes);const hit=budget.get(key);let result=hit?.value;
   if(!result)result=await segmentedGhostMaps(im,p,{budget,signal,backend:cpuKernel==='reference'?'cpu':(task.backend??'auto'),maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1,adaptive:segmentedGhostAdaptive,onProgress:e=>onProgress?.({id:task.id,...e}),getPlane:q=>budget.get(prefix+'plane/'+p.x+'/'+p.y+'/'+q)?.value,putPlane:(q,value)=>budget.put(prefix+'plane/'+p.x+'/'+p.y+'/'+q,{value,byteLength:value.byteLength})});
   checkAbort(signal);const owned=structuredClone(result);delete owned.engineMetrics;await operation.view(owned,p,{signal},{surface:im.surface.descriptor});onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);release();release=null;if(!hit)budget.put(key,{value:result,byteLength:payloadBytes(result)});
   return {id:task.id,imageId:task.imageId,operation:'jpeg.ghosts',status:'ok',...owned,provenance:{engine:VERSION,operation:'jpeg.ghosts',params:p,backend:result.engineMetrics?.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:operation.native,layout:'segmented',kernelParity:'Exact global RGB JPEG, NumPy block reduction and per-cell normalization on declared native corpus',semantics:result.semantics},metrics:{...(hit?{workers:0,kernel:'cached-ghost-grid',recompressions:0,qualityPlanesComputed:0}:result.engineMetrics),cache:{analysis:!!hit,result:!!hit,view:false,...(!hit?{stages:result.engineMetrics.stages}:{})},totalMs:performance.now()-started,memory:budget.snapshot()}};
  }finally{release?.();busy=false;}
 }
 async function runSegmentedEla(task,im,{signal,onProgress}={}){
  idle();const p=validateParams(task.params);busy=true;let resident,record,published=false;const started=performance.now(),key=task.imageId+'\0segmented/ela-lut/'+p.scale+'/'+p.contrast+'/'+p.linear;
  try{resident=budget.reserve(knownHeapBytes());record=await segmentedEla(im,p,{budget,signal,onProgress:event=>onProgress?.({id:task.id,...event}),table:budget.get(key),saveTable:table=>budget.put(key,table),backend:cpuKernel==='reference'?'cpu':task.backend??'auto',createPreviewCapture:()=>classicPreview.beginCapture(task.imageId,im,p)});checkAbort(signal);onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);const surface=resultSurfaces.publish(task.imageId,record);published=true;
   return {id:task.id,imageId:task.imageId,operation:'ela.classic',status:'ok',layout:'surface',surface,layers:[{id:'ela.classic',kind:'rgb',surfaceId:surface.id,origin:[0,0],range:[0,255]}],semantics:record.semantics,provenance:{engine:VERSION,operation:'ela.classic',params:p,backend:record.metrics.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),codec:{id:'libjpeg-turbo-3.0.3/emscripten-4.0.15/rgb-scanlines-v1',options:{...JPEG_OPTIONS,quality:p.quality}},kernelParity:'Native global JPEG and exact existing ELA lookup on declared corpus; no independent strip recompression',layout:'segmented',semantics:record.semantics},metrics:{...record.metrics,cache:{recompressed:record.metrics.recompressedCache,table:record.metrics.tableCached,result:false},temporaryBackend:im.session?.backend??null,totalMs:performance.now()-started,memory:budget.snapshot()}};
  }catch(error){if(record&&!published)await record.surface.dispose();throw error;}finally{resident?.();busy=false;}
 }
 async function runSegmentedComparison(task,im,p,{signal,onProgress}){
  const operation=PIXEL_OPERATIONS[task.operation],ids=operation.references(p);ids.forEach(identity);const reference=image(ids[0]);
  busy=true;let resident,record,published=false;const started=performance.now();
  try{
   resident=budget.reserve(knownHeapBytes());const owner=im.segmented?im:{...im,get session(){return reference.session;},ensureTemporarySession:reference.ensureTemporarySession};
   record=await segmentedComparison(owner,p,{reference,budget,signal,backend:task.backend??'auto',cache:im.comparisonCache,cacheKey:task.imageId+'\0comparison-raw/',cacheDependencies:[task.imageId,...ids],original:cpuKernel==='reference',profile:{maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},onProgress:f=>onProgress?.({id:task.id,...f,fraction:f.completed/f.total})});checkAbort(signal);im.comparisonCache=record.comparisonCache;
   record.pairedSourceIds=[task.imageId,...ids];const surface=resultSurfaces.publish(task.imageId,record);published=true;
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',surface,data:record.data,layers:[{id:p.view,kind:'rgb',surfaceId:surface.id,origin:[0,0],range:[0,255]}],semantics:record.semantics,provenance:{engine:VERSION,operation:task.operation,params:p,backend:record.metrics?.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:operation.native,references:[{imageId:ids[0],originalSha256:reference.sha256,decode:structuredClone(reference.provenance)}],kernelParity:operation.parity,layout:'segmented'},metrics:{...record.metrics,totalMs:performance.now()-started,temporaryBackend:owner.session?.backend??null,memory:budget.snapshot()}};
  }catch(error){if(record&&!published)await record.surface.dispose();throw error;}finally{resident?.();busy=false;}
 }
 async function runSegmentedPlots(task,im,p,{signal,onProgress}){
  busy=true;let resident,record,published=false;const started=performance.now(),previous=im.plotsCache;
  try{
   resident=budget.reserve(knownHeapBytes()-plotsStreamHeapBytes());record=await segmentedPlots(im,p,{budget,signal,cache:previous,original:cpuKernel==='reference',profile:{maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},onProgress:f=>onProgress?.({id:task.id,...f,fraction:f.completed/f.total})});checkAbort(signal);
   const table=resultSurfaces.publish(task.imageId,record);published=true;im.plotsCache=record.plotsCache;if(previous!==im.plotsCache)await previous?.dispose();
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'table',tables:{values:table},data:record.data,layers:[],semantics:record.semantics,provenance:{engine:VERSION,operation:task.operation,params:p,backend:'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:PIXEL_OPERATIONS[task.operation].native,layout:'segmented',kernelParity:'Native pyrDown and RGB/HSV float32 arrays exact on qualified corpus'},metrics:{...record.metrics,totalMs:performance.now()-started,memory:budget.snapshot()}};
  }catch(error){if(record&&!published){await record.surface.dispose();if(record.plotsCache!==previous)await record.plotsCache.dispose();}throw error;}finally{resident?.();busy=false;}
 }
 async function runSegmentedPrnu(task,im,p,{signal,onProgress}){
  const operation=PIXEL_OPERATIONS[task.operation],ids=operation.references(p);ids.forEach(identity);const reference=asset(ids[0]);requireValue(reference.kind==='prnu-database','Reference source is not a PRNU database.');
  busy=true;let resident,record;const started=performance.now();
  try{
   resident=budget.reserve(knownHeapBytes()-prnuStreamHeapBytes());record=await segmentedPrnuIdentification(im,p,{budget,database:reference.database,signal,backend:task.backend??'auto',cache:im.prnuCache,profile:{maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},onProgress:f=>onProgress?.({id:task.id,...f,fraction:f.completed/f.total})});checkAbort(signal);im.prnuCache=record.prnuCache;
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',data:record.data,layers:[],semantics:record.semantics,provenance:{engine:VERSION,operation:task.operation,params:p,backend:record.metrics.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:operation.native,references:[{id:ids[0],kind:reference.kind,originalSha256:reference.sha256,...structuredClone(reference.provenance)}],kernelParity:record.metrics.backend==='webgpu'?'Same zero-padded3x3 Wiener correlations onGPU with native global noise/NCC and decision refinement; numerical maximum error qualified within1e-4':'Pinned complete-axis pocketfft and global Wiener/NCC reductions preserve native binary64 on qualified corpus',layout:'segmented'},metrics:{...record.metrics,totalMs:performance.now()-started,temporaryBackend:im.session?.backend??null,cache:{residual:record.metrics.residualCached},memory:budget.snapshot()}};
  }catch(error){if(record?.prnuCache&&record.prnuCache!==im.prnuCache)await record.prnuCache.dispose();throw error;}finally{resident?.();busy=false;}
 }
 async function runSegmentedResult(task,im,p,{signal,onProgress}){
  const operation=PIXEL_OPERATIONS[task.operation],referenceIds=operation.references?.(p)??[],references=referenceIds.map(id=>{identity(id);const value=asset(id);requireValue(value.kind===(operation.referenceKind??'image'),'Reference source has the wrong kind for this operation.');return {id,...value};});
  const referenceKey=references.length?'/references/'+JSON.stringify(references.map(r=>[r.id,r.sha256])):'',dependencies=references.length?[task.imageId,...referenceIds]:[];
  busy=true;let resident,record,published=false;const started=performance.now();
  try{
   resident=budget.reserve(knownHeapBytes()-(task.operation==='inspection.adjust'?adjustHeapBytes():task.operation==='detail.gradient'?gradientHeapBytes():task.operation==='detail.echo'?echoHeapBytes():task.operation==='tampering.contrast'?contrastHeapBytes():task.operation==='various.median'?medianHeapBytes():task.operation==='noise.separation'?separationHeapBytes():task.operation==='various.stereogram'?stereoStreamHeapBytes():task.operation==='noise.noisesniffer'?noisesnifferStreamHeapBytes():task.operation==='tampering.resampling.fourier'?resamplingStreamHeapBytes():task.operation==='detail.frequency'?frequencyStreamHeapBytes():task.operation==='colors.pca'?pcaStreamHeapBytes():['detail.wavelets','noise.blocking'].includes(task.operation)?waveletStreamHeapBytes():0));if(task.operation==='detail.wavelets'&&im.waveletCache?.wavelet!==p.wavelet){await im.waveletCache?.dispose();im.waveletCache=null;}const basisKey=task.imageId+'\0segmented/pca-basis',basis=task.operation==='colors.pca'?budget.get(basisKey)?.value:undefined;record=await ({'inspection.adjust':segmentedAdjust,'noise.separation':segmentedSeparation,'various.median':segmentedMedian,'tampering.contrast':segmentedContrast,'various.illuminant':segmentedIlluminant,'detail.echo':segmentedEcho,'detail.gradient':segmentedGradient,'colors.space':segmentedColorSpaces,'tampering.resampling':segmentedResamplingAnalysis,'various.stereogram':segmentedStereogram,'noise.noisesniffer':segmentedNoisesniffer,'tampering.resampling.fourier':segmentedResamplingFourier,'detail.frequency':segmentedFrequency,'noise.blocking':segmentedBlocking,'detail.wavelets':segmentedWavelet,'colors.pca':segmentedPca,'pixels.defects':segmentedDefects,'noise.planes':segmentedBitPlanes,'noise.minmax':segmentedMinmax,'colors.stats':segmentedPixelStats}[task.operation])(im,p,{budget,signal,maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1,adaptive:task.operation==='inspection.adjust'?adjustAdaptive:task.operation==='noise.separation'?separationAdaptive:echoAdaptive,model:references[0]?.model,medianPool:cpuKernel==='auto'?medianPool:null,cpuKernel,dependencies,cacheKey:task.imageId+'\0segmented/'+task.operation+'/'+referenceKey,backend:task.backend??'auto',frequencyGpu:task.operation==='detail.frequency'&&(task.backend??'auto')!=='cpu'&&(cpuKernel==='auto'||task.backend==='webgpu')?frequencyGpu:null,decodeGray:codec.decodeGray?.bind(codec),profile:{maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},basis,original:cpuKernel==='reference',cache:task.operation==='tampering.resampling'?im.emCache:task.operation==='various.stereogram'?im.stereoCache:task.operation==='noise.noisesniffer'?im.noisesnifferCache:task.operation==='tampering.resampling.fourier'?im.resamplingCache:task.operation==='detail.frequency'?im.frequencyCache:task.operation==='detail.wavelets'?im.waveletCache:task.operation==='noise.blocking'?im.blockingCache:undefined,onProgress:f=>onProgress?.(typeof f==='number'?{id:task.id,phase:'kernel',fraction:f}:{id:task.id,...f,fraction:f.completed/f.total})});checkAbort(signal);
   if(record.emCache)im.emCache=record.emCache;
   if(record.stereoCache)im.stereoCache=record.stereoCache;
   if(record.noisesnifferCache)im.noisesnifferCache=record.noisesnifferCache;
   if(record.resamplingCache)im.resamplingCache=record.resamplingCache;
   if(record.frequencyCache)im.frequencyCache=record.frequencyCache;
   if(record.blockingCache)im.blockingCache=record.blockingCache;
   if(record.waveletCache)im.waveletCache=record.waveletCache;
   if(record.basis)budget.put(basisKey,{value:record.basis,byteLength:record.basis.byteLength},[task.imageId]);
   if(record.readNpz)record.npzProvenance={engine:VERSION,operation:task.operation,params:p,backend:record.metrics?.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:PIXEL_OPERATIONS[task.operation].native,layout:'segmented'};
   if(task.operation==='various.stereogram'&&!record.surface)return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'none',data:record.data,layers:[],semantics:record.semantics,provenance:{engine:VERSION,operation:task.operation,params:p,backend:record.metrics?.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:PIXEL_OPERATIONS[task.operation].native,kernelParity:PIXEL_OPERATIONS[task.operation].parity,layout:'segmented',...(references.length?{references:references.map(r=>({id:r.id,kind:r.kind,originalSha256:r.sha256,...structuredClone(r.provenance)}))}:{})},metrics:{...record.metrics,totalMs:performance.now()-started,memory:budget.snapshot()}};
   const bundle=resultSurfaces.publishBundle(task.imageId,record),surface=bundle.surface;published=true;
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,...(record.data?{data:record.data}:{}),...(record.masks?{masks:record.masks}:{}),layers:[{id:task.operation==='detail.frequency'?'low':task.operation,kind:'rgb',surfaceId:surface.id,origin:[0,0],range:[0,255],...(task.operation==='tampering.resampling'?{coordinateSpace:p.stage==='fourier'?'frequency-grid':'source'}:task.operation==='various.stereogram'?{coordinateSpace:'cropped-stereo-pair',comparedBounds:record.data.comparedBounds}:task.operation==='tampering.resampling.fourier'?{coordinateSpace:'frequency-grid'}:{})},...Object.entries(bundle.rgbSurfaces??{}).map(([id,rgb])=>({id,kind:'rgb',surfaceId:rgb.id,origin:[0,0],range:[0,255],coordinates:['magnitude','phase'].includes(id)||id.startsWith('fourier')?'frequency':'source',...(task.operation==='tampering.resampling'?{origin:record.data.maps.find(m=>m.id===id)?.origin??[0,0]}:{})})),...Object.entries(bundle.maskSurfaces??{}).map(([id,mask])=>({id,kind:'mask',surfaceId:mask.id,origin:[0,0],range:mask.range,semantics:mask.semantics}))],semantics:record.semantics,provenance:{engine:VERSION,operation:task.operation,params:p,backend:record.metrics?.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:PIXEL_OPERATIONS[task.operation].native,kernelParity:['tampering.resampling','various.stereogram'].includes(task.operation)?PIXEL_OPERATIONS[task.operation].parity:task.operation==='noise.noisesniffer'?'Native global statistics, NumPy unstable sorting and ordered region growth; exact qualified outputs':task.operation==='tampering.resampling.fourier'?PIXEL_OPERATIONS[task.operation].parity:task.operation==='detail.frequency'?'Native float32 complete-axis DFT, global normalization and reconstruction stripe arithmetic':task.operation==='noise.blocking'?(record.metrics?.decomposition==='gpu-high-low-db8'?'Original grayscale and complete db8 stencils evaluated with qualified GPU high/low arithmetic; MAD field maximum error within1e-4, native extrema/quantization refinement before unchanged normalized RGB8':'Original grayscale, global db8 axes and normalization with exact bounded block medians'):task.operation==='detail.wavelets'?(record.metrics?.decomposition==='gpu-forward-high-low'?'Complete symmetric native wavelet stencils evaluated with qualified GPU high/low decomposition and continuous threshold/reconstruction within1e-4 before unchanged RGB8 conversion; CPU and discontinuous modes use separately retained native binary64 coefficients':record.metrics?.backend==='webgpu'?'Exact native binary64 coefficients and threshold decisions; complete native IDWT stencils with qualified GPU high/low arithmetic within1e-4 before unchanged RGB8 conversion':'Native complete-axis float64 wavelets with global thresholds exact on qualified corpus'):task.operation==='colors.pca'?'Native ordered float64 PCA basis and renders exact on qualified corpus':'Declared native pixel/mask corpus with exact segmented seams and image borders',layout:'segmented',...(references.length?{references:references.map(r=>({id:r.id,kind:r.kind,originalSha256:r.sha256,...structuredClone(r.provenance)}))}:{})},metrics:{...record.metrics,temporaryBackend:im.session?.backend??null,temporaryFallback:im.session?.fallback??null,totalMs:performance.now()-started,workers:record.metrics?.workers??1,cache:{result:false,...(record.metrics?.analysisCacheHit!==undefined?{analysis:record.metrics.analysisCacheHit,view:false}:{})},memory:budget.snapshot()}};
  }catch(error){if(record&&!published)await Promise.allSettled([...(record.emCache&&record.emCache!==im.emCache?[record.emCache.dispose()]:[]),...(record.stereoCache&&record.stereoCache!==im.stereoCache?[record.stereoCache.dispose()]:[]),...(record.noisesnifferCache&&record.noisesnifferCache!==im.noisesnifferCache?[record.noisesnifferCache.dispose()]:[]),...(record.resamplingCache&&record.resamplingCache!==im.resamplingCache?[record.resamplingCache.dispose()]:[]),...(record.frequencyCache&&record.frequencyCache!==im.frequencyCache?[record.frequencyCache.dispose()]:[]),...(record.blockingCache&&record.blockingCache!==im.blockingCache?[record.blockingCache.dispose()]:[]),...(record.waveletCache&&record.waveletCache!==im.waveletCache?[record.waveletCache.dispose()]:[]),record.surface?.dispose(),...['rgbRecords','maskRecords','flagRecords','tableRecords'].flatMap(name=>Object.values(record[name]??{}).map(r=>r.surface.dispose()))]);throw error;}finally{resident?.();busy=false;}
 }
 async function runSegmentedMagnifier(task,im,p,{signal,onProgress}){
  busy=true;let resident,record,published=false;
  try{resident=budget.reserve(knownHeapBytes());record=await segmentedMagnifier(im,p,{budget,signal,cacheKey:task.imageId+'\0segmented/magnifier/',onProgress:e=>onProgress?.({id:task.id,...e})});
   let result=record;if(record.surface){const surface=resultSurfaces.publish(task.imageId,record);published=true;result={data:record.data,semantics:record.semantics,metrics:record.metrics,layout:'surface',surface,layers:[{id:task.operation,kind:'rgb',surfaceId:surface.id,origin:record.data.bounds.slice(0,2),range:[0,255]}]};}
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...result,layers:result.layers??[],provenance:{engine:VERSION,operation:task.operation,params:p,backend:'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:PIXEL_OPERATIONS[task.operation].native,kernelParity:'Qualified native magnifier on an exact oriented source region',layout:'segmented',semantics:result.semantics}};
  }catch(e){if(record?.surface&&!published)await record.surface.dispose();throw e;}finally{resident?.();busy=false;}
 }
 async function loadTreeModel(input,{signal,onProgress}={},family){
   const kind=family==='median'?'median-model':'jpeg-quality-model',compile=family==='median'?compileMedianModel:compileQualityModel;
   idle();identity(input?.id);requireValue(input.blob instanceof Blob&&input.blob.size>0&&input.blob.size<=64*1024**2,'A local JSON model Blob of at most64MiB is required.');requireValue(!images.has(input.id),'Unload a source before reusing its id.');
   const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+input.blob.size*2);busy=true;let model,stored=false;
   try{
    await checkpoint(signal);const started=performance.now(),bytes=new Uint8Array(await input.blob.arrayBuffer());checkAbort(signal);const hash=await sha(bytes);checkAbort(signal);
    model=await compile(bytes,{budget,signal,onProgress:fraction=>onProgress?.({id:input.id,phase:'model-load',fraction})});checkAbort(signal);
    const provenance={...model.metadata,weightSource:'explicit-local-blob',weightsBundled:false},retainedBytes=bytes.byteLength;
    release();budget.retain(retainedBytes);images.set(input.id,{kind,model,bytes,sha256:hash,provenance,retainedBytes});stored=true;
    return {id:input.id,kind,sha256:hash,...structuredClone(provenance),metrics:{preparationMs:performance.now()-started,memory:budget.snapshot()}};
   }finally{if(!stored)model?.dispose();release();busy=false;}
 }
 const api={
  waveletRetirementDiagnostics:null,
  async prepareExternalCacheHeadroom({bytes,all=false},{signal}={}){idle();if(!externalCaches.size)return;requireValue(typeof all==='boolean'&&(all||Number.isSafeInteger(bytes)&&bytes>0),'Invalid external workspace.');busy=true;try{await externalCaches.prepare(all?budget.limit:bytes+knownHeapBytes(),{signal});}finally{busy=false;}},
  async reserveExternalCache(input,hooks){idle();busy=true;try{return await externalCaches.reserve(input,hooks);}finally{busy=false;}},
  async updateExternalCache(input,hooks){idle();busy=true;try{return await externalCaches.update(input,hooks);}finally{busy=false;}},
  releaseExternalCache(id){idle();return externalCaches.release(id);},
  reserveExternalMemory({bytes}){idle();requireValue(Number.isSafeInteger(bytes)&&bytes>0,'Invalid external workspace size.');budget.room(bytes+knownHeapBytes());const id=crypto.randomUUID(),release=budget.reserve(bytes);externalMemory.set(id,release);return{id,bytes};},
  releaseExternalMemory(id){alive();externalMemory.get(id)?.();externalMemory.delete(id);},
  updateResourceHints(hints){if(disposed)throw new EngineError('DISPOSED','Engine disposed.');const state=liveMemory.update(hints);profile.liveMemory=state;profile.memoryBudgetBytes=budget.limit;if(state.accepted)profile.memoryBudgetSource='system-available-live';return state;},
  async loadOcrModels(configuration){idle();busy=true;try{const key=JSON.stringify(configuration);if(ocr&&key===ocrConfigurationKey)return{configured:true};await ocr?.dispose();ocr=null;ocrConfigurationKey=null;ocr=await ocrAdapter(configuration);ocrConfigurationKey=key;return{configured:true};}finally{busy=false;}},
  describeOcrUsefulWork(parameters){idle();return ocr?.describeUsefulWork(parameters)??null;},
  async unloadOcrModels(){idle();busy=true;try{await ocr?.dispose();ocr=null;ocrConfigurationKey=null;}finally{busy=false;}},
  describeUsefulOperation({task,imageId}={}){idle();if(!supportsNativeUsefulOperation(task?.operation))return null;const im=image(imageId??task?.imageId);return nativeUsefulOwner(task,{version:VERSION,profile,budget,cpuKernel,image:im,getReference:asset,m3Resources:m3?.usefulSnapshot?.(),extensionResources:extensions?.usefulSnapshot?.(),automaticResources:automatic?.usefulSnapshot?.(),d2Admission:d2prlUsefulAdmission(budget)});},
  capabilities(){return {version:VERSION,usefulWork:{nlm:nlmOwnerState(separationRuntimeState(),cpuKernel)},externalPreviewCaches:externalCaches.snapshot(),sourceRegions:sourceRegions.capabilities(),ocr:ocr?.snapshot()??{configured:false},browserMemory:browserMemoryObservation(),operations:[{id:'various.ocr',status:ocr?'available':'model-required',backends:['cpu','webgpu','auto'],algorithms:['ppocr-medium','tesseract'],regions:['full-frame'],sourceConstraint:'Native source coordinates; OCR preprocessing and model identities are recorded.'},denseCapability(),...['analysis.complete','analysis.clones'].map(id=>({id,status:'available',backends:['cpu','auto'],resources:automatic?.configured()??{forgeryscope:false,ocr:!!m3?.automaticLanguage(),d2prl:!!d2prl?.configured()},missingAssets:'per-group MODEL_UNAVAILABLE',sourceConstraint:'PM, D2 and SIFT Panels+Text consume original segmented surfaces; OCR and SIFT use bounded rows/windows, and Forgeryscope crops require admission; no resizing.'})),{id:'ela.classic',status:'available',backends:['cpu','webgpu'],regions:['full-frame'],kernelParity:'bit-exact on 40 native fixture outputs',codecParity:codec.parity??'unverified'},...pixelCapabilities(),...extensionCapabilities(extensions?.configured()??false),...(m3?.capabilities()??Object.keys(M3_OPERATIONS).map(id=>({id,status:id==='tampering.copyMove.sparse'?'available':'model-required',backends:['cpu','webgpu']}))),{id:'ai.clones.d2prl',status:d2prl?.configured()?'experimental-qualified-corpus':'model-required',backends:['cpu','webgpu'],regions:['full-frame','independent'],modelRequired:true,side:448,inputSides:[448,896,1344,1792],experimentalInputSides:[896,1344,1792],iterations:40,seed:22},{id:'ai.clones.segmentation',status:segmentation?.configured()?'experimental-qualified-corpus':'model-required',backends:segmentation?.backends()??['cpu'],regions:['full-frame','independent'],modelRequired:true,variants:[...SEGMENTATION_WINDOW_VARIANTS],unavailableVariants:{},configuredVariant:segmentation?.configured()??null,...segmentationCapabilityDeclaration({configuredVariant:segmentation?.configured()??null,backends:segmentation?.backends()??['cpu'],selected:segmentation?.windowCapabilities?.()}),compare:false}],sourceAccess:{blob:true,windows:true,headerInspection:true,exiftoolInspection:true,derivedOriginal:true,sourceLayouts:['auto','segmented'],segmentedFormats:['image/jpeg','image/png','image/tiff','image/avif','image/webp','image/heic','image/heif','image/jp2','image/jxl','image/gif','image/bmp','image/vnd.adobe.photoshop'],segmentedOperations:['various.ocr','analysis.complete','analysis.clones','metadata.thumbnail','ela.energy','jpeg.zero','jpeg.multiple','ela.biomes','jpeg.ghosts','ela.classic','metadata.c2pa','metadata.exiftool','jpeg.recompression','jpeg.quality','various.stereogram','noise.noisesniffer','comparison.image','tampering.resampling','tampering.resampling.fourier','noise.prnu','detail.frequency','noise.blocking','detail.wavelets','colors.pca',DENSE_OPERATION,...Object.keys(M3_OPERATIONS),...Object.keys(EXTENSION_OPERATIONS),'tampering.copyMove.brisk','tampering.copyMove.orb','tampering.copyMove.akaze','inspection.histogram','inspection.magnifier','inspection.adjust','noise.separation','various.median','tampering.contrast','various.illuminant','detail.echo','detail.gradient','colors.space','colors.stats','noise.planes','noise.minmax','pixels.defects','metadata.structure','file.hex','file.digest','ai.clones.d2prl','ai.clones.segmentation'],segmentedOperationConstraints:{'inspection.magnifier':{workingSet:'bounded-row-windows',resultLayout:'contiguous-or-surface'}},resultSurfaces:true,scientificWindows:true,rasterExports:['png','webp','avif','heic','tiff'],scientificExports:['npz-zero','npz-energy','npz-neural','npz-extensions'],rasterExportPages:true,numericWindows:true,scientificExportPages:true,scientificExportFormats:['npz'],maskWindows:true,flagWindows:true,tablePages:true,tableCsvPages:true,noisesnifferNpzPages:true},formats:['image/jpeg (8-bit, EXIF orientation, ICC preserved but not applied, no CMYK)','image/png (1/2/4-bit gray/palette,8-bit palette,8/16-bit gray/RGB/alpha,Adam7,EXIF orientation; native alpha policy)','image/tiff (bilevel/CCITT,8-bit palette,8/16-bit gray/RGB/alpha,planar and tiled; classic/BigTIFF bounded subset)','AVIF, WebP, HEIC/HEIF, JPEG 2000, JPEG XL, GIF, BMP, PSD, ICO, PNM, TGA and supported camera RAW (first image, SDR RGB8 analysis)', 'explicit rgb8 with provenance'],unavailable:['ela.ghosts','onnx'],energyProfile:DEFAULT_ENERGY_PROFILE,memory:{...budget.snapshot(),knownHeapCapacityBytes:knownHeapBytes()},resources:budget.resourceSnapshot?.()??null,extensions:extensions?.snapshot()??null,execution:execution.snapshot(),workerThreads:pool.selected??1,calculationProfile:profile.id,resourceProfile:profile,concurrencyReason:'One codec thread; ELA classic and energy, JPEG quality, Ghost, ZERO, Noisesniffer, median-feature, ORB grouping and Fourier presentation pools start requested work immediately under one shared budget, with single-thread workers and adaptation from completed useful tasks. No runtime calibration or synthetic probes. Frequency mask smoothing can use the offline-qualified WebGPU path; DFT and reconstruction remain on CPU. Single-thread MGCF CPU models admit independent zone jobs under the shared budget; TNT and VIG execute their qualified native-order backbones with useful fixed64MiB single-thread workers and release them before their512MiB neural decoders; MPDN can select its measured WebGPU/CPU hybrid with a pinned GPU mirror; VIG can select ordered WebGPU convolutions and graph dot products and TNT ordered WebGPU linear layers plus outer attention matrices, using shared CPU/GPU assets with CPU VIG normalization/TopK/gather, TNT inner attention/normalization/softmax, and decoders. Selection uses capabilities and memory, with explicit CPU retained. CMSeg512 uses bounded CPU global-correlation workers between single-thread CNN stages; admission can reduce the workers without changing the all-pairs domain. Generalization uses native-order CPU convolution workers or ordered WebGPU convolutions with shared assets, retaining CPU Winograd, and releases backbone resources before the CNN head; its hybrid route streams complete GPU dot rows for the largest global correlation while preserving CPU Gaussian/softmax/TopK and both smaller correlations; addnoise retains its CPU ONNX encoder/decoder and separate normalization, with an optional resident-input GPU dot stage for the largest correlation; CPU remains available and complete native decision differences are measured. Segmented Echo uses bounded single-thread row workers with global extrema and ordered storage; segmented median reuses bounded feature workers and preserves window headroom; segmented separation and adjustments overlap bounded single-thread row jobs with ordered storage; residual equalization, CLAHE and Otsu remain global; segmented gradient, contrast, illuminant and color-space conversions admit useful parallel row jobs; large magnifier regions publish bounded pixel surfaces.'};},
  async loadAutomaticModels(input,hooks){idle();busy=true;try{sourceRegions.clearContexts(['analysis.complete','analysis.clones']);return await(await automaticAdapter()).load(input,hooks);}finally{busy=false;}},
  async resumeAutomatic(request,hooks){idle();busy=true;let resident;try{resident=budget.reserve(knownHeapBytes());return await sourceRegions.continuation(await(await automaticAdapter()).resume(request,hooks),request);}finally{resident?.();busy=false;}},
  async updateAutomatic(request,hooks){idle();busy=true;let resident;try{resident=budget.reserve(knownHeapBytes());return await sourceRegions.continuation(await(await automaticAdapter()).update(request,hooks),request);}finally{resident?.();busy=false;}},
  async renderAutomatic(request,hooks){idle();busy=true;let resident;try{resident=budget.reserve(knownHeapBytes());return await sourceRegions.continuation(await(await automaticAdapter()).render(request,hooks),request);}finally{resident?.();busy=false;}},
  async previewAutomaticD2(request,hooks={}){idle();if(!automatic)throw new EngineError('CACHE_MISS','No completed automatic analysis.');busy=true;let resident,answer;try{checkAbort(hooks.signal);resident=budget.reserve(knownHeapBytes());answer=await automatic.previewD2(request,hooks);return sourceRegions.decoratePreviewMetadata(answer,request);}catch(error){if(answer)await retireFailedRetainedAnswer(answer,{release:id=>resultSurfaces.release(id),primary:error});throw error;}finally{resident?.();busy=false;}},
  async exportAutomatic(request,hooks){idle();busy=true;let resident;try{resident=budget.reserve(knownHeapBytes());return await sourceRegions.continuation(await(await automaticAdapter()).export(request,hooks),request,{presentation:false});}finally{resident?.();busy=false;}},
  async releaseAutomatic(){idle();busy=true;try{await automatic?.clear();sourceRegions.clearContexts(['analysis.complete','analysis.clones']);}finally{busy=false;}},
  async loadSegmentationModel(input,hooks={}){idle();busy=true;try{const answer=await(await segmentationAdapter()).load(input,hooks);sourceRegions.clearContexts(['ai.clones.segmentation']);return answer;}finally{busy=false;}},
  async unloadSegmentationModel(){idle();busy=true;try{await segmentation?.dispose();segmentation=null;sourceRegions.clearContexts(['ai.clones.segmentation']);}finally{busy=false;}},
  readSegmentationRaw(request){idle();image(request.imageId);if(!segmentation)throw new EngineError('CACHE_MISS','No completed segmentation result');const resident=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes()));return withRawReadLifetime(()=>segmentation.readRaw(sourceRegions.internalRequest(request)),answer=>sourceRegions.rawResult(answer,request),{hold(){busy=true;return()=>{busy=false;};},release:resident});},
  async loadExtensionModels(input,hooks={}){idle();busy=true;try{return await extensionsAdapter().load(input,hooks);}finally{busy=false;}},
  async unloadExtensionModels(){idle();busy=true;try{await extensions?.unload();}finally{busy=false;}},
  async runExtensions(task,{signal,onProgress}={}){idle();identity(task?.id);await sourceRegions.requireIdentity(task,{signal});const im=image(task.imageId);busy=true;try{return await extensionsAdapter().run(task,im,{signal,onProgress,knownHeapBytes:Math.max(RUNTIME_RESERVE,knownHeapBytes()),methods:task.methods??Object.values(EXTENSION_OPERATIONS)});}finally{busy=false;}},
  async loadM3Models(input){idle();busy=true;try{await automatic?.clear();sourceRegions.clearContexts(['analysis.complete','analysis.clones']);return await(await m3Adapter()).load(input);}finally{busy=false;}},
  async unloadM3Models(){idle();busy=true;try{await automatic?.clear();sourceRegions.clearContexts(['analysis.complete','analysis.clones']);await m3?.dispose();m3=null;}finally{busy=false;}},
  async loadD2prlModel(input,hooks={}){idle();busy=true;try{await automatic?.clear();sourceRegions.clearContexts(['analysis.complete','analysis.clones']);const answer=await(await d2prlAdapter()).load(input,hooks);sourceRegions.clearContexts(['ai.clones.d2prl']);return answer;}finally{busy=false;}},
  async unloadD2prlModel(){idle();busy=true;try{await automatic?.clear();sourceRegions.clearContexts(['analysis.complete','analysis.clones']);await d2prl?.dispose();d2prl=null;sourceRegions.clearContexts(['ai.clones.d2prl']);}finally{busy=false;}},
  readD2prlRaw(request){idle();image(request.imageId);if(!d2prl)throw new EngineError('CACHE_MISS','No completed model result');const analysisId=d2prl.resolveResultAnalysisId(request.resultId),retainedRequest=analysisId?{...request,analysisId}:request,resident=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes()));return withRawReadLifetime(()=>d2prl.readRaw(sourceRegions.internalRequest(retainedRequest)),answer=>sourceRegions.rawResult(answer,retainedRequest),{hold(){busy=true;return()=>{busy=false;};},release:resident});},
  async load(input,{signal,onProgress}={}) {
   idle();identity(input?.id);requireValue(input.bytes instanceof Uint8Array&&input.bytes.length>0,'Original bytes required.');
   requireValue(!images.has(input.id),'Unload an image before reusing its id.');
   const sourceFile=sourceFileInfo(input);
   if(input.pixels)validatePixels(input.pixels);
   const shape=input.pixels??codec.inspect(input.bytes);const n=shape.width*shape.height;
   const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+Math.max(input.bytes.length*3+n*24,codec.workingSetBytes?.(input.bytes.length,shape)??0));busy=true;
   try {
    await checkpoint(signal);const start=performance.now(),bytes=input.bytes.slice();
    const pixels=input.pixels?copyPixels(input.pixels):await codec.decode(bytes,{signal,onProgress:fraction=>onProgress?.({id:input.id,phase:'decode',fraction})});
    validatePixels(pixels);requireValue(pixels.width===shape.width&&pixels.height===shape.height,'Decoded dimensions differ.');
    const hash=await sha(bytes);checkAbort(signal);
    const provenance=input.pixels ? {decoder:'caller',parity:'unverified',...structuredClone(input.provenance??{})} : codec.provenance?.(bytes)??{decoder:codec.id,orientation:'unverified',icc:'unverified',depth:8,alpha:'unverified',interpolation:'none'};
    const record={kind:'image',bytes,pixels,provenance,sourceFile,sha256:hash,retainedBytes:bytes.byteLength+pixels.data.byteLength};
    // Release temporary reservation before converting its retained part.
    release();budget.retain(bytes.byteLength+pixels.data.byteLength);images.set(input.id,record);
    return {id:input.id,width:pixels.width,height:pixels.height,format:pixels.format,sha256:hash,provenance,file:structuredClone(sourceFile),surface:attachSurface(input.id,record),metrics:{preparationMs:performance.now()-start,memory:budget.snapshot()}};
   } catch(error) {releaseOnce();throw error;} finally {busy=false;}
   // The success path releases first; errors before that must release once.
   function releaseOnce(){if(budget.active>0)release();}
  },
  async inspectMetadata(input,{signal,onProgress}={}){
   idle();requireValue(input?.blob instanceof Blob&&input.blob.size>0,'Non-empty encoded Blob required.');
   const params=exiftoolParams({mode:input.mode}),file=sourceFileInfo(input);busy=true;let resident;const started=performance.now();
   try{
    resident=budget.reserve(knownHeapBytes());
    const result=await inspectExiftool(input.blob,params,{budget,signal,expectedSha256:input.sourceSha256,onProgress:fraction=>onProgress?.({id:'metadata-inspection',phase:'exiftool',fraction})});
    return {...result,file:structuredClone(file),mode:params.mode,metrics:{...result.metrics,totalMs:performance.now()-started,memory:budget.snapshot()}};
   }finally{resident?.();busy=false;}
  },
  async inspectHeaders(input,{signal,onProgress}={}){
   idle();requireValue(input?.blob instanceof Blob&&input.blob.size>0,'Non-empty encoded Blob required.');
   const selected=input.imageId===undefined?null:asset(input.imageId),owner=selected?.originalSource??selected;
   requireValue(!owner||owner.source||owner.bytes instanceof Uint8Array,'Original encoded owner is unavailable.');
   const file=owner?owner.sourceFile:sourceFileInfo(input),source=owner?.source??(owner?createOwnedByteSource(owner.bytes,{budget}):createBlobSource(input.blob,{budget}));busy=true;let resident,copy;const started=performance.now();
   try{
    resident=budget.reserve(knownHeapBytes()+4*1024**2);await checkpoint(signal);
    const signature=await source.read(0,Math.min(8,source.byteLength),{signal});let jpeg,png,tiff;try{const b=signature.bytes;tiff=(b[0]===73&&b[1]===73)||(b[0]===77&&b[1]===77);jpeg=b[0]===255&&b[1]===216;png=b.length===8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);}finally{signature.release();}
    const extended=async()=>{let blob=input.blob;if(owner){if(owner.source)blob=owner.source.blob();else{copy=budget.reserve(owner.bytes.byteLength);blob=new Blob([owner.bytes]);}}return inspectExtendedImage(blob,{name:file.name,budget,signal,sourceSha256:owner?.sha256});};
    let header,readMetrics;if(codec===imageCodec&&isCameraRaw(file.name))header=await extended();else if(jpeg)header={format:'jpeg',...await inspectJpegBlob(source,{signal})};else if(png||tiff){const result=await (png?inspectPngSource:inspectTiffSource)(source,{signal,account:n=>budget.reserve(n)});header=result.header;readMetrics={...result.metrics,encodedReadBytes:result.metrics.encodedReadBytes+8,encodedReadCalls:result.metrics.encodedReadCalls+1};}else if(codec===imageCodec)header=await extended();else{requireValue(Number.isSafeInteger(source.byteLength*2),'Encoded header staging exceeds safe integer range.');copy=budget.reserve(source.byteLength);const lease=await source.read(0,source.byteLength,{signal});try{header=imageHeader(lease.bytes);}finally{lease.release();}}
    checkAbort(signal);onProgress?.({id:'header-inspection',phase:'complete',fraction:1});checkAbort(signal);
    return {header,file:structuredClone(file),metrics:{totalMs:performance.now()-started,pixelDecode:false,encodedReadMode:jpeg?'jpeg-marker-prefix':'encoded-file',...readMetrics,memory:budget.snapshot()},semantics:owner?'Original encoded header inspection bound to the loaded encoded owner; consumed bytes match that owner. Structural metadata is not a complete ExifTool dump.':'Original encoded header inspection without pixel decoding or source registration. No original SHA256 was computed; structural metadata is not a complete ExifTool dump.'};
   }finally{copy?.();resident?.();if(source!==owner?.source)source.dispose();busy=false;}
  },
  async loadBlob(input,{signal,onProgress}={}){
   idle();identity(input?.id);requireValue(input.blob instanceof Blob&&input.blob.size>0,'Non-empty original Blob required.');requireValue(input.layout===undefined||['auto','segmented'].includes(input.layout),'Invalid source layout.');requireValue(!images.has(input.id),'Unload a source before reusing its id.');
   const sourceFile=sourceFileInfo(input);
   busy=true;const started=performance.now(),source=createBlobSource(input.blob,{budget}),progress=e=>onProgress?.({id:input.id,...e});let release,record,headerResident;
   const segmented=async(header,animationDetected)=>{const resident=budget.reserve(Math.max(0,knownHeapBytes()-(header?0:jpegCodec.memoryBytes())));try{const load=header?.format==='tiff'?loadSegmentedTiff:header?loadSegmentedPng:loadSegmentedJpeg;return await load(input.blob,{header,animationDetected,budget,signal,onProgress:progress,temporarySessionId:input.temporarySessionId,onTemporarySession});}finally{resident();}};
   try{
    headerResident=budget.reserve(knownHeapBytes());const signature=await source.read(0,Math.min(8,input.blob.size),{signal});let jpeg,png,tiff;try{const b=signature.bytes;tiff=codec===imageCodec&&((b[0]===73&&b[1]===73)||(b[0]===77&&b[1]===77));jpeg=b[0]===255&&b[1]===216;png=codec===imageCodec&&b.length===8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);}finally{signature.release();}
    if(codec===imageCodec&&(!jpeg&&!png&&!tiff||isCameraRaw(sourceFile.name))){
     record=await loadExtendedImage(input.blob,{name:sourceFile.name,layout:input.layout??'auto',budget,signal,onProgress:progress,temporarySessionId:input.temporarySessionId,onTemporarySession});headerResident();headerResident=null;
    }else{
    let header,bytes,animationDetected;if(jpeg)header=await inspectJpegBlob(source,{signal});else if(png||tiff){const metadata=budget.reserve(4*1024**2);try{const result=await (png?inspectPngSource:inspectTiffSource)(source,{signal,account:n=>budget.reserve(n)});header=result.header;animationDetected=result.metrics.animationDetected;(png?validatePngHeader:validateTiffHeader)(header);}finally{metadata();}}else{release=budget.reserve(input.blob.size);bytes=new Uint8Array(await input.blob.arrayBuffer());checkAbort(signal);header=codec.inspect(bytes);release();release=null;}
    headerResident();headerResident=null;const n=header.width*header.height;let codecWorking=0,codecFits=jpeg?input.blob.size*2+n*9+32*1024**2<=512*1024**2:!(png||tiff)||input.blob.size*2+n*32+64*1024**2<=1536*1024**2;
    try{codecWorking=codec.workingSetBytes?.(input.blob.size,header)??0;}catch(error){if((jpeg||png||tiff)&&error.code==='MEMORY_LIMIT')codecFits=false;else throw error;}
    const working=Math.max(RUNTIME_RESERVE,knownHeapBytes())+Math.max(input.blob.size*3+n*24,codecWorking);
    if(input.layout!=='segmented'&&codecFits&&working<=budget.limit-budget.retained-budget.active){
     try{release=budget.reserve(working);bytes??=new Uint8Array(await input.blob.arrayBuffer());checkAbort(signal);const pixels=await codec.decode(bytes,{signal,onProgress:fraction=>onProgress?.({id:input.id,phase:'decode',fraction})});validatePixels(pixels);requireValue(pixels.width===header.width&&pixels.height===header.height,'Decoded dimensions differ.');const hash=await sha(bytes);checkAbort(signal);
     const provenance=codec.provenance?.(bytes)??{decoder:codec.id,parity:'unverified'};record={kind:'image',blob:input.blob,bytes,pixels,sha256:hash,provenance,retainedBytes:bytes.byteLength+pixels.data.byteLength,metrics:{storage:'memory',path:'existing-full-memory',originalBlobBytes:input.blob.size}};
     release();release=null;budget.retain(record.retainedBytes);
     }catch(error){release?.();release=null;bytes=null;if((!jpeg&&!png&&!tiff)||!(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error.code)||error instanceof RangeError))throw error;record=await segmented(png||tiff?header:null,animationDetected);record.metrics.retry={from:'full-memory',code:error.code??'MEMORY_ALLOCATION'};}
    }else{
     bytes=null;if(!jpeg&&!png&&!tiff)throw new EngineError('UNSUPPORTED_LAYOUT','This codec has no qualified segmented decoder.');
     record=await segmented(png||tiff?header:null,animationDetected);
    }
    }
    checkAbort(signal);record.sourceFile=sourceFile;const surface=attachSurface(input.id,record);images.set(input.id,record);return {id:input.id,width:surface.width,height:surface.height,format:'rgb8',surface,sha256:record.sha256,provenance:record.provenance,file:structuredClone(sourceFile),...(record.segmented?{operationConstraints:{'inspection.magnifier':{workingSet:'bounded-row-windows',resultLayout:'contiguous-or-surface'}}}:{}),availableOperations:record.segmented?['various.ocr','analysis.complete','analysis.clones','metadata.thumbnail','ela.energy','jpeg.zero','jpeg.multiple','ela.biomes','jpeg.ghosts','ela.classic','metadata.c2pa','metadata.exiftool','jpeg.recompression','jpeg.quality','various.stereogram','noise.noisesniffer','comparison.image','tampering.resampling','tampering.resampling.fourier','noise.prnu','detail.frequency','noise.blocking','detail.wavelets','colors.pca',DENSE_OPERATION,...Object.keys(M3_OPERATIONS),...Object.keys(EXTENSION_OPERATIONS),'tampering.copyMove.brisk','tampering.copyMove.orb','tampering.copyMove.akaze','inspection.histogram','inspection.magnifier','inspection.adjust','noise.separation','various.median','tampering.contrast','various.illuminant','detail.echo','detail.gradient','colors.space','colors.stats','noise.planes','noise.minmax','pixels.defects','metadata.structure','file.hex','file.digest','ai.clones.d2prl','ai.clones.segmentation']:['various.ocr','analysis.complete','analysis.clones','ela.classic',...Object.keys(PIXEL_OPERATIONS),DENSE_OPERATION,...Object.keys(M3_OPERATIONS),...Object.keys(EXTENSION_OPERATIONS),'ai.clones.d2prl','ai.clones.segmentation'],metrics:{...record.metrics,preparationMs:performance.now()-started,memory:budget.snapshot()}};
   }catch(error){if(record){if(record.segmented)await disposeSegmentedImage(record);else budget.retained-=record.retainedBytes;}throw error;}
   finally{headerResident?.();release?.();source.dispose();busy=false;}
  },
  async readPlane(request,hooks){const {pixels,...result}=await readSurfaceWindow(request,['float32','float64','int32'],hooks);return {...result,plane:pixels};},
  async readDisplay({surfaceId,revision,tile,render},{signal}={}){
   idle();const entry=surfaces.get(surfaceId);if(!entry)throw new EngineError('NOT_FOUND','Pixel surface no longer exists.');
   requireValue(revision===entry.record.surface.descriptor.revision,'Stale pixel surface revision.');
   const overlay=render?.overlaySurfaceId?surfaces.get(render.overlaySurfaceId)?.record.surface:null;
   if(render?.overlaySurfaceId&&!overlay)throw new EngineError('NOT_FOUND','Overlay source no longer exists.');
   busy=true;let frame,resident;try{resident=budget.reserve(knownHeapBytes());frame=await readDisplayFrame(entry.record.surface,tile,{budget,signal,render,overlay});const {release,...answer}=frame;return answer;}finally{frame?.release();resident?.();busy=false;}
  },
  readPixels:(request,hooks)=>readSurfaceWindow(request,'rgb8',hooks),
  async readMask(request,hooks){const {pixels,...result}=await readSurfaceWindow(request,'mask8',hooks);return {...result,mask:pixels};},
  async readFlags(request,hooks){const {pixels,...result}=await readSurfaceWindow(request,'rgb-flags8',hooks);return {...result,flags:pixels};},
  readTable:(request,hooks)=>readTablePage(request,false,hooks),
  readTableCsv:(request,hooks)=>readTablePage(request,true,hooks),
  async readNpz({surfaceId,revision,...range},{signal,onProgress}={}){idle();const entry=surfaces.get(surfaceId);requireValue(entry?.record?.readNpz&&revision===entry.record.surface.descriptor.revision,'No stored NPZ for this surface revision.');busy=true;let resident,page;try{resident=budget.reserve(knownHeapBytes());page=await entry.record.readNpz(range,{signal,onProgress,provenance:entry.record.npzProvenance});const {release,...result}=page;return {...result,surfaceId,revision};}finally{page?.release();resident?.();busy=false;}},
  async releaseTable(id){idle();requireValue(['uint32-table','float64-table','float32-table'].includes(surfaces.get(id)?.record.surface.descriptor.format),'A live table handle is required.');busy=true;try{await resultSurfaces.release(id);}finally{busy=false;}},
  async releaseSurface(id){idle();busy=true;try{await resultSurfaces.release(id);}finally{busy=false;}},
  async exportSurface(request,{signal,onProgress}={}){
   idle();const entry=surfaces.get(request?.surfaceId);if(!entry)throw new EngineError('NOT_FOUND','Pixel surface no longer exists.');requireValue(request.revision===entry.record.surface.descriptor.revision,'Stale pixel surface revision.');busy=true;let resident;
   try{resident=budget.reserve(knownHeapBytes());const overlay=request.render?.overlaySurfaceId?surfaces.get(request.render.overlaySurfaceId)?.record.surface:null;if(request.render?.overlaySurfaceId&&!overlay)throw new EngineError('NOT_FOUND','Overlay source no longer exists.');const raster=rasterPresentation(entry.record.surface,request.render,{budget,overlay});return await (request.format==='npz'?rasterExports.createScientific(entry.record,request,{signal,onProgress:event=>onProgress?.({id:request.surfaceId,...event}),imageId:entry.imageId,originalSha256:image(entry.imageId).sha256}):rasterExports.create(raster,request,{signal,onProgress:event=>onProgress?.({id:request.surfaceId,...event}),imageId:entry.imageId,originalSha256:image(entry.imageId).sha256}));}finally{resident?.();busy=false;}
  },
  async exportPixelBuffer({pixels,...request},{signal,onProgress}={}){
   idle();validatePixels(pixels);busy=true;let resident;
   try{resident=budget.reserve(knownHeapBytes()+pixels.data.byteLength);const surface=contiguousSurface(pixels,budget);return await rasterExports.create(surface,request,{signal,onProgress});}finally{resident?.();busy=false;}
  },
  async readExport(request,{signal}={}){idle();busy=true;let resident;try{resident=budget.reserve(knownHeapBytes());return await rasterExports.read(request,{signal});}finally{resident?.();busy=false;}},
  async releaseExport(id){idle();busy=true;try{await rasterExports.release(id);}finally{busy=false;}},
  originalBlob(id){idle();const im=asset(id);if(im.segmented)return im.source.blob();if(im.blob)return im.blob;const release=budget.reserve(im.bytes.byteLength+knownHeapBytes());try{return new Blob([im.bytes]);}finally{release();}},
  async deriveOriginal({imageId,patches,output='blob',storage='auto',temporarySessionId},{signal,onProgress}={}){
   idle();requireValue(['blob','archive'].includes(output)&&['auto','temporary'].includes(storage),'Invalid derived original output.');const selected=asset(imageId),im=selected.originalSource??selected;busy=true;let resident,view,archive;
   try{
    resident=budget.reserve(knownHeapBytes());const source=im.source??(view=im.bytes instanceof Uint8Array?createOwnedByteSource(im.bytes,{budget}):createBlobSource(im.blob,{budget}));if(view?.sha256&&await view.sha256({signal})!==im.sha256)throw new EngineError('SOURCE_CHANGED','The encoded source no longer matches its loaded owner.');const progress=fraction=>onProgress?.({id:imageId,phase:'derive-original',fraction}),provenance={engine:VERSION,imageId,originalSha256:im.sha256,operation:'derive-original',coordinates:'original-bytes',sourceUnchanged:true,semantics:'Explicit byte edits; derived file validity and metadata/signature integrity are not asserted.'};
    if(output==='archive'){
     archive=await deriveOriginalArchive(source,patches,{budget,signal,onProgress:progress,storage,temporarySessionId,onTemporarySession});const descriptor=rasterExports.adopt(archive,{imageId,operation:'derive-original',originalSha256:im.sha256,mime:archive.mime,format:archive.format});const result={archive:descriptor,sizeBytes:archive.sizeBytes,originalSizeBytes:archive.originalSizeBytes,edits:archive.edits,metrics:archive.metrics,provenance};archive=null;return result;
    }
    const result=await deriveOriginalBytes(source,patches,{budget,signal,onProgress:progress});return{...result,provenance};
   }finally{await archive?.dispose();view?.dispose();resident?.();busy=false;}
  },
  async readOriginal(id,{offset=0,length}={}, {signal}={}){
   idle();const im=asset(id);if(!im.segmented&&im.bytes instanceof Uint8Array){length??=Math.min(1024**2,im.bytes.length-offset);requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=im.bytes.length-length,'Invalid original byte range.');checkAbort(signal);const release=budget.reserve(length+knownHeapBytes());try{return {offset,bytes:im.bytes.slice(offset,offset+length),totalBytes:im.bytes.length};}finally{release();}}const source=im.segmented?im.source:createBlobSource(im.blob,{budget});busy=true;let part,resident;
   try{resident=budget.reserve(knownHeapBytes());if(!im.segmented&&im.encodedIntegrity)await source.adoptIntegrity(im.encodedIntegrity,{signal});part=await source.read(offset,length??Math.min(1024**2,source.byteLength-offset),{signal});return {offset,bytes:part.bytes,totalBytes:source.byteLength};}finally{part?.release();resident?.();if(!im.segmented)source.dispose();busy=false;}
  },
  loadMedianModel:(input,hooks)=>loadTreeModel(input,hooks,'median'),
  loadQualityModel:(input,hooks)=>loadTreeModel(input,hooks,'jpeg-quality'),
  async loadPrnuDatabase(input,{signal,onProgress}={}){
   idle();identity(input?.id);const blob=input.blob;requireValue(blob instanceof Blob&&blob.size>0||input.bytes instanceof Uint8Array&&input.bytes.length>0,'Original HDF5 Blob or bytes required.');requireValue(!images.has(input.id),'Unload a source before reusing its id.');
   const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+(blob?0:input.bytes.byteLength*2));busy=true;let released=false,loaded,stored=false,source;
   try{
    await checkpoint(signal);const start=performance.now(),bytes=blob?undefined:input.bytes.slice(),options={budget,signal,onProgress,storage:input.fingerprintStorage??'auto',temporarySessionId:input.temporarySessionId,onTemporarySession};
    let hash;if(blob){source=createBlobSource(blob,{budget});hash=await source.sha256({signal});options.source=source;}else hash=await sha(bytes);checkAbort(signal);
    const read=blob?{database:await readPrnuHdf5Blob(blob,options)}:await readPrnuStoredDatabase(bytes,options),database=(loaded=read.database);if(blob)read.temporaryBackend=database.encodedBackend==='memory'?database.temporaryBackend:'opfs';checkAbort(signal);
    const encodedIntegrity=source?.integrity(),provenance={schema:database.schema,legacy:database.legacy,complete:database.complete,trainingMembershipVerified:database.trainingMembershipVerified},retainedBytes=(bytes?.byteLength??0)+payloadBytes(database)+(encodedIntegrity?.states.byteLength??0);
    release();released=true;budget.retain(retainedBytes);source?.dispose();source=null;images.set(input.id,{kind:'prnu-database',bytes,blob,database,encodedIntegrity,sha256:hash,provenance,retainedBytes});stored=true;
    return {id:input.id,kind:'prnu-database',sha256:hash,...provenance,cameras:database.cameras.map(c=>({name:c.name,width:c.fingerprint.width,height:c.fingerprint.height,nImages:c.nImages,nUsed:c.nUsed})),metrics:{fingerprintLayout:database.layout,encodedLayout:blob?'blob':'bytes',...(blob?{originalBlobBytes:blob.size,originalBlobResidency:'browser-managed; not measured as zero RAM'}:{}),temporaryBackend:read.temporaryBackend,encodedBackend:database.encodedBackend??(blob?'opfs':'memory'),...(database.storageFallback?{storageFallback:database.storageFallback}:{}),preparationMs:performance.now()-start,memory:{...budget.snapshot(),hdf5HeapCapacityBytes:prnuHdf5HeapBytes()}}};
   }finally{source?.dispose();try{if(!stored)await loaded?.dispose();}finally{if(!released)release();busy=false;}}
  },
  async buildPrnuDatabase(input,{signal,onProgress}={}){
   idle();identity(input?.id);requireValue(!images.has(input.id),'Unload a source before reusing its id.');const query=image(input.queryImageId);
   busy=true;let snapshot,database,encodedArchive,resident,encoderRelease,retainedBytes=0,retained=false,detached=false,handoff=false,cleanupAcknowledged=false,cleanup,pool,record;
   // Adoption and rollback use the same transform retirement registry as the
   // training planes. A refused ACK keeps these closures and their credits.
   const retire=async()=>{
    if(!handoff){
     await retireCompositeOwners([
      async()=>{if(detached&&database){await database.dispose();database=null;}else if(snapshot){await snapshot.release();snapshot=null;}},
      async()=>{if(encodedArchive){await encodedArchive.release();encodedArchive=null;}}
     ]);
     if(retained){budget.retained-=retainedBytes;retained=false;}
    }
    if(encoderRelease){await encoderRelease();encoderRelease=null;}
    if(resident){await resident();resident=null;}
   };
   try{
    pool=new WaveletStripPool(budget,{workerFactory:null});cleanup=pool.ownCleanup(retire);
    // Busy is already claimed: no second builder can pass while this ACK waits.
    if(hasPendingWaveletStripOwners(budget))await retireWaveletStripOwners(budget,{pendingOnly:true});checkAbort(signal);
    resident=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes()-prnuStreamHeapBytes()));
    const start=performance.now();snapshot=await buildPrnuStoredSnapshot(input,query.sha256,{budget,signal,profile:{maxWorkers:cpuKernel==='auto'?profile.maxWorkers:1},onTemporarySession,onStage:p=>onProgress?.({id:input.id,...p,fraction:p.completed/p.total}),onProgress:fraction=>onProgress?.({id:input.id,phase:'fingerprints',fraction})});
    database=snapshot.database;const buildMetrics=snapshot.metrics;requireValue(input.outputLayout===undefined||['auto','bytes','pages'].includes(input.outputLayout),'Invalid PRNU encoded output layout.');
    const raw=database.cameras.reduce((n,c)=>n+c.fingerprint.width*c.fingerprint.height*8,0),pages=input.outputLayout==='pages'||input.outputLayout!=='bytes'&&raw*5+64*1024**2>budget.limit-budget.retained-budget.active;let bytes;
    encoderRelease=budget.reserve(prnuStreamHeapBytes());let encoderFailed=false,encoderPrimary;
    try{if(pages)encodedArchive=retainPrnuArchive(await writePrnuHdf5Pages(database,{budget,signal,onProgress,onTemporarySession}));else bytes=await writePrnuDatabase(database,{signal,onProgress,maxWorkingBytes:memoryBudgetBytes,admit:n=>budget.reserve(n)});}
    catch(error){encoderFailed=true;encoderPrimary=error;throw error;}
    finally{try{if(encoderRelease){await encoderRelease();encoderRelease=null;}}catch(error){if(!encoderFailed)throw error;appendWaveletCleanup(encoderPrimary,error);}}
    const hash=encodedArchive?.sha256??await sha(bytes);checkAbort(signal);
    const provenance={schema:database.schema,legacy:false,complete:true,trainingMembershipVerified:true};retainedBytes=(bytes?.byteLength??0)+payloadBytes(database);
    // Encoding has acknowledged before exchanging the resident call credit.
    await resident();resident=null;budget.retain(retainedBytes);retained=true;
    await snapshot.detach();detached=true;checkAbort(signal);
    record={kind:'prnu-database',bytes,encodedArchive,database,sha256:hash,provenance,retainedBytes};
    // Construct the complete reply before publishing its database. Getters or
    // structuredClone failures must not leave an invisible loaded database.
    const answer={id:input.id,kind:'prnu-database',sha256:hash,...provenance,cameras:database.cameras.map(c=>({name:c.name,width:c.fingerprint.width,height:c.fingerprint.height,nImages:c.nImages,nUsed:c.nUsed,skippedImages:structuredClone(c.skippedImages)})),metrics:{...buildMetrics,encodedLayout:pages?'pages':'bytes',encodedBackend:encodedArchive?.metrics?.encodedBackend??'memory',encodedTemporaryBackend:encodedArchive?.metrics?.temporaryBackend??null,...(encodedArchive?.metrics?.storageFallback?{storageFallback:encodedArchive.metrics.storageFallback}:{}),encodedBytes:encodedArchive?.byteLength??bytes.byteLength,fingerprintLayout:database.layout,preparationMs:performance.now()-start,memory:{...budget.snapshot(),hdf5HeapCapacityBytes:prnuHdf5HeapBytes()}}};
    handoff=true;await cleanup.retire({endpoints:true,retryEndpoints:true});cleanupAcknowledged=true;checkAbort(signal);
    images.set(input.id,record);return answer;
   }catch(error){
    handoff=false;if(record&&images.get(input.id)===record)images.delete(input.id);
    // The handoff owner may already have acknowledged immediately before a
    // late abort or synchronous Map publication failure. Re-adopt before await.
    if(cleanupAcknowledged)cleanup=pool.ownCleanup(retire);
    try{await cleanup?.retire({endpoints:true,retryEndpoints:true});}catch(cleanupError){appendWaveletCleanup(error,cleanupError);}throw error;
   }finally{busy=false;}
  },
  async createPrnuDatabaseExport(id,{signal}={}){idle();const value=asset(id);requireValue(value.kind==='prnu-database','A loaded PRNU database is required.');busy=true;let archive,published=false,resident;try{resident=budget.reserve(knownHeapBytes());archive=await originalPrnuArchive(value,{budget,signal,onTemporarySession});const result=rasterExports.adopt(archive,{imageId:id,operation:'noise.prnu',originalSha256:value.sha256,mime:'application/x-hdf5',format:'hdf5'});published=true;return result;}finally{try{if(!published)await archive?.dispose();}finally{resident?.();busy=false;}}},
  exportPrnuDatabase(id){idle();const value=asset(id);requireValue(value.kind==='prnu-database','A loaded PRNU database is required.');requireValue(value.bytes instanceof Uint8Array,'Use createPrnuDatabaseExport/readExport for Blob or paged databases.');const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+value.bytes.byteLength);try{return {mime:'application/x-hdf5',bytes:value.bytes.slice()};}finally{release();}},
  async previewParameters(task,preview={}, {signal,onProgress}={}){
   idle();identity(task?.id);identity(task?.imageId);const submitted=task,sourceId=task.imageId,original=image(sourceId),sourceRevision=original.surface.descriptor.revision,context=await sourceRegions.checkPreview(task,{signal});
   // Scope preparation admits asynchronous work before this preview owns BUSY.
   // Recheck both ownership and the source revision before borrowing its cache.
   idle();checkAbort(signal);requireValue(image(sourceId)===original&&original.surface.descriptor.revision===sourceRevision&&image(context.task.imageId)===context.image,'Preview source changed during scope preparation.');task=context.task;const ssg=task.operation==='tampering.copyMove.sparse'&&task.params?.algorithm==='SSG';requireValue(ssg||['noise.noisesniffer','jpeg.zero','various.stereogram','ai.sources.safire','jpeg.ghosts','tampering.resampling','tampering.resampling.fourier'].includes(task.operation),'This operation has no cached parameter draft.');requireValue(ssg||['jpeg.ghosts','jpeg.zero','tampering.resampling','tampering.resampling.fourier'].includes(task.operation)&&context.domain||!task.scientificScope&&(!task.regions||Array.isArray(task.regions)&&!task.regions.length),'Cached drafts do not add scientific regions.');const im=context.image;busy=true;let resident;const start=performance.now();
   try{
    checkAbort(signal);resident=reservePreview(budget,Math.max(RUNTIME_RESERVE,knownHeapBytes()));let result;
    if(ssg){if(!m3)previewUnavailable('Run native SSG before requesting its retained localization draft.');result=await m3.retained(task,im,{signal,onProgress,preview});if(!result)previewUnavailable('The SSG localization checkpoint or requested stage is no longer retained.');if(context.domain){const g=preview.presentationGrid;requireValue(g&&[g.width,g.height,g.step,g.logicalWidth,g.logicalHeight].every(n=>Number.isSafeInteger(n)&&n>0)&&g.logicalWidth===context.domain.width&&g.logicalHeight===context.domain.height&&g.width===Math.ceil(g.logicalWidth/g.step)&&g.height===Math.ceil(g.logicalHeight/g.step)&&g.width*g.height<=2048**2,'Invalid retained SSG presentation membership grid.');const release=budget.reserve(g.width*g.height);try{const values=new Uint8Array(g.width*g.height),cooperate=createCooperator(signal);for(let y=0;y<g.height;y++){for(let x=0;x<g.width;x++)values[y*g.width+x]=context.domain.containsOriginal(context.domain.origin[0]+x*g.step,context.domain.origin[1]+y*g.step)?1:0;await cooperate();}result.ssgMaskDraft={...result.ssgMaskDraft,displayMembership:values,displayDomainFingerprint:context.domain.fingerprint};}finally{release();}}
    }else if(task.operation==='jpeg.ghosts'){
     requireValue(context.domain,'A scoped Ghost draft needs its verified domain.');let view;try{view=await createSourceRegionView({...context.original.surface,sha256:context.original.sha256},context.domain.descriptor,{budget,signal});im.ghostProxyCache??=createSourceRegionGhostPreview({budget,codec:analysisCodec});result=await im.ghostProxyCache.preview({task,original:context.original,derived:im,view,domain:context.domain,preview,signal,onProgress});}finally{await view?.dispose();}
    }else if(task.operation==='noise.noisesniffer'){
     try{result=await previewCachedNoisesniffer(im,im.noisesnifferCache,task.params,preview,{budget,signal,onProgress,...(context.domain?{sourceRegion:{original:context.original,domain:context.domain}}:{})});}catch(error){if(!context.domain||error.code!=='PREVIEW_UNAVAILABLE')throw error;im.noisesnifferColdPreview??=createStrictColdNoisesnifferPreview({budget});result=await im.noisesnifferColdPreview.preview({original:context.original,domain:context.domain,params:task.params,preview,signal,onProgress,accountedHeapBytes:noisesnifferStreamHeapBytes()});}
    }else if(task.operation==='tampering.resampling'){
     result=await previewCachedResampling(im,im.emCache,task.params,preview,{budget,signal,onProgress,...(context.domain?{sourceRegion:{original:context.original,domain:context.domain}}:{})});
    }else if(task.operation==='tampering.resampling.fourier'){
     im.fourierPreview??=createFourierPreviewOwner(im);result=await previewCachedFourier(im,task.imageId,task.params,preview,{budget,signal,onProgress,...(context.domain?{sourceRegion:{original:context.original,domain:context.domain}}:{})});
    }else if(task.operation==='jpeg.zero'){
     const p=PIXEL_OPERATIONS['jpeg.zero'].validate(task.params),raw=im.zeroAnalysis?null:['cpu/','auto/','webgpu/',''].map(part=>budget.get(task.imageId+'\0op/jpeg.zero/'+part+JSON.stringify({missing:p.missing}))?.value?.data).find(Boolean),analysis=im.zeroAnalysis??(raw?{width:raw.width,height:raw.height,missingEnabled:p.missing,data:raw}:null);im.zeroPreview??=createZeroRetainedPreview({budget});result=await im.zeroPreview.preview(im,analysis,p,preview,{signal,...(context.domain?{sourceRegion:{original:context.original,domain:context.domain}}:{})});
    }else if(task.operation==='various.stereogram'){
     const stage=name=>budget.get(task.imageId+'\0stage/various.stereogram/'+name)?.value,search=im.stereoCache?null:stage('search'),prepared=search?stage('pattern'):null,cache=im.stereoCache??(prepared?{offset:search.offset,pattern:{width:prepared.width,height:prepared.height,format:'rgb8',data:prepared.values},flow:stage('flow')}:null);result=await previewCachedStereo(im,cache,task.params,preview,{budget,signal});
    }else{if(!m3)previewUnavailable('Run native SAFIRE before requesting its cached grouping draft.');result=await m3.preview(task,im,preview,{signal,onProgress});}
    checkAbort(signal);return{...result,id:task.id,imageId:submitted.imageId,operation:task.operation,...(context.domain?{sourceRegionDomain:context.domain.descriptor,sourceRegionOrigin:[...context.domain.origin]}:{}),metrics:{...result.metrics,totalMs:performance.now()-start},provenance:{originalSha256:im.sha256,sourceUnchanged:true,provisional:true,...(context.domain?{sourceRegionFingerprint:context.domain.fingerprint,sourceRegionOrigin:[...context.domain.origin]}:{})}};
   }finally{resident?.();busy=false;}
  },
  async localizeRetainedParameters(task,{signal,onProgress}={}){
   idle();identity(task?.id);identity(task?.imageId);requireValue(task.operation==='tampering.copyMove.sparse'&&task.params?.algorithm==='SSG','Only qualified SSG localization has this retained final path.');
   const submitted=task,sourceId=task.imageId,original=image(sourceId),revision=original.surface.descriptor.revision,context=await sourceRegions.checkPreview(task,{signal});
   idle();checkAbort(signal);requireValue(image(sourceId)===original&&original.surface.descriptor.revision===revision&&image(context.task.imageId)===context.image,'Retained localization source changed during scope preparation.');if(!m3)return null;
   busy=true;let answer;try{answer=await m3.retained(context.task,context.image,{signal,onProgress,knownHeapBytes:Math.max(RUNTIME_RESERVE,knownHeapBytes())});checkAbort(signal);if(!answer)return null;answer=await sourceRegions.decorateRetained(answer,submitted,context,{signal});checkAbort(signal);return answer;}
   catch(error){await retireFailedRetainedAnswer(answer,{release:id=>resultSurfaces.release(id),protectedIds:[original.surface?.descriptor.id,context.image.surface?.descriptor.id],primary:error});}
   finally{busy=false;}
  },
  async renderRetainedNativeParameters(input,{signal}={}){
   idle();const {task:submitted,retained}=input??{};identity(submitted?.id);identity(submitted?.imageId);
   const original=image(submitted.imageId),revision=original.surface.descriptor.revision;
   const traceEligible=submitted.operation==='tampering.copyMove.sparse'&&submitted.params?.algorithm==='SSG';
   if(traceEligible&&hasPendingWaveletStripOwners(budget)){busy=true;try{await retireWaveletStripOwners(budget,{pendingOnly:true});}finally{busy=false;}idle();}
   const priorRecord=traceEligible&&typeof retained?.surfaceId==='string'?surfaces.get(retained.surfaceId):null,previousTrace=priorRecord?.record?.retainedSparseTraceParent;
   const traceIdentity={sourceId:submitted.imageId,sourceSha256:original.sha256,sourceRevision:revision,domainFingerprint:retained?.domainFingerprint??null,cloneWindowMode:submitted.cloneWindowMode??'independent',params:submitted.params??{}};
   let traceHeadroom=0;
   if(traceEligible){const descriptor=original.surface.descriptor,n=descriptor.width*descriptor.height,d=retained?.data;requireValue(d&&ArrayBuffer.isView(d.points)&&ArrayBuffer.isView(d.pairs)&&d.colors instanceof Uint8Array&&Array.isArray(d.groups),'Complete sparse tables required before optional trace admission.');const heap=Math.ceil(Math.max(256*1024**2,n*6+d.points.length*8+d.pairs.byteLength*5+d.colors.byteLength+32*1024**2)/65536)*65536;traceHeadroom=heap+8*1024**2+n*64+d.pairs.length/4*112+2*payloadBytes(d)+Math.max(RUNTIME_RESERVE,knownHeapBytes())+sourceRegionTransportBytes(submitted.sourceRegionDomain??{}, {allowAliases:true})*4+65536;requireValue(Number.isSafeInteger(traceHeadroom),'Sparse frame admission bound');if(previousTrace?.matches(d,traceIdentity))await previousTrace.prepareFrame(traceHeadroom);}
   const context=await sourceRegions.checkPreview(submitted,{signal,retainedNativeTables:true});
   idle();checkAbort(signal);requireValue(image(submitted.imageId)===original&&original.surface.descriptor.revision===revision&&image(context.task.imageId)===context.image,'Retained render source changed during domain preparation.');
   assertRetainedNativeRender(submitted,retained,context);busy=true;let resident,view,owner,answer,bundle,traceBorrow,published=false,retainedFailed=false,retainedPrimary;
   try{
    if(submitted.operation===DENSE_OPERATION){
     // Dense public tables intentionally omit full fields. Its existing native
     // cache alone can lend the complete archive; absence never runs analysis.
     const nativeDense=context.image.strictDenseOwner?context.image.strictDenseOwner.adapter:dense;
     requireValue(typeof nativeDense?.renderRetained==='function','Retained Dense native archive is unavailable.');
     resident=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+payloadBytes(retained.data));
     answer=await nativeDense.renderRetained(context.task,context.image,{signal,expectedData:retained.data});published=true;
     answer=await sourceRegions.decorateRetained(answer,submitted,context,{signal});checkAbort(signal);return answer;
    }
    // The received complete tables are charged before any native raster is
    // allocated. This endpoint imports renderers only; it never loads a model.
    if(traceEligible){traceIdentity.domainFingerprint=context.domain?.fingerprint??null;traceBorrow=await borrowRetainedSparseTraceParent({previous:priorRecord?.imageId===context.task.imageId?previousTrace:null,result:retained.data,identity:traceIdentity,budget,signal,headroomBytes:traceHeadroom});checkAbort(signal);}
    resident=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+2*payloadBytes(retained.data));
    const ownedRetained={...retained,data:structuredClone(retained.data)};
    if(context.domain)view=await createSourceRegionView({...original.surface,sha256:original.sha256},context.domain.descriptor,{budget,signal});
    const rendered=await renderRetainedNativeTables({task:context.task,image:context.image,original,domain:context.domain,view,retained:ownedRetained,budget,signal,...(traceBorrow?{traceCommands:traceBorrow.parent}:{}),onOwner:value=>{owner=value;traceBorrow?.adopt(value);}});
    checkAbort(signal);if(traceBorrow){const parent=await traceBorrow.attach(rendered.record.surface);if(parent)rendered.record.retainedSparseTraceParent=parent;}checkAbort(signal);bundle=resultSurfaces.publishBundle(context.task.imageId,rendered.record);published=true;
    // Published surface owners now retain their native data and stores until
    // the UI has adopted a successor and acknowledges this result's release.
    owner.resources.clear();const mode=retained.cloneWindowMode;
    answer={...rendered.answer,layout:'surface',...bundle,...(mode?{cloneWindowMode:mode}:{}),layers:[{id:submitted.operation,kind:'rgb',surfaceId:bundle.surface.id,origin:[0,0],range:[0,255]},...Object.entries(bundle.rgbSurfaces??{}).map(([id,surface])=>({id,kind:'rgb',surfaceId:surface.id,origin:rendered.record.data?.fragments?.find(f=>f.id===id)?.bounds?.slice(0,2)??[0,0],range:[0,255]})),...Object.entries(bundle.maskSurfaces??{}).map(([id,surface])=>({id,kind:'mask',surfaceId:surface.id,origin:[0,0],range:surface.range,semantics:surface.semantics}))],provenance:{...rendered.answer.provenance,params:submitted.params??{},...(mode?{cloneWindowMode:mode}:{})}};
    answer=await sourceRegions.decorateRetained(answer,submitted,context,{signal});checkAbort(signal);
    if(traceEligible){await retireCompositeOwners([async()=>{await view?.dispose();view=null;},async()=>{await resident?.();resident=null;}]);checkAbort(signal);if(traceBorrow&&rendered.record.retainedSparseTraceParent)await traceBorrow.commit();checkAbort(signal);}return answer;
   }catch(error){retainedFailed=true;retainedPrimary=error;await retireCompositeOwners([()=>published?retireFailedRetainedAnswer(answer??bundle,{release:id=>resultSurfaces.release(id),protectedIds:[original.surface.descriptor.id,context.image.surface.descriptor.id],primary:error}):owner?.dispose(),()=>traceBorrow?.dispose()],{primary:error});throw error;}
   finally{if(traceEligible){try{await retireCompositeOwners([()=>view?.dispose(),()=>resident?.(),()=>traceBorrow?.dispose()],retainedFailed?{primary:retainedPrimary}:{});}finally{busy=false;}}else{try{await view?.dispose();}finally{resident?.();busy=false;}}}
  },
  async deriveSourceRegionInput(input,hooks={}){idle();identity(input?.imageId);return sourceRegions.deriveInput(input,hooks);},
  async run(task,{signal,onProgress}={}) {
   if(Object.hasOwn(task?.params??{},'equalization')){
    const plan=equalizationPlan(task.operation,task.params),answer=await api.run({...task,params:plan.base},{signal,onProgress});
    if(!plan.post)return {...answer,provenance:{...answer.provenance,params:{...answer.provenance?.params,equalization:plan.state}}};
    let record,published=false,lease,borrowed,lockedEqualization=false;const original=image(task.imageId),protectedIds=[original.surface?.descriptor.id,answer.sourceRegionSourceSurface?.id].filter(Boolean);
    try{
     idle();busy=true;lockedEqualization=true;checkAbort(signal);lease=budget.reserve(knownHeapBytes()+(answer.pixels?.data.byteLength??0));
     const input=answer.surface?surfaces.get(answer.surface.id)?.record.surface:(borrowed=contiguousSurface(answer.pixels,budget));requireValue(!!input,'Equalization requires a live RGB presentation.');
     const domain=task.sourceRegionDomain?await prepareSourceRegionDomain(original,task.sourceRegionDomain,{signal}):null;
     const offset=task.operation==='inspection.magnifier'?(answer.data?.bounds??[0,0]):[0,0],contains=domain?(x,y)=>domain.contains(x+offset[0],y+offset[1]):()=>true;
     record=await equalizationSurface(input,plan,{budget,signal,onProgress:e=>onProgress?.({id:task.id,...e}),contains,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession});checkAbort(signal);
     const previous=answer.surface,surface=resultSurfaces.publish(task.imageId,record);published=true;
     const result={...answer,pixels:undefined,surface,layout:'surface',layers:answer.layers?.map(layer=>({...layer,...(!layer.surfaceId||layer.surfaceId===previous?.id?{surfaceId:surface.id}:{})})),provenance:{...answer.provenance,params:{...answer.provenance?.params,...task.params,equalization:plan.state},presentationEqualization:record.metrics.equalization},metrics:{...answer.metrics,...record.metrics,memory:budget.snapshot()}};
     if(previous)await resultSurfaces.release(previous.id);onProgress?.({id:task.id,phase:'complete',fraction:1});return result;
    }catch(error){
     await retireCompositeOwners([()=>record?(published?resultSurfaces.release(record.surface.descriptor.id):record.surface.dispose()):undefined],{primary:error});
     await retireFailedRetainedAnswer(answer,{release:id=>resultSurfaces.release(id),protectedIds,primary:error});
    }finally{await borrowed?.dispose();lease?.();if(lockedEqualization)busy=false;}
   }
   // Temporary D2 refilters borrow an already engaged source context. They
   // cannot clear another analysis or publish/remember a replacement crop.
   if(task?.retainedD2Preview===true){
    idle();identity(task.id);requireValue(task.operation==='ai.clones.d2prl'&&typeof task.params?.refilterOf==='string'&&!!task.params.refilterOf,'A temporary D2PRL preview requires its retained native analysis.');
    if(!d2prl)throw new EngineError('CACHE_MISS','No completed D2PRL native bank.');
    busy=true;let resident,borrowed,answer;
    try{checkAbort(signal);resident=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes()));borrowed=await sourceRegions.borrowRetainedD2Preview(task,{signal});checkAbort(signal);if(!borrowed.isCurrent())throw new EngineError('CACHE_MISS','The retained D2PRL source owner changed.');answer=await d2prl.run(borrowed.task,image(borrowed.task.imageId),{signal,onProgress,knownHeapBytes:Math.max(RUNTIME_RESERVE,knownHeapBytes())});checkAbort(signal);if(!borrowed.isCurrent())throw new EngineError('CACHE_MISS','The retained D2PRL source owner changed.');return borrowed.decorate(answer);}
    catch(error){if(answer)await retireFailedRetainedAnswer(answer,{release:id=>resultSurfaces.release(id),primary:error});throw error;}
    finally{borrowed?.release();resident?.();busy=false;}
   }
   idle();identity(task?.id);if(hasPendingFileGrayOwners(budget)){busy=true;try{await retireFileGrayOwners(budget,{pendingOnly:true});}finally{busy=false;}idle();}if(hasPendingWaveletStripOwners(budget)){busy=true;try{await retireWaveletStripOwners(budget,{pendingOnly:true});}finally{busy=false;}idle();}
   if(externalCaches.size&&task.sourceRegionDomain&&['detail.wavelets','noise.blocking'].includes(task.operation)){
    let admission,failed=false,primary;busy=true;
    try{admission=await prepareWaveletPreviewHeadroom({task,original:image(task.imageId),budget,externalCaches,sourceRegions,profile,cpuKernel,runtimeBytes:Math.max(RUNTIME_RESERVE,knownHeapBytes()),mainHeapBytes:waveletStreamHeapBytes(),signal});}
    finally{busy=false;}
    try{idle();checkAbort(signal);if(admission.task.backend&&!['cpu','auto',...(PIXEL_OPERATIONS[admission.task.operation]?.backends??[])].includes(admission.task.backend))throw new EngineError('UNSUPPORTED_BACKEND','Requested backend unavailable.');const answer=await sourceRegions.run(admission.task,{signal,onProgress});return{...answer,metrics:{...answer.metrics,optionalPreviewCache:admission.decision}};}
    catch(error){failed=true;primary=error;throw error;}
    finally{busy=true;try{await admission.release();}catch(cleanup){if(!failed)throw cleanup;try{if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.cleanupErrors=[...(Array.isArray(primary.cleanupErrors)?primary.cleanupErrors:[]),cleanup];}catch{}}finally{busy=false;}}
   }
   if(externalCaches.size&&!(task.sourceRegionDomain&&['various.illuminant','noise.planes','colors.stats'].includes(task.operation))){const im=images.get(task.imageId),op=PIXEL_OPERATIONS[task.operation],eligible=['various.illuminant','noise.planes','colors.stats'].includes(task.operation),p=eligible?op.validate(task.params):null,runtimeBytes=Math.max(RUNTIME_RESERVE,knownHeapBytes());let plan=!task.sourceRegionDomain&&eligible?externalPreviewNativeHeadroom(task.operation,im,p,{runtimeBytes}):null;
    // No optional worker can lower useful native concurrency: unknown and
    // parallel adapters retire it; qualified adapters admit a complete plan.
    busy=true;try{
     if(['detail.gradient','inspection.adjust','detail.echo','noise.separation'].includes(task.operation)&&task.sourceRegionDomain){const original=image(task.imageId),transportBytes=sourceRegionTransportBytes(task.sourceRegionDomain,{allowAliases:true}),metadataBytes=runtimeBytes+transportBytes*4+65536;await externalCaches.prepare(metadataBytes,{signal});const metadata=budget.reserve(metadataBytes);try{const domain=await prepareSourceRegionDomain(original,task.sourceRegionDomain,{signal});if(['native-regions','membership'].includes(sourceRegionDomainShape(domain)))plan=task.operation==='noise.separation'?externalPreviewScopedSeparationHeadroom(task.operation,domain,PIXEL_OPERATIONS[task.operation].validate(task.params),{runtimeBytes,transportBytes,image:original}):task.operation==='detail.echo'?externalPreviewScopedEchoHeadroom(task.operation,domain,PIXEL_OPERATIONS[task.operation].validate(task.params),{runtimeBytes,transportBytes,image:original}):task.operation==='inspection.adjust'?externalPreviewScopedAdjustHeadroom(task.operation,domain,PIXEL_OPERATIONS[task.operation].validate(task.params),{runtimeBytes,transportBytes,image:original}):externalPreviewScopedGradientHeadroom(task.operation,domain,{runtimeBytes,transportBytes,image:original});}finally{metadata();}}
     if(['noise.minmax','pixels.defects'].includes(task.operation)&&task.sourceRegionDomain){const original=image(task.imageId),transportBytes=sourceRegionTransportBytes(task.sourceRegionDomain,{allowAliases:true}),coordinateBytes=sourceRegionCoordinateBytes(task),metadataBytes=runtimeBytes+transportBytes*4+coordinateBytes*4+65536;await externalCaches.prepare(metadataBytes,{signal});const metadata=budget.reserve(metadataBytes);try{const domain=await prepareSourceRegionDomain(original,task.sourceRegionDomain,{signal}),params=PIXEL_OPERATIONS[task.operation].validate(task.params);if(['native-regions','membership'].includes(sourceRegionDomainShape(domain)))plan=task.operation==='noise.minmax'?externalPreviewScopedMinmaxHeadroom(task.operation,domain,params,{runtimeBytes,transportBytes,coordinateBytes,image:original}):externalPreviewScopedDefectsHeadroom(task.operation,domain,params,{runtimeBytes,transportBytes,coordinateBytes,image:original});}finally{metadata();}}
     if(task.operation==='detail.frequency'&&task.sourceRegionDomain){const original=image(task.imageId),transportBytes=sourceRegionTransportBytes(task.sourceRegionDomain,{allowAliases:true}),metadataBytes=runtimeBytes+transportBytes*4+65536;await externalCaches.prepare(metadataBytes,{signal});const metadata=budget.reserve(metadataBytes);let view,failed=false,primary;try{const domain=await prepareSourceRegionDomain(original,task.sourceRegionDomain,{signal});PIXEL_OPERATIONS[task.operation].validate(task.params);if(['native-regions','membership'].includes(sourceRegionDomainShape(domain))){view=await createSourceRegionView({...original.surface,sha256:original.sha256},domain.descriptor,{budget,signal});plan=externalPreviewScopedFrequencyHeadroom(task.operation,domain,{runtimeBytes,transportBytes,image:original,profile,rectangles:()=>view.admittedRectangles()});}}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>view?.dispose(),()=>metadata()],failed?{primary}:{});}}
     await externalCaches.prepare(plan?.bytes??budget.limit,{signal});
    }finally{busy=false;}idle();checkAbort(signal);
   }
   if(task.sourceRegionDomain!==undefined&&task.sourceRegionDomain!==null){
    // A source adapter must preserve the backend contract of the ordinary
    // operation. Neural, OCR, dense and extension adapters own their separate
    // backend admission; the classical registry must not silently force CPU.
    const specialized=task.operation==='various.ocr'||['analysis.complete','analysis.clones','ai.clones.segmentation','ai.clones.d2prl',DENSE_OPERATION].includes(task.operation)||Object.hasOwn(M3_OPERATIONS,task.operation)||Object.hasOwn(EXTENSION_OPERATIONS,task.operation);
    if(!specialized&&(task.operation==='ela.classic'||Object.hasOwn(PIXEL_OPERATIONS,task.operation))&&task.backend&&!['cpu','auto',...(task.operation==='ela.classic'?['webgpu']:PIXEL_OPERATIONS[task.operation]?.backends??[])].includes(task.backend))throw new EngineError('UNSUPPORTED_BACKEND','Requested backend unavailable.');
    return sourceRegions.run(task,{signal,onProgress});
   }
   if(task.operation==='various.ocr'){
    identity(task.imageId);const im=image(task.imageId),p=validateOcrParams(task.params);requireValue(!!ocr,'Configure OCR resources before analysis.');requireValue(!task.regions||Array.isArray(task.regions)&&task.regions.length===0,'OCR currently reads the complete source image.');busy=true;let resident,answer,copyLease,ocrFailed=false,ocrPrimary;const started=performance.now();
    try{checkAbort(signal);resident=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes()));const d=im.surface.descriptor;answer=await ocr.analyze({...im,width:d.width,height:d.height},p,{signal,onProgress:e=>onProgress?.({id:task.id,...e}),backend:task.backend??'auto'});checkAbort(signal);copyLease=budget.reserve(ocrPayloadBytes(answer.data)+ocrPayloadBytes(answer.metadata)+65536);const data=structuredClone(answer.data),metadata=structuredClone(answer.metadata);return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',data,layers:[],provenance:{engine:VERSION,operation:task.operation,originalSha256:im.sha256,sourceUnchanged:true,params:p,ocr:metadata},metrics:{...answer.metrics,totalMs:performance.now()-started,memory:budget.snapshot()}};}catch(error){ocrFailed=true;ocrPrimary=error;throw error;}finally{try{await retireCompositeOwners([()=>answer?.release(),()=>copyLease?.(),()=>resident?.()],ocrFailed?{primary:ocrPrimary}:{});}finally{busy=false;}}
   }
   if(dense&&task.operation!==DENSE_OPERATION){busy=true;try{await dense.clearImage(task.imageId,{preservePublished:true});}finally{busy=false;}}
   if(['analysis.complete','analysis.clones'].includes(task.operation)){sourceRegions.clearContexts(['analysis.complete','analysis.clones']);const im=image(task.imageId);busy=true;let resident;try{resident=budget.reserve(knownHeapBytes());return await(await automaticAdapter()).run(task,im,{signal,onProgress:e=>onProgress?.({id:task.id,...e})});}finally{resident?.();busy=false;}}
   if(task.operation==='ai.clones.segmentation'){const im=image(task.imageId);busy=true;try{const answer=await(await segmentationAdapter()).run(task,im,{signal,onProgress,knownHeapBytes:Math.max(RUNTIME_RESERVE,knownHeapBytes())});if(!task.params?.reprojectOf)sourceRegions.clearContexts(['ai.clones.segmentation']);return answer;}finally{busy=false;}}
   if(task.operation===DENSE_OPERATION){const im=image(task.imageId);busy=true;try{return await(await denseAdapter()).run(task,im,{signal,onProgress,knownHeapBytes:Math.max(RUNTIME_RESERVE,knownHeapBytes())});}finally{busy=false;}}
   if(Object.hasOwn(M3_OPERATIONS,task.operation)){const im=image(task.imageId);busy=true;try{const compute=async()=>(await m3Adapter()).run(task,im,{signal,onProgress,knownHeapBytes:Math.max(RUNTIME_RESERVE,knownHeapBytes())});return (await m3Adapter()).requiresFullPixels(task,im)?await withM3Pixels([im],{signal},compute):await compute();}finally{busy=false;}}
   if(Object.hasOwn(EXTENSION_OPERATIONS,task.operation)){const im=image(task.imageId);busy=true;try{const batch=await extensionsAdapter().run(task,im,{signal,onProgress,knownHeapBytes:Math.max(RUNTIME_RESERVE,knownHeapBytes())});const result=batch.results[0];if(result.status!=='ok')throw new EngineError(result.error?.code??'EXTENSION_ERROR',result.error?.message??'Extension analysis failed.',{details:result.error?.details});return {...result,metrics:{...batch.metrics,...result.metrics}};}finally{busy=false;}}
   if(task.operation==='ai.clones.d2prl'){const im=image(task.imageId);busy=true;try{await automatic?.clear();sourceRegions.clearContexts(['analysis.complete','analysis.clones']);const answer=await(await d2prlAdapter()).run(task,im,{signal,onProgress,knownHeapBytes:Math.max(RUNTIME_RESERVE,knownHeapBytes())});if(!task.params?.refilterOf)sourceRegions.clearContexts(['ai.clones.d2prl']);return answer;}finally{busy=false;}}
   if(task.operation!=='ela.classic'&&!Object.hasOwn(PIXEL_OPERATIONS,task.operation))throw new EngineError('UNSUPPORTED_OPERATION','Operation unavailable.');
   if(task.backend && !['cpu','auto',...(task.operation==='ela.classic'?['webgpu']:PIXEL_OPERATIONS[task.operation]?.backends??[])].includes(task.backend))throw new EngineError('UNSUPPORTED_BACKEND','Requested backend unavailable.');
   if(task.regions && (!Array.isArray(task.regions)||task.regions.length))throw new EngineError('UNSUPPORTED_REGION','This operation currently supports the full image only.');
   const selected=image(task.imageId);
   if(task.operation==='jpeg.multiple'&&(selected.segmented||doubleJpegAdmission(null,{},selected.bytes)+32*1024**2>512*1024**2))return runPagedJpegEvidence(task,selected,{signal,onProgress});
   if(task.operation==='metadata.exiftool')return runExiftool(task,selected,{signal,onProgress});
   if(task.operation==='metadata.c2pa')return runC2pa(task,selected,{signal,onProgress});
   if(['metadata.structure','file.hex','file.digest'].includes(task.operation)){
    const p=PIXEL_OPERATIONS[task.operation].validate(task.params);
    if(['file.hex','metadata.structure'].includes(task.operation)||!p.imageHashes||selected.segmented)return runOriginalBytes(task,selected,p,{signal,onProgress});
   }
   if(['tampering.copyMove.brisk','tampering.copyMove.orb','tampering.copyMove.akaze'].includes(task.operation)){
    const p=PIXEL_OPERATIONS[task.operation].validate(task.params),references=p.maskImageId?[image(p.maskImageId)]:[];
    if(selected.segmented||references.some(r=>r.segmented)){busy=true;let record,published=false;try{
     const result=await withM3Pixels([selected,...references],{signal},()=>runPixels(task,{signal,onProgress:e=>onProgress?.({...e,phase:e.phase==='complete'?'storing':e.phase,fraction:e.fraction*.98})}));busy=true;
     record=await createCloningSurface(selected,result,{budget,signal,knownHeapBytes:knownHeapBytes()});onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);const surface=resultSurfaces.publish(task.imageId,record);published=true;
     delete result.pixels;return {...result,layout:'surface',surface,layers:[{id:task.operation,kind:'rgb',origin:[0,0],range:[0,255],surfaceId:surface.id,width:surface.width,height:surface.height}],metrics:{...result.metrics,resultStorage:record.storage,memory:budget.snapshot()}};
    }finally{if(record&&!published)await record.surface.dispose();busy=false;}}
   }
   if(task.operation==='comparison.image'){const p=PIXEL_OPERATIONS[task.operation].validate(task.params),ids=PIXEL_OPERATIONS[task.operation].references(p);ids.forEach(identity);const reference=image(ids[0]);if(selected.segmented||reference.segmented||cpuKernel!=='reference'&&(task.backend??'auto')!=='cpu'&&selected.pixels.width*selected.pixels.height>=250000&&['ssim','butter'].includes(p.view))return runSegmentedComparison(task,selected,p,{signal,onProgress});}
   if(['detail.wavelets','noise.blocking'].includes(task.operation)&&!selected.segmented&&task.backend==='webgpu'&&cpuKernel!=='reference')return runSegmentedResult(task,selected,PIXEL_OPERATIONS[task.operation].validate(task.params),{signal,onProgress});
   if(task.operation==='noise.prnu'&&!selected.segmented&&cpuKernel!=='reference'&&(task.backend??'auto')!=='cpu'&&selected.pixels.width*selected.pixels.height>=65536)return runSegmentedPrnu(task,selected,PIXEL_OPERATIONS[task.operation].validate(task.params),{signal,onProgress});
   if(task.operation==='jpeg.zero'&&!selected.segmented&&cpuKernel!=='reference'&&(task.backend==='webgpu'||selected.zeroAnalysis)&&selected.pixels.width*selected.pixels.height>=65536)return runSegmentedZero(task,selected,{signal,onProgress});
   if(task.operation==='tampering.resampling')return runSegmentedResult(task,selected,PIXEL_OPERATIONS[task.operation].validate(task.params),{signal,onProgress});
   if(task.operation==='tampering.resampling.fourier'&&!selected.segmented&&(task.backend==='webgpu'||selected.resamplingCache)&&cpuKernel!=='reference'&&selected.pixels.width*selected.pixels.height>=65536)return runSegmentedResult(task,selected,PIXEL_OPERATIONS[task.operation].validate(task.params),{signal,onProgress});
   if(selected.segmented){
    if(task.operation!=='detail.gradient')releaseGradientWasm();if(task.operation!=='inspection.adjust')releaseAdjustWasm();if(task.operation!=='noise.separation')releaseSeparationWasm();if(task.operation!=='tampering.contrast')releaseContrastWasm();
    if(task.operation==='metadata.thumbnail')return runSegmentedThumbnail(task,selected,{signal,onProgress});
    if(task.operation==='ela.energy')return runSegmentedEnergy(task,selected,{signal,onProgress});
    if(task.operation==='jpeg.zero')return runSegmentedZero(task,selected,{signal,onProgress});
    if(task.operation==='ela.biomes')return runSegmentedBiomes(task,selected,{signal,onProgress});
    if(task.operation==='ela.classic')return runSegmentedEla(task,selected,{signal,onProgress});
    if(task.operation==='jpeg.ghosts')return runSegmentedGhost(task,selected,{signal,onProgress});
    if(['jpeg.recompression','jpeg.quality'].includes(task.operation))return runSegmentedJpegCurve(task,selected,{signal,onProgress});
    if(task.operation==='colors.plots')return runSegmentedPlots(task,selected,PIXEL_OPERATIONS[task.operation].validate(task.params),{signal,onProgress});
    if(task.operation==='inspection.magnifier')return runSegmentedMagnifier(task,selected,PIXEL_OPERATIONS[task.operation].validate(task.params),{signal,onProgress});
    if(task.operation==='noise.prnu')return runSegmentedPrnu(task,selected,PIXEL_OPERATIONS[task.operation].validate(task.params),{signal,onProgress});
    if(['various.stereogram','noise.noisesniffer','comparison.image','tampering.resampling','tampering.resampling.fourier','noise.prnu','detail.frequency','noise.blocking','detail.wavelets','colors.pca','inspection.adjust','noise.separation','various.median','tampering.contrast','various.illuminant','detail.echo','detail.gradient','colors.space','colors.stats','noise.planes','noise.minmax','pixels.defects'].includes(task.operation))return runSegmentedResult(task,selected,PIXEL_OPERATIONS[task.operation].validate(task.params),{signal,onProgress});
    requireSegmentedOperation(task.operation);const p=PIXEL_OPERATIONS[task.operation].validate(task.params),started=performance.now(),key=task.imageId+'\0segmented/histogram';busy=true;let outputRelease,resident;
    try{resident=budget.reserve(knownHeapBytes());let base=budget.get(key)?.value;const cached=!!base;if(!base){base=await segmentedHistogram(selected.store,p,{budget,signal,onProgress:f=>onProgress?.({id:task.id,phase:'kernel',fraction:f})});budget.put(key,{value:base,byteLength:payloadBytes(base)});}outputRelease=budget.reserve(payloadBytes(base)*2);const owned=structuredClone(base);histogramView(owned,p);checkAbort(signal);return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...owned,layers:[],provenance:{engine:VERSION,operation:task.operation,params:p,backend:'cpu',originalSha256:selected.sha256,decode:structuredClone(selected.provenance),native:PIXEL_OPERATIONS[task.operation].native,kernelParity:'Native global histogram corpus exact; complete source is visited',layout:'segmented'},metrics:{totalMs:performance.now()-started,workers:cached?0:1,cache:{result:cached,analysis:cached},memory:budget.snapshot()}};}finally{outputRelease?.();resident?.();busy=false;}
   }
   if(task.operation!=='ela.classic')return runPixels(task,{signal,onProgress});
   const p=validateParams(task.params),im=image(task.imageId),n=im.pixels.data.length;
   const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+n*16);busy=true;
   const start=performance.now(),prefix=task.imageId+'\0',qkey=prefix+'q'+p.quality,bkey=qkey+'/'+p.linear;
   const fused=cpuKernel!=='reference'&&n>=786432;
   const tableKey=prefix+'lut/'+p.scale+'/'+p.contrast+'/'+p.linear;
   const rkey=bkey+'/'+p.scale+'/'+p.contrast+'/'+p.grayscale;
   const metrics={codecMs:0,kernelMs:0,cache:{recompressed:false,base:false,result:false}};
   const progress=(phase,fraction)=>onProgress?.({id:task.id,phase,fraction});
   let compressed,base,result,table,executionMethod,gpuBodyMs=0;const elaProfileKey=JSON.stringify([cpuKernel,profile.id,profile.maxWorkers,profile.memoryBudgetSource??'']),elaService=codec===imageCodec&&cpuKernel!=='reference'?getElaGpuService(budget):null,elaHooks={signal,backend:task.backend??'auto',profileKey:elaProfileKey,onProgress:f=>progress('render',f)};
   try {
    await checkpoint(signal);result=budget.get(rkey);metrics.cache.result=!!result;if(result)Object.assign(metrics,elaCachedExecutions.get(result)??{backend:'cpu',kernel:'cached-native-ELA'});
    if(!result&&elaService){compressed=budget.get(qkey);metrics.cache.recompressed=!!compressed;executionMethod=compressed?'residual':'compose';}
    if(!result&&elaService&&elaService.wantsGpu(executionMethod,im.pixels.data,im.pixels.width,im.pixels.height,p,elaHooks)){
     const gpuStarted=performance.now();table=budget.get(tableKey);metrics.cache.table=!!table;if(!table)table=await toneTable(p,{signal});let owned,failed=false,primary;
     try{owned=compressed?await elaService.residual(im.pixels.data,compressed,im.pixels.width,im.pixels.height,p,table,elaHooks):await elaService.compose(im.pixels.data,im.pixels.width,im.pixels.height,p,table,elaHooks);if(owned){result=copyTypedArray(owned.data,{label:'ELA-native-result-cache'});if(!compressed)compressed=copyTypedArray(owned.recompressed,{label:'ELA-native-recompression-cache'});Object.assign(metrics,{backend:'webgpu',kernel:owned.runtime.kernel,kernelMs:owned.runtime.kernelMs,gpu:owned.runtime,workers:0});}}
     catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>owned?.release()],failed?{primary}:{});}
     gpuBodyMs=performance.now()-gpuStarted;Object.assign(metrics,elaService.metrics());
    }
    if(!result && fused){
     compressed=budget.get(qkey);metrics.cache.recompressed=!!compressed;
     if(!compressed){progress('jpeg',0);const t=performance.now();const decoded=await codec.recompress(im.pixels,p.quality,{signal});validatePixels(decoded);requireValue(decoded.width===im.pixels.width&&decoded.height===im.pixels.height,'Codec changed dimensions.');compressed=decoded.data;metrics.codecMs=performance.now()-t;}
     const t=performance.now();if(!table){table=budget.get(tableKey);metrics.cache.table=!!table;}if(!table)table=await toneTable(p,{signal});
     if(n>=3145728&&cpuKernel==='auto'){const run=await pool.run(im.pixels.data,compressed,p,table,{signal});result=run.data;metrics.workers=run.workers;metrics.scheduling=run.scheduling;}else{result=await fusedCpu(im.pixels.data,compressed,p,table,{signal});metrics.workers=1;}metrics.kernelMs=performance.now()-t;metrics.kernel='cpu-lookup';
    } else if(!result) {
     metrics.kernel='cpu-reference';
     base=budget.get(bkey);metrics.cache.base=!!base;
     if(!base) {
      compressed=budget.get(qkey);metrics.cache.recompressed=!!compressed;
      if(!compressed){progress('jpeg',0);const t=performance.now();const decoded=await codec.recompress(im.pixels,p.quality,{signal});validatePixels(decoded);requireValue(decoded.width===im.pixels.width&&decoded.height===im.pixels.height,'Codec changed dimensions.');compressed=decoded.data;metrics.codecMs=performance.now()-t;}
      const t=performance.now();base=await elaBase(im.pixels.data,compressed,p.linear,{signal,onProgress:f=>progress('base',f)});metrics.kernelMs+=performance.now()-t;
     }
     const t=performance.now();result=await elaRender(base,p,{signal,onProgress:f=>progress('render',f)});metrics.kernelMs+=performance.now()-t;
    }
    checkAbort(signal);
    const pixels={width:im.pixels.width,height:im.pixels.height,format:'rgb8',data:result.slice()};
    const provenance={engine:VERSION,operation:'ela.classic',params:p,backend:metrics.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),codec:{id:codec.id,options:{...JPEG_OPTIONS,quality:p.quality},parity:codec.parity??'unverified'},kernelParity:'bit-exact on synthetic native reference; see fixtures/reference.json',semantics:'JPEG residual visualization; not a detection or authenticity verdict'};
    progress('complete',1);metrics.totalMs=performance.now()-start;
    release();elaCachedExecutions.set(result,{backend:metrics.backend??'cpu',kernel:metrics.kernel});if(table)budget.put(tableKey,table);if(compressed)budget.put(qkey,compressed);if(base)budget.put(bkey,base);budget.put(rkey,result);
    const nativePair=compressed??budget.get(qkey);if(nativePair){const capture=classicPreview.beginCapture(task.imageId,im,p);if(capture)try{capture.captureBand(im.pixels.data,nativePair,{y:0,rows:im.pixels.height});capture.finish();}finally{capture.dispose();}}
    metrics.memory={...budget.snapshot(),codecHeapCapacityBytes:(codec.memoryBytes?.()??0)+waveletHeapBytes()+zeroHeapBytes(),hdf5HeapCapacityBytes:prnuHdf5HeapBytes()};
    if(!metrics.cache.result&&elaService&&fused){const observedBackend=metrics.backend==='webgpu'?'webgpu':'cpu';elaService.observeCompleted(im.pixels.data,im.pixels.width,im.pixels.height,p,{method:executionMethod,backend:observedBackend,milliseconds:observedBackend==='webgpu'?gpuBodyMs:metrics.codecMs+metrics.kernelMs,compileMs:observedBackend==='webgpu'?(metrics.gpu?.compileMs??0):0,profileKey:elaProfileKey});metrics.autoBackendChoice=elaService.policySnapshot(executionMethod,im.pixels.data,im.pixels.width,im.pixels.height,p,{profileKey:elaProfileKey});}
    return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',pixels,layers:[{id:'ela',name:'ELA classique',kind:'rgb',origin:[0,0],range:[0,255]}],provenance,metrics};
   } finally {if(budget.active>0)release();busy=false;}
  },
  async previewElaClassic({imageId,params,side=320,sourceRegionDomain},{signal}={}){
   if(Object.hasOwn(params??{},'equalization')){
    const plan=equalizationPlan('ela.classic',params),answer=await api.previewElaClassic({imageId,params:plan.base,side,sourceRegionDomain},{signal});if(!plan.post)return answer;
    idle();busy=true;let release;try{release=budget.reserve(knownHeapBytes()+answer.pixels.data.byteLength);return{...answer,pixels:await equalizationPixels(answer.pixels,plan,{budget,signal}),presentation:{...answer.presentation,equalization:plan.state,provisional:true}};}finally{release?.();busy=false;}
   }
   idle();const p=validateParams(params),task={imageId,operation:'ela.classic',params:p,sourceRegionDomain};
   // The legacy path acquires its lock before returning a promise. Scoped
   // admission may yield: recheck after it, before claiming the same engine.
   const context=sourceRegionDomain?await sourceRegions.checkPreview(task,{signal,retainedNativeTables:true}):{task,image:image(imageId),domain:null};
   idle();busy=true;let resident,failed=false;
   try{await retireClassicPreviewSources();resident=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes()));let answer;if(context.domain&&!['identity','rectangle'].includes(sourceRegionDomainShape(context.domain))){const view=await createSourceRegionView({...context.original.surface,sha256:context.original.sha256},context.domain.descriptor,{budget,signal});classicPreviewSourceOwners.add(view);answer=await previewSourceRegionClassic({imageId:context.task.imageId,params:p,side,original:context.original,derived:context.image,view,domain:context.domain,budget,codec:analysisCodec,signal});}else answer=await classicPreview.preview(context.task.imageId,context.image,p,side,{signal});return{...answer,...(context.domain?{sourceRegionDomain:context.domain.descriptor,sourceRegionOrigin:[...context.domain.origin]}:{})};}
   catch(error){failed=true;throw error;}
   finally{try{await retireClassicPreviewSources();}catch(error){if(!failed)throw error;}finally{resident?.();busy=false;}}
  },
  async exportResultFile(result,request={},hooks={}){idle();busy=true;let resident,archive;try{resident=budget.reserve(knownHeapBytes()+payloadBytes(result));const {streamResultJson}=await import('./json-export-stream.js');archive=await streamResultJson(result,request,{...hooks,budget,onTemporarySession});hooks.onProgress?.({phase:'complete',fraction:1});checkAbort(hooks.signal);const shape=result.surface??result.pixels??{};return rasterExports.adopt(archive,{imageId:result.imageId,operation:result.operation,originalSha256:result.provenance?.originalSha256,width:shape.width,height:shape.height});}catch(error){await archive?.dispose();throw error;}finally{resident?.();busy=false;}},
  exportResult(result,options={}){idle();if(options.format==='npz'&&['analysis.complete','analysis.clones'].includes(result?.operation))throw new EngineError('UNSUPPORTED_EXPORT','Use exportAutomatic({analysisId}) and readExport pages for complete scientific evidence.');if(options.format==='npz'&&[DENSE_OPERATION,...Object.keys(EXTENSION_OPERATIONS),'ai.clones.d2prl','ai.clones.segmentation','jpeg.zero','ela.energy'].includes(result?.operation)&&result.layout==='surface')throw new EngineError('UNSUPPORTED_EXPORT','Use exportSurface with format npz and readExport pages for segmented scientific results.');if(options.format==='csv'&&result?.tables?.candidates)throw new EngineError('UNSUPPORTED_EXPORT','Use readTableCsv pages for a stored candidate table.');const maximum=options.maxBytes??32*1024**2;requireValue(Number.isSafeInteger(maximum)&&maximum>0,'Positive export byte limit required.');const json=(options.format??'json')==='json',bound=json?jsonExportBound(result):maximum;if(json&&bound>maximum)throw new EngineError('MEMORY_LIMIT','JSON export exceeds its conservative byte budget.');const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+payloadBytes(result)+(json?3*bound:maximum));try{return exportAnalysis(result,{...options,maxBytes:maximum});}finally{release();}},
  imagePixels(id){idle();const im=image(id);if(im.segmented)throw new EngineError('UNSUPPORTED_LAYOUT','Use readPixels for the segmented surface.');const release=budget.reserve(knownHeapBytes()+im.pixels.data.byteLength);try{return copyPixels(im.pixels);}finally{release();}},
  original(id){idle();const im=asset(id);if(im.segmented)throw new EngineError('UNSUPPORTED_LAYOUT','Use originalBlob or readOriginal for this source.');const release=budget.reserve(knownHeapBytes()+im.bytes.byteLength);try{return im.bytes.slice();}finally{release();}},
  unload(id){
   idle();if(hasObservedNlmGpuRetirements(budget)){busy=true;return drainObservedNlmGpuRetirements(budget).then(()=>{busy=false;return api.unload(id);}).finally(()=>{busy=false;});}if(hasMedianGpuRetirements(budget)){busy=true;return drainMedianGpuRetirements(budget).then(()=>{busy=false;return api.unload(id);}).finally(()=>{busy=false;});}if(hasPendingFileGrayOwners(budget)){busy=true;return retireFileGrayOwners(budget,{pendingOnly:true}).then(()=>{busy=false;return api.unload(id);}).finally(()=>{busy=false;});}if(hasPendingWaveletStripOwners(budget)){busy=true;return retireWaveletStripOwners(budget,{pendingOnly:true}).then(()=>{busy=false;return api.unload(id);}).finally(()=>{busy=false;});}if(classicPreviewSourceOwners.size){busy=true;return retireClassicPreviewSources().then(()=>{busy=false;return api.unload(id);}).finally(()=>{busy=false;});}const pendingPreview=images.get(id);if(hasCachedPreviewSamples(pendingPreview)){busy=true;return (async()=>{await retireCachedPreviewSamples(pendingPreview);busy=false;return await api.unload(id);})().finally(()=>{busy=false;});}if(sourceRegions.owns(id)){busy=true;return sourceRegions.clear(id).finally(()=>{busy=false;});}const im=asset(id),forget=()=>{images.delete(id);for(const value of images.values())if(value.comparisonCache?.reference===im)value.comparisonCache=null;if(im.surface)surfaces.delete(im.surface.descriptor.id);budget.retained-=im.retainedBytes;budget.clearPrefix(id+'\0');budget.clearDependencies(id);if(images.size===0){frequencyGpu.dispose();forgetJpegGrayCurvePolicy(budget);}};
   if(hasGhostJpegResources(budget)||hasJpegGrayCurveResources(budget)||sourceRegions.size||ocr||m3||im.segmented||im.zeroAnalysis||im.zeroPreview||im.doubleJpegOwner||im.prnuCache||im.waveletCache||im.blockingCache||im.emCache||im.energyCache||im.energyScoreGpu||im.resamplingCache||im.fourierPresentationGpu||im.fourierPreview||automatic?.active||d2prl||segmentation||dense||extensions||im.database?.dispose||im.encodedArchive||resultSurfaces.hasFor(id)){
    busy=true;return (async()=>{await disposeGhostJpegService(budget);await disposeJpegGrayCurveService(budget);await retireComparisonReferenceOwners(id);await sourceRegions.clear(id);await ocr?.clearCache(id);await m3?.clearImages(id);await extensions?.clearImages(id);await dense?.clearImage(id);await automatic?.clear();sourceRegions.clearContexts(['analysis.complete','analysis.clones']);await d2prl?.clearImages();await segmentation?.clearImages();await resultSurfaces.clear(id);await retireRecordOwner(im,'neuralInput');await retireCompositeOwners([()=>retireRecordOwner(im,'model'),()=>retireRecordOwner(im,'database'),()=>retireRecordOwner(im,'encodedArchive','release')]);await disposeSegmentedImage(im);forget();})().finally(()=>{busy=false;});
   }
   im.model?.dispose();im.surface?.dispose();forget();
  },
  dispose(){
   if(shutdownTask)return shutdownTask;if(disposed)alive();if(!shutdownStarted)idle();shutdownStarted=true;busy=true;
   if(!shutdownPlan){
    // Acknowledged stages are never repeated. Rejected stages retain their
    // exact owner for the next explicit dispose call, including frozen errors.
    const once=retire=>{let done=false,pending;return()=>{if(done)return;if(pending)return pending;const task=Promise.resolve().then(retire).then(()=>{done=true;});pending=task;void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;};};
    const samples=[...images.values()].map(im=>once(()=>retireCachedPreviewSamples(im))),originals=[...images].filter(([id])=>!sourceRegions.owns(id));
    const dependencies=[()=>retireClassicPreviewSources(),()=>externalCaches.dispose(),()=>sourceRegions.clear(),()=>m3?.dispose(),()=>ocr?.dispose(),()=>extensions?.dispose(),()=>dense?.dispose(),()=>automatic?.dispose(),()=>d2prl?.dispose(),()=>segmentation?.dispose(),()=>resultSurfaces.clear(),()=>rasterExports.clear()].map(once);
    const sources=originals.map(([id,im])=>{
     const resources=[()=>retireRecordOwner(im,'model'),()=>retireRecordOwner(im,'database'),()=>retireRecordOwner(im,'encodedArchive','release')].map(once);
     return once(async()=>{await retireRecordOwner(im,'neuralInput');await retireCompositeOwners(resources);await disposeSegmentedImage(im);if(images.get(id)===im){images.delete(id);if(im.surface)surfaces.delete(im.surface.descriptor.id);budget.retained-=im.retainedBytes;}});
    });
    const final=[()=>externalCaches.close(),...Array.from(externalMemory,([key,release])=>async()=>{await release();externalMemory.delete(key);}),()=>disposeGhostJpegService(budget),()=>execution.dispose(),()=>segmentedQualityAdaptive.clear(),()=>segmentedGhostAdaptive.clear(),()=>segmentedZeroAdaptive.clear(),()=>segmentedEnergyAdaptive.clear(),()=>pagedAkaze?.dispose(),()=>echoAdaptive.clear(),()=>separationAdaptive.clear(),()=>adjustAdaptive.clear(),()=>pool.dispose(),()=>disposeElaGpuService(budget),()=>disposeJpegGrayCurveService(budget),()=>qualityPool.dispose(),()=>medianPool.dispose(),()=>resamplingViewPool.dispose(),()=>cloningGroupPool.dispose(),()=>zeroPool.dispose(),()=>noisesnifferPool.dispose(),()=>frequencyGpu.dispose()].map(once);
    shutdownPlan=async()=>{
     await retireCompositeOwners([()=>drainMedianGpuRetirements(budget),()=>drainObservedNlmGpuRetirements(budget)]);
     // A rejected transform endpoint keeps its source, cache and credit alive.
     await retireFileGrayOwners(budget);
     await retireWaveletStripOwners(budget);
     await retireCompositeOwners(samples);
     // Dependants can still owe source-window ACKs. Keep their Original sources
     // intact until all result, archive and analyzer owners have acknowledged.
     await retireCompositeOwners(dependencies);
     await retireCompositeOwners(sources);
     await retireCompositeOwners(final);
     images.clear();surfaces.clear();budget.clear();disposed=true;retirementDiagnostics?.close();
    };
   }
   const task=Promise.resolve().then(()=>shutdownPlan());shutdownTask=task;void task.finally(()=>{if(shutdownTask===task)shutdownTask=null;busy=false;}).catch(()=>{});return task;
  }
 };
 // Metadata at the actual public completion boundary, after all existing ACKs.
 // Recursive source-domain calls are not independent completed operations.
 const runWithoutEvidence=api.run,acknowledgedScalarCaches=new WeakSet();let usefulRunDepth=0;
 api.run=async(task,hooks)=>{task=efficientLoFtrComparisonTask(task);const outer=usefulRunDepth++===0;let owner;try{if(outer)try{owner=nativeUsefulOwner(task,{version:VERSION,profile,budget,cpuKernel,image:image(task.imageId),getReference:asset,m3Resources:m3?.usefulSnapshot?.(),extensionResources:extensions?.usefulSnapshot?.(),automaticResources:automatic?.usefulSnapshot?.(),d2Admission:d2prlUsefulAdmission(budget)});}catch{}const answer=await runWithoutEvidence.call(api,task,hooks);if(!outer||!owner)return answer;try{const key=nativeUsefulCacheKey(task,answer),raw=key?budget.cache.get(key)?.value:null,hit=answer.metrics?.cache?.result===true||answer.metrics?.analysisCacheHit===true,attested=nativeUsefulEvidence(owner,answer,{cacheAcknowledged:!!raw&&typeof raw==='object'&&acknowledgedScalarCaches.has(raw)});if(!hit&&raw&&typeof raw==='object')acknowledgedScalarCaches.add(raw);return attested?{...answer,metrics:{...answer.metrics,usefulWork:attested}}:answer;}catch{return answer;}}finally{usefulRunDepth--;}};
 if(waveletRetirementDiagnostics){retirementDiagnostics=createWaveletRetirementDiagnostics(budget);api.waveletRetirementDiagnostics=Object.freeze({begin:retirementDiagnostics.begin,snapshot:retirementDiagnostics.snapshot,end:retirementDiagnostics.end});}return api;
}

export {createTruforAnalyzer} from './trufor-analyzer.js';

export {createCompositeAnalyzer} from './composite-analyzer.js';

export {createCatnetAnalyzer} from './catnet-analyzer.js';

export {createCfaAnalyzer} from './cfa-analyzer.js';

export {createM2WorkerClient} from './m2-worker-client.js';
export {SPARSE_COPY_ALGORITHMS,sparseCopyParams} from './sparse-copy.js';
export {sparseCopyViewParams} from './sparse-copy-view.js';
export {SAFIRE_MODEL} from './safire.js';
export {FOCAL_MODEL} from './focal-assets.js';
export {ADAIFL_MODEL} from './adaifl-assets.js';
export {XFEAT_MODEL} from './learned-feature.js';
export {ALIKED_MODELS} from './aliked-assets.js';
export {SPARSE_GLUE_PAGED_MODELS} from './sparse-glue-paged-assets.js';
export {SPARSE_GLUE_MODELS} from './sparse-glue.js';

export {XFEAT_PAGED_MODEL} from './xfeat-paged-assets.js';
