import "../../runtime-context.js?v=0.30.0";
import {EngineError,checkAbort} from './errors.js';
import {nativeGpuSync,nativeGpuAsync,gpuFallbackError} from './gpu-native-boundary.js';
import {drainGpuTransactions,attachGpuCleanup} from './gpu-ack-retirement.js';
export function initializeGpuOwner(owner,budget,label){
 owner.budget=budget;owner.gpuLabel=label;owner.device=null;owner.ready=null;owner.busy=false;owner.closed=false;owner.lost=false;owner.deviceDestroyed=false;owner.pending=new Set();owner.pendingResults=new Set();owner.orphanPipelineFees=new Set();owner.fallbackFailures=new WeakSet();owner.retirementNeeded=false;owner.unregister=null;owner.disposal=null;owner.disposalComplete=false;
}
export function gpuOwnerFailure(owner,error){if(error&&typeof error==='object'&&(gpuFallbackError(error)||error.code==='CODEC_UNAVAILABLE'))owner.fallbackFailures.add(error);return error;}
export const gpuOwnerMayFallback=(owner,error)=>!!error&&typeof error==='object'&&owner.fallbackFailures.has(error);
export function gpuOwnerSync(owner,operation,signal){try{return nativeGpuSync(operation,{signal});}catch(error){throw gpuOwnerFailure(owner,error);}}
export async function gpuOwnerAsync(owner,operation,signal){try{return await nativeGpuAsync(operation,{signal});}catch(error){throw gpuOwnerFailure(owner,error);}}
export function gpuOwnerReserve(owner,bytes){try{return owner.budget.reserve(bytes);}catch(error){throw gpuOwnerFailure(owner,error);}}
export async function openOwnedGpuDevice(owner,signal,limits){
 if(!globalThis.navigator?.gpu)throw gpuOwnerFailure(owner,new EngineError('GPU_UNAVAILABLE','WebGPU unavailable.'));
 owner.unregister??=owner.budget.registerAsyncReclaimer?.(async()=>{if(owner.busy)return 0;const before=owner.budget.total();await retireOwnedGpuDevice(owner);return Math.max(0,before-owner.budget.total());},{allocationKind:'gpu',owner:owner.gpuLabel,label:'idle-'+owner.gpuLabel});
 const adapter=await gpuOwnerAsync(owner,()=>navigator.gpu.requestAdapter({powerPreference:'high-performance'}),signal);if(!adapter)throw gpuOwnerFailure(owner,new EngineError('GPU_UNAVAILABLE','WebGPU adapter unavailable.'));checkAbort(signal);
 const device=await gpuOwnerAsync(owner,()=>adapter.requestDevice(limits?{requiredLimits:limits(adapter)}:{}),signal);owner.device=device;owner.deviceDestroyed=false;owner.lost=false;device.lost?.then(()=>{if(owner.device===device)owner.lost=true;});return device;
}
export async function retireOwnedGpuDevice(owner){
 const device=owner.device;owner.retirementNeeded=true;let failed=false,primary;const attempt=async action=>{try{await action();}catch(error){if(!failed){failed=true;primary=error;}}};let acknowledged=!device;
 if(device&&!owner.deviceDestroyed)await attempt(()=>{nativeGpuSync(()=>device.destroy());owner.deviceDestroyed=true;});
 await attempt(()=>drainGpuTransactions(owner));
 // Published live views are absent from this set. Only failed/unpublished
 // retirements remain, so pressure may finish their ACK without stealing data.
 for(const result of [...owner.pendingResults])await attempt(()=>result.release());
 if(device)await attempt(async()=>{try{await nativeGpuAsync(()=>device.queue.onSubmittedWorkDone());}catch(error){if(!owner.deviceDestroyed||!device.lost)throw error;await device.lost;}acknowledged=owner.deviceDestroyed;});
 if(acknowledged&&!owner.pending.size){
  owner.device=null;owner.ready=null;owner.lost=false;await attempt(()=>owner.retirePipelines?.());
  for(const free of owner.orphanPipelineFees)await attempt(async()=>{await free();owner.orphanPipelineFees.delete(free);});
  if(!failed){owner.retirementNeeded=false;owner.unregister?.();owner.unregister=null;}
 }
 if(failed)throw primary;
}
export async function disposeGpuOwner(owner,retireMetadata){
 if(owner.busy)throw new EngineError('BUSY','GPU producer must drain before disposal.');owner.closed=true;
 if(owner.disposalComplete&&owner.pendingResults.size){owner.disposal=null;owner.disposalComplete=false;}
 return owner.disposal??=(async()=>{let failed=false,primary;try{await retireOwnedGpuDevice(owner);}catch(error){failed=true;primary=error;}if(failed)throw primary;await retireMetadata?.();owner.disposalComplete=true;})().catch(error=>{owner.disposal=null;owner.disposalComplete=false;throw error;});
}
