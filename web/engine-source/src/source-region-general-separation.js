import {groupSeparationColorCores} from './separation-color-batch-plan.js';
import {executeSeparationColorGroup} from './separation-color-core-groups.js';
import {humanNlmRecompute} from './nlm-recompute-intent.js';
import {holdNlmRecomputeCache} from './nlm-recompute-cache.js';
import {hasObservedNlmGpuRetirements,drainObservedNlmGpuRetirements} from './observed-nlm-gpu-retirement.js';
import {groupNlmBoundaryCores,executeNlmAtlasGroup} from './nlm-atlas-core-groups.js';
import {migrationWorkspaceBytes} from './migration-workspace.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {openSeparationGpu} from './separation-gpu-session.js';
import {openUsefulNlmSession} from './useful-nlm-session.js';
import {EngineError,checkAbort,createCooperator,normalizeResourceError} from './errors.js';
import {PIXEL_OPERATIONS} from './pixel-operations.js';
import {separationHalo,separationHeapBytes,separationRuntimeState,SEPARATION_HEAP_BYTES} from './separation-math.js';
import {nlmUsefulWork} from './nlm-useful-work-contract.js';
import {separationStage} from './separation-stage.js';
import {equalizeHistogramLut} from './pixel-utils.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {sourceRegionObservedSeparation,sourceRegionSeparationBoundaryRuns,observedSeparationWorkingBytes} from './source-region-observed-separation.js';
import {sourceRegionLocalCores,sourceRegionLocalSupport} from './source-region-local-support.js';

