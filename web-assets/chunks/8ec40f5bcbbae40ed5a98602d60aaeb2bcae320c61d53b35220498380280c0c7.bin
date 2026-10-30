import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {fetchM3Asset} from './m3-asset.js';
import {EFFICIENT_LOFTR_ASSET} from './efficient-loftr-assets.js';
import {createNeuralWindowTargetRunner} from './neural-window-target-runner.js';
import {captureNeuralWindowBinding,neuralWindowAck} from './neural-window-job-owner.js';
import {getExecutionScheduler} from './execution-scheduler.js';
const MiB=1024**2;
/** Targeted transport for the existing full/staged EfficientLoFTR graphs only.
 * Model preparation, source RGB, graph cuts and result selection stay outside.
 * A returned result remains a loan until release; no graph Worker owns WebGPU. */
export function createNeuralWindowEfficientPool({budget,profile,assets,binding,onOwner,runnerFactory=createNeuralWindowTargetRunner,readAsset=fetchM3Asset}={}){
 const captured=captureNeuralWindowBinding(binding);requireValue(captured.family==='efficient-loftr-native-stage'&&typeof onOwner==='function'&&budget?.reserve&&profile?.maxWorkers>0&&assets&&typeof assets==='object','EfficientLoFTR Window pool requires its exact Native parent.');
 const records=new Set(),lifetime=new AbortController();let closed=false,closing,serial=Promise.resolve();
 async function retire(rec){let failed=false,primary;const attempt=async action=>{try{await action();}catch(error){if(!failed){failed=true;primary=error;}}};
  await attempt(async()=>{if(rec.reply){await neuralWindowAck(()=>rec.reply.release());rec.reply=null;}});
  await attempt(async()=>{if(rec.runner){await neuralWindowAck(()=>rec.runner.dispose());rec.runner=null;}});
  await attempt(async()=>{if(rec.lease){await neuralWindowAck(()=>rec.lease.release());rec.lease=null;}});
  if(!failed)await attempt(async()=>{rec.copies=rec.inputCopies=rec.modelCopy=null;if(rec.free){await neuralWindowAck(()=>rec.free());rec.free=null;}records.delete(rec);});if(failed)throw primary;
 }
 const pool={assets,
  get state(){return{closed,jobs:records.size,retainedOutputLoans:[...records].filter(r=>r.reply).length};},
  run(name,inputs,options={}){
   requireValue(!closed,'EfficientLoFTR Window pool is closed.');const rec={runner:null,reply:null,lease:null,free:null,copies:null,inputCopies:null,modelCopy:null,done:Promise.resolve()};records.add(rec);
   const work=async()=>{const signal=AbortSignal.any([lifetime.signal,...(options.signal?[options.signal]:[])]);let failed=false,primary,published=false;
    try{checkAbort(signal);const asset=assets[name];requireValue(asset&&Number.isSafeInteger(asset.bytes)&&asset.bytes>0&&/^[a-f0-9]{64}$/.test(asset.sha256??'')&&typeof asset.url==='string','Pinned EfficientLoFTR native graph asset required.');
     const full=asset.sha256===EFFICIENT_LOFTR_ASSET.sha256&&asset.bytes===EFFICIENT_LOFTR_ASSET.bytes,stage=asset.neuralWindowStage;
     requireValue(full||stage&&['native-stages01','native-domain04'].includes(stage.library)&&Array.isArray(stage.outputSpecs),'Only native EfficientLoFTR graph cuts are admitted.');
     requireValue(inputs&&Object.values(inputs).every(t=>t&&['float32','int64','bool'].includes(t.type)&&ArrayBuffer.isView(t.data)&&Array.isArray(t.dims)&&t.dims.every(d=>Number.isSafeInteger(d)&&d>=0)&&t.data.length===t.dims.reduce((n,d)=>n*d,1)),'Native EfficientLoFTR inputs differ.');
     const outputSpecs=full?[{name:'keypoints0',type:'float32',upper:[options.maximumMatches,2]},{name:'keypoints1',type:'float32',upper:[options.maximumMatches,2]},{name:'confidence',type:'float32',upper:[options.maximumMatches]}]:stage.outputSpecs;
     requireValue(outputSpecs.length&&outputSpecs.every(s=>Array.isArray(s.upper)&&s.upper.every(d=>Number.isSafeInteger(d)&&d>=0)),'Native output population must be admitted before construction.');
     const inputBytes=Object.values(inputs).reduce((n,t)=>n+t.data.byteLength,0),outputBytes=outputSpecs.reduce((n,s)=>n+s.upper.reduce((n,d)=>n*d,1)*(s.type==='int64'?8:s.type==='bool'?1:4),0),workingBytes=options.gpuWasmWorkspaceBytes??options.workspaceBytes;
     requireValue(Number.isSafeInteger(workingBytes)&&workingBytes>=0&&outputBytes>0,'Native EfficientLoFTR memory bounds required.');const hostMaximumBytes=Math.ceil((64*MiB+2*asset.bytes+workingBytes)/(16*MiB))*16*MiB;
     if(hostMaximumBytes>2*1024**3)throw new EngineError('MEMORY_LIMIT','The unchanged EfficientLoFTR graph exceeds its admitted host ABI.',{details:{hostMaximumBytes,workingBytes}});
     const jobBytes=2*asset.bytes+2*inputBytes+3*outputBytes+workingBytes+4096;rec.free=budget.reserve(jobBytes);
     // The transport counts complete ArrayBuffers, not only typed subviews.
     // Stage inputs can alias larger Native banks. Copy only declared values
     // into the already-funded envelope before the first asynchronous read.
     rec.inputCopies={};for(const[name,tensor]of Object.entries(inputs)){const copy={type:tensor.type,dims:[...tensor.dims],data:null};rec.inputCopies[name]=copy;copy.data=tensor.data.slice();}
     let model=await readAsset(asset.url,asset,signal);rec.modelCopy={data:null};rec.modelCopy.data=model.byteOffset===0&&model.byteLength===model.buffer.byteLength?model:model.slice();model=rec.modelCopy.data;checkAbort(signal);rec.runner=runnerFactory({budget,binding:captured,hostMaximumBytes,maximumModelBytes:asset.bytes,maximumInputBytes:inputBytes,maximumOutputBytes:outputBytes,gpuWorkingBytes:workingBytes,signal,onOwner:owner=>{rec.runner=owner;}});await rec.runner.ready();checkAbort(signal);
     rec.lease=await getExecutionScheduler(budget,{maxWorkers:profile.maxWorkers}).acquire({cpu:1,gpu:1,signal,label:'efficient-loftr-window-native',resourceOwner:'eloftr-native'});
     rec.reply=await rec.runner.run({model,asset:{bytes:asset.bytes,sha256:asset.sha256},nativeModelSha256:EFFICIENT_LOFTR_ASSET.sha256,nativeModelBytes:EFFICIENT_LOFTR_ASSET.bytes,library:full?'native-full':stage.library,stage:full?'full':stage.stage,inputs:rec.inputCopies,outputSpecs},{modelBytes:asset.bytes,inputBytes,outputBytes,onOwner:()=>{},reserveOutput:bytes=>{requireValue(bytes<=outputBytes+4096,'Native output exceeds prepaid job.');return()=>{};}});checkAbort(signal);
     // Scientific caches may register aliases of the public result. Retire
     // the peer's fresh transport backing BEFORE exposing standalone host
     // copies; its release receipt must never be confused with an alias ref.
     const execution=rec.reply.execution;rec.copies={};
     for(const[name,tensor]of Object.entries(rec.reply.result)){const copy={type:tensor.type,dims:[...tensor.dims],data:null};rec.copies[name]=copy;copy.data=tensor.data.slice();}
     await neuralWindowAck(()=>rec.reply.release());rec.reply=null;
     await neuralWindowAck(()=>rec.runner.dispose());rec.runner=null;
     await neuralWindowAck(()=>rec.lease.release());rec.lease=null;checkAbort(signal);const result=rec.copies;published=true;
     return{result,metrics:{provider:execution?.actualGpuWork===true?'webgpu':'wasm',runtimeProvider:'webgpu',actualGpuWork:execution?.actualGpuWork===true,gpuExecution:execution?.gpuExecution??null,cleanupAck:execution?.completedAfterNativeAck===true,windowExecution:execution,maximumHeapBytes:hostMaximumBytes,preflightExecutions:0,inferenceExecutions:1},release:()=>retire(rec)};
    }catch(error){failed=true;primary=error;throw error;}finally{if(!published)try{await retire(rec);}catch(error){if(!failed)throw error;}}
   };
   const task=serial.then(work,work);rec.done=task.then(()=>{},()=>{});serial=rec.done;return task;
  },
  disposeGracefully(){closed=true;lifetime.abort();if(closing)return closing;closing=(async()=>{await serial;let failed=false,primary;for(const rec of [...records])try{await retire(rec);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;})();void closing.catch(()=>{closing=null;});return closing;}
 };onOwner(pool);return pool;
}
