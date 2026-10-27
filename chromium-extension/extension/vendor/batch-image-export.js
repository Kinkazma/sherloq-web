import {exportDefaults,validateExportSettings,linkedExportSize} from './media-settings.js';
import {rasterOptions} from './raster-export-client.js';
import {createWorkerEngine} from './unified-engine/src/worker-client.js';
import {createExportSink} from './export-sink.js';

export const BATCH_IMAGE_EXPORT_DEFAULTS=Object.freeze({...exportDefaults,format:'png'});
export const BATCH_IMAGE_EXPORT_FORMATS=Object.freeze(['png','webp','tiff','avif','heic']);
export const batchImagePath=path=>/\.(?:png|jpe?g|webp|avif|gif|bmp|tiff?|heic|heif|jp2|j2k|jxl|psd)$/i.test(path);
export function validateBatchImageExport(settings={}){return validateExportSettings({...BATCH_IMAGE_EXPORT_DEFAULTS,...settings});}
export function batchImageExportControls(settings={}){
 const value=validateBatchImageExport(settings),qualityKey=value.format==='webp'?'webpQuality':value.format==='heic'?'heicQuality':'quality',losslessKey=value.format+'Lossless',lossless=['png','tiff'].includes(value.format)||value[losslessKey];
 return {settings:value,formats:BATCH_IMAGE_EXPORT_FORMATS,qualityKey,losslessKey,lossless,quality:!lossless&&['webp','avif','heic'].includes(value.format),losslessToggle:['webp','avif','heic'].includes(value.format),compression:value.format==='png',pngCompressionLevels:[0,1,2,3,4,5,6,7,8,9],tiffCompression:value.format==='tiff',tiffCompressionMethods:['none','deflate'],chroma:!lossless&&['avif','heic'].includes(value.format),resize:value.resize};
}

// This client decodes and exports original surfaces only. It never loads a
// detection model or invokes run/analyze. Encoded files live on disk until the
// ZIP writer has consumed them; one decoder/encoder workspace is used at a time.
export function createBatchImageExporter(settings={}, {engineFactory=createWorkerEngine,sinkFactory=createExportSink,computeProfile='maximum',memoryBudgetBytes=4*1024**3,onProgress=()=>{}}={}){
 const selected=validateBatchImageExport(settings),cache=new WeakMap(),outputs=new Set();let engine,disposed=false,flight=Promise.resolve();
 const check=signal=>signal?.throwIfAborted();
 async function convert(blob,{name='image',role='result',signal}={}){
  if(disposed)throw Error('Batch image exporter disposed.');check(signal);if(!(blob instanceof Blob))throw Error('Image Blob required.');
  const policy=role==='source'&&selected.format==='png'&&selected.pngCompression===BATCH_IMAGE_EXPORT_DEFAULTS.pngCompression&&!selected.resize?'native-png-source':'encoded-raster',cached=cache.get(blob)??new Map(),prior=cached.get(policy);if(prior)return prior;
  const task=flight.then(async()=>{
   check(signal);engine??=engineFactory({computeProfile,memoryBudgetBytes});const id='batch-image-export-'+crypto.randomUUID();let source,descriptor,sink,output,failure;
   try{
    source=await engine.loadBlob({id,blob,name,layout:'segmented'},{signal,onProgress});const shape=source.surface;
    const options=rasterOptions(selected.resize?{...selected,...linkedExportSize(selected,shape)}:selected,source.provenance?.chroma??shape.chroma);
    check(signal);
    // Preserve an original PNG only after the native decoder has validated its
    // format and computed its encoded identity. A filename is never sufficient.
    // Explicit compression/resize and every presentation output still encode.
    if(policy==='native-png-source'&&source.provenance?.format?.toLowerCase()==='png'){
     const originalSha256=source.sha256;
     if(!/^[a-f0-9]{64}$/.test(originalSha256??'')||!Number.isSafeInteger(shape.width)||shape.width<1||!Number.isSafeInteger(shape.height)||shape.height<1)throw Error('Original PNG identity or dimensions are absent.');
     return {blob,conversion:{schema:'sherloq.batch-image-conversion/1',originalName:name,originalSha256,encodedSha256:originalSha256,format:'png',mime:'image/png',bytes:blob.size,sourceDimensions:[shape.width,shape.height],dimensions:[shape.width,shape.height],settings:{...selected},options,lossless:true,pixelsPreserved:true,scientificSourceCompatible:true,encodedSourcePreserved:true,provenance:{strategy:'native-validated-original-png',decode:source.provenance,encodingChanged:false},meaning:'Default PNG source export preserves the exact original encoded bytes and metadata. PNG compression is not reapplied; original scientific identity remains reusable.'}};
    }
    descriptor=await engine.exportSurface({...options,surfaceId:shape.id,revision:shape.revision,storage:'temporary'},{signal,onProgress});
    sink=await sinkFactory({memoryBudgetBytes:0,signal,mime:descriptor.mime});
    for(let offset=0;offset<descriptor.byteLength;offset+=1024**2){check(signal);const page=await engine.readExport({exportId:descriptor.id,revision:descriptor.revision,offset,length:Math.min(1024**2,descriptor.byteLength-offset)},{signal});if(!(page.bytes instanceof Uint8Array)||page.bytes.length!==Math.min(1024**2,descriptor.byteLength-offset))throw Error('Incomplete raster export page.');await sink.write(page.bytes);}
    output=await sink.finish();outputs.add(output);check(signal);
    const encodedSha256=descriptor.sha256,originalSha256=source.sha256;
    if(!/^[a-f0-9]{64}$/.test(encodedSha256??'')||!/^[a-f0-9]{64}$/.test(originalSha256??''))throw Error('Raster export identity is absent.');
    return {blob:output.blob,conversion:{schema:'sherloq.batch-image-conversion/1',originalName:name,originalSha256,encodedSha256,format:selected.format,mime:descriptor.mime,bytes:output.blob.size,sourceDimensions:[shape.width,shape.height],dimensions:[descriptor.width,descriptor.height],settings:{...selected},options,lossless:options.lossless===true,pixelsPreserved:options.lossless===true&&shape.width===descriptor.width&&shape.height===descriptor.height,scientificSourceCompatible:originalSha256===encodedSha256,provenance:descriptor.provenance??null,meaning:'Presentation export of native SDR RGB pixels. Original scientific arrays and their source identities are unchanged.'}};
   }catch(error){failure=error;if(output)outputs.delete(output);try{if(output)await output.cleanup?.();else await sink?.abort();}catch(cleanup){error.cleanupError??=cleanup;}throw error;}
   finally{let cleanupFailure;const clean=async action=>{try{await action();}catch(error){if(failure)failure.cleanupError??=error;else cleanupFailure??=error;}};if(descriptor)await clean(()=>engine.releaseExport(descriptor.id));if(source)await clean(()=>engine.unload(id));if(cleanupFailure)throw cleanupFailure;}
  });flight=task.catch(()=>{});cached.set(policy,task);cache.set(blob,cached);try{return await task;}catch(error){cached.delete(policy);if(!cached.size)cache.delete(blob);throw error;}
 }
 return {settings:selected,convert,async dispose(){if(disposed)return;disposed=true;await flight;const results=await Promise.allSettled([...outputs].map(output=>output.cleanup?.()));outputs.clear();try{await engine?.dispose();}finally{const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;}}};
}
