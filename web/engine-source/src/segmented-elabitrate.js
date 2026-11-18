import {EngineError,requireValue,checkAbort,createCooperator,normalizeResourceError} from './errors.js';
import {elabitrateParams,elabitrateHistogram,elabitrateNormalize,elabitrateLookup,ELABITRATE_SEMANTICS} from './elabitrate.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {ByteLutGpu} from './byte-lut-gpu.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// Immutable source/scope histogram shared by previews and final renders.
// Caller releases this small loan after constructing its normalized lookup.
export async function elabitrateSourceHistogram(image,{budget,signal,imageId,view,domain,onProgress}={}){
 const d=image.surface.descriptor,width=d.width,height=d.height,rows=Math.max(1,Math.min(height,Math.floor(262144/width))),release=budget.reserve(2048),cooperate=createCooperator(signal);let committed=false;
 try{
  requireValue(d.format==='rgb8'&&(!view||domain?.fingerprint),'Canonical RGB8 source and explicit admitted scope required.');
  const key=imageId?imageId+'\0elabitrate/rgb8-histogram/'+image.sha256+'/'+d.id+'/'+d.revision+'/'+(domain?.fingerprint??'identity'):null,cached=key?budget.get(key)?.value:null,histogram=cached??new Float64Array(256);let sourceReads=0;
  if(!cached){
   if(view)await view.visitIncluded(async(pixels,{completed,rect})=>{sourceReads++;await elabitrateHistogram(pixels.data,histogram,{signal});onProgress?.({phase:'elabitrate-admitted-histogram',completed:completed+rect.width*rect.height,total:domain.countIncluded});},{signal,windowPixels:65536});
   else for(let y=0;y<height;y+=rows){await cooperate();const count=Math.min(rows,height-y),window=await image.surface.readWindow({x:0,y,width,height:count},{signal});try{sourceReads++;await elabitrateHistogram(window.pixels.data,histogram,{signal});}finally{await window.release();}onProgress?.({phase:'elabitrate-global-histogram',completed:y+count,total:height});}
   checkAbort(signal);if(key)budget.put(key,{value:histogram,byteLength:histogram.byteLength},[imageId]);
  }
  committed=true;return{histogram,cached:!!cached,sourceReads,release};
 }finally{if(!committed)release();}
}

// The integer-byte GPU transport consumes the exact CPU-built 256-code table.
// No codec or floating quantization formula runs on the GPU.
export function createElabitrateRenderer(budget,backend='auto'){
 if(!['cpu','auto','webgpu'].includes(backend))throw new EngineError('UNSUPPORTED_BACKEND','ELAB supports CPU, automatic or WebGPU byte lookup.');
 let gpu=backend==='webgpu'?new ByteLutGpu(budget):null,gpuCalls=0,gpuMs=0,cpuCalls=0,uploadedBytes=0,fallback=null;
 return{async render(pixels,lut,{signal}={}){
  requireValue(pixels?.format==='rgb8'&&pixels.data instanceof Uint8Array&&pixels.data.length===pixels.width*pixels.height*3,'Complete canonical RGB8 render window required.');
  if(gpu){try{const owner=await gpu.lookup(pixels.data,lut,{signal});gpuCalls++;gpuMs+=owner.runtime.totalMs;uploadedBytes+=owner.runtime.uploadedBytes;return{data:owner.data,release:()=>owner.release()};}
   catch(error){if(signal?.aborted||error.cleanupOwner||!gpu.mayFallback(error))throw error;fallback=error.code;await gpu.dispose();gpu=null;}
  }
  const release=budget.reserve(pixels.data.byteLength);try{const data=await elabitrateLookup(pixels.data,lut,{signal});cpuCalls++;return{data,release};}catch(error){release();throw error;}
 },metrics(){return{backend:gpuCalls?'webgpu':'cpu',gpuLookupCalls:gpuCalls,gpuLookupMs:gpuMs,gpuUploadedBytes:uploadedBytes,cpuLookupCalls:cpuCalls,gpuArithmetic:gpuCalls?'integer-byte-lookup':null,gpuFallback:fallback,automaticBackend:'cpu-byte-lookup'};},async dispose(){await gpu?.dispose();gpu=null;}};
}
export async function segmentedElabitrate(image,input,{budget,signal,onProgress,backend='auto',imageId}={}){
 const params=elabitrateParams(input),d=image.surface.descriptor,width=d.width,height=d.height,bytes=width*height*3,rows=Math.max(1,Math.min(height,Math.floor(262144/width))),bandBytes=width*Math.min(rows,height)*3,cooperate=createCooperator(signal);
 requireValue(d.format==='rgb8'&&Number.isSafeInteger(bytes),'Last Bit Analysis requires the canonical full-resolution RGB8 surface.');
 let output,surface,planning,metadata,renderer,histogramOwner,failed=false,primary;const stageMs={},started=performance.now();
 try{
  metadata=budget.reserve(8192);planning=budget.reserve(bandBytes*2+1024**2+(backend==='webgpu'?12*1024**2:0));
  output=await createSegmentedBytes(bytes,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal,owner:'ela.bitrate',label:'normalized-RGB8'});planning();planning=null;
  let at=performance.now(),blocks=0;histogramOwner=await elabitrateSourceHistogram(image,{budget,signal,imageId,onProgress:f=>onProgress?.({...f,total:f.total*2})});const cached=histogramOwner.cached,sourceReads=histogramOwner.sourceReads;
  stageMs.histogram=performance.now()-at;const normalized=elabitrateNormalize(histogramOwner.histogram,params);histogramOwner.release();histogramOwner=null;renderer=createElabitrateRenderer(budget,backend);at=performance.now();
  for(let y=0;y<height;y+=rows){await cooperate();const count=Math.min(rows,height-y),window=await image.surface.readWindow({x:0,y,width,height:count},{signal});let rendered,bandFailed=false,bandPrimary;
   try{rendered=await renderer.render(window.pixels,normalized.lut,{signal});await output.write(rendered.data,y*width*3);checkAbort(signal);blocks++;}catch(error){bandFailed=true;bandPrimary=error;throw error;}finally{await retireCompositeOwners([()=>rendered?.release(),()=>window.release()],bandFailed?{primary:bandPrimary}:{});}onProgress?.({phase:'elabitrate-lookup',completed:height+y+count,total:height*2});}
  await output.flush();checkAbort(signal);stageMs.lookupAndWrite=performance.now()-at;output.markCold();surface=createRgbSurface(output,{width,height,budget});const metrics={...renderer.metrics(),stageMs,blocks,rowsPerBlock:rows,storage:output.storage,retainedResultBytes:bytes,totalKernelMs:performance.now()-started};
  return{surface,data:normalized.data,semantics:ELABITRATE_SEMANTICS,metrics:{...metrics,histogramCached:cached,histogramSourceReads:sourceReads}};
 }catch(error){failed=true;primary=normalizeResourceError(error);throw primary;}
 finally{try{await retireCompositeOwners([()=>renderer?.dispose(),...(failed?[()=>surface?surface.dispose():output?.dispose()]:[]),()=>histogramOwner?.release(),()=>planning?.(),()=>metadata?.()],failed?{primary}:{});}catch(cleanup){if(!failed)await retireCompositeOwners([()=>surface?surface.dispose():output?.dispose()],{primary:cleanup});throw cleanup;}}
}
