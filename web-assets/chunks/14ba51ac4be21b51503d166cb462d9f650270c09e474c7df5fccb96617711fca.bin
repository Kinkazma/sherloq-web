import "../../runtime-context.js?v=0.30.0";
import {waveletForwardLevel} from './wavelet-forward-gpu.js';
import {waveletResidentReconstruction} from './wavelet-resident-reconstruction-gpu.js';
import {gpuFallbackError} from './gpu-native-boundary.js';
import {WaveletReconstructionGpu} from './wavelet-reconstruction-gpu.js';
import {WaveletStripPool,retireWaveletPlans,appendWaveletCleanup} from './wavelet-strip-pool.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {waveletParams} from './wavelets.js';
import {waveletStreamMath,waveletStreamHeapBytes} from './wavelet-stream-math.js';
import {createFloatPlane} from './segmented-float-plane.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';

export async function segmentedWavelet(image,params,options={}){
 const p=waveletParams(params),root=options.cache;
 if(root&&root.wavelet!==p.wavelet)throw new EngineError('INVALID_INPUT','Wavelet cache does not match.');
 if(root?.decomposition==='gpu-forward-high-low'&&(root.nativeVariant||options.original||options.backend==='cpu'||p.threshold===0||!['soft','garrote'].includes(p.mode))){
  const record=await segmentedWaveletCore(image,p,{...options,cache:root.nativeVariant,disableForward:true});
  if(!root.nativeVariant){root.nativeVariant=record.waveletCache;root.resources.add(record.waveletCache);}
  return {...record,waveletCache:root};
 }
 return segmentedWaveletCore(image,p,options);
}

