import {adaptiveCosts} from './adaptive-runtime.js';
// Owner-side accounting only. No Worker, timer, adapter request or analysis is
// created here. The caller supplies its existing physical completion barrier.
export function beginUsefulWorkObservation(store,identity,{clock=()=>performance.now()}={}){
 const started=clock(),marks={},diagnostics=[];let finished=false,pending=null;
 const mark=name=>{if(finished)throw new Error('Observation is closed');if(!['prepared','computed','transferred'].includes(name))throw new TypeError('Unknown work phase');if(marks[name]!==undefined)throw new Error('Work phase already closed');marks[name]=clock();};
 return {
  mark,
  finish({completion,backend,cache='miss',numericAdmissible=false,actualGpuWork=false,cancelled=false,failed=false}={}){
   if(pending)return pending;if(finished)return Promise.resolve({recorded:false,reason:'already-closed'});
   finished=true;
   pending=(async()=>{
    if(!completion||typeof completion.then!=='function')return {recorded:false,reason:'physical-completion-barrier-required'};
    try{await completion;}catch(error){diagnostics.push({kind:'completion-rejected',error});return {recorded:false,reason:'physical-completion-rejected'};}
    const acknowledged=clock(),end=clock();
    // Unknown subphases are not invented. They are charged to otherMs while
    // the full requested-work interval, including ACK, is always measured.
    let cost;
    if(['prepared','computed','transferred'].every(k=>marks[k]!==undefined)){
     try{cost=adaptiveCosts({start:started,...marks,acknowledged,finished:end});}
     catch(error){diagnostics.push({kind:'timeline-invalid',error});return {recorded:false,reason:'invalid-phase-timeline'};}
    }else cost={totalMs:end-started,preparationMs:0,computeMs:0,transferMs:0,ackMs:0,otherMs:end-started};
    try{return store.observe({...identity,backend,cache,cost,numericAdmissible,actualGpuWork,cancelled,failed,completedAfterAck:true});}
    catch(error){diagnostics.push({kind:'observation-rejected',error});return {recorded:false,reason:'observation-invalid'};}
   })();return pending;
  },
  diagnostics:()=>diagnostics.map(({kind,error})=>({kind,errorName:error?.name??null})),
 };
}
