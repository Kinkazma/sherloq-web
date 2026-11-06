import {EngineError,requireValue} from './errors.js';
// Local cleanup owners, never scientific caches or RPC payloads. Optional-budget
// legacy callers remain keyed by the exact image object, without a fake Budget.
export const FILE_GRAY_OWNER_BYTES=512,FILE_GRAY_READ_BYTES=64;
const budgetOwners=new WeakMap(),imageOwners=new WeakMap(),drainStates=new WeakMap();
const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
function selected(budget,image){requireValue(object(budget??image),'A file-gray ownership key is required.');return{map:budget?budgetOwners:imageOwners,key:budget??image};}
function appendCleanup(primary,cleanup){try{if(primary&&typeof primary==='object'&&Object.isExtensible(primary)){const old=primary.cleanupErrors;primary.cleanupErrors=[...(Array.isArray(old)?old:[]),cleanup];}}catch{}}
export function ownFileGrayCleanup(image,{budget,cleanup}={}){
 requireValue(typeof cleanup==='function','A file-gray cleanup callback is required.');let {map,key}=selected(budget,image),release=budget?.reserve(FILE_GRAY_OWNER_BYTES);let owners=map.get(key);if(!owners)map.set(key,owners=new Set());
 const reads=new Set();let pending=null,closed=false,requested=false,failed=false,failure,hasPrimary=false,primary;
 const owner={get requested(){return requested;},get pending(){return !!pending;},get failed(){return failed;},get failure(){return failure;},get hasPrimary(){return hasPrimary;},get primary(){return primary;},get closed(){return closed;},image,
  retire(){if(closed)return pending??Promise.resolve();requested=true;const drain=drainStates.get(owners);if(drain?.attempts.has(owner))return drain.attempts.get(owner);if(pending){drain?.attempts.set(owner,pending);return pending;}const task=Promise.resolve().then(async()=>{await Promise.allSettled(reads);await cleanup();}).then(()=>{release?.();closed=true;owners.delete(owner);if(!owners.size)map.delete(key);owner.image=null;image=null;cleanup=null;owners=null;map=null;key=null;release=null;budget=null;failure=undefined;primary=undefined;hasPrimary=false;},error=>{failed=true;failure=error;throw error;});pending=task;drain?.attempts.set(owner,task);void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;},
  async fail(error){hasPrimary=true;primary=error;try{await owner.retire();}catch(cleanupError){appendCleanup(error,cleanupError);}throw error;},
  assertReadable(){if(requested)throw new EngineError('DISPOSED','The native file-gray owner is closing.');},
  read(work){owner.assertReadable();const releaseRead=budget?.reserve(FILE_GRAY_READ_BYTES);let task;try{task=Promise.resolve(work());}catch(error){releaseRead?.();throw error;}const tracked=task.finally(()=>{reads.delete(tracked);releaseRead?.();});reads.add(tracked);return tracked;}

 };owners.add(owner);return owner;
}
export function hasPendingFileGrayOwners(budget,{image}={}){const{map,key}=selected(budget,image);for(const owner of map.get(key)??[])if(owner.requested)return true;return false;}
export function retireFileGrayOwners(budget,{image,pendingOnly=false}={}){
 const{map,key}=selected(budget,image),owners=map.get(key);if(!owners)return Promise.resolve();const active=drainStates.get(owners);if(active){if(pendingOnly||!active.pendingOnly)return active.task;return active.task.then(()=>retireFileGrayOwners(budget,{image,pendingOnly:false}));}
 // A nested outer->child retirement is the child's attempt for this whole
 // explicit drain. Retain its settled promise so Set traversal cannot retry it.
 const state={attempts:new WeakMap(),pendingOnly,task:null};drainStates.set(owners,state);
 const task=Promise.resolve().then(async()=>{let failed=false,primary;for(const owner of owners){if(pendingOnly&&!owner.requested)continue;try{await owner.retire();}catch(error){if(!failed){failed=true;primary=error;}else if(error!==primary)appendCleanup(primary,error);}}if(failed)throw primary;});state.task=task;
 void task.finally(()=>{if(drainStates.get(owners)===state)drainStates.delete(owners);}).catch(()=>{});return task;
}
// Counts only: no copied resource list or unfinanced scientific payload.
export function fileGrayOwnershipSnapshot(budget,{image}={}){const{map,key}=selected(budget,image);let owners=0,pending=0,requested=0,failed=0;for(const owner of map.get(key)??[]){owners++;pending+=+owner.pending;requested+=+owner.requested;failed+=+owner.failed;}return Object.freeze({owners,pending,requested,failed,metadataBytes:budget?owners*FILE_GRAY_OWNER_BYTES:null,scope:budget?'budget':'legacy-image'});}
