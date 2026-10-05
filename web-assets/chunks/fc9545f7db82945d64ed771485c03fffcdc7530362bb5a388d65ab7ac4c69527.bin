import "../../runtime-context.js?v=0.14.5";
// Immutable encoded source; bounded reads and incremental hashes, no Canvas.
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {readBlobBytes} from './allocation.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
export function createBlobSource(blob,{budget,chunkBytes=1024**2}={}){
 requireValue(blob instanceof Blob&&budget&&Number.isSafeInteger(chunkBytes)&&chunkBytes>0,'Blob source and shared budget required.');
 const byteLength=blob.size;let disposed=false,digest;
 const alive=()=>{if(disposed)throw new EngineError('DISPOSED','Original byte source disposed.');};
 const range=(offset,length)=>requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=byteLength-length,'Invalid original byte range.');
 return {
  byteLength,chunkBytes,
  blob(){alive();return blob;},
  async read(offset,length,{signal}={}){alive();range(offset,length);checkAbort(signal);const free=budget.reserve(length);let backing,bytes;
   try{bytes=await readBlobBytes(blob.slice(offset,offset+length),{label:'original-byte-staging'});backing=budget.registerBacking?.('array-buffer',length,{owner:'source',label:'original-byte-staging'});alive();checkAbort(signal);let closed=false;const result={bytes,release(){if(closed)return;closed=true;result.bytes=null;bytes=null;backing?.();backing=null;free();budget.notifyBackingRelease?.('array-buffer',length);}};return result;}
   catch(error){bytes=null;backing?.();if(backing)budget.notifyBackingRelease?.('array-buffer',length);free();throw error;}
  },
  async visit(visitor,{signal,offset=0,length=byteLength-offset}={}){alive();range(offset,length);for(let at=offset;at<offset+length;at+=chunkBytes){await controlCheckpoint(signal);const part=await this.read(at,Math.min(chunkBytes,offset+length-at),{signal});try{await visitor(part.bytes,at);checkAbort(signal);}finally{part.release();}}},
  async sha256({signal,onProgress}={}){alive();checkAbort(signal);if(digest)return digest;const release=budget.reserve(1024**2);try{const state=await createSHA256();await this.visit((bytes,offset)=>{state.update(bytes);onProgress?.((offset+bytes.length)/byteLength);},{signal});alive();checkAbort(signal);const value=state.digest('hex');digest=value;return value;}finally{release();}},
  dispose(){disposed=true;digest=null;blob=null;}
 };
}
