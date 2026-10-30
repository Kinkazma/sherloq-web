import "../../runtime-context.js?v=0.30.0";
import {assertMgcfdnWindowGpuLimits} from './mgcfdn-window-gpu-admission.js';
import {encodeMgcfdnWorkerError,trackMgcfdnBudget} from './mgcfdn-window-gpu-diagnostics.js';
import {planMgcfdnWindowGpuMemory} from './mgcfdn-window-gpu-memory.js';
import {Budget} from './cache.js';
import {boundGpuAdapter} from '../experiments/segmentation/gpu-budget.js';
import {readVerifiedModelAsset} from '../experiments/d2prl/model.js';
import {createMgcfdnWindowGpuStageRuntime,MGCFDN_WINDOW_GPU_PINS} from './mgcfdn-window-gpu-stage-runtime.js';
let config,runtime,ort,gpu,lane,laneOwner,graphArena,gpuArena,gpuLimits,activeStage,tail=Promise.resolve();
const jobs=new Map(),LIMIT=512*1024**2;
const controller=new AbortController();
async function initialize(){
  if(lane)return;
  const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw Object.assign(Error('Native MGCFDN WebGPU adapter unavailable'),{code:'GPU_UNAVAILABLE'});
  const admission=planMgcfdnWindowGpuMemory(config.featureCells).gpuAdmission;
  const adapterLimits=assertMgcfdnWindowGpuLimits(adapter.limits,admission,'adapter');
  gpu=boundGpuAdapter(adapter,gpuArena.budget);
  const requestDevice=gpu.adapter.requestDevice.bind(gpu.adapter);
  gpu.adapter.requestDevice=async descriptor=>{const device=await requestDevice(descriptor);const deviceLimits=assertMgcfdnWindowGpuLimits(device.limits,admission,'device');gpuLimits={adapter:adapterLimits,device:deviceLimits};return device;};
  runtime=await import(config.runtimeFactoryUrl);ort=await import(config.ortUrl);
  ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=config.wasmPaths;ort.env.webgpu.adapter=gpu.adapter;
  lane=createMgcfdnWindowGpuStageRuntime({budget:graphArena.budget,read:(key,pin,{signal})=>readVerifiedModelAsset(config.urls[key],pin,{signal}),createSession:(bytes,options)=>ort.InferenceSession.create(bytes,options),createTensor:(...args)=>new ort.Tensor(...args),gpu,gpuMaximumBytes:config.gpuMaximumBytes,heapBytes:()=>runtime.heapBytes(),version:ort.env.versions,signal:controller.signal,onOwner:owner=>laneOwner=owner});
}
async function execute(message){
  const{id,type}=message;
  if(type==='init'){
    if(config||message.config?.backend!=='webgpu'||message.config?.numThreads!==1||message.config?.wasmMaximumBytes!==LIMIT||message.config?.modelSha256!==MGCFDN_WINDOW_GPU_PINS.base.sha256)throw Error('Original split GPU policy required');
    const memoryPlan=planMgcfdnWindowGpuMemory(message.config.featureCells);if(message.config.graphBudgetBytes!==memoryPlan.graphBudgetBytes||message.config.gpuMaximumBytes!==memoryPlan.nativeGpuMaximumBytes)throw Error('Parent and native Worker JS/GPU admissions differ');config=message.config;graphArena=trackMgcfdnBudget(new Budget(config.graphBudgetBytes),'javascript-graphs-and-bridge',()=>activeStage?.label??null);gpuArena=trackMgcfdnBudget(new Budget(config.gpuMaximumBytes),'native-webgpu-buffers',()=>activeStage?.label??null);self.postMessage({id,ok:true,ready:true,learnedCalls:0});return;
  }
  if(type==='close'){
    // Keep the lane and each output owner until all real teardown ACKs succeed.
    for(const[key,owner]of [...jobs]){await owner.release();jobs.delete(key);}
    await laneOwner?.release();await gpu?.dispose();gpu=undefined;laneOwner=undefined;lane=undefined;self.postMessage({id,ok:true,closed:true});self.close();return;
  }
  if(type==='retire'){const owner=jobs.get(message.jobId);await owner?.release();jobs.delete(message.jobId);self.postMessage({id,ok:true,retired:true});return;}
  if(type!=='run'||!config)throw Error('Initialized native window GPU stage required');
  activeStage={id,label:message.label,feeds:Object.entries(message.feeds??{}).map(([name,t])=>({name,dims:[...(t.dims??[])],bytes:t.data?.byteLength??null}))};await initialize();const result=await lane.run(message.label,message.feeds,{own:owner=>jobs.set(id,owner)});
  self.postMessage({id,ok:true,outputs:result.outputs,metrics:{...result.metrics,arenaDiagnostics:diagnostic(message)}});
}
function diagnostic(message,error){let heapBytes=null;try{heapBytes=runtime?.heapBytes()??null;}catch{}return{schema:'mgcfdn-native-worker-arenas/3',id:message.id,label:message.label??message.type,featureCells:config?.featureCells??null,feeds:activeStage?.id===message.id?activeStage.feeds:[],graph:graphArena?.snapshot()??null,gpu:gpuArena?.snapshot()??null,heapBytes,gpuLimits:gpuLimits??null,...(arguments.length>1?{originalError:encodeMgcfdnWorkerError(error)}:{})};}
self.onmessage=({data})=>{if(data.type==='abort'){controller.abort();return;}tail=tail.then(()=>execute(data)).catch(error=>{const errorRecord=encodeMgcfdnWorkerError(error),arenaDiagnostics=diagnostic(data,error);self.postMessage({id:data.id,ok:false,error:errorRecord.type==='Error'?{name:errorRecord.name,message:errorRecord.message,code:errorRecord.code,details:errorRecord.details}:errorRecord.value,errorRecord,arenaDiagnostics});});};
