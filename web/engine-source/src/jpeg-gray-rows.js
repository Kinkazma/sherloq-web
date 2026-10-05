import {copyTypedArray} from './allocation.js';
import create from '../vendor/jpeg-gray/jpeg-gray.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
export async function decodeJpegGrayRows(source,header,store,{budget,signal,chunkBytes=4*1024**2,onProgress}={}){
 const width=header.sourceWidth,height=header.sourceHeight,rowBytes=width;
 requireValue(store.byteLength===width*height&&Number.isSafeInteger(chunkBytes)&&chunkBytes>=rowBytes,'Invalid JPEG scanline destination or staging size.');
 // Progressive coefficient storage is global inside libjpeg. Baseline decode
 // needs scanline working buffers, not a destination the size of the full image.
 const coefficients=header.progressive?Math.ceil(width/8)*Math.ceil(height/8)*64*6:0,
  fixed=Math.max(source.byteLength+coefficients+12*1024**2,0),available=budget.limit-budget.retained-budget.active-fixed-source.chunkBytes,
  rows=Math.min(height,Math.floor(chunkBytes/rowBytes),Math.floor(available/(rowBytes*2)));
 if(rows<1||fixed+rows*rowBytes>512*1024**2)throw new EngineError('MEMORY_LIMIT','JPEG encoded input/coefficient/scanline buffers exceed available RAM or the current codec WASM limit.');
 const release=budget.reserve(fixed+rows*rowBytes*2);let input=0,output=0,decoder=0,m,extraHeap=0;const heapReleases=[];
 const admitHeap=()=>{const extra=Math.max(0,m.HEAPU8.buffer.byteLength-fixed-rows*rowBytes-extraHeap);if(extra){heapReleases.push(budget.reserve(extra));extraHeap+=extra;}};
 try{
  m=await create();input=m._malloc(source.byteLength);output=m._malloc(rows*rowBytes);if(!input||!output)throw new EngineError('MEMORY_ALLOCATION','JPEG scanline allocation failed.');
  await source.visit((bytes,offset)=>m.HEAPU8.set(bytes,input+offset),{signal});checkAbort(signal);
  decoder=m._jpeg_rows_open(input,source.byteLength,width,height);if(!decoder)throw new EngineError(m._jpeg_rows_error()===2?'MEMORY_ALLOCATION':'INVALID_INPUT','JPEG scanline decoder could not open the source.');
  admitHeap();let y=0;while(y<height){await controlCheckpoint(signal);const count=m._jpeg_rows_read(decoder,output,rows);if(count<=0||count>rows||y+count>height)throw new EngineError(m._jpeg_rows_error()===2?'MEMORY_ALLOCATION':'INVALID_INPUT','JPEG scanline decode failed.');admitHeap();const bytes=copyTypedArray(m.HEAPU8.subarray(output,output+count*rowBytes),{label:'jpeg-gray-rows-output'});await store.write(bytes,y*rowBytes);checkAbort(signal);y+=count;onProgress?.(y/height);}
  if(!m._jpeg_rows_finish(decoder))throw new EngineError(m._jpeg_rows_error()===2?'MEMORY_ALLOCATION':'INVALID_INPUT','JPEG scanline decoder could not finish.');await store.flush();checkAbort(signal);
  return {rowsPerChunk:rows,encodedWorkingBytes:source.byteLength,coefficientAllowanceBytes:coefficients,workingReservationBytes:fixed+rows*rowBytes*2+extraHeap,codecHeapCapacityBytes:m.HEAPU8.buffer.byteLength};
 }finally{if(decoder)m._jpeg_rows_close(decoder);if(input)m._free(input);if(output)m._free(output);for(const done of heapReleases)done();release();}
}
