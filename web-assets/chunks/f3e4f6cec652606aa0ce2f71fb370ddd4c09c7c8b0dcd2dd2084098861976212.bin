import {Budget} from './cache.js';
import {jpegCodec} from './jpeg.js';
import {loadM2SegmentedOriginal,disposeSegmentedImage} from './image-sources.js';
import {createM2NpzStream} from './m2-npz-stream.js';
import {resolveComputeProfile} from './profiles.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {createForgeryscopeAnalyzer} from './forgeryscope-analyzer.js';
import {createTruforAnalyzer} from './trufor-analyzer.js';
import {createCompositeAnalyzer} from './composite-analyzer.js';
import {createCatnetAnalyzer} from './catnet-analyzer.js';
import {createCfaAnalyzer} from './cfa-analyzer.js';
const MAX_WINDOW=4*1024**2;
/** One shared budget across M2 families. Numeric arrays stay in the host worker. */
export function createM2WorkerHost({post,loadFactory=async url=>(await import(url)).default}={}){
 let config,budget,profile,disposed=false,next=1,codecBytes=0;const analyzers=new Map(),pending=new Map(),results=new Map(),exports=new Map(),operations=new Set();
 const memory=()=>({...budget.snapshot(),residentCodecBytes:codecBytes});
 function alive(){if(disposed)throw new EngineError('DISPOSED','M2 worker host disposed.');requireValue(budget,'Initialize the M2 host first.');}
 async function analyzer(method){
  if(analyzers.has(method))return analyzers.get(method);requireValue(config.methods[method],'M2 method is not configured.');
  const value={...config.methods[method],budget,computeProfile:config.computeProfile??'aggressive',resourceHints:config.resourceHints};
  for(const key of ['preparation','sift','jpeg'])if(value[key+'FactoryUrl']){value[key+'Factory']=await loadFactory(value[key+'FactoryUrl']);delete value[key+'FactoryUrl'];}
  const factory={forgeryscope:createForgeryscopeAnalyzer,trufor:createTruforAnalyzer,composite:createCompositeAnalyzer,catnet:createCatnetAnalyzer,cfa:createCfaAnalyzer}[method];requireValue(factory,'Unknown M2 method.');
  const api=factory(value);analyzers.set(method,api);return api;
 }
 function result(id){const r=results.get(id);requireValue(r,'Released or unknown M2 result.');return r;}
 async function unpin(r){if(--r.references===0){await r.value.release();try{await r.imageLease();}finally{r.metadataLease();}}}
 async function releaseResult(id){const r=results.get(id);if(r){results.delete(id);await unpin(r);}}
 async function unpinExport(e){if(--e.references===0)await e.release();}
 async function releaseExport(id){const e=exports.get(id);if(e){exports.delete(id);await unpinExport(e);}}
 const send=(id,value,transfer=[])=>post({id,value},transfer);
 const window=(length,offset,count,itemBytes=1)=>{requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(count)&&offset>=0&&count>0&&offset+count<=length&&count*itemBytes<=MAX_WINDOW,'Result window exceeds bounds or 4 MiB.');};
 async function handle(message){
  const {id,operation,args={}}=message;let release,finish;const completed=new Promise(resolve=>finish=resolve);operations.add(completed);
  try{
   if(operation==='initialize'){
    requireValue(!config&&!disposed,'M2 host already initialized.');config=structuredClone(args);profile=resolveComputeProfile(config.computeProfile??'aggressive',config.resourceHints);const limit=config.memoryBudgetBytes??profile.memoryBudgetBytes;requireValue(Number.isSafeInteger(limit)&&limit>0,'Invalid memory budget.');budget=new Budget(limit);send(id,{profile,memory:memory(),windowBytes:MAX_WINDOW});return;
   }
   alive();
   if(operation==='analyze'||operation==='analyzeBlob'){
    // A single host job avoids unbounded source clones while inner useful jobs parallelize.
    if(pending.size)throw new EngineError('BUSY','M2 host already has an active analysis.');
    const {method,params={},backend='auto'}=args;let image=args.image;
    const controller=new AbortController();pending.set(id,controller);let value,metadataLease;
    try{
     if(operation==='analyzeBlob'){
      requireValue(['cfa','trufor','catnet','composite','forgeryscope'].includes(method)&&args.blob instanceof Blob,'Segmented original source is currently supported by CFA, TruFor, CAT-Net, Composite and Forgeryscope.');
      // The decoder accounts its entire heap while active. Keep its idle heap
      // charged afterwards: Emscripten free does not shrink WebAssembly memory.
      const signature=new Uint8Array(await args.blob.slice(0,2).arrayBuffer());
      if(signature[0]===255&&signature[1]===216){budget.retained-=codecBytes;codecBytes=0;}
      try{image=await loadM2SegmentedOriginal(args.blob,{budget,signal:controller.signal,onProgress:event=>post({id,progress:event})});release=()=>disposeSegmentedImage(image);}
      finally{const bytes=jpegCodec.memoryBytes();budget.retain(bytes-codecBytes);codecBytes=bytes;}
     }else{
      const n=image?.width*image?.height;requireValue(Number.isSafeInteger(n)&&n>0&&image.data instanceof Uint8Array&&image.data.length===3*n,'RGB8 image required.');release=budget.reserve(image.data.byteLength);
     }
     const api=await analyzer(method);checkAbort(controller.signal);value=await api.analyze(image,params,{backend,signal:controller.signal,onProgress:event=>post({id,progress:event})});checkAbort(controller.signal);
     const data=value.data??value,fields={},information={};
     for(const [key,v]of Object.entries(data)){
      if(typeof v?.readInto==='function')fields[key]={type:v.elementType??'Float32Array',length:v.length,byteLength:v.byteLength,storage:v.storage};
      else if(ArrayBuffer.isView(v))fields[key]={type:v.constructor.name,length:v.length,byteLength:v.byteLength};
      else if(typeof v!=='function'&&!['metrics','provenance','execution'].includes(key))information[key]=v;
     }
     if(image.segmented)information.source={dimensions:image.surface.descriptor,provenance:image.provenance,metrics:image.metrics};
     information.provenance=value.provenance;information.metrics=value.metrics;if(value.mapError)information.mapError=value.mapError;
     const json=JSON.stringify(information);metadataLease=budget.reserve(json.length*3);const metadata=new TextEncoder().encode(json),resultId=next++;
     results.set(resultId,{method,value,api,image,imageLease:release,metadata,metadataLease,references:1});release=null;value=null;metadataLease=null;
     send(id,{id:resultId,method,width:data.width,height:data.height,fields,metadataBytes:metadata.byteLength,memory:memory()});
    }finally{await value?.release();metadataLease?.();pending.delete(id);}
   }else if(operation==='cancel'){pending.get(args.requestId)?.abort();send(id,true);}
   else if(operation==='readArray'){
    const r=result(args.resultId),data=r.value,values=(data.data??data)[args.field],segmented=typeof values?.readInto==='function';requireValue(ArrayBuffer.isView(values)||segmented,'Unknown numeric field.');const Type=segmented?({Float32Array,Float64Array,Uint8Array}[values.elementType??'Float32Array']):values.constructor;requireValue(Type,'Unknown numeric field type.');const itemBytes=Type.BYTES_PER_ELEMENT;window(values.length,args.offset,args.count,itemBytes);release=budget.reserve(args.count*itemBytes);r.references++;try{const copy=segmented?await values.readInto(new Type(args.count),args.offset):values.slice(args.offset,args.offset+args.count);send(id,copy,[copy.buffer]);}finally{await unpin(r);}
   }else if(operation==='readMetadata'){
    const bytes=result(args.resultId).metadata;window(bytes.length,args.offset,args.count);release=budget.reserve(args.count);const copy=bytes.slice(args.offset,args.offset+args.count);send(id,copy,[copy.buffer]);
   }else if(operation==='render'){
    const r=result(args.resultId);r.references++;let rendered;
    try{
     if(r.method==='forgeryscope')throw new EngineError('UNAVAILABLE','Forgeryscope exposes masks and polygons for the existing clone viewer.');
     rendered=await (args.rect&&r.api.renderWindow?r.api.renderWindow(r.image,r.value,args.view,args.rect,args.options):['catnet','cfa'].includes(r.method)?r.api.render(r.image,r.value,args.view,args.options):r.api.render(r.value,args.view,args.options));
     const exportId=next++;exports.set(exportId,{references:1,bytes:rendered.data,release:rendered.release});send(id,{id:exportId,type:'rgb8',width:rendered.width,height:rendered.height,origin:rendered.origin??[0,0],bytes:rendered.data.byteLength});rendered=null;
    }finally{rendered?.release();await unpin(r);}
   }else if(operation==='beginExport'){
    if(pending.size)throw new EngineError('BUSY','M2 host already has an active operation.');
    const r=result(args.resultId),controller=new AbortController();r.references++;pending.set(id,controller);let output,retained=false;
    try{
     output=await createM2NpzStream(r.method,r.value,{budget,signal:controller.signal,onProgress:event=>post({id,progress:event})});checkAbort(controller.signal);
     const stream=output,exportId=next++;exports.set(exportId,{references:1,length:stream.length,read:stream.read,release(){stream.release();return unpin(r);}});retained=true;
     send(id,{id:exportId,mime:stream.mime,bytes:stream.length});
    }finally{pending.delete(id);if(!retained){output?.release();await unpin(r);}}
   }else if(operation==='readExport'){
    const e=exports.get(args.exportId);requireValue(e,'Released or unknown export.');window(e.length??e.bytes.length,args.offset,args.count);release=budget.reserve(args.count);e.references++;try{const copy=e.read?await e.read(args.offset,args.count):e.bytes.slice(args.offset,args.offset+args.count);send(id,copy,[copy.buffer]);}finally{await unpinExport(e);}
   }else if(operation==='releaseResult'){await releaseResult(args.resultId);send(id,true);}
   else if(operation==='releaseExport'){await releaseExport(args.exportId);send(id,true);}
   else if(operation==='clearCache'){for(const api of analyzers.values())await api.clearCache();send(id,memory());}
   else if(operation==='memory')send(id,memory());
   else if(operation==='dispose'){
    disposed=true;for(const controller of pending.values())controller.abort();await Promise.all([...operations].filter(p=>p!==completed));for(const api of analyzers.values())await api.dispose();for(const key of results.keys())await releaseResult(key);for(const key of exports.keys())await releaseExport(key);send(id,memory());
   }else throw new EngineError('INVALID_ARGUMENT','Unknown M2 worker operation.');
  }catch(error){try{await release?.();}catch(cleanup){error.cleanupError=String(cleanup.message??cleanup);}release=null;post({id,error:{code:error.code??'M2_WORKER',message:String(error.message??error),cleanupError:error.cleanupError}});}finally{try{await release?.();}finally{operations.delete(completed);finish();}}
 }
 return {handle};
}
