import "../../runtime-context.js?v=0.33.2";
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {retainResult} from './retained-result.js';
import {FrequencyStripPool} from './frequency-strip-pool.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {frequencyParams} from './frequency.js';
import {frequencyStreamMath,frequencyStreamHeapBytes} from './frequency-stream-math.js';
import {createFloatPlane} from './segmented-float-plane.js';
import {createComplexPlane} from './segmented-complex-plane.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {segmentedDft} from './segmented-dft.js';
import {shiftedComplex} from './frequency-shift.js';
import {createNoiseTable} from './noise-table.js';
import {gray} from './pixel-utils.js';

const semantics='Native padded float32 DFT and four globally normalized views; complete axes preserve the global transform and reconstruction stripe arithmetic.';
// The cache owns this native pool, including its actual reservations/backing.
// Signals, progress callbacks and cooperators belong exclusively to each run.
const poolFields=['resourceOwner','resourceOperation','maxWorkers','workerHeapBytes','workerPixelBytes','workerURL','workerFactory'];
function frequencyPoolOwner(budget,adaptive){
 let pool,configuration,active,finish,closing,retiring=false,closed=false;
 const clear=async()=>{const current=pool;await current?.clear();if(pool===current){pool=null;configuration=null;}};
 return {
  begin(){requireValue(!retiring&&!closed,'Frequency cache is retiring.');requireValue(!active,'Frequency cache is already in use.');active=new Promise(resolve=>{finish=resolve;});},
  end(){const done=finish;finish=null;active=null;done?.();},
  async prepare(next){
   if(pool&&poolFields.some(key=>configuration[key]!==next[key])){await pool.clear();pool=null;}
   if(!pool){configuration=Object.fromEntries(poolFields.map(key=>[key,next[key]]));pool=new FrequencyStripPool(budget,{...next,adaptive});}
   return pool;
  },
  compatibleBudget(value){return value===budget;},
  clear,
  dispose(){
   retiring=true;if(closed)return Promise.resolve();if(closing)return closing;
   const task=(async()=>{await active;await clear();closed=true;})();
   closing=task;task.then(()=>{if(closing===task)closing=null;},()=>{if(closing===task)closing=null;});return task;
  }
 };
}
function frequencyCache(width,height,fft,polar,poolOwner,source){
 let retirement,retiring=false,initialized=false;const pending=new Set();
 const value={width,height,fft,polar,mask:null,maskKey:null,poolOwner,...source,disposed:false,
  get retiring(){return retiring;},
  dispose(){
   retiring=true;if(value.disposed)return Promise.resolve();if(retirement)return retirement;
   const task=(async()=>{
    // Wait for the active transform before retiring its endpoint. Published
    // surface/table leases independently own their backing until their ACK.
    await poolOwner.dispose();
    if(!initialized){for(const owner of [value.fft,value.polar,value.mask,...(value.analysis?.views??[]),value.analysis?.table,...(value.display?.views??[])])if(owner)pending.add(owner);initialized=true;}
    const settled=await Promise.allSettled([...pending].map(async owner=>{await owner.dispose();pending.delete(owner);}));
    const bad=settled.find(result=>result.status==='rejected');if(bad)throw bad.reason;
    value.fft=value.polar=value.mask=value.analysis=value.display=null;value.disposed=true;
   })();
   retirement=task;task.then(()=>{if(retirement===task)retirement=null;},()=>{if(retirement===task)retirement=null;});return task;
  }
 };return value;
}
function requestPoolMetrics(pool,before){
 const cumulative=pool.metrics(),result={...cumulative,poolCumulative:{...cumulative}};
 for(const key of ['completedStripJobs','workerStarts','workerReuses','retiredWorkers','stripRetries'])result[key]=(cumulative[key]??0)-(before[key]??0);
 result.poolMetricsScope='request deltas; workers is the pool lifetime peak';return result;
}

