import "../../runtime-context.js?v=0.33.3";
// A funded write-back page for the common asynchronous temporary store.
// Row-sized Core writes are coalesced; RAM/OPFS do not pass through this cache.
import {allocateOwnedTypedArray} from './allocation.js';
import {EngineError,requireValue} from './errors.js';
const thenable=value=>value&&typeof value.then==='function';

export function createPixelCacheWindow({budget,pageBytes,runIO}) {
  requireValue(Number.isSafeInteger(pageBytes)&&pageBytes>0&&typeof runIO==='function',
    'Invalid Core I/O page admission.');
  const owned=allocateOwnedTypedArray(Uint8Array,pageBytes,{budget,
    owner:'native-core-cache',label:'core-cache-writeback-page'});
  let active,pending,disposed=false,hits=0,loads=0,flushes=0,backendReadBytes=0,backendWrittenBytes=0;
  const alive=()=>{if(disposed)throw new EngineError('DISPOSED','Core I/O page disposed.');
    if(pending)throw new EngineError('BUSY','Core I/O page already has active I/O.');};
  const track=result=>{
    if(!thenable(result))return result;
    pending=result;result.then(()=>{if(pending===result)pending=null;},()=>{if(pending===result)pending=null;});return result;
  };
  const flush=()=>{
    if(!active?.dirty)return;
    const previous=active;
    return runIO(reserve=>previous.store.write(owned.data.subarray(0,previous.length),previous.start,{reserve})).then(()=>{
      previous.dirty=false;++flushes;backendWrittenBytes+=previous.length;
    });
  };
  function transfer(store,data,offset,writing) {
    alive();let done=0;
    const execute=()=>{
      while(done<data.length) {
        const at=offset+done,start=Math.floor(at/pageBytes)*pageBytes;
        const length=Math.min(pageBytes,store.byteLength-start),within=at-start;
        const n=Math.min(data.length-done,length-within);
        const copy=()=>{
          if(writing){owned.data.set(data.subarray(done,done+n),within);active.dirty=true;}
          else data.set(owned.data.subarray(within,within+n),done);
          done+=n;
        };
        if(active?.store===store&&active.start===start){++hits;copy();continue;}
        const load=()=>{
          // A failed read cannot publish a half-replaced page under its old key.
          active=undefined;
          const publish=()=>{active={store,start,length,dirty:false};copy();return execute();};
          if(writing&&within===0&&n===length)return publish();
          return runIO(reserve=>store.readInto(owned.data.subarray(0,length),start,{reserve})).then(()=>{
            ++loads;backendReadBytes+=length;return publish();
          });
        };
        const waiting=flush();return thenable(waiting)?waiting.then(load):load();
      }
    };
    return track(execute());
  }
  return {
    readInto:(store,target,offset)=>transfer(store,target,offset,false),
    write:(store,source,offset)=>transfer(store,source,offset,true),
    flushStore(store){alive();return active?.store===store?track(flush()):undefined;},
    dropStore(store){alive();if(active?.store===store)active=undefined;},
    metrics:()=>({bytes:owned.data.byteLength,hits,loads,flushes,backendReadBytes,backendWrittenBytes}),
    dispose(){if(disposed)return;if(pending)throw new EngineError('BUSY','Wait for active Core I/O before releasing its page.');
      disposed=true;active=undefined;owned.release();},
  };
}
