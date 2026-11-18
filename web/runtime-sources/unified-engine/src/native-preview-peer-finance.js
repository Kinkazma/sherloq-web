import "../../runtime-context.js?v=0.33.2";
import {EngineError,requireValue} from './errors.js';

// Private local entry point. This Symbol and the returned functions never go
// into worker packets, saved sessions, scientific params or public descriptors.
export const NATIVE_PREVIEW_FINANCE=Symbol('native-preview-finance');
export const NATIVE_PREVIEW_PRESENTATIONS=Symbol('native-preview-presentations');
// One canonical module owns these local capabilities across packaged engine
// clients and UI modules. Nothing here is persisted, cloned or sent to workers.
let issuedBackings,answers;
export function registerNativePreviewBacking(value){(issuedBackings??=new WeakSet()).add(value);return value;}
export function isNativePreviewBacking(value){return !!value&&issuedBackings?.has(value)===true;}
export function nativePreviewAnswerRecord(answer){return answer?.pixels?.data instanceof Uint8Array?answers?.get(answer.pixels.data.buffer):null;}
export function registerNativePreviewAnswer(answer,row){const data=answer?.pixels?.data;answers??=new WeakMap();requireValue(data instanceof Uint8Array&&!answers.has(data.buffer),'One locally owned native frame backing is required.');answers.set(data.buffer,row);}

const ack=async fn=>{const value=await fn();if(value===false||value===0)throw value;return value;};
async function certificateFor(group){const certificate=await(typeof group.certificate==='function'?group.certificate():group.certificate);
 requireValue(certificate?.terminated===true&&['node-worker-exit','browser-terminate-requested'].includes(certificate.kind),'Captured parent retirement is not certified.');return certificate;
}

// The closure retains the exact peer after its caller has replaced its current
// worker variable. A refused termination can be retried without fabricating ACK.
export function capturedNativePreviewTermination(peer){
 let certificate,flight;
 return()=>{if(certificate)return Promise.resolve(certificate);if(flight)return flight;
  const task=(async()=>{const done=peer?.done,hasExit=!!done&&typeof done.then==='function',reply=await peer.terminate();
   if(reply===false||reply===0&&!hasExit)throw reply;
   if(hasExit)await done;
   certificate=Object.freeze({terminated:true,kind:hasExit?'node-worker-exit':'browser-terminate-requested'});return certificate;
  })();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;
 };
}

/** Reuses reserve/releaseExternalMemory messages. Admission and retirement
 * target the exact captured peer; the injected adapter must never ensure a new
 * peer for a release. This registry is created lazily by the private entry. */
