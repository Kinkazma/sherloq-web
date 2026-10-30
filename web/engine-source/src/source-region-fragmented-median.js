import {attachMedianCleanup} from './median-gpu-retirement.js';
import {createMedianGpuRunner} from './median-gpu-runner.js';
import {medianParams} from './median.js';
import {segmentedMedian} from './segmented-median.js';
import {MEDIAN_HEAP_LIMIT,medianHeapBytes} from './median-features.js';
import {retainResult} from './retained-result.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort,createCooperator,normalizeResourceError,EngineError} from './errors.js';

const CHUNK=8192;

// A context is an actual admitted RGB rectangle, never a hole-filled atlas.
// The downstream reader still applies the native64x64 block padding itself.
function nativeContextImage(view,rect,original,budget,sourceRead){
 return {get session(){return original.session;},ensureTemporarySession:original.ensureTemporarySession,surface:{descriptor:{width:rect.width,height:rect.height,format:'rgb8'},async readWindow(part,{signal}={}){
  requireValue(part&&[part.x,part.y,part.width,part.height].every(Number.isSafeInteger)&&part.x>=0&&part.y>=0&&part.width>0&&part.height>0&&part.x+part.width<=rect.width&&part.y+part.height<=rect.height,'Median context reader exceeds its exact admitted rectangle.');
  checkAbort(signal);const release=budget.reserve(part.width*part.height*3);let completed=false;
  try{
   const data=new Uint8Array(part.width*part.height*3);
   for(let y=0;y<part.height;y++)for(let x=0;x<part.width;x+=CHUNK){
    const width=Math.min(CHUNK,part.width-x),window=await view.readWindow({x:rect.x+part.x+x,y:rect.y+part.y+y,width,height:1},{signal});
    try{data.set(window.pixels.data,(y*part.width+x)*3);sourceRead();}finally{window.release();}
   }
   checkAbort(signal);let closed=false;completed=true;
   return{pixels:{width:part.width,height:part.height,format:'rgb8',data},release(){if(closed)return;closed=true;release();}};
  }finally{if(!completed)release();}
 }}};
}

