// The consumer must finish consuming each borrowed chunk before write resolves.
// No encoded image store, Blob, canvas or temporary-storage fallback is created.
import factory from '../vendor/png16-export/png16-export.js';
import {cooperator} from './sherloq7c-math.js';
const MiB=1024**2,fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
export function residentPngPlan(width,height){
 if(![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=65500))throw fail('INVALID_INPUT','PNG dimensions must be within 1–65500.');
 const rowBytes=6*width,rows=Math.max(1,Math.min(32,height,Math.floor(4*MiB/rowBytes))),heapMaximumBytes=Math.ceil((8*MiB+rowBytes*40+512*1024)/(16*MiB))*16*MiB;
 if(heapMaximumBytes>64*MiB)throw fail('MEMORY_LIMIT','PNG encoder exceeds the bounded workspace.');
 return{rowBytes,rows,heapMaximumBytes};
}
// Called by result.pipePng while the result owns an active reader.
export async function pipeResidentPng(output,writable,{budget,compression=6,signal,onProgress,maxBytes=Infinity}={}){
 if(!writable?.getWriter||!Number.isInteger(compression)||compression<0||compression>9||!(maxBytes===Infinity||Number.isSafeInteger(maxBytes)&&maxBytes>0))throw fail('INVALID_INPUT','PNG export needs a WritableStream, compression 0–9 and a positive byte limit.');
 const plan=residentPngPlan(output.width,output.height),pause=cooperator(signal);await pause();
 const free=budget.reserve(plan.heapMaximumBytes);let writer,m,pointer=0,backing,written=0,calls=0,peak=0,primary,failed=false;
 try{
  writer=writable.getWriter();
  const memory=new WebAssembly.Memory({initial:256,maximum:plan.heapMaximumBytes/65536});
  backing=budget.registerBacking?.('wasm',memory.buffer.byteLength,{identity:memory,owner:'sherloq7c-resident',label:'streaming PNG16 encoder'});
  m=await factory({wasmMemory:memory,async writeEncoded(at,length){
   if(signal?.aborted)throw fail('CANCELLED','PNG export cancelled.');
   if(length>maxBytes-written)throw fail('EXPORT_LIMIT','Encoded PNG exceeds its requested byte limit.');
   // libpng is suspended by Asyncify until the sink has consumed these bytes.
   await writer.write(m.HEAPU8.subarray(at,at+length));written+=length;calls++;
  }});
  const call=async(name,types=[],args=[])=>{const ok=await m.ccall('png16_export_'+name,'number',types,args,{async:true});backing?.resize?.(m.HEAPU8.buffer.byteLength);peak=Math.max(peak,m.HEAPU8.buffer.byteLength);if(m.writeFailure)throw m.writeFailure;if(!ok)throw fail(m._png16_export_error()===2?'MEMORY_ALLOCATION':'COMPUTE_FAILED','Native PNG16 encoder failed.');if(signal?.aborted)throw fail('CANCELLED','PNG export cancelled.');};
  pointer=m._malloc(plan.rowBytes*plan.rows);if(!pointer)throw fail('MEMORY_ALLOCATION','PNG source-band allocation failed.');
  await call('open',['number','number','number','number'],[output.width,output.height,3,compression]);
  for(let y=0;y<output.height;y+=plan.rows){
   await pause();const rows=Math.min(plan.rows,output.height-y),part=await output.readWindow({x:0,y,width:output.width,height:rows},{format:'rgb16',signal});
   try{m.HEAPU16.set(part.data,pointer/2);}finally{part.release();}
   await call('rows',['number','number'],[pointer,rows]);onProgress?.({phase:'encode-png16',rows:y+rows,totalRows:output.height});
  }
  await call('end');await writer.close();
 }catch(error){primary=error;failed=true;try{await writer?.abort(error);}catch{}}
 finally{if(m){m._png16_export_close();if(pointer)m._free(pointer);}m=null;backing?.();free();writer?.releaseLock();}
 if(failed)throw primary;
 return{mime:'image/png',bitDepth:16,width:output.width,height:output.height,byteLength:written,encodedWriteCalls:calls,codecHeapBytes:peak,codecHeapMaximumBytes:plan.heapMaximumBytes,maxSourceWindowBytes:plan.rowBytes*plan.rows,temporaryDiskBytes:0,storage:'stream'};
}
