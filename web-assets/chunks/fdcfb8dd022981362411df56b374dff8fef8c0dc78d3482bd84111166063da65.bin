import {EngineError,requireValue,checkAbort,checkpoint} from './errors.js';
export const SEPARATION_HEAP_BYTES=64*1024**2;let pending,ready;
export async function initSeparationWasm({wasmBinary}={}){const {default:create}=await import('../vendor/separation/separation.js');pending=create(wasmBinary?{wasmBinary}:{});ready=await pending;return ready;}
export const separationHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
async function instance(){try{return ready??(pending?await pending:await initSeparationWasm());}catch{pending=null;throw new EngineError('CODEC_UNAVAILABLE','Local separation arithmetic module could not load.');}}
// NLM uses the native7x7 template and21x21 search regardless of UI strength.
export const separationHalo=p=>p.mode===4?13:p.radius;
export const separationWorkspace=(width,height,p)=>width*height*32+(p.mode===4?width*21*21*4:0)+4*1024**2;
export async function separationRows(image,p,start,rows,{signal}={}){
 requireValue(p&&Number.isInteger(p.mode)&&p.mode>=0&&p.mode<=4&&Number.isInteger(p.radius)&&p.radius>=1&&p.radius<=10&&Number.isInteger(p.sigma)&&p.sigma>=1&&p.sigma<=200&&typeof p.grayscale==='boolean','Invalid separation filter parameters.');
 requireValue([image.width,image.height,start,rows].every(Number.isSafeInteger)&&image.width>0&&image.height>0&&start>=0&&rows>0&&start+rows<=image.height&&image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3,'Invalid separation row window.');
 if(separationWorkspace(image.width,image.height,p)>SEPARATION_HEAP_BYTES)throw new EngineError('MEMORY_LIMIT','Separation row window exceeds its fixed64MiB arithmetic heap.');
 await checkpoint(signal);const m=await instance();checkAbort(signal);let source=0,out=0;
 try{
  source=m._malloc(image.data.length);out=m._malloc(image.width*rows*3);if(!source||!out)throw new EngineError('MEMORY_LIMIT','Separation staging exceeds the fixed64MiB heap.');m.HEAPU8.set(image.data,source);
  const status=m._separation_rows(source,image.width,image.height,start,rows,p.mode,p.radius,p.sigma,Number(p.grayscale),out);if(status!==1)throw new EngineError(status===-1?'MEMORY_LIMIT':'INVALID_INPUT','Separation filter rejected its input or working set.');checkAbort(signal);return m.HEAPU8.slice(out,out+image.width*rows*3);
 }finally{if(source)m._free(source);if(out)m._free(out);}
}

export function releaseSeparationWasm(){ready=null;pending=null;}
