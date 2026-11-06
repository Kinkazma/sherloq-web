import {nativeModuleFailure,copyTypedArray,wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
let ready,pending;
export const RESAMPLING_INITIAL_HEAP=32*1024**2,RESAMPLING_HEAP_LIMIT=512*1024**2;
export const resamplingHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
export async function initResamplingMath({wasmBinary}={}){
 if(ready)return ready;if(pending)return pending;
 pending=import('../vendor/resampling/resampling.js').then(({default:create})=>create(wasmBinary?{wasmBinary}:{}));
 try{ready=await pending;return ready;}catch(error){pending=null;throw error;}
}
export function resamplingHeapBound(width,height,mode){
 requireValue(['fft','pyrup'].includes(mode)&&Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=16384&&height<=16384,'Invalid resampling arithmetic dimensions.');
 // Input/output + pyrUp horizontal buffer, or two 1-D FFT plans and workspace.
 // 32 MiB covers plans up to the explicit 16384 dimension limit, allocator and
 // static data. Linear WASM growth can add at most one further 16 MiB step.
 const bound=width*height*(mode==='fft'?24:56)+32*1024**2+16*1024**2;
 if(bound>RESAMPLING_HEAP_LIMIT)throw new EngineError('MEMORY_LIMIT','Resampling arithmetic exceeds its verified WASM staging limit.');return Math.max(RESAMPLING_INITIAL_HEAP,bound);
}
async function execute(values,width,height,mode,{signal}={}){
 requireValue(values instanceof Float64Array&&Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=16384&&height<=16384&&values.length===width*height,'Resampling arithmetic requires a complete binary64 rectangle.');
 const count=values.length*(mode==='fft'?2:4);resamplingHeapBound(width,height,mode);
 await controlCheckpoint(signal);let m;
 try{m=ready??(pending?await pending:await initResamplingMath());}catch(cause){throw nativeModuleFailure(cause,'Local resampling arithmetic module could not load.');}checkAbort(signal);let source=0,result=0;
 try{
  source=m._malloc(values.byteLength);result=m._malloc(count*8);if(!source||!result)throw wasmAllocationFailure(m,'Resampling arithmetic allocation failed.',undefined);m.HEAPF64.set(values,source/8);
  if(!m[mode==='fft'?'_resampling_fft2':'_resampling_pyrup'](source,result,width,height))throw wasmAllocationFailure(m,'Resampling arithmetic working allocation failed.',undefined);checkAbort(signal);return copyTypedArray(m.HEAPF64.subarray(result/8,result/8+count),{label:'resampling-math-output'});
 }finally{if(source)m._free(source);if(result)m._free(result);}
}
// These internal primitives require the operation's shared-budget admission.
// Complex output is interleaved binary64 real/imaginary, without fftshift.
export const resamplingFft2=(values,width,height,hooks)=>execute(values,width,height,'fft',hooks);
export const resamplingPyrUp=(values,width,height,hooks)=>execute(values,width,height,'pyrup',hooks);
