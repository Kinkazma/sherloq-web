import {writePrnuDatabase,readPrnuDatabase} from './prnu-hdf5.js';
import {createTemporarySession} from './temporary-storage.js';
import {createSegmentedBytes,copyBlobToSegments} from './segmented-bytes.js';
import {requireValue,controlCheckpoint,checkAbort} from './errors.js';
// Own encoded storage and archive lifetime. The native HDF5 driver is sync, so
// disk-backed encoded files use OPFS in the owning dedicated worker.
export async function writePrnuHdf5Pages(database,{budget,signal,onProgress,temporarySessionId,onTemporarySession}={}){
 let session,store,success=false,release;
 try{
  const raw=database.cameras.reduce((n,c)=>n+c.fingerprint.width*c.fingerprint.height*8,0),metadata=database.cameras.reduce((n,c)=>n+JSON.stringify(c.trainingManifest).length*4+JSON.stringify(c.skippedImages??[]).length*4,0),capacity=raw*2+metadata+32*1024**2;
  requireValue(Number.isSafeInteger(capacity),'PRNU encoded capacity exceeds safe offsets.');session=await createTemporarySession({backend:'opfs',budget,signal,id:temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});store=await createSegmentedBytes(capacity,{budget,storage:'temporary',temporarySession:session,signal});
  const result=await writePrnuDatabase(database,{signal,onProgress,maxWorkingBytes:budget.limit,admit:n=>budget.reserve(n),encodedStore:store}),{createSHA256}=await import('../vendor/hash-wasm/hashes.js'),hash=await createSHA256();release=budget.reserve(1024**2);const bytes=new Uint8Array(1024**2);let last=performance.now();
  for(let offset=0;offset<result.byteLength;offset+=bytes.length){checkAbort(signal);if(performance.now()-last>=8){await controlCheckpoint(signal);last=performance.now();}const part=bytes.subarray(0,Math.min(bytes.length,result.byteLength-offset));await store.readInto(part,offset);hash.update(part);onProgress?.({phase:'prnu-hdf5-hash',completed:offset+part.length,total:result.byteLength});}
  await store.flush();const inner=store,temporary=session;let disposed=false;success=true;
  return {byteLength:result.byteLength,sha256:hash.digest('hex'),mime:'application/x-hdf5',metrics:{encodedCapacityBytes:capacity,heapBytes:result.heapBytes,workingBytes:result.workingBytes,temporaryBackend:'opfs'},store:{byteLength:result.byteLength,readInto(target,offset=0){requireValue(!disposed&&offset>=0&&offset<=result.byteLength-target.length,'Invalid encoded HDF5 read.');return inner.readInto(target,offset);}},async release(){if(disposed)return;disposed=true;try{await inner.dispose();}finally{await temporary.dispose();}}};
 }finally{release?.();if(!success){try{await store?.dispose();}finally{await session?.dispose();}}}
}
export async function readPrnuHdf5Blob(blob,{budget,signal,onProgress,storage='auto',temporarySessionId,onTemporarySession}={}){
 requireValue(blob instanceof Blob&&blob.size>0,'Original HDF5 Blob required.');let session,encoded,database,success=false;
 try{
  session=await createTemporarySession({backend:'opfs',budget,signal,id:temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});encoded=await createSegmentedBytes(blob.size,{budget,storage:'temporary',temporarySession:session,signal});await copyBlobToSegments(blob,encoded,{budget,signal,onProgress:f=>onProgress?.({phase:'prnu-hdf5-input',fraction:f})});
  database=await readPrnuDatabase(encoded,{signal,onProgress,maxWorkingBytes:budget.limit,admit:n=>budget.reserve(n),createFingerprintStore:n=>createSegmentedBytes(n,{budget,signal,storage,temporarySession:session})});await encoded.dispose();encoded=null;
  const dispose=database.dispose,temporary=session;let disposed=false;database.dispose=async()=>{if(disposed)return;disposed=true;try{await dispose();}finally{await temporary.dispose();}};success=true;return database;
 }finally{if(!success){try{await database?.dispose();await encoded?.dispose();}finally{await session?.dispose();}}}
}
