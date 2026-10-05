import "../../runtime-context.js?v=0.14.5";
import {M3_ORT_ASSETS} from './m3-ort-assets.js';import {fetchM3Asset} from './m3-asset.js';import {prepareAdaifl} from './adaifl-prepare.js';
let ort,provider,device,factoryUrl,image,tokens,producer;const features=[],owners=[],saved=new Set();
self.onmessage=async({data:job})=>{
 let session;
 try{
  if(job.task==='init'){
   provider=job.provider;globalThis.__m3MaximumWasmPages=job.maximumHeapBytes/65536;const gpu=provider==='webgpu',identity=M3_ORT_ASSETS[gpu?'gpu':'cpu'];ort=await import(gpu?'../vendor/m3-ort/ort.webgpu.min.mjs':'../vendor/m3-ort/ort.wasm.min.mjs');factoryUrl=new URL(gpu?'../vendor/m3-ort/factory.asyncify.mjs':'../vendor/m3-ort/factory.mjs',import.meta.url).href;
   ort.env.wasm.wasmBinary=await fetchM3Asset(new URL(identity.path,import.meta.url),identity);ort.env.wasm.wasmPaths={mjs:factoryUrl,wasm:new URL(identity.path,import.meta.url).href};ort.env.wasm.numThreads=self.crossOriginIsolated?job.threads:1;ort.env.wasm.proxy=false;
   if(gpu){const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('WebGPU adapter unavailable');const keys=['maxStorageBufferBindingSize','maxBufferSize','maxComputeWorkgroupStorageSize','maxComputeInvocationsPerWorkgroup','maxComputeWorkgroupSizeX','maxComputeWorkgroupSizeY','maxComputeWorkgroupSizeZ','maxComputeWorkgroupsPerDimension','maxStorageBuffersPerShaderStage'];device=await adapter.requestDevice({requiredLimits:Object.fromEntries(keys.map(k=>[k,adapter.limits[k]]))});}
   image=new ort.Tensor('float32',job.prepared??prepareAdaifl(job.image),[1,3,1024,1024]);postMessage({ready:true});return;
  }
  const {stage,model}=job,gpu=provider==='webgpu',options={executionProviders:[gpu?{name:'webgpu',device,preferredLayout:'NCHW'}:'wasm'],graphOptimizationLevel:'all'};if(gpu&&stage!=='decoder')options.preferredOutputLocation={output:'gpu-buffer'};
  session=await ort.InferenceSession.create(model,options);const feeds=stage==='embedding'?{image}:stage==='decoder'?Object.fromEntries(['a','b','c','d'].map((k,i)=>[k,features[i]])):{tokens},result=await session.run(feeds);
  if(tokens&&!saved.has(tokens))tokens.dispose();if(producer&&!owners.includes(producer))await producer.release();producer=null;
  if(stage==='embedding'){image.dispose();image=null;}
  const {heapBytes}=await import(factoryUrl),metadata={stage,provider,heapBytes:heapBytes(),threads:ort.env.wasm.numThreads};
  if(stage==='decoder'){
   const map=result.output.data.slice(),mask=Uint8Array.from(map,v=>v>.5?1:0);result.output.dispose();for(const t of features)t.dispose();for(const s of owners)await s.release();await session.release();session=null;postMessage({map,mask,metadata},[map.buffer,mask.buffer]);
  }else{
   tokens=result.output;if(gpu){producer=session;session=null;}
   if(['block-02','block-05','block-08','block-11'].includes(stage)){features.push(tokens);saved.add(tokens);if(producer)owners.push(producer);}
   await session?.release();session=null;postMessage({metadata});
  }
 }catch(error){postMessage({error:/memory|alloc|OOM|maximum|out of bounds/i.test(String(error))?'MEMORY_LIMIT':'ADAIFL_FAILED',message:String(error?.message??error)});}
 finally{await session?.release();}
};
