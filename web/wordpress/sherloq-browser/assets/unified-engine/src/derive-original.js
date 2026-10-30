import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {createOwnedByteSource} from './owned-byte-source.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession} from './temporary-storage.js';
import {readBlobBytes,copyTypedArray} from './allocation.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
const CHUNK=1024**2;
// Coordinates always refer to the ORIGINAL encoded source, never shifted edits.
function patchPlan(source,patches){
 const originalSizeBytes=source instanceof Blob?source.size:source instanceof Uint8Array?source.byteLength:source?.byteLength;
 requireValue(Number.isSafeInteger(originalSizeBytes)&&originalSizeBytes>=0&&Array.isArray(patches)&&patches.length<=65536,'An original byte source and at most 65536 patches are required.');let sizeBytes=originalSizeBytes,insertedBytes=0,previousOffset=-1,previousEnd=0;
 for(const patch of patches){requireValue(patch&&Number.isSafeInteger(patch.offset)&&Number.isSafeInteger(patch.deleteCount)&&patch.bytes instanceof Uint8Array,'Each patch requires offset, deleteCount and Uint8Array bytes.');const{offset,deleteCount,bytes}=patch;requireValue(offset>=0&&deleteCount>=0&&offset<=originalSizeBytes-deleteCount,'Patch exceeds original byte range.');requireValue(offset>previousOffset&&offset>=previousEnd,'Patches must have strictly increasing, nonoverlapping original offsets.');requireValue(deleteCount>0||bytes.byteLength>0,'Empty patches are not edits.');sizeBytes+=bytes.byteLength-deleteCount;insertedBytes+=bytes.byteLength;requireValue(Number.isSafeInteger(sizeBytes)&&Number.isSafeInteger(insertedBytes),'Derived file size exceeds safe integer range.');previousOffset=offset;previousEnd=offset+deleteCount;}
 return{originalSizeBytes,sizeBytes,insertedBytes,patchCount:patches.length};
}
const editsSnapshot=patches=>patches.map(({offset,deleteCount,bytes})=>({offset,deleteCount,bytes:copyTypedArray(bytes,{label:'derived-edit-snapshot'})}));
async function emitEdits(source,edits,emit,{sizeBytes,signal,onProgress}){
 const report=[],cooperate=createCooperator(signal);let cursor=0,written=0,nextProgress=performance.now()+8;onProgress?.(0);checkAbort(signal);
 const output=async bytes=>{for(let offset=0;offset<bytes.length;offset+=CHUNK){await cooperate();const part=bytes.subarray(offset,offset+CHUNK);await emit(part,written);written+=part.length;if(part.length===CHUNK||written===sizeBytes||performance.now()>=nextProgress){onProgress?.(sizeBytes?written/sizeBytes:1);nextProgress=performance.now()+8;}checkAbort(signal);}};
 const original=async end=>{while(cursor<end){await cooperate();const n=Math.min(CHUNK,end-cursor),part=await source.read(cursor,n,{signal});try{await output(part.bytes);}finally{part.release();}cursor+=n;}};
 for(const edit of edits){await original(edit.offset);report.push({offset:edit.offset,deleteCount:edit.deleteCount,insertedBytes:edit.bytes.length,outputOffset:written});await output(edit.bytes);cursor=edit.offset+edit.deleteCount;}
 await original(source.byteLength);requireValue(written===sizeBytes,'Derived byte count mismatch.');return report;
}
// Compatibility API: a real owned Blob, admitted in full. It never retains
// File-backed slices. Large browser copies should use the archive API below.
export async function deriveOriginalBytes(input,patches,{budget,signal,onProgress}={}){
 requireValue(budget&&(input instanceof Blob||input instanceof Uint8Array||typeof input?.read==='function'),'Original source and shared budget required.');checkAbort(signal);const plan=patchPlan(input,patches),sourceCopyBytes=input instanceof Blob||input instanceof Uint8Array?plan.originalSizeBytes:0,workingBytes=sourceCopyBytes+plan.sizeBytes+plan.insertedBytes*2+(patches.length+1)*1024;requireValue(Number.isSafeInteger(workingBytes),'Patch staging exceeds safe integer range.');const free=budget.reserve(workingBytes);let view;
 try{
  // Snapshot caller-owned patch arrays and U8 input before the first await.
  const edits=editsSnapshot(patches),owned=input instanceof Uint8Array?copyTypedArray(input,{label:'derived-original-snapshot'}):input instanceof Blob?await readBlobBytes(input,{label:'derived-original-snapshot'}):null;checkAbort(signal);const source=owned?(view=createOwnedByteSource(owned,{budget})):input,parts=[];
  const report=await emitEdits(source,edits,bytes=>{parts.push(new Blob([bytes]));},{...plan,signal,onProgress});checkAbort(signal);const blob=new Blob(parts,{type:'application/octet-stream'});requireValue(blob.size===plan.sizeBytes,'Derived byte count mismatch.');onProgress?.(1);checkAbort(signal);
  return{blob,sizeBytes:plan.sizeBytes,originalSizeBytes:plan.originalSizeBytes,edits:report,metrics:{patchCount:plan.patchCount,insertedBytes:plan.insertedBytes,sourceCopyBytes,outputOwnedBytes:plan.sizeBytes,workingBytes,blobResidency:'owned output bytes; admitted during construction; returned Blob ownership passes to caller'}};
 }finally{view?.dispose();free();}
}
// Explicit streaming output: the owner remains in the existing export registry
// until releaseExport. RAM/temporary storage keeps large UI copies bounded.
export async function deriveOriginalArchive(source,patches,{budget,signal,onProgress,storage='auto',temporarySessionId,onTemporarySession}={}){
 requireValue(budget&&typeof source?.read==='function'&&['auto','temporary'].includes(storage),'An owned original byte reader and shared budget are required.');checkAbort(signal);const plan=patchPlan(source,patches),workingBytes=2*CHUNK+plan.insertedBytes*2+(patches.length+1)*1024;requireValue(Number.isSafeInteger(workingBytes),'Patch staging exceeds safe integer range.');const free=budget.reserve(workingBytes);let store,session,published=false;
 const getTemporarySession=async({signal:taskSignal}={})=>{checkAbort(taskSignal);if(!session){session=await createTemporarySession({budget,signal:taskSignal,id:temporarySessionId});onTemporarySession?.({id:session.id,backend:session.backend});}return session;};
 try{
  const edits=editsSnapshot(patches);store=await createSegmentedBytes(plan.sizeBytes,{budget,storage:storage==='temporary'?'temporary':'auto',getTemporarySession,signal,owner:'derived-original',label:'derived-original-output'});const hash=await createSHA256();
  const report=await emitEdits(source,edits,async(bytes,offset)=>{hash.update(bytes);await store.write(bytes,offset);},{...plan,signal,onProgress});await store.flush();checkAbort(signal);const sha256=hash.digest('hex');onProgress?.(1);checkAbort(signal);
  let disposed=false;const result={store,session,byteLength:plan.sizeBytes,sha256,mime:'application/octet-stream',format:'bin',sizeBytes:plan.sizeBytes,originalSizeBytes:plan.originalSizeBytes,edits:report,metrics:{patchCount:plan.patchCount,insertedBytes:plan.insertedBytes,sourceCopyBytes:0,workingBytes,storage:store.storage,temporaryBackend:session?.backend??null,maxSourceWindowBytes:CHUNK},async dispose(){if(disposed)return;disposed=true;try{await store.dispose();}finally{await session?.dispose();}}};published=true;return result;
 }finally{try{if(!published){try{await store?.dispose();}finally{await session?.dispose();}}}finally{free();}}
}
