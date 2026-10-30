import {requireValue} from './errors.js';
import {neuralWindowRuntimeQuota} from './neural-window-memory-plan.js';
import {captureNeuralWindowBinding} from './neural-window-job-owner.js';

export function neuralWindowGlueContextIdentity(provider,heap,threads,binding,maximumJobBytes){
 if(!binding)return JSON.stringify([provider,heap,threads]);
 requireValue(provider==='webgpu'&&Number.isSafeInteger(maximumJobBytes)&&maximumJobBytes>0,'A complete GPU Window grant is required.');
 return JSON.stringify([provider,heap,threads,captureNeuralWindowBinding(binding),maximumJobBytes]);
}

/** Reclassify the existing second ORT heap as the shared Window escrow.
 * CPU heap and the unchanged512MiB GPU workspace remain with the caller. */
export function neuralWindowGluePlan({maximumHeapBytes,rows,keys,heads,dim,gpuWorkingBytes}={}){
 requireValue([maximumHeapBytes,rows,keys,heads,dim,gpuWorkingBytes].every(n=>Number.isSafeInteger(n)&&n>0),'Original complete Glue memory geometry required.');
 const population=Math.max(rows,keys),pageRows=Math.max(1,Math.min(128,Math.floor(1048576/population)));
 const inputBytes=heads*(2*population+pageRows)*dim*4+pageRows*population;
 const outputBytes=heads*pageRows*Math.max(population,dim)*4;
 const maximumJobBytes=2*693+2*inputBytes+3*outputBytes+gpuWorkingBytes+4096;
 requireValue(Number.isSafeInteger(maximumJobBytes),'Glue Window memory envelope exceeds exact integers.');
 return Object.freeze({memoryPlan:Object.freeze({hostMaximumBytes:maximumHeapBytes,persistentQuotaBytes:neuralWindowRuntimeQuota(maximumHeapBytes),gpuWorkingBytes}),maximumJobBytes});
}
