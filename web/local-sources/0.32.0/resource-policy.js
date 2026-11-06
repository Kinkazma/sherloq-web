// Shared browser resource policy, no benchmark or synthetic allocation probe.
// Matches the uncapped engine policy; the UI reserves its own live resources.
const MiB=1024**2,GiB=1024**3;
export function resolveComputeProfile(id='aggressive',hints={}){
 const policy={aggressive:{ram:.65,heap:.75,unknown:GiB},maximum:{ram:.80,heap:.85,unknown:2*GiB}}[id];
 if(!policy)throw new TypeError('Unknown compute profile');
 const deviceMemoryGiB=hints.deviceMemoryGiB??globalThis.navigator?.deviceMemory;
 const heapLimitBytes=hints.heapLimitBytes??globalThis.performance?.memory?.jsHeapSizeLimit;
 const hardwareConcurrency=hints.hardwareConcurrency??globalThis.navigator?.hardwareConcurrency??1;
 const limits=[];if(Number.isFinite(deviceMemoryGiB)&&deviceMemoryGiB>0)limits.push(deviceMemoryGiB*GiB*policy.ram);
 if(Number.isFinite(heapLimitBytes)&&heapLimitBytes>0)limits.push(heapLimitBytes*policy.heap);
 return {id,memoryBudgetBytes:Math.max(32*MiB,Math.floor(Math.min(...(limits.length?limits:[policy.unknown]))/MiB)*MiB),maxWorkers:Number.isFinite(hardwareConcurrency)?Math.max(1,Math.floor(hardwareConcurrency)):1,hints:{deviceMemoryGiB,heapLimitBytes,hardwareConcurrency}};
}
