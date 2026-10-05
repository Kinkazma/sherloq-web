import "../../runtime-context.js?v=0.14.5";
import {deserializeEngineError} from './errors.js';
import {serializeEngineError} from './errors.js';
import {EngineError,requireValue,checkAbort} from './errors.js';import {inspectExiftool} from './exiftool.js';import {imageCodec} from './codecs.js';import {segmentedThumbnailComparison} from './thumbnail-stream.js';import {createRgbSurface} from './rgb-surface.js';
const semantics='Exact ExifTool ThumbnailImage bytes, native Lanczos4 resize to the full original dimensions and absolute RGB difference; a comparison clue, not an authenticity verdict.';
async function decodeThumbnail(bytes,{budget,signal}={}){
 requireValue(typeof Worker!=='undefined','Thumbnail decoding requires an isolated browser worker.');const header=imageCodec.inspect(bytes),release=budget.reserve(64*1024**2+header.width*header.height*32+bytes.length*2);let worker,complete=false;
 try{checkAbort(signal);const result=await new Promise((resolve,reject)=>{let done=false;const finish=(error,value)=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);worker?.terminate();error?reject(error):resolve(value);},abort=()=>finish(new EngineError('CANCELLED','Thumbnail decoding cancelled.'));worker=new Worker(new URL('./thumbnail-decode-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>data.error?finish(deserializeEngineError(data.error)):finish(null,data);worker.onerror=()=>finish(new EngineError('CODEC_UNAVAILABLE','Thumbnail decoder failed.'));signal?.addEventListener('abort',abort,{once:true});try{worker.postMessage({bytes});}catch(error){finish(error);}});checkAbort(signal);complete=true;return {...result,release};}finally{worker?.terminate();if(!complete)release();}
}
export async function createSegmentedThumbnailAnalysis(image,{budget,signal,onProgress}={}){
 const extraction=await inspectExiftool(image.source.blob(),{mode:'thumbnail'},{budget,signal,onProgress:fraction=>onProgress?.({phase:'thumbnail-extraction',fraction})});checkAbort(signal);
 if(!extraction.data.available){const owned=8192+extraction.warnings.length*2;budget.retain(owned);let disposed=false;return {available:false,metrics:extraction.metrics,warnings:extraction.warnings,dispose(){if(!disposed){disposed=true;budget.retained-=owned;}}};}
 const bytes=extraction.data.bytes;let staging=budget.reserve(bytes.length*2+4*1024**2),decoded,comparison,retained=0;
 try{decoded=await decodeThumbnail(bytes,{budget,signal});checkAbort(signal);const ownerBytes=bytes.length+decoded.pixels.data.length+extraction.warnings.length*2+8192;budget.retain(ownerBytes);retained=ownerBytes;const pixels=decoded.pixels,decode=decoded.provenance,decodeMetrics={heapBytes:decoded.heapBytes};decoded.release();decoded=null;staging();staging=null;
  comparison=await segmentedThumbnailComparison(image,pixels,{budget,signal,onProgress});checkAbort(signal);let refs=1,closed=false,cacheReleased=false;const owned=comparison,retainedBytes=retained;comparison=null;retained=0;
  const release=async()=>{if(--refs===0){closed=true;try{await owned.dispose();}finally{budget.retained-=retainedBytes;}}};
  return {available:true,width:owned.width,height:owned.height,resized:owned.resized,difference:owned.difference,bytes,pixels,decode,warnings:extraction.warnings,metrics:{extraction:extraction.metrics,decode:decodeMetrics,...owned.metrics},retain(){if(closed)throw new EngineError('DISPOSED','Thumbnail analysis disposed.');refs++;let done=false;return async()=>{if(!done){done=true;await release();}};},async dispose(){if(!cacheReleased){cacheReleased=true;await release();}}};
 }finally{staging?.();decoded?.release();try{await comparison?.dispose();}finally{budget.retained-=retained;}}
}
export async function segmentedThumbnailResult(analysis,{budget}={}){
 if(!analysis.available)return {data:{available:false,sourceTag:'ThumbnailImage',warnings:analysis.warnings},semantics};
 const {width,height}=analysis,records=[],release=budget.reserve(analysis.bytes.length+analysis.pixels.data.length+8192);
 try{const make=store=>{const free=analysis.retain();let surface;try{surface=createRgbSurface({byteLength:store.byteLength,storage:store.storage,readInto:(out,at)=>store.readInto(out,at),dispose:free},{width,height,budget});}catch(e){free();throw e;}records.push(surface);return {surface};},primary=make(analysis.resized),difference=make(analysis.difference);
  return {...primary,rgbRecords:{difference},data:{available:true,sourceTag:'ThumbnailImage',bytes:analysis.bytes.slice(),embedded:{...analysis.pixels,data:analysis.pixels.data.slice()},decode:structuredClone(analysis.decode),warnings:analysis.warnings,arrayLayout:'segmented; primary surface is resized thumbnail; rgbSurfaces.difference is absolute RGB difference'},semantics};
 }catch(error){await Promise.allSettled(records.map(s=>s.dispose()));throw error;}finally{release();}
}
