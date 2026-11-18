// Optional commands stay with the concrete ELA worker that owns their source.
// Cancellation settles only after its ordinary terminal worker acknowledgement.
export function visiblePreviewRPC({worker,currentWorker,pending,nextId,options},action,payload,{signal}={}){
 if(!worker||currentWorker()!==worker)return Promise.resolve({prepared:false,parked:true,reason:'worker-retired'});
 if(signal?.aborted)return Promise.reject(Object.assign(Error('Cancelled'),{code:'CANCELLED'}));
 return new Promise((resolve,reject)=>{
  const id=nextId(),finish=callback=>value=>{signal?.removeEventListener('abort',abort);callback(value);};
  const abort=()=>{const entry=pending.get(id);if(entry&&!entry.cancelRequested){entry.cancelRequested=true;try{worker.postMessage({id,action:'cancel-preview'});}catch{/* A terminated worker is settled by its owner. */}}};
  pending.set(id,{resolve:finish(resolve),reject:finish(reject),action,provisionalPreview:action==='prepare-visible-preview',chunkSequence:0,chunkBusy:false});
  signal?.addEventListener('abort',abort,{once:true});
  try{worker.postMessage({id,action,payload,options:options()});}catch(error){pending.delete(id);finish(reject)(error);}
 });
}
