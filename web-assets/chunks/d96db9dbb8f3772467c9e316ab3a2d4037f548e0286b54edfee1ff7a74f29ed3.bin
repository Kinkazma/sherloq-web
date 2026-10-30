import "../../runtime-context.js?v=0.30.0";
import {createStereoBlurPolicy} from './stereo-useful-blur-policy.js';
import {createCooperator} from './errors.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {copyTypedArray,wasmAllocationFailure} from './allocation.js';
import {StereoGaussianGpu} from './stereo-gaussian-gpu.js';

// Optional asynchronous callbacks over the existing complete native matrices.
// The scientific binary64 solve, global pyramid, five levels/iterations and
// matrix update order remain in the original Farneback implementation.
export async function createStereoGpuStream({budget,profile={},signal,required=false}={}){
 profile={stereoGpuTransport:'resident',stereoGpuAcknowledgeReadback:true,stereoGpuSelection:'automatic',...profile};
 const {default:create}=await import('../vendor/stereo-resident-gpu/stereo-resident-gpu.js'),m=await create(),gpu=new StereoGaussianGpu(budget,profile);
 let active=false,closed=false,ioFailed=false,ioPrimary,observations=[],choices=[],policy=createStereoBlurPolicy();const cooperate=createCooperator(signal);
 m.cpuGaussianObserved=(width,height,size,kind,milliseconds)=>{observations.push({width,height,size,kind,milliseconds});policy.observeCpu(width,height,size,kind,milliseconds);};
 const input=(values,fn)=>{const pointer=m._malloc(Math.max(1,values.byteLength));if(!pointer)throw wasmAllocationFailure(m,'Stereo GPU stream input allocation failed.',values.byteLength);try{m.HEAPU8.set(new Uint8Array(values.buffer,values.byteOffset,values.byteLength),pointer);return fn(pointer);}finally{m._free(pointer);}};
 const checked=code=>{if(!code)throw new EngineError('INVALID_INPUT','Native stereogram GPU transport failed.');};
 const view=(pointer,byteLength,writable=false)=>({byteLength,async readInto(bytes,offset){requireValue(offset>=0&&offset+bytes.byteLength<=byteLength,'Stereo native matrix read outside extent.');bytes.set(m.HEAPU8.subarray(pointer+offset,pointer+offset+bytes.byteLength));},async write(bytes,offset){requireValue(writable&&offset>=0&&offset+bytes.byteLength<=byteLength,'Stereo native matrix write outside extent.');m.HEAPU8.set(bytes,pointer+offset);},async flush(){}});
 m.gpuGaussian=async(source,output,width,height,size,kernel,kind)=>{
  try{
   await cooperate();checkAbort(signal);if(profile.stereoGpuSelection==='native')return false;
   const automatic=!required&&profile.stereoGpuSelection==='automatic',choice=automatic?policy.choose(width,height,size,kind):{gpu:true,reason:'explicit-GPU-filter'};choices.push({width,height,size,kind,...choice});if(!choice.gpu)return false;
   const channels=kind?5:1,bytes=width*height*channels*4,weights=m.HEAPF32.slice(kernel/4,kernel/4+size),started=performance.now(),initBefore=gpu.metrics.initMs;
   const used=await gpu.runStore(view(source,bytes),view(output,bytes,true),width,height,weights,{signal,required,channels,kernelKind:kind?'matrix':'image',storage:'memory'});
   if(used)policy.observeGpu(width,height,size,kind,Math.max(.001,performance.now()-started-(gpu.metrics.initMs-initBefore)));else policy.refuse(size,kind);return used;
  }catch(error){ioFailed=true;ioPrimary=error;throw error;}
 };

 return {
  heapBytes:()=>m.HEAPU8.byteLength,
  create(width,height){requireValue(!closed&&!active,'Stereo stream is closed or busy.');checked(m._stereo_stream_create(width,height));},
  put(rgb,width,top,rows,offset){requireValue(!closed&&!active,'Stereo stream is closed or busy.');return input(rgb,pointer=>checked(m._stereo_stream_input(pointer,width,top,rows,offset)));},
  async flow(original=false){
   requireValue(!closed&&!active&&!original,'GPU stereogram flow requires its native arithmetic mode.');active=true;m.ioError=null;ioFailed=false;ioPrimary=undefined;observations=[];choices=[];policy=createStereoBlurPolicy();const before={...gpu.metrics};
   try{checkAbort(signal);const code=await m.ccall('stereo_stream_flow','number',['number'],[0],{async:true});if(ioFailed)throw ioPrimary;if(m.ioError)throw m.ioError;checked(code);checkAbort(signal);const pointer=m._cv_stereo_timings()/8;return {heapBytes:m.HEAPU8.byteLength,timings:Array.from(m.HEAPF64.subarray(pointer,pointer+5)),gpu:{...Object.fromEntries(Object.entries(gpu.metrics).map(([name,value])=>[name,typeof value==='number'?value-(before[name]??0):value])),nativeBlurObservations:observations,filterChoices:choices,policy:policy.snapshot()},backend:gpu.metrics.calls>before.calls?'webgpu-blur+cpu-native-f64-solve':'cpu-native-with-optional-gpu'};}
   finally{active=false;}
  },
  read(offset,count){requireValue(!closed&&!active,'Stereo stream is closed or busy.');const pointer=m._stereo_stream_output()/4;return copyTypedArray(m.HEAPF32.subarray(pointer+offset,pointer+offset+count),{label:'stereo-gpu-stream-output'});},
  async dispose(){requireValue(!active,'Stereogram GPU stream is still active.');closed=true;m.gpuGaussian=null;m.cpuGaussianObserved=null;try{await gpu.dispose();}finally{m._stereo_stream_release();}}
 };
}
