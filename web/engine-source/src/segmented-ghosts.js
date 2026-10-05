import {allocateTypedArray,allocateOwnedTypedArray} from './allocation.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';import {parallelGhostPlanes,ghostPoolShape} from './ghost-stream-pool.js';
import {createRgbRecompression} from './jpeg-rgb-stream.js';import {numpySum} from './numpy-sum.js';import {requireValue,controlCheckpoint,checkAbort} from './errors.js';
export function segmentedGhostShape(image,p,{normalizedOnly=false}={}){const {width,height}=image.surface.descriptor;requireValue(width>=16&&height>=16,'JPEG Ghost Maps requires at least16×16 pixels.');const cols=Math.floor(width/16),rows=Math.floor(height/16),qualities=Array.from({length:Math.floor((p.high-p.low)/p.step)+1},(_,i)=>p.low+i*p.step),samples=cols*rows*qualities.length;return {width,height,cols,rows,qualities,samples,admissionBytes:samples*(normalizedOnly?8:35)+cols*rows*8+1024**2};}
// Quality publication is awaited: a quality is complete only once its owner has
// durably copied it. Producers may immediately reuse their single output plane.
export async function produceSegmentedGhostPlanes(image,p,{budget,signal,onProgress,getPlane,putPlane,onPlane,borrowPlanes=false,skipQualities=[],maxWorkers=1,adaptive=new AdaptiveConcurrency()}={}){
 const {width,height,cols,rows,qualities}=segmentedGhostShape(image,p),stages={},metrics={workers:1,kernel:'global-rgb-jpeg-ghost-scanlines',recompressions:0,qualityPlanesComputed:0,encodedCacheHits:0},missing=[],finished=new Set(skipQualities);image.rgbRecompression??=createRgbRecompression(image,budget);let completed=finished.size,callbackError,serialPlane,termsOwner;
 const progress=event=>{try{onProgress?.(event);}catch(error){callbackError=error;throw error;}};
 const place=async(quality,plane,store=false)=>{
  requireValue(plane instanceof Float64Array&&plane.length===cols*rows&&plane.every(Number.isFinite),'Raw Ghost quality plane required');
  try{if(store&&putPlane){const published=borrowPlanes?plane:allocateTypedArray(Float64Array,plane.length,{label:'ghost-published-plane'});if(!borrowPlanes)published.set(plane);await putPlane(quality,published);}await onPlane?.(quality,plane);}catch(error){callbackError=error;throw error;}
  finished.add(quality);completed++;progress({phase:'ghost-quality',quality,fraction:completed/qualities.length});
 };
 try{
 for(const quality of qualities){if(finished.has(quality)){stages[quality]=true;continue;}const plane=await getPlane?.(quality);stages[quality]=!!plane;if(plane)await place(quality,plane);else missing.push(quality);}
 const serialOne=async quality=>{
  await controlCheckpoint(signal);serialPlane??=allocateOwnedTypedArray(Float64Array,cols*rows,{budget,owner:'ela',label:'ghost-quality-plane'});termsOwner??=allocateOwnedTypedArray(Float64Array,256,{budget,owner:'ela',label:'ghost-sum-terms'});const plane=serialPlane.data,terms=termsOwner.data,details=await image.rgbRecompression.visit(quality,{phaseX:p.x,phaseY:p.y,signal,onProgress:e=>progress({quality,total:qualities.length,...e}),onBand:async(original,decoded,{y,rows:count})=>{
   for(let local=0;local+16<=count;local+=16){const by=(y+local)/16;for(let bx=0;bx<cols;bx++){let at=0;for(let yy=0;yy<16;yy++)for(let xx=0;xx<16;xx++){const i=((local+yy)*width+bx*16+xx)*3;let sum=0;for(let c=0;c<3;c++){const d=original[i+c]-decoded[i+c];sum+=d*d;}terms[at++]=sum/3;}plane[by*cols+bx]=numpySum(terms)/256;}}
  }});metrics.recompressions+=details.recompressions;metrics.qualityPlanesComputed++;metrics.encodedCacheHits+=Number(details.recompressedCache);metrics.sourcePasses=(metrics.sourcePasses??0)+details.sourcePasses;metrics.codecHeapCapacityBytes=Math.max(metrics.codecHeapCapacityBytes??0,details.codecHeapCapacityBytes);metrics.codecHeapMaximumBytes=details.codecHeapMaximumBytes;metrics.maxSourceWindowBytes=details.maxSourceWindowBytes;metrics.encodedStorage=details.encodedStorage;checkAbort(signal);await place(quality,plane,true);
 };
 // Reuse already-encoded ELA/Ghost qualities before dispatching new JPEG work.
 const reusable=missing.filter(q=>image.rgbRecompression.hasEncoded(q,{phaseX:p.x,phaseY:p.y}));for(const quality of reusable)await serialOne(quality);const fresh=missing.filter(q=>!finished.has(q));
 if(fresh.length){
  serialPlane?.release();serialPlane=null;termsOwner?.release();termsOwner=null;
  const shape=ghostPoolShape(image),maximum=typeof Worker==='undefined'||width*height<100000?1:Math.min(maxWorkers,fresh.length),key=width+'/'+height,plan=adaptive.select(key,maximum,budget,count=>(count>1?count*shape.workerBytes:shape.workingBytes)+shape.windowAllowance),started=performance.now();let retry=null;
  if(plan.ceiling>1){try{const pooled=await parallelGhostPlanes(image,fresh,plan.count,{budget,maxWorkers:plan.ceiling,signal,phaseX:p.x,phaseY:p.y,onProgress:progress,onPlane:(q,plane)=>place(q,plane,true)});const previous={recompressions:metrics.recompressions,qualityPlanesComputed:metrics.qualityPlanesComputed,sourcePasses:metrics.sourcePasses??0};Object.assign(metrics,pooled);for(const [name,value]of Object.entries(previous))metrics[name]+=value;}
   catch(error){checkAbort(signal);if(callbackError||!isWorkerResourceFailure(error)&&error.code!=='STORAGE_UNAVAILABLE')throw error;adaptive.reduce(key,plan.count,{error});const remaining=fresh.filter(q=>!finished.has(q));retry={code:error.code??'MEMORY_ALLOCATION',failedWorkers:plan.count,remainingQualities:remaining.length};const partial=error.ghostPoolMetrics;metrics.recompressions+=partial?.recompressions??fresh.length-remaining.length;metrics.qualityPlanesComputed+=partial?.qualityPlanesComputed??fresh.length-remaining.length;metrics.sourcePasses=(metrics.sourcePasses??0)+(partial?.sourcePasses??0);for(const q of remaining)await serialOne(q);}
  }else for(const quality of fresh)await serialOne(quality);
  adaptive.observe(key,{count:metrics.workers,maximum,milliseconds:performance.now()-started,units:width*height*fresh.length});metrics.scheduling={...plan,preflightExecutions:0,taskExecutions:retry?2:1,retry};
 }
 return {...metrics,stages};
 }finally{serialPlane?.release();termsOwner?.release();}
}
// Public raw/normalized cubes retain their existing layout and scientific API.
export async function segmentedGhostMaps(image,p,{normalizedOnly=false,...options}={}){
 const {width,height,cols,rows,qualities,samples}=segmentedGhostShape(image,p,{normalizedOnly}),raw=allocateTypedArray(Float64Array,samples,{label:'ghost-raw-cube'}),maps=normalizedOnly?raw:allocateTypedArray(Float64Array,samples,{label:'ghost-normalized-cube'}),{signal}=options;
 const metrics=await produceSegmentedGhostPlanes(image,p,{...options,onPlane(quality,plane){const qi=qualities.indexOf(quality);for(let i=0;i<plane.length;i++)raw[i*qualities.length+qi]=plane[i];}});
 for(let start=0;start<cols*rows;start+=4096){await controlCheckpoint(signal);for(let i=start;i<Math.min(cols*rows,start+4096);i++){let low=Infinity,high=-Infinity;for(let q=0;q<qualities.length;q++){const value=raw[i*qualities.length+q];low=Math.min(low,value);high=Math.max(high,value);}for(let q=0;q<qualities.length;q++)maps[i*qualities.length+q]=high===low?0:(raw[i*qualities.length+q]-low)/(high-low);}}
 return {engineMetrics:{...metrics,normalizedOnly},data:{qualities:Uint8Array.from(qualities),...(!normalizedOnly?{raw}:{}),maps,cols,rows,blockSize:16,layout:'row,column,quality',roll:[p.x,p.y],sourceDimensions:[width,height],completeExtent:[cols*16,rows*16]},semantics:'Full-resolution global JPEG squared RGB errors averaged in complete16×16 blocks; per-cell normalization across requested qualities. Circular phase is exact over source dimensions. Ghost evidence is not a tampering probability or recovered JPEG quality.'};
}
