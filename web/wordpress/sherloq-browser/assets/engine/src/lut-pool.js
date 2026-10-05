import "../../runtime-context.js?v=0.14.5";
import {fusedCpu} from './ela-lut.js';
import {EngineError,checkAbort} from './errors.js';
// B integration patch: scheduling only; the validated RGB LUT kernel is unchanged.
const OVERHEAD=4*1024**2,CHUNK_PIXELS=262144;
export class LutPool {
 constructor(budget,profile){this.profile=profile;this.budget=budget;this.workers=[];this.pending=new Set();this.selected=null;this.ceiling=Infinity;this.previousRate=null;}
 dispose(){
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
 rpc(worker,data,transfer=[]){return new Promise((resolve,reject)=>{
  this.pending.add(reject);
  worker.onmessage=({data})=>{this.pending.delete(reject);data.error?reject(new EngineError('WORKER_FAILED','Kernel worker failed.')):resolve(data);};
  worker.onerror=()=>{this.pending.delete(reject);reject(new EngineError('WORKER_FAILED','Kernel worker failed.'));};
  try{worker.postMessage(data,transfer);}catch(error){this.pending.delete(reject);reject(error);}
 });}
 available(){
  const hardware=globalThis.navigator?.hardwareConcurrency;
  const cores=Math.min(this.profile.maxWorkers,Number.isFinite(hardware)&&hardware>0?hardware:Infinity);
  // Cached buffers are evictable by retain(); active image/task reservations are not.
  const room=this.budget.limit-this.budget.retained-this.budget.active+this.workers.length*OVERHEAD;
  return typeof Worker==='undefined'?1:Math.max(1,Math.floor(Math.min(cores,this.ceiling,room/OVERHEAD)));
 }
 async run(a,b,params,table,{signal}={}){
  checkAbort(signal);
  const n=a.length/3,stats={policy:'useful-batches-only',calibrationMs:0,processedPixels:0,retriedPixels:0,batches:0,initialWorkers:0,reductions:[]};
  let count=Math.min(this.available(),n),installed=false,cursor=0,retry=[],rate=this.previousRate;
  // Enough independent real chunks for all admitted workers from the first wave.
  const chunk=Math.min(CHUNK_PIXELS,Math.ceil(n/count));
  const out=new Uint8Array(a.length);
  const reduce=reason=>{
   const before=count;count=Math.max(1,Math.floor(count/2));this.ceiling=Math.min(this.ceiling,count);rate=null;
   if(stats.reductions.length<32)stats.reductions.push({reason,from:before,to:count});
  };
  const abort=()=>this.dispose();signal?.addEventListener('abort',abort,{once:true});
  try{
   stats.initialWorkers=count;
   while(cursor<n||retry.length){
    checkAbort(signal);
    const allowed=this.available();
    if(count>allowed){count=allowed;installed=false;rate=null;stats.reductions.push({reason:'resource-limit',to:count});}
    const memory=globalThis.performance?.memory;
    if(count>1&&memory?.usedJSHeapSize>memory?.jsHeapSizeLimit*.85){reduce('heap-pressure');installed=false;}
    if(count===1){await this.resize(0);installed=true;}
    else if(!installed){
     try{
      await this.resize(count);
      const ready=await Promise.allSettled(this.workers.map(w=>this.rpc(w,{table})));
      checkAbort(signal);if(ready.some(r=>r.status==='rejected'))throw new EngineError('WORKER_FAILED','Kernel setup failed.');
      installed=true;
     }catch(error){checkAbort(signal);this.dispose();reduce('worker-setup');continue;}
    }
    const jobs=[];
    while(jobs.length<count&&(retry.length||cursor<n)){
     if(retry.length)jobs.push(retry.shift());
     else{const end=Math.min(n,cursor+chunk);jobs.push({begin:cursor,end});cursor=end;}
    }
    const started=performance.now();
    const results=await Promise.allSettled(jobs.map(async(job,i)=>{
     const begin=job.begin*3,end=job.end*3;
     if(count===1)return fusedCpu(a.subarray(begin,end),b.subarray(begin,end),params,table,{signal});
     const aa=a.slice(begin,end),bb=b.slice(begin,end);
     const part=await this.rpc(this.workers[i],{a:aa,b:bb,params},[aa.buffer,bb.buffer]);
     if(!(part.result instanceof Uint8Array)||part.result.length!==end-begin)throw new EngineError('WORKER_FAILED','Invalid kernel result.');
     return part.result;
    }));
    checkAbort(signal);stats.batches++;
    let completed=0,failure;
    for(let i=0;i<results.length;i++){
     const r=results[i],job=jobs[i],pixels=job.end-job.begin;
     if(r.status==='fulfilled'){out.set(r.value,job.begin*3);completed+=pixels;stats.processedPixels+=pixels;}
     else{failure=r.reason;retry.push(job);stats.retriedPixels+=pixels;}
    }
    if(failure){
     if(count===1)throw failure;
     this.dispose();reduce('worker-or-allocation-failure');installed=false;continue;
    }
    const current=(performance.now()-started)/Math.max(1,completed);
    // Only comparable full useful waves inform scheduling; no discarded probe run.
    if(jobs.length===count){
     if(count>1&&rate!==null&&current>rate*2){reduce('useful-batch-slowdown');installed=false;}
     else rate=rate===null?current:rate*.75+current*.25;
    }
   }
   // Release idle excess workers even when the last useful wave triggered a reduction.
   await this.resize(count===1?0:count);this.selected=count;this.previousRate=rate;
   checkAbort(signal);return {data:out,workers:count,calibration:null,scheduling:stats};
  }catch(error){this.dispose();checkAbort(signal);throw error;}
  finally{signal?.removeEventListener('abort',abort);}
 }
}
