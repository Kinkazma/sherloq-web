import {requireValue} from './errors.js';
// One bounded record per used image, already financed with the training
// manifest. Existing HDF5 writers/readers preserve this optional object. It is
// descriptive metadata, never an imported admission or performance verdict.
export function prnuTrainingResidualProvenance(requested,residual){
 requireValue(['cpu','webgpu','auto'].includes(requested),'Invalid PRNU training backend provenance.');
 const backend=residual?.backend,method=residual?.method,nativeMethod=residual?.nativeMethod;
 requireValue((backend==='cpu'&&['fft','direct'].includes(method)||backend==='webgpu'&&method==='gpu-spatial-3x3')&&['fft','direct'].includes(nativeMethod),'Invalid PRNU residual operator provenance.');
 const fallback=residual.gpuFallbackReason;
 requireValue(fallback===undefined||['GPU_UNAVAILABLE','GPU_FAILED','GPU_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY'].includes(fallback),'Invalid PRNU fallback provenance.');
 return Object.freeze({schema:'prnu-residual/1',requested,backend,method,nativeMethod,...(fallback?{fallback}:{})});
}
