import "../../runtime-context.js?v=0.31.0";
import {energyParams} from './energy-pipeline.js';
import {segmentedResidualEnergyPlane,energyStreamBytes} from './energy-stream.js';
import {detectSegmentedPanels} from './auto-zones-stream.js';
import {prepareSegmentedEnergy} from './energy-prepare-stream.js';
import {estimateSegmentedEnergy,segmentedEnergyDeviations} from './energy-auto-stream.js';
import {segmentSegmentedEnergy} from './energy-segment-stream.js';
import {energyProfile} from './energy-auto.js';
import {energyColor} from './energy-segment.js';
import {energyLogData} from './energy-log-data.js';
import {referenceLogFunction} from './energy-log-reference.js';
import {requireValue,checkAbort,EngineError} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// One complete admitted native context. The caller keeps the neutral synthesis
// surface alive until this promise settles; Original supplies every panel and
// validity decision. Irregular scopes must call this per admitted context.
export async function computeElaSynthesisEnergy(image,synthesisSurface,input={}, {
 budget,signal,onProgress,scoreGpu,scoreBackend='auto',synthesisKey,
 panelDetector=detectSegmentedPanels,log:providedLog,stages,preparationContextOwner,preparationContextKey,
}={}){
 const p=energyParams(input),{width,height,format}=image?.surface?.descriptor??{},residual=synthesisSurface?.descriptor;
 requireValue(format==='rgb8'&&residual?.format==='rgb8'&&residual.width===width&&residual.height===height&&typeof synthesisSurface.readWindow==='function','Matching Original and neutral native synthesis RGB8 surfaces required.');
 requireValue(['auto','cpu','webgpu'].includes(scoreBackend)&&budget?.reserve,'A shared budget and explicit supported energy backend are required.');
 if(scoreBackend==='webgpu'&&!scoreGpu)throw new EngineError('GPU_UNAVAILABLE','Explicit synthesis energy WebGPU scores require an admitted GPU provider.');
 let block=p.block;while(Math.floor(height/block)*Math.floor(width/block)>16384)block+=8;
 requireValue(Math.floor(height/block)*Math.floor(width/block)>=25,'Image too small for25 complete native cells');
 checkAbort(signal);const started=performance.now(),owners=[],metrics={kernel:'ela-synthesis-energy-segmented',workers:1,energyRecompressions:0,energyQualityPlanesComputed:0,synthesisEnergyPlanesComputed:1,residualInput:'already-aggregated-synthesis-rgb8',qualityConfirmation:'median-already-aggregated',cache:{analysis:false,result:false}};
 let prepared,segmented,plane,logRelease,metadataRelease,log=providedLog,success=false;
 const own=(value)=>{owners.push(()=>value.dispose());return value;};
 try{
  const qualifiedLog=()=>{if(!log){logRelease=budget.reserve(512*1024);log=referenceLogFunction({minimumBits:973078528,maximumBits:1157627904},new Uint8Array(energyLogData().buffer));}return log;};
  const beforePlane=performance.now(),makePlane=()=>segmentedResidualEnergyPlane(synthesisSurface,{budget,signal,onProgress,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession});plane=own(await(stages?stages.plane(makePlane):makePlane()));metrics.energyPrimitivesMs=performance.now()-beforePlane;
  let panels;const makePanels=()=>panelDetector(image,{budget,signal,onProgress}),ensurePanels=async()=>{if(!panels){panels=own(await(stages?stages.panels(makePanels):makePanels()));metrics.energyPanelDetections=1;}return panels;};
  const planes=[plane.store],prepare=quantiles=>{const make=async()=>{const panels=await ensurePanels();return prepareSegmentedEnergy(image,planes,quantiles,qualifiedLog(),{polygons:panels.polygons,budget,signal,onProgress,scoreGpu,scoreBackend,planeCount:1,capturePreparationContext:preparationContextOwner?{owner:preparationContextOwner,key:preparationContextKey}:undefined});};return stages?stages.prepared(quantiles,make):make();};
  let profile;const prepareStarted=performance.now();
  if(p.profile==='sensitive'||p.profile==='conservative'){
   const automatic=async()=>{let reference,proposal;try{
    reference=await prepare([.1,.9]);const estimate=await estimateSegmentedEnergy({...reference,energy_planes:planes,energyPlaneCount:1},qualifiedLog(),{budget,signal,onProgress,planeCount:1});
    await reference.dispose();reference=null;proposal=await prepare(estimate.quantiles);const thresholds=await segmentedEnergyDeviations(proposal,{budget,signal,onProgress});return{...estimate,thresholds};
   }finally{await retireCompositeOwners([()=>reference?.dispose(),()=>proposal?.dispose()]);}};
   profile=energyProfile(await(stages?stages.automatic(automatic):automatic()),p.profile);
  }else profile=p.profile==='standard'?energyProfile(null,'standard'):{profile:'manual',quantiles:[p.histogramLow/1000,p.histogramHigh/1000],thresholds:[p.shadow/10,p.highlight/10],automatic:false};
  prepared=own(await prepare(profile.quantiles));metrics.energyPreparationMs=performance.now()-prepareStarted;
  await stages?.beforeSegment?.();checkAbort(signal);
  const segmentStarted=performance.now(),computedSegmentation=await segmentSegmentedEnergy({...prepared,metadata:{block}},{thresholds:profile.thresholds,minimum:p.minimum},{budget,signal,onProgress,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession});segmented=own(stages?stages.segmented(computedSegmentation):computedSegmentation);metrics.energySegmentationMs=performance.now()-segmentStarted;metrics.energySegmentation={...computedSegmentation.metrics};
  const metadata={method:'ela_energy_synthesis',version:1,quality:null,quality_origin:'synthesis-already-aggregated',qualities:[],energyPlaneCount:1,requested_block:p.block,block,image_shape:[height,width],valid_shape:[Math.floor(height/block)*block,Math.floor(width/block)*block],regions:segmented.regions,
   synthesis:{key:typeof synthesisKey==='object'?synthesisKey.key:synthesisKey??null,input:'neutral-native-median-rgb8',originalSha256:image.sha256??image.originalSource?.sha256??null,stage:'after-each-frame-histogram-and-channel-median',additionalRecompressions:0},
   energy:{enabled:true,kind:'descriptive_synthesis_residual_energy_contrast',probability:false,reference:'per_detected_Original_panel_trimmed_mean',quantiles:profile.quantiles,thresholds:profile.thresholds,profile:p.profile,automatic:profile.automatic===false?null:profile,panels:prepared.energy_summary,...(prepared.preparedIdentity?{preparedIdentity:prepared.preparedIdentity}:{}),...(plane.residualIdentity?{residualIdentity:plane.residualIdentity}:{}),window:7,log_scale:.2,energy_floor:.25,quality_confirmation:'median-already-aggregated',planeCount:1,segmentation:'pixel_hysteresis_half_threshold',grouping:'reference_panel_and_energy_class',minimum_strong_pixels:block*block}};
  metadataRelease=budget.reserve(16384+4096*(prepared.energy_summary.length+segmented.regions.length));
  const data={width,height,energyPlaneCount:1,energy_planes:planes,energy_low_score:prepared.energy_low_score,energy_high_score:prepared.energy_high_score,energy_scope:prepared.energy_scope,energy_labels:segmented.labels,energy_summary:prepared.energy_summary,regions:segmented.regions,regionColors:segmented.regions.map(r=>({id:r.id,rgb:energyColor(r)})),metadata};
  if(prepared.metrics?.preparationContextIdentity)metrics.energyPreparationContextIdentity=prepared.metrics.preparationContextIdentity;
  const runtime=prepared.metrics?.energyScoreGpu;if(runtime){metrics.energyScoreGpu=runtime;metrics.backend=runtime.backend.startsWith('webgpu')?'webgpu':'cpu';Object.defineProperty(data,'scoreRuntime',{value:runtime});}else metrics.backend='cpu';metrics.totalMs=performance.now()-started;checkAbort(signal);
  let refs=1,closed=false,pending;const releaseOwners=async()=>{if(refs||closed)return;if(pending)return pending;const task=(async()=>{if(stages){await retireCompositeOwners(owners);metadataRelease?.();}else await retireCompositeOwners([...owners,()=>metadataRelease?.()]);closed=true;})();pending=task;void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;};
  const lease=()=>{let released=false;return()=>{if(!released){released=true;refs--;}return releaseOwners();};},dispose=lease(),analysis={value:data,retain(){requireValue(!closed&&refs>0,'Synthesis energy owner is retiring.');refs++;return lease();},dispose};
  success=true;return{data,analysis,metrics,dispose};
 }catch(error){await retireCompositeOwners(owners,{primary:error});throw error;}
 finally{logRelease?.();if(!success)metadataRelease?.();}
}

