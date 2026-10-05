import "../../runtime-context.js?v=0.14.5";
import createModule from '../vendor/jpeg-stream/jpeg-stream.js';
let m,pointer=0,stream=0,width,height,rows;
const failure=()=>Object.assign(new Error('JPEG scanline worker rejected data.'),{code:m._stream_error()===2?'MEMORY_LIMIT':'INVALID_INPUT'});
self.onmessage=async({data})=>{
 try{
  const {action}=data;let loss;
  if(action==='init'){
   ({width,height,rows}=data);m=await createModule({wasmMemory:new WebAssembly.Memory({initial:256,maximum:data.heapBytes/65536})});pointer=m._malloc(width*rows*3);if(!pointer)throw Object.assign(new Error('JPEG row staging allocation failed.'),{code:'MEMORY_LIMIT'});
  }else if(action==='open'){stream=m._stream_open(width,height,data.quality);if(!stream)throw failure();}
  else if(action==='begin-read'){if(!m._stream_begin_read(stream))throw failure();}
  else if(action==='write'||action==='loss'){
   const count=data.bytes.length/(width*3);if(!Number.isInteger(count)||count<1||count>rows)throw failure();m.HEAPU8.set(data.bytes,pointer);
   if(action==='write'){if(!m._stream_write(stream,pointer,count))throw failure();}else{loss=m._stream_read_loss(stream,pointer,count);if(loss<0)throw failure();}
  }else if(action==='close'){m._stream_close(stream);stream=0;}
  else throw Object.assign(new Error('Invalid JPEG stream command.'),{code:'INVALID_INPUT'});
  self.postMessage({loss,heapBytes:m.HEAPU8.buffer.byteLength});
 }catch(error){self.postMessage({error:error.code??(error instanceof WebAssembly.RuntimeError?'MEMORY_ALLOCATION':'WORKER_FAILED')});}
};
