import "../../runtime-context.js?v=0.30.0";
import {sparseStrictImageRecord} from './sparse-strict-source.js';
import {sparseNativeWindowParameters} from './sparse-native-window-source.js';
import {createSsgStrictCompiledView} from './ssg-strict-compiled-view.js';
import {createSsgStrictEngine} from './ssg-strict-engine.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

const key=(mode,window)=>JSON.stringify([mode,window.id,window.fingerprint]);
export function ssgGlobalWindow(plan){
 const g=plan?.global,d=g?.contextDomain;
 requireValue(plan?.mode==='global'&&g?.contextPolicy==='declared-window-context-union'&&d&&g.candidateDomain,'SSG global needs its canonical declared union.');
 return{...g,id:'global-analysis',kind:'global',declaredWindowIds:[...g.windowIds],bounds:[d.rect.x0,d.rect.y0,d.rect.x1,d.rect.y1],fingerprint:JSON.stringify(['ssg-native-union/1',g.fingerprint]),status:g.candidateDomain.empty?'empty':'ready'};
}

/** A native SSG engine/checkpoint per independent job, or exactly one for the
 * canonical global union. This module contains no detector/matcher arithmetic.
 * Entries and carrier loans exist before construction or native work awaits. */
export function createSsgNativeWindowCallback({original,budget,profile,hooks={},compiledFactory=createSsgStrictCompiledView,engineFactory=createSsgStrictEngine,nativeOptions={}}={}){
 requireValue(original&&budget?.reserve&&profile?.maxWorkers>0,'SSG windows require their Original owner, budget and native profile.');
 const record=sparseStrictImageRecord(original,budget),source=record.originalSource??record,entries=new Map();let closed=false,closing;
 function resource(mode,window){
  const id=key(mode,window);let r=entries.get(id);if(r)return r;
  const entryCredit=budget.reserve(4096+4*sourceRegionTransportBytes([id,mode]));
  r={id,mode,loans:0,outputs:new Set(),closed:false,busy:false,failed:false,initialization:null,closing:null};entries.set(id,r);
  r.retire=()=>{if(r.closing)return r.closing;r.closed=true;r.closing=(async()=>{
   await r.initialization?.catch(()=>{});requireValue(r.loans===0,'An SSG result carrier still owns its native source.');
   await retireCompositeOwners([...r.outputs].map(value=>async()=>{await value.release();r.outputs.delete(value);}));
   // A refused native ACK must keep its compiled source and all credits live.
   await r.engine?.dispose();await r.view?.dispose();entryCredit();entries.delete(id);
  })();void r.closing.finally(()=>{r.closing=null;}).catch(()=>{});return r.closing;};
  return r;
 }
 async function run({window,task,signal,onOwner,sourceContextIdentity},mode,retainedOnly){
  requireValue(!closed&&task.params?.algorithm==='SSG'&&typeof onOwner==='function','A live native SSG job and retaining parent are required.');checkAbort(signal);
  let r=entries.get(key(mode,window));if(retainedOnly&&(!r||r.closed||!r.engine))throw new EngineError('SSG_RETAINED_UNAVAILABLE','This SSG window has no retained native checkpoint.');
  r??=resource(mode,window);requireValue(!r.closed&&!r.busy,'The SSG window is busy or retiring.');r.loans++;let loanReleased=false;
  const loan={dispose(){if(!loanReleased){loanReleased=true;r.loans--;}}};
  try{onOwner(loan);}catch(error){loan.dispose();throw error;}
  r.busy=true;let output,returned=false;
  try{
   if(!r.initialization)r.initialization=(async()=>{
    const context=window.contextDomain,candidate=window.candidateDomain,d=source.surface.descriptor;
    requireValue(context?.sourceSha256===source.sha256&&candidate?.sourceSha256===source.sha256&&context.sourceWidth===d.width&&context.sourceHeight===d.height,'SSG window differs from its actual Original.');
    r.view=await compiledFactory({source:source.surface,sourceDomain:context,contextDomain:context,candidateDomain:candidate,width:context.width,height:context.height,origin:[...context.origin]},{budget});
    r.engine=engineFactory(r.view.view,budget,profile,{...nativeOptions,candidateDomain:r.view.candidateDomain});
   })();
   await r.initialization;checkAbort(signal);
   const {input}=sparseNativeWindowParameters(task,window.contextDomain.origin,{analysisWindowMode:mode});
   // Canonical candidates already select THIS job. Native compare remains an
   // explicit two-ROI predicate; no other window's pixels are imported for it.
   if(input.compare!==true)input.regions=[];
   const nativeHooks={...hooks,signal,scientificScope:undefined,backend:task.backend??hooks.backend??'auto',sourceSha256:source.sha256,sourceOwner:source.surface,sourceRevision:source.surface.descriptor.revision??0};
   output=await(retainedOnly?r.engine.localizeRetained(input,nativeHooks):r.engine.analyze(input,nativeHooks));
   if(!output)throw new EngineError('SSG_RETAINED_UNAVAILABLE','The native SSG checkpoint or requested scalar draft is unavailable.');
   r.outputs.add(output);checkAbort(signal);
   const description={id:window.id,kind:window.kind,mode,origin:[...window.contextDomain.origin],bounds:[...window.bounds],contextFingerprint:window.contextDomain.fingerprint,candidateFingerprint:window.candidateDomain.fingerprint,sourceContextIdentity,sourceObservationPolicy:mode==='global'?'declared-window-union-single-observation':'one-declared-window',nativeParameters:input,requestedParameterCoordinates:'original-pixels',nativeParameterCoordinates:'window-context-local-pixels'};
   const credit=budget.reserve(65536+4*sourceRegionTransportBytes(description,{allowAliases:true,allowUndefined:true})),nativeRelease=output.release;let released=false,pending;
   output.cloneWindowMode=mode;output.metadata={...output.metadata,cloneWindowMode:mode,analysisWindow:description};
   output.release=()=>{if(released||pending)return pending;pending=Promise.resolve().then(()=>nativeRelease()).then(()=>{credit();released=true;r.outputs.delete(output);},error=>{pending=undefined;throw error;});return pending;};
   returned=true;return output;
  }catch(error){if(error?.code!=='SSG_RETAINED_UNAVAILABLE')r.failed=true;throw error;}
  finally{r.busy=false;if(!returned&&output)r.outputs.add(output);}
 }
 const callback=job=>run(job,'independent',false);
 callback.runGlobal=({plan,...job})=>run({...job,window:ssgGlobalWindow(plan)},'global',false);
 callback.localizeRetained=job=>run(job,'independent',true);
 callback.localizeGlobal=({plan,...job})=>run({...job,window:ssgGlobalWindow(plan)},'global',true);
 callback.retainWindows=async(plan,{retainedOnly=false}={})=>{
  requireValue(!closed&&['independent','global'].includes(plan?.mode),'A live canonical SSG plan is required.');
  const windows=plan.mode==='global'?(plan.windows.some(w=>w.status!=='empty')?[ssgGlobalWindow(plan)]:[]):plan.windows.filter(w=>w.status!=='empty'),keep=new Set(windows.map(w=>key(plan.mode,w)));
  await retireCompositeOwners([...entries].filter(([id,r])=>!keep.has(id)||r.failed||r.closed).map(([,r])=>()=>r.retire()));
  if(retainedOnly&&windows.some(w=>!entries.has(key(plan.mode,w))))throw new EngineError('SSG_RETAINED_UNAVAILABLE','The exact SSG plan is not retained; no detector fallback is permitted.');
 };
 callback.clearCheckpoint=()=>{let bytes=0;for(const r of entries.values())bytes+=r.engine?.clearCheckpoint?.()??0;return bytes;};
 callback.dispose=()=>{closed=true;if(closing)return closing;closing=retireCompositeOwners([...entries.values()].map(r=>()=>r.retire()));void closing.finally(()=>{closing=null;}).catch(()=>{});return closing;};
 callback.state=()=>({closed,entries:entries.size,loans:[...entries.values()].reduce((n,r)=>n+r.loans,0),outputs:[...entries.values()].reduce((n,r)=>n+r.outputs.size,0)});
 return callback;
}
