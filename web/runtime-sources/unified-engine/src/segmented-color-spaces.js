import "../../runtime-context.js?v=0.33.3";
import {createColorTransformCache} from './color-managed-runtime.js';
import {COLOR_NATIVE_RESOURCE} from './color-managed-resource.js';
import {allocateOwnedTypedArray,allocateTypedArray} from './allocation.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {describeCanonicalColorLane,planCanonicalColorExecution} from './canonical-color-plan.js';
import {createCanonicalColorExecution} from './canonical-color-execution.js';
import {hdrDecodeTransfer,hdrPrimaryChromaticities} from './hdr-color-presentation.js';
import {createRgb16Surface} from './rgb16-surface.js';
import {createBorrowedSourceSamples} from './borrowed-source-samples.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {pixelStripPool} from './pixel-strip-pool.js';import {pixelStripStage} from './pixel-strip-stage.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,normalizeResourceError,createCooperator} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';import {OPENCV_OPERATIONS,nativeColorSpaceParametersAdmitted,NATIVE16_ALGEBRAIC_COLOR_SPACES,CIE_CHANNEL_RANGES} from './opencv-operations.js';

// One definition serves useful execution and optional final-residency proof.
// This is geometry/arithmetic only: no allocation, decoder or CMM startup.
export function colorSpaceExecutionPlan({width:w,height:h,inputBytes=3,outputBytes=3,scratchBytes=3,ioBytes=0,availableBytes=Number.MAX_SAFE_INTEGER,rowsPerBlock}={}){
 requireValue([w,h,inputBytes,outputBytes,scratchBytes,ioBytes,availableBytes].every(Number.isSafeInteger)&&w>0&&h>0&&inputBytes>0&&outputBytes>0&&scratchBytes>0&&ioBytes>=0&&availableBytes>=0,'Invalid typed color-space resource geometry.');
 const overhead=32*1024**2+ioBytes,rowScratch=Math.max(w,h)*scratchBytes,perPixel=64+inputBytes,targetRows=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(262144/w))),rows=Math.min(targetRows,Math.floor((availableBytes-overhead-rowScratch)/(w*perPixel)));
 return{overhead,rowScratch,perPixel,targetRows,rows,minimum:overhead+w*perPixel+rowScratch,outputBytes:w*h*outputBytes,stagingBytes:overhead-ioBytes+w*rows*64,prepareBytes:w*(rows+1)*inputBytes,heapBytes:32*1024**2,workerPixelBytes:64};
}
export function colorSpaceResidentAdmissionPlan(image,params,{native=false,budget,runtimeBytes=0,ioBytes=0,storageOverheadBytes=0,profile={},cpuKernel='auto',contract,workersAvailable=typeof globalThis.Worker==='function'}={}){
 try{
  const d=(native?image.nativeSurface:image.surface)?.descriptor;if(!d)return null;const p=OPENCV_OPERATIONS['colors.space'].validate(params),cie=native&&!NATIVE16_ALGEBRAIC_COLOR_SPACES.includes(p.space),inputBytes=cie?42:native?6:3,outputBytes=native?6:3,geometry=colorSpaceExecutionPlan({width:d.width,height:d.height,inputBytes,outputBytes,scratchBytes:native?6:3,ioBytes}),n=d.width*d.height;
  if(cie&&cieOwners.get(budget)?.size)return{known:false,reason:'cie-owner-in-flight-or-retirement'};
  if(!Number.isInteger(profile.maxWorkers)||profile.maxWorkers<1)return null;const maximum=cpuKernel==='auto'&&workersAvailable?profile.maxWorkers:1,actors=Math.min(maximum,Math.ceil(d.height/geometry.targetRows)),pixels=d.width*geometry.targetRows;
  const components={runtime:runtimeBytes,storage:storageOverheadBytes,output:geometry.outputBytes,mainStaging:geometry.stagingBytes,scratch:geometry.rowScratch,sourceWindows:actors*geometry.prepareBytes,workerHeaps:workersAvailable?actors*geometry.heapBytes:0,workerWork:workersAvailable?actors*pixels*geometry.workerPixelBytes:0,metadata:65536+actors*4096};
  if(cie){const color=d.color??{},ref=color.iccProfile??color.profile,profileBytes=ref?.bytes??PROFILE_MAX,format=ref?(color.sourceModel==='GRAY'?'gray16':'rgb16'):'rgbFloat32',lane=describeCanonicalColorLane({inputFormat:format,outputFormat:'xyzFloat32',profileBytes,maximumChunkPixels:Math.min(65536,pixels),maximumMemoryBytes:COLOR_HEAP});components.color=COLOR_HEAP+2*COLOR_NATIVE_RESOURCE.bytes+PROFILE_MAX+3*profileBytes;components.colorParallel=workersAvailable?maximum*lane.residentBytes+profileBytes+pixels*12:0;}
  // A nonsegmented 8-bit caller may keep the original contiguous OpenCV route.
  // Cover that same advertised scratch contract as an alternative, not a new
  // size-based switch or a reason to reduce the ordinary actor count.
  let bytes=Object.values(components).reduce((a,b)=>a+b,0);if(!native&&!image.segmented){const contiguous=runtimeBytes+storageOverheadBytes+n*3*(contract?.scratchFactor??64)+(contract?.extraBytes??32*1024**2)+n*6;bytes=Math.max(bytes,contiguous);}
  return Number.isSafeInteger(bytes)&&bytes>0?{bytes,components,completeResidentAlternative:true,parallelWorkers:actors,rowsPerBlockUpper:geometry.targetRows,known:true}:null;
 }catch{return null;}
}

