import "../../runtime-context.js?v=0.25.0";
import {createSelfDMProposalWindowRun,selfDMProposalWindowData} from './selfdm-proposal-window-run.js';
import {createSelfDMProposalProductProjection} from './selfdm-proposal-product-projection.js';
import {loadSelfDMProposalBundle,SELFDM_PROPOSAL_REFERENCE} from './selfdm-proposal-assets.js';
import {publishNeuralResult} from './publish-neural-result.js';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
import {registerArrayViews} from './allocation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort,EngineError} from './errors.js';
const MODEL=SEGMENTATION_MODELS['selfdm-proposal'];
function scientificBytes(v,seen=new Set()){if(!v||typeof v!=='object')return typeof v==='string'?v.length*4:16;if(seen.has(v))return 0;seen.add(v);if(ArrayBuffer.isView(v))return v.byteLength;if(v instanceof ArrayBuffer)return v.byteLength;return 128+Object.entries(v).reduce((n,[k,x])=>n+k.length*4+scientificBytes(x,seen),0)}
function arraysOf(value){const arrays={},seen=new Set();function visit(v){if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);if(ArrayBuffer.isView(v)){arrays[Object.keys(arrays).length]=v;return}for(const x of Object.values(v))visit(x)}visit(value);return arrays}
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');

/** One retained native Proposal packet per source/mode/window/model/backend.
 * Copies are admitted BEFORE the producer ACK and structuredClone is the one
 * actual cache copy, enforcing an owner/function-free Worker/raw boundary.
 * Managed render/export stores have independent ACKs; no RGB/model is used by
 * warm runs or cache-only display reprojection. No public gate is opened here. */
