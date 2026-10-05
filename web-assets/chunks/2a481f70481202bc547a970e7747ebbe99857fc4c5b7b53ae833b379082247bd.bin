import {normalizeResourceError} from '../../src/errors.js';
// Retention does not retry a terminal guard. A caller must explicitly resume
// with the same qualified key; cancellation and identity changes discard it.
export function retainD2prlCheckpoint(error,signal,key){
 return Boolean(key&&!signal?.aborted&&['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY','WORKER_MESSAGE_FAILED','NETWORK_TRANSIENT'].includes(normalizeResourceError(error)?.code));
}
