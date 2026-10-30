import "../../runtime-context.js?v=0.30.0";
import {createDenseTracePrefixCache} from './dense-trace-prefix-cache.js';
import {acknowledgeDenseRetirement,onceDenseRetirement,retireDenseOwners,cleanupDenseOwners} from './dense-owner-retirement.js';
import {createDenseScopedWindowProduct,DENSE_SCOPED_RECIPE} from './dense-scoped-window-product.js';
import {payloadBytes} from './pixel-operations.js';
import {DenseCopyEngine} from './dense-copy.js';
import {denseImageParams} from './dense-image.js';
import {DENSE_PROFILES} from './dense-profiles.js';
import {pairedBiomes} from './copy-biomes.js';
import {biomeSides,verifyCopyGeometry,createGeometryKernel} from './copy-geometry.js';
import {copyPalette} from './copy-subbiomes.js';
import {createSparseSurface} from './m3-sparse-surface.js';
import {sparseCopyViewParams} from './sparse-copy-view.js';
import {requireValue,checkAbort} from './errors.js';
const geometry={pairedBiomes,biomeSides,verifyCopyGeometry,createGeometryKernel,copyPalette};
export const DENSE_OPERATION='tampering.copyMove.dense';
export const denseCapability=()=>({id:DENSE_OPERATION,status:'available',backends:['cpu','auto','webgpu'],algorithms:[...DENSE_PROFILES],regions:['full-frame','independent','compare'],exports:['json','png','npz'],coordinates:'original-pixel-centres'});
export function denseCopyParams(input={}){
 const {model='Similarity',tolerance=50,geometricThreshold=3,geometricMinimum=6,...rest}=input;
 requireValue(['None','Similarity','Affine','Homography'].includes(model)&&Number.isFinite(tolerance)&&tolerance>=0&&Number.isFinite(geometricThreshold)&&geometricThreshold>0&&Number.isInteger(geometricMinimum)&&geometricMinimum>=4,'Invalid dense geometry options.');
 const p=denseImageParams({...rest,coherence:model!=='None',errorThreshold:geometricThreshold,minimumComponent:geometricMinimum});
 const {coherence,errorThreshold,minimumComponent,...params}=p;
 return {...params,model,tolerance,geometricThreshold,geometricMinimum};
}
// Exact compact evidence check at the retained-render boundary. This compares
// worker-owned native values; it never reconstructs missing Dense fields.
function sameRetainedValue(a,b){
 if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){if(a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);for(let i=0,n=x.length;i<n;i++)if(x[i]!==y[i])return false;return true;}
 if(Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&sameRetainedValue(a[key],b[key]));
}
function densePublicEvidence(raw){
 const {release,dense_maps,dense_windows,metrics,...small}=raw;
 const fields=dense_windows?dense_windows.flatMap(w=>w.raw.dense_maps.map(({width,height,shift,pass,context})=>({width,height,shift,pass,context,analysisWindow:{id:w.id,origin:w.origin,fingerprint:w.fingerprint}}))):dense_maps.map(({width,height,shift,pass,context})=>({width,height,shift,pass,context}));
 return {small,fields};
}
function assertRetainedData(expected,raw,params){
 const {small,fields}=densePublicEvidence(raw),{metadata:nativeMetadata,...native}=small,{metadata,...received}=expected??{};
 requireValue(metadata?.method==='dense'&&metadata.profile===params.profile&&metadata.fieldStorage==='worker-owned; full fields in NPZ'&&typeof metadata.result_reused==='boolean','Retained Dense metadata differs from its native archive.');
 requireValue(sameRetainedValue(received,{...native,params,dense_fields:fields}),'Retained Dense tables differ from their native archive.');
 if(nativeMetadata)requireValue(metadata.denseWindowRecipe===DENSE_SCOPED_RECIPE&&sameRetainedValue(metadata.cloneAnalysisWindows,nativeMetadata.cloneAnalysisWindows)&&sameRetainedValue(metadata.denseNativeWindows,nativeMetadata.denseNativeWindows),'Retained scoped Dense geometry differs from its native archive.');
}
const elapsedMetric=value=>Number.isFinite(value)&&value>=0?value:null;
// Existing selection timings are elapsed subintervals, not additional work.
// Project numbers only; missing/invalid observations must never become zero.
function retainedPresentationTiming(phases,trace){
 const timing=trace?.timing;
 return {schema:'retained-dense-phase-timing/1',clock:'performance.now-elapsed',...phases,traceSelection:{geometryMs:elapsedMetric(timing?.geometryMs),paletteMs:elapsedMetric(timing?.paletteMs),selectionAndCommandsMs:elapsedMetric(timing?.selectionAndCommandsMs),totalMs:elapsedMetric(timing?.totalMs)},...(trace?.prefixReuse?{prefixReuse:{schema:trace.prefixReuse.schema,reused:trace.prefixReuse.reused===true,counterSemantics:trace.prefixReuse.counterSemantics,currentWork:{comparisons:elapsedMetric(trace.prefixReuse.currentWork?.comparisons),cellsVisited:elapsedMetric(trace.prefixReuse.currentWork?.cellsVisited)},reusedWork:{comparisons:elapsedMetric(trace.prefixReuse.reusedWork?.comparisons),cellsVisited:elapsedMetric(trace.prefixReuse.reusedWork?.cellsVisited)},preparationTiming:{geometryMs:elapsedMetric(trace.prefixReuse.preparationTiming?.geometryMs),paletteMs:elapsedMetric(trace.prefixReuse.preparationTiming?.paletteMs),totalMs:elapsedMetric(trace.prefixReuse.preparationTiming?.totalMs)}}}:{})};
}
// Full fields stay in the worker. A published surface borrows them for scientific
// export; the source cache holds one additional reference for view-only redraws.
export function createDenseAdapter({budget,profile,version,publishResult,create=(image,budget,options)=>new DenseCopyEngine(image,budget,options),render=createSparseSurface,scopedCreate=createDenseScopedWindowProduct,releasePublished}){
 const records=new Map();
 function privateSurfaceOwner(r){
  const free=budget.reserve(4096),holder={native:null,renderOwner:null,surfaceDispose:null,surfaceId:null,renderComplete:Promise.resolve()};
  const dropNative=onceDenseRetirement(()=>holder.native?.release());holder.release=onceDenseRetirement(async()=>{await holder.renderComplete;await acknowledgeDenseRetirement(()=>holder.renderOwner?holder.renderOwner.dispose():holder.surfaceDispose?.());await dropNative();holder.native=holder.renderOwner=holder.surfaceDispose=null;r.pending.delete(holder);if(holder.surfaceId)r.published.delete(holder.surfaceId);if(r.retireAfterPublished&&!r.clearInProgress&&!r.published.size)await clearImage(r.imageId);free();});r.pending.add(holder);return holder;
 }
 async function clearImage(id,{preservePublished=false}={}){
  const selected=[...records].filter(([key])=>id===undefined||id===key);
  for(const [key,r]of selected){
   // Method changes cannot retire a frame still owned by their UI caller.
   // Its last public surface ACK completes the deferred cache retirement.
   if(preservePublished&&r.scoped&&r.published.size){r.retireAfterPublished=true;continue;}
   r.retiring=true;r.clearInProgress=true;
   try{
    if(r.scoped){
     await retireDenseOwners([...r.pending].map(holder=>holder.release));
     if(r.published.size)requireValue(typeof releasePublished==='function','Scoped Dense public results require their actual parent retirement callback.');
     for(const surfaceId of [...r.published])await acknowledgeDenseRetirement(()=>releasePublished(surfaceId));
    }
    await acknowledgeDenseRetirement(()=>r.cached?.releaseCache());
    await acknowledgeDenseRetirement(()=>r.engine.dispose());
    records.delete(key);r.retireAfterPublished=false;
   }finally{r.clearInProgress=false;}
  }
 }

 async function present(task,image,{signal,onProgress,knownHeapBytes=0,expectedData}={},retainedOnly=false){
  const p=denseCopyParams(task.params),view=sparseCopyViewParams(task.view),backend=task.backend??'auto';const scope=task.scientificScope,scoped=scope!==undefined,mode=task.cloneWindowMode??'independent';if(scoped)requireValue(scope?.status==='ready'&&/^[a-f0-9]{64}$/.test(scope.fingerprint??'')&&['independent','global'].includes(mode),'Certified Dense scope and mode required; no whole fallback.');
  requireValue(['cpu','auto','webgpu'].includes(backend),'Invalid dense backend.');requireValue(!task.regions?.length,'Dense polygons belong in params.regions.');checkAbort(signal);
  let r=records.get(task.imageId);requireValue(!r?.retiring,'Dense image owner is retiring.');if(retainedOnly)requireValue(r?.cached&&r.image===image&&r.scoped===scoped,'Retained Dense native archive is unavailable.');if(r&&r.scoped!==scoped){await clearImage(task.imageId);r=null;}if(!r){r={imageId:task.imageId,retireAfterPublished:false,engine:scoped?scopedCreate(image,budget,{profile,geometry}):create(image.segmented?image:image.pixels,budget,{profile,geometry}),cached:null,image,scoped,published:new Set(),pending:scoped?new Set():null};records.set(task.imageId,r);}r.retireAfterPublished=false;
  const identity=JSON.stringify(scoped?[DENSE_SCOPED_RECIPE,p,backend,mode,scope.fingerprint,scope,image.sha256,image.sourceRegionDomain?.fingerprint??null,image.sourceRegionOrigin??[0,0]]:[p,backend]),started=performance.now(),phases=retainedOnly?{}:null;let owned,surfaceRecord,privateOwner,published=false,lease,outputLease,failed=false,primary;
  try{
   lease=budget.reserve(knownHeapBytes);
   const reused=r.cached?.identity===identity;
   if(retainedOnly){const at=performance.now();requireValue(reused&&!r.cached.retiring,'Retained Dense scientific key, backend or owner changed.');assertRetainedData(expectedData,r.cached.value,p);phases.validationMs=performance.now()-at;}
   if(!reused){const old=r.cached;await acknowledgeDenseRetirement(()=>old?.releaseCache());r.cached=null;const value=await r.engine.analyze(p,{signal,onProgress,backend,checkpointKey:'clone-panel:'+task.imageId,...(scoped?{sourceRegionTask:{...task,params:p,cloneWindowMode:mode}}:{})});let refs=1,pending,cacheRetirement,retiring=false;const tracePrefixCache=createDenseTracePrefixCache({result:value,budget}),dropArchive=onceDenseRetirement(()=>value.release());r.cached={identity,value,tracePrefixCache,get retiring(){return retiring;},releaseCache(){cacheRetirement??=onceDenseRetirement(()=>this.release());return cacheRetirement();},retain(){requireValue(refs>0&&!retiring,'Dense native cache has retired or is retiring.');refs++;},async release(){if(refs>1){refs--;return;}if(refs===0)return;if(pending)return pending;retiring=true;pending=Promise.resolve().then(async()=>{await tracePrefixCache.retire();await dropArchive();await tracePrefixCache.dispose();refs=0;});pending.catch(()=>{pending=null;});return pending;}};}

   const renderingAt=retainedOnly?performance.now():0;
   let raw;if(scoped){privateOwner=privateSurfaceOwner(r);const native=r.cached;native.retain();privateOwner.native=native;raw=native.value;let finish;privateOwner.renderComplete=new Promise(resolve=>finish=resolve);try{surfaceRecord=await render(image,raw,view,{budget,signal,tracePrefixCache:native.tracePrefixCache.forView(view),onOwner:owner=>{requireValue(owner&&typeof owner.dispose==='function'&&!privateOwner.renderOwner,'Scoped Dense renderer must publish one construction owner.');privateOwner.renderOwner=owner;}});privateOwner.surfaceDispose=surfaceRecord.surface.dispose.bind(surfaceRecord.surface);privateOwner.surfaceId=surfaceRecord.surface.descriptor.id;}finally{finish();}}else{owned=r.cached;owned.retain();raw=owned.value;surfaceRecord=await render(image,raw,view,{budget,signal,tracePrefixCache:owned.tracePrefixCache.forView(view)});}checkAbort(signal);
   if(retainedOnly)phases.surfaceMs=performance.now()-renderingAt;
   const projectionAt=retainedOnly?performance.now():0;
   const {small,fields}=densePublicEvidence(raw),metrics=raw.metrics;
   // The public worker transfers all returned typed arrays. Copy only the compact
   // evidence so transport cannot detach the worker-owned archive/cache arrays.
   outputLease=budget.reserve(payloadBytes(small));const data=structuredClone(small);
   
   const provenance={engine:version,operation:DENSE_OPERATION,params:p,backendRequested:backend,backend:data.backend??'see field metrics',originalSha256:image.sha256,decode:structuredClone(image.provenance),native:'core/cloning2.py',coordinates:'original-pixel-centres',...(scoped?{cloneWindowMode:mode,denseWindowRecipe:DENSE_SCOPED_RECIPE,scientificScopeFingerprint:scope.fingerprint}:{})};
   surfaceRecord.provenance=provenance;surfaceRecord.denseAnalysis={raw,params:p,backend,style:surfaceRecord.style,visible:surfaceRecord.visible};
   const surface=surfaceRecord.surface,dispose=surface.dispose.bind(surface),hold=owned;owned=null;
   const dropSurface=onceDenseRetirement(dispose);surface.dispose=scoped?privateOwner.release:onceDenseRetirement(async()=>{await dropSurface();await hold.release();});
   if(retainedOnly)phases.publicProjectionMs=performance.now()-projectionAt;
   const output={id:task.id,imageId:task.imageId,operation:DENSE_OPERATION,...(scoped?{cloneWindowMode:mode}:{}),status:'ok',layout:'surface',data:{...data,params:p,dense_fields:fields,metadata:{...data.metadata,method:'dense',profile:p.profile,fieldStorage:'worker-owned; full fields in NPZ',result_reused:reused,presentation:{traceSelection:surfaceRecord.traceSelection}}},surface:surface.descriptor,style:surfaceRecord.style,visible:surfaceRecord.visible,legend:surfaceRecord.legend,provenance,metrics:{...metrics,totalMs:performance.now()-started,cache:{...metrics?.cache,result:reused},preflightExecutions:0,...(retainedOnly?{nativeAnalysisCalls:0,inferenceCalls:0,retainedNativeTables:true,retainedPresentationTiming:retainedPresentationTiming(phases,surfaceRecord.traceSelection)}:{}),memory:budget.snapshot()}};
   // Check before registration, so a throwing progress consumer cannot orphan it.
   onProgress?.({id:task.id,phase:'complete',fraction:1});checkAbort(signal);publishResult(task.imageId,surfaceRecord);if(scoped){r.published.add(surface.descriptor.id);r.pending.delete(privateOwner);}published=true;return output;
  }catch(error){failed=true;primary=error;throw error;}finally{try{if(!published){if(scoped&&privateOwner)await cleanupDenseOwners(()=>privateOwner.release(),{failed,primary});else if(surfaceRecord)await surfaceRecord.surface.dispose();}}finally{await owned?.release();outputLease?.();lease?.();}}
 }
 return{clearImage,dispose:()=>clearImage(),run:(task,image,hooks)=>present(task,image,hooks),renderRetained:(task,image,hooks)=>present(task,image,hooks,true)};
}
