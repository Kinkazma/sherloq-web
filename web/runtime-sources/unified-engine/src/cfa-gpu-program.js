import {EngineError,requireValue} from './errors.js';
const count=dims=>dims.reduce((a,b)=>a*b,1),shapeOf=a=>Array.isArray(a)?[a.length,...shapeOf(a[0])]:[];
/** Keep exact copies, slices, concatenations and qualified convolution chains
 * on one GPU. SLEEF activations and native reductions remain CPU boundaries.
 * GPU arithmetic is unchanged from the qualified convolution kernel. */
export async function runCfaResidentProgram(module,program,weights,input,gpu,{block=32,onProgress,onTensor,acquireCpu,releaseCpu,acquireGpu}={}){
 const tensors=new Map(),owned=new Set(),uses=new Map();let convolutions=0,cpu=false,graph=false;
 const enter=async()=>{if(!cpu){await acquireCpu?.();cpu=true;}},leave=()=>{if(cpu){releaseCpu?.();cpu=false;}};
 const enterGpu=async()=>{leave();await acquireGpu?.();};
 const allocate=(dims,data)=>{const pointer=module._malloc(Math.max(4,count(dims)*4));if(!pointer)throw new EngineError('MEMORY_ALLOCATION','CFA tensor allocation failed.');const t={pointer,dims:[...dims]};owned.add(t);if(data)module.HEAPF32.set(data,pointer/4);return t;};
 const view=t=>module.HEAPF32.subarray(t.pointer/4,t.pointer/4+count(t.dims));
 const cpuTensor=async t=>{if(!t.pointer){await enterGpu();const data=await gpu.read(t.gpu);await enter();const copy=allocate(t.dims,data);t.pointer=copy.pointer;owned.delete(copy);}return t;};
 const gpuTensor=t=>{if(!t.gpu)t.gpu=gpu.upload({dims:t.dims,data:view(t)});return t.gpu;};
 const release=t=>{if(!t||!owned.delete(t))return;if(t.pointer)module._free(t.pointer);t.gpu?.release();};
 for(const node of program.nodes)for(const name of node.inputs)uses.set(name,(uses.get(name)??0)+1);
 uses.set(program.output,(uses.get(program.output)??0)+1);
 try{
  await enter();gpu.beginModel(program,weights);gpu.beginGraph(input.dims);graph=true;
  for(const [name,item]of Object.entries(program.initializers))tensors.set(name,allocate(item.dims,weights.subarray(item.offset,item.offset+count(item.dims))));
  tensors.set(program.input,allocate(input.dims,input.data));
  for(const [index,node]of program.nodes.entries()){
   const inputs=node.inputs.map(name=>tensors.get(name)),a=node.attrs;let out;
   if(node.op==='Constant'){const dims=shapeOf(a.value);out={dims,data:Array.isArray(a.value)?a.value.flat(Infinity):[a.value]};}
   else if(node.op==='Conv'){
    const [x,w,bias]=inputs,[batch,ci,ih,iw]=x.dims,[co,,kh,kw]=w.dims,[dh,dw]=a.dilations??[1,1],dims=[batch,co,ih-(kh-1)*dh,iw-(kw-1)*dw];
    requireValue((a.pads??[0,0,0,0]).every(v=>v===0)&&(a.strides??[1,1]).every(v=>v===1),'Unexpected CFA convolution geometry.');
    if(dims[2]*dims[3]>=64){await enterGpu();const request={input:gpuTensor(x),weights:view(w),bias:view(bias),shape:w.dims,attrs:a,weightKey:node.inputs[1],biasKey:node.inputs[2],resident:true};leave();out={dims,gpu:await gpu.convolution(request)};owned.add(out);convolutions++;}
    else{await cpuTensor(x);await enter();out=allocate(dims);module._cfa_conv(x.pointer,w.pointer,bias.pointer,out.pointer,batch,ci,ih,iw,co,kh,kw,dh,dw,a.group??1);}
   }else if(['Slice','Concat','Gather','Identity','LeakyRelu'].includes(node.op)){
    let dims=[...inputs[0].dims],settings={dims},sources=inputs;
    if(node.op==='Slice'){
     const start=dims.map(()=>0),step=dims.map(()=>1),axes=inputs[3]?.data??inputs[1].data.map((_,i)=>i),steps=inputs[4]?.data??axes.map(()=>1),bound=(v,n)=>Math.max(0,Math.min(n,v<0?v+n:v));
     axes.forEach((axis,i)=>{const n=dims[axis];requireValue(steps[i]>0,'Unsupported CFA slice direction.');start[axis]=bound(inputs[1].data[i],n);step[axis]=steps[i];dims[axis]=Math.max(0,Math.ceil((bound(inputs[2].data[i],n)-start[axis])/step[axis]));});settings={dims,start,step};sources=[inputs[0]];
    }else if(node.op==='Concat'){const axis=a.axis;dims[axis]=inputs.reduce((n,t)=>n+t.dims[axis],0);settings={dims,axis};}
    else if(node.op==='Gather'){const axis=a.axis??0,indices=inputs[1].data;requireValue(inputs[1].dims.length===1,'CFA gather must have vector indices.');dims[axis]=indices.length;settings={dims,axis,indices};sources=[inputs[0]];}
    await enterGpu();const source=sources.map(gpuTensor);out={dims,gpu:await gpu.move(node.op,source,settings)};owned.add(out);
   }else{
    const x=await cpuTensor(inputs[0]);await enter();
    if(node.op==='Softplus'){out=allocate(x.dims,view(x));module._cfa_activate(out.pointer,count(out.dims),0);}
    else if(node.op==='AveragePool'){requireValue(Number.isInteger(block)&&block>=8&&block%2===0,'CFA block must be even and at least eight.');const [b,c,h,w]=x.dims,k=block/2;out=allocate([b,c,Math.floor(h/k),Math.floor(w/k)]);module._cfa_pool(x.pointer,out.pointer,b,c,h,w,k);}
    else if(node.op==='LogSoftmax'){requireValue(a.axis===1,'Unexpected CFA LogSoftmax axis.');out=allocate(x.dims);module._cfa_logsoftmax(x.pointer,out.pointer,out.dims[0],out.dims[1],count(out.dims.slice(2)));}
    else throw new EngineError('MODEL_UNAVAILABLE','Unsupported CFA operator: '+node.op);
   }
   requireValue(node.outputs.length===1,'Unsupported multi-output CFA operator.');tensors.set(node.outputs[0],out);
   if(onTensor){if(out.gpu)await cpuTensor(out);onTensor(node.name,out.pointer?view(out):out.data,out.dims);}
   onProgress?.({phase:'cfa-network',completed:index+1,total:program.nodes.length});
   for(const name of node.inputs){const left=uses.get(name)-1;uses.set(name,left);if(left===0){release(tensors.get(name));tensors.delete(name);}}
  }
  const out=await cpuTensor(tensors.get(program.output));await enter();const result={data:view(out).slice(),dims:out.dims,hybridConvolutions:convolutions,gpu:gpu.metrics};leave();await gpu.endGraph();graph=false;return result;
 }finally{leave();for(const t of [...owned])release(t);if(graph)await gpu.endGraph();}
}
