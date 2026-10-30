import {acknowledgeDenseRetirement} from './dense-owner-retirement.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';

// A lane's WASM/cache backing and its GPU provider are independent allocations.
// Refund native lane credit only after Worker + both native backing ACKs. Keep
// the provider itself reachable/funded until its own disposal acknowledges.
export function densePoolLaneRetirement(steps){
 const done=new Set();
 return{async close(){
  let failed=false,primary;
  const attempt=async name=>{
   if(done.has(name))return;
   try{await acknowledgeDenseRetirement(steps[name]);done.add(name);}
   catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}
  };
  await attempt('stopWorker');await attempt('retireGpu');
  if(done.has('stopWorker')){
   await attempt('retireCache');await attempt('retireWasm');
   if(done.has('retireCache')&&done.has('retireWasm'))await attempt('refundLane');
  }
  if(done.has('refundLane')&&done.has('retireGpu'))await attempt('releaseOperation');
  if(failed)throw primary;
 }};
}

// Strong metadata references only: at most one record per admitted lane plus
// its outer run. No copied native arrays and no new scientific computation.
export function createDensePoolRetirement(budget,canReclaim=()=>true){
 const pending=new Set();let unregister;
 const finishRegistration=async()=>{if(!pending.size&&unregister){await unregister();unregister=null;}};
 const register=()=>{unregister??=budget.registerAsyncReclaimer?.(async()=>{
  if(!canReclaim())return 0;const before=budget.total();await drain();return Math.max(0,before-budget.total());
 },{owner:'patchmatch',label:'dense-resident-failed-retirement',allocationKind:'wasm'});};
 const retire=async record=>{
  pending.add(record);if(record.pending)return record.pending;
  const task=(async()=>{
   try{await record.close();pending.delete(record);await finishRegistration();}
   catch(error){try{register();}catch(cleanup){attachGpuCleanup(error,cleanup);}throw error;}
  })();record.pending=task;
  try{return await task;}finally{if(record.pending===task)record.pending=null;}
 };
 const drain=async()=>{
  let failed=false,primary;
  for(const record of [...pending])try{await retire(record);}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}
  try{await finishRegistration();}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}
  if(failed)throw primary;
 };
 return{retire,drain,get size(){return pending.size;}};
}
