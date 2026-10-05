import {M3_ORT_ASSETS} from './m3-ort-assets.js';
import {fetchM3Asset} from './m3-asset.js';
let ort,session,maximumHeapBytes,provider,factoryUrl;
self.onmessage=async({data:job})=>{
 const tensors=[];
 try{
  if(!session){
   ({maximumHeapBytes,provider}=job);globalThis.__m3MaximumWasmPages=maximumHeapBytes/65536;const gpu=provider==='webgpu',identity=M3_ORT_ASSETS[gpu?'gpu':'cpu'];
   ort=await import(gpu?'../vendor/m3-ort/ort.webgpu.min.mjs':'../vendor/m3-ort/ort.wasm.min.mjs');ort.env.wasm.wasmBinary=await fetchM3Asset(new URL(identity.path,import.meta.url),identity);
   factoryUrl=new URL(gpu?'../vendor/m3-ort/factory.asyncify.mjs':'../vendor/m3-ort/factory.mjs',import.meta.url).href;ort.env.wasm.wasmPaths={mjs:factoryUrl,wasm:new URL(identity.path,import.meta.url).href};ort.env.wasm.numThreads=self.crossOriginIsolated?job.threads:1;ort.env.wasm.proxy=false;
   session=await ort.InferenceSession.create(job.model,{executionProviders:[provider],graphOptimizationLevel:'all'});
  }
  const {width,height,core}=job,input=new ort.Tensor('float32',job.input,[1,1,height,width]);tensors.push(input);const output=await session.run({normalized:input});tensors.push(...Object.values(output));
  const [x,y,w,h]=core,heat=new Float32Array(w*h),dense=new Float32Array(w*h),reliability=new Float32Array(w*h/64),fw=width/8,fh=height/8,cw=w/8,ch=h/8;
  for(let yy=0;yy<h;yy++)heat.set(output.heat.data.subarray((y+yy)*width+x,(y+yy)*width+x+w),yy*w);
  for(let yy=0;yy<ch;yy++)for(let xx=0;xx<cw;xx++){const from=(y/8+yy)*fw+x/8+xx,to=yy*cw+xx;reliability[to]=output.reliability.data[from];for(let c=0;c<64;c++)dense[to*64+c]=output.features.data[c*fw*fh+from];}
  const {heapBytes}=await import(factoryUrl);postMessage({heat,dense,reliability,actualHeapBytes:heapBytes(),provider},[heat.buffer,dense.buffer,reliability.buffer]);
 }catch(error){postMessage({error:/memory|alloc|OOM|maximum|out of bounds/i.test(String(error))?'MEMORY_LIMIT':'LEARNED_INFERENCE_FAILED',message:String(error?.message??error)});}
 finally{for(const t of tensors)t.dispose();}
};
