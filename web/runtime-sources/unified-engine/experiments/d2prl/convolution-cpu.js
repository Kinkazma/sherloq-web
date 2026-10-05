import {createWasmTensorArena,isWasmTensorView} from '../../src/wasm-tensor-arena.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from '../../src/scheduled-worker-call.js';
import {installWorkerMessageProtocol,workerMessageFailure} from '../../src/worker-message-protocol.js';
// One coordinated pool, one WASM thread per worker. It executes only useful
// convolution tiles; no calibration, warm-up or nested library pool.
import {requireValue, checkAbort, controlCheckpoint, EngineError, deserializeEngineError} from '../../src/errors.js';
const HEAP_MAX = 256 * 1024 ** 2;
export function createConvolutionCpu({budget,arena, moduleUrl, maxWorkers = 1,operation=(_label,work)=>work(),workerFactory=()=>new Worker(new URL('./convolution-cpu-worker.js',import.meta.url),{type:'module'})} = {}) {
  requireValue(budget && typeof budget.reserve === 'function' && typeof moduleUrl === 'string' && Number.isInteger(maxWorkers) && maxWorkers >= 1 && maxWorkers <= 32, 'Explicit shared budget, module and worker ceiling required');
  const ownsArena=!arena;arena??=createWasmTensorArena({budget});
  const admission={budget,resourceOwner:'d2prl',profile:{maxWorkers}};
  const pool = []; let busy = false, disposed = false;
  const retire=(slot,error)=>{slot.reject?.(error??new EngineError('CANCELLED','CPU convolution worker stopped'));slot.worker?.terminate();slot.worker=null;slot.release?.();slot.release=null;slot.loaded=false;};
  const remove = () => { const slot = pool.pop(); if(!slot)return; slot.closed=true;retire(slot); };
  // A later graph stage can need memory while these workers are idle. Release
  // idle compiled heaps before evicting raw results or rejecting useful work.
  const unregister = budget.registerReclaimer?.(bytes => {if (!busy) while (pool.length && budget.total() + bytes > budget.limit) remove();});
  const rpc = (slot, data, signal, transfer=[]) => scheduledWorkerCall(admission,()=>new Promise((resolve, reject) => {
    let protocol;const cleanup = () => { slot.reject=null;protocol?.dispose();if(slot.worker)slot.worker.onerror=null; signal?.removeEventListener('abort', abort); };
    const fail = error => { cleanup(); reject(error); };
    const abort = () => fail(new EngineError('CANCELLED', 'CPU convolution cancelled'));
    slot.reject=fail; if(slot.closed||!slot.worker)return fail(new EngineError('CANCELLED','CPU convolution worker stopped'));
    protocol=installWorkerMessageProtocol(slot.worker,data=>{if(data.protocolFailure)throw deserializeEngineError(data.error);if(typeof data.ok!=='boolean')throw workerMessageFailure('d2prl-convolution','message','invalid-response');if(!data.ok)throw typeof data.error==='object'?deserializeEngineError(data.error):new EngineError('CPU_FAILED',data.error);if(!Number.isInteger(data.heapBytes)||data.heapBytes>HEAP_MAX)throw new EngineError('MEMORY_LIMIT','CPU convolution heap');cleanup();resolve(data);},{label:'d2prl-convolution',onFailure:fail});
    slot.worker.onerror = event => fail(new EngineError('CPU_FAILED', event.message));
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) return abort();
    try { protocol.post(data,transfer); } catch (error) { fail(error); }
  }),{signal,label:'d2prl-convolution'});
  const transportAttempt=async(slot,work)=>{try{return await work();}catch(error){if(error.code==='WORKER_MESSAGE_FAILED')retire(slot,error);throw error;}};
  const initialize=async(slot,signal,scope)=>{if(slot.worker)return;checkAbort(signal);if(slot.closed)throw new EngineError('CANCELLED','CPU convolution worker stopped');slot.release=scope?scope.reserve(HEAP_MAX):budget.reserve(HEAP_MAX);try{slot.worker=workerFactory();await rpc(slot,{kind:'init',moduleUrl},signal);}catch(error){retire(slot,error);throw error;}};
  return {
    async run({input, weights, bias, channels, height, width, outChannels, kernel, padding = 0, stride = 1, groups = 1, hasBias = true, referenceLayout, experimentalBiasBefore = false, experimentalTailStart, experimentalTailMode = 'lane16'}, {signal, onSubmitted, onProgress} = {}) {
      if (busy) throw new EngineError('BUSY', 'CPU convolution busy'); requireValue(!disposed, 'CPU convolution disposed');
      requireValue([channels, height, width, outChannels, kernel, padding, stride, groups].every(Number.isInteger) && channels > 0 && channels <= 4096 && outChannels > 0 && outChannels <= 4096 && height > 0 && height <= 1024 && width > 0 && width <= 1024 && kernel > 0 && kernel <= 13 && padding >= 0 && padding <= 6 && stride >= 1 && stride <= 2 && groups >= 1 && groups <= channels && channels % groups === 0 && outChannels % groups === 0, 'Convolution dimensions');
      const oh = Math.floor((height + 2 * padding - kernel) / stride) + 1, ow = Math.floor((width + 2 * padding - kernel) / stride) + 1, plane = oh * ow, count = plane * outChannels, k = channels / groups * kernel * kernel;
      requireValue(oh > 0 && ow > 0 && input instanceof Float32Array && input.length === channels * height * width && weights instanceof Float32Array && weights.length === outChannels * k && bias instanceof Float32Array && bias.length === outChannels, 'Convolution tensors');
      const zeroBias = bias.every(v => v === 0), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      requireValue(typeof hasBias === 'boolean' && (hasBias || zeroBias) && typeof experimentalBiasBefore === 'boolean' && (!experimentalBiasBefore || !referenceLayout), 'Explicit bias arithmetic');
      requireValue(zeroBias || experimentalBiasBefore || (referenceLayout && same(referenceLayout.inputShape, [1, channels, height, width]) && same(referenceLayout.weightShape, [outChannels, channels / groups, kernel, kernel]) && referenceLayout.padding === padding && (referenceLayout.stride ?? 1) === stride && (referenceLayout.groups ?? 1) === groups), 'Qualified native convolution layout required');
      const ranges = zeroBias || experimentalBiasBefore ? [] : referenceLayout.biasAfterRanges;
      requireValue(Array.isArray(ranges) && ranges.length <= 64, 'Convolution arithmetic ranges'); let previous = 0;
      for (const range of ranges) { requireValue(Array.isArray(range) && range.length === 2 && range.every(Number.isInteger) && range[0] >= previous && range[1] > range[0] && range[1] <= plane, 'Convolution arithmetic range'); previous = range[1]; }
      const tailStart = experimentalTailStart ?? plane;
      requireValue(Number.isInteger(tailStart) && tailStart >= 0 && tailStart <= plane && ['lane16', 'block1024'].includes(experimentalTailMode), 'Convolution tail domain'); checkAbort(signal);
      const inputBytes = input.byteLength + weights.byteLength + bias.byteLength, tile = Math.max(4, Math.min(16384, Math.floor(8 * 1024 ** 2 / k / 4) * 4));
      busy = true;const scope=budget.beginReservationScope();for(const slot of pool)if(slot.release)slot.release=scope.track(slot.release);
      let borrowed, copies, outputRelease, complete = false, healthy = false, failure;const check=()=>{checkAbort(signal);if(failure)throw failure;};
      try {
        if (inputBytes + tile * 4 + 8 * 1024 ** 2 > HEAP_MAX) throw new EngineError('MEMORY_LIMIT', 'Layer exceeds bounded CPU convolution heap',{details:{admissionScope:'fixed',requestedBytes:inputBytes+tile*4+8*1024**2,capacityBytes:HEAP_MAX}});
        borrowed = scope.reserve(inputBytes);const output=await operation('convolution:output',()=>arena.allocate(Float32Array,count,{signal,zero:false,label:'convolution:cpu'}),{bytes:count*4});outputRelease=output.release;
        const copyBytes = inputBytes + tile * 8 + 4096;
        const available = budget.limit - budget.total() + pool.reduce((sum,slot)=>sum+(slot.release?HEAP_MAX:0),0);
        const useful = Math.max(1, Math.ceil(count * k / (4 * 1024 ** 2)));
        const workers = Math.min(maxWorkers, Math.max(1, navigator.hardwareConcurrency || 1), useful, Math.ceil(count / tile), Math.floor(available / (HEAP_MAX + copyBytes)));
        if (workers < 1) throw new EngineError('MEMORY_LIMIT', 'One CPU convolution worker cannot be admitted',{details:{requestedBytes:copyBytes+(pool.some(slot=>slot.release)?0:HEAP_MAX)}});
        while (pool.length > workers) remove();
        copies = scope.reserve(workers * copyBytes);
        let stamp = performance.now(); for (const values of [input, weights, bias]) for (let i = 0; i < values.length; i++) {
          requireValue(Number.isFinite(values[i]), 'Nonfinite convolution tensor'); if ((i & 8191) === 0 && performance.now() - stamp >= 8) { await controlCheckpoint(signal); stamp = performance.now(); }
        }
        while (pool.length < workers) {
          checkAbort(signal);const slot={};pool.push(slot);await operation('convolution:bootstrap',()=>initialize(slot,signal,scope));
        }
        const shape = new Int32Array([channels, height, width, outChannels, oh, ow, kernel, padding, stride, groups, Number(hasBias), tailStart, experimentalTailMode === 'block1024' ? 2 : 1, ranges.length]), arithmeticRanges = Int32Array.from(ranges.flat());
        const upload=async slot=>{check();await initialize(slot,signal,scope);if(slot.loaded)return;
          const arrays=[input,weights,bias,shape,arithmeticRanges];
          if(!arrays.some(isWasmTensorView)){await rpc(slot,{kind:'load',input,weights,bias,shape,ranges:arithmeticRanges,tile},signal);}else{
          await rpc(slot,{kind:'load-begin',lengths:arrays.map(a=>a.byteLength),tile},signal);
          for(let index=0;index<arrays.length;index++){const a=arrays[index],bytes=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);for(let begin=0;begin<bytes.length;begin+=8*1024**2){check();const chunks=[];for(let at=begin;at<Math.min(bytes.length,begin+8*1024**2);at+=1024**2){const value=new Uint8Array(Math.min(1024**2,bytes.length-at));value.set(bytes.subarray(at,at+value.length));chunks.push({index,at,value});}await rpc(slot,{kind:'load-chunks',chunks},signal,chunks.map(chunk=>chunk.value.buffer));}}
          await rpc(slot,{kind:'load-end'},signal);}slot.loaded=true;
        };
        const uploads=pool.map(slot=>operation('convolution:upload',()=>transportAttempt(slot,()=>upload(slot)),{bytes:1024**2}));
        await Promise.allSettled(uploads.map(task=>task.catch(error=>{failure??=error;cancelScheduledWorkerCalls(admission);while(pool.length)remove();throw error;})));if(failure)throw failure;
        const data=output.data; let next = 0, finished = 0, heapBytes = 0;
        onSubmitted?.(); checkAbort(signal);
        const tasks=pool.map(async slot => {
          while (next < count) {
            check(); const start = next, size = Math.min(tile, count - start); next += size;
            const result = await operation('convolution:tile',()=>transportAttempt(slot,async()=>{check();await upload(slot);const result=await rpc(slot,{kind:'compute',start,count:size},signal);if(!(result.values instanceof Float32Array&&result.values.length===size))throw workerMessageFailure('d2prl-convolution','message','invalid-tile');return result;}),{bytes:size*4}); checkAbort(signal);
            requireValue(result.values instanceof Float32Array && result.values.length === size, 'CPU convolution result'); data.set(result.values, start); heapBytes = Math.max(heapBytes, result.heapBytes); finished += size;
            onProgress?.({phase: 'convolution', completed: finished, total: count, workers});
          }
        });
        await Promise.allSettled(tasks.map(task=>task.catch(error=>{failure??=error;cancelScheduledWorkerCalls(admission);while(pool.length)remove();throw error;})));if(failure)throw failure;
        const clears=pool.map(async slot=>{try{await rpc(slot,{kind:'clear'},signal);slot.loaded=false;}catch(error){if(error.code!=='WORKER_MESSAGE_FAILED')throw error;retire(slot,error);}});
        await Promise.allSettled(clears.map(task=>task.catch(error=>{failure??=error;cancelScheduledWorkerCalls(admission);while(pool.length)remove();throw error;})));if(failure)throw failure;checkAbort(signal); healthy = true; complete = true;
        output.shape=[1,outChannels,oh,ow];output.workers=workers;output.heapBytes=heapBytes;return output;
      } catch(error){throw scope.capture(error);} finally { if (!healthy) { cancelScheduledWorkerCalls(admission); while (pool.length) remove(); } copies?.(); borrowed?.(); if (!complete) outputRelease?.();scope.close(); busy = false; }
    },
    releaseIdleWorkers() { requireValue(!busy, 'CPU convolution busy'); while (pool.length) remove(); },
    dispose() { requireValue(!busy, 'CPU convolution busy'); if (disposed) return; disposed = true; unregister?.(); while (pool.length) remove();if(ownsArena)arena.dispose(); }
  };
}
