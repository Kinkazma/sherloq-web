import "../../runtime-context.js?v=0.14.5";
import {createBlobSource} from './blob-source.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession} from './temporary-storage.js';
import {requireValue,controlCheckpoint} from './errors.js';
// Encoded ownership is independent of the decoded camera stores and UI exports.
export function retainPrnuArchive(archive){
 let references=1,closed=false;
 const drop=async()=>{if(--references===0){closed=true;await archive.release();}};
 return {...archive,async release(){if(closed||this.released)return;this.released=true;await drop();},lease(){requireValue(!closed&&!this.released,'PRNU archive was released.');references++;let released=false;return {...archive,async dispose(){if(released)return;released=true;await drop();}};}};
}
export async function originalPrnuArchive(record,{budget,signal,onTemporarySession}={}){
 if(record.encodedArchive)return record.encodedArchive.lease();
 if(record.blob){const source=createBlobSource(record.blob,{budget});return {byteLength:source.byteLength,sha256:record.sha256,metrics:{originalBlobBytes:source.byteLength,originalBlobResidency:'browser-managed; not measured as zero RAM'},store:{async readInto(out,offset){const page=await source.read(offset,out.length);try{out.set(page.bytes);}finally{page.release();}}},dispose(){source.dispose();}};}
 let session,store,published=false;
 try{session=await createTemporarySession({budget,signal});onTemporarySession?.({id:session.id,backend:session.backend});store=await createSegmentedBytes(record.bytes.length,{budget,signal,storage:'temporary',temporarySession:session});for(let offset=0;offset<record.bytes.length;offset+=1024**2){await controlCheckpoint(signal);await store.write(record.bytes.subarray(offset,offset+1024**2),offset);}await store.flush();published=true;return {byteLength:record.bytes.length,sha256:record.sha256,store,metrics:{temporaryBackend:session.backend},async dispose(){try{await store.dispose();}finally{await session.dispose();}}};}
 finally{if(!published){try{await store?.dispose();}finally{await session?.dispose();}}}
}
