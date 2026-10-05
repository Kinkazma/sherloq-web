import "../../runtime-context.js?v=0.14.5";
import {jsonExportBound} from './exports.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession} from './temporary-storage.js';
const CHUNK=256*1024,MiB=1024**2;

// Same JSON representation as exportAnalysis, including typed arrays, numeric
// nulls and property order, without Array.from over entire scientific arrays.
export function* resultJsonParts(value,parents=new Set(),admit){
 if(value&&typeof value.toJSON==='function')value=value.toJSON();
 if(value===null||typeof value!=='object'){const free=typeof value==='string'?admit?.(value.length*18+256):null;try{yield JSON.stringify(value)??'null';}finally{free?.();}return;}
 if(parents.has(value))throw new TypeError('Cyclic result cannot be exported.');parents.add(value);
 try{
  if(ArrayBuffer.isView(value)){
   yield '[';for(let at=0;at<value.length;at+=2048){if(at)yield ',';yield Array.from(value.subarray(at,at+2048),v=>JSON.stringify(v)??'null').join(',');}yield ']';
  }else if(Array.isArray(value)){
   yield '[';for(let i=0;i<value.length;i++){if(i)yield ',';yield* resultJsonParts(value[i],parents,admit);}yield ']';
  }else{
   yield '{';let first=true;for(const key of Object.keys(value)){const item=value[key];if(['undefined','function','symbol'].includes(typeof item))continue;if(!first)yield ',';first=false;const free=admit?.(key.length*18+256);try{yield JSON.stringify(key)+':';}finally{free?.();}yield* resultJsonParts(item,parents,admit);}yield '}';
  }
 }finally{parents.delete(value);}
}

export async function streamResultJson(result,request,{budget,signal,onProgress,onTemporarySession}={}){
 requireValue(result?.status==='ok'&&result.provenance&&typeof result.operation==='string','Expected a completed engine result.');
 requireValue((request.format??'json')==='json','Stored result files currently support JSON.');
 const bound=jsonExportBound(result),capacity=Math.min(bound,request.maxBytes??bound),mode=request.storage??'auto';
 requireValue(Number.isSafeInteger(capacity)&&capacity>0&&['auto','memory','temporary'].includes(mode),'Invalid stored JSON output request.');
 await controlCheckpoint(signal);const free=budget.reserve(8*MiB);let store,session,published=false;
 try{
  const fits=mode!=='temporary'&&capacity+MiB<=budget.limit-budget.retained-budget.active;
  if(!fits&&mode==='memory')throw new EngineError('MEMORY_LIMIT','Stored JSON does not fit requested RAM storage.');
  if(!fits){session=await createTemporarySession({budget,signal,id:request.temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});}
  store=await createSegmentedBytes(capacity,{budget,storage:fits?'memory':'temporary',temporarySession:session,signal});
  const {createSHA256}=await import('../vendor/hash-wasm/hashes.js'),hash=await createSHA256(),encoder=new TextEncoder(),buffer=new Uint8Array(CHUNK);let buffered=0,written=0,writes=0;
  const flush=async()=>{if(!buffered)return;await controlCheckpoint(signal);await store.write(buffer.subarray(0,buffered),written);written+=buffered;buffered=0;writes++;onProgress?.({phase:'encode-json',fraction:Math.min(.99,written/bound)});};
  for(const text of resultJsonParts(result,new Set(),n=>budget.reserve(n))){
   checkAbort(signal);const bytes=encoder.encode(text);if(written+buffered+bytes.length>capacity)throw new EngineError('EXPORT_LIMIT','JSON output exceeds its requested byte limit.');hash.update(bytes);
   for(let at=0;at<bytes.length;){const n=Math.min(bytes.length-at,CHUNK-buffered);buffer.set(bytes.subarray(at,at+n),buffered);buffered+=n;at+=n;if(buffered===CHUNK)await flush();}
  }
  await flush();await store.flush();checkAbort(signal);const archive={mime:'application/json',format:'json',store,byteLength:written,sha256:hash.digest('hex'),metrics:{storage:store.storage,temporaryBackend:session?.backend??null,outputCapacityBytes:capacity,encodedWriteCalls:writes,maxEncodedChunkBytes:CHUNK},async dispose(){try{await store.dispose();}finally{await session?.dispose();}}};published=true;return archive;
 }finally{try{if(!published){try{await store?.dispose();}finally{await session?.dispose();}}}finally{free();}}
}
