import {Budget} from './cache.js';
import {createElaCellRows} from './ela-cell-stream.js';
import {wasmAllocationFailure,allocateTypedArray,allocateWasmMemory,copyTypedArray} from './allocation.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {EngineError,serializeEngineError,deserializeEngineError} from './errors.js';
import {numpySum} from './numpy-sum.js';
let m,pointer,width,height,cols,ioSerial=0,mode,block,cellBudget,reader,cellResult;const waiting=new Map();
function io(kind,payload,transfer=[]){const id=++ioSerial;return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});try{protocol.post({io:kind,id,...payload},transfer);}catch(error){waiting.delete(id);reject(error);}});}
async function native(name,types=[],args=[]){const ok=await m.ccall(name,'number',types,args,{async:true});if(m.ioFailure)throw m.ioFailure;if(!ok)throw (m._rgb_stream_error()===2?wasmAllocationFailure(m,'Global JPEG worker native allocation failed'):new EngineError('COMPUTE_FAILED','Global JPEG worker failed'));}
const protocol=installWorkerMessageProtocol(self,async data=>{
 if(data.ioReply){const job=waiting.get(data.id);if(job){waiting.delete(data.id);data.error?job.reject(deserializeEngineError(data.error)):job.resolve(data.bytes);}return;}
 try{let result={};
  if(data.action==='init'){
   width=data.width;height=data.height;mode=data.mode??'ghost';block=data.block;cellBudget=mode==='cells'?new Budget(data.descriptorBytes):null;cols=Math.floor(width/16);const{default:create}=await import('../vendor/jpeg-rgb-stream/jpeg-rgb-stream.js');m=await create({wasmMemory:allocateWasmMemory({initial:256,maximum:data.heapBytes/65536},{label:'jpeg-quality-heap'}),writeEncoded:async(pointer,length)=>{const bytes=copyTypedArray(m.HEAPU8.subarray(pointer,pointer+length),{label:'jpeg-quality-write'});await io('write',{bytes},[bytes.buffer]);},readEncoded:async(pointer,length)=>{const bytes=await io('read',{length});m.HEAPU8.set(bytes,pointer);return bytes.length;}});pointer=m._malloc(width*3*32);if(!pointer)throw Object.assign(Error('JPEG worker row allocation failed'),{code:'MEMORY_ALLOCATION',details:{allocationKind:'wasm',requestedBytes:width*3*32}});
  }else if(data.action==='open'){if(mode==='cells')reader=await createElaCellRows(width,height,block,{budget:cellBudget});await native('rgb_stream_open',['number','number','number'],[width,height,data.quality]);}
  else if(data.action==='write'){m.HEAPU8.set(data.bytes,pointer);await native('rgb_stream_write',['number','number'],[pointer,data.bytes.length/(width*3)]);}
  else if(data.action==='begin-read'){await native('rgb_stream_end_write');await native('rgb_stream_begin_read',['number','number'],[width,height]);}
  else if(data.action==='blocks'){
   const count=data.bytes.length/(width*3);await native('rgb_stream_read',['number','number'],[pointer,count]);const decoded=m.HEAPU8.subarray(pointer,pointer+data.bytes.length);
   if(mode==='cells')await reader.push(data.bytes,decoded,{y:data.y,rows:count});else{const blocks=allocateTypedArray(Float64Array,Math.floor(count/16)*cols,{label:'ghost-worker-band'}),terms=allocateTypedArray(Float64Array,256,{label:'ghost-worker-sum'});
   for(let local=0;local+16<=count;local+=16)for(let bx=0;bx<cols;bx++){let at=0;for(let yy=0;yy<16;yy++)for(let xx=0;xx<16;xx++){const i=((local+yy)*width+bx*16+xx)*3;let sum=0;for(let c=0;c<3;c++){const d=data.bytes[i+c]-decoded[i+c];sum+=d*d;}terms[at++]=sum/3;}blocks[local/16*cols+bx]=numpySum(terms)/256;}result={blocks};}
  }else if(data.action==='close'){await native('rgb_stream_end_read');m._rgb_stream_close();if(mode==='cells'){cellResult=await reader.finish();const {release,...cell}=cellResult;result={cell};reader=null;}}
  else throw Object.assign(Error('Invalid Ghost worker action'),{code:'INVALID_INPUT'});
  protocol.post({result:{...result,heapBytes:m.HEAPU8.buffer.byteLength+(reader?64*1024**2:0)}},result.cell?Object.values(result.cell).filter(ArrayBuffer.isView).map(a=>a.buffer):result.blocks?[result.blocks.buffer]:[]);cellResult?.release();cellResult=null;
 }catch(error){reader?.dispose();reader=null;cellResult?.release();cellResult=null;if(!protocol.failed)protocol.post({error:serializeEngineError(error,'WORKER_FAILED')});}
},{label:'ghost-stream-worker.js',onFailure(error){for(const job of waiting.values())job.reject(error);waiting.clear();self.postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}});
