import "../../runtime-context.js?v=0.14.5";
import {wasmAllocationFailure,nativeModuleFailure,copyTypedArray} from './allocation.js';
import {EngineError,checkAbort,checkpoint,requireValue} from './errors.js';
export const ECHO_HEAP_BYTES=64*1024**2;
let pending,ready;
export async function initEchoWasm({wasmBinary}={}){const {default:create}=await import('../vendor/echo/echo.js');pending=create(wasmBinary?{wasmBinary}:{});ready=await pending;return ready;}
export const echoHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
async function instance(){try{return ready??(pending?await pending:await initEchoWasm());}catch(cause){pending=null;throw nativeModuleFailure(cause,'Local Echo arithmetic module could not load.');}}
async function buffers(sizes,signal,fn){await checkpoint(signal);const m=await instance();checkAbort(signal);const pointers=[];try{for(const size of sizes){const p=m._malloc(size);if(!p)throw wasmAllocationFailure(m,'Echo allocation exceeds its fixed 64 MiB heap.',size);pointers.push(p);}const result=fn(m,pointers);checkAbort(signal);return result;}finally{for(const p of pointers)m._free(p);}}
export function echoDerivatives(image,start,rows,radius,{signal}={}){
 requireValue(Number.isSafeInteger(start)&&Number.isSafeInteger(rows)&&rows>0&&start>=0&&start+rows<=image.height&&Number.isInteger(radius)&&radius>=1&&radius<=15,'Invalid Echo core rows or radius.');const n=image.width*rows;
 return buffers([image.data.byteLength,n*12,48],signal,(m,[input,output,stats])=>{m.HEAPU8.set(image.data,input);if(!m._echo_derivatives(input,image.width,image.height,start,rows,radius,output,stats))throw new EngineError('INVALID_INPUT','Echo derivatives rejected.');return{bytes:copyTypedArray(m.HEAPU8.subarray(output,output+n*12),{label:'echo-math-output'}),limits:copyTypedArray(m.HEAPF64.subarray(stats/8,stats/8+6),{label:'echo-math-output'})};});
}
export const echoRender=(bytes,limits,p,total,{signal}={})=>buffers([bytes.length,48,bytes.length/4],signal,(m,[input,stats,output])=>{m.HEAPU8.set(bytes,input);m.HEAPF64.set(limits,stats/8);m._echo_render(input,bytes.length/12,stats,total,p.contrast,Number(p.grayscale),output);return copyTypedArray(m.HEAPU8.subarray(output,output+bytes.length/4),{label:'echo-math-output'});});
