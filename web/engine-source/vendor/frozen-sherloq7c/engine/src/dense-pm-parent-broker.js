import {EngineError,requireValue,checkAbort,serializeEngineError,deserializeEngineError} from './errors.js';
import {DensePmGpu} from './dense-pm-gpu.js';
import {densePmReverseHeapBound} from './dense-pm-reverse.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
import {acquireDensePmJob} from './dense-pm-job-gate.js';
import {describeDensePmGeometry} from './dense-pm-geometry.js';
import {validActiveDenseIndices} from './dense-pm-active-plan.js';

// A CPU lane must be returned before it waits for GPU work. In particular,
// reverse callbacks borrow that same shared CPU capacity; retaining the parent
// grant here would deadlock the valid maxWorkers=1 profile.
export class DensePmParentBroker {
 constructor({budget,maxWorkers,signal,post,releaseCpu,acquireCpu,onProgress,onFailure,providerFactory=()=>new DensePmGpu(budget,{maxWorkers})}){
  Object.assign(this,{budget,signal,post,releaseCpu,acquireCpu,onProgress,onFailure,providerFactory});this.provider=null;this.active=null;this.tasks=new Set();this.closed=false;this.terminated=false;
 }
 async handle(message){
  const packet=message?.gpuPm;if(!packet)return false;requireValue(!this.closed,'Dense GPU broker is closed');
  if(packet.kind==='offer'){
   requireValue(!this.active&&Number.isSafeInteger(packet.id)&&packet.id>0,'Concurrent dense GPU offer');
   const {width,height,dimensions,second,options={},packed=false}=packet,n=width*height,activeCount=packed?packet.activeCount:n;
   requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&Number.isSafeInteger(n)&&n>0&&[12,128].includes(dimensions)&&typeof second==='boolean'&&typeof packed==='boolean'&&(!packed||Number.isSafeInteger(activeCount)&&activeCount>=2&&activeCount<n),'Invalid dense GPU offer');
   const record=this.active={id:packet.id,width,height,dimensions,second,options,packed,activeCount,inputBackings:new Set(),retired:false,ready:false,sequence:0};
   const task=this.offer(record);this.tasks.add(task);try{await task;}finally{this.tasks.delete(task);}return true;
  }
  const record=this.active;requireValue(record&&packet.id===record.id,'Unexpected dense GPU parent reply');
  if(packet.kind==='ready'){
   requireValue(!record.ready&&record.accepted,'Unadmitted dense GPU banks');record.ready=true;
   const task=this.run(record,packet);this.tasks.add(task);try{await task;}finally{this.tasks.delete(task);}return true;
  }
  if(packet.kind==='reversed'||packet.kind==='reversed-error'){
   requireValue(record.reverse&&packet.sequence===record.reverse.sequence,'Unexpected dense reverse reply');const reverse=record.reverse;record.reverse=null;
   if(packet.kind==='reversed-error')reverse.reject(deserializeEngineError(packet.error));else reverse.resolve(packet.state);return true;
  }
  if(packet.kind==='retired'){
   requireValue(!record.reverse,'Dense native reverse retired during an offer');record.retired=true;await this.retireInputs(record);this.post({gpuPm:{id:record.id,kind:'retired-ack'}});this.active=null;return true;
  }
  throw new EngineError('WORKER_MESSAGE_FAILED','Unknown dense GPU broker phase');
 }
 async offer(record){
  const {width,height,dimensions,second,options,id,packed,activeCount}=record,n=width*height,rows=packed?activeCount:n,bankBytes=rows*dimensions*4*(second?2:1),reverseBytes=densePmReverseHeapBound(second?rows*dimensions*4:0,second?rows*dimensions*4:0,n,options.axes?(width+height)*4:0,packed?activeCount:undefined),geometry=describeDensePmGeometry(width,height,options);
  // These routes retain native CPU geometry until a corresponding GPU domain
  // is qualified. They are not presented as GPU descriptor/matching work.
  if(!geometry||reverseBytes>=2**31){this.active=null;this.post({gpuPm:{id,kind:'accepted',accepted:false,reason:'native-coordinate-or-capacity-domain'}});return;}
  let failed=false,primary,accepted=false;
  try{
   await this.releaseCpu();record.jobGate=await acquireDensePmJob(this.budget,this.signal);checkAbort(this.signal);this.provider??=this.providerFactory();
   try{record.extraFree=this.budget.reserve(bankBytes+n+reverseBytes+(packed?activeCount*4:0)+8*1024**2);this.unregister??=this.budget.registerAsyncReclaimer?.(async()=>{if(!this.active||!this.active.retired&&!this.terminated)return 0;const before=this.budget.total();await this.retireInputs(this.active);return Math.max(0,before-this.budget.total());},{owner:'patchmatch',label:'dense-pm-failed-input-retirement',allocationKind:'array-buffer'});}
   catch(error){if(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code)){record.decline='admission';return;}throw error;}
   record.nativeBacking=this.budget.registerBacking?.('wasm',reverseBytes,{owner:'patchmatch',label:'dense-native-reverse-worker',state:'reserved'});record.reverseBound=reverseBytes;
   try{await this.provider.prepare(dimensions,Math.max(rows*dimensions*4,n*16),this.signal,geometry.mode+(packed?'-active':''));accepted=true;record.accepted=true;}
   catch(error){if(this.provider.mayFallback(error)){record.decline=error.code;return;}throw error;}
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   if(!accepted)try{record.retired=true;await this.retireInputs(record);}catch(error){if(failed)attachGpuCleanup(primary,error);else{failed=true;primary=error;}}
   try{await this.acquireCpu();}catch(error){if(failed)attachGpuCleanup(primary,error);else{failed=true;primary=error;}}
   if(!failed){if(!accepted)this.active=null;this.post({gpuPm:{id,kind:'accepted',accepted,reason:record.decline}});}else if(!this.signal?.aborted){if(this.onFailure)this.onFailure(primary);else this.post({gpuPm:{id,kind:'error',error:serializeEngineError(primary)}});}
   if(failed&&!this.signal?.aborted)throw primary;
  }
 }
 async run(record,packet){
  const {width,height,dimensions,options,id,packed,activeCount}=record,n=width*height,rows=packed?activeCount:n;
  requireValue(packet.first instanceof Float32Array&&packet.first.length===rows*dimensions&&packet.second instanceof Float32Array&&packet.second.length===packet.first.length&&(record.second||packet.second===packet.first)&&packet.mask instanceof Uint8Array&&packet.mask.length===n&&Number.isSafeInteger(packet.heapBytes)&&packet.heapBytes<=record.reverseBound&&(!packed||packet.activeIndices instanceof Int32Array&&packet.activeIndices.length===activeCount&&validActiveDenseIndices(packet)),'Invalid dense GPU bank publication');
  requireValue(packet.reverseScoreReuse!==true||packet.first===packet.second,'Symmetric reverse requires aliased admitted banks');record.nativeBacking?.materialize(packet.heapBytes);record.nativeBytes=packet.heapBytes;
  for(const value of new Set([packet.first,packet.second,packet.mask,...(packed?[packet.activeIndices]:[])]))record.inputBackings.add({bytes:value.byteLength,backing:this.budget.registerBacking?.('array-buffer',value.byteLength,{owner:'patchmatch',label:'dense-worker-bank-publication',identity:value.buffer})});
  let result,failed=false,primary;
  try{
   await this.releaseCpu();
   result=await this.provider.run({...options,first:packet.first,second:packet.second,mask:packet.mask,width,height,dimensions,activeIndices:packed?packet.activeIndices:undefined},{signal:this.signal,onProgress:this.onProgress,reverse:async(state,{iteration})=>{
    await this.acquireCpu();try{
     checkAbort(this.signal);const sequence=++record.sequence,reply=new Promise((resolve,reject)=>record.reverse={sequence,resolve,reject});
     try{this.post({gpuPm:{id,kind:'reverse',sequence,iteration,state}},[state.buffer]);}catch(error){record.reverse=null;throw error;}
     return await reply;
    }finally{await this.releaseCpu();}
   }});
  }catch(error){failed=true;primary=error;}
  packet.first=null;packet.second=null;packet.mask=null;packet.activeIndices=null;
  // Returned before resuming descriptor/coherence CPU work, whether the GPU
  // completed, declined admission or raised an observable public error.
  try{await this.acquireCpu();}catch(error){if(failed)attachGpuCleanup(primary,error);else{failed=true;primary=error;}}
  try{
   checkAbort(this.signal);
   if(failed){if(this.provider.mayFallback(primary))this.post({gpuPm:{id,kind:'done',field:null,reason:primary.code}});else if(this.onFailure)this.onFailure(primary);else this.post({gpuPm:{id,kind:'error',error:serializeEngineError(primary)}});}
   else{const targets=result.targets,distancesSquared=result.distancesSquared;this.post({gpuPm:{id,kind:'done',field:{width,height,targets,distancesSquared,comparisons:result.comparisons,execution:{...result.metrics,nativeReverseScoreReuse:packet.reverseScoreReuse===true,nativeReverseHeapCapacityBytes:packet.heapBytes}}}},[targets.buffer,distancesSquared.buffer]);}
  }finally{
   if(result)try{await result.release();}catch(error){if(failed)attachGpuCleanup(primary,error);else throw error;}
  }
 }
 abort(error=new EngineError('CANCELLED','Dense GPU broker cancelled')){const reverse=this.active?.reverse;if(reverse){this.active.reverse=null;reverse.reject(error);}}
 async settle(){await Promise.all([...this.tasks]);}
 async retireInputs(record){
  if(record.inputRetirement)return record.inputRetirement;
  const task=this.retireInputsNow(record);record.inputRetirement=task;try{return await task;}finally{if(record.inputRetirement===task)record.inputRetirement=null;}
 }
 async retireInputsNow(record){
  if(!record.retired&&!this.terminated)return;
  for(const entry of [...record.inputBackings]){const bytes=await entry.backing?.();if(bytes!==0)this.budget.notifyBackingRelease?.('array-buffer',bytes??entry.bytes);record.inputBackings.delete(entry);}
  if(record.nativeBacking){await record.nativeBacking();record.nativeBacking=null;if(record.nativeBytes)this.budget.notifyBackingRelease?.('wasm',record.nativeBytes);record.nativeBytes=0;}
  if(record.extraFree){await record.extraFree();record.extraFree=null;}
  if(record.jobGate){await record.jobGate();record.jobGate=null;}
  this.unregister?.();this.unregister=null;
 }
 async dispose({workerTerminated=false,retireProvider=true}={}){
  this.closed=true;this.terminated=workerTerminated;this.abort();const tasks=await Promise.allSettled([...this.tasks]);let failed=false,primary;for(const task of tasks)if(task.status==='rejected'&&!failed){failed=true;primary=task.reason;}
  if(retireProvider)try{await this.provider?.dispose();}catch(error){if(failed)attachGpuCleanup(primary,error);else{failed=true;primary=error;}}
  if(this.active)try{await this.retireInputs(this.active);}catch(error){if(failed)attachGpuCleanup(primary,error);else{failed=true;primary=error;}}
  if(failed)throw primary;
 }
}
