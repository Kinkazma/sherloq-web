import {closeGpuErrorScopes} from './gpu-error-scope.js';
import {allocateTypedArray,allocateWasmMemory} from './allocation.js';
import {neuralRuntimeError} from './neural-runtime-error.js';
// The worker owns its actual ORT instance. Termination cancels initialization,
// download, CPU inference or GPU inference and destroys the model cache.
import {neuralOutputTransfer} from './neural-output-transfer.js';
import {EngineError,serializeEngineError} from './errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
const reusable=new Map();
let session,ort,runtime,asset,cfaModule,cfaProgram,cfaWeights,cfaGPU,execute,resourceReady;
function waitForExecution(initializationMs,heapBytes){
 return new Promise(resolve=>{execute=resolve;self.postMessage({executionReady:true,initializationMs,heapBytes});});
}
function acquireResource(kind){return new Promise(resolve=>{resourceReady=resolve;self.postMessage({executionResource:kind});});}
async function modelBytes(spec){
  const response=await fetch(spec.url);if(!response.ok)throw Error('Model download: '+response.status);
  const bytes=allocateTypedArray(Uint8Array,spec.bytes,{label:'neural-model-bytes'}),reader=response.body.getReader();let offset=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;if(offset+value.length>bytes.length)throw Error('Model length mismatch');bytes.set(value,offset);offset+=value.length;}}
  finally{await reader.cancel();reader.releaseLock();}
  if(offset!==bytes.length)throw Error('Model length mismatch');
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(sha!==spec.sha256)throw Error('Model identity mismatch');return bytes;
}
installWorkerMessageProtocol(self,async data=>{
  if(data.command==='resource-ready'){if(!resourceReady)throw workerMessageFailure('neural-endpoint','message','unexpected-resource-ready');const resume=resourceReady;resourceReady=null;resume();return;}
 if(data.command==='execute'){if(!execute)throw workerMessageFailure('neural-endpoint','message','unexpected-execute');const resume=execute;execute=null;resume();return;}
  if(!data.runtime||typeof data.runtime!=='object'||!data.asset||!data.inputs||data.command!==undefined)throw workerMessageFailure('neural-endpoint','message','invalid-job');
  const initializationStart=performance.now();let initialized=false,phase='initialization';
  const feeds={};let outputs;
  if(['cfa','noiseprint-plus'].includes(data.runtime.executor)){
   try{
    if(!cfaModule){
     initialized=true;
     asset=data.asset;self.postMessage({phase:'model-load'});
     const [weights,program,factory]=await Promise.all([modelBytes(asset),modelBytes(asset.program),import(data.runtime.factoryUrl)]);
     cfaWeights=new Float32Array(weights.buffer);cfaProgram=JSON.parse(new TextDecoder().decode(program));
     cfaModule=await factory.default({wasmMemory:allocateWasmMemory({initial:256,maximum:data.memoryMaximumBytes/65536},{label:'neural-native-heap'}),locateFile:name=>name.endsWith('.wasm')?data.runtime.wasmUrl:name});
     if(data.provider==='webgpu'){
      const gpu=await import(data.runtime.executor==='cfa'?'./cfa-gpu.js':'./noiseprint-plus-gpu.js');
      cfaGPU=await (data.runtime.executor==='cfa'?gpu.createCfaGPU():gpu.createNoiseprintPlusGPU());
     }
    }
    if(asset.sha256!==data.asset.sha256)throw Error('Worker model changed');
    await waitForExecution(initialized?performance.now()-initializationStart:0,cfaModule?.HEAPU8.byteLength??runtime?.heapBytes?.());phase='inference';
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
    if(tensor.data.byteLength>data.outputBytes)throw Error('Model output exceeds admitted size');
    self.postMessage({result:{[name]:tensor},heapBytes:cfaModule.HEAPU8.byteLength,gpuBytes:cfaGPU?.residentBytes,provider:data.provider,runtime:{executor:data.runtime.executor+'-native-order-v1',gpu:tensor.gpu??tensor.metrics}},[tensor.data.buffer]);
  }catch(error){self.postMessage({error:serializeEngineError(neuralRuntimeError(error,{provider:data.provider,phase,heapBytes:cfaModule?.HEAPU8.byteLength??runtime?.heapBytes?.()??0,maximumBytes:data.memoryMaximumBytes}),'NEURAL_EXECUTION')});}
   return;
  }
  try{
    if(!session){
      initialized=true;
      asset=data.asset;globalThis.__sherloqNeuralMemoryPages=data.memoryMaximumBytes/65536;
      runtime=await import(data.runtime.factoryUrl);ort=await import(data.runtime.ortUrl);
      ort.env.wasm.numThreads=data.threads;ort.env.wasm.wasmPaths={mjs:data.runtime.factoryUrl,wasm:data.runtime.wasmUrl};
      if(data.provider==='webgpu')ort.env.webgpu.powerPreference='high-performance';
      self.postMessage({phase:'model-load'});
      const bytes=await modelBytes(asset);
      session=await ort.InferenceSession.create(bytes,{executionProviders:[data.provider==='webgpu'&&asset.preferredLayout?{name:'webgpu',preferredLayout:asset.preferredLayout}:data.provider],graphOptimizationLevel:asset.graphOptimizationLevel??'all',enableCpuMemArena:false,enableMemPattern:false});
    }
    if(asset.sha256!==data.asset.sha256)throw Error('Worker model changed');
    await waitForExecution(initialized?performance.now()-initializationStart:0,cfaModule?.HEAPU8.byteLength??runtime?.heapBytes?.());phase='inference';
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
    self.postMessage({phase:'inference'});
    outputs=await session.run(feeds);
    phase='output';const {result,transfers,copiedOutputBytes}=neuralOutputTransfer(outputs,feeds,data.outputBytes);
    self.postMessage({result,copiedOutputBytes,heapBytes:runtime.heapBytes(),runtime:ort.env.versions,provider:data.provider},transfers);
  }catch(error){self.postMessage({error:serializeEngineError(neuralRuntimeError(error,{provider:data.provider,phase,heapBytes:cfaModule?.HEAPU8.byteLength??runtime?.heapBytes?.()??0,maximumBytes:data.memoryMaximumBytes}),'NEURAL_EXECUTION')});}
  finally{for(const [name,t]of Object.entries(feeds))if(reusable.get(name)?.tensor!==t)t.dispose();for(const t of Object.values(outputs??{}))t.dispose();}
},{label:'neural-endpoint',onFailure:error=>self.postMessage({error:serializeEngineError(error)})});
