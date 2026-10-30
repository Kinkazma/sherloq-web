import "../../runtime-context.js?v=0.30.0";
// Stable ELA aliases for the shared acknowledged-retirement protocol.
export {gpuTransaction as elaGpuTransaction,retireGpuTransaction as retireElaGpuTransaction,drainGpuTransactions as drainElaGpuTransactions,attachGpuCleanup as attachElaGpuCleanup} from './gpu-ack-retirement.js';
