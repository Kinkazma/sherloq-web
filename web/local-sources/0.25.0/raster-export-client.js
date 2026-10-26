import {createExportSinkScope} from './export-sink-owner.js?v=0.25.0';
import {createExportSink} from './export-sink.js?v=0.25.0';
import {removeTerminatedTemporarySession} from './unified-engine/src/temporary-storage.js';
import {serializeEngineError,deserializeEngineError} from './unified-engine/src/errors.js';
import {validateExportSettings,resolveChroma} from './media-settings.js?v=0.25.0';
export function rasterOptions(settings,originalChroma){
 const value=validateExportSettings(settings);return{format:value.format,quality:value.format==='webp'?value.webpQuality:value.format==='heic'?value.heicQuality:value.quality,chroma:resolveChroma(value.chroma,originalChroma),compression:value.format==='tiff'?(value.tiffCompression==='none'?0:6):value.pngCompression,lossless:['png','tiff'].includes(value.format)||value[value.format+'Lossless']===true,...(value.resize?{resize:{width:value.width||undefined,height:value.height||undefined,algorithm:value.resizeAlgorithm}}:{})};
}
// Used for composed views not represented by one engine surface. Ordinary
// engine surfaces use exportSurface, with the engine's existing memory budget.
export async function exportPresentationRaster(surface,options,{reserve,signal,onProgress,onOwner}={}){
 const scope=createExportSinkScope(),owner=scope.begin();let release,sourceAdmission,worker,sink,result,settled=false,abortTimer;
 const sessions=new Map(),requests=new Set(),pixelOwners=new Set();let protocolFailed=false,protocolFailure;
 const exportedOwner={abort:()=>owner.retry()};onOwner?.(exportedOwner);
 owner.after(async()=>{for(const pixels of pixelOwners){if(surface.releasePixels)await surface.releasePixels(pixels);else await pixels.release?.();pixelOwners.delete(pixels);}});
 owner.after(()=>{worker?.terminate();});
 owner.after(async()=>{for(const [id,backend]of sessions){await removeTerminatedTemporarySession(id,backend);sessions.delete(id);}});
 owner.after(async()=>{if(sourceAdmission){await sourceAdmission();sourceAdmission=null;}});
 owner.after(async()=>{if(release){await release();release=null;}});
 try{
 const [{mediaExportPlan},{pngExportPlan}]=await Promise.all([import('./unified-engine/src/media-raster-export.js'),import('./unified-engine/src/raster-export.js')]);
 const shape={width:surface.width,height:surface.height,format:'rgb8'},plan=options.format==='png'?pngExportPlan(shape):mediaExportPlan(shape,options);
 const memoryBudgetBytes=plan.workingBytes+32*1024**2+surface.width*32*3*2;
 // The worker owns this admitted workspace; keep source reads possible while
 // preventing calculations from spending the same memory a second time.
 const sourceWorkspace=surface.exportReadWorkspaceBytes??0;if(!Number.isSafeInteger(sourceWorkspace)||sourceWorkspace<0)throw new RangeError('Invalid native export source workspace.');if(sourceWorkspace){sourceAdmission=await reserve(memoryBudgetBytes+sourceWorkspace);await sourceAdmission();sourceAdmission=null;}
 release=await reserve(memoryBudgetBytes);worker=new Worker(new URL('./raster-export-worker.js?v=0.25.0',import.meta.url),{type:'module'});
  const descriptor=await new Promise((resolve,reject)=>{
   const finish=fn=>value=>{if(settled)return;settled=true;clearTimeout(abortTimer);signal?.removeEventListener('abort',cancel);fn(value);};
   const fail=finish(reject),ok=finish(resolve),cancel=()=>{try{worker.postMessage({cancel:true});}catch{}abortTimer=setTimeout(()=>fail(Object.assign(Error('Export cancelled'),{code:'CANCELLED'})),5000);};
   signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted){fail(Object.assign(Error('Export cancelled'),{code:'CANCELLED'}));return;}
   worker.onerror=e=>fail(Object.assign(Error(e.message),{code:'WORKER_FAILED'}));worker.onmessageerror=()=>fail(Object.assign(Error('Export message failed'),{code:'WORKER_MESSAGE_FAILED'}));
   worker.onmessage=({data})=>{
    if(settled)return;
    if(data.temporarySession){sessions.set(data.temporarySession.id,data.temporarySession.backend??'opfs');return;}if(data.progress){try{onProgress?.(data.progress);}catch(error){fail(error);}return;}if(data.error){fail(deserializeEngineError(data.error));return;}if(data.done){ok(data.descriptor);return;}
    if(!data.request)return;
    const request=(async()=>{let pixels;try{if(signal?.aborted)throw Object.assign(Error('Export cancelled'),{code:'CANCELLED'});let value={};
     if(data.request==='pixels'){pixels=await surface.readPixels(data.value,{signal});pixelOwners.add(pixels);value={bytes:pixels.data};}
     else if(data.request==='start')sink=await owner.open(createExportSink,{memoryBudgetBytes:32*1024**2,signal,mime:data.value.mime});
     else if(data.request==='chunk')await sink.write(data.value);else throw Error('Unknown export request');
     if(!settled){worker.postMessage({reply:data.sequence,value},value.bytes?[value.bytes.buffer]:[]);}
    }catch(error){if(!protocolFailed){protocolFailed=true;protocolFailure=error;}fail(error);}finally{try{if(pixels){if(surface.releasePixels)await surface.releasePixels(pixels);else await pixels.release?.();pixelOwners.delete(pixels);}}catch(error){if(!protocolFailed){protocolFailed=true;protocolFailure=error;}fail(error);}}})();
    requests.add(request);request.finally(()=>requests.delete(request));
   };
   worker.postMessage({width:surface.width,height:surface.height,options,memoryBudgetBytes});
  });
  await Promise.allSettled([...requests]);if(protocolFailed)throw protocolFailure;result={...owner.finish(sink,await sink.finish()),descriptor};
  settled=true;return owner.borrow(result);
 }catch(error){settled=true;await Promise.allSettled([...requests]);return owner.fail(error);}
}
