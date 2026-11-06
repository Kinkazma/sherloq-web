/* Global, bounded Splicebuster PCA/EM orchestration. GRIP-UNINA licence applies.
 * The caller supplies the only Budget, worker run function and bank factory. */
import {EngineError,checkAbort,requireValue,createCooperator} from '../../errors.js';
import {allocateOwnedTypedArray} from '../../allocation.js';
import {streamMemoryPlan} from './stream-backend.mjs';
import {cpuMemoryPlan} from './backend.mjs';

function settings(params={}){
 const p={seed:params.seed??0,replicates:params.replicates??30,maxIter:params.maxIter??100,relErr:params.relErr??1e-5,outliersNlogl:params.outliersNlogl??42,dimensions:params.dimensions??25,flagDropSaturated:params.flagDropSaturated??2};
 requireValue(Number.isInteger(p.seed)&&p.seed>=0&&p.seed<=0xffffffff&&Number.isInteger(p.replicates)&&p.replicates>=1&&p.replicates<=30&&Number.isInteger(p.maxIter)&&p.maxIter>=1&&p.maxIter<=100&&Number.isFinite(p.relErr)&&p.relErr>0&&Number.isFinite(p.outliersNlogl)&&p.dimensions===25&&[0,1,2].includes(p.flagDropSaturated),'Invalid Splicebuster scientific parameters.');
 return Object.freeze(p);
}
function basic({budget,run,createBank,chunkRows,nAll}){
 requireValue(budget&&typeof budget.reserve==='function'&&typeof run==='function','Parent Budget and run function required.');
 if(createBank!==undefined)requireValue(typeof createBank==='function','Parent bank factory required.');
 requireValue(Number.isSafeInteger(chunkRows)&&chunkRows>0&&Number.isSafeInteger(nAll)&&nAll>0,'Invalid banked dimensions.');
}
function scope(){
 const entries=[];let releasing;
 const retire=async e=>{if(!e||e.done)return;if(e.pending)return e.pending;e.pending=(async()=>{await e.value[e.method]();e.done=true;e.value=null;})();try{await e.pending;}finally{e.pending=null;}};
 return {
  own(value,method='release'){requireValue(value&&typeof value[method]==='function','Owned resource requires a release method.');const e={value,method,done:false,pending:null};entries.push(e);return e;},
  retire,
  take(e){requireValue(e&&!e.done&&!e.pending,'Cannot transfer a retired resource.');const value=e.value;e.value=null;e.done=true;return value;},
  release(){if(releasing)return releasing;releasing=(async()=>{let failed=false,error;for(let i=entries.length-1;i>=0;i--)try{await retire(entries[i]);}catch(e){if(!failed){failed=true;error=e;}}if(failed)throw error;})();return releasing.finally(()=>{releasing=null;});},
 };
}
async function cleanup(owner,preservePrimary,onCleanupError){
 try{await owner.release();}catch(error){if(!preservePrimary)throw error;try{await onCleanupError?.(error,()=>owner.release());}catch{/* Preserve the original failure, including frozen and falsy errors. */}}
}
function array(Type,length,budget,label){return allocateOwnedTypedArray(Type,length,{budget,owner:'splicebuster',label});}
async function read(bank,Type,offset,length,{budget,signal,label,cooperate}){
 checkAbort(signal);await cooperate();const owner=array(Type,length,budget,label);
 try{await bank.readInto(owner.data,offset,{signal});checkAbort(signal);return owner;}catch(error){owner.release();throw error;}
}
function add(target,source){requireValue(target.length===source.length,'Reduction shape mismatch.');for(let i=0;i<target.length;i++)target[i]+=source[i];}
function ensureBank(bank,length,Type){requireValue(bank&&bank.length===length&&bank.elementType===Type.name&&typeof bank.readInto==='function','Bank type/shape mismatch.');}
function runner(run,{signal,onProgress,parent,dimensions}){
 return async(op,inputs,{rows=0,validRows=rows,phase=op}={})=>{
  checkAbort(signal);const plan=op==='map'?cpuMemoryPlan({operation:'map',nAll:rows,nValid:rows,dimensions}):streamMemoryPlan({operation:op==='meanFromMoments'?'modelUpdate':op,rows,validRows,dimensions});
  return run(op,inputs,{signal,onProgress,parent,phase,heapMaximumBytes:plan.heapMaximumBytes,workspaceBytes:4096,outputBytes:plan.outputBytes});
 };
}
function alive(prepared){requireValue(prepared&&!prepared.closed&&!prepared.empty,'Prepared global statistics unavailable.');}

