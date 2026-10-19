import {requireValue} from './errors.js';
const MiB=1024**2;
/** Grow only the measured GPU path. The CPU keeps its historical GEMM shapes.
 * Device limits are observed on the execution device, never adapter estimates.
 * The plan reserves at least four times each score tensor's live byte size.
 */
export function ritaAttentionBytes(budgetBytes,{backend='auto',gpuAvailable=Boolean(globalThis.navigator?.gpu),cpuOnly=false,gpuDeviceLimits}={}){
 requireValue(Number.isSafeInteger(budgetBytes)&&budgetBytes>0,'Invalid RITA attention memory budget.');
 const historical=Math.max(1,Math.min(256*MiB,Math.floor(budgetBytes/8))),limits=gpuDeviceLimits;
 if(backend==='cpu'||cpuOnly||!gpuAvailable||!limits||!Number.isSafeInteger(limits.maxStorageBufferBindingSize)||!Number.isSafeInteger(limits.maxBufferSize)||limits.maxStorageBufferBindingSize<=64*1024||limits.maxBufferSize<=64*1024)return historical;
 const deviceBytes=Math.min(limits.maxStorageBufferBindingSize,limits.maxBufferSize)-64*1024;
 return Math.max(1,Math.min(512*MiB,Math.floor(budgetBytes/8),deviceBytes*4));
}
/** Every query sees ALL native keys. Windowing changes live memory only. */
export function ritaQueryPlan(block,keys,channels,attentionBytes,{backend='auto',gpuAvailable=Boolean(globalThis.navigator?.gpu),cpuOnly=false}={}){
 requireValue(Number.isSafeInteger(keys)&&keys>0&&Number.isSafeInteger(channels)&&channels>0&&Number.isSafeInteger(block.heads)&&block.heads>0&&channels%block.heads===0&&Number.isSafeInteger(attentionBytes)&&attentionBytes>0,'Invalid RITA attention geometry.');
 const split=block.querySplitValue;if(split)requireValue(typeof split.name==='string'&&split.chunkKeys===1024&&Number.isSafeInteger(split.minKeys)&&split.minKeys>0,'Invalid RITA split-value graph contract.');
 const useSplit=!!(split&&backend!=='cpu'&&!cpuOnly&&gpuAvailable&&keys>=split.minKeys),paddedKeys=useSplit?Math.ceil(keys/1024)*1024:keys,bytesPerQuery=paddedKeys*block.heads*4*(useSplit?8:4)+channels*4*16,bankBytes=keys*channels*8;
 return {name:useSplit?split.name:block.query,splitValue:useSplit,paddedKeys,queries:Math.max(1,Math.floor(attentionBytes/bytesPerQuery)),workspaceBytes:count=>(useSplit?bankBytes*2:bankBytes)+count*bytesPerQuery};
}
