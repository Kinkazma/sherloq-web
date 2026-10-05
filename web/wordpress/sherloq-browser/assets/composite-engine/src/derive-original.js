import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

// Patches use immutable ORIGINAL coordinates, never positions shifted by prior edits.
export async function deriveOriginalBytes(source,patches,{budget,signal,onProgress}={}){
 requireValue((source instanceof Blob||source instanceof Uint8Array)&&budget,'Original source and shared budget required.');
 requireValue(Array.isArray(patches)&&patches.length<=65536,'At most 65536 patches are supported.');
 checkAbort(signal);
 const originalSizeBytes=source instanceof Blob?source.size:source.byteLength;
 let sizeBytes=originalSizeBytes,insertedBytes=0,previousOffset=-1,previousEnd=0;
 for(const patch of patches){
  requireValue(patch&&Number.isSafeInteger(patch.offset)&&Number.isSafeInteger(patch.deleteCount)&&patch.bytes instanceof Uint8Array,'Each patch requires offset, deleteCount and Uint8Array bytes.');
  const {offset,deleteCount,bytes}=patch;
  requireValue(offset>=0&&deleteCount>=0&&offset<=originalSizeBytes-deleteCount,'Patch exceeds original byte range.');
  requireValue(offset>previousOffset&&offset>=previousEnd,'Patches must have strictly increasing, nonoverlapping original offsets.');
  requireValue(deleteCount>0||bytes.byteLength>0,'Empty patches are not edits.');
  sizeBytes+=bytes.byteLength-deleteCount;insertedBytes+=bytes.byteLength;
  requireValue(Number.isSafeInteger(sizeBytes)&&Number.isSafeInteger(insertedBytes),'Derived file size exceeds safe integer range.');
  previousOffset=offset;previousEnd=offset+deleteCount;
 }
 const sourceCopyBytes=source instanceof Uint8Array?source.byteLength:0;
 const workingBytes=sourceCopyBytes+insertedBytes*2+(patches.length+1)*1024;
 requireValue(Number.isSafeInteger(workingBytes),'Patch staging exceeds safe integer range.');
 const release=budget.reserve(workingBytes);
 try{
  // Snapshot all mutable inputs before the first await or caller callback.
  const original=source instanceof Blob?source:new Blob([source]);
  const edits=patches.map(({offset,deleteCount,bytes})=>({offset,deleteCount,insertedBytes:bytes.byteLength,blob:new Blob([bytes])}));
  const parts=[],report=[];let cursor=0,outputOffset=0;
  for(let i=0;i<edits.length;i++){
   if(i%128===0)await controlCheckpoint(signal);
   const edit=edits[i];
   if(edit.offset>cursor){parts.push(original.slice(cursor,edit.offset));outputOffset+=edit.offset-cursor;}
   if(edit.insertedBytes)parts.push(edit.blob);
   report.push({offset:edit.offset,deleteCount:edit.deleteCount,insertedBytes:edit.insertedBytes,outputOffset});
   outputOffset+=edit.insertedBytes;cursor=edit.offset+edit.deleteCount;
   if((i+1)%128===0)onProgress?.((i+1)/edits.length);
  }
  if(cursor<original.size)parts.push(original.slice(cursor));
  checkAbort(signal);const blob=new Blob(parts,{type:'application/octet-stream'});
  requireValue(blob.size===sizeBytes,'Derived byte count mismatch.');
  onProgress?.(1);checkAbort(signal);
  return {blob,sizeBytes,originalSizeBytes,edits:report,metrics:{patchCount:edits.length,insertedBytes,sourceCopyBytes,workingBytes,blobResidency:'browser-managed; not measured as zero RAM'}};
 }finally{release();}
}