function frequencyNoiseTable(plane,options){
 const table=createNoiseTable(plane,options),firstDispose=table.dispose;let requested=false,closed=false,flight;
 table.dispose=()=>{
  if(closed)return Promise.resolve();if(flight)return flight;
  const task=Promise.resolve().then(()=>{if(requested)return plane.dispose();requested=true;return firstDispose();}).then(()=>{closed=true;});
  flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;
 };return table;
}
async function disposeAnalysis(value){if(value)await retireCompositeOwners([...value.views.map(v=>()=>v.dispose()),()=>value.table.dispose()],{concurrent:true});}
async function disposeDisplay(value){if(value)await retireCompositeOwners(value.views.map(v=>()=>v.dispose()),{concurrent:true});}
function leasedResult(cache,p,metrics={}){
 const refs=cache.analysis.views.slice();if(p.filter){requireValue(cache.display?.filter===p.filter,'Filtered frequency view unavailable.');refs.splice(2,2,...cache.display.views);}
 const views=refs.map(v=>v.lease());return {surface:views[0],rgbRecords:{high:{surface:views[1]},magnitude:{surface:views[2]},phase:{surface:views[3]}},tableRecords:{mask:{surface:cache.analysis.table.lease()}},frequencyCache:cache,data:{...cache.analysis.data,frequencyDimensions:[cache.width,cache.height]},semantics,metrics:{...cache.analysis.maskMetrics,complexTransport:cache.fft.transportMetrics(),basePolarStripJobs:0,baseNormalizeStripJobs:0,reconstructionPolarStripJobs:0,inputDepth:cache.inputDepth,numericalInputDepth:cache.inputDepth,sourceDepth:cache.sourceDepth,outputDepth:8,workers:0,completedStripJobs:0,preflightExecutions:0,policy:'immediate-useful-work',baseCached:true,maskCached:true,analysisCached:true,displayCached:true,...metrics}};
}

// Filtering commutes with the circular layout mapping. Keep the cached FFT in
// its native layout and shift only scalar weights while complete inverse axes
// are requested; this avoids a full complex intermediate and its round trip.
function weightedFrequencyInput(fft,weights,high=false){
 const {width,height}=fft,dx=Math.floor(width/2),dy=Math.floor(height/2),metrics={fullWeightBandReads:0,partialWeightReads:0,weightReadBytes:0,weightReadMs:0};
 return {width,height,ArrayType:Float32Array,transportMetrics:()=>({...metrics}),async read(x,y,w,h,{signal,cooperate}={}){
  checkAbort(signal);const values=await fft.read(x,y,w,h,{signal,cooperate});let doneY=0;
  while(doneY<h){const sy=(y+doneY+dy)%height,hh=Math.min(h-doneY,height-sy);let doneX=0,band;
   // Complete inverse axes request full-width row bands. Reading their
   // circular weights together avoids per-row temporary-store requests for
   // each half, while the same segments and float32 multiplications remain.
   if(x===0&&w===width){const at=performance.now();band=await weights.read(0,sy,width,hh,{signal,cooperate});metrics.fullWeightBandReads++;metrics.weightReadBytes+=band.byteLength;metrics.weightReadMs+=performance.now()-at;}
   while(doneX<w){checkAbort(signal);const sx=(x+doneX+dx)%width,ww=Math.min(w-doneX,width-sx);let part=band;
    if(!part){const at=performance.now();part=await weights.read(sx,sy,ww,hh,{signal,cooperate});metrics.partialWeightReads++;metrics.weightReadBytes+=part.byteLength;metrics.weightReadMs+=performance.now()-at;}
    const weightStride=band?width:ww,weightOffset=band?sx:0;
    for(let row=0;row<hh;row++)for(let column=0;column<ww;column++){const i=((doneY+row)*w+doneX+column)*2,m=part[row*weightStride+weightOffset+column],weight=high?Math.fround(1-m):m;values[i]*=weight;values[i+1]*=weight;}doneX+=ww;
   }doneY+=hh;
  }checkAbort(signal);return values;
 }};
}

