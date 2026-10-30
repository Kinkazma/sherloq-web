import "../../runtime-context.js?v=0.30.0";
import {getJpegGrayCurveService} from './jpeg-gray-curve-gpu.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {gray} from './pixel-utils.js';
import {checkAbort,createCooperator,requireValue} from './errors.js';

// Existing callers own source identity, scalar caches and native contexts.
export async function gpuJpegGrayLosses(source,qualities,{budget,backend='auto',profile,signal,onProgress,onQuality}={}){
 if(!budget||backend==='cpu')return null;
 const service=getJpegGrayCurveService(budget),surface=source.surface??(source.descriptor?source:null),shape=surface?.descriptor??source,width=shape.width,height=shape.height;
 let result,failed=false,primary;
 try{
  result=await service.run({width,height,qualities,readGrayRows:async(y,count,{signal,reserve,ownInput})=>{
   checkAbort(signal);
   if(!surface){requireValue(source.data instanceof Uint8Array&&source.data.length===width*height,'Complete native gray input required.');return{data:source.data.subarray(y*width,(y+count)*width),release(){}};}
   const owned=allocateOwnedTypedArray(Uint8Array,width*count,{budget,reserve,label:'native-JPEG-GPU-gray-band'});let part,closed=false,pending;
   // Register before source I/O. A rejected borrowed-window ACK keeps both
   // that window and this gray buffer owned for the provider's next retry.
   const owner={data:owned.data,release(){if(closed)return;if(pending)return pending;pending=(async()=>{await part?.release();part=null;await owned.release();owner.data=null;closed=true;})().finally(()=>{pending=null;});return pending;}};
   ownInput(owner);
   part=await surface.readWindow({x:0,y,width,height:count},{signal,reserve});const rgb=part.pixels.data,cooperate=createCooperator(signal);
   for(let row=0;row<count;row++){await cooperate();for(let x=0;x<width;x++){const index=row*width+x,at=index*3;owned.data[index]=gray(rgb[at],rgb[at+1],rgb[at+2]);}}
   checkAbort(signal);return owner;
  }},{backend,profile,signal,onProgress});
  if(!result)return null;
  const raw=Float64Array.from(result.raw),metrics={...result.runtime,backend:'webgpu',numericBackend:result.runtime.backend,workers:0,recompressions:qualities.length,qualityKernelMs:result.runtime.kernelMs,...service.metrics()};
  for(let index=0;index<qualities.length;index++){onQuality?.(qualities[index],raw[index]);checkAbort(signal);}
  return{raw,metrics};
 }catch(error){failed=true;primary=error;throw error;}
 finally{try{await result?.release();}catch(cleanup){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}}
}
