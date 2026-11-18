import {requireValue} from './errors.js';
import {allocateTypedArray} from './allocation.js';
import {withRetirementOwner} from './owner-retirement-error.js';

// Only actual failed retirement with a still-owned debt gets a retry handle.
// Clean calculation failures preserve the exact thrown value, including a
// primitive or frozen primary. Existing diagnostics are never stripped.
export function gpuRetirementFailure(primary,owner,cleanup,hasDebt=true){
 if(!hasDebt)return primary;
 let child;try{child=primary?.cleanupOwner;}catch{}
 if(child===owner)return primary;
 if(child){const parent=owner;let childDone=false,parentDone=false;owner={dispose:async()=>{
  if(!childDone){const ack=await child.dispose();if(ack===false||ack===0)throw ack;childDone=true;}
  if(!parentDone){const ack=await parent.dispose();if(ack===false||ack===0)throw ack;parentDone=true;}
 }};}
 return withRetirementOwner(primary,owner,cleanup);
}
export function gpuRetirementSync(action,owner){try{return action();}catch(error){throw gpuRetirementFailure(error,owner,error);}}
export async function gpuRetirementStep(action,owner){try{return await action();}catch(error){throw gpuRetirementFailure(error,owner,error);}}
export function gpuRetirementBlocked(error){
 const seen=new Set();for(let value=error;value!==null&&value!==undefined&&!seen.has(value);){
  seen.add(value);try{if(value.cleanupOwner||'cleanupError'in Object(value)||'cleanupErrors'in Object(value)&&(!Array.isArray(value.cleanupErrors)||value.cleanupErrors.length))return true;value=value.cause;}catch{return true;}
 }return false;
}

// The native16 separation caller adopts this owner BEFORE allocate(). Its
// backing callback returns retired byte counts (0 is legitimate), whereas its
// credit callback has the historical void/throw contract. Neither is an ACK0.
export function createGpuAttemptArray(Type,length,{budget,owner,label}){
 const bytes=length*Type?.BYTES_PER_ELEMENT;
 requireValue(Number.isSafeInteger(length)&&length>=0&&Number.isSafeInteger(bytes)&&bytes>=0,'Invalid owned GPU host array.');
 let data,credit,backing,retiredBytes,backingDone=false,backingRegistered=false,notified=false,closed=false;
 return{
  get data(){return data;},get retired(){return closed;},
  allocate(){requireValue(!closed&&!credit&&!data,'GPU host array is already allocated.');credit=budget.reserve(bytes);data=allocateTypedArray(Type,length,{label});backing=budget.registerBacking?.('array-buffer',bytes,{owner,label,identity:data.buffer});backingRegistered=typeof budget.registerBacking==='function';return data;},
  release(){
   if(closed)return;
   if(!backingDone){retiredBytes=backing?.();backingDone=true;backing=null;}
   if(credit){credit();credit=null;}
   if(!notified){if(backingRegistered&&retiredBytes!==0&&data)budget.notifyBackingRelease?.('array-buffer',retiredBytes??bytes);notified=true;}
   data=null;closed=true;
  }
 };
}
