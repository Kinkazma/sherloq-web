import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {annotateRelations,CLONE_SOURCES} from './clone-relations.js';
import {scientificJsonBound} from './scientific-json.js';

function shared(owner) {
 requireValue(owner&&Object.hasOwn(owner,'value')&&owner.value!==undefined&&typeof owner.release==='function','Automatic provider must return owned {value,release}.');
 let references=1;
 function lease(){let released=false;return {value:owner.value,async release(){if(released)return;released=true;if(--references===0)await owner.release();}};}
 const base=lease();return {...base,retain(){requireValue(references>0,'Automatic result disposed.');references++;return lease();}};
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
 const providerMap=Object.fromEntries(plan.jobs.map(j=>[j.id,providers[j.id]])),controller=new AbortController(),runController=new AbortController(),raw=new Map(),cache=new Map(),states=Object.fromEntries(plan.jobs.map(j=>[j.id,j.enabled?'pending':j.state])),errors={},attempts={};
 let disposed=false,runPromise,preparation=Promise.resolve(),disposal;
 const snapshot=()=>({states:{...states},errors:structuredClone(errors),attempts:{...attempts},completed:[...raw.keys()],running:plan.jobs.filter(j=>states[j.id]==='running').map(j=>j.id),preflightExecutions:0});
 function open(){if(disposed)throw new EngineError('DISPOSED','Automatic session disposed.');}
 function acquireResults(){open();const leases=[...raw].map(([id,owner])=>[id,owner.retain()]);let released=false;return {values:Object.fromEntries(leases.map(([id,l])=>[id,l.value])),async release(){if(released)return;released=true;const settled=await Promise.allSettled(leases.map(([,l])=>l.release()));const failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;}};}
 async function execute({signal,onProgress,onState}={}) {
  const joined=AbortSignal.any([controller.signal,runController.signal,...(signal?[signal]:[])]),retries=[];let observerError,concurrencyLimit=maxConcurrent,settledPeers=0;
  function notify(callback,value){if(observerError)return;try{callback?.(value);}catch(error){observerError=error;runController.abort();}}
  async function launch(job,concurrency) {
   if(joined.aborted)return;
   states[job.id]='running';attempts[job.id]=(attempts[job.id]??0)+1;notify(onState,snapshot());let output;
   try {
    checkAbort(joined);const provider=providerMap[job.id];if(typeof provider?.run!=='function')throw new EngineError('ENGINE_UNAVAILABLE','Real automatic provider unavailable: '+job.id);
    output=await provider.run(structuredClone(job),{plan:structuredClone(plan),budget,signal:joined,concurrency,attempt:attempts[job.id],onProgress:progress=>{if(joined.aborted)return;notify(onProgress,{...progress,group:job.id,attempt:attempts[job.id]});checkAbort(joined);}});
    checkAbort(joined);const owned=shared(output);raw.set(job.id,owned);output=null;states[job.id]='done';
   } catch(error) {
    if(joined.aborted||error.code==='CANCELLED')states[job.id]='cancelled';
    else if(error.code==='MEMORY_LIMIT'&&concurrency>1){
     states[job.id]='waiting-memory';concurrencyLimit=Math.min(concurrencyLimit,concurrency-1);
     retries.push({job,after:settledPeers});
    }
    else{states[job.id]='failed';errors[job.id]={code:error.code??'COMPUTE_FAILED',message:error.message??String(error)};}
   } finally {await output?.release?.();notify(onState,snapshot());}
  }
  try {
   const jobs=plan.jobs.filter(j=>j.enabled);
   const pending=[...jobs],active=new Map();let failure;
   while(pending.length||retries.length||active.size){
    if(!joined.aborted){
     // A resource failure lowers concurrency immediately. Retry only after a
     // peer settles (or alone), never just because the failed attempt stopped.
     // The strictly decreasing limit bounds retries without probes or polling.
     const ready=[];
     for(let i=0;i<retries.length&&ready.length<concurrencyLimit-active.size;){
      const item=retries[i];if(!active.has(item.job.id)&&(!active.size||settledPeers>item.after)){ready.push(item.job);retries.splice(i,1);}else i++;
     }
     while(pending.length&&ready.length<concurrencyLimit-active.size)ready.push(pending.shift());
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
  } finally {for(const job of plan.jobs)if(['pending','running','waiting-memory'].includes(states[job.id]))states[job.id]='cancelled';notify(onState,snapshot());if(observerError)throw observerError;}
 }
 function enqueuePreparation(input={},hooks={},visitor) {
  open();const filters=displayFilters(input,plan),joined=hooks.signal?AbortSignal.any([hooks.signal,controller.signal]):controller.signal;
  const work=async()=>{
   open();checkAbort(joined);if(visitor)requireValue(plan.jobs.every(j=>!['pending','running','waiting-memory'].includes(states[j.id])),'Scientific snapshots require settled automatic detector jobs.');const borrowed=acquireResults(),held=[];let frameRelease,complete=false;
   try {
    for(const job of plan.jobs){const value=borrowed.values[job.id];if(value===undefined)continue;checkAbort(joined);
     const key=keyFor(job.id,filters);let item=cache.get(job.id);
     if(item?.key!==key){const provider=providerMap[job.id];requireValue(typeof provider?.prepare==='function','Real automatic entry provider required: '+job.id);let output;
      try{output=await provider.prepare(value,structuredClone(filters),{...hooks,plan:structuredClone(plan),budget,signal:joined,group:job.id});checkAbort(joined);requireValue(Array.isArray(output?.value?.entries),'Automatic entry provider must return native entries.');const owned=shared(output);output=null;const previous=item;item={key,owner:owned};cache.set(job.id,item);await previous?.owner.release();}finally{await output?.release?.();}
     }
     held.push([job.id,item.owner.retain()]);
    }
    const entries=held.flatMap(([,lease])=>lease.value.entries),bytes=4096+entries.reduce((sum,e)=>sum+2048+(e.polygons??[]).reduce((n,p)=>n+p.length*48,0),0);
    frameRelease=budget.reserve(bytes);checkAbort(joined);
    const clones=annotateRelations(entries.filter(e=>CLONE_SOURCES.includes(e.source)),plan),others=entries.filter(e=>!CLONE_SOURCES.includes(e.source));let released=false;
    const result={entries:[...clones,...others],filters,groups:Object.fromEntries(held.map(([id,lease])=>[id,lease.value])),async release(){if(released)return;released=true;try{const settled=await Promise.allSettled(held.map(([,l])=>l.release())),failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;}finally{frameRelease();}}};
    complete=true;
    if(visitor){try{return await visitor({frame:result,results:borrowed.values,plan:structuredClone(plan),state:snapshot(),signal:joined,readRaw(id){requireValue(Object.hasOwn(borrowed.values,id)&&typeof providerMap[id]?.readRaw==='function','Owned raw-grid provider unavailable: '+id);return providerMap[id].readRaw(borrowed.values[id]);}});}finally{await result.release();}}
    return result;
   } finally {await borrowed.release();if(!complete){await Promise.allSettled(held.map(([,l])=>l.release()));frameRelease?.();}}
  };
  const next=preparation.then(work,work);preparation=next.then(()=>undefined,()=>undefined);return next;
 }
 return {
  snapshot,acquireResults,
  prepare(input,hooks){return enqueuePreparation(input,hooks);},
  withSnapshot(input,visitor,hooks){requireValue(typeof visitor==='function','Scientific snapshot consumer required.');return enqueuePreparation(input,hooks,visitor);},
  run(hooks){open();if(runPromise)throw new EngineError('ALREADY_RUN','Create a new automatic session to change source, scope or detector parameters.');runPromise=execute(hooks);return runPromise;},
  cancel(){runController.abort();},
  dispose(){if(disposal)return disposal;disposed=true;controller.abort();disposal=(async()=>{try{await Promise.allSettled([runPromise,preparation]);const owners=[...raw.values(),...[...cache.values()].map(v=>v.owner)];raw.clear();cache.clear();const settled=await Promise.allSettled(owners.map(o=>o.release())),failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;}finally{controlRelease();}})();return disposal;}
 };
}
