import "../../runtime-context.js?v=0.33.3";
import {withRetirementOwner} from './owner-retirement-error.js';

// Numeric return values may count retired backing bytes, including zero.
// Only a caller with an explicit close/ACK contract opts into false/zero NACKs.
export async function retireCompositeOwners(owners, options={}) {
 const hasPrimary=Object.hasOwn(options,'primary'), requireAck=options.requireAck===true;
 let pending,first,failed=false;
 const childOf=value=>{try{const child=value?.cleanupOwner;return child&&typeof child.dispose==='function'?child:null;}catch{return null;}};
 const accepted=async action=>{const value=await action?.();if(requireAck&&(value===false||value===0))throw value;return value;};
 const attempt=async retire=>{try{const value=await retire?.();if(requireAck&&(value===false||value===0))throw value;}catch(error){if(!failed){failed=true;first=error;}(pending??=[]).push({retire,child:childOf(error)});}};
 if(options.concurrent===true)await Promise.all(owners.map(attempt));
 else for(const retire of owners)try{const value=await retire?.();if(requireAck&&(value===false||value===0))throw value;}catch(error){if(!failed){failed=true;first=error;}(pending??=[]).push({retire,child:childOf(error)});}
 if(!failed)return;
 const previous=hasPrimary?childOf(options.primary):null;
 if(previous&&!pending.some(row=>row.child===previous))pending.unshift({retire:()=>previous.dispose(),child:null});
 let flight;
 const owner={dispose(){
  if(flight)return flight;
  const task=(async()=>{let refused=false,reason;
   for(const row of [...pending])try{
    if(row.child){const child=row.child;await accepted(()=>child.dispose());row.child=null;}
    await accepted(row.retire);pending.splice(pending.indexOf(row),1);
   }catch(error){const child=childOf(error);if(child&&child!==owner)row.child=child;if(!refused){refused=true;reason=error;}}
   if(refused)throw withRetirementOwner(reason,owner,reason);
  })();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;
 }};
 throw withRetirementOwner(hasPrimary?options.primary:first,owner,first);
}
