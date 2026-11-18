import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {AVIF_HDR_DAV1D_RESOURCES as AVIF_HDR_RESOURCES} from './avif-hdr-dav1d-resources.js';
import {createAvifGainMapGpu} from './avif-gain-map-gpu.js';
import {createHdrColorPresentation} from './hdr-color-presentation.js';
import {gpuFallbackError} from './gpu-native-boundary.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';
const MiB=1024**2,PAGE=65536;
// Filled from the reproducible build, not an unversioned codec download.
export {AVIF_HDR_RESOURCES};
async function resource(pin,signal){
 requireValue(pin&&Number.isSafeInteger(pin.bytes)&&pin.bytes>0&&/^[a-f0-9]{64}$/.test(pin.sha256),'Pinned AVIF reader resource required.');checkAbort(signal);
 const response=await fetch(pin.url,{signal,credentials:'same-origin'});
 if(!response.ok)throw new EngineError('DEPENDENCY_HTTP','AVIF reader resource is unavailable.');
 const reader=response.body?.getReader();if(!reader)throw new EngineError('DEPENDENCY_BODY','AVIF reader resource has no body.');let complete=false,count=0;
 try{const bytes=new Uint8Array(pin.bytes);for(;;){checkAbort(signal);const part=await reader.read();checkAbort(signal);if(part.done)break;if(!(part.value instanceof Uint8Array)||part.value.length>pin.bytes-count)throw new EngineError('DEPENDENCY_SIZE','AVIF reader resource exceeds its pinned extent.');bytes.set(part.value,count);count+=part.value.length;}
  if(count!==pin.bytes)throw new EngineError('DEPENDENCY_SIZE','AVIF reader resource is truncated.');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');checkAbort(signal);
  if(hash!==pin.sha256)throw new EngineError('DEPENDENCY_INTEGRITY','AVIF reader resource differs from its pinned build.');complete=true;return bytes;
 }finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function avifNativeMemoryPlan(width,height,encodedBytes,{depth=12,yuvFormat=1,alpha=false,gainMap=false,gainWidth=width,gainHeight=height,gainDepth=depth,gainFormat=yuvFormat,threads=1,colorWorkspaceBytes=64*MiB,codecCount,codecWorkPixels,codecTileBudget}={}){
 requireValue([width,height,encodedBytes].every(n=>Number.isSafeInteger(n)&&n>0),'AVIF dimensions and byte ownership required.');
 const n=width*height,aligned=(w,h)=>Math.ceil(w/128)*128*Math.ceil(h/128)*128,A=aligned(width,height),planes=(format,d)=>[0,3,2,1.5,1][format]*(d>8?2:1),P=A*(planes(yuvFormat,depth)+(alpha?(depth>8?2:1):0))+(gainMap?aligned(gainWidth||width,gainHeight||height)*planes(gainFormat||yuvFormat,gainDepth||depth):0),D=codecCount??((depth>12?3:1)+Number(gainMap)+Number(alpha)),W=codecWorkPixels??D*A,K=codecTileBudget??D*Math.min(64,Math.ceil(width/64))*Math.min(64,Math.ceil(height/64)),round=n=>Math.ceil(n/(16*MiB))*16*MiB;
 requireValue([D,W,K].every(v=>Number.isSafeInteger(v)&&v>0),'Parsed codec topology and geometry are required.');
 requireValue(Number.isFinite(P)&&P>0,'Invalid AVIF plane layout.');
 const alphaTemporaryBytes=alpha?4*(depth>8?2:1)*width*132:0;
 const fixed=encodedBytes+16*MiB+D*384*1024+K*16*1024+(threads>1?2*D*threads*MiB:0)+24*width*132+alphaTemporaryBytes+6*1024**2,rescaled=gainMap&&(gainWidth!==width||gainHeight!==height)?A*planes(gainFormat||yuvFormat,gainDepth||depth):0;
 const minimumHeapBytes=round(P+2*W+rescaled+fixed),estimatedHeapPeakBytes=round(3*P+2*W+rescaled+fixed),heapMaximumBytes=Math.min(2**32,estimatedHeapPeakBytes);
 requireValue(Number.isSafeInteger(heapMaximumBytes),'AVIF workspace arithmetic exceeds its safe range.');
 if(minimumHeapBytes>2**32)throw new EngineError('MEMORY_LIMIT','The native AVIF planes exceed the codec address range.');
 return{heapMaximumBytes,estimatedHeapPeakBytes,colorWorkspaceBytes,minimumCodecMemoryBytes:minimumHeapBytes+colorWorkspaceBytes,codecMemoryBytes:heapMaximumBytes+colorWorkspaceBytes,nativeBytes:n*6,displayBytes:n*3,alignedPixels:A,decodedPlaneBytes:P,decoderCount:D,codecWorkPixels:W,codecTileBudget:K,threads,alphaTemporaryBytes};
}
function header(m){
 const width=m._hdr_avif_width(),height=m._hdr_avif_height(),rotation=m._hdr_avif_rotation(),mirror=m._hdr_avif_mirror();
 // AVIF transformations rotate counterclockwise, followed by mirroring.
 const orientations=[[1,4,3,2],[8,5,6,7],[3,2,1,4],[6,7,8,5]];
 const orientation=orientations[rotation]?.[mirror<0?0:mirror===0?1:3]??1;
 const alpha=!!m._hdr_avif_alpha(),gainMap=!!m._hdr_avif_has_gain_map(),baseHeadroom=m._hdr_avif_base_headroom(),alternateHeadroom=m._hdr_avif_alt_headroom();
 return{format:'avif',sourceFormat:'avif',sourceWidth:width,sourceHeight:height,width,height,orientedWidth:orientation>=5?height:width,orientedHeight:orientation>=5?width:height,orientation,orientationApplied:false,depth:m._hdr_avif_depth(),sourceDepth:m._hdr_avif_depth(),sourceSampleType:'unsigned-integer',nativeDepth:16,nativeColor:{primaries:m._hdr_avif_primaries()===12?'display-p3':m._hdr_avif_primaries()===9?'rec2020':m._hdr_avif_primaries()===1?'srgb':'cicp-'+m._hdr_avif_primaries(),transfer:m._hdr_avif_transfer()===16?'pq':m._hdr_avif_transfer()===18?'hlg':m._hdr_avif_transfer()===13?'srgb':'cicp-'+m._hdr_avif_transfer()},cicp:[m._hdr_avif_primaries(),m._hdr_avif_transfer(),m._hdr_avif_matrix()],gainMap,baseHeadroom,alternateHeadroom,nativeImageRole:'primary',nativeGainMapApplied:false,gainMapContent:gainMap?{availability:'original-encoded-source',decodedSurface:false,baseHeadroom,alternateHeadroom,alternateReconstruction:'not-materialized'}:null,iccBytes:m._hdr_avif_icc_size(),alpha,sourceAlpha:{present:alpha,depth:null,association:alpha?'unknown':null,nativeRepresentation:alpha?'straight-rgb':null,displayRepresentation:alpha?'composited-rgb':null}};
}
/** One AV1 decode owns both the bounded SDR preview and full native bands.
 * Full original RGB code values remain separate from the gain-map SDR image. */
export async function decodeAvifNative(bytes,{inspectOnly=false,onHeader,onWorkspaceReady,onBand,onPreview,onProgress,signal,threads=1,colorBackend='auto',moduleFactory,wasmBinary,linearHdr,onCpuPhase}={}){
 requireValue(bytes instanceof Uint8Array&&bytes.length>0,'Owned AVIF source bytes required.');checkAbort(signal);
 requireValue(['auto','cpu'].includes(colorBackend),'The color projection backend must be auto or cpu.');
 requireValue(onCpuPhase===undefined||typeof onCpuPhase==='function','Invalid captured codec CPU hook.');
 requireValue(Number.isSafeInteger(threads)&&threads>0,'Admitted AV1 thread count required.');const requestedThreads=Math.min(threads,64);let workerCount=requestedThreads,mt=globalThis.crossOriginIsolated===true&&typeof SharedArrayBuffer==='function'&&workerCount>1;
 let m,p=0,memory,gpuOwner,gpuFallback,presentation,liveHeapCeiling=0,failed=false,primary,linearCpu;
 const binaries=new Map(),factories=new Map();
 const close=async()=>{if(!m)return;const owner=m,pointer=p;m=null;p=0;await retireCompositeOwners([()=>owner._hdr_avif_close(),()=>{if(pointer)owner._free(pointer);},()=>owner.PThread?.terminateAllThreads()]);};
 const open=async(maximum,bootstrap=false,decoderCount=1)=>{
  const shared=mt&&!bootstrap,mode=shared?'mt':'st';let create=moduleFactory??factories.get(mode),binary=wasmBinary??binaries.get(mode);
  if(!create){create=(await import(shared?'../vendor/avif-hdr-dav1d/avif-hdr-dav1d-mt.mjs':'../vendor/avif-hdr-dav1d/avif-hdr-dav1d-st.mjs')).default;factories.set(mode,create);}
  if(!binary){binary=await resource(AVIF_HDR_RESOURCES[mode],signal);binaries.set(mode,binary);}
  memory=new WebAssembly.Memory({initial:512,maximum:maximum/PAGE,...(shared?{shared:true}:{})});
  liveHeapCeiling=maximum;const grow=memory.grow.bind(memory);Object.defineProperty(memory,'grow',{value:pages=>{requireValue(Number.isSafeInteger(pages)&&pages>=0,'Invalid native heap growth.');if(memory.buffer.byteLength+pages*PAGE>liveHeapCeiling)throw new RangeError('Native AVIF heap growth exceeds its current admitted phase.');return grow(pages);}});
  // libavif retains one dav1d context per colour/alpha/gain item. Eagerly
  // initialise their complete pool before synchronous WASM work can wait on
  // pthreads; starting a missing worker from a blocked browser worker hangs.
  m=await create({wasmMemory:memory,wasmBinary:binary,workerCount:shared?workerCount*decoderCount:1});
  p=m._malloc(bytes.length);if(!p)throw new EngineError('MEMORY_ALLOCATION','AVIF source workspace allocation failed.');new Uint8Array(memory.buffer).set(bytes,p);
  check(m._hdr_avif_open(p,bytes.length,shared?workerCount:1));
 };
 const check=ok=>{checkAbort(signal);if(!ok)throw new EngineError('AVIF_DECODE_FAILED',m.UTF8ToString(m._hdr_avif_error())||'AVIF native decoding failed.');};
 try{
  // Header-only bootstrap has a separately bounded heap; the full decoder is
  // created only after the actual image owner admits its complete workspace.
  await open(Math.max(64*MiB,Math.ceil((bytes.length+32*MiB)/(16*MiB))*16*MiB),true);const h=header(m);
  requireValue(h.width>0&&h.height>0&&Number.isSafeInteger(h.width*h.height*6),'Invalid AVIF grid.');if(inspectOnly)return h;
  h.altIccBytes=m._hdr_avif_alt_icc_size();if(linearHdr){requireValue(!onPreview&&h.gainMap&&!h.alpha&&h.iccBytes===0&&h.altIccBytes===0&&linearHdr.schema==='sherloq.source-representation/1'&&linearHdr.kind==='hdr-linear-rgb-float32'&&linearHdr.outputSpace==='gain-map-math-linear-rgb'&&Number.isFinite(linearHdr.targetHeadroom)&&linearHdr.targetHeadroom>=0,'This HDR representation requires a supported CICP gain-map RGB domain.');const profile=linearHdr.profileIdentity,alt=[m._hdr_avif_gain_primaries(),m._hdr_avif_alt_transfer(),m._hdr_avif_gain_matrix()],math=m._hdr_avif_use_base_color_space()||alt[0]===2?h.cicp[0]:alt[0];requireValue(profile?.baseIccSha256===null&&profile?.alternateIccSha256===null&&JSON.stringify(profile.baseCicp)===JSON.stringify(h.cicp)&&JSON.stringify(profile.alternateCicp)===JSON.stringify(alt)&&profile.gainMathPrimaries===math,'The HDR recipe does not describe the captured Original color identity.');}const colorWorkspaceBytes=h.iccBytes||h.altIccBytes?128*MiB:64*MiB;
  const topology={depth:h.depth,yuvFormat:m._hdr_avif_format(),alpha:h.alpha,gainMap:h.gainMap,gainWidth:m._hdr_avif_gain_width(),gainHeight:m._hdr_avif_gain_height(),gainDepth:m._hdr_avif_gain_depth(),gainFormat:m._hdr_avif_gain_format(),colorWorkspaceBytes,codecCount:m._hdr_avif_codec_count(),codecWorkPixels:m._hdr_avif_codec_work_pixels(),codecTileBudget:m._hdr_avif_codec_tile_budget()},makePlan=t=>avifNativeMemoryPlan(h.sourceWidth,h.sourceHeight,bytes.length,{...topology,threads:t});
  // The pool is a finite CPU resource, independently of the image format.
  // A many-context container stays loadable with the same decoder at T=1.
  workerCount=mt?Math.max(1,Math.min(workerCount,Math.floor(64/topology.codecCount))):1;let plan=makePlan(workerCount);const minimum=makePlan(1),deferred=typeof onWorkspaceReady==='function',admission=await onHeader({...h,codecMemoryBytes:plan.codecMemoryBytes,minimumCodecMemoryBytes:minimum.minimumCodecMemoryBytes,deferBanks:deferred});
  requireValue(admission?.nativeBytes>=minimum.minimumCodecMemoryBytes,'The AVIF decoder workspace has not been admitted.');while(workerCount>1&&plan.estimatedHeapPeakBytes+plan.colorWorkspaceBytes>admission.nativeBytes){workerCount--;plan=makePlan(workerCount);}mt=mt&&workerCount>1;
  if(onCpuPhase){const grant=await onCpuPhase({phase:'av1',maximumCpu:workerCount,topology:{decoderCount:plan.decoderCount,multithreaded:mt}});requireValue(Number.isSafeInteger(grant?.cpu)&&grant.cpu>=1&&grant.cpu<=workerCount,'The AV1 phase has no captured CPU grant.');workerCount=grant.cpu;mt=mt&&workerCount>1;plan=makePlan(workerCount);}
  await close();await open(Math.min(plan.heapMaximumBytes,admission.nativeBytes-plan.colorWorkspaceBytes),false,plan.decoderCount);await controlCheckpoint(signal);
  onProgress?.({phase:'decode-av1',fraction:0});const t=performance.now();check(m._hdr_avif_decode());const av1Ms=performance.now()-t;await controlCheckpoint(signal);
  if(onCpuPhase){const grant=await onCpuPhase({phase:'conversion',maximumCpu:1});requireValue(grant?.cpu===1,'The AVIF conversion has no captured CPU grant.');}
  if(deferred){
   // The complete AV1 admission is no longer needed. Keep the committed heap
   // plus bounded conversion workspace, then let the source banks use RAM.
   liveHeapCeiling=Math.min(liveHeapCeiling,Math.ceil((memory.buffer.byteLength+128*MiB)/(16*MiB))*16*MiB);
   const ready=await onWorkspaceReady({codecMemoryBytes:liveHeapCeiling+plan.colorWorkspaceBytes,codecHeapCeilingBytes:liveHeapCeiling,codecHeapCommittedBytes:memory.buffer.byteLength});requireValue(ready?.nativeBytes>=liveHeapCeiling+plan.colorWorkspaceBytes,'The AVIF conversion workspace has not been admitted.');
  }
  const rowsPerBand=Math.max(1,Math.min(128,Math.floor((32*MiB)/(h.sourceWidth*24)))),convert=performance.now(),factor=Math.min(1,2048/h.sourceWidth,2048/h.sourceHeight,Math.sqrt(1024**2/(h.sourceWidth*h.sourceHeight))),previewWidth=Math.max(1,Math.floor(h.sourceWidth*factor)),previewHeight=Math.max(1,Math.floor(h.sourceHeight*factor)),maximumPixels=Math.max(h.sourceWidth*rowsPerBand,previewWidth*previewHeight),gainDepth=m._hdr_avif_gain_depth();
  const generic=h.iccBytes>0||h.altIccBytes>0||!h.gainMap&&[16,18].includes(h.cicp[1])||h.gainMap&&Math.min(h.baseHeadroom,h.alternateHeadroom)>0;
  let model;
  if(generic){
   const heap=new Uint8Array(memory.buffer),baseIcc=h.iccBytes?heap.slice(m._hdr_avif_icc(),m._hdr_avif_icc()+h.iccBytes):undefined,altIcc=h.altIccBytes?heap.slice(m._hdr_avif_alt_icc(),m._hdr_avif_alt_icc()+h.altIccBytes):undefined,triple=kind=>Array.from({length:3},(_,c)=>m._hdr_avif_gain_parameter(kind,c));
   if(baseIcc){h.nativeColor.iccProfileBytes=baseIcc;h.nativeColor.cicpFallback={primaries:h.nativeColor.primaries,transfer:h.nativeColor.transfer};h.nativeColor.primaries='embedded-icc';h.nativeColor.transfer='embedded-icc-trc';}if(altIcc)h.nativeColor.alternateIccProfileBytes=altIcc;
   presentation=await createHdrColorPresentation({baseDepth:h.depth,gainDepth,baseColor:{primaries:h.cicp[0],transfer:h.cicp[1],iccProfileBytes:baseIcc},gainMap:h.gainMap?{baseHeadroom:h.baseHeadroom,alternateHeadroom:h.alternateHeadroom,useBaseColorSpace:m._hdr_avif_use_base_color_space(),minimum:triple(0),maximum:triple(1),gamma:triple(2),baseOffset:triple(3),alternateOffset:triple(4),alternateColor:{primaries:m._hdr_avif_gain_primaries(),transfer:m._hdr_avif_alt_transfer(),iccProfileBytes:altIcc}}:null,maximumBandPixels:maximumPixels,maximumMemoryBytes:64*MiB,peakNits:(h.gainMap?(h.baseHeadroom>h.alternateHeadroom?m._hdr_avif_alt_clli():m._hdr_avif_clli()):m._hdr_avif_clli())||undefined},{signal});model=presentation.model;
  }else{const pointer=m._hdr_avif_model();check(pointer);model=new Float32Array(memory.buffer,pointer,m._hdr_avif_model_count()).slice();}
  if(linearHdr){const {createHdrLinearModel,createHdrLinearCpu}=await import('./hdr-linear-transform.js');const triple=kind=>Array.from({length:3},(_,c)=>m._hdr_avif_gain_parameter(kind,c)),gainMap={baseHeadroom:h.baseHeadroom,alternateHeadroom:h.alternateHeadroom,minimum:triple(0),maximum:triple(1),gamma:triple(2),baseOffset:triple(3),alternateOffset:triple(4)},linear=createHdrLinearModel({sourceModel:model,baseDepth:h.depth,gainDepth,gainMap,targetHeadroom:linearHdr.targetHeadroom,mathPrimaries:linearHdr.profileIdentity.gainMathPrimaries,sourceTransfer:h.cicp[1],maximumMemoryBytes:64*MiB});model=linear.model;h.hdrRepresentation=linear.metadata;linearCpu=createHdrLinearCpu({...linear,baseDepth:h.depth,gainDepth,maximumPixels,maximumMemoryBytes:64*MiB});}
  // A preview on the complete source grid is already the final SDR raster.
  // Reuse that useful CPU result instead of preparing another projection on
  // the GPU. The bounded preview cache is covered by the color workspace.
  const completePreviewGrid=!!onPreview&&previewWidth===h.sourceWidth&&previewHeight===h.sourceHeight;
  let completePreview;
  if(model&&colorBackend!=='cpu'&&!completePreviewGrid)try{gpuOwner=await createAvifGainMapGpu({model,baseDepth:h.depth,gainDepth,maximumPixels,maximumMemoryBytes:64*MiB,gamutMapping:generic,signal,...(linearHdr?{outputMode:'linear-float32'}:{})});}catch(error){if(error?.cleanupOwner)gpuOwner=error.cleanupOwner;if(error?.code==='CANCELLED'||error?.cleanupOwner||error?.cleanupErrors?.length)throw error;gpuFallback={code:error?.code??'GPU_UNAVAILABLE',message:error?.message??String(error)};}
  async function present(count){
   const heap=new Uint8Array(memory.buffer),baseBytes=heap.subarray(m._hdr_avif_pair_base(),m._hdr_avif_pair_base()+count*3*(h.depth>8?2:1)),gainBytes=gainDepth?heap.subarray(m._hdr_avif_pair_gain(),m._hdr_avif_pair_gain()+count*3*(gainDepth>8?2:1)):null;
   if(gpuOwner)try{return await gpuOwner.run(baseBytes,gainBytes,count,{signal});}catch(error){if(!gpuFallbackError(error))throw error;gpuFallback={code:error.code,message:error.message};try{await gpuOwner.dispose();}catch(cleanup){throw withRetirementOwner(error,gpuOwner,cleanup);}gpuOwner=null;}
   if(linearCpu)return linearCpu.run(baseBytes,gainBytes,count,{signal});
   if(presentation)return presentation.convertEncoded(h.depth>8?new Uint16Array(baseBytes.buffer,baseBytes.byteOffset,count*3):baseBytes,gainDepth>8?new Uint16Array(gainBytes.buffer,gainBytes.byteOffset,count*3):gainBytes,{signal});
   check(m._hdr_avif_fast_sdr());const samples=new Uint16Array(memory.buffer,m._hdr_avif_fast_pixels(),count*3),display=new Uint8Array(count*3);for(let i=0;i<display.length;i++)display[i]=Math.round(samples[i]/257);return display;
  }
  if(onPreview){
   check(m._hdr_avif_preview_pair(previewWidth,previewHeight));const data=await present(previewWidth*previewHeight);
   if(completePreviewGrid)completePreview=data.slice();
   await onPreview({pixels:{width:previewWidth,height:previewHeight,format:'rgb8',data},sourceWidth:h.orientedWidth,sourceHeight:h.orientedHeight,orientation:h.orientation,decoder:'libavif/dav1d SDR preview',presentationOnly:true});
  }
  for(let y=0;y<h.sourceHeight;y+=rowsPerBand){
   await controlCheckpoint(signal);const rows=Math.min(rowsPerBand,h.sourceHeight-y),length=h.sourceWidth*rows*6;check(m._hdr_avif_pair(y,rows));
   if(linearHdr){const samples=await present(h.sourceWidth*rows);requireValue(samples instanceof Float32Array&&samples.length===h.sourceWidth*rows*3,'The requested HDR band must remain typed Float32.');await onBand({y,rows,samples,width:h.sourceWidth,sampleType:'float32',representation:h.hdrRepresentation});}else{const nativeBytes=new Uint8Array(memory.buffer).slice(m._hdr_avif_pair_native(),m._hdr_avif_pair_native()+length),displayBytes=completePreview?completePreview.slice(y*h.sourceWidth*3,(y+rows)*h.sourceWidth*3):await present(h.sourceWidth*rows);
   await onBand({y,rows,nativeBytes,displayBytes,width:h.sourceWidth});}onProgress?.({phase:linearHdr?'decode-hdr-linear':'decode-hdr-sdr',fraction:(y+rows)/h.sourceHeight});
  }
  return{header:h,provenance:{decoder:'libavif-1.4.2/dav1d-1.5.4',sourceFormat:'avif',sourceDepth:h.depth,sourceSampleType:h.sourceSampleType,analysisDepth:linearHdr?32:16,...(linearHdr?{hdrRepresentation:h.hdrRepresentation}:{}),sourceColor:h.nativeColor,cicp:h.cicp,orientation:h.orientation,orientationApplied:true,gainMap:h.gainMap,nativeImageRole:h.nativeImageRole,nativeGainMapApplied:h.nativeGainMapApplied,gainMapContent:h.gainMapContent,sourceAlpha:h.sourceAlpha,sdrConversion:linearHdr?'not-run; linear HDR source preparation':presentation?.metadata??(h.gainMap?'ISO gain map, headroom0, sRGB/BT709':'CICP to sRGB/BT709'),nativeSamples:linearHdr?'Derived linear HDR Float32, before clamp/tone/gamut/OETF; Original primary remains separate':'Source-depth RGB codes promoted to the full-range RGB16 container, separate from SDR display',originalBytesPreserved:true},metrics:{av1Ms,conversionMs:performance.now()-convert,codecHeapCapacityBytes:memory.buffer.byteLength,codecHeapMaximumBytes:liveHeapCeiling,threads:mt?workerCount:1,initialMemoryPlan:plan,gainMap:{...(gpuOwner?.metrics()??{backend:'cpu',kernel:presentation?'ICC/BT2446A table presentation':'libavif-transfer-gain-tables',gpuFallback}),completePreviewReused:!!completePreview,completePreviewRetainedBytes:completePreview?.byteLength??0,requestedBackend:colorBackend}}};
 }catch(error){failed=true;primary=error;throw error;}
 finally{const retire=()=>retireCompositeOwners([()=>gpuOwner?.dispose(),()=>linearCpu?.dispose(),()=>presentation?.dispose(),()=>close()]);try{await retire();}catch(cleanup){throw withRetirementOwner(failed?primary:cleanup,{dispose:retire},cleanup);}}
}
