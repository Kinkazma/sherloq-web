import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort} from './errors.js';
import {zeroVoteArray} from './zero.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
export class ZeroPool{
 constructor(budget,profile){this.budget=budget;this.profile=profile;this.workers=[];this.pending=new Set();this.charged=0;this.adaptive=new AdaptiveConcurrency();}
 clear(){for(const w of this.workers)w.terminate();this.workers=[];this.budget.retained-=this.charged;this.charged=0;for(const reject of this.pending)reject(new EngineError('CANCELLED','ZERO workers stopped.'));this.pending.clear();}
 dispose(){this.clear();this.adaptive.clear();}
 resize(count,bytes){this.clear();for(let i=0;i<count;i++){this.budget.retain(bytes);try{this.workers.push(new Worker(new URL('./zero-worker.js',import.meta.url),{type:'module'}));this.charged+=bytes;}catch(e){this.budget.retained-=bytes;throw e;}}}
 rpc(w,input){return new Promise((resolve,reject)=>{this.pending.add(reject);w.onmessage=({data})=>{this.pending.delete(reject);data.error?reject(new EngineError(data.error,'ZERO worker failed.')):resolve(data);};w.onerror=()=>{this.pending.delete(reject);reject(new EngineError('WORKER_FAILED','ZERO worker failed.'));};try{w.postMessage(input,[input.values.buffer]);}catch(e){this.pending.delete(reject);reject(e);}});}
 async execute(values,width,height,count,{signal,onProgress}={}){
  checkAbort(signal);let complete=0;const output=new Int32Array(width*height);
  await Promise.all(this.workers.map(async(w,i)=>{const y0=Math.floor(i*height/count),y1=Math.floor((i+1)*height/count),start=Math.max(0,y0-7),end=Math.min(height,y1+7),part=values.slice(start*width,end*width),result=await this.rpc(w,{values:part,width,height:end-start});checkAbort(signal);
   for(let y=y0;y<y1;y++)for(let x=0;x<width;x++){let v=result.votes[(y-start)*width+x];if(v>=0)v=(v%8)+((Math.floor(v/8)+start)%8)*8;output[y*width+x]=v;}complete++;onProgress?.(complete/count);
  }));return output;
 }
 async run(values,width,height,hooks={}){
  const {signal}=hooks,available=typeof Worker==='undefined'?1:Math.max(1,Math.min(this.profile.maxWorkers,Math.floor(height/16))),key=width+'/'+height;
  const bytes=count=>32*1024**2+width*(Math.ceil(height/count)+14)*32;
  const plan=this.adaptive.select(key,available,this.budget,c=>c>1?c*bytes(c):0),started=performance.now();let workers=plan.count,retry=null,executions=0;
  const abort=()=>this.clear();signal?.addEventListener('abort',abort,{once:true});
  try{
   let votes;
   try{checkAbort(signal);executions++;if(workers===1)votes=await zeroVoteArray(values,width,height,hooks);else{this.resize(workers,bytes(workers));votes=await this.execute(values,width,height,workers,hooks);}}
   catch(error){this.clear();checkAbort(signal);if(workers===1||!isWorkerResourceFailure(error))throw error;this.adaptive.reduce(key,workers);retry={code:error.code??'MEMORY_ALLOCATION',failedWorkers:workers};workers=1;executions++;votes=await zeroVoteArray(values,width,height,hooks);}
   const elapsed=performance.now()-started;this.adaptive.observe(key,{count:workers,maximum:available,milliseconds:elapsed,units:width*height});
   return {votes,workers,scheduling:{...plan,taskExecutions:executions,preflightExecutions:0,retry},kernelMs:elapsed};
  }finally{signal?.removeEventListener('abort',abort);this.clear();}
 }
}