// Full oriented rows preserve the native vector-prefix/scalar-tail arithmetic.
// Arbitrary pixel batches or orientation after conversion can change HSV/HLS.
export async function segmentedColorSpaces(image,params,{budget,signal,onProgress,rowsPerBlock,maxWorkers=1}={}){
 const d=image.surface.descriptor,w=d.width,h=d.height,n=w*h,operation=OPENCV_OPERATIONS['colors.space'],native=d.format==='rgb16',cie=native&&!NATIVE16_ALGEBRAIC_COLOR_SPACES.includes(params?.space??'rgb'),inputBytes=cie?image.colorInputBytes:native?6:3,outputBytes=native?6:3;
 if(native)requireValue(nativeColorSpaceParametersAdmitted(params),'This native16 color space requires a separately qualified CIE contract.');
 requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid color-space row group.');checkAbort(signal);
 const ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 const pool=pixelStripPool(image,budget,{maxWorkers,heapBytes:32*1024**2,pixelBytes:64}),nativeSignal=()=>native&&pool.controller?.signal?(signal?AbortSignal.any([signal,pool.controller.signal]):pool.controller.signal):signal;let output,planning,staging,failed=false,primary;let blocks=0,readMs=0,kernelMs=0,writeMs=0;const started=performance.now();
 const windows=native?new Map():null;let retryWindows=false;
 const ack=async action=>{const answer=await action();if(answer===false||answer===0)throw answer;return answer;};
 async function retireWindow(entry){if(entry.flight)return entry.flight;if(entry.failed&&!retryWindows)throw entry.error;
  const task=(async()=>{try{if(entry.part)await ack(()=>entry.part.release());entry.part=null;windows.delete(entry.index);entry.failed=false;}catch(error){entry.failed=true;entry.error=error;throw error;}})();entry.flight=task;void task.finally(()=>{if(entry.flight===task)entry.flight=null;}).catch(()=>{});return task;
 }
 // Endpoint ACK precedes retirement of any transferred Source window. This
 // registered cleanup stays reachable even when native read/consume rejects.
 const retirement=native?pool.ownCleanup(async()=>{let refused=false,first;const retire=async action=>{try{await action();}catch(error){if(!refused){refused=true;first=error;}}};
  for(const entry of [...windows.values()])await retire(()=>retireWindow(entry));
  if(failed&&output)await retire(async()=>{await ack(()=>output.dispose());output=null;});
  await retire(()=>{planning?.();planning=null;});await retire(()=>{staging?.();staging=null;});if(refused)throw first;
 }):null;
 const cleanupOwner={dispose(){retryWindows=true;return retirement.retire({endpoints:true,retryEndpoints:true});}};

 try{
  // Include initial/growing OpenCV heap allowance before choosing output storage.
  // The caller separately admits already resident codec heaps.
  const initialPlan=colorSpaceExecutionPlan({width:w,height:h,inputBytes,outputBytes,scratchBytes:native?6:3,ioBytes,rowsPerBlock}),minimum=initialPlan.minimum;
  planning=budget.reserve(minimum);
  output=await createSegmentedBytes(n*outputBytes,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  planning();planning=null;
  const execution=colorSpaceExecutionPlan({width:w,height:h,inputBytes,outputBytes,scratchBytes:native?6:3,ioBytes,rowsPerBlock,availableBytes:budget.limit-budget.retained-budget.active}),rows=execution.rows;
  if(rows<1)throw new EngineError('MEMORY_LIMIT','One oriented color-space row does not fit the shared budget.');
  // Storage reserves its own IO pages. Keep their planned allowance free.
  staging=budget.reserve(execution.stagingBytes);
  let completed=0;
  await pool.run({count:Math.ceil(h/rows),pixels:w*rows,key:'color/'+(native?'16/':'')+w+'/'+rows,signal,prepareBytes:execution.prepareBytes,
   prepare:async i=>{const at=performance.now(),y=i*rows,height=Math.min(rows,h-y);
    if(!native){const window=await image.surface.readWindow({x:0,y,width:w,height},{signal});try{readMs+=performance.now()-at;return{op:'color',rgb:window.pixels.data,width:w,height,params};}finally{window.release();}}
    // A retry can replace only a completed/terminated previous attempt; the
    // pool refuses reuse of any endpoint whose retirement remains uncertain.
    if(windows.has(i)){requireValue(![...pool.workers.values()].some(slot=>slot.retirement),'A native color endpoint awaits retirement.');await retireWindow(windows.get(i));}
    const entry={index:i,part:null,failed:false,flight:null};windows.set(i,entry);
    try{entry.part=await image.surface.readWindow({x:0,y,width:w,height},{signal:nativeSignal()});checkAbort(nativeSignal());readMs+=performance.now()-at;return{op:'color',inputDepth:16,...(cie?{inputModel:'xyz-d50',referenceWhite:image.referenceWhite}:{}),rgb:entry.part.pixels.data,width:w,height,params};}catch(error){if(!entry.part)windows.delete(i);throw error;}
   },
   local:pixelStripStage,
   consume:async(part,i)=>{checkAbort(signal);const at=performance.now(),y=i*rows;let bytes=part.bytes;if(native){requireValue(part.samples instanceof Uint16Array&&part.samples.length===Math.min(rows,h-y)*w*3,'Invalid native16 color strip.');bytes=new Uint8Array(part.samples.buffer,part.samples.byteOffset,part.samples.byteLength);if(new Uint8Array(new Uint16Array([1]).buffer)[0]!==1)for(let j=0;j<bytes.length;j+=2){const low=bytes[j];bytes[j]=bytes[j+1];bytes[j+1]=low;}}await output.write(bytes,y*w*outputBytes);if(native)await retireWindow(windows.get(i));writeMs+=performance.now()-at;blocks++;completed+=Math.min(rows,h-y);onProgress?.(completed/h);}
  });
  await output.flush();checkAbort(signal);
  const nativeStore=native?new Proxy(output,{get(target,key){if(key==='dispose')return()=>ack(()=>target.dispose());const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}):null;
  const surface=native?createRgb16Surface(nativeStore,{width:w,height:h,budget,sourceDepth:16,color:{model:'RGB',primaries:'srgb',transfer:'srgb',role:'derived-normalized-channel',interpretation:'gray-code-map-not-colorimetric-source'},provenance:{operation:'colors.space',kind:'normalized-channel16'}}):createRgbSurface(output,{width:w,height:h,budget});
  return{surface,semantics:'Native color channels at full resolution; oriented row width and vector/scalar tails preserved. Derived grayscale RGB visualization; original unchanged.',metrics:{...pool.metrics(),...(native?{inputDepth:16}:{}),totalMs:performance.now()-started,readMs,kernelMs,writeMs,blocks,rowsPerBlock:rows,storage:output.storage,retainedResultBytes:n*outputBytes}};
 }catch(error){failed=true;primary=native?error:error?.cleanupOwner?error:normalizeResourceError(error);throw primary;}finally{if(native){try{await retirement.retire({endpoints:true});}catch(cleanup){const failure=failed?primary:cleanup;failed=true;throw withRetirementOwner(failure,cleanupOwner,cleanup);}}else await retireCompositeOwners([()=>failed?output?.dispose():undefined,()=>pool.clear(),()=>planning?.(),()=>staging?.()],failed?{primary}:{});}
}

// The same segmented producer consumes a real typed view of Original. Source
// metadata is captured by Core; it is never reacquired through a public RPC.
export async function nativeColorSpaces(surface,params,options){
 const {budget,signal,sourceBinding,sourcePrecision,isSourceCurrent,pixelScheduling}=options;let borrow,color,record,delivered=false,debt,flight,sourceReads=0,sourceBytes=0;
 const owner={dispose(){if(flight)return flight;const task=(async()=>{if(debt){const answer=await debt.dispose();if(answer===false||answer===0)throw answer;debt=null;}if(record&&!delivered){const answer=await record.surface.dispose();if(answer===false||answer===0)throw answer;record=null;}if(color){await color.dispose();color=null;}if(borrow){await borrow.dispose();borrow=null;}})();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;}};
 try{
  borrow=createBorrowedSourceSamples({surface,budget,bindingOriginal:sourceBinding,sourcePrecision,isCurrent:isSourceCurrent,onOwner:value=>borrow=value});
  if(!NATIVE16_ALGEBRAIC_COLOR_SPACES.includes(params?.space??'rgb')){color=createCieColorOwner(options.sourceSurface??surface,{...options,logicalDescriptor:surface.descriptor});await color.prepare();}
  const input={session:options.temporarySession,ensureTemporarySession:options.getTemporarySession,pixelScheduling,...(color?{colorInputBytes:color.inputBytes,referenceWhite:color.white}:{}),surface:{descriptor:surface.descriptor,async readWindow(rect,hooks){color?.assertCurrent();checkAbort(hooks?.signal);const part=await borrow.readWindow(rect,hooks);sourceReads++;sourceBytes+=part.samples.byteLength;try{color?.assertCurrent();checkAbort(hooks?.signal);}catch(primary){const lateOwner={async dispose(){const reply=await part.release();if(reply===false||reply===0)throw reply;}};try{await lateOwner.dispose();}catch(cleanup){debt=lateOwner;throw withRetirementOwner(primary,owner,cleanup);}throw primary;}if(color)return color.project(part,hooks);return{...part,pixels:{format:'rgb16',width:part.width,height:part.height,data:part.samples}};}}};
  record=await segmentedColorSpaces(input,params,options);checkAbort(signal);if(isSourceCurrent()!==true)throw new EngineError('SOURCE_CHANGED','The captured color source changed before publication.');
  try{if(color){await color.dispose();record.metrics.color=color.metrics();}await borrow.dispose();borrow=null;}catch(cleanup){throw withRetirementOwner(cleanup,owner,cleanup);}
  record.metrics={...record.metrics,sourceReads,sourceBytes,nativeComputations:record.metrics.blocks>0?1:0,outputDepth:16};
  record.provenance={schema:'sherloq.native-input/1',operation:'colors.space',numericalInputDepth:16,presentationOutputDepth:16,profileConversion:'none-code-value-transform',inputColor:surface.descriptor.color??null,valueEncoding:{kind:'working-rgb-code-values',range:[0,65535],normalization:65535},sourceBinding:{...sourceBinding}};
  if(color)record.provenance={...record.provenance,profileConversion:'common-CMM-to-XYZ-D50-Float32',physical:color.metadata,channelRange:CIE_CHANNEL_RANGES[params.space][params.channel],mapping:'fixed-range-clamp-only-at-uint16-visualization',negativeFiniteValues:'algebraic-extension-until-final-clamp'};
  record.semantics='Algebraic color channels from genuine working RGB16 codes; uint16/65535 then the shared Float32 formulas. CMYK is derived RGB, not original ink channels. RGB16 channel visualization retains the native normalized range; no physical ICC/CIE conversion is claimed.';
  if(color)record.semantics='CMM XYZ D50 Float32, then CIE1976 physical coordinates (double expressions, final physical scalar Float32). Fixed declared channel range maps to RGB16; no sRGB/8-bit intermediate. Original unchanged; numerical singularities refuse publication.';
  const result=record;result.dispose=()=>result.surface.dispose();delivered=true;return result;
 }catch(primary){if(primary?.cleanupOwner===owner)throw primary;debt=primary?.cleanupOwner;if(debt)throw withRetirementOwner(primary,owner,primary?.cleanupError??primary);try{await owner.dispose();}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}throw primary;}
}

const COLOR_HEAP=64*1024**2,PROFILE_MAX=1024**2,cieOwners=new WeakMap();
const cicpNumber=v=>typeof v==='number'?v:Number(String(v??'').match(/(?:^|[- ])([0-9]+)$/)?.[1]);
const transferCode=v=>typeof v==='number'?v:({source:13,srgb:13,'iec61966-2-1':13,pq:16,hlg:18,linear:8,bt709:1,'gamma2.2':4,'gamma2.8':5}[String(v).toLowerCase()]??(Number.isInteger(cicpNumber(v))?cicpNumber(v):2));
function pcsWhite(bytes){
 const fail=()=>{throw new EngineError('COLOR_PROFILE_MISMATCH','The generated XYZ output has no valid PCS D50 white.',{details:{reason:'invalid-generated-xyz-white'}});};
 if(!(bytes instanceof Uint8Array)||bytes.length<132)fail();const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),sig=at=>String.fromCharCode(...bytes.subarray(at,at+4));if(sig(36)!=='acsp'||sig(16)!=='XYZ ')fail();const count=view.getUint32(128,false);if(count>(bytes.length-132)/12)fail();
 for(let i=0;i<count;i++){const at=132+i*12;if(sig(at)!=='wtpt')continue;const off=view.getUint32(at+4,false),size=view.getUint32(at+8,false);if(size<20||off>bytes.length-size||sig(off)!=='XYZ ')fail();const white=[8,12,16].map(n=>view.getInt32(off+n,false)/65536);if(white[1]!==1||white.some(v=>!Number.isFinite(v)||v<=0)||Math.abs(white[0]-.9642)>2/65536||Math.abs(white[2]-.8249)>2/65536)fail();return Object.freeze(white);}fail();
}
function createCieColorOwner(source,options){
 const{budget,signal,isSourceCurrent}=options,scheduler=getExecutionScheduler(budget),stop=new AbortController(),joined=signal?AbortSignal.any([signal,stop.signal]):stop.signal,rows=new Set();
 let cache,transform,profile,profileFee,colorFee,nominalProfile,parallel,parallelPlan,parallelLast,initializing,closing=false,closed=false,disposal,queue=Promise.resolve(),completed=0,firstMs,preparationMs=0,optionsColor,white,linear=false,inputFormat='rgb16',metadata;
 const logicalDescriptor=options.logicalDescriptor??source.descriptor,totalPixels=logicalDescriptor.width*logicalDescriptor.height;
 const active=new Set();const owners=cieOwners.get(budget)??new Set();if(!cieOwners.has(budget))cieOwners.set(budget,owners);
 const ack=async fn=>{const v=await fn();if(v===false||v===0)throw v;return v;};
 const current=()=>{checkAbort(joined);requireValue(!closing&&!closed,'The CIE owner is closing.');if(isSourceCurrent()!==true)throw new EngineError('SOURCE_CHANGED','The captured color source changed.');};
 const color=source.descriptor.color??{},profileRef=color.iccProfile??color.profile,trc=transferCode(color.transfer??color.transferCharacteristics??13),cooperate=createCooperator(joined);
 const owner={
  assertCurrent:current,
  get inputBytes(){return 30+(linear?12:inputFormat==='gray16'?2:0);},get white(){requireValue(white,'PCS white is not ready.');return white;},get metadata(){return metadata;},
  prepare(){if(initializing)return initializing;initializing=(async()=>{current();const started=performance.now();colorFee=budget.reserve(COLOR_HEAP+2*COLOR_NATIVE_RESOURCE.bytes+PROFILE_MAX);cache=createColorTransformCache({maximumMemoryBytes:COLOR_HEAP,maximumBandBytes:6*1024**2,maxEntries:1},{signal:joined});
   if(profileRef){requireValue(typeof source.readColorProfile==='function','Exact private source ICC access is required.');profile=await source.readColorProfile(profileRef.sha256,{signal:joined});current();const signature=String.fromCharCode(...profile.data.subarray(16,20));requireValue(['RGB ','GRAY'].includes(signature),'The working RGB view has a different ICC channel model.');inputFormat=signature==='GRAY'?'gray16':'rgb16';}
   else{linear=true;inputFormat='rgbFloat32';const declared=color.primaries??color.colorPrimaries,chromaticities=hdrPrimaryChromaticities(declared===undefined||declared==='source'?'srgb':declared);if(!chromaticities)throw new EngineError('COLOR_PROFILE_REQUIRED','These declared sample primaries have no qualified RGB ICC adapter.',{details:{reason:'cie-non-rgb-or-unknown-primary-domain',primaries:declared}});nominalProfile=await cache.createRgbProfile({chromaticities:Array.from(chromaticities),gamma:1},{signal:joined});}
   const inputProfileBytes=profile?.data??nominalProfile;profileFee=budget.reserve(inputProfileBytes.byteLength*2);optionsColor={inputProfileBytes,inputFormat,outputFormat:'xyzFloat32',intent:1,blackPointCompensation:false,...(linear?{inputUnits:'relative',extendedPolicy:'lcms-defined'}:{})};
   transform=await scheduler.run({cpu:1,signal:joined,label:'color-space-cmm-prepare'},()=>cache.acquire(optionsColor,{signal:joined}));current();if(profileRef&&transform.metadata.inputProfileSha256!==profileRef.sha256)throw new EngineError('COLOR_PROFILE_IDENTITY_MISMATCH','The acquired source ICC changed.');white=pcsWhite(transform.outputProfileBytes);preparationMs=performance.now()-started;
   metadata=Object.freeze({...transform.metadata,referenceWhite:Array.from(white),referenceWhiteSource:'generated-XYZ-profile/wtpt/s15Fixed16',units:'relative-XYZ-Ywhite=1; CIE1976-Lstar-chroma-signed',sourceTransferApplied:linear?trc:'embedded-profile',sourceProfileAssumed:!profileRef&&((color.primaries??color.colorPrimaries)===undefined||(color.primaries??color.colorPrimaries)==='source'),hdrRelativeReferenceNits:linear&&[16,18].includes(trc)?203:null,hdrUnits:linear&&trc===16?'shared-ST2084-nits/203':linear&&trc===18?'shared-HLG-OOTF1.2-1000nits/203':'relative-white-1',extendedPolicy:'lcms-defined-no-added-input-clamp'});
  })();return initializing;},
  project(part,hooks={}){
   const row={part,linear:null,receipt:null,xyz:null,fee:null,transient:null,transientFee:null,closed:false,retiring:null,published:false};rows.add(row);
   const retire=()=>{if(row.closed)return Promise.resolve();if(row.retiring)return row.retiring;const task=(async()=>{let failed=false,first;const attempt=async fn=>{try{await fn();}catch(e){if(!failed){failed=true;first=e;}}};
    await attempt(async()=>{if(row.receipt){await parallel.retireResult(row.receipt);row.receipt=null;}row.xyz=null;if(row.fee){row.fee();row.fee=null;}});
    await attempt(async()=>{row.transient=null;if(row.transientFee){row.transientFee();row.transientFee=null;}});
    await attempt(async()=>{if(row.linear){await ack(()=>row.linear.release());row.linear=null;}});
    await attempt(async()=>{if(row.part){await ack(()=>row.part.release());row.part=null;}});
    if(failed)throw first;row.closed=true;rows.delete(row);
   })();row.retiring=task;void task.finally(()=>{if(row.retiring===task)row.retiring=null;}).catch(()=>{});return task;};row.retire=retire;
   const task=queue.then(async()=>{try{checkAbort(hooks.signal);await owner.prepare();current();checkAbort(hooks.signal);let samples=part.samples;const pixels=part.width*part.height;
    if(linear||inputFormat==='gray16')await scheduler.run({cpu:1,signal:joined,label:'color-space-cmm-pack'},async()=>{row.linear=allocateOwnedTypedArray(linear?Float32Array:Uint16Array,linear?samples.length:pixels,{budget,owner:'color-space-cie',label:'native-color-pack'});for(let i=0;i<row.linear.data.length;i++){if(i%12288===0){await cooperate();}row.linear.data[i]=linear?hdrDecodeTransfer(samples[i]/65535,trc):samples[i*3];}samples=row.linear.data;});
    if(parallel){row.receipt=await parallel.convert(samples);if(row.receipt)row.xyz=row.receipt.pixels;else{await parallel.dispose();parallel=null;}}
    if(!row.receipt){row.fee=budget.reserve(pixels*12);let elapsed;row.xyz=await scheduler.run({cpu:1,signal:joined,label:'color-space-cmm'},async()=>{const channels=inputFormat==='gray16'?1:3,maxPixels=Math.floor(6*1024**2/(channels*samples.BYTES_PER_ELEMENT)),at=performance.now();let value;
     if(pixels<=maxPixels)value=transform.convert(samples,{signal:joined});else{value=allocateTypedArray(Float32Array,pixels*3,{label:'bounded-cie-xyz-row'});row.xyz=value;for(let from=0;from<pixels;from+=maxPixels){await cooperate();const count=Math.min(maxPixels,pixels-from);row.transientFee=budget.reserve(count*12);row.transient=transform.convert(samples.subarray(from*channels,(from+count)*channels),{signal:joined});value.set(row.transient,from*3);row.transient=null;row.transientFee();row.transientFee=null;}}elapsed=performance.now()-at;return value;});if(firstMs===undefined)firstMs=elapsed;}
    current();requireValue(row.xyz instanceof Float32Array&&row.xyz.length===pixels*3,'The CMM returned a different XYZ extent.');completed+=pixels;
    if(!parallel&&!parallelPlan&&completed<totalPixels){const lanePlan=describeCanonicalColorLane({inputFormat,outputFormat:'xyzFloat32',profileBytes:optionsColor.inputProfileBytes.byteLength,maximumChunkPixels:Math.min(65536,pixels),maximumMemoryBytes:COLOR_HEAP});parallelPlan=planCanonicalColorExecution({lanePlan,totalPixels:totalPixels,completedPixels:completed,observedPixels:pixels,completedCpuMs:firstMs,localPreparationMs:preparationMs,schedulerCapacity:scheduler.capacity.cpu,availableBytes:Math.max(0,budget.limit-budget.total()),workspaceBytes:pixels*owner.inputBytes});
     if(parallelPlan.workerCount&&typeof globalThis.Worker==='function')parallel=createCanonicalColorExecution({budget,scheduler,localTransform:transform,transformOptions:optionsColor,maximumPixels:Math.max(pixels,Math.min(262144,totalPixels)),executionPlan:parallelPlan,signal:joined});}
    row.published=true;return{origin:part.origin,pixels:{format:'xyzFloat32',width:part.width,height:part.height,data:row.xyz},release:retire};
   }catch(primary){stop.abort();throw withRetirementOwner(primary,owner,primary);}});queue=task.catch(()=>{});active.add(task);void task.finally(()=>active.delete(task)).catch(()=>{});return task;
  },
  metrics(){return{outputFormat:'xyzFloat32',completedPixels:completed,parallel:parallel?.metrics()??parallelLast??null,executionPlan:parallelPlan,closed,windows:rows.size};},
  dispose(){if(closed)return Promise.resolve();if(disposal)return disposal;closing=true;stop.abort();const task=(async()=>{await Promise.allSettled([initializing,...active].filter(Boolean));let refused=false,primary;for(const row of [...rows])try{requireValue(!row.published,'The CIE owner awaits its published window ACK.');await row.retire();}catch(error){if(!refused){refused=true;primary=error;}}if(refused)throw primary;if(parallel){await parallel.dispose();parallelLast=parallel.metrics();parallel=null;}if(transform){await ack(()=>transform.dispose());transform=null;}if(cache){const before=cache.snapshot();await ack(()=>cache.dispose());const after=cache.snapshot();requireValue(after.disposed&&after.entries===0&&after.activeHandles===0&&after.heapCapacityBytes===0,'CMM retirement is incomplete.');cache=null;if(before.heapCapacityBytes)budget.notifyBackingRelease?.('wasm',before.heapCapacityBytes);}if(profile){await ack(()=>profile.release());profile=null;}nominalProfile=null;optionsColor=null;profileFee?.();profileFee=null;colorFee?.();colorFee=null;closed=true;owners.delete(owner);if(!owners.size)cieOwners.delete(budget);})();disposal=task;void task.finally(()=>{if(disposal===task)disposal=null;}).catch(()=>{});return task;}
 };owners.add(owner);return owner;
}