export function createSelfDMProposalWindowProduct({budget,profile,version,publishResult,releaseSurface,runFactory=createSelfDMProposalWindowRun,projectionFactory=createSelfDMProposalProductProjection,bundleLoader=loadSelfDMProposalBundle}={}){
 requireValue(budget?.reserve&&profile?.maxWorkers>0&&typeof publishResult==='function'&&typeof releaseSurface==='function','Shared Proposal budget/profile and managed publication ACK required');
 const caches=new Map(),identities=new Map(),pending=new Set(),bundles=new Map();let active,clearing,closing,closed=false;
 const own=value=>{requireValue(value&&typeof(value.release??value.dispose)==='function','Proposal product child owner required');pending.add(value);return value};
 const retire=async value=>{if(value&&pending.has(value)){await(value.release??value.dispose).call(value);pending.delete(value)}};
 const retry=()=>retireCompositeOwners([...pending].reverse().map(value=>()=>retire(value)));
 async function remove(entry){await entry.owner.release();caches.delete(entry.id);identities.delete(entry.key)}
 async function clear(imageId){for(const entry of [...caches.values()])if(imageId===undefined||entry.imageId===imageId)await remove(entry)}
 const idle=()=>requireValue(!active&&!clearing&&!closing&&!closed,'Native Proposal product busy or retired');
 async function work({task,original,window,backend,config,plan,mode=task.cloneWindowMode??'independent'},hooks,signal){
  await retry();checkAbort(signal);
  requireValue(['independent','global'].includes(mode)&&mode===(task.cloneWindowMode??'independent')&&window?.fingerprint&&plan?.contextDomain&&plan?.candidateDomain&&Array.isArray(plan.frame),'Exact native Proposal window/mode and candidate/context identities required');
  requireValue(config?.variant==='selfdm-proposal'&&task.params?.variant==='selfdm-proposal'&&config.bytes===MODEL.bytes&&config.sha256===MODEL.sha256&&['auto','cpu','webgpu'].includes(backend),'Pinned native Proposal bundle/backend required');
  const params=task.params;requireValue(Object.keys(params).every(k=>['variant','selectionPresent','reprojectOf','zoneIds','exclusions','compare','scientificScope'].includes(k))&&(params.compare===undefined||params.compare===false),'Native Proposal parameters required');
  const key=JSON.stringify([original.sha256,mode,window.fingerprint,plan.contextDomain.fingerprint,plan.candidateDomain.fingerprint,MODEL.id,config.sha256,config.url,backend,profile.id,profile.maxWorkers,SELFDM_PROPOSAL_REFERENCE.sourceParameters]);
  const reproject=params.reprojectOf!==undefined;let entry;
  if(reproject){requireValue(typeof params.reprojectOf==='string'&&Array.isArray(params.zoneIds)&&task.regions===undefined&&params.selectionPresent===undefined,'Explicit retained Proposal display view required');entry=caches.get(params.reprojectOf);if(!entry||entry.key!==key||entry.imageId!==task.imageId)throw new EngineError('CACHE_MISS','No matching retained Proposal source/mode/window/backend');}
  else{requireValue(params.zoneIds===undefined,'A context subset requires explicit cache-only reprojection');entry=caches.get(identities.get(key));}
  const cacheHit=!!entry;let copiedOwner;const projectionOwners=new Set();
  try{
   if(!entry){
    requireValue(caches.size<256,'Retire older native Proposal window analyses explicitly');
    const bundleKey=JSON.stringify([config.url,config.sha256]);let bundle=bundles.get(bundleKey);if(!bundle){bundle=await bundleLoader(config,{budget,signal});checkAbort(signal);bundles.set(bundleKey,bundle)}
    const runner=own(runFactory({original,window,models:bundle.models,backend,cloneWindowMode:mode},{budget,profile,signal,onOwner:own,onProgress:hooks.onProgress,cvAsset:bundle.cv}));
    const raw=await runner.execute();checkAbort(signal);
    requireValue(raw.status==='complete'&&raw.cloneWindowMode===mode&&raw.metadata?.cloneWindowMode===mode&&raw.metadata.analysisWindow?.fingerprint===window.fingerprint&&raw.metadata.contextFingerprint===plan.contextDomain.fingerprint&&raw.metadata.candidateFingerprint===plan.candidateDomain.fingerprint&&raw.raw instanceof Float32Array&&raw.raw.length===raw.width*raw.height&&raw.nativeContexts?.length>0,'Completed native Proposal mode, source domains and full Original-chart raw required');
    const packet=selfDMProposalWindowData(raw),credit=budget.reserve(scientificBytes(packet)+8192);let backing,freed=false;
    copiedOwner=own({async release(){if(freed)return;if(backing){await backing();backing=null}await credit();freed=true}});
    const nativeResult=structuredClone(packet);backing=registerArrayViews(budget,arraysOf(nativeResult),{owner:'selfdm-proposal-product',label:'complete-retained-native-Proposal-packet'});
    // All native/row/pool/source ACKs occur after the complete scientific copy
    // and before it can enter cache/publication. A failed ACK stays pending.
    await retire(runner);checkAbort(signal);
    entry={key,id:task.id+':selfdm-proposal:'+mode+':'+await hash(key),imageId:task.imageId,mode,nativeResult,owner:copiedOwner,width:nativeResult.width,height:nativeResult.height,origin:[...nativeResult.origin],fingerprint:window.fingerprint};checkAbort(signal);
   }
   const raw=entry.nativeResult,contexts=raw.nativeContexts,zoneIds=reproject?params.zoneIds:undefined;requireValue(zoneIds===undefined||zoneIds.every(id=>contexts.some(c=>c.id===id)),'Unknown retained native Proposal display context ID');
   const originalInferences=raw.metrics?.actualNativePipelines??raw.metrics?.inferenceExecutions??raw.metadata.actualNativePipelines??0,actualInferences=cacheHit?0:originalInferences;
   const metadata={...structuredClone(raw.metadata),analysisId:entry.id,resultId:entry.id,cloneWindowMode:mode,inferences:actualInferences,cache_hits:cacheHit?1:0,raw_shape:[1,entry.height,entry.width],raw_coordinates:'Original pixels',nativeOriginalInferences:originalInferences,execution:structuredClone(raw.metrics?.stages??[]),windowContextBank:{windowId:window.id,windowFingerprint:window.fingerprint,mode,contextIds:zoneIds??contexts.map(c=>c.id)},actualMode:mode};
   const provenance={engine:version,operation:task.operation,originalSha256:original.sha256,params:structuredClone(params),requestedParameters:structuredClone(params),nativeParameters:{variant:'selfdm-proposal',...SELFDM_PROPOSAL_REFERENCE.sourceParameters},cloneWindowMode:mode,backend,requestedBackend:task.backend??'auto',providers:raw.metrics?.providers??[raw.metrics?.provider].filter(Boolean),model:{variant:'selfdm-proposal',sha256:MODEL.sha256,modelSha256s:raw.metadata.modelSha256s??null},analysisWindow:{id:window.id,kind:window.kind,bounds:[...window.bounds],fingerprint:window.fingerprint,nativeInputBounds:[entry.origin[0],entry.origin[1],entry.origin[0]+entry.width,entry.origin[1]+entry.height],candidateFingerprint:plan.candidateDomain.fingerprint,contextFingerprint:plan.contextDomain.fingerprint},sourcePolicy:mode==='global'?'canonical-declared-context-union-single-observation/1':'one-literal-native-analysis-window/1',windowContextBank:metadata.windowContextBank,layout:'segmented'};
   const projection=projectionFactory({budget,onOwner:value=>{own(value);projectionOwners.add(value)}});own(projection);projectionOwners.add(projection);
   const analysis=await projection.run({width:entry.width,height:entry.height,origin:entry.origin,raw:raw.raw,contextDomain:plan.contextDomain,candidateDomain:plan.candidateDomain,nativeContexts:contexts,zoneIds,metadata,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession},{signal,onProgress:hooks.onProgress});checkAbort(signal);
   const ids=new Set(),publishedOwner=own({async release(){await projection.release();for(const id of [...ids]){try{await releaseSurface(id)}catch(error){if(error?.code!=='NOT_FOUND')throw error}ids.delete(id)}}});
   const published=await publishNeuralResult(analysis,task.imageId,provenance,{budget,signal,publishResult:(id,record)=>{const bundle=publishResult(id,record);for(const value of[bundle.surface,...Object.values(bundle.planeSurfaces??{}),...Object.values(bundle.maskSurfaces??{})])if(value?.id)ids.add(value.id);return bundle}});checkAbort(signal);
   if(!cacheHit){caches.set(entry.id,entry);identities.set(entry.key,entry.id);pending.delete(copiedOwner)}let adopted=false;
   const transferOutputs=()=>{requireValue(!closed&&!closing&&!clearing,'Proposal publication retired before facade adoption');checkAbort(signal);if(adopted)return;adopted=true;for(const value of projectionOwners)pending.delete(value);pending.delete(publishedOwner)};
   return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...published,cloneWindowMode:mode,analysisWindow:{...provenance.analysisWindow,mode},sourceRegionOrigin:[...entry.origin],provenance,transferOutputs,semantics:'Native full Proposal chain within this one actual window or the explicit canonical union; final CRF chart retained without resizing.',metrics:{inferences:actualInferences,cacheHit,execution:metadata.execution,memory:budget.snapshot()}};
  }catch(primary){await retireCompositeOwners([retry],{primary});throw primary}
 }
 return{
  run(input,hooks={}){idle();const controller=new AbortController(),signal=AbortSignal.any([controller.signal,...(hooks.signal?[hooks.signal]:[])]),job={controller};active=job;job.promise=Promise.resolve().then(()=>work(input,hooks,signal)).finally(()=>{if(active===job)active=null});return job.promise},
  readRaw({imageId,resultId}){idle();const entry=caches.get(resultId);if(!entry||entry.imageId!==imageId)throw new EngineError('CACHE_MISS','No retained native Proposal raw analysis');const credit=budget.reserve(scientificBytes(entry.nativeResult)+8192);try{const raw=structuredClone(entry.nativeResult),bounds=[entry.origin[0],entry.origin[1],entry.origin[0]+entry.width,entry.origin[1]+entry.height];return{id:resultId,imageId,operation:'ai.clones.segmentation',status:'ok',cloneWindowMode:entry.mode,data:{width:entry.width,height:entry.height,rawGrids:[{id:entry.id,kind:'native-proposal-CRF-chart',bounds,raw:raw.raw,analysis_shape:[1,entry.height,entry.width]}],dataNatif:raw,metadata:{analysisId:entry.id,resultId:entry.id,cloneWindowMode:entry.mode,raw_shape:[1,entry.height,entry.width],raw_grids:[{id:entry.id,kind:'native-proposal-CRF-chart',bounds,analysis_shape:[1,entry.height,entry.width]}],native_contexts:raw.nativeContexts,raw_coordinates:'Original pixels',originalOrigin:[...entry.origin],analysisWindow:raw.metadata.analysisWindow,execution:raw.metrics?.stages??[]}},sourceRegionOrigin:[...entry.origin],provenance:{cloneWindowMode:entry.mode,originalSha256:raw.metadata.sourceSha256,params:{variant:'selfdm-proposal'},output:'raw-model-probabilities',rawCoordinates:'Original pixels'},layers:[],metrics:{inferences:0,memory:budget.snapshot()}}}finally{credit()}},
  clearImage(imageId){idle();clearing=Promise.resolve().then(async()=>{await retry();await clear(imageId)}).finally(()=>{clearing=null});return clearing},
  clearImages(){idle();clearing=Promise.resolve().then(async()=>{await retry();await clear()}).finally(()=>{clearing=null});return clearing},
  dispose(){if(closing)return closing;closed=true;active?.controller.abort();closing=Promise.resolve().then(async()=>{await Promise.allSettled([active?.promise,clearing]);await retry();await clear();bundles.clear()}).finally(()=>{closing=null});return closing},
 };
}
