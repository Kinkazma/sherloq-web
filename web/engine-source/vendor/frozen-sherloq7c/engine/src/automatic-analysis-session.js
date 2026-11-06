import {retainAutomaticElaValue} from './automatic-ela-owner.js';
import {noisesnifferOwnerRetirement as ownerRetirement} from './noisesniffer-owner-retirement.js';
import {EngineError,requireValue,checkAbort,normalizeResourceError,serializeEngineError,resourceAllocationKind,isResumableResourceError,isRecoverableTransportError,isRecoverableNetworkError,isFixedAdmissionError,resourceRecoveryBytes} from './errors.js';
import {ResourceRecoveryController,runWithResourceRecovery,recoverResourceFailure} from './resource-recovery.js';
import {createCloneRelationAnnotator,CLONE_SOURCES} from './clone-relations.js';
import {scientificJsonBound} from './scientific-json.js';
import {markColdStoredResults} from './segmented-bytes.js';

function shared(owner) {
 requireValue(owner&&Object.hasOwn(owner,'value')&&owner.value!==undefined&&typeof owner.release==='function','Automatic provider must return owned {value,release}.');
 return retainAutomaticElaValue(owner.value,()=>owner.release());
}
function displayFilters(input,plan) {
 requireValue(input&&typeof input==='object'&&!Array.isArray(input),'Automatic filter record required.');
 const f={low:10,high:Infinity,maximumOverlap:.8,d2Minimum:plan.jobs.find(j=>j.id==='d2prl')?.minimum??500,elaThreshold:2,elaMinimum:3,energyThresholds:undefined,...input};
 requireValue(Object.keys(input).every(k=>Object.hasOwn(f,k)&&['low','high','maximumOverlap','d2Minimum','elaThreshold','elaMinimum','energyThresholds'].includes(k)),'Unknown automatic display filter.');
 requireValue(Number.isFinite(f.low)&&f.low>=0&&(Number.isFinite(f.high)||f.high===Infinity)&&f.high>=f.low&&Number.isFinite(f.maximumOverlap)&&f.maximumOverlap>=0&&f.maximumOverlap<=1&&Number.isInteger(f.d2Minimum)&&f.d2Minimum>=0&&f.d2Minimum<=5000&&Number.isFinite(f.elaThreshold)&&f.elaThreshold>0&&Number.isInteger(f.elaMinimum)&&f.elaMinimum>=1&&(!f.energyThresholds||Array.isArray(f.energyThresholds)&&f.energyThresholds.length===2&&f.energyThresholds.every(x=>Number.isFinite(x)&&x>=0)),'Invalid automatic display filters.');
 return structuredClone(f);
}
function keyFor(id,f){return JSON.stringify(id==='d2prl'?[f.d2Minimum]:id==='ela'?[f.elaThreshold,f.elaMinimum,f.energyThresholds]:[f.low,f.high,f.maximumOverlap]);}

/** Lifecycle for real, injected M1–M5 providers sharing the same Budget.
 * run(job,hooks) -> owned raw value; prepare(value,filters,hooks) -> owned
 * {entries,...scientific}. No algorithm is implemented or substituted here. */
