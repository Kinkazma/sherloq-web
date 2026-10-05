import {EngineError,checkAbort,requireValue,normalizeResourceError,isRecoverableResourceError,isRecoverableTransportError,isRecoverableNetworkError,controlCheckpoint,serializeEngineError,resourceAllocationKind,resourceRecoveryKind,resourceRecoveryBytes,isFixedAdmissionError} from './errors.js';

const MiB=1024**2,MEMORY_KEYS=['budgetBytes','retainedBytes','activeReservationBytes','cacheBytes','availableBytes','requestedBytes','workspaceBytes'];
const contextValue=value=>typeof value==='function'?value():value;
const requestedBytes=error=>{const hint=resourceRecoveryBytes(error)??error?.details?.recovery?.memory?.requestedBytes;return Number.isSafeInteger(hint)&&hint>0?hint:MiB;};
function memoryState(value={}){const state=Object.fromEntries(MEMORY_KEYS.filter(key=>Number.isFinite(value[key])).map(key=>[key,value[key]]));if(state.availableBytes===undefined&&Number.isFinite(state.budgetBytes))state.availableBytes=Math.max(0,state.budgetBytes-(state.retainedBytes??0)-(state.activeReservationBytes??0)-(state.cacheBytes??0));return state;}
function nearMemory(a,b){return MEMORY_KEYS.every(key=>a[key]===undefined||b[key]===undefined||Math.abs(a[key]-b[key])<=Math.max(MiB,.1*Math.max(Math.abs(a[key]),Math.abs(b[key]))));}

// This counts a consecutive obstruction, not lifetime incidents. Checkpoints
// must describe committed useful work; replayed preparation never resets it.
export class ResourceRecoveryController{
 constructor({maxConsecutiveFailures=5}={}){requireValue(Number.isInteger(maxConsecutiveFailures)&&maxConsecutiveFailures>0,'Invalid consecutive failure limit.');this.maximum=maxConsecutiveFailures;this.totalFailures=0;this.consecutiveFailures=0;this.previous=null;this.highWater=new Map();this.progressRevision=0;}
 progress(checkpoint){
  if(checkpoint===undefined||checkpoint===null)return false;
  const key=typeof checkpoint==='number'?'default':checkpoint.key??'default',completed=typeof checkpoint==='number'?checkpoint:checkpoint.completed;
  if(!Number.isFinite(completed)||completed<0)return false;const before=this.highWater.get(key)??0;
  if(completed<=before)return false;this.highWater.set(key,completed);this.progressRevision++;this.previous=null;this.consecutiveFailures=0;return true;
 }
 success(checkpoint){this.progress(checkpoint);this.previous=null;this.consecutiveFailures=0;}
 fail(error,{operation='operation',phase='',checkpoint,memory={}}={}){
  const normalized=normalizeResourceError(error);if(!isRecoverableResourceError(normalized))return {retry:false,error:normalized,loopDetected:!!normalized?.details?.recovery?.loopDetected,consecutiveFailures:this.consecutiveFailures,totalFailures:this.totalFailures};
  this.progress(checkpoint);const current={kind:isRecoverableTransportError(normalized)?'transport':isRecoverableNetworkError(normalized)?'network':'memory',operation:String(operation),phase:String(phase??''),revision:this.progressRevision,memory:memoryState({...memory,requestedBytes:resourceRecoveryBytes(normalized)??memory.requestedBytes})},old=this.previous;
  const similar=old&&old.kind===current.kind&&old.operation===current.operation&&old.revision===current.revision&&(current.kind!=='memory'||nearMemory(old.memory,current.memory));
  this.consecutiveFailures=similar?this.consecutiveFailures+1:1;this.totalFailures++;
  // A phase label alone is not useful progress: worker restart and compute
  // may alternate while the same tile remains blocked. Keep phase diagnostic.
  // Keep the first memory sample of the streak, so gradual jitter cannot drift
  // through the similarity band and manufacture a new incident every time.
  this.previous=similar?old:current;const loopDetected=this.consecutiveFailures>=this.maximum;
  const diagnostic={operation:current.operation,phase:current.phase,consecutiveFailures:this.consecutiveFailures,totalFailures:this.totalFailures,loopDetected,memory:current.memory};
  normalized.details={...normalized.details,recovery:diagnostic};return {retry:!loopDetected,error:normalized,...diagnostic};
 }
 snapshot(){return {consecutiveFailures:this.consecutiveFailures,totalFailures:this.totalFailures,progressRevision:this.progressRevision};}
 run(operation,options={}){return runWithResourceRecovery(operation,{...options,controller:this});}
}

