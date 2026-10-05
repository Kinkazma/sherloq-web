import {COMPOSITE_STATISTICS_POLICY} from './composite-policy.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
/** Native NumPy/SciPy/OpenCV code in a dedicated, truly memory-bounded worker. */
export class NativeStatistics {
 constructor(budget,runtime){this.budget=budget;this.runtime=runtime;this.worker=null;this.cap=0;this.resident=0;this.busy=false;this.disposed=false;this.unreclaim=budget.registerReclaimer(()=>{if(!this.busy)this.clear();});}
 clear(){if(this.worker){this.worker.terminate();this.worker=null;this.budget.retained-=this.resident;this.resident=0;this.cap=0;this.reject?.(new EngineError('CANCELLED','Statistics worker cancelled.'));this.reject=null;}}
 dispose(){this.disposed=true;this.clear();this.unreclaim();}
 async run(operation,inputs,{signal,onProgress,workspaceBytes,outputBytes}={}){
  checkAbort(signal);if(this.disposed)throw new EngineError('DISPOSED','Statistics worker disposed.');if(this.busy)throw new EngineError('BUSY','Statistics worker busy.');
  requireValue(['prepare','display','composite','stream:weights','stream:features','stream:mean','stream:covariance','stream:basis','stream:project','stream:fit','stream:distances','stream:raster','bank:quality','bank:initial-sum','bank:initial-variance','bank:initial-model','bank:initial-indices','bank:expectation','bank:covariance','bank:maximization','bank:conditioning','bank:map-grid','bank:noise-display','bank:color'].includes(operation),'Unknown statistics operation.');
  requireValue([workspaceBytes,outputBytes].every(v=>Number.isSafeInteger(v)&&v>=0),'Statistics bounds required.');
  const inputBytes=Object.values(inputs).reduce((n,t)=>n+t.data.byteLength,0),cap=Math.ceil((256*1024**2+workspaceBytes+inputBytes+outputBytes)/16/1024**2)*16*1024**2;
  if(cap>2*1024**3)throw new EngineError('MEMORY_LIMIT','Statistics workspace exceeds its WASM address space.');
  if(this.cap<cap)this.clear();
  this.busy=true;let release;const abort=()=>this.clear();
  try{
   release=this.budget.reserve(inputBytes+outputBytes*2);
   if(!this.worker){requireValue(Number.isSafeInteger(this.runtime.downloadBytes)&&this.runtime.downloadBytes>0,'Statistics runtime download bound required.');this.resident=cap+this.runtime.downloadBytes*2+8*1024**2;this.budget.retain(this.resident);this.cap=cap;try{this.worker=new Worker(new URL('./native-statistics-worker.js',import.meta.url),{type:'module'});}catch(e){this.budget.retained-=this.resident;this.resident=0;this.cap=0;throw e;}}
   signal?.addEventListener('abort',abort,{once:true});checkAbort(signal);
   const response=await new Promise((resolve,reject)=>{this.reject=reject;this.worker.onerror=e=>reject(new EngineError('STATISTICS_EXECUTION',e.message));this.worker.onmessage=({data})=>{if(data.phase){try{onProgress?.(data);}catch(e){reject(e);}}else if(data.error)reject(new EngineError(data.error.code,data.error.message));else resolve(data);};this.worker.postMessage({operation,inputs,runtime:this.runtime,memoryMaximumBytes:this.cap,outputBytes});});
   checkAbort(signal);if(response.statisticsPolicy!==COMPOSITE_STATISTICS_POLICY)throw new EngineError('MODEL_IDENTITY','Composite statistics policy mismatch. Rebuild the scientific runtime.');requireValue(response.heapBytes<=this.cap,'Statistics heap exceeded its admitted cap.');
   this.reject=null;return {...response,release};
  }catch(e){this.clear();release?.();throw e;}finally{this.busy=false;signal?.removeEventListener('abort',abort);}
 }
}
