import {NATIVE_PREVIEW_FINANCE} from './unified-engine/src/native-preview-peer-finance.js';
import {CAPTURED_OWNERSHIP_CONTROL} from './unified-engine/src/captured-ownership-control.js';
import {withRetirementOwner} from './unified-engine/src/owner-retirement-error.js';
import {createWorkerEngine} from './unified-engine/src/worker-client.js';
import {resultResources,configureSegmentationModel,configureExtensionModels} from './tool-client.js?v=0.33.3';
import {isExtensionTool} from './extension-tools.js?v=0.33.3';
import {requireValue,checkAbort} from './unified-engine/src/errors.js';

// Individual documents share one native memory budget and the original image.
// This queue serializes the public API only; native CPU/GPU pools remain intact.
export function createWorkspaceEnginePool(createEngine=createWorkerEngine){
 const records=new Map();
 return function engineFactory(options={}){
  const key=JSON.stringify(options);let record=records.get(key);
  if(!record){record={engine:createEngine(options),queue:Promise.resolve(),scopes:0,images:new Map(),configured:new Map(),owners:new Set()};records.set(key,record);}
  if(record.retiring)throw Object.assign(Error('The shared engine awaits acknowledged retirement.'),{code:'BUSY'});
  record.scopes++;
  const images=new Set(),surfaces=new Set(),tables=new Set(),models=new Set(),leases=new Set(),parkedFinals=new Map();let closed=false,disposing,sourceChanges=0,nativeOwners,nativeDisposing,detached=false;const owner={images,surfaces,tables,models,leases,parkedFinals,invalidate:null};record.owners.add(owner);
  const capturedOwners=new Set(),closingCapturedImages=new Set();
  const capturedUnloadAcknowledged=(id,value)=>{if(!images.has(id))closingCapturedImages.delete(id);return value;};
  const originalBinding=d=>({imageId:d.id,sourceSurfaceId:d.surface.id,sourceRevision:d.surface.revision,sourceSha256:d.sha256,nativeSurfaceId:d.nativeSurface?.id??null,nativeRevision:d.nativeSurface?.revision??null});
  const sameBinding=(a,b)=>a&&b&&['imageId','sourceSurfaceId','sourceRevision','sourceSha256','nativeSurfaceId','nativeRevision'].every(key=>(a[key]??null)===(b[key]??null));
  function admitCaptured(binding){const entry=record.images.get(binding?.imageId);requireValue(!closed&&!closingCapturedImages.has(binding?.imageId)&&!entry?.retiring&&images.has(binding?.imageId)&&entry?.descriptor&&sameBinding(originalBinding(entry.descriptor),binding),'Captured control requires this scope’s actual Original.');}
  async function allAcknowledged(tasks){const settled=await Promise.allSettled(tasks),failed=settled.find(value=>value.status==='rejected');if(failed)throw failed.reason;}
  function capturedControl(request){
   admitCaptured(request?.binding);const factory=record.engine[CAPTURED_OWNERSHIP_CONTROL];requireValue(typeof factory==='function','Captured ownership control is unavailable.');let managed;
   try{factory({...request,onOwner:raw=>{
    let flight;const acquisitions=new Map();
    const retireAcquisitionIds=token=>{const value=acquisitions.get(token);if(value){for(const d of value.surfaces??[])surfaces.delete(d.id);for(const d of value.tables??[])tables.delete(d.id);acquisitions.delete(token);}};
    const adapt=fn=>Promise.resolve().then(fn).catch(primary=>{invalidateSources(primary);if(primary?.cleanupOwner===raw)throw withRetirementOwner(primary,managed,primary);throw primary;});
    const schedule=(fn,{admit=false}={})=>adapt(()=>raw.snapshot().retiring?fn():enqueue(()=>{if(admit)admitCaptured(request.binding);return fn();}));
    managed={imageId:request.binding.imageId,
     finalResultLifetime(value,hooks){if(raw.snapshot().closed&&['release','acquire'].includes(value.action))return adapt(()=>finalLifetime(value,raw,managed,hooks,acquisitions));return schedule(()=>finalLifetime(value,raw,managed,hooks,acquisitions),{admit:value.action!=='release'});},
     acceptFinalAcquisition(token){admitCaptured(request.binding);requireValue(acquisitions.has(token),'This scope has no pending final acquisition.');const answer=raw.acceptFinalAcquisition(token);requireValue(answer?.acknowledged===true&&answer.ownerId===request.ownerId&&answer.token===token&&answer.transferred===true,'Final acquisition transfer was not acknowledged.');acquisitions.delete(token);return answer;},
     abandonFinalAcquisition(token){const work=async()=>{const answer=await raw.abandonFinalAcquisition(token);requireValue(answer?.acknowledged===true&&answer.ownerId===request.ownerId&&answer.token===token&&answer.retired===true,'Final acquisition retirement was not acknowledged.');retireAcquisitionIds(token);return answer;};return raw.snapshot().closed?adapt(work):schedule(work);},
     reserveExternalMemory(value,hooks){return schedule(()=>raw.reserveExternalMemory(value,hooks),{admit:true});},
     releaseExternalMemory:id=>schedule(()=>raw.releaseExternalMemory(id)),
     snapshot:()=>{const value=raw.snapshot();return{...value,closing:value.closing||closed||closingCapturedImages.has(request.binding.imageId)||record.images.get(request.binding.imageId)?.retiring===true};},
     dispose(){if(flight)return flight;const task=schedule(()=>raw.dispose()).then(()=>{for(const [token,row]of parkedFinals)if(row.control===managed)parkedFinals.delete(token);for(const token of [...acquisitions.keys()])retireAcquisitionIds(token);capturedOwners.delete(managed);});flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;},
    };capturedOwners.add(managed);return request.onOwner(managed);
   }});return managed;}catch(primary){if(managed?.snapshot().closed)capturedOwners.delete(managed);throw primary;}
  }
  function closeCapturedOwners(imageId){return allAcknowledged([...capturedOwners].filter(item=>imageId===undefined||item.imageId===imageId).map(item=>item.dispose()));}
  const enqueue=fn=>{const task=record.queue.then(fn);record.queue=task.catch(()=>{});return task;};
  function scheduleNative(work,{signal,kind}={}){
   if(signal?.aborted)return Promise.reject(Object.assign(Error('Captured native queue retired'),{code:'WORKER_RETIRED'}));
   let started=false,settled=false;
   return new Promise((resolve,reject)=>{
    const abort=()=>{if(!started&&!settled){settled=true;signal?.removeEventListener('abort',abort);reject(Object.assign(Error('Captured native queue retired'),{code:'WORKER_RETIRED'}));}};
    signal?.addEventListener('abort',abort,{once:true});
    const task=enqueue(async()=>{if(signal?.aborted){abort();return;}started=true;signal?.removeEventListener('abort',abort);if(kind==='admit'&&closed)throw Object.assign(Error('Document closed'),{code:'CANCELLED'});return work();});
    task.then(value=>{if(!settled){settled=true;resolve(value);}},error=>{if(!settled){settled=true;reject(error);}}).finally(()=>signal?.removeEventListener('abort',abort)).catch(()=>{});
   });
  }
  function nativeFinance(request){
   if(closed)throw Object.assign(Error('Document closed'),{code:'CANCELLED'});
   const factory=record.engine[NATIVE_PREVIEW_FINANCE];requireValue(typeof factory==='function','Captured native finance is unavailable.');
   const sourceEntry=record.images.get(request?.binding?.imageId),original=sourceEntry?.descriptor,binding=request?.binding;
   requireValue(!sourceEntry?.retiring&&images.has(binding?.imageId)&&original?.surface?.id===binding?.surfaceId&&original?.surface?.revision===binding?.revision&&original?.sha256===binding?.sourceSha256,'Native finance requires this scope’s captured Original.');
   let control,adopted;
   try{
    control=factory({...request,schedule:(work,options)=>scheduleNative(()=>{
     if(options?.kind==='admit'){const sourceEntry=record.images.get(binding.imageId),current=sourceEntry?.descriptor;requireValue(!sourceEntry?.retiring&&!closed&&images.has(binding.imageId)&&current===original&&current.surface.id===binding.surfaceId&&current.surface.revision===binding.revision&&current.sha256===binding.sourceSha256,'Captured Original changed before native admission.');}
     return work();
    },options),onOwner:rawOwner=>{
     let flight,retired=false;
     adopted={imageId:binding.imageId,dispose(){if(retired)return Promise.resolve();if(flight)return flight;
      const task=(async()=>{const value=await(control?control.dispose():rawOwner.dispose());requireValue(value!==false&&value!==0,'Native finance retirement was not acknowledged.');retired=true;nativeOwners?.delete(adopted);return value;})();
      flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;
     }};
     (nativeOwners??=new Set()).add(adopted);return request.onOwner(adopted);
    }});
   }catch(error){if(adopted)nativeOwners?.delete(adopted);throw error;}
   return Object.freeze({...control,dispose:()=>adopted.dispose()});
  }
  async function closeNativeOwners(imageId){for(const item of [...(nativeOwners??[])])if(imageId===undefined||item.imageId===imageId)await item.dispose();}
  function borrowImage(input,hooks){
   checkAbort(hooks?.signal);const existing=record.images.get(input.id);if(!existing)return null;
   if(existing.retiring)throw Object.assign(Error('The source awaits acknowledged retirement.'),{code:'BUSY'});
   if(existing.blob!==input.blob)throw Error('Source identity collision');
   if(!images.has(input.id)){existing.owners++;images.add(input.id);}return existing.descriptor;
  }
  function invalidateSources(error){if(error?.imagesCleared){record.images.clear();record.configured.clear();for(const scope of record.owners){for(const entry of scope.parkedFinals?.values()??[])entry.invalidated=true;for(const name of ['images','surfaces','tables','models','leases'])scope[name].clear();scope.invalidate?.();}}}
  function admitSource(method,args){
   if(method.startsWith('release')||method==='retireSourceSamples')return;
   const value=args[0],id=typeof value==='string'&&['original','originalBlob','readOriginal','imagePixels'].includes(method)?value:value?.imageId??value?.task?.imageId??value?.bindingOriginal?.imageId;
   if(id&&record.images.get(id)?.retiring)throw Object.assign(Error('The source awaits acknowledged retirement.'),{code:'BUSY'});
   if(value?.surfaceId)for(const image of record.images.values())if(image.retiring&&(image.descriptor.surface?.id===value.surfaceId||image.descriptor.nativeSurface?.id===value.surfaceId))throw Object.assign(Error('The source surface awaits acknowledged retirement.'),{code:'BUSY'});
   if(!id&&['prepareSourceSamples','readSourceSamples'].includes(method)&&[...images].some(id=>record.images.get(id)?.retiring))throw Object.assign(Error('The source sample owner awaits acknowledged retirement.'),{code:'BUSY'});
  }
  async function finalLifetime(request,control,managed,hooks,acquisitions){
   const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),entry=parkedFinals.get(request.token??request.take?.token);
   if(!entry&&control.snapshot().closed&&['release','acquire'].includes(request.action)){
    // Only this captured control can recognize its retired capability. There
    // is no absent-token ACK and no useful queue/Source/replacement admission.
    const output=await control.finalResultLifetime(request,hooks);requireValue(output?.acknowledged===true&&output.ownerId===request.ownerId&&output.token===request.token&&output.retired===true&&(request.action==='release'||output.hit===false),'Closed final control did not acknowledge its retired token.');return output;
   }
   if(request.action!=='park'||request.take)requireValue(entry&&entry.ownerId===request.ownerId&&entry.control===managed,'Final token belongs to another workspace scope.');
   if(request.action==='park'){requireValue(images.has(request.binding?.imageId),'This scope does not own the final Source.');for(const d of request.resources?.surfaces??[])requireValue(surfaces.has(d.id),'This scope does not own the final Surface.');for(const d of request.resources?.tables??[])requireValue(tables.has(d.id),'This scope does not own the final table.');}
   const output=await control.finalResultLifetime(request,hooks);requireValue(output?.acknowledged===true&&output.ownerId===request.ownerId,'Final lifetime did not acknowledge this owner.');
   const acquired=request.action==='park'?output.acquisition:request.action==='acquire'?output:null;
   if(acquired){requireValue(entry&&acquired.token===entry.token,'Acquired final token differs.');if(acquired.hit){requireValue(same(acquired.resources,entry.resources),'Acquired bundle differs.');for(const d of entry.resources.surfaces??[])surfaces.add(d.id);for(const d of entry.resources.tables??[])tables.add(d.id);acquisitions.set(entry.token,entry.resources);}else requireValue(acquired.retired===true,'Final miss has no retirement ACK.');parkedFinals.delete(entry.token);}
   if(request.action==='park'&&output.parked!==false){requireValue(output.parked===true&&typeof output.token==='string'&&same(output.resources,request.resources),'Parked bundle differs.');for(const d of request.resources.surfaces??[])surfaces.delete(d.id);for(const d of request.resources.tables??[])tables.delete(d.id);parkedFinals.set(output.token,{token:output.token,ownerId:request.ownerId,resources:request.resources,binding:request.binding,control:managed});}
   if(request.action==='release'){requireValue(output.retired===true&&output.token===request.token,'Final release has no retirement ACK.');parkedFinals.delete(request.token);}return output;
  }
  async function unload(id){
   requireValue(![...parkedFinals.values()].some(entry=>entry.binding.imageId===id),'Captured final owners must retire before their Source.');
   if(images.has(id)){
    const image=record.images.get(id);
    if(!image){images.delete(id);return;}
    if(image.owners>1){image.owners--;images.delete(id);return;}
    image.retiring=true;
    try{await record.engine.unload(id);}catch(error){invalidateSources(error);throw error;}
    if(record.images.get(id)===image)record.images.delete(id);images.delete(id);
   }else if(models.has(id)){try{await record.engine.unload(id);}catch(error){invalidateSources(error);throw error;}models.delete(id);}
  }
  return new Proxy({}, {get(_,method){
   if(method===CAPTURED_OWNERSHIP_CONTROL)return capturedControl;
   if(method===NATIVE_PREVIEW_FINANCE)return nativeFinance;
   if(method==='onSourceInvalidation')return callback=>{owner.invalidate=callback;};
   if(method==='dispose')return ()=>{
    if(nativeOwners?.size||capturedOwners.size){if(nativeDisposing)return nativeDisposing;closed=true;
     // Close presentations before enqueuing scope teardown: their ordinary
     // captured releases still use this queue. Reset retirement alone bypasses
     // it with the captured peer certificate, never with a replacement worker.
     const task=allAcknowledged([closeNativeOwners(),closeCapturedOwners()]).then(disposeScope);nativeDisposing=task;void task.finally(()=>{if(nativeDisposing===task)nativeDisposing=null;}).catch(()=>{});return task;
    }
    return disposeScope();
   };
   function disposeScope(){
    if(disposing)return disposing;closed=true;
    const task=enqueue(async()=>{
     const failures=[];const attempt=async fn=>{try{await fn();}catch(e){invalidateSources(e);failures.push(e);}};
     for(const entry of [...parkedFinals.values()])await attempt(()=>finalLifetime({action:'release',token:entry.token,ownerId:entry.ownerId}));
     for(const id of [...leases])await attempt(async()=>{const ack=await record.engine.releaseExternalMemory(id);requireValue(ack!==false&&ack!==0,'External memory retirement was not acknowledged.');leases.delete(id);});
     for(const id of [...surfaces])await attempt(async()=>{await record.engine.releaseSurface(id);surfaces.delete(id);});
     for(const id of [...tables])await attempt(async()=>{await record.engine.releaseTable(id);tables.delete(id);});
     for(const id of [...images,...models])await attempt(()=>unload(id));
     if(!failures.length){
      if(!detached){record.owners.delete(owner);record.scopes--;detached=true;}
      if(record.scopes===0){record.retiring=true;await attempt(()=>record.engine.dispose());if(!failures.length&&records.get(key)===record)records.delete(key);}
     }
     if(failures.length)throw Object.assign(new AggregateError(failures,'Workspace cleanup failed',{cause:failures[0]}),{cleanupOwner:{dispose:disposeScope}});
    });disposing=task;void task.catch(()=>{if(disposing===task)disposing=null;});return task;
   }
   return (...args)=>{
    if(method==='unload'&&images.has(args[0]))closingCapturedImages.add(args[0]);
    if(method==='unload'&&([...(nativeOwners??[]),...capturedOwners].some(owner=>owner.imageId===args[0])))return allAcknowledged([closeNativeOwners(args[0]),closeCapturedOwners(args[0])]).then(()=>enqueue(()=>unload(args[0]))).then(value=>capturedUnloadAcknowledged(args[0],value));
    // Acquiring an existing source does not call the worker. Retain it before
    // another scope's queued unload can run, without overtaking our own changes.
    if(method==='loadBlob'&&!closed&&!sourceChanges)try{const value=borrowImage(...args);if(value)return Promise.resolve(value);}catch(error){return Promise.reject(error);}
    const sourceChange=method==='loadBlob'||method==='unload';if(sourceChange)sourceChanges++;
    const task=enqueue(async()=>{
    if(closed)throw Object.assign(Error('Document closed'),{code:'CANCELLED'});
    if(method==='loadBlob'){
     const input=args[0],existing=borrowImage(...args);if(existing)return existing;
     const descriptor=await record.engine.loadBlob(...args);record.images.set(input.id,{descriptor,blob:input.blob,owners:1});images.add(input.id);return descriptor;
    }
    if(method==='unload')return unload(args[0]);
    if(method==='finalResultLifetime')throw Object.assign(Error('Final ownership requires its captured local control.'),{code:'CAPTURED_CONTROL_REQUIRED'});
    admitSource(method,args);
    const configuration=['loadM3Models','loadD2prlModel'].includes(method)?method+':'+JSON.stringify(method==='loadM3Models'?{models:args[0].models,language:args[0].language?.sha256}:{url:args[0].url,sha256:args[0].sha256}):null;
    if(configuration&&record.configured.has(configuration))return record.configured.get(configuration);
    let output;
    try{
     if(method==='runConfiguredSegmentation'){
      const [task,model,hooks]=args;
      requireValue(task?.operation==='ai.clones.segmentation'&&task.params?.variant===model?.variant,'Matching segmentation task and configuration required');
      // Borrow the raw engine only within this queue admission. Calling the
      // proxy here would enqueue behind ourselves and deadlock; another scope
      // must not switch the shared adapter between configuration and inference.
      await configureSegmentationModel(record.engine,model,hooks);
      output=await record.engine.run(task,hooks);
     }else if(method==='runConfiguredExtension'){
      const [task,configuration,hooks]=args;requireValue(isExtensionTool(task?.operation),'Approved extension task required');
      await configureExtensionModels(record.engine,configuration,hooks);
      output=await record.engine.run(task,hooks);
     }else if(method==='runConfiguredOcr'){
      const [task,configuration,hooks]=args;requireValue(task?.operation==='various.ocr','OCR task required');
      await record.engine.loadOcrModels(configuration,hooks);output=await record.engine.run(task,hooks);
     }else output=await record.engine[method](...args);
    }catch(error){invalidateSources(error);throw error;}
    if(configuration)record.configured.set(configuration,output);
    if(['run','runConfiguredSegmentation','runConfiguredExtension','runConfiguredOcr','deriveSourceRegionInput'].includes(method)){const owned=resultResources(output);for(const s of owned.surfaces)if(![...record.images.values()].some(i=>i.descriptor.surface?.id===s.id))surfaces.add(s.id);for(const t of owned.tables)tables.add(t.id);}
    if(method==='releaseSurface')surfaces.delete(args[0]);
    if(method==='releaseTable')tables.delete(args[0]);
    if(method==='reserveExternalMemory')leases.add(output.id);
    if(method==='releaseExternalMemory'&&output!==false&&output!==0)leases.delete(args[0]);
    if(method==='loadMedianModel'||method==='loadQualityModel'||method==='loadPrnuDatabase'||method==='buildPrnuDatabase')models.add(args[0].id);
    return output;
    });return sourceChange?(method==='unload'?task.then(value=>capturedUnloadAcknowledged(args[0],value)):task).finally(()=>sourceChanges--):task;
   };
  }});
 };
}
