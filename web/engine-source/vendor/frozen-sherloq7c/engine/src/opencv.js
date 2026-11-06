import {nativeModuleFailure,copyTypedArray,wasmAllocationFailure} from './allocation.js';
import {EngineError,checkAbort,checkpoint,requireValue} from './errors.js';
import {PRNU_TWIDDLES} from './prnu-twiddles.js';
let pending,ready;
const prnuTables=new WeakMap();
export async function initCvWasm({wasmBinary}={}){
 const {default:create}=await import('../vendor/opencv/opencv.js');pending=create(wasmBinary?{wasmBinary}:{});ready=await pending;return ready;
}
async function moduleInstance(){try{return ready??(pending?await pending:await initCvWasm());}catch(cause){pending=null;throw nativeModuleFailure(cause,'Local OpenCV WebAssembly module could not load.');}}
export const cvHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
export async function cvNoisesnifferTailFunction(){const m=await moduleInstance();return (K,N,w,p)=>{const v=m._cv_noisesniffer_log_tail(K,N,w,p);if(Number.isNaN(v))throw new EngineError('NUMERIC_RANGE','Noisesniffer binomial survival failed.');return v;};}
export async function cvNoisesnifferStatistics(image,w,{signal,part='all',fast=true}={}){
 requireValue([3,5,7,8].includes(w)&&image.width>=w&&image.height>=w,'Noisesniffer block size must be 3, 5, 7 or 8 and fit the image.');
 requireValue(['all','base','dct'].includes(part),'Invalid Noisesniffer statistics partition.');
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);const n=(image.width-w+1)*(image.height-w+1);let src=0,valid=0,means=0,variance=0;
 try{
  src=m._malloc(image.data.byteLength);if(part!=='dct'){valid=m._malloc(n);means=m._malloc(n*24);}if(part!=='base')variance=m._malloc(n*12);
  if(!src||(part!=='dct'&&(!valid||!means))||(part!=='base'&&!variance))throw wasmAllocationFailure(m,'Noisesniffer statistics allocation failed.',undefined);
  m.HEAPU8.set(image.data,src);
  if(!m._cv_noisesniffer_statistics(src,image.width,image.height,w,valid,means,variance,['all','base','dct'].indexOf(part),Number(fast)))throw new EngineError('INVALID_INPUT','Noisesniffer statistics failed.');checkAbort(signal);
  const ids=[];if(valid)for(let i=0;i<n;i++)if(m.HEAPU8[valid+i])ids.push(i);
  return {width:image.width-w+1,height:image.height-w+1,...(valid?{valid:Uint32Array.from(ids),means:copyTypedArray(m.HEAPF64.subarray(means/8,means/8+n*3),{label:'opencv-output'})}:{}),...(variance?{variance:copyTypedArray(m.HEAPF32.subarray(variance/4,variance/4+n*3),{label:'opencv-output'})}:{})};
 }finally{for(const p of [src,valid,means,variance])if(p)m._free(p);}
}
export async function initPrnuTwiddles({bytes,signal}={}){
 const m=await moduleInstance();checkAbort(signal);
 if(!prnuTables.has(m)){
  const load=(async()=>{
   let source=bytes;
   if(!source){const response=await fetch(new URL('../vendor/pocketfft/prnu-twiddles.bin',import.meta.url));if(!response.ok)throw new EngineError('CODEC_UNAVAILABLE','PRNU reference FFT seeds could not load.');source=new Uint8Array(await response.arrayBuffer());}
   requireValue(source instanceof Uint8Array&&source.byteLength===PRNU_TWIDDLES.bytes,'Invalid PRNU reference FFT seed file.');
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',source)),x=>x.toString(16).padStart(2,'0')).join('');requireValue(hash===PRNU_TWIDDLES.sha256,'PRNU reference FFT seed hash mismatch.');
   let at=0;try{at=m._malloc(source.byteLength);if(!at)throw wasmAllocationFailure(m,'PRNU FFT seed allocation failed.',source.byteLength);m.HEAPU8.set(source,at);if(!m._cv_prnu_twiddles(at,source.byteLength))throw new EngineError('INVALID_INPUT','PRNU FFT seeds rejected.');}finally{if(at)m._free(at);}
  })();prnuTables.set(m,load);load.catch(()=>{if(prnuTables.get(m)===load)prnuTables.delete(m);});
 }
 await prnuTables.get(m);checkAbort(signal);
}
export async function cvPrnuResidual(image,{signal,fast=true}={}){
 requireValue(image.width>=3&&image.height>=3,'PRNU requires at least 3 rows and 3 columns.');
 requireValue(image.width+2<=PRNU_TWIDDLES.maximumLength&&image.height+2<=PRNU_TWIDDLES.maximumLength,'PRNU dimensions exceed the qualified FFT range.');
 await checkpoint(signal);const m=await moduleInstance();await initPrnuTwiddles({signal});checkAbort(signal);let src=0;
 try{src=m._malloc(image.data.byteLength);if(!src)throw wasmAllocationFailure(m,'PRNU input allocation failed.',image.data.byteLength);m.HEAPU8.set(image.data,src);if(!m._cv_prnu_prepare(src,image.width,image.height,Number(fast)))throw new EngineError('INVALID_INPUT','PRNU residual failed; at least 3 rows and 3 columns are required.');checkAbort(signal);return {width:m._cv_width(),height:m._cv_height(),values:copyTypedArray(m.HEAPF64.subarray(m._cv_data()/8,(m._cv_data()+m._cv_size())/8),{label:'opencv-output'}),method:m._cv_prnu_method()?'fft':'direct',noisePower:m._cv_prnu_noise()};}finally{m._cv_release();if(src)m._free(src);}
}
export async function cvComparison(first,second,mode,{signal,original=false,experiment=0}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let a=0,b=0;
 try{a=m._malloc(first.data.byteLength);b=m._malloc(second.data.byteLength);if(!a||!b)throw wasmAllocationFailure(m,'Comparison input allocation failed.',undefined);m.HEAPU8.set(first.data,a);m.HEAPU8.set(second.data,b);
  if(!m._cv_comparison(a,b,first.width,first.height,mode,original?1:experiment))throw new EngineError('INVALID_INPUT','Comparison failed.');checkAbort(signal);const pointer=m._cv_data(),length=m._cv_size();
  return (mode===0||mode===4)?{width:first.width,height:first.height,format:'rgb8',data:copyTypedArray(m.HEAPU8.subarray(pointer,pointer+length),{label:'opencv-output'}),...(mode===4?{score:m._cv_comparison_score()}: {})}:{width:m._cv_width(),height:m._cv_height(),values:copyTypedArray(m.HEAPF64.subarray(pointer/8,(pointer+length)/8),{label:'opencv-output'}),score:m._cv_comparison_score()};
 }finally{m._cv_release();if(a)m._free(a);if(b)m._free(b);}
}
export async function cvComparisonRender(map,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0;
 try{src=m._malloc(map.values.byteLength);if(!src)throw wasmAllocationFailure(m,'Comparison map allocation failed.',map.values.byteLength);m.HEAPF64.set(map.values,src/8);if(!m._cv_comparison_render(src,map.width,map.height))throw new EngineError('INVALID_INPUT','Comparison view failed.');checkAbort(signal);return {width:map.width,height:map.height,format:'rgb8',data:copyTypedArray(m.HEAPU8.subarray(m._cv_data(),m._cv_data()+m._cv_size()),{label:'opencv-output'})};}finally{m._cv_release();if(src)m._free(src);}
}
async function cvCompute(image,operation,params,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0,args=0;
 try{
  src=m._malloc(image.data.length);args=m._malloc(params.length*8);if(!src||!args)throw wasmAllocationFailure(m,'OpenCV input allocation failed.',undefined);
  m.HEAPU8.set(image.data,src);m.HEAPF64.set(params,args/8);
  if(!m._cv_run(src,image.width,image.height,operation,args))throw new EngineError('INVALID_INPUT','OpenCV rejected the operation or its working set.');
  checkAbort(signal);const width=m._cv_width(),height=m._cv_height(),length=m._cv_size();requireValue(length===width*height*3,'Invalid OpenCV RGB output.');
  const data=copyTypedArray(m.HEAPU8.subarray(m._cv_data(),m._cv_data()+length),{label:'opencv-output'}),result={pixels:{width,height,format:'rgb8',data}};if(operation===7){const at=m._cv_model()/8;result.data={channelOrder:'BGR',mean:copyTypedArray(m.HEAPF64.subarray(at,at+3),{label:'opencv-output'}),eigenvectors:copyTypedArray(m.HEAPF64.subarray(at+3,at+12),{label:'opencv-output'}),eigenvalues:copyTypedArray(m.HEAPF64.subarray(at+12,at+15),{label:'opencv-output'})};}return result;
 }finally{m._cv_release();if(src)m._free(src);if(args)m._free(args);}
}
export async function cvDecode(bytes,{signal,grayscale=false}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0;
 try{src=m._malloc(bytes.length);if(!src)throw wasmAllocationFailure(m,'OpenCV input allocation failed.',bytes.length);m.HEAPU8.set(bytes,src);
  if(!(grayscale?m._cv_decode_gray(src,bytes.length):m._cv_decode(src,bytes.length)))throw new EngineError('INVALID_INPUT','OpenCV rejected the encoded image.');checkAbort(signal);
  const width=m._cv_width(),height=m._cv_height(),data=copyTypedArray(m.HEAPU8.subarray(m._cv_data(),m._cv_data()+m._cv_size()),{label:'opencv-output'});return {width,height,format:grayscale?'gray8':'rgb8',data};
 }finally{m._cv_release();if(src)m._free(src);}
}
export async function cvNoiseMap(noise,width,height,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0;
 try{src=m._malloc(noise.values.byteLength);if(!src)throw wasmAllocationFailure(m,'Noise map allocation failed.',noise.values.byteLength);m.HEAPF64.set(noise.values,src/8);
  if(!m._cv_noise_map(src,noise.width,noise.height,width,height))throw new EngineError('INVALID_INPUT','Noise map rendering failed.');checkAbort(signal);return {width,height,format:'rgb8',data:copyTypedArray(m.HEAPU8.subarray(m._cv_data(),m._cv_data()+m._cv_size()),{label:'opencv-output'})};
 }finally{m._cv_release();if(src)m._free(src);}
}
export async function cvHash(image,kind,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0;
 try{src=m._malloc(image.data.length);if(!src)throw wasmAllocationFailure(m,'Hash input allocation failed.',image.data.length);m.HEAPU8.set(image.data,src);
  if(!m._cv_hash(src,image.width,image.height,kind))throw new EngineError('INVALID_INPUT','OpenCV rejected the image hash.');checkAbort(signal);const pointer=m._cv_data(),size=m._cv_size();
  return kind===2?copyTypedArray(m.HEAPF64.subarray(pointer/8,(pointer+size)/8),{label:'opencv-output'}):copyTypedArray(m.HEAPU8.subarray(pointer,pointer+size),{label:'opencv-output'});
 }finally{m._cv_release();if(src)m._free(src);}
}

