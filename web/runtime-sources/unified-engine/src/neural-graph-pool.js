import "../../runtime-context.js?v=0.25.0";
import {alikedNativeHeapBytes} from './aliked-native-output-transport.js';
import {retireIdleNeuralWorker} from './neural-worker-retirement.js';
import {registerArrayViews} from './allocation.js';
import {EngineError,checkAbort,requireValue,deserializeEngineError,resourceAllocationKind,resourceRecoveryBytes,controlCheckpoint} from './errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {neuralGraphTransformAllowance} from './neural-scoped-model.js';
const MiB=1024**2;
const executionContexts=new WeakMap();
const dataBytes=inputs=>Object.values(inputs).reduce((n,t)=>n+t.data.byteLength,0);
function atomicAdmission(error,retryBytes){
  if(error?.code==='MEMORY_LIMIT')error.details={...error.details,admission:{...error.details?.admission,retryBytes,scope:'neural-job-and-resident-growth'}};
  return error;
}
/** Real useful jobs only. Sessions are lazy and reclaimable. The caller owns
 * source/input allocations; returned arrays have a lease until release().
 * workspaceBytes is a graph-specific live activation bound, not a benchmark.
 */
export class NeuralGraphPool {
  constructor(budget,profile,{assets,runtimes,resourceOwner='neural',modelCacheBytes=0,retryableAlikedRetirement=false,workerFactory=url=>new Worker(url,{type:'module'})}){
    requireValue(typeof retryableAlikedRetirement==='boolean'&&(!retryableAlikedRetirement||resourceOwner==='aliked-strict-native'),'Retryable idle retirement is reserved to the ALIKED strict pool.');this.retryableAlikedRetirement=retryableAlikedRetirement;
    this.budget=budget;this.profile=profile;this.resourceOwner=resourceOwner;this.assets=structuredClone(assets);this.runtimes=structuredClone(runtimes);this.factory=workerFactory;
    requireValue(Number.isSafeInteger(modelCacheBytes)&&modelCacheBytes>=0,'Invalid neural session cache bound.');this.modelCacheBytes=modelCacheBytes;
    this.slots=[];this.waiters=new Set();this.disposed=false;this.cpuOnly=false;this.clock=0;this.workerStarts=0;this.peakWorkers=0;this.runtimeReuses=0;this.gpuDeviceLimits=null;
    this.scheduler=getExecutionScheduler(budget,{maxWorkers:profile.maxWorkers});
    this.contexts=executionContexts.get(budget);if(!this.contexts){this.contexts={pools:new Set(),peakWorkers:0};executionContexts.set(budget,this.contexts);}this.contexts.pools.add(this);
    const reclaimers=['wasm','gpu'].map(kind=>budget.registerReclaimer(bytes=>this.reclaim(bytes,kind),{allocationKind:kind,owner:resourceOwner,label:'idle-neural-'+kind}));this.unreclaim=()=>reclaimers.forEach(release=>release());
  }
  reclaim(bytes,kind){
    // Reuse measured initialization cost from useful work only. Releasing the
    // cheapest bytes first avoids destroying every model for a small deficit.
    const candidates=this.slots.filter(slot=>!slot.busy&&(kind!=='gpu'||slot.provider==='webgpu')).sort((a,b)=>(Math.max(1,a.initializationMs??0)/a.bytes-Math.max(1,b.initializationMs??0)/b.bytes)||(a.lastUsed-b.lastUsed));
    for(const slot of candidates){if(this.budget.total()+bytes<=this.budget.limit)break;this.drop(slot);}
  }
  allSlots(){return [...this.contexts.pools].flatMap(pool=>pool.slots.map(slot=>({pool,slot})));}
  wake(){for(const pool of this.contexts.pools){for(const fn of pool.waiters)fn();pool.waiters.clear();}}
  drop(slot,error=new EngineError('CANCELLED','Neural worker stopped.')){
    if(!this.slots.includes(slot))return;
    if(slot.retiring&&!slot.retirementConfirmed)return slot.retiring;
    slot.executionController?.abort();slot.protocol?.dispose();slot.worker.terminate();for(const release of slot.threadLeases??[])release();this.slots.splice(this.slots.indexOf(slot),1);this.budget.retained-=slot.bytes;const retired=slot.backing?.();if(retired)this.budget.notifyBackingRelease?.('wasm',retired);const gpuRetired=slot.gpuBacking?.();if(gpuRetired)this.budget.notifyBackingRelease?.('gpu',gpuRetired);
    slot.reject?.(error);this.wake();
  }
  dropGracefully(slot,options){
    if(slot.retiring)return slot.retiring;
    if(!this.slots.includes(slot))return Promise.resolve();
    requireValue(!slot.busy||this.retryableAlikedRetirement&&slot.retirementState==='unconfirmed','Only idle neural workers can retire gracefully.');
    if(slot.provider!=='webgpu'){this.drop(slot);return Promise.resolve();}
    slot.busy=true;slot.retirementState='awaiting-native-cleanup';slot.protocol?.dispose();slot.protocol=null;slot.backing?.setReclaimable(false);slot.gpuBacking?.setReclaimable(false);
    return slot.retiring=(async()=>{try{const receipt=await retireIdleNeuralWorker(slot.worker,{...options,retryableAliked:this.retryableAlikedRetirement});slot.retirementReceipt=receipt;slot.retirementConfirmed=true;slot.retirementState='confirmed';this.drop(slot);return receipt;}catch(error){slot.retirementState='unconfirmed';slot.retirementError=error;if(this.retryableAlikedRetirement)slot.retiring=null;else slot.worker.terminate();this.wake();throw error;}})();
  }
  async clearGracefully(options){const retired=await Promise.allSettled([...this.slots].map(slot=>this.dropGracefully(slot,options))),failures=retired.filter(value=>value.status==='rejected').map(value=>value.reason);if(failures.length)throw failures[0];}
  disposeGracefully(options){if(this.gracefulDisposal)return this.gracefulDisposal;this.disposed=true;const task=(async()=>{let acknowledged=false;try{await this.clearGracefully(options);acknowledged=true;}finally{if(acknowledged||!this.retryableAlikedRetirement){this.unreclaim();this.wake();this.contexts.pools.delete(this);}}})();this.gracefulDisposal=task;if(this.retryableAlikedRetirement)void task.catch(()=>{if(this.gracefulDisposal===task)this.gracefulDisposal=null;});return task;}
  clear(){for(const s of [...this.slots])this.drop(s);}
  snapshot(){const shared=this.allSlots();return {residentWorkers:this.slots.length,busyWorkers:this.slots.filter(s=>s.busy).length,peakWorkers:this.peakWorkers,workerStarts:this.workerStarts,runtimeReuses:this.runtimeReuses,sharedResidentWorkers:shared.length,sharedBusyWorkers:shared.filter(s=>s.slot.busy).length,sharedPeakWorkers:this.contexts.peakWorkers};}
  dispose(){this.disposed=true;this.clear();this.unreclaim();this.wake();this.contexts.pools.delete(this);}
  async wait(signal,operation,refusal){
    checkAbort(signal);const busy=this.allSlots().filter(s=>s.slot.busy&&s.slot.operation!==operation);
    operation?.setState('queued',{resource:'memory',dependencies:busy.map(s=>s.slot.operation??('owner:'+s.pool.resourceOwner))});
    const cycle=this.budget.resources?.dependencyCycleError(operation,'memory');if(cycle)throw cycle;
    // Shared contexts may be held by a different neural family. Wait only for
    // useful independent work, never for a closed chain of queued promises.
    if(refusal&&(!busy.length||this.budget.resourceProgressSnapshot?.(this.resourceOwner,'policy',operation)?.independentProducers===0)){operation?.setState('ready');throw refusal;}
    await new Promise((resolve,reject)=>{
      let settled=false;
      const finish=error=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);this.waiters.delete(done);this.budget.resourceListeners?.delete(inspect);error?reject(error):resolve();};
      const done=()=>finish(),abort=()=>finish(new EngineError('CANCELLED','Neural task cancelled.'));
      const inspect=()=>{
        if(signal?.aborted)return abort();const cycle=this.budget.resources?.dependencyCycleError(operation,'memory');if(cycle)return finish(cycle);
        if(refusal&&this.budget.limit-this.budget.total()>=(resourceRecoveryBytes(refusal)??Infinity))return finish();
        if(refusal&&this.budget.resourceProgressSnapshot?.(this.resourceOwner,'policy',operation)?.independentProducers===0)finish(refusal);
      };
      this.waiters.add(done);this.budget.resourceListeners?.add(inspect);signal?.addEventListener('abort',abort,{once:true});inspect();
    });operation?.setState('ready');checkAbort(signal);
  }
  async run(name,inputs,{signal,onProgress,workspaceBytes,outputBytes,backend='auto',cpuRequired=false,_memoryScale=1,reusableInputs={},gpuWasmWorkspaceBytes,cpuWorkspaceBytes,resourceOperation,_initializationRecovery=0,queryBatch}={}){
    const asset=this.assets[name];
    requireValue(asset&&Number.isSafeInteger(asset.bytes)&&asset.bytes>0&&/^[a-f0-9]{64}$/.test(asset.sha256),'Invalid neural model identity.');
    const modelBytes=asset.bytes+neuralGraphTransformAllowance(asset);
    requireValue([workspaceBytes,outputBytes].every(x=>Number.isSafeInteger(x)&&x>=0),'Neural activation/output bounds required.');
    requireValue(['auto','cpu','webgpu'].includes(backend),'Invalid neural backend.');
    for(const t of Object.values(inputs))requireValue(ArrayBuffer.isView(t.data)&&Array.isArray(t.dims)&&t.dims.every(x=>Number.isSafeInteger(x)&&x>=0)&&t.dims.reduce((a,b)=>a*b,1)===t.data.length,'Invalid neural tensor.');
    let batchScratchBytes=0;
    if(queryBatch!==undefined){
      const x=inputs[queryBatch?.input],counts=queryBatch?.counts;
      requireValue(queryBatch&&this.resourceOwner==='rita'&&queryBatch.input==='x'&&queryBatch.output==='result'&&Array.isArray(counts)&&counts.length>=2&&counts.length<=16&&counts.every(n=>Number.isSafeInteger(n)&&n>0)&&x?.data instanceof Float32Array&&x.dims.length===4&&x.dims[0]===1&&x.dims[2]===1&&counts.reduce((n,c)=>n+c,0)===x.dims[3]&&outputBytes===x.data.byteLength,'Invalid exact RITA query batch.');
      batchScratchBytes=Math.max(...counts)*x.dims[1]*4*2;
    }
    const provider=cpuRequired||backend==='cpu'||this.cpuOnly||!globalThis.navigator?.gpu?'wasm':'webgpu';
    if(backend==='webgpu'&&provider!=='webgpu'&&!cpuRequired)throw new EngineError('GPU_UNAVAILABLE','WebGPU unavailable.');
    if(cpuWorkspaceBytes!==undefined){requireValue(Number.isSafeInteger(cpuWorkspaceBytes)&&cpuWorkspaceBytes>=0,'Invalid CPU workspace bound.');if(provider==='wasm')workspaceBytes=cpuWorkspaceBytes;}
    const runtime=this.runtimes[provider];requireValue(runtime?.factoryUrl&&runtime?.wasmUrl&&(runtime?.ortUrl||['cfa','noiseprint-plus'].includes(runtime?.executor)),'Bounded neural runtime required.');
    for(const [key,id]of Object.entries(reusableInputs))requireValue(inputs[key]?.data instanceof Float32Array&&typeof id==='string'&&id.length>0,'Reusable tensors require immutable float32 inputs and identity.');
    requireValue(gpuWasmWorkspaceBytes===undefined||Number.isSafeInteger(gpuWasmWorkspaceBytes)&&gpuWasmWorkspaceBytes>=0,'Invalid GPU host workspace bound.');
    const reusableBytes=Object.keys(reusableInputs).reduce((n,key)=>n+inputs[key].data.byteLength,0);
    const modelCacheBytes=runtime.ortUrl?this.modelCacheBytes:0;
    const inputBytes=dataBytes(inputs),memoryMaximumBytes=Math.max(alikedNativeHeapBytes(asset,provider,this.resourceOwner),Math.ceil((64*MiB+modelCacheBytes+modelBytes*2+(provider==='webgpu'?(gpuWasmWorkspaceBytes??workspaceBytes):workspaceBytes))*_memoryScale/MiB/16)*16*MiB);
    if(memoryMaximumBytes>Math.min(4*1024**3,asset.wasmMaximumBytes??4*1024**3)){
      if(modelCacheBytes){this.modelCacheBytes=0;for(const idle of [...this.slots].filter(s=>!s.busy))this.drop(idle);return this.run(name,inputs,{signal,onProgress,workspaceBytes,outputBytes,backend,cpuRequired,_memoryScale,reusableInputs,gpuWasmWorkspaceBytes,cpuWorkspaceBytes,resourceOperation,queryBatch});}
      throw new EngineError('MEMORY_LIMIT','Graph exceeds WebAssembly address space.');
    }
    // Each ORT worker owns a fixed WASM thread team. Its width is assigned by
    // the global broker for each useful job; a changed width recreates only
    // that idle worker. Native scalar executors never request phantom threads.
    const cpuMaximum=provider==='wasm'&&runtime.ortUrl&&globalThis.crossOriginIsolated===true?this.profile.maxWorkers:1;
    const residentBytes=memoryMaximumBytes+modelCacheBytes+modelBytes*2+(provider==='webgpu'?modelBytes+workspaceBytes:0)+4*MiB+reusableBytes;
    // RITA owns one assembled GPU output and one mapped readback buffer until
    // the batch fence completes. Keep this allowance per job so CPU replay
    // recomputes it as zero rather than carrying it through workspace retries.
    const gpuAssemblyBytes=provider==='webgpu'&&this.resourceOwner==='rita'&&queryBatch?2*outputBytes:0;
    const jobBytes=inputBytes+outputBytes*2+batchScratchBytes+gpuAssemblyBytes; // clone in worker + output readback/transfer
    let slot,releaseJob,reusedBytes=0,workerReused=false,modelReconfigured=false;const operation=this.budget.beginOperation?.({owner:this.resourceOwner,id:'neural/'+name,parent:resourceOperation});
    try{for(;;){
      checkAbort(signal);if(this.disposed)throw new EngineError('DISPOSED','Neural pool disposed.');
      if(modelCacheBytes&&!this.modelCacheBytes)throw new EngineError('MEMORY_LIMIT','An opportunistic neural cache was retired after memory pressure.');
      if(!modelCacheBytes)for(const idle of [...this.slots].filter(s=>!s.busy&&(s.modelCacheBytes??0)>0))this.drop(idle);
      slot=this.slots.find(s=>!s.busy&&s.name===name&&s.provider===provider&&s.cap>=memoryMaximumBytes&&(s.modelCacheBytes??0)>=modelCacheBytes&&s.workspaceCap>=workspaceBytes&&(s.reusableBytes??0)>=reusableBytes);
      if(slot){slot.busy=true;slot.backing?.setReclaimable(false);slot.gpuBacking?.setReclaimable(false);reusedBytes=Object.entries(reusableInputs).reduce((n,[key,id])=>n+(slot.reusableInputs?.[key]===id?inputs[key].data.byteLength:0),0);try{releaseJob=this.budget.reserve(jobBytes-reusedBytes);}catch(e){atomicAdmission(e,jobBytes-reusedBytes);slot.busy=false;slot.backing?.setReclaimable(true);slot.gpuBacking?.setReclaimable(true);if(e.code==='MEMORY_LIMIT'&&this.allSlots().some(s=>s.slot.busy)){await this.wait(signal,operation,e);continue;}throw e;}workerReused=true;break;}
      // Graphs in a segmented network run in succession. An idle ORT runtime
      // can release its old model and load the next one without constructing
      // another Wasm memory, thread team or WebGPU device. Busy workers are
      // never reassigned; independent jobs still create all admitted workers.
      if(runtime.ortUrl&&!['cfa','noiseprint-plus'].includes(runtime.executor)){
        slot=this.slots.filter(s=>!s.busy&&s.provider===provider&&s.cap>=memoryMaximumBytes&&(s.modelCacheBytes??0)>=modelCacheBytes).sort((a,b)=>a.cap-b.cap||b.lastUsed-a.lastUsed)[0];
        if(slot){
          slot.busy=true;slot.backing?.setReclaimable(false);slot.gpuBacking?.setReclaimable(false);
          const targetBytes=slot.cap+(slot.modelCacheBytes??0)+modelBytes*2+(provider==='webgpu'?modelBytes+workspaceBytes:0)+4*MiB+reusableBytes;
          try{releaseJob=this.budget.reserve(jobBytes);if(targetBytes>slot.bytes){this.budget.retain(targetBytes-slot.bytes);slot.bytes=targetBytes;}}
          catch(error){atomicAdmission(error,jobBytes+Math.max(0,targetBytes-slot.bytes));slot.busy=false;slot.backing?.setReclaimable(true);slot.gpuBacking?.setReclaimable(true);releaseJob?.();releaseJob=null;if(error.code==='MEMORY_LIMIT'&&this.allSlots().some(s=>s.slot.busy)){await this.wait(signal,operation,error);continue;}throw error;}
          // Keep any larger old residency charged until model release and the
          // new useful job have completed inside the worker.
          slot.targetBytes=targetBytes;if(slot.gpuBacking){slot.targetGpuBytes=(slot.modelCacheBytes??0)+modelBytes+workspaceBytes+reusableBytes+jobBytes;slot.gpuBacking.resize(Math.max(slot.gpuBacking.bytes,slot.targetGpuBytes),{materializedBytes:0});}slot.name=name;slot.workspaceCap=workspaceBytes;slot.reusableBytes=reusableBytes;slot.reusableInputs={};workerReused=true;modelReconfigured=true;this.runtimeReuses++;break;
        }
      }
      if(this.slots.filter(s=>s.busy).length>=this.profile.maxWorkers){await this.wait(signal,operation);continue;}
      if(this.allSlots().filter(s=>s.slot.busy).length>=this.scheduler.capacity.cpu){await this.wait(signal,operation);continue;}
      // A large RAM policy budget is not permission for an unbounded number
      // of browser execution contexts. Retire only idle contexts when their
      // admitted concurrency is already represented in this pool.
      while(this.slots.length>=this.profile.maxWorkers){const idle=this.slots.filter(s=>!s.busy).sort((a,b)=>a.lastUsed-b.lastUsed)[0];if(!idle)break;this.drop(idle);}
      while(this.allSlots().length>=this.scheduler.capacity.cpu){const idle=this.allSlots().filter(s=>!s.slot.busy).sort((a,b)=>(a.slot.initializationMs??0)/a.slot.bytes-(b.slot.initializationMs??0)/b.slot.bytes)[0];if(!idle)break;idle.pool.drop(idle.slot);}
      try{
        releaseJob=this.budget.reserve(jobBytes);
        this.budget.retain(residentBytes);
        try{
          slot={name,provider,modelCacheBytes,cap:memoryMaximumBytes,workspaceCap:workspaceBytes,bytes:residentBytes,reusableBytes,reusableInputs:{},lastUsed:++this.clock,busy:true,worker:this.factory(new URL('./neural-graph-worker.js',import.meta.url))};this.workerStarts++;slot.backing=this.budget.registerBacking?.('wasm',slot.cap,{owner:this.resourceOwner,label:'neural/'+name,state:'reserved',reclaimable:false});if(provider==='webgpu')slot.gpuBacking=this.budget.registerBacking?.('gpu',modelCacheBytes+modelBytes+workspaceBytes+reusableBytes+jobBytes,{owner:this.resourceOwner,label:'neural/'+name,state:'reserved'});this.slots.push(slot);this.peakWorkers=Math.max(this.peakWorkers,this.slots.length);this.contexts.peakWorkers=Math.max(this.contexts.peakWorkers,this.allSlots().length);
        }catch(e){slot?.worker?.terminate();slot?.backing?.();slot?.gpuBacking?.();this.budget.retained-=residentBytes;throw e;}
        break;
      }catch(error){atomicAdmission(error,jobBytes+residentBytes);releaseJob?.();releaseJob=null;if(error.code==='MEMORY_LIMIT'&&this.allSlots().some(s=>s.slot.busy)){await this.wait(signal,operation,error);continue;}throw error;}
    }
    }catch(error){
      releaseJob?.();releaseJob=null;operation?.release();this.wake();
      if(modelCacheBytes&&['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error.code)){this.modelCacheBytes=0;for(const idle of [...this.slots].filter(s=>!s.busy))this.drop(idle);return this.run(name,inputs,{signal,onProgress,workspaceBytes,outputBytes,backend,cpuRequired,_memoryScale,reusableInputs,gpuWasmWorkspaceBytes,cpuWorkspaceBytes,resourceOperation,queryBatch});}
      if(error.code==='MEMORY_LIMIT'&&provider==='webgpu'&&backend==='auto'){
        const retried=await this.run(name,inputs,{signal,onProgress,workspaceBytes,outputBytes,backend:'cpu',cpuRequired,_memoryScale,reusableInputs,gpuWasmWorkspaceBytes,cpuWorkspaceBytes,resourceOperation,queryBatch});
        retried.metrics.retry={from:'webgpu',reason:'GPU memory admission; useful job admitted on CPU'};return retried;
      }
      throw error;
    }
    slot.operation=operation;const abort=()=>this.drop(slot);signal?.addEventListener('abort',abort,{once:true});
    let complete=false,executionLease,protocol,threadReconfigured=false,peakCpuGranted=0,peakGpuGranted=0;
    try{
      checkAbort(signal);
      operation?.setState('io');const started=performance.now();
      slot.executionController=new AbortController();const executionController=slot.executionController;let executionRequested=false,resourceRequested=false;
      const workerFailure=event=>new EngineError('WORKER_FAILED',event?.message||'Neural worker failed.',{cause:event?.error,details:{model:name,provider,workerReused,modelReconfigured,memoryMaximumBytes:slot.cap,pool:this.snapshot(),workerURL:new URL('./neural-graph-worker.js',import.meta.url).href,workerEvent:{type:event?.type,filename:event?.filename,line:event?.lineno,column:event?.colno}}});
      const observeStartup=()=>{
        protocol=installWorkerMessageProtocol(slot.worker,()=>{throw workerMessageFailure('neural/'+name,'message','response-before-job');},{label:'neural/'+name,onFailure:error=>{slot.startupError=error;executionController.abort();}});
        slot.protocol=protocol;slot.worker.onerror=event=>protocol.fail(workerFailure(event));
      };
      // A script import may fail while CPU admission is queued. Observe it
      // before that first await, otherwise the event is lost and run hangs.
      observeStartup();
      if(provider==='wasm'){
        executionLease=await this.scheduler.acquire({cpu:cpuMaximum,minCpu:1,domains:{wasm:slot.cap,'array-buffer':jobBytes-reusedBytes},bytesForCpu:count=>Math.max(0,count-1-(slot.threadLeases?.length??0))*2*MiB,signal:executionController.signal,operation,resourceOwner:this.resourceOwner,label:'neural/'+name});
        checkAbort(signal);
        if(slot.threads!==undefined&&slot.threads!==executionLease.cpu){
          protocol.dispose();
          slot.worker.terminate();const retired=slot.backing?.();if(retired)this.budget.notifyBackingRelease?.('wasm',retired);slot.backing=this.budget.registerBacking?.('wasm',slot.cap,{owner:this.resourceOwner,label:'neural/'+name,state:'reserved'});slot.worker=this.factory(new URL('./neural-graph-worker.js',import.meta.url));this.workerStarts++;slot.reusableInputs={};threadReconfigured=true;
          observeStartup();
          // Inputs kept resident in the retired worker must be sent again.
          if(reusedBytes){releaseJob();releaseJob=null;releaseJob=this.budget.reserve(jobBytes);reusedBytes=0;}
        }
        slot.threadLeases??=[];
        while(slot.threadLeases.length<executionLease.cpu-1)slot.threadLeases.push(executionLease.retainMemory(2*MiB));
        while(slot.threadLeases.length>executionLease.cpu-1)slot.threadLeases.pop()();
        slot.threads=executionLease.cpu;peakCpuGranted=executionLease.cpu;
      }
      if(slot.startupError)throw slot.startupError;
      protocol.dispose();
      const result=await new Promise((resolve,reject)=>{
        slot.reject=reject;
        protocol=installWorkerMessageProtocol(slot.worker,data=>{
          if(data.executionResource){
            if(provider!=='webgpu'||runtime.executor!=='cfa'||!executionRequested||resourceRequested||!['cpu','gpu'].includes(data.executionResource))throw workerMessageFailure('neural/'+name,'message','unexpected-resource-transition');
            resourceRequested=true;executionLease?.release();executionLease=null;
            this.scheduler.acquire({cpu:data.executionResource==='cpu'?1:0,gpu:data.executionResource==='gpu'?1:0,domains:data.executionResource==='gpu'?{gpu:workspaceBytes,'array-buffer':outputBytes}:{wasm:slot.cap},signal:executionController.signal,operation,resourceOwner:this.resourceOwner,label:'neural/'+name+'/'+data.executionResource}).then(lease=>{
              if(executionController.signal.aborted||!this.slots.includes(slot)){lease.release();return;}
              executionLease=lease;resourceRequested=false;peakCpuGranted=Math.max(peakCpuGranted,lease.cpu);peakGpuGranted=Math.max(peakGpuGranted,lease.gpu);
              protocol.post({command:'resource-ready'});
            }).catch(protocol.fail);return;
          }
          if(data.releaseExecution){executionLease?.release();executionLease=null;return;}
          if(data.executionReady){
            if(executionRequested)throw workerMessageFailure('neural/'+name,'message','duplicate-execution-ready');
            executionRequested=true;if(Number.isSafeInteger(data.heapBytes)&&data.heapBytes>=0&&data.heapBytes<=slot.cap)slot.backing?.materialize(data.heapBytes);
            if(Number.isFinite(data.initializationMs)&&data.initializationMs>0)slot.initializationMs=data.initializationMs;
            // Model download/session creation can overlap. CPU/GPU execution
            // starts only after the shared broker admits this useful job.
            // Custom executors expose their CPU boundaries. An opaque ORT graph
            // can contain WASM fallback nodes inside session.run; retain its
            // single host CPU admission until ORT exposes those boundaries.
            (executionLease?Promise.resolve(executionLease):this.scheduler.acquire({cpu:['cfa','noiseprint-plus'].includes(runtime.executor)?0:1,gpu:1,domains:{gpu:(slot.modelCacheBytes??0)+asset.bytes+workspaceBytes+reusableBytes,'array-buffer':outputBytes*2,wasm:slot.cap},signal:executionController.signal,operation,resourceOwner:this.resourceOwner,label:'neural/'+name})).then(lease=>{
              if(executionController.signal.aborted||!this.slots.includes(slot)){lease.release();return;}
              executionLease=lease;peakCpuGranted=Math.max(peakCpuGranted,lease.cpu);peakGpuGranted=Math.max(peakGpuGranted,lease.gpu);
              protocol.post({command:'execute'});
            }).catch(protocol.fail);
            return;
          }
          if(data.phase){try{onProgress?.({phase:data.phase,model:name});}catch(e){reject(e);}return;}
          if(data.error){
            if(typeof data.error!=='object'||typeof data.error.code!=='string'||typeof data.error.message!=='string')throw workerMessageFailure('neural/'+name,'message','invalid-error-response');
            const error=deserializeEngineError(data.error);error.message=name+': '+error.message;reject(error);return;
          }
          if(!Number.isFinite(data.heapBytes)||!data.result||typeof data.result!=='object'||Array.isArray(data.result)||Object.values(data.result).some(t=>!t||!ArrayBuffer.isView(t.data)||!Array.isArray(t.dims)))throw workerMessageFailure('neural/'+name,'message','invalid-result-response');
          resolve(data);
        },{label:'neural/'+name,onFailure:error=>this.drop(slot,error)});
        slot.protocol=protocol;slot.worker.onerror=event=>protocol.fail(workerFailure(event));
        // Keep caller-owned inputs available for another graph or a CPU retry.
        try{protocol.post({asset,inputs:Object.fromEntries(Object.entries(inputs).filter(([key])=>!reusableInputs[key]||slot.reusableInputs[key]!==reusableInputs[key])),reusableInputs,provider,runtime,queryBatch,trackGpuMemory:this.resourceOwner==='rita',sessionCacheBytes:slot.modelCacheBytes??0,memoryMaximumBytes:slot.cap,outputBytes,gpuMaximumBytes:provider==='webgpu'?Math.max(slot.gpuBacking?.bytes??0,(slot.modelCacheBytes??0)+modelBytes+workspaceBytes+reusableBytes+jobBytes):0,threads:slot.threads??1});}catch(e){protocol.fail(e);}
      });
      checkAbort(signal);
      requireValue(result.heapBytes>0&&result.heapBytes<=slot.cap,'Neural heap exceeded its admitted cap.');
      requireValue(dataBytes(result.result)<=outputBytes,'Neural output exceeded its admitted size.');
      if(queryBatch)requireValue(result.logicalExecutions===queryBatch.counts.length,'RITA worker changed the number of exact query executions.');
      if(this.resourceOwner==='rita'&&provider==='webgpu'&&result.gpuDeviceLimits!==undefined){
        const limits=result.gpuDeviceLimits;
        requireValue(limits&&['maxStorageBufferBindingSize','maxBufferSize'].every(name=>Number.isSafeInteger(limits[name])&&limits[name]>0),'Invalid actual neural WebGPU device limits.');
        this.gpuDeviceLimits=Object.fromEntries(['maxStorageBufferBindingSize','maxBufferSize'].map(name=>[name,Math.min(this.gpuDeviceLimits?.[name]??Infinity,limits[name])]));
      }
      slot.backing?.materialize(result.heapBytes);
      if(slot.gpuBacking){
        const observed=Number.isSafeInteger(result.gpuBytes)&&result.gpuBytes>=0?result.gpuBytes:0,target=slot.targetGpuBytes??slot.gpuBacking.bytes,funded=Math.max(target,observed);
        // A cached session can retain measured GPU workspaces beyond its weights.
        // Preserve their admission before refunding the old graph's allowance.
        if(funded>target){slot.targetBytes=(slot.targetBytes??slot.bytes)+funded-target;if(slot.targetBytes>slot.bytes){this.budget.retain(slot.targetBytes-slot.bytes);slot.bytes=slot.targetBytes;}}
        slot.gpuBacking.resize(funded,{materializedBytes:observed});delete slot.targetGpuBytes;
      }
      if(slot.targetBytes!==undefined){this.budget.retained-=slot.bytes-slot.targetBytes;slot.bytes=slot.targetBytes;delete slot.targetBytes;}
      // Input clones and readback staging die with the worker's completed job;
      // only the returned buffers remain owned by this lease.
      const outputReservation=releaseJob.split(dataBytes(result.result));releaseJob();releaseJob=outputReservation;
      slot.reusableInputs={...reusableInputs};slot.reject=null;slot.executionController=null;slot.lastUsed=++this.clock;slot.busy=false;slot.backing?.setReclaimable(true);slot.gpuBacking?.setReclaimable(true);const outputBacking=registerArrayViews(this.budget,Object.fromEntries(Object.entries(result.result).map(([key,value])=>[key,value.data])),{owner:this.resourceOwner,label:'neural-output/'+name});const outputLease=releaseJob;const releaseOutput=()=>{outputBacking();outputLease();};complete=true;operation?.commit();this.wake();
      return {...result,release:releaseOutput,metrics:{logicalExecutions:queryBatch?.counts.length??1,milliseconds:performance.now()-started,preflightExecutions:0,memoryMaximumBytes:slot.cap,wasmHeapBytes:result.heapBytes,provider,workers:1,threads:slot.threads??1,threadReconfigured,workerReused,modelReconfigured,pool:this.snapshot(),runtime:result.runtimeLifecycle,modelCacheHit:result.runtimeLifecycle?.sessionCache?.currentHit===true,sessionCacheBytes:slot.modelCacheBytes??0,gpuMemory:result.gpuMemory,...(this.resourceOwner==='rita'&&provider==='webgpu'&&result.gpuDeviceLimits?{gpuDeviceLimits:result.gpuDeviceLimits,minimumObservedGpuDeviceLimits:{...this.gpuDeviceLimits}}:{}),cpuGranted:peakCpuGranted,gpuGranted:peakGpuGranted,reusedInputBytes:reusedBytes,copiedOutputBytes:result.copiedOutputBytes??0}};
    }catch(error){
      error=slot.startupError??error;
      executionLease?.release();executionLease=null;operation?.setState('recovery');this.drop(slot,error);checkAbort(signal);
      if(modelCacheBytes&&['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY'].includes(error.code)){this.modelCacheBytes=0;for(const idle of [...this.slots].filter(s=>!s.busy))this.drop(idle);releaseJob?.();releaseJob=null;return this.run(name,inputs,{signal,onProgress,workspaceBytes,outputBytes,backend,cpuRequired,_memoryScale,reusableInputs,gpuWasmWorkspaceBytes,cpuWorkspaceBytes,resourceOperation,queryBatch});}
      if(error.code==='MEMORY_ALLOCATION'&&resourceAllocationKind(error)==='wasm'&&error.details?.executionPhase==='initialization'&&_initializationRecovery===0){
        const idle=this.allSlots().filter(s=>!s.slot.busy),retiredWorkers=idle.length;
        for(const candidate of idle)candidate.pool.drop(candidate.slot);
        // Retry only after a real change in resident contexts. Inputs and
        // completed feature banks remain with the caller. No heap growth or
        // calibration run follows an address-space allocation refusal.
        if(retiredWorkers){releaseJob();releaseJob=null;await controlCheckpoint(signal);
          const retried=await this.run(name,inputs,{signal,onProgress,workspaceBytes,outputBytes,backend,cpuRequired,_memoryScale,reusableInputs,gpuWasmWorkspaceBytes,cpuWorkspaceBytes,resourceOperation,_initializationRecovery:1,queryBatch});
          retried.metrics.retry={reason:'Retired idle neural contexts after runtime initialization refusal',retiredWorkers};return retried;
        }
      }
      if(error.code==='MEMORY_ALLOCATION'&&resourceAllocationKind(error)==='wasm'&&error.details?.nativeHeapExhausted===true&&_memoryScale===1){
        releaseJob();releaseJob=null;
        const retried=await this.run(name,inputs,{signal,onProgress,workspaceBytes,outputBytes,backend,cpuRequired,_memoryScale:2,reusableInputs,gpuWasmWorkspaceBytes,cpuWorkspaceBytes,resourceOperation,queryBatch});
        retried.metrics.retry={reason:'Larger admitted heap after allocation failure during useful inference',fromBytes:memoryMaximumBytes};return retried;
      }
      if(provider==='webgpu'&&backend==='auto'&&(['NEURAL_EXECUTION','GPU_OUT_OF_MEMORY','GPU_UNAVAILABLE'].includes(error.code)||['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error.code)&&(error.details?.allocationKind==='gpu'||resourceAllocationKind(error)==='gpu'))){
        this.cpuOnly=true;releaseJob();releaseJob=null;
        const retried=await this.run(name,inputs,{signal,onProgress,workspaceBytes,outputBytes,backend:'cpu',cpuRequired,reusableInputs,gpuWasmWorkspaceBytes,cpuWorkspaceBytes,resourceOperation,queryBatch});
        retried.metrics.retry={from:'webgpu',reason:error.message};return retried;
      }
      throw error;
    }finally{protocol?.dispose();if(slot.protocol===protocol)slot.protocol=null;executionLease?.release();signal?.removeEventListener('abort',abort);if(!complete)releaseJob?.();slot.operation=null;operation?.release();}
  }
}
