import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
import {requireValue,checkAbort,controlCheckpoint,EngineError} from './errors.js';
const MiB=1024**2,IO=256*1024;
/** Native global Q100/4:4:4 companion using M5's pinned scanline codec. The
 * network receives the companion-decoded RGB, not the original PNG RGB. */
export async function catnetCompanionSource(image,{budget,getTemporarySession,signal,onProgress}={}){
 const {width,height}=image.surface.descriptor,rows=Math.min(32,height),rowBytes=width*3,heap=Math.ceil((8*MiB+rowBytes*48)/(16*MiB))*16*MiB,capacity=Math.ceil(width/8)*8*Math.ceil(height/8)*8*24+65536,lease=budget.reserve(heap+8*MiB+IO+rowBytes*rows);let encoded,rgb,module,pointer,written=0,buffered=0,readOffset=0,complete=false;
 try{
  encoded=await createSegmentedBytes(capacity,{budget,getTemporarySession,storage:capacity>budget.limit/12?'temporary':'memory',signal});const writeBuffer=new Uint8Array(IO),hash=await createSHA256();
  const flush=async()=>{if(buffered){const bytes=writeBuffer.subarray(0,buffered);await encoded.write(bytes,written);hash.update(bytes);written+=buffered;buffered=0;}};
  const writeEncoded=async(at,length)=>{checkAbort(signal);requireValue(written+buffered+length<=capacity,'Companion encoded capacity exceeded.');for(let off=0;off<length;){const n=Math.min(length-off,IO-buffered);writeBuffer.set(module.HEAPU8.subarray(at+off,at+off+n),buffered);buffered+=n;off+=n;if(buffered===IO)await flush();}};
  const readEncoded=async(at,length)=>{checkAbort(signal);const count=Math.min(length,written-readOffset);if(count>0){await encoded.readInto(module.HEAPU8.subarray(at,at+count),readOffset);readOffset+=count;}return count;};
  const factory=(await import('../vendor/jpeg-rgb-stream/jpeg-rgb-stream.js')).default;module=await factory({wasmMemory:new WebAssembly.Memory({initial:256,maximum:heap/65536}),writeEncoded,readEncoded});
  const call=async(name,types=[],args=[])=>{const ok=await module.ccall(name,'number',types,args,{async:true});if(module.ioFailure)throw module.ioFailure;if(!ok)throw new EngineError('PREPARATION_FAILED','CAT-Net Q100 companion codec failed: '+name);checkAbort(signal);};
  pointer=module._malloc(rowBytes*rows);if(!pointer)throw new EngineError('MEMORY_ALLOCATION','Companion row staging allocation failed.');
  await call('rgb_stream_open_444',['number','number','number'],[width,height,100]);
  for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const count=Math.min(rows,height-y),part=await image.surface.readWindow({x:0,y,width,height:count},{signal});try{module.HEAPU8.set(part.pixels.data,pointer);await call('rgb_stream_write',['number','number'],[pointer,count]);}finally{part.release();}onProgress?.({phase:'catnet-companion-encode',completed:y+count,total:height});}
  await call('rgb_stream_end_write');await flush();await encoded.flush();const sha256=hash.digest('hex');
  rgb=await createSegmentedBytes(width*height*3,{budget,getTemporarySession,storage:width*height*3>Math.min(budget.limit/12,(budget.limit-budget.total())/4)?'temporary':'memory',signal});
  await call('rgb_stream_begin_read',['number','number'],[width,height]);for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const count=Math.min(rows,height-y);await call('rgb_stream_read',['number','number'],[pointer,count]);await rgb.write(module.HEAPU8.subarray(pointer,pointer+rowBytes*count),y*rowBytes);onProgress?.({phase:'catnet-companion-decode',completed:y+count,total:height});}await call('rgb_stream_end_read');await rgb.flush();
  const surface=createRgbSurface(rgb,{width,height,orientation:1,budget,ownsStore:false});let disposed=false,encodedReleased=false;
  const source={byteLength:written,async visit(visitor,{signal}={}){requireValue(!disposed&&!encodedReleased,'Companion source disposed.');const scratch=budget.reserve(MiB);try{const data=new Uint8Array(Math.min(MiB,written));for(let at=0;at<written;at+=data.length){await controlCheckpoint(signal);const part=data.subarray(0,Math.min(data.length,written-at));await encoded.readInto(part,at);await visitor(part,at);}}finally{scratch();}}};
  complete=true;return {segmented:true,source,store:rgb,surface,sha256,metrics:{quality:100,sampling:'444',encodedBytes:written,encodedCapacityBytes:capacity,encodedStorage:encoded.storage,rgbStorage:rgb.storage,codecHeapMaximumBytes:heap},async releaseEncoded(){if(encodedReleased)return;encodedReleased=true;await encoded.dispose();},async release(){if(disposed)return;disposed=true;await surface.dispose();await rgb.dispose();await encoded.dispose();}};
 }finally{try{if(module){module._rgb_stream_close();if(pointer)module._free(pointer);}if(!complete){await rgb?.dispose();await encoded?.dispose();}}finally{lease();}}
}
