import {EngineError,requireValue,checkAbort} from './errors.js';
import {allocateWasmMemory} from './allocation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {energyArrayPairwise} from './energy-statistics.js';
import {ENERGY_STATISTICS_KERNEL as pin} from './energy-statistics-kernel-pin.js';

export const ENERGY_STATISTICS_RUNTIME_BYTES=65536;
export const ENERGY_STATISTICS_RUNTIME_INITIALIZATION_BYTES=16384;
const MAXIMUM=8192;
const optionalFailures=new WeakSet();
function optionalFailure(code,message,options){const error=new EngineError(code,message,options);optionalFailures.add(error);return error;}

export async function readEnergyStatisticsKernel({signal,fetcher}={}){
 checkAbort(signal);let response;try{response=await (fetcher??globalThis.fetch)(new URL(pin.url),{signal,credentials:'same-origin',cache:'no-cache'});}catch(error){checkAbort(signal);if(fetcher===undefined&&error instanceof TypeError&&!Object.isFrozen(error))throw optionalFailure('DEPENDENCY_NETWORK','Energy statistics kernel is unavailable.',{cause:error});throw error;}
 try{checkAbort(signal);}catch(error){await response.body?.cancel().catch(()=>{});throw error;}
 const details={resource:'energy-statistics/statistics.wasm',expectedBytes:pin.bytes,expectedSha256:pin.sha256};
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw optionalFailure('DEPENDENCY_HTTP','Energy statistics kernel download failed.',{details:{...details,status:response.status}});}
 const reader=response.body?.getReader();if(!reader)throw optionalFailure('DEPENDENCY_BODY','Energy statistics kernel response body is missing.',{details});
 let used=0,complete=false;
 try{const bytes=new Uint8Array(pin.bytes);
  for(;;){checkAbort(signal);let part;try{part=await reader.read();}catch(error){checkAbort(signal);if(error instanceof TypeError&&!Object.isFrozen(error))throw optionalFailure('DEPENDENCY_READ','Energy statistics kernel stream is unavailable.',{cause:error});throw error;}checkAbort(signal);if(part.done)break;
   if(!(part.value instanceof Uint8Array)||part.value.byteLength>pin.bytes-used)throw optionalFailure('DEPENDENCY_SIZE','Energy statistics kernel exceeds its pinned extent.',{details});
   bytes.set(part.value,used);used+=part.value.byteLength;
  }
  if(used!==pin.bytes)throw optionalFailure('DEPENDENCY_SIZE','Energy statistics kernel is truncated.',{details});
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');checkAbort(signal);
  if(digest!==pin.sha256)throw optionalFailure('DEPENDENCY_INTEGRITY','Energy statistics kernel SHA-256 differs.',{details:{...details,receivedSha256:digest}});
  complete=true;return bytes;
 }finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}

