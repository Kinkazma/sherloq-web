import "../../runtime-context.js?v=0.30.0";
import {createEfficientLoFtrDeviceIndexAliases} from './neural-window-efficient-index-aliases.js';
import {neuralWindowGlueOperator,neuralWindowGlueOutputs} from './neural-window-glue-operators.js';
import {installUsefulGpuDispatchEvidence} from './useful-gpu-dispatch-evidence.js';
import {M3_ORT_ASSETS} from './m3-ort-assets.js';
import {fetchM3Asset,verifyM3Bytes} from './m3-asset.js';
import {XFEAT_PAGED_MODEL} from './xfeat-paged-assets.js';
import {EFFICIENT_LOFTR_ASSET} from './efficient-loftr-assets.js';
import {EngineError,requireValue} from './errors.js';
import {neuralWindowAck} from './neural-window-job-owner.js';
import {createNeuralWindowOutputOwner} from './neural-window-output-owner.js';
import {copyXfeatCoreOutput,validateXfeatCoreGeometry} from './xfeat-core-output.js';
let applicationWindowPool;

/** One strongly owned application-Window runtime. closeJobs retires GPU jobs,
 * not the JavaScript/Wasm runtime. Its quota stays funded until Window death. */
export function createNeuralWindowOrtPool({budget,hostMaximumBytes,quotaBytes,onOwner,runtimeFactory,factoryURL=new URL('../vendor/m3-ort/factory.asyncify.mjs',import.meta.url)}={}){
 requireValue(budget?.reserve&&Number.isSafeInteger(hostMaximumBytes)&&hostMaximumBytes>=16*1024**2&&hostMaximumBytes<=2*1024**3&&hostMaximumBytes%65536===0&&Number.isSafeInteger(quotaBytes)&&quotaBytes>=hostMaximumBytes&&typeof onOwner==='function','A strongly owned and funded Window runtime profile is required.');
 if(!runtimeFactory&&applicationWindowPool){requireValue(applicationWindowPool.budget===budget&&applicationWindowPool.hostMaximumBytes===hostMaximumBytes&&applicationWindowPool.quotaBytes===quotaBytes,'The application Window already owns a different funded neural runtime capacity.');onOwner(applicationWindowPool.pool);return applicationWindowPool.pool;}
 let fee,initialization,ort,factory,started=false,closed=false,queue=Promise.resolve(),capacityFailed=false;const capacityLoans=[],resultFacts=new WeakMap(),gpuEvidence=installUsefulGpuDispatchEvidence();const jobs=new Set(),devices=new Map(),retiredDevices=new WeakSet();let poolClosing;
 const pool={
  executionFacts(value){return resultFacts.get(value)??null;},
  whenIdle(){return queue;},
  admitCapacity({hostMaximumBytes:nextHost,quotaBytes:nextQuota}){requireValue(!jobs.size,'Window capacity can change only between acknowledged native turns.');requireValue(!closed&&Number.isSafeInteger(nextHost)&&nextHost>=hostMaximumBytes&&nextHost<=2*1024**3&&nextHost%65536===0&&Number.isSafeInteger(nextQuota)&&nextQuota>=quotaBytes+nextHost-hostMaximumBytes,'Runtime capacity must grow only from a complete funded Native plan.');if(nextHost===hostMaximumBytes&&!capacityFailed)return pool.snapshot;if(nextQuota>quotaBytes){const loan={free:null,bytes:nextQuota-quotaBytes};capacityLoans.push(loan);try{loan.free=budget.reserve(loan.bytes);}catch(error){if(!loan.free)capacityLoans.splice(capacityLoans.indexOf(loan),1);throw error;}quotaBytes=nextQuota;}capacityFailed=true;hostMaximumBytes=nextHost;if(initialization){requireValue(typeof factory?.admitHeapMaximum==='function','Initialized Window runtime has no admitted capacity control.');const ack=factory.admitHeapMaximum(nextHost);requireValue(ack===nextHost,'Window runtime capacity change did not acknowledge its exact bound.');}capacityFailed=false;return pool.snapshot;},
  get snapshot(){return{scope:'application-Window',quotaBytes:fee?quotaBytes:0,hostMaximumBytes,actualHostHeapBytes:factory?.heapBytes?.()??0,initializationStarted:started,capacityFailed,activeJobs:jobs.size,retainedDevices:devices.size,accepting:!closed,persistentRuntimeFunded:!!fee};},
  closeJobs(){closed=true;if(poolClosing)return poolClosing;poolClosing=(async()=>{let failed=false,primary;const attempt=async action=>{try{await action();}catch(error){if(!failed){failed=true;primary=error;}}};for(const job of [...jobs])await attempt(()=>job.dispose());if(!jobs.size)for(const [device,state]of devices){if(!state.queueAck&&!state.lost)await attempt(async()=>{await device.queue.onSubmittedWorkDone();state.queueAck=true;});if(!state.destroyed)await attempt(async()=>{await neuralWindowAck(()=>device.destroy());state.destroyed=true;});if(!state.lost)await attempt(async()=>{await device.lost;state.lost=true;});if(state.destroyed&&state.lost)devices.delete(device);}if(failed)throw primary;requireValue(!jobs.size&&!devices.size,'Application Window GPU resources remain unacknowledged.');return pool.snapshot;})();void poolClosing.catch(()=>{poolClosing=null;});return poolClosing;},
  execute(payload,hooks){
   requireValue(!closed&&!capacityFailed&&hooks?.onOwner&&hooks?.onOutputOwner&&hooks?.sizes&&hooks?.binding,'An admitted graph job and output owner are required.');
   let done=Promise.resolve(),finish,closing,dead=false,sealed=false,session,indexAliasesOwner,releaseTurn;const tensors=new Set(),jobDevices=new Set(),turn=new Promise(resolve=>releaseTurn=resolve);
   const captureDevice=()=>{const device=ort?.env?.webgpu?.device;if(device&&!retiredDevices.has(device)){if(!devices.has(device))devices.set(device,{queueAck:false,destroyed:false,lost:false});jobDevices.add(device);devices.get(device).queueAck=false;}};
   const job={
    async dispose(){
     if(dead)return;if(closing)return closing;sealed=true;
     closing=(async()=>{await done;captureDevice();let failed=false,primary;const attempt=async action=>{try{await action();}catch(error){if(!failed){failed=true;primary=error;}}};
      for(const tensor of [...tensors])await attempt(async()=>{await neuralWindowAck(()=>tensor.dispose());tensors.delete(tensor);});
      if(session)await attempt(async()=>{await neuralWindowAck(()=>session.release());session=null;});
      // Each real ORT session may create its own device. Keep at most one
      // live session turn; retain any failed device receipt until actual ACK.
      if(!tensors.size&&!session)for(const device of jobDevices){const state=devices.get(device);
       if(!state.queueAck&&!state.lost)await attempt(async()=>{await device.queue.onSubmittedWorkDone();state.queueAck=true;});
       if(!state.destroyed)await attempt(async()=>{await neuralWindowAck(()=>device.destroy());state.destroyed=true;});
       if(!state.lost)await attempt(async()=>{await device.lost;state.lost=true;});
      }
      if(indexAliasesOwner&&!tensors.size&&!session&&[...jobDevices].every(device=>devices.get(device).destroyed&&devices.get(device).lost))await attempt(async()=>{await neuralWindowAck(()=>indexAliasesOwner.dispose());indexAliasesOwner=null;});
      if(failed)throw primary;requireValue(!indexAliasesOwner&&!tensors.size&&!session&&[...jobDevices].every(device=>devices.get(device).destroyed&&devices.get(device).lost),'Native Window graph resources remain unacknowledged.');for(const device of jobDevices){retiredDevices.add(device);devices.delete(device);}jobDevices.clear();dead=true;jobs.delete(job);releaseTurn();
     })();void closing.catch(()=>{closing=null;});return closing;
    }
   };
   // Idle initially: a parent close called from this synchronous adoption has
   // no cycle with a future model read or construction that has not begun.
   jobs.add(job);hooks.onOwner(job);requireValue(!sealed&&!dead&&!closed,'Window graph was closed during adoption.');
   done=new Promise(resolve=>finish=resolve);
   const work=async()=>{try{
    requireValue(!sealed&&!closed,'Window graph closed before its native turn.');
    requireValue(payload&&payload.model instanceof Uint8Array&&payload.model.byteLength===hooks.sizes.modelBytes,'Native graph bytes differ from admission.');
    const family=hooks.binding.family;
    if(family==='xfeat-local'){
     requireValue(Number.isSafeInteger(payload.width)&&payload.width>=32&&payload.width%32===0&&Number.isSafeInteger(payload.height)&&payload.height>=32&&payload.height%32===0&&payload.input instanceof Float32Array&&payload.input.length===payload.width*payload.height&&payload.input.every(Number.isFinite),'Native normalized XFeat input differs.');validateXfeatCoreGeometry(payload.width,payload.height,payload.core);await verifyM3Bytes(payload.model,XFEAT_PAGED_MODEL);
    }else{
     if(family==='xfeat-glue-operator'){
      requireValue(payload.library==='xfeat-glue-original-operator','Original Glue operator library required.');const spec=neuralWindowGlueOperator(payload.stage);
      requireValue(payload.asset?.sha256===spec.asset.sha256&&payload.asset?.bytes===spec.asset.bytes&&JSON.stringify(payload.outputSpecs)===JSON.stringify(neuralWindowGlueOutputs(payload.stage,payload.inputs)),'Pinned complete Glue graph/output differs.');
     }else{
     requireValue(family==='efficient-loftr-native-stage'&&payload.nativeModelSha256===EFFICIENT_LOFTR_ASSET.sha256&&payload.nativeModelBytes===EFFICIENT_LOFTR_ASSET.bytes&&(['native-stages01','native-domain04'].includes(payload.library)||payload.library==='native-full'&&payload.asset?.sha256===EFFICIENT_LOFTR_ASSET.sha256&&payload.asset?.bytes===EFFICIENT_LOFTR_ASSET.bytes&&payload.stage==='full')&&typeof payload.stage==='string'&&payload.stage.length>0&&payload.asset?.bytes===payload.model.byteLength&&/^[a-f0-9]{64}$/.test(payload.asset?.sha256??''),'Native EfficientLoFTR stage provenance differs.');
     }
     requireValue(payload.inputs&&Array.isArray(payload.outputSpecs),'Native stage tensor inventory required.');
     for(const item of Object.values(payload.inputs)){const C=item?.type==='float32'?Float32Array:item?.type==='int64'?BigInt64Array:item?.type==='bool'?Uint8Array:null;requireValue(C&&item.data instanceof C&&Array.isArray(item.dims)&&item.dims.every(n=>Number.isSafeInteger(n)&&n>=0)&&item.data.length===item.dims.reduce((a,b)=>a*b,1),'Native stage input shape/type differs.');}
     requireValue(payload.outputSpecs.length>0&&payload.outputSpecs.length<=32&&new Set(payload.outputSpecs.map(s=>s.name)).size===payload.outputSpecs.length&&payload.outputSpecs.every(s=>typeof s.name==='string'&&s.name.length>0&&['float32','int64','bool'].includes(s.type)&&Array.isArray(s.upper)&&s.upper.length<=16&&s.upper.every(n=>Number.isSafeInteger(n)&&n>=0)),'Native output inventory differs before construction.');
     await verifyM3Bytes(payload.model,payload.asset);
    }
    requireValue(!sealed&&!closed,'Window graph closed after model verification.');
    if(!initialization)initialization=(async()=>{
     globalThis.__m3MaximumWasmPages=hostMaximumBytes/65536;
     if(runtimeFactory){({ort,factory}=await runtimeFactory());return;}
     ort=await import('../vendor/m3-ort/ort.webgpu.min.mjs');factory=await import(factoryURL.href);
     ort.env.wasm.wasmBinary=await fetchM3Asset(new URL(M3_ORT_ASSETS.gpu.path,import.meta.url),M3_ORT_ASSETS.gpu);
     ort.env.wasm.wasmPaths={mjs:factoryURL.href,wasm:new URL(M3_ORT_ASSETS.gpu.path,import.meta.url).href};ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
    })();
    await initialization;requireValue(!sealed&&!closed,'Window graph closed after runtime initialization.');
    // May allocate a real host heap even if create rejects. The Window quota
    // is deliberately never refunded by that failed constructor or job close.
    started=true;
    try{session=await ort.InferenceSession.create(payload.model,{executionProviders:['webgpu'],graphOptimizationLevel:'all',...(family==='efficient-loftr-native-stage'?{enableCpuMemArena:false,enableMemPattern:false}:{})});}finally{captureDevice();}
    if(family==='efficient-loftr-native-stage'){const device=ort.env.webgpu?.device;if(device&&jobDevices.has(device))createEfficientLoFtrDeviceIndexAliases(device,{onOwner:owner=>{indexAliasesOwner=owner;}});}
    const feeds={};
    if(family==='xfeat-local'){
     const tensor=new ort.Tensor('float32',payload.input,[1,1,payload.height,payload.width]);tensors.add(tensor);feeds.normalized=tensor;
    }else{
     requireValue(payload.inputs&&Array.isArray(payload.outputSpecs),'Native stage tensor inventory required.');
     for(const [name,item]of Object.entries(payload.inputs)){requireValue(item&&['float32','int64','bool'].includes(item.type)&&ArrayBuffer.isView(item.data)&&Array.isArray(item.dims)&&item.dims.every(n=>Number.isSafeInteger(n)&&n>=0)&&item.data.length===item.dims.reduce((a,b)=>a*b,1),'Native stage tensor shape/type differs.');const tensor=new ort.Tensor(item.type,item.data,item.dims);tensors.add(tensor);feeds[name]=tensor;}
    }
    const usefulGpuStart=gpuEvidence?.snapshot();let result;try{result=await session.run(feeds);for(const tensor of Object.values(result))tensors.add(tensor);}finally{captureDevice();}
    const outputs=createNeuralWindowOutputOwner({budget,maximumBytes:hooks.sizes.outputBytes,onOwner:hooks.onOutputOwner});let copied;
    if(family==='xfeat-local')copied=copyXfeatCoreOutput(result,payload.width,payload.height,payload.core,(Type,length)=>outputs.allocate(Type,length));
    else{
     requireValue(Object.keys(result).length===payload.outputSpecs.length,'Native stage output count differs.');copied={};
     for(const spec of payload.outputSpecs){const t=result[spec.name],C=spec.type==='float32'?Float32Array:spec.type==='int64'?BigInt64Array:spec.type==='bool'?Uint8Array:null;requireValue(C&&t?.type===spec.type&&t.data instanceof C&&Array.isArray(t.dims)&&Array.isArray(spec.upper)&&t.dims.length===spec.upper.length&&t.dims.every((n,i)=>Number.isSafeInteger(n)&&n>=0&&n<=spec.upper[i])&&t.data.length===t.dims.reduce((a,b)=>a*b,1),'Native stage output geometry differs.');const data=outputs.allocate(C,t.data.length);data.set(t.data);copied[spec.name]={type:t.type,dims:[...t.dims],data};}
    }
    resultFacts.set(copied,Object.freeze({provider:'webgpu',gpuExecution:gpuEvidence?.since(usefulGpuStart)??null,actualGpuWork:gpuEvidence?.since(usefulGpuStart)?.actualGpuWork===true,modelSha256:family==='xfeat-local'?XFEAT_PAGED_MODEL.sha256:payload.asset.sha256}));
    return copied;
   }finally{finish();}};
   const result=queue.then(work,work);queue=result.then(()=>turn,()=>turn);return result;
  }
 };
 onOwner(pool);if(closed)return pool;fee=budget.reserve(quotaBytes);if(!runtimeFactory)applicationWindowPool={pool,budget,hostMaximumBytes,quotaBytes};return pool;
}
