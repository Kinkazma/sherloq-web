// Actual checkpoint backbone with the pinned native float32 convolution order.
// Only source RGB and model parameters enter this executor; no oracle tensors.
import {createConvolutionCpu} from '../d2prl/convolution-cpu.js';
import {createNeuralMath} from '../d2prl/neural-math.js';
import mathFactory from '../../vendor/d2prl/neural-math.js';
import winFactory from '../../vendor/segmentation/cmseg-winograd.js';
import {requireValue,checkAbort,controlCheckpoint} from '../../src/errors.js';
export async function createCmsegBackbone({budget,graph,read,maxWorkers=10,backend='cpu'}) {
 requireValue(['cpu','webgpu'].includes(backend),'CMSeg backbone backend');
 requireValue(graph?.schema===1 && JSON.stringify(graph.inputShape)==='[1,3,512,512]' && graph.input==='rgb' && Array.isArray(graph.nodes) && graph.nodes.length===149 && graph.parameters && typeof graph.parameters==='object' && graph.outputs && JSON.stringify(Object.keys(graph.outputs))==='["bypass","x2","x3","x4","x5"]','Pinned CMSeg backbone structure required');
 for(const spec of Object.values(graph.parameters))requireValue(spec?.dtype==='float32'&&Number.isSafeInteger(spec.bytes)&&spec.bytes>0&&spec.bytes<=32*1024**2&&Array.isArray(spec.shape)&&spec.shape.length>=1&&spec.shape.length<=4&&spec.shape.every(n=>Number.isSafeInteger(n)&&n>=1&&n<=2048)&&spec.shape.reduce((n,v)=>n*v,4)===spec.bytes&&/^[a-f0-9]{64}$/.test(spec.sha256)&&spec.file==='parameters/'+spec.sha256+'.bin','Pinned backbone parameter shape and identity');
 const produced=new Set([graph.input]);
 for(const node of graph.nodes){requireValue(['Conv','BatchNormalization','Clip6','Add'].includes(node.op)&&typeof node.output==='string'&&!produced.has(node.output)&&Array.isArray(node.input)&&node.input.length===({Conv:2,BatchNormalization:5,Clip6:1,Add:2})[node.op]&&node.input.every(id=>produced.has(id)||Object.hasOwn(graph.parameters,id)),'Backbone graph dependency');produced.add(node.output);}
 requireValue(Object.values(graph.outputs).every(id=>produced.has(id)),'Backbone output dependency');
 let convolution,math,freeWin,win,busy=false,disposed=false;
 try{convolution=backend==='webgpu'?await (await import('../d2prl/convolution-general-gpu.js')).createConvolutionGeneralGpu({budget}):createConvolutionCpu({budget,maxWorkers,moduleUrl:new URL('../../vendor/d2prl/convolution.js',import.meta.url).href});math=await createNeuralMath(mathFactory,{budget});freeWin=budget.reserve(64*1024**2);win=await winFactory();requireValue(win.HEAPU8.byteLength===64*1024**2,'Bounded Winograd heap');}
 catch(error){convolution?.dispose();math?.dispose();freeWin?.();throw error;}
 async function winograd(input,weight,{padding},{signal}={}) {
  const [_,c,h,w]=input.shape,oh=h+2*padding-2,ow=w+2*padding-2,bytes=c*oh*ow*4,pointers=[];let borrowed,release,complete=false;
  const alloc=n=>{const p=win._malloc(n);requireValue(p>0,'Winograd heap admission');pointers.push(p);return p;};
  try{borrowed=budget.reserve(input.data.byteLength+weight.data.byteLength+c*4);release=budget.reserve(bytes);const src=alloc(input.data.byteLength),weights=alloc(weight.data.byteLength),bias=alloc(c*4),out=alloc(bytes);win.HEAPF32.set(input.data,src/4);win.HEAPF32.set(weight.data,weights/4);win.HEAPF32.fill(0,bias/4,bias/4+c);let stamp=performance.now();
   for(let i=0;i<c;i++){checkAbort(signal);requireValue(win._cmseg_winograd(src+i*h*w*4,weights+i*36,bias+i*4,1,h,w,padding,out+i*oh*ow*4)===1,'Winograd native domain');if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}
   const data=win.HEAPF32.slice(out/4,out/4+c*oh*ow);complete=true;return{data,shape:[1,c,oh,ow],release};
  }finally{pointers.forEach(p=>win._free(p));borrowed?.();if(!complete)release?.();}
 }
 return {async run(rgb,{signal,onProgress}={}) {
  requireValue(!busy&&!disposed&&rgb instanceof Float32Array&&rgb.length===3*512**2,'Actual prepared RGB512 input required');busy=true;
  const started=performance.now();let parameterLoadMs=0,gpuWriteBytes=0,gpuReadBytes=0,gpuPeakBufferBytes=0,gpuAllocations=0;
  const values=new Map(),uses=new Map(),add=id=>uses.set(id,(uses.get(id)??0)+1),set=(id,v)=>{requireValue(!values.has(id),'Duplicate graph node');values.set(id,v);},drop=id=>{const n=uses.get(id)-1;uses.set(id,n);if(n===0){values.get(id)?.release();values.delete(id);}};
  graph.nodes.forEach(n=>n.input.forEach(add));Object.values(graph.outputs).forEach(add);
  async function get(id){if(values.has(id))return values.get(id);const spec=graph.parameters[id];requireValue(spec&&spec.dtype==='float32'&&/^parameters\/[a-f0-9]{64}\.bin$/.test(spec.file),'Checkpoint parameter required');const temporary=budget.reserve(spec.bytes*3);let release;
   try{const loadStarted=performance.now();let bytes;try{bytes=await read(spec,{signal});}finally{parameterLoadMs+=performance.now()-loadStarted;}checkAbort(signal);requireValue(bytes instanceof Uint8Array&&bytes.byteLength===spec.bytes&&bytes.byteOffset%4===0,'Verified parameter bytes');const data=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);requireValue(data.byteLength===spec.bytes&&Array.isArray(spec.shape)&&spec.shape.every(v=>Number.isSafeInteger(v)&&v>0)&&data.length===spec.shape.reduce((n,v)=>n*v,1),'Parameter shape');release=budget.reserve(spec.bytes);const v={data,shape:spec.shape,release};set(id,v);release=null;return v;}finally{temporary();release?.();}
  }
  try{set(graph.input,{data:rgb,shape:graph.inputShape,release:budget.reserve(rgb.byteLength)});
   for(const [index,node] of graph.nodes.entries()){checkAbort(signal);const inputs=[];for(const id of node.input)inputs.push(await get(id));const a=inputs[0];let result;
    if(node.op==='Conv'){const weight=inputs[1],channels=a.shape[1],outChannels=weight.shape[0],attrs=node.attrs;requireValue(weight.shape[1]*attrs.groups===channels,'Checkpoint groups');
     if(attrs.groups===channels&&outChannels===channels&&attrs.kernel===3&&attrs.stride===1)result=await winograd(a,weight,attrs,{signal});
     else {const free=budget.reserve(outChannels*4);try{
      const outputBytes=outChannels*(Math.floor((a.shape[2]+2*attrs.padding-attrs.kernel)/attrs.stride)+1)*(Math.floor((a.shape[3]+2*attrs.padding-attrs.kernel)/attrs.stride)+1)*4;
      const writeBytes=a.data.byteLength+weight.data.byteLength+outChannels*4+72,bufferBytes=writeBytes+2*outputBytes;
      if(backend==='webgpu')requireValue(bufferBytes<=64*1024**2,'CMSeg explicit GPU buffer ceiling');
      result=await convolution.run({input:a.data,weights:weight.data,bias:new Float32Array(outChannels),channels,height:a.shape[2],width:a.shape[3],outChannels,...attrs,hasBias:false},{signal,onSubmitted:()=>onProgress?.({phase:'cmseg-backbone-gpu',layer:node.name})});
      if(backend==='webgpu'){gpuWriteBytes+=writeBytes;gpuReadBytes+=outputBytes;gpuPeakBufferBytes=Math.max(gpuPeakBufferBytes,bufferBytes);gpuAllocations+=7;}
     }finally{free();}}
    }else if(node.op==='Clip6'){const release=budget.reserve(a.data.byteLength);try{const data=new Float32Array(a.data.length);let stamp=performance.now();for(let i=0;i<data.length;i++){data[i]=Math.min(6,Math.max(0,a.data[i]));if((i&65535)===0&&performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}result={data,shape:[...a.shape],release};}catch(e){release();throw e;}}
    else result=await math.run(node.op,inputs,node.attrs,{signal});
    set(node.output,result);onProgress?.({phase:'backbone',completed:index+1,total:graph.nodes.length,layer:node.name});checkAbort(signal);node.input.forEach(drop);
   }
   const output={},shapes={bypass:[1,16,256,256],x2:[1,24,128,128],x3:[1,32,64,64],x4:[1,96,32,32],x5:[1,1280,16,16]};for(const [key,id]of Object.entries(graph.outputs))requireValue(JSON.stringify(values.get(id)?.shape)===JSON.stringify(shapes[key]),'Native backbone output shape');for(const [key,id]of Object.entries(graph.outputs)){output[key]=values.get(id);values.delete(id);}return{values:output,...(backend==='webgpu'?{gpu:{devices:1,allocations:gpuAllocations,peakAccountedBytes:gpuPeakBufferBytes,accounting:'explicit GPU buffers; excludes driver/compiler residency',errors:[]}}:{}),timings:{parameterLoadMs,executionMs:performance.now()-started-parameterLoadMs,gpuWriteBytes,gpuReadBytes},release:()=>Object.values(output).forEach(v=>v.release())};
  }finally{values.forEach(v=>v.release());convolution.releaseIdleWorkers?.();busy=false;}
 },dispose(){requireValue(!busy,'Backbone busy');if(disposed)return;disposed=true;convolution.dispose();math.dispose();win=null;freeWin();}};
}