/** Owns only its derived banks and compact parameters, never input spam/valid. */
export async function prepareBanked({spam,valid,nAll,budget,createBank,run,chunkRows=8192,params={},signal,onProgress,parent,onCleanupError}={}){
 nAll??=valid?.length;basic({budget,run,createBank,chunkRows,nAll});
 ensureBank(spam,nAll*50,Float32Array);ensureBank(valid,nAll,Uint8Array);
 const p=settings(params),d=p.dimensions,owner=scope(),call=runner(run,{signal,onProgress,parent,dimensions:d}),cooperate=createCooperator(signal);
 const retained=[];let success=false,failed=false;
 const ownArray=(Type,n,label)=>{const value=array(Type,n,budget,label),entry=owner.own(value);return {value,entry};};
 try{
  const sum=ownArray(Float64Array,50,'sb-global-feature-sum');let count=0;
  for(let at=0;at<nAll;at+=chunkRows){
   const n=Math.min(chunkRows,nAll-at),local=scope();let localFailed=false;
   try{
    const x=await read(spam,Float32Array,at*50,n*50,{budget,signal,label:'sb-feature-window',cooperate});local.own(x);
    const v=await read(valid,Uint8Array,at,n,{budget,signal,label:'sb-valid-window',cooperate});local.own(v);
    const r=await call('featureSums',{spam:x.data,valid:v.data},{rows:n,phase:'banked-pca-sum'});local.own(r);add(sum.value.data,r.sum);count+=r.count;
   }catch(e){localFailed=true;throw e;}finally{await cleanup(local,localFailed,onCleanupError);}
  }
  checkAbort(signal);
  if(!count){let closed=false;success=true;return {empty:true,nAll,nValid:0,dimensions:d,params:p,projected:null,training:null,basis:null,variance:null,initialIndices:null,get closed(){return closed;},release:async()=>{closed=true;}};}
  const mean=ownArray(Float64Array,50,'sb-global-feature-mean');for(let j=0;j<50;j++)mean.value.data[j]=sum.value.data[j]/count;
  await owner.retire(sum.entry);
  const covariance=ownArray(Float64Array,2500,'sb-global-feature-covariance');
  for(let at=0;at<nAll;at+=chunkRows){
   const n=Math.min(chunkRows,nAll-at),local=scope();let localFailed=false;
   try{
    const x=await read(spam,Float32Array,at*50,n*50,{budget,signal,label:'sb-feature-window',cooperate});local.own(x);
    const v=await read(valid,Uint8Array,at,n,{budget,signal,label:'sb-valid-window',cooperate});local.own(v);
    const r=await call('featureCovarianceChunk',{spam:x.data,valid:v.data,mean:mean.value.data},{rows:n,phase:'banked-pca-covariance'});local.own(r);add(covariance.value.data,r.covarianceSum);
   }catch(e){localFailed=true;throw e;}finally{await cleanup(local,localFailed,onCleanupError);}
  }
  const b=await call('basis',{covarianceSum:covariance.value.data,count},{phase:'banked-pca-basis'}),basisEntry=owner.own(b);retained.push(basisEntry);
  await owner.retire(covariance.entry);await owner.retire(mean.entry);
  const projected=await createBank(Float64Array,[nAll,d],{signal,label:'sb-global-projected'}),projectedEntry=owner.own(projected,'dispose');retained.push(projectedEntry);
  const training=await createBank(Float64Array,[count,d],{signal,label:'sb-global-training'}),trainingEntry=owner.own(training,'dispose');retained.push(trainingEntry);
  const trainSum=ownArray(Float64Array,d,'sb-global-training-sum');let packedAt=0;
  for(let at=0;at<nAll;at+=chunkRows){
   const n=Math.min(chunkRows,nAll-at),local=scope();let localFailed=false;
   try{
    const x=await read(spam,Float32Array,at*50,n*50,{budget,signal,label:'sb-feature-window',cooperate});local.own(x);
    const v=await read(valid,Uint8Array,at,n,{budget,signal,label:'sb-valid-window',cooperate});local.own(v);
    let nValid=0;for(const flag of v.data)nValid+=flag;
    const r=await call('projectChunk',{spam:x.data,valid:v.data,basis:b.basis},{rows:n,validRows:nValid,phase:'banked-pca-project'});local.own(r);
    requireValue(r.nValid===nValid,'Projection validity changed.');
    await projected.write(r.projected,at*d,{signal});if(nValid)await training.write(r.training,packedAt*d,{signal});packedAt+=nValid;
    const sums=await call('trainingSums',{training:r.training},{rows:nValid,phase:'banked-training-sum'});local.own(sums);add(trainSum.value.data,sums.sum);
   }catch(e){localFailed=true;throw e;}finally{await cleanup(local,localFailed,onCleanupError);}
   await onProgress?.({phase:'splicebuster-global-projection',completed:Math.min(nAll,at+n),total:nAll,units:'feature-rows'});
  }
  requireValue(packedAt===count,'Global training population changed.');await projected.flush();await training.flush();
  const trainMean=ownArray(Float64Array,d,'sb-global-training-mean');for(let j=0;j<d;j++)trainMean.value.data[j]=trainSum.value.data[j]/count;await owner.retire(trainSum.entry);
  const variance=ownArray(Float64Array,d,'sb-global-training-variance');retained.push(variance.entry);
  for(let at=0;at<count;at+=chunkRows){
   const n=Math.min(chunkRows,count-at),local=scope();let localFailed=false;
   try{
    const x=await read(training,Float64Array,at*d,n*d,{budget,signal,label:'sb-training-window',cooperate});local.own(x);
    const r=await call('varianceChunk',{training:x.data,mean:trainMean.value.data},{rows:n,phase:'banked-training-variance'});local.own(r);add(variance.value.data,r.varianceSum);
   }catch(e){localFailed=true;throw e;}finally{await cleanup(local,localFailed,onCleanupError);}
  }
  for(let j=0;j<d;j++)variance.value.data[j]/=count;await owner.retire(trainMean.entry);
  const indices=await call('initialIndices',{nValid:count,seed:p.seed,replicates:p.replicates},{phase:'banked-initial-indices'}),indicesEntry=owner.own(indices);retained.push(indicesEntry);
  // Transfer all surviving resource owners into one result lease.
  const held=scope();for(const entry of retained){const value=owner.take(entry);held.own(value,entry.method);}
  let retiring=false;success=true;
  return {empty:false,nAll,nValid:count,dimensions:d,params:p,budget,projected,training,basis:b.basis,variance:variance.value.data,initialIndices:indices.indices,
   get closed(){return retiring;},release(){retiring=true;return held.release();}};
 }catch(error){failed=true;throw error;}finally{await cleanup(owner,failed,onCleanupError);}
}