// Metadata-only cold resident alternative for optional final-result retention.
// OpenCV getOptimalDFTSize enumerates 2/3/5-smooth sizes; no WASM/preflight is
// started here. These extents and live planes mirror the complete-axis stages
// below, including padded views, filter copies, GPU staging and worker grants.
export function frequencyResidentAdmissionPlan(descriptor,params,{runtimeBytes=0,ioBytes=0,storageOverheadBytes=0,profile={},backend='auto',blockPixels=262144}={}){
 const {width:sw,height:sh}=descriptor??{},p=frequencyParams(params),MiB=1024**2,nativeHeapLimit=128*MiB;
 if(![sw,sh,runtimeBytes,ioBytes,storageOverheadBytes,blockPixels].every(Number.isSafeInteger)||sw<1||sh<1||blockPixels<Math.max(sw,sh)*2||blockPixels>262144)return null;
 const optimal=n=>{let best=2147483647;for(let a=1;a<=best;a*=2)for(let b=a;b<=best;b*=3)for(let c=b;c<=best;c*=5)if(c>=n&&c<best)best=c;return best===2147483647?null:best;};
 const width=optimal(sw),height=optimal(sh);if(!width||!height||Math.max(width,height)>blockPixels)return null;
 const pixels=width*height,sourcePixels=sw*sh,rows=Math.max(1,Math.floor(blockPixels/width)),columns=Math.max(1,Math.floor(blockPixels/height));
 const stages=[{jobs:Math.ceil(height/rows),pixels:Math.min(rows,height)*width},{jobs:Math.ceil(width/columns),pixels:Math.min(columns,width)*height}];
 const maximum=typeof (profile.workerFactory??globalThis.Worker)==='function'?Math.min(32,profile.maxWorkers??1,Math.max(...stages.map(v=>v.jobs))):0;
 // Both pinned strip modules declare maximum128MiB. This is deliberately a
 // retention-only bound on growth, never an eager reservation or heap setting.
 const workerHeap=Math.max(nativeHeapLimit,profile.workerHeapBytes??0),workerPixelBytes=profile.workerPixelBytes??192;
 const workerBytes=maximum*workerHeap+Math.max(...stages.map(v=>Math.min(maximum,v.jobs)*v.pixels*workerPixelBytes));
 const planes={forwardGray:4*pixels,forwardRows:8*pixels,fft:8*pixels,polar:8*pixels,mask:4*pixels,weights:4*pixels,inverseRows:8*pixels,inverseMagnitude:4*pixels,sourceViews:6*sourcePixels,polarViews:6*pixels,filteredViews:p.filter?6*pixels:0};
 const base=planes.fft+planes.polar,storePeaks=[planes.forwardGray+planes.forwardRows+planes.fft,base+2*planes.mask,base+planes.mask+planes.weights+planes.inverseRows+planes.inverseMagnitude+3*sourcePixels,base+planes.mask+planes.weights+planes.inverseMagnitude+planes.sourceViews,base+planes.mask+planes.weights+planes.sourceViews+planes.polarViews+planes.filteredViews],residentStores=Math.max(...storePeaks);
 const workPixels=Math.max(blockPixels,width*Math.min(height,rows+2*p.filter)),workspaceBytes=nativeHeapLimit+workPixels*128;
 let gpuBytes=0;
 if(backend!=='cpu'&&globalThis.navigator?.gpu){
  const kernel=2*Math.trunc(Math.hypot(width,height)/2*p.smooth/100)+1,unique=Math.min(height,1+width*(width+1)/2),metadata=8*unique+4*height+8*width;
  // Generic and binary-run kernels are alternatives; use the larger exact
  // allocation formula, not a presumed number of unique runs in the image.
  const buffers=Math.max(16*pixels+kernel*4+32,8*pixels+width*unique*4+metadata+kernel*4+16);
  const planning=96*unique+4*height+12*width+Math.max(0,8*unique+4*height+8*width-4*pixels);
  gpuBytes=32*MiB+4*MiB+kernel*4+32+planning+8*pixels+buffers;
 }
 const bytes=runtimeBytes+ioBytes+storageOverheadBytes+residentStores+workspaceBytes+workerBytes+gpuBytes;
 return Number.isSafeInteger(bytes)&&bytes>0?{bytes,completeResidentAlternative:true,parallelWorkers:maximum,transformAdmission:{kind:'frequency-complete-axes-resident-v1',dimensions:[width,height],blockPixels,planes,residentStorePeakBytes:residentStores,workspaceBytes,workerBytes,workerHeapUpperBytes:workerHeap,gpuBytes,retentionOnly:true}}:null;
}

