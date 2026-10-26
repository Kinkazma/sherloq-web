import "../../runtime-context.js?v=0.25.0";
import {jpegQuality,qualityParams} from './jpeg-quality.js';
import {jpegRecompression,recompressionParams} from './jpeg-recompression.js';
import {segmentedRecompressionLosses} from './segmented-recompression.js';
import {inspectOriginalJpeg} from './jpeg-source-evidence.js';
import {createSourceRegionJpegContextImage} from './source-region-ela.js';
import {QUALITY_HEAP_LIMIT,qualityHeapBytes} from './quality-arithmetic.js';
import {AdaptiveConcurrency} from './adaptive-concurrency.js';
import {payloadBytes} from './pixel-operations.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,normalizeResourceError} from './errors.js';
// Same bounded useful-work learner as the ordinary JPEG curve route. A weak
// engine-budget owner keeps its observations, never a source reader or signal.
const adaptiveByBudget=new WeakMap();
function adaptiveFor(budget){let value=adaptiveByBudget.get(budget);if(!value){value=new AdaptiveConcurrency();adaptiveByBudget.set(budget,value);}return value;}

export function nativeJpegCurveContextAdmission(rect){const dimensions=Number.isSafeInteger(rect.width)&&Number.isSafeInteger(rect.height)&&rect.width>0&&rect.height>0&&rect.width<=65500&&rect.height<=65500;return{evaluable:dimensions,reason:dimensions?null:'native-jpeg-dimensions'};}

/** Curves and optional predictions belong to complete native JPEG contexts.
 * Combining their normalized minima would invent another detector. */
