import "../../runtime-context.js?v=0.30.0";
import {waveletForwardLevel} from './wavelet-forward-gpu.js';
import {WaveletReconstructionGpu} from './wavelet-reconstruction-gpu.js';
import {qualifyBlockNoiseNormalization} from './block-noise-gpu-normalization.js';
import {gpuFallbackError} from './gpu-native-boundary.js';
import {ownFileGrayCleanup} from './file-gray-retirement.js';
import {WaveletStripPool,retireWaveletPlans,appendWaveletCleanup} from './wavelet-strip-pool.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
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

async function blockingGraySource(image,options,{budget,signal,block,progress,cooperate=createCooperator(signal)}){
 if(image.originalSource)return createSourceRegionGray(image,original=>blockingGraySource(original,options,{budget,signal,block,progress,cooperate}),{signal,budget});
 if(!image.source)return null;
 const prefix=await image.source.read(0,Math.min(8,image.source.byteLength),{signal,cooperate});let png,jpeg,tiff;
 try{const b=prefix.bytes;png=b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71;jpeg=b[0]===255&&b[1]===216;tiff=b[0]===73&&b[1]===73||b[0]===77&&b[1]===77;}finally{prefix.release();}
 // Preserve the resident method: JPEG/PNG use native original-file gray;
 // other qualified decoded formats use the loaded RGB gray conversion.
 if(!png&&!jpeg&&!tiff)return null;
 if(tiff||image.provenance?.format==='tiff')throw new EngineError('UNSUPPORTED_FORMAT','Original-file TIFF grayscale streaming for block-noise analysis is not yet qualified.');
 const header=png?(await inspectPngSource(image.source,{signal,cooperate,account:bytes=>budget.reserve(bytes)})).header:await inspectJpegBlob(image.source,{signal,cooperate});
 progress('file-gray-header',1,1);let store,surface;const owner=ownFileGrayCleanup(image,{budget,cleanup:async()=>{if(surface){await surface.dispose();surface=null;store=null;}else if(store){await store.dispose();store=null;}}});
 try{
  store=await createSegmentedBytes(header.sourceWidth*header.sourceHeight,options);
  if(png)await decodePngRows(image.source,header,store,{budget,signal,cooperate,grayscale:true,onProgress:f=>progress('file-gray',f,1)});
  else await decodeJpegGrayRows(image.source,header,store,{budget,signal,chunkBytes:Math.max(header.sourceWidth,Math.min(4*1024**2,block)),onProgress:f=>progress('file-gray',f,1)});
  surface=createMaskSurface(store,{width:header.sourceWidth,height:header.sourceHeight,orientation:header.orientation,budget,range:[0,255],semantics:png?'Original PNG grayscale, native libpng coefficients and truncation':'Original JPEG grayscale ISLOW'});return {...surface,async readWindow(...args){return owner.read(()=>surface.readWindow(...args));},dispose(){return owner.retire();}};
 }catch(error){return owner.fail(error);}
}

const WORKER_OWNER=Symbol('blocking-cache-workers');
const WORKER_CONFIG=['workerFactory','workerURL','workerHeapBytes','workerPixelBytes'];
export function blockingWorkerOwnership(cache,{budget,profile={}}={}){const owner=cache?.[WORKER_OWNER];return Object.freeze({owner,pool:owner?.pool,compatible:!!owner&&owner.budget===budget&&WORKER_CONFIG.every(key=>owner.config[key]===profile[key])});}

