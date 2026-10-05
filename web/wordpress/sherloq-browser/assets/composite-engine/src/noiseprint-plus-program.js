import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
/** Full DnCNN with unchanged weights, native FMA convolution and BN ordering. */
export function runNoiseprintPlusProgram(module,program,weights,input,{onProgress,onTensor,globalHeight=input.dims[2],offsetY=0,globalWidth=input.dims[3],offsetX=0}={}){
 const pointers=new Set(),tensors=new Map(),count=d=>d.reduce((a,b)=>a*b,1);
 const alloc=(dims,data)=>{const p=module._malloc(Math.max(4,count(dims)*4));if(!p)throw new EngineError('MEMORY_ALLOCATION','Noiseprint++ tensor allocation failed.');pointers.add(p);if(data)module.HEAPF32.set(data,p/4);return {pointer:p,dims};};
 const free=t=>{module._free(t.pointer);pointers.delete(t.pointer);};
 const view=t=>module.HEAPF32.subarray(t.pointer/4,t.pointer/4+count(t.dims));
 try{
  for(const [name,item]of Object.entries(program.initializers))tensors.set(name,alloc(item.dims,weights.subarray(item.offset,item.offset+count(item.dims))));
  let current=alloc(input.dims,input.data);
  for(const [index,node]of program.nodes.entries()){
   const a=node.attrs;let out;
   if(node.op==='Conv'){
    const w=tensors.get(node.inputs[1]),bias=tensors.get(node.inputs[2]),[batch,ci,ih,iw]=current.dims,[co,,kh,kw]=w.dims;
    requireValue(batch===1&&kh===3&&kw===3&&(a.pads??[]).every(x=>x===1)&&(a.strides??[]).every(x=>x===1),'Unsupported Noiseprint++ geometry.');
    const padded=alloc([batch,ci,ih+2,iw+2]);view(padded).fill(0);
    for(let c=0;c<ci;c++)for(let y=0;y<ih;y++)view(padded).set(view(current).subarray((c*ih+y)*iw,(c*ih+y+1)*iw),(c*(ih+2)+y+1)*(iw+2)+1);
    const zero=bias??alloc([co]);if(!bias)view(zero).fill(0);
    out=alloc([batch,co,ih,iw]);if(globalWidth===iw&&offsetX===0)module._cfa_conv_global(padded.pointer,w.pointer,zero.pointer,out.pointer,ci,ih+2,iw+2,co,globalHeight,offsetY);else{requireValue(module._cfa_conv_window,'Noiseprint++ window operator build required.');module._cfa_conv_window(padded.pointer,w.pointer,zero.pointer,out.pointer,ci,ih+2,iw+2,co,globalHeight,globalWidth,offsetY,offsetX);}free(padded);if(!bias)free(zero);
   }else{
    out=alloc(current.dims);const x=view(current),z=view(out),co=current.dims[1],n=current.dims[2]*current.dims[3],v=node.inputs[1]?view(tensors.get(node.inputs[1])):null;
    for(let c=0;c<co;c++)for(let i=c*n;i<(c+1)*n;i++)z[i]=node.op==='Relu'?Math.max(0,x[i]):node.op==='Mul'?x[i]*v[c]:x[i]+v[c];
   }
   free(current);current=out;onTensor?.(node.name,view(out),out.dims);onProgress?.({phase:'noiseprint-plus',completed:index+1,total:program.nodes.length});
  }
  return {data:view(current).slice(),dims:current.dims};
 }finally{for(const p of pointers)module._free(p);}
}
