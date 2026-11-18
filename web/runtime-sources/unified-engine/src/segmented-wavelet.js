import "../../runtime-context.js?v=0.33.2";
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
import {roundEven} from './pixel-utils.js';
import {waveletGpuBanks} from './wavelet-gpu-banks.js';
import {getExecutionScheduler} from './execution-scheduler.js';

// The same symmetric PyWavelets extents and ordered down/up stage graph as
// segmentedWaveletCore, inspected without constructing a module or a plane.
// Only optional final residency uses this full cold alternative; actual strip
// sizes, parallelism, GPU policy and automatic storage remain owned below.
export function waveletResidentAdmissionPlan(descriptor,params,{runtimeBytes=0,ioBytes=0,storageOverheadBytes=0,profile={},backend='auto',blockPixels=262144}={}){
 const {width,height,format}=descriptor??{},p=waveletParams(params),filter=waveletGpuBanks[p.wavelet]?.[0]?.length,MiB=1024**2,nativeHeapLimit=128*MiB;
 if(![width,height,runtimeBytes,ioBytes,storageOverheadBytes,blockPixels].every(Number.isSafeInteger)||width<1||height<1||!filter||blockPixels<Math.max(width,height)||blockPixels>262144)return null;
 let maximumLevel=0;for(let n=Math.floor(Math.min(width,height)/(filter-1));n>1;n=Math.floor(n/2))maximumLevel++;
 const stages=[],bands=[];let w=width,h=height,details=0,storePeak=w*h*8;
 const axisStage=(iw,ih,ow,oh,axis,down)=>{const span=axis===0?ih:iw,total=axis===0?iw:ih,step=Math.max(1,Math.floor(blockPixels/span));stages.push({jobs:Math.ceil(total/step),pixels:Math.max(step*span,step*(axis===0?oh:ow)*(down?2:1))});};
 for(let i=0;i<maximumLevel;i++){
  const bh=Math.floor((h+filter-1)/2),bw=Math.floor((w+filter-1)/2),vertical=w*bh*8,band=bw*bh*8;
  storePeak=Math.max(storePeak,details+w*h*8+2*vertical,details+2*vertical+2*band,details+vertical+4*band,details+w*h*8+4*band);
  axisStage(w,h,w,bh,0,true);axisStage(w,bh,bw,bh,1,true);
  bands.push({width:bw,height:bh,inputWidth:w,inputHeight:h});details+=3*band;w=bw;h=bh;
 }
 const coefficientBytes=details+w*h*8;let approximation=0;
 for(let i=bands.length-1;i>=0;i--){const b=bands[i],ow=2*b.width-filter+2,oh=2*b.height-filter+2,low=ow*b.height*8,next=ow*oh*8;
  storePeak=Math.max(storePeak,coefficientBytes+approximation+2*low+next);
  axisStage(b.width,b.height,ow,b.height,1,false);axisStage(ow,b.height,ow,oh,0,false);approximation=next;
 }
 const outputBytes=width*height*3;storePeak=Math.max(storePeak,coefficientBytes+approximation+outputBytes);
 const maximum=stages.length&&typeof (profile.workerFactory??globalThis.Worker)==='function'?Math.min(32,profile.maxWorkers??1,Math.max(...stages.map(v=>v.jobs))):0,workerHeap=Math.max(nativeHeapLimit,profile.workerHeapBytes??0),workerPixelBytes=profile.workerPixelBytes??192;
 const workerBytes=maximum*workerHeap+Math.max(0,...stages.map(v=>Math.min(maximum,v.jobs)*v.pixels*workerPixelBytes)),workspaceBytes=nativeHeapLimit+blockPixels*192;
 let gpuBytes=0;
 if(backend!=='cpu'&&globalThis.navigator?.gpu&&p.threshold>0&&bands.length&&width*height>=262144){
  // Final resident reconstruction: exact band halo, output crop, ambiguous
  // integer-boundary list and both native/GPU workspaces stay financed.
  const b=bands[0],tileRows=Math.min(height,Math.max(2,2*Math.floor(Math.min(2*MiB,blockPixels*8)/(width*2)))),coefficientRows=Math.ceil((tileRows+filter-2)/2),n=b.width*coefficientRows,ow=2*b.width-filter+2,oh=2*coefficientRows-filter+2,padded=Math.ceil(width*tileRows*3/4)*4,status=(Math.min(width*tileRows*3,65536)+2)*4;
  const resident=n*96+8*MiB+n*32+ow*coefficientRows*16+ow*oh*8+padded*3+status*3+filter*64+144;
  let forward=0;
  if(format!=='rgb16'&&backend==='webgpu'&&['soft','garrote'].includes(p.mode)&&filter>=16)for(const b of bands){const n=b.inputWidth*b.inputHeight;if(n<262144)break;const vertical=b.inputWidth*b.height,count=b.width*b.height;forward=Math.max(forward,n*32+4*MiB+n*16+vertical*16+count*96+filter*64+192);}
  // The two optional GPU modes may have created their pipelines in one cache.
  gpuBytes=12*MiB+Math.max(resident,forward);
  if(format!=='rgb16'&&backend==='webgpu'&&profile.waveletGpuTransport==='strips'){
   const n=blockPixels*2,strip=n*32+n*2*32+filter*4*8*3+128;
   gpuBytes=Math.max(gpuBytes,12*MiB+strip);
  }
 }
 const bytes=runtimeBytes+ioBytes+storageOverheadBytes+storePeak+workspaceBytes+workerBytes+gpuBytes;
 return Number.isSafeInteger(bytes)&&bytes>0?{bytes,completeResidentAlternative:true,parallelWorkers:maximum,transformAdmission:{kind:'wavelet-complete-symmetric-resident-v1',maximumLevel,filterLength:filter,blockPixels,coefficientBytes,residentStorePeakBytes:storePeak,outputBytes,workspaceBytes,workerBytes,workerHeapUpperBytes:workerHeap,gpuBytes,retentionOnly:true}}:null;
}

