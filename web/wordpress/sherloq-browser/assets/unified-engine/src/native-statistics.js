import "../../runtime-context.js?v=0.14.5";
import {COMPOSITE_STATISTICS_POLICY} from './composite-policy.js';
import {EngineError,checkAbort,requireValue,deserializeEngineError} from './errors.js';
import {registerArrayViews} from './allocation.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
/** Native NumPy/SciPy/OpenCV in a worker; downloads hold no execution slot. */
export class NativeStatistics {
 constructor(budget,runtime,{workerFactory=url=>new Worker(url,{type:'module'})}={}){this.budget=budget;this.runtime=runtime;this.factory=workerFactory;this.scheduler=getExecutionScheduler(budget);this.worker=null;this.cap=0;this.resident=0;this.busy=false;this.disposed=false;this.unreclaim=budget.registerReclaimer(()=>{if(!this.busy)this.clear();},{allocationKind:'wasm',owner:'statistics',label:'statistics-native-heap'});}
 clear(error=new EngineError('CANCELLED','Statistics worker cancelled.')){this.controller?.abort();this.protocol?.dispose();this.protocol=null;if(this.worker){this.worker.terminate();this.worker=null;}const retired=this.backing?.();this.backing=null;if(retired)this.budget.notifyBackingRelease?.('wasm',retired);this.budget.retained-=this.resident;this.resident=0;this.cap=0;this.reject?.(error);this.reject=null;}
 dispose(){this.disposed=true;this.clear();this.unreclaim();}
 async run(operation,inputs,{signal,onProgress,workspaceBytes,outputBytes,resourceOperation}={}){
  checkAbort(signal);if(this.disposed)throw new EngineError('DISPOSED','Statistics worker disposed.');if(this.busy)throw new EngineError('BUSY','Statistics worker busy.');
  requireValue(['prepare','display','composite','stream:weights','stream:features','stream:mean','stream:covariance','stream:basis','stream:project','stream:fit','stream:distances','stream:raster','bank:quality','bank:initial-sum','bank:initial-variance','bank:initial-model','bank:initial-indices','bank:expectation','bank:covariance','bank:maximization','bank:conditioning','bank:map-grid','bank:noise-display','bank:color'].includes(operation),'Unknown statistics operation.');
  requireValue([workspaceBytes,outputBytes].every(v=>Number.isSafeInteger(v)&&v>=0),'Statistics bounds required.');
  const inputBytes=Object.values(inputs).reduce((n,t)=>n+t.data.byteLength,0),cap=Math.ceil((256*1024**2+workspaceBytes+inputBytes+outputBytes)/16/1024**2)*16*1024**2;
  if(cap>2*1024**3)throw new EngineError('MEMORY_LIMIT','Statistics workspace exceeds its WASM address space.',{details:{admissionScope:'fixed',requestedBytes:cap,maximumBytes:2*1024**3}});
  if(this.cap<cap)this.clear();
  this.busy=true;const ticket=this.budget.beginOperation?.({owner:'statistics',id:'statistics/'+operation,parent:resourceOperation}),controller=new AbortController();this.controller=controller;let release,lease,ready=false;const abort=()=>this.clear();
  try{
   release=this.budget.reserve(inputBytes+outputBytes*2);
   if(!this.worker){requireValue(Number.isSafeInteger(this.runtime.downloadBytes)&&this.runtime.downloadBytes>0,'Statistics runtime download bound required.');const resident=cap+this.runtime.downloadBytes*2+8*1024**2;this.budget.retain(resident);this.resident=resident;this.cap=cap;this.backing=this.budget.registerBacking?.('wasm',cap,{owner:'statistics',label:'statistics-native-heap',state:'reserved'});this.worker=this.factory(new URL('./native-statistics-worker.js',import.meta.url));}
   this.backing?.setReclaimable(false);signal?.addEventListener('abort',abort,{once:true});checkAbort(signal);ticket?.setState('io');
   const response=await new Promise((resolve,reject)=>{
    this.reject=reject;
    const protocol=installWorkerMessageProtocol(this.worker,data=>{
     if(data.executionReady){if(ready)throw workerMessageFailure('statistics','message','duplicate-execution-ready');ready=true;requireValue(Number.isSafeInteger(data.heapBytes)&&data.heapBytes<=this.cap,'Invalid statistics heap extent.');this.backing?.materialize(data.heapBytes);
      this.scheduler.acquire({cpu:1,domains:{wasm:this.cap,'array-buffer':outputBytes},signal:controller.signal,operation:ticket,resourceOwner:'statistics',label:'statistics/'+operation}).then(admitted=>{if(controller.signal.aborted){admitted.release();return;}lease=admitted;protocol.post({command:'execute'});}).catch(protocol.fail);return;
     }
     if(data.phase){onProgress?.(data);return;}
     if(data.error){reject(deserializeEngineError(data.error));return;}
     if(!ready||!data.result||!Number.isSafeInteger(data.heapBytes))throw workerMessageFailure('statistics','message','invalid-result');resolve(data);
    },{label:'statistics',onFailure:reject});this.protocol=protocol;
    this.worker.onerror=e=>protocol.fail(new EngineError('STATISTICS_EXECUTION',e.message,{cause:e.error}));protocol.post({operation,inputs,runtime:this.runtime,memoryMaximumBytes:this.cap,outputBytes});
   });
   checkAbort(signal);if(response.statisticsPolicy!==COMPOSITE_STATISTICS_POLICY)throw new EngineError('MODEL_IDENTITY','Composite statistics policy mismatch. Rebuild the scientific runtime.');requireValue(response.heapBytes<=this.cap,'Statistics heap exceeded its admitted cap.');this.backing?.materialize(response.heapBytes);
   const arrays=Object.fromEntries(Object.entries(response.result).map(([key,value])=>[key,value.data]));requireValue(Object.values(arrays).every(ArrayBuffer.isView)&&Object.values(arrays).reduce((sum,data)=>sum+data.byteLength,0)<=outputBytes,'Statistics output exceeded admission.');
   const outputReservation=release.split(Object.values(arrays).reduce((sum,data)=>sum+data.byteLength,0));release();release=outputReservation;const backing=registerArrayViews(this.budget,arrays,{owner:'statistics',label:'statistics-output'}),resultLease=release;this.reject=null;ticket?.commit();return {...response,release(){backing();resultLease();}};
  }catch(error){this.clear(error);release?.();throw error;}finally{lease?.release();this.protocol?.dispose();this.protocol=null;this.controller=null;this.busy=false;this.backing?.setReclaimable(true);ticket?.release();signal?.removeEventListener('abort',abort);}
 }
}