export function waitForResourceRecovery({signal,milliseconds=25}={}){
 checkAbort(signal);return new Promise((resolve,reject)=>{const finish=()=>{signal?.removeEventListener('abort',abort);resolve();},timer=setTimeout(finish,milliseconds),abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new EngineError('CANCELLED','Task cancelled during resource recovery.'));};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
}
export async function reclaimForResourceRecovery(budget,error,{signal,owner,resourceOperation,onReclaim}={}){
 if(isRecoverableTransportError(error)||isRecoverableNetworkError(error)||isFixedAdmissionError(error)||!budget?.reclaim)return 0;const needed=requestedBytes(error);
 // Allocator refusal can happen despite policy headroom. Request actual freed
 // backing, not merely a check that the same policy budget still has room.
 const kind=resourceAllocationKind(error);
 if(kind&&budget.reclaimAllocation)return budget.reclaimAllocation(needed,{signal,kind,owner,operation:resourceOperation,onReclaim,recoveryAttempt:error.details?.recovery?.consecutiveFailures??1});
 return budget.reclaim(error?.code==='MEMORY_LIMIT'?needed:Math.max(0,budget.limit-budget.total())+Math.min(needed,budget.limit),{signal,owner,operation:resourceOperation});
}
// The original operation stays suspended if reclaim itself hits an allocator
// refusal. Those failures use the same guard rather than starting a nested loop.
export async function recoverResourceFailure(decision,{controller,budget,signal,operation:label='operation',phase='',checkpoint,memory=()=>budget?.snapshot?.()??{},reclaim,wait,onRecovery,onReclaim,onWait,onOpportunity,owner,resourceOperation,attempt=1}={}){
 const target=(decision,recoveryStage)=>{const kind=resourceRecoveryKind(decision.error),needed=requestedBytes(decision.error),reuseScope=decision.error.details?.reuseScope;return {decision,recoveryStage,kind,needed,reuseScope,reuseBytes:decision.error.details?.reuseBytes??needed,baseline:owner&&kind?budget?.resourceProgressSnapshot?.(owner,kind,resourceOperation,reuseScope):null,targetedReleased:0,reported:false};};
 // An inner refusal suspends the failed reclaim, not the useful computation.
 // Distinct domains have their own baseline and pressure, but share one guard.
 const frames=[target(decision,'operation')];
 try{while(frames.length){
  checkAbort(signal);const frame=frames.at(-1),{decision,kind,needed,reuseScope,reuseBytes}=frame;if(!decision.retry)throw decision.error;
  let reclamation,freed=0;const event={phase:'resource-recovery',operation:label,attempt,recoveryStage:frame.recoveryStage,error:decision.error,decision,signal,owner,resourceOperation,recordReclamation:value=>{reclamation=value;}},publicError=serializeEngineError(decision.error);
  if(!frame.reported){frame.reported=true;onRecovery?.({phase:event.phase,operation:label,attempt,recoveryStage:frame.recoveryStage,error:publicError,decision:{...decision,error:publicError},resources:budget?.resourceSnapshot?.()});}
  if(isRecoverableTransportError(decision.error))await controlCheckpoint(signal);
  else if(isRecoverableNetworkError(decision.error)){if(wait)await wait(event);else await waitForResourceRecovery({signal,milliseconds:Math.min(1000,100*decision.consecutiveFailures)});}
  else if(isFixedAdmissionError(decision.error)){if(wait)await wait(event);else await waitForResourceRecovery({signal,milliseconds:Math.min(200,25*decision.consecutiveFailures)});}
  else{
   try{freed=reclaim?await reclaim(event):await reclaimForResourceRecovery(budget,decision.error,{signal,owner,resourceOperation,onReclaim:event.recordReclamation});}
   catch(error){
    checkAbort(signal);const nextDecision=controller.fail(error,{operation:label,phase:contextValue(phase),checkpoint:contextValue(checkpoint),memory:contextValue(memory)});if(!nextDecision.retry){onRecovery?.({phase:'resource-terminal',operation:label,attempt,recoveryStage:'reclaim',error:serializeEngineError(nextDecision.error),decision:{...nextDecision,error:serializeEngineError(nextDecision.error)}});throw nextDecision.error;}
    const next=target(nextDecision,'reclaim');
    if(!frames.some(value=>value.kind===next.kind)&&!isRecoverableTransportError(nextDecision.error)&&!isRecoverableNetworkError(nextDecision.error)&&!isFixedAdmissionError(nextDecision.error))next.releasePressure=budget?.beginRecovery?.({kind:resourceAllocationKind(nextDecision.error)??undefined,owner,operation:resourceOperation,requestedBytes:next.needed});
    frames.push(next);
    continue;
   }
   checkAbort(signal);if(reclamation)onReclaim?.({phase:'resource-reclaimed',operation:label,attempt,reclamation});
   let opportunity;
   if(frame.baseline&&budget?.waitForResourceOpportunity){
    frame.targetedReleased+=reclamation?.targetedReleasedBytes??0;
    const now=budget.resourceProgressSnapshot(owner,kind,resourceOperation,reuseScope),actual=kind==='policy'?now.availableBytes:Math.max(frame.targetedReleased,now.releasedBytes-frame.baseline.releasedBytes);
    if(kind!=='policy')freed=Math.max(freed,actual);
    if(kind==='policy'&&actual>=needed)opportunity={reason:'admission-credit',...now};
    else if(actual<needed&&now.independentProducers){
     onWait?.({phase:'resource-wait',operation:label,owner,attempt,stage:'waiting',waitStage:'waiting',kind,requestedBytes:needed,independentProducers:now.independentProducers,baseline:frame.baseline,current:now,domain:budget.resourceSnapshot?.().domains[kind]??null,pressures:budget.resourceSnapshot?.().pressures});
     opportunity=await budget.waitForResourceOpportunity({owner,kind,bytes:needed,after:frame.baseline,signal,operation:resourceOperation,reuseScope,reuseBytes});
     onWait?.({phase:'resource-wait',operation:label,owner,attempt,stage:'resumed',waitStage:'resumed',kind,reason:opportunity.reason,requestedBytes:needed,baseline:frame.baseline,current:opportunity,domain:budget.resourceSnapshot?.().domains[kind]??null,pressures:budget.resourceSnapshot?.().pressures});
    }
   }
   if(opportunity&&['admission-credit','backing-reusable','backing-released'].includes(opportunity.reason)){
    if(kind!=='policy')freed=Math.max(freed,opportunity.releasedBytes-frame.baseline.releasedBytes);await controlCheckpoint(signal);
    // An inner opportunity only resumes its suspended reclaim. Public dispatch
    // can retry the useful operation after that reclaim has actually succeeded.
    if(frames.length===1)onOpportunity?.({reason:opportunity.reason,owner,operation:label,attempt,freedBytes:freed});
   }else if(wait)await wait(event);else if(freed>0)await controlCheckpoint(signal);else await waitForResourceRecovery({signal,milliseconds:Math.min(200,25*decision.consecutiveFailures)});
  }
  if(kind&&kind!=='policy')await budget?.waitForRecoveryTurn?.({kind,operation:resourceOperation,signal});
  frames.pop();frame.releasePressure?.();if(!frames.length)return freed;
 }}finally{for(const frame of frames)frame.releasePressure?.();}
}

