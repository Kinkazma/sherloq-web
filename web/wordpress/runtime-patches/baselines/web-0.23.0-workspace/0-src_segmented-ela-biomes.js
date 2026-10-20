import {parallelGhostPlanes} from './ghost-stream-pool.js';
import {createRgbRecompression} from './jpeg-rgb-stream.js';
import {segmentedGhostCells} from './segmented-ghost-cells.js';
import {elaCellPipeline} from './ela-cell-pipeline.js';
import {energyReferenceHeader} from './energy-pipeline.js';
import {segmentedElaCellPlane} from './ela-cell-stream.js';
import {segmentedGhostMaps,segmentedGhostShape} from './segmented-ghosts.js';
import {inspectJpegBlob} from './jpeg.js';
import {checkAbort} from './errors.js';

// The scientific pipeline is shared with contiguous inputs. Only its pixel
// providers and their workspace admissions differ for segmented source storage.
export async function segmentedElaBiomes(image,p,{budget,signal,onProgress,memo,memoMany,reserveMemory,maxWorkers=1,adaptive,getGhostPlane,putGhostPlane,stageCheckpoint,onCellsReady}={}){
 let header;
 if(!p.quality&&image.source){const signature=await image.source.read(0,Math.min(2,image.source.byteLength),{signal});let jpeg;try{jpeg=signature.bytes[0]===255&&signature.bytes[1]===216;}finally{signature.release();}if(jpeg)header=await inspectJpegBlob(image.source,{signal});}
 const descriptor=image.surface.descriptor,referenceQuality=energyReferenceHeader(header,p.quality),ghostWorkspaceBytes=segmentedGhostShape(image,{low:30,high:100,step:1},{normalizedOnly:true}).admissionBytes;
 const result=await elaCellPipeline(descriptor,p,{signal,onProgress:f=>onProgress?.({phase:'ela-biomes',fraction:f})},{budget,reserveMemory,memo:memo??stageCheckpoint?.memo,memoMany:memoMany??stageCheckpoint?.memoMany,stageCheckpoint,onCellsReady,referenceQuality,ghostWorkspaceBytes,
  async cellPlanes(qualities,block,hooks){const values=[];let recompressions=0;
   if(typeof Worker!=='undefined'&&maxWorkers>1&&descriptor.width*descriptor.height>=100000&&qualities.length>1){image.rgbRecompression??=createRgbRecompression(image,budget);const found=new Map(),metrics=await parallelGhostPlanes(image,qualities,Math.min(maxWorkers,qualities.length),{budget,maxWorkers,signal,mode:'cells',block,onProgress:e=>onProgress?.({...e,phase:'ela-cell-'+e.phase}),onPlane:async(quality,value)=>{found.set(quality,value);await hooks.publish?.(quality,value);}});return {values:qualities.map(q=>found.get(q)),recompressions:metrics.recompressions,workers:metrics.workers};}
   for(const quality of qualities){checkAbort(signal);const described=await segmentedElaCellPlane(image,quality,block,{budget,signal,onProgress:e=>onProgress?.({...e,quality})});try{const {release,metrics,...fields}=described;values.push(fields);await hooks.publish?.(quality,fields);recompressions+=metrics.recompressions;}finally{described.release();}}
   return {values,recompressions,workers:1};
  },
  async ghostCells(_descriptor,params,hooks,_context,grid){
   const identity=JSON.stringify([params,grid]);await stageCheckpoint?.beginPhase(identity);
   const result=await segmentedGhostCells(image,params,grid,{budget,signal,maxWorkers,adaptive,checkpoint:stageCheckpoint?.getPhase(identity),onCheckpoint:stageCheckpoint?state=>stageCheckpoint.setPhase(identity,state):undefined,getPlane:q=>getGhostPlane?.(params.x,params.y,q),putPlane:putGhostPlane?(q,plane)=>putGhostPlane(params.x,params.y,q,plane):undefined,onProgress:e=>{onProgress?.({...e,x:params.x,y:params.y});if(e.phase==='ghost-quality')hooks.onProgress?.(e.fraction);}});
   return {...result,release:stageCheckpoint?()=>stageCheckpoint.finishPhase(identity):result.release};
  },
  async ghostMaps(_descriptor,params,hooks){return segmentedGhostMaps(image,params,{budget,signal,normalizedOnly:true,maxWorkers,adaptive,getPlane:q=>getGhostPlane?.(params.x,params.y,q),putPlane:(q,plane)=>putGhostPlane?.(params.x,params.y,q,plane),onProgress:e=>{onProgress?.({...e,x:params.x,y:params.y});if(e.phase==='ghost-quality')hooks.onProgress?.(e.fraction);}});}
 });
 result.engineMetrics.kernel='ela-native-cells-segmented';return result;
}
