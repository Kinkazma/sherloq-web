import {EngineError} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';

// Adopt an already-refused child and dependent owners without attempting ANY
// retirement in this call. The explicit caller retry drains the child first.
export function deferEchoDebt(primary,owners=[]){
 const previous=primary?.cleanupOwner,seen=new Set(),rows=[];
 for(const value of [previous,...owners])if(value&&!seen.has(value)){seen.add(value);rows.push({value,child:null});}
 let flight;
 const accepted=value=>{if(value===false||value===0)throw new EngineError('BUSY','Echo retirement was not acknowledged.');};
 const invoke=value=>typeof value==='function'?value():value.dispose();
 const owner={dispose(){
  if(flight)return flight;
  const task=(async()=>{
   for(const row of [...rows]){
    try{
     if(row.child){accepted(await invoke(row.child));row.child=null;}
     accepted(await invoke(row.value));rows.splice(rows.indexOf(row),1);
    }catch(error){const child=error?.cleanupOwner;if(child&&child!==owner&&child!==row.value)row.child=child;throw withRetirementOwner(error,owner,error);}
   }
   return true;
  })();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;
 }};
 return withRetirementOwner(primary,owner,primary);
}
