import {observeJpegGrayCpu} from './jpeg-gray-curve-gpu.js';
import {gpuJpegGrayLosses} from './jpeg-gray-curve-stage.js';
import {parameters,gray,rows} from './pixel-utils.js';
import {checkAbort,requireValue} from './errors.js';
export const recompressionParams=(p={})=>parameters(p,{});
// Shared raw grayscale losses, independent of normalization/model/panel settings.
export async function recompressionLosses(image,qualities,hooks={},context={}) {
  requireValue(qualities.length>0&&qualities.every((q,i)=>Number.isInteger(q)&&q>=0&&q<=100&&(!i||q>qualities[i-1])),'Ordered JPEG qualities required');
  if(context.segmentedLosses)return context.segmentedLosses(qualities,hooks);
  let metrics={workers:0,kernel:'jpeg-recompression-cached',recompressions:0,qualityPreparationMs:0,qualityRecompressionMs:0};
  const compute=async names=>{
    const selected=names.map(Number),started=performance.now(),source=new Uint8Array(image.width*image.height);
    await rows(image.height,{signal:hooks.signal},y=>{for(let x=0;x<image.width;x++){const j=y*image.width+x,i=j*3;source[j]=gray(image.data[i],image.data[i+1],image.data[i+2]);}});
    const prepared=performance.now(),pixels={width:image.width,height:image.height,data:source};
    const accelerated=context.jpegGrayGpu?await gpuJpegGrayLosses(pixels,selected,{budget:context.budget,backend:context.backend,profile:context.profile,signal:hooks.signal,onProgress:hooks.onProgress}):null;
    const pooled=!accelerated&&context.qualityPool&&source.length>=100000&&selected.length>1?await context.qualityPool.run(pixels,hooks,{mode:'quality',qualities:selected}):null;
    const raw=accelerated?.raw??pooled?.raw??new Float64Array(selected.length),reciprocal=1/source.length;
    for(let index=0;!accelerated&&!pooled&&index<selected.length;index++){
      checkAbort(hooks.signal);const decoded=await context.codec.recompressGray(pixels,selected[index],hooks);let sum=0;
      for(let i=0;i<source.length;i++)sum+=Math.abs(source[i]-decoded.data[i]);raw[index]=sum*reciprocal;hooks.onProgress?.((index+1)/selected.length);
    }
    checkAbort(hooks.signal);metrics={workers:pooled?.workers??1,kernel:pooled?'jpeg-recompression-pool':'jpeg-recompression-serial',recompressions:selected.length,qualityPreparationMs:prepared-started,qualityRecompressionMs:performance.now()-prepared,...(pooled?{scheduling:pooled.scheduling,qualityKernelMs:pooled.kernelMs}:{}),...(accelerated?accelerated.metrics:{})};
    if(!accelerated&&context.jpegGrayGpu)observeJpegGrayCpu(context.budget,image.width*image.height,selected.length,metrics.qualityPreparationMs+metrics.qualityRecompressionMs,context.profile);
    return Array.from(raw);
  };
  const effective=qualities.map(q=>context.jpegGrayGpu?Math.max(1,q):q),names=[...new Set(effective.map(String))],values=context.memoJpegLosses?await context.memoJpegLosses(names,compute):await compute(names),bank=new Map(names.map((name,index)=>[Number(name),values[index]])),raw=Float64Array.from(effective,q=>bank.get(q));
  return {raw,metrics};
}
export async function jpegRecompression(image,p,hooks,context) {
  const qualities=Uint8Array.from({length:101},(_,i)=>i),{raw,metrics}=await recompressionLosses(image,Array.from(qualities),hooks,context);
  return {data:{qualities,raw,units:'mean_absolute_pixel_error_0_255',qualityZero:'codec-minimum-quality'},engineMetrics:metrics,layers:[],semantics:'Historical grayscale JPEG recompression curve, qualities 0–100 inclusive. Raw mean absolute pixel differences in 0–255 units; neither percentages nor a count of previous compressions. The aligned double-JPEG detector remains separate.'};
}
