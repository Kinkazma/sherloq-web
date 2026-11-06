import {createAutomaticPreparedDense as createSingleNativeDense} from './automatic-prepared-dense-native.js';
import {sparseStrictImageRecord} from './sparse-strict-source.js';
import {sparseNativeWindowParameters} from './sparse-native-window-source.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort} from './errors.js';

const key=(mode,window)=>JSON.stringify([mode,window.id,window.fingerprint]);
/** Each entry owns one unchanged StrictDenseCopyEngine and its native retained
 * maps/checkpoint. It borrows the window's exact RGB context and candidate
 * domain. No descriptor, PatchMatch pass, refinement or geometry is replaced. */
export function createDenseNativeWindowCallback({original,budget,profile,geometry,hooks={},nativeFactory=createSingleNativeDense}={}){
 const record=sparseStrictImageRecord(original,budget),source=record.originalSource??record,entries=new Map();let closed=false,closing;
 async function retire(entry){requireValue(entry.loans===0&&!entry.busy,'A dense native window is still retained.');await entry.engine.dispose();entries.delete(entry.key);}
 async function run({window,task,signal,onOwner,sourceContextIdentity},mode){
  requireValue(!closed&&typeof onOwner==='function','A live native dense callback and retaining parent are required.');checkAbort(signal);
  const context=window.contextDomain,candidate=window.candidateDomain,origin=[...context.origin],id=key(mode,window);
  requireValue(context.sourceSha256===source.sha256&&candidate.sourceSha256===source.sha256,'Dense window belongs to another Original.');
  let entry=entries.get(id);
  if(!entry){
   // The native adapter receives a genuine local grid. Its getContext returns
   // the same verified candidate/context certificates as the canonical plan.
   // Any incidental direct RGB read must also be entirely admitted.
   const surface={descriptor:{...source.surface.descriptor,id:'native-dense-'+window.fingerprint,width:context.width,height:context.height},readWindow(rect,options){
    requireValue([rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=context.width&&rect.y+rect.height<=context.height,'Invalid native dense window read.');
    for(let y=rect.y+origin[1];y<rect.y+origin[1]+rect.height;y++)requireValue(context.originalRowIntervals(y).some(([a,b])=>a<=rect.x+origin[0]&&b>=rect.x+origin[0]+rect.width),'Native dense direct read includes excluded RGB.');
    return source.surface.readWindow({...rect,x:rect.x+origin[0],y:rect.y+origin[1]},options);
   }};
   const image={...record,pixels:undefined,surface,originalSource:source,sourceRegionDomain:context.descriptor,sourceRegionOrigin:origin};
   const prepared={source:source.surface,sourceDomain:context,candidateDomain:candidate,contextDomain:context,width:context.width,height:context.height,origin,fingerprint:window.fingerprint};
   entry={key:id,loans:0,busy:false,engine:nativeFactory(image,budget,{geometry,profile,getContext:async()=>prepared})};entries.set(id,entry);
  }
  requireValue(!entry.busy,'Native dense window is busy.');entry.loans++;let released=false;
  try{onOwner({dispose(){if(!released){released=true;entry.loans--;}}});}catch(error){entry.loans--;throw error;}
  entry.busy=true;
  try{
   const {input,nativeRegionPolicy}=sparseNativeWindowParameters(task,origin,{analysisWindowMode:mode}),output=await entry.engine.analyze(input,{...hooks,backend:task.backend??hooks.backend??'auto',signal});
   // The native result remains complete, including dense_maps, pass labels,
   // reflection/detail provenance and BigInt comparison counts.
   output.cloneWindowMode=mode;output.metadata={...output.metadata,analysisWindow:{id:window.id,kind:window.kind,mode,nativeRegionPolicy,origin,bounds:[...window.bounds],width:context.width,height:context.height,contextFingerprint:context.fingerprint,candidateFingerprint:candidate.fingerprint,sourceContextIdentity,coordinates:'window-native-pixel-centres',matching:'unchanged native dense passes within this analysis only'}};
   return output;
  }finally{entry.busy=false;}
 }
 const callback=job=>run(job,'independent');
 callback.runGlobal=({plan,...job})=>{requireValue(plan?.mode==='global'&&plan.global?.contextPolicy==='declared-window-context-union','Explicit global dense plan required.');const d=plan.global.contextDomain;return run({...job,window:{id:'global-analysis',kind:'region',bounds:[d.rect.x0,d.rect.y0,d.rect.x1,d.rect.y1],polygon:[],...plan.global,status:'ready'}},'global');};
 callback.retainWindows=async plan=>{const keep=new Set(plan.mode==='global'&&plan.global?[key('global',{id:'global-analysis',fingerprint:plan.global.fingerprint})]:plan.windows.filter(w=>w.status!=='empty').map(w=>key('independent',w)));await retireCompositeOwners([...entries.values()].filter(e=>!keep.has(e.key)).map(e=>()=>retire(e)));};
 callback.clearCheckpoint=async value=>{await retireCompositeOwners([...entries.values()].map(e=>()=>e.engine.clearCheckpoint(value)));};
 callback.dispose=()=>{closed=true;if(closing)return closing;closing=retireCompositeOwners([...entries.values()].map(e=>()=>retire(e)));void closing.finally(()=>closing=null).catch(()=>{});return closing;};
 callback.state=()=>({closed,entries:entries.size,loans:[...entries.values()].reduce((n,e)=>n+e.loans,0)});
 return callback;
}
