import "../../runtime-context.js?v=0.25.0";
import {createRamByteCache,ramByteCacheBytes} from './ram-byte-cache.js';
import {EngineError,checkAbort,createCooperator,normalizeResourceError} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {OPENCV_OPERATIONS} from './opencv-operations.js';
import {ADJUST_HEAP_BYTES,adjustHeapBytes,adjustScopedMaskedLocalRows,adjustScopedClaheTables,adjustScopedObservedMapRows,adjustOtsu} from './adjust-math.js';
import {equalizeHistogramLut,gray} from './pixel-utils.js';
import {sourceRegionLocalCores,sourceRegionLocalSupport} from './source-region-local-support.js';
const reflected=(i,n)=>{if(n===1)return 0;const x=i%(2*(n-1));return Math.min(x,2*(n-1)-x);};
// Native sharpen support is admitted before the source is read. CLAHE keeps
// the enclosing native 8x8 tile geometry and counts only admitted observations;
// a tile with no observations never invents a distribution for a useful pixel.
export async function sourceRegionAdjustNeighborhood({task,original,view,domain,budget,signal,onProgress,publishResult}){
 const p=OPENCV_OPERATIONS['inspection.adjust'].validate(task.params),width=domain.width,height=domain.height,n=width*height,halo=Math.floor(p.sharpen/4),cooperate=createCooperator(signal),cores=()=>sourceRegionLocalCores(domain,{radius:0,maxWidth:128,maxHeight:32});
 if(n>2147483647)throw new EngineError('INVALID_INPUT','Adjustment exceeds the native integer histogram domain.');
 let prefixPixels=0;for(const c of cores())prefixPixels+=c.width*c.height;
 if(!prefixPixels)throw new EngineError('SOURCE_SCOPE_EMPTY','The selection contains no adjustment centres.',{details:{selectedPixels:domain.countIncluded,analysedPixels:0,halo}});
 const padded=width%8!==0||height%8!==0,pw=padded?width+8-width%8:width,ph=padded?height+8-height%8:height,tw=pw/8,th=ph/8;
 const make=bytes=>createSegmentedBytes(bytes,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal});
 const workingBytes=Math.max(0,ADJUST_HEAP_BYTES-adjustHeapBytes())+(128+2*halo)*(32+2*halo)*32+width*8+512*1024,cacheBytes=ramByteCacheBytes(n*3,2048)+ramByteCacheBytes(n,2048),cacheKey=task.imageId+'\0source-region/adjust-admitted-boundary-v2/'+domain.fingerprint+'/'+JSON.stringify([p.brightness,p.saturation,p.hue,p.gamma,p.shadows,p.highlights,p.sweep,p.width,halo,p.equalize]);
 let borrowedCache=budget.take(cacheKey);if(borrowedCache&&borrowedCache.byteLength+workingBytes+n*4>budget.limit-budget.total())borrowedCache=null;
 let cacheLease,pendingCache,output,scope,surface,scopeSurface,working,published=false,failure,tables,grayHistogram,histogram,areas,blocks=0,reads=0,analysed=0;
 async function read(store,rect,channels){const bytes=new Uint8Array(rect.width*rect.height*channels);for(let y=0;y<rect.height;y++)await store.readInto(bytes.subarray(y*rect.width*channels,(y+1)*rect.width*channels),((rect.y+y)*width+rect.x)*channels);return bytes;}
 async function write(store,rect,bytes,channels){for(let y=0;y<rect.height;y++)await store.write(bytes.subarray(y*rect.width*channels,(y+1)*rect.width*channels),((rect.y+y)*width+rect.x)*channels);}
 async function readSupport(rect){
  const data=new Uint8Array(rect.width*rect.height*3),mask=new Uint8Array(rect.width*rect.height);let active=new Map();
  async function consume(r){const window=await view.readWindow(r,{signal});reads++;try{for(let row=0;row<r.height;row++){const at=(r.y-rect.y+row)*rect.width+r.x-rect.x;data.set(window.pixels.data.subarray(row*r.width*3,(row+1)*r.width*3),at*3);mask.fill(1,at,at+r.width);}}finally{window.release();}}
  for(let y=rect.y;y<rect.y+rect.height;y++){
   const next=new Map();for(const[left,right]of domain.rowIntervals(y)){const x=Math.max(rect.x,left),end=Math.min(rect.x+rect.width,right);if(x>=end)continue;const key=x+':'+end,prior=active.get(key);next.set(key,prior?{...prior,height:prior.height+1}:{x,y,width:end-x,height:1});}
   for(const[key,r]of active)if(!next.has(key))await consume(r);active=next;
  }
  for(const r of active.values())await consume(r);
  return{width:rect.width,height:rect.height,format:'rgb8',data,mask};
 }

 try{
  // Arithmetic, largest useful halo, histogram tables and row IO are protected
  // before retained output stores can consume the remaining admission credit.
  if(borrowedCache)cacheLease=budget.reserve(borrowedCache.byteLength);
  working=budget.reserve(workingBytes);
  grayHistogram=new Int32Array(256);histogram=p.equalize>=2?new Int32Array(16384):p.equalize===1?new Float64Array(256):null;areas=p.equalize>=2?new Int32Array(64):null;
  output=await make(n*3);scope=await make(n);
  const rowGroup=Math.max(1,Math.min(height,Math.floor(32768/width)));
  for(let y=0;y<height;y+=rowGroup){await cooperate();const rows=Math.min(rowGroup,height-y),window=await original.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width,height:rows},{signal});try{await output.write(window.pixels.data,y*width*3);}finally{window.release();}}
  let done=0;
  if(borrowedCache){
   const cached=borrowedCache.value;grayHistogram=cached.grayHistogram;areas=cached.areas;analysed=cached.analysed;
   for(const core of cores()){await cooperate();const bytes=new Uint8Array(core.width*core.height*3),membership=new Uint8Array(core.width*core.height);for(let row=0;row<core.height;row++){cached.rgb.read(bytes.subarray(row*core.width*3,(row+1)*core.width*3),((core.y+row)*width+core.x)*3);cached.mask.read(membership.subarray(row*core.width,(row+1)*core.width),(core.y+row)*width+core.x);}await write(output,core,bytes,3);await write(scope,core,membership,1);done+=core.width*core.height;onProgress?.({phase:'source-region-adjust-cached-prefix',completed:done,total:prefixPixels});}
  }else{
   if(cacheBytes<=budget.limit-budget.total()){cacheLease=budget.reserve(cacheBytes);pendingCache={rgb:createRamByteCache(n*3),mask:createRamByteCache(n),grayHistogram,areas,analysed:0};}
  for(const core of cores()){
   await cooperate();const support=sourceRegionLocalSupport(domain,core,halo),pixels=await readSupport(support);
   {
    const transformed=await adjustScopedMaskedLocalRows(pixels,pixels.mask,p,core.y-support.y,core.height,support.x,width,{signal}),bytes=new Uint8Array(core.width*core.height*3);
    for(let row=0;row<core.height;row++){const at=(row*support.width+core.x-support.x)*3;bytes.set(transformed.subarray(at,at+core.width*3),row*core.width*3);}
    if(p.equalize===1)for(let i=2;i<bytes.length;i+=3)histogram[bytes[i]]++;
    await write(output,core,bytes,3);await write(scope,core,new Uint8Array(core.width*core.height).fill(1),1);blocks++;done+=core.width*core.height;onProgress?.({phase:'source-region-adjust-prefix',completed:done,total:prefixPixels});
   }
  }
  if(p.equalize===1)tables=equalizeHistogramLut(histogram,prefixPixels);
  else if(p.equalize>=2){
   // Padding is the unchanged native REFLECT_101 rule. Reflected unadmitted
   // observations remain absent; they never become black/zero observations.
   for(let y=0;y<ph;y++){
    await cooperate();const sy=reflected(y,height),rect={x:0,y:sy,width,height:1},membership=await read(scope,rect,1),bytes=await read(output,rect,3),ty=Math.floor(y/th);
    for(let x=0;x<pw;x++){const sx=reflected(x,width);if(!membership[sx])continue;const tile=ty*8+Math.floor(x/tw);histogram[tile*256+bytes[sx*3+2]]++;areas[tile]++;}
    onProgress?.({phase:'source-region-adjust-clahe-histogram',completed:y+1,total:ph});
   }
   tables=await adjustScopedClaheTables(histogram,areas,p.equalize,{signal});
  }
  done=0;
  for(const core of cores()){
   await cooperate();const bytes=await read(output,core,3),mapped=p.equalize?await adjustScopedObservedMapRows(bytes,core.width,core.height,core.x,core.y,width,pw,ph,p.equalize,tables,areas,{signal}):bytes,membership=new Uint8Array(core.width*core.height).fill(1);
   for(let i=0;i<membership.length;i++){const at=i*3;grayHistogram[gray(mapped[at],mapped[at+1],mapped[at+2])]++;analysed++;}
   if(pendingCache)try{for(let row=0;row<core.height;row++){pendingCache.rgb.write(mapped.subarray(row*core.width*3,(row+1)*core.width*3),((core.y+row)*width+core.x)*3);pendingCache.mask.write(membership.subarray(row*core.width,(row+1)*core.width),(core.y+row)*width+core.x);}}catch(error){if(!(error instanceof RangeError))throw error;pendingCache=null;cacheLease();cacheLease=null;}
   await write(output,core,mapped,3);await write(scope,core,membership,1);done+=core.width*core.height;onProgress?.({phase:'source-region-adjust-equalize',completed:done,total:prefixPixels});
  }
  }
  if(pendingCache)pendingCache.analysed=analysed;
  if(!analysed)throw new EngineError('SOURCE_SCOPE_EMPTY','No selected adjustment centre was processed.',{details:{selectedPixels:domain.countIncluded,prefixPixels,analysedPixels:0,halo}});
  const threshold=p.threshold===0?await adjustOtsu(grayHistogram,analysed,{signal}):p.threshold;
  if(p.threshold<255||p.invert){done=0;for(const core of cores()){
   await cooperate();const bytes=await read(output,core,3),membership=await read(scope,core,1);
   for(let i=0;i<membership.length;i++)if(membership[i])for(let c=0;c<3;c++){const at=i*3+c,value=p.threshold<255?(bytes[at]>threshold?255:0):bytes[at];bytes[at]=p.invert?255-value:value;}
   await write(output,core,bytes,3);done+=core.width*core.height;onProgress?.({phase:'source-region-adjust-finish',completed:done,total:prefixPixels});
  }}
  await output.flush();await scope.flush();checkAbort(signal);
  if(pendingCache){cacheLease();cacheLease=null;budget.put(cacheKey,{value:pendingCache,byteLength:cacheBytes},[task.imageId]);pendingCache=null;}
  surface=createRgbSurface(output,{width,height,budget});scopeSurface=createMaskSurface(scope,{width,height,budget,range:[0,1],semantics:'1=admitted native centre processed with selected observations;0=unselected original display background.'});
  const semantics='Native sharpen/HSV/LUT order. Incomplete sharpening support uses a Gaussian normalized over admitted observations; complete support preserves native arithmetic. Native8x8 CLAHE interpolation renormalizes over observed tiles. Equalization and Otsu omit excluded observations before computation. Every admitted centre is processed.',metrics={blocks,sourceReads:reads,analysisCacheHit:!!borrowedCache,selectedPixels:domain.countIncluded,prefixPixels,analysedPixels:analysed,unanalysablePixels:domain.countIncluded-analysed,halo,otsuThreshold:p.threshold===0?threshold:null,clahePaddedSize:p.equalize>=2?[pw,ph]:null,claheTilePopulations:areas?[...areas]:null,storage:output.storage,sourceRegionPolicy:'all-admitted-centres-normalized-gaussian-observed-clahe'},bundle=publishResult(task.imageId,{surface,maskRecords:{analysis_scope:{surface:scopeSurface}},semantics,metrics});published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,semantics,metrics,provenance:{params:p,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted-before-sharpen-and-clahe-and-otsu',presentationOutsideAnalysedSupport:'original-unanalysed',nativeBorderGrid:'new-native-envelope',incompleteSharpenSupport:'gaussian(mask*rgb)/gaussian(mask)',emptyClaheTiles:'renormalize-positive-observed-bilinear-weights'}};
 }catch(error){failure=normalizeResourceError(error);throw failure;}
 finally{working?.();cacheLease?.();if(borrowedCache)budget.put(cacheKey,borrowedCache,[task.imageId]);if(!published){const failures=[];for(const owner of[surface??output,scopeSurface??scope])if(owner)try{await owner.dispose();}catch(error){failures.push(normalizeResourceError(error));}if(failures.length){if(failure)failure.details={...failure.details,cleanupErrors:failures.map(({code,message})=>({code,message}))};else throw failures[0];}}}
}
