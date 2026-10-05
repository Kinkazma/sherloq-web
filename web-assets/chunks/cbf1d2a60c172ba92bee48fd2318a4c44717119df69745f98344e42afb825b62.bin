import "../../runtime-context.js?v=0.14.5";
import {M3_ORT_ASSETS} from './m3-ort-assets.js';import {fetchM3Asset} from './m3-asset.js';
self.onmessage=async({data:job})=>{
 let session;const tensors=[];
 try{
  const {provider,maximumHeapBytes,threads,model,inputs}=job;globalThis.__m3MaximumWasmPages=maximumHeapBytes/65536;
  const gpu=provider==='webgpu',ort=await import(gpu?'../vendor/m3-ort/ort.webgpu.min.mjs':'../vendor/m3-ort/ort.wasm.min.mjs'),identity=M3_ORT_ASSETS[gpu?'gpu':'cpu'],factoryUrl=new URL(gpu?'../vendor/m3-ort/factory.asyncify.mjs':'../vendor/m3-ort/factory.mjs',import.meta.url).href;
  ort.env.wasm.wasmBinary=await fetchM3Asset(new URL(identity.path,import.meta.url),identity);ort.env.wasm.wasmPaths={mjs:factoryUrl,wasm:new URL(identity.path,import.meta.url).href};ort.env.wasm.numThreads=self.crossOriginIsolated?threads:1;ort.env.wasm.proxy=false;
  session=await ort.InferenceSession.create(model,{executionProviders:[provider],graphOptimizationLevel:'all'});const feeds={};for(const name of session.inputNames){const input=inputs[name],t=new ort.Tensor(name==='edges'?'int64':'float32',input.data,input.shape);tensors.push(t);feeds[name]=t;}
  const output=await session.run(feeds);tensors.push(...Object.values(output));const confidence=output.confidence.data.slice(),{heapBytes}=await import(factoryUrl);const actualHeapBytes=heapBytes();if(actualHeapBytes>maximumHeapBytes)throw Error('ORT exceeded admitted memory');
  postMessage({confidence,metadata:{provider,actualHeapBytes,maximumHeapBytes,threads:ort.env.wasm.numThreads,preflightExecutions:0}},[confidence.buffer]);
 }catch(error){postMessage({error:/memory|alloc|OOM|maximum|out of bounds/i.test(String(error))?'MEMORY_LIMIT':'LEARNED_INFERENCE_FAILED',message:String(error?.message??error)});}
 finally{for(const t of tensors)t.dispose();await session?.release();}
};
