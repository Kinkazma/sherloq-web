import {installWorkerMessageProtocol,workerMessageFailure} from '../../src/worker-message-protocol.js';
import {getExecutionScheduler} from '../../src/execution-scheduler.js';
import {createD2prlRecovery} from './recovery.js';
// Cancellable native-coordinate interpolation under the shared admission.
import {requireValue, checkAbort, EngineError, deserializeEngineError} from '../../src/errors.js';
export function createSpatial({budget, moduleUrl, maxInputSide = 448}) {
  requireValue(budget && typeof budget.reserve === 'function' && [448, 512].includes(maxInputSide), 'Shared budget and qualified spatial domain required'); let busy = false, disposed = false;
  return {
    async run({input, width = 448, height = 448, outWidth, outHeight, nearest}, {signal, onCompute, onRecovery} = {}) {
      if (busy) throw new EngineError('BUSY', 'Spatial resize busy');
      requireValue(!disposed && [width, height, outWidth, outHeight].every(Number.isInteger) && width > 0 && height > 0 && width <= maxInputSide && height <= maxInputSide && outWidth > 0 && outHeight > 0 && outWidth <= 8192 && outHeight <= 8192 && outWidth * outHeight <= 32 * 1024 ** 2 && typeof nearest === 'boolean' && input instanceof Float32Array && input.length === width * height, 'Spatial resize domain'); checkAbort(signal); busy = true;
      const operation=createD2prlRecovery({budget,signal,onRecovery});
      try{return await operation('spatial:run',async()=>{
      let admitted, outputRelease, worker, abort, protocol, complete = false;
      try {
        const outputBytes = outWidth * outHeight * 4;
        const lease=await getExecutionScheduler(budget).acquire({cpu:1,bytes:512 * 1024 ** 2 + input.byteLength * 2 + 2 * outputBytes,signal,resourceOwner:'d2prl',label:'d2prl-spatial'});admitted=lease.release;outputRelease=lease.retainMemory(outputBytes);
        worker = new Worker(new URL('./spatial-worker.js', import.meta.url), {type: 'module'});
        const result = await new Promise((resolve, reject) => {
          abort = () => reject(new EngineError('CANCELLED', 'Spatial resize cancelled')); signal?.addEventListener('abort', abort, {once: true});
          worker.onerror = e => reject(new EngineError('WORKER_FAILED', e.message));
          protocol=installWorkerMessageProtocol(worker,data => {
            try { if (data.phase === 'compute') { onCompute?.(); return; } if(typeof data.ok!=='boolean')throw workerMessageFailure('d2prl-spatial','message','invalid-response'); if (!data.ok) throw typeof data.error==='object'?deserializeEngineError(data.error):new EngineError('COMPUTE_FAILED', data.error); requireValue(data.heapBytes <= 512 * 1024 ** 2 && data.values instanceof Float32Array && data.values.length === outWidth * outHeight, 'Spatial result'); resolve(data); }
            catch (e) { reject(e); }
          },{label:'d2prl-spatial',onFailure:reject});
          const copy = input.slice(); protocol.post({input: copy, width, height, outWidth, outHeight, nearest, moduleUrl}, [copy.buffer]); if (signal?.aborted) abort();
        });
        checkAbort(signal); complete = true; return {data: result.values, width: outWidth, height: outHeight, heapBytes: result.heapBytes, release: outputRelease};
      } finally { signal?.removeEventListener('abort', abort); protocol?.dispose();worker?.terminate(); admitted?.(); if (!complete) outputRelease?.(); }
      });}finally{busy=false;}
    },
    dispose() { requireValue(!busy, 'Spatial resize busy'); disposed = true; }
  };
}
