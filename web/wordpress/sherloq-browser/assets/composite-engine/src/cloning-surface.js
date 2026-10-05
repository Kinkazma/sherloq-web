import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {checkAbort,controlCheckpoint} from './errors.js';

// Preserve native global raster drawing. Once that phase is finished, publish
// owned segmented storage for original-sized windows and the shared PNG exporter.
export async function createCloningSurface(image,result,{budget,signal,knownHeapBytes=0}={}){
 const pixels=result.pixels,release=budget.reserve(pixels.data.byteLength+knownHeapBytes);let store,complete=false;
 try{
  store=await createSegmentedBytes(pixels.data.byteLength,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  for(let at=0;at<pixels.data.length;at+=4*1024**2){await controlCheckpoint(signal);await store.write(pixels.data.subarray(at,at+4*1024**2),at);}await store.flush();checkAbort(signal);
  const surface=createRgbSurface(store,{width:pixels.width,height:pixels.height,budget});complete=true;return {surface,provenance:result.provenance,storage:store.storage};
 }finally{release();if(!complete)await store?.dispose();}
}
