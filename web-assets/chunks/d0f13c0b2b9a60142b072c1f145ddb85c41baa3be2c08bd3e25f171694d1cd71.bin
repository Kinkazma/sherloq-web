import "../../runtime-context.js?v=0.14.5";
// Immutable encoded source; bounded reads and incremental hashes, no Canvas.
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
export function createBlobSource(blob,{budget,chunkBytes=1024**2}={}){
 requireValue(blob instanceof Blob&&budget&&Number.isSafeInteger(chunkBytes)&&chunkBytes>0,'Blob source and shared budget required.');
 const byteLength=blob.size;let disposed=false,digest;
 const alive=()=>{if(disposed)throw new EngineError('DISPOSED','Original byte source disposed.');};
 const range=(offset,length)=>requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=byteLength-length,'Invalid original byte range.');
 return {
  byteLength,chunkBytes,
  blob(){alive();return blob;},
  async read(offset,length,{signal}={}){alive();range(offset,length);checkAbort(signal);const release=budget.reserve(length);try{const bytes=new Uint8Array(await blob.slice(offset,offset+length).arrayBuffer());alive();checkAbort(signal);return {bytes,release};}catch(e){release();if(e instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Original byte staging allocation failed.');throw e;}},
  async visit(visitor,{signal,offset=0,length=byteLength-offset}={}){alive();range(offset,length);for(let at=offset;at<offset+length;at+=chunkBytes){await controlCheckpoint(signal);const part=await this.read(at,Math.min(chunkBytes,offset+length-at),{signal});try{await visitor(part.bytes,at);checkAbort(signal);}finally{part.release();}}},
  async sha256({signal,onProgress}={}){alive();checkAbort(signal);if(digest)return digest;const release=budget.reserve(1024**2);try{const state=await createSHA256();await this.visit((bytes,offset)=>{state.update(bytes);onProgress?.((offset+bytes.length)/byteLength);},{signal});alive();checkAbort(signal);const value=state.digest('hex');digest=value;return value;}finally{release();}},
  dispose(){disposed=true;digest=null;blob=null;}
 };
}
