import "../../runtime-context.js?v=0.30.0";
import {M3_ORT_ASSETS} from './m3-ort-assets.js';
import {requireValue} from './errors.js';
const page=65536;
/** Reclassifies the existing caller's host capacity. It does not invent a
 * smaller scientific shape or count GPU workspace twice as persistent heap.
 * compiledModuleOverhead is the same conservative binary/module allowance as
 * the Native resident plans, not a physical-memory measurement. */
export function neuralWindowRuntimeQuota(hostMaximumBytes){requireValue(Number.isSafeInteger(hostMaximumBytes)&&hostMaximumBytes>=16*1024**2&&hostMaximumBytes<=2*1024**3&&hostMaximumBytes%page===0,'A Native host capacity in wasm pages is required.');return Math.ceil((hostMaximumBytes+2*M3_ORT_ASSETS.gpu.bytes+4*1024**2)/page)*page;}
export function neuralWindowMemoryPlan({hostMaximumBytes,gpuWorkingBytes,modelBytes,inputBytes,outputBytes}={}){
 requireValue(Number.isSafeInteger(hostMaximumBytes)&&hostMaximumBytes>=16*1024**2&&hostMaximumBytes<=2*1024**3&&hostMaximumBytes%page===0&&[gpuWorkingBytes,modelBytes,inputBytes,outputBytes].every(n=>Number.isSafeInteger(n)&&n>=0)&&modelBytes>0&&outputBytes>0,'An unchanged Native host/workspace and complete IO plan is required.');
 const compiledModuleOverhead=2*M3_ORT_ASSETS.gpu.bytes+4*1024**2,persistentQuotaBytes=neuralWindowRuntimeQuota(hostMaximumBytes),jobBytes=modelBytes*2+inputBytes*2+outputBytes*3+gpuWorkingBytes+4096;
 requireValue(Number.isSafeInteger(persistentQuotaBytes+jobBytes),'Window memory plan exceeds exact integer range.');return Object.freeze({hostMaximumBytes,compiledModuleOverhead,persistentQuotaBytes,jobBytes,gpuWorkingBytes,capacityIsPhysicalMeasurement:false,reason:'Existing Native host ABI plus pinned module allowance; GPU working storage belongs to each actually retired job.'});
}
