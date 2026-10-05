import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
const MiB=1024**2;
// dense-paged.wasm is built with MAXIMUM_MEMORY=1 GiB. Leave 24 MiB for
// stack, allocator and module bookkeeping. This bounds a workspace, not images.
export const DENSE_PAGED_WORKSPACE_BYTES=1000*MiB;
// The first kernel publishes one JS pool snapshot. Without shared memory,
// each kernel also retains a structured-clone staging copy while restoring it.
export function densePagedMinimumWorkspace(n,{shared=typeof SharedArrayBuffer==='function'&&globalThis.crossOriginIsolated===true}={}){
 requireValue(Number.isSafeInteger(n)&&n>0&&n<=0x7fffffff,'Invalid dense pool size.');
 const poolBytes=2*(Math.ceil(n/64)*8+(Math.ceil(Math.ceil(n/64)/16)+1)*4),bootstrapStagingBytes=shared?0:poolBytes,minimumKernelBytes=32*MiB+poolBytes+bootstrapStagingBytes;
 return {poolBytes,bootstrapStagingBytes,minimumKernelBytes,minimumFieldBytes:minimumKernelBytes+poolBytes};
}
export function planDensePageMemory({lengths,pageBytes=4096,availableBytes,residentBytes=0,n,dimensions,cachePages,initialBatchPixels}){
 requireValue(Array.isArray(lengths)&&lengths.every(n=>Number.isSafeInteger(n)&&n>=0)&&Number.isSafeInteger(pageBytes)&&pageBytes>=512&&pageBytes%8===0,'Invalid dense page lengths.');
 requireValue(Number.isFinite(availableBytes)&&Number.isSafeInteger(residentBytes)&&residentBytes>=0&&Number.isSafeInteger(n)&&n>0&&[12,128].includes(dimensions),'Invalid dense workspace inputs.');
 requireValue(cachePages===undefined||Number.isSafeInteger(cachePages)&&cachePages>=1&&cachePages<=0x7fffffff,'Invalid dense page cache.');
 requireValue(initialBatchPixels===undefined||Number.isSafeInteger(initialBatchPixels)&&initialBatchPixels>=0&&initialBatchPixels<=0x7fffffff,'Invalid dense initialization batch.');
 const allowance=Math.min(availableBytes,DENSE_PAGED_WORKSPACE_BYTES),overhead=16*MiB+residentBytes,elementBytes=dimensions*4+24;
 const bytesFor=pages=>lengths.reduce((sum,length,id)=>sum+Math.min(Math.ceil(length/pageBytes),id<2?pages:Math.ceil(pages/8))*(pageBytes+32),0);
 const automatic=cachePages===undefined;
 if(cachePages===undefined){
  // Admit exact cache sizes, including small planes, instead of capping every
  // descriptor plane at 16 MiB. Initialization and propagation reuse RAM;
  // a larger propagation cache must not shrink the sorted initialization batch.
  const cacheAllowance=Math.max(0,allowance-overhead)*.65;
  let low=1,high=Math.min(0x7fffffff,Math.max(1,...lengths.map((length,id)=>Math.ceil(length/pageBytes)*(id<2?1:8))));
  while(low<high){const middle=Math.ceil((low+high)/2);if(bytesFor(middle)<=cacheAllowance)low=middle;else high=middle-1;}
  cachePages=low;
 }
 const cacheBytes=bytesFor(cachePages);
 let initialCachePages=automatic&&n>=65536&&initialBatchPixels!==0?Math.min(4096,cachePages):cachePages;
 // On very tight budgets, leave actual room for initialization before choosing
 // the batch. This changes storage scheduling, never which candidates are tried.
 if(automatic)while(initialCachePages>1&&bytesFor(initialCachePages)>(allowance-overhead)*.65)initialCachePages=Math.max(1,Math.floor(initialCachePages/2));
 let initialCacheBytes=bytesFor(initialCachePages),initialBase=overhead+initialCacheBytes;
 initialBatchPixels??=n>=65536?Math.max(0,Math.min(n,4194304,Math.floor((availableBytes-initialBase-12*MiB)*.75/elementBytes),Math.floor((allowance-initialBase-8*MiB)/elementBytes))):0;
 if(!initialBatchPixels){initialCachePages=cachePages;initialCacheBytes=cacheBytes;initialBase=overhead+initialCacheBytes;}
 const batchBytes=initialBatchPixels?8*MiB+Math.min(n,initialBatchPixels)*elementBytes:0,workspaceBytes=overhead+Math.max(cacheBytes,initialCacheBytes+batchBytes);
 if(workspaceBytes>allowance)throw new EngineError('MEMORY_LIMIT','Dense caches and initialization exceed available workspace.');
 return {cachePages,cacheBytes,initialCachePages,initialCacheBytes,initialBatchPixels,batchBytes,workspaceBytes};
}
