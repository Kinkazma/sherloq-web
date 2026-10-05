import "../../runtime-context.js?v=0.14.5";
import {segmentedMagnifierLarge} from './segmented-magnifier-large.js';
import {magnifier,magnifierRegion} from './magnifier.js';
import {EngineError,requireValue,checkAbort,normalizeResourceError} from './errors.js';

// A magnifier analyzes its selected oriented window, not global image statistics.
// Reuse the qualified kernel at its native dimensions and carry the source origin.
export async function segmentedMagnifier(image,p,{budget,signal,onProgress,cacheKey}={}){
 const descriptor=image.surface.descriptor,{bounds,width,height}=magnifierRegion(descriptor,p),n=width*height;
 requireValue(Number.isSafeInteger(n*12+8192),'Magnifier window size');checkAbort(signal);
 if(n&&n*12+8192>budget.limit-budget.retained-budget.active)return segmentedMagnifierLarge(image,p,{budget,signal,onProgress,cacheKey});
 const key=cacheKey?cacheKey+descriptor.id+'/'+descriptor.revision+'/'+JSON.stringify(bounds):null;
 const inputKey=key+'/input',resultKey=key+'/result/'+JSON.stringify({...p,bounds});
 let reservation,window,pixels,result;const started=performance.now();let readMs=0,kernelMs=0,inputCached=false,resultCached=false;
 try{
  // Input lease + kernel copy + cached/owned outputs, histogram and row staging
  // all stay under the common budget. A large source alone adds no scratch here.
  reservation=budget.reserve(n*12+8192);
  result=key?budget.get(resultKey)?.value:null;resultCached=!!result;
  if(!result){
   if(!n)result=await magnifier(descriptor,p,{signal});
   else{
    pixels=key?budget.get(inputKey)?.value:null;inputCached=!!pixels;
    if(!pixels){
     const before=performance.now();onProgress?.({phase:'source-window',fraction:0});checkAbort(signal);
     window=await image.surface.readWindow({x:bounds[0],y:bounds[1],width,height},{signal});pixels=window.pixels;readMs=performance.now()-before;
     onProgress?.({phase:'source-window',fraction:1});checkAbort(signal);
    }
    const before=performance.now();result=await magnifier(pixels,{...p,bounds:null},{signal,onProgress:fraction=>onProgress?.({phase:'kernel',fraction})});kernelMs=performance.now()-before;
    result.data.bounds=bounds;for(const layer of result.layers??[])layer.origin=bounds.slice(0,2);
   }
  }
  checkAbort(signal);const owned=structuredClone(result);onProgress?.({phase:'complete',fraction:1});checkAbort(signal);
  window?.release();window=null;reservation();reservation=null;
  if(key&&!resultCached){if(pixels&&!inputCached)budget.put(inputKey,{value:pixels,byteLength:pixels.data.byteLength});budget.put(resultKey,{value:result,byteLength:(result.pixels?.data.byteLength??0)+1024});}
  return {...owned,metrics:{totalMs:performance.now()-started,readMs,kernelMs,sourceWindowBytes:!resultCached&&!inputCached?n*3:0,cache:{result:resultCached,input:inputCached},workers:resultCached?0:1,memory:budget.snapshot()}};
 }catch(error){throw normalizeResourceError(error);}
 finally{window?.release();reservation?.();}
}
