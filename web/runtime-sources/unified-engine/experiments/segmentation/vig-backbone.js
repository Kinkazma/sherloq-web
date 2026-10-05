// Actual VIG checkpoint, native arithmetic and useful convolution jobs.
// Source RGB and verified checkpoint parameters are the only inference inputs.
import factory from '../../vendor/segmentation/vig-math.js';
import {createVigConvolution} from './vig-convolution.js';
import {requireValue,checkAbort,controlCheckpoint,EngineError} from '../../src/errors.js';
const HEAP=64*1024**2,STAGING=96*1024**2;
export function vigStructure(){
 const parameters={pos_embed:[1,640,16,16]},modules={},knn=[];
 const conv=(name,ci,co,k=1,pad=0,stride=1,groups=1)=>{modules[name]={kind:'Conv',ci,co,k,pad,stride,groups};parameters[name+'.weight']=[co,ci/groups,k,k];parameters[name+'.bias']=[co];};
 const bn=(name,c)=>{modules[name]={kind:'BN',epsilon:1e-5};for(const key of ['weight','bias','running_mean','running_var'])parameters[name+'.'+key]=[c];};
 const gelu=name=>{modules[name]={kind:'GELU'};};
 const channels=[3,80,160,320,640,640];for(let i=0;i<5;i++){conv('stem.convs.'+(i*3),channels[i],channels[i+1],3,1,i<4?2:1);bn('stem.convs.'+(i*3+1),channels[i+1]);if(i<4)gelu('stem.convs.'+(i*3+2));}
 for(let i=0;i<16;i++){
  const p='backbone.'+i+'.0',f='backbone.'+i+'.1';conv(p+'.fc1.0',640,640);bn(p+'.fc1.1',640);conv(p+'.graph_conv.gconv.nn.0',1280,1280,1,0,1,4);bn(p+'.graph_conv.gconv.nn.1',1280);gelu(p+'.graph_conv.gconv.nn.2');conv(p+'.fc2.0',1280,640);bn(p+'.fc2.1',640);
  conv(f+'.fc1.0',640,2560);bn(f+'.fc1.1',2560);gelu(f+'.act');conv(f+'.fc2.0',2560,640);bn(f+'.fc2.1',640);knn.push({k:Math.floor(9+9*i/15),dilation:Math.floor(i/4)+1});
 }
 return{parameters,modules,knn};
}
export function validateVigBackbone(graph){
 requireValue(graph?.schema===1&&graph.kind==='vig-native-order-v1'&&JSON.stringify(graph.inputShape)==='[1,3,256,256]'&&graph.parameters&&graph.modules,'Pinned VIG backbone');
 const expected=vigStructure();requireValue(Object.keys(graph.parameters).length===511&&JSON.stringify(graph.modules)===JSON.stringify(expected.modules)&&JSON.stringify(graph.knn)===JSON.stringify(expected.knn),'Pinned VIG architecture');
 for(const[name,shape]of Object.entries(expected.parameters)){const p=graph.parameters[name];requireValue(p?.dtype==='float32'&&JSON.stringify(p.shape)===JSON.stringify(shape)&&p.bytes===shape.reduce((n,v)=>n*v,4)&&/^[a-f0-9]{64}$/.test(p.sha256)&&p.file==='parameters/'+p.sha256+'.bin','VIG parameter identity: '+name);}
}
export async function createVigBackbone({budget,graph,read,maxWorkers=1,backend='cpu'}){
 validateVigBackbone(graph);requireValue(budget?.reserve&&typeof read==='function'&&['cpu','webgpu'].includes(backend),'VIG parameter reader and budget');let pool,module,freeHeap,busy=false,disposed=false;
 try{pool=backend==='webgpu'?await (await import('./vig-convolution-gpu.js')).createVigConvolutionGpu({budget}):createVigConvolution({budget,maxWorkers});freeHeap=budget.reserve(HEAP);module=await factory();requireValue(module.HEAPU8.length===HEAP,'VIG bounded math heap');}catch(e){pool?.dispose();freeHeap?.();throw e;}
 return{
  async run(input,{signal,onProgress}={}){
   if(busy)throw new EngineError('BUSY','VIG backbone busy');requireValue(!disposed&&input instanceof Float32Array&&input.length===3*256**2&&input.every(Number.isFinite),'Prepared VIG RGB');checkAbort(signal);busy=true;
   let staging,release,complete=false,workers=0,parameterLoadMs=0,graphDistanceMs=0,gpuWriteBytes=0,gpuReadBytes=0,gpuPeakBufferBytes=0,gpuAllocations=0,stamp=performance.now();const started=stamp;
   const checkpoint=async()=>{checkAbort(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}};
   const parameter=async name=>{checkAbort(signal);const spec=graph.parameters[name],at=performance.now();let bytes;try{bytes=await read(spec,{signal});}finally{parameterLoadMs+=performance.now()-at;}checkAbort(signal);requireValue(bytes instanceof Uint8Array&&bytes.byteLength===spec.bytes&&bytes.byteOffset%4===0,'Verified VIG parameter bytes');const a=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);requireValue(a.every(Number.isFinite),'Finite VIG parameters');return a;};
   const math=async(arrays,length,fn)=>{const pointers=[],put=n=>{const p=module._malloc(n);requireValue(p>0,'VIG math admission');pointers.push(p);return p;};try{const inputs=arrays.map(a=>{const p=put(a.byteLength);module.HEAPF32.set(a,p/4);return p;}),out=put(length*4);await fn(inputs,out,put);checkAbort(signal);const result=module.HEAPF32.slice(out/4,out/4+length);await checkpoint();return result;}finally{pointers.forEach(p=>module._free(p));}};
   const op=async(name,a)=>{
    const m=graph.modules[name],plane=a.h*a.w;let data;
    if(m.kind==='Conv'){
     const weight=await parameter(name+'.weight'),bias=await parameter(name+'.bias'),result=await pool.run({input:a.data,weight,bias,geometry:[m.ci,a.h,a.w,m.co,m.k,m.pad,m.stride,m.groups]},{signal,onProgress:p=>onProgress?.({...p,layer:name})});
     try{workers=Math.max(workers,result.workers);gpuWriteBytes+=result.timings?.gpuWriteBytes??0;gpuReadBytes+=result.timings?.gpuReadBytes??0;gpuPeakBufferBytes=Math.max(gpuPeakBufferBytes,result.gpu?.peakAccountedBytes??0);gpuAllocations+=result.gpu?.allocations??0;data=result.data;}finally{result.release();}
     a={data,c:m.co,h:Math.floor((a.h+2*m.pad-m.k)/m.stride)+1,w:Math.floor((a.w+2*m.pad-m.k)/m.stride)+1};
    }else if(m.kind==='BN'){
     const arrays=[a.data];for(const key of ['weight','bias','running_mean','running_var'])arrays.push(await parameter(name+'.'+key));
     data=await math(arrays,a.data.length,async([x,g,b,mean,v],out,put)=>{const temp=put(a.c*8);for(let off=0;off<a.c;off+=640){const count=Math.min(640,a.c-off);requireValue(module._d2prl_batchnorm_parameters(mean+off*4,v+off*4,g+off*4,b+off*4,count,1e-5,temp+off*4,temp+(a.c+off)*4)===1,'VIG batch norm');requireValue(module._d2prl_affine(x+off*plane*4,temp+off*4,temp+(a.c+off)*4,count,plane,0,out+off*plane*4)===1,'VIG affine');await checkpoint();}});a={...a,data};
    }else{data=await math([a.data],a.data.length,async([x],out)=>{for(let off=0;off<a.data.length;off+=65536){module._vig_gelu(x+off*4,Math.min(65536,a.data.length-off),out+off*4);await checkpoint();}});a={...a,data};}
    checkAbort(signal);return a;
   };
   const add=(a,b)=>{const data=new Float32Array(a.data.length);for(let i=0;i<data.length;i++)data[i]=a.data[i]+b.data[i];return{...a,data};};
   try{
    staging=budget.reserve(STAGING);release=budget.reserve(640*256*4);
    let a={data:input,c:3,h:256,w:256};for(let i=0;i<14;i++)a=await op('stem.convs.'+i,a);a=add(a,{data:await parameter('pos_embed')});
    for(let i=0;i<16;i++){
     let shortcut=a,p='backbone.'+i+'.0';a=await op(p+'.fc1.0',a);a=await op(p+'.fc1.1',a);const{k,dilation}=graph.knn[i];
     const data=await math([a.data],1280*256,async([x],out,put)=>{
      const normal=put(640*256*4),sums=put(256*4),distance=put(256**2*4),indices=put(256*k*dilation*4);module._vig_normalize(x,normal,sums);await checkpoint();
      if(backend==='webgpu'){
       const began=performance.now(),result=await pool.distance({normal:module.HEAPF32.subarray(normal/4,normal/4+640*256),sums:module.HEAPF32.subarray(sums/4,sums/4+256)},{signal,onProgress});
       try{module.HEAPF32.set(result.data,distance/4);gpuWriteBytes+=result.timings.gpuWriteBytes;gpuReadBytes+=result.timings.gpuReadBytes;gpuPeakBufferBytes=Math.max(gpuPeakBufferBytes,result.gpu.peakAccountedBytes);gpuAllocations+=result.gpu.allocations;}finally{result.release();graphDistanceMs+=performance.now()-began;}
      }
      for(let first=0;first<256;first+=8){if(backend==='cpu'){const began=performance.now();module._vig_distance_rows(normal,sums,first,8,distance);graphDistanceMs+=performance.now()-began;}module._vig_topk_rows(distance,first,8,k*dilation,indices);module._vig_gather_rows(x,k,dilation,indices,first,8,out);await checkpoint();}
     });
     a={...a,c:1280,data};for(let j=0;j<3;j++)a=await op(p+'.graph_conv.gconv.nn.'+j,a);a=await op(p+'.fc2.0',a);a=await op(p+'.fc2.1',a);a=add(a,shortcut);shortcut=a;p='backbone.'+i+'.1';a=await op(p+'.fc1.0',a);a=await op(p+'.fc1.1',a);a=await op(p+'.act',a);a=await op(p+'.fc2.0',a);a=await op(p+'.fc2.1',a);a=add(a,shortcut);onProgress?.({phase:'vig-backbone',completed:i+1,total:16});await checkpoint();
    }
    requireValue(a.data.every(Number.isFinite),'Finite VIG features');checkAbort(signal);complete=true;return{data:a.data,shape:[1,640,16,16],workers,...(backend==='webgpu'?{gpu:{devices:1,allocations:gpuAllocations,peakAccountedBytes:gpuPeakBufferBytes,accounting:'explicit GPU buffers; excludes driver/compiler residency',errors:[]}}:{}),timings:{parameterLoadMs,graphDistanceMs,executionMs:performance.now()-started-parameterLoadMs,gpuWriteBytes,gpuReadBytes},release};
   }finally{staging?.();if(!complete)release?.();busy=false;}
  },
  dispose(){requireValue(!busy,'VIG backbone busy');if(disposed)return;disposed=true;pool.dispose();module=null;freeHeap();}
 };
}
