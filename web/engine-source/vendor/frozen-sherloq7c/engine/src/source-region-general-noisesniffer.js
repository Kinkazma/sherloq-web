import {EngineError,checkAbort,createCooperator,normalizeResourceError} from './errors.js';
import {noisesnifferParams} from './noisesniffer.js';
import {segmentedNoisesniffer} from './segmented-noisesniffer.js';
import {noisesnifferStreamHeapBytes} from './noisesniffer-stream-math.js';
import {sourceRegionNoisesnifferStatistics} from './source-region-noisesniffer-statistics.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {createNoisesnifferNpzPages} from './noisesniffer-npz-pages.js';
import {retainResult} from './retained-result.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// Keep every refused owner reachable through the derived Original until its
// backing acknowledges retirement. Successfully retired siblings are omitted
// on replay; a calculation error remains the primary error, including frozen
// errors supplied by an external source.
function retirementOf(owners){
 const pending=new Set(owners.filter(Boolean));let retiring;
 return{retirementOnly:true,get pending(){return pending.size>0;},dispose(){if(retiring)return retiring;return retiring=retireCompositeOwners([...pending].map(owner=>async()=>{await owner.dispose();pending.delete(owner);})).finally(()=>{retiring=null;});}};
}

// One union-global native selection and ordered cell growth, after strict RGB
// statistics. The original cell grid/NFA search area remain the encompassing
// native image, never a packed image or the sum of unrelated cell grids.
export async function sourceRegionNoisesniffer({task,original,derived,view,domain,budget,signal,onProgress,publishResult,profile={}}){
 const p=noisesnifferParams(task.params),width=domain.width,height=domain.height,n=width*height,identity=JSON.stringify([domain.sourceSha256,domain.fingerprint,task.backend??'auto','native-graph-v1',...(p.blockSize===8?['observed-native-FFT-contexts-v1']:[])]),cooperate=createCooperator(signal),make=bytes=>createSegmentedBytes(bytes,{budget,signal,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession});
 const accountedHeapBytes=noisesnifferStreamHeapBytes();let activeCache,stats,seed,record,output,mask,scope,surface,maskSurface,scopeSurface,maskOwner,maskLease,archive,staging,published=false,failed=false,failure,disposed=false,closing=false;
 try{
  let cache=derived.noisesnifferCache;
  if(cache?.retirementOnly){await cache.dispose();if(derived.noisesnifferCache===cache)derived.noisesnifferCache=null;cache=null;}
  if(cache&&(cache.sourceRegionIdentity!==identity||cache.stats?.blockSize!==p.blockSize)){await cache.dispose();derived.noisesnifferCache=null;cache=null;}
  if(!cache){stats=await sourceRegionNoisesnifferStatistics(original,view,domain,p.blockSize,{budget,signal,onProgress,backend:task.backend??'auto',onRetirementOwner:owner=>{stats=owner;}});if(!stats.metrics.supportedBlocks)throw new EngineError('SOURCE_SCOPE_EMPTY','No selected block has the complete input required by the unchanged native Noisesniffer statistics.',{details:{...stats.metrics,blockSize:p.blockSize}});seed={stats,async dispose(){await this.stats?.dispose();this.stats=null;}};cache=seed;}
  activeCache=cache;const image={...derived,readScientificPatch:(rect,hooks)=>view.readWindow(rect,hooks)};
  record=await segmentedNoisesniffer(image,p,{budget,signal,onProgress,profile,cache,accountedHeapBytes,backend:task.backend??'auto'});checkAbort(signal);record.noisesnifferCache.sourceRegionIdentity=identity;derived.noisesnifferCache=record.noisesnifferCache;stats=record.noisesnifferCache.stats;
  // Scientific kernels above never see the following display background.
  // Copy explicit support rather than retaining a mutable statistics cache in
  // the visible mask; older results remain valid across block-size changes.
  staging=budget.reserve(width*32*12+65536);output=await make(n*3);mask=await make(n);scope=await make(n);let analysed=0;
  for(let y=0;y<height;y+=32){await cooperate();const h=Math.min(32,height-y),valid=new Uint8Array(width*h),nativeMask=new Uint8Array(width*h),part=await record.surface.readWindow({x:0,y,width,height:h},{signal});let background;
   try{await stats.coverage.readInto(valid,y*width);await record.analysis.mask.readInto(nativeMask,y*width);background=await original.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width,height:h},{signal});for(let i=0;i<valid.length;i++){if(valid[i])analysed++;else{nativeMask[i]=0;part.pixels.data.set(background.pixels.data.subarray(i*3,i*3+3),i*3);}}await output.write(part.pixels.data,y*width*3);await mask.write(nativeMask,y*width);await scope.write(valid,y*width);onProgress?.({phase:'source-region-noisesniffer-render',completed:y+h,total:height});}finally{background?.release();part.release();}
  }
  await output.flush();await mask.flush();await scope.flush();checkAbort(signal);
  maskOwner=retainResult({descriptor:{id:crypto.randomUUID()},dispose:()=>mask.dispose()});maskLease=maskOwner.lease();const innerMask=createMaskSurface(mask,{width,height,budget,ownsStore:false,range:[0,255],semantics:'Native significant cell mask restricted to complete admitted statistics support. analysis_scope distinguishes unknown observations.'});let maskRetirement;maskSurface={...innerMask,dispose(){if(maskRetirement)return maskRetirement;return maskRetirement=(async()=>{await innerMask.dispose();await maskOwner.dispose();})().finally(()=>{maskRetirement=null;});}};
  scopeSurface=createMaskSurface(scope,{width,height,budget,range:[0,1],semantics:'1=inside a complete admitted native statistics footprint;0=unknown or excluded original, displayed as unanalysed.'});const inner=createRgbSurface(output,{width,height,budget});let surfaceRetirement;const surfaceOwners=retirementOf([inner,record.surface,maskLease,{async dispose(){await archive?.dispose();archive=null;}}]);surface={...inner,dispose(){if(disposed)return Promise.resolve();if(surfaceRetirement)return surfaceRetirement;closing=true;return surfaceRetirement=(async()=>{await surfaceOwners.dispose();disposed=true;})().finally(()=>{surfaceRetirement=null;});}};
  const data={...record.data,metadata:{...record.data.metadata,source_region:{domainFingerprint:domain.fingerprint,selected_pixels:domain.countIncluded,analysed_pixels:analysed,unknown_pixels:domain.countIncluded-analysed,native_statistics:stats.metrics.mean8Policy,...(p.blockSize===8?{native_fft_dimensions:stats.metrics.mean8DftSize,observed_fft_contexts:stats.metrics.observedFftContextJobs}:{}),native_cell_grid_and_nfa_area:'encompassing-native-image'}}},npzAnalysis={...record.analysis,mask,data},semantics=record.semantics+' Only complete admitted source footprints enter extrema, DCT/FFT statistics, native global bins and ordered cell growth.'+(p.blockSize===8?' Block8 partial tiles use observed rectangular inputs to the unchanged global-size native FFT; context-origin rounding is explicit, not full-frame arithmetic equivalence.':'')+' The native encompassing cell grid and NFA search area are retained. Unknown observations retain the original display; consult analysis_scope.',metrics={...record.metrics,selectedPixels:domain.countIncluded,analysedPixels:analysed,unanalysablePixels:domain.countIncluded-analysed,sourceRegionPolicy:'native-global-noisesniffer-with-strict-complete-statistics-support'},readNpz=async(request,hooks={})=>{if(closing||disposed)throw new EngineError('DISPOSED','Noisesniffer result released.');archive??=await createNoisesnifferNpzPages(npzAnalysis,{...hooks.provenance,sourceRegionDomain:domain.descriptor,analysisScope:metrics},{budget,signal:hooks.signal,onProgress:hooks.onProgress});return archive.read(request,hooks);};
  const bundle=publishResult(task.imageId,{surface,maskRecords:{noisesniffer:{surface:maskSurface},analysis_scope:{surface:scopeSurface}},readNpz,data,semantics,metrics});published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,data,semantics,metrics,provenance:{params:p,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted-before-statistics-and-native-global-selection',presentationOutsideAnalysedSupport:'original-unanalysed',cellGridAndNfaArea:'native-encompassing-image',originalEncodedBytesPreserved:true,...(p.blockSize===8?{mean8ContextPolicy:stats.metrics.mean8Policy,mean8DftSize:stats.metrics.mean8DftSize,observedFftContexts:stats.metrics.observedFftContextJobs}:{})}};
 }catch(error){failed=true;failure=normalizeResourceError(error);throw failure;}
 finally{staging?.();if(!published){const retirement=retirementOf([surface??output,maskSurface??maskOwner??mask,scopeSurface??scope,maskLease,...(!surface?[record?.surface]:[]),record?.noisesnifferCache??activeCache??seed??stats,derived.noisesnifferCache]);derived.noisesnifferCache=retirement;try{await retireCompositeOwners([()=>retirement.dispose()],failed?{primary:failure}:{});}finally{if(!retirement.pending&&derived.noisesnifferCache===retirement)derived.noisesnifferCache=null;}}}
}
