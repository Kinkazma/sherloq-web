import "../../runtime-context.js?v=0.14.5";
import {EngineError} from './errors.js';
import {wasmAllocationFailure,allocateWasmMemory} from './allocation.js';
import {wasmRange,closeMemoryRanges} from './memory-range.js';
export function createGrayStreamKernel({writeEncoded,readEncoded}){
 let m,pointer,width,height;
 async function native(name,types=[],args=[]){const ok=await m.ccall(name,'number',types,args,{async:true});if(m.ioFailure)throw m.ioFailure;if(!ok)throw (m._gray_stream_error()===2?wasmAllocationFailure(m,'Global grayscale JPEG native allocation failed'):new EngineError('COMPUTE_FAILED','Global grayscale JPEG kernel failed'));}
 return {async execute(data){
  let result={};
  if(data.action==='init'){
   width=data.width;height=data.height;const{default:create}=await import('../vendor/jpeg-gray-stream/jpeg-gray-stream.js');m=await create({wasmMemory:allocateWasmMemory({initial:256,maximum:data.heapBytes/65536}),writeEncoded:(pointer,length)=>writeEncoded(wasmRange(m,pointer,length)),readEncoded:async(pointer,length)=>readEncoded(wasmRange(m,pointer,length))});pointer=m._malloc(width*3*32);if(!pointer)throw wasmAllocationFailure(m,'JPEG worker row allocation failed',width*3*32);
  }else if(data.action==='open')await native('gray_stream_open',['number','number','number'],[width,height,data.quality]);
  else if(data.action==='write'){m.HEAPU8.set(data.bytes,pointer);await native('gray_stream_write',['number','number'],[pointer,data.bytes.length/(width*3)]);}
  else if(data.action==='begin-read'){await native('gray_stream_end_write');await native('gray_stream_begin_read',['number','number'],[width,height]);}
  else if(data.action==='loss'){
   const count=data.bytes.length/(width*3);m.HEAPU8.set(data.bytes,pointer);
   const loss=await m.ccall('gray_stream_read_loss','number',['number','number'],[pointer,count],{async:true});if(m.ioFailure)throw m.ioFailure;if(loss<0)throw (m._gray_stream_error()===2?wasmAllocationFailure(m,'Global grayscale JPEG native allocation failed'):new EngineError('COMPUTE_FAILED','Global grayscale JPEG read failed'));result={loss};
  }else if(data.action==='close'){await native('gray_stream_end_read');m._gray_stream_close();}
  else throw Object.assign(Error('Invalid JPEG curve worker action'),{code:'INVALID_INPUT'});
  return {...result,heapBytes:m.HEAPU8.buffer.byteLength};
 },dispose(){if(m){closeMemoryRanges(m);m._gray_stream_close();if(pointer)m._free(pointer);}m=null;pointer=0;}};
}
