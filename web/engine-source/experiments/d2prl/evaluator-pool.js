import {isWasmTensorView} from '../../src/wasm-tensor-arena.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from '../../src/scheduled-worker-call.js';
import {installWorkerMessageProtocol,workerMessageFailure} from '../../src/worker-message-protocol.js';
// Immediate useful work across a single bounded pool. Tile scheduling never
// changes the global indices used by the qualified native arithmetic layout.
import {requireValue,checkAbort,controlCheckpoint,EngineError,deserializeEngineError,normalizeResourceError,isRecoverableResourceError,serializeEngineError} from '../../src/errors.js';
const PAGE=16*1024**2;
const directOperation=(_label,work)=>work();
export async function createEvaluatorPool(moduleUrl,{budget,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,tileSize=512,operation=directOperation,workerFactory=()=>new Worker(new URL('./evaluator-worker.js',import.meta.url),{type:'module'})}={}){
 requireValue(budget&&typeof budget.reserve==='function','Shared budget required');
 requireValue(Number.isInteger(maxWorkers)&&maxWorkers>=1&&maxWorkers<=64&&Number.isInteger(tileSize)&&tileSize>=1&&tileSize<=4096,'Worker configuration');
 let workers=[],side=0,disposed=false,busy=false,sequence=0,featureSequence=0,featureKeys=new WeakMap(),charged=0,growthBlocked=null;
 const admission={budget,resourceOwner:'d2prl',profile:{maxWorkers}};
 const stats={peakWorkers:0,tiles:0,descriptorUploads:0,optionalWorkerRefusals:0};
 const retire=(entry,error=new EngineError('CANCELLED','Evaluator worker released'))=>{entry.protocol?.dispose();entry.protocol=null;entry.worker?.terminate();entry.worker=null;entry.keys.clear();for(const {reject}of entry.pending.values())reject(error);entry.pending.clear();if(entry.free){entry.free();entry.free=null;charged-=entry.perWorker;}};
 const clear=(error=new EngineError('CANCELLED','Evaluator workers released'))=>{cancelScheduledWorkerCalls(admission);
  for(const entry of workers)retire(entry,error);
  workers=[];charged=0;side=0;growthBlocked=null;featureKeys=new WeakMap();
 };
 const call=(entry,message,transfer=[],signal)=>scheduledWorkerCall(admission,()=>new Promise((resolve,reject)=>{const id=++sequence;entry.pending.set(id,{resolve,reject});try{if(!entry.protocol)throw new EngineError('CANCELLED','Evaluator worker released');entry.protocol.post({...message,id},transfer);}catch(error){entry.pending.delete(id);reject(error);}}),{signal,label:'d2prl-evaluator'});
 const transportAttempt=async(entry,work)=>{try{return await work();}catch(error){if(error.code==='WORKER_MESSAGE_FAILED')retire(entry,error);throw error;}};
 const start=async(entry,signal)=>{
  if(entry.worker)return;checkAbort(signal);entry.free=budget.reserve(entry.perWorker);charged+=entry.perWorker;
  try{entry.worker=workerFactory();const fail=error=>{for(const {reject}of entry.pending.values())reject(error);entry.pending.clear();};
   entry.protocol=installWorkerMessageProtocol(entry.worker,data=>{if(data.protocolFailure)throw deserializeEngineError(data.error);if(!Number.isInteger(data.id)||typeof data.ok!=='boolean')throw workerMessageFailure('d2prl-evaluator','message','invalid-response');const pending=entry.pending.get(data.id);if(!pending)throw workerMessageFailure('d2prl-evaluator','message','unexpected-response-id');entry.pending.delete(data.id);data.ok?pending.resolve(data):pending.reject(typeof data.error==='object'?deserializeEngineError(data.error):new EngineError('WORKER_FAILED',data.error));},{label:'d2prl-evaluator',onFailure:fail});
   entry.worker.onerror=event=>fail(new EngineError('WORKER_FAILED',event.message??'Evaluator worker failed'));
   await call(entry,{type:'init',moduleUrl,heapLimit:entry.heapLimit,tileSize},[],signal);checkAbort(signal);
  }catch(error){retire(entry,error);throw error;}
 };
 async function configure(nextSide,signal){
  if(side&&side!==nextSide)clear();checkAbort(signal);
  const n=nextSide*nextSide;
  const heapLimit=Math.ceil((456*n+28*tileSize*4+2*PAGE)/PAGE)*PAGE;
  const perWorker=heapLimit+192*n+28*tileSize*4+1024**2;
  const useful=Math.min(maxWorkers,Math.ceil(n/tileSize));
  const count=Math.min(useful,Math.floor((budget.limit-budget.total()+charged)/perWorker));
  if(count<1&&!workers.length)throw new EngineError('MEMORY_LIMIT','No evaluator worker fits the shared budget');
  const external=()=>budget.total()-charged;
  if(growthBlocked!==null&&external()>growthBlocked)return;
  growthBlocked=null;
  const add=async()=>{
   checkAbort(signal);const entry={pending:new Map(),keys:new Set(),perWorker,heapLimit};workers.push(entry);
   try{
    await start(entry,signal);return entry;
   }catch(error){retire(entry,error);const index=workers.indexOf(entry);if(index>=0)workers.splice(index,1);throw error;}
  };
  // One usable engine is mandatory. Later engines are optional parallelism:
  // a failed allocation must not destroy already initialized useful workers.
  if(!workers.length)await operation('evaluator:bootstrap',add,{bytes:PAGE});
  checkAbort(signal);
  const optionalAdd=async()=>{let refusal;const value=await operation('evaluator:optional-bootstrap',async()=>{try{return await add();}catch(error){if(error.code==='WORKER_MESSAGE_FAILED')throw error;refusal=error;return null;}});if(refusal)throw refusal;return value;};
  const results=await Promise.allSettled(Array.from({length:Math.max(0,count-workers.length)},optionalAdd));
  for(const result of results)if(result.status==='rejected'){
   checkAbort(signal);const error=normalizeResourceError(result.reason);if(error.code==='WORKER_MESSAGE_FAILED'||!isRecoverableResourceError(error))throw error;
   stats.optionalWorkerRefusals++;stats.lastOptionalWorkerFailure=serializeEngineError(error);growthBlocked=external()-PAGE;
  }
  side=nextSide;stats.peakWorkers=Math.max(stats.peakWorkers,workers.length);
 }

 return {
  get residentBytes(){return charged;},get stats(){return {...stats,activeWorkers:workers.length,tileSize};},
  async evaluate({features,offsetX,offsetY,side:nextSide,channels,candidates,referenceThreads=8},{signal,onProgress}={}){
   requireValue(!disposed&&!busy,'Evaluator pool unavailable');
   const n=nextSide*nextSide;
   requireValue(Number.isInteger(nextSide)&&nextSide>=2&&nextSide<=448&&(channels===36||channels===96)&&Number.isInteger(candidates)&&candidates>=1&&candidates<=13&&Number.isInteger(referenceThreads)&&referenceThreads>=1&&referenceThreads<=32,'Evaluator dimensions');
   requireValue(features instanceof Uint16Array&&features.length===channels*n&&offsetX instanceof Float32Array&&offsetY instanceof Float32Array&&offsetX.length===candidates*n&&offsetY.length===candidates*n,'Evaluator tensors');
   checkAbort(signal);busy=true;let release,failure;const healthy=()=>{checkAbort(signal);if(failure)throw failure;};
   const abort=()=>clear(new EngineError('CANCELLED','Task cancelled.'));signal?.addEventListener('abort',abort,{once:true});
   try{
    let stamp=performance.now();
    for(let i=0;i<features.length;i++){requireValue((features[i]&0x7c00)!==0x7c00,'Nonfinite descriptor');if((i&8191)===0&&performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}
    for(let i=0;i<offsetX.length;i++){requireValue(Number.isFinite(offsetX[i])&&Number.isFinite(offsetY[i]),'Nonfinite offset');if((i&8191)===0&&performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}
    release=budget.reserve(8*n);await configure(nextSide,signal);
    let key=featureKeys.get(features);if(key===undefined){key=++featureSequence;featureKeys.set(features,key);}
    const upload=async entry=>{healthy();await start(entry,signal);if(entry.keys.has(key))return;if(!isWasmTensorView(features)){await call(entry,{type:'features',key,values:features},[],signal);}else{
      await call(entry,{type:'features-begin',key,bytes:features.byteLength},[],signal);
      const bytes=new Uint8Array(features.buffer,features.byteOffset,features.byteLength);for(let begin=0;begin<bytes.length;begin+=8*1024**2){healthy();const chunks=[];for(let at=begin;at<Math.min(bytes.length,begin+8*1024**2);at+=1024**2){const value=new Uint8Array(Math.min(1024**2,bytes.length-at));value.set(bytes.subarray(at,at+value.length));chunks.push({at,value});}await call(entry,{type:'features-chunks',key,chunks},chunks.map(chunk=>chunk.value.buffer),signal);}
      await call(entry,{type:'features-end',key},[],signal);}if(entry.keys.size>=3)entry.keys.delete(entry.keys.values().next().value);entry.keys.add(key);stats.descriptorUploads++;};
    const uploads=workers.map(entry=>operation('evaluator:features',()=>transportAttempt(entry,()=>upload(entry)),{bytes:features.byteLength}));
    await Promise.allSettled(uploads.map(task=>task.catch(error=>{failure??=error;clear(failure);throw error;})));if(failure)throw failure;
    checkAbort(signal);const {x,y}=await operation('evaluator:outputs',()=>({x:new Float32Array(n),y:new Float32Array(n)}),{bytes:8*n});let cursor=0,completed=0;
    const tasks=workers.map(async entry=>{
     while(cursor<n){healthy();const begin=cursor,end=Math.min(n,begin+tileSize),count=end-begin;cursor=end;
      const result=await operation('evaluator:tile',()=>transportAttempt(entry,async()=>{healthy();await upload(entry);const tx=new Float32Array(candidates*count),ty=new Float32Array(candidates*count);
      for(let k=0;k<candidates;k++){tx.set(offsetX.subarray(k*n+begin,k*n+end),k*count);ty.set(offsetY.subarray(k*n+begin,k*n+end),k*count);}
      const result=await call(entry,{type:'evaluate',key,x:tx,y:ty,side:nextSide,channels,candidates,begin,end,referenceThreads},[tx.buffer,ty.buffer],signal);if(!(result.x instanceof Float32Array&&result.y instanceof Float32Array&&result.x.length===count&&result.y.length===count))throw workerMessageFailure('d2prl-evaluator','message','invalid-tile');return result;}),{bytes:candidates*count*8});checkAbort(signal);
      x.set(result.x,begin);y.set(result.y,begin);completed+=count;stats.tiles++;onProgress?.(completed/n);
     }
    });
    await Promise.allSettled(tasks.map(task=>task.catch(error=>{failure??=error;clear(failure);throw error;})));if(failure)throw failure;
    checkAbort(signal);return{x,y};
   }catch(error){failure??=error;clear(error);throw error;}
   finally{signal?.removeEventListener('abort',abort);release?.();busy=false;}
  },
  dispose(){requireValue(!busy,'Evaluator pool busy');if(disposed)return;disposed=true;clear();}
 };
}