export function createNativePreviewFinanceRegistry({admit,releaseCaptured,isPeerCurrent}={}){
 requireValue([admit,releaseCaptured,isPeerCurrent].every(v=>typeof v==='function'),'A captured external-memory adapter is required.');
 const groups=new Set(),byFinance=new WeakMap(),frameHooks=new WeakMap(),issuedFrames=new WeakSet();
 function create({binding,onRetireLocal,onOwner,schedule,peer}={}){
  requireValue(binding&&typeof binding.sourceSha256==='string'&&typeof onRetireLocal==='function'&&typeof onOwner==='function','An adopted native presentation owner is required.');
  binding=Object.freeze({imageId:binding.imageId,surfaceId:binding.surfaceId,revision:binding.revision,sourceSha256:binding.sourceSha256});
  requireValue(schedule===undefined||typeof schedule==='function','Native presentation scheduling must be local.');
  const queued=schedule??(work=>work()),queueController=schedule?new AbortController():null;
  const retiredLeases=new WeakSet(),group={binding,peer:peer??null,leases:new Map(),admissions:new Set(),closing:false,closed:false,drain:null,certificate:null};
  const finance={
   reserve(request){
    if(group.closing||group.closed)return Promise.reject(new EngineError('DISPOSED','Native presentation finance is retiring.'));
    const task=(async()=>{
     const result=await queued(()=>{
      if(group.closing||group.closed)throw new EngineError('DISPOSED','Native presentation finance is retiring.');
      return admit(request,{peer:group.peer,group,onPeer:peer=>{requireValue(peer&&(!group.peer||peer===group.peer),'A native presentation cannot change its budget peer.');group.peer=peer;}});
     },{signal:queueController?.signal,kind:'admit'});
     // Adopt the receipt before validating its contents. A malformed reply can
     // still represent a real parent reservation which must remain reachable.
     const lease=result?.lease??result;if(lease&&typeof lease==='object')group.leases.set(lease,{lease,retiring:null});
     requireValue(lease&&typeof lease.id==='string'&&lease.id.length>0&&lease.bytes===request.bytes,'Invalid captured native memory receipt.');
     return lease;
    })();group.admissions.add(task);void task.finally(()=>group.admissions.delete(task)).catch(()=>{});return task;
   },
   release(lease){
    const row=group.leases.get(lease);if(!row)return retiredLeases.has(lease)?Promise.resolve():Promise.reject(new EngineError('LEASE_NOT_ADOPTED','This native receipt was not adopted by the captured owner.'));
    if(row.retiring)return row.retiring;
    const task=(async()=>{
     if(group.certificate){
      await certificateFor(group);
     }else{
      if(!isPeerCurrent(group.peer))throw new EngineError('WORKER_RETIRED','The captured budget peer is unavailable without a retirement certificate.');
      try{await queued(()=>ack(()=>releaseCaptured(lease,group.peer,group)),{signal:queueController?.signal,kind:'release'});}
      catch(primary){
       // A reset can settle a lost release response. Only the captured peer's
       // real retirement certificate can complete that uncertain old receipt.
       if(!group.certificate)throw primary;await certificateFor(group);
      }
     }
     group.leases.delete(lease);retiredLeases.add(lease);
    })();row.retiring=task;void task.finally(()=>{if(row.retiring===task)row.retiring=null;}).catch(()=>{});return task;
   },
   bindFrame(frame){
    requireValue(!group.closing&&!group.closed&&group.leases.size>0&&frame&&typeof frame.adoptPixels==='function'&&!issuedFrames.has(frame)
     &&frame.binding?.imageId===binding.imageId&&frame.binding?.sourceSha256===binding.sourceSha256&&frame.binding?.surfaceId===binding.surfaceId&&frame.binding?.revision===binding.revision,'A financed frame of the captured source is required.');
    const hook=Object.freeze({});issuedFrames.add(frame);frameHooks.set(hook,{group,frame});return hook;
   },
   dispose(){return group.resumePeer?group.resumePeer().then(()=>owner.dispose()):owner.dispose();}
  };
  const owner={
   dispose(){if(group.closed)return Promise.resolve();if(group.drain)return group.drain;group.closing=true;
    const task=(async()=>{
     await Promise.allSettled([...group.admissions]);
     await ack(()=>onRetireLocal());
     requireValue(group.leases.size===0,'Native backing owner has not retired all parent receipts.');
     group.closed=true;groups.delete(group);
    })();group.drain=task;void task.finally(()=>{if(group.drain===task)group.drain=null;}).catch(()=>{});return task;
   }
  };group.owner=owner;group.queueController=queueController;groups.add(group);byFinance.set(finance,group);
  try{const adopted=onOwner(owner);if(adopted&&typeof adopted.then==='function')void Promise.resolve(adopted).catch(()=>{});
   requireValue(adopted!==false&&adopted!==0&&!(adopted&&typeof adopted.then==='function'),'Captured finance registration must be synchronous.');
  }catch(error){groups.delete(group);byFinance.delete(finance);group.closed=true;throw error;}
  return Object.freeze(finance);
 }
 return {
  create,
  hook(value){
   const captured=value&&frameHooks.get(value);if(!captured)return;
   // One admitted frame has one captured producer. Consume locally before call
   // can ensure or send; a dead or previously submitted hook cannot be replayed.
   frameHooks.delete(value);const {group,frame}=captured;let state;
   try{state=frame.state;}catch{return;}
   if(!groups.has(group)||group.closing||group.closed||!group.leases.size||!group.peer||!isPeerCurrent(group.peer)
    ||!state||state.retired||state.closing||state.adopted||state.presentationClosed||state.rgbOwned)return;
   return captured;
  },
  owns(value){return !!value&&byFinance.has(value);},
  ownsGroup(value){return groups.has(value);},
  hasPeer(peer){return [...groups].some(g=>g.peer===peer&&!g.closed);},
  async closePeer(peer){let failed=false,primary;for(const group of [...groups])if(group.peer===peer)try{await group.owner.dispose();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;},
  async closeAll(){let failed=false,primary;for(const group of [...groups])try{if(group.resumePeer)await group.resumePeer();else await group.owner.dispose();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;},
  peerRetiring(peer,{certificate,resume}={}){
   // Called only after the transport has rejected the affected native
   // producers. The certificate's production must not await their local pool.
   if(typeof certificate!=='function')void Promise.resolve(certificate).catch(()=>{});
   for(const group of groups)if(group.peer===peer){group.closing=true;group.certificate=certificate;group.resumePeer=resume;group.queueController?.abort();}
   return this.closePeer(peer);
  },
  get size(){return groups.size;}
 };
}
