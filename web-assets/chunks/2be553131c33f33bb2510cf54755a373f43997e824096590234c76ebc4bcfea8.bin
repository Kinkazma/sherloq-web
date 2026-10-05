import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {medianAnalyze,medianGeometry,medianGrid,medianEnlargeRows} from './median.js';
import {MEDIAN_HEAP_LIMIT,MEDIAN_FORMATS} from './median-features.js';
import {gray} from './pixel-utils.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';

// At most32 native64x64 blocks. The final black block row/column is still
// analyzed; only the further historical score-grid border remains zero.
export function medianSurfaceReader(surface,{onRead}={}){
 return async(start,length,g,{signal}={})=>{
  const blocks=new Uint8Array(length*4096),w=g.imageWidth,h=g.imageHeight;
  for(let offset=0;offset<length;){
   await controlCheckpoint(signal);const index=start+offset,bx=index%g.blockColumns,by=Math.floor(index/g.blockColumns),count=Math.min(length-offset,g.blockColumns-bx),x=bx*64,y=by*64;
   if(x<w&&y<h){
    let window;const at=performance.now();
    try{
     window=await surface.readWindow({x,y,width:Math.min(w-x,count*64),height:Math.min(h-y,64)},{signal});onRead?.(performance.now()-at);
     const pixels=window.pixels;
     for(let yy=0;yy<pixels.height;yy++)for(let xx=0;xx<pixels.width;xx++){
      const i=(yy*pixels.width+xx)*3,target=(offset+Math.floor(xx/64))*4096+yy*64+xx%64;
      blocks[target]=gray(pixels.data[i],pixels.data[i+1],pixels.data[i+2]);
     }
    }finally{window?.release();}
   }
   offset+=count;
  }
  checkAbort(signal);return blocks;
 };
}

