import "../../runtime-context.js?v=0.25.0";
import {createSegmentedZeroAnalysis,segmentedZeroResult} from './segmented-zero.js';
import {zeroParams} from './zero.js';
import {ZERO_PALETTE} from './zero-palette.js';
import {createSourceRegionJpegContextImage} from './source-region-ela.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {planZeroNativeContexts,createZeroRetirement,ZERO_CONTEXT_PLAN_VERSION} from './zero-native-context-plan.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
const MASKS=['mask_f','mask_f_reg','mask_m','mask_m_reg'],WINDOW=8192;
const semantics='Unchanged native ZERO in each canonical entirely admitted RGB context. Each complete context retains its own votes, global grid significance, JPEG99 and native borders. The composed RGB/masks select a spatial owner fixed before analysis; NFA populations are never combined. Excluded Original pixels are presentation only.';
export function nativeZeroContextAdmission(rect){const dimensions=rect.width>=16&&rect.height>=16,jpeg=rect.width<=65500&&rect.height<=65500,integer=Number.isSafeInteger(rect.width*rect.height)&&rect.width*rect.height<2**31;return{evaluable:dimensions&&jpeg&&integer,reason:!dimensions?'native-16x16-minimum':!jpeg?'native-jpeg-dimensions':!integer?'native-zero-integer-domain':null,nativeDimensions:[rect.width,rect.height],nativeMinimum:'16x16 native RGB context'};}
async function cacheFor(derived,view,domain,budget,signal){
 let old=derived.zeroAnalysis;
 const identity=JSON.stringify([ZERO_CONTEXT_PLAN_VERSION,domain.sourceSha256,domain.fingerprint]);
 if(old){requireValue(old.sourceRegionZero,'The native ZERO cache belongs to another pipeline.');if(old.identity===identity&&!old.closed&&!old.failed&&!old.owner.state.closing){await old.ready;return old;}await old.dispose();if(derived.zeroAnalysis===old)derived.zeroAnalysis=null;}
 const owner=createZeroRetirement(),cache={sourceRegionZero:true,identity,owner,entries:new Map(),results:new Set(),plan:null,failed:false,get closed(){return owner.state.closed;},dispose:()=>owner.dispose()};
 // Parent capture precedes the first await, including a failing plan/constructor.
 derived.zeroAnalysis=cache;
 cache.ready=owner.waitUntil(Promise.resolve().then(async()=>{
  try{const joined=signal?AbortSignal.any([signal,owner.signal]):owner.signal;cache.plan=await planZeroNativeContexts(view,{budget,signal:joined,onOwner:planOwner=>owner.add(()=>planOwner.dispose(),2)});return cache;}
  catch(error){cache.failed=true;throw error;}
 }));
 await cache.ready;return cache;
}
function originalRegions(regions,context,domain){return regions.map(r=>({...r,x0:r.x0+context.x+domain.origin[0],x1:r.x1+context.x+domain.origin[0],y0:r.y0+context.y+domain.origin[1],y1:r.y1+context.y+domain.origin[1],sourceFragment:context.id,gridCoordinateSpace:'native-context'}));}
async function nativeEntry(cache,context,p,{view,original,budget,signal,onProgress,profile,cpuKernel}){
 const key=Number(p.missing)+'/'+context.id,prior=cache.entries.get(key);if(prior){await prior.ready;return{entry:prior,cached:true};}
 const entry={image:createSourceRegionJpegContextImage(view,context,original,budget),analysis:null,nativeOwner:null};cache.entries.set(key,entry);
 cache.owner.add(async()=>{if(entry.analysis)await entry.analysis.dispose();else await entry.nativeOwner?.dispose();await entry.image.rgbRecompression?.dispose();entry.image.rgbRecompression=null;},1);
 const joined=signal?AbortSignal.any([signal,cache.owner.signal]):cache.owner.signal;
 entry.ready=cache.owner.waitUntil(Promise.resolve().then(async()=>{
  try{entry.analysis=await createSegmentedZeroAnalysis(entry.image,p,{budget,signal:joined,maxWorkers:['single','reference'].includes(cpuKernel)?1:profile.maxWorkers??1,reference:cpuKernel==='reference',onOwner:value=>{entry.nativeOwner=value;},onProgress:e=>onProgress?.({...e,sourceFragment:context.id})});checkAbort(joined);await entry.image.rgbRecompression?.dispose();entry.image.rgbRecompression=null;return entry;}
  catch(error){cache.failed=true;throw error;}
 }));await entry.ready;return{entry,cached:false};
}
export async function sourceRegionZero({task,original,derived,view,domain,budget,signal,onProgress,publishResult,profile={},cpuKernel,version}){
 if(task.backend==='webgpu')throw new EngineError('SOURCE_SCOPE_BACKEND_UNSUPPORTED','Native ZERO has no qualified GPU source-domain adapter.');
 const p=zeroParams(task.params),cache=await cacheFor(derived,view,domain,budget,signal),plan=cache.plan,contexts=plan.contexts,records=[],byId=new Map(),surfaces=[];
 const nativeOwner=createZeroRetirement(),resultOwner=createZeroRetirement();let finish;resultOwner.waitUntil(new Promise(r=>finish=r));cache.owner.add(()=>resultOwner.dispose(),0);
 let references=1,retiring=false,published=false,failed=false,primary,evaluated=0,cachedContexts=0,nativeJobs=0,workers=0;
 const retain=()=>{requireValue(!retiring&&!resultOwner.state.closing,'The ZERO result is retiring.');references++;return lease();};
 const release=()=>{if(references)return Promise.resolve();retiring=true;return nativeOwner.dispose();};
 const lease=()=>{let requested=false;return()=>{if(!requested){requested=true;references--;}return release();};},rootRelease=lease();
 resultOwner.add(()=>{if(references)throw new EngineError('BUSY','ZERO scientific readers still own this result.');return nativeOwner.dispose();},1);
 const joined=signal?AbortSignal.any([signal,cache.owner.signal]):cache.owner.signal;
 function store(field,only){const channels=field==='rgb'?3:1,close=retain();let closing=false;return{byteLength:domain.width*domain.height*channels,storage:'canonical-independent-native-zero-contexts',dispose(){closing=true;return close();},async readInto(target,offset=0,{signal:readSignal}={}){
  requireValue(!closing&&Number.isSafeInteger(offset)&&offset>=0&&offset%channels===0&&target.length%channels===0&&offset+target.length<=this.byteLength,'Native ZERO composite window exceeds its exact grid.');checkAbort(readSignal);
  const free=budget.reserve(WINDOW*8);try{if(field!=='rgb')target.fill(0);let first=offset/channels,done=0;const n=target.length/channels;
   while(done<n){await controlCheckpoint(readSignal);const y=Math.floor(first/domain.width),x=first%domain.width,width=Math.min(WINDOW,domain.width-x,n-done);
    if(field==='rgb'){const rect={x:domain.origin[0]+x,y:domain.origin[1]+y,width,height:1},row=target.subarray(done*3,(done+width)*3);if(original.surface.readWindowInto)await original.surface.readWindowInto(rect,row,{signal:readSignal});else{const part=await original.surface.readWindow(rect,{signal:readSignal});try{row.set(part.pixels.data);}finally{await part.release();}}}
    if(field==='native_context_status')for(const r of plan.unsupportedRectangles)if(y>=r.y&&y<r.y+r.height){const l=Math.max(x,r.x),z=Math.min(x+width,r.x+r.width);if(z>l)target.fill(2,done+l-x,done+z-x);}
    for(const c of only?[only]:contexts){const owned=only?[c]:c.ownedRectangles;for(const r of owned){if(y<r.y||y>=r.y+r.height)continue;const left=Math.max(x,r.x),right=Math.min(x+width,r.x+r.width);if(right<=left)continue;const at=(done+left-x)*channels;
     if(field==='analysis_scope'||field==='native_context_status'){target.fill(1,at,at+right-left);continue;}
     const record=byId.get(c.id).record,child=field==='rgb'?record.surface:record.maskRecords[field].surface,rect={x:left-c.x,y:y-c.y,width:right-left,height:1},row=target.subarray(at,at+(right-left)*channels);
     if(child.readWindowInto)await child.readWindowInto(rect,row,{signal:readSignal});else{const part=await child.readWindow(rect,{signal:readSignal});try{row.set(part.pixels.data);}finally{await part.release();}}
    }}first+=width;done+=width;
   }
  }finally{free();}
 }};}
 function makeSurface(field,only){const owned=store(field,only);let surface;try{surface=field==='rgb'?createRgbSurface(owned,{width:domain.width,height:domain.height,budget}):createMaskSurface(owned,{width:domain.width,height:domain.height,budget,range:[0,field==='native_context_status'?2:1],semantics:field==='native_context_status'?'0=excluded;1=complete admitted native context support;2=no admitted16x16 context support':field==='analysis_scope'?'1=union of complete native ZERO contexts;0=no scientific context':field+' selected from its fixed native-context presentation owner; not a combined NFA population'});surfaces.push(surface);resultOwner.add(()=>surface.dispose(),0);return surface;}catch(error){void owned.dispose().catch(()=>{});throw error;}}
 try{
  nativeOwner.add(budget.reserve(8192+contexts.length*8192),1);
  for(const context of contexts){checkAbort(joined);const answer=await nativeEntry(cache,context,p,{view,original,budget,signal:joined,onProgress,profile,cpuKernel});if(answer.cached)cachedContexts++;else{nativeJobs++;workers=Math.max(workers,answer.entry.analysis.metrics.workers);}
   const record=await segmentedZeroResult(answer.entry.analysis,p,{budget});for(const surface of[record.surface,...Object.values(record.maskRecords).map(v=>v.surface)])nativeOwner.add(()=>surface.dispose(),0);const item={context,record,analysis:answer.entry.analysis};records.push(item);byId.set(context.id,item);evaluated++;onProgress?.({phase:'source-region-zero-context',completed:evaluated,total:contexts.length,fraction:evaluated/Math.max(1,contexts.length)});
  }
  checkAbort(joined);const fragments=contexts.map(c=>{const item=byId.get(c.id);return{id:c.id,bounds:c.bounds,originalBounds:c.originalBounds,nativeDimensions:[c.width,c.height],jpegOrigin:[0,0],gridCoordinateSpace:'native-context',evaluable:true,ownedRectangles:c.ownedRectangles,ownedPixels:c.ownedPixels,nativeMetadata:structuredClone(item.analysis.metadata),grid_log10_nfa:Array.from(item.analysis.grid_log10_nfa)};});
  nativeOwner.add(budget.reserve(4096+sourceRegionTransportBytes(fragments,{allowAliases:true})*4),1);
  const status=!evaluated?'native-not-evaluable':plan.noNativeSupportPixels?'partially-evaluable':'evaluated',metrics={sourceRegionPolicy:ZERO_CONTEXT_PLAN_VERSION,sourceRegionEvaluation:status,selectedPixels:domain.countIncluded,analysedPixels:plan.uniqueObservedPixels,unanalysablePixels:plan.noNativeSupportPixels,contextRgbPositions:plan.contextObservedPixels,overlapRgbPositions:plan.contextObservedPixels-plan.uniqueObservedPixels,evaluatedContexts:evaluated,nonEvaluableContexts:plan.unsupportedRectangles.length,nativeJobs,cachedContexts,workers,cache:{analysis:nativeJobs===0,result:false}},data={width:domain.width,height:domain.height,metadata:{method:'ZERO IPOL 2021/390',sourceRegionEvaluation:status,independentNativeContexts:true,contextPlanVersion:ZERO_CONTEXT_PLAN_VERSION,presentationOwnership:plan.ownership,main_grid:evaluated===1?records[0].analysis.metadata.main_grid:null,foreign_regions:records.flatMap(r=>originalRegions(r.analysis.metadata.foreign_regions,r.context,domain)),missing_regions:records.flatMap(r=>originalRegions(r.analysis.metadata.missing_regions,r.context,domain)),regionCoordinateSpace:'original-source-inclusive-xyxy',fragments,unsupportedRectangles:plan.unsupportedRectangles},grid_log10_nfa:evaluated===1?records[0].analysis.grid_log10_nfa.slice():null,regionBounds:'inclusive xyxy',palette:Uint8Array.from(ZERO_PALETTE),arrayLayout:'complete independent native context arrays; presentation ownership never filters native statistics'},surface=makeSurface('rgb'),rgbRecords={},maskRecords={};
  for(const context of contexts)rgbRecords[context.id]={surface:makeSurface('rgb',context)};
  for(const field of [...MASKS,'analysis_scope','native_context_status'])maskRecords[field]={surface:makeSurface(field)};
  const scientific={kind:'independent-native-zero-contexts',contexts:records.map(r=>({id:r.context.id,bounds:r.context.bounds,originalBounds:r.context.originalBounds,analysis:r.analysis})),metadata:data.metadata,retain};
  const provenance={...(version?{engine:version}:{}),operation:task.operation,params:p,backend:'cpu',originalSha256:original.sha256,sourceRegionDomain:domain.descriptor,independentNativeContexts:true,contextPlanVersion:ZERO_CONTEXT_PLAN_VERSION,contextOwnership:plan.ownership,excludedParticipation:'absent-before-luminance-votes-JPEG99-grid-significance-components-and-closing',nativeBorders:'unchanged for each complete native context',originalEncodedBytesPreserved:true};
  for(const item of [...Object.values(rgbRecords),...Object.values(maskRecords)]){item.zeroAnalysis=scientific;item.provenance=provenance;}
  const record={surface,rgbRecords,maskRecords,zeroAnalysis:scientific,semantics,metrics,data,provenance},bundle=publishResult(task.imageId,record);published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,data,layers:[{id:'zero-view',kind:'rgb',surfaceId:bundle.surface.id,origin:[0,0],range:[0,255]},...contexts.map(c=>({id:c.id,kind:'rgb',surfaceId:bundle.rgbSurfaces[c.id].id,origin:[0,0],coordinates:'source-region-native-pixels',contextBounds:c.bounds,contextOriginalBounds:c.originalBounds,range:[0,255]})),...MASKS.map(key=>({id:key,kind:'mask',surfaceId:bundle.maskSurfaces[key].id,origin:[0,0],range:[0,1]}))],semantics,metrics,warnings:plan.noNativeSupportPixels?[{code:'NATIVE_CONTEXT_NOT_EVALUABLE',pixels:plan.noNativeSupportPixels,message:'These admitted pixels have no entirely admitted native16x16 ZERO support; no synthetic grid is supplied.'}]:[],provenance};
 }catch(error){failed=true;primary=error;throw error;}
 finally{finish();try{await rootRelease();}catch(error){if(!failed){failed=true;primary=error;}}if(!published)try{await resultOwner.dispose();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
}
