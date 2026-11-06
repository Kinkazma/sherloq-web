import {acknowledgeDenseRetirement} from './dense-owner-retirement.js';
import {createDensePoolRetirement,densePoolLaneRetirement} from './dense-pool-retirement.js';
import {deserializeEngineError} from './errors.js';
import {serializeEngineError} from './errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
import {denseDescriptorHeapBound,denseDescriptorShape,denseResidentHeapBound,denseDescriptorCacheByteBound,selectDenseDescriptorCacheJobs} from './dense-math.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {DensePmParentBroker} from './dense-pm-parent-broker.js';
import {DensePmGpu} from './dense-pm-gpu.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
import {densePmGpuMemoryBound} from './dense-pm-job-gate.js';
import {describeDensePmGeometry} from './dense-pm-geometry.js';

// The dense build grows by up to 16 MiB beyond the next required extent,
// rounded to 64 KiB Wasm pages. Count that capacity, including persistent
// high water, in both admission planning and the backing ledger.
function residentMemoryPlan(plan){
  if(plan.wasmHeapBytes>2**31)throw new EngineError('MEMORY_LIMIT','Dense working set exceeds the resident WASM allowance.');
  const capacity=Math.min(2**31,Math.ceil((plan.wasmHeapBytes+16*1024**2)/65536)*65536);
  return {...plan,workspace:plan.workspace+capacity-plan.wasmHeapBytes,wasmHeapBytes:capacity};
}

export function denseJobMemory(job) {
  const {width,height,pass,gray,mask}=job;
  if(job.field){
    const n=width*height;
    requireValue(Number.isSafeInteger(n)&&n>0&&job.field.targets instanceof Int32Array&&job.field.targets.length===n&&job.field.distancesSquared instanceof Float32Array&&job.field.distancesSquared.length===n&&job.field.allowed instanceof Uint8Array&&job.field.allowed.length===n,'Invalid cached dense field.');
    return residentMemoryPlan({width,height,workspace:48*1024**2+n*80,wasmHeapBytes:48*1024**2+n*80,output:n*(job.coherence?14:10)});
  }

  requireValue(pass&&[0,1].includes(pass.method)&&typeof pass.reflection==='boolean'&&typeof pass.quarterTurn==='boolean','Invalid dense pass.');
  requireValue(pass.method===1||(!pass.quarterTurn&&pass.targetPatch===pass.patch),'Zernike does not use SIFT frames or paired bins.');
  requireValue(Number.isInteger(pass.targetPatch)&&pass.targetPatch>=(pass.method?3:2)&&pass.targetPatch<=32&&(pass.patch-pass.targetPatch)%2===0,'Invalid dense target support.');
  const a=denseDescriptorShape(width,height,pass.method,pass.patch),b=denseDescriptorShape(width,height,pass.method,pass.targetPatch);
  const dw=Math.min(a.width,b.width),dh=Math.min(a.height,b.height),n=dw*dh;
  const sourceBytes=job.sourceImage?job.sourceImage.width*job.sourceImage.height*3:0;
  requireValue(job.sourceImage ? (job.sourceImage.data instanceof Uint8Array&&job.sourceImage.data.length===sourceBytes||job.sourceImage.surface?.descriptor.format==='rgb8') : gray instanceof Float32Array&&gray.length===width*height&&mask instanceof Uint8Array&&mask.length===n,'Dense job dimensions mismatch.');
  if(job.compactDescriptors){
    const heap=pass.method===1?32*1024**2+width*height*180:denseResidentHeapBound(width,height,pass.patch,pass.reflection);
    if(heap>2**31)throw new EngineError('MEMORY_LIMIT','Compact SIFT exceeds the resident WASM allowance.');
    const preparation=job.sourceImage?32*1024**2+sourceBytes+width*height*40:0;
    return residentMemoryPlan({workspace:preparation+heap+(gray?.byteLength??width*height*4)+(mask?.byteLength??n)+n*10+(job.gpuPmEnabled&&pass.quarterTurn?n*2:0)+16*1024**2,wasmHeapBytes:heap,output:n*(job.coherence?14:10),width:dw,height:dh});
  }
  const av=a.width*a.height*a.dimensions*4,bv=b.width*b.height*b.dimensions*4;
  const heap=Math.max(denseDescriptorHeapBound(width,height,pass.method,pass.patch,pass.reflection),denseDescriptorHeapBound(width,height,pass.method,pass.targetPatch,pass.reflection),32*1024**2+2*n*a.dimensions*4+n*64);
  // Source is borrowed from caller. Worker copies, raw features, alignment and
  // WASM high-water memory are charged in addition to caller-owned input bytes.
  const preparation=job.sourceImage?32*1024**2+sourceBytes+width*height*40:0;
  const workspace=preparation+heap+(gray?.byteLength??width*height*4)+(mask?.byteLength??n)+(av+bv)*(pass.reflection?2:1)+2*n*a.dimensions*4+n*4+16*1024**2;
  return residentMemoryPlan({workspace,wasmHeapBytes:heap,output:n*(job.coherence?14:10),width:dw,height:dh});
}

