import "../../runtime-context.js?v=0.25.0";
import {ownFileGrayCleanup} from './file-gray-retirement.js';
import {WaveletStripPool,retireWaveletPlans,appendWaveletCleanup} from './wavelet-strip-pool.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {blockingParams} from './wavelet-blocking.js';
import {waveletStreamMath,waveletStreamHeapBytes} from './wavelet-stream-math.js';
import {createFloatPlane} from './segmented-float-plane.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {createNoiseTable} from './noise-table.js';
import {inspectJpegBlob} from './jpeg.js';
import {inspectPngSource} from './png-header-source.js';
import {decodePngRows} from './png-stream.js';
import {decodeJpegGrayRows} from './jpeg-gray-rows.js';
import {gray} from './pixel-utils.js';
import {createSourceRegionGray} from './source-region-gray.js';

async function blockingGraySource(image,options,{budget,signal,block,progress}){
 if(image.originalSource)return createSourceRegionGray(image,original=>blockingGraySource(original,options,{budget,signal,block,progress}),{signal,budget});
 if(!image.source)return null;
 const png=image.provenance?.format==='png';
 if(image.provenance?.format==='tiff')throw new EngineError('UNSUPPORTED_FORMAT','Original-file TIFF grayscale streaming for block-noise analysis is not yet qualified.');
 const header=png?(await inspectPngSource(image.source,{signal,account:bytes=>budget.reserve(bytes)})).header:await inspectJpegBlob(image.source,{signal});
 let store,surface;const owner=ownFileGrayCleanup(image,{budget,cleanup:async()=>{if(surface){await surface.dispose();surface=null;store=null;}else if(store){await store.dispose();store=null;}}});
 try{
  store=await createSegmentedBytes(header.sourceWidth*header.sourceHeight,options);
  if(png)await decodePngRows(image.source,header,store,{budget,signal,grayscale:true,onProgress:f=>progress('file-gray',f,1)});
  else await decodeJpegGrayRows(image.source,header,store,{budget,signal,chunkBytes:Math.max(header.sourceWidth,Math.min(4*1024**2,block)),onProgress:f=>progress('file-gray',f,1)});
  surface=createMaskSurface(store,{width:header.sourceWidth,height:header.sourceHeight,orientation:header.orientation,budget,range:[0,255],semantics:png?'Original PNG grayscale, native libpng coefficients and truncation':'Original JPEG grayscale ISLOW'});return {...surface,async readWindow(...args){return owner.read(()=>surface.readWindow(...args));},dispose(){return owner.retire();}};
 }catch(error){return owner.fail(error);}
}

const WORKER_OWNER=Symbol('blocking-cache-workers');
const WORKER_CONFIG=['workerFactory','workerURL','workerHeapBytes','workerPixelBytes'];
export function blockingWorkerOwnership(cache,{budget,profile={}}={}){const owner=cache?.[WORKER_OWNER];return Object.freeze({owner,pool:owner?.pool,compatible:!!owner&&owner.budget===budget&&WORKER_CONFIG.every(key=>owner.config[key]===profile[key])});}

