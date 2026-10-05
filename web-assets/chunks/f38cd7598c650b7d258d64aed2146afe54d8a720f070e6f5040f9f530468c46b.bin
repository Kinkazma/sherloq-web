import "../../runtime-context.js?v=0.14.5";
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {fusedCpu} from './ela-lut.js';
import {EngineError,checkAbort} from './errors.js';
const OVERHEAD=4*1024**2;
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
export class LutPool {
 constructor(budget,profile){this.profile=profile;this.budget=budget;this.resourceOwner='lut';this.workers=[];this.pending=new Set();this.selected=null;this.adaptive=new AdaptiveConcurrency();}
 dispose(){cancelScheduledWorkerCalls(this);
  for(const worker of this.workers)worker.terminate();
  this.budget.retained-=this.workers.length*OVERHEAD;this.workers=[];this.selected=null;
  for(const reject of this.pending)reject(new EngineError('CANCELLED','Kernel worker pool stopped.'));this.pending.clear();
 }
 async resize(count){
  while(this.workers.length>count){this.workers.pop().terminate();this.budget.retained-=OVERHEAD;}
  while(this.workers.length<count){
   this.budget.retain(OVERHEAD);
   try{this.workers.push(new Worker(new URL('./lut-worker.js',import.meta.url),{type:'module'}));}
   catch(error){this.budget.retained-=OVERHEAD;throw error;}
  }
 }
 rpc(worker,data,transfer=[]){return scheduledWorkerCall(this,()=>new Promise((resolve,reject)=>{
  this.pending.add(reject);
  worker.onmessage=({data})=>{this.pending.delete(reject);data.error?reject(new EngineError('WORKER_FAILED','Kernel worker failed.')):resolve(data);};
  worker.onerror=()=>{this.pending.delete(reject);reject(new EngineError('WORKER_FAILED','Kernel worker failed.'));};
  try{worker.postMessage(data,transfer);}catch(error){this.pending.delete(reject);reject(error);}
 }),{label:'lut-pool'});}
 async install(table){await Promise.all(this.workers.map(w=>this.rpc(w,{table})));}
 async execute(a,b,params){
  const n=a.length/3,count=this.workers.length;
  const parts=await Promise.all(this.workers.map((w,i)=>{
   const begin=Math.floor(n*i/count)*3,end=Math.floor(n*(i+1)/count)*3;
   const aa=a.slice(begin,end),bb=b.slice(begin,end);
   return this.rpc(w,{a:aa,b:bb,params},[aa.buffer,bb.buffer]);
  }));
  const out=new Uint8Array(a.length);let at=0;
  for(const part of parts){out.set(part.result,at);at+=part.result.length;}
  return out;
 }
 async run(a,b,params,table,{signal}={}){
  checkAbort(signal);const available=typeof Worker!=='undefined'?Math.min(this.profile.maxWorkers,a.length/3):1,key=String(a.length);
  // Retained workers are included in the budget; reclaim them before sizing.
  await this.resize(0);
  const plan=this.adaptive.select(key,available,this.budget,c=>c>1?c*OVERHEAD:0),started=performance.now();let workers=plan.count,retry=null,executions=0;
  const abort=()=>this.dispose();signal?.addEventListener('abort',abort,{once:true});
  try{
   let data;
   try{executions++;if(workers===1)data=await fusedCpu(a,b,params,table,{signal});else{await this.resize(workers);await this.install(table);data=await this.execute(a,b,params);}}
   catch(error){this.dispose();checkAbort(signal);if(workers===1||!isWorkerResourceFailure(error))throw error;this.adaptive.reduce(key,workers,{error});retry={code:error.code??'MEMORY_ALLOCATION',failedWorkers:workers};workers=1;executions++;data=await fusedCpu(a,b,params,table,{signal});}
   checkAbort(signal);this.selected=workers;this.adaptive.observe(key,{count:workers,maximum:available,milliseconds:performance.now()-started,units:a.length/3});
   return {data,workers,scheduling:{...plan,taskExecutions:executions,preflightExecutions:0,retry}};
  }finally{signal?.removeEventListener('abort',abort);await this.resize(0);}
 }
}
