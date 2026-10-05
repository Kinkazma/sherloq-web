import "../../runtime-context.js?v=0.14.5";
import {deserializeEngineError} from './errors.js';
import {serializeEngineError} from './errors.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {EngineError,checkAbort} from './errors.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
// Independent complete-axis strips only; global thresholds remain in the owner.
export class WaveletStripPool{
 constructor(budget,{resourceOwner='transform',resourceOperation,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,adaptive=new Map(),workerHeapBytes=12*1024**2,workerPixelBytes=192,workerFactory=globalThis.Worker?()=>new Worker(new URL('./wavelet-strip-worker.js',import.meta.url),{type:'module'}):null}={}){this.budget=budget;this.resourceOwner=resourceOwner;this.resourceOperation=resourceOperation;this.workerHeapBytes=workerHeapBytes;this.workerPixelBytes=workerPixelBytes;this.maximum=maxWorkers;this.factory=workerFactory;this.adaptive=adaptive;this.workers=new Map();this.peak=1;this.completed=0;this.plans=[];}
 clear(){cancelScheduledWorkerCalls(this);for(const [worker,reject]of this.workers){worker.terminate();reject?.(new EngineError('CANCELLED','Transform strips stopped.'));}this.workers.clear();}
 async run({count,pixels,key,prepare,consume,local,signal,prepareBytes=0}){
  checkAbort(signal);const perWorker=this.workerHeapBytes+pixels*this.workerPixelBytes,maximum=Math.min(count,this.maximum);let adaptive=this.adaptive.get(key);if(!adaptive){adaptive=new AdaptiveConcurrency();if(this.adaptive.size>=64)this.adaptive.delete(this.adaptive.keys().next().value);this.adaptive.set(key,adaptive);}const plan=adaptive.select(key,maximum,this.budget,n=>n*(perWorker+prepareBytes));this.plans.push(plan);let ceiling=plan.ceiling;
  const controller=new AbortController(),joined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  let next=0,failure,active=0,pumping=false,done,localStarted=false,runPeak=1;const finished=new Promise(resolve=>{done=resolve;}),started=performance.now();
  const abort=()=>this.clear();joined.addEventListener('abort',abort,{once:true});
  const lane=async(worker,release)=>{
   try{
    while(next<count){
     checkAbort(joined);const usefulStarted=performance.now(),index=next++,job=await prepare(index);checkAbort(joined);
     const result=await scheduledWorkerCall(this,()=>worker?new Promise((resolve,reject)=>{
      this.workers.set(worker,reject);worker.onmessage=({data})=>{this.workers.set(worker,null);data.error?reject(deserializeEngineError(data.error)):resolve(data.result);};worker.onerror=e=>reject(new EngineError('WORKER_FAILED',e.message||'Transform strip failed'));
      const buffers=[...new Set(Object.values(job).filter(ArrayBuffer.isView).map(v=>v.buffer))];worker.postMessage(job,buffers);
     }):local(job),{signal:joined,label:'transform-strip'});
     checkAbort(joined);await consume(result,index);this.completed++;adaptive.observe(key,{count:active,maximum,milliseconds:performance.now()-usefulStarted,units:1});ceiling=adaptive.select(key,maximum,this.budget,n=>n*(perWorker+prepareBytes)).ceiling;pump();
    }
   }catch(error){failure??=error;controller.abort();}
   finally{if(worker){this.workers.delete(worker);worker.terminate();}release?.();active--;pump();}
  };
  const pump=()=>{
   if(pumping)return;pumping=true;
   try{
    while(!joined.aborted&&this.factory&&next<count&&active<ceiling){
     // Source-window reservations are owned by prepare(), not counted a second
     // time here. Leave room for every active reader before adding a native heap.
     if(this.budget.total()+perWorker+(active+1)*prepareBytes>this.budget.limit)break;
     const release=this.budget.reserve(perWorker);let worker;
     try{worker=this.factory();}catch(error){release();failure??=error;controller.abort();break;}
     this.workers.set(worker,null);active++;runPeak=Math.max(runPeak,active);this.peak=Math.max(this.peak,active);void lane(worker,release);
    }
    // The caller already owns the local workspace. It can begin useful work
    // under tight memory, while later releases may still start extra workers.
    if(!joined.aborted&&next<count&&!active&&!localStarted){localStarted=true;active++;void lane(null);}
    if(!active&&(joined.aborted||next===count))done();
   }finally{pumping=false;}
  };
  const unsubscribe=this.budget.subscribe(pump);
  try{pump();await finished;if(failure)throw failure;checkAbort(joined);adaptive.observe(key,{count:runPeak,maximum,milliseconds:performance.now()-started,units:count});}
  catch(error){if(isWorkerResourceFailure(error))adaptive.reduce(key,runPeak,{error});throw error;}
  finally{unsubscribe();joined.removeEventListener('abort',abort);this.clear();}
 }
 metrics(){return {workers:this.peak,completedStripJobs:this.completed,preflightExecutions:0,policy:'elastic useful strips, shared CPU admission'};}
}