// RawCTX owns this optional reducer and its pins. The only independent reclaimer
// below retains a failed-construction retirement debt; it never retires an idle
// but live reducer between successive native-grid statistics chunks.
export async function createEnergyStatisticsRuntime({budget,signal,fetcher}={}){
 requireValue(budget?.reserve&&budget?.total,'An Energy statistics runtime budget is required.');checkAbort(signal);
 if(typeof WebAssembly!=='object'||typeof WebAssembly.Memory!=='function'||typeof WebAssembly.compile!=='function'||typeof WebAssembly.validate!=='function')return null;
 if(!fetcher&&typeof globalThis.fetch!=='function')return null;
 const peak=ENERGY_STATISTICS_RUNTIME_BYTES+ENERGY_STATISTICS_RUNTIME_INITIALIZATION_BYTES;
 if(budget.recovering||budget.isBackingUnderPressure?.('wasm')||budget.total()+peak>budget.limit)return null;
 let memory,instance,input,backing,reservation,initialization,allocationFailure=null,admissionFailure=null;
 let backingRetired=false,reservationRetired=false,retiredBytes,allocated=false,notified=false,closed=false,closing=false,disposing,unregister,refs=0,executions=0;
 const release=async()=>{
  if(!backingRetired){retiredBytes=await backing?.();backingRetired=true;backing=null;}
  input=null;instance=null;memory=null;
  if(!reservationRetired){await reservation?.();reservationRetired=true;}
  if(allocated&&!notified&&retiredBytes!==0){budget.notifyBackingRelease?.('wasm',retiredBytes??ENERGY_STATISTICS_RUNTIME_BYTES);notified=true;}
 };
 const dispose=()=>{
  if(closed)return Promise.resolve();if(disposing)return disposing;if(refs)return Promise.reject(new EngineError('BUSY','Energy statistics runtime is pinned.'));closing=true;
  const task=(async()=>{await release();closed=true;unregister?.();unregister=null;})();disposing=task;
  void task.catch(()=>{if(disposing===task)disposing=null;if(!unregister)unregister=budget.registerAsyncReclaimer?.(()=>dispose(),{owner:'energy-preparation-context',label:'statistics-runtime-retirement',allocationKind:'wasm'});});return task;
 };
 try{
  try{reservation=budget.reserve(ENERGY_STATISTICS_RUNTIME_BYTES);initialization=budget.reserve(ENERGY_STATISTICS_RUNTIME_INITIALIZATION_BYTES);}catch(error){if(error?.code==='MEMORY_LIMIT')admissionFailure=error;throw error;}
  const bytes=await readEnergyStatisticsKernel({signal,fetcher});checkAbort(signal);
  if(!WebAssembly.validate(bytes)){await dispose();return null;}
  try{memory=allocateWasmMemory({initial:1,maximum:1},{label:'energy-statistics-pairwise'});}catch(error){if(error?.code==='MEMORY_ALLOCATION')allocationFailure=error;throw error;}
  allocated=true;backing=budget.registerBacking?.('wasm',ENERGY_STATISTICS_RUNTIME_BYTES,{owner:'energy-preparation-context',label:'statistics-runtime',identity:memory.buffer});
  let module;try{module=await WebAssembly.compile(bytes);}catch(error){checkAbort(signal);if(error instanceof WebAssembly.CompileError&&!Object.isFrozen(error))throw optionalFailure('DEPENDENCY_COMPILE','Energy statistics kernel compilation is unavailable.',{cause:error});throw error;}checkAbort(signal);
  try{instance=await WebAssembly.instantiate(module,{env:{memory}});}catch(error){checkAbort(signal);if((error instanceof WebAssembly.CompileError||error instanceof WebAssembly.LinkError)&&!Object.isFrozen(error))throw optionalFailure('DEPENDENCY_INSTANTIATE','Energy statistics kernel instantiation is unavailable.',{cause:error});throw error;}checkAbort(signal);
  const heap=Number(instance.exports?.__heap_base?.value),offset=Math.ceil(heap/16)*16;
  if(!(typeof instance.exports?.energy_pairwise==='function'&&typeof instance.exports?.energy_filter==='function'&&Number.isSafeInteger(heap)&&heap>=16384&&offset+MAXIMUM*4<=memory.buffer.byteLength&&memory.buffer.byteLength===ENERGY_STATISTICS_RUNTIME_BYTES))throw optionalFailure('DEPENDENCY_ABI','The pinned statistics kernel ABI differs.');
  input=new Float32Array(memory.buffer,offset,MAXIMUM);
 }catch(error){let retired=false;await retireCompositeOwners([async()=>{await dispose();retired=true;}],{primary:error});if(retired&&!signal?.aborted&&(allocationFailure!==null&&error===allocationFailure||admissionFailure!==null&&error===admissionFailure||optionalFailures.has(error)))return null;throw error;}
 finally{initialization?.();}
 return{byteLength:ENERGY_STATISTICS_RUNTIME_BYTES,backend:'wasm-simd-f32-pairwise8',get wasmExecutions(){return executions;},
  reduce(values,start,count,mean=0,squared=false,{signal}={}){
   requireValue(!closed&&!closing,'Energy statistics runtime is closed.');
   requireValue(values instanceof Float32Array&&Number.isSafeInteger(start)&&start>=0&&Number.isInteger(count)&&count>=0&&count<=MAXIMUM&&start+count<=values.length,'A bounded Float32 statistics chunk is required.');checkAbort(signal);
   // The useful native mean is Float32. General callers keep the JS double
   // subtraction if their mean is not exactly representable by that ABI.
   if(squared&&!Object.is(mean,Math.fround(mean)))return energyArrayPairwise(values,start,count,mean,squared);
   input.set(values.subarray(start,start+count));const result=instance.exports.energy_pairwise(input.byteOffset,count,mean,squared?1:0);checkAbort(signal);
   // Wasm permits arithmetic NaN payload choices; preserve the original JS
   // behaviour for those exceptional inputs rather than canonizing their bits.
   if(Number.isNaN(result))return energyArrayPairwise(values,start,count,mean,squared);executions++;return result;
  },
  filterInto(values,start,count,lower,upper,mode,output,outputAt,{signal}={}){
   requireValue(!closed&&!closing,'Energy statistics runtime is closed.');
   requireValue(values instanceof Float32Array&&output instanceof Float32Array&&Number.isSafeInteger(start)&&start>=0&&Number.isInteger(count)&&count>=0&&count<=MAXIMUM&&start+count<=values.length&&Number.isSafeInteger(outputAt)&&outputAt>=0&&outputAt+count<=output.length&&typeof lower==='number'&&typeof upper==='number'&&[0,1,2].includes(mode),'A bounded stable Float32 filter chunk is required.');checkAbort(signal);
   input.set(values.subarray(start,start+count));let kept=0;
   if(!Object.is(lower,Math.fround(lower))||!Object.is(upper,Math.fround(upper))){for(let i=0;i<count;i++){const value=input[i];if(mode===0?value>=lower&&value<=upper:mode===1?value<=lower:value>=upper)output[outputAt+kept++]=value;}checkAbort(signal);return kept;}
   kept=instance.exports.energy_filter(input.byteOffset,count,lower,upper,mode);checkAbort(signal);output.set(input.subarray(0,kept),outputAt);executions++;return kept;
  },
  pin(){requireValue(!closed&&!closing,'Energy statistics runtime is closed.');const unpin=backing?.pin?.();refs++;let freed=false;return()=>{if(!freed){unpin?.();refs--;freed=true;}};},
  dispose
 };
}
