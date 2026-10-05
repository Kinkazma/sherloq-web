import {EngineError,requireValue} from './errors.js';
import {allocateTypedArray} from './allocation.js';

// A lane owns one physical extent across transfers. The reservation is moved
// out of the task admission, not borrowed from a scope that closes after a job.
// No array is retained by the ledger. ACK replaces a detached local reference.
export function createReusableBuffer({budget,owner,label}={}){
 let buffer=null,capacity=0,busy=false,held=false,closed=false,releaseMemory,backing,unpin;
 const reuse=budget.registerReusableBacking?.('array-buffer',bytes=>!closed&&!busy&&buffer?.byteLength===capacity&&capacity>=bytes);
 function retire(){
  const bytes=capacity;buffer=null;capacity=0;busy=false;held=false;unpin?.();unpin=null;backing?.();backing=null;releaseMemory?.();releaseMemory=null;
  if(bytes)budget.notifyBackingRelease?.('array-buffer',bytes);reuse?.changed();return bytes;
 }
 const reclaim=()=>busy?0:retire(),unregister=budget.registerAsyncReclaimer?.(reclaim,{allocationKind:'array-buffer',owner,label,priority:40});
 return {
  get byteLength(){return capacity;},get busy(){return busy;},get reuseScope(){return reuse?.id;},
  hold(){if(closed)throw new EngineError('DISPOSED','Reusable buffer disposed.');requireValue(!busy,'Reusable buffer already in use.');busy=true;held=true;backing?.setReclaimable(false);unpin=backing?.pin();reuse?.changed();},
  checkout(Type,length,{reserve=bytes=>budget.reserve(bytes),operation}={}){
   if(closed)throw new EngineError('DISPOSED','Reusable buffer disposed.');
   requireValue(!busy||held,'Reusable buffer already in use.');
   const bytes=length*Type?.BYTES_PER_ELEMENT;
   requireValue(Number.isSafeInteger(length)&&length>=0&&Number.isInteger(Type?.BYTES_PER_ELEMENT)&&Number.isSafeInteger(bytes),'Invalid reusable buffer extent.');
   if(capacity<bytes||!buffer){
    retire();const memory=reserve(bytes);let array;
    try{array=allocateTypedArray(Type,length,{label,operation});backing=budget.registerBacking?.('array-buffer',bytes,{owner,label,operation});}
    catch(error){memory();throw error;}
    buffer=array.buffer;capacity=bytes;releaseMemory=memory;
   }
   requireValue(buffer.byteLength===capacity,'Reusable backing was not returned by its worker.');
   busy=true;held=false;backing?.setReclaimable(false);unpin??=backing?.pin();reuse?.changed();
   return new Type(buffer,0,length);
  },
  takeBack(returned){requireValue(busy&&returned instanceof ArrayBuffer&&returned.byteLength===capacity,'Invalid reusable buffer acknowledgement.');buffer=returned;},
  park(){
   if(closed)return;requireValue(!busy||(capacity===0&&!buffer)||buffer?.byteLength===capacity,'Cannot park a transferred buffer before acknowledgement.');
   if(!busy)return;busy=false;held=false;unpin?.();unpin=null;backing?.setReclaimable(true);reuse?.changed();
  },
  retire,
  dispose(){if(closed)return;closed=true;unregister?.();retire();reuse?.release();}
 };
}
