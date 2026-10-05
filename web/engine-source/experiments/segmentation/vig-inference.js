import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
import {readVerifiedModelAsset} from '../d2prl/model.js';
import {createVigBackbone, validateVigBackbone} from './vig-backbone.js';
import {createParameterCache,parameterCacheStats} from './parameter-cache.js';
import {createSessionCache,sessionCacheStats} from './session-cache.js';
const HEAP = 512 * 1024 ** 2, OUTPUT = 256 * 256 * 4;

export function createVigInference({budget, model, modelUrl, backend='cpu'}) {
  requireValue(['cpu','webgpu'].includes(backend),'VIG backend');
  let graph, metadataRelease, busy = false, disposed = false;
  const sessionCache=createSessionCache({budget,bytes:HEAP+3*model.tail.bytes,create:()=>new Worker(new URL('./inference-worker.js',import.meta.url),{type:'module'})});
  const read = (spec, hooks) => readVerifiedModelAsset(new URL(spec.file, modelUrl).href, spec, hooks);
  const parameterCache=createParameterCache({budget,read,enabled:backend==='webgpu'});
  return {
    model, graphDistanceBackend:backend==='webgpu'?'webgpu-dot-wasm-postprocess':'wasm-cpu', backend: backend==='webgpu'?'webgpu-cpu':'cpu', gpuMaximumBytes:backend==='webgpu'?64*1024**2:0,
    async run(input, {signal, onProgress} = {}) {
      if (busy) throw new EngineError('BUSY', 'VIG inference busy');
      requireValue(!disposed && input instanceof Float32Array && input.length === 3 * 256 ** 2 && input.every(Number.isFinite), 'Prepared VIG tensor'); checkAbort(signal);
      // CPU pools retain their existing admission policy. A GPU backbone may
      // reuse the idle tail if it fits; the shared budget can reclaim it first.
      if(backend==='cpu')sessionCache.releaseIdle(); busy = true;
      let backbone, features, scratch, release, abort, worker, complete = false;
      let metadataLoadMs = 0, backboneSetupMs = 0;const cacheStart=parameterCache.snapshot(),sessionStart=sessionCache.snapshot();
      try {
        scratch = budget.reserve(input.byteLength * 2 + 640 * 16 * 16 * 12 + OUTPUT * 2); release = budget.reserve(OUTPUT);
        if (!graph) {
          const started = performance.now(); let admitted = budget.reserve(10 * (model.bytes + model.backbone.bytes));
          try {
            const manifest = JSON.parse(new TextDecoder().decode(await readVerifiedModelAsset(modelUrl, model, {signal})));
            requireValue(manifest.schema === 1 && manifest.id === model.id && manifest.variant === 'mgcfdn-vig' && manifest.side === 256 && manifest.kind === 'sigmoid' && manifest.checkpointSha256 === model.checkpointSha256 && JSON.stringify(manifest.backbone) === JSON.stringify(model.backbone) && JSON.stringify(manifest.tail) === JSON.stringify(model.tail), 'Pinned VIG bundle');
            const value = JSON.parse(new TextDecoder().decode(await read(model.backbone, {signal}))); validateVigBackbone(value); checkAbort(signal);
            graph = value; metadataRelease = admitted; admitted = undefined;
          } finally { admitted?.(); }
          metadataLoadMs = performance.now() - started;
        }
        const setup = performance.now();
        backbone = await createVigBackbone({budget, graph, read:parameterCache.read, backend, maxWorkers: Math.max(1, Math.min(32, globalThis.navigator?.hardwareConcurrency || 1))});
        backboneSetupMs = performance.now() - setup;
        features = await backbone.run(input, {signal, onProgress}); backbone.dispose(); backbone = undefined; checkAbort(signal);
        worker=sessionCache.acquire();
        const result = await new Promise((resolve, reject) => {
          const cleanup = () => { signal?.removeEventListener('abort', abort); worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; };
          const fail = error => { cleanup(); reject(error); };
          abort = () => fail(new EngineError('CANCELLED', 'VIG inference cancelled'));
          worker.onerror = event => fail(new EngineError('WORKER_FAILED', event.message));
          worker.onmessageerror = () => fail(new EngineError('WORKER_FAILED', 'VIG inference transport'));
          worker.onmessage = ({data}) => {
            try {
              if (data.phase) { onProgress?.({phase: data.phase}); return; }
              if (!data.ok) throw new EngineError('MODEL_FAILED', data.error);
              requireValue(data.raw instanceof Float32Array && data.raw.byteLength === OUTPUT && data.raw.every(v => Number.isFinite(v) && v >= 0 && v <= 1) && Number.isInteger(data.heapBytes) && data.heapBytes <= HEAP, 'Bounded VIG probabilities');
              cleanup(); resolve(data);
            } catch (error) { fail(error); }
          };
          signal?.addEventListener('abort', abort, {once: true}); if (signal?.aborted) return abort();
          try {
            worker.postMessage({input: features.data, model: {...model, bytes: model.tail.bytes, sha256: model.tail.sha256}, modelUrl: new URL(model.tail.file, modelUrl).href, ortUrl: new URL('../../vendor/d2prl/ort.wasm.min.mjs', import.meta.url).href, runtimeFactoryUrl: new URL('../../vendor/d2prl/factory.mjs', import.meta.url).href, wasmPaths: {mjs: new URL('../../vendor/d2prl/factory.mjs', import.meta.url).href, wasm: new URL('../../vendor/d2prl/ort-wasm-simd-threaded.wasm', import.meta.url).href}});
          } catch (error) { fail(error); }
        });
        checkAbort(signal); complete = true;
        return {raw: result.raw, heapBytes: result.heapBytes, ort: result.ort, modelId: model.id, workers: features.workers,gpu:features.gpu,sessionCache:backend==='webgpu'?sessionCacheStats(sessionCache,sessionStart):undefined,parameterCache:parameterCache.enabled?parameterCacheStats(parameterCache,cacheStart):undefined, timings: {...result.timings,gpuWriteBytes:features.timings.gpuWriteBytes,gpuReadBytes:features.timings.gpuReadBytes, modelLoadMs: result.timings.modelLoadMs + metadataLoadMs + features.timings.parameterLoadMs, inferenceMs: result.timings.inferenceMs + features.timings.executionMs, backboneMs: features.timings.executionMs, graphDistanceMs:features.timings.graphDistanceMs, parameterLoadMs: features.timings.parameterLoadMs, backboneSetupMs}, release};
      } finally {
        signal?.removeEventListener('abort', abort); features?.release(); backbone?.dispose(); scratch?.(); if(worker)sessionCache.unlock(); busy = false;
        if (!complete) { release?.(); sessionCache.releaseIdle(); }
      }
    },
    dispose() { requireValue(!busy, 'VIG inference busy'); if (disposed) return; disposed = true; sessionCache.dispose(); parameterCache.dispose(); metadataRelease?.(); graph = undefined; }
  };
}
