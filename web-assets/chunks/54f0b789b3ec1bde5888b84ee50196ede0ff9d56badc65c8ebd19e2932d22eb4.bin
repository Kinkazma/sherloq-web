import "../../runtime-context.js?v=0.25.0";
import{nativeInsufficientSupport}from'./native-insufficient-support-result.js';
import{scientificJsonBound}from'./scientific-json.js';
import {createTntWindowFragmentRun} from './mgcfdn-tnt-window-fragment-run.js';
import {createMgcfdnProductProjection} from './mgcfdn-product-projection.js';
import {publishNeuralResult} from './publish-neural-result.js';
import {MGCFDN_TNT_WINDOW_SOURCE_SHA256} from './mgcfdn-tnt-window-head-graph.js';
import {createTntWindowResources} from './mgcfdn-tnt-window-resources.js';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

// Publish one native bank from an autonomous window or explicit canonical union.
// The supplied domain, native encoder/head and contextual/candidate roles persist.
// Rectangle jobs continue through the existing segmentation adapter.
export function createTntWindowFragmentProduct({budget,profile,version,publishResult,releaseSurface,runFactory=createTntWindowFragmentRun,projectionFactory=createMgcfdnProductProjection,resourcesFactory=createTntWindowResources}={}) {
  requireValue(typeof publishResult==='function'&&typeof releaseSurface==='function','Acknowledged managed result registry required');
  const caches=new Map(),pending=new Set(),models=new Map(),modelOwners=new Set();let active,closing,closed=false;
  const own=o=>{requireValue(o&&typeof(o.release??o.dispose)==='function','Fragment product owner required');pending.add(o);return o;};
  const retire=async o=>{await(o.release??o.dispose).call(o);pending.delete(o);};
  const retry=()=>retireCompositeOwners([...pending].map(o=>()=>retire(o)));
  function resourcesFor(backend,modelUrl){const key=JSON.stringify([backend,modelUrl,SEGMENTATION_MODELS['mgcfdn-tnt'].sha256]);if(models.has(key))return models.get(key);const value=resourcesFactory({budget,backend,modelUrl,model:SEGMENTATION_MODELS['mgcfdn-tnt'],onOwner:o=>modelOwners.add(o)});modelOwners.add(value);models.set(key,value);return value;}
  const clear=async id=>{for(const[key,value]of caches)if(id===undefined||value.imageId===id){await value.release();caches.delete(key);}};
  async function work({task,original,window,backend,config,plan,mode=task.cloneWindowMode??'independent'},hooks,signal) {
    await retry();checkAbort(signal);
    requireValue(['independent','global'].includes(mode)&&mode===(task.cloneWindowMode??'independent'),'Requested and executed native context-bank mode must agree');
    requireValue(config.variant==='mgcfdn-tnt'&&task.params?.variant==='mgcfdn-tnt'&&plan.fragmented&&['cpu','webgpu'].includes(backend),'TNT single-window exclusion route required');
    requireValue(config.bytes===SEGMENTATION_MODELS['mgcfdn-tnt'].bytes&&config.sha256===SEGMENTATION_MODELS['mgcfdn-tnt'].sha256&&SEGMENTATION_MODELS['mgcfdn-tnt'].tail.sha256===MGCFDN_TNT_WINDOW_SOURCE_SHA256&&(config.tail===undefined||config.tail!==null&&typeof config.tail==='object'&&!Array.isArray(config.tail)&&Object.keys(config.tail).length===3&&['file','bytes','sha256'].every(key=>Object.hasOwn(config.tail,key)&&config.tail[key]===SEGMENTATION_MODELS['mgcfdn-tnt'].tail[key])),'Original pinned TNT model required');
    requireValue(Object.keys(task.params).every(k=>['variant','selectionPresent','reprojectOf','zoneIds','exclusions','compare','scientificScope'].includes(k))&&(task.params.compare===undefined||task.params.compare===false),'Native TNT parameter contract required');
    if(task.params.reprojectOf!==undefined)throw new EngineError('CACHE_MISS','Fragment views require their retained raw analysis; no learned fallback is permitted');
    requireValue(task.params.zoneIds===undefined,'A context subset requires cache-only reprojection');
    const analysisId=task.id+':window-fragments:'+(mode==='global'?'global:':'')+backend+':'+window.fingerprint;
    requireValue(caches.size<256||caches.has(analysisId),'Retire old single-window fragment raw analyses explicitly');
    let runner,raw,rawOwner,projection,analysis,published,publishedOwner;
    try {
      const modelUrl=backend==='webgpu'?(config.gpu?.url??config.url):config.url,resources=resourcesFor(backend,modelUrl);
      runner=runFactory({original,window,backend,model:SEGMENTATION_MODELS['mgcfdn-tnt'],modelUrl,resources,cloneWindowMode:mode},{budget,profile,signal,onOwner:own});own(runner);
      raw=await runner.run();checkAbort(signal);
      requireValue(raw.cloneWindowMode===mode&&raw.provenance?.cloneWindowMode===mode&&raw.analysisWindow?.fingerprint===window.fingerprint,'Exact within-window context identity required');
      if(raw.status==='empty'){
        const nativeSupport=nativeInsufficientSupport(raw),frame=plan.frame,origin=frame.slice(0,2),width=frame[2]-frame[0],height=frame[3]-frame[1];
        // The synchronous runner parent and all planning/source owners must ACK
        // before even a no-calculation result can become a retained response.
        await retire(runner);await retryExcept();checkAbort(signal);
        const metadata={analysisId,resultId:analysisId,cloneWindowMode:mode,inferences:0,cache_hits:0,nativeSupport,sourceObservations:{...raw.observations},windowContextBank:{windowId:window.id,windowFingerprint:window.fingerprint,contextIds:[],receipt:structuredClone(raw.receipt)}};
        const provenance={...raw.provenance,engine:version,operation:task.operation,originalSha256:original.sha256,requestedBackend:backend,params:structuredClone(task.params),nativeSupport,analysisWindow:{id:window.id,kind:window.kind,bounds:[...window.bounds],nativeInputBounds:[...frame],candidateFingerprint:plan.candidateDomain.fingerprint,contextFingerprint:plan.contextDomain.fingerprint},model:{variant:'mgcfdn-tnt',sha256:SEGMENTATION_MODELS['mgcfdn-tnt'].sha256},output:'no-model-output-insufficient-support'};
        const credit=budget.reserve(4096+8*scientificJsonBound({metadata,provenance}));let retired=false;rawOwner=own({imageId:task.imageId,async release(){if(retired)return;credit();retired=true;}});
        if(caches.has(analysisId)){await caches.get(analysisId).release();caches.delete(analysisId);}checkAbort(signal);
        caches.set(analysisId,{...rawOwner,status:'insufficient-support',mode,contexts:[],width,height,origin,imageId:task.imageId,windowId:window.id,fingerprint:window.fingerprint,provenance,metadata});pending.delete(rawOwner);
        return{id:task.id,imageId:task.imageId,operation:task.operation,status:'insufficient-support',cloneWindowMode:mode,analysisWindow:{...raw.analysisWindow,mode,nativeInputBounds:[...frame]},sourceRegionOrigin:origin,data:{width,height,metadata},layers:[],notice:{code:'NATIVE_SUPPORT_INSUFFICIENT',requiredCandidates:nativeSupport.requiredCandidates,availableCandidates:nativeSupport.availableCandidates},provenance,semantics:'Insufficient native support; no learned calculation and no negative model observation. The native TopK requirement remains unchanged.',transferOutputs(){requireValue(!closed&&!closing,'No-calculation response parent retired before adoption');checkAbort(signal);},metrics:{inferences:0,skippedBeforeInference:true,sourceObservations:{...raw.observations},nativeSupport,memory:budget.snapshot()}};
      }
      requireValue(raw.contexts?.length>0,'Exact completed within-window context bank required');
      // Charge copies before allocation. The learned producers and borrowed RGB
      // must ACK before these raw values enter cache or managed publication.
      const credit=budget.reserve(raw.contexts.length*65536*8);let released=false;
      rawOwner=own({imageId:task.imageId,async release(){if(released)return;released=true;credit();}});
      const contexts=raw.contexts.map(v=>{requireValue(v.probability instanceof Float32Array&&v.probability.length===65536&&v.logits instanceof Float32Array&&v.logits.length===65536,'Native single-channel context fields required');return{context:v.context,probability:new Float32Array(v.probability),logits:new Float32Array(v.logits)};});
      await retire(runner);await retryExcept(rawOwner);checkAbort(signal);
      const frame=plan.frame,origin=frame.slice(0,2),width=frame[2]-frame[0],height=frame[3]-frame[1];
      const metadata={analysisId,resultId:analysisId,inferences:5+2*contexts.length,cache_hits:0,raw_shape:[1,256,256],nativeWindowIdentity:raw.provenance.nativeWindowIdentity,sourceObservations:{...raw.observations},execution:raw.execution,windowContextBank:{windowId:window.id,windowFingerprint:window.fingerprint,contextIds:contexts.map(v=>v.context.id),receipt:raw.receipt},maskedOriginalCnnEquivalent:false};
      const provenance={...raw.provenance,engine:version,operation:task.operation,originalSha256:original.sha256,model:{variant:'mgcfdn-tnt',sha256:SEGMENTATION_MODELS['mgcfdn-tnt'].sha256,tailSha256:MGCFDN_TNT_WINDOW_SOURCE_SHA256,checkpointSha256:SEGMENTATION_MODELS['mgcfdn-tnt'].checkpointSha256,side:256,kind:'sigmoid'},params:structuredClone(task.params),analysisWindow:{id:window.id,kind:window.kind,bounds:[...window.bounds],nativeInputBounds:[...frame],candidateFingerprint:plan.candidateDomain.fingerprint,contextFingerprint:plan.contextDomain.fingerprint},windowContextBank:metadata.windowContextBank,layout:'segmented'};
      const projectionOwners=new Set();projection=projectionFactory({budget,onOwner:o=>{own(o);projectionOwners.add(o);}});own(projection);projectionOwners.add(projection);
      analysis=await projection.run({width,height,origin,contexts,candidateDomain:plan.candidateDomain,metadata,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession},{signal,onProgress:hooks.onProgress});checkAbort(signal);
      const ids=new Set();publishedOwner=own({async release(){
        // A failed store ACK remains reachable along with all public handles.
        await projection.release();await retireCompositeOwners([...ids].map(id=>async()=>{try{await releaseSurface(id);}catch(e){if(e?.code!=='NOT_FOUND')throw e;}ids.delete(id);}));
      }});
      published=await publishNeuralResult(analysis,task.imageId,provenance,{budget,signal,publishResult:(id,record)=>{const bundle=publishResult(id,record);for(const value of [bundle.surface,...Object.values(bundle.planeSurfaces??{}),...Object.values(bundle.maskSurfaces??{})])if(value?.id)ids.add(value.id);return bundle;}});checkAbort(signal);
      // Cache and surfaces have distinct parents. Model/cache retirement cannot
      // close a returned scientific field or its presentation/export handles.
      if(caches.has(analysisId)){await caches.get(analysisId).release();caches.delete(analysisId);}checkAbort(signal);
      caches.set(analysisId,{...rawOwner,mode,contexts,width,height,origin,imageId:task.imageId,windowId:window.id,fingerprint:window.fingerprint,provenance,metadata});pending.delete(rawOwner);
      let transferred=false;
      const transferOutputs=()=>{requireValue(!closed&&!closing,'Fragment publication parent retired before adoption');checkAbort(signal);if(transferred)return;transferred=true;for(const o of projectionOwners)pending.delete(o);pending.delete(publishedOwner);};
      // The facade checks cancellation and adopts synchronously on its own
      // continuation. Until then this producer owns the published handles.
      return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...published,transferOutputs,cloneWindowMode:mode,analysisWindow:{...raw.analysisWindow,mode,nativeInputBounds:[...frame]},sourceRegionOrigin:origin,provenance,semantics:mode==='global'?'One canonical union of declared contextual RGB minus true negatives, observed once per pixel. One native common bank/head precedes spatial projection of its decoded contexts. Explicit adaptation, not equivalence to an uncut masked CNN.':'One autonomous analysis window minus true negatives. Literal RGB fragments share this window only; native spatial projection places each decoded context. Explicit adaptation, not equivalence to an uncut masked CNN.',metrics:{inferences:metadata.inferences,execution:raw.execution,sourceObservations:{...raw.observations},memory:budget.snapshot()}};
    } catch(primary) {await retireCompositeOwners([...pending].map(o=>()=>retire(o)),{primary});throw primary;}
  }
  async function retryExcept(except){await retireCompositeOwners([...pending].filter(o=>o!==except).map(o=>()=>retire(o)));}
  return Object.freeze({
    run(input,hooks={}){requireValue(!closed&&!closing&&!active,'Fragment product busy or retired');const controller=new AbortController(),signal=AbortSignal.any([controller.signal,...(hooks.signal?[hooks.signal]:[])]),job={controller};active=job;job.promise=Promise.resolve().then(()=>work(input,hooks,signal)).finally(()=>{if(active===job)active=null;});return job.promise;},
    readRaw({imageId,resultId}){requireValue(!active&&!closing&&!closed,'Fragment product busy or retired');const value=caches.get(resultId);if(!value||value.imageId!==imageId)throw new EngineError('CACHE_MISS','No completed single-window fragment raw analysis');const credit=budget.reserve(value.contexts.length*65536*4);try{return{id:resultId,imageId,operation:'ai.clones.segmentation',status:value.status??'ok',cloneWindowMode:value.mode,data:{width:value.width,height:value.height,rawGrids:value.contexts.map(v=>({id:v.context.id,kind:'native-context',bounds:[...v.context.bounds],raw:new Float32Array(v.probability)})),metadata:{...structuredClone(value.metadata),raw_grids:value.contexts.map(v=>({id:v.context.id,kind:'native-context',bounds:[...v.context.bounds],analysis_shape:[...value.metadata.raw_shape]})),raw_coordinates:'Original pixels',originalOrigin:[...value.origin]}},provenance:{...structuredClone(value.provenance),output:value.status==='insufficient-support'?'no-model-output-insufficient-support':'raw-model-probabilities',rawCoordinates:'Original pixels'},layers:[],metrics:{inferences:0,memory:budget.snapshot()}};}finally{credit();}},
    async clearImage(id){requireValue(!active,'Fragment product busy');await retry();await clear(id);},
    async clearImages(){requireValue(!active,'Fragment product busy');await retry();await clear();},
    dispose(){if(closing)return closing;closed=true;active?.controller.abort();const running=active?.promise;closing=Promise.resolve().then(async()=>{await Promise.allSettled([running]);await retireCompositeOwners([retry,clear,...[...modelOwners].map(o=>async()=>{await(o.release??o.dispose).call(o);modelOwners.delete(o);})]);if(!modelOwners.size)models.clear();}).finally(()=>closing=undefined);return closing;}
  });
}
