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
 // The JS object heap of one isolate is not the aggregate capacity of shared
 // byte banks and independent worker/Wasm heaps. Do not clamp the whole engine
 // to that isolate's limit. Its hint only bounds the unknown-RAM fallback.
 const hasRamHint=Number.isFinite(deviceMemoryGiB)&&deviceMemoryGiB>0;
 const hasHeapHint=Number.isFinite(heapLimitBytes)&&heapLimitBytes>0;
 const systemMemoryFresh=Number.isFinite(hints.systemMemoryObservedAt)&&Date.now()-hints.systemMemoryObservedAt>=0&&Date.now()-hints.systemMemoryObservedAt<=5000;
 const hasSystemHint=systemMemoryFresh&&Number.isSafeInteger(hints.systemMemoryAvailableBytes)&&hints.systemMemoryAvailableBytes>=0&&Number.isSafeInteger(hints.systemMemoryCapacityBytes)&&hints.systemMemoryCapacityBytes>0&&hints.systemMemoryAvailableBytes<=hints.systemMemoryCapacityBytes;
 const available=hasSystemHint?hints.systemMemoryAvailableBytes*policy.ramFraction:hasRamHint?deviceMemoryGiB*GiB*policy.ramFraction:Math.min(policy.unknownBudgetBytes,hasHeapHint?heapLimitBytes*policy.heapFraction:Infinity);
 const memoryBudgetBytes=Math.max(32*MiB,Math.floor(available/MiB)*MiB);
 return {id:policy.id,label:policy.label,memoryBudgetBytes,maxWorkers:Number.isFinite(hardwareConcurrency)?Math.max(1,Math.floor(hardwareConcurrency)):1,minimumBenefit:policy.minimumBenefit,enableDenseGpu:true,
  hints:{deviceMemoryGiB:deviceMemoryGiB??null,heapLimitBytes:heapLimitBytes??null,hardwareConcurrency,...(hasSystemHint?{systemMemoryCapacityBytes:hints.systemMemoryCapacityBytes,systemMemoryAvailableBytes:hints.systemMemoryAvailableBytes,systemMemoryObservedAt:hints.systemMemoryObservedAt}:{})},
  memoryBudgetSource:hasSystemHint?'system-available-snapshot':hasRamHint?'approximate-device-memory':'unknown-memory-fallback',
  memoryPolicy:'Shared policy budget from a fresh optional host availability snapshot, otherwise approximate device RAM or unknown-RAM fallback; not an allocation guarantee; per-allocation limits remain independent; no eager allocation',
  gpuPolicy:'High-performance adapter for offline-qualified kernels within API limits; no startup benchmark; CPU retained'};
}
