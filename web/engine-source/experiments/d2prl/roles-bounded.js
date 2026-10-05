import {roleModelWorkspaceBytes} from './role-model.js';
import {installWorkerMessageProtocol,workerMessageFailure} from '../../src/worker-message-protocol.js';
import {getExecutionScheduler} from '../../src/execution-scheduler.js';
// Private fixed448 ONNX role heads, with a cancellable single-threaded worker.
// The isolated pinned factory caps instantiated memory at512MiB. Numerical
// WASM code stays identical. Reserve the cap, report actual capacity, never RSS.
import {requireValue, checkAbort, EngineError, deserializeEngineError} from '../../src/errors.js';
export function createBoundedRoles({budget, model, modelUrl, ortUrl, wasmPath, runtime, runtimeFactoryUrl}) {
  requireValue(budget && Number.isInteger(model?.modelBytes) && model.modelBytes > 0 && model.modelBytes <= 32 * 1024 ** 2 && /^[0-9a-f]{64}$/.test(model.modelSha256), 'Pinned role model required');
  requireValue(runtime?.runtimeId === 'ort130-wasm-512mib' && runtime.memoryMaximumBytes === 512 * 1024 ** 2 && typeof runtimeFactoryUrl === 'string', 'Pinned bounded ORT runtime');
  let busy = false, disposed = false;
  return {
    async run({rgb, coordinates, union}, {signal,onInference,onProgress} = {}) {
      if (busy) throw new EngineError('BUSY', 'Role worker busy');
      const inputs = {rgb, x_cor: coordinates?.zm?.x, y_cor: coordinates?.zm?.y, x_cor2: coordinates?.cnn?.x, y_cor2: coordinates?.cnn?.y, union};
      requireValue(!disposed && Object.entries(inputs).every(([name, a]) => a instanceof Float32Array && a.length === (name === 'rgb' ? 3 : 1) * 448 ** 2), 'Role448 inputs'); checkAbort(signal); busy = true;
      let worker, admitted, outputRelease, complete = false, abort,protocol;const modelBackings=new Map();
      try {
        const inputBytes = Object.values(inputs).reduce((n, a) => n + a.byteLength, 0), outputBytes = 2 * 448 ** 2 * 4;
        const lease=await getExecutionScheduler(budget).acquire({cpu:1,bytes:runtime.memoryMaximumBytes + roleModelWorkspaceBytes(model.modelBytes) + 2 * inputBytes + 3 * outputBytes,signal,resourceOwner:'d2prl',label:'d2prl-roles-bounded'});admitted=lease.release;outputRelease=lease.retainMemory(outputBytes);
        worker = new Worker(new URL('./roles-bounded-worker.js', import.meta.url), {type: 'module'});
        const output = await new Promise((resolve, reject) => {
          abort = () => reject(new EngineError('CANCELLED', 'Role inference cancelled'));
          signal?.addEventListener('abort', abort, {once: true});
          worker.onerror = event => reject(new EngineError('WORKER_FAILED', event.message));
          protocol=installWorkerMessageProtocol(worker,data => {
            try {
              if(data.phase==='parameter-backing'){
                const b=data.backing;requireValue(b&&Number.isInteger(b.id)&&b.id>0&&['wasm','array-buffer'].includes(b.kind)&&Number.isSafeInteger(b.bytes)&&b.bytes>0,'Role parameter backing');
                if(b.action==='allocate'){requireValue(!modelBackings.has(b.id),'Duplicate role backing');modelBackings.set(b.id,{kind:b.kind,bytes:b.bytes,release:budget.registerBacking?.(b.kind,b.bytes,{owner:'d2prl',label:'roles-'+b.label})});}
                else if(b.action==='resize'){const old=modelBackings.get(b.id);requireValue(old&&old.kind===b.kind&&b.bytes>=old.bytes&&b.bytes<=runtime.memoryMaximumBytes,'Role runtime heap growth');if(old.release?.resize)old.release.resize(b.bytes);else{old.release?.();old.release=budget.registerBacking?.(b.kind,b.bytes,{owner:'d2prl',label:'roles-ort-heap'});}old.bytes=b.bytes;}
                else{requireValue(b.action==='release'&&modelBackings.has(b.id),'Unknown role backing');const old=modelBackings.get(b.id);requireValue(old.kind===b.kind&&old.bytes===b.bytes,'Role backing identity');old.release?.();modelBackings.delete(b.id);budget.notifyBackingRelease?.(b.kind,b.bytes);}return;
              }
              if(data.phase==='resource-recovery'){onProgress?.(data);return;}
              if (data.phase === 'inference') { onInference?.(); return; }
              if(typeof data.ok!=='boolean')throw workerMessageFailure('d2prl-roles','message','invalid-response');
              if (!data.ok) throw typeof data.error==='object'?deserializeEngineError(data.error):new EngineError('MODEL_FAILED', data.error);
              if(data.parameterLoading)requireValue(modelBackings.get(Number.MAX_SAFE_INTEGER)?.bytes===data.heapBytes,'Role runtime ledger differs from output heap');
              requireValue(data.target instanceof Float32Array && data.source instanceof Float32Array && data.target.length === 448 ** 2 && data.source.length === 448 ** 2 && data.heapBytes > 0 && data.heapBytes <= runtime.memoryMaximumBytes, 'Role result'); resolve(data);
            } catch (e) { reject(e); }
          },{label:'d2prl-roles',onFailure:reject});
          const copies = Object.fromEntries(Object.entries(inputs).map(([name, a]) => [name, a.slice()]));
          protocol.post({inputs: copies, modelUrl, ortUrl, runtimeFactoryUrl, wasmPath: {mjs: runtimeFactoryUrl, wasm: new URL('ort-wasm-simd-threaded.wasm', wasmPath).href}, modelBytes: model.modelBytes, modelSha256: model.modelSha256}, Object.values(copies).map(a => a.buffer));
          if (signal?.aborted) abort();
        });
        checkAbort(signal); complete = true; return {target: output.target, source: output.source, ort: output.ort, heapBytes:output.heapBytes,parameterLoading:output.parameterLoading?{...output.parameterLoading,observedHeapBytes:modelBackings.get(Number.MAX_SAFE_INTEGER)?.bytes}:undefined,release: outputRelease};
      } finally { signal?.removeEventListener('abort', abort); protocol?.dispose();worker?.terminate();for(const backing of modelBackings.values())backing.release?.();modelBackings.clear();admitted?.(); if (!complete) outputRelease?.(); busy = false; }
    },
    dispose() { requireValue(!busy, 'Role worker busy'); disposed = true; }
  };
}
