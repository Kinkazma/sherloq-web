import {numpySum} from './numpy-sum.js';
let m,pointer,width,height,cols,ioSerial=0;const waiting=new Map();
function io(kind,payload,transfer=[]){const id=++ioSerial;return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});self.postMessage({io:kind,id,...payload},transfer);});}
async function native(name,types=[],args=[]){const ok=await m.ccall(name,'number',types,args,{async:true});if(m.ioFailure)throw m.ioFailure;if(!ok)throw Object.assign(Error('Global JPEG worker failed'),{code:m._rgb_stream_error()===2?'MEMORY_LIMIT':'COMPUTE_FAILED'});}
self.onmessage=async({data})=>{
 if(data.ioReply){const job=waiting.get(data.id);if(job){waiting.delete(data.id);data.error?job.reject(Object.assign(Error(data.error.message),{code:data.error.code})):job.resolve(data.bytes);}return;}
 try{let result={};
  if(data.action==='init'){
   width=data.width;height=data.height;cols=Math.floor(width/16);const{default:create}=await import('../vendor/jpeg-rgb-stream/jpeg-rgb-stream.js');m=await create({wasmMemory:new WebAssembly.Memory({initial:256,maximum:data.heapBytes/65536}),writeEncoded:async(pointer,length)=>{const bytes=m.HEAPU8.slice(pointer,pointer+length);await io('write',{bytes},[bytes.buffer]);},readEncoded:async(pointer,length)=>{const bytes=await io('read',{length});m.HEAPU8.set(bytes,pointer);return bytes.length;}});pointer=m._malloc(width*3*32);if(!pointer)throw Object.assign(Error('JPEG worker row allocation failed'),{code:'MEMORY_LIMIT'});
  }else if(data.action==='open')await native('rgb_stream_open',['number','number','number'],[width,height,data.quality]);
  else if(data.action==='write'){m.HEAPU8.set(data.bytes,pointer);await native('rgb_stream_write',['number','number'],[pointer,data.bytes.length/(width*3)]);}
  else if(data.action==='begin-read'){await native('rgb_stream_end_write');await native('rgb_stream_begin_read',['number','number'],[width,height]);}
  else if(data.action==='blocks'){
   const count=data.bytes.length/(width*3);await native('rgb_stream_read',['number','number'],[pointer,count]);const blocks=new Float64Array(Math.floor(count/16)*cols),terms=new Float64Array(256),decoded=m.HEAPU8.subarray(pointer,pointer+data.bytes.length);
   for(let local=0;local+16<=count;local+=16)for(let bx=0;bx<cols;bx++){let at=0;for(let yy=0;yy<16;yy++)for(let xx=0;xx<16;xx++){const i=((local+yy)*width+bx*16+xx)*3;let sum=0;for(let c=0;c<3;c++){const d=data.bytes[i+c]-decoded[i+c];sum+=d*d;}terms[at++]=sum/3;}blocks[local/16*cols+bx]=numpySum(terms)/256;}result={blocks};
  }else if(data.action==='close'){await native('rgb_stream_end_read');m._rgb_stream_close();}
  else throw Object.assign(Error('Invalid Ghost worker action'),{code:'INVALID_INPUT'});
  self.postMessage({result:{...result,heapBytes:m.HEAPU8.buffer.byteLength}},result.blocks?[result.blocks.buffer]:[]);
 }catch(error){self.postMessage({error:{code:error.code??'WORKER_FAILED',message:error.message}});}
};
