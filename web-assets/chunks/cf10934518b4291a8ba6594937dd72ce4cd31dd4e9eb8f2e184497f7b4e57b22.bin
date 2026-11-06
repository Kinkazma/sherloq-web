import "../../runtime-context.js?v=0.31.0";
import {wasmAllocationFailure,allocateWasmMemory,allocateTypedArray} from './allocation.js';
import {tiffOriginalMemoryPlan,admitTiffOriginalHeap,tiffEncodedReadRange,unsignedTiffPointer} from './tiff-original-memory.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {rawRgb8StripPlan,decodeRawRgb8Strips} from './tiff-raw-rgb8-strips.js';
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
 requireValue([blockWidth,blockHeight].every(n=>Number.isSafeInteger(n)&&n>0),'Invalid TIFF block dimensions.');const pixels=blockWidth*blockHeight,bandBytes=tiled?width*Math.min(height,blockHeight)*3:0;
 requireValue(Number.isSafeInteger(pixels)&&Number.isSafeInteger(bandBytes),'TIFF block size exceeds the safe range.');const heapMaximumBytes=Math.ceil((16*MiB+24*pixels)/(16*MiB))*16*MiB;
 if(heapMaximumBytes>256*MiB){const raw=rawRgb8StripPlan(header);if(raw)return raw;}
 return tiffOriginalMemoryPlan(header);
}
export async function decodeTiffBlocks(source,header,store,{budget,signal,onProgress,wasmBinary,moduleFactory,memoryFactory=allocateWasmMemory}={}){
 const plan=tiffStreamPlan(header),width=header.sourceWidth,height=header.sourceHeight;if(plan.strategy==='uncompressed-rgb8-strip-windows')return decodeRawRgb8Strips(source,header,store,{budget,signal,onProgress,plan});requireValue(store.byteLength===width*height*3&&budget,'TIFF output storage and shared budget required.');await controlCheckpoint(signal);
 let m,memory,cached,band,bandBacking,heapBacking,nativeBorrow,admission,ioWorkspace,cacheOffset=0,readCalls=0,readBytes=0,peak=0,primary,failed=false,closing,closed=false;
 const cleanupOwner={snapshot:()=>({closed,codec:!!m,bandBytes:band?.byteLength??0,cachedBytes:cached?.bytes?.byteLength??0,nativeBorrowed:!!nativeBorrow,admission:admission?.snapshot()??null}),dispose(){if(closed)return Promise.resolve();if(closing)return closing;closing=(async()=>{
  await retireNativeBorrow();if(cached){cached.release();cached=null;}if(m){peak=Math.max(peak,m.HEAPU8.buffer.byteLength);heapBacking?.materialize(peak);m._tiff_stream_close();m=null;}memory=null;band=null;
  if(bandBacking){const retired=await bandBacking();bandBacking=null;if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??plan.bandBytes);}
  if(heapBacking){const retired=await heapBacking();heapBacking=null;if(retired!==0)budget.notifyBackingRelease?.('wasm',retired??peak);}
  if(admission){await admission.release();admission=null;}if(ioWorkspace){await ioWorkspace.release();ioWorkspace=null;}closed=true;
 })().finally(()=>{closing=null;});return closing;}};
 async function retireNativeBorrow(){if(!nativeBorrow)return;const answer=await nativeBorrow();if(answer===false||answer===0)throw answer;nativeBorrow=null;}
 async function readEncoded(target,length,offset){
  checkAbort(signal);({target,length,offset}=tiffEncodedReadRange(target,length,offset,m.HEAPU8.byteLength,source.byteLength));let done=0;
  while(done<length){const at=offset+done;if(!cached||at<cacheOffset||at>=cacheOffset+cached.bytes.length){cached?.release();cached=null;await controlCheckpoint(signal);cacheOffset=at;cached=await source.read(at,Math.min(plan.readCacheBytes,source.byteLength-at),{signal});readCalls++;readBytes+=cached.bytes.length;}
   const within=at-cacheOffset,count=Math.min(length-done,cached.bytes.length-within);requireValue(count>0,'TIFF source returned an incomplete encoded range.');m.HEAPU8.set(cached.bytes.subarray(within,within+count),target+done);done+=count;
  }
 }
 const call=async(name,types=[],args=[])=>{const result=await m.ccall(name,'number',types,args,{async:true});if(m.readFailure)throw m.readFailure;if(!result)throw (m._tiff_stream_error()===2?wasmAllocationFailure(m,'Native TIFF block decoder rejected the source.'):new EngineError('INVALID_INPUT','Native TIFF block decoder rejected the source.'));checkAbort(signal);return result;};
 try{
  // Existing IndexedDB staging is pinned before codec admission. OPFS needs
  // no such window. Encoded reads retain their own actual central owners.
  ioWorkspace=store.pinIoWorkspace?.();admission=admitTiffOriginalHeap(plan,{budget});
  if(plan.tiled){band=allocateTypedArray(Uint8Array,plan.bandBytes,{label:'original-tiff-band'});bandBacking=budget.registerBacking?.('array-buffer',plan.bandBytes,{owner:'source',label:'original-tiff-band',identity:band.buffer});}
  const create=moduleFactory??(await import('../vendor/tiff-stream/tiff-stream.js')).default;
  heapBacking=budget.registerBacking?.('wasm',admission.heapMaximumBytes,{owner:'source',label:'original-tiff-codec',state:'reserved'});
  memory=memoryFactory(admission.descriptor,{label:'original-tiff-codec'});peak=memory?.buffer?.byteLength??0;heapBacking?.materialize(peak);
  m=await create({wasmMemory:memory,readEncoded,...(wasmBinary?{wasmBinary}:{})});
  await call('tiff_stream_open',['number','number'],[source.byteLength,admission.singleAllocationMaximumBytes]);requireValue(m._tiff_stream_width()===width&&m._tiff_stream_height()===height&&m._tiff_stream_block_width()===plan.blockWidth&&m._tiff_stream_block_height()===plan.blockHeight,'TIFF block layout disagrees with metadata.');
  peak=m.HEAPU8.buffer.byteLength;heapBacking?.materialize(peak);let blocks=0,nativeStripWrites=0;
  for(let y=0;y<height;y+=plan.blockHeight){const rows=Math.min(plan.blockHeight,height-y),outputY=header.orientation===3||header.orientation===4?height-y-rows:y;
   for(let x=0;x<width;x+=plan.blockWidth){await controlCheckpoint(signal);await call('tiff_stream_block',['number','number'],[x,y]);const w=m._tiff_stream_out_width(),h=m._tiff_stream_out_height();requireValue(w===Math.min(plan.blockWidth,width-x)&&h===rows,'TIFF output block shape differs.');const pointer=unsignedTiffPointer(m._tiff_stream_data(),m.HEAPU8.byteLength,w*h*3);
    if(plan.tiled)for(let row=0;row<h;row++)band.set(m.HEAPU8.subarray(pointer+row*w*3,pointer+(row+1)*w*3),(row*width+x)*3);blocks++;peak=Math.max(peak,m.HEAPU8.buffer.byteLength);heapBacking?.materialize(peak);onProgress?.((y+rows*Math.min(width,x+w)/width)/height);
    if(!plan.tiled){
     // A native strip is already a contiguous full-width RGB band. Keep the
     // codec/backing borrowed until the existing store has consumed this view;
     // no next native call, heap growth or free is allowed before its write ACK.
     nativeBorrow=heapBacking?.pin?.();await store.write(m.HEAPU8.subarray(pointer,pointer+w*h*3),outputY*width*3,{signal});await retireNativeBorrow();nativeStripWrites++;checkAbort(signal);
    }
   }
   if(plan.tiled){await store.write(band.subarray(0,rows*width*3),outputY*width*3,{signal});checkAbort(signal);}
  }
  await store.flush?.();return {blocks,bandBytes:plan.bandBytes,outputWriteStrategy:plan.tiled?'tile-band':'native-strip-direct',nativeStripWrites,blockWidth:plan.blockWidth,blockHeight:plan.blockHeight,encodedReadCalls:readCalls,encodedReadBytes:readBytes,codecHeapCapacityBytes:peak,codecHeapMaximumBytes:admission.heapMaximumBytes,workingReservationBytes:admission.reservedWorkingBytes,codecMemoryPolicy:admission.snapshot()};
 }catch(error){primary=error;failed=true;throw error;}
 finally{try{await cleanupOwner.dispose();}catch(cleanup){if(failed&&primary&&typeof primary==='object'&&Object.isExtensible(primary)){primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];primary.cleanupOwner=cleanupOwner;throw primary;}const error=new AggregateError(failed?[primary,cleanup]:[cleanup],'Original TIFF resource retirement did not acknowledge.');error.code='CLEANUP_FAILED';error.cleanupOwner=cleanupOwner;throw error;}}
}
