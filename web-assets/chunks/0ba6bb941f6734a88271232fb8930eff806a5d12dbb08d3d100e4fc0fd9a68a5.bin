import "../../runtime-context.js?v=0.14.5";
import {deserializeWorkerError} from './errors.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
export class ResamplingViewPool{
 constructor(budget,profile){this.budget=budget;this.resourceOwner='resampling';this.profile=profile;this.workers=[];this.pending=new Set();this.charged=0;this.adaptive=new AdaptiveConcurrency();}
 clear(){cancelScheduledWorkerCalls(this);for(const w of this.workers)w.terminate();this.workers=[];this.budget.retained-=this.charged;this.charged=0;for(const reject of this.pending)reject(new EngineError('CANCELLED','Fourier presentation workers stopped.'));this.pending.clear();}
 dispose(){this.clear();this.adaptive.clear();}
 rpc(worker,data){return scheduledWorkerCall(this,()=>new Promise((resolve,reject)=>{this.pending.add(reject);worker.onmessage=({data})=>{this.pending.delete(reject);data.error?reject(deserializeWorkerError(data.error,'Fourier presentation worker failed.')):resolve(data);};worker.onerror=()=>{this.pending.delete(reject);reject(new EngineError('WORKER_FAILED','Fourier presentation worker failed.'));};try{worker.postMessage(data,[data.values.buffer]);}catch(e){this.pending.delete(reject);reject(e);}}),{label:'resampling-view-pool'});}
 async run(data,params,{signal}={}){
  const side=data.geometry.outputSide,n=data.magnitude.length,available=typeof Worker==='undefined'?1:Math.min(side,this.profile.maxWorkers),bytes=count=>n*32+count*2*1024**2,key=side+'/'+params.gamma;
  const plan=this.adaptive.select(key,available,this.budget,c=>c>1?bytes(c):0);if(plan.count===1)return {metrics:{fourierViewWorkers:1,fourierViewScheduling:{...plan,preflightExecutions:0,taskExecutions:1}}};
  const count=plan.count,start=performance.now();let done=0;const abort=()=>this.clear();signal?.addEventListener('abort',abort,{once:true});
  try{checkAbort(signal);this.budget.retain(bytes(count));this.charged=bytes(count);for(let i=0;i<count;i++)this.workers.push(new Worker(new URL('./resampling-view-worker.js',import.meta.url),{type:'module'}));
   const values=new Float64Array(n),pixels=new Uint8Array(n*3);
   await Promise.all(this.workers.map(async(worker,i)=>{const first=Math.floor(i*side/count),last=Math.floor((i+1)*side/count),offset=first*side,length=(last-first)*side;const result=await this.rpc(worker,{values:data.magnitude.slice(offset,offset+length),width:side,rows:last-first,low:data.minimumMagnitude,high:data.maximumMagnitude,params});checkAbort(signal);requireValue(result.values instanceof Float64Array&&result.values.length===length&&result.pixels instanceof Uint8Array&&result.pixels.length===length*3,'Invalid Fourier presentation worker response.');values.set(result.values,offset);pixels.set(result.pixels,offset*3);done++;}));
   const elapsed=performance.now()-start;this.adaptive.observe(key,{count,maximum:available,milliseconds:elapsed,units:n});return {values,pixels,metrics:{fourierViewWorkers:count,fourierViewKernelMs:elapsed,fourierViewScheduling:{...plan,preflightExecutions:0,taskExecutions:1,completedGroups:done,workerReservationBytes:bytes(count)}}};
  }catch(error){this.clear();checkAbort(signal);if(!isWorkerResourceFailure(error))throw error;this.adaptive.reduce(key,count,{error});return {metrics:{fourierViewWorkers:1,fourierViewScheduling:{...plan,preflightExecutions:0,taskExecutions:2,retry:{code:error.code??'MEMORY_ALLOCATION',failedWorkers:count}}}};}
  finally{signal?.removeEventListener('abort',abort);this.clear();}
 }
}
