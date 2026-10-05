import "../../runtime-context.js?v=0.14.5";
// Resource policies only. They never alter image resolution or analysis thresholds.
const MiB=1024**2,GiB=1024**3;
export const COMPUTE_PROFILES=Object.freeze({
 aggressive:Object.freeze({id:'aggressive',label:'Agressif',ramFraction:.65,heapFraction:.75,unknownBudgetBytes:GiB,minimumBenefit:.05}),
 maximum:Object.freeze({id:'maximum',label:'Maximum utile',ramFraction:.80,heapFraction:.85,unknownBudgetBytes:2*GiB,minimumBenefit:.05})
});
export function resolveComputeProfile(id='aggressive',hints={}){
 const policy=COMPUTE_PROFILES[id];if(!policy)throw new TypeError('Unknown compute profile.');
 const navigatorHints=globalThis.navigator;
 const deviceMemoryGiB=hints.deviceMemoryGiB??navigatorHints?.deviceMemory;
 const heapLimitBytes=hints.heapLimitBytes??globalThis.performance?.memory?.jsHeapSizeLimit;
 const hardwareConcurrency=hints.hardwareConcurrency??navigatorHints?.hardwareConcurrency??1;
 const limits=[4*GiB];
 if(Number.isFinite(deviceMemoryGiB)&&deviceMemoryGiB>0)limits.push(deviceMemoryGiB*GiB*policy.ramFraction);
 if(Number.isFinite(heapLimitBytes)&&heapLimitBytes>0)limits.push(heapLimitBytes*policy.heapFraction);
 if(limits.length===1)limits.push(policy.unknownBudgetBytes);
 const memoryBudgetBytes=Math.max(32*MiB,Math.floor(Math.min(...limits)/MiB)*MiB);
 return {id:policy.id,label:policy.label,memoryBudgetBytes,maxWorkers:Number.isFinite(hardwareConcurrency)?Math.max(1,Math.floor(hardwareConcurrency)):1,minimumBenefit:policy.minimumBenefit,
  hints:{deviceMemoryGiB:deviceMemoryGiB??null,heapLimitBytes:heapLimitBytes??null,hardwareConcurrency},
  memoryPolicy:'One shared engine budget; approximate browser hints; 4 GiB accounting ceiling; no eager allocation',
  gpuPolicy:'High-performance adapter only when capability, exactness and full-path benefit are verified; CPU retained'};
}