// Admission margin for the NEXT missing phase, not a reservation or a limit on
// image dimensions. Existing stores/leases are already included in Budget.total().
// The score GPU still applies its own exact band/device admission afterwards.
export function synthesisEnergyStageWorkspace(width,height,phase,{backend='cpu',scoreGpu=false,panelCount=1}={}){
 requireValue(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0&&width*height<2**31&&Number.isInteger(panelCount)&&panelCount>=0,'Valid synthesis Energy workspace geometry required.');
 const n=width*height,MiB=1024**2,queue=8*Math.ceil(width/2)*height,panels=Math.max(1,panelCount);
 if(phase==='plane')return 4*n+energyStreamBytes(width,height)+width*Math.min(32,height)*3+4*MiB;
 if(phase==='panels'){
  const sw=Math.ceil(width/Math.max(1,Math.ceil(Math.max(width,height)/1800))),sample=32768*4+8*3*256*4+sw*6,work=width*196+8192,pagers=Math.min(n,4*MiB)+Math.min(queue,MiB/4)+2*65536;
  const minimumArea=Math.max(Math.max(24,width*.012)*Math.max(16,height*.012),n*.0005),proposals=8*Math.floor(n/(minimumArea*.82));
  return 2*n+queue+sample+work+pagers+width*99+4*MiB+proposals*3072;
 }
 if(phase==='prepared'){
  const own=width*41+(5*65536+8192)*4+8192,cpu=Math.max(17*n+own+6*MiB+width*99,21*n+own+2*MiB)+panels*2048+512*1024;
  // Preserve prepareSegmentedEnergy's native 44N+8MiB GPU/auto gate.
  return backend!=='cpu'&&scoreGpu?Math.max(cpu,44*n+8*MiB+panels*2048+512*1024):cpu;
 }
 requireValue(phase==='segment','Unknown synthesis Energy workspace phase.');
 const own=width*14+65536*8+8192,pagers=2*(Math.min(n,4*MiB)+65536)+(Math.min(n*4,4*MiB)+65536)+(Math.min(n*4,MiB/4)+65536),stores=6*n+queue;
 // Pager owners are retired before the selected-values/rank phase. They are
 // alternative peaks: 10N+planning, or 14N+the2MiB rank workspace.
 return Math.max(stores+own+pagers+2*MiB,stores+4*n+own+2*MiB)+16384+12288*panels;
}

