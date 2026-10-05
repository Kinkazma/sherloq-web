import "../../runtime-context.js?v=0.14.5";
import {Budget} from './cache.js';
import {allocateTypedArray} from './allocation.js';
import {checkAbort,requireValue} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';

// Reserve a stream's complete row window once, before useful encoding starts.
// The local I/O allowance is borrowed from this reservation, so a later host
// budget decrease affects new streams without invalidating an admitted one.
export async function createReusableRgbWindow(surface,{budget,rows,bytes,signal,operation}={}){
 const {width,sourceWidth=width}=surface.descriptor,length=width*rows*3,scratchBytes=sourceWidth*3;
 requireValue(Number.isSafeInteger(length)&&length>0&&bytes>=2*length+scratchBytes,'Invalid reusable RGB workspace.');
 const admission=await getExecutionScheduler(budget).acquire({cpu:0,bytes,domains:{'array-buffer':2*length+scratchBytes},signal,resourceOwner:operation?.owner??'ela',operation,label:'rgb-stream-window'});
 let reservation;try{checkAbort(signal);reservation=admission.retainMemory(bytes);}finally{admission.release();}
 const local=new Budget(bytes);let buffer,backing,releaseBuffer,closed=false,inUse=false;
 const dispose=()=>{if(closed)return;closed=true;buffer=null;const retired=backing?.();releaseBuffer?.();reservation();if(retired)budget.notifyBackingRelease?.('array-buffer',retired);};
 try{
  releaseBuffer=local.reserve(2*length+scratchBytes);buffer=allocateTypedArray(Uint8Array,2*length+scratchBytes,{label:'reusable-rgb-stream-window',operation});
  backing=budget.registerBacking?.('array-buffer',buffer.byteLength,{owner:operation?.owner??'ela',operation,label:'reusable-rgb-stream-window',identity:buffer.buffer});
  return {dispose,async read(rect){
   checkAbort(signal);requireValue(!closed&&!inUse&&rect.width===width&&rect.height<=rows,'RGB stream window is unavailable.');inUse=true;
   const target=buffer.subarray(0,width*rect.height*3),options={signal,reserve:n=>local.reserve(n),scratch:buffer.subarray(2*length),rollScratch:buffer.subarray(length,2*length),owner:operation?.owner??'ela',operation};
   try{
    if(surface.readWindowInto)await surface.readWindowInto(rect,target,options);
    else{const part=await surface.readWindow(rect,options);try{target.set(part.pixels.data);}finally{part.release();}}
    return {pixels:{width,height:rect.height,format:'rgb8',data:target},release(){inUse=false;}};
   }catch(error){inUse=false;throw error;}
  }};
 }catch(error){dispose();throw error;}
}
