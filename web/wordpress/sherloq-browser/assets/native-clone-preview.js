import {checkAbort,EngineError} from './unified-engine/src/errors.js';

// A full-quality presentation of already retained detections. The temporary
// result is rejected after its RGB has been copied, so neither the scientific
// owner nor the last committed display is replaced during a gesture.
export async function nativeClonePreview({task,field,source,maxPixels,signal,isCurrent=()=>true,
 renderRetained,readDisplay,reserve,release}={}){
 const operations=['tampering.copyMove.sparse','tampering.copyMove.dense'];
 if(!operations.includes(task?.operation)||!source||typeof renderRetained!=='function')return null;
 const {width,height}=source,pixels=width*height,bytes=pixels*40+65536;
 if(![width,height,pixels,bytes].every(Number.isSafeInteger)||width<1||height<1||
    !Number.isSafeInteger(maxPixels)||pixels>maxPixels||Math.max(width,height)>2048)return null;
 checkAbort(signal);if(!isCurrent())return null;
 let lease,answer,failed=false,failure;
 const started=performance.now();
 try{
  lease=await reserve(bytes);checkAbort(signal);
  if(isCurrent())await renderRetained(task,{field,signal,isCurrent,onRetainedResult:async(next,context)=>{
   checkAbort(signal);if(!isCurrent()||!context.isCurrent())return false;
   const display=next?.surface;
   if(next?.operation!==task.operation||display?.width!==width||display?.height!==height||
      next.metrics?.nativeAnalysisCalls!==0||next.metrics?.inferenceCalls!==0)
    throw new EngineError('PREVIEW_UNAVAILABLE','The retained clone frame is not a matching native presentation.');
   // Drain the bounded owned read before retiring its frame/lease. A cancelled
   // gesture still fails the following checks and never publishes stale RGB.
   const copied=await readDisplay(display,{x:0,y:0,width,height,step:1});
   checkAbort(signal);if(!isCurrent()||!context.isCurrent())return false;
   const rgb=copied?.pixels??copied;
   if(rgb?.format!=='rgb8'||rgb.width!==width||rgb.height!==height||
      !(rgb.data instanceof Uint8Array)||rgb.data.length!==pixels*3)
    throw new EngineError('PREVIEW_UNAVAILABLE','The retained clone frame has an invalid RGB grid.');
   answer={operation:task.operation,pixels:rgb,logicalWidth:width,logicalHeight:height,
    traceSelection:next.data?.metadata?.presentation?.traceSelection,
    ...(next.sourceRegionDomain?{sourceRegionDomain:next.sourceRegionDomain,
      sourceRegionOrigin:[...next.sourceRegionOrigin]}:{}),
    provisional:true,exact:true,approximate:false,exportable:false,
    metrics:{nativeAnalysisCalls:0,inferenceCalls:0,retainedNativeTables:true,
      nativePresentation:true,totalMs:performance.now()-started,maximumFramePixels:pixels}};
   return false;
  }});
 }catch(error){failed=true;failure=error;}
 finally{
  if(lease!==undefined)try{await release(lease);}catch(error){
   if(!failed){failed=true;failure=error;}
   else try{if(failure&&Object.isExtensible(failure))failure.cleanupErrors=[...(failure.cleanupErrors??[]),error];}catch{}
  }
 }
 if(failed)throw failure;
 return answer??null;
}
