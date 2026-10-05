import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort,checkpoint,requireValue} from './errors.js';
export const CONTRAST_HEAP_BYTES=64*1024**2;let pending,ready;
export async function initContrastWasm({wasmBinary}={}){const {default:create}=await import('../vendor/contrast/contrast.js');pending=create(wasmBinary?{wasmBinary}:{});ready=await pending;return ready;}
export const contrastHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
async function instance(){try{return ready??(pending?await pending:await initContrastWasm());}catch{pending=null;throw new EngineError('CODEC_UNAVAILABLE','Local contrast arithmetic module could not load.');}}
async function buffers(sizes,signal,fn){await checkpoint(signal);const m=await instance();checkAbort(signal);const pointers=[];try{for(const size of sizes){const p=m._malloc(size);if(!p)throw new EngineError('MEMORY_LIMIT','Contrast allocation exceeds its fixed64MiB heap.');pointers.push(p);}const result=fn(m,pointers);checkAbort(signal);return result;}finally{for(const p of pointers)m._free(p);}}
function checked(status){if(status!==1)throw new EngineError(status===-1?'MEMORY_LIMIT':'INVALID_INPUT','Contrast arithmetic rejected its input or failed.');}
export function contrastRows(image,start,rows,block,{signal}={}){
 requireValue([image.width,image.height,start,rows,block].every(Number.isSafeInteger)&&image.width>0&&image.height>0&&start>=0&&rows>0&&start+rows<=image.height&&[32,64,128,256].includes(block)&&image.width%block===0&&rows%block===0&&image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3,'Invalid contrast padded rows.');
 const size=image.width/block*(rows/block)*12;return buffers([image.data.length,size],signal,(m,[input,out])=>{m.HEAPU8.set(image.data,input);checked(m._contrast_rows(input,image.width,image.height,start,rows,block,out));return m.HEAPF32.slice(out/4,(out+size)/4);});
}
export function contrastCells(maps,mode,{signal}={}){
 requireValue(Number.isSafeInteger(maps.cols)&&Number.isSafeInteger(maps.rows)&&maps.cols>0&&maps.rows>0&&maps.values instanceof Float32Array&&maps.values.length===maps.cols*maps.rows*3&&[0,1,2].includes(mode),'Invalid contrast maps.');
 return buffers([maps.values.byteLength,maps.cols*maps.rows],signal,(m,[input,out])=>{m.HEAPF32.set(maps.values,input/4);checked(m._contrast_cells(input,maps.cols,maps.rows,mode,out));return m.HEAPU8.slice(out,out+maps.cols*maps.rows);});
}

export function releaseContrastWasm(){ready=null;pending=null;}
