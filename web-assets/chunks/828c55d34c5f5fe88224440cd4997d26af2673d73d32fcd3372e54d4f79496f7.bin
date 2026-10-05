import "../../runtime-context.js?v=0.14.5";
import {wasmAllocationFailure,nativeModuleFailure,copyTypedArray} from './allocation.js';
import {EngineError,checkAbort,checkpoint,requireValue} from './errors.js';
export const GRADIENT_HEAP_BYTES=64*1024**2;
let pending,ready;
export async function initGradientWasm({wasmBinary}={}){const {default:create}=await import('../vendor/gradient/gradient.js');pending=create(wasmBinary?{wasmBinary}:{});ready=await pending;return ready;}
export const gradientHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
async function instance(){try{return ready??(pending?await pending:await initGradientWasm());}catch(cause){pending=null;throw nativeModuleFailure(cause,'Local gradient arithmetic module could not load.');}}
async function buffers(sizes,signal,fn){
 await checkpoint(signal);const m=await instance();checkAbort(signal);const pointers=[];
 try{for(const size of sizes){const p=m._malloc(size);if(!p)throw wasmAllocationFailure(m,'Gradient allocation exceeds its fixed 64 MiB heap.',size);pointers.push(p);}const result=fn(m,pointers);checkAbort(signal);return result;}finally{for(const p of pointers)m._free(p);}
}
export async function gradientDerivatives(image,start,rows,{signal}={}){
 requireValue(Number.isSafeInteger(start)&&Number.isSafeInteger(rows)&&rows>0&&start>=0&&start+rows<=image.height,'Invalid gradient core rows.');const n=image.width*rows;
 return buffers([image.data.byteLength,n*4,32],signal,(m,[input,output,stats])=>{
  m.HEAPU8.set(image.data,input);if(!m._gradient_derivatives(input,image.width,image.height,start,rows,output,stats))throw new EngineError('INVALID_INPUT','Gradient derivatives rejected.');return{bytes:copyTypedArray(m.HEAPU8.subarray(output,output+n*4),{label:'gradient-math-output'}),stats:copyTypedArray(m.HEAPF64.subarray(stats/8,stats/8+4),{label:'gradient-math-output'})};
 });
}
export const gradientLengths=(bytes,stats,invert,{signal}={})=>buffers([bytes.length,48,16],signal,(m,[input,parameters,output])=>{m.HEAPU8.set(bytes,input);m.HEAPF64.set(stats,parameters/8);m._gradient_lengths(input,bytes.length/4,parameters,Number(invert),output);return copyTypedArray(m.HEAPF64.subarray(output/8,output/8+2),{label:'gradient-math-output'});});
export const gradientRender=(bytes,stats,{mode,invert},total,{signal}={})=>buffers([bytes.length,48,bytes.length/4*3,768*4],signal,(m,[input,parameters,output,histogram])=>{m.HEAPU8.set(bytes,input);m.HEAPF64.set(stats,parameters/8);m._gradient_render(input,bytes.length/4,parameters,mode,Number(invert),total,output,histogram);return{bytes:copyTypedArray(m.HEAPU8.subarray(output,output+bytes.length/4*3),{label:'gradient-math-output'}),histogram:copyTypedArray(m.HEAPU32.subarray(histogram/4,histogram/4+768),{label:'gradient-math-output'})};});
export const gradientLut=(bytes,lut,{signal}={})=>buffers([bytes.length,lut.length],signal,(m,[input,table])=>{m.HEAPU8.set(bytes,input);m.HEAPU8.set(lut,table);m._gradient_lut(input,bytes.length/3,table);return copyTypedArray(m.HEAPU8.subarray(input,input+bytes.length),{label:'gradient-math-output'});});

export function releaseGradientWasm(){ready=null;pending=null;}
