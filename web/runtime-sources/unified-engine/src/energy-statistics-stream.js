import "../../runtime-context.js?v=0.33.3";
import {selectFloat32Ranks} from './float32-ranks-stream.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {energyPairwise,energyQuantile} from './energy-prepare.js';
import {energyArrayPairwise} from './energy-statistics.js';
import {createEnergyStatisticsRuntime} from './energy-statistics-runtime.js';
import {retireCompositeOwners} from './composite-owner-release.js';
const f=Math.fround,BLOCK=65536,REDUCTION=8192;
// Exact order statistics without sorting or retaining a full panel. Finite
// nonnegative float32 words use the same unsigned ordering as native preparation.
export async function summarizeEnergyValues(store,count,quantiles,{budget,signal,onProgress,arrayStatistics=true,statisticsRuntimeFactory=createEnergyStatisticsRuntime,statisticsRuntime,rankEndpoints,onDiagnostic}={}){
 const cooperate=createCooperator(signal);
 requireValue(Number.isInteger(count)&&count>0&&count<2**31&&store?.byteLength===count*4,'A complete compact float32 panel stream is required.');requireValue(Array.isArray(quantiles)&&quantiles.length===2&&quantiles.every(Number.isFinite)&&quantiles[0]>=0&&quantiles[0]<=.5&&quantiles[1]>=.5&&quantiles[1]<=1,'Invalid energy quantiles.');
 const diagnostic=typeof onDiagnostic==='function'?{schema:'energy-statistics-diagnostic/1',count,backend:arrayStatistics?'js-array-pairwise':'js-reference-pairwise',runtimeAttempted:false,runtimeCreated:false,runtimeBorrowed:false,ranksReused:false,ranksMs:0,runtimeConstructionMs:0,reductionMs:0,retirementMs:0,wasmExecutions:0}:null,diagnosticStarted=diagnostic?performance.now():0,report=()=>{if(diagnostic)try{onDiagnostic(diagnostic);}catch{}};
 const ranksStarted=diagnostic?performance.now():0;let endpoints;try{
  // The preparation may borrow four exact ranks from its active, funded capture.
  // Its complete residual domain was validated before capture; never reduce in
  // sorted order or retain the captured panel through this tiny snapshot.
  if(rankEndpoints!==undefined){checkAbort(signal);requireValue(rankEndpoints instanceof Float32Array&&rankEndpoints.length===4&&rankEndpoints.every(value=>Number.isFinite(value)&&value>=0&&value<=255),'Four validated Float32 rank endpoints required.');endpoints=rankEndpoints;if(diagnostic)diagnostic.ranksReused=true;}
  else endpoints=await selectFloat32Ranks(store,count,quantiles.flatMap(q=>{const lo=Math.floor((count-1)*q);return [lo,Math.min(lo+1,count-1)];}),{budget,signal,onProgress,maximum:255});}catch(error){if(diagnostic){diagnostic.ranksMs=performance.now()-ranksStarted;diagnostic.outcome='rank-failed';diagnostic.totalMs=performance.now()-diagnosticStarted;report();}throw error;}if(diagnostic)diagnostic.ranksMs=performance.now()-ranksStarted;
 const release=budget.reserve(512*1024);let reducer,ownsReducer=false,buffer,raw,groups,filtered,failed=false,primary,wasmBefore=null;
 try{
  // The same optional, pinned one-page reducer used by native preparation.
  // It owns no whole-image arrays and keeps the JS reference when unavailable.
  if(arrayStatistics&&count>=REDUCTION){
   // The active capture pins this optional reducer. Only a locally created
   // runtime belongs to this summary and is retired in its finally block.
   if(typeof statisticsRuntime?.reduce==='function'&&typeof statisticsRuntime?.filterInto==='function'){reducer=statisticsRuntime;if(diagnostic)diagnostic.runtimeBorrowed=true;}
   else if(statisticsRuntimeFactory){const runtimeStarted=diagnostic?performance.now():0;if(diagnostic)diagnostic.runtimeAttempted=true;reducer=await statisticsRuntimeFactory({budget,signal});ownsReducer=!!reducer;if(diagnostic)diagnostic.runtimeConstructionMs=performance.now()-runtimeStarted;}
  }
  if(diagnostic&&reducer){diagnostic.runtimeCreated=ownsReducer;try{diagnostic.backend=reducer.backend??'runtime-backend-unreported';wasmBefore=Number.isSafeInteger(reducer.wasmExecutions)?reducer.wasmExecutions:null;}catch{diagnostic.backend='runtime-diagnostic-unreadable';}diagnostic.wasmExecutions=null;}
  buffer=new Float32Array(Math.min(BLOCK,count));raw=new Uint8Array(buffer.buffer);
  if(reducer)filtered=new Float32Array(REDUCTION);
  async function scan(visit,phase){for(let at=0;at<count;at+=buffer.length){await cooperate();const length=Math.min(buffer.length,count-at);await store.readInto(raw.subarray(0,length*4),at*4);checkAbort(signal);visit(length);onProgress?.({phase,fraction:(at+length)/count});}}
  const q=quantiles.map((v,i)=>energyQuantile(Float32Array.of(endpoints[i*2],endpoints[i*2+1]),2,(count-1)*v-Math.floor((count-1)*v))),lower=f(q[0]),upper=f(q[1]);groups=Array.from({length:3},()=>({buffer:new Float32Array(REDUCTION),used:0,count:0,total:0,mean:0,variance:0}));
  const keep=(value,index)=>index===0?value>=lower&&value<=upper:index===1?value<=lower:value>=upper;
  function flush(group,variance){if(!group.used)return;group.total=f(group.total+(reducer?reducer.reduce(group.buffer,0,group.used,group.mean,variance,{signal}):arrayStatistics?energyArrayPairwise(group.buffer,0,group.used,group.mean,variance):energyPairwise(i=>{const value=group.buffer[i];if(!variance)return value;const d=f(value-group.mean);return f(d*d);},0,group.used,f)));group.used=0;}
  const reductionStarted=diagnostic?performance.now():0;for(let pass=0;pass<2;pass++){
   for(const group of groups){group.total=0;group.used=0;if(pass===0)group.count=0;}
   await scan(length=>{
    if(reducer){
     // Each group retains the same stable sample order and 8192-value cuts.
     // Interleaving independent groups cannot change their Float32 reduction.
     for(let j=0;j<3;j++)for(let at=0;at<length;at+=REDUCTION){
      const group=groups[j],kept=reducer.filterInto(buffer,at,Math.min(REDUCTION,length-at),lower,upper,j,filtered,0,{signal});
      if(pass===0)group.count+=kept;
      for(let copied=0;copied<kept;){const take=Math.min(kept-copied,REDUCTION-group.used);group.buffer.set(filtered.subarray(copied,copied+take),group.used);group.used+=take;copied+=take;if(group.used===REDUCTION)flush(group,pass===1);}
     }
    }else for(let i=0;i<length;i++){const value=buffer[i];for(let j=0;j<3;j++)if(keep(value,j)){const group=groups[j];group.buffer[group.used++]=value;if(pass===0)group.count++;if(group.used===REDUCTION)flush(group,pass===1);}}
   },pass?'energy-panel-variance':'energy-panel-mean');
   for(const group of groups){flush(group,pass===1);if(pass)group.variance=group.count?f(group.total/group.count):0;else group.mean=group.count?f(group.total/group.count):(q[0]+q[1])/2;}
  }
  if(diagnostic){diagnostic.reductionMs=performance.now()-reductionStarted;try{const after=reducer?.wasmExecutions;if(wasmBefore!==null&&Number.isSafeInteger(after))diagnostic.wasmExecutions=after-wasmBefore;}catch{}}
  checkAbort(signal);return {q10:q[0],q90:q[1],central_mean:groups[0].mean,central_variance:groups[0].variance,low_mean:groups[1].mean,low_variance:groups[1].variance,high_mean:groups[2].mean,high_variance:groups[2].variance};
 }catch(error){failed=true;primary=error;throw error;}finally{buffer=raw=groups=filtered=null;const retirementStarted=diagnostic?performance.now():0;let retired=false;try{await retireCompositeOwners([()=>ownsReducer?reducer?.dispose():undefined,()=>release()],failed?{primary}:{});retired=true;}finally{if(diagnostic){diagnostic.retirementMs=performance.now()-retirementStarted;diagnostic.retirementAcknowledged=retired;diagnostic.outcome=retired?(failed?'failed':'complete'):'retirement-failed';diagnostic.totalMs=performance.now()-diagnosticStarted;report();}}}
}
