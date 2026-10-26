// Selection on the requested work; no inference probe or persistent calibration.
import {segmentationCpuZoneCapacity} from './zone-scheduler.js';
export async function selectSegmentationBackend({requested, gpuModel, cpuModel, regionBounds, segmented = false, reclaimableInferenceBytes = 0, hardwareConcurrency, budget, sourceBytes, zones, knownHeapBytes, gpu = globalThis.navigator?.gpu}) {
  if (requested !== 'auto') return {backend: requested, reason: 'explicit-' + requested};
  if (!gpuModel) return {backend: 'cpu', reason: 'qualified-gpu-model-not-configured'};
  // This model's head remains single-thread CPU even on the hybrid route.
  // Measured three-lane CPU work wins for distinct zones when it fits. Count
  // recoverable own sessions so an already-warm CPU choice cannot self-demote.
  if (gpuModel.preferCpuAtConcurrentZones && cpuModel && Array.isArray(regionBounds) && regionBounds.length >= gpuModel.preferCpuAtConcurrentZones && regionBounds.every(b=>Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[2]>b[0]&&b[3]>b[1])) {
    const distinct=[...new Map(regionBounds.map(bounds=>[JSON.stringify(bounds),{bounds}])).values()];
    const capacity=segmentationCpuZoneCapacity({budget,model:cpuModel,zones:distinct,segmented,hardwareConcurrency,reclaimableInferenceBytes,extraReservedBytes:knownHeapBytes+(segmented?0:3*sourceBytes)});
    if(capacity>=gpuModel.preferCpuAtConcurrentZones)return{backend:'cpu',reason:'parallel-cpu-zones-fit-preference'};
  }
  // Eligibility estimate; every actual allocation still uses the shared budget.
  // Idle workers/cache can be reclaimed by that budget. Owned source bytes cannot.
  const minimum = (gpuModel.minimumResidentBytes ?? 1024 * 1024 ** 2) + 3 * (gpuModel.assetBytes ?? gpuModel.bytes) + (gpuModel.bridgeBytes ?? 0) + knownHeapBytes + 5 * sourceBytes + 16 * 1024 ** 2 + zones * 2 * 256 * 256 * 4;
  if (budget.limit - budget.retained < minimum) return {backend: 'cpu', reason: 'gpu-residency-exceeds-available-budget'};
  const adapter = await gpu?.requestAdapter({powerPreference: 'high-performance'}).catch(() => null);
  if (!adapter || adapter.limits.maxStorageBuffersPerShaderStage < 8) return {backend: 'cpu', reason: 'required-gpu-capabilities-unavailable'};
  return {backend: 'webgpu', reason: 'qualified-hybrid-gpu-with-budget'};
}
