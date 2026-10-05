import {jpegCodec} from './jpeg.js';
import {jpegBlockError} from './jpeg-block-error.js';
import {createElaCellDescriber} from './ela-cell-describe.js';
import {describeEnergy} from './energy-primitives.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
const resultValues=(values,mode)=>mode==='quality'?{raw:Float64Array.from(values,x=>x[1]),values}:{values};
// Shared by quality curves and Ghost blocks. Each worker has one codec thread.
export class QualityPool{
 constructor(budget,profile){this.budget=budget;this.profile=profile;this.workers=[];this.pending=new Set();this.selected=null;this.adaptive=new AdaptiveConcurrency();this.charged=0;}
 clear(){for(const w of this.workers)w.terminate();this.workers=[];this.budget.retained-=this.charged;this.charged=0;for(const reject of this.pending)reject(new EngineError('CANCELLED','Quality workers stopped.'));this.pending.clear();}
 dispose(){this.clear();this.selected=null;this.adaptive.clear();}
 async resize(count,bytes){while(this.workers.length>count){this.workers.pop().terminate();this.budget.retained-=bytes;this.charged-=bytes;}while(this.workers.length<count){this.budget.retain(bytes);try{this.workers.push(new Worker(new URL('./quality-worker.js',import.meta.url),{type:'module'}));this.charged+=bytes;}catch(error){this.budget.retained-=bytes;throw error;}}}
 rpc(worker,data,onProgress=()=>{}){return new Promise((resolve,reject)=>{this.pending.add(reject);worker.onmessage=({data})=>{if(data.progress){onProgress(data.progress);return;}this.pending.delete(reject);data.error?reject(new EngineError(data.error,'JPEG worker failed.')):resolve(data);};worker.onerror=()=>{this.pending.delete(reject);reject(new EngineError('WORKER_FAILED','JPEG worker failed.'));};try{worker.postMessage(data);}catch(e){this.pending.delete(reject);reject(e);}});}
 async serial(image,qualities,{signal,onProgress}={},mode='quality',block){
  if(mode==='cells'){const describer=createElaCellDescriber({budget:this.budget}),values=[];try{for(const q of qualities){checkAbort(signal);const decoded=await jpegCodec.recompress(image,q,{signal}),result=await describer.describe(image,decoded,block,{signal});try{const {release,...value}=result;values.push([q,value]);onProgress?.(values.length/qualities.length);}finally{result.release();}}return values;}finally{describer.dispose();}}
  const values=[];for(const q of qualities){checkAbort(signal);
   if(mode==='energy'){const decoded=await jpegCodec.recompress(image,q,{signal});values.push([q,(await describeEnergy(image,decoded,{signal})).energy]);}
   else if(mode==='ghost')values.push([q,await jpegBlockError(image,q,{signal})]);
   else{const decoded=await jpegCodec.recompressGray(image,q,{signal});let sum=0;for(let i=0;i<image.data.length;i++)sum+=Math.abs(image.data[i]-decoded.data[i]);values.push([q,sum*(1/image.data.length)]);}
   onProgress?.(values.length/qualities.length);
  }return values;
 }
 async execute(image,qualities,count,hooks={},mode='quality',block,workerBytes){
  checkAbort(hooks.signal);await Promise.all(this.workers.slice(0,count).map(w=>this.rpc(w,{image,mode,block,workerBytes})));let done=0;
  const values=await Promise.all(this.workers.slice(0,count).map((w,i)=>this.rpc(w,{qualities:qualities.filter((_,k)=>k%count===i)},()=>{done++;hooks.onProgress?.(done/qualities.length);})));checkAbort(hooks.signal);return values.flatMap(x=>x.values).sort((a,b)=>a[0]-b[0]);
 }
 async run(image,{signal,onProgress}={},{mode='quality',qualities=Array.from({length:100},(_,i)=>i+1),block}={}){
  requireValue(['quality','ghost','energy','cells'].includes(mode)&&qualities.length>0&&qualities.every((q,i)=>Number.isInteger(q)&&q>=0&&q<=100&&(i===0||q>qualities[i-1])),'Invalid JPEG pool request.');
  requireValue(mode!=='cells'||Number.isInteger(block)&&block>=16&&block%8===0,'Invalid ELA cell block');
  checkAbort(signal);const started=performance.now(),available=typeof Worker==='undefined'?1:Math.min(qualities.length,this.profile.maxWorkers),workerBytes=(mode==='cells'?96:32)*1024**2+image.data.length*(mode==='energy'?16:10),key=mode+'/'+image.width+'/'+image.height+(mode==='cells'?'/'+block:'');
  const plan=this.adaptive.select(key,available,this.budget,c=>c>1?c*workerBytes:0);let workers=plan.count,retry=null,executions=0;
  const abort=()=>this.clear();signal?.addEventListener('abort',abort,{once:true});
  try{
   let values;
   try{executions++;if(workers===1)values=await this.serial(image,qualities,{signal,onProgress},mode,block);else{await this.resize(workers,workerBytes);values=await this.execute(image,qualities,workers,{signal,onProgress},mode,block,workerBytes);}}
   catch(error){this.clear();checkAbort(signal);if(workers===1||!isWorkerResourceFailure(error))throw error;this.adaptive.reduce(key,workers);retry={code:error.code??'MEMORY_ALLOCATION',failedWorkers:workers};workers=1;executions++;values=await this.serial(image,qualities,{signal,onProgress},mode,block);}
   const elapsed=performance.now()-started;this.selected=workers;this.adaptive.observe(key,{count:workers,maximum:available,milliseconds:elapsed,units:image.width*image.height*qualities.length});
   return {...resultValues(values,mode),workers,scheduling:{...plan,taskExecutions:executions,preflightExecutions:0,retry},kernelMs:elapsed,totalMs:elapsed};
  }finally{signal?.removeEventListener('abort',abort);this.clear();}
 }
}