export async function sourceRegionJpegCurve({task,original,view,domain,budget,signal,onProgress,profile={},cpuKernel='auto',references=[]}){
 const quality=task.operation==='jpeg.quality';requireValue(quality||task.operation==='jpeg.recompression','Unsupported native JPEG curve operation.');
 if(!['cpu','auto'].includes(task.backend??'auto'))throw new EngineError('SOURCE_SCOPE_BACKEND_UNSUPPORTED','Native JPEG curves use their unchanged CPU codecs.');
 const p=quality?qualityParams(task.params):recompressionParams(task.params),reference=quality&&p.modelId!==null?references[0]:null;
 if(quality&&p.modelId!==null)requireValue(reference?.id===p.modelId&&reference.kind==='jpeg-quality-model'&&/^[a-f0-9]{64}$/.test(reference.sha256??'')&&typeof reference.model?.predict==='function','A verified loaded JPEG-quality model reference is required.');
 const leases=[],fragments=[],adaptive=adaptiveFor(budget),prefix=task.imageId+'\0source-region/jpeg-gray-context-v1/'+domain.fingerprint+'/',started=performance.now();let total=0,evaluated=0,recompressions=0,cacheHits=0,workers=0,failure;
 try{
  leases.push(budget.reserve(65536+Math.max(0,QUALITY_HEAP_LIMIT-qualityHeapBytes())));
  const header=quality?await inspectOriginalJpeg(original,{signal}):undefined;
  for(const rect of view.admittedRectangles()){
   await controlCheckpoint(signal);const index=fragments.length,bounds=[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height],admission=nativeJpegCurveContextAdmission(rect);
   leases.push(budget.reserve(4096+sourceRegionTransportBytes(rect)*4));total+=rect.width*rect.height;
   const metadata={id:'jpeg-context-'+index,bounds,originalBounds:bounds.map((n,i)=>n+domain.origin[i%2]),nativeDimensions:[rect.width,rect.height],...admission};
   if(!admission.evaluable){fragments.push({...metadata,status:'native-not-evaluable',data:null});continue;}
   const image=createSourceRegionJpegContextImage(view,rect,original,budget),contextPrefix=prefix+bounds.join('/')+'/',context={references:reference?[reference]:[],jpegHeader:header};
   context.memoImage=async(name,compute)=>{const key=contextPrefix+'normalized/'+name,hit=budget.get(key);if(hit){cacheHits++;return hit.value;}const value=await compute();checkAbort(signal);budget.put(key,{value,byteLength:payloadBytes(value)+256+key.length*2},[task.imageId]);return value;};
   context.segmentedLosses=async(qualities,hooks)=>{
    // One fixed bank per context avoids101 long Map keys per small fragment.
    // Its active lease protects borrowed arrays even if the LRU evicts them.
    const key=contextPrefix+'losses',bytes=256+key.length*2+101*9,lease=budget.reserve(bytes);
    try{
     const bank=budget.get(key)?.value??{values:new Float64Array(101),valid:new Uint8Array(101)},entry={value:bank,byteLength:bytes},missing=[];
     for(const q of qualities){if(bank.valid[q])cacheHits++;else missing.push(q);}
     let metrics={workers:0,kernel:'jpeg-context-cached-losses',recompressions:0};
     if(missing.length){const answer=await segmentedRecompressionLosses(image.surface,missing,{image,budget,signal,maxWorkers:cpuKernel==='auto'?profile.maxWorkers??1:1,adaptive,onProgress:f=>hooks.onProgress?.((qualities.length-missing.length+f*missing.length)/qualities.length),onQuality:(q,value)=>{bank.values[q]=value;bank.valid[q]=1;budget.put(key,entry,[task.imageId]);}});metrics=answer.metrics;recompressions+=metrics.recompressions??missing.length;workers=Math.max(workers,metrics.workers??0);}
     return{raw:Float64Array.from(qualities,q=>bank.values[q]),metrics};
    }finally{lease();}
   };
   let native,nativeFailure;
   try{native=await(quality?jpegQuality:jpegRecompression)(image.surface.descriptor,p,{signal,onProgress:f=>onProgress?.({phase:'source-region-jpeg-curve',sourceFragment:metadata.id,contextFraction:f,completed:evaluated,total:domain.countIncluded})},context);checkAbort(signal);}
   catch(error){nativeFailure=error;throw error;}
   finally{try{await image.rgbRecompression?.dispose();}catch(error){if(nativeFailure)nativeFailure.details={...nativeFailure.details,cleanup:{code:error.code,message:error.message}};else throw error;}}
   leases.push(budget.reserve(2048+payloadBytes(native.data)*2));fragments.push({...metadata,status:'analysed',data:structuredClone(native.data),nativeMetrics:structuredClone(native.engineMetrics)});evaluated+=rect.width*rect.height;
  }
  checkAbort(signal);requireValue(total===domain.countIncluded,'Native JPEG contexts must cover every admitted observation.');
  const available=fragments.filter(f=>f.evaluable),unavailable=fragments.length-available.length,status=!available.length?'native-not-evaluable':unavailable?'partially-evaluable':'evaluated',data={independentNativeContexts:true,sourceRegionEvaluation:status,sourceDimensions:[domain.width,domain.height],fragments,...(available.length===1?available[0].data:{})};
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',data,layers:[],semantics:'Each exact admitted RGB rectangle retains its unchanged native grayscale JPEG losses, native local codec phase and edge padding. Curves, normalized minima and optional predictions remain separate per context. Original encoded quantization tables are common file evidence; the admitted crop is never re-encoded to invent tables.',warnings:unavailable?[{code:'NATIVE_CONTEXT_NOT_EVALUABLE',count:unavailable,allContexts:!available.length,message:'Some contexts exceed the native JPEG codec dimensions. No curve or estimate is supplied for them.'}]:[],metrics:{selectedPixels:domain.countIncluded,analysedPixels:evaluated,unanalysablePixels:domain.countIncluded-evaluated,sourceRegionEvaluation:status,fragmentCount:fragments.length,evaluatedContexts:available.length,nonEvaluableContexts:unavailable,recompressions,workers,scalarCacheHits:cacheHits,cache:{analysis:recompressions===0,result:false},totalMs:performance.now()-started},provenance:{params:p,backend:'cpu',sourceRegionDomain:domain.descriptor,independentNativeContexts:true,excludedParticipation:'absent-before-gray-JPEG-losses-normalization-and-model',originalEncodedBytesPreserved:true,...(reference?{references:[{id:reference.id,kind:reference.kind,originalSha256:reference.sha256}]}:{})}};
 }catch(error){failure=normalizeResourceError(error);throw failure;}
 finally{let cleanup;for(const release of leases)try{release();}catch(error){cleanup??=error;}if(cleanup){if(failure)failure.details={...failure.details,cleanup:{code:cleanup.code,message:cleanup.message}};else throw cleanup;}}
}
