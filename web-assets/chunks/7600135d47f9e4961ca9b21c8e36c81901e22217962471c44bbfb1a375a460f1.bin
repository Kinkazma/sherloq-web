// Immediate useful work across a single bounded pool. Tile scheduling never
// changes the global indices used by the qualified native arithmetic layout.
import {requireValue,checkAbort,controlCheckpoint,EngineError} from '../../src/errors.js';
const PAGE=16*1024**2;
export async function createEvaluatorPool(moduleUrl,{budget,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,tileSize=512}={}){
 requireValue(budget&&typeof budget.reserve==='function','Shared budget required');
 requireValue(Number.isInteger(maxWorkers)&&maxWorkers>=1&&maxWorkers<=64&&Number.isInteger(tileSize)&&tileSize>=1&&tileSize<=4096,'Worker configuration');
 let workers=[],side=0,disposed=false,busy=false,sequence=0,featureSequence=0,featureKeys=new WeakMap(),charged=0;
 const stats={peakWorkers:0,tiles:0,descriptorUploads:0};
 const clear=(error=new EngineError('CANCELLED','Evaluator workers released'))=>{
  for(const entry of workers){entry.worker.terminate();for(const {reject} of entry.pending.values())reject(error);entry.pending.clear();entry.free();}
  workers=[];charged=0;side=0;featureKeys=new WeakMap();
 };
 const call=(entry,message,transfer=[])=>new Promise((resolve,reject)=>{const id=++sequence;entry.pending.set(id,{resolve,reject});try{entry.worker.postMessage({...message,id},transfer);}catch(error){entry.pending.delete(id);reject(error);}});
 async function configure(nextSide,signal){
  if(side===nextSide&&workers.length)return;
  clear();checkAbort(signal);
  const n=nextSide*nextSide;
  // Three cached half tensors (36+96+96 channels), candidate tiles, malloc
  // headroom, and one live structured-clone upload plus result transfer.
  const heapLimit=Math.ceil((456*n+28*tileSize*4+2*PAGE)/PAGE)*PAGE;
  const perWorker=heapLimit+192*n+28*tileSize*4+1024**2;
  const useful=Math.min(maxWorkers,Math.ceil(n/tileSize));
  const count=Math.min(useful,Math.floor((budget.limit-budget.total())/perWorker));
  if(count<1)throw new EngineError('MEMORY_LIMIT','No evaluator worker fits the shared budget');
  try{
   for(let i=0;i<count;i++){
    const free=budget.reserve(perWorker);let worker;
    try{worker=new Worker(new URL('./evaluator-worker.js',import.meta.url),{type:'module'});}catch(error){free();throw error;}
    const entry={worker,free,pending:new Map(),keys:new Set()};workers.push(entry);charged+=perWorker;
    worker.onmessage=({data})=>{const pending=entry.pending.get(data.id);if(!pending)return;entry.pending.delete(data.id);data.ok?pending.resolve(data):pending.reject(new EngineError('WORKER_FAILED',data.error));};
    worker.onerror=event=>{const error=new EngineError('WORKER_FAILED',event.message??'Evaluator worker failed');for(const {reject} of entry.pending.values())reject(error);entry.pending.clear();};
   }
   await Promise.all(workers.map(entry=>call(entry,{type:'init',moduleUrl,heapLimit,tileSize})));checkAbort(signal);side=nextSide;stats.peakWorkers=Math.max(stats.peakWorkers,workers.length);
  }catch(error){clear(error);throw error;}
 }
 return {
  get residentBytes(){return charged;},get stats(){return {...stats,activeWorkers:workers.length,tileSize};},
  async evaluate({features,offsetX,offsetY,side:nextSide,channels,candidates,referenceThreads=8},{signal,onProgress}={}){
   requireValue(!disposed&&!busy,'Evaluator pool unavailable');
   const n=nextSide*nextSide;
   requireValue(Number.isInteger(nextSide)&&nextSide>=2&&nextSide<=448&&(channels===36||channels===96)&&Number.isInteger(candidates)&&candidates>=1&&candidates<=13&&Number.isInteger(referenceThreads)&&referenceThreads>=1&&referenceThreads<=32,'Evaluator dimensions');
   requireValue(features instanceof Uint16Array&&features.length===channels*n&&offsetX instanceof Float32Array&&offsetY instanceof Float32Array&&offsetX.length===candidates*n&&offsetY.length===candidates*n,'Evaluator tensors');
   checkAbort(signal);busy=true;let release;
   const abort=()=>clear(new EngineError('CANCELLED','Task cancelled.'));signal?.addEventListener('abort',abort,{once:true});
   try{
    let stamp=performance.now();
    for(let i=0;i<features.length;i++){requireValue((features[i]&0x7c00)!==0x7c00,'Nonfinite descriptor');if((i&8191)===0&&performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}
    for(let i=0;i<offsetX.length;i++){requireValue(Number.isFinite(offsetX[i])&&Number.isFinite(offsetY[i]),'Nonfinite offset');if((i&8191)===0&&performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}
    release=budget.reserve(8*n);await configure(nextSide,signal);
    let key=featureKeys.get(features);if(key===undefined){key=++featureSequence;featureKeys.set(features,key);}
    await Promise.all(workers.map(async entry=>{if(entry.keys.has(key))return;await call(entry,{type:'features',key,values:features});if(entry.keys.size>=3)entry.keys.delete(entry.keys.values().next().value);entry.keys.add(key);stats.descriptorUploads++;}));
    checkAbort(signal);const x=new Float32Array(n),y=new Float32Array(n);let cursor=0,completed=0;
    await Promise.all(workers.map(async entry=>{
     while(cursor<n){checkAbort(signal);const begin=cursor,end=Math.min(n,begin+tileSize),count=end-begin;cursor=end;
      const tx=new Float32Array(candidates*count),ty=new Float32Array(candidates*count);
      for(let k=0;k<candidates;k++){tx.set(offsetX.subarray(k*n+begin,k*n+end),k*count);ty.set(offsetY.subarray(k*n+begin,k*n+end),k*count);}
      const result=await call(entry,{type:'evaluate',key,x:tx,y:ty,side:nextSide,channels,candidates,begin,end,referenceThreads},[tx.buffer,ty.buffer]);checkAbort(signal);
      x.set(result.x,begin);y.set(result.y,begin);completed+=count;stats.tiles++;onProgress?.(completed/n);
     }
    }));
    checkAbort(signal);return{x,y};
   }catch(error){clear(error);throw error;}
   finally{signal?.removeEventListener('abort',abort);release?.();busy=false;}
  },
  dispose(){requireValue(!busy,'Evaluator pool busy');if(disposed)return;disposed=true;clear();}
 };
}
