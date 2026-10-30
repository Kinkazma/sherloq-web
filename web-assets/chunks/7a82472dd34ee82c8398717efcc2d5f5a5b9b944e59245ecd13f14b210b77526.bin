import "../../runtime-context.js?v=0.30.0";
import {checkAbort,controlCheckpoint,normalizeResourceError} from './errors.js';
import {bitPlanes,planesParams,BIT_PLANE_SEMANTICS} from './bit-planes.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {sourceRegionLocalCores,sourceRegionLocalSupport} from './source-region-local-support.js';
const reflect101=(x,size)=>size===1?0:x<0?-x:x>=size?2*size-x-2:x;

export async function sourceRegionBitPlanes({task,original,view,domain,budget,signal,onProgress,publishResult}){
 const params=planesParams(task.params),width=domain.width,height=domain.height,count=width*height;
 const make=bytes=>createSegmentedBytes(bytes,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal});
 let output,plane,scope,surface,planeSurface,scopeSurface,published=false,failure,analysed=0,jobs=0,boundaryPixels=0;
 async function scatter(store,bytes,sourceWidth,support,core,channels){for(let row=0;row<core.height;row++){const at=((core.y-support.y+row)*sourceWidth+core.x-support.x)*channels;await store.write(bytes.subarray(at,at+core.width*channels),((core.y+row)*width+core.x)*channels);}}
 async function runCores(radius,filter,collectPlane){for(const core of sourceRegionLocalCores(domain,{radius})){
  checkAbort(signal);const support=sourceRegionLocalSupport(domain,core,radius),lease=await view.readWindow(support,{signal});let release;
  try{release=budget.reserve(support.width*support.height*5+core.width);const native=await bitPlanes(lease.pixels,{...params,filter},{signal});checkAbort(signal);if(collectPlane)await scatter(plane,native.masks.plane.data,support.width,support,core,1);if(filter===params.filter){await scatter(output,native.pixels.data,support.width,support,core,3);const ones=new Uint8Array(core.width).fill(1);for(let row=0;row<core.height;row++)await scope.write(ones,(core.y+row)*width+core.x);analysed+=core.width*core.height;jobs++;onProgress?.({phase:'source-region-bit-planes',completed:analysed,total:domain.countIncluded});}}
  finally{release?.();lease.release();}await controlCheckpoint(signal);
 }}
 async function renderAdmittedBoundary(){
  // The scientific plane is already defined on every admitted RGB sample.
  // Its display-only filter can therefore use the observed binary taps at
  // selection boundaries without reading or inventing excluded RGB values.
  const chunk=32768;
  for(let y=0;y<height;y++){
   await controlCheckpoint(signal);
   for(const[left,right]of domain.rowIntervals(y))for(let x=left;x<right;x+=chunk){
    checkAbort(signal);const size=Math.min(chunk,right-x),first=Math.max(0,x-1),last=Math.min(width,x+size+1),span=last-first,release=budget.reserve(size*4+span*3+64);
    try{
     const known=new Uint8Array(size);await scope.readInto(known,y*width+x);if(known.every(Boolean))continue;
     const bytes=new Uint8Array(size*3);await output.readInto(bytes,(y*width+x)*3);
     const ys=[-1,0,1].map(d=>params.filter===1?Math.max(0,Math.min(height-1,y+d)):reflect101(y+d,height)),rows=new Map();
     for(const sy of ys)if(!rows.has(sy)){const row=new Uint8Array(span);await plane.readInto(row,sy*width+first);rows.set(sy,row);}
     for(let dx=0;dx<size;dx++)if(!known[dx]){
      const gx=x+dx;let observed=0,ones=0,weighted=0,mass=0;
      for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
       const sx=params.filter===1?Math.max(0,Math.min(width-1,gx+i)):reflect101(gx+i,width),sy=ys[j+1];if(!domain.contains(sx,sy))continue;
       const value=rows.get(sy)[sx-first],weight=(i===0?2:1)*(j===0?2:1);observed++;ones+=value;weighted+=weight*value*255;mass+=weight;
      }
      // A selected centre is always an observed tap. An even binary median
      // has two possible endpoints; retain the centre on an exact tie.
      const centre=rows.get(y)[gx-first],value=params.filter===1?(ones*2===observed?centre*255:ones*2>observed?255:0):Math.floor((weighted+mass/2)/mass);
      bytes.fill(value,dx*3,dx*3+3);known[dx]=1;analysed++;boundaryPixels++;
     }
     await output.write(bytes,(y*width+x)*3);await scope.write(known,y*width+x);
    }finally{release();}
   }
   onProgress?.({phase:'source-region-bit-planes-boundary',completed:y+1,total:height});
  }
 }
 try{
  output=await make(count*3);plane=await make(count);scope=await make(count);
  // Only the display background may read unselected original pixels.
  const rows=Math.max(1,Math.floor(65536/width));for(let y=0;y<height;y+=rows){checkAbort(signal);const h=Math.min(rows,height-y),lease=await original.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width,height:h},{signal});try{await output.write(lease.pixels.data,y*width*3);}finally{lease.release();}const release=budget.reserve(width*h);try{const zeros=new Uint8Array(width*h);await plane.write(zeros,y*width);await scope.write(zeros,y*width);}finally{release();}}
  // The scientific bit mask is pixel independent even when its visual filter
  // has incomplete support. Preserve it for every admitted original sample.
  await runCores(0,0,true);if(params.filter){await runCores(1,params.filter,false);await renderAdmittedBoundary();}
  await output.flush();await plane.flush();await scope.flush();checkAbort(signal);
  surface=createRgbSurface(output,{width,height,budget});planeSurface=createMaskSurface(plane,{width,height,budget,range:[0,1],semantics:BIT_PLANE_SEMANTICS+' Only admitted observations have a defined scientific value.'});scopeSurface=createMaskSurface(scope,{width,height,budget,range:[0,1],semantics:'1=admitted bit-plane observation and filtered display;0=excluded original display background, not a zero bit plane.'});
  const semantics='Native bit plane over every admitted original observation. Display-only boundary filtering uses the binary median of observed taps (ties retain the centre), or the native Gaussian weights normalized over observed taps. Complete-support arithmetic and native outer-image borders are unchanged. The scientific bit mask is retained independently.',metrics={selectedPixels:domain.countIncluded,analysedPixels:analysed,unanalysablePixels:domain.countIncluded-analysed,completeSupportPixels:analysed-boundaryPixels,boundaryPixels,jobs,sourceRegionPolicy:'admitted-bit-mask-observed-display-boundaries'},bundle=publishResult(task.imageId,{surface,maskRecords:{plane:{surface:planeSurface},analysis_scope:{surface:scopeSurface}},semantics,metrics});published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,semantics,metrics,provenance:{params,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted-before-native-bit-mask-and-filter',presentationOutsideAnalysedSupport:'original-unanalysed',nativeBorderRules:params.filter===1?'replicate':params.filter===2?'reflect101':'pointwise',selectionBoundary:params.filter===1?'observed binary median; even ties retain centre':params.filter===2?'observed native Gaussian taps normalized to their actual mass':'pointwise',originalEncodedBytesPreserved:true}};
 }catch(error){failure=normalizeResourceError(error);throw failure;}
 finally{if(!published){const cleanup=[];for(const owner of[surface??output,planeSurface??plane,scopeSurface??scope])if(owner)try{await owner.dispose();}catch(error){cleanup.push(normalizeResourceError(error));}if(cleanup.length){if(failure)failure.details={...failure.details,cleanupErrors:cleanup.map(({code,message})=>({code,message}))};else throw cleanup[0];}}}
}
