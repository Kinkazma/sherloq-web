import {EngineError,requireValue,checkAbort} from './errors.js';
/** Policy credit for one optional external worker. Credit is retired only after
 * the external owner acknowledges destruction; GC/backing retirement is not asserted.
 */
export function createExternalMemoryCache({budget,retire,margin=()=>0}={}){
 requireValue(budget&&typeof retire==='function','An external cache owner is required.');
 const entries=new Map();let closed=false;
 const alive=()=>{if(closed)throw new EngineError('DISPOSED','External cache owner is closed.');};
 const amount=bytes=>requireValue(Number.isSafeInteger(bytes)&&bytes>0,'Invalid external cache size.');
 const admit=bytes=>{const requested=bytes+margin();if(budget.total()+requested>budget.limit)throw new EngineError('MEMORY_LIMIT','Optional preview cache does not fit without retiring native ownership.',{details:{requestedBytes:requested,availableBytes:Math.max(0,budget.limit-budget.total())}});budget.room(requested);};
 function releaseEntry(entry){if(!entries.delete(entry.id))return;for(const held of entry.leases)held();entry.leases.length=0;}
 async function evict(entry){if(entry.retiring)return entry.retiring;entry.retiring=(async()=>{await retire({id:entry.id,label:entry.label,bytes:entry.bytes});releaseEntry(entry);})().finally(()=>{entry.retiring=null;});return entry.retiring;}
 const unregister=budget.registerAsyncReclaimer(async()=>{for(const entry of entries.values())if(entry.idle)await evict(entry);},{owner:'external-parameter-preview',label:'optional-preview-worker'});
 return{
  async reserve({bytes,label='parameter-preview'}={}, {signal}={}){alive();amount(bytes);requireValue(typeof label==='string'&&label.length>0&&label.length<=128,'Invalid external cache label.');if(entries.size)throw new EngineError('BUSY','Only one external preview cache may be retained.');checkAbort(signal);checkAbort(signal);admit(bytes);const entry={id:'external-cache-'+crypto.randomUUID(),bytes,label,idle:false,leases:[budget.reserve(bytes)]};entries.set(entry.id,entry);return{id:entry.id,bytes:entry.bytes};},
  async update({id,bytes,idle=false}={}, {signal}={}){alive();amount(bytes);requireValue(typeof idle==='boolean','Invalid external cache state.');const entry=entries.get(id);if(!entry)return{reclaimed:true};if(entry.retiring)throw new EngineError('BUSY','External cache is retiring.');const previous=entry.idle;entry.idle=false;try{checkAbort(signal);if(bytes>entry.bytes){const extra=bytes-entry.bytes;checkAbort(signal);admit(extra);entry.leases.push(budget.reserve(extra));}else{let remainder=entry.bytes-bytes;while(remainder){const held=entry.leases.at(-1),take=Math.min(remainder,held.bytes);held.split(take)();remainder-=take;if(!held.bytes){held();entry.leases.pop();}}}entry.bytes=bytes;entry.idle=idle;if(idle)budget.notifyReclaimable();return{id,bytes,idle};}catch(error){entry.idle=previous;throw error;}},
  release(id){const entry=entries.get(id);if(entry){if(entry.retiring)throw new EngineError('BUSY','External cache retirement is awaiting acknowledgement.');releaseEntry(entry);}return true;},
  async prepare(bytes,{signal}={}){alive();requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Invalid native cache headroom.');checkAbort(signal);if(budget.total()+Math.min(bytes,budget.limit)>budget.limit)for(const entry of [...entries.values()])if(entry.idle)await evict(entry);checkAbort(signal);},
  async dispose(){if(closed)return;let failure;for(const entry of [...entries.values()])try{await evict(entry);}catch(error){failure??=error;}if(!entries.size){closed=true;unregister();}if(failure)throw failure;},
  close(){requireValue(entries.size===0,'External cache owners must be retired before close.');closed=true;unregister();},
  get size(){return entries.size;},snapshot(){return[...entries.values()].map(({id,bytes,idle,retiring,label})=>({id,bytes,idle,retiring:!!retiring,label}));}
 };
}
