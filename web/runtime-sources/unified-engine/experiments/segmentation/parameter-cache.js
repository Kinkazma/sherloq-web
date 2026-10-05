import {requireValue,checkAbort} from '../../src/errors.js';

// Session-local verified bytes, filled only by actual parameter requests. The
// caller still admits its active parameter views/copies. These idle reservations
// are reclaimed before the Budget evicts raw result grids; no preload or disk
// cache is introduced. CPU pools can count and reclaim this memory explicitly.
export function createParameterCache({budget,read,enabled=true}){
  requireValue(budget?.reserve&&budget?.registerReclaimer&&typeof read==='function'&&typeof enabled==='boolean','Shared parameter cache configuration');
  const entries=new Map();let bytes=0,peakBytes=0,disposed=false;
  const stats={hits:0,misses:0,hitBytes:0,fetchBytes:0,evictions:0};
  const remove=key=>{const entry=entries.get(key);if(!entry)return;entries.delete(key);bytes-=entry.capacity;entry.release();stats.evictions++;};
  const reclaim=(additional=0)=>{while(entries.size&&budget.total()+additional>budget.limit)remove(entries.keys().next().value);};
  const unregister=budget.registerReclaimer(reclaim);
  return{
    enabled,
    get bytes(){return bytes;},
    reclaim,
    snapshot(){return{...stats,residentBytes:bytes,sessionPeakResidentBytes:peakBytes,entries:entries.size,enabled};},
    async read(spec,hooks={}){
      requireValue(!disposed&&Number.isSafeInteger(spec?.bytes)&&spec.bytes>0&&spec.bytes<=256*1024**2&&/^[a-f0-9]{64}$/.test(spec.sha256),'Pinned parameter identity');checkAbort(hooks.signal);
      reclaim();const key=spec.sha256+':'+spec.bytes,entry=entries.get(key);
      if(entry){entries.delete(key);entries.set(key,entry);stats.hits++;stats.hitBytes+=spec.bytes;return entry.data;}
      stats.misses++;const data=await read(spec,hooks);checkAbort(hooks.signal);
      requireValue(!disposed&&data instanceof Uint8Array&&data.byteLength===spec.bytes,'Verified parameter reader result');stats.fetchBytes+=spec.bytes;
      // Map/key/object overhead is a conservative estimate, separate from the
      // exact payload capacity. Do not evict live results to admit a new cache.
      const capacity=data.byteLength+256;
      if(enabled&&!entries.has(key)&&capacity<=budget.limit-budget.total()){
        const release=budget.reserve(capacity);entries.set(key,{data,capacity,release});bytes+=capacity;peakBytes=Math.max(peakBytes,bytes);
      }
      return data;
    },
    dispose(){if(disposed)return;disposed=true;for(const key of entries.keys())remove(key);unregister();}
  };
}

export function parameterCacheStats(cache,before){
  const after=cache.snapshot(),result={enabled:after.enabled,sessionPeakResidentBytes:after.sessionPeakResidentBytes,residentBytesAfterInference:after.residentBytes};
  for(const key of ['hits','misses','hitBytes','fetchBytes','evictions'])result[key]=after[key]-before[key];
  return result;
}
