import "../../../../../runtime-context.js?v=0.31.0";
import {getElaGpuService} from './ela-gpu.js';
import {fusedCpu} from './ela-lut.js';
import {copyTypedArray} from './allocation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort} from './errors.js';

const NATIVE_JPEG_IDS=new Set(['libjpeg-turbo-3.0.3/emscripten-4.0.15/islow-v1','controlled-jpeg-and-opencv-4.11.0-wasm']);
export const nativeJpegPreviewCodec=codec=>NATIVE_JPEG_IDS.has(codec?.id);
// Preview selection is explicit. The global native-operation auto policy is
// unchanged; non-JPEG codecs always supply their actual decoded RGB pair.
export function elaPreviewBackend(backend='auto'){
 requireValue(['auto','cpu','webgpu'].includes(backend),'Invalid Classic preview backend.');
 return backend==='auto'?(globalThis.navigator?.gpu?'webgpu':'cpu'):backend;
}
function metrics(owned,gpu,selected,started,gpuMilliseconds,compose=false){
 const runtime=owned?.runtime;
 return {backend:owned?'webgpu':'cpu',preferredBackend:selected,kernel:owned?(compose?'native-ISLOW420-pixel-composition-and-ELA-LUT':'native-ELA-residual-LUT'):'cpu-lookup',gpuRenderCalls:owned?1:0,gpuComposeCalls:owned&&compose?1:0,gpuRecompressionCalls:owned&&compose?1:0,gpuRenderMs:owned?gpuMilliseconds:0,gpuKernelMilliseconds:runtime?.kernelMs??0,gpuPipelineCompileMilliseconds:runtime?.pipelineCompileMs??0,gpuInitializationMilliseconds:runtime?.initializationMilliseconds??0,setupMilliseconds:Number.isFinite(runtime?.setupMilliseconds)?runtime.setupMilliseconds:0,cold:runtime?.cold===true,renderMilliseconds:performance.now()-started,...(gpu?.metrics?.()??{})};
}
export async function composeElaPreviewJpeg(original,width,height,params,table,{budget,signal,backend='auto',gpuService,copyRecompressed=false}={}){
 const selected=elaPreviewBackend(backend);if(selected!=='webgpu')return null;
 requireValue(budget&&original instanceof Uint8Array&&original.length===width*height*3,'Complete native JPEG preview RGB8 required.');checkAbort(signal);
 const started=performance.now(),gpu=gpuService??getElaGpuService(budget);let owned,failed=false,primary;
 try{const begin=performance.now();owned=await gpu.compose(original,width,height,params,table,{signal,backend:'webgpu',profileKey:'classic-preview'});const gpuMilliseconds=performance.now()-begin;if(!owned)return null;
  const data=copyTypedArray(owned.data,{label:'ELA-preview-GPU-JPEG-output'}),recompressed=copyRecompressed?copyTypedArray(owned.recompressed,{label:'ELA-preview-GPU-JPEG-pair'}):undefined;checkAbort(signal);return {data,...(recompressed?{recompressed}:{}),codecProvenance:{codec:'jpeg',format:'jpeg',lossless:false,quality:params.quality,encoder:'libjpeg-turbo-3.0.3/integer-ISLOW420-pixel-composition',decoder:'lossless-entropy-identity-fused-preview',preview:true},metrics:metrics(owned,gpu,selected,started,gpuMilliseconds,true)};
 }catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>owned?.release()],failed?{primary}:{});}
}
export async function renderElaPreviewPair(original,recompressed,width,height,params,table,{budget,signal,backend='auto',gpuService}={}){
 requireValue(budget&&original instanceof Uint8Array&&recompressed instanceof Uint8Array&&original.length===width*height*3&&recompressed.length===original.length,'Matching preview RGB8 pair required.');
 checkAbort(signal);const selected=elaPreviewBackend(backend),started=performance.now();let owned,failed=false,primary,gpuMilliseconds=0;
 const gpu=selected==='webgpu'?(gpuService??getElaGpuService(budget)):null;
 try{
  if(gpu){const begin=performance.now();owned=await gpu.residual(original,recompressed,width,height,params,table,{signal,backend:'webgpu',profileKey:'classic-preview'});gpuMilliseconds=performance.now()-begin;}
  const data=owned?copyTypedArray(owned.data,{label:'ELA-preview-GPU-output'}):await fusedCpu(original,recompressed,params,table,{signal});checkAbort(signal);
  return {data,metrics:metrics(owned,gpu,selected,started,gpuMilliseconds)};
 }catch(error){failed=true;primary=error;throw error;}
 finally{await retireCompositeOwners([()=>owned?.release()],failed?{primary}:{});}
}