// Reusing an instance preserves its linear-memory high-water capacity. A later
// job can have smaller descriptors but larger host staging, so max(workspace)
// alone is not a sufficient bound for a persistent lane.
export function denseResidentWorkerBytes(plans){return Math.max(...plans.map(p=>p.wasmHeapBytes))+Math.max(...plans.map(p=>p.workspace-p.wasmHeapBytes));}

// Admission is arithmetic only: no pixel read, allocation probe or warm-up.
// Plan every retained output and the largest simultaneously live worker, not
// just the RGB source. Compact representations preserve the native values.
export function planDenseResidentJobs(input,availableBytes,{sourceBytes=0,readScratchBytes=0}={}){
 const jobs=input.map(job=>({...job}));let plans;
 try{plans=jobs.map((job,i)=>{try{return denseJobMemory(job);}catch(error){if(error.code!=='MEMORY_LIMIT'||job.field)throw error;jobs[i]={...job,compactDescriptors:true};return denseJobMemory(jobs[i]);}});
  const outputBytes=plans.reduce((sum,p)=>sum+p.output,0),room=availableBytes-sourceBytes-outputBytes;
  for(let i=0;i<jobs.length;i++)if(plans[i].workspace>room&&!jobs[i].compactDescriptors&&!jobs[i].field){jobs[i].compactDescriptors=true;plans[i]=denseJobMemory(jobs[i]);}
  const workerBytes=denseResidentWorkerBytes(plans),peakBytes=sourceBytes+Math.max(readScratchBytes,outputBytes+workerBytes);
  return {fits:peakBytes<=availableBytes,jobs,plans,outputBytes,workerBytes,peakBytes};
 }catch(error){if(error.code!=='MEMORY_LIMIT')throw error;return {fits:false,peakBytes:null,reason:error.message};}
}