export async function runWithResourceRecovery(operation,{controller=new ResourceRecoveryController(),budget,signal,operation:label='operation',phase='',checkpoint,memory=()=>budget?.snapshot?.()??{},reclaim,wait,onRecovery,onReclaim,onWait,onOpportunity,owner,resourceOperation}={}){
 owner??=resourceOperation?.owner;const ticket=resourceOperation??(owner?budget?.beginOperation?.({owner,id:label}):null),ownsTicket=!!ticket&&!resourceOperation;
 let attempt=0,releasePressure,pressureKind;
 try{for(;;){
  // Return owned successful results even when cancellation races their return;
  // callers check publication and release them in their own finally block.
  checkAbort(signal);if(ownsTicket||ticket?.state!=='waiting-child')ticket?.setState(ownsTicket?'waiting-child':'ready');try{const value=await operation({attempt:++attempt,signal,resourceOperation:ticket});controller.success(contextValue(checkpoint));return value;}
  catch(error){checkAbort(signal);const decision=controller.fail(error,{operation:label,phase:contextValue(phase),checkpoint:contextValue(checkpoint),memory:contextValue(memory)});if(!decision.retry){onRecovery?.({phase:'resource-terminal',operation:label,attempt,error:serializeEngineError(decision.error),decision:{...decision,error:serializeEngineError(decision.error)}});throw decision.error;}
   ticket?.setState('recovery');const memoryFailure=!isRecoverableTransportError(decision.error)&&!isRecoverableNetworkError(decision.error)&&!isFixedAdmissionError(decision.error),kind=resourceAllocationKind(decision.error)??undefined;
   // A retry can progress from a buffer allocation to a different allocator.
   // Do not leave peers blocked in the old domain, or omit the new pressure.
   if(releasePressure&&(releasePressure.released||!memoryFailure||pressureKind!==kind)){releasePressure();releasePressure=null;}
   if(memoryFailure&&!releasePressure){pressureKind=kind;releasePressure=budget?.beginRecovery?.({kind,owner,operation:ticket??undefined,requestedBytes:requestedBytes(decision.error)});}
   await recoverResourceFailure(decision,{controller,budget,signal,operation:label,phase,checkpoint,memory,reclaim,wait,onRecovery,onReclaim,onWait,onOpportunity,owner,resourceOperation:ticket??undefined,attempt});
   releasePressure?.resume?.();
  }
 }}finally{if(ownsTicket)ticket.release();releasePressure?.();}
}
