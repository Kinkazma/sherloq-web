import {requireValue,checkAbort} from '../../src/errors.js';
import {preserveConvolutionPrimary} from './convolution-retirement.js';
import {reserveNativeMpsCalendars} from './paired-random.js';
// A result can be computed before its operation accepts it. Readiness, GPU ACK
// and accepted prefix are deliberately separate, including a partial result.
export async function createPairedTransaction({random,countsList,budget,adoptOwner}={}){
 requireValue(budget?.reserve&&typeof adoptOwner==='function'&&random,'Adopted pair owner and Native calendar RNG required');
 const life=new AbortController(),acks=new Set(),results=new Set();let fee,ticket,closed=false,retired=false,closing,preparing,prefix=0,pendingBatch,finishConstruction;const constructed=new Promise(resolve=>finishConstruction=resolve);
 const slots=Array.from({length:Array.isArray(countsList)&&countsList.length<=2?countsList.length:0},()=>({ready:false,failed:false,value:undefined,error:undefined}));
 const ack=async r=>{if(r.done)return;if(r.flight)return r.flight;const task=Promise.resolve().then(r.release).then(()=>{r.done=true;acks.delete(r);});r.flight=task;void task.finally(()=>{if(r.flight===task)r.flight=null;}).catch(()=>{});return task;};
 const drain=async()=>{let failed=false,primary;for(const row of await Promise.allSettled([...acks].map(ack)))if(row.status==='rejected'){if(!failed){failed=true;primary=row.reason;}else preserveConvolutionPrimary(primary,row.reason);}if(failed)throw primary;};
 const retireResults=async()=>{let failed=false,primary;for(const r of [...results])try{await r.dispose();results.delete(r);}catch(error){if(!failed){failed=true;primary=error;}else preserveConvolutionPrimary(primary,error);}if(failed)throw primary;};
 const owner={
  get prefix(){return prefix;},get retired(){return retired;},get calendars(){return ticket.calendars;},get snapshots(){return ticket.snapshots;},
  slot(index){return{ready:slots[index].ready,failed:slots[index].failed,committed:index<prefix};},
  prepare(index,work,{operation=(_label,run)=>run(),label='patchmatch:iteration-pair',signal}={}){
   requireValue(!closed&&!preparing&&index===prefix&&index<slots.length&&typeof work==='function','Next open calendar prefix required');const selected=AbortSignal.any([signal,life.signal].filter(Boolean));checkAbort(selected);
   let executeFlight;const execute=()=>{if(executeFlight)return executeFlight;const task=(async()=>{
    await drain();checkAbort(selected);if(slots[index].ready)return slots[index].value;if(slots[index].failed)throw slots[index].error;
    if(!pendingBatch){await retireResults();checkAbort(selected);
    pendingBatch=await work({calendar:ticket.calendars[index],calendars:ticket.calendars,
     adoptGpuRetirement(release){requireValue(!closed&&typeof release==='function','GPU retirement before queue use');const r={release,done:false,flight:null};acks.add(r);return r;},
     adoptResultOwner(r){requireValue(!closed&&r&&typeof r.dispose==='function','CPU result owner before allocation');results.add(r);}
    });}
    await drain();checkAbort(selected);const batch=pendingBatch;requireValue(Array.isArray(batch?.slots)&&batch.slots.length>=1&&index+batch.slots.length<=slots.length,'Complete or explicitly partial pair result');
    requireValue(batch.slots.every(value=>value&&(value.ready===true)!==(value.failed===true)),'Each checkpoint must be exclusively ready or failed');
    for(let j=0;j<batch.slots.length;j++){const value=batch.slots[j];Object.assign(slots[index+j],{ready:value.ready===true,failed:value.failed===true,value:value.value,error:value.error});}
    pendingBatch=null;
    if(slots[index].failed)throw slots[index].error;return slots[index].value;
   })();executeFlight=task;void task.finally(()=>{if(executeFlight===task)executeFlight=null;}).catch(()=>{});return task;};
   const task=(async()=>{let value,failed=false,primary;try{value=await operation(label,execute);}catch(error){failed=true;primary=error;}try{await executeFlight;}catch(error){if(failed)preserveConvolutionPrimary(primary,error);else{failed=true;primary=error;}}if(failed)throw primary;await drain();checkAbort(selected);requireValue(slots[index].ready&&value===slots[index].value,'Operation must accept its owned checkpoint');return value;})();preparing=task;void task.finally(()=>{if(preparing===task)preparing=null;}).catch(()=>{});return task;
  },
  async resetFailedPrefix(index){requireValue(!closed&&!preparing&&index===prefix&&slots[index].failed,'Only the next privately classified failure can be replayed');await drain();await retireResults();for(let j=index;j<slots.length;j++)Object.assign(slots[j],{ready:false,failed:false,value:undefined,error:undefined});},
  async discardUnaccepted(index){requireValue(!closed&&!preparing&&index===prefix,'Only the unaccepted suffix can be invalidated');await drain();await retireResults();pendingBatch=null;for(let j=index;j<slots.length;j++)Object.assign(slots[j],{ready:false,failed:false,value:undefined,error:undefined});},
  commit(index){requireValue(!closed&&!preparing&&index===prefix&&slots[index].ready&&acks.size===0,'Complete acknowledged next checkpoint required');ticket.commitPrefix(index+1);prefix++;return slots[index].value;},
  dispose(){if(retired)return Promise.resolve();if(closing)return closing;closed=true;life.abort();const task=(async()=>{await constructed;await preparing?.catch(()=>{});await drain();ticket?.rollback();await retireResults();await fee?.();fee=null;pendingBatch=null;for(const slot of slots){slot.value=undefined;slot.error=undefined;}retired=true;})();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;}
 };
 let failed=false,primary;
 try{adoptOwner(owner);checkAbort(life.signal);requireValue(Array.isArray(countsList)&&countsList.length>=1&&countsList.length<=2,'One or two Native calendars');fee=budget.reserve(16384);checkAbort(life.signal);ticket=reserveNativeMpsCalendars(random,countsList);checkAbort(life.signal);}
 catch(error){failed=true;primary=error;}finally{finishConstruction();}
 if(failed){try{await owner.dispose();}catch(cleanup){preserveConvolutionPrimary(primary,cleanup);}throw primary;}return owner;
}
