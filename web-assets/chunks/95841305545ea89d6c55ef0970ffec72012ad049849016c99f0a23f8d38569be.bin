// Lossless shared-budget storage for qualified segmented image adapters.
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
export async function createSegmentedBytes(byteLength,{budget,chunkBytes=4*1024**2,storage='auto',temporarySession,getTemporarySession,signal}={}){
 requireValue(Number.isSafeInteger(byteLength)&&byteLength>=0,'Invalid segmented array length.');
 requireValue(budget&&typeof budget.retain==='function'&&typeof budget.reserve==='function','A shared memory budget is required.');
 requireValue(Number.isSafeInteger(chunkBytes)&&chunkBytes>0&&['auto','memory','temporary'].includes(storage),'Invalid segmented storage options.');checkAbort(signal);
 // Recomputable cache pages must not force a live source/result out of RAM.
 // retain() evicts them as needed; retained arrays and active work stay protected.
 const selected=storage==='auto'?(byteLength+Math.min(chunkBytes,byteLength)<=budget.limit-budget.retained-budget.active?'memory':'temporary'):storage;
 const segments=new Map();let disk,disposed=false,retained=false,disposing;
 if(selected==='memory'){budget.retain(byteLength);retained=true;}
 else{const session=temporarySession??await getTemporarySession?.({signal});if(!session)throw new EngineError('STORAGE_UNAVAILABLE','Temporary storage is required for this execution plan.');checkAbort(signal);disk=await session.create(byteLength,{signal});}
 function alive(){if(disposed)throw new EngineError('DISPOSED','Segmented array disposed.');}
 function range(offset,length){alive();requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=byteLength-length,'Invalid segmented byte range.');}
 function get(index){let data=segments.get(index);if(!data){try{data=new Uint8Array(Math.min(chunkBytes,byteLength-index*chunkBytes));}catch(e){if(e instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','A segmented RAM allocation failed.');throw e;}segments.set(index,data);}return data;}
 return {
  byteLength,chunkBytes,storage:selected,
  readInto(target,offset=0){requireValue(target instanceof Uint8Array,'A byte target is required.');range(offset,target.length);if(disk)return disk.readInto(target,offset);let done=0;while(done<target.length){const at=offset+done,index=Math.floor(at/chunkBytes),within=at%chunkBytes,n=Math.min(target.length-done,chunkBytes-within),source=segments.get(index);if(source)target.set(source.subarray(within,within+n),done);else target.fill(0,done,done+n);done+=n;}return target;},
  write(source,offset=0){requireValue(source instanceof Uint8Array,'A byte source is required.');range(offset,source.length);if(disk)return disk.write(source,offset);let done=0;while(done<source.length){const at=offset+done,index=Math.floor(at/chunkBytes),within=at%chunkBytes,n=Math.min(source.length-done,chunkBytes-within);get(index).set(source.subarray(done,done+n),within);done+=n;}},
  async visit(visitor,{signal,offset=0,length=byteLength-offset,blockBytes=chunkBytes}={}){
   range(offset,length);requireValue(Number.isSafeInteger(blockBytes)&&blockBytes>0,'Invalid traversal block size.');let at=offset;const size=Math.min(blockBytes,length),release=budget.reserve(size);let buffer;
   try{buffer=new Uint8Array(size);while(at<offset+length){await controlCheckpoint(signal);const part=buffer.subarray(0,Math.min(size,offset+length-at));await this.readInto(part,at);await visitor(part,at);checkAbort(signal);at+=part.length;}}finally{release();}
  },
  flush(){alive();return disk?.flush();},
  dispose(){if(disposing)return disposing;disposed=true;segments.clear();if(retained){budget.retained-=byteLength;retained=false;}disposing=Promise.resolve(disk?.dispose());return disposing;}
 };
}
export async function copyBlobToSegments(blob,store,{budget,signal,onProgress}={}){
 requireValue(blob instanceof Blob&&blob.size===store.byteLength,'Blob and storage lengths differ.');
 const size=Math.min(store.chunkBytes,blob.size),release=budget.reserve(size);
 try{for(let offset=0;offset<blob.size;offset+=size){checkAbort(signal);const bytes=new Uint8Array(await blob.slice(offset,offset+size).arrayBuffer());checkAbort(signal);await store.write(bytes,offset);onProgress?.((offset+bytes.length)/blob.size);}}catch(e){if(e instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Blob staging allocation failed.');throw e;}finally{release();}
}
