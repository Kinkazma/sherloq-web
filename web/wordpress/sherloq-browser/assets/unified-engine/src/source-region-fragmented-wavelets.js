import "../../runtime-context.js?v=0.25.0";
import {waveletParams} from './wavelets.js';
import {segmentedWavelet} from './segmented-wavelet.js';
import {waveletStreamHeapBytes} from './wavelet-stream-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort,createCooperator,normalizeResourceError} from './errors.js';

// A nonrectangular scientific domain has no unique symmetric wavelet axis.
// Its exact geometry rectangles are independent native contexts. These are
// never storage tiles: a completely admitted rectangle remains one context.
export async function sourceRegionWavelets({task,original,derived,view,domain,budget,signal,onProgress,publishResult,releaseResult,profile={}}){
 const p=waveletParams(task.params),width=domain.width,height=domain.height,identity=JSON.stringify([domain.sourceSha256,domain.fingerprint,p.wavelet]),knownHeapBytes=waveletStreamHeapBytes(),cooperate=createCooperator(signal),previous=derived.waveletCache,cached=!previous?.disposed&&previous?.sourceRegionIdentity===identity?previous:null,make=bytes=>createSegmentedBytes(bytes,{budget,signal,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession});
 const entries=new Map(),fragments=[],metadataReleases=[],heapReleases=[];let heldExtraHeap=0;const protectHeap=()=>{const current=Math.max(8*1024**2,waveletStreamHeapBytes()),needed=Math.max(0,current-knownHeapBytes);if(needed>heldExtraHeap){heapReleases.push(budget.reserve(needed-heldExtraHeap));heldExtraHeap=needed;}return current;};let cacheBytes=0,output,scope,surface,scopeSurface,record,staging,metadataBytes=0,heldMetadata=false,published=false,committed=false,failure,sourceReads=0;
 const next={wavelet:p.wavelet,sourceRegionIdentity:identity,entries,disposed:false,async dispose(){if(this.disposed)return;this.disposed=true;const settled=await Promise.allSettled([...entries.values()].map(v=>v.dispose()));budget.retained-=cacheBytes;cacheBytes=0;entries.clear();const bad=settled.find(v=>v.status==='rejected');if(bad)throw bad.reason;}};
 try{
  protectHeap();staging=budget.reserve(32768*16+65536);output=await make(width*height*3);scope=await make(width*height);
  // Original RGB is presentation only. No excluded sample is supplied to any
  // decomposition, threshold, reconstruction or coefficient reduction.
  for(let y=0;y<height;y++)for(let x=0;x<width;x+=32768){await cooperate();const w=Math.min(32768,width-x),part=await original.surface.readWindow({x:domain.origin[0]+x,y:domain.origin[1]+y,width:w,height:1},{signal});try{await output.write(part.pixels.data,(y*width+x)*3);}finally{part.release();}}
  let index=0,included=0,hits=0;
  for(const rect of view.admittedRectangles()){
   await cooperate();const key=[rect.x,rect.y,rect.width,rect.height].join('/'),old=cached?.entries.get(key),image={surface:{descriptor:{width:rect.width,height:rect.height,format:'rgb8'},async readWindow(r={x:0,y:0,width:rect.width,height:rect.height},hooks={}){requireValue([r.x,r.y,r.width,r.height].every(Number.isSafeInteger)&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=rect.width&&r.y+r.height<=rect.height,'Native wavelet window exceeds its exact fragment.');sourceReads++;return view.readWindow({x:rect.x+r.x,y:rect.y+r.y,width:r.width,height:r.height},hooks);}},session:original.session,ensureTemporarySession:original.ensureTemporarySession};
   requireValue(!cached||old,'Native wavelet cache geometry differs from its verified domain.');const lease=budget.reserve(2048+sourceRegionTransportBytes(rect)*4);metadataReleases.push(lease);
   record=await segmentedWavelet(image,p,{budget,signal,profile,cache:old,accountedHeapBytes:protectHeap(),onProgress:e=>onProgress?.({...e,sourceFragment:index,fragmentBounds:[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height]})});protectHeap();checkAbort(signal);
   const ownCache=record.waveletCache;entries.set(key,ownCache);if(old)hits++;else{const bytes=2048+sourceRegionTransportBytes(rect)*4;budget.retain(bytes);cacheBytes+=bytes;}
   // Fragment caches borrowed from the preceding aggregate keep that owner
   // until commit. A failed replacement must not retire them.
   fragments.push({id:'native-fragment-'+index,bounds:[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height],originalBounds:[domain.origin[0]+rect.x,domain.origin[1]+rect.y,domain.origin[0]+rect.x+rect.width,domain.origin[1]+rect.y+rect.height],width:rect.width,height:rect.height,requestedLevel:p.level,effectiveLevel:record.data.effectiveLevel,maximumLevel:record.data.maximumLevel,wavelet:p.wavelet,coefficientsCached:!!old});
   for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x+=32768){await cooperate();const w=Math.min(32768,rect.width-x),part=await record.surface.readWindow({x,y,width:w,height:1},{signal});try{await output.write(part.pixels.data,((rect.y+y)*width+rect.x+x)*3);await scope.write(new Uint8Array(w).fill(1),(rect.y+y)*width+rect.x+x);}finally{part.release();}}
   await record.surface.dispose();record=null;included+=rect.width*rect.height;index++;onProgress?.({phase:'source-region-wavelet-fragment',completed:included,total:domain.countIncluded,sourceFragment:index});
  }
  requireValue(included===domain.countIncluded&&fragments.length>0,'Native wavelet fragments must cover every admitted observation exactly.');await output.flush();await scope.flush();checkAbort(signal);
  const data={width,height,wavelet:p.wavelet,requestedLevel:p.level,fragments,sourceRegionFingerprint:domain.fingerprint,contextPolicy:'independent exact admitted geometry rectangles; native symmetric axes and native effective level within each context'},semantics='Every admitted rectangle runs the unchanged native float64 symmetric wavelet decomposition and threshold/reconstruction. Nonrectangular domains have independent native contexts, not one reconstructed global transform. Requested settings are retained; each native effective level and maximum are explicit. Excluded Original pixels are presentation only.',metrics={sourceRegionPolicy:'native-independent-wavelet-contexts',fragmentCount:fragments.length,selectedPixels:domain.countIncluded,analysedPixels:included,unanalysablePixels:0,sourceReads,coefficientsCached:hits===fragments.length,cachedFragments:hits};
  metadataBytes=sourceRegionTransportBytes(data)*4+4096;budget.retain(metadataBytes);heldMetadata=true;const inner=createRgbSurface(output,{width,height,budget});let disposed=false;surface={...inner,async dispose(){if(disposed)return;disposed=true;try{await inner.dispose();}finally{budget.retained-=metadataBytes;}}};scopeSurface=createMaskSurface(scope,{width,height,budget,range:[0,1],semantics:'1=processed by its exact native wavelet context;0=excluded Original presentation.'});
  requireValue(!previous||cached||typeof releaseResult==='function','Replacing a native wavelet cache requires published-result retirement.');
  const bundle=publishResult(task.imageId,{surface,maskRecords:{analysis_scope:{surface:scopeSurface}},data,semantics,metrics});published=true;heldMetadata=false;
  derived.waveletCache=cached??next;committed=true;
  if(!cached&&previous)try{await previous.dispose();}catch(error){
   // The new result has committed. Never point back to a partially retired
   // coefficient cache, and never leave an unpublished caller owning handles.
   derived.waveletCache=null;committed=false;const rollbackErrors=[],ids=new Set([bundle.surface?.id,...['rgbSurfaces','planeSurfaces','maskSurfaces','flagSurfaces','tables'].flatMap(group=>Object.values(bundle[group]??{}).map(v=>v.id))].filter(Boolean));
   for(const id of ids)try{await releaseResult(id);}catch(e){rollbackErrors.push(normalizeResourceError(e));}
   if(rollbackErrors.length)error.details={...error.details,rollbackErrors:rollbackErrors.map(({code,message})=>({code,message}))};throw error;
  }
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,data,semantics,metrics,provenance:{params:p,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],nativeContexts:fragments.map(({bounds,originalBounds,requestedLevel,effectiveLevel,maximumLevel})=>({bounds,originalBounds,requestedLevel,effectiveLevel,maximumLevel})),excludedParticipation:'absent-before-every-native-wavelet-axis-and-reduction',presentationOutsideAnalysedSupport:'original-unanalysed',originalEncodedBytesPreserved:true}};
 }catch(error){failure=normalizeResourceError(error);throw failure;}
 finally{
  staging?.();for(const free of metadataReleases)free();for(const free of heapReleases)free();const errors=[];
  const recordCacheTracked=record&&[...entries.values()].includes(record.waveletCache),recordCacheBorrowed=record&&[...(cached?.entries.values()??[])].includes(record.waveletCache);
  if(!committed){for(const[key,value]of entries)if(cached?.entries.get(key)===value)entries.delete(key);try{await next.dispose();}catch(e){errors.push(normalizeResourceError(e));}if(derived.waveletCache?.disposed)derived.waveletCache=null;}
  if(record)for(const owner of[record.surface,...(!recordCacheTracked&&!recordCacheBorrowed?[record.waveletCache]:[])])try{await owner?.dispose();}catch(e){errors.push(normalizeResourceError(e));}
  if(!published)for(const owner of[surface??output,scopeSurface??scope])try{await owner?.dispose();}catch(e){errors.push(normalizeResourceError(e));}if(heldMetadata&&!surface)budget.retained-=metadataBytes;
  if(errors.length){if(failure)failure.details={...failure.details,cleanupErrors:errors.map(({code,message})=>({code,message}))};else throw errors[0];}
 }
}
