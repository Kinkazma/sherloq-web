import {wasmAllocationFailure,copyTypedArray} from './allocation.js';
import {serializeEngineError} from './errors.js';
import {M3_ORT_ASSETS} from './m3-ort-assets.js';
import {SPARSE_EXTRACT_WASM} from './sparse-extract-assets.js';
import {boundWasmMemory} from './wasm-memory-limit.js';
import {fetchM3Asset} from './m3-asset.js';
import {runAliked} from './aliked-worker.js';
import {roundEven} from './pixel-utils.js';
const MiB=1024**2;
self.onmessage=async({data:job})=>{
 let session,maskModule,maskPointer=0,polyPointer=0;const tensors=[];
 try{
  const {image,regions,excluded,limit,maximumHeapBytes,provider,model,threads}=job,n=image.width*image.height;
  const {default:createMasks}=await import('../vendor/sparse-extract/sparse-extract.js');
  const maskWasm=await fetchM3Asset(new URL('../vendor/sparse-extract/sparse-extract.wasm',import.meta.url),SPARSE_EXTRACT_WASM);
  maskModule=await createMasks({wasmBinary:boundWasmMemory(maskWasm,job.maskHeapBytes),print(){},printErr(){}});
  const alloc=bytes=>{const p=maskModule._malloc(Math.max(8,bytes));if(!p)throw wasmAllocationFailure(maskModule,'Mask memory allocation failed',Math.max(8,bytes));return p;};maskPointer=alloc(n);polyPointer=alloc(Math.max(1,...[...regions,...excluded].map(p=>p.length))*8);
  const draw=(polys,value)=>{for(const polygon of polys){const xy=Int32Array.from(polygon.flat(),roundEven);maskModule.HEAPU8.set(new Uint8Array(xy.buffer),polyPointer);if(!maskModule._sparse_polygon(maskPointer,image.width,image.height,polyPointer,polygon.length,value))throw Error('Native mask rasterization failed');}};
  maskModule.HEAPU8.fill(regions.length?0:255,maskPointer,maskPointer+n);draw(regions,255);draw(excluded,0);const mask=copyTypedArray(maskModule.HEAPU8.subarray(maskPointer,maskPointer+n),{label:'learned-feature-worker-output'});
  postMessage({progress:{phase:'learned-input',fraction:.1}});
  globalThis.__m3MaximumWasmPages=maximumHeapBytes/65536;
  const gpu=provider==='webgpu',ort=await import(gpu?'../vendor/m3-ort/ort.webgpu.min.mjs':'../vendor/m3-ort/ort.wasm.min.mjs'),identity=M3_ORT_ASSETS[gpu?'gpu':'cpu'];
  const wasm=await fetchM3Asset(new URL(identity.path,import.meta.url),identity);ort.env.wasm.wasmBinary=wasm;
  const factoryUrl=new URL(gpu?'../vendor/m3-ort/factory.asyncify.mjs':'../vendor/m3-ort/factory.mjs',import.meta.url).href;
  ort.env.wasm.wasmPaths={mjs:factoryUrl,wasm:new URL(identity.path,import.meta.url).href};ort.env.wasm.numThreads=self.crossOriginIsolated?threads:1;ort.env.wasm.proxy=false;
  const membership=points=>{const count=points.length/7,zoneCount=Math.max(1,regions.length),members=new Uint8Array(count*zoneCount);if(!regions.length)members.fill(1);else for(let z=0;z<zoneCount;z++){maskModule.HEAPU8.fill(0,maskPointer,maskPointer+n);draw([regions[z]],255);for(let i=0;i<count;i++){const x=Math.max(0,Math.min(image.width-1,roundEven(points[i*7]))),y=Math.max(0,Math.min(image.height-1,roundEven(points[i*7+1])));members[i*zoneCount+z]=+(maskModule.HEAPU8[maskPointer+y*image.width+x]>0);}}return members;};
  let result;
  if(job.family==='XFeat'){
   const inputImage=new Float32Array(n*3);for(let i=0;i<n;i++)for(let c=0;c<3;c++)inputImage[c*n+i]=image.data[i*3+2-c];
  session=await ort.InferenceSession.create(model,{executionProviders:[provider],graphOptimizationLevel:'all'});
  const tensor=(...args)=>{const t=new ort.Tensor(...args);tensors.push(t);return t;};
  const inputs={image:tensor('float32',inputImage,[1,3,image.height,image.width]),mask:tensor('uint8',mask,[image.height,image.width]),limit:tensor('int64',BigInt64Array.of(BigInt(limit)),[]),scales:tensor('float32',Float32Array.of(image.width/(Math.floor(image.width/32)*32),image.height/(Math.floor(image.height/32)*32)),[2])};
  const output=await session.run(inputs);tensors.push(...Object.values(output));postMessage({progress:{phase:'learned-output',fraction:.9}});
  const coords=output.keypoints.data,scores=output.scores.data,desc=output.descriptors.data,count=scores.length,zoneCount=Math.max(1,regions.length);
  if(coords.length!==count*2||desc.length!==count*64||count>limit)throw Error('Invalid XFeat output shape');
  const order=Array.from({length:count},(_,i)=>i).sort((a,b)=>coords[a*2+1]-coords[b*2+1]||coords[a*2]-coords[b*2]||a-b),points=new Float64Array(count*7),descriptors=new Float32Array(count*64);
  order.forEach((id,i)=>{points.set([coords[id*2],coords[id*2+1],8,-1,scores[id],0,-1],i*7);descriptors.set(desc.subarray(id*64,(id+1)*64),i*64);});
  result={points,descriptors,members:membership(points),zoneCount,descriptorSize:64,totalFeatures:count};
  }else result=await runAliked(ort,job,mask,membership);
  const {points,descriptors,members}=result;
  const {heapBytes}=await import(factoryUrl);const actualHeapBytes=heapBytes();if(actualHeapBytes>maximumHeapBytes)throw Error('ORT exceeded admitted memory');
  await session?.release();session=null;for(const t of tensors.splice(0))t.dispose();maskModule._free(maskPointer);maskModule._free(polyPointer);maskPointer=polyPointer=0;
  postMessage({...result,metadata:{family:job.family,provider,execution:gpu?'webgpu-with-cpu-fallback-nodes':'wasm',threads:ort.env.wasm.numThreads,actualHeapBytes,maximumHeapBytes,maskHeapBytes:maskModule.HEAPU8.byteLength,preflightExecutions:0,qualification:'native-floating-arithmetic-differences-measured'}},[points.buffer,descriptors.buffer,members.buffer]);
 }catch(error){postMessage({error:serializeEngineError(error,'LEARNED_INFERENCE_FAILED')});}
 finally{for(const t of tensors)t.dispose();await session?.release();if(maskModule){if(maskPointer)maskModule._free(maskPointer);if(polyPointer)maskModule._free(polyPointer);}}
};
