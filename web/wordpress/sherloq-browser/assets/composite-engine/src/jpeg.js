import createJpegModule from '../vendor/libjpeg/jpeg.js';
import {jpegHeader,orientRgb} from './image-headers.js';
import {EngineError,requireValue,checkAbort,checkpoint,controlCheckpoint} from './errors.js';
export const JPEG_OPTIONS=Object.freeze({qualityDefault:75,dct:'ISLOW',subsampling:'4:2:0',baseline:true,progressive:false,optimize:false,smoothing:0});
export const JPEG_ID='libjpeg-turbo-3.0.3/emscripten-4.0.15/islow-v1';
let modulePromise,moduleReady;
export async function initJpegWasm({wasmBinary}={}) { modulePromise=createJpegModule(wasmBinary?{wasmBinary}:{});moduleReady=await modulePromise;return moduleReady; }
async function moduleInstance(){try{if(!modulePromise)return await initJpegWasm();return await modulePromise;}catch{modulePromise=null;throw new EngineError('CODEC_UNAVAILABLE','Local JPEG WebAssembly codec could not load.');}}
export const inspectJpeg=jpegHeader;
export async function inspectJpegBlob(source,{signal}={}){
 const read=async(offset,length)=>{const part=await source.read(offset,length,{signal});try{return Array.from(part.bytes);}finally{part.release();}};
 const signature=await read(0,2);if(signature[0]!==255||signature[1]!==216)throw new EngineError('UNSUPPORTED_FORMAT','JPEG signature required.');
 let offset=2,end=0;
 while(offset<source.byteLength){await checkpoint(signal);let marker=await read(offset,2);requireValue(marker[0]===255,'Malformed JPEG marker.');offset+=2;
  while(marker[1]===255){marker=[255,(await read(offset,1))[0]];offset++;}
  if(marker[1]===0xda||marker[1]===0xd9){end=offset;break;}
  if(marker[1]===1||marker[1]>=0xd0&&marker[1]<=0xd7)continue;
  const pair=await read(offset,2),length=pair[0]*256+pair[1];requireValue(length>=2&&offset<=source.byteLength-length,'Invalid JPEG segment length.');offset+=length;
 }
 requireValue(end>0,'Missing JPEG scan marker.');const prefix=await source.read(0,end,{signal});try{return jpegHeader(prefix.bytes);}finally{prefix.release();}
}
export async function decodeJpegRows(source,header,store,{budget,signal,chunkBytes=4*1024**2,onProgress}={}){
 const width=header.sourceWidth,height=header.sourceHeight,rowBytes=width*3;
 requireValue(store.byteLength===width*height*3&&Number.isSafeInteger(chunkBytes)&&chunkBytes>=rowBytes,'Invalid JPEG scanline destination or staging size.');
 // Progressive coefficient storage is global inside libjpeg. Baseline decode
 // needs scanline working buffers, not a destination the size of the full image.
 const coefficients=header.progressive?Math.ceil(width/8)*Math.ceil(height/8)*64*6:0,
  fixed=Math.max(source.byteLength+coefficients+32*1024**2,moduleReady?.HEAPU8.buffer.byteLength??0),available=budget.limit-budget.retained-budget.active-fixed-source.chunkBytes,
  rows=Math.min(height,Math.floor(chunkBytes/rowBytes),Math.floor(available/(rowBytes*2)));
 if(rows<1||fixed+rows*rowBytes>512*1024**2)throw new EngineError('MEMORY_LIMIT','JPEG encoded input/coefficient/scanline buffers exceed available RAM or the current codec WASM limit.');
 const release=budget.reserve(fixed+rows*rowBytes*2);let input=0,output=0,decoder=0,m,extraHeap=0;const heapReleases=[];
 const admitHeap=()=>{const extra=Math.max(0,m.HEAPU8.buffer.byteLength-fixed-rows*rowBytes-extraHeap);if(extra){heapReleases.push(budget.reserve(extra));extraHeap+=extra;}};
 try{
  m=await moduleInstance();input=m._malloc(source.byteLength);output=m._malloc(rows*rowBytes);if(!input||!output)throw new EngineError('MEMORY_ALLOCATION','JPEG scanline allocation failed.');
  await source.visit((bytes,offset)=>m.HEAPU8.set(bytes,input+offset),{signal});checkAbort(signal);
  decoder=m._jpeg_rows_open(input,source.byteLength,width,height);if(!decoder)throw new EngineError(m._jpeg_rows_error()===2?'MEMORY_ALLOCATION':'INVALID_INPUT','JPEG scanline decoder could not open the source.');
  admitHeap();let y=0;while(y<height){await controlCheckpoint(signal);const count=m._jpeg_rows_read(decoder,output,rows);if(count<=0||count>rows||y+count>height)throw new EngineError(m._jpeg_rows_error()===2?'MEMORY_ALLOCATION':'INVALID_INPUT','JPEG scanline decode failed.');admitHeap();const bytes=m.HEAPU8.slice(output,output+count*rowBytes);await store.write(bytes,y*rowBytes);checkAbort(signal);y+=count;onProgress?.(y/height);}
  if(!m._jpeg_rows_finish(decoder))throw new EngineError(m._jpeg_rows_error()===2?'MEMORY_ALLOCATION':'INVALID_INPUT','JPEG scanline decoder could not finish.');await store.flush();checkAbort(signal);
  return {rowsPerChunk:rows,encodedWorkingBytes:source.byteLength,coefficientAllowanceBytes:coefficients,workingReservationBytes:fixed+rows*rowBytes*2+extraHeap,codecHeapCapacityBytes:m.HEAPU8.buffer.byteLength};
 }finally{if(decoder)m._jpeg_rows_close(decoder);if(input)m._free(input);if(output)m._free(output);for(const done of heapReleases)done();release();}
}
export async function jpegDctHistograms(bytes,{signal}={}){
 const header=inspectJpeg(bytes),width=header.sourceWidth,height=header.sourceHeight;
 if(bytes.length>512*1024**2||width*height>100000000)throw new EngineError('MEMORY_LIMIT','JPEG exceeds the native double-quantization analysis limit.');
 if(bytes.length*2+width*height*10+32*1024**2>512*1024**2)throw new EngineError('MEMORY_LIMIT','Stored JPEG coefficients exceed the verified WASM codec working-set limit.');
 const data=await invoke(bytes,(4+9*258)*4,(m,a,b)=>m._jpeg_dct_histograms(a,bytes.length,b,width,height),signal);
 return new Uint32Array(data.buffer,data.byteOffset,data.byteLength/4);
}
export async function jpegHistogramWorkspace(){
 const m=await moduleInstance(),input=m._malloc(256*4),weights=m._malloc(33*8),output=m._malloc(256*8);
 if(!input||!weights||!output){if(input)m._free(input);if(weights)m._free(weights);if(output)m._free(output);throw new EngineError('MEMORY_LIMIT','Histogram allocation failed.');}
 return {smooth(values,kernel){
  requireValue(values.length===256&&kernel.length<=33,'Invalid histogram convolution shape.');new Uint32Array(m.HEAPU8.buffer,input,256).set(values);new Float64Array(m.HEAPU8.buffer,weights,kernel.length).set(kernel);
  m._jpeg_gaussian_histogram(input,weights,kernel.length-1,output);return new Float64Array(m.HEAPU8.buffer,output,256).slice();
 },dispose(){m._free(input);m._free(weights);m._free(output);}};
}
async function invoke(input,n,call,signal) {
 if(input.length*2+n*3+32*1024**2>512*1024**2)throw new EngineError('MEMORY_LIMIT','JPEG exceeds the verified codec working-set limit; no resizing performed.');
 await checkpoint(signal);const m=await moduleInstance();checkAbort(signal);
 const a=m._malloc(input.length),b=m._malloc(n);
 if(!a||!b){if(a)m._free(a);if(b)m._free(b);throw new EngineError('MEMORY_LIMIT','Codec allocation failed.');}
 try {m.HEAPU8.set(input,a);if(!call(m,a,b))throw new EngineError('INVALID_INPUT','JPEG codec rejected the image.');checkAbort(signal);return m.HEAPU8.slice(b,b+n);}finally{m._free(a);m._free(b);}
}
export const jpegCodec={
 memoryBytes:()=>moduleReady?.HEAPU8.buffer.byteLength??0,
 id:JPEG_ID,parity:'bit-exact on declared native synthetic fixtures; EXIF orientation explicit, ICC ignored like native',inspect:inspectJpeg,
 async decode(bytes,{signal}={}) {
  const header=inspectJpeg(bytes),width=header.sourceWidth,height=header.sourceHeight;
  const data=await invoke(bytes,width*height*3,(m,a,b)=>m._jpeg_decode(a,bytes.length,b,width,height),signal);
  return orientRgb({width,height,format:'rgb8',data},header.orientation,{signal});
 },
 provenance(bytes){const h=inspectJpeg(bytes);return {decoder:JPEG_ID,orientation:h.orientation,orientationApplied:true,sourceSize:[h.sourceWidth,h.sourceHeight],icc:h.icc?'present, not applied (native policy)':'absent',depth:8,alpha:'absent',interpolation:'none'};},
 async recompressGray(pixels,quality,{signal}={}) {
  const {width,height}=pixels;requireValue(pixels.data.length===width*height,'Expected grayscale pixels.');
  requireValue(Number.isInteger(quality)&&quality>=0&&quality<=100,'Grayscale JPEG quality must be 0–100.');
  // libjpeg jpeg_quality_scaling clamps Q0 to Q1 before table construction.
  // The existing WASM wrapper accepts 1–100; preserve that exact Q0 behavior.
  quality=Math.max(1,quality);
  const data=await invoke(pixels.data,width*height,(m,a,b)=>m._jpeg_recompress_gray(a,b,width,height,quality),signal);
  return {width,height,format:'gray8',data};
 },
 async recompress444(pixels,quality,{signal}={}) {
  const {width,height}=pixels;
  const data=await invoke(pixels.data,width*height*3,(m,a,b)=>m._jpeg_recompress_444(a,b,width,height,quality),signal);
  return {width,height,format:'rgb8',data};
 },
 async recompress(pixels,quality,{signal}={}) {
  const {width,height}=pixels;
  const data=await invoke(pixels.data,width*height*3,(m,a,b)=>m._jpeg_recompress(a,b,width,height,quality),signal);
  return {width,height,format:'rgb8',data};
 }
};
