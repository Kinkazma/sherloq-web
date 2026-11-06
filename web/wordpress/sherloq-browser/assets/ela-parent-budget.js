import {EngineError} from './unified-engine/src/errors.js';
import {recompressionCodecWorkspace} from './unified-engine/src/recompression-codec-client.js';
const MiB=1024**2,GiB=1024**3;
export const ELA_PARENT_BUDGET_SCHEMA='sherloq.ela-parent-budget/1';
// An envelope, not an allocation or a source-size limit. Core still admits each
// actual owner and the codec keeps its own physical Wasm32 limit. The additional
// 32N+64MiB funds duplicated Source, resident runtimes, RGB outputs and GPU work;
// the 29.49MP measured complete JXL peak fits the 3.5GiB alternative.
export function elaParentBudgetPlan({width,height,legacyEngineBytes,consumerBytes,uiReserveBytes,codec='jpeg',lossless=false,nativeWorkspaceBytes=0}){
 if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0)||![legacyEngineBytes,consumerBytes,uiReserveBytes,nativeWorkspaceBytes].every(n=>Number.isSafeInteger(n)&&n>=0))throw new EngineError('INVALID_INPUT','Invalid ELA parent budget geometry or reservations.');
 if(codec==='jpeg'&&nativeWorkspaceBytes<=legacyEngineBytes)return null;
 const workspace=codec==='jpeg'?{workingBytes:0}:recompressionCodecWorkspace({width,height},{codec,lossless});
 // Ask only when the selected codec or a declared complete native workspace
 // needs more than the historical envelope. Never price JXL for another codec.
 const requiredNativeBytes=Math.max(workspace.workingBytes+width*height*7,nativeWorkspaceBytes);
 if(requiredNativeBytes<=legacyEngineBytes)return null;
 // An authoritative complete native live-set already includes its Source,
 // matrix and simultaneous frame/heap work. Do not price those owners twice.
 const minimumNativeBytes=Math.ceil(Math.max(codec==='jpeg'?0:workspace.workingBytes+width*height*32+64*MiB,nativeWorkspaceBytes)/MiB)*MiB;
 const engineChoices=[Math.max(4*GiB,minimumNativeBytes),Math.max(3.5*GiB,minimumNativeBytes)].filter((n,i,a)=>a.indexOf(n)===i);
 if(!Number.isSafeInteger(minimumNativeBytes)||engineChoices.some(engineBytes=>!Number.isSafeInteger(engineBytes+consumerBytes+uiReserveBytes)))throw new EngineError('INVALID_INPUT','Unsafe complete ELA parent workspace.');
 return{minimumNativeBytes,requiredNativeBytes,codecWorkspaceBytes:workspace.workingBytes,...(nativeWorkspaceBytes?{nativeWorkspaceBytes}:{}),consumerBytes,uiReserveBytes,choices:engineChoices.map(engineBytes=>({engineBytes,totalBytes:engineBytes+consumerBytes+uiReserveBytes}))};
}
// A warm financed worker can keep its exact source and caches for every
// covered control value. Source/epoch identity is checked by the existing owner.
export function elaParentBudgetCovers(grant,plan){
 if(!grant||!plan||!Number.isSafeInteger(plan.minimumNativeBytes)||plan.minimumNativeBytes<0)return false;
 try{validateElaParentGrant(grant);}catch{return false;}
 return grant.engineBytes>=plan.minimumNativeBytes&&grant.consumerBytes===plan.consumerBytes&&grant.uiReserveBytes===plan.uiReserveBytes;
}
export function validateElaParentGrant(grant){
 if(!grant||grant.schema!==ELA_PARENT_BUDGET_SCHEMA||typeof grant.id!=='string'||!grant.id||typeof grant.epoch!=='string'||!grant.epoch||typeof grant.imageId!=='string'||!grant.imageId||!/^([a-f0-9]{64})$/i.test(grant.sourceSha256??'')||![grant.width,grant.height].every(n=>Number.isSafeInteger(n)&&n>0)||![grant.engineBytes,grant.consumerBytes,grant.uiReserveBytes,grant.totalBytes].every(n=>Number.isSafeInteger(n)&&n>=0)||grant.engineBytes<32*MiB||grant.totalBytes!==grant.engineBytes+grant.consumerBytes+grant.uiReserveBytes)throw new EngineError('INVALID_INPUT','Invalid financed ELA worker envelope.');
 return grant;
}
// The credit survives failed/falsy ACKs and is returned only after all concrete
// child owners have acknowledged retirement. This owner is never reused across
// a File/source epoch or across worker instances.
export function createElaParentBudgetOwner({source,plan,isCurrent=()=>true,epoch=crypto.randomUUID()}){
 let opening,grant=null,release=null,worker=null,closing=false,closed=false,retirement,childRetired=false;
 const prepare=()=>{
  if(closing) return Promise.reject(new EngineError('CANCELLED','ELA budget owner is retiring.'));
  if(opening)return opening;
  opening=(async()=>{
   if(!plan)return null;
   if(!isCurrent()||source.isCurrent?.()===false)throw new EngineError('CANCELLED','ELA parent source changed.');
   const client=await source.getClient();
   if(!isCurrent()||source.isCurrent?.()===false)throw new EngineError('CANCELLED','ELA parent source changed.');
   const acquired=await client.reserveNativeWorkspace({choices:plan.choices,imageId:source.imageId,sourceSha256:source.hash,width:source.source.width,height:source.source.height});
   // Publish ownership before any stale/abort check: even a cancelled acquisition
   // still has a real parent debt which retire() must acknowledge.
   release=acquired.release;
   grant=validateElaParentGrant({schema:ELA_PARENT_BUDGET_SCHEMA,id:acquired.id,epoch,imageId:source.imageId,sourceSha256:source.hash,width:source.source.width,height:source.source.height,engineBytes:acquired.engineBytes,consumerBytes:plan.consumerBytes,uiReserveBytes:plan.uiReserveBytes,totalBytes:acquired.bytes});
   if(closing||!isCurrent()||source.isCurrent?.()===false)throw new EngineError('CANCELLED','ELA parent source changed.');
   return grant;
  })();const current=opening;void current.catch(()=>{if(!release&&opening===current)opening=null;});return current;
 };
 return{prepare,get grant(){return grant;},get financed(){return release!==null;},bind(value){if(worker&&worker!==value)throw new EngineError('INVALID_INPUT','ELA envelope already belongs to another worker.');worker=value;},
  retire(disposeChild){if(closed)return Promise.resolve();if(retirement)return retirement;closing=true;return retirement=(async()=>{
   // Acquisition failure is reported to its caller, but cannot skip acquired debt.
   if(opening)try{await opening;}catch{}
   if(!childRetired){await disposeChild?.(worker);childRetired=true;}
   if(release){const ack=await release();if(ack===false||ack===0)throw new EngineError('BUSY','ELA parent credit retirement was not acknowledged.');release=null;}
   grant=null;worker=null;closed=true;
  })().finally(()=>{retirement=null;});}
 };
}
// Used after the app has detached ordinary pending calls. The worker queue owns
// Core retirement; a successful reply is the ACK, not terminate(). No timeout may
// return credit while a concrete heap/storage owner is still alive.
export function disposeElaWorker(worker,{id,options}={}){
 if(!worker)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{worker.removeEventListener('message',message);worker.removeEventListener('error',failure);worker.removeEventListener('messageerror',failure);};
  const failure=event=>{cleanup();reject(new EngineError('WORKER_FAILED','ELA worker retirement was not acknowledged.',{cause:event?.error}));};
  const message=event=>{const value=event.data;if(value?.id!==id)return;if(value.error){cleanup();reject(new EngineError(value.error.code??'INTERNAL',value.error.message??'ELA worker retirement failed.',{details:value.error.details}));}else if(value.result?.disposed===true){cleanup();resolve();}};
  worker.addEventListener('message',message);worker.addEventListener('error',failure);worker.addEventListener('messageerror',failure);
  try{worker.postMessage({action:'cancel'});worker.postMessage({id,action:'dispose',options});}catch(error){cleanup();reject(error);}
 });
}
