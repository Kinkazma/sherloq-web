import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort,controlCheckpoint} from './errors.js';
// These are whole-image stages, not independently normalized image tiles.
export function comparisonStageBytes(mode,n){
 if(mode===2)return 16*1024**2+(n>=16777216?272*1024**2+n*144:128*1024**2+n*12);
 return 16*1024**2+n*({1:128,3:144,4:384,5:176}[mode]??384);
}
export class ComparisonStagePool{
 constructor(budget,{maxWorkers=globalThis.navigator?.hardwareConcurrency??1,workerFactory=globalThis.Worker?()=>new Worker(new URL('./comparison-stage-worker.js',import.meta.url),{type:'module'}):null,kernelOptions={}}={}){this.budget=budget;this.maximum=Math.max(1,maxWorkers);this.factory=workerFactory;this.kernelOptions=kernelOptions;this.active=new Map();this.peak=0;this.completed=0;this.heapPeak=0;}
 clear(){for(const [worker,reject]of this.active){worker.terminate();reject?.(new EngineError('CANCELLED','Comparison stopped.'));}this.active.clear();}
 async run(jobs,images,{signal,onStage,consume,blockPixels=65536,original=false}={}){
  checkAbort(signal);const {width,height}=images[0].surface.descriptor,n=width*height,staging=8*1024**2+blockPixels*12;
  if(jobs.length&&(width>16384||height>16384||jobs.some(j=>comparisonStageBytes(j.mode,n)>1900*1024**2)))throw new EngineError('MEMORY_LIMIT','A global comparison stage exceeds this WASM module capacity.');
  const room=this.budget.limit-this.budget.retained-this.budget.active;
  if(jobs.some(j=>comparisonStageBytes(j.mode,n)+staging>room))throw new EngineError('MEMORY_LIMIT','A global comparison metric does not fit the shared budget. Views and smaller image pairs remain available.');
  const abort=()=>this.clear();signal?.addEventListener('abort',abort,{once:true});let failure;
  const execute=async job=>{
   const reservation=this.budget.reserve(comparisonStageBytes(job.mode,n));let worker,local;
   try{
    if(this.factory)worker=this.factory();else{const {createComparisonStageKernel}=await import('./comparison-stage-kernel.js');local=await createComparisonStageKernel(this.kernelOptions);}
    if(worker)this.active.set(worker,null);
    const call=async message=>{checkAbort(signal);if(failure)throw failure;if(local){await controlCheckpoint(signal);return local.call(message);}return new Promise((resolve,reject)=>{this.active.set(worker,reject);worker.onmessage=({data})=>{this.active.set(worker,null);data.error?reject(new EngineError(data.error.code,data.error.message)):resolve(data.result);};worker.onerror=e=>reject(new EngineError('WORKER_FAILED',e.message||'Comparison worker failed'));worker.postMessage(message,message.bytes?[message.bytes.buffer]:[]);});};
    await call({op:'create',width,height});
    for(let index=0;index<2;index++)for(let y=0;y<height;){const rows=Math.min(height-y,Math.max(1,Math.floor(blockPixels/width))),part=await images[index].surface.readWindow({x:0,y,width,height:rows},{signal});try{await call({op:'input',index,offset:y*width*3,bytes:part.pixels.data});}finally{part.release();}y+=rows;onStage?.({phase:'comparison-input',metric:job.name,completed:index*n+y*width,total:2*n});}
    onStage?.({phase:'comparison-metric',metric:job.name,completed:0,total:1});const result=await call({op:'run',mode:job.mode,view:job.view,original});checkAbort(signal);this.heapPeak=Math.max(this.heapPeak,result.heapBytes);
    for(let offset=0;offset<result.outputBytes;offset+=blockPixels*3){const count=Math.min(blockPixels*3,result.outputBytes-offset),free=this.budget.reserve(count);try{const {bytes}=await call({op:'output',offset,length:count});await job.output.write(bytes,offset);}finally{free();}}
    if(job.output)await job.output.flush();await consume(job,result);this.completed++;onStage?.({phase:'comparison-metric',metric:job.name,completed:1,total:1});
   }finally{local?.dispose();if(worker){this.active.delete(worker);worker.terminate();}reservation();}
  };
  const pending=jobs.slice(),running=new Set();
  try{
   while(pending.length||running.size){checkAbort(signal);if(failure)throw failure;
    let index;while(running.size<(this.factory?this.maximum:1)&&(index=pending.findIndex(j=>comparisonStageBytes(j.mode,n)+staging<=this.budget.limit-this.budget.retained-this.budget.active))>=0){const job=pending.splice(index,1)[0];let promise;promise=execute(job).catch(error=>{failure??=error;this.clear();}).finally(()=>running.delete(promise));running.add(promise);this.peak=Math.max(this.peak,running.size);}
    if(!running.size&&pending.length)throw new EngineError('MEMORY_LIMIT','Comparison staging no longer fits.');if(running.size)await Promise.race(running);
   }if(failure)throw failure;
  }catch(error){failure??=error;this.clear();await Promise.allSettled(running);throw error;}finally{signal?.removeEventListener('abort',abort);this.clear();}
 }
 metrics(){return {workers:this.peak,completedMetricJobs:this.completed,workerHeapPeakBytes:this.heapPeak,preflightExecutions:0,policy:'immediate-useful-work'};}
}