export async function sourceRegionSeparation({task,original,view,domain,budget,signal,onProgress,publishResult}){
 const p=PIXEL_OPERATIONS['noise.separation'].validate(task.params),width=domain.width,height=domain.height,radius=separationHalo(p),cooperate=createCooperator(signal),completeCores=()=>sourceRegionLocalCores(domain,{radius,maxWidth:128,maxHeight:64}),cores=function*(){yield*completeCores();yield*sourceRegionSeparationBoundaryRuns(domain,{radius,maxWidth:128});},key=task.imageId+'\0source-region/separation-observed-v1/'+domain.fingerprint+'/'+[p.mode,p.radius,p.mode===3?p.sigma:0,+p.grayscale,+p.denoised].join('/');
 const recompute=humanNlmRecompute(task),priorRetirementPending=p.mode===4&&hasObservedNlmGpuRetirements(budget);if(p.mode===4){await drainObservedNlmGpuRetirements(budget);checkAbort(signal);}
 const nativeBefore=p.mode===4?separationRuntimeState():null;
 let completeSupportPixels=0;for(const core of completeCores())completeSupportPixels+=core.width*core.height;const analysed=domain.countIncluded,boundaryPixels=analysed-completeSupportPixels;if(!analysed)throw new EngineError('SOURCE_SCOPE_EMPTY','The separation selection is empty.');
 // Preserve the historical Auto route until the central bridge has a qualified indication.
 const smallNlmCpu=p.mode===4&&analysed<65536&&(task.backend??'auto')==='auto',usefulNlm=p.mode===4&&task.backend==='webgpu';
 const cached=recompute?null:budget.get(key)?.value,cacheBytes=analysed*3+(p.denoised?0:6144),make=bytes=>createSegmentedBytes(bytes,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal});
 let output,scope,surface,scopeSurface,extraHeap,staging,cacheLease,cacheData,cacheProducer,published=false,failed=false,failure,histograms=cached?.histograms??null,reads=0,jobs=0,gpu,recomputeCache;
 async function writeCore(core,bytes){for(let row=0;row<core.height;row++)await output.write(bytes.subarray(row*core.width*3,(row+1)*core.width*3),((core.y+row)*width+core.x)*3);}
 try{
  if(recompute)recomputeCache=holdNlmRecomputeCache({budget,key,dependencies:[task.imageId],retire:()=>gpu?.dispose()});
  // The scoped runtime already protects loaded heaps. Only a newly created
  // native arithmetic heap adds live capacity during this invocation.
  if(!cached){if(usefulNlm)gpu=await openUsefulNlmSession({budget,signal,backend:task.backend});else gpu=await openSeparationGpu({budget,backend:smallNlmCpu?'cpu':task.backend??'auto',signal,batchColor:p.mode===0});}
  extraHeap=budget.reserve(cached?0:Math.max(0,SEPARATION_HEAP_BYTES-separationHeapBytes()));if(cached)cacheLease=budget.reserve(cacheBytes);
  staging=budget.reserve(Math.max((128+2*radius)*(64+2*radius)*12,observedSeparationWorkingBytes(128,radius))+6144+131072);if(!cached&&!p.denoised)histograms=new Float64Array(768);output=await make(width*height*3);scope=await make(width*height);
  if(!recompute&&!cached&&cacheBytes<=budget.limit-budget.total()){cacheLease=budget.reserve(cacheBytes);cacheData=new Uint8Array(analysed*3);}
  const group=Math.max(1,Math.floor(32768/width));for(let y=0;y<height;y+=group){await cooperate();const h=Math.min(group,height-y),lease=await original.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width,height:h},{signal});let copyFailed=false,copyPrimary;try{await output.write(lease.pixels.data,y*width*3);}catch(error){copyFailed=true;copyPrimary=error;throw error;}finally{await retireCompositeOwners([()=>lease.release()],copyFailed?{primary:copyPrimary}:{});}const release=budget.reserve(width*h);try{await scope.write(new Uint8Array(width*h),y*width);}finally{release();}}
  let completed=0,offset=0;async function coreBytes(core,selectedGpu=gpu,selectedView=view,selectedSignal=signal){
   await cooperate();checkAbort(signal);let bytes;
   if(cached)bytes=cached.bytes.subarray(offset,offset+core.width*core.height*3);
   else if(core.observedBoundary){bytes=await sourceRegionObservedSeparation(selectedView,domain,core,p,{signal:selectedSignal,gpu:selectedGpu,...(p.mode===4?{cooperate}:{})});reads++;}
   else{const support=sourceRegionLocalSupport(domain,core,radius),lease=await selectedView.readWindow(support,{signal:selectedSignal});reads++;
    let native,nativeFailed=false,nativePrimary;try{native=await separationStage(lease.pixels,{...p,levels:0},core.y-support.y,core.height,{signal:selectedSignal,gpu:selectedGpu,...(p.mode===4?{cooperate}:{})});checkAbort(signal);bytes=new Uint8Array(core.width*core.height*3);for(let row=0;row<core.height;row++){const at=(row*support.width+core.x-support.x)*3;bytes.set(native.bytes.subarray(at,at+core.width*3),row*core.width*3);}}catch(error){nativeFailed=true;nativePrimary=error;throw error;}finally{await retireCompositeOwners([()=>native?.release?.(),()=>lease.release()],nativeFailed?{primary:nativePrimary}:{});}
   }
   return bytes;
  }
  async function singleCore(core){await commitCore(core,await coreBytes(core));}
  async function commitCore(core,bytes){
   checkAbort(signal);if(!cached&&histograms)for(let i=0;i<bytes.length;i++)histograms[i%3*256+bytes[i]]++;
   if(cacheData)cacheData.set(bytes,offset);await writeCore(core,bytes);const ones=new Uint8Array(core.width).fill(1);for(let row=0;row<core.height;row++)await scope.write(ones,(core.y+row)*width+core.x);offset+=bytes.length;completed+=core.width*core.height;jobs++;onProgress?.({phase:'source-region-separation-filter',fraction:.8*completed/analysed,observedBoundary:!!core.observedBoundary});
  }
  const ioWorkspaceBytes=migrationWorkspaceBytes(domain.sourceWidth*domain.sourceHeight*3,original.session);
  if(p.mode===0&&!cached&&gpu?.available&&typeof gpu.runWindows==='function'){
   for(const group of groupSeparationColorCores(cores(),{enabled:true}))await executeSeparationColorGroup(group,p,{gpu,view,domain,budget,signal,ioWorkspaceBytes,compute:coreBytes,commit:commitCore,single:singleCore});
  }else{
  for(const group of groupNlmBoundaryCores(cores(),{enabled:usefulNlm&&!cached})){
   await executeNlmAtlasGroup(group,p,{gpu:usefulNlm&&!cached?gpu:null,view,domain,signal,cooperate,ioWorkspaceBytes,
    async commit(core,bytes){reads++;await commitCore(core,bytes);},single:singleCore});
  }
  }
  if(!p.denoised){const tables=p.levels===0?Array.from({length:3},(_,c)=>equalizeHistogramLut(histograms.subarray(c*256,(c+1)*256),analysed)):Array.from({length:3},()=>Uint8Array.from({length:256},(_,i)=>Math.min(255,Math.trunc(255*i/p.levels))));completed=0;
   for(const core of cores()){await cooperate();checkAbort(signal);const bytes=new Uint8Array(core.width*core.height*3);for(let row=0;row<core.height;row++)await output.readInto(bytes.subarray(row*core.width*3,(row+1)*core.width*3),((core.y+row)*width+core.x)*3);for(let i=0;i<bytes.length;i++)bytes[i]=tables[i%3][bytes[i]];await writeCore(core,bytes);completed+=core.width*core.height;onProgress?.({phase:'source-region-separation-render',fraction:.8+.2*completed/analysed});}
  }
  await output.flush();await scope.flush();checkAbort(signal);cacheLease?.();cacheLease=null;if(cacheData){if(p.mode===4)cacheProducer={backend:null,acknowledged:false};budget.put(key,{value:{bytes:cacheData,histograms,...(cacheProducer?{producer:cacheProducer}:{})},byteLength:cacheBytes},[task.imageId]);}surface=createRgbSurface(output,{width,height,budget});scopeSurface=createMaskSurface(scope,{width,height,budget,range:[0,1],semantics:'1=selected centre processed with complete support or explicit observed ROI boundary;0=outside selection, original display background.'});
  await (recomputeCache?.finish()??gpu?.dispose());checkAbort(signal);const gpuMetrics=gpu?.snapshot()??{backend:'cpu',...(smallNlmCpu?{gpuFallback:{code:'GPU_SMALL_OBSERVED_DOMAIN',message:'Native CPU avoids per-boundary NLM dispatch overhead below65536 selected centres'}}:{})};
  if(cacheProducer){cacheProducer.backend=['cpu','webgpu-native-nlm-acknowledged'].includes(gpuMetrics.backend)?gpuMetrics.backend:null;cacheProducer.acknowledged=cacheProducer.backend!==null;}
  const executionMetrics=cached&&p.mode===4?{backend:'cached-native-separation-filter',filterOriginBackend:cached.producer?.acknowledged?cached.producer.backend:null,gpu:null}:gpuMetrics;
  const semantics='Native Median/Gaussian/Box/Bilateral/NLM kernels retain complete-support arithmetic. At ROI boundaries Median uses observed taps (upper median), Gaussian/Box/Bilateral renormalize observed native weights, and NLM uses explicit centred reflection without changing template/search. One global residual histogram covers all selected centres; fragmented context is not full-image equivalence.',metrics={...executionMetrics,...(nativeBefore?{nlmUsefulWork:{...nlmUsefulWork(nativeBefore,analysed),priorRetirementPending}}:{}),...(recompute?{manualRecompute:{kind:'human-backend',backend:task.backend,cacheRead:'bypassed',cacheWrite:'none',normalCache:recomputeCache.snapshot.cache}}:{}),selectedPixels:domain.countIncluded,analysedPixels:analysed,unanalysablePixels:domain.countIncluded-analysed,completeSupportPixels,boundaryPixels,halo:radius,jobs,sourceReads:reads,analysisCacheHit:!!cached,sourceRegionPolicy:'native-complete-or-observed-roi-boundary-global-admitted-residual-histogram'},bundle=publishResult(task.imageId,{surface,maskRecords:{analysis_scope:{surface:scopeSurface}},semantics,metrics});published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,semantics,metrics,provenance:{params:p,...(recompute?{manualRecompute:metrics.manualRecompute}:{}),sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted-before-filter-and-global-residual-histogram',presentationOutsideAnalysedSupport:'original-outside-selection',roiBoundary:p.mode===4?'centred-reflect-opposite-observed-else-centre-native-nlm-7x7-21x21':'observed-native-taps-renormalized-upper-median',nativeBorderGrid:'new-native-envelope',originalEncodedBytesPreserved:true}};
 }catch(error){failed=true;failure=normalizeResourceError(error);throw failure;}
 finally{await retireCompositeOwners([()=>recomputeCache?.finish()??gpu?.dispose(),()=>cacheLease?.(),()=>staging?.(),()=>extraHeap?.(),...(!published?[()=> (surface??output)?.dispose(),()=> (scopeSurface??scope)?.dispose()]:[])],failed?{primary:failure}:{});}
}
