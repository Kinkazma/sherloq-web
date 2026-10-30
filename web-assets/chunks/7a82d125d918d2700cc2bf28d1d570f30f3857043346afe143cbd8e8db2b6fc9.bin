import "../../runtime-context.js?v=0.30.0";
import{requireValue,checkAbort}from'./errors.js';
export const TNT_NATIVE_MATH_HEAP=64*1024**2;
// The original kernels and their reduction order are unchanged. Row chunks
// contain complete norms/softmaxes; GELU chunks contain independent elements.
export function createTntWindowMath({module,signal,checkpoint=async()=>{}}){
 requireValue(module?.HEAPU8?.length===TNT_NATIVE_MATH_HEAP,'TNT native64MiB math heap required');
 async function op(arrays,length,run){const pointers=[];try{
  const put=n=>{const p=module._malloc(n);requireValue(p>0,'TNT math heap admission');pointers.push(p);return p;};
  const inputs=arrays.map(a=>{const p=put(a.byteLength);module.HEAPF32.set(a,p/4);return p;}),out=put(length*4);
  await run(inputs,out);checkAbort(signal);const result=module.HEAPF32.slice(out/4,out/4+length);await checkpoint();return result;
 }finally{for(const p of pointers)module._free(p);}}
 const norm=async(x,weight,bias,width)=>{
  requireValue(x instanceof Float32Array&&x.length%width===0&&weight.length===width&&bias.length===width,'TNT complete native norm rows');
  const result=new Float32Array(x.length),rows=x.length/width;
  for(let first=0;first<rows;first+=128){checkAbort(signal);const count=Math.min(128,rows-first),part=await op([x.subarray(first*width,(first+count)*width),weight,bias],count*width,([a,b,c],o)=>module._tnt_norm(a,b,c,count,width,1e-5,o));result.set(part,first*width);}
  return result;
 };
 const gelu=async x=>{const result=new Float32Array(x.length);for(let first=0;first<x.length;first+=65536){checkAbort(signal);const count=Math.min(65536,x.length-first),part=await op([x.subarray(first,first+count)],count,([a],o)=>module._tnt_gelu(a,count,o));result.set(part,first);}return result;};
 const softmax=async(x,width)=>{requireValue(Number.isInteger(width)&&width>=1&&x.length%width===0,'TNT complete native softmax rows');const rows=x.length/width,result=new Float32Array(x.length),step=Math.min(128,Math.floor((TNT_NATIVE_MATH_HEAP-4096)/(width*8)));requireValue(step>=1,'One native softmax row must fit unchanged math64MiB');for(let first=0;first<rows;first+=step){checkAbort(signal);const count=Math.min(step,rows-first),part=await op([x.subarray(first*width,(first+count)*width)],count*width,([a],o)=>module._tnt_softmax(a,count,width,o));result.set(part,first*width);}return result;};
 const matmul=async(a,b,batch,rows,k,n,transposed)=>{requireValue(a.length===batch*rows*k&&b.length===batch*k*n,'TNT native complete-dot matrix extents');return op([a,b],batch*rows*n,async([ap,bp],out)=>{const group=Math.max(1,Math.floor(1024**2/(rows*k*n)));for(let first=0;first<batch;first+=group){checkAbort(signal);const count=Math.min(group,batch-first);module._tnt_matmul(ap+first*rows*k*4,bp+first*k*n*4,count,rows,k,n,Number(transposed),0,out+first*rows*n*4);await checkpoint();}});};
 return Object.freeze({op,norm,gelu,softmax,matmul,patch:(input,weight,bias)=>op([input,weight,bias],256*16*40,([a,b,c],o)=>module._tnt_patch(a,b,c,o))});
}
