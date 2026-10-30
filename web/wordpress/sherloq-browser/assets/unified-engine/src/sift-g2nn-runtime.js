import "../../runtime-context.js?v=0.30.0";
import {boundWasmMemory} from './wasm-memory-limit.js';
import {fetchM3Asset} from './m3-asset.js';
import {wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
const MiB=1024**2,failedByBudget=new WeakMap(),unbudgetedFailures=new Set();
const failures=budget=>{if(!budget)return unbudgetedFailures;let set=failedByBudget.get(budget);if(!set){set=new Set();failedByBudget.set(budget,set);}return set;};
const IDENTITY={bytes:8581,sha256:'557c79451947111eecc85b0f7eb0e8e29b4b9c52ee3628bab50eee584ff87ba5'};
export const siftG2nnHeapPlan=(count,gpuRows=0)=>Math.ceil((16*MiB+count*(148+gpuRows*4))/(32*MiB))*32*MiB;
export async function retireSiftG2nnRuntimes(budget){let failed=false,primary;for(const owner of [...failures(budget)])try{await owner.dispose();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
const loadDefault=signal=>fetchM3Asset(new URL('../vendor/sift-g2nn/sift-g2nn.wasm',import.meta.url),IDENTITY,signal);
const createDefault=async options=>{const{default:create}=await import('../vendor/sift-g2nn/sift-g2nn.js');return create(options);};
export async function createSiftG2nnRuntime({budget,reserveMemory,maximumHeapBytes,signal,onOwner,loadBytes=loadDefault,create=createDefault}={}){
 requireValue(typeof reserveMemory==='function'&&Number.isSafeInteger(maximumHeapBytes)&&maximumHeapBytes>=32*MiB&&maximumHeapBytes<=1024*MiB&&maximumHeapBytes%65536===0,'Invalid G2NN native heap admission.');checkAbort(signal);await retireSiftG2nnRuntimes(budget);checkAbort(signal);
 let fee=budget?.reserve?budget.reserve(maximumHeapBytes+65536):reserveMemory(maximumHeapBytes+65536),m,backing,opening,closing,closed=false,retired=false,unregister;const pointers=new Set(),allocationFailures=new WeakSet(),life=new AbortController();
 const owner={
  async open(){if(closed)throw new EngineError('DISPOSED','G2NN native heap is retired.');const combined=signal?AbortSignal.any([signal,life.signal]):life.signal;checkAbort(combined);if(m)return m;if(opening)return opening;const task=(async()=>{const bytes=await loadBytes(combined);checkAbort(combined);m=await create({wasmBinary:boundWasmMemory(bytes,maximumHeapBytes)});checkAbort(combined);requireValue(m.HEAPU8.byteLength<=maximumHeapBytes,'G2NN native memory exceeds admission.');backing=budget?.registerBacking?.('wasm',maximumHeapBytes,{owner:'sift',label:'g2nn-bounded-native-heap',identity:m});return m;})();opening=task;void task.finally(()=>{if(opening===task)opening=null;}).catch(()=>{});return task;},
  allocate(bytes){if(closed||!m)throw new EngineError('DISPOSED','G2NN native heap is unavailable.');const p=m._malloc(Math.max(8,bytes));if(!p){const error=wasmAllocationFailure(m,'G2NN staging allocation failed.',Math.max(8,bytes));allocationFailures.add(error);throw error;}pointers.add(p);return p;},
  isAllocationFailure:error=>!!error&&typeof error==='object'&&allocationFailures.has(error),
  get metrics(){return{maximumHeapBytes,actualHeapBytes:m?.HEAPU8.byteLength??0};},
  dispose(){if(retired)return closing??Promise.resolve();if(closing)return closing;closed=true;life.abort();const task=(async()=>{await opening?.catch(()=>{});let failed=false,primary;const attempt=async fn=>{try{await fn();}catch(error){if(!failed){failed=true;primary=error;}}};if(m)for(const p of [...pointers])await attempt(()=>{m._free(p);pointers.delete(p);});if(!pointers.size)m=null;if(!m){await attempt(async()=>{const bytes=await backing?.();backing=null;if(bytes!==0)budget?.notifyBackingRelease?.('wasm',bytes??maximumHeapBytes);});if(!backing)await attempt(async()=>{const ack=await fee?.();if(ack===false||ack===0)throw ack;fee=null;});}if(!m&&!backing&&!fee){await unregister?.();unregister=null;failures(budget).delete(owner);retired=true;}if(failed)throw primary;})();closing=task;void task.catch(()=>{failures(budget).add(owner);unregister??=budget?.registerAsyncReclaimer?.(async()=>{const before=budget.total();await owner.dispose();return before-budget.total();},{owner:'sift',label:'g2nn-native-retirement',allocationKind:'wasm'});}).catch(()=>{});void task.finally(()=>{if(!retired&&closing===task)closing=null;}).catch(()=>{});return task;}
 };
 try{onOwner?.(owner);checkAbort(signal);return owner;}catch(primary){try{await owner.dispose();}catch{}throw primary;}
}
