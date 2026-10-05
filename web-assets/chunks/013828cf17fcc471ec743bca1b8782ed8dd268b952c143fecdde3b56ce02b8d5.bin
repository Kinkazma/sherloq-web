import "../../runtime-context.js?v=0.14.5";
import {deserializeWorkerError} from './errors.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
export const CLONING_GROUP_ROWS=16;
export function cloningGroupWorkerBytes(input){
  const count=input.matches.length/3,inputs=input.matches.byteLength+input.displacements.byteLength+input.near.byteLength;
  // Inputs and clone staging, one numeric Set, chunked + consolidated output,
  // row lengths, chunk rounding and worker/runtime bookkeeping. No WASM heap.
  return inputs*2+count*64+(count*CLONING_GROUP_ROWS)*8+CLONING_GROUP_ROWS*8+128*1024+2*1024**2;
}
export class CloningGroupPool{
  constructor(budget,profile){this.budget=budget;this.resourceOwner='cloning';this.profile=profile;this.workers=[];this.pending=new Set();this.charged=0;this.adaptive=new AdaptiveConcurrency();}
  clear(){cancelScheduledWorkerCalls(this);for(const w of this.workers)w.terminate();this.workers=[];this.budget.retained-=this.charged;this.charged=0;for(const reject of this.pending)reject(new EngineError('CANCELLED','Copy/move grouping workers stopped.'));this.pending.clear();}
  dispose(){this.clear();this.adaptive.clear();}
  rpc(worker,data,transfer=[]){return scheduledWorkerCall(this,()=>new Promise((resolve,reject)=>{this.pending.add(reject);worker.onmessage=({data})=>{this.pending.delete(reject);data.error?reject(deserializeWorkerError(data.error,'Copy/move grouping worker failed.')):resolve(data);};worker.onerror=()=>{this.pending.delete(reject);reject(new EngineError('WORKER_FAILED','Copy/move grouping worker failed.'));};try{worker.postMessage(data,transfer);}catch(error){this.pending.delete(reject);reject(error);}}),{label:'cloning-group-pool'});}
  async run(input,{signal,onProgress,account}={}){
    requireValue(typeof account==='function','Grouping output needs shared memory admission.');
    const n=input.matches.length/3,available=typeof Worker==='undefined'?1:Math.min(Math.ceil(n/CLONING_GROUP_ROWS),this.profile.maxWorkers),perWorker=cloningGroupWorkerBytes(input),key=n+'/'+input.pointCount;
    const plan=this.adaptive.select(key,available,this.budget,c=>c>1?perWorker*c:0),base={...plan,preflightExecutions:0,taskExecutions:1};
    if(plan.count===1)return {metrics:{cloningGroupWorkers:1,cloningGroupScheduling:base}};
    const count=plan.count,started=performance.now(),releases=[];let next=0,done=0,total=0,stopped=false;
    const reserve=bytes=>{const free=account(bytes);if(typeof free==='function')releases.push(free);},abort=()=>{stopped=true;this.clear();};signal?.addEventListener('abort',abort,{once:true});
    try{
      checkAbort(signal);this.budget.retain(perWorker*count);this.charged=perWorker*count;
      reserve(n*4+Math.ceil(n/CLONING_GROUP_ROWS)*64);const lengths=new Uint32Array(n),parts=new Array(Math.ceil(n/CLONING_GROUP_ROWS));
      for(let i=0;i<count;i++)this.workers.push(new Worker(new URL('./cloning-group-worker.js',import.meta.url),{type:'module'}));
      await Promise.all(this.workers.map(async worker=>{
        const copy={...input,matches:input.matches.slice(),displacements:input.displacements.slice(),near:input.near.slice()};
        await this.rpc(worker,{kind:'init',input:copy},[copy.matches.buffer,copy.displacements.buffer,copy.near.buffer]);checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','Grouping stopped.');
        while(next<n){
          if(stopped)throw new EngineError('CANCELLED','Grouping stopped.');
          const first=next,last=Math.min(n,first+CLONING_GROUP_ROWS);next=last;
          const result=await this.rpc(worker,{kind:'rows',first,last});checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','Grouping stopped.');
          requireValue(result.lengths instanceof Uint32Array&&result.lengths.length===last-first&&result.groups instanceof Uint32Array,'Invalid copy/move group response.');
          let length=0;for(const size of result.lengths){requireValue(size>=1&&size<=n,'Invalid copy/move group size.');length+=size;}
          requireValue(length===result.groups.length,'Invalid copy/move group indices.');
          total+=length;
          reserve(result.groups.byteLength);parts[first/CLONING_GROUP_ROWS]=result.groups;lengths.set(result.lengths,first);done+=last-first;onProgress?.(done/n);
        }
      }));
      reserve(total*4);const groups=new Uint32Array(total);let at=0;for(const part of parts){groups.set(part,at);at+=part.length;}
      checkAbort(signal);const elapsed=performance.now()-started;this.adaptive.observe(key,{count,maximum:available,milliseconds:elapsed,units:n*n});
      return {lengths,groups,metrics:{cloningGroupWorkers:count,cloningGroupScheduling:{...base,completedRows:done,workerReservationBytes:perWorker*count,kernelMs:elapsed}}};
    }catch(error){
      stopped=true;this.clear();for(const release of releases)release();checkAbort(signal);
      if(!isWorkerResourceFailure(error))throw error;
      this.adaptive.reduce(key,count,{error});return {metrics:{cloningGroupWorkers:1,cloningGroupScheduling:{...base,taskExecutions:2,retry:{code:error.code??'MEMORY_ALLOCATION',failedWorkers:count}}}};
    }finally{signal?.removeEventListener('abort',abort);this.clear();}
  }
}
