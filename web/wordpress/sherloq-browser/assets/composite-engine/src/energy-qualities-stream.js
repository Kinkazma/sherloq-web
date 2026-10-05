import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
import {parallelEnergyPlanes,energyPoolShape} from './energy-stream-pool.js';import {segmentedEnergyPlane} from './energy-stream.js';import {createRgbRecompression} from './jpeg-rgb-stream.js';import {checkAbort} from './errors.js';
export async function segmentedEnergyQualities(image,qualities,{budget,signal,onProgress,onPlane,maxWorkers=1,adaptive=new AdaptiveConcurrency()}={}){
 const {width,height}=image.surface.descriptor,finished=new Set(),metrics={workers:1,kernel:'ela-energy-segmented',energyRecompressions:0,energyQualityPlanesComputed:0,sourcePasses:0};let callbackError;
 image.rgbRecompression??=createRgbRecompression(image,budget);
 const progress=e=>{try{onProgress?.(e);}catch(error){callbackError=error;throw error;}};
 const publish=async(q,value)=>{try{await onPlane(q,value);finished.add(q);}catch(error){callbackError=error;throw error;}};
 const serial=async q=>{checkAbort(signal);const result=await segmentedEnergyPlane(image,q,{budget,signal,onProgress:e=>progress({...e,quality:q})});try{await publish(q,result);}catch(error){await result.dispose();throw error;}metrics.energyRecompressions+=result.metrics.recompressions;metrics.energyQualityPlanesComputed++;metrics.sourcePasses+=result.metrics.sourcePasses;};
 for(const q of qualities.filter(q=>image.rgbRecompression.hasEncoded(q)))await serial(q);
 const fresh=qualities.filter(q=>!finished.has(q));if(!fresh.length)return metrics;
 const shape=energyPoolShape(image),maximum=typeof Worker==='undefined'||width*height<1048576?1:Math.min(maxWorkers,fresh.length),key=width+'/'+height,plan=adaptive.select(key,maximum,budget,count=>(count>1?count*shape.workerBytes:shape.workingBytes)+shape.windowAllowance),start=performance.now();let retry=null;
 const absorb=p=>{if(!p)return;metrics.workers=Math.max(metrics.workers,p.workers);metrics.energyRecompressions+=p.recompressions;metrics.energyQualityPlanesComputed+=p.qualityPlanesComputed;metrics.sourcePasses+=p.sourcePasses;metrics.codecHeapCapacityBytes=p.codecHeapCapacityBytes;metrics.totalCodecHeapMaximumBytes=p.totalCodecHeapMaximumBytes;};
 if(plan.count>1){try{const pooled=await parallelEnergyPlanes(image,fresh,plan.count,{budget,signal,onProgress:progress,onPlane:publish});absorb(pooled);metrics.kernel=pooled.kernel;}
  catch(error){checkAbort(signal);if(callbackError||!isWorkerResourceFailure(error)&&error.code!=='STORAGE_UNAVAILABLE')throw error;adaptive.reduce(key,plan.count);const remaining=fresh.filter(q=>!finished.has(q));retry={code:error.code??'MEMORY_ALLOCATION',failedWorkers:plan.count,completedQualitiesPreserved:fresh.length-remaining.length,remainingQualities:remaining.length};absorb(error.energyPoolMetrics);for(const q of remaining)await serial(q);}
 }else for(const q of fresh)await serial(q);
 if(!retry)adaptive.observe(key,{count:metrics.workers,maximum,milliseconds:performance.now()-start,units:width*height*fresh.length});metrics.scheduling={...plan,preflightExecutions:0,taskExecutions:retry?2:1,retry};return metrics;
}
