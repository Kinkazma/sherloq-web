import {noisesnifferOwnerRetirement as retirement} from './noisesniffer-owner-retirement.js';
import {prepareNeuralScientificScope,emptyScopedNeuralResult,neuralScientificScopeIdentity} from './neural-scientific-scope.js';
import {createNeuralInput} from './neural-input.js';
import {createNeuralProjector} from './neural-projector.js';
import {publishNeuralResult} from './publish-neural-result.js';
import {EngineError, requireValue, checkAbort, serializeEngineError} from './errors.js';
import {createD2prlModel, readVerifiedModelAsset} from '../experiments/d2prl/model.js';
import {createD2prlAnalysis} from '../experiments/d2prl/analysis.js';
import {createD2prlZones} from '../experiments/d2prl/zones.js';
import {createPostprocess} from '../experiments/d2prl/postprocess.js';
import {createSpatial} from '../experiments/d2prl/spatial.js';
import {d2prlRuntime} from './d2prl-runtime.js';
import {D2PRL_MODEL_IDENTITY} from './d2prl-model-identity.js';
import {scientificJsonBound} from './scientific-json.js';
import {withD2prlActivity} from '../experiments/d2prl/resource-activity.js';

const OWN_OUTPUT=Symbol('owned D2PRL output');

export function createD2prlAdapter({budget, profile, version, publishResult}) {
  let manifest, manifestRelease, assetBaseUrl, identity, active, state;
  const disposeAll=async(resources,failure)=>{const additional=[];for(const resource of resources)try{await resource?.dispose?.();}catch(error){if(failure)additional.push(serializeEngineError(error));else failure=error;}if(failure){if(additional.length&&typeof failure==='object')failure.details={...failure.details,cleanupFailures:additional};throw failure;}};
  const clearState = async () => {if(!state)return;const old=state;old.retirement??=retirement([old.strictSession,old.strictSpatial,old.session,old.pipeline,old.postprocess,old.spatial,old.project].filter(Boolean).map(owner=>()=>owner.dispose?.()));await old.retirement();if(state===old)state=null;};
  const own = (envelope, result) => {
    const metadataRelease=budget.reserve(8192+8*scientificJsonBound({provenance:envelope.provenance,layers:envelope.layers,metrics:envelope.metrics})),output=retirement([()=>result.release()]),metadata=retirement([metadataRelease]),release=retirement([async()=>{await output();await metadata();}]);
    return {...envelope,release};
  };
  return {
    configured() {return Boolean(manifest);},
    async load(input, {signal} = {}) {
      requireValue(!active && !manifest, 'Unload the current D2PRL manifest before loading another');
      requireValue(typeof input?.url === 'string' && Number.isInteger(input.bytes) && input.bytes > 0 && input.bytes <= 2 * 1024 ** 2 && /^[0-9a-f]{64}$/.test(input.sha256), 'Pinned D2PRL manifest URL, size and SHA256 required');
      if (input.bytes !== D2PRL_MODEL_IDENTITY.bytes || input.sha256 !== D2PRL_MODEL_IDENTITY.sha256) throw new EngineError('MODEL_IDENTITY', 'This D2PRL conversion is not qualified by this runtime');
      let manifestUrl; try {manifestUrl = new URL(input.url);} catch {throw new EngineError('INVALID_INPUT', 'Absolute D2PRL manifest URL required');}
      const release = budget.reserve(input.bytes * 4); let complete = false;
      try {
        const bytes = await readVerifiedModelAsset(manifestUrl.href, input, {signal}), candidate = JSON.parse(new TextDecoder().decode(bytes)); checkAbort(signal);
        requireValue(candidate.schema === 1 && candidate.side === 448 && candidate.iterations === 40 && candidate.seed === 22 && candidate.referenceThreads === 8 && typeof candidate.modelId === 'string' && candidate.checkpointSha256 === '2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36', 'Unsupported D2PRL model manifest');
        manifest = candidate; identity = {bytes: input.bytes, sha256: input.sha256, modelId: candidate.modelId, checkpointSha256: candidate.checkpointSha256}; assetBaseUrl = new URL('.', input.url).href; manifestRelease = release; complete = true;
        return {...identity, parametersFetched: false, runtimeInferencePerformed: false};
      } finally {if (!complete) release();}
    },
    async runOwned(task,image,hooks={}) {return this.run(task,image,{...hooks,[OWN_OUTPUT]:true});},
    async run(task, image, {signal, onProgress, knownHeapBytes = 0, checkpointKey, resourceOperation, [OWN_OUTPUT]: ownedOutput = false} = {}) {
      if (!manifest) throw new EngineError('MODEL_UNAVAILABLE', 'Load the verified D2PRL manifest first');
      if (active) throw new EngineError('BUSY', 'D2PRL adapter busy');
      const inputSource=image.segmented?(image.neuralInput??=createNeuralInput(image.surface,{budget})):undefined,geometry=image.segmented?image.surface.descriptor:image.pixels;
      const params = task.params ?? {}; requireValue(Object.keys(params).every(k => ['minimum', 'exclusions', 'selectionPresent', 'refilterOf', 'scientificScope'].includes(k)), 'Unknown D2PRL parameter');
      const minimum = params.minimum ?? 500, exclusions = params.exclusions ?? [], regions = task.regions ?? [];
      requireValue(Number.isInteger(minimum) && minimum >= 0 && minimum <= 5000 && Array.isArray(regions) && Array.isArray(exclusions) && (params.selectionPresent === undefined || typeof params.selectionPresent === 'boolean'), 'D2PRL parameters');
      if (params.selectionPresent && !regions.length) throw new EngineError('INVALID_INPUT', 'No active D2PRL region');
      const requested = task.backend ?? 'auto'; requireValue(['auto', 'cpu', 'webgpu'].includes(requested), 'D2PRL backend');
      const refilter = params.refilterOf !== undefined,temporary=task.retainedD2Preview===true;requireValue(task.retainedD2Preview===undefined||typeof task.retainedD2Preview==='boolean','Invalid retained D2PRL preview marker');requireValue(!temporary||refilter,'A retained D2PRL preview can only refilter an existing analysis');
      const cloneWindowMode=task.cloneWindowMode??(refilter?state?.lastContext?.cloneWindowMode:undefined)??'independent';requireValue(['independent','global'].includes(cloneWindowMode),'Invalid D2PRL clone window mode.');
      task={...task,cloneWindowMode};
      const strictRequest=refilter?state?.lastContext?.mode==='strict':cloneWindowMode==='global'||!!image.sourceRegionDomain||params.scientificScope!==undefined||exclusions.length>0;
      if (refilter) {
        requireValue(typeof params.refilterOf === 'string' && !task.regions && params.selectionPresent === undefined, 'Refilter the existing result without changing its zones');
        if (!state?.lastContext) throw new EngineError('CACHE_MISS', 'No completed model result; explicit analysis is required');
        requireValue(cloneWindowMode===state.lastContext.cloneWindowMode,'Refilter clone window mode differs; a new analysis is required');
        requireValue(state.lastContext.imageId === task.imageId && state.lastContext.sha256 === image.sha256 && state.lastContext.analysisId === params.refilterOf, 'Refilter source or analysis identity differs');
        requireValue(params.scientificScope===undefined||neuralScientificScopeIdentity(params.scientificScope,{width:geometry.width,height:geometry.height,sourceSha256:image.sha256})===state.lastContext.scopeIdentity,'Refilter scientific scope differs; a new scoped inference is required');
        if(state.lastContext.mode==='strict'&&params.exclusions!==undefined)requireValue(JSON.stringify(params.exclusions)===JSON.stringify(state.lastContext.strictExclusionsNative),'Refilter cannot change strict upstream RGB exclusions; a new scoped inference is required');
        requireValue(requested === 'auto' || requested === (state.backend === 'gpu' ? 'webgpu' : 'cpu'), 'Refilter backend differs');
      }
      const backend = refilter ? state.backend : requested === 'cpu' ? 'cpu' : requested === 'webgpu' || globalThis.navigator?.gpu ? 'gpu' : 'cpu';
      checkAbort(signal); active = true; const started = performance.now(); let resident, result,scientificScope,strictPrepared,strictDomain,failure;
      try {
        resident = budget.reserve(knownHeapBytes);
        const requestedZones=regions.length?regions:[{id:'whole-image',kind:'whole-image',bounds:[0,0,geometry.width,geometry.height]}];
        if(!refilter&&strictRequest){
          const [{compileOriginalSourceRegions,createOriginalSourceRegionsState},{prepareNeuralStrictSourceContext}]=await Promise.all([import('./source-region-geometry.js'),import('./neural-strict-source-context.js')]);checkAbort(signal);
          const original=image.originalSource??image,descriptor=original.surface?.descriptor??original.pixels;
          requireValue(descriptor&&original.sha256===image.sha256,'Strict D2PRL original source identity required');
          strictDomain=image.sourceRegionDomain?await compileOriginalSourceRegions(image.sourceRegionDomain):await compileOriginalSourceRegions((await createOriginalSourceRegionsState({sourceSha256:original.sha256,width:descriptor.width,height:descriptor.height})).snapshot());
          try{strictPrepared=await prepareNeuralStrictSourceContext({domain:strictDomain,task},{budget,signal});}
          catch(error){if(error.code!=='SOURCE_SCOPE_EMPTY')throw error;checkAbort(signal);
            result=emptyScopedNeuralResult({width:geometry.width,height:geometry.height,segmented:!!image.segmented,roles:true,budget,metadata:{cloneWindowMode,scientificScope:{schema:'sherloq.neural-strict-source-context/1',stage:'fully-cancelled-before-inference',skippedZones:requestedZones.map(z=>({id:z.id,reason:'no-native-candidate-pixels'}))},analysisId:task.id,resultId:task.id,min_component:minimum,exclusions:[],inferences:0,strictSourceContext:{empty:true,beforeModelCreation:true}}});
            const provenance={engine:version,operation:'ai.clones.d2prl',cloneWindowMode,originalSha256:image.sha256,decode:structuredClone(image.provenance),params:{minimum},regions:[],model:identity,backend:'not-executed',strictSourceContext:result.metadata.strictSourceContext};const{release,dispose,...data}=result,delivered={id:task.id,imageId:task.imageId,operation:'ai.clones.d2prl',cloneWindowMode,status:'no-regions',data:image.segmented?{width:result.width,height:result.height,metadata:result.metadata,...(ownedOutput?{layout:'segmented',stores:result.stores}:{})}:data,provenance,metrics:{inferences:0,skippedBeforeInference:true},layers:[]};
            if(image.segmented&&!ownedOutput){Object.assign(delivered,await publishNeuralResult(result,task.imageId,provenance,{budget,publishResult,signal}));result=null;}if(ownedOutput){const owned=own(delivered,result);result=null;return owned;}return delivered;
          }
        }
        if(!refilter&&!strictRequest)scientificScope=await prepareNeuralScientificScope(params.scientificScope,requestedZones,{width:geometry.width,height:geometry.height,sourceSha256:image.sha256,side:448,budget,signal});
        if(scientificScope&&!scientificScope.zones.length){if(state)state.lastContext=null;
          result=emptyScopedNeuralResult({width:geometry.width,height:geometry.height,segmented:!!image.segmented,roles:true,budget,metadata:{cloneWindowMode,scientificScope:{...scientificScope.metadata,stage:'fully-cancelled-before-inference'},analysisId:task.id,resultId:task.id,min_component:minimum,exclusions:[],inferences:0}});
          const provenance={engine:version,operation:'ai.clones.d2prl',cloneWindowMode,originalSha256:image.sha256,decode:structuredClone(image.provenance),params:{minimum,scientificScope:scientificScope.metadata},regions:[],model:identity,backend:'not-executed',scientificScope:result.metadata.scientificScope};
          const {release:emptyRelease,dispose:emptyDispose,...emptyData}=result;
          const delivered={id:task.id,imageId:task.imageId,operation:'ai.clones.d2prl',cloneWindowMode,status:'no-regions',data:image.segmented?{width:result.width,height:result.height,metadata:result.metadata,...(ownedOutput?{layout:'segmented',stores:result.stores}:{})}:emptyData,provenance,metrics:{inferences:0,skippedBeforeInference:true},layers:[]};
          if(image.segmented&&!ownedOutput){Object.assign(delivered,await publishNeuralResult(result,task.imageId,provenance,{budget,publishResult,signal}));result=null;}
          if(ownedOutput){const owned=own(delivered,result);result=null;return owned;}return delivered;
        }
        if (state && (state.retirement || state.backend !== backend)) await clearState();
        if (!state) {
          const runtime = await withD2prlActivity(budget,'d2prl:runtime-import','io',d2prlRuntime); checkAbort(signal);
          const pipeline = await createD2prlModel({budget, model: manifest, assetBaseUrl, runtime, backend, maxWorkers: Math.min(64, profile.maxWorkers)});
          let postprocess, spatial;
          try {
            postprocess = createPostprocess({budget, moduleUrl: runtime.postprocessUrl}); spatial = createSpatial({budget, moduleUrl: runtime.spatialUrl}); const project = createNeuralProjector({budget,postprocess,family:'d2prl',side:448,contiguous:createD2prlZones({budget,postprocess,spatial})});
            const session = createD2prlAnalysis({budget, infer: (input, options) => pipeline.run(input, options),releaseInferenceCheckpoint:key=>pipeline.releaseCheckpoint(key),project, modelId: manifest.modelId}); state = {backend, pipeline, postprocess, spatial, project, session};
          } catch (error) {await disposeAll([pipeline,postprocess,spatial],error);}
        }
        checkAbort(signal);
        if(strictRequest){
          const [{createStrictD2PRLAnalysis},{compileOriginalSourceRegions,createOriginalSourceRegionsState}]=await Promise.all([import('../experiments/d2prl/strict-analysis.js'),import('./source-region-geometry.js')]);checkAbort(signal);
          if(!state.strictSession){let rowSpatial;try{const [{createNeuralSpatialRows},{default:factory}]=await Promise.all([import('./neural-spatial-rows.js'),import('../vendor/segmentation/spatial-bands.js')]);checkAbort(signal);rowSpatial=await createNeuralSpatialRows(factory,{budget});checkAbort(signal);const strictSession=createStrictD2PRLAnalysis({budget,pipeline:state.pipeline,postprocess:state.postprocess,spatial:rowSpatial,modelId:manifest.modelId,backend});state.strictSpatial=rowSpatial;state.strictSession=strictSession;rowSpatial=null;}finally{rowSpatial?.dispose();}}
          const hooks={signal,checkpointKey,resourceOperation,onProgress:e=>onProgress?.({id:task.id,...e})};
          if(refilter)result=await state.strictSession.refilter({analysisId:params.refilterOf,minimum,...(temporary?{publish:false}:{})},hooks);
          else{
            const original=image.originalSource??image,descriptor=original.surface?.descriptor??original.pixels;
            requireValue(descriptor?.format==='rgb8'&&original.sha256===image.sha256&&typeof original.surface?.readWindow==='function','Strict D2PRL needs the verified original native RGB reader');
            const domain=strictDomain;checkAbort(signal);
            requireValue(domain.sourceSha256===original.sha256&&domain.sourceWidth===descriptor.width&&domain.sourceHeight===descriptor.height&&domain.width===geometry.width&&domain.height===geometry.height,'Strict D2PRL original, derived frame and source grid differ');
            const source=Object.freeze({width:descriptor.width,height:descriptor.height,sha256:original.sha256,readWindow:(r,options)=>original.surface.readWindow(r,options),temporarySession:original.session,getTemporarySession:original.ensureTemporarySession?options=>original.ensureTemporarySession(options):undefined});
            result=await state.strictSession.run({domain,task,source,minimum,takePreparedContext:()=>{const value=strictPrepared;strictPrepared=null;return value;},provenance:{originalSha256:original.sha256,decode:structuredClone(original.provenance)}},hooks);
          }
          checkAbort(signal);const data={width:result.width,height:result.height,metadata:result.metadata,...(ownedOutput?{layout:'segmented',stores:result.stores}:{})},delivered={id:task.id,imageId:task.imageId,operation:'ai.clones.d2prl',cloneWindowMode,status:'ok',data,layers:[],semantics:cloneWindowMode==='global'?'One common native bank from the union of declared windows, each Original pixel once; true exclusions removed before CNN/descriptor inputs. Native448 grids, matching and residual-sign processors retained.':'Native independent acquisition and explicitly declared envelope jobs; every genuine RGB exclusion removed before CNN/descriptor inputs. Native residual-sign processors retained.',provenance:{engine:version,operation:'ai.clones.d2prl',cloneWindowMode,originalSha256:image.sha256,decode:structuredClone(image.provenance),params:{minimum},model:identity,backend:backend==='gpu'?'webgpu-convolutions-wasm':'cpu-wasm',strictSourceContext:structuredClone(data.metadata.strictSourceContext),regions:data.metadata.zones.map(z=>({id:z.id,kind:z.kind,bounds:z.bounds,originalBounds:z.originalBounds})),kernelParity:'Pinned model weights, native448 grids,40 iterations and numerical kernels; native fragment shapes intentionally differ when exclusions partition context. No universal inter-shape bit-identity claim.'},metrics:{totalMs:performance.now()-started,inferences:data.metadata.inferences,cache:{rawGrids:data.metadata.cache_hits},projection:result.metrics,memory:budget.snapshot()}};
          if(!ownedOutput){Object.assign(delivered,await publishNeuralResult(result,task.imageId,delivered.provenance,{budget,publishResult,signal}));result=null;}
          if(!temporary){state.lastContext={mode:'strict',cloneWindowMode,imageId:task.imageId,sha256:image.sha256,analysisId:data.metadata.analysisId,strictExclusionsNative:refilter?state.lastContext.strictExclusionsNative:structuredClone(exclusions),scopeIdentity:refilter?state.lastContext.scopeIdentity:params.scientificScope===undefined?undefined:neuralScientificScopeIdentity(params.scientificScope,{width:geometry.width,height:geometry.height,sourceSha256:image.sha256})};state.lastProvenance=structuredClone(delivered.provenance);}
          if(ownedOutput){const owned=own(delivered,result);result=null;return owned;}return delivered;
        }
        state.project.setImage(image);
        const zones = refilter ? state.lastContext.zones : scientificScope?.zones??requestedZones;
        const hooks = {signal,checkpointKey,resourceOperation,onProgress: e => onProgress?.({id: task.id, ...e})};
        result = refilter ? await state.session.refilter({analysisId: params.refilterOf, minimum, exclusions: params.exclusions, retainRaw: ownedOutput,...(temporary?{publish:false}:{})}, hooks) : await state.session.run({...(inputSource?{inputSource}:{pixels:image.pixels}), zones, mode: regions.length ? 'regions' : 'whole-image', exclusions, minimum, backend, retainRaw: ownedOutput,...(scientificScope?{scientificScope}:{}), provenance: {originalSha256: image.sha256, decode: image.provenance}}, hooks);
        checkAbort(signal);result.metadata.cloneWindowMode='independent'; const {release, ...data} = image.segmented?{width:result.width,height:result.height,metadata:result.metadata,...(ownedOutput?{layout:'segmented',stores:result.stores}:{})}:result;
        if(!temporary)state.lastContext = {mode:'legacy',cloneWindowMode,imageId: task.imageId, sha256: image.sha256, analysisId: data.metadata.analysisId,scopeFingerprint:data.metadata.scientificScope?.fingerprint,scopeIdentity:refilter?state.lastContext.scopeIdentity:scientificScope?.identity, zones: structuredClone(zones)};
        const delivered = {id: task.id, imageId: task.imageId, operation: 'ai.clones.d2prl', cloneWindowMode, status: 'ok', data,
          semantics: 'Union probability map and exact native union/target/source masks. Target/source are residual-sign roles, not class probabilities. Overlapping passes give one model vote.',
          layers: [{id: 'union', kind: 'mask', field: 'data.mask', width: data.width, height: data.height, origin: [0, 0], range: [0, 1]}, {id: 'probability', kind: 'scalar', field: 'data.map', width: data.width, height: data.height, origin: [0, 0], range: [0, 1]}, {id: 'target', kind: 'mask', field: 'data.target', width: data.width, height: data.height, origin: [0, 0], range: [0, 1]}, {id: 'source', kind: 'mask', field: 'data.source', width: data.width, height: data.height, origin: [0, 0], range: [0, 1]}],
          provenance: {engine: version, operation: 'ai.clones.d2prl', cloneWindowMode, originalSha256: image.sha256, decode: structuredClone(image.provenance),...(data.metadata.scientificScope?{scientificScope:data.metadata.scientificScope}:{}), params: {minimum, exclusions: structuredClone(data.metadata.exclusions)}, regions: structuredClone(zones), model: identity, backend: backend === 'gpu' ? 'webgpu-convolutions-wasm' : 'cpu-wasm', kernelParity:data.metadata.scientificScope?'Pinned numerical kernels unchanged; scoped candidate membership intentionally changes matching outputs; no unscoped decision-parity claim.':'Declared synthetic native source/mask corpus; role residual tolerance <=1e-4 with unchanged decisions; not universal detector accuracy'},
          metrics: {totalMs: performance.now() - started, inferences: data.metadata.inferences, cache: {rawGrids: data.metadata.cache_hits}, memory: budget.snapshot()}};
        state.session.rememberResultProvenance(result.metadata.resultId,delivered.provenance);
        if(image.segmented&&!ownedOutput){const bundle=await publishNeuralResult(result,task.imageId,{...delivered.provenance,layout:'segmented'},{budget,publishResult,signal});delivered.metrics.projection=result.metrics;result=null;Object.assign(delivered,bundle);delivered.provenance.layout='segmented';delivered.metrics.memory=budget.snapshot();}
        if(!temporary)state.lastProvenance = structuredClone(delivered.provenance);
        if(ownedOutput){const owned=own(delivered,result);result=null;return owned;}
        return delivered;
      }catch(error){failure=error;throw error;}finally{try{await disposeAll([{dispose:()=>result?.release()},{dispose:()=>scientificScope?.release()},{dispose:()=>strictPrepared?.release()},{dispose:()=>resident?.()}],failure);}finally{active=false;}}
    },
    resolveResultAnalysisId(resultId){return state?.strictSession?.resolveResultAnalysisId(resultId)??state?.session.resolveResultAnalysisId(resultId);},
    readRawOwned(input) {return this.readRaw({...input,[OWN_OUTPUT]:true});},
    readRaw({imageId, resultId, [OWN_OUTPUT]: ownedOutput = false}) {
      requireValue(!active, 'D2PRL adapter busy');
      if (!state?.lastContext) throw new EngineError('CACHE_MISS', 'No completed model result');
      requireValue(imageId === state.lastContext.imageId, 'Raw-grid source identity differs');
      const cloneWindowMode=state.lastContext.cloneWindowMode;
      if(state.lastContext.mode==='strict'){
        const provenance=structuredClone(state.lastProvenance),session=state.strictSession;
        return (async()=>{let result=await session.readRaw(resultId);try{const{release,...data}=result,cloneWindowMode=data.metadata.cloneWindowMode;requireValue(['independent','global'].includes(cloneWindowMode),'Retained strict raw result must retain its executed mode');const delivered={id:resultId,imageId,operation:'ai.clones.d2prl',cloneWindowMode,status:'ok',data,layers:[],provenance:{engine:version,operation:'ai.clones.d2prl',cloneWindowMode,originalSha256:data.metadata.sourceSha256,decode:structuredClone(data.metadata.sourceProvenance?.decode??provenance.decode),model:identity,backend:data.metadata.backend,strictSourceContext:structuredClone(data.metadata.strictSourceContext),regions:structuredClone(data.metadata.zones),output:'raw-model-fragments-before-postprocess'},metrics:{inferences:0,memory:budget.snapshot()}};if(ownedOutput){const output=own(delivered,result);result=null;return output;}return delivered;}finally{await result?.release();}})();
      }
      let result = state.session.readRaw(resultId);
      try {const {release, resultProvenance, ...data} = result;const delivered={id: resultId, imageId, operation: 'ai.clones.d2prl', cloneWindowMode, status: 'ok', data, layers: [], provenance: {...structuredClone(resultProvenance??state.lastProvenance), output: 'raw-model-grids-before-postprocess'}, metrics: {inferences: 0, memory: budget.snapshot()}};if(ownedOutput){const owned=own(delivered,result);result=null;return owned;}return delivered;}
      finally {result?.release();}
    },
    releaseCheckpoint(key){requireValue(!active,'D2PRL adapter busy');if(!state?.strictSession)return state?.session.releaseCheckpoint(key);return disposeAll([{dispose:()=>state.strictSession.releaseCheckpoint(key)},{dispose:()=>state.session.releaseCheckpoint(key)}]);},
    async clearImage(id) {requireValue(!active,'Neural adapter busy');if(state?.lastContext?.imageId===id)await clearState();},
    async clearImages() {requireValue(!active, 'D2PRL adapter busy'); await clearState();},
    async dispose() {requireValue(!active, 'D2PRL adapter busy'); try{await clearState();}finally{manifest = null; identity = null; assetBaseUrl = null; manifestRelease?.(); manifestRelease = null;}}
  };
}