export async function cvPixels(image,operation,params,hooks){return (await cvCompute(image,operation,params,hooks)).pixels;}
export const cvPca=(image,params,hooks)=>cvCompute(image,7,params,hooks);
export const cvPcaView=(image,basis,params,hooks)=>cvPixels(image,8,[...params,...basis],hooks);
export async function cvPcaModel(image,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0;
 try{src=m._malloc(image.data.length);if(!src)throw wasmAllocationFailure(m,'PCA input allocation failed.',image.data.length);m.HEAPU8.set(image.data,src);
  if(!m._cv_pca_model(src,image.width,image.height))throw new EngineError('INVALID_INPUT','PCA model failed.');checkAbort(signal);return copyTypedArray(m.HEAPF64.subarray(m._cv_data()/8,m._cv_data()/8+15),{label:'opencv-output'});
 }finally{m._cv_release();if(src)m._free(src);}
}
export async function cvFrequencyBase(image,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0;
 try{src=m._malloc(image.data.length);if(!src)throw wasmAllocationFailure(m,'Frequency input allocation failed.',image.data.length);m.HEAPU8.set(image.data,src);
  if(!m._cv_frequency_prepare(src,image.width,image.height))throw new EngineError('INVALID_INPUT','Frequency preparation failed.');checkAbort(signal);return {width:m._cv_width(),height:m._cv_height(),values:copyTypedArray(m.HEAPF32.subarray(m._cv_data()/4,(m._cv_data()+m._cv_size())/4),{label:'opencv-output'})};
 }finally{m._cv_release();if(src)m._free(src);}
}
export async function cvFrequencyMask(width,height,split,smooth,kind=0,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);
 try{if(!m._cv_frequency_mask(width,height,split,smooth,kind))throw new EngineError('INVALID_INPUT','Frequency mask preparation failed.');checkAbort(signal);return copyTypedArray(m.HEAPF32.subarray(m._cv_data()/4,(m._cv_data()+m._cv_size())/4),{label:'opencv-output'});}finally{m._cv_release();}
}
export async function cvFrequencyView(base,width,height,params,{signal,preparedMask}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0,args=0,mask=0;
 try{src=m._malloc(base.values.byteLength);args=m._malloc(32);if(!src||!args)throw wasmAllocationFailure(m,'Frequency view allocation failed.',undefined);m.HEAPF32.set(base.values,src/4);m.HEAPF64.set(params,args/8);
  if(preparedMask){requireValue(preparedMask.length===base.width*base.height,'Invalid frequency mask dimensions.');mask=m._malloc(preparedMask.byteLength);if(!mask)throw wasmAllocationFailure(m,'Frequency mask allocation failed.',preparedMask.byteLength);m.HEAPF32.set(preparedMask,mask/4);}
  if(!m._cv_frequency_view(src,base.width,base.height,width,height,args,mask))throw new EngineError('INVALID_INPUT','Frequency view failed.');checkAbort(signal);const frames=[];
  for(let i=0;i<5;i++){if(!m._cv_frequency_frame(i))throw new EngineError('INVALID_INPUT','Frequency frame missing.');const data=i>=4?copyTypedArray(m.HEAPF32.subarray(m._cv_data()/4,(m._cv_data()+m._cv_size())/4),{label:'opencv-output'}):copyTypedArray(m.HEAPU8.subarray(m._cv_data(),m._cv_data()+m._cv_size()),{label:'opencv-output'});frames.push({width:m._cv_width(),height:m._cv_height(),data});}return {frames,zeroPercent:m._cv_frequency_zero()};
 }finally{m._cv_release();if(src)m._free(src);if(args)m._free(args);if(mask)m._free(mask);}
}
export async function cvPlot(image,scale,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0;
 try{src=m._malloc(image.data.length);if(!src)throw wasmAllocationFailure(m,'Plot input allocation failed.',image.data.length);m.HEAPU8.set(image.data,src);
  if(!m._cv_plot(src,image.width,image.height,scale))throw new EngineError('INVALID_INPUT','OpenCV rejected plot sampling.');checkAbort(signal);return copyTypedArray(m.HEAPF32.subarray(m._cv_data()/4,(m._cv_data()+m._cv_size())/4),{label:'opencv-output'});
 }finally{m._cv_release();if(src)m._free(src);}
}
export async function cvContrast(image,block,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0;
 try{src=m._malloc(image.data.length);if(!src)throw wasmAllocationFailure(m,'Contrast input allocation failed.',image.data.length);m.HEAPU8.set(image.data,src);if(!m._cv_contrast_prepare(src,image.width,image.height,block))throw new EngineError('INVALID_INPUT','Contrast analysis failed.');checkAbort(signal);return {cols:m._cv_width(),rows:m._cv_height(),values:copyTypedArray(m.HEAPF32.subarray(m._cv_data()/4,(m._cv_data()+m._cv_size())/4),{label:'opencv-output'})};}finally{m._cv_release();if(src)m._free(src);}
}
export async function cvContrastView(maps,width,height,block,mode,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0;
 try{src=m._malloc(maps.values.byteLength);if(!src)throw wasmAllocationFailure(m,'Contrast map allocation failed.',maps.values.byteLength);m.HEAPF32.set(maps.values,src/4);if(!m._cv_contrast_view(src,maps.cols,maps.rows,width,height,block,mode))throw new EngineError('INVALID_INPUT','Contrast view failed.');checkAbort(signal);return {width,height,format:'rgb8',data:copyTypedArray(m.HEAPU8.subarray(m._cv_data(),m._cv_data()+m._cv_size()),{label:'opencv-output'})};}finally{m._cv_release();if(src)m._free(src);}
}
export async function cvStereoPrepare(image,kind,offset=0,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0;
 try{src=m._malloc(image.data.length);if(!src)throw wasmAllocationFailure(m,'Stereo input allocation failed.',image.data.length);m.HEAPU8.set(image.data,src);if(!m._cv_stereo_prepare(src,image.width,image.height,kind,offset))throw new EngineError('INVALID_INPUT','Stereogram computation failed.');checkAbort(signal);const at=m._cv_data(),length=m._cv_size(),values=kind===1?copyTypedArray(m.HEAPU8.subarray(at,at+length),{label:'opencv-output'}):copyTypedArray(m.HEAPF32.subarray(at/4,(at+length)/4),{label:'opencv-output'});return {width:m._cv_width(),height:m._cv_height(),values,offset:m._cv_stereo_offset(),...([2,7].includes(kind)?{timings:Array.from(copyTypedArray(m.HEAPF64.subarray(m._cv_stereo_timings()/8,m._cv_stereo_timings()/8+5),{label:'opencv-output'}))}: {})};}finally{m._cv_release();if(src)m._free(src);}
}
export async function cvStereoView(pattern,mode,flow,{signal}={}){
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);let src=0,fp=0;
 try{src=m._malloc(pattern.data.length);if(!src)throw wasmAllocationFailure(m,'Stereo pattern allocation failed.',pattern.data.length);m.HEAPU8.set(pattern.data,src);if(flow){fp=m._malloc(flow.byteLength);if(!fp)throw wasmAllocationFailure(m,'Stereo flow allocation failed.',flow.byteLength);m.HEAPF32.set(flow,fp/4);}if(!m._cv_stereo_view(src,pattern.width,pattern.height,mode,fp))throw new EngineError('INVALID_INPUT','Stereogram view failed.');checkAbort(signal);return {width:pattern.width,height:pattern.height,format:'rgb8',data:copyTypedArray(m.HEAPU8.subarray(m._cv_data(),m._cv_data()+m._cv_size()),{label:'opencv-output'})};}finally{m._cv_release();if(src)m._free(src);if(fp)m._free(fp);}
}
