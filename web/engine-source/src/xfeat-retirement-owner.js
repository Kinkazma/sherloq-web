import {requireValue} from './errors.js';

/** Publish this carrier before construction can await. A rejected ACK keeps
 * its exact resource reachable; only acknowledged retirements are forgotten.
 * Metadata credits stay charged until all derived resources have retired. */
export function createXfeatRetirementOwner(){
 const resources=new Set(),credits=new Set();let finish,sealed=false,retired=false,retirement;
 const construction=new Promise(resolve=>finish=resolve),add=(set,action)=>{requireValue(!sealed&&typeof action==='function','XFeat construction ownership is sealed.');set.add(action);return action;};
 return{
  own:action=>add(resources,action),credit:action=>add(credits,action),
  finish(){if(sealed)return;sealed=true;finish();},
  dispose(){
   if(retirement)return retirement;
   const task=(async()=>{await construction;if(retired)return;const errors=[];for(const action of [...resources])try{await action();resources.delete(action);}catch(error){errors.push(error);}if(!errors.length)for(const action of [...credits])try{await action();credits.delete(action);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Native XFeat derived owner retirement needs retry.');retired=true;})();
   retirement=task;void task.catch(()=>{if(retirement===task)retirement=null;});return task;
  }
 };
}
