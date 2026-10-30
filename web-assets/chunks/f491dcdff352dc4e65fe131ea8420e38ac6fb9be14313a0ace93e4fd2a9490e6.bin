import {d2prlInputSide} from './input-side.js';
import {getExecutionScheduler} from '../../src/execution-scheduler.js';
import {installWorkerMessageProtocol,workerMessageFailure} from '../../src/worker-message-protocol.js';
import {createD2prlRecovery} from './recovery.js';
// The pinned module has a512MiB maximum heap. Whole-module admission permits
// immediate worker termination during native connected-components/DFT calls.
import {requireValue, checkAbort, EngineError,deserializeEngineError} from '../../src/errors.js';
const minimumIntervals=new WeakMap();
export const getPostprocessMinimumInterval=result=>minimumIntervals.get(result);
export function createPostprocess({budget, moduleUrl,inputSide=448}) {
  const SIDE=d2prlInputSide(inputSide);let busy = false, disposed = false;
  return {
    async run({raw, width = SIDE, height = SIDE, minimum = 500}, {signal, onCompute,onRecovery} = {}) {
      if (busy) throw new EngineError('BUSY', 'Postprocess busy');
      requireValue(!disposed && [width, height, minimum].every(Number.isInteger) && width >= 1 && height >= 1 && width <= SIDE && height <= SIDE && minimum >= 0 && minimum <= 5000 && raw instanceof Float32Array && raw.length === 3 * width * height, 'Postprocess inputs'); checkAbort(signal); busy = true;
      const operation=createD2prlRecovery({budget,signal,onRecovery});
      try{return await operation('postprocess:run',async()=>{
      let admitted, outputRelease, worker, abort,protocol, complete = false;
      try {
        const outputBytes = width * height * 16;
        const lease=await getExecutionScheduler(budget).acquire({cpu:1,bytes:512 * 1024 ** 2 + raw.byteLength * 2 + 2 * outputBytes,signal,resourceOwner:'d2prl',label:'d2prl-postprocess'});admitted=lease.release;outputRelease=lease.retainMemory(outputBytes);
        worker = new Worker(new URL('./postprocess-worker.js', import.meta.url), {type: 'module'});
        const result = await new Promise((resolve, reject) => {
          abort = () => reject(new EngineError('CANCELLED', 'Postprocess cancelled')); signal?.addEventListener('abort', abort, {once: true});
          worker.onerror = e => reject(new EngineError('WORKER_FAILED', e.message));
          protocol=installWorkerMessageProtocol(worker,data => {
            try { if (data.phase === 'compute') { onCompute?.(); return; } if(typeof data.ok!=='boolean')throw workerMessageFailure('d2prl-postprocess','message','invalid-response'); if (!data.ok) throw typeof data.error==='object'?deserializeEngineError(data.error):new EngineError('COMPUTE_FAILED', data.error); requireValue(data.heapBytes <= 512 * 1024 ** 2 && data.masks?.length === raw.length && data.filtered?.length === width * height, 'Postprocess result');if(data.minimumInterval!==undefined)requireValue(Array.isArray(data.minimumInterval)&&data.minimumInterval.length===2&&data.minimumInterval.every(Number.isSafeInteger)&&data.minimumInterval[0]>=0&&data.minimumInterval[0]<=minimum&&minimum<=data.minimumInterval[1]&&data.minimumInterval[1]<=1792*1792,'Native postprocess interval');resolve(data); }
            catch (e) { reject(e); }
          },{label:'d2prl-postprocess',onFailure:reject});
          const copy = raw.slice(); protocol.post({raw: copy, width, height, minimum, moduleUrl}, [copy.buffer]); if (signal?.aborted) abort();
        });
        checkAbort(signal);const answer={...result,release:outputRelease};if(result.minimumInterval)minimumIntervals.set(answer,Object.freeze([result.minimumInterval[0],Math.min(5000,result.minimumInterval[1])]));complete = true;return answer;
      } finally { signal?.removeEventListener('abort', abort); protocol?.dispose();worker?.terminate(); admitted?.(); if (!complete) outputRelease?.(); }
      });}finally{busy=false;}
    },
    dispose() { requireValue(!busy, 'Postprocess busy'); disposed = true; }
  };
}
