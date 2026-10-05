import "../../runtime-context.js?v=0.14.5";
import {serializeEngineError} from './errors.js';
import {M3_ORT_ASSETS} from './m3-ort-assets.js';
import {fetchM3Asset} from './m3-asset.js';
import {PagedGlueAttention,glueCSR} from './sparse-glue-paged-attention.js';
self.onmessage=async({data:job})=>{
 let attention;const start=performance.now();
 try{
  const {provider,maximumHeapBytes,threads,model,inputs,edges}=job;globalThis.__m3MaximumWasmPages=maximumHeapBytes/65536;
  const gpu=provider==='webgpu',ort=await import(gpu?'../vendor/m3-ort/ort.webgpu.min.mjs':'../vendor/m3-ort/ort.wasm.min.mjs'),identity=M3_ORT_ASSETS[gpu?'gpu':'cpu'],factoryUrl=new URL(gpu?'../vendor/m3-ort/factory.asyncify.mjs':'../vendor/m3-ort/factory.mjs',import.meta.url).href;
  ort.env.wasm.wasmBinary=await fetchM3Asset(new URL(identity.path,import.meta.url),identity);ort.env.wasm.wasmPaths={mjs:factoryUrl,wasm:new URL(identity.path,import.meta.url).href};ort.env.wasm.numThreads=self.crossOriginIsolated?threads:1;ort.env.wasm.proxy=false;
  const size=new DataView(model.buffer,model.byteOffset,4).getUint32(0,true),manifest=JSON.parse(new TextDecoder().decode(model.subarray(4,4+size))),stages=new Map(manifest.stages.map(s=>[s.name,model.subarray(4+size+s.offset,4+size+s.offset+s.bytes)]));
  const tensor=(data,dims)=>({data,dims}),run=async(name,sides)=>{let session;try{session=await ort.InferenceSession.create(stages.get(name),{executionProviders:[provider],graphOptimizationLevel:'all'});const results=[];for(const side of sides){const tensors=[],feeds={};try{for(const key of session.inputNames){const t=new ort.Tensor('float32',side[key].data,side[key].dims);tensors.push(t);feeds[key]=t;}const outputs=await session.run(feeds);tensors.push(...Object.values(outputs));results.push(Object.fromEntries(Object.entries(outputs).map(([k,t])=>[k,tensor(t.data.slice(),t.dims)])));}finally{for(const t of tensors)t.dispose();}}return results;}finally{await session?.release();}};
  const n=inputs.keypoints0.shape[0],m=inputs.keypoints1.shape[0],csr0=glueCSR(edges,n,0),csr1=glueCSR(edges,m,1),shapeInput=name=>tensor(inputs[name].data,inputs[name].shape),prepare=[0,1].map(side=>({keypoints:shapeInput('keypoints'+side),descriptors:shapeInput('descriptors'+side),scaleOri:shapeInput('scaleOri'+side),imageSize:shapeInput('imageSize')}));
  let sides=await run('prepare',prepare);attention=await new PagedGlueAttention().open(provider);
  for(let layer=0;layer<manifest.layers;layer++){
   const self=await run('self-'+layer,sides.map(s=>({x:s.x,cos:s.cos,sin:s.sin}))),contexts=[];
   contexts.push(await attention.attention(self[0].q.data,self[1].q.data,self[1].v.data,csr0,manifest.heads,manifest.dim/manifest.heads));contexts.push(await attention.attention(self[1].q.data,self[0].q.data,self[0].v.data,csr1,manifest.heads,manifest.dim/manifest.heads));
   const finished=await run('finish-'+layer,self.map((s,i)=>({x:s.next,context:tensor(contexts[i],[manifest.heads,i?m:n,manifest.dim/manifest.heads])})));sides=sides.map((s,i)=>({...s,x:finished[i].next}));postMessage({progress:(layer+1)/(manifest.layers+1),layer});
  }
  const last=await run('final',sides.map(s=>({x:s.x}))),confidence=await attention.assignment(last[0].projected.data,last[1].projected.data,last[0].matchability.data,last[1].matchability.data,edges,csr0,csr1),{heapBytes}=await import(factoryUrl);if(!confidence.every(Number.isFinite))throw Error('Nonfinite paged confidence');
  let maximumConfidence=0;const above={point1:0,point3:0,point7:0,point9:0};for(const c of confidence){maximumConfidence=Math.max(maximumConfidence,c);above.point1+=c>=.1;above.point3+=c>=.3;above.point7+=c>=.7;above.point9+=c>=.9;}postMessage({confidence,metadata:{provider,execution:'native-layers-global-csr-row-pages',actualHeapBytes:heapBytes(),attentionHeapBytes:attention.cpu.HEAPU8.byteLength,maximumHeapBytes,threads:ort.env.wasm.numThreads,totalMs:performance.now()-start,maximumConfidence,above,...attention.metrics}},[confidence.buffer]);
 }catch(error){postMessage({error:serializeEngineError(error,'LEARNED_INFERENCE_FAILED')});}
 finally{attention?.dispose();}
};
