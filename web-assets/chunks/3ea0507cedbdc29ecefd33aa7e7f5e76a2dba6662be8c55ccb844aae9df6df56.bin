import "../runtime-context.js?v=0.21.0";
/** Per-call ownership of a segmented original. Handles never enter SharedMemo;
 * final numerical/tensor caches remain the analysis engine's responsibility. */
const sources=()=>import('../unified-engine/src/image-sources.js');
const defaultLoad=async(blob,options)=>(await sources()).loadM2SegmentedOriginal(blob,options);
const defaultDispose=async source=>(await sources()).disposeSegmentedImage(source);
const defaultSample=async(surface,tile,options)=>(await import('../unified-engine/src/display-sampling.js')).sampleSurface(surface,tile,options);
function check(signal){if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');}
export function blobPreviewGeometry({width,height},{maxPixels=4_000_000,maxSide=2048}={}){
 if(![width,height,maxPixels,maxSide].every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isSafeInteger(width*height))throw Error('Invalid blob preview geometry');
 let step=Math.max(1,Math.ceil(width/maxSide),Math.ceil(height/maxSide),Math.ceil(Math.sqrt(width*height/maxPixels)));
 while(Math.ceil(width/step)*Math.ceil(height/step)>maxPixels)step++;
 return {x:0,y:0,w:width,h:height,step,width:Math.ceil(width/step),height:Math.ceil(height/step)};
}
export function createBlobSourceAnalysis({budget,analyzeSource,loadSource=defaultLoad,disposeSource=defaultDispose,samplePreview=defaultSample,preview={}}={}){
 if(!budget||typeof analyzeSource!=='function')throw Error('Blob analysis requires shared budget and analyzeSource');
 const jobs=new Set();let closed=false,disposal;
 async function analyze(blob,options={}){
  if(closed)throw Error('Blob analysis disposed');check(options.signal);if(!(blob instanceof Blob)||!blob.size)throw Error('Original image Blob required');
  const controller=new AbortController(),signal=controller.signal,abort=()=>controller.abort(options.signal?.reason??new DOMException('Aborted','AbortError'));
  let finish;const job={controller,done:new Promise(resolve=>{finish=resolve;})};jobs.add(job);options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
  let source,result,primary,cleanupFailure,sourceReferences=0,sourceClosing=false,sourceDrained;
  const retainAnalysisSource=()=>{
   if(sourceClosing)throw Error('Analysis source is closing');sourceReferences++;let released=false;
   // Release never awaits the helper's finally: that finally is the consumer
   // waiting for this count, so awaiting it here would create a dependency cycle.
   return()=>{if(released)return;released=true;if(--sourceReferences===0){sourceDrained?.();sourceDrained=undefined;}};
  };
  try{
   source=await loadSource(blob,{budget,layout:'segmented',name:blob.name??'image.tif',signal,onProgress:options.onProgress});check(signal);
   Object.defineProperty(source,'retainAnalysisSource',{value:retainAnalysisSource,configurable:true});
   if(typeof options.onDecodedImage==='function'){
    let frame;
    try{
     try{
      const descriptor=source.surface?.descriptor??source.descriptor??source,tile=blobPreviewGeometry(descriptor,preview);
      frame=await samplePreview(source.surface,tile,{budget,signal});check(signal);
      await options.onDecodedImage({...frame.pixels,originalWidth:descriptor.width,originalHeight:descriptor.height,samplingStep:tile.step,presentationOnly:tile.step!==1});
     }finally{await frame?.release?.();}
    }catch(error){check(signal);try{options.onProgress?.({phase:'decoded-image-hook-error',message:error?.message??String(error)});}catch{}}
   }
   check(signal);result=await analyzeSource(source,{...options,signal});check(signal);
   result.source??={};result.source.originalSha256=source.sha256??source.sourceSha256;result.source.decode=structuredClone(source.provenance??source.decodeProvenance);return result;
  }catch(error){primary=error;result?.release?.();throw error;}
  finally{
   try{sourceClosing=true;if(sourceReferences)await new Promise(resolve=>{sourceDrained=resolve;});if(source)await disposeSource(source);}catch(error){cleanupFailure=error;}
   options.signal?.removeEventListener('abort',abort);jobs.delete(job);finish(cleanupFailure);
   if(cleanupFailure){if(primary){try{primary.temporaryCleanupError={code:cleanupFailure.code??'STORAGE_IO',message:cleanupFailure.message};}catch{}}else{try{result?.release?.();}finally{throw cleanupFailure;}}}
  }
 }
 return {analyze,
  dispose(){if(disposal)return disposal;closed=true;const pending=[...jobs];for(const job of pending)job.controller.abort(new DOMException('Blob analysis disposed','AbortError'));disposal=Promise.all(pending.map(job=>job.done)).then(errors=>{const failures=errors.filter(Boolean);if(failures.length)throw new AggregateError(failures,'Blob source disposal failed');});return disposal;},
  snapshot:()=>({active:jobs.size,disposed:closed}),
 };
}
