import "../../runtime-context.js?v=0.14.5";
import {segmentedDefects} from './segmented-defects.js';
import {segmentedMinmax} from './segmented-minmax.js';
import {segmentedBitPlanes} from './segmented-planes.js';
import {segmentedPixelStats,createResultSurfaces} from './segmented-results.js';
import {contiguousSurface,loadSegmentedJpeg,disposeSegmentedImage,requireSegmentedOperation} from './image-sources.js';
import {createBlobSource} from './blob-source.js';
import {inspectJpegBlob,jpegCodec} from './jpeg.js';
import {segmentedHistogram} from './segmented-histogram.js';
import {EngineError,requireValue,checkAbort,checkpoint} from './errors.js';
import {DEFAULT_ELA_PARAMS,DEFAULT_ENERGY_PROFILE,validateParams,validatePixels,elaBase,elaRender} from './ela.js';
import {JPEG_OPTIONS} from './jpeg.js';
import {imageCodec} from './codecs.js';
import {zeroHeapBytes} from './zero.js';
import {waveletHeapBytes} from './wavelets.js';
import {compileMedianModel} from './median-model.js';
import {compileQualityModel} from './quality-model.js';
import {qualityHeapBytes} from './quality-arithmetic.js';
import {resamplingHeapBytes} from './resampling-math.js';
import {cloningHeapBytes} from './cloning-math.js';
import {medianHeapBytes} from './median-features.js';
import {toneTable,fusedCpu} from './ela-lut.js';
import {LutPool} from './lut-pool.js';
import {ZeroPool} from './zero-pool.js';
import {NoisesnifferPool} from './noisesniffer-pool.js';
import {QualityPool} from './quality-pool.js';
import {MedianPool} from './median-pool.js';
import {ResamplingViewPool} from './resampling-view-pool.js';
import {CloningGroupPool} from './cloning-group-pool.js';
import {FrequencyGpu} from './frequency-gpu.js';
import {resolveComputeProfile} from './profiles.js';
export {COMPUTE_PROFILES,resolveComputeProfile} from './profiles.js';
import {Budget} from './cache.js';
import {readPrnuDatabase,writePrnuDatabase,prnuHdf5HeapBytes} from './prnu-hdf5.js';
import {buildPrnuSnapshot} from './prnu-builder.js';
import {PIXEL_OPERATIONS,pixelCapabilities,payloadBytes,histogramView} from './pixel-operations.js';
export {createElaEnergyControls} from './ela-energy-controls.js';
export {createAnalysisScopeController} from './analysis-scope.js';
import {exportAnalysis,jsonExportBound} from './exports.js';
export {exportAnalysis};
export {EngineError,DEFAULT_ELA_PARAMS,DEFAULT_ENERGY_PROFILE};
const VERSION='0.28.0',RUNTIME_RESERVE=32*1024**2;
const copyPixels=p=>({...p,data:p.data.slice()});
const sha=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
export function createEngine({memoryBudgetBytes,codec=imageCodec,cpuKernel='auto',computeProfile='aggressive',resourceHints,onTemporarySession}={}) {
 const profile=resolveComputeProfile(computeProfile,resourceHints);memoryBudgetBytes??=profile.memoryBudgetBytes;
 requireValue(Number.isSafeInteger(memoryBudgetBytes)&&memoryBudgetBytes>0,'Positive memory budget required.');
 requireValue(['auto','single','reference'].includes(cpuKernel),'Invalid CPU kernel.');
 const budget=new Budget(memoryBudgetBytes),images=new Map(),surfaces=new Map(),pool=new LutPool(budget,profile),qualityPool=new QualityPool(budget,profile),zeroPool=new ZeroPool(budget,profile),noisesnifferPool=new NoisesnifferPool(budget,profile),frequencyGpu=new FrequencyGpu(budget,profile),medianPool=new MedianPool(budget,profile),resamplingViewPool=new ResamplingViewPool(budget,profile),cloningGroupPool=new CloningGroupPool(budget,profile);let busy=false,disposed=false;
 const resultSurfaces=createResultSurfaces(surfaces);
 const knownHeapBytes=()=>Math.max(codec.memoryBytes?.()??0,imageCodec.memoryBytes())+waveletHeapBytes()+zeroHeapBytes()+prnuHdf5HeapBytes()+medianHeapBytes()+qualityHeapBytes()+resamplingHeapBytes()+cloningHeapBytes();
 function alive(){if(disposed)throw new EngineError('DISPOSED','Engine disposed.');}
 function idle(){alive();if(busy)throw new EngineError('BUSY','Another engine task is active.');}
 function asset(id){alive();const value=images.get(id);if(!value)throw new EngineError('NOT_FOUND','Source not loaded.');return value;}
 function image(id){const im=asset(id);requireValue(im.kind==='image','This source is not an image.');return im;}
 function attachSurface(id,record){record.surface??=contiguousSurface(record.pixels,budget);surfaces.set(record.surface.descriptor.id,{imageId:id,record});return record.surface.descriptor;}
 function identity(id){requireValue(typeof id==='string'&&id.length>0&&id.length<=128&&!id.includes('\0'),'Invalid id.');}
 async function runPixels(task,{signal,onProgress}={}){
  const operation=PIXEL_OPERATIONS[task.operation],p=operation.validate(task.params),im=image(task.imageId);
  const referenceIds=operation.references?.(p)??[],references=referenceIds.map(id=>{identity(id);const value=asset(id);requireValue(value.kind===(operation.referenceKind??'image'),'Reference source has the wrong kind for this operation.');if(value.segmented)throw new EngineError('UNSUPPORTED_LAYOUT','This reference requires a segmented adapter.');return {id,...value};}),dependencies=referenceIds.length?[task.imageId,...referenceIds]:[];
  const referenceKey=references.length?'/references/'+JSON.stringify(references.map(r=>[r.id,r.sha256])):'';
  const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+im.pixels.data.length*operation.scratchFactor+operation.extraBytes+(operation.admissionBytes?.(im.pixels,p,im.bytes)??0));busy=true;
  const workspaceReservations=[],reserveMemory=bytes=>{requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Invalid workspace reservation.');const free=budget.reserve(bytes);workspaceReservations.push(free);return free;},releaseWorkspace=()=>{for(const free of workspaceReservations)free();workspaceReservations.length=0;};
  const backend=task.backend??'auto',start=performance.now(),key=task.imageId+'\0op/'+task.operation+'/'+(operation.backends?backend+'/':'')+JSON.stringify(task.operation==='inspection.histogram'?{}:(operation.cacheParams?.(p)??p))+referenceKey;
  try{
   await checkpoint(signal);let stored=budget.get(key),result=stored?.value;const cached=!!result;
   const stageCache={};const memo=async(name,compute)=>{const stageKey=task.imageId+'\0stage/'+task.operation+referenceKey+'/'+name,hit=budget.get(stageKey);stageCache[name]=!!hit;if(hit)return hit.value;const value=await compute();checkAbort(signal);budget.put(stageKey,{value,byteLength:payloadBytes(value)},dependencies);return value;};
   const memoMany=async(names,compute)=>{const values=new Map(),missing=[];for(const name of names){const hit=budget.get(task.imageId+'\0stage/'+task.operation+referenceKey+'/'+name);stageCache[name]=!!hit;if(hit)values.set(name,hit.value);else missing.push(name);}if(missing.length){const computed=await compute(missing);checkAbort(signal);requireValue(computed.length===missing.length,'Invalid batch result count.');for(let i=0;i<missing.length;i++){values.set(missing[i],computed[i]);budget.put(task.imageId+'\0stage/'+task.operation+referenceKey+'/'+missing[i],{value:computed[i],byteLength:payloadBytes(computed[i])},dependencies);}}return names.map(name=>values.get(name));};
   const memoImage=async(name,compute)=>{const stageKey=task.imageId+'\0stage/'+task.operation+'/image-only/'+name,hit=budget.get(stageKey);stageCache[name]=!!hit;if(hit)return hit.value;const value=await compute();checkAbort(signal);budget.put(stageKey,{value,byteLength:payloadBytes(value)});return value;};
   if(!result)result=await operation.compute(im.pixels,p,{signal,onProgress:fraction=>onProgress?.({id:task.id,phase:'kernel',fraction})},{bytes:im.bytes,sourceSha256:im.sha256,references,codec,memo,memoMany,memoImage,reserveMemory,backend,cpuKernel,cloningGroupPool:cpuKernel==='auto'?cloningGroupPool:null,zeroPool:cpuKernel==='auto'?zeroPool:null,noisesnifferPool:cpuKernel==='auto'?noisesnifferPool:null,frequencyGpu:backend!=='cpu'&&(cpuKernel==='auto'||backend==='webgpu')?frequencyGpu:null,medianPool:cpuKernel==='auto'?medianPool:null,qualityPool:codec===imageCodec&&cpuKernel==='auto'?qualityPool:null});
   checkAbort(signal);if(operation.dynamicResultBudget)reserveMemory(payloadBytes(result)*3);const owned=structuredClone(result);delete owned.engineMetrics;if(task.operation==='inspection.histogram')histogramView(owned,p);const viewStart=performance.now(),viewMetrics=operation.view?await operation.view(owned,p,{signal},{image:im.pixels,resamplingViewPool:cpuKernel==='auto'?resamplingViewPool:null}):null;const viewMs=performance.now()-viewStart;checkAbort(signal);
   const provenance={engine:VERSION,operation:task.operation,params:p,backend:result.engineMetrics?.backend??'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:operation.native,...(references.length?{references:references.map(r=>r.kind==='image'?{imageId:r.id,originalSha256:r.sha256,decode:structuredClone(r.provenance)}:{id:r.id,kind:r.kind,originalSha256:r.sha256,...structuredClone(r.provenance)})}:{}),kernelParity:operation.parity??'bit-exact pixels/masks on synthetic native fixtures; see fixtures/pixel-reference.json',semantics:result.semantics};
   onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);
   releaseWorkspace();release();if(!cached)budget.put(key,{value:result,byteLength:payloadBytes(result)},dependencies);
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...owned,layers:owned.layers??(owned.pixels?[{id:task.operation,kind:'rgb',origin:[0,0],range:[0,255]}]:[]),provenance,metrics:{totalMs:performance.now()-start,cache:{result:cached,...(Object.keys(stageCache).length?{stages:stageCache}:{}),...(operation.view?{analysis:cached,view:false}:{})},kernel:'cpu-reference',workers:cached&&!operation.view?0:1,...(cached?{}:result.engineMetrics),...(operation.view?{viewMs}:{}),...(task.operation==='tampering.resampling.fourier'?viewMetrics:{}),memory:{...budget.snapshot(),codecHeapCapacityBytes:(codec.memoryBytes?.()??0)+waveletHeapBytes()+zeroHeapBytes(),hdf5HeapCapacityBytes:prnuHdf5HeapBytes(),medianHeapCapacityBytes:medianHeapBytes(),qualityHeapCapacityBytes:qualityHeapBytes(),resamplingHeapCapacityBytes:resamplingHeapBytes(),cloningHeapCapacityBytes:cloningHeapBytes()}}};
  }finally{releaseWorkspace();if(budget.active>0)release();busy=false;}
 }
 async function readSurfaceWindow({surfaceId,revision,rect},format,{signal}={}){
   idle();const entry=surfaces.get(surfaceId);if(!entry)throw new EngineError('NOT_FOUND','Pixel surface no longer exists.');requireValue(entry.record.surface.descriptor.format===format,'Use the matching RGB, mask or flag window API.');requireValue(revision===entry.record.surface.descriptor.revision,'Stale pixel surface revision.');busy=true;let window,resident;
   try{resident=budget.reserve(knownHeapBytes());window=await entry.record.surface.readWindow(rect,{signal});const {release,...result}=window;return {...result,imageId:entry.imageId,metrics:{outboundBytes:result.pixels.data.byteLength,memory:budget.snapshot()}};}finally{window?.release();resident?.();busy=false;}
 }
 async function readTablePage({tableId,revision,...range},csv,{signal}={}){
  idle();const entry=surfaces.get(tableId);if(!entry)throw new EngineError('NOT_FOUND','Result table no longer exists.');
  const table=entry.record.surface;requireValue(table.descriptor.format==='uint32-table','Use the matching table or pixel API.');requireValue(revision===table.descriptor.revision,'Stale table revision.');busy=true;let page,resident;
  try{resident=budget.reserve(knownHeapBytes());page=await table[csv?'readCsv':'readRows'](range,{signal});const {release,...result}=page;return {...result,imageId:entry.imageId,metrics:{outboundBytes:(result.bytes??result.data).byteLength,memory:budget.snapshot()}};}
  finally{page?.release();resident?.();busy=false;}
 }
 async function runOriginalBytes(task,im,p,{signal,onProgress}){
  const operation=PIXEL_OPERATIONS[task.operation],key=task.imageId+'\0source-bytes/'+task.operation+'/'+JSON.stringify(p),started=performance.now();let release;busy=true;
  try{
   // Hash-WASM state allowance is separate from JPEG/other known heap capacity.
   // Window staging and the defensive output copy fit the smaller hex allowance.
   release=budget.reserve(knownHeapBytes()+(task.operation==='file.digest'?32*1024**2:256*1024));checkAbort(signal);
   let result=budget.get(key)?.value;const cached=!!result;
   if(!result)result=await operation.compute(null,p,{signal,onProgress:fraction=>onProgress?.({id:task.id,phase:'original-bytes',fraction})},im.segmented?{source:im.source}:{bytes:im.bytes});
   checkAbort(signal);const owned=structuredClone(result);onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);
   release();release=null;if(!cached)budget.put(key,{value:result,byteLength:payloadBytes(result)});
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...owned,layers:[],provenance:{engine:VERSION,operation:task.operation,params:p,backend:'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:operation.native,kernelParity:task.operation==='file.digest'?'Ten original-byte digests matched against independent streaming hashes':'Original-byte window copied exactly',input:'original-bytes',layout:im.segmented?'segmented':'contiguous',semantics:result.semantics},metrics:{totalMs:performance.now()-started,workers:cached?0:1,cache:{result:cached},memory:budget.snapshot()}};
  }finally{release?.();busy=false;}
 }
 async function runSegmentedResult(task,im,p,{signal,onProgress}){
  busy=true;let resident,record,published=false;const started=performance.now();
  try{
   resident=budget.reserve(knownHeapBytes());record=await ({'pixels.defects':segmentedDefects,'noise.planes':segmentedBitPlanes,'noise.minmax':segmentedMinmax,'colors.stats':segmentedPixelStats}[task.operation])(im,p,{budget,signal,onProgress:f=>onProgress?.({id:task.id,phase:'kernel',fraction:f})});checkAbort(signal);
   const bundle=resultSurfaces.publishBundle(task.imageId,record),surface=bundle.surface;published=true;
   return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,...(record.data?{data:record.data}:{}),layers:[{id:task.operation,kind:'rgb',surfaceId:surface.id,origin:[0,0],range:[0,255]},...Object.entries(bundle.maskSurfaces??{}).map(([id,mask])=>({id,kind:'mask',surfaceId:mask.id,origin:[0,0],range:mask.range,semantics:mask.semantics}))],semantics:record.semantics,provenance:{engine:VERSION,operation:task.operation,params:p,backend:'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),native:PIXEL_OPERATIONS[task.operation].native,kernelParity:'Declared native pixel/mask corpus with exact segmented seams and image borders',layout:'segmented'},metrics:{...record.metrics,temporaryBackend:im.session?.backend??null,temporaryFallback:im.session?.fallback??null,totalMs:performance.now()-started,workers:1,cache:{result:false},memory:budget.snapshot()}};
  }catch(error){if(record&&!published)await Promise.allSettled([record.surface.dispose(),...['maskRecords','flagRecords','tableRecords'].flatMap(name=>Object.values(record[name]??{}).map(r=>r.surface.dispose()))]);throw error;}finally{resident?.();busy=false;}
 }
 async function loadTreeModel(input,{signal,onProgress}={},family){
   const kind=family==='median'?'median-model':'jpeg-quality-model',compile=family==='median'?compileMedianModel:compileQualityModel;
   idle();identity(input?.id);requireValue(input.blob instanceof Blob&&input.blob.size>0&&input.blob.size<=64*1024**2,'A local JSON model Blob of at most64MiB is required.');requireValue(!images.has(input.id),'Unload a source before reusing its id.');
   const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+input.blob.size*2);busy=true;let model,stored=false;
   try{
    await checkpoint(signal);const started=performance.now(),bytes=new Uint8Array(await input.blob.arrayBuffer());checkAbort(signal);const hash=await sha(bytes);checkAbort(signal);
    model=await compile(bytes,{budget,signal,onProgress:fraction=>onProgress?.({id:input.id,phase:'model-load',fraction})});checkAbort(signal);
    const provenance={...model.metadata,weightSource:'explicit-local-blob',weightsBundled:false},retainedBytes=bytes.byteLength;
    release();budget.retain(retainedBytes);images.set(input.id,{kind,model,bytes,sha256:hash,provenance,retainedBytes});stored=true;
    return {id:input.id,kind,sha256:hash,...structuredClone(provenance),metrics:{preparationMs:performance.now()-started,memory:budget.snapshot()}};
   }finally{if(!stored)model?.dispose();release();busy=false;}
 }
 return {
  capabilities(){return {version:VERSION,operations:[{id:'ela.classic',status:'partial',backends:['cpu'],regions:['full-frame'],kernelParity:'bit-exact on 40 native fixture outputs',codecParity:codec.parity??'unverified'},...pixelCapabilities()],sourceAccess:{blob:true,windows:true,segmentedFormats:['image/jpeg'],segmentedOperations:['inspection.histogram','colors.stats','noise.planes','noise.minmax','pixels.defects','file.hex','file.digest'],segmentedOperationConstraints:{'file.digest':{imageHashes:false}},resultSurfaces:true,maskWindows:true,flagWindows:true,tablePages:true,tableCsvPages:true},formats:['image/jpeg (8-bit, EXIF orientation, ICC preserved but not applied, no CMYK)','image/png (8/16-bit gray/RGB, alpha converted by native policy)','image/tiff (verified 8/16-bit grayscale/RGB subset)','explicit rgb8 with provenance'],unavailable:['analysis.complete','ela.biomes','ela.ghosts','onnx'],energyProfile:DEFAULT_ENERGY_PROFILE,memory:{...budget.snapshot(),knownHeapCapacityBytes:knownHeapBytes()},workerThreads:pool.selected??1,calculationProfile:profile.id,resourceProfile:profile,concurrencyReason:'One codec thread; ELA classic and energy, JPEG quality, Ghost, ZERO, Noisesniffer, median-feature, ORB grouping and Fourier presentation pools start requested work immediately under one shared budget, with single-thread workers and adaptation from completed useful tasks. No runtime calibration or synthetic probes. Frequency mask smoothing can use the offline-qualified WebGPU path; DFT and reconstruction remain on CPU. Other pixel kernels currently use one worker.'};},
  async load(input,{signal}={}) {
   idle();identity(input?.id);requireValue(input.bytes instanceof Uint8Array&&input.bytes.length>0,'Original bytes required.');
   requireValue(!images.has(input.id),'Unload an image before reusing its id.');
   if(input.pixels)validatePixels(input.pixels);
   const shape=input.pixels??codec.inspect(input.bytes);const n=shape.width*shape.height;
   const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+input.bytes.length*3+n*24);busy=true;
   try {
    await checkpoint(signal);const start=performance.now(),bytes=input.bytes.slice();
    const pixels=input.pixels?copyPixels(input.pixels):await codec.decode(bytes,{signal});
    validatePixels(pixels);requireValue(pixels.width===shape.width&&pixels.height===shape.height,'Decoded dimensions differ.');
    const hash=await sha(bytes);checkAbort(signal);
    const provenance=input.pixels ? {decoder:'caller',parity:'unverified',...structuredClone(input.provenance??{})} : codec.provenance?.(bytes)??{decoder:codec.id,orientation:'unverified',icc:'unverified',depth:8,alpha:'unverified',interpolation:'none'};
    const record={kind:'image',bytes,pixels,provenance,sha256:hash,retainedBytes:bytes.byteLength+pixels.data.byteLength};
    // Release temporary reservation before converting its retained part.
    release();budget.retain(bytes.byteLength+pixels.data.byteLength);images.set(input.id,record);
    return {id:input.id,width:pixels.width,height:pixels.height,format:pixels.format,sha256:hash,provenance,surface:attachSurface(input.id,record),metrics:{preparationMs:performance.now()-start,memory:budget.snapshot()}};
   } catch(error) {releaseOnce();throw error;} finally {busy=false;}
   // The success path releases first; errors before that must release once.
   function releaseOnce(){if(budget.active>0)release();}
  },
  async loadBlob(input,{signal,onProgress}={}){
   idle();identity(input?.id);requireValue(input.blob instanceof Blob&&input.blob.size>0,'Non-empty original Blob required.');requireValue(!images.has(input.id),'Unload a source before reusing its id.');
   busy=true;const started=performance.now(),source=createBlobSource(input.blob,{budget}),progress=e=>onProgress?.({id:input.id,...e});let release,record,headerResident;
   const segmented=async()=>{const resident=budget.reserve(Math.max(0,knownHeapBytes()-jpegCodec.memoryBytes()));try{return await loadSegmentedJpeg(input.blob,{budget,signal,onProgress:progress,temporarySessionId:input.temporarySessionId,onTemporarySession});}finally{resident();}};
   try{
    headerResident=budget.reserve(knownHeapBytes());const signature=await source.read(0,Math.min(2,input.blob.size),{signal});let jpeg;try{jpeg=signature.bytes[0]===255&&signature.bytes[1]===216;}finally{signature.release();}
    let header,bytes;if(jpeg)header=await inspectJpegBlob(source,{signal});else{release=budget.reserve(input.blob.size);bytes=new Uint8Array(await input.blob.arrayBuffer());checkAbort(signal);header=codec.inspect(bytes);release();release=null;}
    headerResident();headerResident=null;const n=header.width*header.height,working=Math.max(RUNTIME_RESERVE,knownHeapBytes())+input.blob.size*3+n*24,codecFits=!jpeg||input.blob.size*2+n*9+32*1024**2<=512*1024**2;
    if(codecFits&&working<=budget.limit-budget.retained-budget.active){
     try{release=budget.reserve(working);bytes??=new Uint8Array(await input.blob.arrayBuffer());checkAbort(signal);const pixels=await codec.decode(bytes,{signal});validatePixels(pixels);requireValue(pixels.width===header.width&&pixels.height===header.height,'Decoded dimensions differ.');const hash=await sha(bytes);checkAbort(signal);
     const provenance=codec.provenance?.(bytes)??{decoder:codec.id,parity:'unverified'};record={kind:'image',blob:input.blob,bytes,pixels,sha256:hash,provenance,retainedBytes:bytes.byteLength+pixels.data.byteLength,metrics:{storage:'memory',path:'existing-full-memory',originalBlobBytes:input.blob.size}};
     release();release=null;budget.retain(record.retainedBytes);
     }catch(error){release?.();release=null;bytes=null;if(!jpeg||!(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error.code)||error instanceof RangeError))throw error;record=await segmented();record.metrics.retry={from:'full-memory',code:error.code??'MEMORY_ALLOCATION'};}
    }else{
     bytes=null;if(!jpeg)throw new EngineError('UNSUPPORTED_LAYOUT','A segmented PNG/TIFF decoder is not yet available.');
     record=await segmented();
    }
    checkAbort(signal);const surface=attachSurface(input.id,record);images.set(input.id,record);return {id:input.id,width:surface.width,height:surface.height,format:'rgb8',surface,sha256:record.sha256,provenance:record.provenance,...(record.segmented?{operationConstraints:{'file.digest':{imageHashes:false}}}:{}),availableOperations:record.segmented?['inspection.histogram','colors.stats','noise.planes','noise.minmax','pixels.defects','file.hex','file.digest']:['ela.classic',...Object.keys(PIXEL_OPERATIONS)],metrics:{...record.metrics,preparationMs:performance.now()-started,memory:budget.snapshot()}};
   }catch(error){if(record){if(record.segmented)await disposeSegmentedImage(record);else budget.retained-=record.retainedBytes;}throw error;}
   finally{headerResident?.();release?.();source.dispose();busy=false;}
  },
  readPixels:(request,hooks)=>readSurfaceWindow(request,'rgb8',hooks),
  async readMask(request,hooks){const {pixels,...result}=await readSurfaceWindow(request,'mask8',hooks);return {...result,mask:pixels};},
  async readFlags(request,hooks){const {pixels,...result}=await readSurfaceWindow(request,'rgb-flags8',hooks);return {...result,flags:pixels};},
  readTable:(request,hooks)=>readTablePage(request,false,hooks),
  readTableCsv:(request,hooks)=>readTablePage(request,true,hooks),
  async releaseTable(id){idle();requireValue(surfaces.get(id)?.record.surface.descriptor.format==='uint32-table','A live table handle is required.');busy=true;try{await resultSurfaces.release(id);}finally{busy=false;}},
  async releaseSurface(id){idle();busy=true;try{await resultSurfaces.release(id);}finally{busy=false;}},
  originalBlob(id){idle();const im=asset(id);if(im.segmented)return im.source.blob();if(im.blob)return im.blob;const release=budget.reserve(im.bytes.byteLength+knownHeapBytes());try{return new Blob([im.bytes]);}finally{release();}},
  async readOriginal(id,{offset=0,length}={}, {signal}={}){
   idle();const im=asset(id);if(!im.segmented&&!im.blob){length??=Math.min(1024**2,im.bytes.length-offset);requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=im.bytes.length-length,'Invalid original byte range.');checkAbort(signal);const release=budget.reserve(length+knownHeapBytes());try{return {offset,bytes:im.bytes.slice(offset,offset+length),totalBytes:im.bytes.length};}finally{release();}}const source=im.segmented?im.source:createBlobSource(im.blob,{budget});busy=true;let part,resident;
   try{resident=budget.reserve(knownHeapBytes());part=await source.read(offset,length??Math.min(1024**2,source.byteLength-offset),{signal});return {offset,bytes:part.bytes,totalBytes:source.byteLength};}finally{part?.release();resident?.();if(!im.segmented)source.dispose();busy=false;}
  },
  loadMedianModel:(input,hooks)=>loadTreeModel(input,hooks,'median'),
  loadQualityModel:(input,hooks)=>loadTreeModel(input,hooks,'jpeg-quality'),
  async loadPrnuDatabase(input,{signal}={}){
   idle();identity(input?.id);requireValue(input.bytes instanceof Uint8Array&&input.bytes.length>0,'Original HDF5 bytes required.');requireValue(!images.has(input.id),'Unload a source before reusing its id.');
   const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+input.bytes.byteLength*2);busy=true;let released=false;
   try{
    await checkpoint(signal);const start=performance.now(),bytes=input.bytes.slice(),database=await readPrnuDatabase(bytes,{signal,maxWorkingBytes:memoryBudgetBytes,admit:n=>budget.reserve(n)}),hash=await sha(bytes);checkAbort(signal);
    const provenance={schema:database.schema,legacy:database.legacy,complete:database.complete,trainingMembershipVerified:database.trainingMembershipVerified},retainedBytes=bytes.byteLength+payloadBytes(database);
    release();released=true;budget.retain(retainedBytes);images.set(input.id,{kind:'prnu-database',bytes,database,sha256:hash,provenance,retainedBytes});
    return {id:input.id,kind:'prnu-database',sha256:hash,...provenance,cameras:database.cameras.map(c=>({name:c.name,width:c.fingerprint.width,height:c.fingerprint.height,nImages:c.nImages,nUsed:c.nUsed})),metrics:{preparationMs:performance.now()-start,memory:{...budget.snapshot(),hdf5HeapCapacityBytes:prnuHdf5HeapBytes()}}};
   }finally{if(!released)release();busy=false;}
  },
  async buildPrnuDatabase(input,{signal,onProgress}={}){
   idle();identity(input?.id);requireValue(!images.has(input.id),'Unload a source before reusing its id.');const query=image(input.queryImageId);
   const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes()));busy=true;let snapshot,released=false;
   try{
    const start=performance.now();snapshot=await buildPrnuSnapshot(input,query.sha256,{signal,fast:cpuKernel!=='reference',admit:n=>budget.reserve(n),onProgress:fraction=>onProgress?.({id:input.id,phase:'fingerprints',fraction})});
    const database=snapshot.database,bytes=await writePrnuDatabase(database,{signal,maxWorkingBytes:memoryBudgetBytes,admit:n=>budget.reserve(n)}),hash=await sha(bytes);checkAbort(signal);
    const provenance={schema:database.schema,legacy:false,complete:true,trainingMembershipVerified:true},retainedBytes=bytes.byteLength+payloadBytes(database);
    snapshot.release();snapshot=null;release();released=true;budget.retain(retainedBytes);images.set(input.id,{kind:'prnu-database',bytes,database,sha256:hash,provenance,retainedBytes});
    return {id:input.id,kind:'prnu-database',sha256:hash,...provenance,cameras:database.cameras.map(c=>({name:c.name,width:c.fingerprint.width,height:c.fingerprint.height,nImages:c.nImages,nUsed:c.nUsed,skippedImages:structuredClone(c.skippedImages)})),metrics:{preparationMs:performance.now()-start,memory:{...budget.snapshot(),hdf5HeapCapacityBytes:prnuHdf5HeapBytes()}}};
   }finally{snapshot?.release();if(!released)release();busy=false;}
  },
  exportPrnuDatabase(id){idle();const value=asset(id);requireValue(value.kind==='prnu-database','A loaded PRNU database is required.');const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+value.bytes.byteLength);try{return {mime:'application/x-hdf5',bytes:value.bytes.slice()};}finally{release();}},
  async run(task,{signal,onProgress}={}) {
   idle();identity(task?.id);if(task.operation!=='ela.classic'&&!Object.hasOwn(PIXEL_OPERATIONS,task.operation))throw new EngineError('UNSUPPORTED_OPERATION','Operation unavailable.');
   if(task.backend && !['cpu','auto',...(PIXEL_OPERATIONS[task.operation]?.backends??[])].includes(task.backend))throw new EngineError('UNSUPPORTED_BACKEND','Requested backend unavailable.');
   if(task.regions && (!Array.isArray(task.regions)||task.regions.length))throw new EngineError('UNSUPPORTED_REGION','This operation currently supports the full image only.');
   const selected=image(task.imageId);
   if(['file.hex','file.digest'].includes(task.operation)){
    const p=PIXEL_OPERATIONS[task.operation].validate(task.params);
    if(task.operation==='file.hex'||!p.imageHashes)return runOriginalBytes(task,selected,p,{signal,onProgress});
    if(selected.segmented)throw new EngineError('UNSUPPORTED_LAYOUT','Perceptual image hashes have no qualified segmented adapter. Request imageHashes:false explicitly for the ten original-byte digests.');
   }
   if(selected.segmented){
    if(['colors.stats','noise.planes','noise.minmax','pixels.defects'].includes(task.operation))return runSegmentedResult(task,selected,PIXEL_OPERATIONS[task.operation].validate(task.params),{signal,onProgress});
    requireSegmentedOperation(task.operation);const p=PIXEL_OPERATIONS[task.operation].validate(task.params),started=performance.now(),key=task.imageId+'\0segmented/histogram';busy=true;let outputRelease,resident;
    try{resident=budget.reserve(knownHeapBytes());let base=budget.get(key)?.value;const cached=!!base;if(!base){base=await segmentedHistogram(selected.store,p,{budget,signal,onProgress:f=>onProgress?.({id:task.id,phase:'kernel',fraction:f})});budget.put(key,{value:base,byteLength:payloadBytes(base)});}outputRelease=budget.reserve(payloadBytes(base)*2);const owned=structuredClone(base);histogramView(owned,p);checkAbort(signal);return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',...owned,layers:[],provenance:{engine:VERSION,operation:task.operation,params:p,backend:'cpu',originalSha256:selected.sha256,decode:structuredClone(selected.provenance),native:PIXEL_OPERATIONS[task.operation].native,kernelParity:'Native global histogram corpus exact; complete source is visited',layout:'segmented'},metrics:{totalMs:performance.now()-started,workers:cached?0:1,cache:{result:cached,analysis:cached},memory:budget.snapshot()}};}finally{outputRelease?.();resident?.();busy=false;}
   }
   if(task.operation!=='ela.classic')return runPixels(task,{signal,onProgress});
   const p=validateParams(task.params),im=image(task.imageId),n=im.pixels.data.length;
   const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+n*16);busy=true;
   const start=performance.now(),prefix=task.imageId+'\0',qkey=prefix+'q'+p.quality,bkey=qkey+'/'+p.linear;
   const fused=cpuKernel!=='reference'&&n>=786432;
   const tableKey=prefix+'lut/'+p.scale+'/'+p.contrast+'/'+p.linear;
   const rkey=bkey+'/'+p.scale+'/'+p.contrast+'/'+p.grayscale;
   const metrics={codecMs:0,kernelMs:0,cache:{recompressed:false,base:false,result:false}};
   const progress=(phase,fraction)=>onProgress?.({id:task.id,phase,fraction});
   let compressed,base,result,table;
   try {
    await checkpoint(signal);result=budget.get(rkey);metrics.cache.result=!!result;
    if(!result && fused){
     compressed=budget.get(qkey);metrics.cache.recompressed=!!compressed;
     if(!compressed){progress('jpeg',0);const t=performance.now();const decoded=await codec.recompress(im.pixels,p.quality,{signal});validatePixels(decoded);requireValue(decoded.width===im.pixels.width&&decoded.height===im.pixels.height,'Codec changed dimensions.');compressed=decoded.data;metrics.codecMs=performance.now()-t;}
     const t=performance.now();table=budget.get(tableKey);metrics.cache.table=!!table;if(!table)table=await toneTable(p,{signal});
     if(n>=3145728&&cpuKernel==='auto'){const run=await pool.run(im.pixels.data,compressed,p,table,{signal});result=run.data;metrics.workers=run.workers;metrics.scheduling=run.scheduling;}else{result=await fusedCpu(im.pixels.data,compressed,p,table,{signal});metrics.workers=1;}metrics.kernelMs=performance.now()-t;metrics.kernel='cpu-lookup';
    } else if(!result) {
     metrics.kernel='cpu-reference';
     base=budget.get(bkey);metrics.cache.base=!!base;
     if(!base) {
      compressed=budget.get(qkey);metrics.cache.recompressed=!!compressed;
      if(!compressed){progress('jpeg',0);const t=performance.now();const decoded=await codec.recompress(im.pixels,p.quality,{signal});validatePixels(decoded);requireValue(decoded.width===im.pixels.width&&decoded.height===im.pixels.height,'Codec changed dimensions.');compressed=decoded.data;metrics.codecMs=performance.now()-t;}
      const t=performance.now();base=await elaBase(im.pixels.data,compressed,p.linear,{signal,onProgress:f=>progress('base',f)});metrics.kernelMs+=performance.now()-t;
     }
     const t=performance.now();result=await elaRender(base,p,{signal,onProgress:f=>progress('render',f)});metrics.kernelMs+=performance.now()-t;
    }
    checkAbort(signal);
    const pixels={width:im.pixels.width,height:im.pixels.height,format:'rgb8',data:result.slice()};
    const provenance={engine:VERSION,operation:'ela.classic',params:p,backend:'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),codec:{id:codec.id,options:{...JPEG_OPTIONS,quality:p.quality},parity:codec.parity??'unverified'},kernelParity:'bit-exact on synthetic native reference; see fixtures/reference.json',semantics:'JPEG residual visualization; not a detection or authenticity verdict'};
    progress('complete',1);metrics.totalMs=performance.now()-start;
    release();if(table)budget.put(tableKey,table);if(compressed)budget.put(qkey,compressed);if(base)budget.put(bkey,base);budget.put(rkey,result);
    metrics.memory={...budget.snapshot(),codecHeapCapacityBytes:(codec.memoryBytes?.()??0)+waveletHeapBytes()+zeroHeapBytes(),hdf5HeapCapacityBytes:prnuHdf5HeapBytes()};
    return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',pixels,layers:[{id:'ela',name:'ELA classique',kind:'rgb',origin:[0,0],range:[0,255]}],provenance,metrics};
   } finally {if(budget.active>0)release();busy=false;}
  },
  exportResult(result,options={}){idle();if(options.format==='csv'&&result?.tables?.candidates)throw new EngineError('UNSUPPORTED_EXPORT','Use readTableCsv pages for a stored candidate table.');const maximum=options.maxBytes??32*1024**2;requireValue(Number.isSafeInteger(maximum)&&maximum>0,'Positive export byte limit required.');const json=(options.format??'json')==='json',bound=json?jsonExportBound(result):maximum;if(json&&bound>maximum)throw new EngineError('MEMORY_LIMIT','JSON export exceeds its conservative byte budget.');const release=budget.reserve(Math.max(RUNTIME_RESERVE,knownHeapBytes())+payloadBytes(result)+(json?3*bound:maximum));try{return exportAnalysis(result,{...options,maxBytes:maximum});}finally{release();}},
  imagePixels(id){idle();const im=image(id);if(im.segmented)throw new EngineError('UNSUPPORTED_LAYOUT','Use readPixels for the segmented surface.');const release=budget.reserve(knownHeapBytes()+im.pixels.data.byteLength);try{return copyPixels(im.pixels);}finally{release();}},
  original(id){idle();const im=asset(id);if(im.segmented)throw new EngineError('UNSUPPORTED_LAYOUT','Use originalBlob or readOriginal for this source.');const release=budget.reserve(knownHeapBytes()+im.bytes.byteLength);try{return im.bytes.slice();}finally{release();}},
  unload(id){idle();const im=asset(id);images.delete(id);if(im.surface)surfaces.delete(im.surface.descriptor.id);budget.retained-=im.retainedBytes;im.model?.dispose();budget.clearPrefix(id+'\0');budget.clearDependencies(id);if(images.size===0)frequencyGpu.dispose();if(im.segmented){busy=true;return (async()=>{try{await resultSurfaces.clear(id);}finally{await disposeSegmentedImage(im);}})().finally(()=>{busy=false;});}im.surface?.dispose();},
  dispose(){idle();pool.dispose();qualityPool.dispose();medianPool.dispose();resamplingViewPool.dispose();cloningGroupPool.dispose();zeroPool.dispose();noisesnifferPool.dispose();frequencyGpu.dispose();const segmented=[...images.values()].filter(im=>im.segmented);for(const im of images.values()){im.model?.dispose();if(!im.segmented)im.surface?.dispose();}images.clear();surfaces.clear();disposed=true;if(segmented.length)return (async()=>{try{await resultSurfaces.clear();}finally{await Promise.all(segmented.map(disposeSegmentedImage));}})().finally(()=>budget.clear());budget.clear();}
 };
}
