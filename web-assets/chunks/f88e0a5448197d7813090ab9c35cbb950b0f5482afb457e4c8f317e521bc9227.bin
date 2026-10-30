import "../../runtime-context.js?v=0.30.0";
import {decodeMgcfdnWorkerError} from './mgcfdn-window-gpu-diagnostics.js';
import {requireValue,checkAbort,EngineError} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {planMgcfdn16WindowMemory} from './mgcfdn16-window-memory.js';
import {MGCFDN16_WINDOW_PINS} from './mgcfdn16-window-stage-runtime.js';
const LIMIT=512*1024**2;
export function createMgcfdn16WindowExecutor(admission,{budget,profile,urls,onOwner,signal,backend='webgpu',workerFactory=(url,options)=>new Worker(url,options)}={}){
  admission.assertCurrent();requireValue(admission.modelSha256===MGCFDN16_WINDOW_PINS.base.sha256&&typeof onOwner==='function'&&['cpu','webgpu'].includes(backend)&&['base'].every(key=>/^https?:$/.test(new URL(urls?.[key]).protocol)),'Pinned original MGCFDN16 URL and synchronous parent ownership required');
  const scheduler=getExecutionScheduler(budget,{maxWorkers:profile?.maxWorkers}),controller=new AbortController(),combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]),waits=new Map();
  // The original lane admission remains intact. Added graph bytes are charged
  // separately; no smaller heap/precision/core count makes the adaptation fit.
  const memoryPlan=planMgcfdn16WindowMemory(admission.featureCells,backend),residentBytes=memoryPlan.residentBytes,credit=budget.reserve(residentBytes);
  let worker,init,next=0,running,closing,closed=false,fatal=false,primary;
  const request=data=>new Promise((resolve,reject)=>{if(fatal){reject(primary);return;}const id=++next;waits.set(id,{resolve,reject});try{worker.postMessage({...data,id});}catch(error){waits.delete(id);reject(error);}});
  const fail=error=>{fatal=true;primary=error;for(const w of waits.values())w.reject(error);waits.clear();};
  const abort=()=>{try{worker?.postMessage({type:'abort'});}catch(error){fail(error);}};combined.addEventListener('abort',abort,{once:true});
  const owner={release(){if(closing)return closing;if(closed)return;controller.abort();closing=(async()=>{try{await running;}catch{}if(worker){if(!fatal)await request({type:'close'});worker.terminate();worker=undefined;}closed=true;combined.removeEventListener('abort',abort);credit();})().finally(()=>closing=undefined);return closing;}};try{onOwner(owner);}catch(error){combined.removeEventListener('abort',abort);credit();throw error;}
  const policy=Object.freeze({modelSha256:MGCFDN16_WINDOW_PINS.base.sha256,sourceIdentity:admission.sourceIdentity,assertCurrent(){checkAbort(combined);requireValue(!closing&&!closed&&!fatal,'Native window GPU execution retired');admission.assertCurrent();}});
  async function ready(){
    if(!init){worker=workerFactory(new URL('./mgcfdn16-window-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{const wait=waits.get(data.id);if(wait){waits.delete(data.id);data.ok?wait.resolve(data):wait.reject(data.errorRecord?decodeMgcfdnWorkerError(data.errorRecord):data.error);}};worker.onerror=e=>fail(new EngineError('WORKER_FAILED',e.message));
      const factory=new URL(backend==='webgpu'?'../vendor/segmentation/factory.mjs':'../vendor/d2prl/factory.mjs',import.meta.url).href;
      init=request({type:'init',config:{backend,precision:'float32',side:256,topk:40,modelSha256:MGCFDN16_WINDOW_PINS.base.sha256,urls,numThreads:1,wasmMaximumBytes:LIMIT,gpuMaximumBytes:backend==='webgpu'?LIMIT:0,graphBudgetBytes:memoryPlan.graphBudgetBytes,featureCells:memoryPlan.featureCells,ortUrl:new URL(backend==='webgpu'?'../vendor/segmentation/ort.all.min.mjs':'../vendor/d2prl/ort.wasm.min.mjs',import.meta.url).href,runtimeFactoryUrl:factory,wasmPaths:{mjs:factory,wasm:new URL(backend==='webgpu'?'../vendor/segmentation/ort-wasm-simd-threaded.jsep.wasm':'../vendor/d2prl/ort-wasm-simd-threaded.wasm',import.meta.url).href}}});
    }await init;
  }
  function run(label,feeds,{own,signal:jobSignal}={}){
    requireValue(!running&&!closed&&!closing&&typeof own==='function','One native GPU lane with parent output owner required');
    let jobId,ack,retired=false;const loan={outputs:null,metrics:null,release(){if(ack)return ack;if(retired||!jobId||closed)return;ack=request({type:'retire',jobId}).then(()=>{retired=true;loan.outputs=null;}).finally(()=>ack=undefined);return ack;}};own(loan);
    const task=Promise.resolve().then(async()=>{policy.assertCurrent();checkAbort(jobSignal);await ready();policy.assertCurrent();checkAbort(jobSignal);const lease=await scheduler.acquire({cpu:1,gpu:backend==='webgpu'?1:0,signal:combined,label:'mgcfdn16-one-window-'+label});try{policy.assertCurrent();checkAbort(jobSignal);jobId=next+1;const answer=await request({type:'run',label,feeds});loan.outputs=answer.outputs;loan.metrics=answer.metrics;policy.assertCurrent();checkAbort(jobSignal);return loan;}finally{lease.release();}});running=task;task.then(()=>{if(running===task)running=null;},()=>{if(running===task)running=null;});return task;
  }
  async function mapContexts(contexts,job){for(const context of contexts){policy.assertCurrent();await job(context);}}
  return Object.freeze({run,mapContexts,policy,release:owner.release,residentBytes,memoryPlan,nativeLanes:1,requestedMaximumCores:profile?.maxWorkers});
}