async function segmentedWaveletCore(image,params,{budget,signal,onProgress,cache,blockPixels=65536,storage='auto',profile={},accountedHeapBytes=0,backend='auto',original=false,disableForward=false}={}){
 const p=waveletParams(params),{width,height}=image.surface.descriptor,cooperate=createCooperator(signal),coefficientsCachedAtStart=!!cache;
 requireValue(Number.isInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid wavelet strip size.');
 if(cache&&cache.wavelet!==p.wavelet)throw new EngineError('INVALID_INPUT','Wavelet cache does not match.');
 const workerConfig=['workerFactory','workerURL','workerHeapBytes','workerPixelBytes'],poolCompatible=cache?.pool?.budget===budget&&workerConfig.every(key=>cache.poolConfig?.[key]===profile[key]),cachedPool=poolCompatible?cache.pool:null,idleBytes=[...(cachedPool?.workers.values()??[])].filter(slot=>!slot.busy&&!slot.retirement).reduce((n,slot)=>n+slot.bytes,0);
 const nativeHeap=Math.max(8*1024**2,waveletStreamHeapBytes());requireValue(Number.isSafeInteger(accountedHeapBytes)&&accountedHeapBytes>=0&&accountedHeapBytes<=nativeHeap,'Invalid already accounted wavelet heap.');const heap=nativeHeap-accountedHeapBytes,room=budget.limit-budget.retained-budget.active+idleBytes;
 const block=Math.min(blockPixels,Math.floor((room-heap-4*1024**2)/192));
 if(block<Math.max(width,height))throw new EngineError('MEMORY_LIMIT','One complete wavelet axis must fit in the streaming workspace.');
 const release=budget.reserve(heap+block*192),owned=new Set(),pool=cachedPool??new WaveletStripPool(budget,{...profile,adaptive:image.waveletScheduling??=(new Map())});let output,newCache,candidateSurface,returning=false,failed=false,primary,released=false,gpuDisabled=false,gpuCalls=0,gpuFallbacks=0,renderedGpu=false,nativeFinalMs=0,finalWorkerStarts=pool.starts,forwardCalls=0,forwardGpu=null;const poolBefore=pool.metrics(),poolMetrics=()=>{const current=pool.metrics(),delta={...current};for(const key of ['completedStripJobs','workerStarts','workerReuses','retiredWorkers','stripRetries'])delta[key]=current[key]-poolBefore[key];return delta;};
 if(cachedPool){if(Number.isInteger(profile.maxWorkers)&&profile.maxWorkers>0)pool.maximum=profile.maxWorkers;pool.peak=1;}
 const cleanupOwner=pool.ownCleanup(async capture=>{await retireWaveletPlans(owned,capture);if(!returning){if(candidateSurface){await candidateSurface.dispose();candidateSurface=null;}if(output){await output.dispose();output=null;}await newCache?.dispose();}if(!released){release();released=true;}});
 // Automatic stores admit real allocated segments and migrate on pressure.
 // Forcing every band to disk from a whole-image upper bound made strided
 // transfers dominate even when the retained native coefficients fit in RAM.
 const coefficientStorage=storage;
 const options={budget,signal,storage:coefficientStorage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:Math.max(8192,block*8)};
 const plane=async(w,h)=>{const v=await createFloatPlane(w,h,options);owned.add(v);return v;};
 const drop=async v=>{if(owned.has(v)){await v.dispose();owned.delete(v);}};
 const progress=(phase,completed,total)=>onProgress?.({phase,completed,total});
 try{
  const math=await waveletStreamMath(),info=math.info(p.wavelet,width,height),filter=info.filterLength;
  const down=async(input,axis,label)=>{
   const w=axis===1?Math.floor((input.width+filter-1)/2):input.width,h=axis===0?Math.floor((input.height+filter-1)/2):input.height;
   const a=await plane(w,h),d=await plane(w,h),span=axis===0?input.height:input.width,total=axis===0?input.width:input.height,step=Math.max(1,Math.floor(block/span));
   const job=i=>{const at=i*step,n=Math.min(step,total-at);return {x:axis===0?at:0,y:axis===0?0:at,iw:axis===0?n:input.width,ih:axis===0?input.height:n};};let completed=0;
   await pool.run({count:Math.ceil(total/step),pixels:Math.max(step*span,step*(axis===0?h:w)*2),key:`down/${p.wavelet}/${axis}/${span}/${step}`,signal,
    prepare:async i=>{await cooperate();const j=job(i);return {op:'down',values:await input.read(j.x,j.y,j.iw,j.ih,{signal,cooperate}),width:j.iw,height:j.ih,wavelet:p.wavelet,axis};},
    local:r=>math.down(r.values,r.width,r.height,r.wavelet,r.axis),consume:async(result,i)=>{const j=job(i);await a.write(result.a,j.x,j.y,result.width,result.height,{signal,cooperate});await d.write(result.d,j.x,j.y,result.width,result.height,{signal,cooperate});completed+=axis===0?j.iw:j.ih;progress(label,completed,total);}
   });return [a,d];
  };
  const up=async(a,d,axis,thresholdA,thresholdD,label)=>{
   const iw=d.width,ih=d.height,w=axis===1?2*iw-filter+2:iw,h=axis===0?2*ih-filter+2:ih,out=await plane(w,h);
   const span=axis===0?ih:iw,total=axis===0?iw:ih;let stageBlock=block,gpuWorkspace;
   let eligible=profile.waveletGpuTransport==='strips'&&!gpuDisabled&&!original&&backend==='webgpu'&&p.threshold>0&&globalThis.navigator?.gpu&&cache.resources instanceof Set&&w*h>=262144;
   if(eligible){try{stageBlock=Math.min(262144,block*4);gpuWorkspace=budget.reserve((stageBlock-block)*192);}catch(error){if(!gpuFallbackError(error))throw error;stageBlock=block;eligible=false;gpuDisabled=true;await cache.gpu?.dispose();}}
   const step=Math.max(1,Math.floor(stageBlock/span));
   try{
   const job=i=>{const at=i*step,n=Math.min(step,total-at);return {x:axis===0?at:0,y:axis===0?0:at,sw:axis===0?n:iw,sh:axis===0?ih:n};};let completed=0;
   const prepare=async i=>{await cooperate();const j=job(i);return {op:'up',a:await a.read(j.x,j.y,j.sw,j.sh,{signal,cooperate}),d:await d.read(j.x,j.y,j.sw,j.sh,{signal,cooperate}),width:j.sw,height:j.sh,wavelet:p.wavelet,axis,thresholdA,thresholdD,maximumA:a.maximum,maximumD:d.maximum,percent:p.threshold,mode:p.mode};};
   const threshold=r=>{if(r.thresholdA)math.threshold(r.a,r.maximumA,r.percent,r.mode);if(r.thresholdD)math.threshold(r.d,r.maximumD,r.percent,r.mode);};
   const consume=async(r,i)=>{const j=job(i);await out.write(r.values,j.x,j.y,r.width,r.height,{signal,cooperate});completed+=axis===0?j.sw:j.sh;progress(label,completed,total);};
   if(eligible){
    if(cache.gpu?.closed){const previous=cache.gpu;await previous.dispose();cache.resources.delete(previous);cache.gpu=null;}if(!cache.gpu){cache.gpu=new WaveletReconstructionGpu(budget,profile);cache.resources.add(cache.gpu);}cache.gpu.profile=profile;
    const gpu=cache.gpu;
    for(let i=0;i<Math.ceil(total/step);i++){
     const r=await prepare(i);threshold(r);let used=false;
     if(!gpuDisabled){used=await gpu.up(r.a,r.d,r.width,r.height,r.wavelet,r.axis,{signal,consume:value=>consume(value,i)});if(used)gpuCalls++;else{gpuFallbacks++;gpuDisabled=true;}}
     if(!used)await consume(math.up(r.a,r.d,r.width,r.height,r.wavelet,r.axis),i);
    }
   }else await pool.run({count:Math.ceil(total/step),pixels:Math.max(step*span,step*(axis===0?h:w)),key:`up/${p.wavelet}/${axis}/${span}/${step}`,signal,prepare,local:r=>{threshold(r);return math.up(r.a,r.d,r.width,r.height,r.wavelet,r.axis);},consume});
   return out;
   }finally{gpuWorkspace?.();}
  };
  if(!cache){
   let a=await plane(width,height);const rows=Math.max(1,Math.floor(block/width));
   for(let y=0;y<height;y+=rows){await cooperate();const h=Math.min(rows,height-y),part=await image.surface.readWindow({x:0,y,width,height:h},{signal,cooperate});try{const values=new Float64Array(width*h);for(let i=0;i<values.length;i++)values[i]=part.pixels.data[i*3+2];await a.write(values,0,y,width,h,{signal,cooperate});}finally{part.release();}progress('blue-channel',Math.min(y+rows,height),height);}
   const details=[];
   let forwardAllowed=!disableForward&&!original&&backend==='webgpu'&&['soft','garrote'].includes(p.mode)&&p.threshold>0&&filter>=16&&width*height>=262144&&globalThis.navigator?.gpu;
   for(let level=0;level<info.maximumLevel;level++){
    if(a.width*a.height<262144)forwardAllowed=false;
    if(forwardAllowed){
     let stageLease;try{stageLease=budget.reserve(a.width*a.height*32+4*1024**2);}catch(error){if(!gpuFallbackError(error))throw error;forwardAllowed=false;}
     if(stageLease)try{
      if(!forwardGpu||forwardGpu.closed){if(forwardGpu){await forwardGpu.dispose();owned.delete(forwardGpu);}forwardGpu=new WaveletReconstructionGpu(budget,profile);owned.add(forwardGpu);}
      const values=await a.read(0,0,a.width,a.height,{signal,cooperate});let next;
      const used=await waveletForwardLevel(forwardGpu,values,a.width,a.height,p.wavelet,{signal,consume:async result=>{const ll=await plane(result.width,result.height),hh=await plane(result.width,result.height),vv=await plane(result.width,result.height),dd=await plane(result.width,result.height);for(const [target,value]of[[ll,result.a],[hh,result.h],[vv,result.v],[dd,result.d]])await target.write(value,0,0,result.width,result.height,{signal,cooperate});next={ll,hh,vv,dd};}});
      if(used){await drop(a);details.push([next.hh,next.vv,next.dd]);a=next.ll;forwardCalls++;progress('decompose-'+level+'-gpu',level+1,info.maximumLevel);continue;}
      forwardAllowed=false;gpuFallbacks++;
     }finally{stageLease();}
    }
    const [lo,hi]=await down(a,0,`decompose-${level}-vertical`);await drop(a);
    const [ll,v]=await down(lo,1,`decompose-${level}-low`);await drop(lo);
    const [h,d]=await down(hi,1,`decompose-${level}-high`);await drop(hi);
    details.push([h,v,d]);a=ll;
   }
   const planes=[a,...details.flat()],cachePlanes=new Set([...planes,...(forwardGpu?[forwardGpu]:[])]),cacheOwner=pool.ownCleanup(capture=>retireWaveletPlans(cachePlanes,capture));
   newCache={wavelet:p.wavelet,width,height,maximumLevel:info.maximumLevel,a,details,pool,poolConfig:Object.fromEntries(workerConfig.map(key=>[key,profile[key]])),resources:cachePlanes,gpu:forwardGpu,decomposition:forwardCalls?'gpu-forward-high-low':'native',timing:{},dispose(){return cacheOwner.retire({endpoints:true});}};for(const v of planes)owned.delete(v);if(forwardGpu)owned.delete(forwardGpu);cache=newCache;
  }
  let a=cache.a;const maximum=cache.maximumLevel,level=p.threshold===0?0:Math.min(p.level??(maximum?Math.max(1,Math.floor(maximum/2)):0),maximum);
  const timing=cache.timing??=( {} ),timingProfile=JSON.stringify([profile.maxWorkers??1,profile.waveletGpuTransport??'resident']);if(timing.profile!==undefined&&timing.profile!==timingProfile)for(const key of ['nativeFinalMs','gpuFinalMs','nativeFinalObservedMs','nativeFinalWorkerStarts'])delete timing[key];timing.profile=timingProfile;
  for(let i=maximum-1;i>=0;i--){const finalStarted=i===0?performance.now():0;if(i===0)finalWorkerStarts=pool.starts;
   const [h,v,d]=cache.details[i],threshold=i<level&&p.threshold>0;
   const residentEligible=i===0&&!gpuDisabled&&!original&&backend==='webgpu'&&p.threshold>0&&globalThis.navigator?.gpu&&cache.resources instanceof Set&&width*height>=262144;
   if(residentEligible){
    let workspace;const pixels=h.width*h.height;
    try{workspace=budget.reserve(pixels*96+8*1024**2);}catch(error){if(!gpuFallbackError(error))throw error;gpuDisabled=true;await cache.gpu?.dispose();}
    if(workspace)try{
     if(cache.gpu?.closed){const previous=cache.gpu;await previous.dispose();cache.resources.delete(previous);cache.gpu=null;}
     if(!cache.gpu){cache.gpu=new WaveletReconstructionGpu(budget,profile);cache.resources.add(cache.gpu);}cache.gpu.profile=profile;
     const values=await a.read(0,0,h.width,h.height,{signal,cooperate}),hv=await h.read(0,0,h.width,h.height,{signal,cooperate}),vv=await v.read(0,0,v.width,v.height,{signal,cooperate}),dv=await d.read(0,0,d.width,d.height,{signal,cooperate});
     if(threshold){math.threshold(hv,h.maximum,p.threshold,p.mode);math.threshold(vv,v.maximum,p.threshold,p.mode);math.threshold(dv,d.maximum,p.threshold,p.mode);}
     output=await createSegmentedBytes(width*height*3,{...options,storage});
     progress('reconstruct-final',0,1);const initBefore=cache.gpu.metrics.residentInitMs??0,used=await waveletResidentReconstruction(cache.gpu,values,hv,vv,dv,h.width,h.height,p.wavelet,{targetWidth:width,targetHeight:height,signal,consume:bytes=>output.write(bytes,0)});
     if(used){timing.gpuFinalMs=Math.max(0,performance.now()-finalStarted-((cache.gpu.metrics.residentInitMs??0)-initBefore));renderedGpu=true;gpuCalls+=3;progress('reconstruct-final',1,1);progress('render',height,height);break;}
     await output.dispose();output=null;gpuFallbacks++;gpuDisabled=true;
    }finally{workspace();}
   }
   const lo=await up(a,v,1,false,threshold,`reconstruct-${i}-low`);
   const hi=await up(h,d,1,threshold,threshold,`reconstruct-${i}-high`);
   const next=await up(lo,hi,0,false,false,`reconstruct-${i}-vertical`);
   // Coefficients survive view changes. Only reconstructed approximations die.
   if(a!==cache.a)await drop(a);await drop(lo);await drop(hi);a=next;if(i===0)nativeFinalMs=performance.now()-finalStarted;
  }
  if(!renderedGpu){const renderStarted=performance.now();output=await createSegmentedBytes(width*height*3,{...options,storage});const rows=Math.max(1,Math.floor(block/width));
  for(let y=0;y<height;y+=rows){await cooperate();const h=Math.min(rows,height-y),values=await a.read(0,y,width,h,{signal,cooperate}),bytes=new Uint8Array(values.length*3);for(let i=0,j=0;i<values.length;i++,j+=3){const value=values[i]&255;bytes[j]=value;bytes[j+1]=value;bytes[j+2]=value;}await output.write(bytes,y*width*3);progress('render',Math.min(height,y+rows),height);}timing.nativeFinalObservedMs=nativeFinalMs+performance.now()-renderStarted;timing.nativeFinalWorkerStarts=pool.starts-finalWorkerStarts;if(timing.nativeFinalWorkerStarts===0)timing.nativeFinalMs=timing.nativeFinalObservedMs;}
  await output.flush();checkAbort(signal);
  if(newCache)for(const v of [cache.a,...cache.details.flat()])owned.delete(v);
  const surface=createRgbSurface(output,{width,height,budget});candidateSurface=surface;output=null;returning=true;
  return {surface,waveletCache:cache,data:{width,height,wavelet:p.wavelet,maximumLevel:maximum,effectiveLevel:level},semantics:cache.decomposition==='gpu-forward-high-low'?'Native blue channel and complete symmetric PyWavelets stencils; qualified GPU high/low decomposition for continuous thresholds, native binary64 threshold formula and cropped RGB8. Native coefficients are computed separately for CPU or discontinuous modes.':'Native blue channel, exact binary64 PyWavelets decomposition and per-band thresholds. Complete symmetric reconstruction axes use nativeCPU or qualified high/low GPU arithmetic; cropped and truncated to RGB8.',metrics:{...poolMetrics(),backend:gpuCalls||forwardCalls||cache.decomposition==='gpu-forward-high-low'?'webgpu':'cpu',decomposition:cache.decomposition??'native',gpuForwardLevels:forwardCalls,executionChoice:{...timing,automatic:backend==='auto',basis:'completed useful native/GPU final reconstruction and render; shader initialization excluded; no synthetic calibration'},gpuReconstructionCalls:gpuCalls,gpuFallbacks,...(cache.gpu?{gpuSessionTotals:{...cache.gpu.metrics}}:{}),blockPixels:block,coefficientsCached:!newCache,maximumLevel:maximum,retainedResultBytes:width*height*3}};
 }catch(error){failed=true;primary=error;throw error;}finally{try{await cleanupOwner.retire({endpoints:!returning||cache.pool!==pool});}catch(cleanup){returning=false;if(failed)appendWaveletCleanup(primary,cleanup);else throw cleanup;}}
}