// A context owns its scientific outputs. The neutral synthesis reader may be
// replaced between calls; retained outputs never retain that borrowed reader.
export function createElaSynthesisEnergyCache(image,synthesisSurface,budget,{synthesisKey,contextIdentity=null}={}){
 const entries=new Map(),planes=new Map(),panels=new Map(),prepared=new Map(),automatic=new Map(),retirements=new Set(),controller=new AbortController(),context=structuredClone(contextIdentity),synthesis=typeof synthesisKey==='object'?synthesisKey?.key:synthesisKey??null,cacheId=crypto.randomUUID(),references=new WeakMap();
 let active,closing=false,closed=false,pending,epoch=0,lastProof=null,nextReference=0,current=null,unregisterFailed,panelCount=1;
 const identity=value=>value&&(typeof value==='object'||typeof value==='function')?(references.has(value)?references.get(value):(references.set(value,++nextReference),nextReference)):null;
 const stable=value=>value===undefined?'null':value===null?'null':Array.isArray(value)?'['+value.map(stable).join(',')+']':typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}':JSON.stringify(value);
 const grid=surface=>{const d=surface?.descriptor??{};return{id:d.id??null,revision:d.revision??null,width:d.width,height:d.height,format:d.format};};
 const sourceProof=()=>{const original=image.originalSource??image;return{sha256:original.sha256??null,decode:original.provenance??{},original:grid(original.surface),contextGrid:grid(image.surface),synthesisGrid:{width:synthesisSurface.descriptor.width,height:synthesisSurface.descriptor.height,format:synthesisSurface.descriptor.format},synthesis,context};};
 const metadata=1024,headroom=(phase='segment',options={})=>synthesisEnergyStageWorkspace(image.surface.descriptor.width,image.surface.descriptor.height,phase,{panelCount,...options});
 const canCache=bytes=>!closing&&!budget.recovering&&!budget.isBackingUnderPressure?.('array-buffer')&&budget.total()+bytes+headroom()<=budget.limit;
 const once=fn=>{let done=false,flight;return()=>{if(done)return Promise.resolve();if(flight)return flight;const task=Promise.resolve().then(fn).then(value=>{if(value===false||value===0)throw new EngineError('BUSY','Synthesis Energy retirement awaits ACK.');done=true;});flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;};};
 const cleanup=(value,stores=[])=>{
  // Native preparation/segmentation mark themselves disposed before waiting.
  // Acknowledge every real store first, then let their existing metadata close.
  const closeStores=[...new Set(stores.filter(Boolean))].map(store=>{const close=once(store.dispose.bind(store));store.dispose=close;return close;}),closeValue=once(value.dispose.bind(value));
  return once(async()=>{await retireCompositeOwners(closeStores);await closeValue();});
 };
 const shared=(value,retire)=>{
  let refs=0,retiring=false,disposed=false,flight;
  const close=()=>{if(refs||disposed)return Promise.resolve();if(flight)return flight;retiring=true;const task=Promise.resolve().then(retire).then(()=>{disposed=true;});flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;};
  return{value,retain(){requireValue(!retiring&&!disposed,'Synthesis Energy stage is retiring.');refs++;let requested=false;return()=>{if(!requested){requested=true;refs--;}return close();};}};
 };
 async function retire(fn){retirements.add(fn);try{await fn();retirements.delete(fn);if(!retirements.size){unregisterFailed?.();unregisterFailed=null;}}catch(error){
  // A published lease can fail after the cache itself has already closed.
  // Keep that last owner addressable through the shared budget until its ACK.
  unregisterFailed??=budget.registerAsyncReclaimer?.(async()=>{if(active)return 0;const before=budget.total();await drain();return Math.max(0,before-budget.total());},{owner:'ela-synthesis-energy',label:'retiring-synthesis-energy-stages',allocationKind:'array-buffer'});throw error;
 }}
 async function drain(){await retireCompositeOwners([...retirements].map(fn=>()=>retire(fn)));}
 const touch=(map,key)=>{const entry=map.get(key);if(entry){map.delete(key);map.set(key,entry);}return entry;};
 async function evict(map,key){const entry=map.get(key);if(!entry)return;entry.drop??=once(async()=>{await entry.retire();if(map.get(key)===entry)map.delete(key);});await retire(entry.drop);}
 async function clear(){await drain();for(const map of[entries,prepared,automatic,panels,planes])for(const key of[...map.keys()])await evict(map,key);if(current){const entry=current;await retire(entry.dispose);if(current===entry)current=null;}}
 async function roomForWork(required=headroom()){if(budget.total()+required>budget.limit)await clear();}
 const unregister=budget.registerAsyncReclaimer?.(async()=>{if(active||closing)return 0;const before=budget.total();await clear();return Math.max(0,before-budget.total());},{owner:'ela-synthesis-energy',label:'idle-staged-synthesis-energy',allocationKind:'array-buffer'});
 const readonlyStores=new WeakMap(),readonly=store=>{let value=readonlyStores.get(store);if(!value){value=Object.freeze({byteLength:store.byteLength,get storage(){return store.storage;},readInto:(...args)=>store.readInto(...args)});readonlyStores.set(store,value);}return value;};
 const freeze=value=>{if(value&&typeof value==='object'&&!ArrayBuffer.isView(value)&&!Object.isFrozen(value)){for(const part of Object.values(value))freeze(part);Object.freeze(value);}return value;};
 const protect=result=>{
  const value=result.analysis.value,copy={...value,energy_planes:Object.freeze(value.energy_planes.map(readonly)),energy_summary:freeze(structuredClone(value.energy_summary)),regions:freeze(structuredClone(value.regions)),regionColors:freeze(structuredClone(value.regionColors)),metadata:freeze(structuredClone(value.metadata))};
  for(const name of['energy_scope','energy_low_score','energy_high_score','energy_labels'])copy[name]=readonly(value[name]);if(value.scoreRuntime)Object.defineProperty(copy,'scoreRuntime',{value:freeze(structuredClone(value.scoreRuntime))});
  const original=result.analysis,close=result.dispose,analysis={value:Object.freeze(copy),retain(){const free=original.retain();return()=>retire(free);},dispose:()=>retire(close)};result.analysis=Object.freeze(analysis);result.dispose=analysis.dispose;return result;
 };
 async function acquire(map,key,make,limit,kind,stats,assertCurrent,workspace){
  let entry=touch(map,key);stats.cache.stages[kind+'/'+key]=!!entry;
  if(!entry){await drain();await roomForWork(workspace);const started=performance.now(),value=await make(),stores=kind==='plane'?[value.store]:kind==='prepared'?[value.energy_low_score,value.energy_high_score,value.energy_scope]:[],retireValue=cleanup(value,stores);let core,release;
   try{assertCurrent();
    const snapshot=kind==='panels'?{...value,polygons:freeze(structuredClone(value.polygons))}:kind==='prepared'?{...value,energy_summary:freeze(structuredClone(value.energy_summary))}:value;
    core=shared(snapshot,retireValue);release=core.retain();
    stats[kind==='plane'?'synthesisEnergyPlanesComputed':kind==='panels'?'energyPanelDetections':kind==='prepared'?'energyPreparationsComputed':'energyAutomaticProfilesComputed']++;
    stats[kind==='plane'?'energyPrimitivesMs':kind==='prepared'?'energyPreparationMs':'energyPanelsMs']+=performance.now()-started;
    if(canCache(metadata)){
     while(map.size>=limit)await evict(map,map.keys().next().value);
     const fee=budget.reserve(metadata),cacheRelease=core.retain(),retirement=once(async()=>{await cacheRelease();fee();});entry={core,retire:retirement};map.set(key,entry);
    }
    return{value:core.value,release};
   }catch(error){await retireCompositeOwners([()=>retire(release??retireValue)],{primary:error});throw error;}
  }
  return{value:entry.core.value,release:entry.core.retain()};
 }
 return{
  analyze(input,options={}){
   requireValue(!closing&&!closed,'Synthesis energy cache is retiring.');requireValue(!active,'Synthesis energy cache is busy.');
   const p=energyParams(input),{quality,recompression,...scientific}=p,hooks={...options},backend=hooks.scoreBackend??'auto',signal=hooks.signal?AbortSignal.any([hooks.signal,controller.signal]):controller.signal;
   const started=performance.now(),task=(async()=>{
    checkAbort(signal);requireValue(['cpu','auto','webgpu'].includes(backend),'A supported synthesis Energy score backend is required.');if(backend==='webgpu'&&!hooks.scoreGpu)throw new EngineError('GPU_UNAVAILABLE','Explicit synthesis energy WebGPU scores require an admitted GPU provider.');
    const proof=stable(sourceProof())+'/'+identity(hooks.log)+'/'+identity(hooks.panelDetector),variant=backend+'/'+identity(hooks.scoreGpu);
    if(proof!==lastProof){await clear();lastProof=proof;epoch++;panelCount=1;}await drain();
    const key=JSON.stringify([epoch,scientific,variant]),hit=touch(entries,key);if(hit){const metrics={...structuredClone(hit.result.metrics),workers:0,synthesisEnergyPlanesComputed:0,energyPanelDetections:0,energyPreparationsComputed:0,energyAutomaticProfilesComputed:0,energySegmentationsComputed:0,energyPanelsMs:0,energyProfileMs:0,energySegmentationMs:0,energyPreparationMs:0,energyPrimitivesMs:0,totalMs:performance.now()-started,cache:{analysis:true,result:true,stages:{}}};if(metrics.energySegmentation)metrics.energySegmentation={...metrics.energySegmentation,cached:true};if(metrics.energyScoreGpu)metrics.energyScoreGpu={backend:metrics.energyScoreGpu.backend,cached:true,totalMs:0,originalExecution:metrics.energyScoreGpu};return{analysis:hit.result.analysis,metrics};}
    if(current){await retire(current.dispose);current=null;}
    const assertCurrent=()=>{checkAbort(signal);if(proof!==stable(sourceProof())+'/'+identity(hooks.log)+'/'+identity(hooks.panelDetector))throw new EngineError('STALE_RESULT','Synthesis Energy source or native context changed during computation.');};
    const stats={synthesisEnergyPlanesComputed:0,energyPanelDetections:0,energyPreparationsComputed:0,energyAutomaticProfilesComputed:0,energyPrimitivesMs:0,energyPreparationMs:0,energyPanelsMs:0,energyProfileMs:0,cache:{analysis:false,result:false,stages:{}}};
    const stage=async(map,name,make,limit,kind)=>{const acquired=await acquire(map,name,make,limit,kind,stats,assertCurrent,headroom(kind,{backend,scoreGpu:!!hooks.scoreGpu}));return{...acquired.value,dispose:()=>retire(acquired.release)};};
    const residualIdentity=JSON.stringify(['sherloq.synthesis-energy-residual/1',cacheId,epoch,synthesis,(image.originalSource??image).sha256??null,grid((image.originalSource??image).surface),grid(image.surface),context]);
    const stages={plane:async make=>({...await stage(planes,String(epoch),make,1,'plane'),residualIdentity}),panels:async make=>{const value=await stage(panels,String(epoch),make,1,'panels');panelCount=Math.max(1,value.polygons.length);return value;},prepared:async(quantiles,make)=>{
     const name=JSON.stringify([epoch,variant,quantiles]),value=await stage(prepared,name,make,3,'prepared');
     const actual=value.metrics?.energyScoreGpu?.backend??'cpu-native-energy-scores',original=image.originalSource??image;
     return{...value,preparedIdentity:JSON.stringify(['sherloq.synthesis-energy-prepared/1',cacheId,epoch,synthesis,original.sha256??null,grid(original.surface),grid(image.surface),context,quantiles,variant,actual])};
    },automatic:async make=>{const name=JSON.stringify([epoch,variant]);let entry=touch(automatic,name);stats.cache.stages['automatic/'+name]=!!entry;if(entry)return structuredClone(entry.value);const started=performance.now(),preparationBefore=stats.energyPreparationMs,value=await make();stats.energyProfileMs+=Math.max(0,performance.now()-started-(stats.energyPreparationMs-preparationBefore));assertCurrent();stats.energyAutomaticProfilesComputed++;if(canCache(8192)){while(automatic.size>=3)await evict(automatic,automatic.keys().next().value);const fee=budget.reserve(8192);entry={value:freeze(structuredClone(value)),retire:once(fee)};automatic.set(name,entry);}return value;},segmented:value=>{const close=cleanup(value,[value.labels]);return{...value,dispose:()=>retire(close)};},beforeSegment:async()=>{assertCurrent();await roomForWork();assertCurrent();}};
    let result,retained=false;try{
     result=protect(await computeElaSynthesisEnergy(image,synthesisSurface,p,{...hooks,budget,signal,synthesisKey:synthesis,stages}));assertCurrent();Object.assign(result.metrics,stats);result.metrics.energySegmentationsComputed=1;result.metrics.cache.analysis=stats.synthesisEnergyPlanesComputed===0&&stats.energyPanelDetections===0&&stats.energyPreparationsComputed===0;
     if(!stats.energyPreparationsComputed&&result.metrics.energyScoreGpu)result.metrics.energyScoreGpu={backend:result.metrics.energyScoreGpu.backend,cached:true,totalMs:0,originalExecution:structuredClone(result.metrics.energyScoreGpu)};
     if(canCache(metadata)){while(entries.size>=3)await evict(entries,entries.keys().next().value);const fee=budget.reserve(metadata),held=result;entries.set(key,{result,retire:once(async()=>{await held.dispose();fee();})});}else current=result;
     retained=true;return{analysis:result.analysis,metrics:structuredClone(result.metrics)};
    }catch(error){if(result&&!retained)await retireCompositeOwners([()=>result.dispose()],{primary:error});throw error;}
   })();active=task;void task.finally(()=>{if(active===task)active=null;}).catch(()=>{});return task;
  },
  dispose(){if(closed&&!retirements.size)return Promise.resolve();if(pending)return pending;closing=true;controller.abort();const task=(async()=>{await active?.catch(()=>{});await clear();unregister?.();closed=true;})();pending=task;void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;}
 };
}
