import {readPrnuDatabase} from './prnu-hdf5.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession} from './temporary-storage.js';
import {requireValue} from './errors.js';
export async function readPrnuStoredDatabase(bytes,{budget,signal,onProgress,storage='auto',temporarySessionId,onTemporarySession}={}){
 requireValue(['auto','memory','temporary'].includes(storage),'Invalid PRNU fingerprint storage.');let session,database;
 const ensure=async()=>{if(!session){session=await createTemporarySession({budget,signal,id:temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});}return session;};
 try{
  database=await readPrnuDatabase(bytes,{signal,onProgress,maxWorkingBytes:budget.limit,admit:n=>budget.reserve(n),createFingerprintStore:byteLength=>createSegmentedBytes(byteLength,{budget,signal,storage,chunkBytes:65536,getTemporarySession:ensure})});
  const release=database.dispose;database.dispose=async()=>{try{await release();}finally{await session?.dispose();}};
  return {database,temporaryBackend:session?.backend??null};
 }catch(error){try{await database?.dispose();}finally{await session?.dispose();}throw error;}
}
