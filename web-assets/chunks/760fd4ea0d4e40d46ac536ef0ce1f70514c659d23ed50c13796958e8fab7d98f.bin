import {Budget} from '../../src/cache.js';
import {boundGpuAdapter} from './gpu-budget.js';
import {readPinnedSplitAsset,validateSplitModel} from './split-model.js';
let encoder,head,manifest,ort,runtime,gpu;
self.onmessage=async({data})=>{
  let input,intermediate,outputs,scoped=false;
  try{
    const started=performance.now();let modelLoadMs=0;
    const gpuBefore=gpu?.snapshot();
    if(!head){
      if(!data.model.splitGraph||data.gpuBudgetBytes!==512*1024**2||data.model.bridgeBytes!==12288024)throw Error('Pinned split admission required');
      const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});
      if(!adapter)throw Object.assign(Error('WebGPU adapter unavailable'),{code:'GPU_UNAVAILABLE'});
      gpu=boundGpuAdapter(adapter,new Budget(data.gpuBudgetBytes));self.postMessage({phase:'model-load'});
      manifest=validateSplitModel(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readPinnedSplitAsset(data.modelUrl,data.model))),data.model);
      runtime=await import(data.runtimeFactoryUrl);ort=await import(data.ortUrl);
      ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=data.wasmPaths;ort.env.webgpu.adapter=gpu.adapter;
      const create=async stage=>ort.InferenceSession.create(await readPinnedSplitAsset(new URL(stage.file,data.modelUrl).href,stage),{executionProviders:stage.backend==='webgpu'?['webgpu','wasm']:['wasm'],graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false});
      encoder=await create(manifest.stages[0]);head=await create(manifest.stages[1]);
      if(!gpu.snapshot().devices)throw Object.assign(Error('GPU provider unavailable; CPU-only execution refused'),{code:'GPU_UNAVAILABLE'});
      modelLoadMs=performance.now()-started;
    }
    input=new ort.Tensor('float32',data.input,[1,3,256,256]);self.postMessage({phase:'inference'});
    const begin=performance.now();await gpu.begin();scoped=true;
    intermediate=await encoder.run({rgb:input});await ort.env.webgpu.device.queue.onSubmittedWorkDone();
    const encoderMs=performance.now()-begin;
    const [feature,scalar]=manifest.boundary.map(v=>intermediate[v.name]);
    if(feature.type!=='float32'||feature.data.length!==640*40*40||scalar.type!=='int64'||scalar.data.length!==1)throw Error('Split boundary shape');
    self.postMessage({phase:'split-head-'+manifest.stages[1].backend});
    const headBegin=performance.now();outputs=await head.run(intermediate);scoped=false;await gpu.end();const headMs=performance.now()-headBegin,inferenceMs=performance.now()-begin,copyStart=performance.now();
    const raw=outputs.probability.data.slice(),expected=(data.model.kind==='softmax'?3:1)*256**2;
    if(raw.length!==expected||!raw.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid split model output');
    const stats=gpu.snapshot();if(!stats.allocations||stats.activeReservationBytes>data.gpuBudgetBytes)throw Error('Bounded GPU execution not established');
    self.postMessage({ok:true,raw,heapBytes:runtime.heapBytes(),ort:ort.env.versions,gpu:stats,timings:{modelLoadMs,inferenceMs,encoderMs,headMs,outputCopyMs:performance.now()-copyStart,gpuWriteBytes:stats.writeBufferBytes-(gpuBefore?.writeBufferBytes??0),gpuReadBytes:stats.readMappingBytes-(gpuBefore?.readMappingBytes??0)}},[raw.buffer]);
  }catch(error){self.postMessage({ok:false,code:error.code??'MODEL_FAILED',error:String(error.message??error)});}
  finally{
    if(scoped){try{await gpu.end();}catch{/* Request already failed. */}}
    input?.dispose();for(const result of [intermediate,outputs])for(const value of Object.values(result??{}))value.dispose();
  }
};
