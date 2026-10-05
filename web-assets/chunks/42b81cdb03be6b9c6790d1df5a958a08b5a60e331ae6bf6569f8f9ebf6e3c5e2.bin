import {EngineError,requireValue,checkAbort} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {pixelStats} from './pixel-stats.js';

// This adapter is only for the pixel-independent channel ranking operation.
// Neighborhoods, global normalizations and FFTs require different adapters.
export async function segmentedPixelStats(image,params,{budget,signal,onProgress}={}){
 const input=image.store;let output,surface,blocks=0,semantics,planning;
 try{
  const possibleIo=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
  planning=budget.reserve(Math.min(input.byteLength*2,8*1024**2)+possibleIo);
  output=await createSegmentedBytes(input.byteLength,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  planning();planning=null;
  const ioBytes=image.session?.backend==='indexeddb'?2*1024**2:0,size=Math.min(Math.max(3,input.chunkBytes),Math.floor((budget.limit-budget.retained-budget.active-ioBytes)/2)),blockBytes=size-size%3;
  if(blockBytes<3)throw new EngineError('MEMORY_LIMIT','Channel-rank staging does not fit the shared budget.');
  await input.visit(async(bytes,offset)=>{
   const release=budget.reserve(bytes.length);
   try{
    const result=await pixelStats({width:bytes.length/3,height:1,format:'rgb8',data:bytes},params,{signal});
    checkAbort(signal);await output.write(result.pixels.data,offset);semantics=result.semantics;blocks++;
    onProgress?.((offset+bytes.length)/input.byteLength);
   }finally{release();}
  },{signal,blockBytes});
  await output.flush();checkAbort(signal);
  const descriptor=image.surface.descriptor;
  surface=createRgbSurface(output,{width:descriptor.sourceWidth,height:descriptor.sourceHeight,orientation:descriptor.orientation,budget});
  return {surface,semantics,metrics:{blocks,storage:output.storage,retainedResultBytes:input.byteLength}};
 }catch(error){await output?.dispose();if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Channel-rank allocation failed after shared admission.');throw error;}finally{planning?.();}
}

// Live returned results are owned, not evictable cache entries. They survive
// later tasks until explicitly released or until their source is unloaded.
export function createResultSurfaces(surfaces){
 const results=new Map();
 async function remove(id){
  const record=results.get(id);if(!record)throw new EngineError('NOT_FOUND','Result surface no longer exists.');
  results.delete(id);surfaces.delete(id);await record.surface.dispose();
 }
 return {
  publish(imageId,record){const id=record.surface.descriptor.id;requireValue(!surfaces.has(id),'Duplicate result surface.');results.set(id,{imageId,...record});surfaces.set(id,{imageId,record});return record.surface.descriptor;},
  publishBundle(imageId,record){
   const groups=[['maskSurfaces',record.maskRecords],['flagSurfaces',record.flagRecords],['tables',record.tableRecords]],entries=[record,...groups.flatMap(([,values])=>Object.values(values??{}))],ids=entries.map(value=>value.surface.descriptor.id);
   requireValue(new Set(ids).size===ids.length&&ids.every(id=>!surfaces.has(id)),'Duplicate result surface.');
   const bundle={surface:this.publish(imageId,record)};
   for(const [name,values] of groups)if(Object.keys(values??{}).length)bundle[name]=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,this.publish(imageId,value)]));
   return bundle;
  },
  async release(id){if(!results.has(id)&&surfaces.has(id))throw new EngineError('INVALID_INPUT','Use unload to release an original source surface.');await remove(id);},
  hasFor(imageId){return [...results.values()].some(record=>record.imageId===imageId);},
  async clear(imageId){let first;for(const [id,record] of results)if(imageId===undefined||record.imageId===imageId)try{await remove(id);}catch(error){first??=error;}if(first)throw first;}
 };
}
