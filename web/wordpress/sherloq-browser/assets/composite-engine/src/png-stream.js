import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
const MiB=1024**2;
export function validatePngHeader(h){
 if(!({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]}[h.colorType]?.includes(h.depth))||h.compressionMethod!==0||h.filterMethod!==0||![0,1].includes(h.interlace))throw new EngineError('UNSUPPORTED_FORMAT','Unsupported PNG colour/depth or coding method.');
}
export function pngStreamPlan(width,height){
 requireValue([width,height].every(n=>Number.isInteger(n)&&n>0&&n<=65500),'PNG streaming dimensions must be within1–65500.');const rows=Math.min(32,height),rowBytes=width*3*rows,heapMaximumBytes=Math.ceil((16*MiB+width*128+rowBytes)/(16*MiB))*16*MiB;
 if(heapMaximumBytes>64*MiB)throw new EngineError('MEMORY_LIMIT','PNG decoder exceeds its bounded64MiB heap.');return {rows,rowBytes,heapMaximumBytes,workingBytes:heapMaximumBytes+rowBytes+8*MiB};
}
export async function decodePngRows(source,header,store,{budget,signal,onProgress,wasmBinary}={}){
 validatePngHeader(header);const {sourceWidth:width,sourceHeight:height}=header,plan=pngStreamPlan(width,height);requireValue(store.byteLength===width*height*3&&budget,'PNG output storage and shared budget required.');await controlCheckpoint(signal);const release=budget.reserve(plan.workingBytes);let m,pointer=0,cached,cursor=0,within=0,readCalls=0,readBytes=0;
 async function readEncoded(target,length){
  checkAbort(signal);requireValue(Number.isSafeInteger(length)&&length>=0&&cursor<=source.byteLength-length,'Truncated PNG encoded source.');let done=0;
  while(done<length){if(!cached||within===cached.bytes.length){cached?.release();cached=null;await controlCheckpoint(signal);cached=await source.read(cursor,Math.min(256*1024,source.byteLength-cursor),{signal});within=0;readCalls++;readBytes+=cached.bytes.length;}
   const count=Math.min(length-done,cached.bytes.length-within);m.HEAPU8.set(cached.bytes.subarray(within,within+count),target+done);within+=count;cursor+=count;done+=count;
  }
 }
 const call=async(name,types=[],args=[])=>{const result=await m.ccall(name,'number',types,args,{async:true});if(m.readFailure)throw m.readFailure;if(!result)throw new EngineError(m._png_stream_error()===2?'MEMORY_LIMIT':'INVALID_INPUT','Native PNG row decoder rejected the source.');checkAbort(signal);return result;};
 try{
  const {default:create}=await import('../vendor/png-stream/png-stream.js');m=await create({wasmMemory:new WebAssembly.Memory({initial:256,maximum:plan.heapMaximumBytes/65536}),readEncoded,...(wasmBinary?{wasmBinary}:{})});await call('png_stream_open');requireValue(m._png_stream_width()===width&&m._png_stream_height()===height,'PNG decoded dimensions disagree with metadata.');
  pointer=m._malloc(plan.rowBytes);if(!pointer)throw new EngineError('MEMORY_LIMIT','PNG row staging allocation failed.');const rows=new Uint8Array(plan.rowBytes),passes=m._png_stream_passes();let heapPeakBytes=m.HEAPU8.buffer.byteLength;
  for(let pass=0;pass<passes;pass++)for(let y=0;y<height;y+=plan.rows){
   await controlCheckpoint(signal);const count=Math.min(plan.rows,height-y),length=count*width*3,part=rows.subarray(0,length);if(pass)await store.readInto(part,y*width*3);else part.fill(0);m.HEAPU8.set(part,pointer);
   await call('png_stream_rows',['number','number'],[pointer,count]);part.set(m.HEAPU8.subarray(pointer,pointer+length));await store.write(part,y*width*3);checkAbort(signal);heapPeakBytes=Math.max(heapPeakBytes,m.HEAPU8.buffer.byteLength);onProgress?.((pass+(y+count)/height)/passes);
  }
  await call('png_stream_end');await store.flush?.();return {rowsPerChunk:plan.rows,passes,encodedReadCalls:readCalls,encodedReadBytes:readBytes,codecHeapCapacityBytes:Math.max(heapPeakBytes,m.HEAPU8.buffer.byteLength),codecHeapMaximumBytes:plan.heapMaximumBytes,workingReservationBytes:plan.workingBytes};
 }finally{cached?.release();if(m){m._png_stream_close();if(pointer)m._free(pointer);}release();}
}
