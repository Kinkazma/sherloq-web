import {checkAbort,controlCheckpoint,createCooperator,EngineError,requireValue} from './errors.js';
import {appendWaveletCleanup} from './wavelet-strip-pool.js';

const metadataBytes=4096;

// Only SSG's admitted Native word matcher uses these endpoints. Their parent
// owns them before allocation and retains failed retirement until a real retry.
export async function ssgWordTaskCheckpoint(signal,{budget,pendingOwners},{MessageChannelCtor=globalThis.MessageChannel}={}){
 checkAbort(signal);
 requireValue(typeof pendingOwners?.add==='function'&&typeof pendingOwners?.delete==='function'&&typeof budget?.reserve==='function','SSG task checkpoint needs its parent owner and budget.');
 // Optional control metadata must not evict retained scientific work. The old
 // timer remains available with exactly the same cancellation semantics.
 if(typeof MessageChannelCtor!=='function'||!Number.isFinite(budget.limit)||typeof budget.total!=='function'||budget.limit-budget.total()<metadataBytes)return controlCheckpoint(signal);
 let retiring=false,retired=false,retirement,completion,free;
 const ports=[];
 const owner={
  get retiring(){return retiring;},
  dispose(){
   if(retired)return Promise.resolve();if(retirement)return retirement;retiring=true;
   const task=(async()=>{
    if(completion)await completion.catch(()=>{});
    let failed=false,primary;
    for(let i=0;i<ports.length;i++)if(ports[i])try{ports[i].onmessage=null;ports[i].onmessageerror=null;ports[i].close();ports[i]=null;}catch(error){if(!failed){failed=true;primary=error;}else appendWaveletCleanup(primary,error);}
    if(!ports.some(Boolean)&&free)try{await free();free=null;}catch(error){if(!failed){failed=true;primary=error;}else appendWaveletCleanup(primary,error);}
    if(!failed&&!ports.some(Boolean)&&!free){retired=true;pendingOwners.delete(owner);}
    if(failed)throw primary;
   })();retirement=task;void task.finally(()=>{if(!retired&&retirement===task)retirement=null;}).catch(()=>{});return task;
  }
 };
 pendingOwners.add(owner);let failed=false,primary;
 try{
  free=budget.reserve(metadataBytes);checkAbort(signal);
  const channel=new MessageChannelCtor();ports.push(channel.port1,channel.port2);
  completion=new Promise((resolve,reject)=>{
   try{channel.port1.onmessage=()=>resolve();channel.port1.onmessageerror=()=>reject(new EngineError('WORKER_MESSAGE_FAILED','SSG control event could not be received'));channel.port2.postMessage(0);}catch(error){reject(error);}
  });
  await completion;checkAbort(signal);
 }catch(error){failed=true;primary=error;}
 try{await owner.dispose();}catch(error){if(failed)appendWaveletCleanup(primary,error);else throw error;}
 if(failed)throw primary;
}

export function createSsgWordCooperator(signal,wordIndex){
 if(!wordIndex||typeof globalThis.MessageChannel!=='function')return createCooperator(signal);
 let next=performance.now()+8;
 return async()=>{
  checkAbort(signal);if(performance.now()<next)return;
  await ssgWordTaskCheckpoint(signal,wordIndex);next=performance.now()+8;
 };
}
