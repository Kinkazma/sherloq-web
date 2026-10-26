import {EngineError,requireValue,checkAbort} from './errors.js';
import {createExtensionResultRecord} from './extensions-result-surfaces.js';
import {persistExtensionResult} from './extensions-plane-cache.js';
import {createTemporarySession} from './temporary-storage.js';

export const EXTENSION_OPERATIONS=Object.freeze({
 'ai.generation.bfree':'bfree','ai.generation.spai':'spai','ai.text.doctamper':'doctamper','jpeg.comprint':'comprint'
});
const labels={bfree:'B-Free',spai:'SPAI',doctamper:'DTD / DocTamper',comprint:'Comprint'};
export function extensionCapabilities(configured=false){return Object.entries(EXTENSION_OPERATIONS).map(([id,method])=>({id,method,label:labels[method],status:configured?'qualified-declared-corpus':'model-required',modelRequired:true,backends:['cpu','webgpu','auto'],regions:['full-frame'],sourceAccess:'bounded-original-surface-windows',exports:['json',...(['bfree','spai'].includes(method)?[]:['npz'])],semantics:['bfree','spai'].includes(method)?'Whole-image generation score; no localization or exclusion of partial AI edits.':'Scientific inspection cue, not a forgery verdict.'}));}
function absolute(value,base){const url=new URL(value,base);requireValue(['http:','https:','file:'].includes(url.protocol),'Extension resources require HTTP(S) or local developer module URLs.');return url.href;}
function describe(result){
 const data={method:result.method};
 for(const key of ['scores','scientific_limits','global_verdict','preprocessing','timings_seconds','patch_count','window_logits','variant','semantics'])if(result[key]!==undefined)data[key]=structuredClone(result[key]);
 if(result.statistics?.metadata)data.statistics=structuredClone(result.statistics.metadata);
 return data;
}
/** Internal bridge: callers configure resource URLs; shared resources are
 * supplied only by createEngine, never reconstructed or passed through RPC. */
