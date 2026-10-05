import "../../runtime-context.js?v=0.14.5";
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

// Keep the encoded-order store for detectors which deliberately work in that
// domain. This second lossless source-owned store only accelerates RGB windows.
export async function createOrientedSourceCache(rawSurface,{budget,temporarySession,signal,onProgress,maxWindowBytes=32*1024**2}={}){
 const descriptor=rawSurface.descriptor,{width,height}=descriptor,rowBytes=width*3;
 requireValue(descriptor.format==='rgb8'&&descriptor.orientation>=5&&descriptor.orientation<=8&&budget&&temporarySession,'Transposed RGB source and owned temporary session required.');
 const room=Math.min(maxWindowBytes,budget.limit-budget.retained-budget.active-2*1024**2-descriptor.sourceWidth*3),rows=Math.min(height,Math.floor(room/rowBytes));
 if(rows<1)throw new EngineError('MEMORY_LIMIT','No room for an oriented source-cache row.');
 const started=performance.now(),io=budget.reserve(2*1024**2);let output,cached,published=false,windows=0;
 try{
  checkAbort(signal);output=await createSegmentedBytes(width*height*3,{budget,storage:'temporary',temporarySession,signal});
  for(let y=0;y<height;y+=rows){
   const count=Math.min(rows,height-y),part=await rawSurface.readWindow({x:0,y,width,height:count},{signal});
   try{for(let offset=0;offset<part.pixels.data.length;offset+=4*1024**2){checkAbort(signal);await output.write(part.pixels.data.subarray(offset,Math.min(part.pixels.data.length,offset+4*1024**2)),y*rowBytes+offset);}}finally{part.release();}
   windows++;onProgress?.({phase:'orientation-cache',fraction:(y+count)/height,completedRows:y+count,totalRows:height});
  }
  await output.flush();checkAbort(signal);cached=createRgbSurface(output,{width,height,budget});let disposal;
  const surface={descriptor,async readWindow(rect,hooks){const part=await cached.readWindow(rect,hooks);return {...part,surfaceId:descriptor.id};},dispose(){return disposal??=(async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>rawSurface.dispose()),Promise.resolve().then(()=>cached.dispose())]);const error=results.find(result=>result.status==='rejected');if(error)throw error.reason;})();}};
  published=true;return {surface,metrics:{orientationCacheBytes:output.byteLength,orientationCacheMs:performance.now()-started,orientationCacheWindows:windows,orientationCacheWindowBytes:rows*rowBytes,originalStorePreserved:true}};
 }finally{try{if(!published)await output?.dispose();}finally{io();}}
}

export async function prepareOrientedSourceCache(surface,options){
 const d=surface.descriptor;
 if(d.orientation<5||d.storage!=='temporary'||d.width*d.height*3<64*1024**2)return {surface,metrics:{}};
 try{return await createOrientedSourceCache(surface,options);}
 catch(error){checkAbort(options.signal);if(!['MEMORY_LIMIT','STORAGE_QUOTA','STORAGE_UNAVAILABLE'].includes(error.code))throw error;return {surface,metrics:{orientationCacheBytes:0,orientationCacheFallback:{code:error.code,message:error.message}}};}
}
