import{attachWorkerMessageError}from'./worker-message-protocol.js';
import{requireValue,checkAbort,EngineError}from'./errors.js';
import{retireCompositeOwners}from'./composite-owner-release.js';
const HEAP=64*1024**2;
// Additive population adapter over the unchanged native VIG convolution worker.
// The useful native scheduler owns complete output elements, Maximum unchanged.
export function createVigWindowConvolutionCpu({budget,maxWorkers=1,contextCells,onOwner,workerFactory=(url,options)=>new Worker(url,options)}){
 requireValue(budget?.reserve&&budget?.registerReclaimer&&Number.isInteger(maxWorkers)&&maxWorkers>=1&&maxWorkers<=32&&Number.isSafeInteger(contextCells)&&contextCells>=256&&contextCells%256===0&&contextCells<=4096&&typeof onOwner==='function','Native VIG bank geometry/parent budget required');
 const pool=new Set(),jobs=new Set(),outputs=new Set(),controller=new AbortController();let running,closing,closed=false,retiring=false,serial=0;
 const cancelled=()=>new EngineError('CANCELLED','VIG bank linear retired');
 function acknowledge(entry){entry.detachMessageError?.();pool.delete(entry);entry.release();}
 function remove(entry,error=cancelled()){
  if(entry.closing)return entry.closing;entry.needsRetirement=true;for(const job of entry.pending.values())job.reject(error);entry.pending.clear();
  let ack;try{ack=entry.worker.terminate();}catch(error){throw error;}
  if(!ack?.then){acknowledge(entry);return;}
  const promise=Promise.resolve(ack).then(()=>acknowledge(entry));entry.closing=promise;promise.then(()=>entry.closing=undefined,()=>entry.closing=undefined);return promise;
 }
 const drop=()=>retireCompositeOwners([...pool].map(entry=>()=>remove(entry)));
 const freeJob=job=>{for(const release of job.credits.splice(0))release();jobs.delete(job);};
 async function retry(){if(jobs.size){await drop();for(const job of[...jobs]){job.output.release();freeJob(job);}}else await retireCompositeOwners([...pool].filter(e=>e.needsRetirement).map(e=>()=>remove(e)));}
 const unregister=budget.registerReclaimer(bytes=>{if(!running&&!retiring)for(const entry of[...pool].reverse()){if(budget.total()+bytes<=budget.limit)break;try{const ack=remove(entry);ack?.catch(()=>{});}catch{}}});
 const abort=()=>{for(const entry of pool)for(const job of entry.pending.values())job.reject(cancelled());};controller.signal.addEventListener('abort',abort);
 const owner={release(){if(closing)return closing;if(closed)return;retiring=true;controller.abort();closing=(async()=>{try{await running;}catch{}await drop();for(const job of[...jobs]){job.output.release();freeJob(job);}for(const output of[...outputs])output.release();unregister();controller.signal.removeEventListener('abort',abort);closed=true;})().finally(()=>closing=undefined);return closing;}};
 try{onOwner(owner);}catch(error){unregister();controller.signal.removeEventListener('abort',abort);throw error;}
 const current=signal=>{checkAbort(controller.signal);checkAbort(signal);requireValue(!retiring&&!closed,'VIG bank linear retired');};
 const rpc=(entry,message)=>new Promise((resolve,reject)=>{const id=++serial;entry.pending.set(id,{resolve,reject});try{entry.worker.postMessage({...message,id});}catch(error){entry.pending.delete(id);reject(error);}});
 async function work({input,weight,bias,geometry},{signal,onProgress}={}){
  current(signal);await retry();current(signal);
  const stems=[[3,256,256,80,3,1,2,1],[80,128,128,160,3,1,2,1],[160,64,64,320,3,1,2,1],[320,32,32,640,3,1,2,1],[640,16,16,640,3,1,1,1]],pointwise=[[640,640,1],[1280,1280,4],[1280,640,1],[640,2560,1],[2560,640,1]];
  requireValue(Array.isArray(geometry)&&geometry.length===8&&geometry.every(Number.isSafeInteger),'Native VIG geometry');
  const [ci,h,w,co,k,pad,stride,groups]=geometry,oh=Math.floor((h+2*pad-k)/stride)+1,ow=Math.floor((w+2*pad-k)/stride)+1,rows=oh*ow,products=ci/groups*k*k,total=rows*co;
  requireValue(stems.some(g=>JSON.stringify(g)===JSON.stringify(geometry))||(h*w===contextCells&&k===1&&pad===0&&stride===1&&pointwise.some(g=>JSON.stringify(g)===JSON.stringify([ci,co,groups]))),'Native VIG stem or common pointwise bank geometry');
  requireValue(input instanceof Float32Array&&input.length===ci*h*w&&weight instanceof Float32Array&&weight.length===products*co&&bias instanceof Float32Array&&bias.length===co,'Native VIG tensors');
  const tile=Math.min(total,16384,Math.max(4,Math.floor(8*1024**2/products/4)*4)),inputs=input.byteLength+weight.byteLength+bias.byteLength,copiesPerWorker=inputs*2+tile*8+4096;
  budget.room(inputs+rows*co*4);const job={credits:[]};let outputRelease,data,published=false;const output={get data(){return data;},workers:0,release(){if(!outputRelease)return;outputRelease();outputRelease=undefined;data=undefined;outputs.delete(output);}};job.output=output;jobs.add(job);
  const abortJob=()=>{for(const entry of pool)for(const pending of entry.pending.values())pending.reject(new EngineError('CANCELLED','VIG bank linear cancelled'));};signal?.addEventListener('abort',abortJob,{once:true});
  try{
   job.credits.push(budget.reserve(inputs));outputRelease=budget.reserve(rows*co*4);outputs.add(output);
   const available=budget.limit-budget.total()+pool.size*HEAP,useful=Math.ceil(rows*products*co/(4*1024**2)),count=Math.min(maxWorkers,globalThis.navigator?.hardwareConcurrency||1,useful,Math.ceil(total/tile),Math.floor(available/(HEAP+copiesPerWorker)));
   if(count<1)throw new EngineError('MEMORY_LIMIT','One native VIG bank worker cannot be admitted');
   while(pool.size>count){await remove([...pool].at(-1));current(signal);}job.credits.push(budget.reserve(count*copiesPerWorker));
   while(pool.size<count){current(signal);const release=budget.reserve(HEAP);let worker;try{worker=workerFactory(new URL('../experiments/segmentation/vig-convolution-worker.js',import.meta.url),{type:'module'});}catch(error){release();throw error;}
    const entry={worker,release,pending:new Map(),needsRetirement:false};pool.add(entry);worker.onmessage=event=>{let data;try{data=event.data;}catch(cause){fail(new EngineError('WORKER_FAILED','VIG transport response envelope',{cause}));return;}if(!data||typeof data!=='object'||Array.isArray(data)||!Number.isSafeInteger(data.id)||data.id<=0){fail(new EngineError('WORKER_FAILED','VIG transport response envelope'));return;}const pending=entry.pending.get(data.id);if(!pending)return;entry.pending.delete(data.id);if(!data.ok)pending.reject(new EngineError('COMPUTE_FAILED',data.error));else if(data.heapBytes!==HEAP)pending.reject(new EngineError('MEMORY_LIMIT','VIG worker heap'));else pending.resolve(data);};const fail=error=>{for(const pending of entry.pending.values())pending.reject(error);entry.pending.clear();};worker.onerror=e=>fail(new EngineError('WORKER_FAILED',e.message));entry.detachMessageError=attachWorkerMessageError(worker,()=>fail(new EngineError('WORKER_FAILED','VIG transport')));await rpc(entry,{kind:'init',moduleUrl:new URL('../vendor/segmentation/vig-math.js',import.meta.url).href});
   }
   current(signal);await Promise.all([...pool].map(entry=>rpc(entry,{kind:'load',input,weight,bias,geometry,tile})));current(signal);data=new Float32Array(rows*co);let cursor=0,completed=0;
   await Promise.all([...pool].map(async entry=>{while(cursor<total){current(signal);const first=cursor,size=Math.min(tile,total-first);cursor+=size;const result=await rpc(entry,{kind:'compute',first,count:size});current(signal);requireValue(result.values instanceof Float32Array&&result.values.length===size,'VIG channel result');data.set(result.values,first);completed+=size;onProgress?.({phase:'vig-linear',completed,total,workers:count});}}));
   await Promise.all([...pool].map(entry=>rpc(entry,{kind:'clear'})));current(signal);freeJob(job);output.workers=count;published=true;return output;
  }catch(primary){await retireCompositeOwners([async()=>{await drop();output.release();freeJob(job);} ],{primary});throw primary;}
  finally{signal?.removeEventListener('abort',abortJob);if(!published&&!pool.size){output.release();freeJob(job);}}
 }
 function run(input,options){requireValue(!running&&!retiring&&!closed,'One native VIG bank linear job at a time');const task=Promise.resolve().then(()=>work(input,options));running=task;task.then(()=>{if(running===task)running=undefined;},()=>{if(running===task)running=undefined;});return task;}
 return Object.freeze({run,release:owner.release,dispose:owner.release,get pendingACKs(){return pool.size+jobs.size;},get maximumWorkers(){return maxWorkers;}});
}
