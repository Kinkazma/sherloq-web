import {createWorkerEngine} from './unified-engine/src/worker-client.js';
import {resultResources,configureSegmentationModel,configureExtensionModels} from './tool-client.js?v=0.23.0';
import {isExtensionTool} from './extension-tools.js?v=0.23.0';
import {requireValue} from './unified-engine/src/errors.js';

// Individual documents share one native memory budget and the original image.
// This queue serializes the public API only; native CPU/GPU pools remain intact.
export function createWorkspaceEnginePool(createEngine=createWorkerEngine){
 const records=new Map();
 return function engineFactory(options={}){
  const key=JSON.stringify(options);let record=records.get(key);
  if(!record){record={engine:createEngine(options),queue:Promise.resolve(),scopes:0,images:new Map(),configured:new Map(),owners:new Set()};records.set(key,record);}
  record.scopes++;
  const images=new Set(),surfaces=new Set(),tables=new Set(),models=new Set(),leases=new Set();let closed=false,disposing;const owner={images,surfaces,tables,models,leases,invalidate:null};record.owners.add(owner);
  const enqueue=fn=>{const task=record.queue.then(fn);record.queue=task.catch(()=>{});return task;};
  async function unload(id){
   if(images.delete(id)){const image=record.images.get(id);if(image&&--image.owners===0){record.images.delete(id);await record.engine.unload(id);}}
   else if(models.delete(id))await record.engine.unload(id);
  }
  return new Proxy({}, {get(_,method){
   if(method==='onSourceInvalidation')return callback=>{owner.invalidate=callback;};
   if(method==='dispose')return ()=>{
    if(disposing)return disposing;closed=true;
    disposing=enqueue(async()=>{
     const failures=[];const attempt=async fn=>{try{await fn();}catch(e){failures.push(e);}};
     for(const id of leases)await attempt(()=>record.engine.releaseExternalMemory(id));
     leases.clear();
     for(const id of surfaces)await attempt(()=>record.engine.releaseSurface(id));
     for(const id of tables)await attempt(()=>record.engine.releaseTable(id));
     for(const id of [...images,...models])await attempt(()=>unload(id));
     record.owners.delete(owner);
     if(--record.scopes===0){records.delete(key);await attempt(()=>record.engine.dispose());}
     if(failures.length)throw new AggregateError(failures,'Workspace cleanup failed',{cause:failures[0]});
    });return disposing;
   };
   return (...args)=>enqueue(async()=>{
    if(closed)throw Object.assign(Error('Document closed'),{code:'CANCELLED'});
    if(method==='loadBlob'){
     const input=args[0],existing=record.images.get(input.id);
     if(existing){if(existing.blob!==input.blob)throw Error('Source identity collision');if(!images.has(input.id)){existing.owners++;images.add(input.id);}return existing.descriptor;}
     const descriptor=await record.engine.loadBlob(...args);record.images.set(input.id,{descriptor,blob:input.blob,owners:1});images.add(input.id);return descriptor;
    }
    if(method==='unload')return unload(args[0]);
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
     }else output=await record.engine[method](...args);
    }catch(error){if(error.imagesCleared){record.images.clear();record.configured.clear();for(const scope of record.owners){for(const name of ['images','surfaces','tables','models','leases'])scope[name].clear();scope.invalidate?.();}}throw error;}
    if(configuration)record.configured.set(configuration,output);
    if(['run','runConfiguredSegmentation','runConfiguredExtension'].includes(method)){const owned=resultResources(output);for(const s of owned.surfaces)if(![...record.images.values()].some(i=>i.descriptor.surface?.id===s.id))surfaces.add(s.id);for(const t of owned.tables)tables.add(t.id);}
    if(method==='releaseSurface')surfaces.delete(args[0]);
    if(method==='releaseTable')tables.delete(args[0]);
    if(method==='reserveExternalMemory')leases.add(output.id);
    if(method==='releaseExternalMemory')leases.delete(args[0]);
    if(method==='loadMedianModel'||method==='loadQualityModel'||method==='loadPrnuDatabase'||method==='buildPrnuDatabase')models.add(args[0].id);
    return output;
   });
  }});
 };
}
