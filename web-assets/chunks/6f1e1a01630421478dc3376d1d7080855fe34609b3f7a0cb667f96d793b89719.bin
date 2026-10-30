import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {readBlobBytes} from './allocation.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
export const SOURCE_TRANSCRIPT_ENTRY_BYTES=512,SOURCE_VERIFY_CHUNK_BYTES=1024**2;
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const changed=(message,details)=>new EngineError('SOURCE_CHANGED',message,{details});

// Fingerprint the exact buffer supplied to the parser. Exact repeated ranges
// share one admitted record. Source bytes are never retained in this journal.
export async function createSourceReadTranscript(byteLength,{reserveMemory}={}){
 requireValue(Number.isSafeInteger(byteLength)&&byteLength>0&&typeof reserveMemory==='function','Admitted source transcript required.');
 const state=await createSHA256(),ranges=new Map();let rawBytes=0,reads=0,closed=false,pending=0,queue=Promise.resolve();
 return{record(offset,input){
  requireValue(!closed&&input instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=byteLength-input.length,'Invalid parser byte range.');
  if(!input.length)return Promise.resolve();reads++;rawBytes+=input.length;const key=offset+':'+input.length,length=input.length,digest=state.init().update(input).digest('hex');pending++;const work=async()=>{try{const old=ranges.get(key);
  if(old){if(old.sha256!==digest)throw changed('The original source returned conflicting bytes during analysis.',{offset,length:input.length});return;}
  await reserveMemory(SOURCE_TRANSCRIPT_ENTRY_BYTES);ranges.set(key,{offset,length,sha256:digest});}finally{pending--;}};const result=queue.then(work);queue=result.catch(()=>{});return result;
 },take(){requireValue(!closed&&!pending,'Source transcript already transferred.');closed=true;const list=[...ranges.values()].sort((a,b)=>a.offset-b.offset||a.length-b.length);return{byteLength,ranges:list,metrics:{reads,rawReadBytes:rawBytes,fingerprintedReadBytes:list.reduce((n,r)=>n+r.length,0),ranges:list.length,journalAdmissionBytes:list.length*SOURCE_TRANSCRIPT_ENTRY_BYTES,sourceCopyBytes:0}};}};
}

// Both the complete SHA and every consumed-range SHA use these SAME read
// buffers in ONE pass. B consumed by the parser cannot be hidden by restoring A
// before verification. Overlapping and reverse-order reads obey the same rule.
export async function verifySourceReadTranscript(blob,transcript,{expectedSha256,signal,onProgress,reserveMemory,chunkBytes=SOURCE_VERIFY_CHUNK_BYTES}={}){
 requireValue(blob instanceof Blob&&blob.size>0&&transcript?.byteLength===blob.size&&Array.isArray(transcript.ranges)&&typeof reserveMemory==='function'&&Number.isSafeInteger(chunkBytes)&&chunkBytes>0&&hex(expectedSha256),'Original source and admitted transcript verification required.');
 const unique=new Map();for(const r of transcript.ranges){requireValue(Number.isSafeInteger(r.offset)&&r.offset>=0&&Number.isSafeInteger(r.length)&&r.length>0&&r.offset<=blob.size-r.length&&hex(r.sha256),'Invalid source transcript range.');const key=r.offset+':'+r.length,old=unique.get(key);if(old&&old.sha256!==r.sha256)throw changed('The original source returned conflicting bytes during analysis.',{offset:r.offset,length:r.length});if(!old)unique.set(key,{offset:r.offset,length:r.length,sha256:r.sha256.toLowerCase()});}
 const ranges=[...unique.values()].sort((a,b)=>a.offset-b.offset||a.length-b.length);let coveredBytes=0,end=0;for(const r of ranges){coveredBytes+=Math.max(0,r.offset+r.length-Math.max(end,r.offset));end=Math.max(end,r.offset+r.length);}
 checkAbort(signal);const size=Math.min(chunkBytes,blob.size),release=reserveMemory(size+1024**2);let checked=0,next=0,rangeHashBytes=0;const active=new Set();
 try{const full=await createSHA256(),range=await createSHA256();checkAbort(signal);const initial=range.init().save();requireValue(initial.byteLength<=SOURCE_TRANSCRIPT_ENTRY_BYTES,'Source fingerprint state exceeds its admitted record.');
  for(let offset=0;offset<blob.size;offset+=size){await controlCheckpoint(signal);const length=Math.min(size,blob.size-offset),limit=offset+length;let bytes;
   try{bytes=await readBlobBytes(blob.slice(offset,limit),{label:'source-transcript-verification'});}catch(cause){if(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(cause?.code))throw cause;throw new EngineError('SOURCE_CHANGED','The original source changed or became unreadable during verification.',{cause});}
   checkAbort(signal);if(bytes.length!==length)throw changed('The original source length changed during verification.');full.update(bytes);
   while(next<ranges.length&&ranges[next].offset<limit){const r=ranges[next++];r.state=initial;active.add(r);}
   for(const r of active){const a=Math.max(offset,r.offset),b=Math.min(limit,r.offset+r.length);range.load(r.state).update(bytes.subarray(a-offset,b-offset));rangeHashBytes+=b-a;
    if(b===r.offset+r.length){const actual=range.digest('hex');r.state=null;active.delete(r);if(actual!==r.sha256)throw changed('The bytes consumed by analysis do not match the loaded original source.',{offset:r.offset,length:r.length,consumedRangeSha256:r.sha256,verifiedRangeSha256:actual});}else r.state=range.save();}
   checked+=length;onProgress?.(checked/blob.size);checkAbort(signal);
  }
  const actual=full.digest('hex');if(actual!==expectedSha256.toLowerCase())throw changed('The original source no longer matches the loaded source SHA-256.',{expectedSha256,verifiedSourceSha256:actual});
  return{verified:true,sha256:actual,sourceBytes:blob.size,hashedBytes:checked,rangeHashBytes,coveredBytes,ranges:ranges.length,journalAdmissionBytes:ranges.length*SOURCE_TRANSCRIPT_ENTRY_BYTES,maxHashChunkBytes:size,sourceCopyBytes:0,method:'same-buffer-complete-and-consumed-range-sha256'};
 }finally{release();}
}
