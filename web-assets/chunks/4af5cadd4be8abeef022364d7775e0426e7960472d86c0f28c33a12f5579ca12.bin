import "../../runtime-context.js?v=0.14.5";
import {allocateWasmMemory,copyTypedArray} from './allocation.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {EngineError,serializeEngineError,deserializeEngineError} from './errors.js';
import {createEnergyRows,energyStreamBytes} from './energy-stream.js';import {Budget} from './cache.js';
let m,pointer,width,height,filter,y,ioSerial=0;const waiting=new Map();
function io(kind,payload,transfer=[]){const id=++ioSerial;return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});try{protocol.post({io:kind,id,...payload},transfer);}catch(error){waiting.delete(id);reject(error);}});}
async function native(name,types=[],args=[]){const ok=await m.ccall(name,'number',types,args,{async:true});if(m.ioFailure)throw m.ioFailure;if(!ok)throw new EngineError(m._rgb_stream_error()===2?'MEMORY_ALLOCATION':'COMPUTE_FAILED','Global JPEG worker failed',{details:m._rgb_stream_error()===2?{allocationKind:'wasm',currentBytes:m.HEAPU8.byteLength}:undefined});}
const protocol=installWorkerMessageProtocol(self,async data=>{
 if(data.ioReply){const job=waiting.get(data.id);if(job){waiting.delete(data.id);data.error?job.reject(deserializeEngineError(data.error)):job.resolve(data.bytes);}return;}
 try{let result={};
  if(data.action==='init'){
   width=data.width;height=data.height;const{default:create}=await import('../vendor/jpeg-rgb-stream/jpeg-rgb-stream.js');m=await create({wasmMemory:allocateWasmMemory({initial:256,maximum:data.heapBytes/65536},{label:'energy-jpeg-heap'}),writeEncoded:async(pointer,length)=>{const bytes=copyTypedArray(m.HEAPU8.subarray(pointer,pointer+length),{label:'energy-jpeg-write'});await io('write',{bytes},[bytes.buffer]);},readEncoded:async(pointer,length)=>{const bytes=await io('read',{length});m.HEAPU8.set(bytes,pointer);return bytes.length;}});pointer=m._malloc(width*3*32);if(!pointer)throw new EngineError('MEMORY_ALLOCATION','JPEG worker row allocation failed',{details:{allocationKind:'wasm',requestedBytes:width*3*32,currentBytes:m.HEAPU8.byteLength}});
  }else if(data.action==='open'){await native('rgb_stream_open',['number','number','number'],[width,height,data.quality]);y=0;filter=createEnergyRows(width,height,{budget:new Budget(energyStreamBytes(width,height)),write:async(bytes,row)=>{const copy=copyTypedArray(bytes,{label:'energy-output-row'});await io('energy',{bytes:copy,y:row},[copy.buffer]);}});}
  else if(data.action==='write'){m.HEAPU8.set(data.bytes,pointer);await native('rgb_stream_write',['number','number'],[pointer,data.bytes.length/(width*3)]);}
  else if(data.action==='begin-read'){await native('rgb_stream_end_write');await native('rgb_stream_begin_read',['number','number'],[width,height]);}
  else if(data.action==='energy'){
   const rows=data.bytes.length/(width*3);await native('rgb_stream_read',['number','number'],[pointer,rows]);await filter.push(data.bytes,m.HEAPU8.subarray(pointer,pointer+data.bytes.length),{y,rows});y+=rows;
  }else if(data.action==='close'){await native('rgb_stream_end_read');await filter.finish();filter.dispose();filter=null;m._rgb_stream_close();}
  else throw Object.assign(Error('Invalid energy worker action'),{code:'INVALID_INPUT'});
  protocol.post({result:{...result,heapBytes:m.HEAPU8.buffer.byteLength}});
 }catch(error){if(!protocol.failed)protocol.post({error:serializeEngineError(error,'WORKER_FAILED')});}
},{label:'energy-stream-worker.js',onFailure(error){for(const job of waiting.values())job.reject(error);waiting.clear();self.postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}});
