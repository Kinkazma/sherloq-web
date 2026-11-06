import {neuralUsefulExecutionSnapshot} from './neural-graph-pool.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {compositeSourceDomain,compositeRegionalImage,compositeRegionalResult} from './composite-regional-source.js';
import {receiveM2SourceRegionInput} from './m2-source-region-input.js';
import {receiveCfaStrictSourceInput} from './cfa-strict-source-input.js';
import {receiveTruforStrictSourceInput} from './trufor-strict-source-input.js';
import {samplePixels,sampleSurface,displayGeometry} from './display-sampling.js';
import {Budget} from './cache.js';
import {jpegCodec} from './jpeg.js';
import {loadM2SegmentedOriginal,disposeSegmentedImage} from './image-sources.js';
import {createM2NpzStream} from './m2-npz-stream.js';
import {resolveComputeProfile} from './profiles.js';
import {EngineError,requireValue,checkAbort,serializeEngineError} from './errors.js';
import {createForgeryscopeAnalyzer} from './forgeryscope-analyzer.js';
import {createTruforSourceRegionRouter} from './trufor-source-region-router.js';
import {createRitaSourceRegionRouter} from './rita-source-region-router.js';
import {receiveRitaStrictSourceInput} from './rita-strict-source-input.js';
import {sampleRitaWindow} from './rita-render.js';
import {createCompositeAnalyzer} from './composite-analyzer.js';
import {createCatnetSourceRegionRouter} from './catnet-source-region-router.js';
import {createCfaSourceRegionRouter} from './cfa-source-region-router.js';
const MAX_WINDOW=4*1024**2;
async function retireM2Owners(actions,options={}){
 let failed=Object.hasOwn(options,'primary'),failure=options.primary;
 for(const action of actions)try{await action?.();}catch(error){if(!failed){failed=true;failure=error;}else if(failure&&typeof failure==='object'&&Object.isExtensible(failure))try{failure.details={...failure.details,cleanupErrors:[...(failure.details?.cleanupErrors??[]),serializeEngineError(error)]};}catch{}}
 if(failed&&!Object.hasOwn(options,'primary'))throw failure;
}
/** One shared budget across M2 families. Numeric arrays stay in the host worker. */
export function createM2WorkerHost({post,loadFactory=async url=>(await import(url)).default,analyzerFactories={},loadOriginal=loadM2SegmentedOriginal}={}){
 let config,budget,profile,disposed=false,closing=false,next=1,codecBytes=0;const externalMemory=new Map(),analyzers=new Map(),pending=new Map(),results=new Map(),exports=new Map(),operations=new Set(),cfaSourceRetirements=new Set();
 const memory=()=>({...budget.snapshot(),residentCodecBytes:codecBytes});
 function alive(operation){if(disposed||closing&&!['dispose','memory'].includes(operation))throw new EngineError('DISPOSED','M2 worker host disposed.');requireValue(budget,'Initialize the M2 host first.');}
 async function analyzer(method){
  if(analyzers.has(method))return analyzers.get(method);requireValue(config.methods[method],'M2 method is not configured.');
  const value={...config.methods[method],budget,computeProfile:config.computeProfile??'aggressive',resourceHints:config.resourceHints};
  for(const key of ['preparation','sift','jpeg'])if(value[key+'FactoryUrl']){value[key+'Factory']=await loadFactory(value[key+'FactoryUrl']);delete value[key+'FactoryUrl'];}
  const factory=analyzerFactories[method]??{forgeryscope:createForgeryscopeAnalyzer,trufor:createTruforSourceRegionRouter,rita:createRitaSourceRegionRouter,composite:createCompositeAnalyzer,catnet:createCatnetSourceRegionRouter,cfa:createCfaSourceRegionRouter}[method];requireValue(factory,'Unknown M2 method.');
  const api=factory(value);analyzers.set(method,api);return api;
 }
 function result(id){const r=results.get(id);requireValue(r&&!r.releaseRequested,'Released or unknown M2 result.');return r;}
 async function retireCfaResult(r){
  if(r.retired)return;if(r.retiring)return r.retiring;
  const task=(async()=>{if(!r.valueReleased){await r.value.release();r.valueReleased=true;}if(!r.imageReleased){await r.imageLease();r.imageReleased=true;}if(!r.metadataReleased){await r.metadataLease();r.metadataReleased=true;}r.retired=true;if(results.get(r.id)===r)results.delete(r.id);})();
  r.retiring=task.finally(()=>{r.retiring=null;});return r.retiring;
 }
 async function unpin(r){if(--r.references===0){if(r.cfaNativeOwner)await retireCfaResult(r);else try{await r.value.release();}finally{try{await r.imageLease();}finally{r.metadataLease();}}}}
 async function releaseResult(id){const r=results.get(id);if(!r)return;if(!r.cfaNativeOwner){results.delete(id);await unpin(r);return;}if(!r.releaseRequested){r.releaseRequested=true;r.references--;}if(r.references===0)await retireCfaResult(r);}
 function retainCfaSource({api,value,imageLease,metadataLease}){
  const owner={api,value,imageLease,metadataLease,apiAcknowledged:!api,retiring:null};cfaSourceRetirements.add(owner);return owner;
 }
 async function retireCfaSources(){
  // A cancelled late descriptor can request release before the wrapper learns its id.
  for(const r of [...results.values()])if(r.cfaNativeOwner&&r.releaseRequested&&r.references===0)await retireCfaResult(r);
  const acknowledged=new Set();
  for(const owner of [...cfaSourceRetirements]){
   if(!owner.retiring){const task=(async()=>{if(owner.value){await owner.value.release();owner.value=null;}if(!owner.apiAcknowledged){await owner.api.clearCache();owner.apiAcknowledged=true;}if(owner.imageLease){await owner.imageLease();owner.imageLease=null;}if(owner.metadataLease){await owner.metadataLease();owner.metadataLease=null;}cfaSourceRetirements.delete(owner);})();owner.retiring=task.finally(()=>{owner.retiring=null;});}
   await owner.retiring;acknowledged.add(owner.api);
  }
  return acknowledged;
 }
 async function retireCompositeExport(e){if(e.retired)return;if(e.retiring)return e.retiring;const task=(async()=>{await e.release();e.retired=true;if(exports.get(e.id)===e)exports.delete(e.id);})();e.retiring=task.finally(()=>{e.retiring=null;});return e.retiring;}
 async function retireCompositeExports(){for(const e of [...exports.values()])if(e.compositeNativeOwner&&e.releaseRequested&&e.references===0)await retireCompositeExport(e);}
 async function unpinExport(e){if(--e.references===0)await(e.compositeNativeOwner?retireCompositeExport(e):e.release());}
 async function releaseExport(id){const e=exports.get(id);if(!e)return;if(!e.compositeNativeOwner){exports.delete(id);await unpinExport(e);return;}if(!e.releaseRequested){e.releaseRequested=true;e.references--;}if(e.references===0)await retireCompositeExport(e);}
 const send=(id,value,transfer=[])=>post({id,value},transfer);
 const window=(length,offset,count,itemBytes=1)=>{requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(count)&&offset>=0&&count>0&&offset+count<=length&&count*itemBytes<=MAX_WINDOW,'Result window exceeds bounds or 4 MiB.');};
 async function handle(message){
  const {id,operation,args={}}=message;let release,finish;const completed=new Promise(resolve=>finish=resolve);operations.add(completed);
  try{
   if(operation==='initialize'){
    requireValue(!config&&!disposed,'M2 host already initialized.');config=structuredClone(args);profile=resolveComputeProfile(config.computeProfile??'aggressive',config.resourceHints);const limit=config.memoryBudgetBytes??profile.memoryBudgetBytes;requireValue(Number.isSafeInteger(limit)&&limit>0,'Invalid memory budget.');budget=new Budget(limit);send(id,{profile,memory:memory(),windowBytes:MAX_WINDOW});return;
   }
   alive(operation);
   if(operation==='analyze'||operation==='analyzeBlob'||operation==='analyzeNativeSource'){
    // A single host job avoids unbounded source clones while inner useful jobs parallelize.
    if(pending.size)throw new EngineError('BUSY','M2 host already has an active analysis.');
    const {method,params={},backend='auto'}=args;let image=args.image;
    const controller=new AbortController();pending.set(id,controller);let value,metadataLease,analysisFailure,analysisFailed=false,api,cfaNativeOwner=false,nativeSourceAdopted=false,compositeSelection;const usefulBefore=neuralUsefulExecutionSnapshot(budget);
    try{
     await retireCompositeExports();await retireCfaSources();
     if(operation==='analyzeNativeSource'){
      image=await (method==='cfa'&&args.image?.purpose==='analysis-native-contexts'?receiveCfaStrictSourceInput(args.image,{budget,signal:controller.signal}):method==='trufor'&&args.image?.purpose==='analysis-native-contexts'?receiveTruforStrictSourceInput(args.image,{budget,signal:controller.signal}):method==='rita'&&args.image?.purpose==='analysis-native-contexts'?receiveRitaStrictSourceInput(args.image,{budget,signal:controller.signal}):receiveM2SourceRegionInput(method,args.image,{budget,signal:controller.signal,params}));nativeSourceAdopted=true;release=()=>image.dispose();
     }else if(operation==='analyzeBlob'){
      requireValue(args.expectedSourceSha256===undefined||typeof args.expectedSourceSha256==='string'&&/^[a-f0-9]{64}$/i.test(args.expectedSourceSha256),'Invalid expected M2 source SHA-256.');
      requireValue(['cfa','trufor','rita','catnet','composite','forgeryscope'].includes(method)&&args.blob instanceof Blob,'Segmented original source is currently supported by CFA, TruFor, RITA, CAT-Net, Composite and Forgeryscope.');
      // The decoder accounts its entire heap while active. Keep its idle heap
      // charged afterwards: Emscripten free does not shrink WebAssembly memory.
      const signature=new Uint8Array(await args.blob.slice(0,2).arrayBuffer());
      if(signature[0]===255&&signature[1]===216){budget.retained-=codecBytes;codecBytes=0;}
      try{image=await loadOriginal(args.blob,{budget,signal:controller.signal,onProgress:event=>post({id,progress:event})});const decoded=image;release=()=>disposeSegmentedImage(decoded);}
      finally{const bytes=jpegCodec.memoryBytes();budget.retain(bytes-codecBytes);codecBytes=bytes;}
      checkAbort(controller.signal);if(args.expectedSourceSha256!==undefined&&image.sha256!==args.expectedSourceSha256.toLowerCase())throw new EngineError('SOURCE_CHANGED','The decoded M2 source does not match its loaded original owner.',{details:{expectedSha256:args.expectedSourceSha256.toLowerCase(),decodedSourceSha256:image.sha256}});
      if(method==='composite'&&args.sourceRegionDomain){
       const sourceRelease=release,domainLease=budget.reserve(8192+4*sourceRegionTransportBytes(args.sourceRegionDomain,{allowAliases:true}));release=async()=>{await sourceRelease();domainLease();};
       compositeSelection=await compositeSourceDomain(args.sourceRegionDomain,{sourceSha256:image.sha256,width:image.surface.descriptor.width,height:image.surface.descriptor.height,signal:controller.signal});
       if(compositeSelection.regional){const original=image,crop=compositeRegionalImage(original,compositeSelection,{budget}),sourceRelease=release;let cropReleased=false;image=crop;cfaNativeOwner=true;release=async()=>{if(!cropReleased){await crop.surface.dispose();cropReleased=true;}await sourceRelease();};}
      }
     }else{
      const n=image?.width*image?.height;requireValue(Number.isSafeInteger(n)&&n>0&&image.data instanceof Uint8Array&&image.data.length===3*n,'RGB8 image required.');release=budget.reserve(image.data.byteLength);
     }
     api=await analyzer(method);cfaNativeOwner=cfaNativeOwner||operation==='analyzeNativeSource'&&method==='cfa'&&image.strictCfaContexts===true;checkAbort(controller.signal);value=await api.analyze(image,params,{backend,...(['rita','trufor','forgeryscope'].includes(method)&&operation==='analyzeBlob'?{immutableSource:true}:{}),signal:controller.signal,onProgress:event=>post({id,progress:event})});checkAbort(controller.signal);
     if(compositeSelection?.regional)value=compositeRegionalResult(value,compositeSelection.domain);
     if(operation==='analyzeNativeSource')value={...value,provenance:{...value.provenance,...image.provenance}};
     const data=value.data??value,fields={},information={};
     for(const [key,v]of Object.entries(data)){
      if(typeof v?.readInto==='function')fields[key]={type:v.elementType??'Float32Array',length:v.length,byteLength:v.byteLength,storage:v.storage};
      else if(ArrayBuffer.isView(v))fields[key]={type:v.constructor.name,length:v.length,byteLength:v.byteLength};
      else if(typeof v!=='function'&&!['metrics','provenance','execution'].includes(key))information[key]=v;
     }
     if(image.segmented)information.source={dimensions:image.surface.descriptor,provenance:image.provenance,metrics:image.metrics};
     information.provenance=value.provenance;const usefulAfter=neuralUsefulExecutionSnapshot(budget);information.metrics={...value.metrics,...(value.execution?{nativeExecution:value.execution}:{}),providerExecutions:{observed:true,wasm:usefulAfter.wasm-usefulBefore.wasm,webgpu:usefulAfter.webgpu-usefulBefore.webgpu,unknown:usefulAfter.unknown-usefulBefore.unknown}};if(value.mapError)information.mapError=value.mapError;
     const json=JSON.stringify(information);metadataLease=budget.reserve(json.length*3);const metadata=new TextEncoder().encode(json),resultId=next++;
     results.set(resultId,{id:resultId,method,value,api,image,imageLease:release,metadata,metadataLease,references:1,cfaNativeOwner,compositeNativeOwner:compositeSelection?.regional===true});release=null;value=null;metadataLease=null;
     send(id,{id:resultId,method,width:data.width,height:data.height,fields,metadataBytes:metadata.byteLength,memory:memory(),...(compositeSelection?.regional?{sourceRegionDomain:compositeSelection.domain.descriptor,sourceRegionOrigin:[...compositeSelection.domain.origin]}:{})});
    }catch(error){analysisFailed=true;analysisFailure=error;if(operation==='analyzeNativeSource'&&!nativeSourceAdopted){try{args.image?.port?.postMessage({type:'close'});}catch{}try{args.image?.port?.close?.();}catch{}}if((cfaNativeOwner||method==='composite'&&args.sourceRegionDomain)&&release){retainCfaSource({api,value,imageLease:release,metadataLease});release=null;value=null;metadataLease=null;}throw error;}finally{try{await retireM2Owners([()=>value?.release(),()=>metadataLease?.()],analysisFailed?{primary:analysisFailure}:{});}finally{pending.delete(id);}}
   }else if(operation==='cancel'){pending.get(args.requestId)?.abort();send(id,true);}
   else if(operation==='readArray'){
    const r=result(args.resultId),data=r.value,values=(data.data??data)[args.field],segmented=typeof values?.readInto==='function';requireValue(ArrayBuffer.isView(values)||segmented,'Unknown numeric field.');const Type=segmented?({Float32Array,Float64Array,Uint8Array}[values.elementType??'Float32Array']):values.constructor;requireValue(Type,'Unknown numeric field type.');const itemBytes=Type.BYTES_PER_ELEMENT;window(values.length,args.offset,args.count,itemBytes);release=budget.reserve(args.count*itemBytes);r.references++;try{const copy=segmented?await values.readInto(new Type(args.count),args.offset):values.slice(args.offset,args.offset+args.count);send(id,copy,[copy.buffer]);}finally{await unpin(r);}
   }else if(operation==='readMetadata'){
    const bytes=result(args.resultId).metadata;window(bytes.length,args.offset,args.count);release=budget.reserve(args.count);const copy=bytes.slice(args.offset,args.offset+args.count);send(id,copy,[copy.buffer]);
   }else if(operation==='readDisplay'){
    const r=result(args.resultId),dimensions=r.value.data??r.value;displayGeometry(dimensions,args.tile);r.references++;let rendered,frame;
    try{
     if(r.method==='forgeryscope')throw new EngineError('UNAVAILABLE','Forgeryscope exposes masks and polygons for the existing clone viewer.');
     if(r.method==='rita')frame=dimensions.metadata?.fragmented?await r.api.sampleWindow(r.image,r.value,args.view,args.tile,{...args.options,budget}):await sampleRitaWindow(r.image,r.value,args.view,args.tile,{...args.options,budget});
     else if(r.api.renderWindow&&(dimensions.segmented||r.method==='cfa'&&r.image.surface)){
      const surface={descriptor:{width:dimensions.width,height:dimensions.height,format:'rgb8'},async readWindow(rect){const part=await r.api.renderWindow(r.image,r.value,args.view,rect,args.options);return {pixels:{...part,format:'rgb8'},release:()=>part.release?.()};}};
      frame=await sampleSurface(surface,args.tile,{budget});
     }else{
      rendered=await (['catnet','cfa','rita'].includes(r.method)?r.api.render(r.image,r.value,args.view,args.options):r.api.render(r.value,args.view,args.options));
      frame=await samplePixels({...rendered,format:'rgb8'},args.tile,{budget});
     }
     send(id,{pixels:frame.pixels,metrics:frame.metrics},[frame.pixels.data.buffer]);
    }finally{frame?.release();rendered?.release();await unpin(r);}
   }else if(operation==='render'){
    const r=result(args.resultId);r.references++;let rendered;
    try{
     if(r.method==='forgeryscope')throw new EngineError('UNAVAILABLE','Forgeryscope exposes masks and polygons for the existing clone viewer.');
     rendered=await (args.rect&&r.api.renderWindow?r.api.renderWindow(r.image,r.value,args.view,args.rect,args.options):['catnet','cfa','rita'].includes(r.method)?r.api.render(r.image,r.value,args.view,args.options):r.api.render(r.value,args.view,args.options));
     const exportId=next++;exports.set(exportId,{id:exportId,references:1,bytes:rendered.data,release:rendered.release,compositeNativeOwner:r.compositeNativeOwner});send(id,{id:exportId,type:'rgb8',width:rendered.width,height:rendered.height,origin:rendered.origin??[0,0],bytes:rendered.data.byteLength});rendered=null;
    }finally{rendered?.release();await unpin(r);}
   }else if(operation==='beginExport'){
    if(pending.size)throw new EngineError('BUSY','M2 host already has an active operation.');
    const r=result(args.resultId),controller=new AbortController();r.references++;pending.set(id,controller);let output,retained=false;
    try{
     output=await createM2NpzStream(r.method,r.value,{budget,signal:controller.signal,onProgress:event=>post({id,progress:event})});checkAbort(controller.signal);
     const stream=output,exportId=next++;let streamReleased=false,resultUnpinned=false;exports.set(exportId,{id:exportId,references:1,length:stream.length,read:stream.read,compositeNativeOwner:r.compositeNativeOwner,release(){if(!r.compositeNativeOwner){stream.release();return unpin(r);}return(async()=>{if(!streamReleased){await stream.release();streamReleased=true;}if(!resultUnpinned){resultUnpinned=true;r.references--;}if(r.references===0)await retireCfaResult(r);})();}});retained=true;
     send(id,{id:exportId,mime:stream.mime,bytes:stream.length});
    }finally{pending.delete(id);if(!retained){output?.release();await unpin(r);}}
   }else if(operation==='readExport'){
    const e=exports.get(args.exportId);requireValue(e&&!e.releaseRequested,'Released or unknown export.');window(e.length??e.bytes.length,args.offset,args.count);release=budget.reserve(args.count);e.references++;try{const copy=e.read?await e.read(args.offset,args.count):e.bytes.slice(args.offset,args.offset+args.count);send(id,copy,[copy.buffer]);}finally{await unpinExport(e);}
   }else if(operation==='releaseResult'){await releaseResult(args.resultId);send(id,true);}
   else if(operation==='releaseExport'){await releaseExport(args.exportId);send(id,true);}
   else if(operation==='clearCache'){if(pending.size)throw new EngineError('BUSY','Cannot clear M2 model caches during an active analysis or export.');await retireCompositeExports();const acknowledged=await retireCfaSources();await retireM2Owners(Array.from(analyzers.values()).filter(api=>!acknowledged.has(api)).map(api=>()=>api.clearCache()));send(id,memory());}
   else if(operation==='memory')send(id,memory());
   else if(operation==='reserveExternalMemory'){requireValue(Number.isSafeInteger(args.bytes)&&args.bytes>0,'Invalid external workspace size.');const leaseId=next++;externalMemory.set(leaseId,budget.reserve(args.bytes));send(id,{id:leaseId,bytes:args.bytes});}
   else if(operation==='releaseExternalMemory'){externalMemory.get(args.id)?.();externalMemory.delete(args.id);send(id,true);}
   else if(operation==='dispose'){
    if(args.gracefulNativeSources===true){
     closing=true;await Promise.all([...operations].filter(p=>p!==completed));
     // These records may still read their source while refusing an ACK.
     for(const key of [...exports.keys()])await releaseExport(key);
     for(const key of [...results.keys()])await releaseResult(key);
     await retireCfaSources();
     for(const [method,api]of [...analyzers]){await api.dispose();analyzers.delete(method);}
     for(const [key,free]of [...externalMemory]){await free();externalMemory.delete(key);}
     disposed=true;send(id,memory());return;
    }
    disposed=true;await retireM2Owners([...Array.from(externalMemory.values(),release=>()=>release()),()=>externalMemory.clear(),()=>{for(const controller of pending.values())controller.abort();},()=>Promise.all([...operations].filter(p=>p!==completed)),()=>retireM2Owners(Array.from(analyzers.values(),api=>()=>api.dispose())),()=>retireM2Owners(Array.from(results.keys(),key=>()=>releaseResult(key))),()=>retireM2Owners(Array.from(exports.keys(),key=>()=>releaseExport(key)))]);send(id,memory());
   }else throw new EngineError('INVALID_ARGUMENT','Unknown M2 worker operation.');
  }catch(error){try{await release?.();}catch(cleanup){if(error&&typeof error==='object'&&Object.isExtensible(error))error.details={...error.details,cleanup:serializeEngineError(cleanup)};}release=null;post({id,error:serializeEngineError(error,'M2_WORKER')});}finally{try{await release?.();}finally{operations.delete(completed);finish();}}
 }
 return {handle};
}
