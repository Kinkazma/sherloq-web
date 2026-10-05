import {requireValue,EngineError} from './errors.js';
const count=dims=>dims.reduce((a,b)=>a*b,1),shapeOf=a=>Array.isArray(a)?[a.length,...shapeOf(a[0])]:[];
/** Executes the exported native graph with explicit float32 operator ordering.
 * Run inside the dedicated worker so cancellation terminates a real kernel. */
function* execute(module,program,weights,input,{block=32,onProgress,onTensor,hybrid=false}={}){
 const tensors=new Map(),pointers=new Set(),uses=new Map();
 const allocate=(dims,data)=>{const n=count(dims),pointer=module._malloc(Math.max(4,n*4));if(!pointer)throw new EngineError('MEMORY_ALLOCATION','CFA tensor allocation failed.');pointers.add(pointer);if(data)module.HEAPF32.set(data,pointer/4);return {pointer,dims};};
 const view=t=>module.HEAPF32.subarray(t.pointer/4,t.pointer/4+count(t.dims));
 for(const node of program.nodes)for(const name of node.inputs)uses.set(name,(uses.get(name)??0)+1);
 uses.set(program.output,(uses.get(program.output)??0)+1);
 try{
  for(const [name,item]of Object.entries(program.initializers))tensors.set(name,allocate(item.dims,weights.subarray(item.offset,item.offset+count(item.dims))));
  tensors.set(program.input,allocate(input.dims,input.data));
  for(const [index,node]of program.nodes.entries()){
   const inputs=node.inputs.map(n=>tensors.get(n)),a=node.attrs;let out;
   if(node.op==='Constant'){const dims=shapeOf(a.value);out={dims,data:Array.isArray(a.value)?a.value.flat(Infinity):[a.value]};}
   else if(node.op==='Conv'){
    const [x,w,bias]=inputs,[batch,ci,ih,iw]=x.dims,[co,,kh,kw]=w.dims,[dh,dw]=a.dilations??[1,1];
    requireValue((a.pads??[0,0,0,0]).every(v=>v===0)&&(a.strides??[1,1]).every(v=>v===1),'Unexpected CFA convolution geometry.');
    out=allocate([batch,co,ih-(kh-1)*dh,iw-(kw-1)*dw]);if(hybrid&&out.dims[2]*out.dims[3]>=64){
     const result=yield {input:{data:view(x),dims:x.dims},weights:view(w),bias:view(bias),shape:w.dims,attrs:a};view(out).set(result);
    }else module._cfa_conv(x.pointer,w.pointer,bias.pointer,out.pointer,batch,ci,ih,iw,co,kh,kw,dh,dw,a.group??1);
   }else if(node.op==='Softplus'||node.op==='LeakyRelu'){
    out=allocate(inputs[0].dims);view(out).set(view(inputs[0]));module._cfa_activate(out.pointer,count(out.dims),node.op==='Softplus'?0:1);
   }else if(node.op==='Slice'){
    const x=inputs[0],start=[0,0,0,0],step=[1,1,1,1],dims=[...x.dims],axes=inputs[3]?.data??inputs[1].data.map((_,i)=>i),steps=inputs[4]?.data??axes.map(()=>1);
    const bound=(v,n)=>Math.max(0,Math.min(n,v<0?v+n:v));
    axes.forEach((axis,i)=>{const n=x.dims[axis];requireValue(steps[i]>0,'Unsupported CFA slice direction.');start[axis]=bound(inputs[1].data[i],n);step[axis]=steps[i];dims[axis]=Math.max(0,Math.ceil((bound(inputs[2].data[i],n)-start[axis])/step[axis]));});
    out=allocate(dims);const scratch=module._malloc(64);if(!scratch)throw new EngineError('MEMORY_ALLOCATION','CFA slice allocation failed.');pointers.add(scratch);module.HEAP32.set([...x.dims,...dims,...start,...step],scratch/4);module._cfa_slice(x.pointer,out.pointer,scratch,scratch+16,scratch+32,scratch+48);module._free(scratch);pointers.delete(scratch);
   }else if(node.op==='Concat'){
    const axis=a.axis,dims=[...inputs[0].dims];dims[axis]=inputs.reduce((n,t)=>n+t.dims[axis],0);out=allocate(dims);const outer=count(dims.slice(0,axis)),inner=count(dims.slice(axis+1));
    for(let b=0;b<outer;b++){let offset=b*dims[axis]*inner;for(const t of inputs){const size=t.dims[axis]*inner;view(out).set(view(t).subarray(b*size,(b+1)*size),offset);offset+=size;}}
   }else if(node.op==='Gather'){
    const [x,indices]=inputs,axis=a.axis??0,dims=[...x.dims];requireValue(indices.dims.length===1,'CFA gather must have vector indices.');dims[axis]=indices.data.length;out=allocate(dims);const outer=count(dims.slice(0,axis)),inner=count(dims.slice(axis+1));
    for(let b=0;b<outer;b++)for(let j=0;j<indices.data.length;j++){const i=indices.data[j],offset=(b*x.dims[axis]+i)*inner;view(out).set(view(x).subarray(offset,offset+inner),(b*dims[axis]+j)*inner);}
   }else if(node.op==='AveragePool'){
    requireValue(Number.isInteger(block)&&block>=8&&block%2===0,'CFA block must be even and at least eight.');const [b,c,h,w]=inputs[0].dims,k=block/2;out=allocate([b,c,Math.floor(h/k),Math.floor(w/k)]);module._cfa_pool(inputs[0].pointer,out.pointer,b,c,h,w,k);
   }else if(node.op==='LogSoftmax'){
    requireValue(a.axis===1,'Unexpected CFA LogSoftmax axis.');out=allocate(inputs[0].dims);module._cfa_logsoftmax(inputs[0].pointer,out.pointer,out.dims[0],out.dims[1],count(out.dims.slice(2)));
   }else if(node.op==='Identity')out=allocate(inputs[0].dims,view(inputs[0]));
   else throw new EngineError('MODEL_UNAVAILABLE','Unsupported CFA operator: '+node.op);
   requireValue(node.outputs.length===1,'Unsupported multi-output CFA operator.');tensors.set(node.outputs[0],out);
   onTensor?.(node.name,out.pointer?view(out):out.data,out.dims);onProgress?.({phase:'cfa-network',completed:index+1,total:program.nodes.length});
   for(const name of node.inputs){const left=uses.get(name)-1;uses.set(name,left);if(left===0){const t=tensors.get(name);if(t?.pointer){module._free(t.pointer);pointers.delete(t.pointer);}tensors.delete(name);}}
  }
  const out=tensors.get(program.output);return {data:view(out).slice(),dims:out.dims};
 }finally{for(const pointer of pointers)module._free(pointer);}
}

export function runCfaProgram(module,program,weights,input,options={}){
 const iterator=execute(module,program,weights,input,{...options,hybrid:false});return iterator.next().value;
}
export async function runCfaProgramHybrid(module,program,weights,input,gpu,options={}){
 const iterator=execute(module,program,weights,input,{...options,hybrid:true});let step=iterator.next(),convolutions=0;
 try{while(!step.done){const values=await gpu.convolution(step.value);convolutions++;step=iterator.next(values);}return {...step.value,hybridConvolutions:convolutions};}finally{iterator.return();}
}
