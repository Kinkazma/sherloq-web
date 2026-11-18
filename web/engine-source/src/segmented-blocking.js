import {waveletForwardLevel,waveletForwardLevelPlan} from './wavelet-forward-gpu.js';
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
import {decodePngRows,pngStreamPlan} from './png-stream.js';
import {decodeJpegGrayRows} from './jpeg-gray-rows.js';
import {gray} from './pixel-utils.js';
import {createSourceRegionGray} from './source-region-gray.js';


// Passive complete-resident bound for this exact blocking stage graph. This is
// optional final-retention policy, never a GPU authorization or an allocation.
export function blockingResidentAdmissionPlan(image,params,{sampleDepth=8,runtimeBytes=0,ioBytes=0,storageOverheadBytes=0,budget,profile={},backend='auto',blockPixels=65536,cache=image?.blockingCache,sourceDimensions,sourceMode}={}){
 const unknown=reason=>({known:false,reason});
 try{
  const d=image?.surface?.descriptor,p=blockingParams(params),MiB=1024**2,heapUpper=128*MiB;
  if(!d||![8,16].includes(sampleDepth)||d.format!==(sampleDepth===16?'rgb16':'rgb8')||image.originalSource||![d.width,d.height,runtimeBytes,ioBytes,storageOverheadBytes,blockPixels].every(Number.isSafeInteger)||d.width<1||d.height<1||runtimeBytes<0||ioBytes<0||storageOverheadBytes<0||blockPixels<1||blockPixels>262144||!['cpu','auto','webgpu'].includes(backend))return unknown('invalid-blocking-plan-input');
  const width=d.width,height=d.height,N=width*height;let sw=width,sh=height,mode='loaded image grayscale',decoderBytes=0,fileGrayBytes=0,physicalWidth=width,physicalHeight=height;
  if(sampleDepth===8&&image.source){
   const format=String(image.provenance?.format??image.provenance?.sourceFormat??'').toLowerCase();
   if(!format)return unknown('blocking-file-gray-family-not-attested');
   if(format==='tiff')return unknown('blocking-legacy-tiff-gray-unsupported');
   if(['png','jpeg','jpg'].includes(format)){
    if(!/^[a-f0-9]{64}$/.test(image.sha256??''))return unknown('blocking-original-source-binding-not-attested');
    physicalWidth=d.sourceWidth;physicalHeight=d.sourceHeight;const orientation=d.orientation;
    if(![physicalWidth,physicalHeight,orientation].every(Number.isSafeInteger)||physicalWidth<1||physicalHeight<1||orientation<1||orientation>8)return unknown('blocking-file-gray-geometry-not-attested');
    sw=orientation>=5?physicalHeight:physicalWidth;sh=orientation>=5?physicalWidth:physicalHeight;
    if(sw!==width||sh!==height)return unknown('blocking-file-gray-grid-mismatch');
    mode='file grayscale';fileGrayBytes=physicalWidth*physicalHeight;
    if(format==='png')decoderBytes=pngStreamPlan(physicalWidth,physicalHeight,{grayscale:true}).workingBytes+Math.min(256*1024,image.source.byteLength??256*1024);
    else{
     // jpeg-gray's existing512MiB maximum heap plus its bounded scanline
     // copy and the actual encoded-source visit window. No new codec rule.
     const rowPixels=physicalWidth*Math.min(physicalHeight,Math.max(1,Math.floor(Math.max(physicalWidth,Math.min(4*MiB,blockPixels))/physicalWidth)));
     if(!Number.isSafeInteger(image.source.byteLength)||image.source.byteLength<1||!Number.isSafeInteger(image.source.chunkBytes)||image.source.chunkBytes<1)return unknown('blocking-jpeg-source-window-not-attested');
     decoderBytes=512*MiB+rowPixels+Math.min(image.source.byteLength,image.source.chunkBytes);
    }
   }
  }
  if(sourceMode!==undefined&&sourceMode!==mode||sourceDimensions!==undefined&&(!Array.isArray(sourceDimensions)||sourceDimensions.length!==2||sourceDimensions[0]!==sw||sourceDimensions[1]!==sh))return unknown('blocking-source-geometry-mismatch');
  const dw=Math.floor((sw+15)/2),dh=Math.floor((sh+15)/2),V=sw*dh,D=dw*dh,nw=Math.floor(dw/p.block),nh=Math.floor(dh/p.block),Q=nw*nh;
  if(![N,V,D,Q].every(Number.isSafeInteger)||blockPixels<Math.max(sw,sh,p.block*p.block)||nw<1||nh<1)return unknown('blocking-complete-axis-or-noise-block-not-admitted');
  if(cache){const detail=cache.detail;if(detail?.width!==dw||detail?.height!==dh||detail?.store?.byteLength!==D*8||cache.sourceMode!==mode||cache.sourceDimensions?.[0]!==sw||cache.sourceDimensions?.[1]!==sh)return unknown('blocking-cache-extents-not-attested');}
  if(cache?.decomposition==='gpu-high-low-db8'&&(cache.gray?.width!==sw||cache.gray?.height!==sh||cache.gray?.store?.byteLength!==N*8||!cache.resources?.has(cache.gray)))return unknown('blocking-gray-cache-extents-not-attested');
  const cacheOwnership=cache?blockingWorkerOwnership(cache,{budget,profile}):null,retainedCache=!!cache&&cache===image.blockingCache&&!!budget&&cacheOwnership.owner?.budget===budget&&cache.resources instanceof Set&&cache.resources.has(cache.detail);
  const grayBytes=N*8,verticalBytes=V*8,detailBytes=D*8,noiseTableBytes=Q*8,outputBytes=N*3,workspaceBytes=heapUpper+blockPixels*128;
  const stages=[];
  for(const [iw,ih,ow,oh,axis]of [[sw,sh,sw,dh,0],[sw,dh,dw,dh,1]]){const span=axis===0?ih:iw,total=axis===0?iw:ih,step=Math.max(1,Math.floor(blockPixels/span));stages.push({jobs:Math.ceil(total/step),pixels:Math.max(step*span,step*(axis===0?oh:ow))});}
  const columns=Math.max(1,Math.floor(blockPixels/(p.block*p.block)));stages.push({jobs:Math.ceil(nw/columns)*nh,pixels:Math.min(columns,nw)*p.block*p.block});
  const configured=profile.maxWorkers??1,workerPixelBytes=profile.workerPixelBytes??192,workerHeapBytes=Math.max(heapUpper,profile.workerHeapBytes??0);
  if(!Number.isSafeInteger(configured)||configured<1||configured>32||!Number.isSafeInteger(workerPixelBytes)||workerPixelBytes<0||!Number.isSafeInteger(workerHeapBytes))return unknown('blocking-worker-profile-not-attested');
  const maximum=typeof(profile.workerFactory??globalThis.Worker)==='function'?Math.min(configured,Math.max(...stages.map(s=>s.jobs))):0,workerBytes=maximum*workerHeapBytes+Math.max(0,...stages.map(s=>Math.min(maximum,s.jobs)*s.pixels*workerPixelBytes));
  const sourceRows=Math.min(sh,Math.max(1,Math.floor(blockPixels/sw))),sourceOutputBytes=sw*sourceRows*(mode==='file grayscale'?1:sampleDepth===16?6:3);let sourceAdditionalBytes=0;
  if(mode!=='file grayscale'&&typeof image.surface.readWindowPlan==='function'){
   const read=image.surface.readWindowPlan({x:0,y:0,width:sw,height:sourceRows});
   if(read?.known!==true||read.outputBytes!==sourceOutputBytes||!Number.isSafeInteger(read.additionalBytes)||read.additionalBytes<0)return unknown('blocking-source-read-plan-not-attested');sourceAdditionalBytes=read.additionalBytes;
  }else sourceAdditionalBytes=Math.max(d.sourceWidth??sw,d.sourceHeight??sh)*(mode==='file grayscale'?1:sampleDepth===16?6:3);
  const sourceReadBytes=sourceOutputBytes+sourceAdditionalBytes,renderRowBytes=width*3+nw*9;
  const common=runtimeBytes+ioBytes+storageOverheadBytes,phases={decode:common+fileGrayBytes+decoderBytes,gray:common+workspaceBytes+grayBytes+fileGrayBytes+sourceReadBytes,cpuAxes:common+workspaceBytes+workerBytes+Math.max(grayBytes+verticalBytes,verticalBytes+detailBytes),cpuNoiseAndOutput:common+workspaceBytes+workerBytes+detailBytes+noiseTableBytes+outputBytes+renderRowBytes};
  // These exact Original cache stores are already financed in budget.total.
  // A compatible cached detail skips file decoding and both forward axes.
  if(retainedCache){delete phases.decode;delete phases.gray;delete phases.cpuAxes;phases.cpuNoiseAndOutput-=detailBytes;}
  let gpu=null;
  // A cold maximum covers the real GPU attempt and its native replay. It
  // does not imply a device exists or that any dispatch has been admitted.
  if(backend!=='cpu'&&sw>=16&&sh>=16&&N>=262144&&(!retainedCache||cache.decomposition==='gpu-high-low-db8')){
   const forward=waveletForwardLevelPlan(sw,sh,'db8',{mode:0,diagonalOnly:true});if(!forward)return unknown('blocking-forward-layout-not-attested');
   const stageBytes=grayBytes+4*MiB,pipelineBytes=4*MiB+forward.forwardPipelineBytes,cacheBytes=grayBytes+detailBytes,maximumRefinements=Math.min(32,Math.max(2,Math.floor(Q/8))),normalizationBytes=Q*40+maximumRefinements*64+4096;
   const refinementColumns=Math.max(1,Math.min(sw,Math.floor(blockPixels/sh))),refinementRows=Math.max(1,Math.min(p.block,Math.floor(blockPixels/sw))),refinementBytes=(refinementColumns*sh+sw*refinementRows+sw*p.block+p.block*p.block)*64+4096;
   phases.gpuForward=common+workspaceBytes+grayBytes+detailBytes+stageBytes+pipelineBytes+forward.recordBytes;
   phases.gpuNormalization=common+workspaceBytes+workerBytes+cacheBytes+noiseTableBytes+normalizationBytes+refinementBytes+Q;
   phases.gpuOutput=common+workspaceBytes+workerBytes+cacheBytes+noiseTableBytes+Q+outputBytes+renderRowBytes;
   // The recursive CPU variant can start before the outer noise/table and
   // caches retire; it has its own real workspace/pool and one extra detail.
   phases.nativeReplay=common+2*workspaceBytes+2*workerBytes+cacheBytes+noiseTableBytes+Math.max(verticalBytes+detailBytes,detailBytes+noiseTableBytes+outputBytes+renderRowBytes);
   if(retainedCache){delete phases.gpuForward;for(const key of ['gpuNormalization','gpuOutput','nativeReplay'])phases[key]-=cacheBytes;}
   gpu={forward,stageBytes,pipelineBytes,cacheBytes,normalizationBytes,refinementBytes,gpuExecutionAdmitted:false};
  }
  const bytes=Math.max(...Object.values(phases));
  if(!Number.isSafeInteger(bytes)||bytes<0)return unknown('unsafe-blocking-bound');
  return{known:true,bytes,completeResidentAlternative:true,parallelWorkers:maximum,retainedResultBytes:outputBytes+noiseTableBytes,transformAdmission:{kind:'blocking-db8-mad-complete-resident-v1',inputDepth:sampleDepth,presentationDepth:8,block:p.block,blockPixels,sourceMode:mode,retainedCache,sourceDimensions:[sw,sh],physicalSourceDimensions:[physicalWidth,physicalHeight],detailDimensions:[dw,dh],tableDimensions:[nw,nh],extents:{grayBytes,verticalBytes,detailBytes,noiseTableBytes,outputBytes,fileGrayBytes,decoderBytes,workspaceBytes,workerBytes,workerHeapBytes,sourceReadBytes,sourceAdditionalBytes,renderRowBytes},phases,gpu,retentionOnly:true}};
 }catch{return unknown('uninspectable-blocking-plan');}
}

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
 const options={budget,signal,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:Math.max(8192,block*8),columnTransport:true};
 const floatPlaneTransport=[],transportRows=new WeakMap();
 const observePlane=value=>{const row=transportRows.get(value);if(!row)return;try{Object.assign(row,value.transportMetrics?.()??{layout:'row-major'});row.currentBacking=value.store.storage;}catch{row.observationUnavailable=true;}};
 const observePlanes=()=>{for(const value of owned)observePlane(value);for(const value of cache?.resources??[])observePlane(value);};
 const plane=async(w,h)=>{const value=await createFloatPlane(w,h,options);owned.add(value);const row={ordinal:floatPlaneTransport.length,width:w,height:h,phase:disableGpu?'native-replay':'primary',birthBacking:value.store.storage,currentBacking:value.store.storage};transportRows.set(value,row);floatPlaneTransport.push(row);observePlane(value);return value;};
 const drop=async value=>{if(owned.has(value)){observePlane(value);await value.dispose();owned.delete(value);}};
 const progress=(phase,completed,total)=>onProgress?.({phase,completed,total});
 const cleanupOwner=pool.ownCleanup(async capture=>{observePlanes();if(graySurface){await graySurface.dispose();graySurface=null;}normalization?.release?.();await retireWaveletPlans(owned,capture);if(!returning){if(candidateSurface){await candidateSurface.dispose();candidateSurface=null;}if(output){await output.dispose();output=null;}if(candidateTable){await candidateTable.dispose();candidateTable=null;}await newCache?.dispose();}if(workspace){workspace();workspace=null;}});
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
    observePlanes();return {...record,metrics:{...record.metrics,gpuNormalizationReplay:normalization.reason,floatPlaneTransport:[...floatPlaneTransport,...(record.metrics.floatPlaneTransport??[])]}};
   }
   lo=normalization.lo;hi=normalization.hi;
  }
  output=await createSegmentedBytes(width*height*3,{...options,storage});
  let previous=-1,row;for(let y=0;y<height;y++){
   if(y%32===0)await cooperate();const sy=Math.min(nh-1,Math.floor(y*(1/(height/nh))));
   if(sy!==previous){row=normalization?.accepted?normalization.pixels.subarray(sy*nw,(sy+1)*nw):math.normalize(await noise.read(0,sy,nw,1,{signal,cooperate}),lo,hi,nw*nh);previous=sy;}
   const bytes=new Uint8Array(width*3);for(let x=0;x<width;x++){const value=row[Math.min(nw-1,Math.floor(x*(1/(width/nw))))],j=x*3;bytes[j]=value;bytes[j+1]=value;bytes[j+2]=value;}await output.write(bytes,y*width*3);progress('render',y+1,height);
  }
  await output.flush();checkAbort(signal);const surface=createRgbSurface(output,{width,height,budget});candidateSurface=surface;output=null;const table=createNoiseTable(noise,{budget,block:p.block});candidateTable=table;observePlane(noise);owned.delete(noise);if(newCache)owned.delete(cache.detail);
  keepPool=cache[WORKER_OWNER]?.pool===pool;returning=true;observePlanes();
  return {surface,blockingCache:cache,tableRecords:{noise:{surface:table}},data:{width,height,sourceMode,sourceDimensions,detailDimensions:[detail.width,detail.height],block:p.block,rows:nh,cols:nw},semantics:'Original file grayscale, complete global db8 axes, block median(abs(detail)) / 0.6745 and global CV_8U normalization with nearest-neighbor display.',metrics:{...pool.metrics(),backend:gpuUsed||cache.decomposition==='gpu-high-low-db8'?'webgpu':'cpu',decomposition:cache.decomposition??'native',gpuForwardCalls:gpuUsed?1:0,...(normalization?.accepted?{nativeRefinementBlocks:normalization.refinementCount,normalizationQualificationMs:normalization.elapsedMs,normalizationExtremaIntervals:normalization.extremaIntervals}:{}),blockPixels:block,detailCached:!newCache,globalMinimum:lo,globalMaximum:hi,floatPlaneTransport}};
 }catch(error){failed=true;primary=error;throw error;}finally{try{await cleanupOwner.retire({endpoints:!keepPool});}catch(cleanup){returning=false;if(failed)appendWaveletCleanup(primary,cleanup);else throw cleanup;}}
}
