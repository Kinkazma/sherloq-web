import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
const MiB=1024**2;
export function validateTiffHeader(h){
 if(h.orientation>=5)throw new EngineError('UNSUPPORTED_FORMAT','Transposed TIFF orientations remain unavailable pending native file-loader parity.');
 const depths={0:[1,8,16],1:[1,8,16],2:[8,16],3:[8]};
 if(!depths[h.photometric]?.includes(h.depth)||![1,2,3,4,5,8,32946,32773].includes(h.compression??1))throw new EngineError('UNSUPPORTED_FORMAT','This TIFF depth, photometric mode or compression has not been verified.');
 if([2,3,4].includes(h.compression)&&(![0,1].includes(h.photometric)||h.depth!==1))throw new EngineError('UNSUPPORTED_FORMAT','CCITT TIFF is qualified only for bilevel grayscale.');
}
export function tiffStreamPlan(header){
 validateTiffHeader(header);const width=header.sourceWidth,height=header.sourceHeight,tiled=header.tileWidth!==undefined||header.tileHeight!==undefined;
 requireValue([width,height].every(n=>Number.isInteger(n)&&n>0&&n<=65500),'TIFF streaming dimensions must be within1–65500.');
 const blockWidth=tiled?header.tileWidth:width,blockHeight=tiled?header.tileHeight:Math.min(height,header.directories[0].entries.find(e=>e.tag===278)?.value??height);
 requireValue([blockWidth,blockHeight].every(n=>Number.isSafeInteger(n)&&n>0),'Invalid TIFF block dimensions.');const pixels=blockWidth*blockHeight,bandBytes=width*Math.min(height,blockHeight)*3;
 requireValue(Number.isSafeInteger(pixels)&&Number.isSafeInteger(bandBytes),'TIFF block size exceeds the safe range.');const heapMaximumBytes=Math.ceil((16*MiB+24*pixels)/(16*MiB))*16*MiB;
 if(heapMaximumBytes>256*MiB)throw new EngineError('MEMORY_LIMIT','Native TIFF block exceeds the bounded256MiB heap; source block layout was preserved.');return {blockWidth,blockHeight,bandBytes,heapMaximumBytes,workingBytes:heapMaximumBytes+bandBytes+8*MiB};
}
export async function decodeTiffBlocks(source,header,store,{budget,signal,onProgress,wasmBinary}={}){
 const plan=tiffStreamPlan(header),width=header.sourceWidth,height=header.sourceHeight;requireValue(store.byteLength===width*height*3&&budget,'TIFF output storage and shared budget required.');await controlCheckpoint(signal);const release=budget.reserve(plan.workingBytes);let m,cached,cacheOffset=0,readCalls=0,readBytes=0;
 async function readEncoded(target,length,offset){
  checkAbort(signal);requireValue(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(length)&&length>=0&&offset<=source.byteLength-length,'TIFF read exceeds encoded source.');let done=0;
  while(done<length){const at=offset+done;if(!cached||at<cacheOffset||at>=cacheOffset+cached.bytes.length){cached?.release();cached=null;await controlCheckpoint(signal);cacheOffset=at;cached=await source.read(at,Math.min(256*1024,source.byteLength-at),{signal});readCalls++;readBytes+=cached.bytes.length;}
   const within=at-cacheOffset,count=Math.min(length-done,cached.bytes.length-within);m.HEAPU8.set(cached.bytes.subarray(within,within+count),target+done);done+=count;
  }
 }
 const call=async(name,types=[],args=[])=>{const result=await m.ccall(name,'number',types,args,{async:true});if(m.readFailure)throw m.readFailure;if(!result)throw new EngineError(m._tiff_stream_error()===2?'MEMORY_LIMIT':'INVALID_INPUT','Native TIFF block decoder rejected the source.');checkAbort(signal);return result;};
 try{
  const {default:create}=await import('../vendor/tiff-stream/tiff-stream.js');m=await create({wasmMemory:new WebAssembly.Memory({initial:256,maximum:plan.heapMaximumBytes/65536}),readEncoded,...(wasmBinary?{wasmBinary}:{})});await call('tiff_stream_open',['number','number'],[source.byteLength,plan.heapMaximumBytes/2]);requireValue(m._tiff_stream_width()===width&&m._tiff_stream_height()===height&&m._tiff_stream_block_width()===plan.blockWidth&&m._tiff_stream_block_height()===plan.blockHeight,'TIFF block layout disagrees with metadata.');
  const band=new Uint8Array(plan.bandBytes);let peak=m.HEAPU8.buffer.byteLength,blocks=0;
  for(let y=0;y<height;y+=plan.blockHeight){const rows=Math.min(plan.blockHeight,height-y);
   for(let x=0;x<width;x+=plan.blockWidth){await controlCheckpoint(signal);await call('tiff_stream_block',['number','number'],[x,y]);const w=m._tiff_stream_out_width(),h=m._tiff_stream_out_height(),pointer=m._tiff_stream_data();requireValue(w===Math.min(plan.blockWidth,width-x)&&h===rows,'TIFF output block shape differs.');
    for(let row=0;row<h;row++)band.set(m.HEAPU8.subarray(pointer+row*w*3,pointer+(row+1)*w*3),(row*width+x)*3);blocks++;peak=Math.max(peak,m.HEAPU8.buffer.byteLength);onProgress?.((y+rows*Math.min(width,x+w)/width)/height);
   }
   const outputY=header.orientation===3||header.orientation===4?height-y-rows:y;await store.write(band.subarray(0,rows*width*3),outputY*width*3);checkAbort(signal);
  }
  await store.flush?.();return {blocks,blockWidth:plan.blockWidth,blockHeight:plan.blockHeight,encodedReadCalls:readCalls,encodedReadBytes:readBytes,codecHeapCapacityBytes:peak,codecHeapMaximumBytes:plan.heapMaximumBytes,workingReservationBytes:plan.workingBytes};
 }finally{cached?.release();m?._tiff_stream_close();release();}
}
