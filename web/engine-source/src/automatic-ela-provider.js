import {createElaStageCheckpoint} from './ela-stage-checkpoint.js';
import {EngineError,requireValue,checkAbort,isResumableResourceError,serializeEngineError} from './errors.js';
import {elaCellParams} from './ela-cell-pipeline.js';
import {energyParams as validateEnergy} from './energy-pipeline.js';
import {segmentedElaBiomes} from './segmented-ela-biomes.js';
import {createSegmentedEnergyCache} from './segmented-energy.js';
import {composeAutomaticEla} from './automatic-ela.js';
import {createTemporarySession} from './temporary-storage.js';
import {segmentedEla} from './segmented-ela.js';
import {automaticBgrBytes,automaticDecodedBgrSha256} from './automatic-pixels.js';
import {segmentedEnergyQualities} from './energy-qualities-stream.js';

function payloadBytes(value){if(ArrayBuffer.isView(value))return value.byteLength;if(value===null||typeof value!=='object')return typeof value==='string'?value.length*2:8;return Object.entries(value).reduce((n,[k,v])=>n+k.length*2+32+payloadBytes(v),64);}
function resource(value,cleanup){let refs=1;function lease(){let released=false;return {value,async release(){if(released)return;released=true;if(--refs===0)await cleanup();}};}return {...lease(),retain(){requireValue(refs>0,'ELA scientific resource disposed.');refs++;return lease();}};}

/** Full-source scientific preparation, independent of automatic selection.
 * Source surface remains caller-owned; temporary result storage is independent. */
