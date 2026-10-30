import "../../runtime-context.js?v=0.30.0";
// A DOM File may change. Cached identity belongs to captured SHA prefix states;
// later reads use certified owned buffers, never an assumed immutable File.
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {readBlobBytes,allocateTypedArray} from './allocation.js';
import {buildSourcePrefixIntegrity,createSourcePrefixVerifier} from './source-prefix-integrity.js';
let serial=0;
export function createBlobSource(blob,{budget,chunkBytes=1024**2}={}){
 requireValue(blob instanceof Blob&&budget&&Number.isSafeInteger(chunkBytes)&&chunkBytes>0,'Blob source and shared budget required.');
 const byteLength=blob.size,cachePrefix='encoded-source-block-'+(++serial)+'\0';let disposed=false,digest,integrity,metadataRelease,hashing;
 const verification={physicalReadBytes:0,physicalReadCalls:0,verifiedBlocks:0,ownedCacheHits:0,metadataBytes:0};
 const alive=()=>{if(disposed)throw new EngineError('DISPOSED','Original byte source disposed.');};
 const range=(offset,length)=>requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=byteLength-length,'Invalid original byte range.');
 const readRaw=async(offset,length)=>{let bytes;try{bytes=await readBlobBytes(blob.slice(offset,offset+length),{label:'original-byte-staging'});}catch(cause){if(!integrity||['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(cause?.code))throw cause;throw new EngineError('SOURCE_CHANGED','The original source changed or became unreadable during analysis.',{cause});}verification.physicalReadCalls++;verification.physicalReadBytes+=bytes.length;if(bytes.length!==length)throw new EngineError('SOURCE_CHANGED','The original source returned an unexpected end of file.');return bytes;};
 const api={byteLength,chunkBytes,
  blob(){alive();return blob;},integrity(){alive();return integrity;},verificationMetrics(){alive();return{...verification,sha256:digest??null};},
  async read(offset,length,{signal,cooperate}={}){requireValue(cooperate===undefined||typeof cooperate==='function','Invalid source transfer cooperation.');alive();range(offset,length);checkAbort(signal);const free=budget.reserve(length);let backing,bytes,work;
   try{if(!integrity)bytes=await readRaw(offset,length);else{bytes=allocateTypedArray(Uint8Array,length,{label:'verified-original-range'});let verifier;const end=offset+length;
    for(let index=Math.floor(offset/chunkBytes);length&&index*chunkBytes<end;index++){checkAbort(signal);await (cooperate??controlCheckpoint)(signal);alive();checkAbort(signal);const start=index*chunkBytes,n=Math.min(chunkBytes,byteLength-start),key=cachePrefix+index;let block=budget.get?.(key)?.value;
     if(block){verification.ownedCacheHits++;}else{work??=budget.reserve(Math.min(chunkBytes,byteLength)+1024**2);block=await readRaw(start,n);alive();checkAbort(signal);verifier??=await createSourcePrefixVerifier(integrity);verifier.verifyBlock(index,block);verification.verifiedBlocks++;if(!budget.recovering)budget.put?.(key,{value:block,byteLength:block.length});}
     const a=Math.max(offset,start),b=Math.min(end,start+n);bytes.set(block.subarray(a-start,b-start),a-offset);
    }
   }alive();checkAbort(signal);backing=budget.registerBacking?.('array-buffer',length,{owner:'source',label:'original-byte-staging'});let closed=false;const result={bytes,release(){if(closed)return;closed=true;result.bytes=null;bytes=null;backing?.();backing=null;free();budget.notifyBackingRelease?.('array-buffer',length);}};return result;}
   catch(error){bytes=null;backing?.();if(backing)budget.notifyBackingRelease?.('array-buffer',length);free();throw error;}finally{work?.();}
  },
  async visit(visitor,{signal,offset=0,length=byteLength-offset}={}){alive();range(offset,length);for(let at=offset;at<offset+length;at+=chunkBytes){await controlCheckpoint(signal);const part=await api.read(at,Math.min(chunkBytes,offset+length-at),{signal});try{await visitor(part.bytes,at);checkAbort(signal);}finally{part.release();}}},
  async adoptIntegrity(manifest,{signal}={}){alive();checkAbort(signal);requireValue(!integrity&&!hashing&&manifest?.byteLength===byteLength,'Original source identity cannot be replaced.');const free=budget.reserve(manifest.states?.byteLength??0);try{await createSourcePrefixVerifier(manifest);alive();checkAbort(signal);if(budget.retain){free();budget.retain(manifest.states.byteLength);metadataRelease=()=>{budget.retained-=manifest.states.byteLength;};}else metadataRelease=free;integrity=manifest;digest=manifest.sha256;verification.metadataBytes=manifest.states.byteLength;}catch(error){free();throw error;}},
  async sha256({signal,onProgress}={}){alive();checkAbort(signal);if(digest)return digest;if(hashing)return hashing;hashing=(async()=>{let built;try{built=await buildSourcePrefixIntegrity(blob,{chunkBytes,signal,onProgress,reserveMemory:n=>budget.reserve(n)});alive();checkAbort(signal);if(budget.retain){built.release();budget.retain(built.metadataBytes);metadataRelease=()=>{budget.retained-=built.metadataBytes;};}else metadataRelease=built.release;integrity=built.manifest;digest=integrity.sha256;verification.metadataBytes=built.metadataBytes;return digest;}catch(error){built?.release();throw error;}finally{hashing=null;}})();return hashing;},
  dispose(){if(disposed)return;disposed=true;budget.clearPrefix?.(cachePrefix);metadataRelease?.();metadataRelease=null;integrity=null;digest=null;blob=null;}
 };return api;
}
