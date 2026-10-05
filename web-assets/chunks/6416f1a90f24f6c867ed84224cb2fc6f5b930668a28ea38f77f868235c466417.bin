import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
const MiB=1024**2;
export function streamedHashPlan(width,height){
 requireValue([width,height].every(n=>Number.isInteger(n)&&n>0&&n<=65500),'Perceptual-hash dimensions must be within the native JPEG range.');
 const heapMaximumBytes=Math.ceil((32*MiB+1620*Math.max(width,height)+8*(height+1)+width*38*6)/(16*MiB))*16*MiB;
 if(heapMaximumBytes>256*MiB)throw new EngineError('MEMORY_LIMIT','Native hash projection workspace exceeds the bounded 256 MiB heap.');
 return {heapMaximumBytes,workingBytes:heapMaximumBytes+8*MiB,rows:32};
}
// Native resizes gather their exact supporting rows. Gaussian kernels include
// their full halo; radial projections retain native global coordinates/counts.
export async function streamedImageHashes(surface,{account,signal,onProgress,wasmBinary,algorithms=[0,1,2,3,4,5]}={}){
 const {width,height,format}=surface.descriptor;requireValue(format==='rgb8'&&typeof account==='function','RGB8 surface and shared memory admission required.');
 requireValue(Array.isArray(algorithms)&&algorithms.length>0&&algorithms.every(k=>Number.isInteger(k)&&k>=0&&k<=5)&&new Set(algorithms).size===algorithms.length,'Invalid perceptual-hash selection.');
 const plan=streamedHashPlan(width,height);await controlCheckpoint(signal);const release=account(plan.workingBytes);let m,pointer=0,capacity=0;
 try{
  const {default:create}=await import('../vendor/digest-stream/digest-stream.js');
  m=await create({wasmMemory:new WebAssembly.Memory({initial:256,maximum:plan.heapMaximumBytes/65536}),...(wasmBinary?{wasmBinary}:{})});checkAbort(signal);
  const hashes={};let peakHeapBytes=m.HEAPU8.buffer.byteLength,reads=0,maxWindowBytes=0;
  const definitions=[['Average',Uint8Array],['Block mean',Uint8Array],['Color moments',Float64Array],['Marr-Hildreth',Uint8Array],['pHash',Uint8Array],['Radial variance',Uint8Array]];
  for(const [ordinal,kind]of algorithms.entries()){const [name,Type]=definitions[kind];
   await controlCheckpoint(signal);if(!m._hash_stream_begin(width,height,kind))throw new EngineError('MEMORY_LIMIT','Native hash workspace allocation failed.');
   const total=kind===5?height:m._hash_stream_side(),step=kind===5?plan.rows:1;let previousStart=-1,previousRows=0;
   for(let y=0;y<total;y+=step){
    if(y%16===0)await controlCheckpoint(signal);else checkAbort(signal);const count=Math.min(step,total-y);if(!m._hash_stream_rows(y,count))throw new EngineError('COMPUTE_FAILED','Native hash row request failed.');
    const rows=m._hash_stream_count(),start=m._hash_stream_start(),bytes=width*rows*3;
    if(bytes>capacity){if(pointer)m._free(pointer);pointer=0;capacity=0;pointer=m._malloc(bytes);if(!pointer)throw new EngineError('MEMORY_LIMIT','Native hash source-row allocation failed.');capacity=bytes;}
    if(start!==previousStart||rows!==previousRows){const window=await surface.readWindow({x:0,y:start,width,height:rows},{signal});
     try{checkAbort(signal);m.HEAPU8.set(window.pixels.data,pointer);}finally{window.release();}previousStart=start;previousRows=rows;reads++;
    }
    if(!m._hash_stream_feed(pointer,y,count))throw new EngineError('COMPUTE_FAILED','Native hash row calculation failed.');
    maxWindowBytes=Math.max(maxWindowBytes,bytes);peakHeapBytes=Math.max(peakHeapBytes,m.HEAPU8.buffer.byteLength);onProgress?.((ordinal+(y+count)/total)/algorithms.length);
   }
   if(!m._hash_stream_finish())throw new EngineError('COMPUTE_FAILED','Native perceptual hash finalization failed.');checkAbort(signal);
   const bytes=m.HEAPU8.slice(m._digest_data(),m._digest_data()+m._digest_size());hashes[name]=new Type(bytes.buffer);peakHeapBytes=Math.max(peakHeapBytes,m.HEAPU8.buffer.byteLength);m._hash_stream_close();
  }
  return {hashes,metrics:{wasmHeapPeakBytes:peakHeapBytes,wasmMaximumBytes:plan.heapMaximumBytes,sourceWindowReads:reads,maxSourceWindowBytes:maxWindowBytes}};
 }finally{if(m){m._hash_stream_close();if(pointer)m._free(pointer);}release();}
}
