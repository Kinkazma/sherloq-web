import "../../runtime-context.js?v=0.30.0";
import{segmentationWindowCapabilities}from'./segmentation-window-capabilities.js';
import{createSegmentationAdapter}from'./segmentation-adapter.js';
import{createSegmentationNativeWindowPool}from'./segmentation-native-window-pool.js';
import{createOriginalSourceRegionsState,compileOriginalSourceRegions}from'./source-region-geometry.js';
import{SEGMENTATION_MODELS}from'../experiments/segmentation/models.js';
import{EngineError,requireValue,checkAbort}from'./errors.js';
import{retireCompositeOwners}from'./composite-owner-release.js';
const ids=result=>new Set([result?.surface,...['rgbSurfaces','planeSurfaces','maskSurfaces','flagSurfaces','tables'].flatMap(k=>Object.values(result?.[k]??{}))].flatMap(s=>s?.id?[s.id]:[]));
/** Product-shaped adapter. Native whole calls stay on their original pipeline;
 * canonical window jobs use the same native functions/backend via warm lanes.
 * No root token, diagnostic reservation or scientific-parameter rewrite is
 * introduced into normal product calls. Publication/admission remains at Core.
 */
export function createSegmentationProductAdapter({budget,profile,version,publishResult,releaseSurface,wholeFactory=createSegmentationAdapter,poolFactory=createSegmentationNativeWindowPool}={}){
 requireValue(typeof releaseSurface==='function','Managed surface release required');
 const domains=new Map(),failedInputs=new Map(),failedOutputs=new Map(),routes=new Map();let whole,pool,config,active,closing=false,disposal,wholeFailed=false,poolFailed=false;
 const configuredBackends=()=>{const m=config&&SEGMENTATION_MODELS[config.variant];return m&&(m.gpu?.sharedAssets||config.gpu)?['cpu','webgpu']:['cpu'];};
 const makeWhole=()=>wholeFactory({budget,profile,version,publishResult});
 const makePool=()=>poolFactory({budget,profile,version,publishResult,releaseSurface});
 async function releaseOutput(result){const remaining=failedOutputs.get(result);if(!remaining)return;await retireCompositeOwners([...remaining].map(id=>async()=>{try{await releaseSurface(id);}catch(error){if(error?.code!=='NOT_FOUND')throw error;}remaining.delete(id);}));failedOutputs.delete(result);}
 async function retireInput(input,image){await input.dispose();if(image.neuralInput===input)delete image.neuralInput;failedInputs.delete(input);}
 async function retryFailed(){
  await retireCompositeOwners([...failedOutputs.keys()].map(result=>()=>releaseOutput(result)));
  if(wholeFailed){await whole?.dispose();whole=undefined;wholeFailed=false;}
  if(poolFailed){await pool?.dispose();pool=undefined;poolFailed=false;}
  await retireCompositeOwners([...failedInputs].map(([input,image])=>()=>retireInput(input,image)));
 }
 function start(work,hooks={}){requireValue(!active&&!closing,'Product segmentation adapter busy or retired');const controller=new AbortController(),signal=AbortSignal.any([controller.signal,...(hooks.signal?[hooks.signal]:[])]),job={controller};active=job;job.promise=Promise.resolve().then(()=>work(signal)).finally(()=>{if(active===job)active=null;});return job.promise;}
 async function readyWhole(signal){if(!whole){whole=makeWhole();await whole.load(structuredClone(config),{signal});}return whole;}
 async function readyPool(signal){if(!pool){pool=makePool();await pool.load(structuredClone(config),{signal});}return pool;}
 async function wholeDomain(image,signal,imageId){let entry=domains.get(image);if(!entry){requireValue(domains.size<256,'Retire old native source domains explicitly');entry={imageId,credit:budget.reserve(65536)};domains.set(image,entry);entry.ready=Promise.resolve().then(async()=>{const geometry=image.surface?.descriptor??image.pixels;const state=await createOriginalSourceRegionsState({sourceSha256:image.sha256,width:geometry.width,height:geometry.height});checkAbort(signal);entry.domain=await compileOriginalSourceRegions(state.snapshot());return entry.domain;});void entry.ready.catch(()=>{});}return entry.ready;}
 async function clearDomains(imageId){for(const[image,entry]of domains)if(imageId===undefined||entry.imageId===imageId){await entry.ready.catch(()=>{});entry.credit();domains.delete(image);}}
 function recordRoutes(result,kind){for(const id of[result.data?.metadata?.analysisId,result.data?.metadata?.resultId])if(id)routes.set(id,kind);for(const window of result.windowResults??[])for(const id of[window.output?.data?.metadata?.analysisId,window.output?.data?.metadata?.resultId])if(id)routes.set(id,'pool');for(const id of[result.globalResult?.data?.metadata?.analysisId,result.globalResult?.data?.metadata?.resultId])if(id)routes.set(id,'pool');}
 async function windowRun({task,original,domain},hooks,signal){const executor=await readyPool(signal),source=original.segmented?original:{...original,segmented:true};requireValue(source.surface?.descriptor?.format==='rgb8','Original native RGB surface required');let carrier,result;
  try{carrier=executor.begin({domain,task,original:source},{...hooks,signal});result=await carrier.execute();checkAbort(signal);await carrier.transferOutputs();checkAbort(signal);recordRoutes(result,'pool');return result;}
  catch(primary){poolFailed=true;if(result)failedOutputs.set(result,new Set([...(result.windowResults??[]).flatMap(w=>[...ids(w.output)]),...ids(result.globalResult)]));await retireCompositeOwners([()=>carrier?.dispose(),...result?[()=>releaseOutput(result)]:[]],{primary});throw primary;}
 }
 return{
  configured(){return config?.variant??null;},windowCapabilities(){return segmentationWindowCapabilities(config?.variant,{backends:configuredBackends()});},backends:configuredBackends,
  load(input,hooks={}){return start(async signal=>{requireValue(!config,'Unload the configured model first');whole=makeWhole();const result=await whole.load(input,{signal});checkAbort(signal);config=structuredClone(input);return result;},hooks);},
  run(task,image,hooks={}){return start(async signal=>{requireValue(config,'Configure a verified model first');await retryFailed();checkAbort(signal);requireValue(task.cloneWindowMode===undefined||['independent','global'].includes(task.cloneWindowMode),'Invalid clone window mode');const windows=task.cloneWindowMode==='global'||task.sourceRegionDomain||task.regions?.length||task.params?.selectionPresent||task.params?.scientificScope||task.scientificScope||task.params?.selection!==undefined||task.params?.regions?.length||task.params?.exclusions?.length;
   if(windows){const domain=task.sourceRegionDomain?await compileOriginalSourceRegions(task.sourceRegionDomain):await wholeDomain(image,signal,task.imageId);return windowRun({task,original:image,domain},hooks,signal);}
   const executor=await readyWhole(signal);let result,input;
   try{const request=executor.run(task,image,{...hooks,signal});input=image.neuralInput;result=await request;checkAbort(signal);const delivered={...result,cloneWindowMode:'independent',provenance:{...result.provenance,cloneWindowMode:'independent',analysisWindowMode:'one-native-whole-image'}};recordRoutes(delivered,'whole');return delivered;}
   catch(primary){wholeFailed=true;if(input)failedInputs.set(input,image);if(result){failedOutputs.set(result,ids(result));await retireCompositeOwners([()=>releaseOutput(result)],{primary});}throw primary;}
  },hooks);},
  runSource({task,original,domain,...nativeHooks}){return start(async signal=>{requireValue(config,'Configure a verified model first');await retryFailed();checkAbort(signal);return windowRun({task,original,domain},nativeHooks,signal);},nativeHooks);},
  readRaw(request){requireValue(!active&&!closing,'Product adapter busy');const route=routes.get(request.resultId);if(route==='pool')return pool.readRaw(request);if(route==='whole'){const result=whole.readRaw(request);return{...result,cloneWindowMode:'independent',provenance:{...result.provenance,cloneWindowMode:'independent'}};}throw new EngineError('CACHE_MISS','No matching retained native analysis');},
  async clearImage(imageId){requireValue(!active,'Product adapter busy');await retryFailed();await retireCompositeOwners([()=>pool?.clearImage(imageId),()=>whole?.clearImage(imageId)]);await clearDomains(imageId);routes.clear();},
  async clearImages(){requireValue(!active,'Product adapter busy');await retryFailed();await retireCompositeOwners([()=>pool?.clearImages(),()=>whole?.clearImages()]);await clearDomains();routes.clear();},
  dispose(){if(disposal)return disposal;closing=true;active?.controller.abort();const running=active?.promise;disposal=Promise.resolve().then(async()=>{await Promise.allSettled([running]);await retireCompositeOwners([...failedOutputs.keys()].map(result=>()=>releaseOutput(result)).concat([async()=>{await whole?.dispose();whole=undefined;wholeFailed=false;},async()=>{await pool?.dispose();pool=undefined;poolFailed=false;}], [...failedInputs].map(([input,image])=>()=>retireInput(input,image))));await clearDomains();config=undefined;routes.clear();}).finally(()=>disposal=undefined);return disposal;}
 };
}
