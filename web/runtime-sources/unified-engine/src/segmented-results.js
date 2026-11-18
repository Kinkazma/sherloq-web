import "../../runtime-context.js?v=0.33.2";
import {EngineError,requireValue,checkAbort,normalizeResourceError} from './errors.js';
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
 }catch(error){await output?.dispose();throw normalizeResourceError(error);}finally{planning?.();}
}

// Live returned results are owned, not evictable cache entries. They survive
// later tasks until explicitly released or until their source is unloaded.
export function createResultSurfaces(surfaces){
 const results=new Map(),retiring=new Map();
 function remove(id){
  const record=results.get(id);if(!record)throw new EngineError('NOT_FOUND','Result surface no longer exists.',{details:{stage:'lookup',resource:'result-surface',surfaceId:id}});
  const pending=retiring.get(id);if(pending)return pending;
  // Keep the only owner addressable until its asynchronous cleanup succeeds.
  // A rejected ACK can then be retried, and concurrent callers retire it once.
  const task=Promise.resolve().then(()=>record.surface.dispose()).then(ack=>{requireValue(ack!==false&&ack!==0,'Result surface retirement was not acknowledged.');
   if(results.get(id)===record){results.delete(id);surfaces.delete(id);}
  });
  retiring.set(id,task);
  void task.finally(()=>{if(retiring.get(id)===task)retiring.delete(id);}).catch(()=>{});
  return task;
 }
 return {
  publish(imageId,record){const id=record.surface.descriptor.id;requireValue(!surfaces.has(id),'Duplicate result surface.');results.set(id,{imageId,...record});surfaces.set(id,{imageId,record});return record.surface.descriptor;},
  publishBundle(imageId,record){
   const groups=[['rgbSurfaces',record.rgbRecords],['planeSurfaces',record.planeRecords],['maskSurfaces',record.maskRecords],['flagSurfaces',record.flagRecords],['tables',record.tableRecords]],entries=[record,...groups.flatMap(([,values])=>Object.values(values??{}))],ids=entries.map(value=>value.surface.descriptor.id);
   requireValue(new Set(ids).size===ids.length&&ids.every(id=>!surfaces.has(id)),'Duplicate result surface.');
   const bundle={surface:this.publish(imageId,record)};
   for(const [name,values] of groups)if(Object.keys(values??{}).length)bundle[name]=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,this.publish(imageId,value)]));
   return bundle;
  },
  attachOriginalSource({originalImageId,originalSurfaceId,derivedImageId,derivedSurfaceId},bundle){
   const original=surfaces.get(originalSurfaceId),derived=surfaces.get(derivedSurfaceId);
   requireValue(original?.imageId===originalImageId&&derived?.imageId===derivedImageId&&originalImageId!==derivedImageId&&derived.record?.originalSource===original.record,'Regional result requires its verified derived Original source.');
   const descriptors=[bundle?.surface,...['rgbSurfaces','planeSurfaces','maskSurfaces','flagSurfaces','tables'].flatMap(name=>Object.values(bundle?.[name]??{}))].filter(Boolean),unique=new Map(descriptors.map(value=>[value.id,value]));
   requireValue(unique.size>0,'Regional result has no published resources.');
   const rows=[];
   for(const [id,descriptor]of unique){
    const result=results.get(id),live=surfaces.get(id);
    requireValue(result&&live&&live.record?.surface?.descriptor?.revision===descriptor.revision&&result.surface.descriptor.revision===descriptor.revision&&!retiring.has(id),'Regional result resource is not live.');
    requireValue(result.imageId===derivedImageId&&live.imageId===derivedImageId||result.imageId===originalImageId&&live.imageId===originalImageId&&result.pairedSourceIds?.includes(derivedImageId),'Regional result belongs to another Original or derived source.');
    rows.push({result,live});
   }
   // All resources and the literal source relationship were verified before
   // changing a single authority. This never replaces pixels or weakens the
   // final-lifetime validator; the derived source stays an explicit dependency.
   for(const {result,live}of rows){const paired=[...new Set([...(result.pairedSourceIds??[]),derivedImageId])];result.imageId=originalImageId;result.pairedSourceIds=paired;live.imageId=originalImageId;live.record={...live.record,pairedSourceIds:paired};}
  },
  async release(id){if(!results.has(id)&&surfaces.has(id))throw new EngineError('INVALID_INPUT','Use unload to release an original source surface.');await remove(id);},
  hasAny(){return results.size>0;},
  hasFor(imageId){return [...results.values()].some(record=>record.imageId===imageId||record.pairedSourceIds?.includes(imageId));},
  async clear(imageId){let first;for(const [id,record] of results)if(imageId===undefined||record.imageId===imageId||record.pairedSourceIds?.includes(imageId))try{await remove(id);}catch(error){first??=error;}if(first)throw first;}
 };
}
