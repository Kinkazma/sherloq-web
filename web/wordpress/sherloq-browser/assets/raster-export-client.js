import {createExportSink} from './export-sink.js';
import {removeTerminatedTemporarySession} from './unified-engine/src/temporary-storage.js';
import {serializeEngineError,deserializeEngineError} from './unified-engine/src/errors.js';
import {validateExportSettings,resolveChroma} from './media-settings.js';
export function rasterOptions(settings,originalChroma){
 const value=validateExportSettings(settings);return{format:value.format,quality:value.format==='webp'?value.webpQuality:value.format==='heic'?value.heicQuality:value.quality,chroma:resolveChroma(value.chroma,originalChroma),compression:value.pngCompression,lossless:['png','tiff'].includes(value.format)||value[value.format+'Lossless']===true,...(value.resize?{resize:{width:value.width||undefined,height:value.height||undefined,algorithm:value.resizeAlgorithm}}:{})};
}
// Used for composed views not represented by one engine surface. Ordinary
// engine surfaces use exportSurface, with the engine's existing memory budget.
export async function exportPresentationRaster(surface,options,{reserve,signal,onProgress}={}){
 const [{mediaExportPlan},{pngExportPlan}]=await Promise.all([import('./unified-engine/src/media-raster-export.js'),import('./unified-engine/src/raster-export.js')]);
 const shape={width:surface.width,height:surface.height,format:'rgb8'},plan=options.format==='png'?pngExportPlan(shape):mediaExportPlan(shape,options);
 const memoryBudgetBytes=plan.workingBytes+32*1024**2+surface.width*32*3*2;
 // The worker owns this admitted workspace; keep source reads possible while
 // preventing calculations from spending the same memory a second time.
 const release=await reserve(memoryBudgetBytes);
 let worker;try{worker=new Worker(new URL('./raster-export-worker.js',import.meta.url),{type:'module'});}catch(error){await release();throw error;}
 const sessions=new Map(),requests=new Set();let sink,settled=false,abortTimer,result,failure;
 try{
  const descriptor=await new Promise((resolve,reject)=>{
   const finish=fn=>value=>{if(settled)return;settled=true;clearTimeout(abortTimer);signal?.removeEventListener('abort',cancel);fn(value);};
   const fail=finish(reject),ok=finish(resolve),cancel=()=>{try{worker.postMessage({cancel:true});}catch{}abortTimer=setTimeout(()=>fail(Object.assign(Error('Export cancelled'),{code:'CANCELLED'})),5000);};
   signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted){fail(Object.assign(Error('Export cancelled'),{code:'CANCELLED'}));return;}
   worker.onerror=e=>fail(Object.assign(Error(e.message),{code:'WORKER_FAILED'}));worker.onmessageerror=()=>fail(Object.assign(Error('Export message failed'),{code:'WORKER_MESSAGE_FAILED'}));
   worker.onmessage=({data})=>{
    if(settled)return;
    if(data.temporarySession){sessions.set(data.temporarySession.id,data.temporarySession.backend??'opfs');return;}if(data.progress){try{onProgress?.(data.progress);}catch(error){fail(error);}return;}if(data.error){fail(deserializeEngineError(data.error));return;}if(data.done){ok(data.descriptor);return;}
    if(!data.request)return;
    const request=(async()=>{try{if(signal?.aborted)throw Object.assign(Error('Export cancelled'),{code:'CANCELLED'});let value={};
     if(data.request==='pixels'){const pixels=await surface.readPixels(data.value);value={bytes:pixels.data};}
     else if(data.request==='start')sink=await createExportSink({memoryBudgetBytes:32*1024**2,signal,mime:data.value.mime});
     else if(data.request==='chunk')await sink.write(data.value);else throw Error('Unknown export request');
     if(!settled)worker.postMessage({reply:data.sequence,value},value.bytes?[value.bytes.buffer]:[]);
    }catch(error){if(!settled)try{worker.postMessage({reply:data.sequence,error:serializeEngineError(error)});}catch(postError){error.postError=postError;fail(error);}}})();
    requests.add(request);request.finally(()=>requests.delete(request));
   };
   worker.postMessage({width:surface.width,height:surface.height,options,memoryBudgetBytes});
  });
  await Promise.allSettled([...requests]);result={...await sink.finish(),descriptor};
 }catch(error){failure=error;}
 finally{
  settled=true;worker.terminate();await Promise.allSettled([...requests]);
  // An in-flight storage write must finish before its sink/session is removed.
  // Cleanup errors supplement the original failure instead of hiding it.
  const clean=async task=>{try{await task();}catch(error){if(failure)failure.cleanupError??=error;else failure=error;}};
  if(failure)await clean(()=>sink?.abort());
  for(const [id,backend] of sessions)await clean(()=>removeTerminatedTemporarySession(id,backend));
  await clean(release);
  if(failure&&result)await clean(()=>result.cleanup?.());
 }
 if(failure)throw failure;return result;
}
