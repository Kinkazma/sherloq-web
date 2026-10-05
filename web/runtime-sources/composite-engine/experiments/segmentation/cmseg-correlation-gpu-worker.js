// Separate experimental worker: receives complete dot-product rows, never a
// cropped comparison domain. Native Gaussian/softmax/TopK arithmetic stays CPU.
let module,geometry,p;
const allocate=n=>{const at=module._malloc(n*4);if(!at||module.HEAPU8.length>32*1024**2)throw Error('Correlation postprocess heap');return at;};
self.onmessage=async({data})=>{
  const{id,type}=data;
  try{
    if(type==='init'){
      module=await(await import(data.moduleUrl)).default();geometry=data.geometry;
      const{c,h,w,k,rowsPerJob}=geometry,n=h*w,input=allocate(c*n),normal=allocate(c*n);
      p={gy:allocate(h),gx:allocate(w),maxima:allocate(n),inverse:allocate(2*n),scratch:allocate(n),output:allocate(k*n),dots:allocate(rowsPerJob*n)};
      module.HEAPF32.set(data.input,input/4);if(module._cmseg_normalize(input,c,h,w,normal,p.gy,p.gx)!==1)throw Error('Normalize');
      const normalized=data.returnNormalized?module.HEAPF32.slice(normal/4,normal/4+c*n):undefined;
      module._free(input);module._free(normal);
      self.postMessage({id,ok:true,heapBytes:module.HEAPU8.length,normalized},normalized?[normalized.buffer]:[]);
    }else if(type==='distribute'){
      module.HEAPF32.set(data.maxima,p.maxima/4);module.HEAPF32.set(data.inverse,p.inverse/4);self.postMessage({id,ok:true});
    }else if(type==='statistics'||type==='topk'){
      const{c,h,w,k,alpha,rowsPerJob}=geometry,n=h*w,{first,count,dots}=data;
      if(!(dots instanceof Float32Array)||dots.length!==count*n||count>rowsPerJob)throw Error('Complete dot rows required');
      module.HEAPF32.set(dots,p.dots/4);
      if(type==='statistics'){
        if(module._cmseg_statistics_dots(p.dots,c,h,w,alpha,p.gy,p.gx,first,count,p.maxima,p.inverse,p.scratch)!==1)throw Error('Statistics');
        const maxima=module.HEAPF32.slice(p.maxima/4+first,p.maxima/4+first+count),inverse=module.HEAPF32.slice(p.inverse/4+first,p.inverse/4+first+count),columnSum=module.HEAPF32.slice(p.inverse/4+n+first,p.inverse/4+n+first+count);
        self.postMessage({id,ok:true,maxima,inverse,columnSum},[maxima.buffer,inverse.buffer,columnSum.buffer]);
      }else{
        if(module._cmseg_topk_dots(p.dots,c,h,w,k,alpha,p.gy,p.gx,p.maxima,p.inverse,first,count,p.output,p.scratch)!==1)throw Error('TopK');
        const output=new Float32Array(k*count);for(let j=0;j<k;j++)output.set(module.HEAPF32.subarray(p.output/4+j*n+first,p.output/4+j*n+first+count),j*count);
        self.postMessage({id,ok:true,output,heapBytes:module.HEAPU8.length},[output.buffer]);
      }
    }else throw Error('Unknown correlation postprocess request');
  }catch(error){self.postMessage({id,ok:false,error:String(error?.message??error)});}
};
