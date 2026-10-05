import {createWorkerEngine} from '../src/worker-client.js';
import {D2PRL_MODEL_IDENTITY} from '../src/d2prl-model-identity.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
import {verifyStoredNpz} from './verify-stored-npz.mjs';
import {storageInventory} from './source-api-browser.js';
const assert=(v,m)=>{if(!v)throw Error(m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),MiB=1024**2,groups=['patchmatch','sift','forgeryscope','d2prl','ela'];
const parseMetadata=text=>JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|(?<!\w)(?:-?Infinity|NaN)(?!\w)/g,token=>token[0]==='"'?token:'null'));
// Diagnostic observation never cancels independent producers. Qualification is
// decided from settled states; every recovery transition remains in the trace.
export function createComplete96Progress({started=performance.now(),now=()=>performance.now(),emit=e=>console.log('COMPLETE96',JSON.stringify(e))}={}){
 const events=[],phases=new Map(),stamps=new Map();let firstFailure,state;
 return {events,get firstFailure(){return firstFailure;},get state(){return state;},progress(e){
  const key=e.group??'runtime',at=now();
  if(e.phase==='automatic-state'||e.phase?.startsWith('resource-')||e.phase?.startsWith('diagnostic-')||phases.get(key)!==e.phase||at-(stamps.get(key)??-Infinity)>15000){phases.set(key,e.phase);stamps.set(key,at);const event={...e,elapsedMs:at-started};events.push(event);emit(event);}
  if(e.phase==='automatic-state'){
   state=e.state;
   if(!firstFailure){const failed=Object.entries(state.states).find(([,value])=>value==='failed');if(failed){const [group]=failed,cause=state.errors[group];firstFailure=Object.assign(new Error(group+': '+cause.code+': '+cause.message),{code:cause.code,detector:group,details:cause.details,cause});}}
  }
 }};
}
// Reuse the committed archive when its source analysis has already been unloaded.
export async function preserveComplete96Archive({engine,analysis,archive,progress,verify=verifyStoredNpz,deliver=async(bytes,offset)=>{const response=await fetch('/archive-part?kind=partial&offset='+offset,{method:'POST',body:bytes});assert(response.ok,'Local partial archive delivery');}}){
 if(!archive&&!analysis)return;
 try{
  archive??=await engine.exportAutomatic({analysisId:analysis.analysisId,storage:'temporary'},{onProgress:progress});
  const verified=await verify({...archive,read:async(offset,length)=>(await engine.readExport({exportId:archive.id,revision:archive.revision,offset,length})).bytes,onProgress:progress,onEncodedChunk:deliver});
  progress({phase:'diagnostic-partial-archive',passed:false,delivery:'partial',byteLength:archive.byteLength,sha256:archive.sha256,verifiedBytes:verified.verifiedBytes,state:analysis?.state,metadata:parseMetadata(verified.strings.metadata_json)});
 }catch(error){progress({phase:'diagnostic-partial-archive-error',code:error.code,message:error.message,state:analysis?.state});}
 finally{if(archive){try{await engine.releaseExport(archive.id);}catch(error){progress({phase:'diagnostic-cleanup-error',operation:'releaseExport',code:error.code,message:error.message});}}}
}
// Read accounting only; this never allocates a capacity probe or acquires a
// compute lease. A missing reply cancels this read, never the live calculation.
export function startComplete96Diagnostics(engine,progress,{interval=30000,schedule=setInterval,unschedule=clearInterval}={}){
 let stopped=false,reading=false,controller;
 const timer=schedule(async()=>{
  if(stopped||reading)return;reading=true;controller=new AbortController();
  try{const c=await engine.capabilities({signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)])});if(!stopped)progress({phase:'diagnostic-heartbeat',memory:c.memory,resources:c.resources,execution:c.execution,liveMemory:c.resourceProfile?.liveMemory,browserMemory:c.browserMemory});}
  catch(error){if(!stopped)progress({phase:'diagnostic-heartbeat-error',code:error.code??error.name,message:error.message});}
  finally{reading=false;controller=null;}
 },interval);
 return ()=>{stopped=true;unschedule(timer);controller?.abort();};
}
export async function testComplete96mp({smallPositive=false,resourceHints,memoryExtensionId}={}){
 const before=await storageInventory(),started=performance.now(),engine=createWorkerEngine({computeProfile:'maximum',resourceHints,memoryExtensionId}),initialCapabilities=await engine.capabilities(),budgetBytes=initialCapabilities.memory.budgetBytes,times={},observer=createComplete96Progress({started}),{events,progress}=observer;let archive,retainedAnalysis,deliveredArchive,primaryFailure,partialAttempted=false;
 progress({phase:'runtime-resources',budgetBytes,executionCapacity:initialCapabilities.execution?.capacity,computeProfile:initialCapabilities.calculationProfile,resourceProfile:initialCapabilities.resourceProfile,browserMemory:initialCapabilities.browserMemory,resources:initialCapabilities.resources});
 const stopDiagnostics=startComplete96Diagnostics(engine,progress);
 async function preservePartial(analysis){
  if(partialAttempted)return;partialAttempted=true;
  const committed=archive;archive=null;
  await preserveComplete96Archive({engine,analysis,archive:committed,progress});
 }

 try{
  const ref=await(await fetch('/m2-build/forgeryscope-source/'+(smallPositive?'reference.json':'reference-96mp-rich.json'))).json();assert(smallPositive?ref.width===2008&&ref.height===1444&&ref.sha256==='43ebe5fbe0c5786280753926ff3fe4f355c791f527ba48fa767df20b01bb0e6d':ref.width===12000&&ref.height===8000&&ref.sha256==='7a6ac1368fd28adbbf841a88b3b897f791695ac6fe265c7ba6c9a93f36d704ca','Pinned original');
  const manifest=await(await fetch('/m2-build/forgeryscope/manifest.json')).json(),segments=await(await fetch('/m2-build/aliked-segments/manifest.json')).json(),runtime=await(await fetch('/m2-build/m2-neural-runtime/manifest.json')).json(),resolved=(assets,base)=>Object.fromEntries(Object.entries(assets).map(([k,v])=>[k,{...v,url:new URL(base+v.file,location.href).href}])),assets=resolved(manifest.assets,'/m2-build/forgeryscope/'),alikedSegments={...segments,assets:resolved(segments.assets,'/m2-build/aliked-segments/')},runtimes=Object.fromEntries(Object.entries(runtime.providers).map(([p,m])=>[p,{factoryUrl:new URL('/m2-build/m2-neural-runtime/'+m.factory,location.href).href,ortUrl:new URL('/ort/ort.'+(p==='wasm'?'wasm':'webgpu')+'.min.mjs',location.href).href,wasmUrl:new URL('/ort/'+m.wasm,location.href).href}]));
  const modelsStarted=performance.now();await engine.loadAutomaticModels({forgeryscope:{assets,alikedSegments,runtimes,preparationFactoryUrl:new URL('/.build/forgeryscope/prepare.mjs',location.href).href,siftFactoryUrl:new URL('/.build/forgeryscope/sift.mjs',location.href).href,siftIdentity:'native-sift'}});
  await engine.loadD2prlModel({...D2PRL_MODEL_IDENTITY,url:new URL('/shared-build/d2prl-private-package/model.json',location.href).href});
  const languageBytes=new Uint8Array(await(await fetch('/english-ocr')).arrayBuffer()),h=await createSHA256();h.update(languageBytes);const languageSha256=h.digest('hex');await engine.loadM3Models({models:{},language:{data:languageBytes,sha256:languageSha256}});
  times.modelConfigurationMs=performance.now()-modelsStarted;
  let at=performance.now();const original=await engine.loadBlob({id:'original',blob:await(await fetch('/m2-build/forgeryscope-source/'+ref.file)).blob(),layout:'segmented'},{onProgress:progress});times.loadMs=performance.now()-at;
  const envelope=[[0,0],[ref.width-1,0],[ref.width-1,ref.height-1],[0,ref.height-1]],selection={regions:[envelope],envelope,disabled:[]},task={id:'complete96',imageId:'original',operation:'analysis.complete',backend:'auto',params:{selection,maxConcurrent:5}};
  at=performance.now();const result=await engine.run(task,{onProgress:progress});times.analysisMs=performance.now()-at;retainedAnalysis={analysisId:result.analysisId,state:result.data.state};assert(groups.every(g=>result.data.state.states[g]==='done'),'Five groups must finish: '+JSON.stringify(result.data.state));assert(result.provenance.originalSha256===ref.sha256,'Original identity retained');assert(result.data.entries.length>0,'Populated automatic result');const center=p=>p.reduce((s,v)=>[s[0]+v[0]/p.length,s[1]+v[1]/p.length],[0,0]),distantEvidence=result.data.entries.filter(e=>e.polygons?.length===2).map(e=>{const a=center(e.polygons[0]),b=center(e.polygons[1]);return {id:e.id,source:e.source,distance:Math.hypot(a[0]-b[0],a[1]-b[1])};}).filter(e=>e.distance>(smallPositive?500:3000));assert(distantEvidence.length>0,'Distant copied-region evidence absent');
  const summarize=entries=>entries.map(e=>({id:e.id,source:e.source,color:e.color,count:e.count,origin:e.origin,maskShape:e.pixel_mask?[e.pixel_mask.width,e.pixel_mask.height]:null})),initial=summarize(result.data.entries),groupEntries=Object.fromEntries([...new Set(initial.map(e=>e.source))].map(s=>[s,initial.filter(e=>e.source===s).length]));
  const layers=[];for(const layer of ['corroboration','ela-preview','energy-low','energy-high']){const rendered=await engine.renderAutomatic({analysisId:result.analysisId,layer},{onProgress:progress});for(const rect of (smallPositive?[{x:0,y:0,width:64,height:48},{x:305,y:286,width:64,height:48},{x:305,y:1322,width:64,height:48}]:[{x:0,y:0,width:64,height:48},{x:1710,y:1610,width:64,height:48},{x:1710,y:7360,width:64,height:48}])){const args={surfaceId:rendered.surface.id,revision:rendered.surface.revision,rect},part=layer==='ela-preview'?await engine.readPixels(args):await engine.readPlane(args);layers.push({layer,rect,values:(part.pixels??part.plane).data.length});}await engine.releaseSurface(rendered.surface.id);}
  const filtered=initial;
  at=performance.now();archive=await engine.exportAutomatic({analysisId:result.analysisId,storage:'temporary'},{onProgress:progress});times.exportMs=performance.now()-at;
  await engine.unload('original');await engine.unloadD2prlModel();await engine.unloadM3Models();await engine.loadAutomaticModels({});
  at=performance.now();const verified=await verifyStoredNpz({...archive,read:async(offset,length)=>(await engine.readExport({exportId:archive.id,revision:archive.revision,offset,length})).bytes,onProgress:progress,onEncodedChunk:async(bytes,offset)=>{const response=await fetch('/archive-part?offset='+offset,{method:'POST',body:bytes});assert(response.ok,'Local archive delivery');}});times.readbackMs=performance.now()-at;deliveredArchive={delivery:'complete',byteLength:archive.byteLength,sha256:archive.sha256,verifiedBytes:verified.verifiedBytes,state:retainedAnalysis.state};
  const metadata=parseMetadata(verified.strings.metadata_json);assert(metadata.method==='complete_automatic_analysis'&&groups.every(g=>metadata.states[g]==='done'),'Complete archived group states');for(const group of groups)assert(Object.keys(verified.arrays).some(k=>k.startsWith('root_results_'+group+'_')),'Missing scientific group '+group);
  for(const name of ['root_results_d2prl_map','root_results_forgeryscope_map','root_results_ela_energy_low_score'])assert(same(verified.arrays[name].shape,[ref.height,ref.width]),'Full original field '+name);assert(same(verified.arrays.root_results_ela_energy_planes.shape,[3,ref.height,ref.width]),'Full energy planes');assert(verified.arrays.root_results_patchmatch_pairs.shape[0]>0&&verified.arrays.root_results_sift_pairs.shape[0]>0,'Populated global pair outputs');
  const exportInfo={byteLength:archive.byteLength,sha256:archive.sha256,arrays:verified.arrays,verifiedBytes:verified.verifiedBytes,providers:verified.strings.browser_provenance_json?parseMetadata(verified.strings.browser_provenance_json).providers:null};await engine.releaseExport(archive.id);archive=null;const final=await engine.capabilities();assert(final.memory.retainedBytes+final.memory.cacheBytes+final.memory.activeReservationBytes===0,'Final shared ownership leak');await engine.dispose();assert(same(before,await storageInventory()),'Temporary storage cleanup');return {passed:true,scope:'Five actual automatic groups under one public worker budget, '+(smallPositive?'2008x1444 positive source (not a >=94MP qualification)':'original96MP')+', populated global outputs, views and complete archive after owner disposal; one cold analysis, no repeated analysis or refilter; not WordPress UI or a new per-model arithmetic oracle.',dimensions:[ref.width,ref.height],originalSha256:ref.sha256,source:ref,requestedBackend:'auto',budgetBytes,original,states:result.data.state,initial,filtered,groupEntries,distantEvidence,layers,languageSha256,times,totalMs:performance.now()-started,archive:exportInfo,finalMemory:final.memory,events,storageCleanup:true};
 }catch(error){
  primaryFailure=observer.firstFailure??error;
  if(deliveredArchive)progress({phase:'diagnostic-partial-archive',passed:false,...deliveredArchive});
  else await preservePartial(error.details?.retainedAnalysis??retainedAnalysis);
  let capabilities;try{capabilities=await engine.capabilities();}catch{}
  progress({phase:'diagnostic-failure',code:error.code,message:error.message,details:error.details,state:observer.state,memory:capabilities?.memory,resources:capabilities?.resources,execution:capabilities?.execution,liveMemory:capabilities?.resourceProfile?.liveMemory,browserMemory:capabilities?.browserMemory});
  throw primaryFailure;
 }finally{stopDiagnostics();for(const [operation,release] of [['releaseExport',()=>archive&&engine.releaseExport(archive.id)],['dispose',()=>engine.dispose()]]){try{await release();}catch(error){if(!primaryFailure)primaryFailure=error;else progress({phase:'diagnostic-cleanup-error',operation,code:error.code,message:error.message});}}if(primaryFailure)throw primaryFailure;}
}
