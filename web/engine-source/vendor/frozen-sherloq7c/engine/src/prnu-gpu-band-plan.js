import {EngineError,requireValue} from './errors.js';
// Resource envelope negotiated by the existing PRNU provider. This is not a
// timing threshold or calibration. Complete rows and their exact physical halo
// are selected against the real negotiated limits and remaining live credit.
export const PRNU_CORRELATION_BUFFER_BYTES=8*1024**2;
export function prnuGpuBandPlan({width,height,origin},limits,availableBytes){
 requireValue([width,height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=0x7fffffff)&&Number.isSafeInteger(origin)&&origin>=0&&origin<height&&Number.isSafeInteger(availableBytes)&&availableBytes>=0,'Invalid funded PRNU complete-row geometry.');
 const binding=Math.min(limits.maxBufferSize,limits.maxStorageBufferBindingSize,PRNU_CORRELATION_BUFFER_BYTES),maxGroups=limits.maxComputeWorkgroupsPerDimension;
 requireValue(Number.isSafeInteger(binding)&&binding>0&&Number.isSafeInteger(maxGroups)&&maxGroups>0,'Invalid negotiated PRNU GPU limits.');
 const shape=rows=>{const sourceTop=Math.max(0,origin-1),sourceRows=Math.min(height,origin+rows+1)-sourceTop,inputBytes=width*sourceRows*8,outputBytes=width*rows*16,groups=Math.ceil(width*rows/128),temporaryBytes=inputBytes*2+outputBytes*3+128;return {width,height,origin,rows,sourceTop,sourceRows,inputBytes,outputBytes,groups,temporaryBytes,sourceBytes:inputBytes,totalBytes:inputBytes+temporaryBytes+outputBytes};};
 const admissible=plan=>plan.inputBytes<=binding&&plan.outputBytes<=binding&&plan.groups<=maxGroups&&width*plan.rows<=0xffffffff&&plan.totalBytes<=availableBytes;
 let low=0,high=Math.max(0,Math.min(height-origin,Math.floor(binding/(width*16)),Math.floor(maxGroups*128/width),Math.floor(0xffffffff/width)));
 while(low<high){const rows=Math.floor((low+high+1)/2);if(admissible(shape(rows)))low=rows;else high=rows-1;}
 if(!low){const first=shape(1);throw new EngineError(first.inputBytes>binding||first.outputBytes>binding||first.groups>maxGroups?'GPU_LIMIT':'MEMORY_LIMIT','One funded complete PRNU GPU row with its physical halo is required.');}
 return shape(low);
}
