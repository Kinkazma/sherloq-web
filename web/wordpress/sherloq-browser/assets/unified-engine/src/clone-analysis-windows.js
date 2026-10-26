import "../../runtime-context.js?v=0.25.0";
import {compileOriginalSourceRegions,createOriginalSourceRegionsState} from './source-region-geometry.js';
import {declaredCloneScopeRegions} from './clone-scope-declarations.js';
import {prepareNeuralStrictSourceContext} from './neural-strict-source-context.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

const schema='sherloq.clone-analysis-windows/1';
const rectangle=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];
const box=p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');
const absent=message=>new EngineError('SOURCE_SCOPE_EMPTY',message);
const polygon=r=>r.polygon??rectangle(r.bounds??[r.x0,r.y0,r.x1,r.y1]);

function declaredWindows(task,domain){
 const p=task.params??{},scope=p.scientificScope??task.scientificScope;
 if(task.regions!==undefined)requireValue(Array.isArray(task.regions),'Native clone windows must be an array.');
 if(task.regions!==undefined&&(task.regions.length||p.selectionPresent===true)){
  return task.regions.map((r,i)=>({...r,id:r.id??'native-window-'+i,polygon:polygon(r)}));
 }
 if(scope){
  const regions=declaredCloneScopeRegions(scope);
  return regions.map((r,i)=>({...r,id:r.id??'scientific-window-'+i,polygon:polygon(r)}));
 }
 if(p.selection!==undefined){
  const s=p.selection;requireValue(s&&Array.isArray(s.regions)&&Array.isArray(s.disabled),'Automatic clone windows require an explicit selection.');
  requireValue(s.disabled.every(i=>Number.isSafeInteger(i)&&i>=0&&i<s.regions.length),'Invalid disabled clone window.');
  return [...s.regions.flatMap((poly,i)=>s.disabled.includes(i)?[]:[{id:'selection-window-'+i,kind:'region',polygon:poly}]),...(s.envelope?[{id:'selection-envelope',kind:'envelope',polygon:s.envelope}]:[])];
 }
 if(p.regions?.length){
  requireValue(Array.isArray(p.regions),'Native clone polygons must be an array.');
  return p.regions.map((poly,i)=>({id:'parameter-window-'+i,kind:'region',polygon:poly}));
 }
 for(let d=domain.descriptor;d;d=d.ceiling){
  const s=d.snapshot;
  if(s.enabled&&s.positiveMode==='selected')return s.zones.filter(z=>z.enabled&&z.kind==='acquisition').map(z=>({id:z.id,kind:z.role==='envelope'?'envelope':'region',polygon:z.polygon}));
 }
 return [{id:'whole-image',kind:'region',polygon:rectangle([0,0,domain.sourceWidth,domain.sourceHeight])}];
}

/** Geometry and ownership only: never read RGB, run a model or merge features.
 * A window is an analysis, not a piece in a shared feature bank. Overlapping
 * windows stay separate. A bounding box alone never creates another analysis.
 * The optional global mode preserves its distinct input domains for a caller
 * whose shared-bank implementation has been separately qualified.
 */
