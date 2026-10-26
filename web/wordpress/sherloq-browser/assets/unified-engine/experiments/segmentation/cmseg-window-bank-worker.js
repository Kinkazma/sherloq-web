// One admitted SIMD WASM arena. No ORT, model, nested pool or NN is created.
// GPU postprocessing receives complete ordered dot rows; CPU computes the
// same rows itself. The parent owns every structured-clone/output byte.
let module,geometry,p,maximumBytes,initialized=false;
const pointers=[];
function allocate(bytes){
 const at=module._malloc(bytes);
 if(!at||module.HEAPU8.byteLength>maximumBytes)throw Error('CMSeg bank correlation exceeds its admitted native heap');
 pointers.push(at);return at;
}
const put=array=>{const at=allocate(array.byteLength);module.HEAPU8.set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength),at);return at;};
function validGeometry(g){
 const{c,n,side,k,rowsPerJob,nativeFma}=g;
 if(![[24,128,24],[32,64,32],[96,32,96]].some(v=>v[0]===c&&v[1]===side&&v[2]===k)||!Number.isSafeInteger(n)||n<side*side||n%(side*side)!==0||n>0x3ffffff||!Number.isInteger(rowsPerJob)||rowsPerJob<1||rowsPerJob>256||typeof nativeFma!=='boolean')throw Error('Pinned CMSeg bank geometry required');
}
function requireTensor(value,Type,length,label){if(!(value instanceof Type)||value.length!==length||value.some(v=>!Number.isFinite(v)))throw Error('Complete finite '+label+' required');}
self.onmessage=async({data})=>{
 const{id,type}=data;
 try{
  if(type==='init'||type==='normalize'){
   if(initialized)throw Error('CMSeg bank worker initializes once');initialized=true;geometry=data.geometry;validGeometry(geometry);
   const{c,n,side,k,rowsPerJob,nativeFma}=geometry;
   if(!['cpu','post','normalize'].includes(data.mode)||type==='normalize'&&data.mode!=='normalize'||type==='init'&&data.mode==='normalize')throw Error('Explicit native bank stage required');
   maximumBytes=data.mode==='post'?32*1024**2:64*1024**2;
   requireTensor(data.mask,Uint8Array,n,'candidate mask');if(data.mask.some(v=>v!==0&&v!==1))throw Error('Binary scientific bank domain required');
   module=await(await import(data.moduleUrl)).default();if(module.HEAPU8.byteLength>maximumBytes)throw Error('CMSeg initial heap exceeds admission');
   p={mask:put(data.mask),mode:data.mode};
   if(data.mode!=='post'){
    requireTensor(data.input,Float32Array,c*n,'native feature bank');p.normalized=put(data.input);
    // Normalization is safe in place: each channel norm is fully reduced
    // before that location is rewritten. Its parity is received separately.
    if(module._cmseg_bank_normalize(p.normalized,c,n,side,p.mask,p.normalized,+nativeFma)!==1)throw Error('Native CMSeg bank normalization failed');
   }else if(data.input!==undefined)throw Error('GPU postprocessing must not duplicate the encoder feature tensor');
   if(data.mode==='normalize'){
    const normalized=module.HEAPF32.slice(p.normalized/4,p.normalized/4+c*n),heapBytes=module.HEAPU8.byteLength;
    self.postMessage({id,ok:true,normalized,heapBytes},[normalized.buffer]);return;
   }
   requireTensor(data.positions,Float32Array,2*n,'Original feature positions');p.positions=put(data.positions);
   p.maxima=allocate(4*n);p.inverse=allocate(8*n);p.scratch=allocate(4*n);p.gy=allocate(4*n/side);p.gx=allocate(4*n/side);p.output=allocate(4*k*rowsPerJob);
   if(data.mode==='post')p.dots=allocate(4*n*rowsPerJob);
   self.postMessage({id,ok:true,heapBytes:module.HEAPU8.byteLength});
  }else if(type==='distribute'){
   if(!p||p.mode==='normalize')throw Error('Native correlation stage not initialized');
   const{n}=geometry;requireTensor(data.maxima,Float32Array,n,'native maxima');requireTensor(data.inverse,Float32Array,2*n,'native inverse denominators');module.HEAPF32.set(data.maxima,p.maxima/4);module.HEAPF32.set(data.inverse,p.inverse/4);self.postMessage({id,ok:true,heapBytes:module.HEAPU8.byteLength});
  }else if(type==='statistics'||type==='topk'){
   if(!p||p.mode==='normalize')throw Error('Native correlation stage not initialized');
   const{c,n,side,k,nativeFma,rowsPerJob}=geometry,{first,count}=data;
   if(!Number.isInteger(first)||first<0||!Number.isInteger(count)||count<1||count>rowsPerJob||first+count>n)throw Error('Complete bounded native row range required');
   if(p.mode==='post'){requireTensor(data.dots,Float32Array,count*n,'GPU dot rows');module.HEAPF32.set(data.dots,p.dots/4);}
   else if(data.dots!==undefined)throw Error('CPU stage cannot accept replacement GPU rows');
   if(type==='statistics'){
    const ok=p.mode==='post'?module._cmseg_bank_statistics_dots(p.dots,c,n,side,data.alpha,p.positions,p.mask,first,count,p.maxima,p.inverse,p.scratch,p.gy,p.gx):module._cmseg_bank_statistics(p.normalized,c,n,side,data.alpha,p.positions,p.mask,first,count,p.maxima,p.inverse,p.scratch,p.gy,p.gx,+nativeFma);
    if(ok!==1)throw Error('Native CMSeg bank statistics failed');
    const maxima=module.HEAPF32.slice(p.maxima/4+first,p.maxima/4+first+count),inverse=module.HEAPF32.slice(p.inverse/4+first,p.inverse/4+first+count),columnSum=module.HEAPF32.slice(p.inverse/4+n+first,p.inverse/4+n+first+count);
    self.postMessage({id,ok:true,maxima,inverse,columnSum,heapBytes:module.HEAPU8.byteLength},[maxima.buffer,inverse.buffer,columnSum.buffer]);
   }else{
    const ok=p.mode==='post'?module._cmseg_bank_topk_dots(p.dots,c,n,side,k,data.alpha,p.positions,p.mask,p.maxima,p.inverse,first,count,p.output,p.scratch,p.gy,p.gx):module._cmseg_bank_topk(p.normalized,c,n,side,k,data.alpha,p.positions,p.mask,p.maxima,p.inverse,first,count,p.output,p.scratch,p.gy,p.gx,+nativeFma);
    if(ok!==1)throw Error('Native CMSeg bank TopK failed');
    const output=module.HEAPF32.slice(p.output/4,p.output/4+k*count);if(output.some(v=>!Number.isFinite(v)))throw Error('Nonfinite CMSeg bank TopK');
    self.postMessage({id,ok:true,output,heapBytes:module.HEAPU8.byteLength},[output.buffer]);
   }
  }else throw Error('Unknown CMSeg native bank request');
 }catch(error){
  self.postMessage({id,ok:false,error:{name:error?.name??'Error',message:String(error?.message??error),code:error?.code,stack:error?.stack,details:error?.details},heapBytes:module?.HEAPU8.byteLength??0});
 }
};
