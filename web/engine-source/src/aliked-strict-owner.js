import {requireValue,checkAbort} from './errors.js';
/** Synchronous published owner; every resource remains reachable until its real
 * ACK. Disposal waits active construction/consumers, then attempts every owner.
 * Rejected ACKs remain charged and retryable, including falsy rejections. */
export function createAlikedStrictOwner({signal,onOwner}={}){
 const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal,resources=new Map(),credits=new Set(),finals=new Set(),active=new Set();let closed=false,retired=false,disposal;
 const owner={signal:combined,
  own(action,label='native resource'){requireValue(!retired&&typeof action==='function','ALIKED owner is retired.');const key={label};resources.set(key,action);return async()=>{if(!resources.has(key))return;await action();resources.delete(key);};},
  credit(action){requireValue(!retired&&typeof action==='function','ALIKED credit owner is retired.');credits.add(action);return()=>{if(!credits.has(action))return;action();credits.delete(action);};},
  finalize(action){requireValue(!retired&&typeof action==='function','ALIKED final admission owner is retired.');finals.add(action);},
  run(work){requireValue(!closed&&typeof work==='function','ALIKED native adapter is closed.');const task=Promise.resolve().then(()=>{checkAbort(combined);return work();});active.add(task);task.then(()=>active.delete(task),()=>active.delete(task));return task;},
  async drain(){const errors=[];for(const [key,action] of [...resources])try{await action();resources.delete(key);}catch(error){errors.push({label:key.label,error});}if(errors.length)throw new AggregateError(errors.map(x=>x.error),'ALIKED native resource ACK requires retry.',{cause:errors});},
  cancel(){closed=true;controller.abort();},
  dispose(){owner.cancel();if(disposal)return disposal;const task=(async()=>{await Promise.allSettled([...active]);if(retired)return;const errors=[];for(const [key,action] of [...resources])try{await action();resources.delete(key);}catch(error){errors.push({label:key.label,error});}if(!errors.length)for(const action of [...credits])try{await action();credits.delete(action);}catch(error){errors.push({label:'memory admission',error});}if(!errors.length)for(const action of [...finals])try{await action();finals.delete(action);}catch(error){errors.push({label:'parent memory admission',error});}if(errors.length)throw new AggregateError(errors.map(x=>x.error),'ALIKED native owners require retirement retry.',{cause:errors});retired=true;})();disposal=task;void task.catch(()=>{if(disposal===task)disposal=null;});return task;},
  get metrics(){return{closed,retired,active:active.size,resources:resources.size,credits:credits.size,finals:finals.size};}
 };requireValue(typeof onOwner==='function','ALIKED native ownership must be captured before construction.');onOwner(owner);return owner;
}
