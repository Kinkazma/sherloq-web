import {checkAbort,controlCheckpoint,requireValue} from '../../src/errors.js';

const parameters=new WeakMap();
function live(view,entry){
 requireValue(entry.active,'Released parameter validation lease');
 requireValue(view.buffer===entry.buffer&&view.byteOffset===entry.byteOffset&&view.byteLength===entry.byteLength&&view.length===entry.length,'Parameter validation lease extent changed');
 return entry.lease;
}

// The parameter store publishes only after the pinned SHA has been verified.
// Its tensor owner retains the immutable bytes across borrower/cache lifetimes
// and revokes before returning the allocation to the arena or spilling it.
// A caller's new alias has no authority to reuse this validation.
export function publishD2prlParameter(view){
 requireValue(view instanceof Float32Array&&ArrayBuffer.isView(view)&&view.length>0,'Float32 parameter publication required');
 requireValue(!(typeof SharedArrayBuffer==='function'&&view.buffer instanceof SharedArrayBuffer),'Mutable shared parameters cannot be published');
 requireValue(!parameters.has(view),'Parameter view was already published');
 const entry={active:true,buffer:view.buffer,byteOffset:view.byteOffset,byteLength:view.byteLength,length:view.length,lease:Object.freeze({}),validated:false,pending:null};
 parameters.set(view,entry);
 return()=>{if(!entry.active)return;entry.active=false;entry.validated=false;};
}

export function getD2prlParameterLease(view){
 const entry=parameters.get(view);return entry?live(view,entry):null;
}

async function scan(view,{signal,message,checkpoint,entry}){
 checkAbort(signal);if(entry)live(view,entry);let stamp=performance.now();
 for(let i=0;i<view.length;i++){
  requireValue(Number.isFinite(view[i]),message);
  if((i&8191)===0){
   checkAbort(signal);if(entry)live(view,entry);
   if(checkpoint){const pending=checkpoint();if(pending?.then)await pending;}
   else if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}
  }
 }
 checkAbort(signal);if(entry)live(view,entry);
}

function awaitValidation(pending,signal){
 checkAbort(signal);if(!signal)return pending;
 return new Promise((resolve,reject)=>{
  const cleanup=()=>signal.removeEventListener('abort',abort);
  const abort=()=>{cleanup();try{checkAbort(signal);}catch(error){reject(error);}};
  signal.addEventListener('abort',abort,{once:true});
  pending.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});if(signal.aborted)abort();
 });
}

export async function validateD2prlFloat32(view,{signal,message='Nonfinite Float32 input',checkpoint}={}){
 requireValue(view instanceof Float32Array&&ArrayBuffer.isView(view),'Float32 input required');
 requireValue(typeof message==='string'&&(checkpoint===undefined||typeof checkpoint==='function'),'Float32 validation context required');checkAbort(signal);
 const entry=parameters.get(view),lease=entry?live(view,entry):null;
 if(!entry){await scan(view,{signal,message,checkpoint});return{lease:null,elementsScanned:view.length};}
 if(entry.validated)return{lease,elementsScanned:0};
 let elementsScanned=0;
 if(!entry.pending){
  elementsScanned=view.length;
  const pending=scan(view,{signal,message,checkpoint,entry}).then(()=>{checkAbort(signal);live(view,entry);entry.validated=true;});entry.pending=pending;
  pending.then(()=>{if(entry.pending===pending)entry.pending=null;},()=>{if(entry.pending===pending)entry.pending=null;});
 }
 await awaitValidation(entry.pending,signal);checkAbort(signal);live(view,entry);return{lease,elementsScanned};
}
