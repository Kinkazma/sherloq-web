import "../../runtime-context.js?v=0.14.5";
import {byteRange,byteLength as rangeLength,byteView} from './memory-range.js';
import {EngineError,requireValue} from './errors.js';

// Borrowed immutable SAB banks. The sending owner holds a read lease for the
// full worker lifetime; this adapter neither owns nor recounts the backing RAM.
export function sharedSegmentedReader(descriptor){
 const {byteLength,chunkBytes,segments}=descriptor??{};
 requireValue(Number.isSafeInteger(byteLength)&&byteLength>=0&&Number.isSafeInteger(chunkBytes)&&chunkBytes>0&&Array.isArray(segments),'Invalid shared segmented descriptor.');
 const banks=new Map();let disposed=false;
 for(const [index,buffer] of segments){requireValue(Number.isSafeInteger(index)&&index>=0&&index<Math.ceil(byteLength/chunkBytes)&&!banks.has(index)&&typeof SharedArrayBuffer==='function'&&buffer instanceof SharedArrayBuffer&&buffer.byteLength===Math.min(chunkBytes,byteLength-index*chunkBytes),'Invalid shared segmented bank.');banks.set(index,new Uint8Array(buffer));}
 return {byteLength,chunkBytes,storage:'memory',shared:true,
  readInto(target,offset=0){if(disposed)throw new EngineError('DISPOSED','Shared segmented reader disposed.');const original=target;target=byteRange(target);const length=rangeLength(target);requireValue(Number.isSafeInteger(offset)&&offset>=0&&offset<=byteLength-length,'Invalid shared byte range.');let done=0;while(done<length){const at=offset+done,index=Math.floor(at/chunkBytes),within=at%chunkBytes,n=Math.min(length-done,chunkBytes-within),bank=banks.get(index);if(bank)byteView(target,done,n).set(bank.subarray(within,within+n));else byteView(target,done,n).fill(0);done+=n;}return original;},
  async dispose(){disposed=true;banks.clear();}
 };
}
