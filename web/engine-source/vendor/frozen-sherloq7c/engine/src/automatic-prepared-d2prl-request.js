import {declaredCloneScopeRegions} from './clone-scope-declarations.js';
import {localizeSourceRegionTask} from './source-region-localize.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

/** Recreate a native D2PRL request from the aggregate's verified Original
 * preparation. Every acquisition and explicit comparison envelope remains a
 * separate job. Localization is certified once, not guessed from a crop ID.
 * This function plans no model execution and never reads RGB. */
export async function automaticPreparedD2prlRequest(prepared,{id,imageId,minimum=500,cpu=false},{budget,signal}={}){
 requireValue(['analysis.clones','analysis.complete'].includes(prepared?.originalTask?.operation)&&typeof id==='string'&&typeof imageId==='string'&&Number.isInteger(minimum)&&minimum>=0&&minimum<=5000&&typeof cpu==='boolean','Verified automatic clone preparation and D2PRL request identity required.');
 const scope=prepared.originalTask.params?.scientificScope;requireValue(scope?.status==='ready'&&Array.isArray(scope.regions)&&scope.regions.length>0,'D2PRL aggregate jobs require the actual prepared acquisitions.');
 const release=budget.reserve(65536+sourceRegionTransportBytes(scope,{allowAliases:true,allowUndefined:true})*8+(scope.regions.length+(scope.searchRegions?.length??0)+1)*2048);let complete=false;
 try{
  checkAbort(signal);const domain=prepared.sourceDomain,frame=domain.rect,declared=declaredCloneScopeRegions(scope),isEnvelope=r=>r.envelope===true||r.kind==='envelope',requests=declared.filter(r=>!isEnvelope(r)).map((r,index)=>({region:r,index,kind:'region'})),envelopes=declared.filter(isEnvelope);
  if(envelopes.length)requests.push(...envelopes.map((region,index)=>({region,index,kind:'envelope'})));
  // Only explicitly prepared envelopes are additional analysis windows.
  const regions=[],skipped=[],jobs=[];
  for(const requested of requests){
   checkAbort(signal);const r=requested.region;requireValue(r&&[r.x0,r.y0,r.x1,r.y1].every(Number.isFinite)&&r.x1>r.x0&&r.y1>r.y0,'Invalid native automatic D2PRL job bounds.');
   const originalBounds=[Math.floor(r.x0),Math.floor(r.y0),Math.ceil(r.x1),Math.ceil(r.y1)],bounds=[Math.max(frame.x0,originalBounds[0]),Math.max(frame.y0,originalBounds[1]),Math.min(frame.x1,originalBounds[2]),Math.min(frame.y1,originalBounds[3])];let candidates=0;
   for(let y=bounds[1];y<bounds[3];y++){if(y%32===0)await controlCheckpoint(signal);for(const[a,b]of prepared.candidateDomain.originalRowIntervals(y))candidates+=Math.max(0,Math.min(b,bounds[2])-Math.max(a,bounds[0]));}
   const job={id:'automatic-'+requested.kind+'-'+requested.index,kind:requested.kind,bounds},receipt={...job,originalBounds,sourceRegionIndex:requested.index,candidates};
   if(bounds[2]<=bounds[0]||bounds[3]<=bounds[1]||!candidates){skipped.push({...receipt,status:'no-native-candidate-pixels'});continue;}
   regions.push(job);jobs.push(receipt);
  }
  requireValue(regions.length>0,'The prepared D2PRL acquisition set has no admitted native candidate pixels.');
  const task=await localizeSourceRegionTask({id,imageId,operation:'ai.clones.d2prl',cloneWindowMode:prepared.originalTask.cloneWindowMode??'independent',backend:cpu?'cpu':'auto',params:{minimum,selectionPresent:true,scientificScope:structuredClone(scope)},regions},domain,{signal,strictNeuralFragments:true});checkAbort(signal);
  let closed=false;complete=true;return{task,metadata:{schema:'sherloq.automatic-d2prl-jobs/1',coordinates:'original-pixels',candidateFingerprint:prepared.candidateDomain.fingerprint,contextFingerprint:prepared.contextDomain.fingerprint,jobs,skipped,acquisitions:jobs.filter(j=>j.kind==='region').length,envelopes:jobs.filter(j=>j.kind==='envelope').length,modelExecuted:false},release(){if(!closed){closed=true;release();}}};
 }finally{if(!complete)release();}
}
