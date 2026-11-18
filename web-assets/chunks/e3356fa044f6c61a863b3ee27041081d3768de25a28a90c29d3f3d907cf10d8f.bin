import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {gpuFallbackError} from './gpu-native-boundary.js';
import {retireCompositeOwners} from './composite-owner-release.js';
const MiB=1024**2,CHANNELS={rgb16:3,cmyk16:4,gray16:1};
// Estimates choose an execution owner, never a deadline or a lower precision.
const DEFAULT_GPU_COST={preparationMs:25,millisecondsPerMegapixel:12,millisecondsPerBand:1,margin:1.5};
const DEFAULT_CPU_COST={preparationMs:25,millisecondsPerMegapixel:20,millisecondsPerBand:.05,margin:1.5};
// This requested prefix is retained; no discarded calibration image is made.
export const FIRST_USEFUL_CPU_PIXELS=4096;
function genuineNative16(value){return value?.sampleType==='uint16'&&value.decodedDepth===16&&value.promoted===false&&Number.isInteger(value.sourceDepth)&&value.sourceDepth>8&&value.sourceDepth<=16;}
function linearDescription(p){
 const expected=[2.4,1/1.055,.055/1.055,1/12.92,.04045],[input,matrix,output]=p?.stages??[];
 return p?.library===2190&&p.inputFormat===262170&&p.outputFormat===262169&&p.inputChannels===3&&p.outputChannels===3&&p.evaluationMode==='float-stages'&&p.stages.length===3&&input.kind==='curves16'&&matrix.kind==='matrix'&&output.kind==='curves16'&&input.parametricTypes?.length===3&&input.parametricTypes.every(n=>n===1)&&input.parametricParameters?.length===3&&input.parametricParameters.every(v=>v.length===1&&v[0]===1)&&output.parametricTypes?.length===3&&output.parametricTypes.every(n=>n===-4)&&output.parametricParameters?.length===3&&output.parametricParameters.every(v=>v.length===5&&v.every((n,i)=>Math.abs(n-expected[i])<=1e-14));
}
export async function createNativeColorDisplay({backend='auto',transform,colorCache,maximumPixels,totalPixels=maximumPixels,maximumMemoryBytes,gpuCostEstimate={},cpuCostEstimate={},nativeInput,signal,gpu=globalThis.navigator?.gpu}={},hooks={}){
 const channels=CHANNELS[transform?.metadata?.inputFormat],cost={...DEFAULT_GPU_COST,...gpuCostEstimate},cpuCost={...DEFAULT_CPU_COST,...cpuCostEstimate},now=hooks.now??(()=>performance.now());
 requireValue(['auto','cpu'].includes(backend)&&transform&&typeof transform.convert==='function'&&transform.metadata?.outputFormat==='rgb8'&&channels&&colorCache&&typeof colorCache.snapshot==='function'&&Number.isSafeInteger(maximumPixels)&&maximumPixels>0&&Number.isSafeInteger(totalPixels)&&totalPixels>0&&Number.isSafeInteger(maximumMemoryBytes)&&maximumMemoryBytes>0&&typeof now==='function'&&[cost,cpuCost].every(c=>Object.values(c).every(v=>Number.isFinite(v)&&v>=0)&&c.margin>=1),'An existing color transform and its admitted display owner are required.');checkAbort(signal);
 let gpuOwner,cpuOwner,retirementFailure,closing=false,closed=false,disposing,pending=Promise.resolve(),fallbackReason=null,cpuFallback=null,submissionMs=0,cpuMs=0,fastCpuMs=0,gpuPixels=0,cpuPixels=0,canonicalCpuPixels=0,fastCpuPixels=0,preparationMs=0,cpuPreparationMs=0,cpuRate,candidate=false,cpuCandidate=false,tried=false,cpuTried=false,numerics={sourceSamplesPreserved:true,native16Error:0,maximumSdrCodeError:0},cpuNumerics,gpuMetrics,cpuMetrics,assessment={decision:backend==='cpu'?'cpu-requested':!gpu?'gpu-unavailable':'waiting-for-useful-band'},cpuAssessment={decision:backend==='cpu'?'cpu-requested':!genuineNative16(nativeInput)?'native-input-not-admitted':'waiting-for-useful-band'};
 const canConsiderGpu=backend==='auto'&&gpu&&transform.metadata.inputFormat==='rgb16'&&typeof transform.exportDisplayPipeline==='function';
 const canConsiderCpu=backend==='auto'&&genuineNative16(nativeInput)&&transform.metadata.inputFormat==='rgb16'&&typeof transform.exportDisplayPipeline==='function'&&typeof transform.describeDisplayPipeline==='function';
 function assessUsefulCpuBand(pixels,milliseconds){
  const rate=milliseconds/pixels;cpuRate=cpuRate===undefined?rate:.5*cpuRate+.5*rate;
  const remaining=Math.max(0,totalPixels-cpuPixels-gpuPixels),estimatedCpuMs=remaining*cpuRate;
  if(canConsiderGpu&&!tried){const estimatedGpuMs=cost.preparationMs+remaining/1e6*cost.millisecondsPerMegapixel+Math.ceil(remaining/maximumPixels)*cost.millisecondsPerBand;candidate=remaining>0&&estimatedCpuMs>estimatedGpuMs*cost.margin;assessment={decision:!remaining?'cpu-complete':candidate?'gpu-profitable':'cpu-faster',usefulCpuPixels:canonicalCpuPixels,cpuMillisecondsPerPixel:cpuRate,remainingPixels:remaining,estimatedRemainingCpuMs:estimatedCpuMs,estimatedRemainingGpuMs:estimatedGpuMs};}
  assessCpuRemaining();
 }
 function assessCpuRemaining(){if(!canConsiderCpu||cpuTried||cpuRate===undefined)return;const remaining=Math.max(0,totalPixels-cpuPixels-gpuPixels),estimatedCpuMs=remaining*cpuRate,estimate=cpuCost.preparationMs+remaining/1e6*cpuCost.millisecondsPerMegapixel+Math.ceil(remaining/maximumPixels)*cpuCost.millisecondsPerBand;cpuCandidate=remaining>0&&estimatedCpuMs>estimate*cpuCost.margin;cpuAssessment={decision:!remaining?'cpu-complete':cpuCandidate?'cpu-stages-profitable':'canonical-cpu-faster',usefulCpuPixels:canonicalCpuPixels,cpuMillisecondsPerPixel:cpuRate,remainingPixels:remaining,estimatedRemainingCanonicalMs:estimatedCpuMs,estimatedRemainingStagesMs:estimate};}
 async function prepareGpu(currentSignal,assemblyBytes=0){
  tried=true;candidate=false;const began=now();
  try{const remaining=maximumMemoryBytes-colorCache.snapshot().heapCapacityBytes-assemblyBytes;
   if(remaining>0){let pipeline=transform.exportDisplayPipeline({maximumBytes:Math.min(8*MiB,Math.floor(remaining/3)),signal:currentSignal});if(pipeline){const {createLcmsDisplayGpu}=await import('./lcms-display-gpu.js');gpuOwner=await(hooks.createGpu??createLcmsDisplayGpu)({pipeline,maximumPixels,maximumMemoryBytes:maximumMemoryBytes-colorCache.snapshot().heapCapacityBytes-assemblyBytes,signal:currentSignal,gpu});if(gpuOwner)numerics=gpuOwner.numerics;else fallbackReason={code:'GPU_UNAVAILABLE',message:'The color GPU device or its required workspace is unavailable.'};pipeline=null;}else fallbackReason={code:'PIPELINE_NOT_ADMITTED',message:'The exact color pipeline remains on its existing CPU transform.'};}else fallbackReason={code:'MEMORY_LIMIT',message:'The existing color owner has no free GPU workspace.'};
   assessment={...assessment,decision:gpuOwner?'gpu-active':'cpu-fallback'};
  }catch(error){if(error?.cleanupOwner){gpuOwner=error.cleanupOwner;retirementFailure=error;}if(error?.code==='CANCELLED'||error?.cleanupErrors?.length||error?.cleanupOwner)throw error;fallbackReason={code:error?.code??'GPU_UNAVAILABLE',message:error?.message??String(error)};assessment={...assessment,decision:'cpu-fallback'};}
  finally{preparationMs+=Math.max(0,now()-began);}
 }
 async function prepareCpu(currentSignal,assemblyBytes=0){
  cpuTried=true;cpuCandidate=false;const began=now();
  try{
   // Metadata inspection neither exports the LUT arrays nor imports the new
   // runtime. Unsupported pipelines retain their canonical transform.
   if(!linearDescription(transform.describeDisplayPipeline({signal:currentSignal}))){cpuAssessment={...cpuAssessment,decision:'pipeline-not-admitted'};return;}
   const remaining=maximumMemoryBytes-colorCache.snapshot().heapCapacityBytes-assemblyBytes;
   if(remaining<=0)throw new EngineError('MEMORY_LIMIT','The existing color owner has no free CPU stages workspace.');
   const pipeline=transform.exportDisplayPipeline({maximumBytes:Math.min(8*MiB,Math.floor(remaining/3)),signal:currentSignal});
   const create=hooks.createCpu??(await(hooks.loadCpu?.()??import('./lcms-display-cpu.js'))).createLcmsDisplayCpu;
   cpuOwner=await create({pipeline,maximumPixels,maximumMemoryBytes:maximumMemoryBytes-colorCache.snapshot().heapCapacityBytes-assemblyBytes,signal:currentSignal});
   if(cpuOwner){cpuNumerics=cpuOwner.numerics;cpuAssessment={...cpuAssessment,decision:'cpu-stages-active'};}else cpuAssessment={...cpuAssessment,decision:'canonical-cpu-fallback'};
  }catch(error){if(error?.cleanupOwner){cpuOwner=error.cleanupOwner;retirementFailure=error;}if(error?.code==='CANCELLED'||error?.cleanupErrors?.length||error?.cleanupOwner)throw error;cpuFallback={code:error?.code??'CPU_STAGES_UNAVAILABLE',message:error?.message??String(error)};cpuAssessment={...cpuAssessment,decision:'canonical-cpu-fallback'};}
  finally{cpuPreparationMs+=Math.max(0,now()-began);}
 }
 async function prepareSelected(currentSignal,assemblyBytes=0){if(candidate&&!tried)await prepareGpu(currentSignal,assemblyBytes);assessCpuRemaining();if(!gpuOwner&&canConsiderCpu&&cpuCandidate&&!cpuTried&&(!canConsiderGpu||tried))await prepareCpu(currentSignal,assemblyBytes);}
 function cpuConvert(samples,currentSignal){const started=now(),output=transform.convert(samples,{signal:currentSignal}),elapsed=Math.max(0,now()-started),pixels=output.length/3;cpuMs+=elapsed;cpuPixels+=pixels;canonicalCpuPixels+=pixels;assessUsefulCpuBand(pixels,elapsed);return output;}
 async function selectedConvert(samples,currentSignal,assemblyBytes=0){
  if(gpuOwner){const started=now();try{const output=await gpuOwner.convert(samples,{signal:currentSignal});submissionMs+=Math.max(0,now()-started);gpuPixels+=output.length/3;return output;}catch(error){if(error?.code==='CANCELLED'||!gpuFallbackError(error))throw error;const previous=gpuOwner;gpuMetrics=previous.metrics();try{await previous.dispose();}catch(cleanup){await retireCompositeOwners([()=>{throw cleanup;}],{primary:error});throw error;}gpuOwner=null;fallbackReason={code:error.code,message:error.message};assessment={...assessment,decision:'cpu-fallback'};assessCpuRemaining();if(canConsiderCpu&&cpuCandidate&&!cpuTried)await prepareCpu(currentSignal,assemblyBytes);}}
  if(cpuOwner){const started=now();try{const output=await cpuOwner.convert(samples,{signal:currentSignal});fastCpuMs+=Math.max(0,now()-started);fastCpuPixels+=output.length/3;cpuPixels+=output.length/3;return output;}catch(error){if(error?.code==='CANCELLED'||!['MEMORY_ALLOCATION','MEMORY_LIMIT','CODEC_UNAVAILABLE'].includes(error?.code))throw error;const previous=cpuOwner;cpuMetrics=previous.metrics?.();try{await previous.dispose();}catch(cleanup){retirementFailure=error;await retireCompositeOwners([()=>{throw cleanup;}],{primary:error});throw error;}cpuOwner=null;cpuFallback={code:error.code,message:error.message};cpuAssessment={...cpuAssessment,decision:'canonical-cpu-fallback'};}}
  return cpuConvert(samples,currentSignal);
 }
 const api={
  convert(samples,{signal:currentSignal=signal}={}){
   const run=async()=>{checkAbort(currentSignal);if(retirementFailure)throw retirementFailure;if(closing||closed)throw new EngineError('CLOSED','The native color display owner is closed.');requireValue(samples instanceof Uint16Array&&samples.length>0&&samples.length%channels===0&&samples.length/channels<=maximumPixels,'Native samples exceed the admitted color band.');
    if(((canConsiderGpu&&!tried)||(canConsiderCpu&&!cpuTried))&&cpuPixels===0&&samples.length/channels>FIRST_USEFUL_CPU_PIXELS){
     const cut=FIRST_USEFUL_CPU_PIXELS*channels,first=cpuConvert(samples.subarray(0,cut),currentSignal),assemblyBytes=samples.length+first.byteLength;
     await prepareSelected(currentSignal,assemblyBytes);checkAbort(currentSignal);if(closing)throw new EngineError('CLOSED','The native color display owner is closing.');
     const rest=await selectedConvert(samples.subarray(cut),currentSignal,assemblyBytes),output=new Uint8Array(samples.length);output.set(first);output.set(rest,first.length);return output;
    }
    await prepareSelected(currentSignal);checkAbort(currentSignal);if(closing)throw new EngineError('CLOSED','The native color display owner is closing.');return selectedConvert(samples,currentSignal);
   };const task=pending.then(run);pending=task.catch(()=>{});return task;
  },
  metrics(){const effectiveNumerics=fastCpuPixels?{...cpuNumerics,...(gpuPixels?{mixedGpuProjection:numerics}:{})}:gpuPixels?numerics:{sourceSamplesPreserved:true,native16Error:0,maximumSdrCodeError:0};return{backend:gpuPixels?(cpuPixels?'webgpu+cpu':'webgpu'):'cpu',inputFormat:transform.metadata.inputFormat,outputFormat:'rgb8',inputProfileSha256:transform.metadata.inputProfileSha256,sourceSamplesPreserved:true,requestedBackend:backend,totalPixels,preparationMs,cpuPreparationMs,gpuPixels,cpuPixels,canonicalCpuPixels,fastCpuPixels,gpuElapsedMs:submissionMs,cpuElapsedMs:cpuMs+fastCpuMs,canonicalCpuElapsedMs:cpuMs,fastCpuElapsedMs:fastCpuMs,assessment:{...assessment},cpuAssessment:{...cpuAssessment},gpu:gpuOwner?.metrics?.()??gpuMetrics??null,cpuStages:cpuOwner?.metrics?.()??cpuMetrics??null,numerics:effectiveNumerics,...(fallbackReason?{gpuFallback:fallbackReason}:{}),...(cpuFallback?{cpuStagesFallback:cpuFallback}:{})};},
  dispose(){if(closed)return Promise.resolve();if(disposing)return disposing;closing=true;const task=(async()=>{await pending;await retireCompositeOwners([async()=>{if(gpuOwner){gpuMetrics=gpuOwner.metrics?.();await gpuOwner.dispose();gpuOwner=null;}},async()=>{if(cpuOwner){cpuMetrics=cpuOwner.metrics?.();await cpuOwner.dispose();cpuOwner=null;}},()=>transform.dispose()]);closed=true;})();disposing=task;void task.finally(()=>{if(disposing===task)disposing=null;}).catch(()=>{});return task;}
 };return api;
}
