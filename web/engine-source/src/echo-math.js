import {wasmAllocationFailure,nativeModuleFailure,copyTypedArray} from './allocation.js';
import {EngineError,checkAbort,checkpoint,requireValue} from './errors.js';
import {ECHO_HEAP_BYTES,echoLayout} from './echo-layout.js';
export {ECHO_HEAP_BYTES} from './echo-layout.js';
let pending,ready;
// One named payload supplies both depths. Old tabs retain their old payload URL.
export async function initEchoWasm({wasmBinary}={}){
 if(ready)return ready;if(pending)return pending;
 const task=(async()=>{const {default:create}=await import('../vendor/echo/echo-native16.js');return create(wasmBinary?{wasmBinary}:{});})();pending=task;
 try{ready=await task;return ready;}finally{if(pending===task)pending=null;}
}
export const echoHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
export async function preloadEchoWasm({signal}={}){checkAbort(signal);await instance();checkAbort(signal);return{heapBytes:echoHeapBytes(),sourceReads:0,numericExecutions:0};}
async function instance(){try{return ready??(pending?await pending:await initEchoWasm());}catch(cause){throw nativeModuleFailure(cause,'Local Echo arithmetic module could not load.');}}
async function buffers(sizes,signal,fn){await checkpoint(signal);const m=await instance();checkAbort(signal);const pointers=[];try{for(const size of sizes){const pointer=m._malloc(size);if(!pointer)throw wasmAllocationFailure(m,'Echo allocation exceeds its fixed 64 MiB heap.',size);pointers.push(pointer);}const result=fn(m,pointers);checkAbort(signal);return result;}finally{for(const pointer of pointers)m._free(pointer);}}
export function echoDerivatives(image,start,rows,radius,{signal}={}){
 const depth=image?.format==='rgb16'?16:8,layout=echoLayout(depth,radius);
 requireValue(image&&Number.isSafeInteger(image.width)&&image.width>0&&Number.isSafeInteger(image.height)&&image.height>0&&Number.isSafeInteger(image.width*image.height*layout.inputPixelBytes)&&Number.isSafeInteger(start)&&Number.isSafeInteger(rows)&&rows>0&&start>=0&&start+rows<=image.height&&(depth===16?image.data instanceof Uint16Array:image.data instanceof Uint8Array)&&image.data.length===image.width*image.height*3,'Invalid Echo core rows or typed source.');
 const n=image.width*rows;
 return buffers([image.data.byteLength,n*layout.rawPixelBytes,layout.statsBytes],signal,(m,[input,output,stats])=>{
  if(depth===16)m.HEAPU16.set(image.data,input/2);else m.HEAPU8.set(image.data,input);
  const accepted=depth===16?m._echo_derivatives16(input,image.width,image.height,start,rows,radius,output,stats):m._echo_derivatives(input,image.width,image.height,start,rows,radius,output,stats);
  if(!accepted)throw new EngineError('INVALID_INPUT','Echo derivatives rejected.');
  return{bytes:copyTypedArray(m.HEAPU8.subarray(output,output+n*layout.rawPixelBytes),{label:'echo-math-output'}),limits:copyTypedArray(m.HEAPF64.subarray(stats/8,stats/8+6),{label:'echo-math-output'}),...(depth===16?{inputDepth:16,rawKind:layout.rawKind}:{})};
 });
}
export function echoRender(bytes,limits,p,total,{signal,depth=8,rawKind}={}){
 const layout=echoLayout(depth,p.radius);
 requireValue(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length%layout.rawPixelBytes===0&&limits instanceof Float64Array&&limits.length===6&&limits.every(Number.isFinite)&&Number.isSafeInteger(total)&&total>=bytes.length/layout.rawPixelBytes&&(depth===8||rawKind===layout.rawKind),'Invalid Echo raw representation or global population.');
 return buffers([bytes.length,layout.statsBytes,bytes.length/4],signal,(m,[input,stats,output])=>{
  m.HEAPU8.set(bytes,input);m.HEAPF64.set(limits,stats/8);
  if(depth===16){if(!m._echo_render16(input,bytes.length/layout.rawPixelBytes,stats,total,p.radius,p.contrast,Number(p.grayscale),output))throw new EngineError('INVALID_INPUT','Native16 Echo rendering rejected.');}
  else m._echo_render(input,bytes.length/layout.rawPixelBytes,stats,total,p.contrast,Number(p.grayscale),output);
  return copyTypedArray(m.HEAPU8.subarray(output,output+bytes.length/4),{label:'echo-math-output'});
 });
}
