import "../../runtime-context.js?v=0.14.5";
import {M3_ORT_ASSETS} from './m3-ort-assets.js';import {fetchM3Asset} from './m3-asset.js';import {RESEARCH_PREPARE_WASM} from './research-prepare-assets.js';
let ort,provider,device,factoryUrl,image,tokens,vit,hrnet,combined,producer;
self.onmessage=async({data:job})=>{
 let session;
 try{
  if(job.task==='init'){
   provider=job.provider;globalThis.__m3MaximumWasmPages=job.maximumHeapBytes/65536;const gpu=provider==='webgpu',identity=M3_ORT_ASSETS[gpu?'gpu':'cpu'];ort=await import(gpu?'../vendor/m3-ort/ort.webgpu.min.mjs':'../vendor/m3-ort/ort.wasm.min.mjs');factoryUrl=new URL(gpu?'../vendor/m3-ort/factory.asyncify.mjs':'../vendor/m3-ort/factory.mjs',import.meta.url).href;
   ort.env.wasm.wasmBinary=await fetchM3Asset(new URL(identity.path,import.meta.url),identity);ort.env.wasm.wasmPaths={mjs:factoryUrl,wasm:new URL(identity.path,import.meta.url).href};ort.env.wasm.numThreads=self.crossOriginIsolated?job.threads:1;ort.env.wasm.proxy=false;
   if(gpu){const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('WebGPU adapter unavailable');const keys=['maxStorageBufferBindingSize','maxBufferSize','maxComputeWorkgroupStorageSize','maxComputeInvocationsPerWorkgroup','maxComputeWorkgroupSizeX','maxComputeWorkgroupSizeY','maxComputeWorkgroupSizeZ','maxComputeWorkgroupsPerDimension','maxStorageBuffersPerShaderStage'];device=await adapter.requestDevice({requiredLimits:Object.fromEntries(keys.map(k=>[k,adapter.limits[k]]))});}
   if(job.features){combined=new ort.Tensor('float32',job.features,[1,4096,288]);postMessage({ready:true});return;}
   if(job.prepared){image=new ort.Tensor('float32',job.prepared,[1,3,1024,1024]);postMessage({ready:true});return;}
   const {default:create}=await import('../vendor/research-prepare/prepare.js'),prepare=await create({wasmBinary:await fetchM3Asset(new URL('../vendor/research-prepare/prepare.wasm',import.meta.url),RESEARCH_PREPARE_WASM),wasmMemory:new WebAssembly.Memory({initial:256,maximum:job.prepareHeapBytes/65536})}),ip=prepare._malloc(job.image.data.length),op=prepare._malloc(1024*1024*12);if(!ip||!op)throw Error('FOCAL preparation allocation failed');prepare.HEAPU8.set(job.image.data,ip);if(prepare._research_prepare(ip,job.image.width,job.image.height,op,1)!==1)throw Error('FOCAL preparation failed');image=new ort.Tensor('float32',prepare.HEAPF32.slice(op/4,op/4+1024*1024*3),[1,3,1024,1024]);prepare._free(ip);prepare._free(op);postMessage({ready:true});return;
  }
  const {stage,model}=job,gpu=provider==='webgpu',resident=gpu&&(stage==='embedding'||stage.startsWith('block-')),cpu=stage==='fusion'||stage==='cluster',options={executionProviders:[cpu?'wasm':gpu?{name:'webgpu',device,preferredLayout:'NCHW'}:provider],graphOptimizationLevel:'all'};if(resident)options.preferredOutputLocation={output:'gpu-buffer'};
  session=await ort.InferenceSession.create(model,options);const feeds=stage==='embedding'||stage==='hrnet'?{image}:stage==='fusion'?{vit,hrnet}:stage==='cluster'?{features:combined}:{tokens};const result=await session.run(feeds);
  if(stage==='embedding'||stage.startsWith('block-')){tokens?.dispose();tokens=result.output;}
  else if(stage==='neck'){vit=result.output;tokens.dispose();tokens=null;}
  else if(stage==='hrnet'){hrnet=result.output;image.dispose();image=null;}
  else if(stage==='fusion'){combined=result.output;vit.dispose();hrnet.dispose();vit=hrnet=null;}
  // A GPU tensor remains owned by its producing session until its consumer
  // has finished. Releasing that session first invalidates ORT buffer handles.
  await producer?.release();producer=null;
  if(resident){producer=session;session=null;}
  const {heapBytes}=await import(factoryUrl);const metadata={stage,provider:cpu?'wasm':provider,heapBytes:heapBytes(),threads:ort.env.wasm.numThreads};
  if(stage==='cluster'){
   const labels=Uint8Array.from(result.labels.data,Number),map=Float32Array.from(labels),features=combined.data.slice();for(const t of Object.values(result))t.dispose();combined.dispose();combined=null;await session.release();session=null;postMessage({map,features,metadata},[map.buffer,features.buffer]);
  }else{await session?.release();session=null;if(stage==='fusion'&&gpu){const features=combined.data.slice();combined.dispose();combined=null;postMessage({metadata,features},[features.buffer]);}else postMessage({metadata});}
 }catch(error){postMessage({error:/memory|alloc|OOM|maximum|out of bounds/i.test(String(error))?'MEMORY_LIMIT':'FOCAL_FAILED',message:String(error?.message??error)});}
 finally{await session?.release();}
};
