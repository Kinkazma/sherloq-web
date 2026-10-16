import "../runtime-context.js?v=0.21.0";
import {installWorkerMessageProtocol} from '../unified-engine/src/worker-message-protocol.js';
import {deserializeEngineError,EngineError} from '../unified-engine/src/errors.js';
const pools=new WeakMap(),MiB=1024**2,RESIDENT=8*MiB,SCRATCH=8*MiB;
function check(signal){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');}
class SpectralPool{
 constructor(scheduler,budget){
  this.scheduler=scheduler;this.budget=budget;this.slots=new Set();this.starts=0;this.reuses=0;this.retired=0;
  this.unreclaim=budget.registerReclaimer(bytes=>{
   for(const slot of this.slots){if(budget.total()+bytes<=budget.limit)break;if(!slot.busy)this.drop(slot);}
  },{allocationKind:'array-buffer',owner:'spai-preprocessing',label:'idle-spai-FFT-workers'});
 }
 drop(slot,error=new EngineError('CANCELLED','SPAI preprocessing worker retired.')){
  if(!this.slots.delete(slot))return;
  slot.protocol.dispose();slot.worker.terminate();slot.pending?.reject(error);slot.pending=null;slot.release();this.retired++;
 }
 obtain(lease){
  let slot=[...this.slots].find(s=>!s.busy);
  if(slot){slot.busy=true;this.reuses++;lease.retainMemory(RESIDENT)();return slot;}
  const release=lease.retainMemory(RESIDENT);let worker;
  try{
   worker=new Worker(new URL('./spai-preprocess-worker.js',import.meta.url),{type:'module'});
   slot={worker,release,busy:true,pending:null};
   const fail=error=>{slot.error=error;this.drop(slot,error);};
   slot.protocol=installWorkerMessageProtocol(worker,data=>{
    const pending=slot.pending;if(!pending)throw Error('Unexpected SPAI worker response');slot.pending=null;
    if(data.error)pending.reject(deserializeEngineError(data.error));else pending.resolve(data.result);
   },{label:'spai-spectral',onFailure:fail});
   worker.onerror=e=>fail(new EngineError('WORKER_FAILED',e.message||'SPAI FFT worker failed.'));
   this.slots.add(slot);this.starts++;return slot;
  }catch(error){worker?.terminate();release();throw error;}
 }
 rpc(slot,job){
  return new Promise((resolve,reject)=>{
   slot.pending={resolve,reject};
   const transfers=job.raw?[job.raw.buffer]:[];
   try{slot.protocol.post(job,transfers);}catch(error){slot.pending=null;reject(error);}
  });
 }
 async run(image,origins,padding,{maxWorkers,signal,onProgress,patches,extractPatch,shareSource=true}={}){
  check(signal);const missing=origins.map((_,i)=>i).filter(i=>!patches[i]);
  if(!missing.length)return {workers:0,cachedPatches:origins.length};
  const shared=shareSource&&!!image.data&&globalThis.crossOriginIsolated===true&&typeof SharedArrayBuffer==='function';
  const maximum=Math.min(missing.length,this.scheduler.capacity.cpu,maxWorkers??this.scheduler.capacity.cpu);
  if(!Number.isInteger(maximum)||maximum<1)throw new TypeError('Invalid SPAI worker maximum');
  const sourceBytes=shared?image.data.byteLength:0,outputBytes=missing.length*3*3*224*224*4;
  // Reserve all returned tensors and a bounded per-lane FFT workspace before
  // allocating. CPU width shrinks elastically under the shared memory policy.
  const lease=await this.scheduler.acquire({cpu:maximum,minCpu:1,bytes:sourceBytes+outputBytes,bytesForCpu:n=>n*(RESIDENT+SCRATCH),domains:{'array-buffer':sourceBytes+outputBytes},signal,resourceOwner:'spai-preprocessing',label:'spai-spectral-FFT'});
  const slots=[];let next=0,complete=origins.length-missing.length,rgb,failed;
  const abort=()=>{for(const slot of slots)this.drop(slot);};
  signal?.addEventListener('abort',abort,{once:true});
  const started=performance.now(),before={starts:this.starts,reuses:this.reuses};
  try{
   check(signal);
   if(shared){rgb=new Uint8Array(new SharedArrayBuffer(sourceBytes));rgb.set(image.data);}
   for(let i=0;i<lease.cpu;i++)slots.push(this.obtain(lease));
   const lane=async slot=>{
    try{
     while(next<missing.length&&!failed){
      check(signal);const index=missing[next++],job=shared?{rgb,width:image.width,height:image.height,origin:origins[index],padding}:{raw:await extractPatch(image,origins[index],padding,{signal})};
      const result=await this.rpc(slot,job);check(signal);
      const feeds={};for(const key of ['x','x_low','x_high']){
       if(!(result[key] instanceof Float32Array)||result[key].length!==3*224*224)throw Error('Invalid SPAI FFT worker output');
       feeds[key]={data:result[key],dims:[1,3,224,224],type:'float32'};
      }
      patches[index]={feeds,origin_pixels:origins[index]};complete++;
      onProgress?.({phase:'preprocess',completed:complete,total:origins.length,workers:slots.length,transport:shared?'shared-rgb':'one-window-transfer'});
     }
    }catch(error){failed??=error;throw error;}
   };
   const settled=await Promise.allSettled(slots.map(lane));
   const failure=settled.find(r=>r.status==='rejected');if(failure)throw failure.reason;
   return {workers:slots.length,workerStarts:this.starts-before.starts,workerReuses:this.reuses-before.reuses,residentWorkers:this.slots.size,transport:shared?'shared-rgb':'one-window-transfer',milliseconds:performance.now()-started,cachedPatches:origins.length-missing.length};
  }finally{
   signal?.removeEventListener('abort',abort);rgb=null;
   for(const slot of slots){if(failed||signal?.aborted)this.drop(slot);else slot.busy=false;}
   lease.release();
  }
 }
 dispose(){for(const slot of [...this.slots])this.drop(slot);this.unreclaim();}
}
export function spectralPool(scheduler,budget){
 if(!scheduler||scheduler.budget!==budget)throw new TypeError('SPAI preprocessing requires the shared scheduler and its budget');
 let pool=pools.get(scheduler);if(!pool){pool=new SpectralPool(scheduler,budget);pools.set(scheduler,pool);}return pool;
}
export function disposeSpectralWorkers(scheduler){const pool=pools.get(scheduler);if(pool){pool.dispose();pools.delete(scheduler);}}
