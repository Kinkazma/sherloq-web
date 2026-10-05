import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
import {createConvolutionGeneralGpu} from '../d2prl/convolution-general-gpu.js';
import {createCmsegDotGpu} from './cmseg-dot-gpu.js';

// Experimental bounded hybrid. Stream complete comparison rows twice; overlap
// one ordered GPU dot job with independent CPU Gaussian/softmax/TopK jobs.
export function createCmsegCorrelationGpu({budget,moduleUrl,maxWorkers=Math.min(64,globalThis.navigator?.hardwareConcurrency??1),rowsPerJob=64,parameterCache,residentInput=false}){
  requireValue(typeof residentInput==='boolean'&&budget?.reserve&&typeof moduleUrl==='string'&&Number.isInteger(maxWorkers)&&maxWorkers>=1&&maxWorkers<=64&&Number.isInteger(rowsPerJob)&&rowsPerJob>=1&&rowsPerJob<=256,'Correlation GPU configuration');
  let busy=false,disposed=false,sequence=0,workers=[];
  const clear=error=>{for(const entry of workers){entry.worker.terminate();for(const pending of entry.pending.values())pending.reject(error);entry.pending.clear();entry.release();}workers=[];};
  const call=(entry,data,transfer=[])=>new Promise((resolve,reject)=>{const id=++sequence;entry.pending.set(id,{resolve,reject});try{entry.worker.postMessage({...data,id},transfer);}catch(e){entry.pending.delete(id);reject(e);}});
  return{
    async run({input,c,h,w,k,alpha},{signal,onProgress}={}){
      requireValue(!busy&&!disposed,'Correlation GPU unavailable');requireValue([[24,128,128,24],[32,64,64,32],[96,32,32,96]].some(g=>JSON.stringify(g)===JSON.stringify([c,h,w,k]))&&Number.isFinite(alpha),'Pinned CMSeg correlation geometry');
      const n=h*w;requireValue(input instanceof Float32Array&&input.length===c*n&&input.every(Number.isFinite),'Correlation GPU tensor');checkAbort(signal);busy=true;
      let admitted,release,gpu,complete=false,peakHeap=0,failure,gpuWriteBytes=0,gpuReadBytes=0,gpuPeak=0,gpuAllocations=0;
      const abort=()=>clear(new EngineError('CANCELLED','Correlation GPU cancelled'));signal?.addEventListener('abort',abort,{once:true});
      try{
        admitted=budget.reserve(3*input.byteLength+16*n+rowsPerJob*(c+1)*4);release=budget.reserve(4*k*n);
        const tileBytes=rowsPerJob*n*4,weightsBytes=rowsPerJob*c*4,biasBytes=rowsPerJob*4;
        const gpuHeadroom=2*(input.byteLength+weightsBytes+biasBytes)+3*tileBytes+2048+2*1024**2,perWorker=32*1024**2+2*input.byteLength+2*tileBytes+8*k*rowsPerJob;
        budget.room(perWorker+gpuHeadroom);const count=Math.min(maxWorkers,Math.ceil(n/rowsPerJob),Math.floor((budget.limit-budget.total()+(parameterCache?.bytes??0)-gpuHeadroom)/perWorker));
        if(count<1)throw new EngineError('MEMORY_LIMIT','No correlation postprocess worker fits');parameterCache?.reclaim(count*perWorker+gpuHeadroom);
        const maxima=new Float32Array(n),inverse=new Float32Array(2*n),output=new Float32Array(k*n);let normalized;
        for(let i=0;i<count;i++){
          const free=budget.reserve(perWorker);let worker;try{worker=new Worker(new URL('./cmseg-correlation-gpu-worker.js',import.meta.url),{type:'module'});}catch(e){free();throw e;}
          const entry={worker,release:free,pending:new Map()};workers.push(entry);
          worker.onmessage=({data})=>{const p=entry.pending.get(data.id);if(!p)return;entry.pending.delete(data.id);data.ok?p.resolve(data):p.reject(new EngineError('COMPUTE_FAILED',data.error));};
          worker.onerror=e=>{for(const p of entry.pending.values())p.reject(new EngineError('WORKER_FAILED',e.message));entry.pending.clear();};
        }
        await Promise.all(workers.map(async(entry,index)=>{const r=await call(entry,{type:'init',moduleUrl,input,geometry:{c,h,w,k,alpha,rowsPerJob},returnNormalized:index===0});peakHeap=Math.max(peakHeap,r.heapBytes);if(index===0)normalized=r.normalized;}));checkAbort(signal);
        gpu=residentInput?await createCmsegDotGpu({budget,input:normalized,c,h,w,rowsPerJob}):await createConvolutionGeneralGpu({budget});
        for(const phase of ['statistics','topk']){
          let completed=0;
          for(let wave=0;wave<n;wave+=count*rowsPerJob){
            const pending=[];
            try{
              for(let lane=0;lane<count&&wave+lane*rowsPerJob<n;lane++){
                checkAbort(signal);if(failure)throw failure;const first=wave+lane*rowsPerJob,size=Math.min(rowsPerJob,n-first),weights=residentInput?null:new Float32Array(size*c),bias=residentInput?null:new Float32Array(size);
                if(!residentInput)for(let j=0;j<size;j++)for(let channel=0;channel<c;channel++)weights[j*c+channel]=normalized[channel*n+first+j];
                let dots;
                try{
                  dots=await gpu.run(residentInput?{first,count:size}:{input:normalized,weights,bias,channels:c,height:h,width:w,outChannels:size,kernel:1,hasBias:true},{signal,onSubmitted:()=>onProgress?.({phase:'cmseg-correlation-dot-gpu',stage:phase,completed:first,total:n})});checkAbort(signal);
                  if(residentInput){gpuWriteBytes+=dots.timings.gpuWriteBytes;gpuReadBytes+=dots.timings.gpuReadBytes;gpuPeak=Math.max(gpuPeak,dots.gpu.peakAccountedBytes);gpuAllocations+=dots.gpu.allocations;}
                  else{gpuWriteBytes+=normalized.byteLength+weights.byteLength+bias.byteLength+72;gpuReadBytes+=size*n*4;gpuPeak=Math.max(gpuPeak,normalized.byteLength+weights.byteLength+bias.byteLength+2*size*n*4+72);gpuAllocations+=7;}
                  pending.push(call(workers[lane],{type:phase,first,count:size,dots:dots.data},[dots.data.buffer]).then(r=>{
                    if(phase==='statistics'){maxima.set(r.maxima,first);inverse.set(r.inverse,first);inverse.set(r.columnSum,n+first);}else{for(let j=0;j<k;j++)output.set(r.output.subarray(j*size,(j+1)*size),j*n+first);peakHeap=Math.max(peakHeap,r.heapBytes);}
                    completed+=size;onProgress?.({phase:'cmseg-correlation-'+phase,completed,total:n,workers:count});
                  }).catch(e=>{failure??=e;}));
                }finally{dots?.release();}
              }
            }finally{await Promise.all(pending);}
            checkAbort(signal);if(failure)throw failure;
          }
          if(phase==='statistics')await Promise.all(workers.map(entry=>call(entry,{type:'distribute',maxima,inverse})));checkAbort(signal);
        }
        requireValue(output.every(Number.isFinite),'Finite GPU correlation output');complete=true;
        return{data:output,shape:[1,k,h,w],workers:count,heapMaximumBytes:32*1024**2,observedHeapBytes:peakHeap,gpu:{devices:1,allocations:gpuAllocations,peakAccountedBytes:gpuPeak,accounting:'explicit GPU buffers, excludes driver/compiler residency',errors:[]},timings:{gpuWriteBytes,gpuReadBytes},release};
      }finally{signal?.removeEventListener('abort',abort);clear(new EngineError('CANCELLED','Correlation GPU released'));gpu?.dispose();admitted?.();if(!complete)release?.();busy=false;}
    },
    dispose(){requireValue(!busy,'Correlation GPU busy');disposed=true;clear(new EngineError('CANCELLED','Correlation GPU disposed'));}
  };
}
