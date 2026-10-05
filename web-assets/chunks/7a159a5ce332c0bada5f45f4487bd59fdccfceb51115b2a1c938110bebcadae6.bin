import {elaCellPipeline} from './ela-cell-pipeline.js';
import {energyReferenceHeader} from './energy-pipeline.js';
import {segmentedElaCellPlane} from './ela-cell-stream.js';
import {segmentedGhostMaps,segmentedGhostShape} from './segmented-ghosts.js';
import {inspectJpegBlob} from './jpeg.js';
import {checkAbort} from './errors.js';

// The scientific pipeline is shared with contiguous inputs. Only its pixel
// providers and their workspace admissions differ for segmented source storage.
export async function segmentedElaBiomes(image,p,{budget,signal,onProgress,memo,memoMany,reserveMemory,maxWorkers=1,adaptive,getGhostPlane,putGhostPlane}={}){
 let header;
 if(!p.quality&&image.source){const signature=await image.source.read(0,Math.min(2,image.source.byteLength),{signal});let jpeg;try{jpeg=signature.bytes[0]===255&&signature.bytes[1]===216;}finally{signature.release();}if(jpeg)header=await inspectJpegBlob(image.source,{signal});}
 const descriptor=image.surface.descriptor,referenceQuality=energyReferenceHeader(header,p.quality),ghostWorkspaceBytes=segmentedGhostShape(image,{low:30,high:100,step:1},{normalizedOnly:true}).admissionBytes;
 const result=await elaCellPipeline(descriptor,p,{signal,onProgress:f=>onProgress?.({phase:'ela-biomes',fraction:f})},{reserveMemory,memo,memoMany,referenceQuality,ghostWorkspaceBytes,
  async cellPlanes(qualities,block){const values=[];let recompressions=0;
   for(const quality of qualities){checkAbort(signal);const described=await segmentedElaCellPlane(image,quality,block,{budget,signal,onProgress:e=>onProgress?.({...e,quality})});try{const {release,metrics,...fields}=described;values.push(fields);recompressions+=metrics.recompressions;}finally{described.release();}}
   return {values,recompressions,workers:1};
  },
  async ghostMaps(_descriptor,params,hooks){return segmentedGhostMaps(image,params,{budget,signal,normalizedOnly:true,maxWorkers,adaptive,getPlane:q=>getGhostPlane?.(params.x,params.y,q),putPlane:(q,plane)=>putGhostPlane?.(params.x,params.y,q,plane),onProgress:e=>{onProgress?.({...e,x:params.x,y:params.y});if(e.phase==='ghost-quality')hooks.onProgress?.(e.fraction);}});}
 });
 result.engineMetrics.kernel='ela-native-cells-segmented';return result;
}
