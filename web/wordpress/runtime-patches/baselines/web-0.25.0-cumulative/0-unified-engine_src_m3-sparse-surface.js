import {renderSparseCopy} from './sparse-copy-view.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {checkAbort} from './errors.js';
// Native global drawing is retained. Rendering happens after feature workers are
// released and is admitted separately; storage/window reads do not redraw fits.
export async function createSparseSurface(image,data,view,{budget,signal}={}){
 const releases=[],reserveMemory=n=>{const f=budget.reserve(n);releases.push(f);return f;};let source,store,complete=false;
 try{
  source=image.pixels?{pixels:image.pixels,release(){}}:await image.surface.readWindow({}, {signal});
  const {pixels,...style}=await renderSparseCopy(source.pixels,data,view,{signal,reserveMemory});
  source.release();source=null;
  store=await createSegmentedBytes(pixels.data.byteLength,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  for(let at=0;at<pixels.data.length;at+=4*1024**2){checkAbort(signal);await store.write(pixels.data.subarray(at,at+4*1024**2),at);}await store.flush();checkAbort(signal);
  const surface=createRgbSurface(store,{width:pixels.width,height:pixels.height,budget});complete=true;return {surface,...style};
 }finally{source?.release();releases.forEach(f=>f());if(!complete)await store?.dispose();}
}
