import {createSHA256} from '../engine-source/vendor/hash-wasm/hashes.js';
import {checkAbort,controlCheckpoint} from '../engine-source/src/errors.js';

/** Hash original tensor bytes with the core's incremental SHA implementation.
 * SubtleCrypto snapshots its whole input; a 96MP plane must remain windowed. */
export async function boundedDigest(data,{budget,scheduler,signal,onProgress,chunkBytes=1024**2}={}){
 if(!ArrayBuffer.isView(data)||!Number.isSafeInteger(chunkBytes)||chunkBytes<1)throw TypeError('Typed tensor and positive hash chunk required');
 checkAbort(signal);const release=budget.reserve(1024**2);let lease;
 try{
  if(scheduler?.acquire)lease=await scheduler.acquire({cpu:1,signal,resourceOwner:'extensions/tensor-digest',label:'extensions-tensor-sha256'});
  const hash=await createSHA256(),bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
  for(let offset=0;offset<bytes.length;offset+=chunkBytes){await controlCheckpoint(signal);hash.update(bytes.subarray(offset,Math.min(bytes.length,offset+chunkBytes)));onProgress?.({phase:'fingerprint-sha256',completed:Math.min(bytes.length,offset+chunkBytes),total:bytes.length});}
  checkAbort(signal);return hash.digest('hex');
 }finally{lease?.release();release();}
}
