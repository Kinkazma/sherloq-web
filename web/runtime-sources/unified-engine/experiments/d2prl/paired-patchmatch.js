import{instantiateRandomForConsumer}from'./resident-random-factory.js';
import{createInitialRecipe}from'./initial-recipe.js';
// Private opt-in facade. The shared sampler/scorer are imported by iteration-gpu;
// all other shapes, masks and fine progress callers keep the historical engine.
import {requireValue,checkAbort,controlCheckpoint,normalizeResourceError} from '../../src/errors.js';
import {allocateTypedArray} from '../../src/allocation.js';
import {preserveConvolutionPrimary} from './convolution-retirement.js';
import {retainD2prlCheckpoint} from './checkpoint.js';
import {createPatchMatch} from './patchmatch.js';
import {NativeMpsRandom} from './iteration-random-mps.js';
import {initialOffsets} from './candidates.js';
import {admitsIterationResident} from './iteration-admission.js';
import {createIterationGpu} from './iteration-gpu.js';
import {createPairedTransaction} from './paired-transaction.js';
import {replayIteration} from './replay-iteration.js';
const SIDE=448,N=SIDE*SIDE,identity=state=>JSON.stringify(state),direct=(_label,work)=>work();
const pairOf=a=>({zm:{x:a.subarray(0,N),y:a.subarray(N,2*N)},cnn:{x:a.subarray(2*N,3*N),y:a.subarray(3*N)}});
async function settleAll(actions,onFailure){const failures=[];for(const action of actions)try{await action();}catch(error){failures.push(error);}if(failures.length){onFailure(failures);for(const secondary of failures.slice(1))preserveConvolutionPrimary(failures[0],secondary);throw failures[0];}}

