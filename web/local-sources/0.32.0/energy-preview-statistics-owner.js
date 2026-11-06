import {Budget} from './unified-engine/src/cache.js';
import {EngineError,checkAbort,requireValue} from './unified-engine/src/errors.js';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
import {createEnergyStatisticsRuntime,ENERGY_STATISTICS_RUNTIME_BYTES as BYTES,ENERGY_STATISTICS_RUNTIME_INITIALIZATION_BYTES as INIT} from './unified-engine/src/energy-statistics-runtime.js';

// This real sub-budget is financed by external engine leases. It owns only the
// existing statistics page, never source fields, panel data or sorted samples.
export function createEnergyPreviewStatisticsOwner({engine,runtimeFactory=createEnergyStatisticsRuntime}={}){
 requireValue(typeof engine?.reserveExternalMemory==='function'&&typeof engine.releaseExternalMemory==='function','A financed Energy statistics owner is required.');
 const controller=new AbortController();let state=null,active=null,retiring=null,closing=false,closed=false,unavailable=false;
 const materialized=budget=>Object.values(budget.resourceSnapshot().domains??{}).reduce((sum,d)=>sum+(d.materializedBytes??0),0);
 async function releaseCredit(s,key){if(!s[key])return;const ack=await engine.releaseExternalMemory(s[key].id);if(ack===false||ack===0)throw new EngineError('BUSY','Energy statistics external credit retirement awaits ACK.');s[key]=null;}
 async function retireState(){
  const s=state;if(!s)return;s.retiring=true;
  if(s.unpin){await s.unpin();s.unpin=null;}
  if(s.runtime){const ack=await s.runtime.dispose();if(ack===false||ack===0)throw new EngineError('BUSY','Energy statistics retirement awaits ACK.');s.runtime=null;}
  // A constructor can reject before returning its runtime while leaving an
  // acknowledged-retirement debt registered in this actual Budget.
  if(materialized(s.budget)>0)await s.budget.reclaimAllocation(BYTES,{kind:'wasm'});
  await s.budget.reclaim(s.budget.limit);
  if(s.budget.total()!==0||materialized(s.budget)!==0)throw new EngineError('BUSY','Energy statistics construction debt is still owned.');
  await retireCompositeOwners([()=>releaseCredit(s,'initialization'),()=>releaseCredit(s,'page')]);
  if(state===s)state=null;
 }
 async function initialize(signal){
  if(state)await retireState();checkAbort(signal);if(closing)throw new EngineError('CANCELLED','Energy statistics owner is closing.');
  const started=performance.now(),s={budget:new Budget(BYTES+INIT),page:null,initialization:null,runtime:null,unpin:null,retiring:false};state=s;let admissionFailure,admissionFailed=false;
  const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  try{
   const memory=typeof engine.capabilities==='function'?(await engine.capabilities())?.memory:null,available=memory?.policyAvailableBytes,heap=memory?.knownHeapCapacityBytes;
   checkAbort(combined);if(!Number.isSafeInteger(available)||!Number.isSafeInteger(heap)||available<0||heap<0){await retireState();unavailable=true;return{runtime:null,setupMilliseconds:0};}
   if(available<BYTES+INIT+heap){await retireState();return{runtime:null,setupMilliseconds:0};}
   try{s.page=await engine.reserveExternalMemory({bytes:BYTES});s.initialization=await engine.reserveExternalMemory({bytes:INIT});}
   catch(error){if(error&&typeof error==='object'&&!Object.isFrozen(error)&&error.code==='MEMORY_LIMIT'){admissionFailure=error;admissionFailed=true;}throw error;}
   checkAbort(combined);s.runtime=await runtimeFactory({budget:s.budget,signal:combined});
   requireValue(s.runtime==null||typeof s.runtime.reduce==='function'&&typeof s.runtime.filterInto==='function'&&typeof s.runtime.dispose==='function','Invalid sampled Energy statistics runtime.');checkAbort(combined);
   if(s.runtime==null){await retireState();unavailable=true;return{runtime:null,setupMilliseconds:performance.now()-started};}
   s.unpin=s.runtime.pin?.();
   // Initialization credit is returned only after the runtime factory's own
   // initialization reservation has retired. The live page stays financed.
   if(s.budget.total()!==BYTES||materialized(s.budget)!==BYTES)throw new EngineError('BUSY','Energy statistics initialization is not fully accounted.');
   await releaseCredit(s,'initialization');checkAbort(combined);
   return{runtime:s.runtime,setupMilliseconds:performance.now()-started};
  }catch(primary){let retired=false;await retireCompositeOwners([async()=>{await retireState();retired=true;}],{primary});if(retired&&admissionFailed&&admissionFailure===primary&&!combined.aborted)return{runtime:null,setupMilliseconds:0};throw primary;}
 }
 return{
  get({signal}={}){
   if(closing)return Promise.reject(new EngineError('DISPOSED','Energy statistics owner is disposed.'));checkAbort(signal);
   if(state?.runtime&&!state.retiring)return Promise.resolve({runtime:state.runtime,setupMilliseconds:0});
   if(unavailable)return Promise.resolve({runtime:null,setupMilliseconds:0});if(active)return active;
   const task=initialize(signal);active=task;void task.finally(()=>{if(active===task)active=null;}).catch(()=>{});return task;
  },
  dispose(){if(closed)return Promise.resolve();if(retiring)return retiring;closing=true;controller.abort();const task=(async()=>{if(active)await Promise.allSettled([active]);await retireState();closed=true;})();retiring=task;void task.finally(()=>{if(retiring===task)retiring=null;}).catch(()=>{});return task;}
 };
}
