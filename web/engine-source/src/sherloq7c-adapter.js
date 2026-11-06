import {EngineError,requireValue,checkAbort} from './errors.js';
import {loadNativeRgb16} from './native-rgb16-source.js';
import {native16SourceRows} from './sherloq7c-source-rows.js';
import {sherloq7cWindowRecords} from './sherloq7c-window-records.js';

export function sherloq7cParams(input={}){
 requireValue(input&&typeof input==='object'&&!Array.isArray(input),'Sherloq parameters required.');
 const p={revelation:0,micro:0,precision:'1e-2',maxSide:512,computationMode:'precision',...input};
 requireValue(Object.keys(p).every(k=>['revelation','micro','precision','maxSide','computationMode'].includes(k))&&[p.revelation,p.micro].every(v=>Number.isFinite(v)&&v>=0&&v<=100)&&['reference','1e-7','1e-4','1e-2'].includes(p.precision)&&[256,512,1024,2048,'native'].includes(p.maxSide)&&['fast','precision'].includes(p.computationMode),'Invalid Sherloq controls.');return p;
}

export const sherloq7cResultRecords=sherloq7cWindowRecords;

// One core owns one current graph. Changing an original may retire the previous
// original's graph; changing only that original's presentation must stay warm.
export function createSherloq7cRuntimeOwnership(getRuntime){
 let imageId=null;
 return{
  get imageId(){return imageId;},
  async claim(id){requireValue(typeof id==='string'&&id.length>0,'The original image identity is required for the shared Sherloq runtime.');if(imageId===id)return;if(imageId!==null)await getRuntime()?.clearCache();imageId=id;},
  async clear(id){if(imageId!==id)return false;await getRuntime()?.clearCache();imageId=null;return true;},
  retired(){imageId=null;}
 };
}

