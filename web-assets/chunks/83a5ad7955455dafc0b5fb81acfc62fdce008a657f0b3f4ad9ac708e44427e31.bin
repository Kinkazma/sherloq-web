import {isPagedD2prlTensor} from './paged-feature-tensor.js';
import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
const ack=async work=>{const value=await work();if(value===0||value===false)throw value;};
/** Storage adapter only: the complete immutable half tensor is transferred
 * from its descriptor owner to a strict bank without a second full copy.
 * Existing bank readers retain their ordinary complete typed-array contract.
 * Bounded temporary read loans stay owned until their retirement ACK. */
export function createPagedDescriptorStore(tensor){
 requireValue(isPagedD2prlTensor(tensor)&&tensor.dtype==='float16'&&tensor.snapshot().sealed&&!tensor.snapshot().closed,'An immutable complete half descriptor tensor required');
 const loans=new Set(),pending=new Set();let closed=false,retired=false,closing,tensorRetired=false;
 const alive=signal=>{checkAbort(signal);if(closed)throw new EngineError('DISPOSED','Transferred native descriptor store closed');};
 const drain=async()=>{let failed=false,primary;for(const loan of [...loans])try{await ack(()=>loan.release());loans.delete(loan);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;};
 const actor={
  byteLength:tensor.byteLength,get storage(){return tensor.snapshot().storage;},
  readInto(target,offset=0,{signal}={}){
   alive(signal);requireValue(target instanceof Uint8Array&&offset%2===0&&target.byteLength%2===0&&offset>=0&&offset+target.byteLength<=tensor.byteLength,'Exact bounded native byte destination required');
   const work=(async()=>{await drain();alive(signal);const window=16*1024**2;let failed=false,primary;
    try{for(let at=0;at<target.byteLength;at+=window){alive(signal);const bytes=Math.min(window,target.byteLength-at),loan=await tensor.readFlat((offset+at)/2,bytes/2,{signal});loans.add(loan);alive(signal);target.set(new Uint8Array(loan.data.buffer,loan.data.byteOffset,loan.data.byteLength),at);await drain();}alive(signal);return target;}
    catch(error){failed=true;primary=error;throw error;}finally{try{await drain();}catch(error){if(!failed)throw error;if(primary&&typeof primary==='object'&&Object.isExtensible(primary))try{primary.details={...primary.details,descriptorReadCleanup:error};}catch{}}}
   })();pending.add(work);work.then(()=>pending.delete(work),()=>pending.delete(work));return work;
  },
  snapshot(){return{closed,retired,pending:pending.size,loans:loans.size,tensorRetired};},
  dispose(){if(retired)return Promise.resolve();if(closing)return closing;closed=true;closing=(async()=>{await Promise.allSettled([...pending]);let failed=false,primary;try{await drain();}catch(error){failed=true;primary=error;}if(!tensorRetired)try{await ack(()=>tensor.dispose());tensorRetired=true;}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;retired=true;})();void closing.catch(()=>{closing=null;});return closing;}
 };return actor;
}
