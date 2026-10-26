import{requireValue,checkAbort}from'./errors.js';
export const VIG_WINDOW_MATH_HEAP=64*1024**2;
// Only independent channels/elements/query rows are chunked. Every L2 norm,
// distance dot, TopK target population and max-relative neighbour set is whole.
export function createVigWindowMath({module,contextCells,signal,checkpoint=async()=>{}}){
 const M=contextCells;requireValue(module?.HEAPU8?.length===VIG_WINDOW_MATH_HEAP&&Number.isSafeInteger(M)&&M>=256&&M%256===0&&M<=4096,'VIG native64MiB math and complete bank required');
 async function op(arrays,length,run){const pointers=[],put=n=>{const p=module._malloc(n);requireValue(p>0,'VIG native math heap admission');pointers.push(p);return p;};try{const inputs=arrays.map(a=>{const p=put(a.byteLength);module.HEAPF32.set(a,p/4);return p;}),out=put(length*4);await run(inputs,out,put);checkAbort(signal);const answer=module.HEAPF32.slice(out/4,out/4+length);await checkpoint();return answer;}finally{for(const p of pointers.reverse())module._free(p);}}
 const batchnorm=async(x,channels,plane,gamma,beta,mean,variance)=>{
  requireValue(x instanceof Float32Array&&x.length===channels*plane&&[gamma,beta,mean,variance].every(a=>a instanceof Float32Array&&a.length===channels),'VIG native channel BN extents');const answer=new Float32Array(x.length);
  for(let first=0;first<channels;first+=640){const count=Math.min(640,channels-first),part=await op([x.subarray(first*plane,(first+count)*plane),gamma.subarray(first,first+count),beta.subarray(first,first+count),mean.subarray(first,first+count),variance.subarray(first,first+count)],count*plane,async([a,g,b,m,v],out,put)=>{
   const temp=put(count*8);requireValue(module._d2prl_batchnorm_parameters(m,v,g,b,count,1e-5,temp,temp+count*4)===1,'VIG native BN parameters');requireValue(module._d2prl_affine(a,temp,temp+count*4,count,plane,0,out)===1,'VIG native BN affine');await checkpoint();});answer.set(part,first*plane);}
  return answer;
 };
 const gelu=async x=>{const answer=new Float32Array(x.length);for(let first=0;first<x.length;first+=65536){const count=Math.min(65536,x.length-first),part=await op([x.subarray(first,first+count)],count,([a],out)=>module._vig_gelu(a,count,out));answer.set(part,first);}return answer;};
 const neighbours=async(x,k,dilation,{distanceRows,onDistance=()=>{}}={})=>{
  requireValue(x instanceof Float32Array&&x.length===640*M&&Number.isInteger(k)&&k>=9&&k<=18&&Number.isInteger(dilation)&&dilation>=1&&dilation<=4&&k*dilation<=M,'VIG common KNN bank');
  return op([x],1280*M,async([a],out,put)=>{
   const normal=put(640*M*4),sums=put(M*4),step=distanceRows?Math.min(512,M):8,distance=put(step*M*4),indices=put(8*k*dilation*4),gather=put(1280*8*4);requireValue(module._vig_window_normalize(a,M,normal,sums)===1,'VIG complete native normalisation');await checkpoint();
   for(let first=0;first<M;first+=step){const count=Math.min(step,M-first);checkAbort(signal);
    if(distanceRows)await distanceRows({normal:module.HEAPF32.subarray(normal/4,normal/4+640*M),sums:module.HEAPF32.subarray(sums/4,sums/4+M),first,count},values=>{requireValue(values instanceof Float32Array&&values.length===count*M,'VIG complete GPU distance rows');module.HEAPF32.set(values,distance/4);});
    else requireValue(module._vig_window_distance_rows(normal,sums,M,first,count,distance)===1,'VIG complete native distance rows');onDistance({first,count,targets:M});
    for(let local=0;local<count;local+=8){const rows=Math.min(8,count-local);requireValue(module._vig_window_topk_rows(distance+local*M*4,M,rows,k*dilation,indices)===1,'VIG native TopK all targets');requireValue(module._vig_window_gather_rows(a,M,k,dilation,indices,first+local,rows,gather)===1,'VIG native max-relative gather');for(let c=0;c<1280;c++)module.HEAPF32.set(module.HEAPF32.subarray(gather/4+c*rows,gather/4+(c+1)*rows),out/4+c*M+first+local);await checkpoint();}
   }
  });
 };
 return Object.freeze({op,batchnorm,gelu,neighbours});
}
