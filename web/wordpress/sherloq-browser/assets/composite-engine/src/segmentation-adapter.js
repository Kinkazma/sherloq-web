import "../../runtime-context.js?v=0.14.5";
import {createNeuralInput} from './neural-input.js';
import {createNeuralProjector} from './neural-projector.js';
import {publishNeuralResult} from './publish-neural-result.js';
import {EngineError, requireValue, checkAbort} from './errors.js';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
import {createSegmentationPrepare} from '../experiments/segmentation/prepare.js';
import {createSegmentationInference} from '../experiments/segmentation/inference.js';
import {createSegmentationZones} from '../experiments/segmentation/zones.js';
import {createSegmentationAnalysis} from '../experiments/segmentation/analysis.js';
import {createSpatial} from '../experiments/d2prl/spatial.js';
import {selectSegmentationBackend} from '../experiments/segmentation/backend.js';

export function createSegmentationAdapter({budget, version, publishResult}) {
  let config, state, active = false;
  const clearState = async () => {if (!state) return; const old = state; state = null; await old.session.dispose(); old.inference.dispose(); old.prepare.dispose(); old.spatial.dispose(); old.project.dispose();};
  return {
    configured() {return config?.variant ?? null;},
    backends() {return config?.gpuModelUrl ? ['cpu', 'webgpu'] : ['cpu'];},
    async load(input, {signal} = {}) {
      requireValue(!active && !config, 'Unload the configured segmentation model before changing it');
      requireValue(input && Object.hasOwn(SEGMENTATION_MODELS, input.variant), 'Segmentation variant unavailable');
      const model = SEGMENTATION_MODELS[input.variant];
      if (model.status === 'rejected-numerical-parity') throw new EngineError('MODEL_PARITY', model.unavailableReason);
      if (input.bytes !== model.bytes || input.sha256 !== model.sha256) throw new EngineError('MODEL_IDENTITY', 'Unsupported segmentation conversion');
      let url; try {url = new URL(input.url);} catch {throw new EngineError('INVALID_INPUT', 'Absolute segmentation model URL required');}
      requireValue(['http:', 'https:'].includes(url.protocol), 'HTTP model mirror required'); checkAbort(signal);
      let gpuModelUrl = model.gpu?.sharedAssets ? url.href : undefined;
      if (input.gpu !== undefined) {
        if (!model.gpu || input.gpu.bytes !== model.gpu.bytes || input.gpu.sha256 !== model.gpu.sha256) throw new EngineError('MODEL_IDENTITY', 'Unsupported GPU segmentation conversion');
        let target; try {target = new URL(input.gpu.url);} catch {throw new EngineError('INVALID_INPUT', 'Absolute GPU model URL required');}
        requireValue(['http:', 'https:'].includes(target.protocol), 'HTTP GPU model mirror required'); gpuModelUrl = target.href;
      }
      config = {variant: input.variant, modelUrl: url.href, gpuModelUrl, model};
      return {...model, displayName: model.variant, variant: input.variant, parametersLoaded: false, runtimeInferencePerformed: false};
    },
    async run(task, image, {signal, onProgress, knownHeapBytes = 0} = {}) {
      if (!config) throw new EngineError('MODEL_UNAVAILABLE', 'Configure a verified segmentation model first');
      if (active) throw new EngineError('BUSY', 'Segmentation adapter busy');
      const inputSource=image.segmented?(image.neuralInput??=createNeuralInput(image.surface,{budget})):undefined,geometry=image.segmented?image.surface.descriptor:image.pixels;
      const params = task.params ?? {};
      requireValue(Object.keys(params).every(k => ['variant', 'selectionPresent', 'reprojectOf', 'zoneIds', 'exclusions', 'compare'].includes(k)) && params.variant === config.variant, 'Explicit configured segmentation variant required');
      requireValue((params.exclusions === undefined || Array.isArray(params.exclusions) && params.exclusions.length === 0) && (params.compare === undefined || params.compare === false), 'Native CMSeg/MGCF does not support exclusions or Compare');
      const requestedBackend = task.backend ?? 'auto';
      if (!['auto', 'cpu', 'webgpu'].includes(requestedBackend) || requestedBackend === 'webgpu' && !config.gpuModelUrl) throw new EngineError('UNSUPPORTED_BACKEND', 'Requested segmentation backend is not configured');
      const reproject = params.reprojectOf !== undefined, regions = task.regions ?? [];
      requireValue(Array.isArray(regions) && (params.selectionPresent === undefined || typeof params.selectionPresent === 'boolean'), 'Segmentation region parameters');
      if (reproject) {
        requireValue(typeof params.reprojectOf === 'string' && task.regions === undefined && params.selectionPresent === undefined && Array.isArray(params.zoneIds), 'Reprojection requires a cached analysis and explicit zone IDs');
        if (!state?.lastContext) throw new EngineError('CACHE_MISS', 'No completed segmentation analysis');
        requireValue(state.lastContext.imageId === task.imageId && state.lastContext.sha256 === image.sha256 && state.lastContext.analysisId === params.reprojectOf, 'Reprojection source or analysis identity differs');
      } else {
        requireValue(params.zoneIds === undefined, 'Zone subset requires explicit cache-only reprojection');
        if (params.selectionPresent && !regions.length) throw new EngineError('INVALID_INPUT', 'No active segmentation region');
      }
      const selection = reproject ? {backend: state.backend, reason: 'cached-analysis-backend'} : await selectSegmentationBackend({requested: requestedBackend, gpuModel: config.gpuModelUrl ? config.model.gpu : null, cpuModel:config.model,regionBounds:regions.map(r=>r?.bounds),segmented:!!image.segmented,reclaimableInferenceBytes:state?.session.idleInferenceBytes??0, budget, sourceBytes: image.segmented?Math.min(geometry.width*geometry.height*3,4*1024**2):image.pixels.data.byteLength, zones: regions.length || 1, knownHeapBytes});
      const {backend} = selection;
      if (reproject && requestedBackend !== 'auto' && requestedBackend !== backend) throw new EngineError('INVALID_INPUT', 'A cached view preserves its original backend; request an explicit new analysis to switch');
      checkAbort(signal); active = true; let resident, result; const started = performance.now();
      try {
        resident = budget.reserve(knownHeapBytes);
        if (state && state.backend !== backend) await clearState();
        if (!state) {
          const prepare = createSegmentationPrepare({budget}), inference = createSegmentationInference({budget, variant: config.variant, modelUrl: backend === 'webgpu' ? config.gpuModelUrl : config.modelUrl, backend}), spatial = createSpatial({budget, moduleUrl: new URL(config.model.side === 512 ? '../vendor/segmentation/spatial512.js' : '../vendor/d2prl/spatial.js', import.meta.url).href, maxInputSide: config.model.side === 512 ? 512 : 448});
          const createLane = inference.independentZoneWorker ? () => ({prepare:createSegmentationPrepare({budget}),inference:createSegmentationInference({budget,variant:config.variant,modelUrl:config.modelUrl,backend:'cpu'})}) : undefined;
          const project = createNeuralProjector({budget,family:'segmentation',side:config.model.side,kind:config.model.kind,contiguous:createSegmentationZones({budget,spatial})}), session = createSegmentationAnalysis({budget, prepare, inference, project, createLane}); state = {prepare, inference, spatial, project, session, backend};
        }
        state.project.setImage(image);const hooks = {signal, onProgress: e => onProgress?.({id: task.id, ...e})};
        const zones = regions.length ? regions : [{id: 'whole-image', kind: 'whole-image', bounds: [0, 0, geometry.width, geometry.height]}];
        result = reproject ? await state.session.reproject({analysisId: params.reprojectOf, zoneIds: params.zoneIds}, hooks) : await state.session.run({...(inputSource?{inputSource}:{pixels:image.pixels}), zones, mode: regions.length ? 'regions' : 'whole-image', provenance: {originalSha256: image.sha256, decode: image.provenance}}, hooks);
        checkAbort(signal); const {release, ...data} = image.segmented?{width:result.width,height:result.height,metadata:result.metadata}:result;
        state.lastContext = {imageId: task.imageId, sha256: image.sha256, analysisId: data.metadata.analysisId};
        const provenance = {engine: version, operation: 'ai.clones.segmentation', originalSha256: image.sha256, decode: structuredClone(image.provenance), params: {variant: config.variant}, regions: data.metadata.zones.map(({id, kind, bounds}) => ({id, kind, bounds})), model: {...state.inference.model}, backend: backend === 'webgpu' ? 'webgpu-cpu' : 'cpu-wasm', backendSelection: selection.reason, kernelParity: state.inference.model.numericalParity ?? 'Declared native synthetic corpus: preparation and masks exact; continuous probabilities differ, see variant-specific numerical reports. Not universal detector accuracy.'};
        state.lastProvenance = structuredClone(provenance);
        const delivered={id: task.id, imageId: task.imageId, operation: 'ai.clones.segmentation', status: 'ok', data, semantics: 'Native sigmoid or target/source/background class probabilities, independent rectangle inference and maximum/OR composition. No D2PRL residual roles or component filter.', layers: [{id: 'union', kind: 'mask', field: 'data.mask', width: data.width, height: data.height, origin: [0, 0], range: [0, 1]}, {id: 'probability', kind: 'scalar', field: 'data.map', width: data.width, height: data.height, origin: [0, 0], range: [0, 1]}, ...(data.target ? ['target', 'source'].map(id => ({id, kind: 'scalar', field: 'data.' + id, width: data.width, height: data.height, origin: [0, 0], range: [0, 1]})) : [])], provenance, metrics: {execution: data.metadata.execution, timings: data.metadata.timings, totalMs: performance.now() - started, inferences: data.metadata.inferences, cache: {rawGrids: data.metadata.cache_hits}, memory: budget.snapshot()}};
        if(image.segmented){const bundle=await publishNeuralResult(result,task.imageId,{...provenance,layout:'segmented'},{budget,publishResult,signal});delivered.metrics.projection=result.metrics;result=null;Object.assign(delivered,bundle);delivered.provenance.layout='segmented';delivered.metrics.memory=budget.snapshot();state.lastProvenance=structuredClone(delivered.provenance);}
        return delivered;
      } finally {await result?.release(); resident?.(); active = false;}
    },
    readRaw({imageId, resultId}) {
      requireValue(!active, 'Segmentation adapter busy'); if (!state?.lastContext) throw new EngineError('CACHE_MISS', 'No completed segmentation result');
      requireValue(imageId === state.lastContext.imageId, 'Raw-grid source differs');
      const result = state.session.readRaw(resultId);
      try {const {release, ...data} = result; return {id: resultId, imageId, operation: 'ai.clones.segmentation', status: 'ok', data, layers: [], provenance: {...structuredClone(state.lastProvenance), output: 'raw-model-probabilities'}, metrics: {inferences: 0, memory: budget.snapshot()}};}
      finally {result.release();}
    },
    async clearImages() {requireValue(!active, 'Segmentation adapter busy'); await clearState();},
    async dispose() {requireValue(!active, 'Segmentation adapter busy'); await clearState(); config = null;}
  };
}