export async function prepareCloneAnalysisWindows({domain,task},{budget,signal}={}){
 checkAbort(signal);requireValue(domain?.descriptor&&task&&typeof budget?.reserve==='function','Verified source domain, task and metadata budget required.');
 const mode=task.cloneWindowMode??'independent';requireValue(['independent','global'].includes(mode),'Invalid clone window mode.');
 const release=budget.reserve(65536+sourceRegionTransportBytes([domain.descriptor,task],{allowUndefined:true,allowAliases:true})*16);let prepared,complete=false;
 try{
  // This existing compiler verifies/localizes the original task and attributes
  // real negatives independently of the acquisition-complement candidate mask.
  // Its shared context is used only by the explicitly selected global route.
  const verified=await compileOriginalSourceRegions(domain.descriptor);
  requireValue(verified.fingerprint===domain.fingerprint&&verified.sourceSha256===domain.sourceSha256,'Clone windows belong to another verified source domain.');domain=verified;
  prepared=await prepareNeuralStrictSourceContext({domain,task},{budget,signal,allowEmptyCandidates:true});
  const originalTask=prepared.originalTask,requested=declaredWindows(originalTask,domain);
  // Original acquisitions and true negatives are an absolute RGB ceiling.
  // Omit a redundant full-source ceiling to preserve established full-image identities.
  const contextCeiling=domain.countIncluded===domain.sourceWidth*domain.sourceHeight?undefined:{ceiling:domain};
  if(!requested.length)throw absent('No enabled clone analysis window remains.');
  requireValue(requested.length<=8192,'Too many clone analysis windows; none were discarded.');
  const windows=[],ids=new Set(),size={sourceSha256:domain.sourceSha256,width:domain.sourceWidth,height:domain.sourceHeight};
  const negatives=prepared.strictExclusions.map((r,i)=>({id:'clone-negative-'+i,kind:'exclusion',enabled:true,polygon:structuredClone(r.polygon),...Object.fromEntries(['x0','y0','x1','y1'].map((k,j)=>[k,box(r.polygon)[j]]))}));
  for(const requestedWindow of requested){
   checkAbort(signal);requireValue(typeof requestedWindow.id==='string'&&requestedWindow.id.length>0&&requestedWindow.id.length<=256&&!ids.has(requestedWindow.id),'Clone analysis windows need unique stable IDs.');ids.add(requestedWindow.id);
   const poly=structuredClone(requestedWindow.polygon),b=box(poly),kind=requestedWindow.kind==='envelope'||requestedWindow.envelope===true?'envelope':'region';
   const state=await createOriginalSourceRegionsState(size);
   await state.replaceZones([{id:requestedWindow.id,kind:'acquisition',enabled:true,polygon:poly,x0:b[0],y0:b[1],x1:b[2],y1:b[3]},...negatives.map(n=>n.id===requestedWindow.id?{...n,id:n.id+'-excluded'}:n)],{positiveMode:'selected',enabled:true,signal});
   // Both literal RGB context and candidates retain every Original ceiling.
   // A local envelope cannot reopen pixels outside the Original acquisitions.
   // Candidate-only restrictions remain distinct from this mandatory RGB ceiling.
   const contextDomain=await compileOriginalSourceRegions(state.snapshot(),contextCeiling),candidateDomain=await compileOriginalSourceRegions(state.snapshot(),{ceiling:domain});
   const fingerprint=await digest([schema,mode,requestedWindow.id,kind,contextDomain.fingerprint,candidateDomain.fingerprint]);
   windows.push(Object.freeze({id:requestedWindow.id,kind,polygon:state.snapshot().zones[0].polygon,bounds:Object.freeze([...b]),candidateDomain,contextDomain,fingerprint,status:candidateDomain.empty?'empty':'ready'}));
   await controlCheckpoint(signal);
  }
  let global=null;
  if(mode==='global'){
   // A common feature bank never licenses RGB in an implicit bounding box.
   // Its input is the union of the declared canonical contexts (including E
   // only if explicitly declared), less every verified true exclusion.
   const sharedState=await createOriginalSourceRegionsState(size);
   const positive=windows.map((w,i)=>({id:'shared-positive-'+i,kind:'acquisition',enabled:true,polygon:structuredClone(w.polygon),...Object.fromEntries(['x0','y0','x1','y1'].map((k,i)=>[k,w.bounds[i]]))}));
   await sharedState.replaceZones([...positive,...negatives.map((n,i)=>({...n,id:'shared-negative-'+i}))],{positiveMode:'selected',enabled:true,signal});
   // The explicitly declared windows define the global union, including a
   // selected envelope. The earlier candidate compiler intentionally keeps
   // native envelope context separate; using it again as this ceiling would
   // silently discard admitted envelope pixels outside the smaller windows.
   // Original membership and every true negative remain mandatory above.
   const contextDomain=await compileOriginalSourceRegions(sharedState.snapshot(),contextCeiling),candidateDomain=await compileOriginalSourceRegions(sharedState.snapshot(),{ceiling:domain});
   const sharedFingerprint=await digest([schema,'declared-window-context-union',contextDomain.fingerprint,candidateDomain.fingerprint,windows.map(w=>w.fingerprint)]);
   global=Object.freeze({candidateDomain,contextDomain,fingerprint:sharedFingerprint,contextPolicy:'declared-window-context-union',windowIds:Object.freeze(windows.map(w=>w.id))});
  }
  const fingerprint=await digest([schema,mode,domain.sourceSha256,windows.map(w=>w.fingerprint),...(global?['global-context-policy',global.fingerprint]:[])]);checkAbort(signal);let closed=false;complete=true;
  return Object.freeze({schema,mode,fingerprint,windows:Object.freeze(windows),originalTask,sourceDomain:domain,
   global,
   semantics:'independent window analyses by default; an explicitly declared envelope is a separate analysis; shared feature banks require explicit global mode',
   release(){if(!closed){closed=true;prepared.release();release();}}});
 }finally{if(!complete){prepared?.release();release();}}
}
