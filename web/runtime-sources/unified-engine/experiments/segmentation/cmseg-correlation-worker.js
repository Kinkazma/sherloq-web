// A single-thread SIMD WASM worker; no nested pool or startup inference.
let module, geometry, p;
const pointers = [];
const allocate = floats => {const at = module._malloc(floats * 4); if (!at || module.HEAPU8.length > 64 * 1024 ** 2) throw Error('Correlation heap'); pointers.push(at); return at;};
self.onmessage = async ({data}) => {
  const {id, type} = data;
  try {
    if (type === 'init') {
      const factory = (await import(data.moduleUrl)).default; module = await factory();
      geometry = data.geometry; const {c, h, w, k} = geometry, n = h * w;
      const input = allocate(c*n);
      p = {normalized: allocate(c*n), gy: allocate(h), gx: allocate(w), maxima: allocate(n), inverse: allocate(2*n), scratch: allocate(n), output: allocate(k*n)};
      module.HEAPF32.set(data.input, input / 4);
      if(module._cmseg_normalize(input,c,h,w,p.normalized,p.gy,p.gx)!==1) throw Error('Normalize');
      module._free(input); pointers.splice(pointers.indexOf(input),1);
      self.postMessage({id,ok:true,heapBytes:module.HEAPU8.length});
    } else if (type === 'statistics') {
      const {c,h,w,alpha}=geometry, {first,count}=data;
      if(module._cmseg_statistics(p.normalized,c,h,w,alpha,p.gy,p.gx,first,count,p.maxima,p.inverse,p.scratch)!==1) throw Error('Statistics');
      const maxima=module.HEAPF32.slice(p.maxima/4+first,p.maxima/4+first+count), inverse=module.HEAPF32.slice(p.inverse/4+first,p.inverse/4+first+count);
      const columnSum=module.HEAPF32.slice(p.inverse/4+h*w+first,p.inverse/4+h*w+first+count);
      self.postMessage({id,ok:true,maxima,inverse,columnSum},[maxima.buffer,inverse.buffer,columnSum.buffer]);
    } else if (type === 'distribute') {
      module.HEAPF32.set(data.maxima,p.maxima/4);module.HEAPF32.set(data.inverse,p.inverse/4);self.postMessage({id,ok:true});
    } else if (type === 'topk') {
      const {c,h,w,k,alpha}=geometry, {first,count}=data,n=h*w;
      if(module._cmseg_topk(p.normalized,c,h,w,k,alpha,p.gy,p.gx,p.maxima,p.inverse,first,count,p.output,p.scratch)!==1) throw Error('TopK');
      const output=new Float32Array(k*count);
      for(let channel=0;channel<k;channel++)output.set(module.HEAPF32.subarray(p.output/4+channel*n+first,p.output/4+channel*n+first+count),channel*count);
      self.postMessage({id,ok:true,output,heapBytes:module.HEAPU8.length},[output.buffer]);
    } else throw Error('Unknown correlation request');
  } catch(error) {self.postMessage({id,ok:false,error:String(error?.message??error)});}
};