export function createAutomaticAnalysisSession({plan,providers,budget,maxConcurrent=5}) {
 requireValue(plan?.version===2&&Array.isArray(plan.jobs)&&new Set(plan.jobs.map(j=>j.id)).size===plan.jobs.length&&plan.jobs.every(j=>['patchmatch','sift','forgeryscope','d2prl','ela'].includes(j.id))&&providers&&typeof budget?.reserve==='function'&&Number.isInteger(maxConcurrent)&&maxConcurrent>=1&&maxConcurrent<=5,'Automatic plan, real providers and shared budget required.');
 const controlRelease=budget.reserve(8192+scientificJsonBound(plan)*8);try{plan=structuredClone(plan);}catch(error){controlRelease();throw error;}
 const providerMap=Object.fromEntries(plan.jobs.map(j=>[j.id,providers[j.id]])),controller=new AbortController(),raw=new Map(),cache=new Map(),states=Object.fromEntries(plan.jobs.map(j=>[j.id,j.enabled?'pending':j.state])),errors={},attempts={},pendingErrors={};
 let relationAnnotator,disposed=false,runPromise,preparation=Promise.resolve(),disposal,retirement,running=false,runController=new AbortController(),committedFilters,committedFiltersRelease;
 const previewRetirements=new Set(),drainPreviewRetirements=async()=>{for(const retire of [...previewRetirements])await retire();};
 const filterIdentity=f=>JSON.stringify([keyFor('patchmatch',f),keyFor('d2prl',f),keyFor('ela',f)]);
 const executionId=crypto.randomUUID(),checkpointKeys=Object.fromEntries(plan.jobs.map(job=>[job.id,executionId+'/'+job.id]));
 const resumable=id=>states[id]==='cancelled'||states[id]==='failed'&&isResumableResourceError(errors[id]);
 const availability=()=>Object.fromEntries([...raw].flatMap(([id,owner])=>{const v=owner.value.metadata?.nativeContextAvailability;return v?.schema==='sherloq.native-context-availability/1'&&['partial','not-evaluable'].includes(v.status)?[[id,structuredClone(v)]]:[];}));
 const snapshot=()=>{const native=availability();return {...(Object.keys(native).length?{nativeContextAvailability:native}:{}),states:{...states},errors:structuredClone(errors),...(Object.keys(pendingErrors).length?{pendingErrors:structuredClone(pendingErrors)}:{}),attempts:{...attempts},completed:[...raw.keys()],running:plan.jobs.filter(j=>states[j.id]==='running').map(j=>j.id),resumable:plan.jobs.filter(job=>job.enabled&&resumable(job.id)).map(job=>job.id),preflightExecutions:0};};
 function open(){if(disposed)throw new EngineError('DISPOSED','Automatic session disposed.');}
 function acquireResults(){open();const leases=[...raw].map(([id,owner])=>[id,owner.retain()]),retire=ownerRetirement(leases.map(([,lease])=>()=>lease.release()));return {values:Object.fromEntries(leases.map(([id,lease])=>[id,lease.value])),release:retire};}
 async function execute({signal,onProgress,onState}={},jobs=plan.jobs.filter(job=>job.enabled)) {
  const joined=AbortSignal.any([controller.signal,runController.signal,...(signal?[signal]:[])]),retries=[],recoveries=new Map(),phases=new Map(),pressure=new Map();let observerError,settledPeers=0;
  const recoveryFor=id=>{if(!recoveries.has(id))recoveries.set(id,new ResourceRecoveryController());return recoveries.get(id);};
  const releasePressure=id=>{pressure.get(id)?.();pressure.delete(id);};
  function progressFor(job,progress,producer){
   if(progress.phase?.startsWith('resource-'))return;phases.set(job.id,progress.phase??progress.stage??'run');
   const completed=Number.isFinite(progress.completed)?progress.completed:Number.isFinite(progress.fraction)?Math.floor(progress.fraction*1000):undefined;
   const key=[progress.phase??'',progress.stage??'',progress.zone??progress.zoneIndex??'',progress.branch??'',progress.field??progress.variant??'',progress.iteration??''].join('|');
   if(completed!==undefined&&recoveryFor(job.id).progress({key,completed})){releasePressure(job.id);if(Number.isFinite(progress.total)&&completed>=progress.total||progress.fraction===1)producer?.commit?.();}
  }
  function notify(callback,value){if(observerError)return;try{callback?.(value);}catch(error){observerError=error;runController.abort();}}
  async function launch(job,concurrency) {
   if(joined.aborted)return;
   delete pendingErrors[job.id];states[job.id]='running';attempts[job.id]=(attempts[job.id]??0)+1;notify(onState,snapshot());let output;const producer=budget.beginResourceProducer?.(job.id);
   try {
    checkAbort(joined);const provider=providerMap[job.id];if(typeof provider?.run!=='function')throw new EngineError('ENGINE_UNAVAILABLE','Real automatic provider unavailable: '+job.id);
    output=await provider.run(structuredClone(job),{plan:structuredClone(plan),budget,signal:joined,concurrency,attempt:attempts[job.id],checkpointKey:checkpointKeys[job.id],onProgress:progress=>{if(joined.aborted)return;if(progress.phase==='resource-draining'){pendingErrors[job.id]={error:progress.error,activeFields:progress.activeFields,completedFields:progress.completedFields};notify(onState,snapshot());}progressFor(job,progress,producer);notify(onProgress,{...progress,group:job.id,attempt:progress.attempt??attempts[job.id],groupAttempt:attempts[job.id]});checkAbort(joined);}});
    checkAbort(joined);markColdStoredResults(output.value);const owned=shared(output);raw.set(job.id,owned);output=null;delete pendingErrors[job.id];states[job.id]='done';recoveryFor(job.id).success();
   } catch(caught) {
    delete pendingErrors[job.id];const error=normalizeResourceError(caught);
    if(joined.aborted||error?.code==='CANCELLED')states[job.id]='cancelled';
    else{
     const decision=recoveryFor(job.id).fail(error,{operation:job.id,phase:phases.get(job.id)??'run',memory:budget.snapshot?.()??{}});
     if(decision.retry){
      states[job.id]='waiting-memory';if(!pressure.has(job.id)&&!isRecoverableTransportError(error)&&!isRecoverableNetworkError(error)&&!isFixedAdmissionError(error))pressure.set(job.id,budget.beginRecovery?.({kind:resourceAllocationKind(error)??undefined,owner:job.id,requestedBytes:resourceRecoveryBytes(error)})??(()=>{}));
      try{let opportunity;const freed=await recoverResourceFailure(decision,{controller:recoveryFor(job.id),budget,signal:joined,operation:job.id,phase:phases.get(job.id)??'run',owner:job.id,attempt:attempts[job.id],onRecovery:event=>notify(onProgress,{...event,group:job.id}),onReclaim:event=>notify(onProgress,{...event,group:job.id}),onWait:event=>notify(onProgress,{...event,group:job.id}),onOpportunity:event=>{opportunity=event.reason;}});opportunity??=isRecoverableTransportError(error)?'transport-retry':isRecoverableNetworkError(error)?'network-retry':undefined;retries.push({job,after:settledPeers,freed,opportunity});}
      catch(recoveryError){if(joined.aborted||recoveryError?.code==='CANCELLED')states[job.id]='cancelled';else{states[job.id]='failed';errors[job.id]=serializeEngineError(recoveryError,'COMPUTE_FAILED');}}
     }else{states[job.id]='failed';errors[job.id]=serializeEngineError(decision.error,'COMPUTE_FAILED');}
    }
   } finally {try{await output?.release?.();}finally{producer?.();if(states[job.id]!=='waiting-memory')releasePressure(job.id);notify(onState,snapshot());}}
  }
  try {
   const pending=[...jobs],active=new Map();let failure;
   while(pending.length||retries.length||active.size){
    if(!joined.aborted){
     // Other useful providers keep running at the configured capacity. A failed
     // provider resumes after causal reclaim, peer settlement, or when alone; its
     // own high-water checkpoints distinguish progress from replay.
     const ready=[];
     for(let i=0;i<retries.length&&ready.length<maxConcurrent-active.size;){
      const item=retries[i];if(!active.has(item.job.id)&&(!active.size||settledPeers>item.after||item.freed>0||['admission-credit','backing-reusable','backing-released','transport-retry','network-retry'].includes(item.opportunity))){ready.push(item.job);retries.splice(i,1);}else i++;
     }
     while(pending.length&&ready.length<maxConcurrent-active.size)ready.push(pending.shift());
     const concurrency=active.size+ready.length;
     for(const job of ready)active.set(job.id,launch(job,concurrency).then(()=>({id:job.id}),error=>({id:job.id,error})));
    }
    if(!active.size)break;
    const settled=await Promise.race(active.values());active.delete(settled.id);
    if(states[settled.id]!=='waiting-memory')settledPeers++;
    if(settled.error){failure??=settled.error;runController.abort();}
   }
   if(failure)throw failure;
   if(observerError)throw observerError;checkAbort(joined);return snapshot();
  } finally {for(const id of pressure.keys())releasePressure(id);for(const job of plan.jobs)if(['pending','running','waiting-memory'].includes(states[job.id]))states[job.id]='cancelled';notify(onState,snapshot());if(observerError)throw observerError;}
 }
 function enqueuePreparation(input={},hooks={},visitor) {
  open();const filters=displayFilters(input,plan),joined=hooks.signal?AbortSignal.any([hooks.signal,controller.signal]):controller.signal;
  const work=async()=>{
   open();checkAbort(joined);await drainPreviewRetirements();checkAbort(joined);if(visitor)requireValue(plan.jobs.every(j=>!['pending','running','waiting-memory'].includes(states[j.id])),'Scientific snapshots require settled automatic detector jobs.');const borrowed=acquireResults(),held=[];let frameRelease,complete=false;
   try {
    for(const job of plan.jobs){const value=borrowed.values[job.id];if(value===undefined)continue;checkAbort(joined);
     const key=keyFor(job.id,filters);let item=cache.get(job.id);
     if(item?.key!==key||job.id==='d2prl'&&item.raw!==value){const provider=providerMap[job.id];requireValue(typeof provider?.prepare==='function','Real automatic entry provider required: '+job.id);let output;
      try{output=await runWithResourceRecovery(({resourceOperation})=>provider.prepare(value,structuredClone(filters),{...hooks,resourceOperation,plan:structuredClone(plan),budget,signal:joined,group:job.id}),{budget,signal:joined,operation:job.id,phase:'prepare',owner:job.id,onRecovery:event=>hooks.onProgress?.({...event,group:job.id}),onReclaim:event=>hooks.onProgress?.({...event,group:job.id}),onWait:event=>hooks.onProgress?.({...event,group:job.id})});checkAbort(joined);requireValue(Array.isArray(output?.value?.entries),'Automatic entry provider must return native entries.');const owned=shared(output);output=null;const previous=item;item={key,owner:owned,...(job.id==='d2prl'?{raw:value}:{})};cache.set(job.id,item);await previous?.owner.release();}finally{await output?.release?.();}
     }
     held.push([job.id,item.owner.retain()]);
    }
    const entries=held.flatMap(([,lease])=>lease.value.entries),bytes=4096+entries.reduce((sum,e)=>sum+2048+(e.polygons??[]).reduce((n,p)=>n+p.length*48,0),0);
    frameRelease=budget.reserve(bytes);checkAbort(joined);
    // Plan geometry is immutable and belongs to the admitted control workspace.
    // Cache its parsing/areas only; entry coordinates and returned arrays stay fresh.
    const clones=(relationAnnotator??=createCloneRelationAnnotator(plan))(entries.filter(e=>CLONE_SOURCES.includes(e.source))),others=entries.filter(e=>!CLONE_SOURCES.includes(e.source));
    const retireFrame=ownerRetirement(held.map(([,lease])=>()=>lease.release()),{onRetired:frameRelease});
    const result={entries:[...clones,...others],filters,groups:Object.fromEntries(held.map(([id,lease])=>[id,lease.value])),release:retireFrame};
    const nextFilterRelease=budget.reserve(4096+2*scientificJsonBound(filters));let nextFilters;try{nextFilters=structuredClone(filters);}catch(error){nextFilterRelease();throw error;}committedFiltersRelease?.();committedFiltersRelease=nextFilterRelease;committedFilters=nextFilters;
    complete=true;
    if(visitor){try{return await visitor({frame:result,results:borrowed.values,plan:structuredClone(plan),state:snapshot(),signal:joined,readRaw(id){requireValue(Object.hasOwn(borrowed.values,id)&&typeof providerMap[id]?.readRaw==='function','Owned raw-grid provider unavailable: '+id);return providerMap[id].readRaw(borrowed.values[id]);}});}finally{await result.release();}}
    return result;
   } finally {await borrowed.release();if(!complete){await Promise.allSettled(held.map(([,l])=>l.release()));frameRelease?.();}}
  };
  const next=preparation.then(work,work);preparation=next.then(()=>undefined,()=>undefined);return next;
 }
 function prepareD2Preview({minimum,filters}={},hooks={}){
  open();requireValue(committedFilters&&Number.isInteger(minimum)&&minimum>=0&&minimum<=5000,'A committed automatic frame and D2PRL minimum are required.');const expected=displayFilters(filters??committedFilters,plan),identity=filterIdentity(expected),joined=hooks.signal?AbortSignal.any([hooks.signal,controller.signal]):controller.signal;
  const work=async()=>{open();checkAbort(joined);await drainPreviewRetirements();checkAbort(joined);requireValue(committedFilters&&filterIdentity(committedFilters)===identity&&plan.jobs.every(j=>!['pending','running','waiting-memory'].includes(states[j.id])),'Automatic preview basis or committed filters changed.');
   let borrowed,temporary,frameRelease,complete=false,failed=false,retirement;const held=[];
   const release=()=>{if(!retirement){retirement=ownerRetirement([()=>temporary?.release(),...held.map(([,lease])=>()=>lease.release()),()=>borrowed?.release()],{onRetired(){frameRelease?.();previewRetirements.delete(retirement);}});previewRetirements.add(retirement);}return retirement();};
   try{borrowed=acquireResults();const value=borrowed.values.d2prl,provider=providerMap.d2prl;requireValue(value&&typeof provider?.prepareTemporary==='function','Retained D2PRL preview is unavailable.');
    for(const job of plan.jobs){if(job.id==='d2prl'||borrowed.values[job.id]===undefined)continue;const item=cache.get(job.id);if(!item||item.key!==keyFor(job.id,expected))throw new EngineError('CACHE_MISS','An unchanged automatic group has no compatible prepared lease: '+job.id);held.push([job.id,item.owner.retain()]);}
    const calculated={...expected,d2Minimum:minimum},item=cache.get('d2prl');
    // The cache lease already owns these exact entries for this session's raw
    // result. Borrow it without adopting a provider result or changing filters.
    if(item?.key===keyFor('d2prl',calculated)&&item.raw===value)temporary=item.owner.retain();
    else{temporary=await provider.prepareTemporary(value,structuredClone(calculated),{...hooks,plan:structuredClone(plan),budget,signal:joined,group:'d2prl'});checkAbort(joined);requireValue(Array.isArray(temporary?.value?.entries)&&temporary.value.calculatedMinimum===minimum&&temporary.value.inferences===0,'Owned non-inference D2PRL preview entries required.');}
    checkAbort(joined);
    const groups=Object.fromEntries(held.map(([id,lease])=>[id,lease.value]));groups.d2prl=temporary.value;const entries=plan.jobs.flatMap(job=>groups[job.id]?.entries??[]),bytes=4096+entries.reduce((sum,e)=>sum+2048+(e.polygons??[]).reduce((n,p)=>n+p.length*48,0),0);frameRelease=budget.reserve(bytes);const annotate=createCloneRelationAnnotator(plan),clones=annotate(entries.filter(e=>CLONE_SOURCES.includes(e.source))),others=entries.filter(e=>!CLONE_SOURCES.includes(e.source));checkAbort(joined);complete=true;return{entries:[...clones,...others],groups,filters:calculated,calculatedMinimum:minimum,inferences:0,release};
   }catch(error){failed=true;throw error;}finally{if(!complete)try{await release();}catch(error){if(!failed)throw error;}}
  };const next=preparation.then(work,work);preparation=next.then(()=>undefined,()=>undefined);return next;
 }
 return {
  snapshot,acquireResults,prepareD2Preview,
  previewD2FilterIdentity(){open();return committedFilters?filterIdentity(committedFilters):undefined;},
  prepare(input,hooks){return enqueuePreparation(input,hooks);},
  withSnapshot(input,visitor,hooks){requireValue(typeof visitor==='function','Scientific snapshot consumer required.');return enqueuePreparation(input,hooks,visitor);},
  run(hooks){open();if(runPromise)throw new EngineError('ALREADY_RUN','Create a new automatic session to change source, scope or detector parameters.');running=true;runPromise=execute(hooks).finally(()=>{running=false;});return runPromise;},
  // Explicit continuation after a terminal run. Automatic inner recovery never
  // invokes this entry point or resets its own five-comparable-failure guard.
  resume({groups}={},hooks){open();requireValue(runPromise&&!running,'Automatic analysis must be settled before explicit resume.');const ids=groups??plan.jobs.filter(job=>job.enabled&&resumable(job.id)).map(job=>job.id);requireValue(Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>plan.jobs.some(job=>job.id===id&&job.enabled)&&resumable(id)),'Only failed recoverable or cancelled groups can resume.');const jobs=plan.jobs.filter(job=>ids.includes(job.id));for(const job of jobs){states[job.id]='pending';delete errors[job.id];}runController=new AbortController();running=true;runPromise=execute(hooks,jobs).finally(()=>{running=false;});return runPromise;},
  cancel(){runController.abort();},
  dispose(){if(disposal)return disposal;disposed=true;controller.abort();disposal=(async()=>{await Promise.allSettled([runPromise,preparation]);await drainPreviewRetirements();retirement??=ownerRetirement([...raw.values(),...[...cache.values()].map(v=>v.owner)].map(owner=>()=>owner.release()).concat(Object.entries(providerMap).map(([id,provider])=>()=>provider?.releaseCheckpoint?.(checkpointKeys[id]))),{onRetired(){raw.clear();cache.clear();relationAnnotator=null;committedFilters=null;committedFiltersRelease?.();committedFiltersRelease=null;controlRelease();}});await retirement();})().catch(error=>{disposal=undefined;throw error;});return disposal;}
 };
}
