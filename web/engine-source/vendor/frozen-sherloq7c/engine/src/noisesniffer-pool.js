import {boundedNoisesnifferCpuStatistics,boundedNoisesnifferCpuBase} from './noisesniffer-bounded-cpu.js';
import {deserializeWorkerError} from './errors.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {EngineError,checkAbort} from './errors.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
import {NoisesnifferGpu} from './noisesniffer-gpu.js';
import {copyTypedArray} from './allocation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {noisesnifferGpuDctService} from './noisesniffer-dct-gpu.js';
export class NoisesnifferPool{
 constructor(budget,profile){this.budget=budget;this.resourceOwner='noisesniffer';this.profile=profile;this.workers=[];this.pending=new Set();this.charged=0;this.adaptive=new AdaptiveConcurrency();this.gpu=null;this.dct=noisesnifferGpuDctService(budget);}
 clear(){cancelScheduledWorkerCalls(this);for(const w of this.workers)w.terminate();this.workers=[];this.budget.retained-=this.charged;this.charged=0;for(const reject of this.pending)reject(new EngineError('CANCELLED','Noisesniffer workers stopped.'));this.pending.clear();}
 async dispose(){this.clear();this.adaptive.clear();await retireCompositeOwners([()=>this.dct.dispose(),async()=>{await this.gpu?.dispose();this.gpu=null;}]);}
 gpuEligible(image,block,hooks){return hooks.backend!=='cpu'&&[3,5,7].includes(block)&&globalThis.navigator?.gpu&&(hooks.backend==='webgpu'||image.width*image.height>=262144);}
 async base(image,block,hooks){
  if(!this.gpuEligible(image,block,hooks))return boundedNoisesnifferCpuBase(image,block,hooks);
  let output;
  try{this.gpu??=new NoisesnifferGpu(this.budget);output=await this.gpu.base(image.data,image.width,image.height,block,hooks);}
  catch(error){if(hooks.signal?.aborted||!this.gpu?.mayFallback?.(error))throw error;await this.gpu.dispose();this.gpu=null;const result=await boundedNoisesnifferCpuBase(image,block,hooks);result.gpuRuntime={backend:'cpu-fallback',reason:error.code};return result;}
  // Transfer to the already admitted statistics/cache by copying. No released
  // provider backing is kept alive through an unregistered legacy cache alias.
  let failed=false,primary;try{return{width:output.width,height:output.height,means:copyTypedArray(output.means,{label:'noisesniffer-cache-means'}),valid:copyTypedArray(output.valid,{label:'noisesniffer-cache-valid'}),gpuRuntime:output.runtime};}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>output.release()],failed?{primary}:{});}
 }
 bytes(image,block,count){return 64*1024**2+32*image.width*(Math.ceil((image.height-block+1)/count)+block-1);}
 resize(count,bytes){this.clear();for(let i=0;i<count;i++){this.budget.retain(bytes);try{this.workers.push(new Worker(new URL('./noisesniffer-worker.js',import.meta.url),{type:'module'}));this.charged+=bytes;}catch(e){this.budget.retained-=bytes;throw e;}}}
 rpc(worker,input){return scheduledWorkerCall(this,()=>new Promise((resolve,reject)=>{this.pending.add(reject);worker.onmessage=({data})=>{this.pending.delete(reject);data.error?reject(deserializeWorkerError(data.error,'Noisesniffer worker failed.')):resolve(data);};worker.onerror=()=>{this.pending.delete(reject);reject(new EngineError('WORKER_FAILED','Noisesniffer worker failed.'));};try{worker.postMessage(input,[input.image.data.buffer]);}catch(e){this.pending.delete(reject);reject(e);}}),{label:'noisesniffer-pool'});}
 async execute(image,block,hooks={}){
  const {signal,onProgress}=hooks;
  const count=this.workers.length,rows=image.height-block+1,cols=image.width-block+1,n=rows*cols,variance=new Float32Array(n*3);
  const tasks=this.workers.map(async(worker,i)=>{
   const y0=Math.floor(i*rows/count),y1=Math.floor((i+1)*rows/count),height=y1-y0+block-1;
   const part={width:image.width,height,format:'rgb8',data:image.data.slice(y0*image.width*3,(y1+block-1)*image.width*3)};
   const result=await this.rpc(worker,{image:part,block});checkAbort(signal);
   if(!(result.variance instanceof Float32Array)||result.variance.length!==(y1-y0)*cols*3)throw new EngineError('WORKER_FAILED','Invalid Noisesniffer DCT band.');
   for(let c=0;c<3;c++)variance.set(result.variance.subarray(c*(y1-y0)*cols,(c+1)*(y1-y0)*cols),c*n+y0*cols);
  });
  // Dispatch all bounded DCT bands first; the main worker computes global
  // extrema and the full-geometry mean filter concurrently, never tiled FFTs.
  onProgress?.(.2);
  const baseTask=this.base(image,block,hooks);
  try{const [base]=await Promise.all([baseTask,Promise.all(tasks)]);checkAbort(signal);return {...base,variance};}
  finally{await baseTask.catch(()=>{});}
 }
 async run(image,block,hooks={}){
  // The surrounding operation admission owns the published statistics after
  // these transient GPU owners retire; the stage cache charges its own arrays.
  const gpuStarted=performance.now(),dct=await this.dct.run(image.data,image.width,image.height,block,{...hooks,onProgress:e=>hooks.onProgress?.(.2*e.completed/e.total)});
  if(dct){let failed=false,primary;try{const base=await this.base(image,block,hooks);checkAbort(hooks.signal);return{...base,variance:copyTypedArray(dct.variance,{label:'noisesniffer-cache-variance'}),runtime:{...base.gpuRuntime,...dct.runtime,workers:1,kernelMs:performance.now()-gpuStarted,scheduling:{policy:'bounded-native-graph-GPU',taskExecutions:1,preflightExecutions:0}}};}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>dct.release()],failed?{primary}:{});}}
  const {signal}=hooks,available=typeof Worker==='undefined'?0:Math.min(Math.max(0,this.profile.maxWorkers-1),image.height-block+1),key=block+'/'+image.width+'/'+image.height;
  const single=async()=>{
   if(!this.gpuEligible(image,block,hooks))return boundedNoisesnifferCpuStatistics(image,block,{...hooks,fast:true});
   return boundedNoisesnifferCpuStatistics(image,block,{...hooks,fast:true,base:()=>this.base(image,block,hooks)});
  };
  if(available<1||image.width*image.height<1048576){const result=await single();return {...result,runtime:{...result.runtime,...result.gpuRuntime,workers:1,scheduling:{policy:'immediate-useful-work',taskExecutions:1,preflightExecutions:0}}};}
  const plan=this.adaptive.select(key,available,this.budget,c=>c*this.bytes(image,block,c),0),started=performance.now();let count=plan.count,retry=null,executions=0;
  const abort=()=>this.clear();signal?.addEventListener('abort',abort,{once:true});
  try{
   let result;
   try{checkAbort(signal);executions++;if(!count)result=await single();else{this.resize(count,this.bytes(image,block,count));result=await this.execute(image,block,hooks);}}
   catch(error){this.clear();checkAbort(signal);if(!count||!isWorkerResourceFailure(error))throw error;this.adaptive.reduce(key,count,{error});retry={code:error.code??'MEMORY_ALLOCATION',failedDctWorkers:count};count=0;executions++;result=await single();}
   const elapsed=performance.now()-started;this.adaptive.observe(key,{count,maximum:available,milliseconds:elapsed,units:image.width*image.height});
   return {...result,runtime:{...result.runtime,...result.gpuRuntime,workers:count+1,scheduling:{...plan,dctWorkers:count,taskExecutions:executions,preflightExecutions:0,retry},kernelMs:elapsed}};
  }finally{signal?.removeEventListener('abort',abort);this.clear();}
 }
}
