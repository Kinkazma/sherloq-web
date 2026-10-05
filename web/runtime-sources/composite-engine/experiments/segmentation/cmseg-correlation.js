import {requireValue, checkAbort, EngineError} from '../../src/errors.js';

export function createCmsegCorrelation({budget, moduleUrl, maxWorkers = Math.min(64, globalThis.navigator?.hardwareConcurrency ?? 1), rowsPerJob = 64, parameterCache}) {
  requireValue(budget?.reserve && typeof moduleUrl === 'string' && Number.isInteger(maxWorkers) && maxWorkers >= 1 && maxWorkers <= 64 && Number.isInteger(rowsPerJob) && rowsPerJob >= 1 && rowsPerJob <= 256, 'Correlation configuration');
  let busy = false, disposed = false, sequence = 0, workers = [];
  const clear = error => {for(const entry of workers){entry.worker.terminate();for(const pending of entry.pending.values())pending.reject(error);entry.pending.clear();entry.release();}workers=[];};
  const call = (entry, data) => new Promise((resolve,reject) => {const id=++sequence;entry.pending.set(id,{resolve,reject});try{entry.worker.postMessage({...data,id});}catch(error){entry.pending.delete(id);reject(error);}});
  return {
    async run({input,c,h,w,k,alpha}, {signal,onProgress} = {}) {
      requireValue(!disposed && !busy, 'Correlation unavailable');
      requireValue([c,h,w,k].every(Number.isInteger) && c>0 && c<=96 && h>0 && w>0 && h<=128 && w<=128 && h*w%4===0 && k>0 && k<=96 && k<=h*w && Number.isFinite(alpha), 'Correlation geometry');
      const n=h*w; requireValue(input instanceof Float32Array && input.length===c*n && input.every(Number.isFinite), 'Correlation feature tensor');
      checkAbort(signal);busy=true;let admitted, outputRelease, complete=false, peakHeap=0;
      const abort=()=>clear(new EngineError('CANCELLED','Correlation cancelled'));signal?.addEventListener('abort',abort,{once:true});
      try {
        admitted=budget.reserve(input.byteLength+16*n);outputRelease=budget.reserve(4*k*n);
        const perWorker=64*1024**2+2*input.byteLength+16*n+8*k*rowsPerJob;
        budget.room(perWorker);
        const count=Math.min(maxWorkers,Math.ceil(n/rowsPerJob),Math.floor((budget.limit-budget.total()+(parameterCache?.bytes??0))/perWorker));
        if(count<1)throw new EngineError('MEMORY_LIMIT','No global correlation worker fits');
        // Idle parameter bytes must not reduce useful correlation concurrency.
        parameterCache?.reclaim(count*perWorker);
        const maxima=new Float32Array(n),inverse=new Float32Array(2*n),output=new Float32Array(k*n);
        for(let i=0;i<count;i++) {
          const release=budget.reserve(perWorker);let worker;
          try{worker=new Worker(new URL('./cmseg-correlation-worker.js',import.meta.url),{type:'module'});}catch(error){release();throw error;}
          const entry={worker,release,pending:new Map()};workers.push(entry);
          worker.onmessage=({data})=>{const pending=entry.pending.get(data.id);if(!pending)return;entry.pending.delete(data.id);data.ok?pending.resolve(data):pending.reject(new EngineError('COMPUTE_FAILED',data.error));};
          worker.onerror=event=>{for(const pending of entry.pending.values())pending.reject(new EngineError('WORKER_FAILED',event.message));entry.pending.clear();};
        }
        await Promise.all(workers.map(async entry=>{const result=await call(entry,{type:'init',moduleUrl,input,geometry:{c,h,w,k,alpha}});peakHeap=Math.max(peakHeap,result.heapBytes);}));checkAbort(signal);
        for(const phase of ['statistics','topk']) {
          let cursor=0,completed=0;
          await Promise.all(workers.map(async entry=>{
            while(cursor<n){checkAbort(signal);const first=cursor,size=Math.min(rowsPerJob,n-first);cursor+=size;
              const result=await call(entry,{type:phase,first,count:size});checkAbort(signal);
              if(phase==='statistics'){maxima.set(result.maxima,first);inverse.set(result.inverse,first);inverse.set(result.columnSum,n+first);}
              else{for(let channel=0;channel<k;channel++)output.set(result.output.subarray(channel*size,(channel+1)*size),channel*n+first);peakHeap=Math.max(peakHeap,result.heapBytes);}
              completed+=size;onProgress?.({phase:'cmseg-correlation-'+phase,completed,total:n,workers:count});
            }
          }));
          if(phase==='statistics'){await Promise.all(workers.map(entry=>call(entry,{type:'distribute',maxima,inverse})));checkAbort(signal);}
        }
        requireValue(output.every(Number.isFinite),'Finite correlation required');complete=true;
        return {data:output,shape:[1,k,h,w],workers:count,heapMaximumBytes:64*1024**2,observedHeapBytes:peakHeap,release:outputRelease};
      } catch(error){clear(error);throw error;}
      finally{signal?.removeEventListener('abort',abort);clear(new EngineError('CANCELLED','Correlation job released'));admitted?.();if(!complete)outputRelease?.();busy=false;}
    },
    dispose(){requireValue(!busy,'Correlation busy');disposed=true;clear(new EngineError('CANCELLED','Correlation disposed'));}
  };
}
