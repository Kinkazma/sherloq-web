import {openNeuralWindowConnection,neuralWindowBridgeAvailable} from './neural-window-engine-link.js';
import {neuralWindowDomainIdentity} from './neural-window-domain-identity.js';
import {captureNeuralWindowBinding} from './neural-window-job-owner.js';
import {neuralWindowGluePlan,neuralWindowGlueContextIdentity} from './neural-window-glue-plan.js';
import {createGlueResidentContext} from './xfeat-glue-resident-context.js';
import {deserializeWorkerError} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {createGlueJobOwner} from './xfeat-glue-job-owner.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
import {SPARSE_GLUE_PAGED_MODELS} from './sparse-glue-paged-assets.js';
import {TypedPages,finishCorrespondences} from './m3-typed-pages.js';
import {sparseGlueCandidates,selectSparseGlue} from './sparse-glue-candidates.js';
import {EngineError,requireValue,checkAbort,normalizeResourceError} from './errors.js';import {verifyM3Bytes} from './m3-asset.js';
export const SPARSE_GLUE_MODELS=Object.freeze({
 xfeat:{bytes:4707762,sha256:'b9c8ef4e5f6e2e5d4899205eb5c0033529c7204fffae71c799db05c7a6be8870',weightSha256:'766102df37f11189efe5b0811d1f47c72b22629b79bfabfcfff9d2a2f84654b8'},
 aliked:{bytes:45997931,sha256:'f1a27b3203d5bbeab0e6ff13047eaa016af5d28c21d9c25d6e7d88c1c102f6a3',weightSha256:'d975e965b105311a6143194852297dff4f02aea5cc2e10cecfed966ca0e22503'},
 sift:{bytes:45998811,sha256:'5b08e8ae8524a73cfa95eb0b86597300cfa84e0b3253199e69b1c67d32eab804',weightSha256:'5b52b8d9982d43532dc042606b346bb9594c9f5a4bd6f64362c63866287b4ac0'}
});
const MiB=1024**2;
export class XfeatGlobalGlueEngine{
 constructor(budget,profile){requireValue(budget&&typeof budget.reserve==='function'&&profile&&Number.isInteger(profile.maxWorkers)&&profile.maxWorkers>0,'Sparse Glue requires a shared memory budget and worker profile.');this.budget=budget;this.resourceOwner='xfeat-glue-global';this.profile=profile;this.running=false;this.disposed=false;this.jobId=0;this.pendingOwners=new Set();this.ownedFailures=new WeakSet();this.context=null;this.contextCreations=0;this.automaticChoices=new Map();this.automaticChoiceFree=null;}
 stop(){this.controller?.abort();this.activeOwner?.cancel();this.context?.cancel();}
 async drain(){let failed=false,primary;for(const owner of [...this.pendingOwners])try{await owner.close();}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}if(!failed&&this.context?.state.poisoned)try{await this.context.close();}catch(error){failed=true;primary=error;}if(failed)throw primary;}
 dispose(){if(this.disposePromise)return this.disposePromise;this.disposed=true;this.stop();this.disposePromise=(async()=>{if(this.running)await this.matchIdle;let failed=false,primary;try{await this.drain();}catch(error){failed=true;primary=error;}try{await this.context?.close();}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}try{await this.automaticChoiceFree?.();this.automaticChoiceFree=null;this.automaticChoices.clear();}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}if(failed)throw primary;})();void this.disposePromise.catch(()=>{this.disposePromise=null;});return this.disposePromise;}
 async ownedJob(payload,{signal,threads,freeWorker,onProgress,workerBytes,windowBinding,windowPlan,contextIdentity}){
  let lease,operation,worker,context=this.context,unborrow,adopted=false,failed=false,primary,result,windowConnection;
  const markOwned=error=>{if(error&&typeof error==='object')this.ownedFailures.add(error);return error;};
  const releaseExecution=async()=>{let failed=false,primary;const attempt=async action=>{try{await action();}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}};await attempt(async()=>{if(lease){const ack=await lease.release();if(ack===false||ack===0)throw ack;lease=null;}});await attempt(async()=>{if(operation){const ack=await operation.release();if(ack===false||ack===0)throw ack;operation=null;}});if(failed)throw primary;};
  try{
   if(context)unborrow=context.borrow();
   operation=this.budget.beginOperation?.({owner:this.resourceOwner,id:'xfeat-global-glue',parent:this.resourceOperation??undefined});
   lease=await getExecutionScheduler(this.budget,{maxWorkers:this.profile.maxWorkers}).acquire({cpu:threads,gpu:payload.provider==='webgpu'?1:0,signal,label:'xfeat-global-glue',resourceOwner:this.resourceOwner,operation:operation??undefined});
   checkAbort(signal);if(this.disposed)throw new EngineError('CANCELLED','Sparse Glue disposed.');
   if(!context){
    if(windowPlan)windowConnection=await openNeuralWindowConnection(this.budget,{binding:windowBinding,...windowPlan,delegate:true,onOwner:owner=>{windowConnection=owner;}});
    try{worker=new Worker(new URL('./xfeat-glue-global-worker.js',import.meta.url),{type:'module'});}catch(error){throw markOwned(error);}
    context=createGlueResidentContext({worker,releaseMemory:freeWorker,budget:this.budget,pendingOwners:this.pendingOwners,admittedBytes:workerBytes,identity:contextIdentity??JSON.stringify([payload.provider,payload.maximumHeapBytes,threads]),windowIdentity:!!windowPlan,beforeTerminate:()=>windowConnection?.close(),onRuntimeError:markOwned,onClosed:entry=>{this.lastContextRetirement=entry.state;if(this.context===entry)this.context=null;}});this.context=context;this.contextCreations++;unborrow=context.borrow();
    if(windowPlan){windowConnection.forwardTo(worker);worker.postMessage({glueWindow:{port:windowConnection.port,nonce:windowConnection.nonce,binding:windowConnection.binding,localBudgetBytes:64*MiB,gpuWorkingBytes:windowPlan.memoryPlan.gpuWorkingBytes,maximumJobBytes:windowPlan.maximumJobBytes}},[windowConnection.port]);}
   }
   result=await context.run(payload,{id:++this.jobId,signal,onProgress,releaseExecution,onOwner:()=>{adopted=true;}});
  }catch(error){failed=true;primary=error;}
  finally{
   unborrow?.();
   if(!adopted){
    const owner=createGlueJobOwner({worker:{postMessage:()=>{},terminate:()=>context?undefined:worker?.terminate()},id:++this.jobId,releaseMemory:context?undefined:async()=>{await windowConnection?.close();return freeWorker?.();},releaseExecution,onClosed:entry=>this.pendingOwners.delete(entry)});this.pendingOwners.add(owner);owner.transportFailure(primary);try{await owner.close();}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}if(context&&!context.state.everPosted)try{await context.close();}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}
   }
  }
  if(failed)throw primary;return result;
 }
 async match(settings,{kind='xfeat',model,backend='auto',imageSize,signal,onProgress,reserveMemory,windowSource}={}){
  const identity=SPARSE_GLUE_PAGED_MODELS[kind],paged=!!identity&&model?.sha256===identity.sha256,{points,descriptors,members,zoneCount,descriptorSize,compare=false,radius,minimum,threshold}=settings;
  requireValue(!this.disposed&&!this.running&&typeof Worker!=='undefined'&&identity&&['auto','cpu','webgpu'].includes(backend),'Sparse Glue unavailable or busy.');
  requireValue(model?.data instanceof Uint8Array&&model.sha256===identity.sha256&&typeof reserveMemory==='function','Pinned sparse Glue graph and result memory admission required.');
  requireValue(points instanceof Float64Array&&points.length%7===0&&points.every(Number.isFinite)&&descriptors instanceof Float32Array&&descriptors.every(Number.isFinite)&&descriptorSize===(kind==='xfeat'?64:128)&&descriptors.length===points.length/7*descriptorSize,'Invalid learned points or descriptors.');
  requireValue(Number.isInteger(zoneCount)&&zoneCount>0&&members instanceof Uint8Array&&members.length===points.length/7*zoneCount&&members.every(x=>x<2)&&(!compare||zoneCount===2),'Invalid learned memberships.');
  requireValue(Number.isFinite(radius)&&radius>0&&Number.isFinite(minimum)&&minimum>=0&&minimum<=radius&&Number.isFinite(threshold)&&threshold>0&&threshold<=1&&Array.isArray(imageSize)&&imageSize.length===2&&imageSize.every(x=>Number.isInteger(x)&&x>0),'Invalid learned search settings.');
  requireValue(!settings.radii||settings.radii.length===zoneCount&&Array.from(settings.radii).every(x=>Number.isFinite(x)&&x>=0),'Invalid learned zone radii.');
  requireValue(!settings.gap||settings.gap.length===2&&Array.from(settings.gap).every(Number.isFinite),'Invalid comparison gap.');
  requireValue(!settings.axes||settings.axes.length===2&&settings.axes.every(a=>ArrayBuffer.isView(a)&&a.length&&a.every(Number.isFinite)),'Invalid compact axes.');
  checkAbort(signal);this.running=true;const requestSignal=signal,pendingChoices=[];let output;this.controller=new AbortController();const joined=signal?AbortSignal.any([signal,this.controller.signal]):this.controller.signal;signal=joined;const abort=()=>this.stop();let freeModel,finish,matchFailed=false,matchPrimary;this.matchIdle=new Promise(resolve=>finish=resolve);signal?.addEventListener('abort',abort,{once:true});const rows=new TypedPages(Float64Array,5,reserveMemory);
  try{
   let windowBinding;
   if(kind==='xfeat'&&backend==='webgpu'){
    if(!neuralWindowBridgeAvailable(this.budget))throw new EngineError('GPU_UNAVAILABLE','The original Glue GPU operators require the attached Window runtime.');
    requireValue(windowSource&&typeof windowSource==='object','Exact original Glue source/domain required.');const captured={...windowSource,family:'xfeat-glue-operator'};
    captured.domainFingerprint=await neuralWindowDomainIdentity(captured.domainFingerprint,{budget:this.budget,signal});windowBinding=captureNeuralWindowBinding(captured);
   }
   await this.drain();checkAbort(joined);if(this.disposed)throw new EngineError('CANCELLED','Sparse Glue disposed.');freeModel=this.budget.reserve(model.data.byteLength*2);requireValue(paged,'The global matcher requires its pinned family staged graph.');await verifyM3Bytes(model.data,identity,signal);checkAbort(signal);const runs=[],failures=[];let evaluated=0;
   for(let zone=0;zone<(compare?1:zoneCount);zone++){
    const frees=[],admit=n=>{const f=this.budget.reserve(n);frees.push(f);return f;};
    try{
     admit(points.length/7*16);const job=await sparseGlueCandidates(settings,zone,{signal,reserveMemory:admit});if(this.disposed)throw new EngineError('CANCELLED','Sparse Glue disposed.');if(!job)continue;const edges=job.edges.length/2,heads=kind==='xfeat'?1:4,dim=kind==='xfeat'?96:256;admit(edges*(paged?80:48)+(job.a.length+job.b.length)*(descriptorSize+4)*8);
     const inputs={...(!paged?{edges:{data:BigInt64Array.from(job.edges,BigInt),shape:[edges,2]}}:{}),imageSize:{data:Float32Array.from(imageSize),shape:[2]}};
     for(const [side,ids] of [[0,job.a],[1,job.b]]){const coords=new Float32Array(ids.length*2),desc=new Float32Array(ids.length*descriptorSize),so=new Float32Array(ids.length*2);for(let i=0;i<ids.length;i++){coords.set(points.subarray(ids[i]*7,ids[i]*7+2),i*2);desc.set(descriptors.subarray(ids[i]*descriptorSize,(ids[i]+1)*descriptorSize),i*descriptorSize);so.set([points[ids[i]*7+2],points[ids[i]*7+3]*(Math.PI/180)],i*2);}inputs['keypoints'+side]={data:coords,shape:[ids.length,2]};inputs['descriptors'+side]={data:desc,shape:[ids.length,descriptorSize]};inputs['scaleOri'+side]={data:so,shape:[ids.length,2]};}
     const choiceKey=JSON.stringify([model.sha256,job.a.length,job.b.length,edges,Math.min(8,this.profile.maxWorkers),!!globalThis.crossOriginIsolated]);let cachedChoice=backend==='auto'?this.automaticChoices.get(choiceKey):null,fallbackChoice;let provider=backend==='webgpu'?'webgpu':'wasm',maximumHeapBytes=paged?512*MiB:Math.min(2048*MiB,Math.ceil((128*MiB+identity.bytes*4+edges*heads*64+Math.max(job.a.length,job.b.length)*heads*128*20+(job.a.length+job.b.length)*dim*64)/(64*MiB))*64*MiB),attempts=0;
     for(;;){
      checkAbort(signal);if(this.disposed)throw new EngineError('CANCELLED','Sparse Glue disposed.');let freeWorker;const threads=globalThis.crossOriginIsolated?Math.min(8,this.profile.maxWorkers):1;const windowPlan=windowBinding&&provider==='webgpu'?neuralWindowGluePlan({maximumHeapBytes,rows:job.a.length,keys:job.b.length,heads,dim,gpuWorkingBytes:paged?512*MiB:identity.bytes*3+edges*heads*64+Math.max(job.a.length,job.b.length)*heads*128*20}):null,dualIdentity=JSON.stringify(['webgpu',maximumHeapBytes,threads]),contextIdentity=provider==='wasm'&&this.context&&(this.context.windowIdentity||this.context.identity===dualIdentity)?this.context.identity:neuralWindowGlueContextIdentity(provider,maximumHeapBytes,threads,windowBinding&&provider==='webgpu'?windowBinding:null,windowPlan?.maximumJobBytes);if(this.context&&(this.context.identity!==contextIdentity||this.context.state.poisoned||this.context.state.closed||this.context.state.closing)){await this.context.close();checkAbort(signal);}const reused=!!this.context;const attentionCpuBytes=kind==='xfeat'?0:128*MiB,gpuBytes=provider==='webgpu'?(paged?512*MiB:identity.bytes*3+edges*heads*64+Math.max(job.a.length,job.b.length)*heads*128*20):0;
      try{if(!reused){const bytes=maximumHeapBytes*(provider==='webgpu'&&kind!=='xfeat'?2:1)+gpuBytes+64*MiB+attentionCpuBytes;try{freeWorker=this.budget.reserve(bytes);}catch(error){if(error?.code!=='MEMORY_LIMIT'||!this.budget.asyncReclaimers?.size)throw error;await this.budget.reclaim(bytes,{signal,owner:this.resourceOwner});checkAbort(signal);freeWorker=this.budget.reserve(bytes);}}}catch(error){if(provider==='webgpu'&&backend==='auto'&&['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(normalizeResourceError(error)?.code)){failures.push({zone,provider,stage:'admission',code:normalizeResourceError(error).code});provider='wasm';continue;}throw error;}
      try{
       const result=await this.ownedJob({kind,autoOperators:false,callerPolicy:kind==='xfeat'?'spatial-cross-final-spatial':'native-spatial-csr',cpuStages:true,observation0:Int32Array.from(job.a),observation1:Int32Array.from(job.b),model:model.data,inputs,edges:job.edges,provider,maximumHeapBytes,threads},{signal:joined,threads,freeWorker,workerBytes:maximumHeapBytes*(provider==='webgpu'&&kind!=='xfeat'?2:1)+gpuBytes+64*MiB+attentionCpuBytes,contextIdentity,...(windowPlan?{windowBinding,windowPlan}:{}),onProgress:progress=>onProgress?.((zone+progress)/(compare?1:zoneCount))});checkAbort(joined);
       // Preserve the historical cold CSR runtime boundary. Its separate CPU
       // attention memory is not declared retired until the Worker closes.
       if(kind!=='xfeat'){await this.context?.close();checkAbort(joined);}

       if(backend==='auto'&&result.metadata.autoSelection)pendingChoices.push([choiceKey,result.metadata.autoSelection]);const selected=selectSparseGlue(job,result.confidence,threshold);for(const row of selected)rows.push(...row,job.zone);evaluated+=edges;runs.push({...result.metadata,...((cachedChoice??fallbackChoice)?{autoSelection:{winner:result.metadata.provider,recommendation:(cachedChoice??fallbackChoice).winner,reused:!!cachedChoice,probePages:0,observation:cachedChoice??fallbackChoice,cpuPages:result.metadata.provider==='wasm'?result.metadata.attentionPages:0,gpuPages:result.metadata.provider==='webgpu'?result.metadata.attentionPages:0}}:{}),zone,candidates:edges,gpuEstimatedBytes:gpuBytes});break;
      }catch(error){checkAbort(signal);if(this.disposed)throw new EngineError('CANCELLED','Sparse Glue disposed.');failures.push({zone,provider,stage:'useful-work',code:error?.code,message:error?.message});if(!this.pendingOwners.size&&(error&&typeof error==='object'&&this.ownedFailures.has(error))&&provider==='webgpu'&&backend==='auto'&&['LEARNED_INFERENCE_FAILED','WORKER_FAILED','MEMORY_LIMIT'].includes(error.code)){fallbackChoice={winner:'wasm',reason:'acknowledged-owned-gpu-failure',errorCode:error.code};pendingChoices.push([choiceKey,fallbackChoice]);cachedChoice=null;provider='wasm';attempts++;continue;}if(!this.pendingOwners.size&&(error&&typeof error==='object'&&this.ownedFailures.has(error))&&error.code==='MEMORY_LIMIT'&&maximumHeapBytes<2048*MiB&&attempts<3){maximumHeapBytes=paged?512*MiB:Math.min(2048*MiB,maximumHeapBytes*2);attempts++;continue;}throw error;}

     }
     onProgress?.((zone+1)/(compare?1:zoneCount));
    }finally{frees.forEach(f=>f());}
   }
   checkAbort(signal);if(this.disposed)throw new EngineError('CANCELLED','Sparse Glue disposed.');const {pairs,pairSearchRegions}=finishCorrespondences(rows);output={pairs,pairSearchRegions,candidateComparisons:evaluated,backend:runs.some(r=>r.provider==='webgpu')?'hybrid':'cpu',metadata:{kind,runs,failures,preflightExecutions:0}};
  }catch(error){matchFailed=true;matchPrimary=error;throw error;}finally{
   let cleanupFailed=false,cleanupPrimary;const attempt=async action=>{try{await action();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}else attachGpuCleanup(cleanupPrimary,error);}};
   try{await attempt(()=>rows.dispose());await attempt(()=>signal?.removeEventListener('abort',abort));await attempt(()=>this.stop());await attempt(()=>freeModel?.());}
   finally{this.controller=null;this.running=false;finish();}
   if(cleanupFailed){if(matchFailed)attachGpuCleanup(matchPrimary,cleanupPrimary);else throw cleanupPrimary;}
  }
  checkAbort(requestSignal);if(this.disposed)throw new EngineError('CANCELLED','Sparse Glue disposed.');for(const[key,value]of pendingChoices){requireValue(JSON.stringify([key,value]).length<=4096,'Automatic Glue observation exceeds its metadata slot.');if(!this.automaticChoiceFree)try{this.automaticChoiceFree=this.budget.reserve(8*4096);}catch(error){if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(normalizeResourceError(error)?.code))throw error;continue;}if(!this.automaticChoices.has(key)&&this.automaticChoices.size===8)this.automaticChoices.delete(this.automaticChoices.keys().next().value);this.automaticChoices.set(key,value);}return output;
 }
}