export async function segmentedFrequency(image,params,{budget,signal,onProgress,cache,blockPixels=262144,storage='auto',rowSlabBytes=0,temporaryTileSize=128,profile={},frequencyGpu,backend='cpu',accountedHeapBytes=0,cooperate:requestCooperate}={}){
 const nativeHeap=()=>Math.max(8*1024**2,frequencyStreamHeapBytes());requireValue(Number.isSafeInteger(accountedHeapBytes)&&accountedHeapBytes>=0&&accountedHeapBytes<=nativeHeap(),'Invalid already accounted frequency heap.');const extraHeap=()=>Math.max(0,nativeHeap()-accountedHeapBytes);
 requireValue(requestCooperate===undefined||typeof requestCooperate==='function','Invalid frequency cooperator.');const cooperate=requestCooperate??createCooperator(signal),checkpoint=async()=>{checkAbort(signal);await cooperate(signal);checkAbort(signal);};
 requireValue(['cpu','auto','webgpu'].includes(backend),'Invalid frequency backend.');if(backend==='webgpu'&&!frequencyGpu)throw new EngineError('UNSUPPORTED_BACKEND','A WebGPU frequency adapter is required.');
 const descriptor=image.surface.descriptor,inputDepth=descriptor.format==='rgb16'?16:8,source={inputDepth,sourceDepth:descriptor.sourceDepth??inputDepth,sourceSurfaceId:descriptor.id??null,sourceRevision:descriptor.revision??1,sourceSurface:image.surface};
 const phaseMetrics={basePolarStripJobs:0,baseNormalizeStripJobs:0,reconstructionPolarStripJobs:0,reconstructionTransport:[],weightTransport:[]};
 const p=frequencyParams(params),analysisKey=JSON.stringify([p.split,p.smooth,p.threshold,backend]),{width:sw,height:sh}=descriptor,owned=new Set(),surfaces=[];let newCache,mask,pool,poolBefore,keepPool=false,failed=false,primary;const refusedOwners=new Set();
 requireValue(!cache?.disposed&&!cache?.retiring,'Frequency cache is retiring.');requireValue(!cache||cache.inputDepth===inputDepth&&cache.sourceSurfaceId===source.sourceSurfaceId&&cache.sourceRevision===source.sourceRevision&&(source.sourceSurfaceId!==null||cache.sourceSurface===image.surface),'Frequency cache belongs to another source or numerical depth.');requireValue(!cache?.poolOwner||cache.poolOwner.compatibleBudget(budget),'Frequency pool belongs to another budget.');checkAbort(signal);if(cache?.analysis?.key===analysisKey&&(!p.filter||cache.display?.filter===p.filter))return leasedResult(cache,p);
 requireValue(Number.isSafeInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid frequency strip size.');requireValue(Number.isSafeInteger(rowSlabBytes)&&rowSlabBytes>=0&&rowSlabBytes<=1024**2,'Invalid frequency row staging size.');requireValue(Number.isSafeInteger(temporaryTileSize)&&temporaryTileSize>=0&&temporaryTileSize<=128,'Invalid frequency temporary tile size.');
 const owner=cache?.poolOwner??frequencyPoolOwner(budget,image.frequencyScheduling??=(new Map()));requireValue(owner.compatibleBudget(budget),'Frequency pool belongs to another budget.');owner.begin();
 try{
 pool=await owner.prepare(profile);poolBefore=pool.metrics();
 const initial=extraHeap(),minimum=Math.max(sw,sh)*2,choose=room=>Math.min(blockPixels,Math.floor((room-Math.max(initial,Math.min(24*1024**2,room/2))-4*1024**2)/128));let room=budget.limit-budget.retained-budget.active,block=choose(room);
 if(block<minimum&&blockPixels>=minimum){
  // Reclaim real idle endpoints before rejecting an axis that fitted without
  // retained workers. No reclaimable byte is treated as already released.
  const fixed=4*1024**2+minimum*128,small=Math.max(fixed+initial,fixed*2),needed=Math.min(small<=48*1024**2?small:Infinity,Math.max(48*1024**2,fixed+Math.max(initial,24*1024**2)));
  budget.room(needed);room=budget.limit-budget.retained-budget.active;block=choose(room);
 }
 if(block<minimum)throw new EngineError('MEMORY_LIMIT','One padded frequency axis and filter halo must fit.');
 const options={budget,signal,storage:storage==='auto'&&(image.ensureTemporarySession||image.session)&&sw*sh*48>room-initial-block*128?'temporary':storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:Math.max(8192,block*8)};
 // The complex plane fixes tiled layout only for backing born temporary.
 // RAM and later RAM-to-disk migration keep their row-major byte order.
 options.rowSlabBytes=options.storage==='memory'?0:rowSlabBytes;options.temporaryTileSize=temporaryTileSize;
 const scalar=async(w,h)=>{const v=await createFloatPlane(w,h,{...options,ArrayType:Float32Array});owned.add(v);return v;},complex=async(w,h)=>{const v=await createComplexPlane(w,h,options);owned.add(v);return v;},drop=async v=>{if(!owned.has(v))return;try{await v.dispose();owned.delete(v);}catch(error){refusedOwners.add(v);throw withRetirementOwner(error,v,error);}};
 const progress=(phase,completed,total)=>onProgress?.({phase,completed,total});
 const work=async(fn,pixels=block)=>{const release=budget.reserve(extraHeap()+pixels*128);try{return await fn();}finally{release();}};
  const math=await work(()=>frequencyStreamMath()),width=math.optimal(sw),height=math.optimal(sh);requireValue(width>0&&height>0,'Image exceeds OpenCV DFT dimensions.');
  const rows=Math.max(1,Math.floor(block/width));
  const render=async(plane,w,h,lo,hi,filter=0)=>work(async()=>{
   const store=await createSegmentedBytes(w*h*3,options);let success=false,renderFailed=false,renderPrimary;try{for(let y=0;y<h;y+=rows){await checkpoint();const count=Math.min(rows,h-y),top=Math.max(0,y-filter),bottom=Math.min(h,y+count+filter);let values=await plane.read(0,top,w,bottom-top,{signal,cooperate});if(lo!==undefined)values=math.normalize(values,lo,hi);if(filter)values=math.gaussian8(values,w,bottom-top,filter);const bytes=new Uint8Array(w*count*3);for(let i=0;i<w*count;i++){const value=values[(y-top)*w+i],j=i*3;bytes[j]=value;bytes[j+1]=value;bytes[j+2]=value;}await store.write(bytes,y*w*3);progress('frequency-render',Math.min(h,y+rows),h);}await store.flush();const surface=createRgbSurface(store,{width:w,height:h,budget});surfaces.push(surface);success=true;return surface;}catch(error){renderFailed=true;renderPrimary=error;throw error;}finally{if(!success)await retireCompositeOwners([()=>store.dispose()],renderFailed?{primary:renderPrimary}:{});}
  },Math.max(block,w*Math.min(h,rows+filter*2)));
  const filtered=async refs=>{
   const result=[];for(const ref of refs){const view=ref.lease();let viewFailed=false,viewPrimary;try{result.push(await render({async read(x,y,w,h,hooks){const part=await view.readWindow({x,y,width:w,height:h},hooks);try{return Float32Array.from({length:w*h},(_,i)=>part.pixels.data[i*3]);}finally{part.release();}}},width,height,undefined,undefined,p.filter));}catch(error){viewFailed=true;viewPrimary=error;throw error;}finally{await retireCompositeOwners([()=>view.dispose()],viewFailed?{primary:viewPrimary}:{});}}return result;
  };
  const renderPolarPair=async(weights)=>work(async()=>{
   const stores=[];let transferred=0,failed=false,primary;
   try{
    for(let k=0;k<2;k++)stores.push(await createSegmentedBytes(width*height*3,options));
    for(let y=0;y<height;y+=rows){
     await checkpoint();const h=Math.min(rows,height-y),polar=await cache.polar.read(0,y,width,h,{signal,cooperate}),m=await weights.read(0,y,width,h,{signal,cooperate}),bytes=[new Uint8Array(width*h*3),new Uint8Array(width*h*3)];
     const magnitudeBytes=bytes[0],phaseBytes=bytes[1];for(let i=0;i<m.length;i++){const a=Math.trunc(Math.fround(polar[i*2]*m[i]))&255,b=Math.trunc(Math.fround(polar[i*2+1]*m[i]))&255,j=i*3;magnitudeBytes[j]=a;magnitudeBytes[j+1]=a;magnitudeBytes[j+2]=a;phaseBytes[j]=b;phaseBytes[j+1]=b;phaseBytes[j+2]=b;}
     for(let k=0;k<2;k++)await stores[k].write(bytes[k],y*width*3);progress('frequency-render',Math.min(height,y+rows),height);
    }
    for(const store of stores)await store.flush();const result=[];
    for(const store of stores){const view=createRgbSurface(store,{width,height,budget});surfaces.push(view);transferred++;result.push(view);}return result;
   }catch(error){failed=true;primary=error;throw error;}
   finally{await retireCompositeOwners(stores.slice(transferred).map(store=>()=>store.dispose()),failed?{primary,concurrent:true}:{concurrent:true});}
  });
  if(cache?.analysis?.key===analysisKey){
   const display=await filtered(cache.analysis.views.slice(2));checkAbort(signal);const previous=cache.display;cache.display=null;await disposeDisplay(previous);cache.display={filter:p.filter,views:display.map(retainResult)};surfaces.length=0;const result=leasedResult(cache,p,{...requestPoolMetrics(pool,poolBefore),displayCached:false,blockPixels:block});keepPool=cache.poolOwner===owner&&!profile.resourceOperation;return result;
  }
  if(!cache){
   let grayPlane;await work(async()=>{grayPlane=await scalar(width,height);for(let y=0;y<height;y+=rows){await checkpoint();const h=Math.min(rows,height-y),values=new Float32Array(width*h);if(y<sh){const part=await image.surface.readWindow({x:0,y,width:sw,height:Math.min(h,sh-y)},{signal,cooperate});try{requireValue(inputDepth!==16||part.pixels.format==='rgb16'&&part.pixels.data instanceof Uint16Array,'Frequency native16 input requires real uint16 samples.');for(let yy=0;yy<part.pixels.height;yy++)for(let x=0;x<sw;x++){const i=(yy*sw+x)*3;values[yy*width+x]=gray(part.pixels.data[i],part.pixels.data[i+1],part.pixels.data[i+2]);}}finally{part.release();}}await grayPlane.write(values,0,y,width,h,{signal,cooperate});progress('frequency-gray',Math.min(height,y+rows),height);}});
   const fft=await segmentedDft(grayPlane,{...options,blockPixels:block,pool,cooperate,onProgress});owned.add(fft);await drop(grayPlane);let polar;
   await work(async()=>{polar=await complex(width,height);const shifted=shiftedComplex(fft),minimum=[Infinity,Infinity],maximum=[-Infinity,-Infinity];let completed=0;
    await pool.run({count:Math.ceil(height/rows),pixels:Math.min(rows,height)*width,key:`base-polar/${width}/${height}/${rows}`,signal,
     prepare:async i=>{await checkpoint();const y=i*rows,h=Math.min(rows,height-y);return{op:'polar-stats',values:await shifted.read(0,y,width,h,{signal,cooperate})};},
     local:j=>math.polarStats(j.values),consume:async(r,i)=>{const y=i*rows,h=Math.min(rows,height-y);for(let k=0;k<2;k++){minimum[k]=Math.min(minimum[k],r.minimum[k]);maximum[k]=Math.max(maximum[k],r.maximum[k]);}await polar.write(r.values,0,y,width,h,{signal,cooperate});phaseMetrics.basePolarStripJobs++;completed+=h;progress('frequency-polar-analysis',completed,height);}
    });
    completed=0;await pool.run({count:Math.ceil(height/rows),pixels:Math.min(rows,height)*width,key:`base-normalize/${width}/${height}/${rows}`,signal,
     prepare:async i=>{await checkpoint();const y=i*rows,h=Math.min(rows,height-y);return{op:'normalize-polar',values:await polar.read(0,y,width,h,{signal,cooperate}),minimum,maximum};},
     local:j=>({values:math.normalizePolar(j.values,j.minimum,j.maximum)}),consume:async(r,i)=>{const y=i*rows,h=Math.min(rows,height-y);await polar.write(r.values,0,y,width,h,{signal,cooperate});phaseMetrics.baseNormalizeStripJobs++;completed+=h;progress('frequency-polar',completed,height);}
    });
   });
   newCache=frequencyCache(width,height,fft,polar,owner,source);cache=newCache;
  }
  const maskKey=JSON.stringify([p.split,p.smooth,backend]),maskCached=cache.maskKey===maskKey;
  let maskMetrics=maskCached?cache.maskMetrics??{backend:'cpu'}:{backend:'cpu'};
  if(maskCached)mask=cache.mask;
  else await work(async()=>{
   if(frequencyGpu&&backend!=='cpu'){
    // GPU buffer admission belongs to FrequencyGpu. This reservation covers
    // its full CPU input/readback arrays until persisted to the global plane.
    let release;
    try{release=budget.reserve(width*height*8);const result=await frequencyGpu.mask(width,height,p,{signal,required:backend==='webgpu',prepareMask:async()=>{const input=new Float32Array(width*height);for(let y=0;y<height;y+=rows){await checkpoint();input.set(math.maskHorizontal(width,height,y,Math.min(rows,height-y),p.split,0),y*width);}return {input,weights:math.maskWeights(width,height,p.smooth)};}});maskMetrics=result.metrics;
     if(result.mask){mask=await scalar(width,height);for(let y=0;y<height;y+=rows){await checkpoint();const h=Math.min(rows,height-y);await mask.write(result.mask.subarray(y*width,(y+h)*width),0,y,width,h,{signal,cooperate});}progress('frequency-mask-gpu',1,1);return;}
    }catch(error){if(error?.cleanupOwner)throw error;checkAbort(signal);if(backend==='webgpu'||error.code!=='MEMORY_LIMIT')throw error;frequencyGpu.dispose();if(mask){await drop(mask);mask=null;}maskMetrics={backend:'cpu',reason:'Full GPU mask staging exceeds shared memory.'};}finally{release?.();}
   }
   const horizontal=await scalar(width,height);let completed=0;
   await pool.run({count:Math.ceil(height/rows),pixels:Math.min(rows,height)*width,key:`mask-h/${width}/${height}/${p.split}/${p.smooth}/${rows}`,signal,
    prepare:async i=>{await checkpoint();return {op:'mask-horizontal',width,height,top:i*rows,rows:Math.min(rows,height-i*rows),split:p.split,smooth:p.smooth};},local:j=>({values:math.maskHorizontal(j.width,j.height,j.top,j.rows,j.split,j.smooth)}),consume:async(r,i)=>{const y=i*rows,h=Math.min(rows,height-y);await horizontal.write(r.values,0,y,width,h,{signal,cooperate});completed+=h;progress('frequency-mask-horizontal',completed,height);}
   });
   mask=await scalar(width,height);const step=Math.max(1,Math.floor(block/height));completed=0;
   await pool.run({count:Math.ceil(width/step),pixels:Math.min(step,width)*height,key:`mask-v/${width}/${height}/${p.split}/${p.smooth}/${step}`,signal,
    prepare:async i=>{await checkpoint();const x=i*step,w=Math.min(step,width-x),values=await horizontal.read(x,0,w,height,{signal,cooperate}),columns=new Float32Array(values.length);for(let xx=0;xx<w;xx++)for(let y=0;y<height;y++)columns[xx*height+y]=values[y*w+xx];return {op:'mask-vertical',values:columns,width,height,columns:w,smooth:p.smooth};},local:j=>({values:math.maskVertical(j.values,j.width,j.height,j.columns,j.smooth)}),consume:async(r,i)=>{const x=i*step,w=Math.min(step,width-x),values=new Float32Array(r.values.length);for(let xx=0;xx<w;xx++)for(let y=0;y<height;y++)values[y*w+xx]=r.values[xx*height+y];await mask.write(values,x,0,w,height,{signal,cooperate});completed+=w;progress('frequency-mask-vertical',completed,width);}
   });await drop(horizontal);
  });
  let weights,zero=0;await work(async()=>{weights=await scalar(width,height);for(let y=0;y<height;y+=rows){await checkpoint();const h=Math.min(rows,height-y),v=await mask.read(0,y,width,h,{signal,cooperate}),polar=p.threshold?await cache.polar.read(0,y,width,h,{signal,cooperate}):null;for(let i=0;i<v.length;i++){v[i]=v[i]/mask.maximum;if(p.threshold&&polar[i*2]<Math.trunc(p.threshold/100*255))v[i]=0;if(v[i]===0)zero++;}await weights.write(v,0,y,width,h,{signal,cooperate});}});
  const rgb=[];
  for(let high=0;high<2;high++){
   const filtered=weightedFrequencyInput(cache.fft,weights,!!high);
   const magnitude=await segmentedDft(filtered,{...options,blockPixels:block,pool,cooperate,inverse:true,inverseMagnitude:{width:high?width:sw,height:high?height:sh},onProgress});owned.add(magnitude);
   phaseMetrics.reconstructionPolarStripJobs+=magnitude.magnitudeStripJobs;
   rgb.push(await render(magnitude,sw,sh,magnitude.magnitudeStats.minimum,magnitude.magnitudeStats.maximum));phaseMetrics.reconstructionTransport.push({view:high?'high':'low',...magnitude.transportMetrics()});phaseMetrics.weightTransport.push({view:high?'high':'low',...filtered.transportMetrics()});await drop(magnitude);
  }
  rgb.push(...await renderPolarPair(weights));
  const nextAnalysis={key:analysisKey,views:rgb.map(retainResult),table:retainResult(frequencyNoiseTable(weights,{budget,block:1,columns:['frequency_y','frequency_x','weight'],valueType:Float32Array,coordinates:'frequency'})),data:{frequencyDimensions:[width,height],zeroPercent:p.threshold?zero/(width*height)*100:0},maskMetrics};
  // Until commit, all original stores remain in the transaction's cleanup set.
  const display=p.filter?await filtered(nextAnalysis.views.slice(2)):null;
  checkAbort(signal);if(!maskCached){const previousMask=cache.mask;cache.mask=null;cache.maskKey=null;try{await previousMask?.dispose();}catch(error){throw withRetirementOwner(error,previousMask,error);}cache.mask=mask;cache.maskKey=maskKey;cache.maskMetrics=maskMetrics;if(!newCache)owned.delete(mask);}
  const previousDisplay=cache.display,previousAnalysis=cache.analysis;cache.display=null;cache.analysis=null;await retireCompositeOwners([()=>disposeDisplay(previousDisplay),()=>disposeAnalysis(previousAnalysis)],{concurrent:true});cache.analysis=nextAnalysis;cache.display=display?{filter:p.filter,views:display.map(retainResult)}:null;owned.delete(weights);if(newCache){owned.delete(cache.fft);owned.delete(cache.polar);owned.delete(mask);}surfaces.length=0;
  const result=leasedResult(cache,p,{...requestPoolMetrics(pool,poolBefore),...phaseMetrics,fusedInverseMagnitude:true,temporaryComplexRowSlabBytes:options.rowSlabBytes,baseCached:!newCache,maskCached,analysisCached:false,displayCached:false,blockPixels:block});keepPool=cache.poolOwner===owner&&!profile.resourceOperation;return result;
 }catch(error){failed=true;primary=error;throw error;}
 finally{
  // A primitive failure remains primary. Every independent cleanup is awaited;
  // a borrowed cache keeps its owner when a retirement needs an ACK retry.
  const tasks=[...(!keepPool?[()=>owner.clear()]:[]),...[...owned,...surfaces].filter(value=>!refusedOwners.has(value)).map(value=>()=>value.dispose())];
  try{await retireCompositeOwners(tasks,failed?{primary,concurrent:true}:{concurrent:true});}finally{owner.end();}
 }
}
