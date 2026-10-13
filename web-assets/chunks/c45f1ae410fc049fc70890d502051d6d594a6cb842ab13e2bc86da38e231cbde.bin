import {isWasmTensorView} from '../../src/wasm-tensor-arena.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from '../../src/scheduled-worker-call.js';
import {installWorkerMessageProtocol,workerMessageFailure} from '../../src/worker-message-protocol.js';
import {getD2prlDescriptorLease,validateD2prlDescriptor} from './descriptor-ownership.js';
// Immediate useful work across a single bounded pool. Tile scheduling never
// changes the global indices used by the qualified native arithmetic layout.
import {requireValue,checkAbort,controlCheckpoint,EngineError,deserializeEngineError,normalizeResourceError,isRecoverableResourceError,serializeEngineError} from '../../src/errors.js';
const MiB=1024**2,PAGE=16*MiB,ABI_BYTES=MiB,UPLOAD_WINDOW=8*MiB;
const directOperation=(_label,work)=>work();
export async function createEvaluatorPool(moduleUrl,{budget,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,tileSize=4096,descriptorLayout='CHW-uint16',descriptorTransport='windowed',optionalMemory='reclaim-idle',operation=directOperation,workerFactory=()=>new Worker(new URL('./evaluator-worker.js',import.meta.url),{type:'module'})}={}){
 requireValue(budget&&typeof budget.reserve==='function','Shared budget required');
 requireValue(Number.isInteger(maxWorkers)&&maxWorkers>=1&&maxWorkers<=64&&Number.isInteger(tileSize)&&tileSize>=1&&tileSize<=4096,'Worker configuration');
 requireValue(descriptorLayout==='CHW-uint16'||descriptorLayout==='HWC-uint16','Evaluator descriptor layout');
 requireValue(descriptorTransport==='windowed'||descriptorTransport==='legacy-auto','Evaluator descriptor transport');
 requireValue(optionalMemory==='reclaim-idle'||optionalMemory==='available-only','Optional evaluator memory policy');
 let workers=[],side=0,disposed=false,busy=false,sequence=0,featureSequence=0,featureKeys=new WeakMap(),charged=0,growthBlocked=null,growthBlockedPolicy=false;
 const admission={budget,resourceOwner:'d2prl',profile:{maxWorkers}};
 const kernelTileSize=Math.min(512,tileSize);
 const stats={peakWorkers:0,createdWorkers:0,callsAdmitted:0,peakConcurrentCalls:0,peakConcurrentComputeCalls:0,tiles:0,messages:0,descriptorUploads:0,optionalWorkerRefusals:0,optionalPolicyRefusals:0,optionalPolicyReclaims:0,optionalPolicyReclaimedBytes:0,optionalPeerDeferrals:0,optionalReclaimMs:0,transportAllocations:0,transportReuses:0,transportReductions:0,minimumTransportPixels:tileSize,descriptorValidationElements:0,offsetValidationElements:0,validationMs:0,configureMs:0,uploadMs:0,packingMs:0,workerCallMs:0,workerComputeMs:0,workerCopyMs:0,kernelTiles:0,gatherMs:0,totalMs:0,peakPolicyBytes:0,peakWasmBytes:0,peakDescriptorBytes:0,peakWorkerAbiBytes:0,peakTransportBytes:0};
 let wasmBytes=0,descriptorBytes=0,transportBytes=0,admittedCalls=0,admittedComputes=0;
 const observeHeap=(entry,data)=>{if(data.abiBytes!==undefined){requireValue(Number.isSafeInteger(data.abiBytes)&&data.abiBytes>=0&&data.abiBytes<=ABI_BYTES,'Evaluator native ABI extent');stats.peakWorkerAbiBytes=Math.max(stats.peakWorkerAbiBytes,data.abiBytes);}if(data.descriptorBytes!==undefined){requireValue(Number.isSafeInteger(data.descriptorBytes)&&data.descriptorBytes>=0&&data.descriptorBytes<=264*entry.side**2,'Evaluator descriptor slot extent');descriptorBytes-=entry.descriptorBytes??0;entry.descriptorBytes=data.descriptorBytes;descriptorBytes+=data.descriptorBytes;stats.peakDescriptorBytes=Math.max(stats.peakDescriptorBytes,descriptorBytes);}if(data.heapBytes===undefined)return;requireValue(Number.isSafeInteger(data.heapBytes)&&data.heapBytes>=0&&data.heapBytes<=entry.heapLimit,'Evaluator worker heap extent');if(data.heapBytes===entry.heapBytes)return;entry.backing?.();wasmBytes-=entry.heapBytes??0;entry.heapBytes=data.heapBytes;entry.backing=budget.registerBacking?.('wasm',data.heapBytes,{owner:'d2prl',label:'evaluator-worker'});wasmBytes+=data.heapBytes;stats.peakWasmBytes=Math.max(stats.peakWasmBytes,wasmBytes);};
 const transportBacking=bytes=>{const backing=budget.registerBacking?.('array-buffer',bytes,{owner:'d2prl',label:'evaluator-transport'});transportBytes+=bytes;stats.peakTransportBytes=Math.max(stats.peakTransportBytes,transportBytes);let live=true;return()=>{if(!live)return;live=false;backing?.();transportBytes-=bytes;budget.notifyBackingRelease?.('array-buffer',bytes);};};
 const clearTransport=entry=>{for(const bank of Object.values(entry.transportBanks??{})){bank.view=null;bank.release();}entry.transportBanks={};};
 const transportFloats=(entry,axis,count)=>{let bank=entry.transportBanks[axis];if(bank&&bank.view.length>=count){stats.transportReuses++;return bank.view.subarray(0,count);}if(bank){bank.view=null;bank.release();delete entry.transportBanks[axis];}const view=new Float32Array(count);stats.transportAllocations++;entry.transportBanks[axis]={view,bytes:view.byteLength,release:transportBacking(view.byteLength)};return view;};
 const recycleTransport=(entry,result,count)=>{if(result.reuseX===undefined&&result.reuseY===undefined){clearTransport(entry);return;}const rx=result.reuseX,ry=result.reuseY;for(const [axis,value]of [['x',rx],['y',ry]])if(!(value instanceof Float32Array&&value.buffer instanceof ArrayBuffer&&value.byteOffset===0&&value.length===count&&value.buffer.byteLength===entry.transportBanks[axis]?.bytes))throw workerMessageFailure('d2prl-evaluator','message','invalid-recycled-input');if(rx.buffer===ry.buffer||[rx.buffer,ry.buffer].some(buffer=>buffer===result.x.buffer||buffer===result.y.buffer))throw workerMessageFailure('d2prl-evaluator','message','aliased-recycled-input');entry.transportBanks.x.view=new Float32Array(rx.buffer);entry.transportBanks.y.view=new Float32Array(ry.buffer);};
 const retire=(entry,error=new EngineError('CANCELLED','Evaluator worker released'))=>{entry.scopeFree?.();entry.scopeFree=null;entry.scientificMask=null;entry.protocol?.dispose();entry.protocol=null;entry.worker?.terminate();entry.worker=null;entry.keys.clear();for(const {reject}of entry.pending.values())reject(error);entry.pending.clear();clearTransport(entry);entry.backing?.();entry.backing=null;wasmBytes-=entry.heapBytes??0;descriptorBytes-=entry.descriptorBytes??0;entry.descriptorBytes=0;if(entry.heapBytes)budget.notifyBackingRelease?.('wasm',entry.heapBytes);entry.heapBytes=0;if(entry.free){entry.free();entry.free=null;charged-=entry.perWorker;}};
 const clear=(error=new EngineError('CANCELLED','Evaluator workers released'))=>{cancelScheduledWorkerCalls(admission);
  for(const entry of workers)retire(entry,error);
  workers=[];charged=0;side=0;growthBlocked=null;growthBlockedPolicy=false;featureKeys=new WeakMap();
 };
 const call=(entry,message,transfer=[],signal,parent)=>scheduledWorkerCall(admission,async()=>{const compute=message.type==='evaluate';stats.callsAdmitted++;stats.peakConcurrentCalls=Math.max(stats.peakConcurrentCalls,++admittedCalls);if(compute)stats.peakConcurrentComputeCalls=Math.max(stats.peakConcurrentComputeCalls,++admittedComputes);try{return await new Promise((resolve,reject)=>{const id=++sequence;entry.pending.set(id,{resolve,reject});try{if(!entry.protocol)throw new EngineError('CANCELLED','Evaluator worker released');stats.messages++;entry.protocol.post({...message,id},transfer);}catch(error){entry.pending.delete(id);reject(error);}});}finally{admittedCalls--;if(compute)admittedComputes--;}},{signal,parent,label:'d2prl-evaluator'});
 const transportAttempt=async(entry,work)=>{try{return await work();}catch(error){if(error.code==='WORKER_MESSAGE_FAILED')retire(entry,error);throw error;}};
 const start=async(entry,signal,parent)=>{
  if(entry.worker)return;checkAbort(signal);entry.free=budget.reserve(entry.perWorker);charged+=entry.perWorker;stats.peakPolicyBytes=Math.max(stats.peakPolicyBytes,charged);
  try{entry.worker=workerFactory();stats.createdWorkers++;const fail=error=>{for(const {reject}of entry.pending.values())reject(error);entry.pending.clear();};
   entry.protocol=installWorkerMessageProtocol(entry.worker,data=>{if(data.protocolFailure)throw deserializeEngineError(data.error);if(!Number.isInteger(data.id)||typeof data.ok!=='boolean')throw workerMessageFailure('d2prl-evaluator','message','invalid-response');const pending=entry.pending.get(data.id);if(!pending)throw workerMessageFailure('d2prl-evaluator','message','unexpected-response-id');observeHeap(entry,data);entry.pending.delete(data.id);data.ok?pending.resolve(data):pending.reject(typeof data.error==='object'?deserializeEngineError(data.error):new EngineError('WORKER_FAILED',data.error));},{label:'d2prl-evaluator',onFailure:fail});
   entry.worker.onerror=event=>fail(new EngineError('WORKER_FAILED',event.message??'Evaluator worker failed'));
   await call(entry,{type:'init',moduleUrl,heapLimit:entry.heapLimit,abiLimit:ABI_BYTES,tileSize,kernelTileSize,side:entry.side,descriptorLayout},[],signal,parent);checkAbort(signal);
  }catch(error){retire(entry,error);throw error;}
 };
 async function configure(nextSide,signal){
  if(side&&side!==nextSide)clear();checkAbort(signal);
  const n=nextSide*nextSide;
  // One immutable worker copy per accepted channel count. Replacing a channel
  // reuses its native extent and cannot evict the other numerical branch.
  // Qualified modules: 16MiB initial/growth step, <=1MiB static ABI/allocator
  // prefix (including the 256KiB half table), and just five native allocations.
  // At448, 36-first fits the initial heap; 96-first fits48MiB and adding36
  // grows to at most64MiB. Vendor geometric growth1.2 also stays below64MiB.
  // Worker pointer high-water checks enforce the ABI allowance before publish.
  const heapLimit=Math.max(2*PAGE,Math.ceil((264*n+28*kernelTileSize*4+ABI_BYTES)/PAGE)*PAGE);
  // Full external views used to be cloned at once. Windowed transport bounds
  // every upload, including those views, before admitting any channel. The
  // extent is fixed from the maximum96-channel shape, never the first ZM bank.
  const uploadBytes=descriptorTransport==='windowed'?Math.min(UPLOAD_WINDOW,192*n):192*n;
  const perWorker=heapLimit+uploadBytes+28*tileSize*4+MiB;
  const useful=Math.min(maxWorkers,Math.ceil(n/tileSize));
  const availableCount=Math.min(useful,Math.floor((budget.limit-budget.total()+charged)/perWorker)),count=optionalMemory==='available-only'?availableCount:useful;
  if(count<1&&!workers.length)throw new EngineError('MEMORY_LIMIT','No evaluator worker fits the shared budget');
  const external=()=>budget.total()-charged;
  if(growthBlocked!==null&&external()>growthBlocked&&!(growthBlockedPolicy&&budget.limit-budget.total()>=perWorker))return;
  growthBlocked=null;growthBlockedPolicy=false;
  const add=async({resourceOperation}={})=>{
   checkAbort(signal);const entry={pending:new Map(),keys:new Map(),transportBanks:{},perWorker,heapLimit,uploadBytes,side:nextSide,scientificMask:null};workers.push(entry);
   try{
    await start(entry,signal,resourceOperation);return entry;
   }catch(error){retire(entry,error);const index=workers.indexOf(entry);if(index>=0)workers.splice(index,1);throw error;}
  };
  // One usable engine is mandatory. Later engines are optional parallelism:
  // a failed allocation must not destroy already initialized useful workers.
  if(!workers.length)await operation('evaluator:bootstrap',add,{bytes:PAGE});
  checkAbort(signal);
  const policyRefusal=error=>error?.code==='MEMORY_LIMIT'&&Number.isSafeInteger(error.details?.budgetBytes)&&Number.isSafeInteger(error.details?.shortfallBytes);
  const optionalAdd=async()=>{let refusal;const value=await operation('evaluator:optional-bootstrap',async context=>{
   const borrowed=context?.resourceOperation,ticket=borrowed??budget.beginOperation?.({owner:'d2prl',id:'evaluator:optional-memory'});let pressure;
   try{
    try{return await add({resourceOperation:ticket});}catch(error){if(!policyRefusal(error)||optionalMemory!=='reclaim-idle')throw error;stats.optionalPolicyRefusals++;
     // This was a real useful POLICY reservation refusal, not an allocator
     // probe. No failed slot, transfer bank or CPU lease is retained here.
     const progress=budget.resourceProgressSnapshot?.('d2prl','policy',ticket);if((progress?.independentProducers??0)>0){stats.optionalPeerDeferrals++;error.details={...error.details,optionalPeerDeferred:true};throw error;}
     pressure=budget.beginRecovery?.({owner:'d2prl',operation:ticket,requestedBytes:perWorker});ticket?.setState('recovery');const started=performance.now(),before=budget.total();stats.optionalPolicyReclaims++;
     try{await budget.reclaim?.(perWorker,{signal,owner:'d2prl',operation:ticket});}finally{stats.optionalPolicyReclaimedBytes+=Math.max(0,before-budget.total());stats.optionalReclaimMs+=performance.now()-started;}
     checkAbort(signal);ticket?.setState('ready');return await add({resourceOperation:ticket});
    }
   }catch(error){if(error.code==='WORKER_MESSAGE_FAILED')throw error;refusal=error;return null;}
   finally{pressure?.();if(!borrowed)ticket?.release();}
  });if(refusal)throw refusal;return value;};
  // Admit optional lanes sequentially: each failed reservation settles before
  // a bounded reclaim, and no sibling initialization becomes its own waiter.
  while(workers.length<count){try{await optionalAdd();}catch(reason){
   checkAbort(signal);const error=normalizeResourceError(reason);if(error.code==='WORKER_MESSAGE_FAILED'||!isRecoverableResourceError(error))throw error;
   stats.optionalWorkerRefusals++;stats.lastOptionalWorkerFailure=serializeEngineError(error);growthBlockedPolicy=policyRefusal(error);growthBlocked=error.details?.optionalPeerDeferred?null:external()-(growthBlockedPolicy?1:PAGE);break;
  }}
  side=nextSide;stats.peakWorkers=Math.max(stats.peakWorkers,workers.length);
 }

 return {
  get residentBytes(){return charged;},get stats(){return {...stats,activeWorkers:workers.length,admittedCalls,admittedComputes,tileSize,kernelTileSize,descriptorLayout,descriptorTransport,optionalMemory,heapLimitBytes:workers[0]?.heapLimit??0,descriptorUploadLimitBytes:workers[0]?.uploadBytes??0,perWorkerPolicyBytes:workers[0]?.perWorker??0,abiAllowanceBytes:ABI_BYTES,policyBytes:charged,wasmBytes,descriptorBytes,descriptorSlotCapacityBytes:264*side**2*workers.length,transportBytes,timingSemantics:'Wall durations including waits; concurrent worker/copy/gather totals are not additive. Optional reclamation is policy accounting after a reservation refusal, not evidence of allocator failure or physical RAM release. Descriptor bytes are native payload extents within the reported heap, not an extra backing. Backings are registered extents, not process RSS or GPU utilization.'};},
  async evaluate({features,offsetX,offsetY,side:nextSide,channels,candidates,referenceThreads=8,scientificMask=null},{signal,onProgress}={}){
   requireValue(!disposed&&!busy,'Evaluator pool unavailable');
   const n=nextSide*nextSide;
   requireValue(Number.isInteger(nextSide)&&nextSide>=2&&nextSide<=448&&(channels===36||channels===96)&&Number.isInteger(candidates)&&candidates>=1&&candidates<=13&&Number.isInteger(referenceThreads)&&referenceThreads>=1&&referenceThreads<=32,'Evaluator dimensions');
   requireValue(features instanceof Uint16Array&&features.buffer instanceof ArrayBuffer&&features.length===channels*n&&offsetX instanceof Float32Array&&offsetY instanceof Float32Array&&offsetX.buffer instanceof ArrayBuffer&&offsetY.buffer instanceof ArrayBuffer&&offsetX.length===candidates*n&&offsetY.length===candidates*n,'Evaluator tensors');
   requireValue(scientificMask===null||scientificMask instanceof Uint8Array&&scientificMask.length===n&&scientificMask.every(v=>v===0||v===1),'Native scientific membership extent');checkAbort(signal);busy=true;const started=performance.now();let release,failure,descriptorLease;const healthy=()=>{checkAbort(signal);if(failure)throw failure;if(descriptorLease)requireValue(getD2prlDescriptorLease(features)===descriptorLease,'Descriptor ownership changed');};
   const abort=()=>clear(new EngineError('CANCELLED','Task cancelled.'));signal?.addEventListener('abort',abort,{once:true});
   try{
    let stamp=performance.now();
    const validationStart=stamp;
    const validation=await validateD2prlDescriptor(features,{signal});descriptorLease=validation.lease;stats.descriptorValidationElements+=validation.elementsScanned;
    for(let i=0;i<offsetX.length;i++){requireValue(Number.isFinite(offsetX[i])&&Number.isFinite(offsetY[i]),'Nonfinite offset');if((i&8191)===0&&performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}
    stats.offsetValidationElements+=offsetX.length;stats.validationMs+=performance.now()-validationStart;
    release=budget.reserve(8*n);stamp=performance.now();await configure(nextSide,signal);stats.configureMs+=performance.now()-stamp;
    // Only a live immutable publication can keep a worker upload across calls.
    // A plain external view may have changed since its previous evaluation.
    let key=descriptorLease?featureKeys.get(descriptorLease):undefined;if(key===undefined){key=++featureSequence;if(descriptorLease)featureKeys.set(descriptorLease,key);}
    const upload=async(entry,parent)=>{healthy();await start(entry,signal,parent);if(entry.keys.get(channels)===key)return;entry.keys.delete(channels);if(descriptorTransport==='legacy-auto'&&!isWasmTensorView(features)&&features.byteOffset===0&&features.byteLength===features.buffer.byteLength){await call(entry,{type:'features',key,channels,side:nextSide,values:features},[],signal,parent);}else{
      await call(entry,{type:'features-begin',key,channels,side:nextSide,bytes:features.byteLength},[],signal,parent);
      const bytes=new Uint8Array(features.buffer,features.byteOffset,features.byteLength);for(let begin=0;begin<bytes.length;begin+=UPLOAD_WINDOW){healthy();const chunks=[],frees=[];try{for(let at=begin;at<Math.min(bytes.length,begin+UPLOAD_WINDOW);at+=MiB){const size=Math.min(MiB,bytes.length-at);let value;try{value=new Uint8Array(size);}catch(error){throw normalizeResourceError(error,{requestedBytes:size,allocationKind:'array-buffer',allocation:'d2prl-descriptor-upload'});}frees.push(transportBacking(size));value.set(bytes.subarray(at,at+value.length));chunks.push({at,value});}await call(entry,{type:'features-chunks',key,chunks},chunks.map(chunk=>chunk.value.buffer),signal,parent);}finally{for(const free of frees)free();}}
      await call(entry,{type:'features-end',key},[],signal,parent);}entry.keys.set(channels,key);stats.descriptorUploads++;};
    const uploads=workers.map(entry=>operation('evaluator:features',({resourceOperation}={})=>transportAttempt(entry,async()=>{await upload(entry,resourceOperation);if(entry.scientificMask!==scientificMask){if(scientificMask&&!entry.scopeFree)entry.scopeFree=budget.reserve(n);await call(entry,{type:'scientific-scope',values:scientificMask},[],signal,resourceOperation);entry.scientificMask=scientificMask;if(!scientificMask){entry.scopeFree?.();entry.scopeFree=null;}}}),{bytes:features.byteLength}));
    stamp=performance.now();await Promise.allSettled(uploads.map(task=>task.catch(error=>{failure??=error;clear(failure);throw error;})));stats.uploadMs+=performance.now()-stamp;if(failure)throw failure;
    checkAbort(signal);const {x,y}=await operation('evaluator:outputs',()=>({x:new Float32Array(n),y:new Float32Array(n)}),{bytes:8*n});let cursor=0,completed=0;
    const tasks=workers.map(async entry=>{
     while(cursor<n){healthy();let begin=cursor;const end=Math.min(n,begin+tileSize);cursor=end;let capacity=tileSize;
      // A demonstrated backing refusal reduces this group's transport only.
      // Completed ranges remain committed. The next group tries full capacity
      // again; scientific settings and the admitted worker ceiling are intact.
      while(begin<end){
       const result=await operation('evaluator:tile',({resourceOperation}={})=>transportAttempt(entry,async()=>{healthy();await upload(entry,resourceOperation);const partEnd=Math.min(end,begin+capacity),count=partEnd-begin;let recycled=false;try{const packStart=performance.now();let tx,ty;try{tx=transportFloats(entry,'x',candidates*count);ty=transportFloats(entry,'y',candidates*count);}catch(error){throw normalizeResourceError(error,{requestedBytes:candidates*count*4,allocationKind:'array-buffer',allocation:'d2prl-evaluator-transport'});}
       for(let k=0;k<candidates;k++){tx.set(offsetX.subarray(k*n+begin,k*n+partEnd),k*count);ty.set(offsetY.subarray(k*n+begin,k*n+partEnd),k*count);}stats.packingMs+=performance.now()-packStart;
       const callStart=performance.now(),result=await call(entry,{type:'evaluate',key,x:tx,y:ty,side:nextSide,channels,candidates,begin,end:partEnd,referenceThreads},[tx.buffer,ty.buffer],signal,resourceOperation);stats.workerCallMs+=performance.now()-callStart;if(!(result.x instanceof Float32Array&&result.y instanceof Float32Array&&result.x.length===count&&result.y.length===count))throw workerMessageFailure('d2prl-evaluator','message','invalid-tile');recycleTransport(entry,result,candidates*count);recycled=true;stats.workerComputeMs+=result.computeMs??0;stats.workerCopyMs+=result.copyMs??0;stats.kernelTiles+=result.kernelTiles??Math.ceil(count/kernelTileSize);if(result.scientificMatching){stats.scientificMatching??={};for(const [key,value]of Object.entries(result.scientificMatching))stats.scientificMatching[key]=(stats.scientificMatching[key]??0)+value;}return result;
       }catch(error){const normalized=normalizeResourceError(error);if(count>1&&['MEMORY_ALLOCATION','MEMORY_LIMIT'].includes(normalized.code)&&normalized.details?.allocationKind==='array-buffer'){capacity=Math.max(1,Math.floor(count/2));stats.transportReductions++;stats.minimumTransportPixels=Math.min(stats.minimumTransportPixels,capacity);}throw normalized;}finally{if(!recycled)clearTransport(entry);}}),{bytes:candidates*Math.min(end-begin,capacity)*8});healthy();
       const count=result.x.length,freeResult=transportBacking(count*8),gatherStart=performance.now();try{x.set(result.x,begin);y.set(result.y,begin);}finally{freeResult();stats.gatherMs+=performance.now()-gatherStart;}begin+=count;completed+=count;stats.tiles++;onProgress?.(completed/n);
      }
     }
    });
    await Promise.allSettled(tasks.map(task=>task.catch(error=>{failure??=error;clear(failure);throw error;})));if(failure)throw failure;
    healthy();return{x,y};
   }catch(error){failure??=error;clear(error);throw error;}
   finally{stats.totalMs+=performance.now()-started;signal?.removeEventListener('abort',abort);release?.();busy=false;}
  },
  dispose(){requireValue(!busy,'Evaluator pool busy');if(disposed)return;disposed=true;clear();}
 };
}
