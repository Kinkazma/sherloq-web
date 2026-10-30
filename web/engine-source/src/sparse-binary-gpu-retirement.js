// Shared acknowledged retirement; keep this provider's internal names stable.
export {gpuTransaction as sparseBinaryGpuTransaction,retireGpuTransaction as retireSparseBinaryGpuTransaction,drainGpuTransactions as drainSparseBinaryGpuTransactions,attachGpuCleanup as attachSparseBinaryGpuCleanup} from './gpu-ack-retirement.js';
