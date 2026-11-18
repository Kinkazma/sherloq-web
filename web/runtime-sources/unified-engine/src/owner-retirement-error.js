import "../../runtime-context.js?v=0.33.3";
import {EngineError} from './errors.js';
// A failed constructor can throw any JavaScript value. The retry owner must
// remain reachable even when that primary is frozen or cannot carry fields.
export function withRetirementOwner(primary,cleanupOwner,cleanup){
 let code,message;try{code=primary?.code;message=primary?.message;}catch{}
 let failure=primary;
 try{if(primary===null||!['object','function'].includes(typeof primary)||!Object.isExtensible(primary))throw 0;
  Object.defineProperty(primary,'cleanupOwner',{configurable:true,writable:true,value:cleanupOwner});
  const previous=Array.isArray(primary.cleanupErrors)?primary.cleanupErrors:[];
  Object.defineProperty(primary,'cleanupErrors',{configurable:true,writable:true,value:[...previous,{name:cleanup?.name??'Error',code:cleanup?.code,message:String(cleanup?.message??cleanup)}]});
 }catch{
  // A primitive or frozen primary cannot safely carry a retry handle. Preserve
  // the exact thrown value as its cause/value and keep the same structured code.
  failure=new EngineError(typeof code==='string'?code:'INTERNAL',message??String(primary),{cause:primary});
  failure.thrownValue=primary;failure.cleanupOwner=cleanupOwner;
  failure.cleanupErrors=[{name:cleanup?.name??'Error',code:cleanup?.code,message:String(cleanup?.message??cleanup)}];
 }
 return failure;
}
