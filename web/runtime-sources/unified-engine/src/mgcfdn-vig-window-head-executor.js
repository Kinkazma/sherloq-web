import "../../runtime-context.js?v=0.30.0";
import{attachWorkerMessageError}from'./worker-message-protocol.js';
import{decodeMgcfdnWorkerError}from'./mgcfdn-window-gpu-diagnostics.js';
import{requireValue,checkAbort,EngineError}from'./errors.js';
import{getExecutionScheduler}from'./execution-scheduler.js';
import{planVigWindowHeadMemory}from'./mgcfdn-vig-window-head-memory.js';
import{VIG_WINDOW_HEAD_PINS}from'./mgcfdn-vig-window-head-stage.js';
const LIMIT=512*1024**2;
// VIG's original tail is WASM even when its backbone uses real WebGPU.
export function createVigWindowHeadExecutor(admission,{budget,profile,tailUrl,onOwner,signal,workerFactory=(url,options)=>new Worker(url,options)}={}){
 admission.assertCurrent();requireValue(admission.modelSha256===VIG_WINDOW_HEAD_PINS.base.sha256&&typeof onOwner==='function'&&/^https?:$/.test(new URL(tailUrl).protocol),'Pinned native VIG tail and synchronous parent owner required');
 const memoryPlan=planVigWindowHeadMemory(admission.contextCells,admission.candidateCells),credit=budget.reserve(memoryPlan.residentBytes),scheduler=getExecutionScheduler(budget,{maxWorkers:profile?.maxWorkers}),controller=new AbortController(),combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]),waits=new Map();let worker,initializing,running,closing,closed=false,nativeClosed=false,fatal=false,primary,next=0,detachMessageError;
 const fail=error=>{fatal=true;primary=error;for(const wait of waits.values())wait.reject(error);waits.clear();};
 const request=message=>new Promise((resolve,reject)=>{if(fatal){reject(primary);return;}const id=++next;waits.set(id,{resolve,reject});try{worker.postMessage({...message,id});}catch(error){waits.delete(id);reject(error);}});
 const abort=()=>{try{worker?.postMessage({type:'abort'});}catch(error){fail(error);}};combined.addEventListener('abort',abort,{once:true});
 const owner={release(){if(closing)return closing;if(closed)return;controller.abort();closing=(async()=>{try{await running;}catch{}if(worker){if(!nativeClosed&&!fatal){await request({type:'close'});nativeClosed=true;}await worker.terminate();worker=undefined;}detachMessageError?.();detachMessageError=undefined;combined.removeEventListener('abort',abort);credit();closed=true;})().finally(()=>closing=undefined);return closing;}};try{onOwner(owner);}catch(error){combined.removeEventListener('abort',abort);credit();throw error;}
 const policy=Object.freeze({modelSha256:VIG_WINDOW_HEAD_PINS.base.sha256,sourceIdentity:admission.sourceIdentity,assertCurrent(){checkAbort(combined);requireValue(!closed&&!closing&&!fatal,'VIG tail execution retired');admission.assertCurrent();}});
 async function ready(){
  if(!initializing){worker=workerFactory(new URL('./mgcfdn-vig-window-head-worker.js',import.meta.url),{type:'module'});worker.onmessage=event=>{let data;try{data=event.data;}catch(cause){fail(new EngineError('WORKER_FAILED','VIG tail response envelope',{cause}));return;}if(!data||typeof data!=='object'||Array.isArray(data)||!Number.isSafeInteger(data.id)||data.id<=0||typeof data.ok!=='boolean'){fail(new EngineError('WORKER_FAILED','VIG tail response envelope'));return;}const wait=waits.get(data.id);if(!wait)return;waits.delete(data.id);data.ok?wait.resolve(data):wait.reject(data.errorRecord?decodeMgcfdnWorkerError(data.errorRecord):data.error);};worker.onerror=event=>fail(new EngineError('WORKER_FAILED',event.message));detachMessageError=attachWorkerMessageError(worker,()=>fail(new EngineError('WORKER_FAILED','VIG tail transport')));
   const factory=new URL('../vendor/d2prl/factory.mjs',import.meta.url).href;initializing=request({type:'init',config:{precision:'float32',side:256,topk:40,modelSha256:VIG_WINDOW_HEAD_PINS.base.sha256,tailUrl,numThreads:1,wasmMaximumBytes:LIMIT,gpuMaximumBytes:0,graphBudgetBytes:memoryPlan.graphBudgetBytes,contextCells:admission.contextCells,candidateCells:admission.candidateCells,ortUrl:new URL('../vendor/d2prl/ort.wasm.min.mjs',import.meta.url).href,runtimeFactoryUrl:factory,wasmPaths:{mjs:factory,wasm:new URL('../vendor/d2prl/ort-wasm-simd-threaded.wasm',import.meta.url).href}}});
  }await initializing;
 }
 function run(label,feeds,{own,signal:jobSignal}={}){
  requireValue(!running&&!closed&&!closing&&typeof own==='function','One native VIG tail lane with synchronous output owner required');let jobId,ack,retired=false;const loan={outputs:null,metrics:null,release(){if(ack)return ack;if(retired||!jobId||closed)return;ack=request({type:'retire',jobId}).then(()=>{retired=true;loan.outputs=null;}).finally(()=>ack=undefined);return ack;}};own(loan);
  const task=Promise.resolve().then(async()=>{policy.assertCurrent();checkAbort(jobSignal);await ready();policy.assertCurrent();checkAbort(jobSignal);const lease=await scheduler.acquire({cpu:1,gpu:0,signal:combined,label:'mgcfdn-vig-native-tail-'+label});try{policy.assertCurrent();checkAbort(jobSignal);jobId=next+1;const value=await request({type:'run',label,feeds});loan.outputs=value.outputs;loan.metrics=value.metrics;policy.assertCurrent();checkAbort(jobSignal);return loan;}finally{await lease.release();}});running=task;task.then(()=>{if(running===task)running=undefined;},()=>{if(running===task)running=undefined;});return task;
 }
 return Object.freeze({run,policy,release:owner.release,residentBytes:memoryPlan.residentBytes,memoryPlan,nativeLanes:1,requestedMaximumCores:profile?.maxWorkers,nativeExecutionProviders:Object.freeze(['wasm'])});
}
