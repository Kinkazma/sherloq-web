import {withDownloadCleanupFailure} from './download-manager.js';
const PARENT_SCOPE=Symbol('export-sink-retirement');
const failure=(code,message)=>Object.assign(Error(message),{code});
// Instance-local ownership. Failed/unaccepted children retire before inputs.
// A finished borrowed backing moves only after its new owner admits all bytes;
// that transfer retires copied producer inputs without deleting the file.
export function createExportSinkScope(){
 const jobs=new Set();let closing=false,disposal;
 function begin(){
  if(closing)throw failure('EXPORT_OWNER_CLOSED','Export ownership is closing.');
  if([...jobs].some(job=>job.failed))throw failure('EXPORT_CLEANUP_PENDING','Retry the previous export cleanup before creating another file.');
  const children=new Map(),dependents=[],waiters=new Set();let task,failed=false,borrowed=false,settled=false,resolveSettled,resolveClosed,lastFailure,adoptionTask,previousAdoption;
  const ended=new Promise(resolve=>resolveSettled=resolve),closed=new Promise(resolve=>resolveClosed=resolve);
  const stage=action=>({done:false,task:null,failed:false,action});
  const run=entry=>{if(!entry||entry.done)return Promise.resolve();if(entry.task)return entry.task;return entry.task=Promise.resolve().then(entry.action).then(()=>{entry.done=true;entry.failed=false;entry.action=null;},error=>{entry.failed=true;failed=true;throw error;});};
  const adopt=owner=>{if(!owner||typeof owner.abort!=='function')throw TypeError('An export sink owner with abort is required.');if(!children.has(owner))children.set(owner,stage(()=>owner.abort()));return owner;};
  const complete=()=>{if(!settled){settled=true;resolveSettled();}};
  const notify=(error,rejected)=>{for(const waiter of waiters)waiter[rejected?'reject':'resolve'](error);waiters.clear();};
  const waitForRetirement=()=>failed?Promise.reject(lastFailure):new Promise((resolve,reject)=>{if(!jobs.has(job))resolve();else waiters.add({resolve,reject});});
  const detached=()=>{failed=false;jobs.delete(job);resolveClosed();notify();};
  const retire=()=>task??=(async()=>{await ended;if(adoptionTask)await adoptionTask.catch(()=>{});for(const entry of children.values())await run(entry);for(const entry of dependents)await run(entry);detached();})().catch(error=>{failed=true;lastFailure=error;notify(error,true);throw error;});
  const retry=()=>{if(failed){for(const entry of [...children.values(),...dependents])if(entry.failed){entry.task=null;entry.failed=false;}task=null;failed=false;}return retire();};
  // A finished file can leave its producer only after its new owner has
  // admitted the complete backing. This ACK retires copied inputs, not the file.
  const adoptPreparedFile=(receipt,bytes)=>{
   if(receipt?.schema!=='sherloq.prepared-file-adoption/1'||receipt.bytes!==bytes||!Number.isSafeInteger(bytes)||bytes<0||!['memory','opfs','indexeddb'].includes(receipt.storage)||receipt.backingOwned!==true||!Number.isSafeInteger(receipt.memoryCreditBytes)||receipt.memoryCreditBytes<0||(receipt.storage==='memory'&&receipt.memoryCreditBytes<bytes))return Promise.reject(failure('EXPORT_ADOPTION_INVALID','The prepared file requires a complete admitted backing.'));
   if(!jobs.has(job))return Promise.resolve();
   if(task)return Promise.reject(failure('EXPORT_OWNER_CLOSED','Export file cleanup has already started.'));
   if(failed)return Promise.reject(lastFailure);
   return adoptionTask??=(async()=>{await ended;if(previousAdoption&&!previousAdoption.task){const callback=previousAdoption.action;previousAdoption.action=()=>callback(receipt);}await run(previousAdoption);for(const entry of dependents)await run(entry);detached();})().catch(error=>{failed=true;lastFailure=error;notify(error,true);throw error;});
  };
  const job={adopt,complete,after(action){dependents.push(stage(action));},async open(factory,options){const owner=await factory({...options,onOwner:adopt});adopt(owner);await owner.ready?.();return owner;},finish(owner,artifact){const entry=children.get(owner);if(!entry)throw TypeError('Export artifact has no adopted sink.');entry.action=()=>artifact.cleanup?.();return artifact;},retireChild:owner=>run(children.get(owner)),retire,retry,closed,waitForRetirement,get failed(){return failed;},get borrowed(){return borrowed;},borrow(artifact){if(closing||task)throw failure('EXPORT_OWNER_CLOSED','Export ownership closed before its file could be transferred.');borrowed=true;complete();previousAdoption=typeof artifact.adoptPreparedFile==='function'?stage(receipt=>artifact.adoptPreparedFile(receipt)):null;const accept=receipt=>adoptPreparedFile(receipt,artifact.blob.size);return {...artifact,cleanup:retry,adoptPreparedFile:accept};},async fail(primary){complete();try{await retire();}catch(secondary){throw withDownloadCleanupFailure(primary,secondary,{exportCleanupPending:true});}throw primary;}};
  jobs.add(job);return job;
 }
 async function retryFailed(){for(const job of [...jobs])if(job.failed)await job.retry();}
 async function drainActive(){for(const job of [...jobs])if(!job.borrowed||job.failed)await job.retry();}
 async function drain(){for(const job of [...jobs]){if(job.borrowed&&!job.failed)await job.waitForRetirement();else await job.retry();}}
 function dispose(){if(disposal)return disposal;closing=true;return disposal=drain().catch(error=>{disposal=null;throw error;});}
 return {begin,retryFailed,drain,drainActive,dispose,get pending(){return jobs.size;},get failed(){return [...jobs].some(job=>job.failed);}};
}
// Stateless exports attach to their existing artifact-store owner. There is no
// process-wide orphan registry and clear/dispose cannot overtake an export ACK.
export function exportSinkScopeFor(parent){
 if(!parent||(typeof parent!=='object'&&typeof parent!=='function'))throw TypeError('An export parent owner is required.');
 if(parent[PARENT_SCOPE])return parent[PARENT_SCOPE];
 const scope=createExportSinkScope();Object.defineProperty(parent,PARENT_SCOPE,{value:scope});
 for(const name of ['clear','dispose'])if(typeof parent[name]==='function'){
  const original=parent[name];let complete=false,task;
  parent[name]=function(...args){if(name==='dispose'&&complete)return Promise.resolve();if(task)return task;return task=(async()=>{await(name==='dispose'?scope.dispose():scope.drain());const value=await original.apply(this,args);complete=true;return value;})().finally(()=>{task=null;});};
 }
 Object.defineProperty(parent,'retireExportSinks',{value:()=>scope.retryFailed(),configurable:true});return scope;
}
