import {createJpegEntryRetirement} from './jpeg-encoded-cache-owners.js';
import {getElaGpuService} from './ela-gpu.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {validateParams} from './ela.js';
import {toneTable,fusedCpu} from './ela-lut.js';
import {createRgbRecompression,rgbRecompressionPlan} from './jpeg-rgb-stream.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {createNumericSurface} from './numeric-surface.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {EngineError,requireValue,checkAbort,createCooperator,normalizeResourceError} from './errors.js';
const MCU=16,CHUNK=8192,WINDOW_PIXELS=65536,CACHE_GRID='exact-native-jpeg-fragments/2';
const semantics='Native classical JPEG residual within every exact admitted geometry rectangle. Each context has its own unchanged native 4:2:0 ISLOW recompression and codec edge padding. analysis_scope=1 identifies every admitted observation; excluded Original RGB is presentation only. Fragment grids are not a recompression of the encompassing Original.';

// Geometry rectangles are scientific contexts, never arbitrary storage tiles.
// In particular, an entirely admitted rectangle remains one JPEG stream. The
// codec supplies its ordinary edge extension; no MCU support halo erodes it.
export async function planElaMembership(view,domain,{budget,signal}={}){
 const bytes=4096+domain.width*64;budget.retain(bytes);let closed=false;
 const dispose=()=>{if(closed)return;closed=true;budget.retained-=bytes;};
 try{
  const cooperate=createCooperator(signal);let analysedPixels=0,contexts=0,workingBytes=0;
  for(const rect of view.admittedRectangles()){
   await cooperate();const shape=rgbRecompressionPlan({descriptor:{width:rect.width,height:rect.height}});
   analysedPixels+=rect.width*rect.height;contexts++;workingBytes=Math.max(workingBytes,shape.workingBytes+shape.windowAllowance+1024**2);
  }
  requireValue(contexts>0&&analysedPixels===domain.countIncluded,'Native JPEG contexts must cover every admitted observation exactly.');checkAbort(signal);
  return{grid:CACHE_GRID,identity:domain.fingerprint,columns:Math.ceil(domain.width/MCU),rows:Math.ceil(domain.height/MCU),analysedPixels,contexts,cores:contexts,workingBytes,
   support:rect=>({...rect}),contains:(x,y)=>domain.contains(x,y),
   *regions(){requireValue(!closed,'The native JPEG context plan is closed.');for(const r of view.admittedRectangles())yield{...r,x:r.x+domain.origin[0],y:r.y+domain.origin[1]};},dispose};
 }catch(error){dispose();throw error;}
}
async function cacheFor(derived,view,domain,budget,signal){
 if(derived.rgbRecompression){const cached=derived.rgbRecompression;requireValue(cached.sourceRegionEla&&cached.grid===CACHE_GRID&&cached.plan.identity===domain.fingerprint&&!cached.closed,'The source-domain JPEG cache belongs to another context grid.');return cached;}
 const plan=await planElaMembership(view,domain,{budget,signal}),entries=new Map(),pending=createJpegEntryRetirement(),pinned=new Map();let closed=false;
 const retire=entry=>pending.retire(entry);
 const unregister=budget.registerReclaimer?.(bytes=>{for(const[q,entry]of entries){if(budget.total()+bytes<=budget.limit)break;if(pinned.has(q)||entry.store.storage!=='memory')continue;entries.delete(q);pending.defer(entry);}});
 const unregisterBacking=budget.registerAsyncReclaimer?.(async()=>{const before=budget.total();await pending.drain();return Math.max(0,before-budget.total());},{allocationKind:'array-buffer',owner:'ela',label:'retiring-native-fragment-JPEG-cache'});
 const cache={sourceRegionEla:true,grid:CACHE_GRID,plan,entries,pinned,retire,drain:()=>pending.drain(),get closed(){return closed;},async dispose(){closed=true;for(const entry of entries.values())pending.defer(entry);entries.clear();await pending.drain();plan.dispose();unregister?.();unregisterBacking?.();}};
 derived.rgbRecompression=cache;return cache;
}
export function createSourceRegionJpegContextImage(view,rect,original,budget){
 const x=rect.x,y=rect.y;
 const surface={descriptor:{width:rect.width,height:rect.height,format:'rgb8'},async readWindowInto(part,target,{signal}={}){
  requireValue([part.x,part.y,part.width,part.height].every(Number.isSafeInteger)&&part.x>=0&&part.y>=0&&part.width>0&&part.height>0&&part.x+part.width<=rect.width&&part.y+part.height<=rect.height&&target.length===part.width*part.height*3,'Native JPEG reader exceeds its exact context.');
  // SourceRegionView has its own finite read admission. A wide JPEG stream
  // still uses its native full-width scanline, gathered in bounded row reads.
  const rows=Math.max(1,Math.floor(WINDOW_PIXELS/part.width));
  for(let row=0;row<part.height;row+=rows){checkAbort(signal);const height=Math.min(rows,part.height-row),lease=await view.readWindow({x:x+part.x,y:y+part.y+row,width:part.width,height},{signal});try{target.set(lease.pixels.data,row*part.width*3);}finally{lease.release();}}
 },async readWindow(part,hooks={}){
  const owned=allocateOwnedTypedArray(Uint8Array,part.width*part.height*3,{budget,reserve:hooks.reserve,label:'native-jpeg-context-rgb'});try{await surface.readWindowInto(part,owned.data,hooks);return{pixels:{width:part.width,height:part.height,format:'rgb8',data:owned.data},release:owned.release};}catch(error){owned.release();throw error;}
 }};
 return{surface,originalSource:original,get session(){return original.session;},ensureTemporarySession:original.ensureTemporarySession};
}
function storageOptions(original,budget,signal){return{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal};}
export async function sourceRegionJpegPlan({derived,view,domain,budget,signal}){return(await cacheFor(derived,view,domain,budget,signal)).plan;}
// Quality planes are pinned until consumers finish. Sparse storage outside
// admitted contexts is never read by a codec, a residual, or a reduction.
export async function acquireSourceRegionJpeg({quality,original,derived,view,domain,budget,signal,onProgress,backend='cpu'}){
 const cache=await cacheFor(derived,view,domain,budget,signal);await cache.drain();const plan=cache.plan,width=domain.width,hit=cache.entries.has(quality);let entry=cache.entries.get(quality),creating,planning,recompressions=0,gpuArchiveCalls=0,gpuArchiveMs=0,failure,failed=false;cache.pinned.set(quality,(cache.pinned.get(quality)??0)+1);
 const unpin=()=>{const n=cache.pinned.get(quality);if(n===1)cache.pinned.delete(quality);else if(n>1)cache.pinned.set(quality,n-1);};
 try{
  if(!entry){planning=budget.reserve(plan.workingBytes);while(cache.entries.size>=2){const candidate=[...cache.entries].find(([q])=>!cache.pinned.has(q));if(!candidate)break;const[q,old]=candidate;cache.entries.delete(q);await cache.retire(old);}
   creating=await createSegmentedBytes(width*domain.height*3,storageOptions(original,budget,signal));planning();planning=null;
   let completed=0;for(const rect of plan.regions()){
    checkAbort(signal);const codec=createRgbRecompression(createSourceRegionJpegContextImage(view,{...rect,x:rect.x-domain.origin[0],y:rect.y-domain.origin[1]},original,budget),budget);let codecFailure,codecFailed=false;
    try{const codecMetrics=await codec.visit(quality,{signal,backend,onBand:async(_,rgb,{y,rows})=>{for(let row=0;row<rows;row++)await creating.write(rgb.subarray(row*rect.width*3,(row+1)*rect.width*3),((rect.y+y+row-domain.origin[1])*width+rect.x-domain.origin[0])*3);}});recompressions++;if(codecMetrics.backend==='webgpu'){gpuArchiveCalls++;gpuArchiveMs+=codecMetrics.totalMs??0;}}
    catch(error){codecFailed=true;codecFailure=error;throw error;}finally{await retireCompositeOwners([()=>cache.retire({store:codec})],codecFailed?{primary:codecFailure}:{});}
    completed+=rect.width*rect.height;onProgress?.({phase:'source-region-ela-jpeg',fraction:completed/plan.analysedPixels});
   }
   await creating.flush();checkAbort(signal);creating.markCold();entry={store:creating};cache.entries.set(quality,entry);creating=null;
  }
  let released=false;return{store:entry.store,plan,metrics:{recompressions,recompressedCache:hit,gpuArchiveCalls,gpuArchiveMs},release(){if(!released){released=true;unpin();}}};
 }catch(error){failed=true;failure=normalizeResourceError(error);unpin();throw failure;}
 finally{await retireCompositeOwners([()=>creating?cache.retire({store:creating}):undefined,()=>planning?.()],failed?{primary:failure}:{});}
}
export async function sourceRegionEla({task,original,derived,view,domain,budget,signal,onProgress,publishResult,cpuKernel='auto'}){
 const params=validateParams(task.params),borrowed=await acquireSourceRegionJpeg({quality:params.quality,original,derived,view,domain,budget,signal,onProgress,backend:cpuKernel==='reference'?'cpu':task.backend??'auto'}),plan=borrowed.plan,width=domain.width,height=domain.height,cooperate=createCooperator(signal);
 let output,scope,surface,scopeSurface,published=false,planning,tableLease,failure,failed=false;const hit=borrowed.metrics.recompressedCache,recompressions=borrowed.metrics.recompressions;let windows=0,gpuCalls=0,gpuMs=0;const gpu=getElaGpuService(budget);
 try{
  planning=budget.reserve(1024**2+WINDOW_PIXELS*12);output=await createSegmentedBytes(width*height*3,storageOptions(original,budget,signal));scope=await createSegmentedBytes(width*height*4,storageOptions(original,budget,signal));planning();planning=null;
  // The encompassing Original is copied exclusively as presentation outside
  // the admitted contexts. None of these reads enters scientific processing.
  for(let y=0;y<height;y++)for(let x=0;x<width;x+=CHUNK){await cooperate();const w=Math.min(CHUNK,width-x),part=await original.surface.readWindow({x:domain.origin[0]+x,y:domain.origin[1]+y,width:w,height:1},{signal});try{await output.write(part.pixels.data,(y*width+x)*3);}finally{part.release();}}
  tableLease=budget.reserve(1024**2);const key=task.imageId+'\0source-region/ela-tone/'+params.scale+'/'+params.contrast+'/'+params.linear;let table=budget.get(key);const tableCached=!!table;if(!table){table=await toneTable(params,{signal});budget.put(key,table);}
  let completed=0;for(const context of plan.regions())for(let y=0;y<context.height;){
   const w=Math.min(CHUNK,context.width),rows=Math.max(1,Math.floor(WINDOW_PIXELS/w)),h=Math.min(rows,context.height-y);
   for(let x=0;x<context.width;x+=w){await cooperate();const cw=Math.min(w,context.width-x),rect={x:context.x-domain.origin[0]+x,y:context.y-domain.origin[1]+y,width:cw,height:h},lease=budget.reserve(cw*h*6+cw*4);let part,renderedOwner,failed=false,primary;
    try{part=await view.readWindow(rect,{signal});const recompressed=new Uint8Array(cw*h*3);for(let row=0;row<h;row++)await borrowed.store.readInto(recompressed.subarray(row*cw*3,(row+1)*cw*3),((rect.y+row)*width+rect.x)*3);renderedOwner=await gpu.residual(part.pixels.data,recompressed,cw,h,params,table,{signal,backend:cpuKernel==='reference'?'cpu':task.backend??'auto'});if(renderedOwner){gpuCalls++;gpuMs+=renderedOwner.runtime.totalMs;}const rendered=renderedOwner?.data??await fusedCpu(part.pixels.data,recompressed,params,table,{signal}),ones=new Int32Array(cw).fill(1);for(let row=0;row<h;row++){await output.write(rendered.subarray(row*cw*3,(row+1)*cw*3),((rect.y+row)*width+rect.x)*3);await scope.write(new Uint8Array(ones.buffer),((rect.y+row)*width+rect.x)*4);}}
    catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>renderedOwner?.release(),()=>part?.release(),lease],failed?{primary}:{});}windows++;completed+=cw*h;onProgress?.({phase:'source-region-ela-render',fraction:completed/plan.analysedPixels});
   }y+=h;
  }
  await output.flush();await scope.flush();checkAbort(signal);output.markCold();scope.markCold();surface=createRgbSurface(output,{width,height,budget});scopeSurface=createNumericSurface(scope,{width,height,format:'int32',budget,semantics:'1=analysed by its own exact native JPEG context including codec edges;0=excluded Original presentation only.'});
  const metrics={backend:gpuCalls||borrowed.metrics.gpuArchiveCalls?'webgpu':'cpu',gpuArchiveCalls:borrowed.metrics.gpuArchiveCalls,gpuArchiveMs:borrowed.metrics.gpuArchiveMs,gpuRenderCalls:gpuCalls,gpuRenderMs:gpuMs,...gpu.metrics(),selectedPixels:domain.countIncluded,analysedPixels:plan.analysedPixels,unanalysablePixels:0,mcu:MCU,halo:0,regions:plan.contexts,renderWindows:windows,recompressions,recompressedCache:hit,tableCached,storage:output.storage,sourceRegionPolicy:'exact-native-jpeg-fragment-contexts'},record={surface,planeRecords:{analysis_scope:{surface:scopeSurface}},semantics,metrics},bundle=publishResult(task.imageId,record);published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,analysis_scope:bundle.planeSurfaces?.analysis_scope,semantics,metrics,provenance:{params,sourceRegionDomain:domain.descriptor,excludedParticipation:'absent-before-every-native-fragment-recompression-and-residual',presentationOutsideAnalysedSupport:'original-unanalysed',jpegGrid:{phase:'independent-native-admitted-rectangles',contextCount:plan.contexts,originalOrigin:[...domain.origin],mcu:MCU,halo:0,sampling:'420',dct:'ISLOW',edgePadding:'unchanged-native-codec'},analysisScope:'analysis_scope=1 for every admitted observation; excluded presentation pixels are not scores'}};
 }catch(error){failed=true;failure=normalizeResourceError(error);throw failure;}
 finally{await retireCompositeOwners([()=>!published?(surface??output)?.dispose():undefined,()=>!published?(scopeSurface??scope)?.dispose():undefined,()=>borrowed.release(),()=>planning?.(),()=>tableLease?.()],failed?{primary:failure}:{});}
}