export function createExtensionsAdapter({budget,scheduler,profile,version,publishResult,releaseSurface,onTemporarySession,loadModule=url=>import(url)}={}){
 let engine,active=false,closed=false,resultStorage='auto',pagedThreshold=16_000_000;const published=new Map(),cache=new Map(),sessions=new Map(),sessionFlights=new Map(),metrics={coreCacheHits:0,coreComputes:0,persistedBytes:0};
 const alive=()=>{if(closed)throw new EngineError('DISPOSED','Extension adapter disposed.');};
 async function clearImages(imageId){
  requireValue(!active,'Extension adapter busy');
  const ids=[...published].filter(([,owner])=>imageId===undefined||owner===imageId).map(([id])=>id);
  for(const id of ids)if(published.has(id))await releaseSurface(id);
  for(const[key,entry]of cache)if(imageId===undefined||entry.imageId===imageId){cache.delete(key);await entry.value.release();}
  for(const[id,session]of sessions)if(imageId===undefined||id===imageId){sessions.delete(id);await session.dispose();}
  await engine?.clearCache();
 }
 return {
  configured:()=>!!engine,
  capabilities:()=>extensionCapabilities(!!engine),
  snapshot:()=>({configured:!!engine,active,publishedSurfaces:published.size,ownedTemporarySessions:sessions.size,pendingTemporarySessions:sessionFlights.size,resultStorage,pagedThresholdPixels:pagedThreshold,coreCache:{...metrics,entries:cache.size,temporaryBytes:[...cache.values()].reduce((n,e)=>n+e.value.byteLength,0)},...engine?.snapshot?.()}),
  async load(input={},{signal}={}){
   alive();requireValue(!active&&!engine,'Unload the extension resources before replacing them.');checkAbort(signal);
   const storage=input.resultStorage??'auto',threshold=input.pagedResultThresholdPixels??16_000_000;requireValue(['auto','borrowed','temporary'].includes(storage)&&Number.isSafeInteger(threshold)&&threshold>0,'Invalid extension result storage policy.');
   const baseURL=absolute(input.baseURL??'../../extension-engine/',import.meta.url),moduleURL=absolute(input.moduleURL??'engine.js',baseURL);
   const module=await loadModule(moduleURL);checkAbort(signal);alive();requireValue(typeof module.createExtensionEngine==='function','Extension browser entry point required.');
   const options={...input,baseURL,budget,scheduler,profile};for(const key of['moduleURL','resultStorage','pagedResultThresholdPixels'])delete options[key];
   let created;
   try{created=await module.createExtensionEngine(options);checkAbort(signal);alive();requireValue(typeof created.analyzeSource==='function','Extension engine must support bounded source windows.');const caps=created.capabilities();requireValue(Array.isArray(caps.methods)&&caps.methods.length===4&&new Set(caps.methods).size===4&&caps.methods.every(m=>Object.values(EXTENSION_OPERATIONS).includes(m))&&caps.sharedBudget===true,'Only the four approved methods sharing core resources are supported.');engine=created;resultStorage=storage;pagedThreshold=threshold;return{methods:caps.methods,execution:'browser-only',sharedResources:true,weightsFetched:false,preflightExecutions:0,resultStorage,pagedResultThresholdPixels:pagedThreshold};}
   catch(error){await created?.dispose();throw error;}
  },
  async run(task,image,{signal,onProgress,knownHeapBytes=0,methods}={}){
   alive();if(!engine)throw new EngineError('MODEL_UNAVAILABLE','Load browser extension model resources first.');requireValue(!active,'Extension adapter busy.');
   const requested=methods??[EXTENSION_OPERATIONS[task.operation]];
   requireValue(Array.isArray(requested)&&requested.length>0&&new Set(requested).size===requested.length&&requested.every(m=>Object.values(EXTENSION_OPERATIONS).includes(m)),'Only approved extension methods are supported.');
   requireValue(!task.regions||Array.isArray(task.regions)&&task.regions.length===0,'Extension methods use their original full-frame definitions.');
   requireValue(['cpu','webgpu','auto'].includes(task.backend??'auto'),'Invalid extension backend.');
   const descriptor=image.surface?.descriptor;requireValue(descriptor?.format==='rgb8'&&typeof image.surface.readWindow==='function','Qualified original RGB source surface required.');
   requireValue(typeof image.sha256==='string'&&image.sha256.length===64,'Original source identity required.');
   const paged=resultStorage==='temporary'||resultStorage==='auto'&&descriptor.width*descriptor.height>pagedThreshold;
   const keyFor=method=>JSON.stringify([task.imageId,image.sha256,descriptor.width,descriptor.height,image.provenance??{},method,task.backend??'auto']);
   const hits=new Map(paged?requested.map(method=>[method,cache.get(keyFor(method))?.value]).filter(([,value])=>value):[]),missing=requested.filter(method=>!hits.has(method));
   active=true;let lease,held=1,released=false,output,resident;const created=[],staged=[];const started=performance.now();let reads=0,maxWindowBytes=0;
   const release=async()=>{if(released||--held)return;if(lease){released=true;const old=lease;lease=null;await old.release();}};
   const retain=()=>{requireValue(!released,'Extension result lease already released.');held++;let done=false;return()=>{if(done)return;done=true;return release();};};
   try{
    resident=budget.reserve(knownHeapBytes);checkAbort(signal);
    const getTemporarySession=async hooks=>{
     if(image.ensureTemporarySession)return image.ensureTemporarySession(hooks);if(image.session)return image.session;
     if(sessions.has(task.imageId))return sessions.get(task.imageId);
     if(!sessionFlights.has(task.imageId)){const flight=(async()=>{const session=await createTemporarySession({budget,signal:hooks?.signal});sessions.set(task.imageId,session);onTemporarySession?.({id:session.id,backend:session.backend});return session;})().finally(()=>sessionFlights.delete(task.imageId));sessionFlights.set(task.imageId,flight);}return sessionFlights.get(task.imageId);
    };
    let format=String(image.provenance?.format??'').toUpperCase();
    if(!format&&missing.length){let bytes=image.bytes,part;if(!bytes&&image.source?.read){part=await image.source.read(0,Math.min(8,image.source.byteLength),{signal});bytes=part.bytes;}
     try{format=bytes?.[0]===255&&bytes?.[1]===216?'JPEG':bytes?.[0]===137&&bytes?.[1]===80?'PNG':bytes?.[0]===73&&bytes?.[1]===73||bytes?.[0]===77&&bytes?.[1]===77?'TIFF':'UNKNOWN';}finally{part?.release();}
    }
    const source={width:descriptor.width,height:descriptor.height,sourceSha256:image.sha256,sourceFormat:format,exifOrientation:image.provenance?.orientation??1,decodeProvenance:image.provenance,encodedBytes:image.bytes,sourceBlob:image.blob,source:image.source,getTemporarySession,
     async readWindow(rect,hooks={}){checkAbort(signal);const part=await image.surface.readWindow(rect,{...hooks,signal:hooks.signal??signal});reads++;maxWindowBytes=Math.max(maxWindowBytes,part.pixels.data.byteLength);return part;}
    };
    const resultsByMethod=new Map(),ledgers=new Map(),seen=new Set();
    const operationFor=method=>Object.keys(EXTENSION_OPERATIONS).find(id=>EXTENSION_OPERATIONS[id]===method);
    const failure=result=>({id:task.id,imageId:task.imageId,operation:operationFor(result.method),status:'error',error:structuredClone(result.error)});
    const removeRecords=async records=>{for(const record of records){const id=record.surface.descriptor.id;if(published.has(id))await releaseSurface(id);else await record.surface.dispose();const at=created.indexOf(record);if(at>=0)created.splice(at,1);}};
    const rollback=async method=>{const ledger=ledgers.get(method);if(!ledger)return;ledgers.delete(method);await removeRecords(ledger.records);if(ledger.staged){const at=staged.indexOf(ledger.staged);if(at>=0)staged.splice(at,1);await ledger.staged.value.release();}resultsByMethod.delete(method);};
    const consume=async(result,cachedEntry)=>{
     const method=result.method;requireValue(requested.includes(method)&&!seen.has(method),'Duplicate or unexpected extension result.');seen.add(method);
     if(result.status!=='ok'){resultsByMethod.set(method,failure(result));return;}
     checkAbort(signal);let entry=cachedEntry,newEntry;const records=[];
     try{
      if(paged&&!entry){entry=await persistExtensionResult(result,descriptor,{budget,scheduler,getTemporarySession,signal,onProgress:event=>onProgress?.({id:task.id,...event}),metadata:describe(result)});newEntry={key:keyFor(method),value:entry};}
      const operation=operationFor(method),data=entry?structuredClone(entry.data):describe(result),provenance={engine:version,operation,originalSha256:image.sha256,decode:structuredClone(image.provenance),backend:task.backend??'auto',scientificLimits:data.scientific_limits,sourceAccess:'original-oriented-surface-windows',preprocessing:data.preprocessing};
      const record=await createExtensionResultRecord(result,descriptor,{budget,scheduler,retain:entry?()=>entry.retain():retain,signal,metadata:structuredClone(data),planes:entry?.planes});let bundle={};
      if(record){
       const all=[record,...Object.values(record.planeRecords),...Object.values(record.maskRecords)];
       for(const part of all){part.provenance=structuredClone(provenance);const id=part.surface.descriptor.id,dispose=part.surface.dispose;part.surface={...part.surface,async dispose(){try{return await dispose();}finally{published.delete(id);}}};records.push(part);}
       bundle=publishResult(task.imageId,record);for(const part of all)published.set(part.surface.descriptor.id,task.imageId);
      }
      const resultMetrics=hits.has(method)?{totalMs:0,execution:[],cache:{neural:true,coreAnalysis:true},cachedComputation:structuredClone(entry.metrics)}:result.metrics??{};
      const envelope={id:task.id,imageId:task.imageId,operation,status:'ok',data,...bundle,...(record?{layout:'surface'}:{}),layers:record?[{id:record.key,kind:'scalar',surfaceId:record.surface.descriptor.id,width:record.surface.descriptor.width,height:record.surface.descriptor.height,range:record.surface.descriptor.range,semantics:record.semantics}]:[],provenance,metrics:{...resultMetrics,resultStorage:entry?.storage??'borrowed-extension-result'}};
      checkAbort(signal);onProgress?.({id:task.id,phase:'extension-result-ready',method,result:envelope});
      created.push(...records);if(newEntry)staged.push(newEntry);ledgers.set(method,{records,staged:newEntry});resultsByMethod.set(method,envelope);
     }catch(error){await removeRecords(records);await newEntry?.value.release();throw error;}
    };
    for(const[method,entry]of hits)await consume({method,status:'ok'},entry);
    if(missing.length)lease=await engine.analyzeSource(source,{methods:missing,backend:task.backend??'auto',signal,resultMode:paged?'consumed':'borrowed',...(paged?{onMethodResult:result=>consume(result)}:{}),onProgress:event=>onProgress?.({id:task.id,...event})});
    checkAbort(signal);alive();const computed=new Map((lease?.results??[]).map(result=>[result.method,result]));
    for(const method of missing){const result=computed.get(method);requireValue(result,'Extension engine omitted a requested method.');if(!paged)await consume(result);else if(result.status!=='ok'){await rollback(method);resultsByMethod.set(method,failure(result));}else requireValue(resultsByMethod.has(method),'Consumed extension result was not delivered.');}
    const results=requested.map(method=>resultsByMethod.get(method));
    // All useful arrays have reached authoritative browser storage before
    // making the neural cache evictable and dropping its borrowed RAM lease.
    if(paged&&missing.length){await engine.clearCache();computed.clear();await release();}checkAbort(signal);
    for(const entry of staged){cache.set(entry.key,{imageId:task.imageId,value:entry.value});metrics.persistedBytes+=entry.value.byteLength;}
    metrics.coreCacheHits+=hits.size;metrics.coreComputes+=missing.length;
    output={id:task.id,imageId:task.imageId,operation:task.operation??'analysis.extensions',status:results.every(r=>r.status==='ok')?'ok':'partial',results,metrics:{...lease?.metrics,totalMs:performance.now()-started,sourceReads:reads,maxSourceWindowBytes:maxWindowBytes,cache:{coreAnalyses:hits.size,computedMethods:missing.length},memory:budget.snapshot()}};
    return output;
   }catch(error){
    for(const record of created){const id=record.surface.descriptor.id;if(published.has(id))await releaseSurface(id).catch(()=>{});else await record.surface.dispose();}
    await Promise.allSettled(staged.map(entry=>entry.value.release()));
    throw error;
   }finally{await release();resident?.();active=false;}
  },
  clearImages,
  async unload(){alive();await clearImages();await engine?.dispose();engine=null;},
  async dispose(){if(closed)return;await clearImages();closed=true;const old=engine;engine=null;await old?.dispose();}
 };
}
