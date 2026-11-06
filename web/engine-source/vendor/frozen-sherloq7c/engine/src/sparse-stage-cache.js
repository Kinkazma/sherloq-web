import {EngineError,checkAbort} from './errors.js';

// Stage outputs already belong to the caller's admitted computation. Do not
// charge those same buffers again as a cache until the run releases its work.
// A cache hit moves synchronously from evictable storage into a pinned lease.
export function sparseStageCache(budget,prefix,{signal,byteLength,hits={}}){
 const records=new Map(),pins=[],adopted=new Map();let closed=false;
 return {
  adopt(value,release){if(typeof release==='function')adopted.set(value,release);return value;},
  async memo(name,compute){
   if(closed)throw new EngineError('DISPOSED','Sparse stage cache handoff already completed.');
   checkAbort(signal);const key=prefix+name,prior=records.get(key);if(prior)return prior.value;
   const cached=budget.get(key);hits[name.split('/')[0]]=!!cached;let record;
   if(cached){budget.take(key);pins.push(budget.reserve(cached.byteLength));record=cached;}
   else{let value;try{value=await compute();checkAbort(signal);const release=adopted.get(value);adopted.delete(value);record={value,byteLength:byteLength(value),onEvict(){record.value=null;release?.();}};}catch(error){adopted.get(value)?.();adopted.delete(value);throw error;}}
   records.set(key,record);return record.value;
  },
  // The owner releases computation reservations before this synchronous handoff.
  finish({publish=true}={}){
   if(closed)return;closed=true;for(const release of pins)release();pins.length=0;
   if(publish)for(const [key,record] of records)budget.put(key,record);else for(const record of records.values())record.onEvict?.();for(const release of adopted.values())release();adopted.clear();
   records.clear();
  }
 };
}