/** One independently initialized GLOBAL replica; caller schedules the 30 fits. */
export async function fitBankedReplica({prepared,index,run,createBank,budget,chunkRows=8192,params,signal,onProgress,parent,onCleanupError}={}){
 alive(prepared);const p=prepared.params,d=prepared.dimensions,count=prepared.nValid;
 basic({budget,run,createBank,chunkRows,nAll:count});requireValue(Number.isInteger(index)&&index>=0&&index<p.replicates,'Invalid replica index.');
 if(params){const candidate=settings({...p,...params});for(const key of Object.keys(p))requireValue(candidate[key]===p[key],'Scientific parameters changed after preparation.');}
 const owner=scope(),call=runner(run,{signal,onProgress,parent,dimensions:d}),cooperate=createCooperator(signal);let failed=false,modelEntry,momentEntry;
 try{
  const post=await createBank(Float64Array,[count,2],{signal,label:`sb-posterior-${index}`}),postEntry=owner.own(post,'dispose');
  const pointScope=scope();let initial,pointFailed=false;
  try{const point=await read(prepared.training,Float64Array,prepared.initialIndices[index]*d,d,{budget,signal,label:'sb-initial-sample',cooperate});pointScope.own(point);initial=await call('initialModel',{initialSample:point.data,variance:prepared.variance},{phase:'banked-initial-model'});modelEntry=owner.own(initial);}catch(error){pointFailed=true;throw error;}finally{await cleanup(pointScope,pointFailed,onCleanupError);}
  async function expectation(model){
   const globalMoments=array(Float64Array,3+2*d,budget,'sb-global-expectation-moments'),globalEntry=owner.own(globalMoments);
   for(let at=0;at<count;at+=chunkRows){
    const n=Math.min(chunkRows,count-at),local=scope();let localFailed=false;
    try{
     const x=await read(prepared.training,Float64Array,at*d,n*d,{budget,signal,label:'sb-training-window',cooperate});local.own(x);
     const r=await call('expectationChunk',{training:x.data,mu:model.mu,Sigma:model.Sigma,prioriProb:model.prioriProb,outliersProb:model.outliersProb,outliersNlogl:p.outliersNlogl},{rows:n,phase:'banked-expectation'});local.own(r);
     await post.write(r.posterior,at*2,{signal});add(globalMoments.data,r.moments);
    }catch(e){localFailed=true;throw e;}finally{await cleanup(local,localFailed,onCleanupError);}
   }
   return {owner:globalMoments,entry:globalEntry,score:globalMoments.data[2]/count};
  }
  let model=initial,e=await expectation(model),iteration=0,converged=false;momentEntry=e.entry;
  for(;iteration<p.maxIter;iteration++){
   checkAbort(signal);alive(prepared);
   const local=scope();let localFailed=false,nextModel,nextEntry;
   try{
    const mu=await call('meanFromMoments',{moments:e.owner.data},{phase:'banked-global-mean'});local.own(mu);
    const covariance=array(Float64Array,d*d,budget,'sb-global-centered-covariance');local.own(covariance);
    for(let at=0;at<count;at+=chunkRows){
     const n=Math.min(chunkRows,count-at),part=scope();let partFailed=false;
     try{
      const x=await read(prepared.training,Float64Array,at*d,n*d,{budget,signal,label:'sb-training-window',cooperate});part.own(x);
      const probabilities=await read(post,Float64Array,at*2,n*2,{budget,signal,label:'sb-posterior-window',cooperate});part.own(probabilities);
      const r=await call('covarianceChunk',{training:x.data,posterior:probabilities.data,mean:mu.mu.subarray(0,d)},{rows:n,phase:'banked-centered-covariance'});part.own(r);add(covariance.data,r.covarianceSum);
     }catch(error){partFailed=true;throw error;}finally{await cleanup(part,partFailed,onCleanupError);}
    }
    nextModel=await call('modelUpdate',{covarianceSum:covariance.data,moments:e.owner.data},{phase:'banked-global-model'});nextEntry=owner.own(nextModel);
   }catch(error){localFailed=true;throw error;}finally{await cleanup(local,localFailed,onCleanupError);}
   await owner.retire(modelEntry);model=nextModel;modelEntry=nextEntry;
   const oldScore=e.score;await owner.retire(momentEntry);e=await expectation(model);momentEntry=e.entry;
   await onProgress?.({phase:'splicebuster-global-em',replicate:index+1,totalReplicates:p.replicates,iteration:iteration+1,maxIterations:p.maxIter,score:e.score});
   const diff=e.score-oldScore;if(diff>=0&&diff<p.relErr*Math.abs(e.score)){converged=true;break;}
  }
  const score=e.score;await owner.retire(momentEntry);await owner.retire(postEntry);
  const held=scope();held.own(owner.take(modelEntry));
  return {...model,index,score,iterations:Math.min(iteration,p.maxIter-1),steps:Math.min(iteration+1,p.maxIter),converged,
   release:()=>held.release()};
 }catch(error){failed=true;throw error;}finally{await cleanup(owner,failed,onCleanupError);}
}

