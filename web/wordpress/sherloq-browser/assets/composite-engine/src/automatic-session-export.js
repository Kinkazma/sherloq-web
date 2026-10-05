import {requireValue,checkAbort} from './errors.js';
import {automaticPointSnapshot} from './automatic-point-snapshot.js';
import {automaticAiSnapshot} from './automatic-ai-snapshot.js';
import {automaticElaSnapshot} from './automatic-ela-snapshot.js';
import {automaticDecodedBgrSha256} from './automatic-pixels.js';
import {createAutomaticAnalysisView} from './automatic-analysis-view.js';
import {CLONE_SOURCES} from './clone-relations.js';
import {automaticViewSelection} from './automatic-visible-entries.js';
import {exportAutomaticAnalysis} from './automatic-export.js';

/** Export a settled session under its preparation lock. Caller owns the source;
 * the returned archive is independent of all source/provider/session owners. */
export function exportAutomaticSession(session,{image,filters={},view,forgeryscopeBranch,elaEnergy,elaLegacy,elaProfile=null,elaSettings=null,provenance={}}={},request={},hooks={}) {
 requireValue(typeof session?.withSnapshot==='function'&&(forgeryscopeBranch===undefined||['','microscopy','blots','lanes'].includes(forgeryscopeBranch))&&(elaEnergy===undefined||typeof elaEnergy==='boolean')&&(elaLegacy===undefined||typeof elaLegacy==='boolean'),'Automatic session and native display branch/families required.');
 request=structuredClone(request);
 const suppliedView=view&&structuredClone(view),profile=structuredClone(elaProfile),settings=structuredClone(elaSettings),extra=structuredClone(provenance);
 requireValue(!suppliedView||filters.d2Minimum===undefined||filters.d2Minimum===suppliedView.d2prlMinimum,'Export filter and view D2PRL minimum differ.');
 const effectiveFilters={...filters,...(suppliedView?{d2Minimum:suppliedView.d2prlMinimum}:{})};
 return session.withSnapshot(effectiveFilters,async context=>{
  const {plan,frame,results:raw,state,signal}=context,{width,height}=plan,results={},providers={},owned=[];let archive;
  try{
   for(const [id,value]of Object.entries(raw)){
    checkAbort(signal);
    if(id==='patchmatch'||id==='sift')results[id]=automaticPointSnapshot(value,{nativeParams:plan.native[id]});
    else if(id==='forgeryscope')results[id]=automaticAiSnapshot(id,value);
    else if(id==='d2prl'){const grids=await context.readRaw(id);requireValue(grids&&typeof grids.release==='function','Owned D2PRL raw-grid result required.');owned.push(grids);results[id]=automaticAiSnapshot(id,value.result,{raw:grids.value.result});}
    else if(id==='ela')results[id]=automaticElaSnapshot(value,frame.groups.ela);
    providers[id]={...(value.provenance?{provenance:value.provenance}:{}),...(value.metrics?{metrics:value.metrics}:{})};
   }
   const initial=suppliedView??createAutomaticAnalysisView({complete:plan.complete,width,height}).getState(),v={...initial,forgeryscopeBranch:forgeryscopeBranch??initial.forgeryscopeBranch??'',elaEnergy:elaEnergy??initial.elaEnergy??true,elaLegacy:elaLegacy??initial.elaLegacy??true};
   requireValue(Number.isFinite(v.opacity)&&v.opacity>=0&&v.opacity<=1,'Automatic view opacity must be 0–1.');
   const {entries:shown,source,presentation,corroborating,mode}=automaticViewSelection(frame.entries,v,{complete:plan.complete});
   let hash=raw.ela?.decoded_bgr8_sha256;
   if(!hash){const decoded=await automaticDecodedBgrSha256(image,{...hooks,signal});requireValue(decoded.width===width&&decoded.height===height,'Export source and automatic plan dimensions differ.');hash=decoded.sha256;}
   requireValue(typeof hash==='string'&&/^[0-9a-f]{64}$/.test(hash),'Original decoded BGR SHA-256 required.');
   const snapshot={version:1,...(plan.complete?{method:'complete_automatic_analysis',ela_profile:profile,ela_settings:settings}:{}),configuration:{patchmatch_parameters:plan.native.patchmatch,forgeryscope_parameters:plan.native.forgeryscope,zones:plan.regions,disabled_zones:plan.disabled,requested_device:plan.cpu?'cpu':'auto'},results,states:state.states,errors:state.errors,biomes:frame.entries,display:{...(plan.complete?{background:mode&&raw.ela?'ela':'original',energy_biomes:v.elaEnergy,legacy_biomes:v.elaLegacy,ela_view:['image','ela_biomes','ela','energy_low','energy_high'][v.ela.background],enabled_sources:v.enabledSources}:{}),source,forgeryscope_branch:v.forgeryscopeBranch,hidden:v.hidden.slice().sort(),focused:v.focused,minimum_length_px:frame.filters.low,maximum_length_px:frame.filters.high,maximum_overlap:frame.filters.maximumOverlap},corroboration:{entries:shown.filter(e=>CLONE_SOURCES.includes(e.source)),excluded:plan.excluded,sources:CLONE_SOURCES,metric:'integer_method_search_context_count_not_probability',relation_view:v.relation,exclude_enclosing_search:false,presentation,opacity:v.opacity,biome_opacity_policy:'visual_only_area_dependent_non_ai',ela_suppressed:corroborating,d2prl_min_component:frame.filters.d2Minimum},image_shape:[height,width,3],decoded_bgr8_sha256:hash};
   archive=await exportAutomaticAnalysis(snapshot,{...extra,automatic:{version:2,plan,attempts:state.attempts,preflightExecutions:0},providers},request,{...hooks,signal});checkAbort(signal);
   return archive;
  }catch(error){await archive?.dispose();throw error;}
  finally{const settled=await Promise.allSettled(owned.map(o=>o.release())),failed=settled.find(r=>r.status==='rejected');if(failed){await archive?.dispose();throw failed.reason;}}
 },hooks);
}
