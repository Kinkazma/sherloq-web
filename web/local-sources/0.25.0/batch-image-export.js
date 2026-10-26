import {exportDefaults,validateExportSettings,linkedExportSize} from './media-settings.js?v=0.25.0';
import {rasterOptions} from './raster-export-client.js?v=0.25.0';
import {createWorkerEngine} from './unified-engine/src/worker-client.js';
import {createExportSink} from './export-sink.js?v=0.25.0';
import {createExportSinkScope} from './export-sink-owner.js?v=0.25.0';
import {createIndexedDbExportWriter} from './indexeddb-export-writer.js?v=0.25.0';

export const BATCH_IMAGE_EXPORT_DEFAULTS=Object.freeze({...exportDefaults,format:'png'});
export const BATCH_IMAGE_EXPORT_FORMATS=Object.freeze(['png','webp','tiff','avif','heic']);
export const batchImagePath=path=>/\.(?:png|jpe?g|webp|avif|gif|bmp|tiff?|heic|heif|jp2|j2k|jxl|psd)$/i.test(path);
export function validateBatchImageExport(settings={}){return validateExportSettings({...BATCH_IMAGE_EXPORT_DEFAULTS,...settings});}
export function batchImageExportControls(settings={}){
 const value=validateBatchImageExport(settings),qualityKey=value.format==='webp'?'webpQuality':value.format==='heic'?'heicQuality':'quality',losslessKey=value.format+'Lossless',lossless=['png','tiff'].includes(value.format)||value[losslessKey];
 return {settings:value,formats:BATCH_IMAGE_EXPORT_FORMATS,qualityKey,losslessKey,lossless,quality:!lossless&&['webp','avif','heic'].includes(value.format),losslessToggle:['webp','avif','heic'].includes(value.format),compression:value.format==='png',pngCompressionLevels:[0,1,2,3,4,5,6,7,8,9],tiffCompression:value.format==='tiff',tiffCompressionMethods:['none','deflate'],chroma:!lossless&&['avif','heic'].includes(value.format),resize:value.resize};
}

