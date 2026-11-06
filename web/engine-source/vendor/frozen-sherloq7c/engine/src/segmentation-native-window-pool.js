import{createSegmentationNativeWindows}from'./segmentation-native-windows.js';
import{createSegmentationIndependentRun}from'./segmentation-independent-run.js';
import{SEGMENTATION_MODELS}from'../experiments/segmentation/models.js';
import{selectSegmentationBackend}from'../experiments/segmentation/backend.js';
import{segmentationZoneConcurrency,runSegmentationZones}from'../experiments/segmentation/zone-scheduler.js';
import{retireCompositeOwners}from'./composite-owner-release.js';
import{EngineError,requireValue,checkAbort}from'./errors.js';
const resultIds=result=>new Set([result.surface,...['rgbSurfaces','planeSurfaces','maskSurfaces','flagSurfaces','tables'].flatMap(key=>Object.values(result[key]??{}))].flatMap(x=>x?.id?[x.id]:[]));
/** Reuse the ORIGINAL zone scheduler and actual inference eligibility. Each
 * native lane keeps its own session/cache. A job still reads/prepares only one
 * canonical window; no correlations, learned statistics or banks cross jobs.
 */
export function createSegmentationNativeWindowPool({budget,profile,version,publishResult,releaseSurface,windowFactory=createSegmentationNativeWindows,selectBackend=selectSegmentationBackend}={}){
 requireValue(typeof releaseSurface==='function','Acknowledged managed-result release required');
 const lanes=[],runs=new Set(),analyses=new Map();let config,model,active,closing=false,disposal;
 const makeLane=()=>{const executor=windowFactory({budget,profile,version,publishResult,releaseSurface});const lane={executor,inference:{get residentBytes(){return executor.idleInferenceBytes??0;},independentZoneWorker:false},loaded:false};lanes.push(lane);return lane;};
 async function loadLane(lane,signal){if(!lane.loaded){await lane.executor.load(structuredClone(config),{signal});lane.loaded=true;}}
 async function retireLane(lane){await lane.executor.dispose();const i=lanes.indexOf(lane);if(i>=0)lanes.splice(i,1);for(const[id,value]of analyses)if(value===lane)analyses.delete(id);}
 return{
  async load(input,hooks={}){requireValue(!config&&!active&&!closing,'Native window pool already configured or busy');config=structuredClone(input);model=SEGMENTATION_MODELS[input.variant];requireValue(model,'Known native segmentation variant');const lane=makeLane();active=lane;try{await loadLane(lane,hooks.signal);return{variant:input.variant,runtimeInferencePerformed:false};}finally{active=null;}},
  begin({domain,task,original},hooks={}){
   requireValue(config&&!active&&!closing,'Configured idle native window pool required');
   const controller=new AbortController(),signal=AbortSignal.any([controller.signal,...(hooks.signal?[hooks.signal]:[])]),unclaimed=new Map();let batch,setup,group,complete=false,settled=false,disposal,selection,execution;
   async function releaseResult(result){let ids=unclaimed.get(result);if(!ids)return;await retireCompositeOwners([...ids].map(id=>async()=>{try{await releaseSurface(id);}catch(error){if(error?.code!=='NOT_FOUND')throw error;}ids.delete(id);}));unclaimed.delete(result);}
   async function prepareBatch(plan){
    if(setup)return setup;setup=(async()=>{
     checkAbort(signal);requireValue(task.params?.variant===config.variant,'Explicit configured variant required');
     if(task.params.reprojectOf!==undefined)throw new EngineError('CACHE_MISS','Group views require the matching retained per-window analysis IDs; no native fallback is performed');
     const windows=plan.windows.filter(w=>w.status!=='empty');requireValue(windows.length>0&&windows.length<=256,'At most256 native independent windows; none were discarded');
     const zones=windows.map(w=>{const r=w.contextDomain.rect;if(!r||w.contextDomain.countIncluded!==(r.x1-r.x0)*(r.y1-r.y0)&&!lanes[0].executor.supportsFragmentedWindow?.())throw new EngineError('SEGMENTATION_WINDOW_FRAGMENT_CONTEXT_REQUIRED','This autonomous window needs an architecture-specific within-window context adaptation before native RGB',{details:{variant:config.variant,windowId:w.id}});return{bounds:[r.x0,r.y0,r.x1,r.y1]};});
     const gpuUrl=model.gpu?.sharedAssets?config.url:config.gpu?.url,requested=task.backend??'auto';requireValue(['auto','cpu','webgpu'].includes(requested)&&(requested!=='webgpu'||gpuUrl),'Requested original backend is configured');
     selection=await selectBackend({requested,gpuModel:gpuUrl?model.gpu:null,cpuModel:model,regionBounds:zones.map(z=>z.bounds),segmented:true,reclaimableInferenceBytes:lanes.reduce((n,l)=>n+l.inference.residentBytes,0),budget,sourceBytes:Math.min(Math.max(...zones.map(z=>(z.bounds[2]-z.bounds[0])*(z.bounds[3]-z.bounds[1])*3)),4*1024**2),zones:zones.length,knownHeapBytes:hooks.knownHeapBytes??0});checkAbort(signal);
     await loadLane(lanes[0],signal);const traits=await lanes[0].executor.executionTraits(selection.backend,{signal});lanes[0].inference.independentZoneWorker=traits.independentZoneWorker;
     const wanted=segmentationZoneConcurrency({budget,model,lanes,zones,segmented:true});
     await retireCompositeOwners(lanes.slice(wanted).map(lane=>()=>retireLane(lane)));
     while(lanes.length<wanted){const lane=makeLane();await loadLane(lane,signal);const actual=await lane.executor.executionTraits(selection.backend,{signal});requireValue(actual.independentZoneWorker===traits.independentZoneWorker,'Native lane execution eligibility differs');lane.inference.independentZoneWorker=actual.independentZoneWorker;}
     checkAbort(signal);
     batch=runSegmentationZones({count:windows.length,lanes:[...lanes],signal,async run(index,lane,laneSignal){const result=await lane.executor.run({task,original,window:windows[index],selection},{...hooks,signal:laneSignal});unclaimed.set(result,resultIds(result));for(const id of[result.data?.metadata?.analysisId,result.data?.metadata?.resultId])if(id)analyses.set(id,lane);return result;}}).then(result=>{execution=result.concurrency;return new Map(windows.map((w,i)=>[w.fingerprint,result.values[i]]));});void batch.catch(()=>{});
    })();return setup;
   }
   async function prepareGlobal(plan){
    if(setup)return setup;setup=(async()=>{
     checkAbort(signal);requireValue(lanes[0].executor.supportsGlobalMode?.(),'This native global architecture is not qualified');
     if(task.params.reprojectOf!==undefined)throw new EngineError('CACHE_MISS','Global views require the matching retained analysis ID; no native fallback is performed');
     const global=plan.global,context=global?.contextDomain,r=context?.rect;requireValue(global?.contextPolicy==='declared-window-context-union'&&r&&!context.empty&&!global.candidateDomain.empty,'An exact nonempty canonical declared-context union is required');
     const gpuUrl=model.gpu?.sharedAssets?config.url:config.gpu?.url,requested=task.backend??'auto';requireValue(['auto','cpu','webgpu'].includes(requested)&&(requested!=='webgpu'||gpuUrl),'Requested original backend is configured');
     selection=await selectBackend({requested,gpuModel:gpuUrl?model.gpu:null,cpuModel:model,regionBounds:[[r.x0,r.y0,r.x1,r.y1]],segmented:true,reclaimableInferenceBytes:lanes.reduce((n,l)=>n+l.inference.residentBytes,0),budget,sourceBytes:Math.min((r.x1-r.x0)*(r.y1-r.y0)*3,4*1024**2),zones:1,knownHeapBytes:hooks.knownHeapBytes??0});checkAbort(signal);
     await retireCompositeOwners(lanes.slice(1).map(lane=>()=>retireLane(lane)));await loadLane(lanes[0],signal);checkAbort(signal);
     execution={requested:1,observed:1,memoryBackoffs:0,policy:'one-canonical-declared-context-union'};
    })();return setup;
   }
   async function globalRun({plan,task:originalTask,signal:jobSignal}){
    await setup;checkAbort(jobSignal);const union=plan.global,r=union.contextDomain.rect,bounds=[r.x0,r.y0,r.x1,r.y1],window={...union,id:'global-analysis',kind:'region',bounds,polygon:[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]],status:'ready'};
    // bounds locate the chart only. Every RGB read and native observation is
    // constrained by the union domains, never by this bounding rectangle.
    const lane=lanes[0],result=await lane.executor.run({task:originalTask,original,window,mode:'global',selection},{...hooks,signal:jobSignal});
    unclaimed.set(result,resultIds(result));for(const id of[result.data?.metadata?.analysisId,result.data?.metadata?.resultId])if(id)analyses.set(id,lane);unclaimed.delete(result);return result;
   }
   const dispatcher={async run({window},requestHooks){await setup;const values=await batch,result=values.get(window.fingerprint);requireValue(result,'Scheduled window result missing');unclaimed.delete(result);return result;}};
   group=createSegmentationIndependentRun({domain,task,original},{native:dispatcher,budget,signal,releaseSurface,async admitIndependent({plan}){await prepareBatch(plan);return true;},async admitGlobal({plan}){if(!lanes[0].executor.supportsGlobalMode?.())return false;await prepareGlobal(plan);return true;},runGlobal:globalRun});
   const owner={imageId:task.imageId,async transferOutputs(){requireValue(complete&&unclaimed.size===0,'Complete claimed outputs required');await group.transferOutputs();runs.delete(owner);},get state(){return{...group.state,complete,settled,unclaimedResults:unclaimed.size};},execute(){if(owner.running)return owner.running;requireValue(!complete&&!settled,'Native independent group already settled');const job=Promise.resolve().then(()=>group.execute()).then(result=>{complete=true;return{...result,metrics:{...result.metrics,nativeWindowExecution:execution??{requested:0,observed:0,memoryBackoffs:0},backendSelection:selection?.reason??'not-executed'}};}).catch(async primary=>{await retireCompositeOwners([...unclaimed.keys()].map(result=>()=>releaseResult(result)),{primary});throw primary;}).finally(()=>{settled=true;if(active===owner)active=null;});owner.running=job;return job;},dispose(){if(disposal)return disposal;controller.abort();disposal=Promise.resolve().then(async()=>{await Promise.allSettled([owner.running,setup,batch]);await retireCompositeOwners([()=>group.dispose(),...[...unclaimed.keys()].map(result=>()=>releaseResult(result))]);runs.delete(owner);if(active===owner)active=null;}).finally(()=>disposal=undefined);return disposal;}};
   active=owner;runs.add(owner);return owner;
  },
  readRaw(request){requireValue(!active&&!closing,'Native window pool busy');const lane=analyses.get(request.resultId);if(!lane)throw new EngineError('CACHE_MISS','No matching native window raw result');return lane.executor.readRaw(request);},
  async clearImage(imageId){requireValue(!active,'Native window pool busy');await retireCompositeOwners([...runs].filter(run=>run.imageId===imageId).map(run=>()=>run.dispose()));await retireCompositeOwners(lanes.map(lane=>()=>lane.executor.clearImage(imageId)));for(const[id,lane]of analyses)if(!lanes.includes(lane))analyses.delete(id);},
  async clearImages(){requireValue(!active,'Native window pool busy');await retireCompositeOwners([...runs].map(run=>()=>run.dispose()));await retireCompositeOwners(lanes.map(lane=>()=>lane.executor.clearImages()));analyses.clear();},
  dispose(){if(disposal)return disposal;closing=true;active?.dispose?.().catch(()=>{});disposal=Promise.resolve().then(async()=>{await retireCompositeOwners([()=>retireCompositeOwners([...runs].map(run=>()=>run.dispose())),()=>retireCompositeOwners([...lanes].map(lane=>()=>retireLane(lane)))]);config=undefined;model=undefined;analyses.clear();}).finally(()=>disposal=undefined);return disposal;}
 };
}
