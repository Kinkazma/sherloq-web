import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {copyTypedArray} from './allocation.js';
// Internal borrowed view of the engine's already-owned encoded Uint8Array.
// Only admitted range copies escape; closing this view never changes its owner.
export function createOwnedByteSource(input,{budget,chunkBytes=1024**2}={}){
 requireValue(input instanceof Uint8Array&&budget,'Owned encoded bytes and shared budget required.');let bytes=input;const byteLength=bytes.length,alive=()=>{if(!bytes)throw new EngineError('DISPOSED','Owned byte view closed.');};
 const api={byteLength,chunkBytes,async read(offset,length,{signal}={}){alive();requireValue(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(length)&&length>=0&&offset<=byteLength-length,'Invalid original byte range.');checkAbort(signal);const release=budget.reserve(length);let data;try{data=copyTypedArray(bytes.subarray(offset,offset+length),{label:'owned-original-range'});checkAbort(signal);let closed=false;const result={bytes:data,release(){if(closed)return;closed=true;result.bytes=null;data=null;release();}};return result;}catch(error){release();throw error;}},
  async visit(visitor,{signal,offset=0,length=byteLength-offset}={}){alive();requireValue(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(length)&&length>=0&&offset<=byteLength-length,'Invalid original byte range.');for(let at=offset;at<offset+length;at+=chunkBytes){await controlCheckpoint(signal);const p=await api.read(at,Math.min(chunkBytes,offset+length-at),{signal});try{await visitor(p.bytes,at);checkAbort(signal);}finally{p.release();}}},dispose(){bytes=null;}};return api;
}
