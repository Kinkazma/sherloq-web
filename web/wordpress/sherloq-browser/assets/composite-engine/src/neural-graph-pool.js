import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort,requireValue} from './errors.js';
const MiB=1024**2;
const dataBytes=inputs=>Object.values(inputs).reduce((n,t)=>n+t.data.byteLength,0);
/** Real useful jobs only. Sessions are lazy and reclaimable. The caller owns
 * source/input allocations; returned arrays have a lease until release().
 * workspaceBytes is a graph-specific live activation bound, not a benchmark.
 */
export class NeuralGraphPool {
  constructor(budget,profile,{assets,runtimes,workerFactory=url=>new Worker(url,{type:'module'})}){
    this.budget=budget;this.profile=profile;this.assets=structuredClone(assets);this.runtimes=structuredClone(runtimes);this.factory=workerFactory;
    this.slots=[];this.waiters=new Set();this.disposed=false;this.cpuOnly=false;
    this.unreclaim=budget.registerReclaimer(()=>{for(const slot of [...this.slots])if(!slot.busy)this.drop(slot);});
  }
  wake(){for(const fn of this.waiters)fn();this.waiters.clear();}
  drop(slot,error=new EngineError('CANCELLED','Neural worker stopped.')){
    if(!this.slots.includes(slot))return;
    slot.worker.terminate();this.slots.splice(this.slots.indexOf(slot),1);this.budget.retained-=slot.bytes;
    slot.reject?.(error);this.wake();
  }
  clear(){for(const s of [...this.slots])this.drop(s);}
  dispose(){this.disposed=true;this.clear();this.unreclaim();this.wake();}
  async wait(signal){
    checkAbort(signal);
    await new Promise((resolve,reject)=>{
      const done=()=>{signal?.removeEventListener('abort',abort);this.waiters.delete(done);resolve();};
      const abort=()=>{this.waiters.delete(done);reject(new EngineError('CANCELLED','Neural task cancelled.'));};
      this.waiters.add(done);signal?.addEventListener('abort',abort,{once:true});
    });checkAbort(signal);
  }
  async run(name,inputs,{signal,onProgress,workspaceBytes,outputBytes,backend='auto',cpuRequired=false,_memoryScale=1,reusableInputs={},gpuWasmWorkspaceBytes}={}){
    const asset=this.assets[name];
    requireValue(asset&&Number.isSafeInteger(asset.bytes)&&asset.bytes>0&&/^[a-f0-9]{64}$/.test(asset.sha256),'Invalid neural model identity.');
    requireValue([workspaceBytes,outputBytes].every(x=>Number.isSafeInteger(x)&&x>=0),'Neural activation/output bounds required.');
    requireValue(['auto','cpu','webgpu'].includes(backend),'Invalid neural backend.');
    for(const t of Object.values(inputs))requireValue(ArrayBuffer.isView(t.data)&&Array.isArray(t.dims)&&t.dims.every(x=>Number.isSafeInteger(x)&&x>=0)&&t.dims.reduce((a,b)=>a*b,1)===t.data.length,'Invalid neural tensor.');
    const provider=cpuRequired||backend==='cpu'||this.cpuOnly||!globalThis.navigator?.gpu?'wasm':'webgpu';
    if(backend==='webgpu'&&provider!=='webgpu'&&!cpuRequired)throw new EngineError('GPU_UNAVAILABLE','WebGPU unavailable.');
    const runtime=this.runtimes[provider];requireValue(runtime?.factoryUrl&&runtime?.wasmUrl&&(runtime?.ortUrl||['cfa','noiseprint-plus'].includes(runtime?.executor)),'Bounded neural runtime required.');
    for(const [key,id]of Object.entries(reusableInputs))requireValue(inputs[key]?.data instanceof Float32Array&&typeof id==='string'&&id.length>0,'Reusable tensors require immutable float32 inputs and identity.');
    requireValue(gpuWasmWorkspaceBytes===undefined||Number.isSafeInteger(gpuWasmWorkspaceBytes)&&gpuWasmWorkspaceBytes>=0,'Invalid GPU host workspace bound.');
    const reusableBytes=Object.keys(reusableInputs).reduce((n,key)=>n+inputs[key].data.byteLength,0);
    const inputBytes=dataBytes(inputs),memoryMaximumBytes=Math.ceil((64*MiB+asset.bytes*2+(provider==='webgpu'?(gpuWasmWorkspaceBytes??workspaceBytes):workspaceBytes))*_memoryScale/MiB/16)*16*MiB;
    if(memoryMaximumBytes>Math.min(4*1024**3,asset.wasmMaximumBytes??4*1024**3))throw new EngineError('MEMORY_LIMIT','Graph exceeds WebAssembly address space.');
    const residentBytes=memoryMaximumBytes+asset.bytes*2+(provider==='webgpu'?asset.bytes+workspaceBytes:0)+4*MiB+reusableBytes;
    const jobBytes=inputBytes+outputBytes*2; // clone in worker + output readback/transfer
    let slot,releaseJob,reusedBytes=0;
    try{for(;;){
      checkAbort(signal);if(this.disposed)throw new EngineError('DISPOSED','Neural pool disposed.');
      slot=this.slots.find(s=>!s.busy&&s.name===name&&s.provider===provider&&s.cap>=memoryMaximumBytes&&s.workspaceCap>=workspaceBytes&&(s.reusableBytes??0)>=reusableBytes);
      if(slot){slot.busy=true;reusedBytes=Object.entries(reusableInputs).reduce((n,[key,id])=>n+(slot.reusableInputs?.[key]===id?inputs[key].data.byteLength:0),0);try{releaseJob=this.budget.reserve(jobBytes-reusedBytes);}catch(e){slot.busy=false;throw e;}break;}
      if(this.slots.filter(s=>s.busy).length>=this.profile.maxWorkers){await this.wait(signal);continue;}
      try{
        releaseJob=this.budget.reserve(jobBytes);
        this.budget.retain(residentBytes);
        try{
          slot={name,provider,cap:memoryMaximumBytes,workspaceCap:workspaceBytes,bytes:residentBytes,reusableBytes,reusableInputs:{},busy:true,worker:this.factory(new URL('./neural-graph-worker.js',import.meta.url))};this.slots.push(slot);
        }catch(e){this.budget.retained-=residentBytes;throw e;}
        break;
      }catch(error){releaseJob?.();releaseJob=null;if(error.code==='MEMORY_LIMIT'&&this.slots.some(s=>s.busy)){await this.wait(signal);continue;}throw error;}
    }
    }catch(error){
      releaseJob?.();releaseJob=null;this.wake();
      if(error.code==='MEMORY_LIMIT'&&provider==='webgpu'&&backend==='auto'){
        const retried=await this.run(name,inputs,{signal,onProgress,workspaceBytes,outputBytes,backend:'cpu',cpuRequired,_memoryScale,reusableInputs,gpuWasmWorkspaceBytes});
        retried.metrics.retry={from:'webgpu',reason:'GPU memory admission; useful job admitted on CPU'};return retried;
      }
      throw error;
    }
    const abort=()=>this.drop(slot);signal?.addEventListener('abort',abort,{once:true});
    let complete=false;
    try{
      checkAbort(signal);
      const started=performance.now();
      const result=await new Promise((resolve,reject)=>{
        slot.reject=reject;
        slot.worker.onerror=()=>reject(new EngineError('WORKER_FAILED','Neural worker failed.'));
        slot.worker.onmessage=({data})=>{
          if(data.phase){try{onProgress?.({phase:data.phase,model:name});}catch(e){reject(e);}return;}
          if(data.error)reject(new EngineError(data.error.code,name+': '+data.error.message));else resolve(data);
        };
        // Keep caller-owned inputs available for another graph or a CPU retry.
        try{slot.worker.postMessage({asset,inputs:Object.fromEntries(Object.entries(inputs).filter(([key])=>!reusableInputs[key]||slot.reusableInputs[key]!==reusableInputs[key])),reusableInputs,provider,runtime,memoryMaximumBytes:slot.cap,outputBytes,threads:1});}catch(e){reject(e);}
      });
      checkAbort(signal);
      requireValue(result.heapBytes>0&&result.heapBytes<=slot.cap,'Neural heap exceeded its admitted cap.');
      requireValue(dataBytes(result.result)<=outputBytes,'Neural output exceeded its admitted size.');
      slot.reusableInputs={...reusableInputs};slot.reject=null;slot.busy=false;complete=true;this.wake();
      return {...result,release:releaseJob,metrics:{milliseconds:performance.now()-started,preflightExecutions:0,memoryMaximumBytes:slot.cap,provider,workers:1,reusedInputBytes:reusedBytes}};
    }catch(error){
      this.drop(slot,error);checkAbort(signal);
      if(error.code==='MEMORY_ALLOCATION'&&_memoryScale===1){
        releaseJob();releaseJob=null;
        const retried=await this.run(name,inputs,{signal,onProgress,workspaceBytes,outputBytes,backend,cpuRequired,_memoryScale:2,reusableInputs,gpuWasmWorkspaceBytes});
        retried.metrics.retry={reason:'Larger admitted heap after allocation failure during useful inference',fromBytes:memoryMaximumBytes};return retried;
      }
      if(provider==='webgpu'&&backend==='auto'&&['NEURAL_EXECUTION','WORKER_FAILED'].includes(error.code)){
        this.cpuOnly=true;releaseJob();releaseJob=null;
        const retried=await this.run(name,inputs,{signal,onProgress,workspaceBytes,outputBytes,backend:'cpu',cpuRequired,reusableInputs,gpuWasmWorkspaceBytes});
        retried.metrics.retry={from:'webgpu',reason:error.message};return retried;
      }
      throw error;
    }finally{signal?.removeEventListener('abort',abort);if(!complete)releaseJob?.();}
  }
}
