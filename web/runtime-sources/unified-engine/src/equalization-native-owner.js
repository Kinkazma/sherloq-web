import "../../runtime-context.js?v=0.33.2";
import {requireValue} from './errors.js';
import {createGpuAttemptArray} from './gpu-attempt-retirement.js';
import {withRetirementOwner} from './owner-retirement-error.js';

// A failed borrower ACK must settle before its backing or credit can retire.
// The owner exists before allocation; the Original itself is never adopted.
export function createNativeEqualizationScope(){
 const entries=new Set(),children=new Set(),parents=new Set();let flight;
 const ack=async action=>{const value=await action();if(value===false||value===0)throw value;return value;};
 const scope={
  adopt(value,method='dispose',priority=0){const entry={value,method,priority};entries.add(entry);return entry;},
  forget(entry){requireValue(entries.has(entry),'Unknown native equalization owner.');entries.delete(entry);return entry.value;},
  excludeParent(owner){parents.add(owner);},
  adoptFailure(error){const owner=error?.cleanupOwner;if(owner&&owner!==scope&&!parents.has(owner)&&typeof owner.dispose==='function')children.add(owner);},
  async drop(entry){if(!entries.has(entry))return;try{await ack(()=>typeof entry.value==='function'?entry.value():entry.value[entry.method]());entries.delete(entry);}catch(error){scope.adoptFailure(error);throw withRetirementOwner(error,scope,error);}},
  dispose(){if(flight)return flight;const task=(async()=>{
   try{for(const child of [...children]){await ack(()=>child.dispose());children.delete(child);}for(const entry of [...entries].sort((a,b)=>b.priority-a.priority))await scope.drop(entry);}
   catch(error){scope.adoptFailure(error);throw withRetirementOwner(error,scope,error);}
  })();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;},
  snapshot(){return{owners:entries.size,failedBorrowers:children.size};}
 };
 return scope;
}
export function nativeEqualizationArray(scope,Type,length,budget,label){
 const owner=createGpuAttemptArray(Type,length,{budget,owner:'native-equalization',label}),entry=scope.adopt(owner,'release');
 owner.allocate();return{owner,entry,data:owner.data};
}
