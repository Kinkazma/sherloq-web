import {pixelStripPool} from './pixel-strip-pool.js';import {pixelStripStage} from './pixel-strip-stage.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,normalizeResourceError} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';import {OPENCV_OPERATIONS} from './opencv-operations.js';

// Full oriented rows preserve the native vector-prefix/scalar-tail arithmetic.
// Arbitrary pixel batches or orientation after conversion can change HSV/HLS.
export async function segmentedColorSpaces(image,params,{budget,signal,onProgress,rowsPerBlock,maxWorkers=1}={}){
 const d=image.surface.descriptor,w=d.width,h=d.height,n=w*h,operation=OPENCV_OPERATIONS['colors.space'];
 requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid color-space row group.');checkAbort(signal);
 const ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 const pool=pixelStripPool(image,budget,{maxWorkers,heapBytes:32*1024**2,pixelBytes:64});let output,planning,staging;let blocks=0,readMs=0,kernelMs=0,writeMs=0;const started=performance.now();
 try{
  // Include initial/growing OpenCV heap allowance before choosing output storage.
  // The caller separately admits already resident codec heaps.
  const overhead=32*1024**2+ioBytes,minimum=overhead+w*67+Math.max(w,h)*3;
  planning=budget.reserve(minimum);
  output=await createSegmentedBytes(n*3,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  planning();planning=null;
  const available=budget.limit-budget.retained-budget.active-overhead-Math.max(w,h)*3;
  const rows=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(262144/w)),Math.floor(available/(w*67)));
  if(rows<1)throw new EngineError('MEMORY_LIMIT','One oriented color-space row does not fit the shared budget.');
  staging=budget.reserve(overhead+w*rows*64);
  let completed=0;
  await pool.run({count:Math.ceil(h/rows),pixels:w*rows,key:'color/'+w+'/'+rows,signal,prepareBytes:w*(rows+1)*3,
   prepare:async i=>{const at=performance.now(),y=i*rows,height=Math.min(rows,h-y),window=await image.surface.readWindow({x:0,y,width:w,height},{signal});try{readMs+=performance.now()-at;return {op:'color',rgb:window.pixels.data,width:w,height,params};}finally{window.release();}},
   local:pixelStripStage,
   consume:async(part,i)=>{checkAbort(signal);const at=performance.now(),y=i*rows;await output.write(part.bytes,y*w*3);writeMs+=performance.now()-at;blocks++;completed+=Math.min(rows,h-y);onProgress?.(completed/h);}
  });
  await output.flush();checkAbort(signal);
  const surface=createRgbSurface(output,{width:w,height:h,budget});
  return{surface,semantics:'Native color channels at full resolution; oriented row width and vector/scalar tails preserved. Derived grayscale RGB visualization; original unchanged.',metrics:{...pool.metrics(),totalMs:performance.now()-started,readMs,kernelMs,writeMs,blocks,rowsPerBlock:rows,storage:output.storage,retainedResultBytes:n*3}};
 }catch(error){await output?.dispose();throw normalizeResourceError(error);}finally{pool.clear();planning?.();staging?.();}
}
