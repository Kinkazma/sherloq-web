import "../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort} from '../unified-engine/src/errors.js';
/** Own the original stored-DCT bank, not a crop or copied coefficient plane.
 * A subscriber signal is never the lifetime of a published native bank. */
export function createDocTamperCategoryCache({budget}={}){
 requireValue(budget&&typeof budget.reserve==='function','Native DTD cache requires shared admission.');
 const ready=new Map(),pending=new Map(),owners=new Set(),live=new Set();let closed=false,disposal;const metrics={loads:0,hits:0,joins:0,retirements:0};
 async function retire(entry){if(entry.retired)return;if(entry.retiring)return entry.retiring;if(entry.refs)return;
  entry.retiring=(async()=>{await entry.value.dispose();entry.metadataRelease();entry.retired=true;owners.delete(entry);if(ready.get(entry.key)===entry)ready.delete(entry.key);metrics.retirements++;})().finally(()=>{entry.retiring=null;});return entry.retiring;
 }
 function loan(entry){requireValue(!entry.retired&&!entry.evicted,'Native DTD bank is retired.');entry.refs++;let dropped=false,done=false,retiring;return{value:entry.value,release(){if(done||retiring)return retiring;if(!dropped){dropped=true;entry.refs--;if(!entry.refs){entry.idle?.();entry.idle=null;}}retiring=(async()=>{if(entry.evicted)await retire(entry);done=true;})().finally(()=>{retiring=null;});return retiring;}};}
 function evict(entry){entry.evicted=true;if(ready.get(entry.key)===entry)ready.delete(entry.key);return(async()=>{if(entry.refs)await new Promise(resolve=>{const old=entry.idle;entry.idle=()=>{old?.();resolve();};});await retire(entry);})();}
 const unregister=budget.registerAsyncReclaimer?.(async({bytes=0}={})=>{for(const entry of [...owners]){if(budget.total()+bytes<=budget.limit)break;if(!entry.refs)await evict(entry);}return 0;},{allocationKind:'array-buffer',owner:'extensions/doctamper-original-categories',label:'idle-original-DCT-bank'});
 async function acquire(key,create,{signal}={}){
  try{checkAbort(signal);requireValue(!closed&&typeof key==='string'&&key.length>0&&key.length<=4096&&typeof create==='function','Invalid original DTD cache identity.');}catch(e){return Promise.reject(e);}
  const hit=ready.get(key);if(hit){metrics.hits++;return Promise.resolve(loan(hit));}
  let job=pending.get(key);if(job)metrics.joins++;
  else{
   const metadataRelease=budget.reserve(4096+key.length*2);job={key,controller:new AbortController(),waiters:new Set()};pending.set(key,job);live.add(job);metrics.loads++;
   job.finished=Promise.resolve().then(async()=>{let value,entry,published=false;try{checkAbort(job.controller.signal);value=await create({signal:job.controller.signal});requireValue(value&&typeof value.dispose==='function','Native DTD category producer returned an invalid owner.');entry={key,value,metadataRelease,refs:0,retired:false,evicted:false,retiring:null,idle:null};owners.add(entry);checkAbort(job.controller.signal);requireValue(!closed,'Native DTD category producer returned after cache closure.');ready.set(key,entry);published=true;for(const waiter of [...job.waiters])waiter.finish(null,entry);
    }catch(error){for(const waiter of [...job.waiters])waiter.finish(error);if(entry&&!published){entry.evicted=true;await retire(entry);}else if(!published)metadataRelease();}
    finally{if(pending.get(key)===job)pending.delete(key);live.delete(job);}
   });job.finished.catch(()=>{});
  }
  return new Promise((resolve,reject)=>{let done=false;const waiter={finish(error,entry){if(done)return;done=true;job.waiters.delete(waiter);signal?.removeEventListener('abort',cancel);if(error)reject(error);else try{resolve(loan(entry));}catch(e){reject(e);}}},cancel=()=>{waiter.finish(signal.reason??new DOMException('Cancelled','AbortError'));if(!job.waiters.size){job.controller.abort(signal.reason);if(pending.get(key)===job)pending.delete(key);}};job.waiters.add(waiter);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();});
 }
 async function clear(){for(const job of live)job.controller.abort(new DOMException('DTD cache cleared','AbortError'));const results=await Promise.allSettled([...live].map(job=>job.finished));for(const entry of [...owners])try{await evict(entry);}catch(error){results.push({status:'rejected',reason:error});}const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);if(errors.length)throw new AggregateError(errors,'Native DTD category retirement failed');}
 return{acquire,clear,snapshot:()=>({closed,owners:owners.size,pending:pending.size,producers:live.size,borrowed:[...owners].reduce((n,e)=>n+e.refs,0),...metrics}),dispose(){if(disposal)return disposal;closed=true;disposal=clear().then(()=>{unregister?.();}).catch(error=>{disposal=null;throw error;});return disposal;}};
}
