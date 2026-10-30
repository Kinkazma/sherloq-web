import "../../runtime-context.js?v=0.30.0";
import {magnifierParams,magnifierRegion,magnifierLuts} from './magnifier.js';
import {gray} from './pixel-utils.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {EngineError,checkAbort,controlCheckpoint,normalizeResourceError} from './errors.js';

/** The same native clipped-ROI enhancement, using one histogram over all
 * admitted observations in the ROI. No outside/negative observation reaches
 * clipping bounds, equalization or gray/channel histograms. */
export async function sourceRegionMagnifier({task,original,view,domain,budget,signal,onProgress,publishResult}){
 const params=magnifierParams(task.params),region=magnifierRegion(domain,params),[x0,y0,x1,y1]=region.bounds,{width,height}=region;
 let count=0;
 for(let y=y0;y<y1;y++){
  if((y&31)===0)await controlCheckpoint(signal);
  for(const[a,b]of domain.rowIntervals(y))count+=Math.max(0,Math.min(x1,b)-Math.max(x0,a));
 }
 checkAbort(signal);
 if(!width||!height||!count)return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',data:{bounds:region.bounds,empty:true,observations:0},metrics:{observations:0},semantics:'No admitted native observations in the clipped magnifier region; no pixels computed.'};
 let output,mask,surface,maskSurface,published=false,failure,lease;
 const make=bytes=>createSegmentedBytes(bytes,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal});
 const cacheKey=task.imageId+'\0source-region/magnifier-histogram/'+domain.fingerprint+'/'+region.bounds.join(','),cached=budget.get(cacheKey)?.value;
 let hist=cached?.hist,windowPixels;
 function* pieces(){for(const r of view.admittedRectangles()){
  const left=Math.max(x0,r.x),top=Math.max(y0,r.y),right=Math.min(x1,r.x+r.width),bottom=Math.min(y1,r.y+r.height);
  if(right<=left||bottom<=top)continue;
  const step=Math.min(windowPixels,right-left),rows=Math.max(1,Math.floor(windowPixels/step));
  for(let y=top;y<bottom;y+=rows)for(let x=left;x<right;x+=step)yield{x,y,width:Math.min(step,right-x),height:Math.min(rows,bottom-y)};
 }}
 try{
  output=await make(width*height*3);mask=await make(width*height);
  lease=budget.reserve(4*256*8+4096);
  windowPixels=Math.min(65536,Math.floor((budget.limit-budget.active-budget.retained)/12));
  if(windowPixels<1)throw new EngineError('MEMORY_LIMIT','Native magnifier output and an admitted histogram window do not fit.');
  if(hist){if(cached.count!==count)throw new EngineError('SOURCE_REGIONS_INVALID','Cached magnifier observations differ from their immutable native domain.');}
  else{
   hist=Array.from({length:4},()=>new Float64Array(256));let done=0;
   for(const rect of pieces()){
    await controlCheckpoint(signal);const borrowed=await view.readWindow(rect,{signal});
    try{const bytes=borrowed.pixels.data;for(let i=0;i<bytes.length;i+=3){hist[0][bytes[i]]++;hist[1][bytes[i+1]]++;hist[2][bytes[i+2]]++;hist[3][gray(bytes[i],bytes[i+1],bytes[i+2])]++;}}finally{borrowed.release();}
    done+=rect.width*rect.height;onProgress?.({phase:'source-region-magnifier-histogram',completed:done,total:count});
   }
   checkAbort(signal);budget.put(cacheKey,{value:{hist,count},byteLength:4*256*8+64},[task.imageId]);
  }
  windowPixels=Math.min(65536,Math.floor((budget.limit-budget.active-budget.retained)/12));
  if(windowPixels<1)throw new EngineError('MEMORY_LIMIT','The cached magnifier histogram and a native mapping window do not fit.');
  const luts=magnifierLuts(hist,count,params),rowWidth=Math.min(windowPixels,width),rows=Math.max(1,Math.floor(windowPixels/rowWidth));
  // Display-only background; it is never supplied to LUT/statistic generation.
  for(let y=0;y<height;y+=rows)for(let x=0;x<width;x+=rowWidth){
   await controlCheckpoint(signal);const w=Math.min(rowWidth,width-x),h=Math.min(rows,height-y),borrowed=await original.surface.readWindow({x:domain.origin[0]+x0+x,y:domain.origin[1]+y0+y,width:w,height:h},{signal});let zeros;
   try{zeros=budget.reserve(w*h);const clear=new Uint8Array(w*h);for(let row=0;row<h;row++){await output.write(borrowed.pixels.data.subarray(row*w*3,(row+1)*w*3),((y+row)*width+x)*3);await mask.write(clear.subarray(row*w,(row+1)*w),(y+row)*width+x);}}finally{zeros?.();borrowed.release();}
  }
  let done=0;
  for(const rect of pieces()){
   await controlCheckpoint(signal);const borrowed=await view.readWindow(rect,{signal});let scratch;
   try{scratch=budget.reserve(rect.width*rect.height*4);const data=new Uint8Array(borrowed.pixels.data.length),valid=new Uint8Array(rect.width*rect.height).fill(1);for(let i=0;i<data.length;i++)data[i]=luts[i%3][borrowed.pixels.data[i]];for(let row=0;row<rect.height;row++){const at=(rect.y-y0+row)*width+rect.x-x0;await output.write(data.subarray(row*rect.width*3,(row+1)*rect.width*3),at*3);await mask.write(valid.subarray(row*rect.width,(row+1)*rect.width),at);}}finally{scratch?.();borrowed.release();}
   done+=rect.width*rect.height;onProgress?.({phase:'source-region-magnifier-map',completed:done,total:count});
  }
  await output.flush();await mask.flush();checkAbort(signal);
  surface=createRgbSurface(output,{width,height,budget});maskSurface=createMaskSurface(mask,{width,height,budget,range:[0,1],semantics:'1=admitted observation used by magnifier ROI histogram and LUT;0=unanalysed original display.'});
  const data={bounds:region.bounds,empty:false,observations:count},metrics={histogramCached:!!cached,observations:count,sourceRegionPolicy:'native-roi-admitted-global-magnifier-histograms'},semantics='Native clipped magnifier ROI, with global admitted-only channel/gray histograms, exact native clipping/equalization LUTs, unchanged native pixel grid and separate ROI origin.';
  const record={surface,maskRecords:{analysis_scope:{surface:maskSurface}},data,metrics,semantics},bundle=publishResult(task.imageId,record);published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,data,metrics,semantics,layers:[{id:task.operation,kind:'rgb',origin:[x0,y0],range:[0,255]}],provenance:{params,excludedParticipation:'omitted-before-roi-histogram-and-lut',presentationOutsideDomain:'original-unanalysed',originalEncodedBytesPreserved:true}};
 }catch(error){failure=normalizeResourceError(error);throw failure;}
 finally{
  lease?.();if(!published){const errors=[];for(const owner of [surface??output,maskSurface??mask])if(owner)try{await owner.dispose();}catch(error){errors.push(error);}if(errors.length){if(failure)failure.details={...failure.details,cleanupErrors:errors.map(e=>({code:e.code,message:e.message}))};else throw errors[0];}}
 }
}
