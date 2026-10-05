import {checkAbort,controlCheckpoint} from './errors.js';

// The owner pins the complete private RAM value. Traversal always copies into
// an admitted buffer; neither kernels nor result surfaces receive cache chunks.
export function gradientCacheStore(base,budget){
 return{
  write(bytes,offset){base.write(bytes,offset);},flush(){},dispose(){},
  async visit(visitor,{signal,blockBytes}={}){
   const size=Math.min(blockBytes,base.byteLength),release=budget.reserve(size);
   try{const buffer=new Uint8Array(size);for(let offset=0;offset<base.byteLength;offset+=size){
    await controlCheckpoint(signal);const part=buffer.subarray(0,Math.min(size,base.byteLength-offset));base.read(part,offset);await visitor(part,offset);checkAbort(signal);
   }}finally{release();}
  }
 };
}
