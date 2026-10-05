import {EngineError,checkAbort} from './errors.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
// Independent complete-axis strips only; global thresholds remain in the owner.
export class WaveletStripPool{
 constructor(budget,{maxWorkers=globalThis.navigator?.hardwareConcurrency??1,adaptive=new Map(),workerHeapBytes=12*1024**2,workerPixelBytes=192,workerFactory=globalThis.Worker?()=>new Worker(new URL('./wavelet-strip-worker.js',import.meta.url),{type:'module'}):null}={}){this.budget=budget;this.workerHeapBytes=workerHeapBytes;this.workerPixelBytes=workerPixelBytes;this.maximum=maxWorkers;this.factory=workerFactory;this.adaptive=adaptive;this.workers=new Map();this.peak=1;this.completed=0;this.plans=[];}
 clear(){for(const [worker,reject]of this.workers){worker.terminate();reject?.(new EngineError('CANCELLED','Transform strips stopped.'));}this.workers.clear();}
 async run({count,pixels,key,prepare,consume,local,signal,prepareBytes=0}){
  checkAbort(signal);const perWorker=this.workerHeapBytes+pixels*this.workerPixelBytes,maximum=Math.min(count,this.maximum);let adaptive=this.adaptive.get(key);if(!adaptive){adaptive=new AdaptiveConcurrency();if(this.adaptive.size>=64)this.adaptive.delete(this.adaptive.keys().next().value);this.adaptive.set(key,adaptive);}const plan=adaptive.select(key,maximum,this.budget,n=>n*(perWorker+prepareBytes));this.plans.push(plan);
  // The owner already admitted a full local strip workspace. Use it when the
  // budget cannot fit two extra worker workspaces; no startup/probe is run.
  if(!this.factory||plan.count<2||this.budget.limit-this.budget.retained-this.budget.active<(perWorker+prepareBytes)*2){for(let i=0;i<count;i++){checkAbort(signal);await consume(await local(await prepare(i)),i);this.completed++;}return;}
  const release=this.budget.reserve(perWorker*plan.count),abort=()=>this.clear(),started=performance.now();let next=0,failure;signal?.addEventListener('abort',abort,{once:true});this.peak=Math.max(this.peak,plan.count);
  const task=async()=>{const worker=this.factory();this.workers.set(worker,null);try{while(next<count){checkAbort(signal);const index=next++,job=await prepare(index);checkAbort(signal);if(failure)throw failure;const result=await new Promise((resolve,reject)=>{this.workers.set(worker,reject);worker.onmessage=({data})=>{this.workers.set(worker,null);data.error?reject(new EngineError(data.error.code,data.error.message)):resolve(data.result);};worker.onerror=e=>reject(new EngineError('WORKER_FAILED',e.message||'Transform strip failed'));const buffers=[...new Set(Object.values(job).filter(ArrayBuffer.isView).map(v=>v.buffer))];worker.postMessage(job,buffers);});checkAbort(signal);await consume(result,index);this.completed++;}}finally{this.workers.delete(worker);worker.terminate();}};
  try{const tasks=Array.from({length:plan.count},task);try{await Promise.all(tasks);}catch(error){failure=error;next=count;this.clear();await Promise.allSettled(tasks);throw error;}adaptive.observe(key,{count:plan.count,maximum,milliseconds:performance.now()-started,units:count});}
  catch(error){if(isWorkerResourceFailure(error))adaptive.reduce(key,plan.count);throw error;}finally{signal?.removeEventListener('abort',abort);this.clear();release();}
 }
 metrics(){return {workers:this.peak,completedStripJobs:this.completed,preflightExecutions:0,policy:'immediate-useful-work'};}
}