function nativeBlockingVariant(root,record){
 if(!root.nativeVariant){root.nativeVariant=record.blockingCache;root.resources.add(record.blockingCache);}
 return {...record,blockingCache:root};
}
export async function segmentedBlocking(image,params,options={}){
 const root=options.cache;
 if(root?.decomposition==='gpu-high-low-db8'&&(root.nativeVariant||options.original||options.backend==='cpu')){
  const record=await segmentedBlockingCore(image,params,{...options,cache:root.nativeVariant,nativeGray:{plane:root.gray,sourceMode:root.sourceMode,sourceDimensions:root.sourceDimensions},disableGpu:true});
  return nativeBlockingVariant(root,record);
 }
 return segmentedBlockingCore(image,params,options);
}
async function segmentedBlockingCore(image,params,{budget,signal,onProgress,cache,blockPixels=65536,storage='auto',profile={},accountedHeapBytes=0,backend='auto',original=false,disableGpu=false,nativeGray}={}){
 // The scientific cache owns only compatible idle endpoints. They remain
 // admitted and reclaimable; releasing the cache also stops its workers.
 const previousOwner=cache?.[WORKER_OWNER],compatible=previousOwner?.budget===budget&&WORKER_CONFIG.every(key=>previousOwner.config[key]===profile[key]),pool=compatible?previousOwner.pool:new WaveletStripPool(budget,{...profile,adaptive:image.blockingScheduling??=(new Map())});
 pool.maximum=profile.maxWorkers??globalThis.navigator?.hardwareConcurrency??1;
 pool.resourceOwner=profile.resourceOwner??'transform';pool.resourceOperation=profile.resourceOperation;
 let keepPool=false;
 const p=blockingParams(params),{width,height}=image.surface.descriptor,owned=new Set(),cooperate=createCooperator(signal);let output,graySurface,newCache,noise,workspace,candidateSurface,candidateTable,returning=false,failed=false,primary,gpu=null,gpuUsed=false,normalization;

 requireValue(Number.isInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid blocking strip size.');
 // Only this pool's already-admitted idle reservations may be reclaimed for
 // planning. Actual staging still passes through budget.reserve(), which
 // retires idle endpoints before allocating; no live bytes are credited twice.
 const idleBytes=[...pool.workers.values()].filter(slot=>!slot.busy&&!slot.retirement).reduce((n,slot)=>n+slot.bytes,0);
 const nativeHeap=Math.max(8*1024**2,waveletStreamHeapBytes());requireValue(Number.isSafeInteger(accountedHeapBytes)&&accountedHeapBytes>=0&&accountedHeapBytes<=nativeHeap,'Invalid already accounted blocking heap.');const room=budget.limit-budget.retained-budget.active+idleBytes,heap=nativeHeap-accountedHeapBytes,block=Math.min(blockPixels,Math.floor((room-heap-4*1024**2)/128));
 if(block<Math.max(width,height,p.block*p.block))throw new EngineError('MEMORY_LIMIT','One complete db8 axis and one noise block must fit.');
 const options={budget,signal,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:Math.max(8192,block*8)};
 const plane=async(w,h)=>{const value=await createFloatPlane(w,h,options);owned.add(value);return value;};
 const drop=async value=>{if(owned.has(value)){await value.dispose();owned.delete(value);}};
 const progress=(phase,completed,total)=>onProgress?.({phase,completed,total});
 const cleanupOwner=pool.ownCleanup(async capture=>{if(graySurface){await graySurface.dispose();graySurface=null;}normalization?.release?.();await retireWaveletPlans(owned,capture);if(!returning){if(candidateSurface){await candidateSurface.dispose();candidateSurface=null;}if(output){await output.dispose();output=null;}if(candidateTable){await candidateTable.dispose();candidateTable=null;}await newCache?.dispose();}if(workspace){workspace();workspace=null;}});
 try{
  let sourceMode=cache?.sourceMode??nativeGray?.sourceMode??'loaded image grayscale',sourceDimensions=cache?.sourceDimensions??nativeGray?.sourceDimensions??[width,height];
  if(!cache&&!nativeGray&&(image.source||image.originalSource)){
   graySurface=await blockingGraySource(image,options,{budget,signal,block,progress,cooperate});
   if(graySurface){sourceDimensions=[graySurface.descriptor.width,graySurface.descriptor.height];sourceMode='file grayscale';}
  }
  workspace=budget.reserve(heap+block*128);const math=await waveletStreamMath();
  if(!cache){
   const [sw,sh]=sourceDimensions;let input=nativeGray?.plane??await plane(sw,sh),grayPlane,step=Math.max(1,Math.floor(block/sw));
   if(!nativeGray)for(let y=0;y<sh;y+=step){await cooperate();const h=Math.min(step,sh-y),part=await (graySurface??image.surface).readWindow({x:0,y,width:sw,height:h},{signal,cooperate});try{const values=new Float64Array(sw*h),bytes=part.pixels.data;for(let i=0;i<values.length;i++)values[i]=graySurface?bytes[i]:gray(bytes[i*3],bytes[i*3+1],bytes[i*3+2]);await input.write(values,0,y,sw,h,{signal,cooperate});}finally{part.release();}progress('gray-plane',Math.min(sh,y+step),sh);}
   await graySurface?.dispose();graySurface=null;
   let forward=false;
   if(!disableGpu&&!original&&backend==='webgpu'&&sw>=16&&sh>=16&&sw*sh>=262144&&globalThis.navigator?.gpu){
    let stageLease;try{stageLease=budget.reserve(sw*sh*8+4*1024**2);}catch(error){if(!gpuFallbackError(error))throw error;}
    if(stageLease)try{
     gpu=new WaveletReconstructionGpu(budget,profile);owned.add(gpu);const values=await input.read(0,0,sw,sh,{signal,cooperate});let detail;
     forward=await waveletForwardLevel(gpu,values,sw,sh,'db8',{signal,diagonalOnly:true,consume:async result=>{detail=await plane(result.width,result.height);await detail.write(result.d,0,0,result.width,result.height,{signal,cooperate});}});
     if(forward){grayPlane=input;input=detail;gpuUsed=true;progress('db8-gpu-diagonal',1,1);}
     await gpu.dispose();owned.delete(gpu);gpu=null;
    }finally{stageLease();}
   }
   if(!forward)for(const axis of [0,1]){
    const w=axis===1?Math.floor((input.width+15)/2):input.width,h=axis===0?Math.floor((input.height+15)/2):input.height,next=await plane(w,h),span=axis===0?input.height:input.width,total=axis===0?input.width:input.height,step=Math.max(1,Math.floor(block/span));
    const job=i=>{const at=i*step,n=Math.min(step,total-at);return {x:axis===0?at:0,y:axis===0?0:at,iw:axis===0?n:input.width,ih:axis===0?input.height:n};};let completed=0;
    await pool.run({count:Math.ceil(total/step),pixels:Math.max(step*span,step*(axis===0?h:w)),key:`blocking/db8-${original?'full':'detail'}/${axis}/${span}/${step}`,signal,
     prepare:async i=>{await cooperate();const j=job(i);return {op:original?'down':'down-detail',values:await input.read(j.x,j.y,j.iw,j.ih,{signal,cooperate}),width:j.iw,height:j.ih,wavelet:'db8',axis};},local:r=>(original?math.down(r.values,r.width,r.height,r.wavelet,r.axis):math.downDetail(r.values,r.width,r.height,r.wavelet,r.axis)),
     consume:async(r,i)=>{const j=job(i);await next.write(r.d,j.x,j.y,r.width,r.height,{signal,cooperate});completed+=axis===0?j.iw:j.ih;progress('db8-axis-'+axis,completed,total);}
    });
    await drop(input);input=next;
   }
   const resources=new Set([input,...(grayPlane?[grayPlane]:[])]),detailOwner=pool.ownCleanup(capture=>retireWaveletPlans(resources,capture));newCache={detail:input,gray:grayPlane,decomposition:forward?'gpu-high-low-db8':'native',resources,sourceMode,sourceDimensions,[WORKER_OWNER]:{budget,pool,config:Object.fromEntries(WORKER_CONFIG.map(key=>[key,profile[key]]))},dispose(){return detailOwner.retire({endpoints:true});}};owned.delete(input);if(grayPlane)owned.delete(grayPlane);cache=newCache;
  }
  const detail=cache.detail;requireValue(p.block<=Math.min(detail.width,detail.height),'Block size exceeds native detail dimensions.');
  const nw=Math.floor(detail.width/p.block),nh=Math.floor(detail.height/p.block);noise=await plane(nw,nh);let lo=Infinity,hi=-Infinity;
  const columns=Math.max(1,Math.floor(block/(p.block*p.block)));
  const strips=Math.ceil(nw/columns),job=i=>{const x=(i%strips)*columns,y=Math.floor(i/strips);return {x,y,n:Math.min(columns,nw-x)};};let completed=0;
  await pool.run({count:strips*nh,pixels:Math.min(columns,nw)*p.block*p.block,key:`noise/${p.block}/${nw}/${columns}`,signal,
   prepare:async i=>{await cooperate();const j=job(i);return {op:'noise',values:await detail.read(j.x*p.block,j.y*p.block,j.n*p.block,p.block,{signal,cooperate}),width:j.n*p.block,height:p.block,block:p.block};},
   local:r=>math.noise(r.values,r.width,r.height,r.block),consume:async(r,i)=>{const j=job(i);for(const v of r.values){lo=Math.min(lo,v);hi=Math.max(hi,v);}await noise.write(r.values,j.x,j.y,j.n,1,{signal,cooperate});completed+=j.n;progress('noise-blocks',completed,nw*nh);}
  });
  if(cache.decomposition==='gpu-high-low-db8'){
   normalization=await qualifyBlockNoiseNormalization(math,noise,cache.gray,p.block,{budget,signal,cooperate,blockPixels:block});
   if(!normalization.accepted){
    const native=await segmentedBlockingCore(image,p,{budget,signal,onProgress,cache:cache.nativeVariant,blockPixels,storage,profile,accountedHeapBytes,backend:'cpu',original,disableGpu:true,nativeGray:{plane:cache.gray,sourceMode:cache.sourceMode,sourceDimensions:cache.sourceDimensions}}),record=nativeBlockingVariant(cache,native);
    keepPool=cache[WORKER_OWNER]?.pool===pool;returning=true;
    return {...record,metrics:{...record.metrics,gpuNormalizationReplay:normalization.reason}};
   }
   lo=normalization.lo;hi=normalization.hi;
  }
  output=await createSegmentedBytes(width*height*3,{...options,storage});
  let previous=-1,row;for(let y=0;y<height;y++){
   if(y%32===0)await cooperate();const sy=Math.min(nh-1,Math.floor(y*(1/(height/nh))));
   if(sy!==previous){row=normalization?.accepted?normalization.pixels.subarray(sy*nw,(sy+1)*nw):math.normalize(await noise.read(0,sy,nw,1,{signal,cooperate}),lo,hi,nw*nh);previous=sy;}
   const bytes=new Uint8Array(width*3);for(let x=0;x<width;x++){const value=row[Math.min(nw-1,Math.floor(x*(1/(width/nw))))],j=x*3;bytes[j]=value;bytes[j+1]=value;bytes[j+2]=value;}await output.write(bytes,y*width*3);progress('render',y+1,height);
  }
  await output.flush();checkAbort(signal);const surface=createRgbSurface(output,{width,height,budget});candidateSurface=surface;output=null;const table=createNoiseTable(noise,{budget,block:p.block});candidateTable=table;owned.delete(noise);if(newCache)owned.delete(cache.detail);
  keepPool=cache[WORKER_OWNER]?.pool===pool;returning=true;
  return {surface,blockingCache:cache,tableRecords:{noise:{surface:table}},data:{width,height,sourceMode,sourceDimensions,detailDimensions:[detail.width,detail.height],block:p.block,rows:nh,cols:nw},semantics:'Original file grayscale, complete global db8 axes, block median(abs(detail)) / 0.6745 and global CV_8U normalization with nearest-neighbor display.',metrics:{...pool.metrics(),backend:gpuUsed||cache.decomposition==='gpu-high-low-db8'?'webgpu':'cpu',decomposition:cache.decomposition??'native',gpuForwardCalls:gpuUsed?1:0,...(normalization?.accepted?{nativeRefinementBlocks:normalization.refinementCount,normalizationQualificationMs:normalization.elapsedMs,normalizationExtremaIntervals:normalization.extremaIntervals}:{}),blockPixels:block,detailCached:!newCache,globalMinimum:lo,globalMaximum:hi}};
 }catch(error){failed=true;primary=error;throw error;}finally{try{await cleanupOwner.retire({endpoints:!keepPool});}catch(cleanup){returning=false;if(failed)appendWaveletCleanup(primary,cleanup);else throw cleanup;}}
}
