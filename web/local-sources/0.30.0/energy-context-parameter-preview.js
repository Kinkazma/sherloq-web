import {selectEnergyContext,isEnergyContextCollection,validateEnergyContextDomain,energyContextTile,frameEnergyContextPixels} from './energy-context-selection.js?v=0.30.0';
import {compileOriginalSourceRegions} from './unified-engine/src/source-region-geometry.js';
import {EngineError,checkAbort} from './unified-engine/src/errors.js';
const fail=(code,message)=>{throw new EngineError(code,message);};
const fields=['energy_scope','energy_low_score','energy_high_score','energy_plane_0','energy_plane_1','energy_plane_2'];
/** Each child keeps its own native JPEG/profile/grid. Only RGB presentation is assembled. */
export function createContextEnergyParameterPreview({engine,readOriginal,createSingle,fallback,loadCodec}={}){
 const leases=new Map(),pending=new Set(),children=new Map(),controller=new AbortController();let parent=null,parentKey=null,closing=false,closed=false,retiring,active,limit=0,held=0,codecLease,codecPromise;
 const tracked={...engine,async reserveExternalMemory(request,owner='parent'){const bytes=request.bytes;if(!Number.isSafeInteger(bytes)||bytes<0||held+bytes>limit)fail('MEMORY_LIMIT','Independent Energy preview contexts exceed the admitted workspace.');held+=bytes;const task=Promise.resolve().then(()=>engine.reserveExternalMemory(request));pending.add(task);try{const lease=await task;leases.set(lease.id,{lease,bytes,owner});return lease;}catch(error){held-=bytes;throw error;}finally{pending.delete(task);}},async releaseExternalMemory(id){const entry=leases.get(id);if(!entry)return;if(entry.pending)return entry.pending;entry.pending=Promise.resolve().then(()=>engine.releaseExternalMemory(id)).then(()=>{leases.delete(id);held-=entry.bytes;},error=>{entry.failed=true;throw error;}).finally(()=>{entry.pending=null;});return entry.pending;}};
 async function retireChildren(){
  let failed=false,primary;const refusal=error=>{if(!failed){failed=true;primary=error;}};
  for(const [key,child]of [...children]){
   // A child producer must ACK before its remaining numeric/JPEG admissions
   // can be retired. A rejected sibling does not stop independent cleanups.
   try{await child.owner.dispose();}catch(error){refusal(error);continue;}
   let complete=true;for(const [id,entry]of [...leases])if(entry.owner===key)try{await tracked.releaseExternalMemory(id);}catch(error){complete=false;refusal(error);}
   if(complete)children.delete(key);
  }
  for(const [id,entry]of [...leases])if(entry.owner==='parent'||entry.owner==='shared'&&children.size===0)try{await tracked.releaseExternalMemory(id);}catch(error){refusal(error);}
  if(failed)throw primary;codecLease=codecPromise=null;parent=null;parentKey=null;
 }

 async function sharedCodec(){if(!codecLease)codecLease=await tracked.reserveExternalMemory({bytes:32*1024**2,label:'shared-energy-preview-jpeg'},'shared');return codecPromise??=Promise.resolve().then(loadCodec);}
 function childFor(analysis,context){
  const [x0,y0,x1,y1]=context.bounds,width=x1-x0,height=y1-y0,key=context.id;let child=children.get(key);if(child)return child;
  if(![x0,y0,x1,y1].every(Number.isSafeInteger)||x0<0||y0<0||width<=0||height<=0||x1>analysis.data.width||y1>analysis.data.height||!context.nativeMetadata?.energy)fail('DRAFT_BASE_UNAVAILABLE','A native Energy context has incomplete metadata.');
  const localSurface=s=>s?{...s,width,height}:null,planeSurfaces={};for(const name of fields){const s=analysis.planeSurfaces?.[name]??(name==='energy_low_score'?analysis.surface:null);if(!s)fail('DRAFT_BASE_UNAVAILABLE','A native Energy context is missing a retained plane.');planeSurfaces[name]=localSurface(s);}
  const summaries=(analysis.data.energy_summary??[]).filter(s=>s.sourceFragment===Number(key.replace('native-fragment-',''))).map(s=>({...s,bbox:s.bbox.map((v,i)=>v-(i%2?y0:x0))}));
  const native={...analysis,id:analysis.id+'/'+key,data:{width,height,energy_summary:summaries,metadata:structuredClone(context.nativeMetadata)},surface:planeSurfaces.energy_low_score,planeSurfaces,sourceRegionDomain:null,sourceRegionSourceSurface:localSurface(analysis.sourceRegionSourceSurface)};
  const proxy={...tracked,reserveExternalMemory:request=>tracked.reserveExternalMemory(request,key),readPlane:({rect,...request},hooks)=>engine.readPlane({...request,rect:{...rect,x:rect.x+x0,y:rect.y+y0}},hooks)};
  const owner=createSingle({engine:proxy,dependencies:loadCodec?{sharedCodec}:{},readOriginal:(_analysis,tile,signal)=>readOriginal(analysis,{...tile,x:tile.x+x0,y:tile.y+y0},signal)});child={owner,native,context};children.set(key,child);return child;
 }
 async function renderCollection(analysis,options){
  const {signal,preview={}}=options;checkAbort(signal);const selection=selectEnergyContext(analysis,options);await validateEnergyContextDomain(selection,signal);
  limit=preview.maxWorkingBytes??128*1024**2;if(!Number.isSafeInteger(limit)||limit<0)fail('INVALID_INPUT','Invalid Energy context workspace.');
  const identity=JSON.stringify([analysis.id,analysis.provenance,analysis.data.contexts,analysis.planeSurfaces]);if(parent!==analysis||parentKey!==identity||[...leases.values()].some(v=>v.failed)){await retireChildren();parent=analysis;parentKey=identity;}
  const width=analysis.data.width,height=analysis.data.height,maxSide=Math.min(preview.maxWidth??2048,preview.maxHeight??2048),maxPixels=preview.maxPixels??2048**2;if(!Number.isSafeInteger(maxSide)||maxSide<1||maxSide>2048||!Number.isSafeInteger(maxPixels)||maxPixels<1)fail('INVALID_INPUT','Invalid Energy context preview grid.');const panels=options.presentation?.view==='scores'&&options.presentation?.field==='both'?2:1;let step=1;while(Math.ceil(width/step)*panels>maxSide||Math.ceil(height/step)>maxSide||Math.ceil(width/step)*panels*Math.ceil(height/step)>maxPixels)step*=2;
  const lease=await tracked.reserveExternalMemory({bytes:Math.ceil(width/step)*Math.ceil(height/step)*9*panels+65536,label:'selected-energy-context-preview-composition'});let failed=false;
  try{let answer,frame={presentation:options.presentation};if(!selection.empty){const c=selection.context,key=c.id;let child=children.get(key);if(!child){const proxy={...tracked,reserveExternalMemory:request=>tracked.reserveExternalMemory(request,key)};child={native:selection.analysis,context:c,owner:createSingle({engine:proxy,dependencies:loadCodec?{sharedCodec}:{},readOriginal:(_analysis,tile,s)=>readOriginal(analysis,energyContextTile(selection,tile),s)})};children.set(key,child);}answer=await child.owner.render(child.native,{...options,preview:{...preview,adaptive:false,maxWidth:Math.ceil(c.width/step)*panels,maxHeight:Math.ceil(c.height/step),maxPixels:Math.ceil(c.width/step)*panels*Math.ceil(c.height/step),maxWorkingBytes:limit}});frame={...answer.pixels,presentation:{...options.presentation,...answer.presentation}};}
   const pixels=await frameEnergyContextPixels(selection,frame,readOriginal,{signal,step});checkAbort(signal);if(closing)fail('CANCELLED','Energy context preview retired before publication.');return{...answer,pixels:{...pixels,preview:true},presentation:{...pixels.presentation,preview:true,exact:false,profileLayout:'per-native-context'},draft:{...answer?.draft,baseResultId:analysis.id,sourceSha256:analysis.provenance.originalSha256,sourceRegionFingerprint:analysis.sourceRegionDomain.fingerprint,sourceFragment:selection.context?.id??null,contextPlanFingerprint:selection.planFingerprint,samplingStep:step,exact:false,contextOnly:true,empty:selection.empty,workspaceBytes:held}};
  }catch(error){failed=true;throw error;}finally{try{await tracked.releaseExternalMemory(lease.id);}catch(error){if(!failed)throw error;}}
 }
 async function renderContexts(analysis,options){
  if(closing)fail('DISPOSED','Energy context preview disposed.');const {signal,preview={}}=options;checkAbort(signal);
  limit=preview.maxWorkingBytes??128*1024**2;if(!Number.isSafeInteger(limit)||limit<0)fail('INVALID_INPUT','Invalid Energy context workspace.');
  const fragments=analysis.data.metadata.fragments;if(fragments.length>8192)fail('SOURCE_SCOPE_PREVIEW_UNSUPPORTED','Too many native Energy context profiles for the bounded preview.');
  const identity=JSON.stringify([analysis.id,analysis.provenance?.originalSha256,analysis.sourceRegionDomain?.fingerprint,analysis.sourceRegionSourceSurface,fragments.map(c=>[c.id,c.bounds,c.evaluable,c.nativeMetadata?.quality,c.nativeMetadata?.qualities,c.nativeMetadata?.block,c.nativeMetadata?.energy?.profile,c.nativeMetadata?.energy?.quantiles,c.nativeMetadata?.energy?.thresholds]),fields.map(name=>analysis.planeSurfaces?.[name]??(name==='energy_low_score'?analysis.surface:null)),analysis.data.energy_summary]);
  if(parent!==analysis||parentKey!==identity||[...leases.values()].some(v=>v.failed)){await retireChildren();parent=analysis;parentKey=identity;}
  const width=analysis.data.width,height=analysis.data.height;if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isSafeInteger(width*height))fail('INVALID_INPUT','Invalid retained native Energy dimensions.');const maxSide=Math.min(preview.maxWidth??2048,preview.maxHeight??2048),maxPixels=preview.maxPixels??2048**2;
  if(!Number.isSafeInteger(maxSide)||maxSide<1||maxSide>2048||!Number.isSafeInteger(maxPixels)||maxPixels<1)fail('INVALID_INPUT','Invalid Energy context preview grid.');
  let step=1;while(Math.ceil(width/step)>maxSide||Math.ceil(height/step)>maxSide||Math.ceil(width/step)*Math.ceil(height/step)>maxPixels)step*=2;
  const sw=Math.ceil(width/step),sh=Math.ceil(height/step),lease=await tracked.reserveExternalMemory({bytes:sw*sh*6+fragments.length*512+65536,label:'energy-context-preview-composition'});let failed=false;
  try{
   const domain=await compileOriginalSourceRegions(analysis.sourceRegionDomain);checkAbort(signal);
   if(domain.width!==width||domain.height!==height||domain.sourceSha256!==analysis.provenance.originalSha256)fail('DRAFT_BASE_MISMATCH','Native Energy context geometry belongs to another source.');
   const accepted=[];let population=0;
   for(const context of fragments){const b=context.bounds;if(!Array.isArray(b)||b.length!==4||!b.every(Number.isSafeInteger)||b[0]<0||b[1]<0||b[2]>width||b[3]>height||b[0]>=b[2]||b[1]>=b[3])fail('DRAFT_BASE_UNAVAILABLE','Invalid native Energy context bounds.');for(const a of accepted)if(b[0]<a[2]&&a[0]<b[2]&&b[1]<a[3]&&a[1]<b[3])fail('DRAFT_BASE_MISMATCH','Native Energy contexts overlap.');for(let y=b[1];y<b[3];y++)if(!domain.rowIntervals(y).some(([x0,x1])=>x0<=b[0]&&x1>=b[2]))fail('DRAFT_BASE_MISMATCH','A native Energy context includes an excluded source sample.');population+=(b[2]-b[0])*(b[3]-b[1]);accepted.push(b);}
   if(population!==domain.countIncluded)fail('DRAFT_BASE_MISMATCH','Native Energy contexts do not cover the admitted source domain.');
   // This read supplies only the untouched presentation outside native contexts.
   const base=await readOriginal(analysis,{x:0,y:0,w:width,h:height,step},signal);checkAbort(signal);if(base?.width!==sw||base.height!==sh||base.format!=='rgb8'||base.data?.length!==sw*sh*3)fail('INVALID_INPUT','Energy presentation source changed its sampled grid.');
   const data=new Uint8Array(base.data),contexts=[];let recompressions=0,sourceReads=0;
   for(const context of analysis.data.metadata.fragments){checkAbort(signal);if(!context.evaluable){contexts.push({id:context.id,bounds:[...context.bounds],status:context.status,reason:context.reason,nativeNotEvaluable:true});continue;}
    const child=childFor(analysis,context),[x0,y0,x1,y1]=context.bounds;
    const answer=await child.owner.render(child.native,{...options,preview:{...preview,adaptive:false,maxWidth:Math.max(1,Math.ceil((x1-x0)/step)),maxHeight:Math.max(1,Math.ceil((y1-y0)/step)),maxPixels:Math.max(1,Math.ceil((x1-x0)/step)*Math.ceil((y1-y0)/step)),maxWorkingBytes:limit}});checkAbort(signal);
    const frame=answer.pixels;for(let y=Math.ceil(y0/step);y<Math.ceil(y1/step);y++)for(let x=Math.ceil(x0/step);x<Math.ceil(x1/step);x++){
     const sx=Math.min(frame.width-1,Math.floor((x*step-x0)/answer.draft.samplingStep)),sy=Math.min(frame.height-1,Math.floor((y*step-y0)/answer.draft.samplingStep)),from=(sy*frame.width+sx)*3;data.set(frame.data.subarray(from,from+3),(y*sw+x)*3);
    }
    recompressions+=answer.draft.recompressedQualities.length;sourceReads+=answer.draft.nativeSampleCache.sourceReads;contexts.push({id:context.id,bounds:[...context.bounds],status:'preview',profile:context.nativeMetadata.energy,params:answer.draft.params,draft:answer.draft});
   }
   checkAbort(signal);if(closing)fail('CANCELLED','Energy context preview retired before publication.');return{pixels:{width:sw,height:sh,logicalWidth:width,logicalHeight:height,format:'rgb8',data,preview:true},presentation:{...options.presentation,preview:true,exact:false,nativeResolution:step===1,method:'independent-native-energy-context-drafts',profileLayout:'per-native-context'},draft:{baseResultId:analysis.id,sourceSha256:analysis.provenance.originalSha256,sourceRegionFingerprint:analysis.sourceRegionDomain?.fingerprint,exact:false,samplingStep:step,contexts,recompressions,sourceReads:sourceReads+1,scientificSourceReads:sourceReads,presentationSourceReads:1,workspaceBytes:held,profileLayout:'per-native-context',composition:'RGB presentation only; no cross-context JPEG, histogram, estimate, threshold or hysteresis'}};
  }catch(error){failed=true;throw error;}finally{try{await tracked.releaseExternalMemory(lease.id);}catch(error){if(!failed)throw error;}}
 }
 return{render(analysis,options={}){if(active)return Promise.reject(new EngineError('BUSY','An Energy context draft is already running.'));if(closing)return Promise.reject(new EngineError('DISPOSED','Energy context preview disposed.'));options={...options,signal:options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal};const scoped=Array.isArray(analysis?.data?.metadata?.fragments);const task=isEnergyContextCollection(analysis)?renderCollection(analysis,options):scoped?renderContexts(analysis,options):fallback.render(analysis,options);active=Promise.resolve(task);active.then(()=>{active=null;},()=>{active=null;});return task;},
  dispose(){if(closed)return Promise.resolve();if(retiring)return retiring;closing=true;controller.abort(new EngineError('CANCELLED','Energy preview owner closing.'));retiring=(async()=>{await Promise.allSettled([active,...pending].filter(Boolean));let failed=false,primary;for(const close of[()=>retireChildren(),()=>fallback.dispose()])try{await close();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;closed=true;})();retiring.catch(()=>{retiring=null;});return retiring;},get state(){return{closed,closing,children:children.size,leases:leases.size,held};}};
}
