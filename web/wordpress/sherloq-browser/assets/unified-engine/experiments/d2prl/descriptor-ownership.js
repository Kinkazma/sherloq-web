import {checkAbort,controlCheckpoint,requireValue} from '../../src/errors.js';

const descriptors=new WeakMap();

function live(view,entry){
 requireValue(entry.active,'Released descriptor lease');
 requireValue(view.buffer===entry.buffer&&view.byteOffset===entry.byteOffset&&view.byteLength===entry.byteLength&&view.length===entry.length,'Descriptor lease extent changed');
 return entry.lease;
}

// Publish only after the producer's final write. The owner must revoke before
// returning the allocation to its arena, and must not write through any alias
// during this lifetime. Wasm provenance alone does not establish this contract.
function publish(view,funding=null){
 requireValue(view instanceof Uint16Array&&view.length>0,'Half descriptor publication required');
 requireValue(!(typeof SharedArrayBuffer==='function'&&view.buffer instanceof SharedArrayBuffer),'Mutable shared descriptors cannot be published');
 requireValue(!descriptors.has(view),'Descriptor view was already published');
 const entry={active:true,buffer:view.buffer,byteOffset:view.byteOffset,byteLength:view.byteLength,length:view.length,lease:Object.freeze({}),validated:false,pending:null,funding};
 descriptors.set(view,entry);
 return()=>{entry.active=false;entry.validated=false;retireFunding(entry);};
}

export function publishD2prlDescriptor(view){return publish(view);}

// Only a bank's existing, separately reserved allocation is eligible. Exact
// view and budget identity stay in the existing opaque publication registry.
export function publishD2prlBankDescriptor(view,owned,budget){
 requireValue(budget?.reserve&&owned?.data===view&&typeof owned.release==='function','An exact funded bank allocation is required');
 return publish(view,{budget,owned,borrowers:new Set()});
}
function retireFunding(entry,lastBorrower){
 const funding=entry.funding;if(!funding||entry.active||funding.borrowers.size>(lastBorrower?1:0)||!funding.owned)return;
 const ack=funding.owned.release();requireValue(!(ack&&typeof ack.then==='function'),'Owned bank allocation retirement must be synchronous');if(ack===0||ack===false)throw ack;funding.owned=null;
}
export function borrowD2prlDescriptorFunding(view,budget){
 const entry=descriptors.get(view);if(!entry)return null;live(view,entry);
 const funding=entry.funding;if(!funding||funding.budget!==budget)return null;
 requireValue(funding.owned?.data===view,'Funded bank allocation changed');
 let held=true;const loan=Object.freeze({byteLength:entry.byteLength,release(){if(!held)return;retireFunding(entry,loan);funding.borrowers.delete(loan);held=false;}});
 funding.borrowers.add(loan);return loan;
}

// Unpublished external views have no reusable identity. Keep inactive entries
// so a stale arena view cannot silently become an ordinary external input.
export function getD2prlDescriptorLease(view){
 const entry=descriptors.get(view);return entry?live(view,entry):null;
}

async function scan(view,{signal,entry}){
 checkAbort(signal);if(entry)live(view,entry);let stamp=performance.now();
 for(let i=0;i<view.length;i++){
  requireValue((view[i]&0x7c00)!==0x7c00,'Nonfinite descriptor');
  if((i&8191)===0){checkAbort(signal);if(entry)live(view,entry);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}
 }
 checkAbort(signal);if(entry)live(view,entry);
}

function awaitValidation(pending,signal){
 checkAbort(signal);if(!signal)return pending;
 return new Promise((resolve,reject)=>{
  const abort=()=>{cleanup();try{checkAbort(signal);}catch(error){reject(error);}};
  const cleanup=()=>signal.removeEventListener('abort',abort);
  signal.addEventListener('abort',abort,{once:true});
  pending.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  if(signal.aborted)abort();
 });
}

export async function validateD2prlDescriptor(view,{signal}={}){
 requireValue(view instanceof Uint16Array,'Half descriptors required');checkAbort(signal);
 const entry=descriptors.get(view),lease=entry?live(view,entry):null;
 if(!entry){await scan(view,{signal});return{lease:null,elementsScanned:view.length};}
 if(entry.validated)return{lease,elementsScanned:0};
 let elementsScanned=0;
 if(!entry.pending){
  elementsScanned=view.length;
  const pending=scan(view,{signal,entry}).then(()=>{checkAbort(signal);live(view,entry);entry.validated=true;});
  entry.pending=pending;
  // Rejection/cancellation never poisons the lifetime's validation state.
  pending.then(()=>{if(entry.pending===pending)entry.pending=null;},()=>{if(entry.pending===pending)entry.pending=null;});
 }
 await awaitValidation(entry.pending,signal);checkAbort(signal);live(view,entry);
 return{lease,elementsScanned};
}