export async function createPairedPatchMatch(factory,{budget,operation=direct,arithmetic='mps',progressMode,onRetirementOwner,retireOutput,randomFactory,initialSourceMode='host',...historicalOptions}={}){
 requireValue(budget?.reserve&&typeof onRetirementOwner==='function'&&typeof retireOutput==='function','Iteration facade requires parent and output debt registry');
 requireValue(['host','recipe'].includes(initialSourceMode),'Declared initial source mode');
 const life=new AbortController(),debts=new Set(),constructionLossErrors=new WeakSet(),constructionUnavailableErrors=new WeakSet();let retirementFailures=[],omittedRetirementFailures=0;const attemptAll=actions=>settleAll(actions,failures=>{for(const error of failures)if(!retirementFailures.some(previous=>Object.is(previous,error))){if(retirementFailures.length<64)retirementFailures.push(error);else omittedRetirementFailures=Math.min(Number.MAX_SAFE_INTEGER,omittedRetirementFailures+1);}});let state,historical,busy=false,closed=false,retired=false,closing,runDone=Promise.resolve();
 const snapshotStats=s=>{const result={...s.retiredStats};for(const[k,v]of Object.entries(s.gpu?.stats??{}))result[k]=(result[k]??0)+v;return result;};
 const retireGpu=async s=>{if(s.gpu){s.gpuReady=false;const total=snapshotStats(s);await s.gpu.dispose();s.retiredStats=total;s.gpu=null;s.gpuReady=false;}if(s.frame){await s.frame.dispose();s.frames.delete(s.frame);s.frame=null;}if(s.initialFramePending){await s.initialFramePending.dispose();s.frames.delete(s.initialFramePending);s.initialFramePending=null;}s.pendingEngine=null;};
 const retireState=async s=>{
  if(!s)return;
  // Do not refund any CPU recipe while a GPU reader or constructor can use it.
  await retireGpu(s);
  await attemptAll([...s.transactions].map(t=>async()=>{await t.dispose();s.transactions.delete(t);}));
  await attemptAll([...s.frames].map(f=>async()=>{await f.dispose();s.frames.delete(f);}));
  if(s.random){await s.random.dispose();s.random=null;}
  await attemptAll([...s.allocations].map(a=>async()=>{await a.dispose();s.allocations.delete(a);}));
  await s.metadata?.();s.metadata=null;s.host=null;s.bounds=null;s.outputs=null;
 };
 const discard=async()=>{if(state){const old=state;state=null;debts.add(old);}await attemptAll([...debts].map(s=>async()=>{await retireState(s);debts.delete(s);}));};
 const reserveArray=(s,count,label)=>{
  const allocation={data:null,fee:null,backing:null,closing:null,retired:false,ready:false,dispose(){
   if(allocation.retired)return Promise.resolve();if(allocation.closing)return allocation.closing;
   const task=(async()=>{if(allocation.backing){await allocation.backing();allocation.backing=null;}if(allocation.fee){await allocation.fee();allocation.fee=null;}allocation.data=null;allocation.retired=true;})();allocation.closing=task;void task.finally(()=>{if(allocation.closing===task)allocation.closing=null;}).catch(()=>{});return task;
  }};s.allocations.add(allocation);allocation.fee=budget.reserve(4*count);return allocation;
 };
 const publishArray=(allocation,label)=>{allocation.backing=budget.registerBacking?.('array-buffer',allocation.data.byteLength,{owner:'d2prl',label,identity:allocation.data.buffer});allocation.ready=true;return allocation;};
 const allocate=(s,count,label)=>{const allocation=reserveArray(s,count,label);allocation.data=allocateTypedArray(Float32Array,count,{label});return publishArray(allocation,label);};
 const retireSet=async(s,set)=>attemptAll([...set].map(a=>async()=>{await a.dispose();set.delete(a);s.allocations.delete(a);}));
 const ensureGpu=async(s,signal)=>{
  // An adopted constructor can fail inside an operation that itself retries.
  // Retain it until its ACK, then admit a fresh actor for the SAME schedule.
  if(s.gpu&&!s.gpuReady)await retireGpu(s);
  if(!s.gpu)try{let adopted;const value=await createIterationGpu({budget,checkpointBatchSize:2,initialSourceMode,progressMode:'iteration-pair-atomic',signal,adoptOwner:o=>{adopted=o;s.gpu=o;}});requireValue(value===adopted,'Iteration child identity');await value.initialize({zmFeatures:s.zmFeatures,cnnFeatures:s.cnnFeatures},{signal});s.gpuReady=true;}
  catch(error){if(s.gpu?.isContextLostError(error))constructionLossErrors.add(error);if(s.gpu?.isUnavailableError(error))constructionUnavailableErrors.add(error);try{await retireGpu(s);}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw error;}
  return s.gpu;
 };
 const ensureHost=async(s,signal)=>{
  if(!s.host){requireValue(s.initialRecipeOwner?.accepted,'Accepted H0 recipe required for error replay');const output=s.outputs.find(a=>!s.batch?.outputs.includes(a.data));requireValue(output,'Disjoint H0 replay owner');s.host=await s.initialRecipeOwner.materialize(output.data,{signal});s.retiredStats.initialHostMaterializations=(s.retiredStats.initialHostMaterializations??0)+1;}
  if(s.iteration===0){
    s.boundOwners??={};for(const key of ['minX','maxX','minY','maxY'])s.boundOwners[key]??=allocate(s,N,'iteration-initial-'+key);
    if(!s.bounds){s.bounds=Object.fromEntries(Object.entries(s.boundOwners).map(([key,a])=>[key,a.data]));for(let i=0;i<N;i++){s.bounds.minX[i]=-(i%SIDE);s.bounds.maxX[i]=SIDE-i%SIDE-1;s.bounds.minY[i]=-Math.floor(i/SIDE);s.bounds.maxY[i]=SIDE-Math.floor(i/SIDE)-1;if((i&8191)===0)checkAbort(signal);}}
  }
 };
 const owner={
  get retirementErrors(){return{errors:[...retirementFailures],omitted:omittedRetirementFailures};},
  get residentBytes(){return historical?.residentBytes??0;},get stats(){const stats=state?snapshotStats(state):owner.lastStats;return stats?{backend:'webgpu',progressMode:'iteration-pair-atomic',...stats}:undefined;},
  async run(params,hooks={}){
   requireValue(!closed&&!busy,'PatchMatch unavailable');busy=true;let finishRun;runDone=new Promise(r=>finishRun=r);
   try{const {zmFeatures,cnnFeatures,cnnFinalFeatures=cnnFeatures,side=448,iterations=40,randomState,referenceThreads=8,scientificMask=null}=params,{signal,onProgress,onTrace,checkpointKey}=hooks;
   const mode=hooks.progressMode??progressMode;
   if(mode!=='iteration-pair-atomic'||!admitsIterationResident({side,arithmetic,scientificMask,cnnFeatures,cnnFinalFeatures,progressMode:'iteration-atomic',onTrace})){
    await discard();historical??=await createPatchMatch(factory,{budget,operation,...(randomFactory?{randomFactory}:{}),...historicalOptions});return historical.run(params,{...hooks,signal:AbortSignal.any([hooks.signal,life.signal].filter(Boolean))});
   }
   requireValue(Number.isInteger(iterations)&&iterations>=1&&iterations<=40&&Number.isInteger(referenceThreads)&&referenceThreads>=1&&referenceThreads<=32,'Native iteration/thread bounds');
   for(const[a,c]of[[zmFeatures,36],[cnnFeatures,96]])requireValue(a instanceof Uint16Array&&a.length===c*N,'Whole448 half descriptor banks');
   if(historical){await historical.dispose();historical=null;}
   const selected=AbortSignal.any([signal,life.signal].filter(Boolean)),randomIdentity=identity(randomState);checkAbort(selected);
   if(state&&(state.key!==checkpointKey||state.zmFeatures!==zmFeatures||state.cnnFeatures!==cnnFeatures||state.iterations!==iterations||state.referenceThreads!==referenceThreads||state.randomIdentity!==randomIdentity))await discard();
   await attemptAll([...debts].map(s=>async()=>{await retireState(s);debts.delete(s);}));
   const s=state??={key:checkpointKey,zmFeatures,cnnFeatures,iterations,referenceThreads,randomIdentity,iteration:0,calls:0,allocations:new Set(),transactions:new Set(),frames:new Set(),initialPairs:new Set(),initialNoise:new Set(),retiredStats:{},previousNonlocal:null,historical:false};
   let failed=false,primary,keep=false,result,outputOwner;
   try{
    await retireSet(s,new Set([...s.allocations].filter(a=>!a.ready)));
    s.metadata??=budget.reserve(32768);s.random??=await operation('patchmatch:rng',()=>randomFactory?instantiateRandomForConsumer(randomFactory,randomState,{resident:initialSourceMode==='recipe'}):new NativeMpsRandom(randomState));requireValue(typeof s.random.reserveSources==='function','Native ordered-source RNG required');
    if(initialSourceMode==='recipe'&&!s.initialized){
     if(s.initialRecipeOwner&&!s.initialRecipeReady){await s.initialRecipeOwner.dispose();s.transactions.delete(s.initialRecipeOwner);s.initialRecipeOwner=null;}
     if(!s.initialRecipeOwner){let adopted;const value=await createInitialRecipe({budget,random:s.random,adoptOwner:o=>{adopted=o;s.initialRecipeOwner=o;s.transactions.add(o);}});requireValue(value===adopted,'Initial recipe parent identity');s.initialRecipeReady=true;}
     await s.initialRecipeOwner.accept({operation,signal:selected});s.initialized=true;
    }
    if(!s.host&&!s.initialized){
     // Initial four calls are one transaction too. Any partial initialization
     // restores the same native state, after all values() readers have stopped.
     await retireSet(s,s.initialPairs);await retireSet(s,s.initialNoise);const before=s.random.snapshot();
     const initialRandom={values:async(count,hooks)=>{const a=reserveArray(s,count,'iteration-initial-noise');s.initialNoise.add(a);a.data=await s.random.values(count,hooks);publishArray(a,'iteration-initial-noise');return a.data;}};
     try{s.host=await operation('patchmatch:initial-offsets',async()=>{
      // operation() can retry its work without returning to the outer catch.
      // Restore all four calls together, and await partial owners before reuse.
      s.random.restore(before);await retireSet(s,s.initialPairs);await retireSet(s,s.initialNoise);
      try{return await initialOffsets(SIDE,initialRandom,{signal:selected,allocate:count=>{const a=allocate(s,count,'iteration-initial-pair');s.initialPairs.add(a);return a.data;}});}
      catch(error){try{s.random.restore(before);}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw error;}
     });}
     catch(error){try{s.random.restore(before);}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw error;}
    }
    await retireSet(s,s.initialNoise);
    if(s.host&&(initialSourceMode==='host'||s.iteration===0)){
    s.boundOwners??={};for(const key of ['minX','maxX','minY','maxY'])s.boundOwners[key]??=allocate(s,N,'iteration-initial-'+key);
    if(!s.bounds){s.bounds=Object.fromEntries(Object.entries(s.boundOwners).map(([key,a])=>[key,a.data]));for(let i=0;i<N;i++){s.bounds.minX[i]=-(i%SIDE);s.bounds.maxX[i]=SIDE-i%SIDE-1;s.bounds.minY[i]=-Math.floor(i/SIDE);s.bounds.maxY[i]=SIDE-Math.floor(i/SIDE)-1;if((i&8191)===0)checkAbort(selected);}}
    }
    s.outputs??=[];for(let i=0;i<3;i++)s.outputs[i]??=allocate(s,4*N,'iteration-checkpoint-'+i);
    while(s.iteration<iterations){
     checkAbort(selected);
     if(!s.batch){
      const length=Math.min(2,iterations-s.iteration),finals=Array.from({length},(_,j)=>s.iteration+j===iterations-1);
      const outputs=s.outputs.map(a=>a.data).filter(a=>!s.host||a.buffer!==s.host.zm.x.buffer&&a.buffer!==s.host.cnn.x.buffer).slice(0,length);
      requireValue(outputs.length===length,'Two disjoint speculative outputs beside the last accepted host');
      const transaction=await createPairedTransaction({random:s.random,countsList:finals.map(final=>final?[2*N,2*N]:[2*N,2*N,N,N,N,N]),budget,adoptOwner:t=>s.transactions.add(t)});
      s.batch={transaction,baseIteration:s.iteration,finals,outputs,engine:null,gpuBase:0,cpuReplay:false};
     }
     const batch=s.batch,transaction=batch.transaction,slot=transaction.prefix,index=s.iteration,final=batch.finals[slot],output=batch.outputs[slot];
     requireValue(index===batch.baseIteration+slot,'Accepted host cursor and calendar prefix must agree');
     const work=async({calendar,calendars,adoptGpuRetirement,adoptResultOwner})=>{
      const gpu=await ensureGpu(s,selected);batch.engine=gpu;
      if(s.historical){
       await ensureHost(s,selected);batch.cpuReplay=true;
       const value=await replayIteration({budget,engine:gpu,schedule:calendar,pairs:s.host,initialBounds:{zm:s.bounds,cnn:s.bounds},previousNonlocal:s.previousNonlocal,output,final,referenceThreads,signal:selected,adoptOwner:adoptResultOwner,adoptGpuRetirement});
       return{slots:[{ready:true,value}]};
      }
      batch.cpuReplay=false;batch.gpuBase=slot;
      if(gpu.needsCheckpoint&&!s.frame){
       if(!s.host){if(s.initialFramePending){await s.initialFramePending.dispose();s.frames.delete(s.initialFramePending);s.initialFramePending=null;}const frame=await gpu.prepareInitialRecipe({recipe:s.initialRecipeOwner.recipe,signal:selected,adoptOwner:f=>{s.frames.add(f);s.initialFramePending=f;}});s.frame=frame;s.initialFramePending=null;}
       else s.frame=await gpu.prepareFrame({pairs:s.host,bounds:{zm:s.bounds,cnn:s.bounds},initial:index===0,signal:selected,adoptOwner:f=>s.frames.add(f)});
      }
      return gpu.evaluateBatch({schedules:calendars.slice(slot),previousNonlocal:s.previousNonlocal,frame:s.frame??undefined,outputs:batch.outputs.slice(slot),finals:batch.finals.slice(slot),referenceThreads},{signal:selected,adoptGpuRetirement});
     };
     try{await transaction.prepare(slot,work,{operation,label:'patchmatch:iteration-'+index,signal:selected});}
     catch(error){
      if(s.gpu?.isNumericAdmissionError(error)){
       s.historical=true;s.gpu.invalidateBatch();await transaction.resetFailedPrefix(slot);
       await transaction.prepare(slot,work,{operation,label:'patchmatch:iteration-replay-'+index,signal:selected});
      }else if(s.gpu?.isContextLostError(error)||constructionLossErrors.has(error)){
       s.restoringLost=true;await retireGpu(s);if(!s.host)await ensureHost(s,selected);
       await transaction.prepare(slot,work,{operation,label:'patchmatch:iteration-restore-'+index,signal:selected});s.restoringLost=false;
      }else throw error;
     }
     // No await: RNG prefix, genuinely materialized host and cursor are one
     // publication. The GPU may still be at H2 after accepting only H1.
     const accepted=transaction.commit(slot);s.host=pairOf(accepted);s.iteration++;s.calls+=final?3:5;
     if(s.gpu&&batch.engine===s.gpu){if(batch.cpuReplay)s.gpu.acceptCpuCheckpoint(accepted);else s.gpu.acceptBatchPrefix(accepted,slot-batch.gpuBase+1);}
     const schedule=transaction.calendars[slot];s.previousNonlocal=final?null:[0,1].map(b=>Object.freeze({counters:Object.freeze([schedule.sources[2+2*b].counter,schedule.sources[3+2*b].counter]),key:schedule.key}));
     if(transaction.prefix===batch.finals.length){
      if(s.previousTransaction){await s.previousTransaction.dispose();s.transactions.delete(s.previousTransaction);}
      s.previousTransaction=transaction;s.batch=null;
     }
     if(s.frame){await s.frame.dispose();s.frames.delete(s.frame);s.frame=null;}
     s.initialRecipeOwner?.releaseMaterialized();checkAbort(selected);onProgress?.({iteration:index,iterations,phase:'iteration-validated',completed:s.calls,total:5*(iterations-1)+3,fraction:s.calls/(5*(iterations-1)+3),progressMode:'iteration-pair-atomic',checkpointBatchSize:2});checkAbort(selected);
    }
    s.coordinates??=[];for(let b=0;b<2;b++)if(!s.coordinates[b]){const a=allocate(s,2*N,'iteration-final-coordinates-'+b);s.coordinates[b]={allocation:a,x:a.data.subarray(0,N),y:a.data.subarray(N)};}
    for(let b=0;b<2;b++){const pair=s.host[b===0?'zm':'cnn'],q=s.coordinates[b];for(let i=0;i<N;i++){q.x[i]=Math.fround(pair.x[i]+i%SIDE);q.y[i]=Math.fround(pair.y[i]+Math.floor(i/SIDE));if((i&8191)===0)checkAbort(selected);}}
    const offsetOwner=s.outputs.find(a=>a.data?.buffer===s.host.zm.x.buffer&&a.data?.buffer===s.host.cnn.x.buffer);requireValue(offsetOwner?.ready,'Actual final offset owner');const owned=[offsetOwner,...s.coordinates.map(q=>q.allocation)];let outputRetired=false,outputClosing;
    outputOwner={dispose(){if(outputRetired)return Promise.resolve();if(outputClosing)return outputClosing;const task=attemptAll(owned.map(a=>()=>a.dispose())).then(()=>{outputRetired=true;});outputClosing=task;void task.finally(()=>{if(outputClosing===task)outputClosing=null;}).catch(()=>{});return task;}};
    result={offsets:s.host,coordinates:{zm:{x:s.coordinates[0].x,y:s.coordinates[0].y},cnn:{x:s.coordinates[1].x,y:s.coordinates[1].y}},finalRandomState:s.random.snapshot(),iterations,evaluations:s.calls,referenceThreads,residentIteration:{mode:'iteration-pair-atomic',checkpoints:iterations,stats:snapshotStats(s)},release:()=>retireOutput(outputOwner)};
    owner.lastStats=snapshotStats(s);await retireGpu(s);checkAbort(selected);
    // Remove only fully constructed result owners. Everything else is retired
    // before the scientific result is observable by the caller.
    for(const a of owned)s.allocations.delete(a);await discard();checkAbort(selected);return result;
   }catch(error){failed=true;primary=error;keep=!closed&&(retainD2prlCheckpoint(error,selected,checkpointKey)||!!checkpointKey&&!selected.aborted&&s.restoringLost&&(s.gpu?.isUnavailableError(error)||constructionUnavailableErrors.has(error)));throw error;}
   finally{
    let bad=false,cleanup;
    try{if(keep){await retireGpu(s);}else await discard();}catch(error){bad=true;cleanup=error;}
    if(failed&&outputOwner)try{await retireOutput(outputOwner);}catch(error){if(!bad){bad=true;cleanup=error;}}
    if(bad){if(failed)preserveConvolutionPrimary(primary,cleanup);else{if(result)try{await result.release();}catch{}throw cleanup;}}
   }
   }finally{busy=false;finishRun();}
  },
  async releaseCheckpoint(key){requireValue(!busy,'PatchMatch busy');if(key===undefined||state?.key===key)await discard();await historical?.releaseCheckpoint(key);},
  checkpointSnapshot(){return state?{completed:state.calls,nextIteration:state.iteration,pending:!!state.batch,progressMode:'iteration-pair-atomic',...(initialSourceMode==='recipe'?{hostMaterialized:!!state.host,initialRecipeAccepted:state.initialRecipeOwner?.accepted===true}:{} )}:historical?.checkpointSnapshot()??null;},
  dispose(){if(retired)return Promise.resolve();if(closing)return closing;closed=true;life.abort();const task=(async()=>{await runDone;await discard();await historical?.dispose();historical=null;retired=true;})();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;}
 };
 onRetirementOwner(owner);return owner;
}
