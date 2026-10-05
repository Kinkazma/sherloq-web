import createJpegModule from '../vendor/libjpeg/jpeg.js';
import {EngineError,requireValue,checkAbort,checkpoint} from './errors.js';
export const JPEG_OPTIONS=Object.freeze({qualityDefault:75,dct:'ISLOW',subsampling:'4:2:0',baseline:true,progressive:false,optimize:false,smoothing:0});
export const JPEG_ID='libjpeg-turbo-3.0.3/emscripten-4.0.15/islow-v1';
let modulePromise,moduleReady;
export async function initJpegWasm({wasmBinary}={}) { modulePromise=createJpegModule(wasmBinary?{wasmBinary}:{});moduleReady=await modulePromise;return moduleReady; }
async function moduleInstance(){if(!modulePromise) initJpegWasm();return modulePromise;}
export function inspectJpeg(bytes) {
 requireValue(bytes instanceof Uint8Array && bytes.length>=4,'JPEG bytes required.');
 if(bytes[0]!==255||bytes[1]!==216) throw new EngineError('UNSUPPORTED_FORMAT','Only JPEG source decoding is available.');
 let offset=2,frame;
 while(offset<bytes.length) {
  requireValue(bytes[offset++]===255,'Malformed JPEG marker.');
  while(bytes[offset]===255) offset++;
  const marker=bytes[offset++];
  if(marker===0xda||marker===0xd9) break;
  if(marker===1 || marker>=0xd0&&marker<=0xd7) continue;
  requireValue(offset+2<=bytes.length,'Truncated JPEG.');
  const length=bytes[offset]*256+bytes[offset+1];
  requireValue(length>=2 && offset+length<=bytes.length,'Invalid JPEG segment.');
  if(marker===0xe1||marker===0xe2) throw new EngineError('UNSUPPORTED_FORMAT','EXIF/XMP/ICC JPEG requires a verified metadata policy; not available in this slice.');
  if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker)) {
   requireValue(length>=8,'Invalid JPEG frame.');
   if(![0xc0,0xc2].includes(marker)||bytes[offset+2]!==8||![1,3].includes(bytes[offset+7])) throw new EngineError('UNSUPPORTED_FORMAT','Only 8-bit grayscale or YCbCr baseline/progressive JPEG is available.');
   requireValue(!frame,'Multiple JPEG frames unsupported.');
   frame={height:bytes[offset+3]*256+bytes[offset+4],width:bytes[offset+5]*256+bytes[offset+6],channels:bytes[offset+7],progressive:marker===0xc2};
  }
  offset+=length;
 }
 requireValue(frame&&frame.width>0&&frame.height>0,'Missing JPEG dimensions.');
 return frame;
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
 id:JPEG_ID,parity:'bit-exact on declared native synthetic fixtures; unsupported metadata rejected',inspect:inspectJpeg,
 async decode(bytes,{signal}={}) {
  const {width,height}=inspectJpeg(bytes);
  const data=await invoke(bytes,width*height*3,(m,a,b)=>m._jpeg_decode(a,bytes.length,b,width,height),signal);
  return {width,height,format:'rgb8',data};
 },
 async recompress(pixels,quality,{signal}={}) {
  const {width,height}=pixels;
  const data=await invoke(pixels.data,width*height*3,(m,a,b)=>m._jpeg_recompress(a,b,width,height,quality),signal);
  return {width,height,format:'rgb8',data};
 }
};
