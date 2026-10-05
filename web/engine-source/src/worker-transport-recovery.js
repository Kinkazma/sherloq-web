import {isRecoverableTransportError} from './errors.js';
import {ResourceRecoveryController,runWithResourceRecovery,recoverResourceFailure} from './resource-recovery.js';

export class WorkerTransportRecoveryController extends ResourceRecoveryController{
 fail(error,context){return isRecoverableTransportError(error)?super.fail(error,context):{retry:false,error};}
}
export function runWithWorkerTransportRecovery(operation,options={}){
 return runWithResourceRecovery(operation,{...options,controller:options.controller??new WorkerTransportRecoveryController()});
}

// Qualities already published are never re-enqueued. An unreadable stateful
// stream must restart its own quality; its native decoder/encoder state cannot
// safely be reconstructed from a possibly missing acknowledgement.
export class QualityTransportQueue{
 constructor(qualities,{budget,signal,label,discard,onRecovery}){Object.assign(this,{budget,signal,label,discard,onRecovery});this.pending=qualities.map((quality,index)=>({quality,index,controller:new WorkerTransportRecoveryController()}));this.recoveries=0;}
 assign(states){for(const state of states)state.qualityJob=this.pending.shift();return states.map(state=>state.qualityJob.quality);}
 async call(states,execute){
  const original=states.slice(),settled=await Promise.allSettled(original.map(state=>Promise.resolve().then(()=>execute(state)))),results=new Map();let terminal;
  for(let index=0;index<original.length;index++){
   const state=original[index],outcome=settled[index];if(outcome.status==='fulfilled'){results.set(state,outcome.value);continue;}
   if(!isRecoverableTransportError(outcome.reason)){terminal??=outcome.reason;continue;}
   const job=state.qualityJob,decision=job.controller.fail(outcome.reason,{operation:this.label+'/'+job.index,memory:this.budget.snapshot()});
   states.splice(states.indexOf(state),1);await this.discard(state);
   try{await recoverResourceFailure(decision,{controller:job.controller,budget:this.budget,signal:this.signal,operation:this.label+'/'+job.index,owner:'ela',onRecovery:event=>{if(event.phase==='resource-recovery')this.recoveries++;this.onRecovery?.(event);}});this.pending.push(job);}catch(error){terminal??=error;}
  }
  if(terminal)throw terminal;return results;
 }
}
