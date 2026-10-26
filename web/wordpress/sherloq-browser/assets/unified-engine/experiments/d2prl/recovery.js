import {ResourceRecoveryController,runWithResourceRecovery} from '../../src/resource-recovery.js';
import {serializeEngineError,normalizeResourceError,resourceAllocationKind,resourceRecoveryBytes} from '../../src/errors.js';

// Each closure owns its last committed inputs. Retrying it never rewinds an
// earlier descriptor, graph node or PatchMatch decision. This runs only after a
// real useful allocation has failed, never as a capacity probe.
export function createD2prlRecovery({budget,signal,onRecovery,onReclaim,onWait,reclaim}={}) {
 let completed=0,recoveries=0;
 const operation=async(label,work,{bytes}={})=>{
  // Concurrent tiles have independent committed inputs and independent stalls.
  // Neither another tile's first refusal nor its success changes this streak.
  const controller=new ResourceRecoveryController();
  const attempt=async options=>{try{return await work(options);}catch(error){const normalized=normalizeResourceError(error);throw bytes===undefined||normalized?.details?.requestedBytes!==undefined?normalized:normalizeResourceError(normalized,{requestedBytes:bytes});}};
  const result=await runWithResourceRecovery(attempt,{controller,budget,signal,owner:'d2prl',operation:label,phase:()=>label,checkpoint:()=>0,memory:()=>budget.snapshot(),
   reclaim:reclaim??(({error,recordReclamation,resourceOperation})=>{const requested=(error.code==='MEMORY_LIMIT'?resourceRecoveryBytes(error):error.details?.requestedBytes)??bytes??64*1024**2,kind=resourceAllocationKind(error);return kind&&budget.reclaimAllocation?budget.reclaimAllocation(requested,{signal,kind,owner:'d2prl',operation:resourceOperation,onReclaim:recordReclamation}):budget.reclaim(error.code==='MEMORY_LIMIT'?requested:Math.min(budget.limit,Math.max(0,budget.limit-budget.total())+requested),{signal,owner:'d2prl',operation:resourceOperation});}),
   onReclaim,onWait,
   onRecovery:({phase,attempt,error,decision,resources,recoveryStage})=>{if(phase==='resource-recovery')recoveries++;onRecovery?.({phase,operation:label,attempt,error:serializeEngineError(error),consecutiveFailures:decision.consecutiveFailures,totalFailures:decision.totalFailures,completedOperations:completed,recoveries,resources,recoveryStage});}});
  completed++;return result;
 };
 operation.snapshot=()=>({completedOperations:completed,recoveries});return operation;
}

export const directOperation=(_label,work)=>work();

export function recoverableStage(stage,label,operation,methods=['run'],optionsIndex) {
 const overrides=new Map(methods.map(method=>[method,(...args)=>operation(label+':'+method+(typeof args[0]==='string'?':'+args[0]:''),({resourceOperation}={})=>{
  // Explicit per-invocation context: concurrent tiles never share an ambient
  // current-operation stack. Only helpers with declared options receive it.
  const forwarded=[...args];if(Number.isInteger(optionsIndex))forwarded[optionsIndex]={...args[optionsIndex],resourceOperation};
  return stage[method](...forwarded);
 })]));
 return new Proxy(stage,{get(target,key){if(overrides.has(key))return overrides.get(key);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
}
