import "../../runtime-context.js?v=0.14.5";
import {checkAbort,controlCheckpoint} from './errors.js';
// Two exact membership bits per pixel. The caller already reserves16MiB for
// its byte-page cache. Extra packed capacity is admitted only from spare RAM;
// otherwise the existing bounded page cache remains available.
export function noisesnifferPackedFlags(count,budget){
 const bytes=Math.ceil(count/4),extra=Math.max(0,bytes-16*1024**2);
 if(extra>(budget.limit-budget.retained-budget.active)/4)return null;
 const release=budget.reserve(extra);let flags;
 try{flags=new Uint8Array(bytes);}catch(e){release();if(e instanceof RangeError)return null;throw e;}
 return {byteLength:bytes,mark(id,bit){flags[Math.floor(id/4)]|=bit<<((id%4)*2);},
  async flush(store,{signal}={}){const out=new Uint8Array(Math.min(count,65536));for(let offset=0;offset<count;offset+=out.length){await controlCheckpoint(signal);const part=out.subarray(0,Math.min(out.length,count-offset));for(let j=0;j<part.length;j++){const id=offset+j;part[j]=(flags[Math.floor(id/4)]>>((id%4)*2))&3;}await store.write(part,offset);}checkAbort(signal);},
  dispose(){flags=null;release();}};
}
