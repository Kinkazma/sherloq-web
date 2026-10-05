import {EngineError,checkAbort,requireValue} from './errors.js';
import {MEDIAN_HEAP_LIMIT} from './median-features.js';
import {medianAnalyze,medianGeometry} from './median.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
// Only bounded gray64 blocks and features cross these workers. The forest and
// full-resolution image stay in the main engine; each WASM worker is single-thread.
export class MedianPool{
 constructor(budget,profile){this.budget=budget;this.profile=profile;this.workers=[];this.pending=new Set();this.charged=0;this.adaptive=new AdaptiveConcurrency();}
 clear(){for(const worker of this.workers)worker.terminate();this.workers=[];this.budget.retained-=this.charged;this.charged=0;for(const reject of this.pending)reject(new EngineError('CANCELLED','Median workers stopped.'));this.pending.clear();}
 dispose(){this.clear();this.adaptive.clear();}
 resize(count,bytes){this.clear();for(let i=0;i<count;i++){this.budget.retain(bytes);try{this.workers.push(new Worker(new URL('./median-worker.js',import.meta.url),{type:'module'}));this.charged+=bytes;}catch(error){this.budget.retained-=bytes;throw error;}}}
 rpc(worker,blocks,featureCount){return new Promise((resolve,reject)=>{
  this.pending.add(reject);worker.onmessage=({data})=>{this.pending.delete(reject);data.error?reject(new EngineError(data.error,'Median feature worker failed.')):resolve(data);};worker.onerror=()=>{this.pending.delete(reject);reject(new EngineError('WORKER_FAILED','Median feature worker failed.'));};
  try{worker.postMessage({blocks,featureCount},[blocks.buffer]);}catch(error){this.pending.delete(reject);reject(error);}
 });}
 async extractBatch(blocks,featureCount,{signal}={}){
  checkAbort(signal);const total=blocks.length/4096,count=Math.min(total,this.workers.length),features=new Float64Array(total*featureCount),variances=new Float64Array(total);
  await Promise.all(this.workers.slice(0,count).map(async(worker,i)=>{
   const n=Math.ceil((total-i)/count),part=new Uint8Array(n*4096);for(let j=0;j<n;j++)part.set(blocks.subarray((i+j*count)*4096,(i+j*count+1)*4096),j*4096);
   const result=await this.rpc(worker,part,featureCount);checkAbort(signal);requireValue(result.features instanceof Float64Array&&result.features.length===n*featureCount&&result.variances instanceof Float64Array&&result.variances.length===n,'Invalid median worker response.');
   for(let j=0;j<n;j++){features.set(result.features.subarray(j*featureCount,(j+1)*featureCount),(i+j*count)*featureCount);variances[i+j*count]=result.variances[j];}
  }));checkAbort(signal);return {features,variances};
 }
 async run(image,model,hooks={}){
  const {signal}=hooks,g=medianGeometry(image.width,image.height),blocks=g.blockRows*g.blockColumns,available=typeof Worker==='undefined'?1:Math.min(32,blocks,this.profile.maxWorkers),key=model.metadata.features+'/'+image.width+'/'+image.height,bytes=MEDIAN_HEAP_LIMIT+256*1024;
  const plan=this.adaptive.select(key,available,this.budget,c=>c>1?c*bytes:0),started=performance.now();let count=plan.count,retry=null,executions=0,dispatchAccountedBytes=0;
  const abort=()=>this.clear();signal?.addEventListener('abort',abort,{once:true});
  try{
   let result;
   try{checkAbort(signal);executions++;if(count===1){dispatchAccountedBytes=this.budget.total();result=await medianAnalyze(image,model,hooks);}else{this.resize(count,bytes);dispatchAccountedBytes=this.budget.total();result=await medianAnalyze(image,model,{...hooks,extractBatch:this.extractBatch.bind(this)});}}
   catch(error){this.clear();checkAbort(signal);if(count===1||!isWorkerResourceFailure(error))throw error;this.adaptive.reduce(key,count);retry={code:error.code??'MEMORY_ALLOCATION',failedWorkers:count};count=1;executions++;result=await medianAnalyze(image,model,hooks);}
   const elapsed=performance.now()-started;this.adaptive.observe(key,{count,maximum:available,milliseconds:elapsed,units:blocks});
   result.runtime={...result.runtime,workers:count,scheduling:{...plan,workerReservationBytes:count>1?count*bytes:0,dispatchAccountedBytes,taskExecutions:executions,preflightExecutions:0,retry},analysisMs:elapsed};return result;
  }finally{signal?.removeEventListener('abort',abort);this.clear();}
 }
}
