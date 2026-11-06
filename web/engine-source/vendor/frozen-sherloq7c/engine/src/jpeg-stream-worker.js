import {EngineError,serializeEngineError} from './errors.js';
import {wasmAllocationFailure,allocateWasmMemory} from './allocation.js';
import createModule from '../vendor/jpeg-stream/jpeg-stream.js';
let m,pointer=0,stream=0,width,height,rows;
const failure=()=>m._stream_error()===2?wasmAllocationFailure(m,'JPEG native allocation failed.'):new EngineError('INVALID_INPUT','JPEG scanline worker rejected data.');
self.onmessage=async({data})=>{
 try{
  const {action}=data;let loss;
  if(action==='init'){
   ({width,height,rows}=data);m=await createModule({wasmMemory:allocateWasmMemory({initial:256,maximum:data.heapBytes/65536})});pointer=m._malloc(width*rows*3);if(!pointer)throw wasmAllocationFailure(m,'JPEG row staging allocation failed.',width*rows*3);
  }else if(action==='open'){stream=m._stream_open(width,height,data.quality);if(!stream)throw failure();}
  else if(action==='begin-read'){if(!m._stream_begin_read(stream))throw failure();}
  else if(action==='write'||action==='loss'){
   const count=data.bytes.length/(width*3);if(!Number.isInteger(count)||count<1||count>rows)throw failure();m.HEAPU8.set(data.bytes,pointer);
   if(action==='write'){if(!m._stream_write(stream,pointer,count))throw failure();}else{loss=m._stream_read_loss(stream,pointer,count);if(loss<0)throw failure();}
  }else if(action==='close'){m._stream_close(stream);stream=0;}
  else throw Object.assign(new Error('Invalid JPEG stream command.'),{code:'INVALID_INPUT'});
  self.postMessage({loss,heapBytes:m.HEAPU8.buffer.byteLength});
 }catch(error){self.postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}
};
