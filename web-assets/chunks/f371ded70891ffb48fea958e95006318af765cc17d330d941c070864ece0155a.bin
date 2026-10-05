import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
import {SEGMENTATION_MODELS} from './models.js';
import {createCmsegInference} from './cmseg-inference.js';
import {createVigInference} from './vig-inference.js';
import {createTntInference} from './tnt-inference.js';

export function createSegmentationInference({budget, variant, modelUrl, backend = 'cpu'}) {
  requireValue(budget && typeof budget.reserve === 'function' && typeof budget.registerReclaimer === 'function', 'Shared budget required');
  const originalModel = Object.hasOwn(SEGMENTATION_MODELS, variant) ? SEGMENTATION_MODELS[variant] : null;
  requireValue(['cpu', 'webgpu'].includes(backend) && originalModel && (backend !== 'webgpu' || originalModel.gpu), 'Segmentation backend unavailable');
  const model = backend === 'webgpu' ? {...originalModel, ...originalModel.gpu} : originalModel;
  const hybrid = backend === 'webgpu', gpuBudgetBytes = hybrid ? 512 * 1024 ** 2 : 0;
  requireValue(model && typeof modelUrl === 'string' && /^https?:$/.test(new URL(modelUrl).protocol), 'Known segmentation model and absolute HTTP URL required');
  if (model.family === 'cmseg') return createCmsegInference({budget, model, modelUrl, backend});
  if (model.family === 'vig') return createVigInference({budget, model, modelUrl, backend});
  if (model.family === 'tnt') return createTntInference({budget, model, modelUrl, backend});
  // The heap ceiling belongs to this shipped runtime, not a caller-supplied ORT.
  const ortUrl = new URL(hybrid ? model.splitGraph ? '../../vendor/segmentation/ort.bounded-cache.min.mjs' : '../../vendor/segmentation/ort.all.min.mjs' : '../../vendor/d2prl/ort.wasm.min.mjs', import.meta.url).href;
  const runtimeFactoryUrl = new URL(hybrid ? '../../vendor/segmentation/factory.mjs' : '../../vendor/d2prl/factory.mjs', import.meta.url).href;
  const wasmPaths = {mjs: runtimeFactoryUrl, wasm: new URL(hybrid ? '../../vendor/segmentation/ort-wasm-simd-threaded.jsep.wasm' : '../../vendor/d2prl/ort-wasm-simd-threaded.wasm', import.meta.url).href};
  const residentBytes = 512 * 1024 ** 2 + gpuBudgetBytes + 3 * (model.splitGraph ? model.assetBytes : model.bytes) + (model.splitGraph ? model.bridgeBytes : 0);
  let worker, residentRelease, busy = false, disposed = false;
  const dropIdle = () => {if (!busy) {worker?.terminate(); worker = undefined; residentRelease?.(); residentRelease = undefined;}};
  const unregister = budget.registerReclaimer(dropIdle);
  return {
    model, backend: hybrid ? 'webgpu-cpu' : 'cpu',
    // Only this single-thread ONNX path may be multiplied across independent
    // rectangles. CMSeg/TNT/VIG own internal pools and do not expose this flag.
    independentZoneWorker: !hybrid,
    get residentBytes() {return residentRelease ? residentBytes : 0;},
    releaseIdle() {dropIdle();},
    async run(input, {signal, onProgress} = {}) {
      if (busy) throw new EngineError('BUSY', 'Segmentation inference busy');
      requireValue(!disposed && input instanceof Float32Array && input.length === 3 * model.side ** 2 && input.every(Number.isFinite), 'Prepared model tensor required');
      checkAbort(signal);
      let temporaryRelease, outputRelease, abort, complete = false;
      try {
        // Admit copies before locking the idle helper: pressure may evict it.
        const outputBytes = (model.kind === 'softmax' ? 3 : 1) * model.side ** 2 * 4;
        temporaryRelease = budget.reserve(input.byteLength * 2 + outputBytes * 2);
        outputRelease = budget.reserve(outputBytes); busy = true;
        if (!worker) {
          residentRelease = budget.reserve(residentBytes);
          worker = new Worker(new URL(hybrid ? model.splitGraph ? './inference-split-gpu-worker.js' : './inference-gpu-worker.js' : './inference-worker.js', import.meta.url), {type: 'module'});
        }
        const result = await new Promise((resolve, reject) => {
          abort = () => reject(new EngineError('CANCELLED', 'Segmentation inference cancelled'));
          signal?.addEventListener('abort', abort, {once: true});
          worker.onerror = event => reject(new EngineError('WORKER_FAILED', event.message));
          worker.onmessage = ({data}) => {
            try {
              if (data.phase) {onProgress?.({phase: data.phase}); return;}
              if (!data.ok) throw new EngineError(data.code ?? 'MODEL_FAILED', data.error);
              requireValue(data.raw instanceof Float32Array && data.raw.byteLength === outputBytes && Number.isInteger(data.heapBytes) && data.heapBytes <= 512 * 1024 ** 2, 'Bounded model result');
              if (hybrid) requireValue(data.gpu?.devices > 0 && data.gpu.allocations > 0 && data.gpu.peakAccountedBytes <= gpuBudgetBytes && data.gpu.errors.length === 0, 'Actual bounded GPU execution required');
              resolve(data);
            } catch (error) {reject(error);}
          };
          const copy = input.slice();
          worker.postMessage({input: copy, model, modelUrl, ortUrl, runtimeFactoryUrl, wasmPaths, gpuBudgetBytes}, [copy.buffer]);
          if (signal?.aborted) abort();
        });
        checkAbort(signal); complete = true;
        return {raw: result.raw, heapBytes: result.heapBytes, ort: result.ort, modelId: model.id, gpu: result.gpu, timings: result.timings, release: outputRelease};
      } finally {
        signal?.removeEventListener('abort', abort); temporaryRelease?.(); busy = false;
        if (!complete) {outputRelease?.(); dropIdle();}
      }
    },
    dispose() {requireValue(!busy, 'Segmentation inference busy'); if (!disposed) {dropIdle(); unregister(); disposed = true;}}
  };
}
