import {createBlobSource} from './blob-source.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession} from './temporary-storage.js';
import {EngineError,requireValue,controlCheckpoint} from './errors.js';
// Encoded ownership is independent of the decoded camera stores and UI exports.
export function retainPrnuArchive(archive){
 let references=1,closed=false,closing;
 const drop=()=>{
  if(closed)return Promise.resolve();if(references>1){references--;return Promise.resolve();}if(closing)return closing;
  const task=Promise.resolve().then(()=>archive.release()).then(()=>{references=0;closed=true;});closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;
 };
 const reference=(leased=false)=>{
  let released=false,pending;
  const release=()=>{if(released)return Promise.resolve();if(pending)return pending;const task=drop().then(()=>{released=true;});pending=task;void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;};
  const record={...archive,release,...(leased?{dispose:release}:{lease(){requireValue(!closed&&!closing&&!released&&!pending,'PRNU archive was released.');references++;return reference(true);}})};
  Object.defineProperty(record,'released',{get:()=>released,enumerable:true});return record;
 };
 return reference();
}
export async function originalPrnuArchive(record,{budget,signal,onTemporarySession}={}){
 if(record.encodedArchive)return record.encodedArchive.lease();
 if(record.blob){const source=createBlobSource(record.blob,{budget});try{if(record.encodedIntegrity)await source.adoptIntegrity(record.encodedIntegrity,{signal});if(await source.sha256({signal})!==record.sha256)throw new EngineError('SOURCE_CHANGED','The PRNU archive no longer matches the imported database.');return {byteLength:source.byteLength,sha256:record.sha256,metrics:{originalBlobBytes:source.byteLength,originalBlobResidency:'browser-managed; not measured as zero RAM',encodedIntegrityMetadataBytes:source.verificationMetrics().metadataBytes},store:{async readInto(out,offset){const page=await source.read(offset,out.length);try{out.set(page.bytes);}finally{page.release();}}},dispose(){source.dispose();}};}catch(error){source.dispose();throw error;}}
 let session,store,published=false;
 try{session=await createTemporarySession({budget,signal});onTemporarySession?.({id:session.id,backend:session.backend});store=await createSegmentedBytes(record.bytes.length,{budget,signal,storage:'temporary',temporarySession:session});for(let offset=0;offset<record.bytes.length;offset+=1024**2){await controlCheckpoint(signal);await store.write(record.bytes.subarray(offset,offset+1024**2),offset);}await store.flush();published=true;return {byteLength:record.bytes.length,sha256:record.sha256,store,metrics:{temporaryBackend:session.backend},async dispose(){try{await store.dispose();}finally{await session.dispose();}}};}
 finally{if(!published){try{await store?.dispose();}finally{await session?.dispose();}}}
}
