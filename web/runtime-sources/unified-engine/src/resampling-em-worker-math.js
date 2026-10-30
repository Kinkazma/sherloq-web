import "../../runtime-context.js?v=0.30.0";
import {createResamplingEmGpuMath} from './resampling-em-gpu-math.js';
import {EngineError,deserializeEngineError} from './errors.js';
// The caller already admits the same native heap and bounded transfer pages.
// Source pages are cloned: GPU upload retains the original until acceptance.
// Only copied worker outputs are transferred, never the native WASM heap.
export async function createResamplingEmWorkerMath({budget,workerFactory}={}){
 const custom=workerFactory!==undefined,factory=custom?workerFactory:globalThis.Worker?()=>new Worker(new URL('./resampling-em-product-worker.js',import.meta.url),{type:'module'}):null;if(!factory)return createResamplingEmGpuMath();
 let worker;try{worker=factory();}catch(error){if(custom)throw error;return createResamplingEmGpuMath();}
let pending,serial=0,heap=8*1024**2,closed=false,closing,active,fatal,acknowledged=false,terminated=false;
 const call=(method,args=[])=>{
  if(closed&&method!=='dispose')throw new EngineError('DISPOSED','Native EM worker closed.');
  if(pending)throw new EngineError('BUSY','Native EM worker busy.');
  if(fatal)throw fatal;
  active=new Promise((resolve,reject)=>{const id=++serial;pending={id,resolve,reject};try{worker.postMessage({id,method,args});}catch(error){pending=null;fatal=error;reject(error);}});return active;
 };
 worker.onmessage=({data:j})=>{if(!pending||pending.id!==j.id)return;const entry=pending;pending=null;heap=j.heapBytes??heap;if(j.closed)acknowledged=true;j.error?entry.reject(deserializeEngineError(j.error)):entry.resolve(j.value);};
 const fail=e=>{e.preventDefault?.();fatal=new EngineError('WORKER_FAILED',e.message||'Native EM worker transport failed.');const entry=pending;pending=null;entry?.reject(fatal);};worker.onerror=fail;worker.onmessageerror=fail;
 const api={transport:'worker',background:true,heapBytes:()=>heap};for(const method of['create','batch','gramCarry','inverse','accept','acceptCpu','finish'])api[method]=(...args)=>call(method,args);
 api.dispose=()=>{if(terminated)return Promise.resolve();if(closing)return closing;closed=true;const task=(async()=>{try{await active;}catch{}if(!fatal&&!acknowledged)await call('dispose');if(!terminated){worker.terminate();terminated=true;}})();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;};
 try{await call('initialize');return api;}catch(error){try{await api.dispose();}catch(cleanup){if(Object.isExtensible(error)){error.cleanupErrors=[...(error.cleanupErrors??[]),cleanup];Object.defineProperty(error,'emMathCleanup',{configurable:true,value:()=>api.dispose()});}let unregister;unregister=budget?.registerAsyncReclaimer?.(async()=>{await api.dispose();unregister?.();return 0;},{owner:'resampling-em-math',label:'failed-worker-constructor-retirement',allocationKind:'worker'});}if(!custom&&terminated)return createResamplingEmGpuMath();throw error;}
}