export async function segmentedMedian(image,p,{budget,model,medianPool,cpuKernel='auto',signal,onProgress,cacheKey,dependencies=[],rowsPerBlock}={}){
 requireValue(Object.hasOwn(MEDIAN_FORMATS,model?.metadata?.features)&&typeof model.predict==='function','A compiled median model is required.');
 const {width:w,height:h}=image.surface.descriptor,geometry=medianGeometry(w,h),cells=geometry.width*geometry.height,baseBytes=cells*16,dataBytes=cells*22;
 requireValue(Number.isSafeInteger(cells*64),'Median grid exceeds exact integer addressing.');checkAbort(signal);
 const key=cacheKey,cached=key&&budget.get(key),analysisCacheHit=!!cached;
 const ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 // Includes source/worker batches, all compact grid copies, interpolation
 // coefficients and storage pages. Source windows have their own live leases.
 const overhead=MEDIAN_HEAP_LIMIT+cells*64+1024**2+ioBytes+w*6+Math.max(w,h)*3;
 let planning,staging,output,validStore,decisionStore,dataRetained=false,sourceReads=0,sourceReadMs=0;const started=performance.now();
 try{
  const sourceWindowBytes=Math.min(w,2048)*Math.min(h,64)*3,renderRows=rowsPerBlock??Math.max(1,Math.floor(262144/w));
  requireValue(Number.isInteger(renderRows)&&renderRows>0,'Invalid median render row count.');
  const rowBytes=Math.min(h,renderRows)*w*3;
  const workerBytes=MEDIAN_HEAP_LIMIT+256*1024,desired=medianPool&&!cached&&typeof Worker!=='undefined'?Math.min(32,geometry.blockColumns*geometry.blockRows,medianPool.profile.maxWorkers):1;
  const fitting=Math.min(desired,Math.floor((budget.limit-budget.retained-budget.active-overhead-sourceWindowBytes-rowBytes)/workerBytes));
  // Prefer temporary RGB output over stealing memory from useful feature workers.
  planning=budget.reserve(overhead+sourceWindowBytes+rowBytes+(fitting>1?fitting*workerBytes:0));
  const options={budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal};
  output=await createSegmentedBytes(w*h*3,options);validStore=await createSegmentedBytes(cells,options);decisionStore=await createSegmentedBytes(cells,options);
  planning();planning=null;staging=budget.reserve(overhead);let analysis=cached?.value,runtime={workers:0,featureMs:0,predictMs:0};const at=performance.now();
  if(!analysis){
   // The selector preserves headroom; each real window/prediction then charges
   // its own lease. Do not charge the same headroom a second time while reading.
   const hooks={signal,fast:cpuKernel!=='reference',workerHeadroomBytes:sourceWindowBytes+model.metadata.features*4+256,readBlocks:medianSurfaceReader(image.surface,{onRead:ms=>{sourceReads++;sourceReadMs+=ms;}}),onProgress:f=>onProgress?.(.8*f)};
   analysis=medianPool?await medianPool.run({width:w,height:h},model,hooks):await medianAnalyze({width:w,height:h},model,hooks);
   runtime={workers:1,...analysis.runtime};delete analysis.runtime;
  }
  checkAbort(signal);const analysisMs=performance.now()-at,renderStarted=performance.now(),rendered=await medianGrid(analysis,p,{signal});
  await validStore.write(rendered.valid);await decisionStore.write(rendered.decisions);
  const rows=Math.min(h,renderRows,Math.floor((budget.limit-budget.retained-budget.active)/(w*3)));
  if(rows<1)throw new EngineError('MEMORY_LIMIT','Median display row does not fit the shared budget.');
  const release=budget.reserve(rows*w*3);
  try{for(let y=0;y<h;y+=rows){await controlCheckpoint(signal);const count=Math.min(rows,h-y),bytes=await medianEnlargeRows(rendered.rgb,geometry,{signal,start:y,rows:count});await output.write(bytes,y*w*3);onProgress?.(.8+.2*(y+count)/h);}}
  finally{release();}
  await output.flush();await validStore.flush();await decisionStore.flush();checkAbort(signal);
  const data={...analysis,geometry:structuredClone(analysis.geometry),probabilities:analysis.probabilities.slice(),variances:analysis.variances.slice(),margins:analysis.margins.slice(),filtered:rendered.filtered,mean:rendered.mean,validBlocks:rendered.validBlocks};
  staging();staging=null;budget.retain(dataBytes);dataRetained=true;if(key&&!cached)budget.put(key,{value:analysis,byteLength:baseBytes},dependencies);
  const surface=createRgbSurface(output,{width:w,height:h,budget}),dispose=surface.dispose;let disposed=false;
  surface.dispose=()=>{if(!disposed){disposed=true;budget.retained-=dataBytes;dataRetained=false;}return dispose();};
  const maskOptions={width:geometry.width,height:geometry.height,budget};
  const valid=createMaskSurface(validStore,{...maskOptions,range:[0,1],semantics:'One native grid cell per64×64 block;1 means variance >= minimum, including historical padding.'});
  const decisions=createMaskSurface(decisionStore,{...maskOptions,range:[0,2],semantics:'Grid decisions:0 invalid,1 below threshold,2 at or above threshold. The interpolated RGB view is not a pixel segmentation mask.'});
  // Compact raw grids retain the existing JSON export contract. Stored mask
  // surfaces are separate copies and survive RPC transfer/caller mutation.
  const masks=Object.fromEntries([['valid',valid,rendered.valid],['decisions',decisions,rendered.decisions]].map(([name,value,data])=>{const {width,height,format,range,semantics}=value.descriptor;return[name,{width,height,format,range,semantics,data}];}));
  return {surface,maskRecords:{valid:{surface:valid},decisions:{surface:decisions}},masks,data,semantics:'Median-filter model evidence on native64×64 blocks. Scores are model outputs, not calibrated probabilities of forgery; invalid low-variance blocks are distinct from negative detections.',metrics:{...runtime,totalMs:performance.now()-started,analysisMs,renderMs:performance.now()-renderStarted,analysisCacheHit,sourceReads,sourceReadMs,storage:output.storage,retainedResultBytes:w*h*3+cells*2,retainedDataBytes:dataBytes,rowsPerBlock:rows}};
 }catch(error){await Promise.allSettled([output?.dispose(),validStore?.dispose(),decisionStore?.dispose()]);if(dataRetained)budget.retained-=dataBytes;if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Median allocation failed after shared admission.');throw error;}finally{planning?.();staging?.();}
}
