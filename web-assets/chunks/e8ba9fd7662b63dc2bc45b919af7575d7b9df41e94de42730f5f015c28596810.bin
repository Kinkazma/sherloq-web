import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,serializeEngineError} from './errors.js';
import {createTemporarySession as createOpfsSession,temporaryStorageCapabilities as opfsCapabilities,removeTerminatedTemporarySession as removeOpfsSession} from './opfs-storage.js';
import {createIndexedDbSession,removeIndexedDbSession} from './indexeddb-storage.js';
export async function temporaryStorageCapabilities(){const opfs=await opfsCapabilities();return {available:opfs.available||!!globalThis.indexedDB,opfs,indexeddb:!!globalThis.indexedDB,estimateIsReservation:false};}
export async function createTemporarySession(options={}){
 const backend=options.backend??'auto';requireValue(['auto','opfs','indexeddb'].includes(backend),'Invalid temporary storage backend.');
 if(backend==='indexeddb')return createIndexedDbSession(options);
 try{const session=await createOpfsSession(options);return {...session,backend:'opfs'};}
 catch(error){checkAbort(options.signal);if(backend==='opfs'||!['STORAGE_UNAVAILABLE','STORAGE_IO'].includes(error.code))throw error;
  // Only session setup is retried. No partially computed image is reused.
  try{const session=await createIndexedDbSession(options);return {...session,fallback:{from:'opfs',code:error.code,message:error.message}};}catch(alternative){const e=new EngineError(alternative.code??'STORAGE_UNAVAILABLE','OPFS and IndexedDB session setup failed. '+alternative.message,{cause:alternative,details:{previousFailure:serializeEngineError(error)}});e.causes=[{backend:'opfs',code:error.code},{backend:'indexeddb',code:alternative.code}];throw e;}
 }
}
export async function removeTerminatedTemporarySession(id,backend='opfs'){
 requireValue(['opfs','indexeddb'].includes(backend),'Invalid temporary storage backend.');
 return backend==='opfs'?removeOpfsSession(id):removeIndexedDbSession(id);
}
