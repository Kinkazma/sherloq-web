import "../../runtime-context.js?v=0.22.0";
import {closeGpuErrorScopes} from './gpu-error-scope.js';
import {installGpuBufferLedger} from './gpu-buffer-ledger.js';
import {allocateWasmMemory} from './allocation.js';
import {neuralRuntimeError} from './neural-runtime-error.js';
// The worker owns its actual ORT instance. Termination cancels initialization,
// download, CPU inference or GPU inference and destroys the model cache.
import {neuralOutputTransfer} from './neural-output-transfer.js';
import {EngineError,serializeEngineError} from './errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
import {fetchVerifiedAsset} from './fetch-verified-asset.js';
import {createNeuralSessionCache} from './neural-session-cache.js';
import {neuralModelSessionIdentity,adaptNeuralScopedModel} from './neural-scoped-model.js';
const reusable=new Map(),sessions=createNeuralSessionCache();
let session,ort,runtime,asset,cfaModule,cfaProgram,cfaWeights,cfaGPU,execute,resourceReady,graphTransformReceipt,gpuLedger;
const runtimeLifecycle={runtimeInitializations:0,modelInitializations:0,modelSwitches:0};
function waitForExecution(initializationMs,heapBytes){
 return new Promise(resolve=>{execute=resolve;self.postMessage({executionReady:true,initializationMs,heapBytes});});
}
function acquireResource(kind){return new Promise(resolve=>{resourceReady=resolve;self.postMessage({executionResource:kind});});}
async function modelBytes(spec){
  return fetchVerifiedAsset(spec);
}
function queryBatchShape(data){
  if(data.queryBatch===undefined)return null;
  const {input,output,counts}=data.queryBatch??{},item=data.inputs?.[input],dims=item?.dims;
  if(typeof input!=='string'||typeof output!=='string'||!Array.isArray(counts)||counts.length<2||counts.length>16||!counts.every(n=>Number.isSafeInteger(n)&&n>0)||!(item?.data instanceof Float32Array)||item.type&&item.type!=='float32'||!Array.isArray(dims)||dims.length!==4||dims[0]!==1||dims[2]!==1||!Number.isSafeInteger(dims[1])||dims[1]<=0||!Number.isSafeInteger(dims[3])||dims[3]<=0||counts.reduce((a,b)=>a+b,0)!==dims[3]||item.data.length!==dims[1]*dims[3]||item.data.byteLength>2*1024**2||data.reusableInputs?.[input]!==undefined)throw new EngineError('INVALID_INPUT','Invalid neural query transport batch');
  return {input,output,counts,channels:dims[1],total:dims[3]};
}
function actualGpuDeviceLimits(){
  const limits=ort?.env?.webgpu?.device?.limits,maxStorageBufferBindingSize=limits?.maxStorageBufferBindingSize,maxBufferSize=limits?.maxBufferSize;
  if(!Number.isSafeInteger(maxStorageBufferBindingSize)||maxStorageBufferBindingSize<=0||!Number.isSafeInteger(maxBufferSize)||maxBufferSize<=0)return undefined;
  return {maxStorageBufferBindingSize,maxBufferSize};
}
installWorkerMessageProtocol(self,async data=>{
  if(data.command==='resource-ready'){if(!resourceReady)throw workerMessageFailure('neural-endpoint','message','unexpected-resource-ready');const resume=resourceReady;resourceReady=null;resume();return;}
 if(data.command==='execute'){if(!execute)throw workerMessageFailure('neural-endpoint','message','unexpected-execute');const resume=execute;execute=null;resume();return;}
  if(!data.runtime||typeof data.runtime!=='object'||!data.asset||!data.inputs||data.command!==undefined)throw workerMessageFailure('neural-endpoint','message','invalid-job');
  const trackingGpu=data.trackGpuMemory===true&&data.provider==='webgpu';
  const initializationStart=performance.now();let initialized=false,phase='initialization';
  const timings={modelLoadMs:0,modelReleaseMs:0,inputPreparationMs:0,inferenceMs:0,outputCopyMs:0,initializationMs:0};
  const feeds={};let outputs;
  if(['cfa','noiseprint-plus'].includes(data.runtime.executor)){
   try{
    if(!cfaModule){
     initialized=true;
     asset=data.asset;self.postMessage({phase:'model-load'});
     const loadStarted=performance.now();const [weights,program,factory]=await Promise.all([modelBytes(asset),modelBytes(asset.program),import(data.runtime.factoryUrl)]);timings.modelLoadMs=performance.now()-loadStarted;
     cfaWeights=new Float32Array(weights.buffer);cfaProgram=JSON.parse(new TextDecoder().decode(program));
     cfaModule=await factory.default({wasmMemory:allocateWasmMemory({initial:256,maximum:data.memoryMaximumBytes/65536},{label:'neural-native-heap'}),locateFile:name=>name.endsWith('.wasm')?data.runtime.wasmUrl:name});
     if(data.provider==='webgpu'){
      const gpu=await import(data.runtime.executor==='cfa'?'./cfa-gpu.js':'./noiseprint-plus-gpu.js');
      cfaGPU=await (data.runtime.executor==='cfa'?gpu.createCfaGPU():gpu.createNoiseprintPlusGPU());
     }
    }
    if(asset.sha256!==data.asset.sha256)throw Error('Worker model changed');
    timings.initializationMs=initialized?performance.now()-initializationStart:0;await waitForExecution(timings.initializationMs,cfaModule?.HEAPU8.byteLength??runtime?.heapBytes?.());phase='inference';const inferenceStarted=performance.now();
    self.postMessage({phase:'inference'});let tensor,name;
    if(data.runtime.executor==='cfa'){
     const {runCfaProgram,runCfaProgramHybrid}=await import('./cfa-program.js'),options={block:data.inputs.block.data[0],...(data.provider==='webgpu'?{acquireCpu:()=>acquireResource('cpu'),acquireGpu:()=>acquireResource('gpu'),releaseCpu:()=>self.postMessage({releaseExecution:true})}:{})};
     if(data.provider==='webgpu')tensor=await runCfaProgramHybrid(cfaModule,cfaProgram,cfaWeights,data.inputs.rgb,cfaGPU,options);
     else tensor=runCfaProgram(cfaModule,cfaProgram,cfaWeights,data.inputs.rgb,options);name='log_probabilities';
    }else{
     const options={globalHeight:data.inputs.global_height.data[0],offsetY:data.inputs.offset_y.data[0],globalWidth:data.inputs.global_width?.data[0]??data.inputs.rgb.dims[3],offsetX:data.inputs.offset_x?.data[0]??0};
     if(data.provider==='webgpu')tensor=await cfaGPU.run(cfaProgram,cfaWeights,data.inputs.rgb,options);
     else{const {runNoiseprintPlusProgram}=await import('./noiseprint-plus-program.js');tensor=runNoiseprintPlusProgram(cfaModule,cfaProgram,cfaWeights,data.inputs.rgb,options);}
     name='noiseprint';
    }
    timings.inferenceMs=performance.now()-inferenceStarted;if(tensor.data.byteLength>data.outputBytes)throw Error('Model output exceeds admitted size');
    self.postMessage({result:{[name]:tensor},timings,heapBytes:cfaModule.HEAPU8.byteLength,gpuBytes:cfaGPU?.residentBytes,provider:data.provider,runtime:{executor:data.runtime.executor+'-native-order-v1',gpu:tensor.gpu??tensor.metrics}},[tensor.data.buffer]);
  }catch(error){self.postMessage({error:serializeEngineError(neuralRuntimeError(error,{provider:data.provider,phase,heapBytes:cfaModule?.HEAPU8.byteLength??runtime?.heapBytes?.()??0,maximumBytes:data.memoryMaximumBytes}),'NEURAL_EXECUTION')});}
   return;
  }
  try{
    const queryBatch=queryBatchShape(data);
    if(trackingGpu){gpuLedger??=installGpuBufferLedger();gpuLedger?.setMaximumBytes(data.gpuMaximumBytes);}
    const incoming=(!session||neuralModelSessionIdentity(asset)!==neuralModelSessionIdentity(data.asset))?sessions.take(neuralModelSessionIdentity(data.asset)):null;
    if(session&&neuralModelSessionIdentity(asset)!==neuralModelSessionIdentity(data.asset)){
      self.postMessage({phase:'model-release'});
      for(const cached of reusable.values())cached.tensor.dispose();reusable.clear();
      const releaseStarted=performance.now(),old={session,asset,graphTransformReceipt};session=null;await sessions.put(neuralModelSessionIdentity(asset),old,asset.bytes*(data.provider==='webgpu'?3:2),data.sessionCacheBytes??0);timings.modelReleaseMs=performance.now()-releaseStarted;asset=null;graphTransformReceipt=null;runtimeLifecycle.modelSwitches++;
    }
    if(!ort){
      initialized=true;
      globalThis.__sherloqNeuralMemoryPages=data.memoryMaximumBytes/65536;
      runtime=await import(data.runtime.factoryUrl);ort=await import(data.runtime.ortUrl);
      ort.env.wasm.numThreads=data.threads;ort.env.wasm.wasmPaths={mjs:data.runtime.factoryUrl,wasm:data.runtime.wasmUrl};
      if(data.provider==='webgpu')ort.env.webgpu.powerPreference='high-performance';
      runtimeLifecycle.runtimeInitializations++;
    }
    if(!session&&incoming){session=incoming.session;asset=incoming.asset;graphTransformReceipt=incoming.graphTransformReceipt;}
    if(!session){
      initialized=true;asset=data.asset;
      self.postMessage({phase:'model-load'});
      const loadStarted=performance.now(),originalBytes=await modelBytes(asset),adaptation=await adaptNeuralScopedModel(originalBytes,asset);
      session=await ort.InferenceSession.create(adaptation.bytes,{executionProviders:[data.provider==='webgpu'&&asset.preferredLayout?{name:'webgpu',preferredLayout:asset.preferredLayout}:data.provider],graphOptimizationLevel:asset.graphOptimizationLevel??'all',enableCpuMemArena:false,enableMemPattern:false});
      graphTransformReceipt=adaptation.receipt;
      timings.modelLoadMs=performance.now()-loadStarted;runtimeLifecycle.modelInitializations++;
    }
    if(neuralModelSessionIdentity(asset)!==neuralModelSessionIdentity(data.asset))throw Error('Worker model changed');
    timings.initializationMs=initialized?performance.now()-initializationStart:0;await waitForExecution(timings.initializationMs,cfaModule?.HEAPU8.byteLength??runtime?.heapBytes?.());phase='inference';const preparationStarted=performance.now();
    for(const [name,cached]of reusable)if(!Object.hasOwn(data.reusableInputs??{},name)){cached.tensor.dispose();reusable.delete(name);}
    for(const [name,key]of Object.entries(data.reusableInputs??{})){
      let cached=reusable.get(name);
      if(cached?.key!==key){
        cached?.tensor.dispose();reusable.delete(name);const item=data.inputs[name];if(!item)throw Error('Missing immutable neural input');let tensor;
        if(data.provider==='webgpu'){
          const device=ort.env.webgpu.device,size=item.data.byteLength;if(size>device.limits.maxStorageBufferBindingSize||size>device.limits.maxBufferSize)throw new EngineError('MEMORY_LIMIT','Reusable GPU input exceeds buffer memory limit',{details:{admissionScope:'fixed',requestedBytes:size,maximumBytes:Math.min(device.limits.maxStorageBufferBindingSize,device.limits.maxBufferSize)}});
          device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');let buffer,scoped=true;
          try{buffer=device.createBuffer({size:Math.max(4,size),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});device.queue.writeBuffer(buffer,0,item.data);scoped=false;const failure=await closeGpuErrorScopes(device,{label:'reusable-neural-input',requestedBytes:size});if(failure)throw failure;tensor=ort.Tensor.fromGpuBuffer(buffer,{dataType:'float32',dims:item.dims,dispose:()=>buffer.destroy()});}catch(error){buffer?.destroy();if(scoped)throw await closeGpuErrorScopes(device,{cause:error,label:'reusable-neural-input',requestedBytes:size});throw error;}
        }else tensor=new ort.Tensor('float32',item.data,item.dims);
        cached={key,tensor};reusable.set(name,cached);
      }feeds[name]=cached.tensor;
    }
    for(const [name,item]of Object.entries(data.inputs))if(!feeds[name])feeds[name]=new ort.Tensor(item.type??'float32',item.data,item.dims);
    timings.inputPreparationMs=performance.now()-preparationStarted;self.postMessage({phase:'inference'});const inferenceStarted=performance.now();
    if(queryBatch&&trackingGpu){
      const {input,output,counts,channels,total}=queryBatch,device=ort.env.webgpu.device,bytes=channels*total*4,original=feeds[input].data;
      let assembledBuffer,scratchBuffer,readbackBuffer,mapped=false,assembled,cause;
      device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');
      try{
        assembledBuffer=device.createBuffer({size:bytes,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
        scratchBuffer=device.createBuffer({size:channels*Math.max(...counts)*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
        readbackBuffer=device.createBuffer({size:bytes,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
        let offset=0;
        for(const count of counts){
          let subInput,subOutput,subOutputs;
          try{
            const part=new Float32Array(channels*count);for(let c=0;c<channels;c++)part.set(original.subarray(c*total+offset,c*total+offset+count),c*count);
            subInput=new ort.Tensor('float32',part,[1,channels,1,count]);
            // The batch owns scratchBuffer. Tensor disposal must not destroy it
            // before the queued copy or the next identical native graph run.
            subOutput=ort.Tensor.fromGpuBuffer(scratchBuffer,{dataType:'float32',dims:[1,channels,1,count]});
            subOutputs=await session.run({...feeds,[input]:subInput},{[output]:subOutput});
            const value=subOutputs[output];
            if(value?.type!=='float32'||value.location!=='gpu-buffer'||value.gpuBuffer!==scratchBuffer||value.dims?.length!==4||value.dims[0]!==1||value.dims[1]!==channels||value.dims[2]!==1||value.dims[3]!==count)throw new EngineError('INVALID_OUTPUT','Invalid preallocated neural query output');
            const encoder=device.createCommandEncoder();for(let c=0;c<channels;c++)encoder.copyBufferToBuffer(scratchBuffer,c*count*4,assembledBuffer,(c*total+offset)*4,count*4);device.queue.submit([encoder.finish()]);offset+=count;
          }finally{for(const tensor of new Set([subInput,subOutput,...Object.values(subOutputs??{})]))tensor?.dispose();}
        }
        const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(assembledBuffer,0,readbackBuffer,0,bytes);device.queue.submit([encoder.finish()]);
        await readbackBuffer.mapAsync(GPUMapMode.READ,0,bytes);mapped=true;
        assembled=new Float32Array(channels*total);new Uint8Array(assembled.buffer).set(new Uint8Array(readbackBuffer.getMappedRange(0,bytes)));
      }catch(error){cause=error;}
      finally{
        const retire=work=>{try{work();}catch(error){cause??=error;}};
        if(mapped)retire(()=>readbackBuffer.unmap());
        for(const buffer of [readbackBuffer,scratchBuffer,assembledBuffer])if(buffer)retire(()=>buffer.destroy());
      }
      const failure=await closeGpuErrorScopes(device,{cause,label:'neural-inference',validationCode:'NEURAL_EXECUTION'});if(failure)throw failure;
      outputs={[output]:new ort.Tensor('float32',assembled,[1,channels,1,total])};
    }else if(queryBatch){
      const {input,output,counts,channels,total}=queryBatch,assembled=new Float32Array(channels*total),original=feeds[input].data;let offset=0;
      const runWindows=async()=>{
      for(const count of counts){
        let subInput,subOutputs;
        try{
          const part=new Float32Array(channels*count);
          for(let c=0;c<channels;c++)part.set(original.subarray(c*total+offset,c*total+offset+count),c*count);
          subInput=new ort.Tensor('float32',part,[1,channels,1,count]);
          const subFeeds={...feeds,[input]:subInput};
          subOutputs=await session.run(subFeeds);
          const value=subOutputs[output];
          if(value?.type!=='float32'||!(value.data instanceof Float32Array)||value.dims?.length!==4||value.dims[0]!==1||value.dims[1]!==channels||value.dims[2]!==1||value.dims[3]!==count||value.data.length!==channels*count)throw new EngineError('INVALID_OUTPUT','Invalid neural query transport batch output');
          for(let c=0;c<channels;c++)assembled.set(value.data.subarray(c*count,(c+1)*count),c*total+offset);
          offset+=count;
        }finally{subInput?.dispose();for(const tensor of Object.values(subOutputs??{}))tensor.dispose();}
      }
      };
      if(trackingGpu){
        const device=ort.env.webgpu.device;device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');let cause;
        try{await runWindows();}catch(error){cause=error;}
        const failure=await closeGpuErrorScopes(device,{cause,label:'neural-inference',validationCode:'NEURAL_EXECUTION'});if(failure)throw failure;
      }else await runWindows();
      outputs={[output]:new ort.Tensor('float32',assembled,[1,channels,1,total])};
    }else if(trackingGpu){
      const device=ort.env.webgpu.device;device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');let cause;
      try{outputs=await session.run(feeds);}catch(error){cause=error;}
      const failure=await closeGpuErrorScopes(device,{cause,label:'neural-inference',validationCode:'NEURAL_EXECUTION'});if(failure)throw failure;
    }else outputs=await session.run(feeds);
    timings.inferenceMs=performance.now()-inferenceStarted;phase='output';const outputStarted=performance.now(),{result,transfers,copiedOutputBytes}=neuralOutputTransfer(outputs,feeds,data.outputBytes);timings.outputCopyMs=performance.now()-outputStarted;
    const gpuMemory=trackingGpu?await gpuLedger?.settle():undefined;
    self.postMessage({result,timings,copiedOutputBytes,...(queryBatch?{logicalExecutions:queryBatch.counts.length}:{}),heapBytes:runtime.heapBytes(),...(trackingGpu?{gpuBytes:gpuMemory?.bufferBytes,gpuMemory,gpuDeviceLimits:actualGpuDeviceLimits()}:{}),runtime:ort.env.versions,runtimeLifecycle:{...runtimeLifecycle,sessionCache:{...sessions.snapshot(),currentHit:!!incoming}},provider:data.provider,...(graphTransformReceipt?{graphTransform:graphTransformReceipt}:{})},transfers);
  }catch(error){error=(trackingGpu?gpuLedger?.failure():null)??error;const gpuMemory=trackingGpu?gpuLedger?.snapshot():undefined;self.postMessage({...(trackingGpu?{gpuBytes:gpuMemory?.bufferBytes,gpuMemory,gpuDeviceLimits:actualGpuDeviceLimits()}:{}),error:serializeEngineError(neuralRuntimeError(error,{provider:data.provider,phase,heapBytes:cfaModule?.HEAPU8.byteLength??runtime?.heapBytes?.()??0,maximumBytes:data.memoryMaximumBytes}),'NEURAL_EXECUTION')});}
  finally{for(const [name,t]of Object.entries(feeds))if(reusable.get(name)?.tensor!==t)t.dispose();for(const t of Object.values(outputs??{}))t.dispose();}
},{label:'neural-endpoint',onFailure:error=>self.postMessage({error:serializeEngineError(error)})});
