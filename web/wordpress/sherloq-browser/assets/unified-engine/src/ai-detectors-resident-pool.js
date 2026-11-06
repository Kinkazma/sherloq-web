import "../../runtime-context.js?v=0.31.0";
// Isolated CF experiment. No product registration and no result/input cache.
const fail=(code,message)=>Object.assign(new Error(message),{code});
const check=signal=>{if(signal?.aborted)throw fail('CANCELLED','CF inference cancelled');};
export function cfResidentAdmission(manifest,{backend='webgpu'}={}){
 const totalWeights=manifest.stages.reduce((n,s)=>n+s.bytes,0),maxWeight=Math.max(...manifest.stages.map(s=>s.bytes));
 const maxIo=Math.max(...manifest.stages.flatMap(s=>[s.inputShape,s.outputShape]).map(shape=>shape.reduce((n,x)=>n*x,1)*4));
 const wasm=512*1024**2,gpu=backend==='webgpu'?512*1024**2:0,host=totalWeights+3*maxWeight+64*1024**2+8*maxIo;
 return{bytes:wasm+gpu+host,wasmCapacityBytes:wasm,gpuBufferCapacityBytes:gpu,hostBytes:host,retainedModelBytes:totalWeights,maxStageBytes:maxWeight,physicalRamMeasured:false};
}