export function createSherloq7cAdapter({budget,version,publishResult,memoryBudgetBytes,resourceHints}={}){
 const entries=new Map(),pendingRetirements=new Set(),constructionRetirements=new Map();let closed=false,active=false,core;const runtimeOwner=createSherloq7cRuntimeOwnership(()=>core);
 function retainConstructionCleanup(error){
  const cleanup=error?.retryCleanup;if(typeof cleanup!=='function'||constructionRetirements.has(cleanup))return;
  let pending;
  const retire=()=>{if(pending)return pending;const task=Promise.resolve().then(()=>cleanup.call(error)).then(()=>{pendingRetirements.delete(retire);constructionRetirements.delete(cleanup);});pending=task;void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;};
  constructionRetirements.set(cleanup,retire);pendingRetirements.add(retire);
 }
 async function retirePending(){for(const retire of [...pendingRetirements])await retire();}
 const unregister=budget.registerAsyncReclaimer?.(async({signal}={})=>{if(active||closed)return 0;const before=budget.total();for(const id of [...entries.keys()]){checkAbort(signal);await clearImage(id);}return Math.max(0,before-budget.total());},{owner:'sherloq7c-native-source',label:'idle-native-rgb16-cache',allocationKind:'array-buffer'});
 async function runtime(imageId){if(closed)throw new EngineError('DISPOSED','Sherloq adapter is closed.');await retirePending();if(!core){const{createSherloq7C}=await import('./sherloq7c.js');core=createSherloq7C({budget,memoryBudgetBytes,resourceHints});}await runtimeOwner.claim(imageId);return core;}
 async function clearImage(id){await retirePending();await runtimeOwner.clear(id);const entry=entries.get(id);if(!entry)return;await entry.source?.release();entry.source=null;await entry.inputOwner?.dispose();entry.inputOwner=null;entries.delete(id);}
 return{
  runtime,
  updateResourceHints(hints){resourceHints=hints;return core?.updateResourceHints(hints)??null;},
  async run(task,image,{signal,onProgress}={}){
   if(active)throw new EngineError('BUSY','Sherloq adapter is already running.');active=true;
   try{
   if(closed)throw new EngineError('DISPOSED','Sherloq adapter is closed.');await retirePending();const p=sherloq7cParams(task.params),started=performance.now();
   if(task.regions&&(!Array.isArray(task.regions)||task.regions.length)||task.scientificScope||task.exclusions?.length)throw new EngineError('UNSUPPORTED_REGION','Sherloq7C currently requires the complete original image; this scope needs a separate native16 qualification.');
   let entry=entries.get(task.imageId);if(entry&&entry.sha256!==image.sha256)throw new EngineError('SOURCE_CHANGED','Sherloq original identity changed.');
   if(!entry){entry={sha256:image.sha256,source:null,inputOwner:null};entries.set(task.imageId,entry);}
   const sourceCached=!!entry.source;await runtime(task.imageId);
   try{if(!entry.source){
    entry.inputOwner??=await loadNativeRgb16(image,{budget,signal,onProgress});
    const original=entry.inputOwner;entry.sourceBitDepth=original.sourceBitDepth;entry.provenance=original.provenance;entry.metrics=original.metrics;
    entry.source=await core.createSource(native16SourceRows(original,{onProgress}),{signal});
   }}catch(error){retainConstructionCleanup(error);throw error;}
   // The old decoder owner remains addressable until its retirement succeeds.
   if(entry.inputOwner){await entry.inputOwner.dispose();entry.inputOwner=null;}checkAbort(signal);
   let result,record,published=false;
   try{
    result=await core.run(entry.source,{revelation:p.revelation/100,micro:p.micro/100,precision:p.precision,maxSide:p.maxSide,computationMode:p.computationMode,prepareRevelationRange:p.micro!==0},{signal,onProgress,backend:p.computationMode==='fast'?'auto':task.backend??'auto'});checkAbort(signal);
    requireValue(typeof result.readWindow==='function'&&typeof result.release==='function','Owned frozen Sherloq output required.');
    record=sherloq7cResultRecords(result,budget);const bundle=publishResult(task.imageId,record);published=true;
    return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,
     layers:[{id:'sherloq7c',kind:'rgb',surfaceId:bundle.surface.id,origin:[0,0],range:[0,255]}],
     data:{version:'7C',sourceBitDepth:entry.sourceBitDepth,workingBitDepth:16,resultBitDepth:16,scalarPrecision:'float64',native16:bundle.planeSurfaces.rgb16,scalar:bundle.planeSurfaces.intensity},
     semantics:'Sherloq7C uses the explicitly selected output resolution; RGB16 and scalar output dimensions are the actual reduced raster, without upsampling. The original is preserved separately.',
     provenance:{engine:version,operation:task.operation,params:p,backend:result.metrics?.actualBackend??result.metrics?.backend??'cpu',originalSha256:image.sha256,sourceUnchanged:true,decode:entry.provenance,native:'Sherloq7C graph objective and anchored projection',kernelParity:result.metrics?.approximate?'Approximate; see effectiveComputationMode and declared bounds':result.metrics?.precision??p.precision,layout:'owned-selected-resolution-rgb16-windows',proxy:result.metrics?.proxy??null},
     metrics:{...result.metrics,totalMs:performance.now()-started,source16CacheHit:sourceCached,source16:entry.metrics,sourceBitDepth:entry.sourceBitDepth,workingBitDepth:16,memory:budget.snapshot()}};
   }catch(error){
    if(!published&&result){
     const owners=new Set(record?[record.surface,...Object.values(record.planeRecords).map(x=>x.surface)]:[{dispose:()=>result.release()}]);
     const retire=async()=>{const errors=[];for(const owner of [...owners])try{await owner.dispose();owners.delete(owner);}catch(cleanup){errors.push(cleanup);}if(errors.length)throw new AggregateError(errors,'Sherloq unpublished output retirement remains pending.');pendingRetirements.delete(retire);};pendingRetirements.add(retire);
     try{await retire();}catch(cleanupError){let primary=error;if(!primary||typeof primary!=='object'||!Object.isExtensible(primary)){primary=new AggregateError([error,cleanupError],'Sherloq publication and retirement failed.',{cause:error});primary.code=error?.code??'CLEANUP_FAILED';}const previous=primary.retryCleanup;primary.cleanupError=cleanupError;primary.retryCleanup=async()=>{await previous?.();await retire();};throw primary;}
    }
    throw error;
   }
   }finally{active=false;}
  },clearImage,
  snapshot(){return{sources:entries.size+(runtimeOwner.imageId&&!entries.has(runtimeOwner.imageId)?1:0),native16Sources:entries.size,runtimeImageId:runtimeOwner.imageId,source16Bytes:[...entries.values()].reduce((n,e)=>n+(e.source?.byteLength??0)+(e.inputOwner?.data?.byteLength??0),0),pendingRetirements:pendingRetirements.size,workingBitDepth:16};},
  async dispose(){closed=true;unregister?.();await retirePending();await core?.dispose();core=null;runtimeOwner.retired();let first;for(const id of [...entries.keys()])try{await clearImage(id);}catch(error){first??=error;}if(first)throw first;},
 };
}