export async function sourceRegionMedian({task,original,view,domain,budget,signal,onProgress,publishResult,references=[],medianPool=null,cpuKernel='auto'}){
 const p=medianParams(task.params),reference=references[0];
 requireValue(reference?.id===p.modelId&&reference.kind==='median-model'&&/^[a-f0-9]{64}$/.test(reference.sha256??'')&&typeof reference.model?.predict==='function','A verified loaded median model reference is required.');
 if(!['auto','cpu','webgpu'].includes(task.backend??'auto'))throw new EngineError('UNSUPPORTED_BACKEND','Unsupported median feature backend.');
 const runner=createMedianGpuRunner({budget,backend:task.backend??'auto',signal});
 const width=domain.width,height=domain.height,cooperate=createCooperator(signal),owned=new Set(),dataLeases=[],rgbRecords={},maskRecords={},fragments=[],metadataLeases=[];
 const make=async bytes=>{const store=await createSegmentedBytes(bytes,{budget,signal,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession});owned.add(store);return store;};
 let heap,staging,record,heldData=0,dataOwner=false,published=false,failed=false,failure,sourceReads=0,analysed=0,cachedContexts=0,workers=0,gpuContexts=0;
 try{
  // The outer runtime already owns any warm main heap. Keep cold admission
  // alive across all contexts, and tell each inner run it is counted once.
  heap=budget.reserve(Math.max(0,MEDIAN_HEAP_LIMIT-medianHeapBytes()));staging=budget.reserve(CHUNK*32+65536);
  const output=await make(width*height*3),scope=await make(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x+=CHUNK){
   await cooperate();const count=Math.min(CHUNK,width-x),window=await original.surface.readWindow({x:domain.origin[0]+x,y:domain.origin[1]+y,width:count,height:1},{signal});
   try{await output.write(window.pixels.data,(y*width+x)*3);}finally{window.release();}
  }
  for(const rect of view.admittedRectangles()){
   await cooperate();const index=fragments.length,bounds=[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height];metadataLeases.push(budget.reserve(4096+sourceRegionTransportBytes(rect)*4));
   const image=nativeContextImage(view,rect,original,budget,()=>{sourceReads++;}),cacheKey=task.imageId+'\0source-region/median-native-context-v1/'+domain.fingerprint+'/'+bounds.join('/')+'/'+reference.id+'/'+reference.sha256;
   record=await segmentedMedian(image,p,{budget,model:reference.model,medianPool:cpuKernel==='auto'?medianPool:null,cpuKernel,signal,accountedHeapBytes:MEDIAN_HEAP_LIMIT,featureRunner:runner,backend:task.backend??'auto',cacheKey,dependencies:[task.imageId,reference.id],onProgress:f=>onProgress?.({phase:'source-region-median-context',sourceFragment:index,fragmentBounds:bounds,completed:analysed,total:domain.countIncluded,contextFraction:f})});
   checkAbort(signal);if(record.metrics.backend?.startsWith('webgpu'))gpuContexts++;cachedContexts+=+!!record.metrics.analysisCacheHit;workers=Math.max(workers,record.metrics.workers??0);
   const master=retainResult(record.surface);owned.add(master);const compact=master.lease(),dataLease=master.lease();owned.add(compact);owned.add(dataLease);dataLeases.push(dataLease);rgbRecords['fragment_'+index]={surface:compact};record.surface=null;await master.dispose();owned.delete(master);
   for(const name of ['valid','decisions']){const mask=record.maskRecords[name].surface;owned.add(mask);maskRecords[name+'_'+index]={surface:mask};}
   for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x+=CHUNK){
    await cooperate();const count=Math.min(CHUNK,rect.width-x),window=await compact.readWindow({x,y,width:count,height:1},{signal});
    try{await output.write(window.pixels.data,((rect.y+y)*width+rect.x+x)*3);await scope.write(new Uint8Array(count).fill(1),(rect.y+y)*width+rect.x+x);}finally{window.release();}
   }
   fragments.push({id:'fragment_'+index,bounds,originalBounds:bounds.map((n,i)=>n+domain.origin[i%2]),status:'analysed',native:record.data,nativeMasks:record.masks,analysisCacheHit:!!record.metrics.analysisCacheHit,blockPhase:'local-to-complete-native-context'});
   analysed+=rect.width*rect.height;record=null;onProgress?.({phase:'source-region-median-fragment',sourceFragment:index,completed:analysed,total:domain.countIncluded});
  }
  requireValue(analysed===domain.countIncluded,'Native median contexts must cover every admitted observation.');await output.flush();await scope.flush();checkAbort(signal);
  const model={id:reference.id,sourceSha256:reference.sha256,features:reference.model.metadata.features},data={width,height,model,fragments,sourceRegionFingerprint:domain.fingerprint,gridCoordinates:'independent-native64x64-block-grids'};
  const metadata={...data,fragments:fragments.map(({native,nativeMasks,...rest})=>({...rest,native:{...native,probabilities:null,variances:null,margins:null,filtered:null},nativeMasks:Object.fromEntries(Object.entries(nativeMasks).map(([key,value])=>[key,{...value,data:null}]))}))};
  const metadataBytes=4096+sourceRegionTransportBytes(metadata,{allowUndefined:true,allowAliases:true})*2;budget.retain(metadataBytes);heldData=metadataBytes;
  const inner=createRgbSurface(output,{width,height,budget});let closed=false;
  const surface={...inner,async dispose(){if(closed)return;closed=true;const results=await Promise.allSettled([inner.dispose(),...dataLeases.map(lease=>lease.dispose())]);budget.retained-=metadataBytes;const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;}};
  dataOwner=true;owned.delete(output);owned.add(surface);
  const selection=createMaskSurface(scope,{width,height,budget,range:[0,1],semantics:'1=its exact admitted native context was processed;0=excluded Original presentation. Native block decisions remain separate and are not a pixel mask.'});owned.delete(scope);owned.add(selection);maskRecords.analysis_scope={surface:selection};
  const semantics='Each exact admitted RGB rectangle uses the unchanged native64x64 median-filter features, historical padding and extra score-grid border, explicitly loaded XGBoost model, variance/threshold/speckle and native display interpolation. Every admitted pixel receives its native context display. Grids and masks keep their independent native coordinates; they are not a global hole-filled model input, pixel segmentation or calibrated forgery probability.';
  await runner.dispose();const backend=gpuContexts?'webgpu-exact-binary64-median-features-native-finish':'cpu';
  const metrics={backend,gpuContexts,...runner.snapshot(),selectedPixels:domain.countIncluded,analysedPixels:analysed,unanalysablePixels:0,fragmentCount:fragments.length,sourceReads,cachedContexts,analysisCacheHit:cachedContexts===fragments.length,workers,sourceRegionPolicy:'exact-native-median-model-contexts'};
  const bundle=publishResult(task.imageId,{surface,rgbRecords,maskRecords,data,semantics,metrics});published=true;heldData=0;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,data,semantics,metrics,layers:[{id:task.operation,kind:'rgb',surfaceId:bundle.surface.id,origin:[0,0],coordinates:'source'},...fragments.map(f=>({id:f.id,kind:'rgb',surfaceId:bundle.rgbSurfaces[f.id].id,origin:f.bounds.slice(0,2),coordinates:'independent-native-context'}))],provenance:{params:p,backend,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],references:[{id:reference.id,kind:'median-model',originalSha256:reference.sha256}],excludedParticipation:'absent-before-native64x64-features-model-and-grid-render',originalEncodedBytesPreserved:true,nativePadding:'unchanged64x64-block-padding-and-extra-score-grid-border'}};
 }catch(error){failed=true;failure=normalizeResourceError(error);throw failure;}
 finally{
  const errors=[];try{await runner.dispose();}catch(error){errors.push(error);}
  if(record?.surface)try{await record.surface.dispose();}catch(error){errors.push(error);}
  if(record?.maskRecords)for(const value of Object.values(record.maskRecords))try{await value.surface.dispose();}catch(error){errors.push(error);}
  if(!published)for(const owner of owned)try{await owner.dispose();}catch(error){errors.push(error);}
  if(heldData&&!dataOwner)budget.retained-=heldData;for(const release of metadataLeases)release();staging?.();heap?.();
  if(errors.length){if(failed){for(const cleanup of errors)attachMedianCleanup(failure,cleanup);}else throw errors[0];}
 }
}
