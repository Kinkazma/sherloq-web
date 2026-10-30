const failures=new WeakSet(),debts=new WeakMap();
export const markObservedNlmGpuFailure=error=>{if(error&&typeof error==='object')failures.add(error);return error;};
export const mayFallbackObservedNlmGpu=error=>!!error&&typeof error==='object'&&failures.has(error);
export function attachObservedNlmCleanup(primary,cleanup){if(primary&&typeof primary==='object')try{if(Object.isExtensible(primary))primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];}catch{}}
export function keepObservedNlmGpuRetirement(budget,retire){let set=debts.get(budget);if(!set)debts.set(budget,set=new Set());set.add(retire);}
export function forgetObservedNlmGpuRetirement(budget,retire){const set=debts.get(budget);set?.delete(retire);if(!set?.size)debts.delete(budget);}
export const hasObservedNlmGpuRetirements=budget=>!!debts.get(budget)?.size;
export async function drainObservedNlmGpuRetirements(budget,{exclude}={}){let failed=false,primary;for(const retire of [...(debts.get(budget)??[])])if(retire!==exclude)try{await retire();forgetObservedNlmGpuRetirement(budget,retire);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
// Physical buffer destruction and each accounting ACK are separate states.
// The caller establishes a queue fence or destroyed-device loss ACK first.
export async function retireObservedNlmBuffer(entry,budget){
 if(!entry.destroyed){entry.buffer.destroy();entry.destroyed=true;}
 if(!entry.backingRetired){entry.retiredBytes=await entry.backing?.();entry.backingRetired=true;}
 if(!entry.creditRetired){await entry.free();entry.creditRetired=true;}
 if(!entry.notified){if(entry.retiredBytes!==0)budget.notifyBackingRelease?.('gpu',entry.retiredBytes??entry.size);entry.notified=true;}
}
