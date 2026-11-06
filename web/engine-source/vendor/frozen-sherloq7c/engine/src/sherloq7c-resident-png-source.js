import factory from '../vendor/png16-stream/png16-stream.js';
import {createResidentRgb16} from './sherloq7c-resident-memory.js';
import {cooperator} from './sherloq7c-math.js';
const MiB=1024**2,chunkBytes=65536,heapBytes=64*MiB;
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
// encoded is a Blob/File or a caller-owned read-only {byteLength, readInto}.
// Read-only source I/O is permitted; this decoder never writes an intermediate.
export async function createResidentPng16(encoded,{budget,signal,onProgress,segmentBytes}={}){
 const blob=typeof encoded?.slice==='function'&&Number.isSafeInteger(encoded?.size),size=blob?encoded.size:encoded?.byteLength;
 if(!Number.isSafeInteger(size)||size<=0||!blob&&typeof encoded?.readInto!=='function'||!budget?.reserve)throw fail('INVALID_INPUT','PNG16 requires a read-only Blob/File or a bounded byte reader.');
 const pause=cooperator(signal);await pause();const free=budget.reserve(heapBytes+2*chunkBytes);let m,memory,backing,buffer,bufferBacking,pointer=0,offset=0,source;
 try{
  memory=new WebAssembly.Memory({initial:256,maximum:heapBytes/65536});backing=budget.registerBacking?.('wasm',memory.buffer.byteLength,{identity:memory,owner:'sherloq7c-resident',label:'PNG16 source decoder'});
  buffer=new Uint8Array(chunkBytes);bufferBacking=budget.registerBacking?.('array-buffer',buffer.byteLength,{identity:buffer.buffer,owner:'sherloq7c-resident',label:'encoded PNG input band'});
  m=await factory({wasmMemory:memory,async readEncoded(target,length){
   if(length>size-offset)throw fail('INVALID_INPUT','PNG read exceeds the encoded source.');
   for(let at=0;at<length;at+=chunkBytes){
    if(signal?.aborted)throw fail('CANCELLED','PNG source decode cancelled.');const count=Math.min(chunkBytes,length-at);
    if(blob){const data=await encoded.slice(offset,offset+count).arrayBuffer();if(data.byteLength!==count)throw fail('INVALID_INPUT','Incomplete PNG input read.');m.HEAPU8.set(new Uint8Array(data),target+at);}
    else{await encoded.readInto(buffer.subarray(0,count),offset,{signal});m.HEAPU8.set(buffer.subarray(0,count),target+at);}
    offset+=count;
   }
  }});
  const call=async(name,types=[],args=[])=>{const ok=await m.ccall('png_stream_'+name,'number',types,args,{async:true});backing?.resize?.(m.HEAPU8.buffer.byteLength);if(m.readFailure)throw m.readFailure;if(!ok)throw fail(m._png_stream_error()===2?'MEMORY_ALLOCATION':'INVALID_INPUT','Native PNG16 decoder rejected the source.');if(signal?.aborted)throw fail('CANCELLED','PNG source decode cancelled.');};
  await call('open',['number'],[0]);const width=m._png_stream_width(),height=m._png_stream_height(),passes=m._png_stream_passes(),rowSamples=3*width,rowsPerBand=Math.max(1,Math.min(32,Math.floor(4*MiB/(rowSamples*2))));
  pointer=m._malloc(rowSamples*rowsPerBand*2);if(!pointer)throw fail('MEMORY_ALLOCATION','PNG decoded-band allocation failed.');
  source=await createResidentRgb16({width,height,passes,async readRows(top,rows,target,{pass}){
   for(let y=0;y<rows;y+=rowsPerBand){const count=Math.min(rowsPerBand,rows-y),part=target.subarray(y*rowSamples,(y+count)*rowSamples);
    if(passes>1)m.HEAPU16.set(part,pointer/2);
    await call('rows',['number','number'],[pointer,count]);part.set(m.HEAPU16.subarray(pointer/2,pointer/2+part.length));await pause();onProgress?.({phase:'decode-png16',pass:pass+1,passes,rows:top+y+count,totalRows:height});
   }
  }},{budget,signal,segmentBytes});await call('end');return source;
 }catch(error){source?.release();throw error;}
 finally{if(m){m._png_stream_close();if(pointer)m._free(pointer);}source=null;m=memory=buffer=encoded=null;backing?.();bufferBacking?.();free();}
}
