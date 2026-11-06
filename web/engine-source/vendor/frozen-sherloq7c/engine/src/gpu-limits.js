import {EngineError} from './errors.js';
// Negotiating an API limit allocates no workload buffers and runs no shader.
// For bounded kernels request only their largest useful buffer. Full-image
// kernels with dimensions supplied later retain the adapter's exposed range.
export async function requestStorageDevice(adapter,{desiredBytes=Infinity,minimumBytes=0,label='compute'}={}){
 const storage=adapter.limits.maxStorageBufferBindingSize,buffer=adapter.limits.maxBufferSize,maximum=Math.min(storage,buffer);
 if(minimumBytes>maximum)throw new EngineError('GPU_LIMIT','Required buffer exceeds the adapter limits.',{details:{label,requestedBytes:minimumBytes,maxStorageBufferBindingSize:storage,maxBufferSize:buffer}});
 return adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:Math.min(storage,Math.max(256,desiredBytes)),maxBufferSize:Math.min(buffer,Math.max(256,desiredBytes))}});
}
export function storageDeviceLimits(device){return {maxStorageBufferBindingSize:device.limits.maxStorageBufferBindingSize,maxBufferSize:device.limits.maxBufferSize,maxComputeWorkgroupsPerDimension:device.limits.maxComputeWorkgroupsPerDimension};}
