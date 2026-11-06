import {gpuFallbackError} from './gpu-native-boundary.js';
import {StereoSearchGpu} from './stereo-search-gpu.js';
import {createStereoGpuStream} from './stereo-gpu-stream-kernel.js';
import {roundEven} from './pixel-utils.js';
import {checkAbort} from './errors.js';
import {attachStereoGpuCleanup} from './stereo-gpu-retirement.js';

export async function stereoGpuSearch(image,{budget,profile={},backend='auto',signal}={}){
 const {width,height,data}=image,rows=roundEven(height*.5),count=Math.max(0,Math.floor(width/3)-10),required=backend==='webgpu';
 if(!budget||backend==='cpu'||!globalThis.navigator?.gpu||!count||!rows||!required&&width*rows*count<500000000)return null;
 const gpu=new StereoSearchGpu(budget,profile),sums=new Float64Array(count),stripRows=Math.max(1,Math.floor(32768/width));let primary,failed=false;
 try{
  for(let top=0;top<rows;top+=stripRows){checkAbort(signal);const h=Math.min(stripRows,rows-top),sourceRows=Math.min(h*2,height-top*2),rgb=data.subarray(top*2*width*3,(top*2+sourceRows)*width*3),result=await gpu.search(rgb,width,sourceRows,h,{signal,required});if(!result)return null;for(let i=0;i<count;i++)sums[i]+=result.sums[i];}
  const values=Float32Array.from(sums,(sum,i)=>sum*(1/(rows*(width-i-10))));let offset=-1,maximum=-Infinity;for(let i=0;i<count-1;i++){const difference=Math.fround(values[i+1]-values[i]);if(difference>maximum){maximum=difference;offset=i+10;}}if(maximum<2)offset=-1;
  return {values,offset,gpu:{...gpu.metrics},backend:'webgpu'};
 }catch(error){failed=true;primary=error;checkAbort(signal);if(required||!gpuFallbackError(error))throw error;return null;}
 finally{try{await gpu.dispose();}catch(error){if(failed)attachStereoGpuCleanup(primary,error);else throw error;}}
}

export async function stereoGpuFlow(image,offset,{budget,profile={},backend='auto',signal}={}){
 const width=image.width-offset,height=image.height,required=backend==='webgpu';
 if(!budget||!required&&width*height<262144)return null;
 let release,math,primary,failed=false,preparing=true;
 try{
  // This is a separately instantiated native module. Its CPU working set is
  // financed independently; GPU buffers/storage have their own child leases.
  release=budget.reserve(12*1024**2+width*height*116+image.width*16);
  const nativeOnly=backend==='cpu'||!globalThis.navigator?.gpu;
  math=await createStereoGpuStream({budget,profile:{...profile,...(nativeOnly?{stereoGpuSelection:'native'}:{})},signal,required});math.create(width,height);math.put(image.data,image.width,0,height,offset);preparing=false;const result=await math.flow();
  return {values:math.read(0,width*height),timings:result.timings,gpu:result.gpu,backend:result.backend};
 }catch(error){failed=true;primary=error;checkAbort(signal);if(required||!preparing||!gpuFallbackError(error))throw error;return null;}
 finally{try{await math?.dispose();}catch(error){if(failed)attachStereoGpuCleanup(primary,error);else throw error;}finally{release?.();}}
}
