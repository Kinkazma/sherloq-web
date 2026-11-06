// Private, bounded RAM chunks only. No asynchronous temporary-store lifecycle
// is hidden in the synchronous LRU. The owner admits and pins the entire value.
const CHUNK=4*1024**2;
export const ramByteCacheBytes=(bytes,metadataBytes=0)=>bytes+metadataBytes+Math.ceil(bytes/CHUNK)*16+256;
export function createRamByteCache(byteLength,metadata={}){
 const chunks=[];return{byteLength,...metadata,chunks,
  write(bytes,offset){let done=0;while(done<bytes.length){const at=offset+done,i=Math.floor(at/CHUNK),within=at%CHUNK,length=Math.min(bytes.length-done,CHUNK-within);const chunk=chunks[i]??=(new Uint8Array(Math.min(CHUNK,byteLength-i*CHUNK)));chunk.set(bytes.subarray(done,done+length),within);done+=length;}},
  read(target,offset){let done=0;while(done<target.length){const at=offset+done,i=Math.floor(at/CHUNK),within=at%CHUNK,length=Math.min(target.length-done,CHUNK-within);target.set(chunks[i].subarray(within,within+length),done);done+=length;}}
 };
}
