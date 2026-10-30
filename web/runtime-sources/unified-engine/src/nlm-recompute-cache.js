import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue} from './errors.js';
import {keepObservedNlmGpuRetirement,forgetObservedNlmGpuRetirement,drainObservedNlmGpuRetirements} from './observed-nlm-gpu-retirement.js';

// The original cache stays financed by an atomic existing-credit loan. The new
// filter neither reads it nor replaces it. No reserve/put rollback can lose it.
export function holdNlmRecomputeCache({budget,key,retire}={}){
 requireValue(typeof budget?.borrowCacheEntry==='function'&&typeof retire==='function','An atomic cache loan and the actual operation owner are required.');
 const previous=budget.get(key),bytes=previous?.byteLength??0;
 if(previous){
  requireValue(previous.value?.bytes instanceof Uint8Array&&Number.isSafeInteger(bytes)&&bytes>=previous.value.bytes.byteLength&&!previous.onEvict,'Only the unchanged native ROI RAM cache can be protected.');
  if(budget.total()>budget.limit)throw new EngineError('MEMORY_LIMIT','The previous filter remains owned; fresh computation is not admitted above the current budget.');
 }
 const loan=budget.borrowCacheEntry(key);let pending,done=false,acknowledged=false;
 const finish=()=>{
  if(done)return pending??Promise.resolve();if(pending)return pending;
  keepObservedNlmGpuRetirement(budget,finish);
  const task=Promise.resolve().then(async()=>{
   if(!acknowledged){
    await retire();
    // A provider constructor can reject before session.child is assigned.
    // Its own retained cleanup still needs a physical ACK before restoration.
    await drainObservedNlmGpuRetirements(budget,{exclude:finish});
    acknowledged=true;
   }
   if(loan&&!loan.restore())throw new EngineError('RETIREMENT_PENDING','Another cache owner occupies the previous filter key.');
   done=true;forgetObservedNlmGpuRetirement(budget,finish);
  });pending=task;void task.finally(()=>{if(!done&&pending===task)pending=null;}).catch(()=>{});return task;
 };
 return Object.freeze({finish,get snapshot(){return{cache:loan?(loan.active?'held':'restored'):'absent',bytes,operationAcknowledged:acknowledged,retirementPending:!done};}});
}
