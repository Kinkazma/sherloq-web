import "../../runtime-context.js?v=0.33.2";
import {requireValue} from './errors.js';
import {COLOR_TRANSFORM_LAYOUTS} from './color-managed-runtime.js';
import {COLOR_NATIVE_RESOURCE} from './color-managed-resource.js';
const MiB=1024**2;
const DEFAULT_COST=Object.freeze({startupFromLocalPreparation:4,speedupPerAdditionalWorker:.75,margin:1.5});
export function describeCanonicalColorLane({inputFormat,outputFormat,profileBytes,maximumChunkPixels,
 maximumMemoryBytes=32*MiB}={}){
 const input=COLOR_TRANSFORM_LAYOUTS.inputs[inputFormat],output=COLOR_TRANSFORM_LAYOUTS.outputs[outputFormat];
 requireValue(input&&output
  &&Number.isSafeInteger(profileBytes)&&profileBytes>=128
  &&Number.isSafeInteger(maximumChunkPixels)&&maximumChunkPixels>0
  &&Number.isSafeInteger(maximumMemoryBytes)&&maximumMemoryBytes>=16*MiB
  &&maximumMemoryBytes<=2**32&&maximumMemoryBytes%65536===0,
 'An existing canonical CMM layout and admitted extent are required.');
 const inputBytes=maximumChunkPixels*input.bytesPerPixel,outputBytes=maximumChunkPixels*output.bytesPerPixel;
 requireValue(inputBytes<=maximumMemoryBytes/4&&inputBytes+outputBytes<=maximumMemoryBytes/2,
  'The colour chunk exceeds the canonical CMM band capacity.');
 const transportBytes=2*(inputBytes+outputBytes),runtimeHeadroomBytes=8*MiB,
  residentBytes=maximumMemoryBytes+runtimeHeadroomBytes+2*COLOR_NATIVE_RESOURCE.bytes+4*profileBytes+MiB+transportBytes+65536;
 requireValue(Number.isSafeInteger(residentBytes),'The lane exceeds safe resource arithmetic.');
 return Object.freeze({inputFormat,outputFormat,inputSampleType:input.sampleType,outputSampleType:output.sampleType,
  inputChannels:input.channels,outputChannels:output.channels,inputBytesPerPixel:input.bytesPerPixel,
  outputBytesPerPixel:output.bytesPerPixel,maximumMemoryBytes,maximumChunkPixels,maximumBandBytes:Math.max(8,inputBytes),
  transportBytes,residentBytes,outputBytes,profileBytes,runtimeHeadroomBytes,nativeResourceBytes:COLOR_NATIVE_RESOURCE.bytes});
}
export function planCanonicalColorExecution({lanePlan,totalPixels,completedPixels,completedCpuMs,
 localPreparationMs,schedulerCapacity,availableBytes,workspaceBytes,observedPixels=completedPixels,costEstimate={}}={}){
 const costs={...DEFAULT_COST,...costEstimate};
 requireValue(lanePlan&&Number.isSafeInteger(lanePlan.residentBytes)&&lanePlan.residentBytes>0
  &&Number.isSafeInteger(totalPixels)&&totalPixels>0&&Number.isSafeInteger(completedPixels)
  &&completedPixels>0&&completedPixels<=totalPixels&&Number.isSafeInteger(observedPixels)&&observedPixels>0&&observedPixels<=completedPixels&&Number.isFinite(completedCpuMs)&&completedCpuMs>=0
  &&Number.isFinite(localPreparationMs)&&localPreparationMs>=0&&Number.isSafeInteger(schedulerCapacity)&&schedulerCapacity>0
  &&Number.isSafeInteger(availableBytes)&&availableBytes>=0&&Number.isSafeInteger(workspaceBytes)&&workspaceBytes>=0
  &&Object.values(costs).every(v=>Number.isFinite(v)&&v>=0)&&costs.margin>=1,
 'The colour execution forecast needs actual canonical work and Core resources.');
 const remaining=totalPixels-completedPixels,cpuRate=completedCpuMs/observedPixels,
  room=Math.max(0,availableBytes-workspaceBytes-lanePlan.profileBytes),
  admitted=Math.min(schedulerCapacity,Math.floor(room/lanePlan.residentBytes)),
  estimatedCpuMs=remaining*cpuRate,estimatedStartupMs=costs.startupFromLocalPreparation*localPreparationMs,
  speedup=1+Math.max(0,admitted-1)*costs.speedupPerAdditionalWorker,
  estimatedParallelMs=estimatedStartupMs+estimatedCpuMs/speedup,
  workerCount=admitted>=2&&remaining>0&&estimatedCpuMs>estimatedParallelMs*costs.margin?admitted:0;
 return Object.freeze({workerCount,lanePlan,assessment:Object.freeze({decision:!remaining?'serial-complete':workerCount?'parallel-profitable':'serial-canonical',
  completedPixels,usefulCpuPixels:observedPixels,cpuMillisecondsPerPixel:cpuRate,remainingPixels:remaining,localPreparationMs,
  estimatedStartupMs,estimatedRemainingCpuMs:estimatedCpuMs,estimatedRemainingParallelMs:estimatedParallelMs,
  schedulerCapacity,memoryAdmittedWorkers:admitted,selectedWorkers:workerCount}),
  costModel:Object.freeze({...costs,meaning:'Forecast from canonical work only; actual startup is recorded separately'})});
}

/** Preserve existing accelerated owners. Timings belong to the same complete
 * canonical band, never to GPU/fastCPU work nor their preparation. */
export function describeCanonicalColorBand({pixels,elapsedMs,displayBefore,displayAfter}={}){
 requireValue(Number.isSafeInteger(pixels)&&pixels>0&&Number.isFinite(elapsedMs)&&elapsedMs>=0,
  'One actual complete colour band is required.');
 if(!displayAfter)return Object.freeze({eligible:true,decision:'canonical-cpu-band',canonicalPixels:pixels,canonicalCpuMs:elapsedMs});
 const delta=field=>(displayAfter[field]??0)-(displayBefore?.[field]??0),canonicalPixels=delta('canonicalCpuPixels'),
  canonicalCpuMs=delta('canonicalCpuElapsedMs'),gpuPixels=delta('gpuPixels'),fastCpuPixels=delta('fastCpuPixels'),
  preferredPending=['gpu-profitable','gpu-active'].includes(displayAfter.assessment?.decision)
   ||['cpu-stages-profitable','cpu-stages-active'].includes(displayAfter.cpuAssessment?.decision),
  eligible=canonicalPixels===pixels&&gpuPixels===0&&fastCpuPixels===0&&!preferredPending;
 requireValue([canonicalPixels,canonicalCpuMs,gpuPixels,fastCpuPixels].every(n=>Number.isFinite(n)&&n>=0),
  'The colour display counters differ from their actual band.');
 return Object.freeze({eligible,decision:eligible?'canonical-cpu-band':preferredPending||gpuPixels||fastCpuPixels?'preferred-display-owner':'mixed-band-not-observed',
  canonicalPixels,canonicalCpuMs,gpuPixels,fastCpuPixels,preferredPending});
}
