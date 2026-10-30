import {elaCellParams,elaCellPipeline} from './ela-cell-pipeline.js';
import {planElaBiomesNativeCells} from './ela-biomes-native-cell-plan.js';
import {createScopedElaOwner} from './ela-biomes-scoped-owner.js';
import {createSourceRegionJpegContextImage} from './source-region-ela.js';
import {segmentedElaCellPlane} from './ela-cell-stream.js';
import {segmentedGhostCells} from './segmented-ghost-cells.js';
import {energyReferenceHeader} from './energy-pipeline.js';
import {inspectOriginalJpeg} from './jpeg-source-evidence.js';
import {allocateTypedArray} from './allocation.js';
import {createBiomesGhostArrays} from './ela-biomes-ghost-owner.js';
import {payloadBytes} from './pixel-operations.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createMaskSurface} from './rgb-surface.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// Context JPEG/filters precede one common Native cell population. Excluded
// RGB never enters a context, a descriptor, a Ghost curve or robust statistic.
export async function sourceRegionBiomes({task,original,derived,view,domain,budget,signal,onProgress,publishTable,profile={},cpuKernel='auto'}){
 const p=elaCellParams(task.params),started=performance.now(),cooperate=createCooperator(signal),releases=[],images=new Map(),stageTimings=[],contextTimings=[];let block=p.block;
 while(Math.floor(domain.width/block)*Math.floor(domain.height/block)>16384)block+=8;
 let plan,maskStore,maskSurface,published=false,failed=false,primary;
 const reserveMemory=bytes=>{const free=budget.reserve(bytes);releases.push(free);return free;};
 const identity=domain.sourceSha256+'/'+domain.fingerprint;
 derived.biomesCache??=createScopedElaOwner(budget,identity);const owner=derived.biomesCache;
 requireValue(owner.fingerprint===identity,'Native Biomes cache belongs to another admitted Original domain.');
 try{
  // Failed old codec ACKs must settle before any new context reads RGB.
  await owner.retireCodecs();checkAbort(signal);
  plan=await planElaBiomesNativeCells(view,block,{budget,signal});
  const stage=await owner.stage(block+'/'+p.quality+'/'+cpuKernel),prefix=task.imageId+'\0source-region/biomes-v1/',key=prefix+JSON.stringify([p,task.backend??'auto']),hit=budget.get(key);
  const contextImage=c=>{let image=images.get(c.id);if(!image){image=createSourceRegionJpegContextImage(view,c,original,budget);images.set(c.id,image);owner.codecs.add(image);}return image;};
  let result=hit?.value;
  if(!result){
   const referenceQuality=energyReferenceHeader(p.quality?null:await inspectOriginalJpeg(original,{signal}),p.quality);
   result=await elaCellPipeline({width:domain.width,height:domain.height},p,{signal,onProgress:f=>onProgress?.({phase:'source-region-biomes',fraction:f})},{budget,cpuKernel,reserveMemory,stageCheckpoint:stage,memo:(key,compute)=>stage.memo(key,async()=>{const at=performance.now();try{return await compute();}finally{stageTimings.push({stage:key,milliseconds:performance.now()-at});}}),memoMany:(keys,compute)=>stage.memoMany(keys,async missing=>{const at=performance.now();try{return await compute(missing);}finally{stageTimings.push({stage:missing.join(','),milliseconds:performance.now()-at});}}),referenceQuality,
    async cellPlanes(qualities,nativeBlock,hooks){
     requireValue(nativeBlock===plan.block,'Native Biomes block changed after scientific admission.');const values=[];let recompressions=0;
     for(const quality of qualities){
      const fields={rows:plan.rows,cols:plan.cols,block:nativeBlock,content:allocateTypedArray(Float32Array,plan.rows*plan.cols*6,{label:'scoped-ela-content'}),profiles:allocateTypedArray(Float32Array,plan.rows*plan.cols*5,{label:'scoped-ela-profiles'}),background:allocateTypedArray(Float32Array,plan.rows*plan.cols*3,{label:'scoped-ela-background'}),usable:allocateTypedArray(Uint8Array,plan.rows*plan.cols,{label:'scoped-ela-usable'})};
      for(const c of plan.contexts){await cooperate();const contextStart=performance.now(),described=await segmentedElaCellPlane(contextImage(c),quality,nativeBlock,{budget,signal,gridOffset:c.gridOffset,nativeKernel:cpuKernel,onProgress:e=>onProgress?.({...e,sourceFragment:c.id})});
       try{requireValue(described.rows===c.rows&&described.cols===c.cols,'Native context descriptor grid changed.');for(const cell of c.cells){for(const[name,stride]of [['content',6],['profiles',5],['background',3]])fields[name].set(described[name].subarray(cell.local*stride,(cell.local+1)*stride),cell.index*stride);fields.usable[cell.index]=described.usable[cell.local];}recompressions+=described.metrics.recompressions??0;contextTimings.push({context:c.id,quality,width:c.width,height:c.height,milliseconds:performance.now()-contextStart,...described.metrics});}finally{await described.release();}
      }values.push(fields);
     }return {values,workers:1,recompressions};
    },
    async ghostCells(_image,params,hooks,_context,grid){
     let arrays,complete=false,ghostFailed=false,ghostPrimary,workers=0,gpuJobs=0,gpu;
     try{
      arrays=await createBiomesGhostArrays(plan.rows*plan.cols,budget,owner.temporary);
      for(const c of plan.contexts){await cooperate();const result=await segmentedGhostCells(contextImage(c),params,{rows:c.rows,cols:c.cols,block:grid.block,dx:c.gridOffset[0]+grid.dx,dy:c.gridOffset[1]+grid.dy},{budget,signal,pendingRegistry:owner.temporary,backend:cpuKernel==='reference'?'cpu':(task.backend??'auto'),maxWorkers:cpuKernel==='auto'?(profile.maxWorkers??1):1,onProgress:e=>onProgress?.({...e,sourceFragment:c.id})});
       try{for(const cell of c.cells){arrays.curves.set(result.data.curves.subarray(cell.local*71,(cell.local+1)*71),cell.index*71);arrays.valid[cell.index]=result.data.valid[cell.local];}workers=Math.max(workers,result.engineMetrics.workers??1);if(result.engineMetrics.backend==='webgpu'){gpuJobs++;gpu=result.engineMetrics.gpu;}}finally{await result.release();}
      }
      complete=true;return {data:{rows:plan.rows,cols:plan.cols,qualities:71,curves:arrays.curves,valid:arrays.valid},engineMetrics:{workers,...(gpuJobs?{backend:'webgpu',completedGpuJobs:gpuJobs,gpu}:{}),sourceContexts:plan.contexts.length},release:()=>arrays.release()};
     }catch(error){ghostFailed=true;ghostPrimary=error;throw error;}
     finally{if(!complete)await retireCompositeOwners([()=>arrays?.release()],ghostFailed?{primary:ghostPrimary}:{});}
    }
   });
   result.data.native_cell_admission=await stage.memo('native-cell-admission',()=>plan.admitted.slice());
   result.data.scientificStatus=plan.analysedCells?'native-analysis':'not-evaluated';
   result.data.metadata={...result.data.metadata,sourceRegionPolicy:plan.version,gridOrigin:[...domain.origin],nativeCellAdmission:'native_cell_admission=1 only for a complete admitted source-grid cell; unsupported zeros are never observations',selectedPixels:plan.selectedPixels,analysedPixels:plan.analysedPixels,unanalysablePixels:plan.unanalysablePixels};
   const bytes=payloadBytes(result);reserveMemory(bytes*2);result=structuredClone(result);checkAbort(signal);budget.put(key,{value:result,byteLength:bytes});
  }
  const bytes=payloadBytes(result);reserveMemory(bytes);const owned=structuredClone(result);delete owned.engineMetrics;
  // No result is published while a context JPEG still owes a source ACK.
  await owner.retireCodecs();images.clear();checkAbort(signal);
  maskStore=await createSegmentedBytes(plan.rows*plan.cols,{budget,signal,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession});await maskStore.write(owned.data.native_cell_admission,0);await maskStore.flush();maskStore.markCold();
  maskSurface=createMaskSurface(maskStore,{width:plan.cols,height:plan.rows,budget,range:[0,1],semantics:'1=complete admitted Native Biomes cell;0=not evaluated, never a zero-valued observation.'});
  const descriptor=publishTable(task.imageId,{surface:maskSurface}),bundle={maskSurfaces:{native_cell_admission:descriptor}};published=true;
  const metrics={...(hit?{kernel:'cached-admitted-native-biomes',workers:0,cellRecompressions:0,ghostPhasesComputed:0}:result.engineMetrics),cache:{result:!!hit},selectedPixels:plan.selectedPixels,analysedPixels:plan.analysedPixels,unanalysablePixels:plan.unanalysablePixels,completeAdmittedCells:plan.analysedCells,sourceContexts:plan.contexts.length,stageTimings,contextTimings,scientificStages:stage.snapshot(),totalMs:performance.now()-started};
  return {id:task.id,imageId:task.imageId,operation:'ela.biomes',status:'ok',...owned,...bundle,metrics,provenance:{params:p,backend:result.engineMetrics.backend??'cpu',sourceRegionDomain:domain.descriptor,sourceRegionPolicy:plan.version,sourceGridOrigin:[...domain.origin],excludedParticipation:'absent-before-native-context-JPEG-filters-descriptors-Ghost-and-global-robust-statistics',statisticalPopulation:'one common original-coordinate native cell grid; unadmitted cells absent before medians, peers and coherent segmentation'}};
 }catch(error){failed=true;primary=error;throw error;}
 finally{
  // Keep metadata and temporary parent funding in the derived source owner if
  // a codec's physical retirement refuses. A later request/unload retries it.
  owner.afterCodecs.add(async()=>{await plan?.release();for(const free of releases)await free();});
  await retireCompositeOwners([()=>owner.retireCodecs(),...(!published?[()=>maskSurface?.dispose()??maskStore?.dispose()]:[])],failed?{primary}:{});
 }
}
