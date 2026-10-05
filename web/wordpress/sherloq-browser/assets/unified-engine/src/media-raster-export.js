import "../../runtime-context.js?v=0.14.5";
import {mediaCodecJob} from './media-codec-client.js';
import {createSegmentedBytes} from './segmented-bytes.js';import {createTemporarySession} from './temporary-storage.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
import {checkAbort,requireValue} from './errors.js';
import {createResizedSdrSurface,exportDimensions} from './adaptive-sdr-resize.js';
const MiB=1024**2;
export function mediaExportPlan(shape,request={}){
 const {format,adaptive=false,maximumMegapixels=24}=request;
 requireValue(['avif','webp','heic','tiff'].includes(format),'Invalid media export format.');
 requireValue(['rgb8','mask8','rgb-flags8'].includes(shape.format),'Media export requires an RGB or mask surface.');
 requireValue(Number.isInteger(maximumMegapixels)&&maximumMegapixels>=1&&maximumMegapixels<=1000,'Invalid reduction limit.');
 requireValue(!adaptive||format==='avif'&&shape.format==='rgb8','Automatic reduction applies to RGB AVIF exports.');
 const dimensions=exportDimensions(shape,request);
 requireValue([dimensions.width,dimensions.height].every(n=>Number.isInteger(n)&&n>0&&n<=(format==='webp'?16383:65500)),'Image dimensions exceed this format’s limit.');
 const n=dimensions.width*dimensions.height,cellPixels=Math.min(2048,dimensions.width)*Math.min(2048,dimensions.height),workingBytes=Math.ceil((160*MiB+(format==='heic'?n*4+cellPixels*36:format==='avif'?n*6+cellPixels*64:n*20))/(64*MiB))*64*MiB;
 requireValue(Number.isSafeInteger(workingBytes),'Media workspace is too large.');
 requireValue(format!=='avif'||n<=268435456,'AVIF exceeds the encoder pixel limit; enable export-only reduction.');return{...dimensions,workingBytes};
}
export async function encodeMediaRaster(surface,request,{budget,signal,onProgress,onTemporarySession,imageId,originalSha256}={}){
 const plan=mediaExportPlan(surface.descriptor,request),format=request.format,quality=request.quality??90,chroma=request.chroma??'422';
 requireValue(request.storage===undefined||['auto','temporary'].includes(request.storage),'Invalid raster export storage.');
 requireValue(request.maxBytes===undefined||Number.isSafeInteger(request.maxBytes)&&request.maxBytes>0,'Positive raster output limit required.');
 requireValue(Number.isInteger(quality)&&quality>=1&&quality<=100&&['420','422','444'].includes(chroma),'Invalid compression settings.');
 requireValue(Number.isInteger(request.compression??6)&&(request.compression??6)>=0&&(request.compression??6)<=9,'Invalid lossless compression level.');
 const release=budget.reserve(plan.workingBytes);let session,store,written=0,encoded,success=false,source=surface;
 try{
  const hash=await createSHA256();
  if(plan.width!==surface.descriptor.width||plan.height!==surface.descriptor.height)source=createResizedSdrSurface(surface,plan,budget,request.resize?.algorithm??(request.adaptive?'area':'auto'));
  const metadata=await mediaCodecJob('encode',{...plan,nativeBytes:plan.workingBytes,format,quality,chroma,compression:request.compression??6,lossless:request.lossless===true,threads:Math.max(1,Math.min(64,globalThis.navigator?.hardwareConcurrency??1))},{signal,onProgress,onRequest:async(action,value)=>{
   if(action==='source-band'){
    const part=await source.readWindow({x:value.x??0,y:value.y,width:value.width,height:value.rows},{signal});try{const pixels=part.pixels;
     if(pixels.format==='rgb8')return{bytes:pixels.data.slice()};
     const bytes=new Uint8Array(value.width*value.rows*3);for(let i=0;i<bytes.length;i++)bytes[i]=pixels.data[pixels.format==='mask8'?Math.floor(i/3):i]?255:0;return{bytes};
    }finally{part.release();}
   }
   if(action==='output-start'){
    requireValue(Number.isSafeInteger(value.byteLength)&&value.byteLength>0,'Invalid encoded output size.');
    requireValue(request.maxBytes===undefined||value.byteLength<=request.maxBytes,'Encoded raster exceeds the requested output limit.');encoded=value;
    const fits=request.storage!=='temporary'&&value.byteLength+4*MiB<=budget.limit-budget.total();
    if(!fits){session=await createTemporarySession({budget,signal,id:request.temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});}
    store=await createSegmentedBytes(value.byteLength,{budget,storage:fits?'memory':'temporary',temporarySession:session,signal});return{};
   }
   requireValue(action==='output-chunk'&&store&&value.offset===written,'Invalid encoded output order.');hash.update(value.bytes);await store.write(value.bytes,written);written+=value.bytes.length;return{};
  }});
  requireValue(written===encoded.byteLength,'Incomplete encoded raster.');await store.flush();checkAbort(signal);
  const descriptor={id:crypto.randomUUID(),revision:1,mime:metadata.mime,format,width:plan.width,height:plan.height,byteLength:written,sha256:hash.digest('hex'),imageId,sourceSurfaceId:surface.descriptor.id,sourceSurfaceRevision:surface.descriptor.revision,sourceFormat:surface.descriptor.format,provenance:{originalSha256,...metadata,coordinates:source===surface?'full-resolution':'reduced-export-only',...(source!==surface?{reduction:source.resampling+' in linear sRGB',sourceSize:[surface.descriptor.width,surface.descriptor.height]}:{}),metadata:'No original EXIF, alpha, ICC or authenticity assertions are copied.'},metrics:{storage:store.storage,temporaryBackend:session?.backend??null,workingReservationBytes:plan.workingBytes,codecHeapCapacityBytes:metadata.heapBytes??null,memory:budget.snapshot()}};
  success=true;return{descriptor,store,session};
 }finally{try{if(!success){await store?.dispose();await session?.dispose();}}finally{release();}}
}