export function createAutomaticElaProvider({image,budget,cellParams={},energyParams={},maxWorkers=Math.max(1,Math.floor(Number(globalThis.navigator?.hardwareConcurrency)||1)),storage='auto',wasmBinary,onTemporarySession}={}) {
 requireValue(image?.surface?.descriptor?.format==='rgb8'&&typeof budget?.reserve==='function'&&Number.isInteger(maxWorkers)&&maxWorkers>=1&&['auto','memory','temporary'].includes(storage),'Qualified source RGB surface, shared budget and execution limits required.');
 const cells=elaCellParams(cellParams);requireValue([16,32,64,96].includes(cells.block),'Automatic ELA uses native selectable block sizes.');
 requireValue(!Object.hasOwn(energyParams,'quality')||energyParams.quality===cells.quality,'Cell and energy reference quality must agree.');requireValue(!Object.hasOwn(energyParams,'block')||energyParams.block===cells.block,'Cell and energy blocks must agree.');
 const energy=validateEnergy({...energyParams,block:cells.block,quality:cells.quality,minimum:cells.minimum}),controller=new AbortController();
 let cached,running,closed=false,disposal,session,sessionPromise,storageRefs=1,energyCache,stageCheckpoint,savedPreview,savedDecoded;const savedPlanes=new Map();const preparing=new Set();
 async function getSession(options={}){requireValue(storageRefs>0,'ELA temporary storage disposed.');if(session)return session;if(!sessionPromise)sessionPromise=createTemporarySession({...options,budget}).then(value=>{session=value;onTemporarySession?.({id:value.id,backend:value.backend,purpose:'automatic-ela-scientific'});return value;}).catch(error=>{sessionPromise=null;throw error;});return sessionPromise;}
 async function releaseStorage(){if(--storageRefs===0){try{await sessionPromise;}finally{await session?.dispose();session=null;}}}
 function pinStorage(){storageRefs++;let released=false;return async()=>{if(released)return;released=true;await releaseStorage();};}
 const source={...image,session:undefined,rgbRecompression:undefined,ensureTemporarySession:getSession};
 function open(){if(closed)throw new EngineError('DISPOSED','Automatic ELA provider disposed.');}
 async function clearCheckpoint(){const previous=stageCheckpoint,preview=savedPreview,planes=[...savedPlanes.values()];stageCheckpoint=savedPreview=savedDecoded=null;savedPlanes.clear();const settled=await Promise.allSettled([previous?.dispose(),preview?.surface.dispose(),...planes.map(p=>p.dispose())]),failure=settled.find(value=>value.status==='rejected');if(failure)throw failure.reason;}
 async function build(hooks){
  const signal=hooks.signal?AbortSignal.any([hooks.signal,controller.signal]):controller.signal,releases=[],reserveMemory=n=>{const free=budget.reserve(n);releases.push(free);return free;},unscoredPlanes=savedPlanes;let outputRelease,energyRelease,storageRelease,metadataRelease,preview;
  try{
   stageCheckpoint??=createElaStageCheckpoint(budget);const prepared=await stageCheckpoint.memo('prepared',()=>segmentedElaBiomes(source,cells,{budget,signal,onProgress:hooks.onProgress,reserveMemory,maxWorkers,stageCheckpoint,onCellsReady:async({quality})=>{savedPreview??=await segmentedEla(source,{quality,scale:50,contrast:20,linear:true,grayscale:false},{budget,signal,onProgress:hooks.onProgress});}}));stageCheckpoint.compact(prepared);checkAbort(signal);
   // Transfer stage admissions synchronously to the actual retained payload.
   // Native temporary heaps have already closed when this function returns.
   for(const release of releases)release();outputRelease=budget.reserve(16384);
   preview=savedPreview??=await segmentedEla(source,{quality:prepared.data.metadata.quality,scale:50,contrast:20,linear:true,grayscale:false},{budget,signal,onProgress:hooks.onProgress});
   const decoded=savedDecoded??=await automaticDecodedBgrSha256(source,{budget,signal,onProgress:hooks.onProgress});
   let computed,planeMetrics;if(cells.background){energyCache??=createSegmentedEnergyCache(source,budget,{maxWorkers});computed=await energyCache.analyze(energy,{signal,onProgress:hooks.onProgress});energyRelease=computed.analysis.retain();}
   else planeMetrics=await segmentedEnergyQualities(source,prepared.data.metadata.qualities.filter(q=>!unscoredPlanes.has(q)),{budget,signal,onProgress:hooks.onProgress,maxWorkers,onPlane:(quality,result)=>{unscoredPlanes.set(quality,result);}});
   checkAbort(signal);storageRelease=pinStorage();metadataRelease=budget.reserve(4096+(computed?payloadBytes(computed.analysis.value.metadata.energy)*2:0));
   const m=prepared.data.metadata,cellMetadata={...m,opencv:'4.11.0',image_pixels_sha256:decoded.sha256,linear:true,scale:50,contrast:20,...(computed?{version:5,energy:structuredClone(computed.analysis.value.metadata.energy)}:{})};
   const value={cells:{...prepared.data,key:[m.block,m.quality,m.quality_origin,m.table_deviation],ela:automaticBgrBytes(preview.surface),energy_planes:computed?.analysis.value.energy_planes??m.qualities.map(q=>unscoredPlanes.get(q).store),metadata:cellMetadata},energy:computed?.analysis.value??null,preview,decoded_bgr8_sha256:decoded.sha256,metrics:{cells:prepared.engineMetrics,preview:preview.metrics,energy:computed?.metrics??{...planeMetrics,referenceStatistics:false},decoded,preflightExecutions:0}};
   const freeOutput=outputRelease,freeEnergy=energyRelease,freeStorage=storageRelease,freeMetadata=metadataRelease,ownedPreview=preview;outputRelease=energyRelease=storageRelease=metadataRelease=preview=null;
   const ownedPlanes=[...unscoredPlanes.values()],ownedStages=stageCheckpoint;unscoredPlanes.clear();stageCheckpoint=savedPreview=savedDecoded=null;
   return resource(value,async()=>{try{const settled=await Promise.allSettled([freeEnergy?.(),ownedStages.dispose(),ownedPreview.surface.dispose(),...ownedPlanes.map(p=>p.dispose())]),failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;}finally{freeOutput();freeMetadata();await freeStorage();}});
  }catch(error){if(!isResumableResourceError(error)||signal.aborted){try{await clearCheckpoint();}catch(cleanup){error.details={...error.details,cleanup:serializeEngineError(cleanup)};}}else hooks.onProgress?.({phase:'resource-checkpoint',owner:'ela',...stageCheckpoint?.snapshot(),previewRetained:!!savedPreview,energyPlanesRetained:savedPlanes.size});throw error;}finally{for(const release of releases)release();outputRelease?.();metadataRelease?.();try{await Promise.allSettled([energyRelease?.()]);}finally{await storageRelease?.();}}
 }
 return {
  async run(job,hooks){
   open();requireValue(job.id==='ela'&&job.enabled,'Enabled complete ELA group required.');checkAbort(hooks.signal);
   if(cached){hooks.onProgress?.({phase:'automatic-ela-cache',fraction:1});checkAbort(hooks.signal);return cached.retain();}
   if(running)throw new EngineError('BUSY','Global ELA preparation already running.');
   running=build(hooks);try{cached=await running;return cached.retain();}finally{running=null;}
  },
  async prepare(value,filters,hooks){
   open();const signal=hooks.signal?AbortSignal.any([hooks.signal,controller.signal]):controller.signal;
   const work=(async()=>{const releaseStorage=pinStorage();let result;
    try{result=await composeAutomaticEla(value.cells,value.energy,{budget,regions:hooks.plan.active,excluded:hooks.plan.excluded,threshold:filters.elaThreshold,minimum:filters.elaMinimum,energyThresholds:filters.energyThresholds??value.energy?.metadata.energy.thresholds,signal,onProgress:hooks.onProgress,storage,getTemporarySession:getSession,wasmBinary});let released=false;return {value:result,async release(){if(released)return;released=true;try{await result.dispose();}finally{await releaseStorage();}}};}
    catch(error){await result?.dispose();await releaseStorage();throw error;}
   })();preparing.add(work);try{return await work;}finally{preparing.delete(work);}
  },
  async releaseCheckpoint(){requireValue(!running,'ELA preparation busy');await clearCheckpoint();},
  dispose(){if(disposal)return disposal;closed=true;controller.abort();disposal=(async()=>{try{await Promise.allSettled([running,...preparing]);const resources=await Promise.allSettled([cached?.release(),clearCheckpoint(),energyCache?.dispose(),source.rgbRecompression?.dispose()]);cached=energyCache=null;source.rgbRecompression=undefined;const failure=resources.find(r=>r.status==='rejected');if(failure)throw failure.reason;}finally{await releaseStorage();}})();return disposal;}
 };
}