// Real useful jobs start immediately. The common engine Budget owns every
// reservation; there is no private per-pool memory budget or calibration job.
export class DenseFieldPool {
  constructor(budget,{maxWorkers=globalThis.navigator?.hardwareConcurrency??1,workerFactory=()=>new Worker(new URL('./dense-worker.js',import.meta.url),{type:'module'})}={}){
    requireValue(budget&&typeof budget.reserve==='function'&&Number.isInteger(maxWorkers)&&maxWorkers>=1,'Invalid dense pool budget/profile.');
    this.budget=budget;this.maxWorkers=maxWorkers;this.workerFactory=workerFactory;this.active=new Map();this.busy=false;this.disposed=false;this.stop=null;this.adaptive=new AdaptiveConcurrency();this.running=Promise.resolve();this.retirements=createDensePoolRetirement(budget,()=>!this.busy);this.disposal=null;
  }
  stopWorkers(){for(const [worker,reject] of this.active){worker.terminate();reject?.(new EngineError('CANCELLED','Dense worker stopped.'));}this.active.clear();}
  clear(){this.stop?.abort();this.stopWorkers();}
  dispose(){
    this.disposed=true;if(this.disposal)return this.disposal;
    let failed=false,primary;try{this.clear();}catch(error){failed=true;primary=error;}
    const task=(async()=>{await this.running;try{await this.retirements.drain();}catch(error){if(failed)attachGpuCleanup(primary,error);else{failed=true;primary=error;}}if(failed)throw primary;this.adaptive.clear();})();
    this.disposal=task;void task.finally(()=>{if(this.disposal===task)this.disposal=null;}).catch(()=>{});return task;
  }
  async run(jobs,{signal,onProgress,retainResult,resourceOperation,backend='auto'}={}){
    requireValue(!this.disposed&&!this.busy&&Array.isArray(jobs)&&jobs.length>0,'Dense pool is disposed, busy or has no jobs.');checkAbort(signal);
    if(this.retirements.size){this.busy=true;try{await this.retirements.drain();}finally{this.busy=false;}requireValue(!this.disposed,'Dense pool disposed during retirement');checkAbort(signal);}
    requireValue(['cpu','auto','webgpu'].includes(backend),'Invalid dense pool backend');
    jobs=jobs.map(j=>({...j,gpuPmEnabled:!j.field&&(backend==='webgpu'||backend==='auto'&&j.width*j.height>=131072)}));const plans=jobs.map((job,i)=>{try{return denseJobMemory(job);}catch(e){if(e.code!=='MEMORY_LIMIT'||job.field||![0,1].includes(job.pass?.method))throw e;jobs[i]={...job,compactDescriptors:true};return denseJobMemory(jobs[i]);}}),outputs=plans.reduce((sum,p)=>sum+p.output,0);
    const room=this.budget.limit-this.budget.retained-this.budget.active-outputs;
    for(let i=0;i<jobs.length;i++)if(plans[i].workspace>room&&!jobs[i].field&&!jobs[i].compactDescriptors){jobs[i].compactDescriptors=true;plans[i]=denseJobMemory(jobs[i]);}
    jobs=selectDenseDescriptorCacheJobs(jobs);
    const largest=denseResidentWorkerBytes(plans),heapBound=Math.max(...plans.map(p=>p.wasmHeapBytes));
    const key=backend+'/'+jobs.map(j=>[j.width,j.height,j.pass.method,j.pass.patch,j.pass.targetPatch,!!j.compactDescriptors].join(':')).join('/');
    const releaseOutput=this.budget.reserve(outputs),outputHolds=[],releaseAllOutput=()=>{releaseOutput();for(const hold of outputHolds)hold();outputHolds.length=0;};
    let releaseWorkers=null,operation,delivered=false,count=1,runFailed=false,runPrimary,finishRun;this.busy=true;this.running=new Promise(resolve=>finishRun=resolve);this.stop=new AbortController();signal=signal?AbortSignal.any([signal,this.stop.signal]):this.stop.signal;
    const abort=()=>this.stopWorkers();signal.addEventListener('abort',abort,{once:true});
    try{
      operation=this.budget.beginOperation?.({owner:'patchmatch',id:'dense-resident/run',parent:resourceOperation});
      let gpuPeak=0;
      for(let i=0;i<jobs.length;i++){const job=jobs[i];if(job.gpuPmEnabled&&describeDensePmGeometry(plans[i].width,plans[i].height,job.options??{})){const bytes=densePmGpuMemoryBound(plans[i].width,plans[i].height,job.pass.method?128:12,job.options?.iterations??8,job.pass.reflection||job.pass.patch!==job.pass.targetPatch,job.options?.axes?(plans[i].width+plans[i].height)*4:0);if(Number.isFinite(bytes))gpuPeak=Math.max(gpuPeak,bytes);}}
      const pipelinePerLane=48*1024**2,gpuRoom=!!gpuPeak&&largest+pipelinePerLane+gpuPeak<=this.budget.limit-this.budget.retained-this.budget.active;
      const plan=this.adaptive.select(key,Math.min(this.maxWorkers,jobs.length),this.budget,n=>n*(largest+(gpuRoom?pipelinePerLane:0))+(gpuRoom?gpuPeak:0));
      count=plan.count;const start=performance.now();
      releaseWorkers=this.budget.reserve(count*largest);checkAbort(signal);
      const results=new Array(jobs.length);let next=0,completed=0;
      const scheduler=getExecutionScheduler(this.budget,{maxWorkers:this.maxWorkers});
      const task=async lane=>{
        // Each persistent lane owns its heap through every hypothesis and CPU
        // scheduling gap. Retiring one lane returns its actual reservation now,
        // rather than waiting for the slowest sibling to complete.
        const releaseLane=releaseWorkers.split(largest);let worker,sourceImage,laneOperation,backing,heapBytes=0,cacheBacking,cacheBytes=0,gpuProvider,laneFailed=false,lanePrimary,cacheRetiredBytes,wasmRetiredBytes;
        try{
        laneOperation=this.budget.beginOperation?.({owner:'patchmatch',id:'dense-resident/lane/'+lane,parent:operation});
        backing=this.budget.registerBacking?.('wasm',heapBound,{owner:'patchmatch',label:'dense-resident/worker',state:'reserved',operation:laneOperation});
        while(next<jobs.length){
          // Keep the initialized worker and its memory, but return CPU capacity
          // between hypotheses so queued GPU/CPU work can make useful progress.
          let lease=await scheduler.acquire({cpu:1,signal,label:'dense-resident',resourceOwner:'patchmatch',operation:laneOperation}),broker,jobFailed=false,jobPrimary;
          const releaseCpu=async()=>{if(lease){const current=lease;await current.release();if(lease===current)lease=null;}},acquireCpu=async()=>{if(!lease)lease=await scheduler.acquire({cpu:1,signal,label:'dense-resident-resume',resourceOwner:'patchmatch',operation:laneOperation});};
          try{
            checkAbort(signal);if(next>=jobs.length)break;
            if(!worker){worker=this.workerFactory();this.active.set(worker,null);}
            const index=next++,job=jobs[index];
            const result=await new Promise((resolve,reject)=>{
              let protocol,settled=false;const finish=(failed,error,result)=>{if(settled)return;settled=true;if(failed)broker?.abort(error);protocol?.dispose();failed?reject(error):resolve(result);};this.active.set(worker,error=>finish(true,error));
              broker=new DensePmParentBroker({budget:this.budget,maxWorkers:this.maxWorkers,signal,releaseCpu,acquireCpu,post:(message,transfer)=>protocol.post(message,transfer),providerFactory:()=>gpuProvider??=new DensePmGpu(this.budget,{maxWorkers:this.maxWorkers}),onFailure:error=>finish(true,error),onProgress:event=>onProgress?.({completed,total:jobs.length,index,phase:event.phase,iteration:event.completed,iterations:event.total,context:job.context,pass:job.pass})});
              protocol=installWorkerMessageProtocol(worker,async data=>{
                if(await broker.handle(data))return;
                if(data.phase){requireValue(typeof data.phase==='string','Invalid dense worker phase.');try{onProgress?.({completed,total:jobs.length,index,phase:data.phase,context:job.context,pass:job.pass});}catch(error){finish(true,error);}return;}
                if(data.error){if(typeof data.error.code!=='string'||typeof data.error.message!=='string')throw workerMessageFailure('dense-resident','message','invalid-error');finish(true,deserializeEngineError(data.error));}
                else{if(!data.result)throw workerMessageFailure('dense-resident','message','missing-result');finish(false,null,data.result);}
              },{label:'dense-resident',onFailure:error=>finish(true,error)});
              worker.onerror=event=>protocol.fail(workerMessageFailure('dense-resident','error',event.message||'worker-failed'));
              // Deliberately borrow/copy, never detach caller caches or source.
              const reuseSource=!!job.sourceImage&&job.sourceImage===sourceImage;
              try{protocol.post(reuseSource?{...job,sourceImage:undefined,reuseSource:true}:job);if(job.sourceImage)sourceImage=job.sourceImage;}catch(error){protocol.fail(error);}
            });
            await broker.settle();await broker.dispose({retireProvider:false});
            checkAbort(signal);
            if(result.heapBytes!==undefined){requireValue(Number.isSafeInteger(result.heapBytes)&&result.heapBytes>=0&&result.heapBytes<=heapBound,'Dense heap exceeds its admitted allowance.');heapBytes=Math.max(heapBytes,result.heapBytes);backing?.materialize(heapBytes);}
            const reportedCache=result.descriptorCache?.retainedBytes??0;
            requireValue(Number.isSafeInteger(reportedCache)&&reportedCache>=0&&reportedCache<=denseDescriptorCacheByteBound(job),'Dense descriptor cache exceeds its existing admitted source-feature bound.');
            if(reportedCache){if(cacheBacking)cacheBacking.resize(reportedCache);else cacheBacking=this.budget.registerBacking?.('array-buffer',reportedCache,{owner:'patchmatch',label:'dense-resident/source-descriptor-cache',operation:laneOperation});}else{cacheBacking?.();cacheBacking=null;}
            if(cacheBytes>reportedCache)this.budget.notifyBackingRelease?.('array-buffer',cacheBytes-reportedCache);cacheBytes=reportedCache;
            requireValue(result&&result.targets instanceof Int32Array&&result.targets.length===plans[index].width*plans[index].height&&result.distancesSquared instanceof Float32Array&&result.distancesSquared.length===result.targets.length&&result.selected instanceof Uint8Array&&result.selected.length===result.targets.length&&(!job.coherence||result.errors instanceof Float32Array&&result.errors.length===result.targets.length),'Invalid dense worker result.');
            laneOperation?.setState('io');results[index]=result;if(retainResult){const owned=releaseOutput.split(plans[index].output);let accepted=false;try{accepted=retainResult(index,result,owned)===true;}finally{if(!accepted)outputHolds.push(owned);}}completed++;laneOperation?.commit();onProgress?.({completed,total:jobs.length,index,phase:'complete',context:job.context,pass:job.pass});
          }catch(error){jobFailed=true;jobPrimary=error;throw error;}
          finally{
            let cleanupFailed=false,cleanupPrimary;const attempt=async action=>{try{await action();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}}};
            if(broker&&!broker.closed){if(worker)await attempt(()=>{this.active.delete(worker);worker.terminate();worker=null;});await attempt(()=>broker.dispose({workerTerminated:!worker,retireProvider:false}));}
            if(worker&&this.active.has(worker))this.active.set(worker,null);await attempt(releaseCpu);await attempt(()=>laneOperation?.setState('ready'));
            if(cleanupFailed){if(jobFailed)attachGpuCleanup(jobPrimary,cleanupPrimary);else throw cleanupPrimary;}
          }
        }
        }catch(error){laneFailed=true;lanePrimary=error;throw error;}
        finally{
          const retirement=densePoolLaneRetirement({
            stopWorker:async()=>{if(worker){this.active.delete(worker);await acknowledgeDenseRetirement(()=>worker.terminate());worker=null;}},
            retireGpu:async()=>{await acknowledgeDenseRetirement(()=>gpuProvider?.dispose());gpuProvider=null;},
            retireCache:async()=>{if(cacheBacking){cacheRetiredBytes=await cacheBacking();cacheBacking=null;}if(cacheBytes){if(cacheRetiredBytes!==0)await this.budget.notifyBackingRelease?.('array-buffer',cacheRetiredBytes??cacheBytes);cacheBytes=0;}},
            retireWasm:async()=>{if(backing){wasmRetiredBytes=await backing();backing=null;}if(heapBytes){if(wasmRetiredBytes!==0)await this.budget.notifyBackingRelease?.('wasm',wasmRetiredBytes??heapBytes);heapBytes=0;}},
            refundLane:()=>releaseLane(),releaseOperation:()=>laneOperation?.release()
          });
          try{await this.retirements.retire(retirement);}catch(error){if(laneFailed)attachGpuCleanup(lanePrimary,error);else throw error;}
        }
      };
      // Settle cancellation before releasing reservations on any sibling error.
      const tasks=Array.from({length:count},(_,lane)=>task(lane));
      try{await Promise.all(tasks);}catch(error){next=jobs.length;try{this.clear();}catch(cleanup){attachGpuCleanup(error,cleanup);}await Promise.allSettled(tasks);throw error;}
      checkAbort(signal);this.adaptive.observe(key,{count,maximum:Math.min(this.maxWorkers,jobs.length),milliseconds:performance.now()-start,units:jobs.length});delivered=true;
      return {results,release:releaseAllOutput,metrics:{workers:count,completedJobs:completed,completedGpuJobs:results.filter((r,i)=>!jobs[i].field&&r.execution?.backend?.startsWith('webgpu')).length,fieldExecutions:results.map((r,i)=>({pass:jobs[i].pass.id,context:jobs[i].context??null,reusedField:!!jobs[i].field,descriptors:'native-cpu',coherence:'native-cpu',matching:r.execution??{backend:'native-cpu'}})),preflightExecutions:0,policy:'immediate-useful-work',scheduling:plan,outputBytes:outputs,workerReservationBytes:count*largest,compactDescriptorJobs:jobs.filter(j=>j.compactDescriptors&&!j.field&&j.pass.method===1).length,residentZernikeJobs:jobs.filter(j=>j.compactDescriptors&&!j.field&&j.pass.method===0).length}};
    }catch(error){runFailed=true;runPrimary=error;if(isWorkerResourceFailure(error))this.adaptive.reduce(key,count,{error});throw error;}finally{
      let cleanupFailed=false,cleanupPrimary;const attempt=async action=>{try{await action();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}else attachGpuCleanup(cleanupPrimary,error);}};
      try{
        signal.removeEventListener('abort',abort);await attempt(()=>this.clear());this.stop=null;
        let workersDone=false,operationDone=false,outputsDone=delivered;
        await attempt(()=>this.retirements.retire({close:async()=>{
          let failed=false,primary;const close=async action=>{try{await action();}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}};
          if(!workersDone)await close(async()=>{await releaseWorkers?.();workersDone=true;});
          if(!operationDone)await close(async()=>{await operation?.release();operationDone=true;});
          if(!outputsDone)await close(async()=>{await releaseAllOutput();outputsDone=true;});
          if(failed)throw primary;
        }}));
      }finally{this.busy=false;finishRun();}
      if(cleanupFailed){if(runFailed)attachGpuCleanup(runPrimary,cleanupPrimary);else throw cleanupPrimary;}
    }
  }
}