export function createCfResidentPool({budget,scheduler,createMemoryCache,workerFactory=url=>new Worker(url,{type:'module'}),workerUrl,timeoutMs=10000,computeTimeoutMs=null}={}){
 if(!budget||!scheduler||typeof createMemoryCache!=='function')throw fail('INVALID_INPUT','Shared budget, scheduler and external memory cache are required');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0||computeTimeoutMs!==null&&(!Number.isSafeInteger(computeTimeoutMs)||computeTimeoutMs<=0))throw fail('INVALID_INPUT','Invalid CF acknowledgement deadline');
 let owner=null,busy=false,closed=false,serial=0,disposal=null,lastRetirement=null;
 const sameError=error=>{const e=fail(error?.code??'CF_WORKER_ERROR',error?.message??String(error));if(error?.cleanupErrors)e.cleanupErrors=structuredClone(error.cleanupErrors);return e;};
 const cache=createMemoryCache({budget,retire:async({id})=>{if(owner?.cacheId===id)await retireOwner(owner);}});
 async function retireOwner(record){
  if(record.retiring)return record.retiring;
  const task=(async()=>{
   if(record.everPosted&&!record.retirementAckReceived){
    const ack=await rpc(record,'dispose',{});
    if(ack.retirementAck!==true)throw fail('CF_RETIREMENT_PENDING','Resident worker has no destruction ACK');
    record.retirementEvidence=ack.value;record.retirementAckReceived=true;
   }
   // Destruction ACK covers session.release + device fence/destroy. The
   // worker is then terminated before the external cache refunds memory.
   if(!record.terminated){record.worker.terminate();record.terminated=true;}
   await record.execution?.release();record.execution=null;
   lastRetirement={...(record.retirementEvidence??{noWorkPosted:true}),workerTerminated:true};
   if(owner===record)owner=null;
  })();record.retiring=task;try{return await task;}finally{record.retiring=null;}
 }
 function rpc(record,action,payload,transfer=[],{signal}={}){
  if(record.terminated)return Promise.reject(fail('DISPOSED','Resident worker is closed'));
  if(signal?.aborted)return Promise.reject(fail('CANCELLED','CF inference cancelled'));
  const id=++serial;
  return new Promise((resolve,reject)=>{
   // Useful work has no wall-clock deadline by default. Explicit compute
   // deadlines are for controlled fault tests. Only destruction ACK is timed.
   const deadline=action==='dispose'?timeoutMs:computeTimeoutMs;let timer,settled=false;
   const finish=(error,value)=>{if(settled)return;settled=true;record.pending.delete(id);clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
   const abort=()=>finish(fail('CANCELLED','CF inference cancelled'));
   record.pending.set(id,{resolve:answer=>finish(null,answer),reject:error=>finish(error)});
   if(action==='dispose')(record.disposeRequests??=new Set()).add(id);
   signal?.addEventListener('abort',abort,{once:true});
   if(deadline!==null)timer=setTimeout(()=>finish(fail('CF_WORKER_TIMEOUT','CF worker acknowledgement timed out')),deadline);
   try{record.worker.postMessage({cfResident:1,id,action,...payload},transfer);record.everPosted=true;}
   catch(error){record.disposeRequests?.delete(id);finish(error);}
  });
 }
 function attach(record){
  record.worker.onmessage=({data})=>{
   if(data?.cfResident!==1)return;
   // A destruction ACK can arrive after its waiter timed out. Keep that
   // evidence for an explicit retirement retry, even though no job is waiting.
   // Only IDs of disposal requests actually sent to this owner are accepted.
   if(data.ok===true&&data.retirementAck===true&&record.disposeRequests?.has(data.id)){
    record.retirementAckReceived=true;record.retirementEvidence=data.value;
    // A retry may already be awaiting a second disposal RPC. One verified
    // destruction ACK retires this same owner, so settle every such waiter.
    for(const id of record.disposeRequests)record.pending.get(id)?.resolve(data);
    record.disposeRequests.clear();
   }else if(data.ok===false)record.disposeRequests?.delete(data.id);
   const waiter=record.pending.get(data.id);if(!waiter)return;
   record.pending.delete(data.id);
   if(data.ok===true)waiter.resolve(data);
   else{const error=sameError(data.error);error.executionRetired=data.executionRetired===true;waiter.reject(error);}
  };
  record.worker.onerror=event=>{
   record.poisoned=true;const error=fail('CF_WORKER_ERROR',event.message??'CF resident worker failed');
   for(const waiter of record.pending.values())waiter.reject(error);record.pending.clear();
  };
 }
 async function infer(prepared,loaded,config,{signal,backend='webgpu',policy={cpuEdges:true,cpuThreads:1}}={}){
  if(closed)throw fail('DISPOSED','CF resident pool disposed');
  if(busy||disposal)throw fail('BUSY','CF resident pool is busy');
  if(!['cpu','webgpu'].includes(backend))throw fail('UNSUPPORTED_BACKEND','Resident prototype requires explicit CPU or WebGPU');
  if(loaded?.manifest?.method!=='community-forensics'||!(/^[a-f0-9]{64}$/).test(loaded.sha256??''))throw fail('MODEL_CONTRACT','Pinned CF manifest required');
  check(signal);busy=true;const started=performance.now();let record,primary,answer,failed=false,executionRetired=false;
  const identity=JSON.stringify([loaded.sha256,loaded.url,backend,config.ortModuleUrl,config.ortWasmPaths,policy]);
  const cancel=()=>{try{record?.worker.postMessage({cfResident:1,action:'cancel'});}catch{}};
  try{
   if(owner&&(owner.identity!==identity||owner.poisoned)){await cache.dispose();closed=true;throw fail('MODEL_CONTRACT','Create a fresh pool after a model configuration change or failed context');}
   // A different identity requires a fresh pool; this conservative prototype
   // never reconfigures ORT env behind an already retained model owner.
   if(owner&&owner.identity!==identity)throw fail('MODEL_CONTRACT','Create a new resident pool for a different model configuration');
   record=owner;
   if(!record){
    const admission=cfResidentAdmission(loaded.manifest,{backend});
    await budget.reclaim?.(admission.bytes,{signal});check(signal);
    const reservation=await cache.reserve({bytes:admission.bytes,label:'CF-model-resident'},{signal});
    try{record=owner={cacheId:reservation.id,identity,admission,worker:workerFactory(workerUrl),pending:new Map(),ready:false,everPosted:false,terminated:false,execution:null,poisoned:false};attach(record);}
    catch(error){cache.release(reservation.id);owner=null;throw error;}
   }
   const active=await cache.update({id:record.cacheId,bytes:record.admission.bytes,idle:false},{signal});
   if(active.reclaimed)throw fail('CF_CACHE_RECLAIMED','CF model was reclaimed before the useful call');
   record.execution=await scheduler.acquire({cpu:backend==='cpu'?(policy.cpuThreads??1):Math.max(1,policy.cpuThreads??1),gpu:backend==='webgpu'?1:0,bytes:0,signal,label:'CF-resident-inference'});
   signal?.addEventListener('abort',cancel,{once:true});check(signal);
   const modelCacheHit=record.ready;let initializationMs=0;
   if(!record.ready){
    const initStart=performance.now();await rpc(record,'initialize',{manifest:loaded.manifest,manifestUrl:loaded.url,config,backend,policy},[],{signal});initializationMs=performance.now()-initStart;record.ready=true;
   }
   check(signal);const packet=await rpc(record,'infer',{data:prepared.data,dims:prepared.dims},[prepared.data.buffer],{signal});executionRetired=packet.executionRetired===true;
   if(!executionRetired)throw fail('CF_RETIREMENT_PENDING','Inference output lacks GPU execution retirement ACK');
   check(signal);answer={...packet.value,modelCache:{hit:modelCacheHit,initializationMs,admittedBytes:record.admission.bytes},callWallMs:performance.now()-started};
  }catch(error){failed=true;primary=error;executionRetired||=error?.executionRetired===true;
   // A transport timeout is not a completed job. Keep compute and memory
   // credits until the subsequent destruction acknowledgement actually lands.
   if(record&&(!executionRetired||!record.ready))try{await cache.dispose();closed=true;}catch(cleanup){const e=new AggregateError([primary,cleanup],primary?.message??String(primary),{cause:primary});e.code=primary?.code??'CF_ERROR';e.cleanupErrors=[sameError(cleanup)];primary=e;record.poisoned=true;}
  }finally{
   signal?.removeEventListener('abort',cancel);
   if(record&&executionRetired){try{await record.execution?.release();record.execution=null;if(owner===record&&!record.poisoned)await cache.update({id:record.cacheId,bytes:record.admission.bytes,idle:true});}catch(cleanup){
    record.poisoned=true;const errors=[cleanup];
    // Never allow a later call to overwrite a lease whose release failed.
    // Retire the model and retry that same owned lease after destruction ACK.
    try{await cache.dispose();closed=true;}catch(retirement){errors.push(retirement);}
    const e=new AggregateError(failed?[primary,...errors]:errors,primary?.message??cleanup?.message??'CF execution retirement failed',failed?{cause:primary}:{cause:cleanup});
    e.code=failed?(primary?.code??'CF_ERROR'):(cleanup?.code??'CF_RETIREMENT_PENDING');e.cleanupErrors=errors;failed=true;primary=e;
   }}
   busy=false;
  }
  if(failed)throw primary;return answer;
 }
 return{infer,clearSource(){return{sourceTensorsRetainedAfterJob:0,resultScalarsRetained:0,activeInputInFlight:busy,modelRetained:!!owner};},snapshot(){return{busy,closed,ready:owner?.ready??false,poisoned:owner?.poisoned??false,cache:cache.snapshot(),executionHeld:!!owner?.execution,lastRetirement:structuredClone(lastRetirement)};},
  async dispose(){if(disposal)return disposal;closed=true;disposal=(async()=>{if(busy)throw fail('BUSY','Drain current CF call before unloading resident pool');await cache.dispose();})();try{return await disposal;}finally{disposal=null;}}
 };
}
