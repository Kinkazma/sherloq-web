import "../../runtime-context.js?v=0.30.0";
import {createMgcfdnEffnetWindowFragmentRun} from './mgcfdn-effnet-window-fragment-run.js';
import {createMgcfdnProductProjection} from './mgcfdn-product-projection.js';
import {publishNeuralResult} from './publish-neural-result.js';
import {MGCFDN_EFFNET_WINDOW_SOURCE_SHA256} from './mgcfdn-effnet-window-context-graph.js';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

// Product publication for a SINGLE autonomous window with true negatives.
// The frozen encoder/head compute its context bank; no other window enters it.
// Rectangle jobs continue through the existing segmentation adapter.
export function createMgcfdnEffnetWindowFragmentProduct({budget,profile,version,publishResult,releaseSurface,runFactory=createMgcfdnEffnetWindowFragmentRun,projectionFactory=createMgcfdnProductProjection}={}) {
  requireValue(typeof publishResult==='function'&&typeof releaseSurface==='function','Acknowledged managed result registry required');
  const caches=new Map(),pending=new Set();let active,closing,closed=false;
  const own=o=>{requireValue(o&&typeof(o.release??o.dispose)==='function','Fragment product owner required');pending.add(o);return o;};
  const retire=async o=>{await(o.release??o.dispose).call(o);pending.delete(o);};
  const retry=()=>retireCompositeOwners([...pending].map(o=>()=>retire(o)));
  const clear=async id=>{for(const[key,value]of caches)if(id===undefined||value.imageId===id){await value.release();caches.delete(key);}};
  async function work({task,original,window,backend,config,plan,mode=task.cloneWindowMode??'independent'},hooks,signal) {
    await retry();checkAbort(signal);
    requireValue(['independent','global'].includes(mode)&&mode===(task.cloneWindowMode??'independent'),'Requested and executed native context-bank mode must agree');
    requireValue(config.variant==='mgcfdn-effnet'&&task.params?.variant==='mgcfdn-effnet'&&plan.fragmented&&['cpu','webgpu'].includes(backend),'MGCFDN_EFFNET single-window exclusion route required');
    requireValue(config.bytes===SEGMENTATION_MODELS['mgcfdn-effnet'].bytes&&config.sha256===MGCFDN_EFFNET_WINDOW_SOURCE_SHA256,'Original pinned MGCFDN_EFFNET model required');
    requireValue(Object.keys(task.params).every(k=>['variant','selectionPresent','reprojectOf','zoneIds','exclusions','compare','scientificScope'].includes(k))&&(task.params.compare===undefined||task.params.compare===false),'Native MGCFDN_EFFNET parameter contract required');
    if(task.params.reprojectOf!==undefined)throw new EngineError('CACHE_MISS','Fragment views require their retained raw analysis; no learned fallback is permitted');
    requireValue(task.params.zoneIds===undefined,'A context subset requires cache-only reprojection');
    const analysisId=task.id+':window-fragments:'+(mode==='global'?'global:':'')+backend+':'+window.fingerprint;
    requireValue(caches.size<256||caches.has(analysisId),'Retire old single-window fragment raw analyses explicitly');
    let runner,raw,rawOwner,projection,analysis,published,publishedOwner;
    try {
      const urls={base:backend==='webgpu'?(config.gpu?.url??config.url):config.url};
      runner=runFactory({original,window,backend,urls,cloneWindowMode:mode},{budget,profile,signal,onOwner:own});own(runner);
      raw=await runner.run();checkAbort(signal);
      requireValue(raw.cloneWindowMode===mode&&raw.provenance?.cloneWindowMode===mode&&raw.analysisWindow?.fingerprint===window.fingerprint&&raw.contexts?.length>0,'Exact completed within-window context bank required');
      // Charge copies before allocation. The learned producers and borrowed RGB
      // must ACK before these raw values enter cache or managed publication.
      const credit=budget.reserve(raw.contexts.length*65536*8);let released=false;
      rawOwner=own({imageId:task.imageId,async release(){if(released)return;released=true;credit();}});
      const contexts=raw.contexts.map(v=>{requireValue(v.probability instanceof Float32Array&&v.probability.length===65536&&v.logits instanceof Float32Array&&v.logits.length===65536,'Native single-channel context fields required');return{context:v.context,probability:new Float32Array(v.probability),logits:new Float32Array(v.logits)};});
      await retire(runner);await retryExcept(rawOwner);checkAbort(signal);
      const frame=plan.frame,origin=frame.slice(0,2),width=frame[2]-frame[0],height=frame[3]-frame[1];
      const metadata={analysisId,resultId:analysisId,inferences:4*contexts.length+3,cache_hits:0,raw_shape:[1,256,256],nativeWindowIdentity:raw.provenance.nativeWindowIdentity,sourceObservations:{...raw.observations},execution:raw.execution,windowContextBank:{windowId:window.id,windowFingerprint:window.fingerprint,contextIds:contexts.map(v=>v.context.id),receipt:raw.receipt},maskedOriginalCnnEquivalent:false};
      const provenance={...raw.provenance,engine:version,operation:task.operation,originalSha256:original.sha256,model:{variant:'mgcfdn-effnet',sha256:MGCFDN_EFFNET_WINDOW_SOURCE_SHA256,side:256,kind:'sigmoid'},params:structuredClone(task.params),analysisWindow:{id:window.id,kind:window.kind,bounds:[...window.bounds],nativeInputBounds:[...frame],candidateFingerprint:plan.candidateDomain.fingerprint,contextFingerprint:plan.contextDomain.fingerprint},windowContextBank:metadata.windowContextBank,layout:'segmented'};
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
      return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...published,transferOutputs,cloneWindowMode:mode,analysisWindow:{...raw.analysisWindow,mode,nativeInputBounds:[...frame]},sourceRegionOrigin:origin,provenance,semantics:'One autonomous analysis window minus true negatives. Literal RGB fragments share this window only; native spatial projection places each decoded context. Explicit adaptation, not equivalence to an uncut masked CNN.',metrics:{inferences:metadata.inferences,execution:raw.execution,sourceObservations:{...raw.observations},memory:budget.snapshot()}};
    } catch(primary) {await retireCompositeOwners([...pending].map(o=>()=>retire(o)),{primary});throw primary;}
  }
  async function retryExcept(except){await retireCompositeOwners([...pending].filter(o=>o!==except).map(o=>()=>retire(o)));}
  return Object.freeze({
    run(input,hooks={}){requireValue(!closed&&!closing&&!active,'Fragment product busy or retired');const controller=new AbortController(),signal=AbortSignal.any([controller.signal,...(hooks.signal?[hooks.signal]:[])]),job={controller};active=job;job.promise=Promise.resolve().then(()=>work(input,hooks,signal)).finally(()=>{if(active===job)active=null;});return job.promise;},
    readRaw({imageId,resultId}){requireValue(!active&&!closing&&!closed,'Fragment product busy or retired');const value=caches.get(resultId);if(!value||value.imageId!==imageId)throw new EngineError('CACHE_MISS','No completed single-window fragment raw analysis');const credit=budget.reserve(value.contexts.length*65536*4);try{return{id:resultId,imageId,operation:'ai.clones.segmentation',status:'ok',cloneWindowMode:value.mode,data:{width:value.width,height:value.height,rawGrids:value.contexts.map(v=>({id:v.context.id,kind:'native-context',bounds:[...v.context.bounds],raw:new Float32Array(v.probability)})),metadata:{...structuredClone(value.metadata),raw_grids:value.contexts.map(v=>({id:v.context.id,kind:'native-context',bounds:[...v.context.bounds],analysis_shape:[...value.metadata.raw_shape]})),raw_coordinates:'Original pixels',originalOrigin:[...value.origin]}},provenance:{...structuredClone(value.provenance),output:'raw-model-probabilities',rawCoordinates:'Original pixels'},layers:[],metrics:{inferences:0,memory:budget.snapshot()}};}finally{credit();}},
    async clearImage(id){requireValue(!active,'Fragment product busy');await retry();await clear(id);},
    async clearImages(){requireValue(!active,'Fragment product busy');await retry();await clear();},
    dispose(){if(closing)return closing;closed=true;active?.controller.abort();const running=active?.promise;closing=Promise.resolve().then(async()=>{await Promise.allSettled([running]);await retry();await clear();}).finally(()=>closing=undefined);return closing;}
  });
}