// This client decodes and exports original surfaces only. It never loads a
// detection model or invokes run/analyze. Encoded files use admitted temporary
// storage until the ZIP writer consumes them; IDB is browser-managed and is
// not guaranteed disk. One decoder/encoder workspace is used at a time.
export function createBatchImageExporter(settings={}, {engineFactory=createWorkerEngine,sinkFactory,computeProfile='maximum',memoryBudgetBytes=4*1024**3,onProgress=()=>{}}={}){
 const selected=validateBatchImageExport(settings),cache=new WeakMap(),outputs=new Set(),exportOwners=createExportSinkScope();let engine,disposed=false,flight=Promise.resolve(),disposal,engineClosing,externalLeases=0,retirementReady=false;const admissions=new Set(),memoryRetirements=new Set();let engineLane=Promise.resolve();
 // Blob reservations and their release use the same single-command worker lane
 // as archive reads; retiring several outputs must never race worker calls.
 const engineCall=action=>{const task=engineLane.then(action);engineLane=task.catch(()=>{});return task;};
 const closeEngine=()=>engineClosing??=engineCall(()=>engine?.dispose()).catch(error=>{engineClosing=null;throw error;});
 // The archive may transfer a final owned Blob reservation to its download.
 // Keep this broker alive until that last lease is explicitly released.
 function reserveMemory(bytes){
  if(disposed)return Promise.reject(Error('Batch image exporter disposed.'));
  engine??=engineFactory({computeProfile,memoryBudgetBytes});const owner=engine;
  const pending=(async()=>{const lease=await engineCall(()=>owner.reserveExternalMemory({bytes}));externalLeases++;let retired,released=false;
   const free=()=>retired??=(async()=>{if(!released){await engineCall(()=>owner.releaseExternalMemory(lease.id));released=true;externalLeases--;}memoryRetirements.delete(free);if(retirementReady&&externalLeases===0)await closeEngine();})().catch(error=>{retired=null;throw error;});
   if(disposed){const error=Error('Batch image exporter disposed.');memoryRetirements.add(free);try{await free();}catch(cleanup){error.cleanupError=cleanup;}throw error;}
   return free;
  })();admissions.add(pending);pending.then(()=>admissions.delete(pending),()=>admissions.delete(pending));return pending;
 }
 const check=signal=>signal?.throwIfAborted();
 async function convert(blob,{name='image',role='result',signal}={}){
  if(disposed)throw Error('Batch image exporter disposed.');check(signal);if(!(blob instanceof Blob))throw Error('Image Blob required.');
  const policy=role==='source'&&selected.format==='png'&&selected.pngCompression===BATCH_IMAGE_EXPORT_DEFAULTS.pngCompression&&!selected.resize?'native-png-source':'encoded-raster',cached=cache.get(blob)??new Map(),prior=cached.get(policy);if(prior)return prior;
  const task=flight.then(async()=>{
   await exportOwners.retryFailed();const owner=exportOwners.begin();const id='batch-image-export-'+crypto.randomUUID();let source,descriptor,sink,output;
   owner.after(async()=>{if(descriptor){await engineCall(()=>engine.releaseExport(descriptor.id));descriptor=null;}});owner.after(async()=>{if(source){await engineCall(()=>engine.unload(id));source=null;}});owner.after(()=>outputs.delete(output));
   const copy=async(descriptor,mime)=>{
    sink=await owner.open(sinkFactory??createExportSink,{memoryBudgetBytes:0,signal,mime});let freeIO;
    if(!sinkFactory&&sink.storage==='memory'){await owner.retireChild(sink);sink=await createIndexedDbExportWriter({signal,mime,reserve:reserveMemory});owner.adopt(sink);}
    else{freeIO=await reserveMemory(2*1024**2);owner.after(freeIO);}
    for(let offset=0;offset<descriptor.byteLength;offset+=1024**2){check(signal);const page=await engineCall(()=>engine.readExport({exportId:descriptor.id,revision:descriptor.revision,offset,length:Math.min(1024**2,descriptor.byteLength-offset)},{signal}));if(!(page.bytes instanceof Uint8Array)||page.bytes.length!==Math.min(1024**2,descriptor.byteLength-offset))throw Error('Incomplete raster export page.');await sink.write(page.bytes);}
    output=owner.borrow(owner.finish(sink,await sink.finish()));outputs.add(output);check(signal);if(output.blob.size!==descriptor.byteLength)throw Error('Owned export byte count differs.');return output;
   };
   try{
    check(signal);engine??=engineFactory({computeProfile,memoryBudgetBytes});source=await engineCall(()=>engine.loadBlob({id,blob,name,layout:'segmented'},{signal,onProgress}));const shape=source.surface;
    const options=rasterOptions(selected.resize?{...selected,...linkedExportSize(selected,shape)}:selected,source.provenance?.chroma??shape.chroma);
    check(signal);
    // Preserve an original PNG only after the native decoder has validated its
    // format and computed its encoded identity. A filename is never sufficient.
    // Explicit compression/resize and every presentation output still encode.
    if(policy==='native-png-source'&&source.provenance?.format?.toLowerCase()==='png'){
     const originalSha256=source.sha256;
     if(!/^[a-f0-9]{64}$/.test(originalSha256??'')||!Number.isSafeInteger(shape.width)||shape.width<1||!Number.isSafeInteger(shape.height)||shape.height<1)throw Error('Original PNG identity or dimensions are absent.');
     const derived=await engineCall(()=>engine.deriveOriginal({imageId:id,patches:[],output:'archive',storage:'temporary'},{signal,onProgress}));descriptor=derived.archive;
     if(descriptor.sha256!==originalSha256||descriptor.byteLength!==blob.size)throw Object.assign(Error('The original PNG bytes no longer match their loaded owner.'),{code:'SOURCE_CHANGED'});
     await copy(descriptor,'image/png');
     return {blob:output.blob,conversion:{schema:'sherloq.batch-image-conversion/1',originalName:name,originalSha256,encodedSha256:originalSha256,format:'png',mime:'image/png',bytes:blob.size,sourceDimensions:[shape.width,shape.height],dimensions:[shape.width,shape.height],settings:{...selected},options,lossless:true,pixelsPreserved:true,scientificSourceCompatible:true,encodedSourcePreserved:true,provenance:{strategy:'native-validated-original-png',byteOwnership:'verified-owned-original-archive',decode:source.provenance,encodingChanged:false},meaning:'Default PNG source export preserves the exact original encoded bytes and metadata. PNG compression is not reapplied; original scientific identity remains reusable.'}};
    }
    descriptor=await engineCall(()=>engine.exportSurface({...options,surfaceId:shape.id,revision:shape.revision,storage:'temporary'},{signal,onProgress}));
    await copy(descriptor,descriptor.mime);
    const encodedSha256=descriptor.sha256,originalSha256=source.sha256;
    if(!/^[a-f0-9]{64}$/.test(encodedSha256??'')||!/^[a-f0-9]{64}$/.test(originalSha256??''))throw Error('Raster export identity is absent.');
    return {blob:output.blob,conversion:{schema:'sherloq.batch-image-conversion/1',originalName:name,originalSha256,encodedSha256,format:selected.format,mime:descriptor.mime,bytes:output.blob.size,sourceDimensions:[shape.width,shape.height],dimensions:[descriptor.width,descriptor.height],settings:{...selected},options,lossless:options.lossless===true,pixelsPreserved:options.lossless===true&&shape.width===descriptor.width&&shape.height===descriptor.height,scientificSourceCompatible:originalSha256===encodedSha256,provenance:descriptor.provenance??null,meaning:'Presentation export of native SDR RGB pixels. Original scientific arrays and their source identities are unchanged.'}};
   }catch(error){return owner.fail(error);}

  });flight=task.catch(()=>{});cached.set(policy,task);cache.set(blob,cached);try{return await task;}catch(error){cached.delete(policy);if(!cached.size)cache.delete(blob);throw error;}
 }
 return {settings:selected,convert,reserveMemory,get reservationSnapshot(){return{externalLeases,disposed,engineDisposalStarted:!!engineClosing};},dispose(){if(disposal)return disposal;disposed=true;return disposal=(async()=>{await flight;await Promise.allSettled([...admissions]);for(const output of [...outputs]){await output.cleanup?.();outputs.delete(output);}await exportOwners.dispose();for(const free of [...memoryRetirements])await free();retirementReady=true;if(externalLeases===0)await closeEngine();})().catch(error=>{disposal=null;throw error;});}};
}
