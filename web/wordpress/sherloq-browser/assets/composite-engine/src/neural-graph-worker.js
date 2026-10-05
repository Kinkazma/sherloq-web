// The worker owns its actual ORT instance. Termination cancels initialization,
// download, CPU inference or GPU inference and destroys the model cache.
const reusable=new Map();
let session,ort,runtime,asset,cfaModule,cfaProgram,cfaWeights,cfaGPU;
async function modelBytes(spec){
  const response=await fetch(spec.url);if(!response.ok)throw Error('Model download: '+response.status);
  const bytes=new Uint8Array(spec.bytes),reader=response.body.getReader();let offset=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;if(offset+value.length>bytes.length)throw Error('Model length mismatch');bytes.set(value,offset);offset+=value.length;}}
  finally{await reader.cancel();reader.releaseLock();}
  if(offset!==bytes.length)throw Error('Model length mismatch');
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(sha!==spec.sha256)throw Error('Model identity mismatch');return bytes;
}
self.onmessage=async({data})=>{
  const feeds={};let outputs;
  if(['cfa','noiseprint-plus'].includes(data.runtime.executor)){
   try{
    if(!cfaModule){
     asset=data.asset;self.postMessage({phase:'model-load'});
     const [weights,program,factory]=await Promise.all([modelBytes(asset),modelBytes(asset.program),import(data.runtime.factoryUrl)]);
     cfaWeights=new Float32Array(weights.buffer);cfaProgram=JSON.parse(new TextDecoder().decode(program));
     cfaModule=await factory.default({wasmMemory:new WebAssembly.Memory({initial:256,maximum:data.memoryMaximumBytes/65536}),locateFile:name=>name.endsWith('.wasm')?data.runtime.wasmUrl:name});
    }
    if(asset.sha256!==data.asset.sha256)throw Error('Worker model changed');
    self.postMessage({phase:'inference'});let tensor,name;
    if(data.runtime.executor==='cfa'){
     const {runCfaProgram,runCfaProgramHybrid}=await import('./cfa-program.js'),options={block:data.inputs.block.data[0]};
     if(data.provider==='webgpu'){const {createCfaGPU}=await import('./cfa-gpu.js');cfaGPU??=await createCfaGPU();tensor=await runCfaProgramHybrid(cfaModule,cfaProgram,cfaWeights,data.inputs.rgb,cfaGPU,options);}
     else tensor=runCfaProgram(cfaModule,cfaProgram,cfaWeights,data.inputs.rgb,options);name='log_probabilities';
    }else{
     const options={globalHeight:data.inputs.global_height.data[0],offsetY:data.inputs.offset_y.data[0],globalWidth:data.inputs.global_width?.data[0]??data.inputs.rgb.dims[3],offsetX:data.inputs.offset_x?.data[0]??0};
     if(data.provider==='webgpu'){const {createNoiseprintPlusGPU}=await import('./noiseprint-plus-gpu.js');cfaGPU??=await createNoiseprintPlusGPU();tensor=await cfaGPU.run(cfaProgram,cfaWeights,data.inputs.rgb,options);}
     else{const {runNoiseprintPlusProgram}=await import('./noiseprint-plus-program.js');tensor=runNoiseprintPlusProgram(cfaModule,cfaProgram,cfaWeights,data.inputs.rgb,options);}
     name='noiseprint';
    }
    if(tensor.data.byteLength>data.outputBytes)throw Error('Model output exceeds admitted size');
    self.postMessage({result:{[name]:tensor},heapBytes:cfaModule.HEAPU8.byteLength,provider:data.provider,runtime:{executor:data.runtime.executor+'-native-order-v1'}},[tensor.data.buffer]);
   }catch(error){const message=String(error?.message??error);self.postMessage({error:{code:/Model (identity|length)/.test(message)?'MODEL_IDENTITY':/memory|alloc/i.test(message)?'MEMORY_ALLOCATION':'NEURAL_EXECUTION',message}});}
   return;
  }
  try{
    if(!session){
      asset=data.asset;globalThis.__sherloqNeuralMemoryPages=data.memoryMaximumBytes/65536;
      runtime=await import(data.runtime.factoryUrl);ort=await import(data.runtime.ortUrl);
      ort.env.wasm.numThreads=data.threads;ort.env.wasm.wasmPaths={mjs:data.runtime.factoryUrl,wasm:data.runtime.wasmUrl};
      if(data.provider==='webgpu')ort.env.webgpu.powerPreference='high-performance';
      self.postMessage({phase:'model-load'});
      const bytes=await modelBytes(asset);
      session=await ort.InferenceSession.create(bytes,{executionProviders:[data.provider==='webgpu'&&asset.preferredLayout?{name:'webgpu',preferredLayout:asset.preferredLayout}:data.provider],graphOptimizationLevel:asset.graphOptimizationLevel??'all',enableCpuMemArena:false,enableMemPattern:false});
    }
    if(asset.sha256!==data.asset.sha256)throw Error('Worker model changed');
    for(const [name,key]of Object.entries(data.reusableInputs??{})){
      let cached=reusable.get(name);
      if(cached?.key!==key){
        cached?.tensor.dispose();reusable.delete(name);const item=data.inputs[name];if(!item)throw Error('Missing immutable neural input');let tensor;
        if(data.provider==='webgpu'){
          const device=ort.env.webgpu.device,size=item.data.byteLength;if(size>device.limits.maxStorageBufferBindingSize||size>device.limits.maxBufferSize)throw Error('Reusable GPU input exceeds buffer memory limit');
          const buffer=device.createBuffer({size:Math.max(4,size),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
          try{device.queue.writeBuffer(buffer,0,item.data);tensor=ort.Tensor.fromGpuBuffer(buffer,{dataType:'float32',dims:item.dims,dispose:()=>buffer.destroy()});}catch(e){buffer.destroy();throw e;}
        }else tensor=new ort.Tensor('float32',item.data,item.dims);
        cached={key,tensor};reusable.set(name,cached);
      }feeds[name]=cached.tensor;
    }
    for(const [name,item]of Object.entries(data.inputs))if(!feeds[name])feeds[name]=new ort.Tensor(item.type??'float32',item.data,item.dims);
    self.postMessage({phase:'inference'});
    outputs=await session.run(feeds);
    const result={},transfers=[];let bytes=0;
    for(const [name,t]of Object.entries(outputs)){
      bytes+=t.data.byteLength;if(bytes>data.outputBytes)throw Error('Model output exceeds admitted size');
      const values=t.data.slice();result[name]={data:values,dims:[...t.dims],type:t.type};transfers.push(values.buffer);
    }
    self.postMessage({result,heapBytes:runtime.heapBytes(),runtime:ort.env.versions,provider:data.provider},transfers);
  }catch(error){const message=String(error?.message??error);self.postMessage({error:{code:/Model (identity|length)/.test(message)?'MODEL_IDENTITY':/bad_alloc|out of memory|memory allocation/i.test(message)?'MEMORY_ALLOCATION':'NEURAL_EXECUTION',message}});}
  finally{for(const [name,t]of Object.entries(feeds))if(reusable.get(name)?.tensor!==t)t.dispose();for(const t of Object.values(outputs??{}))t.dispose();}
};
