import {writePrnuDatabase,readPrnuDatabase} from './prnu-hdf5.js';
import {readPrnuStoredDatabase} from './prnu-storage.js';
import {createTemporarySession} from './temporary-storage.js';
import {createSegmentedBytes,copyBlobToSegments} from './segmented-bytes.js';
import {EngineError,requireValue,controlCheckpoint,checkAbort} from './errors.js';
const opfsUnavailable=error=>['STORAGE_UNAVAILABLE','STORAGE_IO'].includes(error?.code);
// HDF5 itself is synchronous. When OPFS setup is unavailable, explicitly admit
// its encoded RAM input/output and native workspace before using async IDB stores.
async function readBlobInMemory(blob,options,cause){
 const release=options.source?null:options.budget.reserve(blob.size);let bytes,page,database,success=false;
 try{checkAbort(options.signal);if(options.source){page=await options.source.read(0,blob.size,{signal:options.signal});bytes=page.bytes;}else bytes=new Uint8Array(await blob.arrayBuffer());checkAbort(options.signal);const result=await readPrnuStoredDatabase(bytes,options);database=result.database;checkAbort(options.signal);success=true;return Object.assign(database,{encodedBackend:'memory',temporaryBackend:result.temporaryBackend,storageFallback:{from:'opfs',code:cause.code}});}
 finally{bytes=null;page?.release();try{if(!success)await database?.dispose();}finally{release?.();}}
}
async function writePagesInMemory(database,{budget,signal,onProgress,temporarySessionId,onTemporarySession,capacity},cause){
 const release=budget.reserve(capacity);let encoded,session,store,success=false;
 try{
  encoded=await writePrnuDatabase(database,{signal,onProgress,maxWorkingBytes:budget.limit,admit:n=>budget.reserve(n)});checkAbort(signal);
  if(encoded.byteLength>capacity)throw new EngineError('MEMORY_LIMIT','Encoded PRNU snapshot exceeded its admitted staging.');
  session=await createTemporarySession({backend:'indexeddb',budget,signal,id:temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});
  store=await createSegmentedBytes(encoded.byteLength,{budget,storage:'temporary',temporarySession:session,signal});
  const {createSHA256}=await import('../vendor/hash-wasm/hashes.js'),hash=await createSHA256();
  for(let at=0;at<encoded.length;at+=1024**2){await controlCheckpoint(signal);const part=encoded.subarray(at,at+1024**2);await store.write(part,at,{signal});hash.update(part);onProgress?.({phase:'prnu-hdf5-hash',completed:at+part.length,total:encoded.length});}
  await store.flush();checkAbort(signal);const inner=store,temporary=session,byteLength=encoded.byteLength;encoded=null;let disposed=false;success=true;
  return {byteLength,sha256:hash.digest('hex'),mime:'application/x-hdf5',metrics:{encodedCapacityBytes:capacity,encodedBackend:'memory',temporaryBackend:session.backend,storageFallback:{from:'opfs',code:cause.code}},store:{byteLength,readInto(target,offset=0,options){requireValue(!disposed&&offset>=0&&offset<=byteLength-target.length,'Invalid encoded HDF5 read.');return inner.readInto(target,offset,options);}},async release(){if(disposed)return;disposed=true;try{await inner.dispose();}finally{await temporary.dispose();}}};
 }finally{encoded=null;release();if(!success){try{await store?.dispose();}finally{await session?.dispose();}}}
}
// Own encoded storage and archive lifetime. The native HDF5 driver is sync, so
// disk-backed encoded files use OPFS in the owning dedicated worker.
export async function writePrnuHdf5Pages(database,{budget,signal,onProgress,temporarySessionId,onTemporarySession}={}){
 let session,store,success=false,release;
 try{
  const raw=database.cameras.reduce((n,c)=>n+c.fingerprint.width*c.fingerprint.height*8,0),metadata=database.cameras.reduce((n,c)=>n+JSON.stringify(c.trainingManifest).length*4+JSON.stringify(c.skippedImages??[]).length*4,0),capacity=raw*2+metadata+32*1024**2;
  requireValue(Number.isSafeInteger(capacity),'PRNU encoded capacity exceeds safe offsets.');try{session=await createTemporarySession({backend:'opfs',budget,signal,id:temporarySessionId});}catch(error){checkAbort(signal);if(!opfsUnavailable(error))throw error;const archive=await writePagesInMemory(database,{budget,signal,onProgress,temporarySessionId,onTemporarySession,capacity},error);success=true;return archive;}onTemporarySession?.({id:session.id,backend:session.backend});store=await createSegmentedBytes(capacity,{budget,storage:'temporary',temporarySession:session,signal});
  const result=await writePrnuDatabase(database,{signal,onProgress,maxWorkingBytes:budget.limit,admit:n=>budget.reserve(n),encodedStore:store}),{createSHA256}=await import('../vendor/hash-wasm/hashes.js'),hash=await createSHA256();release=budget.reserve(1024**2);const bytes=new Uint8Array(1024**2);let last=performance.now();
  for(let offset=0;offset<result.byteLength;offset+=bytes.length){checkAbort(signal);if(performance.now()-last>=8){await controlCheckpoint(signal);last=performance.now();}const part=bytes.subarray(0,Math.min(bytes.length,result.byteLength-offset));await store.readInto(part,offset);hash.update(part);onProgress?.({phase:'prnu-hdf5-hash',completed:offset+part.length,total:result.byteLength});}
  await store.flush();checkAbort(signal);const inner=store,temporary=session;let disposed=false;success=true;
  return {byteLength:result.byteLength,sha256:hash.digest('hex'),mime:'application/x-hdf5',metrics:{encodedCapacityBytes:capacity,encodedBackend:'opfs',heapBytes:result.heapBytes,workingBytes:result.workingBytes,temporaryBackend:'opfs'},store:{byteLength:result.byteLength,readInto(target,offset=0){requireValue(!disposed&&offset>=0&&offset<=result.byteLength-target.length,'Invalid encoded HDF5 read.');return inner.readInto(target,offset);}},async release(){if(disposed)return;disposed=true;try{await inner.dispose();}finally{await temporary.dispose();}}};
 }finally{release?.();if(!success){try{await store?.dispose();}finally{await session?.dispose();}}}
}
export async function readPrnuHdf5Blob(blob,{budget,signal,onProgress,storage='auto',temporarySessionId,onTemporarySession,source}={}){
 requireValue(blob instanceof Blob&&blob.size>0,'Original HDF5 Blob required.');requireValue(!source||source.byteLength===blob.size,'PRNU encoded owner length differs.');let session,encoded,database,success=false;
 try{
  try{session=await createTemporarySession({backend:'opfs',budget,signal,id:temporarySessionId});}catch(error){checkAbort(signal);if(!opfsUnavailable(error))throw error;const answer=await readBlobInMemory(blob,{budget,signal,onProgress,storage,temporarySessionId,onTemporarySession,source},error);success=true;return answer;}onTemporarySession?.({id:session.id,backend:session.backend});encoded=await createSegmentedBytes(blob.size,{budget,storage:'temporary',temporarySession:session,signal});if(source)await source.visit(async(bytes,offset)=>{await encoded.write(bytes,offset,{signal});onProgress?.({phase:'prnu-hdf5-input',fraction:(offset+bytes.length)/source.byteLength});},{signal});else await copyBlobToSegments(blob,encoded,{budget,signal,onProgress:f=>onProgress?.({phase:'prnu-hdf5-input',fraction:f})});
  database=await readPrnuDatabase(encoded,{signal,onProgress,maxWorkingBytes:budget.limit,admit:n=>budget.reserve(n),createFingerprintStore:n=>createSegmentedBytes(n,{budget,signal,storage,temporarySession:session})});await encoded.dispose();encoded=null;checkAbort(signal);
  const dispose=database.dispose,temporary=session;let disposed=false;database.dispose=async()=>{if(disposed)return;disposed=true;try{await dispose();}finally{await temporary.dispose();}};success=true;return database;
 }finally{if(!success){try{await database?.dispose();await encoded?.dispose();}finally{await session?.dispose();}}}
}
