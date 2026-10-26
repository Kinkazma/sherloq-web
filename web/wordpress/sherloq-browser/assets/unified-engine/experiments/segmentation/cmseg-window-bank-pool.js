import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
import {createCmsegWindowDotGpu} from './cmseg-window-dot-gpu.js';

const MiB=1024**2;
const finite=(a,Type,size)=>a instanceof Type&&a.length===size&&a.every(Number.isFinite);
/** Bounded original correlation stages over a storage-only bank. Every row
 * still compares against the complete admitted population. Worker count and
 * row tiles affect scheduling, never grids, TopK, precision or comparisons.
 */
export function createCmsegWindowCorrelation({budget,maxWorkers,rowsPerJob=64,
 workerFactory=url=>new Worker(url,{type:'module'}),createDot=createCmsegWindowDotGpu,onOwner}={}){
 requireValue(budget?.reserve&&typeof budget.total==='function'&&Number.isSafeInteger(budget.limit)&&Number.isInteger(maxWorkers)&&maxWorkers>=1&&maxWorkers<=64&&Number.isInteger(rowsPerJob)&&rowsPerJob>=1&&rowsPerJob<=256,'Bounded CMSeg bank worker policy required');
 const workers=new Set(),temporary=new Set(),controller=new AbortController();let sequence=0,running,closing,closed=false,gpu;
 function call(entry,data,transfer=[]){return new Promise((resolve,reject)=>{const id=++sequence;entry.pending.set(id,{resolve,reject});try{entry.worker.postMessage({...data,id},transfer);}catch(error){entry.pending.delete(id);reject(error);}});}
 async function retire(entry,error=new EngineError('CANCELLED','CMSeg bank worker retired')){
  // terminate is the browser Worker lifetime boundary for these WASM-only
  // workers. A refusal retains both the entry and its admission for retry.
  await entry.worker.terminate();for(const p of entry.pending.values())p.reject(error);entry.pending.clear();entry.free();workers.delete(entry);
 }
 async function cleanup(){
  let failed=false,primary;for(const entry of [...workers])try{await retire(entry);}catch(error){if(!failed){failed=true;primary=error;}}
  if(gpu)try{await gpu.dispose();gpu=undefined;}catch(error){if(!failed){failed=true;primary=error;}}
  if(failed)throw primary;
  for(const free of temporary){free();temporary.delete(free);}
 }
 const owner={async release(){if(closing)return closing;if(closed)return;controller.abort();closing=(async()=>{try{await running;}catch{}await cleanup();closed=true;})().finally(()=>closing=undefined);return closing;},get pendingACKs(){return workers.size+(gpu?1:0);}};
 onOwner?.(owner);
 function spawn(bytes){
  const free=budget.reserve(bytes);let worker;try{worker=workerFactory(new URL('./cmseg-window-bank-worker.js',import.meta.url));}catch(error){free();throw error;}
  const entry={worker,free,pending:new Map()};workers.add(entry);
  worker.onmessage=({data})=>{const p=entry.pending.get(data.id);if(!p)return;entry.pending.delete(data.id);if(data.ok)p.resolve(data);else{const error=new EngineError(data.error?.code??'COMPUTE_FAILED',data.error?.message??'CMSeg bank worker failed');error.details=data.error?.details;p.reject(error);}};
  worker.onerror=event=>{for(const p of entry.pending.values())p.reject(new EngineError('WORKER_FAILED',event.message));entry.pending.clear();};
  return entry;
 }
 async function work({plan,input,alpha,nativeFma,backend='cpu'},{signal,onProgress}={}){
  requireValue(!closed&&!closing&&workers.size===0&&!gpu&&temporary.size===0,'CMSeg bank owner must retire before reuse');plan.assertCurrent();checkAbort(signal);checkAbort(controller.signal);
  const combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]),{channels:c,count:n,side,k}=plan;
  requireValue([[24,128,24],[32,64,32],[96,32,96]].some(v=>v[0]===c&&v[1]===side&&v[2]===k)&&n===plan.contexts.length*side*side&&n<=0x3ffffff&&finite(input,Float32Array,c*n)&&finite(plan.mask,Uint8Array,n)&&plan.mask.every(v=>v===0||v===1)&&finite(plan.positions,Float32Array,2*n)&&typeof nativeFma==='boolean'&&Number.isFinite(alpha)&&['cpu','webgpu'].includes(backend),'Complete exact CMSeg bank required');
  let admitted,outputCredit,output,failed=false,primary,peakHeap=0,count=0,gpuWriteBytes=0,gpuReadBytes=0,gpuPeak=0,gpuAllocations=0;
  const rowSize=rowsPerJob,geometry={c,n,side,k,rowsPerJob:rowSize,nativeFma},tileBytes=rowSize*n*4;
  const moduleUrl=new URL('../../vendor/segmentation/cmseg-window-bank/'+(backend==='webgpu'?'post.js':'correlation.js'),import.meta.url).href;
  const current=()=>{checkAbort(combined);plan.assertCurrent();};
  const abort=()=>{for(const entry of workers)for(const p of entry.pending.values())p.reject(new EngineError('CANCELLED','CMSeg bank cancelled'));};combined.addEventListener('abort',abort,{once:true});
  try{
   // Parent statistics and full output have lifetimes distinct from native
   // Worker arenas and transferred tiles. Reserve before constructing arrays.
   admitted=budget.reserve(12*n);temporary.add(admitted);outputCredit=budget.reserve(4*k*n);
   const maxima=new Float32Array(n),inverse=new Float32Array(2*n);output=new Float32Array(k*n);
   let normalized,normalizedCredit;
   try{
    if(backend==='webgpu'){
     normalizedCredit=budget.reserve(input.byteLength);temporary.add(normalizedCredit);
     const normalizer=spawn(64*MiB+2*input.byteLength+2*n);
     const response=await call(normalizer,{type:'normalize',mode:'normalize',moduleUrl:new URL('../../vendor/segmentation/cmseg-window-bank/correlation.js',import.meta.url).href,geometry,input,mask:plan.mask});current();
     requireValue(finite(response.normalized,Float32Array,c*n),'Complete native normalized CMSeg tensor required');normalized=response.normalized;peakHeap=Math.max(peakHeap,response.heapBytes);await retire(normalizer);
    }
    const gpuHeadroom=backend==='webgpu'?2*input.byteLength+2*tileBytes+64+2*MiB+12*n:0;
    const perWorker=(backend==='webgpu'?32:64)*MiB+(backend==='cpu'?2*input.byteLength:2*tileBytes)+18*n+8*k*rowSize;
    const available=budget.limit-budget.total();count=Math.min(maxWorkers,Math.ceil(n/rowSize),Math.floor((available-gpuHeadroom)/perWorker));
    if(count<1)throw new EngineError('MEMORY_LIMIT','No complete CMSeg bank worker and native GPU admission fits');
    const lanes=[];for(let i=0;i<count;i++)lanes.push(spawn(perWorker));
    await Promise.all(lanes.map(async entry=>{const response=await call(entry,{type:'init',mode:backend==='webgpu'?'post':'cpu',moduleUrl,geometry,...(backend==='cpu'?{input}:{}),mask:plan.mask,positions:plan.positions});peakHeap=Math.max(peakHeap,response.heapBytes);}));current();
    if(backend==='webgpu'){gpu=await createDot({budget,input:normalized,c,side,contexts:plan.contexts.length,rowsPerJob:rowSize,scientificMask:plan.mask,onOwner:value=>{gpu=value;}});current();}
    function accept(phase,response,first,size){
     peakHeap=Math.max(peakHeap,response.heapBytes);
     if(phase==='statistics'){
      requireValue(finite(response.maxima,Float32Array,size)&&finite(response.inverse,Float32Array,size)&&finite(response.columnSum,Float32Array,size),'Complete native CMSeg statistics required');maxima.set(response.maxima,first);inverse.set(response.inverse,first);inverse.set(response.columnSum,n+first);
     }else{requireValue(finite(response.output,Float32Array,k*size),'Complete native CMSeg TopK tile required');for(let channel=0;channel<k;channel++)output.set(response.output.subarray(channel*size,(channel+1)*size),channel*n+first);}
    }
    for(const phase of ['statistics','topk']){
     let cursor=0,completed=0;
     if(backend==='cpu')await Promise.all(lanes.map(async entry=>{while(cursor<n){current();const first=cursor,size=Math.min(rowSize,n-first);cursor+=size;const response=await call(entry,{type:phase,first,count:size,alpha});current();accept(phase,response,first,size);completed+=size;onProgress?.({phase:'cmseg-window-'+phase,completed,total:n,workers:count});}}));
     else for(let wave=0;wave<n;wave+=count*rowSize){
      const pending=[];let waveFailed=false,waveError;
      try{for(let lane=0;lane<count&&wave+lane*rowSize<n;lane++){
       current();const first=wave+lane*rowSize,size=Math.min(rowSize,n-first);let dots;
       try{dots=await gpu.run({first,count:size},{signal:combined});current();requireValue(finite(dots.data,Float32Array,size*n),'Complete native GPU comparison rows required');gpuWriteBytes+=dots.timings.gpuWriteBytes;gpuReadBytes+=dots.timings.gpuReadBytes;gpuPeak=Math.max(gpuPeak,dots.gpu.peakAccountedBytes);gpuAllocations+=dots.gpu.allocations;
        const transferable=dots.data,job=call(lanes[lane],{type:phase,first,count:size,alpha,dots:transferable},[transferable.buffer]).then(response=>{current();accept(phase,response,first,size);completed+=size;onProgress?.({phase:'cmseg-window-'+phase,completed,total:n,workers:count});});job.catch(()=>{});pending.push(job);
       }finally{dots?.release();}
      }}catch(error){waveFailed=true;waveError=error;}
      const results=await Promise.allSettled(pending);if(!waveFailed){const rejected=results.find(v=>v.status==='rejected');if(rejected){waveFailed=true;waveError=rejected.reason;}}
      if(waveFailed)throw waveError;
     }
     current();if(phase==='statistics')await Promise.all(lanes.map(entry=>call(entry,{type:'distribute',maxima,inverse})));current();
    }
   }finally{normalized=null;}
   requireValue(output.every(Number.isFinite),'Finite complete CMSeg window correlation required');current();
  }catch(error){failed=true;primary=error;}
  finally{
   combined.removeEventListener('abort',abort);let clean=false;try{await cleanup();clean=true;}catch(error){if(!failed){failed=true;primary=error;}}
   if(failed){output=null;if(outputCredit){if(clean)outputCredit();else temporary.add(outputCredit);}}
  }
  if(failed)throw primary;
  let released=false;return{data:output,shape:[1,k,1,n],contexts:plan.contexts.map(c=>({index:c.index,offset:c.offset,count:c.count})),workers:count,requestedMaxWorkers:maxWorkers,observedHeapBytes:peakHeap,backend,comparisonPopulation:n,comparisonsPerPass:n*n,passes:2,gpu:backend==='webgpu'?{allocations:gpuAllocations,peakAccountedBytes:gpuPeak,timings:{gpuWriteBytes,gpuReadBytes}}:null,release(){if(released)return;released=true;output=null;outputCredit();}};
 }
 return Object.freeze({run(input,options={}){requireValue(!running&&!closed&&!closing,'CMSeg bank pool busy or retired');const promise=Promise.resolve().then(()=>work(input,options));running=promise;promise.finally(()=>{if(running===promise)running=null;}).catch(()=>{});return promise;},release:owner.release,dispose:owner.release,get pendingACKs(){return owner.pendingACKs;}});
}