/** Writes raw source-grid distances; flagDropSaturated>1 masks invalid cells. */
export async function mapBanked({prepared,model,valid,map,run,budget,chunkRows=8192,signal,onProgress,parent,onCleanupError}={}){
 alive(prepared);budget??=prepared.budget;const count=prepared.nAll,d=prepared.dimensions;
 basic({budget,run,chunkRows,nAll:count});ensureBank(valid,count,Uint8Array);ensureBank(map,count,Float64Array);
 const call=runner(run,{signal,onProgress,parent,dimensions:d}),cooperate=createCooperator(signal);
 let minimum=Infinity,maximum=-Infinity,finiteCount=0,invalidCount=0,maskedTrainingCount=0;
 for(let at=0;at<count;at+=chunkRows){
  const n=Math.min(chunkRows,count-at),local=scope();let failed=false;
  try{
   const x=await read(prepared.projected,Float64Array,at*d,n*d,{budget,signal,label:'sb-projected-window',cooperate});local.own(x);
   const flags=await read(valid,Uint8Array,at,n,{budget,signal,label:'sb-valid-window',cooperate});local.own(flags);
   const r=await call('map',{projected:x.data,nAll:n,dimensions:d,mu:model.mu,Sigma:model.Sigma},{rows:n,phase:'banked-map'});local.own(r);
   for(let i=0;i<n;i++){
    requireValue(flags.data[i]===0||flags.data[i]===1,'Invalid map validity.');
    if(!flags.data[i]){maskedTrainingCount++;if(prepared.params.flagDropSaturated>1){r.map[i]=NaN;invalidCount++;continue;}}
    if(!Number.isFinite(r.map[i]))throw new EngineError('NUMERIC_RANGE','Splicebuster returned a nonfinite score on a valid cell.');
    minimum=Math.min(minimum,r.map[i]);maximum=Math.max(maximum,r.map[i]);finiteCount++;
   }
   await map.write(r.map,at,{signal});
  }catch(error){failed=true;throw error;}finally{await cleanup(local,failed,onCleanupError);}
  await onProgress?.({phase:'splicebuster-global-map',completed:Math.min(count,at+n),total:count,units:'feature-rows'});
 }
 await map.flush();return {min:finiteCount?minimum:null,max:finiteCount?maximum:null,finiteCount,invalidCount,maskedTrainingCount,nAll:count};
}
