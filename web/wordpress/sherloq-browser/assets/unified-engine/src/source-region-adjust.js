import "../../runtime-context.js?v=0.30.0";
import {sourceRegionAdjustNeighborhood} from './source-region-adjust-neighborhood.js';
import {EngineError,checkAbort,normalizeResourceError} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {OPENCV_OPERATIONS} from './opencv-operations.js';
import {ADJUST_HEAP_BYTES,adjustHeapBytes,adjustScopedLocalRows,adjustScopedMapRows,adjustOtsu} from './adjust-math.js';
import {equalizeHistogramLut,gray} from './pixel-utils.js';

// Otsu and global value equalization omit nonmembers from their histograms.
// CLAHE/sharpening delegate to their strict native-support adapter. No excluded
// source value is passed to the native prefix kernel.
export async function sourceRegionAdjust({task,original,view,domain,budget,signal,onProgress,publishResult}){
 const p=OPENCV_OPERATIONS['inspection.adjust'].validate(task.params);
 if(p.sharpen!==0||p.equalize>1)return sourceRegionAdjustNeighborhood({task,original,view,domain,budget,signal,onProgress,publishResult});
 const width=domain.width,height=domain.height,bytes=width*height*3,count=domain.countIncluded;
 if(count>2147483647)throw new EngineError('INVALID_INPUT','Adjustment exceeds the native integer histogram domain.');
 let heapOwnership,output,surface,published=false;const extraHeap=Math.max(0,ADJUST_HEAP_BYTES-adjustHeapBytes());const valueHistogram=p.equalize?new Float64Array(256):null,grayHistogram=new Int32Array(256);let blocks=0,completed=0;
 let windowPixels;
 function* pieces(){for(const region of view.admittedRectangles()){
  const step=Math.min(region.width,windowPixels),rows=Math.max(1,Math.floor(windowPixels/step));
  for(let y=region.y;y<region.y+region.height;y+=rows)for(let x=region.x;x<region.x+region.width;x+=step)yield{x,y,width:Math.min(step,region.x+region.width-x),height:Math.min(rows,region.y+region.height-y)};
 }}
 try{
  heapOwnership=budget.reserve(extraHeap);
  output=await createSegmentedBytes(bytes,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal});
  // The retained destination owns memory before any useful source window is
  // admitted. Planning against the pre-output headroom can reject a perfectly
  // valid smaller native window during the first scientific pass.
  windowPixels=Math.min(262144,Math.floor((budget.limit-budget.retained-budget.active)/12));
  if(windowPixels<1)throw new EngineError('MEMORY_LIMIT','Membership adjustment cannot admit its native arithmetic heap and a pixel window.');
  // Original pixels outside the analyzed domain are presentation only.
  const rows=Math.max(1,Math.min(height,Math.floor(262144/width)));
  for(let y=0;y<height;y+=rows){checkAbort(signal);const h=Math.min(rows,height-y),window=await original.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width,height:h},{signal});try{await output.write(window.pixels.data,y*width*3);}finally{window.release();}}
  async function write(bytes,rect){for(let row=0;row<rect.height;row++)await output.write(bytes.subarray(row*rect.width*3,(row+1)*rect.width*3),((rect.y+row)*width+rect.x)*3);}
  async function read(rect){const data=new Uint8Array(rect.width*rect.height*3);for(let row=0;row<rect.height;row++)await output.readInto(data.subarray(row*rect.width*3,(row+1)*rect.width*3),((rect.y+row)*width+rect.x)*3);return data;}
  const addGray=bytes=>{for(let i=0;i<bytes.length;i+=3)grayHistogram[gray(bytes[i],bytes[i+1],bytes[i+2])]++;};
  await view.visitIncluded(async(pixels,{rect})=>{
   const release=budget.reserve(pixels.data.length*3);
   try{checkAbort(signal);const value=await adjustScopedLocalRows(pixels,p,0,rect.height,rect.x,width,{signal});if(valueHistogram){for(let i=2;i<value.length;i+=3)valueHistogram[value[i]]++;}else addGray(value);await write(value,rect);blocks++;completed+=rect.width*rect.height;onProgress?.({phase:'source-region-adjust-prefix',fraction:.5*completed/count});}finally{release();}
  },{signal,windowPixels});
  if(valueHistogram){const tables=equalizeHistogramLut(valueHistogram,count);completed=0;
   for(const rect of pieces()){checkAbort(signal);const release=budget.reserve(rect.width*rect.height*9);
    try{const prefix=await read(rect),pw=Math.ceil(width/8)*8,ph=Math.ceil(height/8)*8,mapped=await adjustScopedMapRows(prefix,rect.width,rect.height,rect.x,rect.y,width,pw,ph,1,tables,{signal});addGray(mapped);await write(mapped,rect);completed+=rect.width*rect.height;onProgress?.({phase:'source-region-adjust-equalize',fraction:.5+.3*completed/count});}finally{release();}
   }
  }
  const threshold=p.threshold===0?await adjustOtsu(grayHistogram,count,{signal}):p.threshold;
  if(p.threshold<255||p.invert){completed=0;for(const rect of pieces()){checkAbort(signal);const release=budget.reserve(rect.width*rect.height*3);
   try{const bytes=await read(rect);for(let i=0;i<bytes.length;i++){const value=p.threshold<255?(bytes[i]>threshold?255:0):bytes[i];bytes[i]=p.invert?255-value:value;}await write(bytes,rect);completed+=rect.width*rect.height;onProgress?.({phase:'source-region-adjust-finish',fraction:.8+.2*completed/count});}finally{release();}
  }}
  await output.flush();checkAbort(signal);surface=createRgbSurface(output,{width,height,budget});
  const semantics='Native adjustment order and arithmetic on admitted rectangles; global value equalization and Otsu histograms count admitted pixels only. Excluded pixels retain the original solely for display.';
  const metrics={blocks,includedPixels:count,excludedPixels:width*height-count,otsuThreshold:p.threshold===0?threshold:null,storage:output.storage,sourceRegionPolicy:'native-pointwise-and-membership-global-histograms'},record={surface,semantics,metrics},bundle=publishResult(task.imageId,record);published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,semantics,metrics,provenance:{params:p,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted',presentationOutsideDomain:'original-unanalysed'}};
 }catch(error){if(!published){if(surface)await surface.dispose();else await output?.dispose();}throw normalizeResourceError(error);}finally{heapOwnership?.();}
}
