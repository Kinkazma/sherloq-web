import {allocateOwnedTypedArray} from './allocation.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';

// Only transport of an already computed row-major intermediate changes here.
// Fixed byte windows align the default 1 MiB scratch with IDB pages.
// Only existing intermediate bytes are read; page geometry does not affect values.
// Pre-admit existing storage staging with scratch, or fall back before IO.
// Callers serialize writes: two disjoint column updates can share these rows.
export function createComplexRowSlabs({store,width,stride,budget,maximumBytes}){
 requireValue(Number.isSafeInteger(maximumBytes)&&maximumBytes>0,'Invalid complex row staging limit.');
 const physicalRowBytes=width*stride;
 async function transfer(writing,bytes,x,y,w,h,{signal,cooperate=createCooperator(signal)}={}){
  if(store.storage!=='temporary'||h<2||w===width||physicalRowBytes>maximumBytes)return false;
  checkAbort(signal);
  const size=Math.min(maximumBytes,store.byteLength);let scratch,io;
  try{io=store.pinIoWorkspace?.();scratch=allocateOwnedTypedArray(Uint8Array,size,{budget,owner:'complex-plane',label:'complex-row-slab'});}
  catch(error){try{await io?.release();}catch(cleanup){if(error!==null&&(typeof error==='object'||typeof error==='function')&&Object.isExtensible(error))try{(error.cleanupErrors??=[]).push(cleanup);}catch{}throw error;}if(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))return false;throw error;}
  const selectedRowBytes=w*stride;let failed=false,primary;
  try{
   const first=(y*width+x)*stride,last=first+(h-1)*physicalRowBytes+selectedRowBytes;
   for(let at=Math.floor(first/maximumBytes)*maximumBytes;at<last;at+=maximumBytes){
    checkAbort(signal);await cooperate();checkAbort(signal);
    const end=Math.min(store.byteLength,at+maximumBytes),slab=scratch.data.subarray(0,end-at);
    await store.readInto(slab,at,{signal});checkAbort(signal);
    const from=Math.max(0,Math.floor((at-first)/physicalRowBytes)),until=Math.min(h,Math.ceil((end-first)/physicalRowBytes));
    for(let r=from;r<until;r++){
     const row=first+r*physicalRowBytes,start=Math.max(at,row),stop=Math.min(end,row+selectedRowBytes);
     if(stop<=start)continue;
     const selected=bytes.subarray(r*selectedRowBytes+start-row,r*selectedRowBytes+stop-row),physical=slab.subarray(start-at,stop-at);
     if(writing)physical.set(selected);else selected.set(physical);
    }
    if(writing){checkAbort(signal);await store.write(slab,at,{signal});checkAbort(signal);}
   }
   return true;
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   let cleanupFailed=false,cleanupPrimary;
   for(const retire of[()=>scratch.release(),()=>io?.release()])try{await retire();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}else if(cleanupPrimary!==null&&(typeof cleanupPrimary==='object'||typeof cleanupPrimary==='function')&&Object.isExtensible(cleanupPrimary))try{(cleanupPrimary.cleanupErrors??=[]).push(error);}catch{}}
   if(cleanupFailed){if(!failed)throw cleanupPrimary;if(primary!==null&&(typeof primary==='object'||typeof primary==='function')&&Object.isExtensible(primary))try{(primary.cleanupErrors??=[]).push(cleanupPrimary);}catch{}}
  }
 }
 return {read:(...args)=>transfer(false,...args),write:(...args)=>transfer(true,...args)};
}