export async function segmentedWavelet(image,params,options={}){
 const p=waveletParams(params),root=options.cache;
 validateWaveletCache(image,root);
 if(root&&root.wavelet!==p.wavelet)throw new EngineError('INVALID_INPUT','Wavelet cache does not match.');
 if(root?.decomposition==='gpu-forward-high-low'&&(root.nativeVariant||options.original||options.backend==='cpu'||p.threshold===0||!['soft','garrote'].includes(p.mode))){
  const record=await segmentedWaveletCore(image,p,{...options,cache:root.nativeVariant,disableForward:true});
  if(!root.nativeVariant){root.nativeVariant=record.waveletCache;root.resources.add(record.waveletCache);}
  return {...record,waveletCache:root};
 }
 return segmentedWaveletCore(image,p,options);
}

async function segmentedWaveletCore(image,params,{budget,signal,onProgress,cache,blockPixels=262144,storage='auto',profile={},accountedHeapBytes=0,backend='auto',original=false,disableForward=false}={}){
 const p=waveletParams(params),{width,height}=image.surface.descriptor,inputDepth=image.surface.descriptor.format==='rgb16'?16:8,cooperate=createCooperator(signal),coefficientsCachedAtStart=!!cache;
 requireValue(Number.isInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid wavelet strip size.');
 if(cache&&cache.wavelet!==p.wavelet)throw new EngineError('INVALID_INPUT','Wavelet cache does not match.');
 const workerConfig=['workerFactory','workerURL','workerHeapBytes','workerPixelBytes'],poolCompatible=cache?.pool?.budget===budget&&workerConfig.every(key=>cache.poolConfig?.[key]===profile[key]),cachedPool=poolCompatible?cache.pool:null,idleBytes=[...(cachedPool?.workers.values()??[])].filter(slot=>!slot.busy&&!slot.retirement).reduce((n,slot)=>n+slot.bytes,0);
 const nativeHeap=Math.max(8*1024**2,waveletStreamHeapBytes());requireValue(Number.isSafeInteger(accountedHeapBytes)&&accountedHeapBytes>=0&&accountedHeapBytes<=nativeHeap,'Invalid already accounted wavelet heap.');const heap=nativeHeap-accountedHeapBytes,room=budget.limit-budget.retained-budget.active+idleBytes;
 const block=Math.min(blockPixels,Math.floor((room-heap-4*1024**2)/192));
 if(block<Math.max(width,height))throw new EngineError('MEMORY_LIMIT','One complete wavelet axis must fit in the streaming workspace.');
 const release=budget.reserve(heap+block*192),owned=new Set(),pool=cachedPool??new WaveletStripPool(budget,{...profile,adaptive:image.waveletScheduling??=(new Map())});let output,newCache,candidateSurface,returning=false,failed=false,primary,released=false,gpuDisabled=false,gpuCalls=0,gpuFallbacks=0,renderedGpu=false,nativeFinalMs=0,finalWorkerStarts=pool.starts,forwardCalls=0,forwardGpu=null;const poolBefore=pool.metrics(),poolMetrics=()=>{const current=pool.metrics(),delta={...current};for(const key of ['completedStripJobs','workerStarts','workerReuses','retiredWorkers','stripRetries'])delta[key]=current[key]-poolBefore[key];return delta;};
 if(cachedPool){if(Number.isInteger(profile.maxWorkers)&&profile.maxWorkers>0)pool.maximum=profile.maxWorkers;pool.peak=1;}
 const cleanupOwner=pool.ownCleanup(async capture=>{observePlanes();await retireWaveletPlans(owned,capture);if(!returning){if(candidateSurface){await candidateSurface.dispose();candidateSurface=null;}if(output){await output.dispose();output=null;}await newCache?.dispose();}if(!released){release();released=true;}});
 // Automatic stores admit real allocated segments and migrate on pressure.
 // Forcing every band to disk from a whole-image upper bound made strided
 // transfers dominate even when the retained native coefficients fit in RAM.
 const coefficientStorage=storage;
 const options={budget,signal,storage:coefficientStorage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:Math.max(8192,block*8),columnTransport:true};
 const floatPlaneTransport=[],transportRows=new WeakMap();
 const observePlane=value=>{const row=transportRows.get(value);if(!row)return;try{Object.assign(row,value.transportMetrics?.()??{layout:'row-major'});row.currentBacking=value.store.storage;}catch{row.observationUnavailable=true;}};
 const observePlanes=()=>{for(const value of owned)observePlane(value);for(const value of cache?.resources??[])observePlane(value);};
 const plane=async(w,h)=>{const v=await createFloatPlane(w,h,options);owned.add(v);const row={ordinal:floatPlaneTransport.length,width:w,height:h,birthBacking:v.store.storage,currentBacking:v.store.storage};transportRows.set(v,row);floatPlaneTransport.push(row);observePlane(v);return v;};
 const drop=async v=>{if(owned.has(v)){observePlane(v);await v.dispose();owned.delete(v);}};
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
   let eligible=inputDepth===8&&profile.waveletGpuTransport==='strips'&&!gpuDisabled&&!original&&backend==='webgpu'&&p.threshold>0&&globalThis.navigator?.gpu&&cache.resources instanceof Set&&w*h>=262144;
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
   }else await pool.run({count:Math.ceil(total/step),pixels:Math.max(step*span,step*(axis===0?h:w)),key:`up/${p.wavelet}/${axis}/${span}/${step}`,signal,prepare,local:r=>math.upThreshold(r.a,r.d,r.width,r.height,r.wavelet,r.axis,r),consume});
   return out;
   }finally{gpuWorkspace?.();}
  };
  if(!cache){
   let a=await plane(width,height);const rows=Math.max(1,Math.floor(block/width));
   for(let y=0;y<height;y+=rows){await cooperate();const h=Math.min(rows,height-y),part=await image.surface.readWindow({x:0,y,width,height:h},{signal,cooperate});try{const values=new Float64Array(width*h);for(let i=0;i<values.length;i++)values[i]=part.pixels.data[i*3+2];await a.write(values,0,y,width,h,{signal,cooperate});}finally{part.release();}progress('blue-channel',Math.min(y+rows,height),height);}
   const details=[];
   let forwardAllowed=inputDepth===8&&!disableForward&&!original&&backend==='webgpu'&&['soft','garrote'].includes(p.mode)&&p.threshold>0&&filter>=16&&width*height>=262144&&globalThis.navigator?.gpu;
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
   newCache={wavelet:p.wavelet,width,height,inputDepth,sourceSurfaceId:image.surface.descriptor.id,sourceRevision:image.surface.descriptor.revision,maximumLevel:info.maximumLevel,a,details,pool,poolConfig:Object.fromEntries(workerConfig.map(key=>[key,profile[key]])),resources:cachePlanes,gpu:forwardGpu,decomposition:forwardCalls?'gpu-forward-high-low':'native',timing:{},dispose(){return cacheOwner.retire({endpoints:true});}};for(const v of planes)owned.delete(v);if(forwardGpu)owned.delete(forwardGpu);cache=newCache;
  }
  let a=cache.a;const maximum=cache.maximumLevel,level=p.threshold===0?0:Math.min(p.level??(maximum?Math.max(1,Math.floor(maximum/2)):0),maximum);
  const timing=cache.timing??=( {} ),timingProfile=JSON.stringify([profile.maxWorkers??1,profile.waveletGpuTransport??'resident',inputDepth,p.mode]);if(timing.profile!==undefined&&timing.profile!==timingProfile)for(const key of ['nativeFinalMs','gpuFinalMs','nativeFinalObservedMs','nativeFinalWorkerStarts','gpuUnavailable'])delete timing[key];timing.profile=timingProfile;
  for(let i=maximum-1;i>=0;i--){const finalStarted=i===0?performance.now():0;if(i===0)finalWorkerStarts=pool.starts;
   const [h,v,d]=cache.details[i],threshold=i<level&&p.threshold>0;
   const automaticGpu=backend==='auto'&&coefficientsCachedAtStart&&!timing.gpuUnavailable&&(timing.gpuFinalMs===undefined||timing.nativeFinalMs===undefined||timing.gpuFinalMs<timing.nativeFinalMs*.95);
   const residentEligible=i===0&&!gpuDisabled&&!original&&(backend==='webgpu'||automaticGpu)&&p.threshold>0&&globalThis.navigator?.gpu&&cache.resources instanceof Set&&width*height>=262144;
   if(residentEligible){
    // IDWT has no extension at this stage: an even output-row offset advances
    // by half as many coefficient rows. Each band includes every filter tap,
    // so the finite stencil and its ordered sums match the whole final level.
    const tileRows=Math.min(height,Math.max(2,2*Math.floor(Math.min(2*1024**2,block*8)/(width*2)))),tileCoefficientRows=Math.ceil((tileRows+filter-2)/2),pixels=h.width*tileCoefficientRows;
    let workspace;
    try{workspace=budget.reserve(pixels*96+8*1024**2);}catch(error){if(!gpuFallbackError(error))throw error;gpuDisabled=true;await cache.gpu?.dispose();}
    if(workspace)try{
     if(cache.gpu?.closed){const previous=cache.gpu;await previous.dispose();cache.resources.delete(previous);cache.gpu=null;}
     if(!cache.gpu){cache.gpu=new WaveletReconstructionGpu(budget,profile);cache.resources.add(cache.gpu);}cache.gpu.profile=profile;
     output=await createSegmentedBytes(width*height*3,{...options,storage});
     progress('reconstruct-final',0,height);
     // Float-pair arithmetic is used only for presentation. A deliberately
     // conservative absolute envelope routes every possible integer boundary
     // to the native ordered binary64 stencil before any bytes are published.
     const bank=waveletGpuBanks[p.wavelet],l1=Math.max(...bank.slice(2).map(row=>row.reduce((sum,value)=>sum+Math.abs(value),0))),amplitude=Math.max(a.maximum,h.maximum,v.maximum,d.maximum),errorBound=Math.max(2**-30,amplitude*filter*filter*l1*l1*2**-37),initBefore=cache.gpu.metrics.residentInitMs??0;
     let used=true;
     for(let y=0;y<height;y+=tileRows){
      await cooperate();const rows=Math.min(tileRows,height-y),top=y/2,coefficientRows=Math.ceil((rows+filter-2)/2),values=await a.read(0,top,h.width,coefficientRows,{signal,cooperate}),hv=await h.read(0,top,h.width,coefficientRows,{signal,cooperate}),vv=await v.read(0,top,v.width,coefficientRows,{signal,cooperate}),dv=await d.read(0,top,d.width,coefficientRows,{signal,cooperate});
      if(threshold)await getExecutionScheduler(budget,{maxWorkers:profile.maxWorkers??1}).run({cpu:1,gpu:0,signal,resourceOwner:'wavelet-native-threshold',label:'exact-native-wavelet-band-threshold'},()=>{math.threshold(hv,h.maximum,p.threshold,p.mode);math.threshold(vv,v.maximum,p.threshold,p.mode);math.threshold(dv,d.maximum,p.threshold,p.mode);});
      used=await waveletResidentReconstruction(cache.gpu,values,hv,vv,dv,h.width,coefficientRows,p.wavelet,{targetWidth:width,targetHeight:rows,inputDepth,errorBound,signal,consume:async(bytes,indices)=>{
       if(indices.length){checkAbort(signal);const corrected=math.finalPixels(values,hv,vv,dv,h.width,coefficientRows,p.wavelet,indices,width);for(let k=0;k<indices.length;k++){const value=inputDepth===16?roundEven((corrected[k]&65535)/257):corrected[k]&255,at=indices[k]*3;bytes[at]=bytes[at+1]=bytes[at+2]=value;}await cooperate();}await output.write(bytes,y*width*3);
      }});
      if(!used)break;gpuCalls+=3;progress('reconstruct-final',y+rows,height);
     }
     if(used){timing.gpuFinalMs=Math.max(0,performance.now()-finalStarted-((cache.gpu.metrics.residentInitMs??0)-initBefore));renderedGpu=true;progress('render',height,height);break;}
     await output.dispose();output=null;gpuFallbacks++;gpuDisabled=true;timing.gpuUnavailable=true;
    }finally{workspace();}
   }
   const lo=await up(a,v,1,false,threshold,`reconstruct-${i}-low`);
   const hi=await up(h,d,1,threshold,threshold,`reconstruct-${i}-high`);
   const next=await up(lo,hi,0,false,false,`reconstruct-${i}-vertical`);
   // Coefficients survive view changes. Only reconstructed approximations die.
   if(a!==cache.a)await drop(a);await drop(lo);await drop(hi);a=next;if(i===0)nativeFinalMs=performance.now()-finalStarted;
  }
  if(!renderedGpu){const renderStarted=performance.now();output=await createSegmentedBytes(width*height*3,{...options,storage});const rows=Math.max(1,Math.floor(block/width));
  for(let y=0;y<height;y+=rows){await cooperate();const h=Math.min(rows,height-y),values=await a.read(0,y,width,h,{signal,cooperate}),bytes=new Uint8Array(values.length*3);for(let i=0,j=0;i<values.length;i++,j+=3){const value=inputDepth===16?roundEven((values[i]&65535)/257):values[i]&255;bytes[j]=value;bytes[j+1]=value;bytes[j+2]=value;}await output.write(bytes,y*width*3);progress('render',Math.min(height,y+rows),height);}timing.nativeFinalObservedMs=nativeFinalMs+performance.now()-renderStarted;timing.nativeFinalWorkerStarts=pool.starts-finalWorkerStarts;if(timing.nativeFinalWorkerStarts===0)timing.nativeFinalMs=timing.nativeFinalObservedMs;}
  await output.flush();checkAbort(signal);
  if(newCache)for(const v of [cache.a,...cache.details.flat()])owned.delete(v);
  const surface=createRgbSurface(output,{width,height,budget});candidateSurface=surface;output=null;returning=true;observePlanes();
  return {surface,waveletCache:cache,data:{width,height,inputDepth,presentationOutputDepth:8,...(inputDepth===16?{presentationConversion:'truncate-to-uint16-modulo65536-then-divide257-round-even',presentationIntermediateRange:[0,65535]}:{}),wavelet:p.wavelet,maximumLevel:maximum,effectiveLevel:level},semantics:inputDepth===16?'Exact uint16 blue-channel code values become binary64 before native PyWavelets decomposition. Per-band thresholds use the full16-bit range; reconstruction is truncated/modulo65536 to uint16, then divided by257 and rounded to even for the RGB8 presentation. No input quantization, colour profile or transfer conversion.':cache.decomposition==='gpu-forward-high-low'?'Native blue channel and complete symmetric PyWavelets stencils; qualified GPU high/low decomposition for continuous thresholds, native binary64 threshold formula and cropped RGB8. Native coefficients are computed separately for CPU or discontinuous modes.':'Native blue channel, exact binary64 PyWavelets decomposition and per-band thresholds. Automatic final reconstruction uses qualified high/low GPU arithmetic with native binary64 correction of integer boundaries; cropped and truncated to RGB8.',metrics:{...poolMetrics(),inputDepth,presentationOutputDepth:8,backend:gpuCalls||forwardCalls||cache.decomposition==='gpu-forward-high-low'?'webgpu':'cpu',decomposition:cache.decomposition??'native',gpuForwardLevels:forwardCalls,executionChoice:{...timing,automatic:backend==='auto',basis:'native coefficients and thresholds; cached useful native/GPU final reconstruction and render; GPU integer-boundary pixels corrected by native binary64; initialization excluded'},gpuReconstructionCalls:gpuCalls,gpuFallbacks,...(cache.gpu?{gpuSessionTotals:{...cache.gpu.metrics}}:{}),blockPixels:block,coefficientsCached:!newCache,maximumLevel:maximum,retainedResultBytes:width*height*3,floatPlaneTransport}};
 }catch(error){failed=true;primary=error;throw error;}finally{try{await cleanupOwner.retire({endpoints:!returning||cache.pool!==pool});}catch(cleanup){returning=false;if(failed)appendWaveletCleanup(primary,cleanup);else throw cleanup;}}
}

// A coefficient cache belongs to one native extent, depth and source revision.
// Legacy direct tests without an explicit surface identity remain compatible.
function validateWaveletCache(image,cache){
 if(!cache)return;const d=image.surface.descriptor,depth=d.format==='rgb16'?16:8;
 requireValue(cache.width===d.width&&cache.height===d.height&&(cache.inputDepth??8)===depth&&(depth===8||!cache.sourceSurfaceId||cache.sourceSurfaceId===d.id&&cache.sourceRevision===d.revision),'Wavelet cache does not match the source extent, depth or revision.');
}
