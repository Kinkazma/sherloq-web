import "../../runtime-context.js?v=0.25.0";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {readBlobBytes,allocateTypedArray} from './allocation.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
export const SOURCE_PREFIX_STATE_BYTES=116,SOURCE_PREFIX_CHUNK_BYTES=1024**2;
const equal=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
const changed=message=>new EngineError('SOURCE_CHANGED',message);
export function sourcePrefixMetadataBytes(byteLength,chunkBytes=SOURCE_PREFIX_CHUNK_BYTES){const n=(Math.ceil(byteLength/chunkBytes)+1)*SOURCE_PREFIX_STATE_BYTES;requireValue(Number.isSafeInteger(byteLength)&&byteLength>=0&&Number.isSafeInteger(chunkBytes)&&chunkBytes>0&&Number.isSafeInteger(n),'Invalid encoded source prefix admission.');return n;}
export async function buildSourcePrefixIntegrity(blob,{chunkBytes=SOURCE_PREFIX_CHUNK_BYTES,signal,onProgress,reserveMemory}={}){
 requireValue(blob instanceof Blob&&typeof reserveMemory==='function','Original Blob and prefix admission required.');const metadataBytes=sourcePrefixMetadataBytes(blob.size,chunkBytes),releaseMetadata=reserveMemory(metadataBytes);let releaseWork;
 try{releaseWork=reserveMemory(Math.min(chunkBytes,blob.size)+1024**2);const state=await createSHA256(),initial=state.save();requireValue(initial.length===SOURCE_PREFIX_STATE_BYTES,'The pinned SHA prefix representation changed.');const states=allocateTypedArray(Uint8Array,metadataBytes,{label:'source-prefix-states'});states.set(initial);let index=1;
  for(let offset=0;offset<blob.size;offset+=chunkBytes){await controlCheckpoint(signal);const length=Math.min(chunkBytes,blob.size-offset);let bytes;try{bytes=await readBlobBytes(blob.slice(offset,offset+length),{label:'source-prefix-hash'});}catch(cause){if(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(cause?.code))throw cause;throw new EngineError('SOURCE_CHANGED','The original source changed or became unreadable while its identity was captured.',{cause});}checkAbort(signal);if(bytes.length!==length)throw changed('The original source returned an unexpected end of file.');state.update(bytes);states.set(state.save(),index++*SOURCE_PREFIX_STATE_BYTES);onProgress?.((offset+length)/blob.size);checkAbort(signal);}
  checkAbort(signal);return{manifest:{byteLength:blob.size,chunkBytes,stateBytes:SOURCE_PREFIX_STATE_BYTES,sha256:state.digest('hex'),states},metadataBytes,release:releaseMetadata};
 }catch(error){releaseMetadata();throw error;}finally{releaseWork?.();}
}
export async function createSourcePrefixVerifier(manifest,{expectedSha256=manifest?.sha256}={}){
 requireValue(manifest&&Number.isSafeInteger(manifest.byteLength)&&manifest.byteLength>=0&&Number.isSafeInteger(manifest.chunkBytes)&&manifest.chunkBytes>0&&manifest.stateBytes===SOURCE_PREFIX_STATE_BYTES&&manifest.states instanceof Uint8Array&&manifest.states.length===sourcePrefixMetadataBytes(manifest.byteLength,manifest.chunkBytes)&&typeof expectedSha256==='string'&&/^[a-f0-9]{64}$/i.test(expectedSha256)&&manifest.sha256===expectedSha256.toLowerCase(),'An admitted original-source prefix manifest is required.');
 const state=await createSHA256(),{states,byteLength,chunkBytes,stateBytes}=manifest;requireValue(equal(state.save(),states.subarray(0,stateBytes)),'Invalid initial source prefix state.');state.load(states.subarray(states.length-stateBytes));if(state.digest('hex')!==expectedSha256.toLowerCase())throw changed('The final encoded-source prefix does not match its original SHA-256.');
 const verifyBlock=(index,bytes)=>{const offset=index*chunkBytes,length=Math.min(chunkBytes,byteLength-offset);requireValue(Number.isSafeInteger(index)&&index>=0&&offset<byteLength&&bytes instanceof Uint8Array,'Invalid original-source block.');if(bytes.length!==length)throw changed('The original source returned an unexpected end of file.');state.load(states.subarray(index*stateBytes,(index+1)*stateBytes)).update(bytes);if(!equal(state.save(),states.subarray((index+1)*stateBytes,(index+2)*stateBytes)))throw changed('The bytes consumed by analysis do not match the loaded original source.');};
 return{verifyBlock,verifyRangeSync(offset,bytes,readBlock){requireValue(Number.isSafeInteger(offset)&&offset>=0&&bytes instanceof Uint8Array&&offset<=byteLength-bytes.length&&typeof readBlock==='function','Invalid encoded-source read range.');const end=offset+bytes.length;if(!bytes.length)return;
  for(let index=Math.floor(offset/chunkBytes);index*chunkBytes<end;index++){const start=index*chunkBytes,length=Math.min(chunkBytes,byteLength-start),a=Math.max(start,offset),b=Math.min(start+length,end);if(a===start&&b===start+length)verifyBlock(index,bytes.subarray(a-offset,b-offset));else{const block=readBlock(start,length);verifyBlock(index,block);if(!equal(bytes.subarray(a-offset,b-offset),block.subarray(a-start,b-start)))throw changed('A partial parser read conflicts with its verified original-source block.');}}
 }};
}
// The caller owns this encoded Uint8Array for the entire native decode. No File
// or Blob is re-read and no second full encoded buffer is created here.
export async function captureOwnedSourcePrefixIntegrity(bytes,{chunkBytes=SOURCE_PREFIX_CHUNK_BYTES,signal,onProgress,reserveMemory}={}){
 requireValue(bytes instanceof Uint8Array&&typeof reserveMemory==='function','Owned original bytes and prefix admission required.');const metadataBytes=sourcePrefixMetadataBytes(bytes.length,chunkBytes),release=reserveMemory(metadataBytes);let work;
 try{work=reserveMemory(1024**2);const state=await createSHA256(),states=allocateTypedArray(Uint8Array,metadataBytes,{label:'owned-source-prefix-states'}),initial=state.save();requireValue(initial.length===SOURCE_PREFIX_STATE_BYTES,'The pinned SHA prefix representation changed.');states.set(initial);let index=1;
  for(let offset=0;offset<bytes.length;offset+=chunkBytes){await controlCheckpoint(signal);const end=Math.min(offset+chunkBytes,bytes.length);state.update(bytes.subarray(offset,end));states.set(state.save(),index++*SOURCE_PREFIX_STATE_BYTES);onProgress?.(end/bytes.length);checkAbort(signal);}
  checkAbort(signal);return{manifest:{byteLength:bytes.length,chunkBytes,stateBytes:SOURCE_PREFIX_STATE_BYTES,sha256:state.digest('hex'),states},metadataBytes,release};
 }catch(error){release();throw error;}finally{work?.();}
}