export async function segmentedBlocking(image,params,{budget,signal,onProgress,cache,blockPixels=65536,storage='auto',profile={},accountedHeapBytes=0}={}){
 // The scientific cache owns only compatible idle endpoints. They remain
 // admitted and reclaimable; releasing the cache also stops its workers.
 const previousOwner=cache?.[WORKER_OWNER],compatible=previousOwner?.budget===budget&&WORKER_CONFIG.every(key=>previousOwner.config[key]===profile[key]),pool=compatible?previousOwner.pool:new WaveletStripPool(budget,{...profile,adaptive:image.blockingScheduling??=(new Map())});
 pool.maximum=profile.maxWorkers??globalThis.navigator?.hardwareConcurrency??1;
 pool.resourceOwner=profile.resourceOwner??'transform';pool.resourceOperation=profile.resourceOperation;
 let keepPool=false;
 const p=blockingParams(params),{width,height}=image.surface.descriptor,owned=new Set();let output,graySurface,newCache,noise,workspace,candidateSurface,candidateTable,returning=false,failed=false,primary;

 requireValue(Number.isInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid blocking strip size.');
 // Only this pool's already-admitted idle reservations may be reclaimed for
 // planning. Actual staging still passes through budget.reserve(), which
 // retires idle endpoints before allocating; no live bytes are credited twice.
 const idleBytes=[...pool.workers.values()].filter(slot=>!slot.busy&&!slot.retirement).reduce((n,slot)=>n+slot.bytes,0);
 const nativeHeap=Math.max(8*1024**2,waveletStreamHeapBytes());requireValue(Number.isSafeInteger(accountedHeapBytes)&&accountedHeapBytes>=0&&accountedHeapBytes<=nativeHeap,'Invalid already accounted blocking heap.');const room=budget.limit-budget.retained-budget.active+idleBytes,heap=nativeHeap-accountedHeapBytes,block=Math.min(blockPixels,Math.floor((room-heap-4*1024**2)/128));
 if(block<Math.max(width,height,p.block*p.block))throw new EngineError('MEMORY_LIMIT','One complete db8 axis and one noise block must fit.');
 const options={budget,signal,storage:storage==='auto'&&(image.ensureTemporarySession||image.session)&&width*height*27>room-heap-block*128?'temporary':storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:Math.max(8192,block*8)};
 const plane=async(w,h)=>{const value=await createFloatPlane(w,h,options);owned.add(value);return value;};
 const drop=async value=>{if(owned.has(value)){await value.dispose();owned.delete(value);}};
 const progress=(phase,completed,total)=>onProgress?.({phase,completed,total});
 const cleanupOwner=pool.ownCleanup(async capture=>{if(graySurface){await graySurface.dispose();graySurface=null;}await retireWaveletPlans(owned,capture);if(!returning){if(candidateSurface){await candidateSurface.dispose();candidateSurface=null;}if(output){await output.dispose();output=null;}if(candidateTable){await candidateTable.dispose();candidateTable=null;}await newCache?.dispose();}if(workspace){workspace();workspace=null;}});
 try{
  let sourceMode=cache?.sourceMode??'loaded image grayscale',sourceDimensions=cache?.sourceDimensions??[width,height];
  if(!cache&&(image.source||image.originalSource)){
   graySurface=await blockingGraySource(image,options,{budget,signal,block,progress});
   if(graySurface){sourceDimensions=[graySurface.descriptor.width,graySurface.descriptor.height];sourceMode='file grayscale';}
  }
  workspace=budget.reserve(heap+block*128);const math=await waveletStreamMath();
  if(!cache){
   const [sw,sh]=sourceDimensions;let input=await plane(sw,sh),step=Math.max(1,Math.floor(block/sw));
   for(let y=0;y<sh;y+=step){await controlCheckpoint(signal);const h=Math.min(step,sh-y),part=await (graySurface??image.surface).readWindow({x:0,y,width:sw,height:h},{signal});try{const values=new Float64Array(sw*h),bytes=part.pixels.data;for(let i=0;i<values.length;i++)values[i]=graySurface?bytes[i]:gray(bytes[i*3],bytes[i*3+1],bytes[i*3+2]);await input.write(values,0,y,sw,h,{signal});}finally{part.release();}progress('gray-plane',Math.min(sh,y+step),sh);}
   await graySurface?.dispose();graySurface=null;
   for(const axis of [0,1]){
    const w=axis===1?Math.floor((input.width+15)/2):input.width,h=axis===0?Math.floor((input.height+15)/2):input.height,next=await plane(w,h),span=axis===0?input.height:input.width,total=axis===0?input.width:input.height,step=Math.max(1,Math.floor(block/span));
    const job=i=>{const at=i*step,n=Math.min(step,total-at);return {x:axis===0?at:0,y:axis===0?0:at,iw:axis===0?n:input.width,ih:axis===0?input.height:n};};let completed=0;
    await pool.run({count:Math.ceil(total/step),pixels:Math.max(step*span,step*(axis===0?h:w)*2),key:`blocking/db8/${axis}/${span}/${step}`,signal,
     prepare:async i=>{await controlCheckpoint(signal);const j=job(i);return {op:'down',values:await input.read(j.x,j.y,j.iw,j.ih,{signal}),width:j.iw,height:j.ih,wavelet:'db8',axis};},local:r=>math.down(r.values,r.width,r.height,r.wavelet,r.axis),
     consume:async(r,i)=>{const j=job(i);await next.write(r.d,j.x,j.y,r.width,r.height,{signal});completed+=axis===0?j.iw:j.ih;progress('db8-axis-'+axis,completed,total);}
    });
    await drop(input);input=next;
   }
   const detailOwner=pool.ownCleanup(()=>input.dispose());newCache={detail:input,sourceMode,sourceDimensions,[WORKER_OWNER]:{budget,pool,config:Object.fromEntries(WORKER_CONFIG.map(key=>[key,profile[key]]))},dispose(){return detailOwner.retire({endpoints:true});}};owned.delete(input);cache=newCache;
  }
  const detail=cache.detail;requireValue(p.block<=Math.min(detail.width,detail.height),'Block size exceeds native detail dimensions.');
  const nw=Math.floor(detail.width/p.block),nh=Math.floor(detail.height/p.block);noise=await plane(nw,nh);let lo=Infinity,hi=-Infinity;
  const columns=Math.max(1,Math.floor(block/(p.block*p.block)));
  const strips=Math.ceil(nw/columns),job=i=>{const x=(i%strips)*columns,y=Math.floor(i/strips);return {x,y,n:Math.min(columns,nw-x)};};let completed=0;
  await pool.run({count:strips*nh,pixels:Math.min(columns,nw)*p.block*p.block,key:`noise/${p.block}/${nw}/${columns}`,signal,
   prepare:async i=>{await controlCheckpoint(signal);const j=job(i);return {op:'noise',values:await detail.read(j.x*p.block,j.y*p.block,j.n*p.block,p.block,{signal}),width:j.n*p.block,height:p.block,block:p.block};},
   local:r=>math.noise(r.values,r.width,r.height,r.block),consume:async(r,i)=>{const j=job(i);for(const v of r.values){lo=Math.min(lo,v);hi=Math.max(hi,v);}await noise.write(r.values,j.x,j.y,j.n,1,{signal});completed+=j.n;progress('noise-blocks',completed,nw*nh);}
  });
  output=await createSegmentedBytes(width*height*3,{...options,storage});
  let previous=-1,row;for(let y=0;y<height;y++){
   if(y%32===0)await controlCheckpoint(signal);const sy=Math.min(nh-1,Math.floor(y*(1/(height/nh))));
   if(sy!==previous){row=math.normalize(await noise.read(0,sy,nw,1,{signal}),lo,hi,nw*nh);previous=sy;}
   const bytes=new Uint8Array(width*3);for(let x=0;x<width;x++)bytes.fill(row[Math.min(nw-1,Math.floor(x*(1/(width/nw))))],x*3,x*3+3);await output.write(bytes,y*width*3);progress('render',y+1,height);
  }
  await output.flush();checkAbort(signal);const surface=createRgbSurface(output,{width,height,budget});candidateSurface=surface;output=null;const table=createNoiseTable(noise,{budget,block:p.block});candidateTable=table;owned.delete(noise);if(newCache)owned.delete(cache.detail);
  keepPool=cache[WORKER_OWNER]?.pool===pool;returning=true;
  return {surface,blockingCache:cache,tableRecords:{noise:{surface:table}},data:{width,height,sourceMode,sourceDimensions,detailDimensions:[detail.width,detail.height],block:p.block,rows:nh,cols:nw},semantics:'Original file grayscale, complete global db8 axes, block median(abs(detail)) / 0.6745 and global CV_8U normalization with nearest-neighbor display.',metrics:{...pool.metrics(),blockPixels:block,detailCached:!newCache,globalMinimum:lo,globalMaximum:hi}};
 }catch(error){failed=true;primary=error;throw error;}finally{try{await cleanupOwner.retire({endpoints:!keepPool});}catch(cleanup){returning=false;if(failed)appendWaveletCleanup(primary,cleanup);else throw cleanup;}}
}
