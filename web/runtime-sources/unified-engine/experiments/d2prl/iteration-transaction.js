// Private control/lifetime prototype. No GPU kernel or product path is added.
// The controller commits then flips its private checkpoint pointer synchronously
// before emitting ONE iteration-atomic event. Fine callbacks stay historical.
import{requireValue,checkAbort}from'../../src/errors.js';
import{preserveConvolutionPrimary}from'./convolution-retirement.js';
export async function createIterationTransaction({random,counts,budget,adoptOwner,signal}={}){
 requireValue(typeof adoptOwner==='function'&&budget?.reserve&&typeof random?.reserveSources==='function','Iteration parent owner and exact native schedule required');
 const life=new AbortController(),selected=signal?AbortSignal.any([signal,life.signal]):life.signal,results=new Set(),acks=new Set();let fee,ticket,before,after,ready=false,value,closed=false,retired=false,committed=false,preparing,closing;
 const frozen=s=>Object.freeze({...s,state:Object.freeze([...s.state])});
 const ack=async record=>{if(record.done)return;if(record.flight)return record.flight;const task=Promise.resolve().then(record.release).then(()=>{record.done=true;acks.delete(record);});record.flight=task;void task.finally(()=>{if(record.flight===task)record.flight=null;}).catch(()=>{});return task;};
 const drainGpu=async()=>{const output=await Promise.allSettled([...acks].map(ack));for(const row of output)if(row.status==='rejected')throw row.reason;};
 const retireResults=async()=>{let failed=false,primary;for(const record of [...results])try{await record.dispose();results.delete(record);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;};
 const owner={
  get retired(){return retired;},get committed(){return committed;},get ready(){return ready;},get active(){return !!ticket?.active;},get beforeState(){return before;},get afterState(){return after;},
  get result(){requireValue(committed&&!retired,'Iteration checkpoint not committed');return value;},
  prepare(work,{operation=(_label,run)=>run(),label='patchmatch:iteration'}={}){
   requireValue(!closed&&!committed&&typeof work==='function','Open iteration transaction required');checkAbort(selected);if(preparing)return preparing;
   const execute=async()=>{
    await drainGpu();checkAbort(selected);if(ready)return value;
    // A failed component may have adopted a CPU borrow before rejecting. The
    // borrow is retried/retired only after its GPU ACK, never silently reused.
    await retireResults();checkAbort(selected);
    const candidate=await work({ticket,beforeState:before,afterState:after,
     adoptGpuRetirement(release){requireValue(!closed&&typeof release==='function','Iteration GPU retirement owner');const record={release,done:false,flight:null};acks.add(record);return record;},
     adoptResultOwner(result){requireValue(!closed&&result&&typeof result.dispose==='function','Iteration result owner before allocation');results.add(result);}
    });
    await drainGpu();checkAbort(selected);value=candidate;ready=true;return value;
   };
   const task=(async()=>{const result=await operation(label,execute);await drainGpu();checkAbort(selected);requireValue(ready&&result===value,'Operation must accept the owned iteration result');return value;})();preparing=task;void task.finally(()=>{if(preparing===task)preparing=null;}).catch(()=>{});return task;
  },
  commit(){requireValue(!closed&&!committed&&!preparing&&ready&&acks.size===0,'Complete acknowledged iteration required');checkAbort(selected);ticket.commit();committed=true;return value;},
  dispose(){if(retired)return Promise.resolve();if(closing)return closing;closed=true;life.abort();const task=(async()=>{await preparing?.catch(()=>{});await drainGpu();if(ticket?.active)ticket.rollback();await retireResults();await fee?.();fee=null;value=undefined;retired=true;})();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;}
 };
 adoptOwner(owner);
 try{checkAbort(selected);requireValue(Array.isArray(counts)&&counts.length>0&&counts.length<=6,'Ordered iteration source counts');fee=budget.reserve(512*(counts.length+1));before=frozen(random.snapshot());ticket=random.reserveSources(counts,{signal:selected});after=frozen(random.snapshot());return owner;}
 catch(error){try{await owner.dispose();}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw error;}
}
