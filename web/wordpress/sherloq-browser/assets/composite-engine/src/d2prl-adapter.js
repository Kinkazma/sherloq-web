import {createNeuralInput} from './neural-input.js';
import {createNeuralProjector} from './neural-projector.js';
import {publishNeuralResult} from './publish-neural-result.js';
import {EngineError, requireValue, checkAbort} from './errors.js';
import {createD2prlModel, readVerifiedModelAsset} from '../experiments/d2prl/model.js';
import {createD2prlAnalysis} from '../experiments/d2prl/analysis.js';
import {createD2prlZones} from '../experiments/d2prl/zones.js';
import {createPostprocess} from '../experiments/d2prl/postprocess.js';
import {createSpatial} from '../experiments/d2prl/spatial.js';
import {d2prlRuntime} from './d2prl-runtime.js';
import {D2PRL_MODEL_IDENTITY} from './d2prl-model-identity.js';
import {scientificJsonBound} from './scientific-json.js';

const OWN_OUTPUT=Symbol('owned D2PRL output');

export function createD2prlAdapter({budget, profile, version, publishResult}) {
  let manifest, manifestRelease, assetBaseUrl, identity, active, state;
  const clearState = async () => {if (!state) return; const old = state; state = null; await old.session.dispose(); old.pipeline.dispose(); old.postprocess.dispose(); old.spatial.dispose(); old.project.dispose();};
  const own = (envelope, result) => {
    const metadataRelease=budget.reserve(8192+8*scientificJsonBound({provenance:envelope.provenance,layers:envelope.layers,metrics:envelope.metrics}));let released=false,pending;
    return {...envelope,release(){if(released)return pending;released=true;try{pending=result.release();}catch(error){metadataRelease();throw error;}if(pending?.then){pending=Promise.resolve(pending).finally(metadataRelease);return pending;}metadataRelease();}};
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
    async run(task, image, {signal, onProgress, knownHeapBytes = 0, [OWN_OUTPUT]: ownedOutput = false} = {}) {
      if (!manifest) throw new EngineError('MODEL_UNAVAILABLE', 'Load the verified D2PRL manifest first');
      if (active) throw new EngineError('BUSY', 'D2PRL adapter busy');
      const inputSource=image.segmented?(image.neuralInput??=createNeuralInput(image.surface,{budget})):undefined,geometry=image.segmented?image.surface.descriptor:image.pixels;
      const params = task.params ?? {}; requireValue(Object.keys(params).every(k => ['minimum', 'exclusions', 'selectionPresent', 'refilterOf'].includes(k)), 'Unknown D2PRL parameter');
      const minimum = params.minimum ?? 500, exclusions = params.exclusions ?? [], regions = task.regions ?? [];
      requireValue(Number.isInteger(minimum) && minimum >= 0 && minimum <= 5000 && Array.isArray(regions) && Array.isArray(exclusions) && (params.selectionPresent === undefined || typeof params.selectionPresent === 'boolean'), 'D2PRL parameters');
      if (params.selectionPresent && !regions.length) throw new EngineError('INVALID_INPUT', 'No active D2PRL region');
      const requested = task.backend ?? 'auto'; requireValue(['auto', 'cpu', 'webgpu'].includes(requested), 'D2PRL backend');
      const refilter = params.refilterOf !== undefined;
      if (refilter) {
        requireValue(typeof params.refilterOf === 'string' && !task.regions && params.selectionPresent === undefined, 'Refilter the existing result without changing its zones');
        if (!state?.lastContext) throw new EngineError('CACHE_MISS', 'No completed model result; explicit analysis is required');
        requireValue(state.lastContext.imageId === task.imageId && state.lastContext.sha256 === image.sha256 && state.lastContext.analysisId === params.refilterOf, 'Refilter source or analysis identity differs');
        requireValue(requested === 'auto' || requested === (state.backend === 'gpu' ? 'webgpu' : 'cpu'), 'Refilter backend differs');
      }
      const backend = refilter ? state.backend : requested === 'cpu' ? 'cpu' : requested === 'webgpu' || globalThis.navigator?.gpu ? 'gpu' : 'cpu';
      checkAbort(signal); active = true; const started = performance.now(); let resident, result;
      try {
        resident = budget.reserve(knownHeapBytes);
        if (state && state.backend !== backend) await clearState();
        if (!state) {
          const runtime = await d2prlRuntime(); checkAbort(signal);
          const pipeline = await createD2prlModel({budget, model: manifest, assetBaseUrl, runtime, backend, maxWorkers: Math.min(32, profile.maxWorkers)});
          let postprocess, spatial;
          try {
            postprocess = createPostprocess({budget, moduleUrl: runtime.postprocessUrl}); spatial = createSpatial({budget, moduleUrl: runtime.spatialUrl}); const project = createNeuralProjector({budget,postprocess,family:'d2prl',side:448,contiguous:createD2prlZones({budget,postprocess,spatial})});
            const session = createD2prlAnalysis({budget, infer: (input, options) => pipeline.run(input, options), project, modelId: manifest.modelId}); state = {backend, pipeline, postprocess, spatial, project, session};
          } catch (error) {pipeline.dispose(); postprocess?.dispose(); spatial?.dispose(); throw error;}
        }
        checkAbort(signal);state.project.setImage(image);
        const zones = refilter ? state.lastContext.zones : regions.length ? regions : [{id: 'whole-image', kind: 'whole-image', bounds: [0, 0, geometry.width, geometry.height]}];
        const hooks = {signal, onProgress: e => onProgress?.({id: task.id, ...e})};
        result = refilter ? await state.session.refilter({analysisId: params.refilterOf, minimum, exclusions: params.exclusions, retainRaw: ownedOutput}, hooks) : await state.session.run({...(inputSource?{inputSource}:{pixels:image.pixels}), zones, mode: regions.length ? 'regions' : 'whole-image', exclusions, minimum, backend, retainRaw: ownedOutput, provenance: {originalSha256: image.sha256, decode: image.provenance}}, hooks);
        checkAbort(signal); const {release, ...data} = image.segmented?{width:result.width,height:result.height,metadata:result.metadata,...(ownedOutput?{layout:'segmented',stores:result.stores}:{})}:result;
        state.lastContext = {imageId: task.imageId, sha256: image.sha256, analysisId: data.metadata.analysisId, zones: structuredClone(zones)};
        const delivered = {id: task.id, imageId: task.imageId, operation: 'ai.clones.d2prl', status: 'ok', data,
          semantics: 'Union probability map and exact native union/target/source masks. Target/source are residual-sign roles, not class probabilities. Overlapping passes give one model vote.',
          layers: [{id: 'union', kind: 'mask', field: 'data.mask', width: data.width, height: data.height, origin: [0, 0], range: [0, 1]}, {id: 'probability', kind: 'scalar', field: 'data.map', width: data.width, height: data.height, origin: [0, 0], range: [0, 1]}, {id: 'target', kind: 'mask', field: 'data.target', width: data.width, height: data.height, origin: [0, 0], range: [0, 1]}, {id: 'source', kind: 'mask', field: 'data.source', width: data.width, height: data.height, origin: [0, 0], range: [0, 1]}],
          provenance: {engine: version, operation: 'ai.clones.d2prl', originalSha256: image.sha256, decode: structuredClone(image.provenance), params: {minimum, exclusions: structuredClone(data.metadata.exclusions)}, regions: structuredClone(zones), model: identity, backend: backend === 'gpu' ? 'webgpu-convolutions-wasm' : 'cpu-wasm', kernelParity: 'Declared synthetic native source/mask corpus; role residual tolerance <=1e-4 with unchanged decisions; not universal detector accuracy'},
          metrics: {totalMs: performance.now() - started, inferences: data.metadata.inferences, cache: {rawGrids: data.metadata.cache_hits}, memory: budget.snapshot()}};
        if(image.segmented&&!ownedOutput){const bundle=await publishNeuralResult(result,task.imageId,{...delivered.provenance,layout:'segmented'},{budget,publishResult,signal});delivered.metrics.projection=result.metrics;result=null;Object.assign(delivered,bundle);delivered.provenance.layout='segmented';delivered.metrics.memory=budget.snapshot();}
        state.lastProvenance = structuredClone(delivered.provenance);
        if(ownedOutput){const owned=own(delivered,result);result=null;return owned;}
        return delivered;
      } finally {await result?.release(); resident?.(); active = false;}
    },
    readRawOwned(input) {return this.readRaw({...input,[OWN_OUTPUT]:true});},
    readRaw({imageId, resultId, [OWN_OUTPUT]: ownedOutput = false}) {
      requireValue(!active, 'D2PRL adapter busy');
      if (!state?.lastContext) throw new EngineError('CACHE_MISS', 'No completed model result');
      requireValue(imageId === state.lastContext.imageId, 'Raw-grid source identity differs');
      let result = state.session.readRaw(resultId);
      try {const {release, ...data} = result;const delivered={id: resultId, imageId, operation: 'ai.clones.d2prl', status: 'ok', data, layers: [], provenance: {...structuredClone(state.lastProvenance), output: 'raw-model-grids-before-postprocess'}, metrics: {inferences: 0, memory: budget.snapshot()}};if(ownedOutput){const owned=own(delivered,result);result=null;return owned;}return delivered;}
      finally {result?.release();}
    },
    async clearImages() {requireValue(!active, 'D2PRL adapter busy'); await clearState();},
    async dispose() {requireValue(!active, 'D2PRL adapter busy'); await clearState(); manifest = null; identity = null; assetBaseUrl = null; manifestRelease?.(); manifestRelease = null;}
  };
}
