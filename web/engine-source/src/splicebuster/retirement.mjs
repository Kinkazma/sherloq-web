/* Retirement acknowledgements only; no scientific or scheduling policy. */
import {requireValue} from '../errors.js';

/** Independent buffers can retire after a sibling refusal. Storage parents and
 * final reservations wait for all dependent ACKs. Successful steps run once. */
export function createSplicebusterRetirement({independent=[],children=[],parents=[],final=[]}={}){
 const entries=actions=>actions.map(action=>({action,done:false})),buffers=entries(independent),banks=entries(children),storage=entries(parents),leases=entries(final);
 let pending,retired=false;
 const complete=group=>group.every(entry=>entry.done);
 return {get retired(){return retired;},release(){
  if(retired)return Promise.resolve();if(pending)return pending;
  const task=(async()=>{
   let failed=false,error;
   const drain=async group=>{for(const entry of group){if(entry.done)continue;try{await entry.action();entry.done=true;entry.action=null;}catch(value){if(!failed){failed=true;error=value;}}}};
   await drain(buffers);await drain(banks);
   if(complete(banks))await drain(storage);
   if(complete(buffers)&&complete(banks)&&complete(storage))await drain(leases);
   if(failed)throw error;
   retired=complete(buffers)&&complete(banks)&&complete(storage)&&complete(leases);
  })();
  pending=task.finally(()=>{pending=null;});return pending;
 }};
}

/** Register a refused local rollback/result until a later clearCache/dispose
 * obtains its physical ACK; a rejected Promise is never its permanent state. */
export function createSplicebusterRetirementRegistry(){
 const owners=new Set();
 const retire=async owner=>{owners.add(owner);try{await owner.release();if(owner.retired)owners.delete(owner);}catch(error){throw error;}};
 return {retire,get pending(){return owners.size;},async drain(){let failed=false,error;for(const owner of [...owners])try{await retire(owner);}catch(value){if(!failed){failed=true;error=value;}}if(failed)throw error;}};
}

/** Logical result/pin references are consumed once. Retrying a refused final
 * ACK never decrements again, and a logically closed result cannot be pinned. */
export function createSplicebusterResultOwnership(retirement,retire=owner=>owner.release()){
 let references=1,closed=false;
 const finish=()=>references===0?retire(retirement):Promise.resolve();
 return {pin(){requireValue(!closed,'Released result cannot be pinned.');references++;let released=false;return()=>{if(!released){released=true;references--;}return finish();};},release(){if(!closed){closed=true;references--;}return finish();}};
}
