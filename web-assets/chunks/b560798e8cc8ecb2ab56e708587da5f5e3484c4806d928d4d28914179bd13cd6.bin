import "../../runtime-context.js?v=0.25.0";
import {EngineError,requireValue} from './errors.js';
import {ramByteCacheBytes,createRamByteCache} from './ram-byte-cache.js';
// Optional immutable arithmetic basis. The caller first selects the useful
// native worker count, then funds its complete workspace before admitting this
// cache. A cache refusal leaves the original storage/worker path unchanged.
export function acquireEchoDerivativeCache(budget,key,byteLength,requiredBytes,{createCache=createRamByteCache}={}){
 if(!key)return null;const bytes=ramByteCacheBytes(byteLength,48);let record=budget.get(key);
 if(record&&record.byteLength+requiredBytes>budget.limit-budget.retained-budget.active){budget.remove(key);record=null;}
 let base=record?.value,ready=!!record,release,limits=null;
 try{
  if(base){budget.remove(key);release=budget.reserve(record.byteLength);limits=base.limits.slice();}
  else if(bytes+requiredBytes<=budget.limit-budget.retained-budget.active){release=budget.reserve(bytes);base=createCache(byteLength);}
 }catch(cause){release?.();if(cause instanceof RangeError||cause.code==='MEMORY_ALLOCATION')throw new EngineError('ECHO_CACHE_ALLOCATION','The optional Echo derivative cache could not allocate its metadata.',{cause,details:{allocationKind:'array-buffer',requestedBytes:bytes}});throw cause;}
 if(!base)return null;
 let closed=false;return{hit:!!record,bytes,limits,
  // Each worker receives a new admitted buffer; it can never detach or mutate
  // the retained private chunks. Publication of RGB owns different storage.
  store:{byteLength,storage:'memory-cache',readInto(target,offset=0){requireValue(!closed&&target instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=byteLength-target.length,'Invalid Echo cache read.');base.read(target,offset);return target;},write(source,offset=0){requireValue(!closed&&!ready&&source instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=byteLength-source.length,'Invalid Echo cache write.');try{base.write(source,offset);}catch(cause){if(cause instanceof RangeError||cause.code==='MEMORY_ALLOCATION')throw new EngineError('ECHO_CACHE_ALLOCATION','The optional Echo derivative cache could not allocate its admitted chunks.',{cause,details:{allocationKind:'array-buffer',requestedBytes:byteLength}});throw cause;}},flush(){},dispose(){}},
  commit(limits){if(!ready){base.limits=limits.slice();ready=true;}},
  close(){if(closed)return;closed=true;release();if(ready)budget.put(key,{value:base,byteLength:bytes});else{base.chunks.length=0;base=null;}}
 };
}
