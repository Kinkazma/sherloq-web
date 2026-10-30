import {requiredFeatureChunks,featureStateChange,featureDeletionPlan,selectActiveFiles} from './feature-catalog.js?v=0.30.0';
import {createChunkLoader,libraryValue} from './dependency-store.js?v=0.30.0';
import {OFFLINE_CHUNKS,offlineChunkURL,readOfflineInstallation,offlineHeaders} from './offline-browser-store.js?v=0.30.0';
import {localChunkReader,updateWorkerMessage} from './local-update-core.js?v=0.30.0';
import {preferenceAccess,capturePreferenceEntry,restorePreferenceEntry} from './preferences-recovery.js?v=0.30.0';

const POLICY_KEY='sherloq.local.feature-policy';
export function createFeatureChoicePersistence({getState,access=preferenceAccess,capture=()=>capturePreferenceEntry(POLICY_KEY),restore=entry=>restorePreferenceEntry(POLICY_KEY,entry),saveServer,readServer,refreshCache=async()=>{},onRecovery=()=>{}}={}){
 return async next=>{
  const previous=getState(),entry=capture();let serverAttempted=false,serverChanged=false,cacheAttempted=false;
  const conservative=()=>({schema:'sherloq.feature-policy/1',disabledFeatures:[...new Set([...previous.disabledFeatures,...next.disabledFeatures])],disabledGroups:[...new Set([...previous.disabledGroups,...next.disabledGroups])]});
  async function rescue(error){const state=conservative();access.write(POLICY_KEY,state);await refreshCache(state).catch(()=>{});onRecovery(state);throw Object.assign(Error('Feature choices need recovery; retained resources were not deleted.',{cause:error}),{code:'FEATURE_POLICY_RECOVERY_REQUIRED'});}
  try{
   if(!access.write(POLICY_KEY,next))throw Error('Unable to preserve feature choices in browser storage');
   if(saveServer){serverAttempted=true;await saveServer(next);serverChanged=true;}
   cacheAttempted=true;await refreshCache(next);
  }catch(error){
   if(serverAttempted&&!serverChanged){try{const actual=await readServer?.();if(JSON.stringify(actual)===JSON.stringify(next))serverChanged=true;else if(JSON.stringify(actual)!==JSON.stringify(previous))return await rescue(error);}catch(reconciliation){if(reconciliation.code==='FEATURE_POLICY_RECOVERY_REQUIRED')throw reconciliation;return await rescue(error);}}
   if(serverChanged)try{await saveServer(previous);}catch(rollback){return await rescue(rollback);}
   if(cacheAttempted)try{await refreshCache(previous);}catch(rollback){return await rescue(rollback);}
   try{restore(entry);}catch(rollback){return await rescue(rollback);}
   throw error;
  }
 };
}

export function retainedDeletionPlan(plan,manifest,{protectedChunks=[],presentChunks=[]}={}){
 const protect=new Set(protectedChunks),present=new Set(presentChunks),removable=plan.chunks.filter(hash=>!protect.has(hash)&&present.has(hash));
 return {...plan,presentChunks:removable,removableBytes:removable.reduce((sum,hash)=>sum+manifest.chunks[hash],0),retainedBackupBytes:plan.chunks.filter(hash=>protect.has(hash)&&present.has(hash)).reduce((sum,hash)=>sum+manifest.chunks[hash],0),archiveBytesFreed:0};
}
export function createLocalFeatureManager({base,manifest,policy,updater,storage=globalThis.caches,fetcher=fetch,serviceWorker=globalThis.navigator?.serviceWorker,persistObject,persistPrune,getStorageInventory,library=libraryValue}={}){
 const appBase=new URL('./',base),importedChunks=new Set(Object.values(manifest.files).filter(file=>file.localOnly).flatMap(file=>file.chunks));
 async function mutation(fn,{onLockPhase=()=>{}}={}){
  if(updater.ensureLocalControl)await updater.ensureLocalControl();
  onLockPhase(true);let locked=false,timer,lost=false;
  const validate=async()=>{if(lost)throw Error('Local feature lock expired');if(locked)await updateWorkerMessage(serviceWorker.controller,{type:'local-feature-validate'});};
  try{
   if(serviceWorker?.controller){await updateWorkerMessage(serviceWorker.controller,{type:'local-feature-lock'});locked=true;timer=setInterval(()=>{void updateWorkerMessage(serviceWorker.controller,{type:'local-feature-renew'}).catch(()=>{lost=true;});},10000);}
   else if(updater.ensureLocalControl)throw Error('Local service worker unavailable; keep the current functions installed');
   await validate();return await fn(validate);
  }finally{clearInterval(timer);if(locked)await updateWorkerMessage(serviceWorker.controller,{type:'local-feature-unlock'}).catch(()=>{});onLockPhase(false);}
 }
 async function cacheInventory(){const cache=await storage.open(OFFLINE_CHUNKS),keys=await cache.keys(),locations=new Map();for(const request of keys){const match=new URL(request.url).pathname.match(/\/__dependency_chunks__\/([a-f0-9]{64})$/);if(!match||!Object.hasOwn(manifest.chunks,match[1]))continue;const list=locations.get(match[1])||[];list.push(request.url);locations.set(match[1],list);}return{cache,locations};}
 async function retainedChunks(){const state=await updater.status(),retained=new Set();for(const reference of [state.previous,state.candidate,state.bootstrapCandidate].filter(Boolean))try{const install=await readOfflineInstallation(appBase,reference.identity,{storage});for(const [hash]of requiredFeatureChunks(install.catalog,install.manifest,install.featurePolicy||{}))retained.add(hash);}catch{ // An unreadable retained snapshot is conservative: keep all current chunks.
   for(const hash of Object.keys(manifest.chunks))retained.add(hash);
  }return retained;}
 return {
 async inventory(){const {locations}=await cacheInventory(),disk=await getStorageInventory?.();let folder=null;try{const handle=await library('folder');if(handle)folder={name:handle.name,permission:await handle.queryPermission?.({mode:'read'})||'prompt',measured:false};}catch{}return {...disk,presentChunks:[...new Set([...locations.keys(),...(disk?.presentChunks||[])])],browserPresentChunks:[...locations.keys()],browserCurrentChunks:[...locations.keys()].filter(hash=>locations.get(hash).includes(offlineChunkURL(appBase,hash))),browserBytes:[...locations.keys()].reduce((sum,hash)=>sum+manifest.chunks[hash]*locations.get(hash).length,0),archiveBytesFreed:0,folder};},
 async preview(targets,{inventory}={}){const {locations}=await cacheInventory(),plan=featureDeletionPlan(policy.catalog,manifest,policy.state,targets,{presentChunks:locations.keys()}),backups=await retainedChunks(),result=retainedDeletionPlan(plan,manifest,{protectedChunks:[...backups,...importedChunks],presentChunks:locations.keys()}),disk=inventory||await getStorageInventory?.(),managedPresent=new Set(disk?.managedPresentChunks||[]),managedProtected=new Set(disk?.protectedChunks||[]);return {...result,removableBytes:result.presentChunks.reduce((sum,hash)=>sum+manifest.chunks[hash]*locations.get(hash).length,0),removableManagedBytes:plan.chunks.filter(hash=>managedPresent.has(hash)&&!managedProtected.has(hash)&&!importedChunks.has(hash)).reduce((sum,hash)=>sum+manifest.chunks[hash],0),retainedBackupBytes:plan.chunks.filter(hash=>backups.has(hash)&&!importedChunks.has(hash)&&locations.has(hash)).reduce((sum,hash)=>sum+manifest.chunks[hash],0),retainedImportBytes:plan.chunks.filter(hash=>importedChunks.has(hash)&&(locations.has(hash)||managedPresent.has(hash))).reduce((sum,hash)=>sum+manifest.chunks[hash],0)};},
 async disable(targets,{onLockPhase}={}){const plan=await this.preview(targets);return mutation(async validate=>{await policy.disable(targets);await validate();const {cache,locations}=await cacheInventory();let recoveredBytes=0;for(const hash of plan.presentChunks)for(const url of locations.get(hash)||[])if(await cache.delete(url))recoveredBytes+=manifest.chunks[hash];await validate();const managed=persistPrune?await persistPrune(plan.chunks.filter(hash=>!importedChunks.has(hash))):null;return {...plan,recoveredBytes,managed};},{onLockPhase});},
 async enable(targets,{signal,onProgress=()=>{},onLockPhase}={}){
  if(updater.ensureLocalControl)await updater.ensureLocalControl();
  const updateState=await updater.status(),localServer=(updateState.active?.transport||updateState.active?.receipt?.transport)==='local-server',next=featureStateChange(policy.catalog,policy.state,targets,true),required=requiredFeatureChunks(policy.catalog,manifest,next),archiveReader=localChunkReader(manifest,appBase,(url,options)=>fetcher(url,{...options,signal})),serverReusedChunks=[],serverStoredChunks=[],load=createChunkLoader(manifest,{base:manifest.remoteBase,scope:appBase,cacheStorage:storage,cacheWrites:false,archive:archiveReader,fetcher:(url,options)=>fetcher(url,{...options,signal})}),cache=await storage.open(OFFLINE_CHUNKS);
  if(serviceWorker?.controller)await updateWorkerMessage(serviceWorker.controller,{type:'local-update-network-open'});
  try{let completed=0;for(const [hash]of required){signal?.throwIfAborted();let cacheHit=false;const bytes=await load(hash,event=>{if(event.kind==='dependency.cache-hit')cacheHit=true;});if(localServer&&persistObject&&cacheHit&&!archiveReader.serverHits.has(hash))await archiveReader(hash);const serverReuse=localServer&&archiveReader.serverHits.has(hash);if(serverReuse)serverReusedChunks.push(hash);else if(persistObject){await persistObject(hash,bytes,{signal});serverStoredChunks.push(hash);}else if(!cacheHit)await cache.put(offlineChunkURL(appBase,hash),new Response(bytes));onProgress({completed:++completed,total:required.size});}await mutation(async validate=>{
   signal?.throwIfAborted();await validate();let installed,previousReceipt;
   if(localServer){installed=await readOfflineInstallation(appBase,updateState.active.identity,{storage});previousReceipt=await installed.cache.match(new URL('__installation.json',appBase));const receipt={...installed.receipt,serverReusedChunks:[...new Set([...(installed.receipt?.serverReusedChunks||[]),...serverReusedChunks])],serverStoredChunks:[...new Set([...(installed.receipt?.serverStoredChunks||[]),...serverStoredChunks])]};await installed.cache.put(new URL('__installation.json',appBase),new Response(JSON.stringify(receipt),{headers:offlineHeaders('application/json')}));}
   try{await policy.enable(targets);}catch(error){if(installed&&previousReceipt)await installed.cache.put(new URL('__installation.json',appBase),previousReceipt).catch(()=>{});throw error;}
  },{onLockPhase});return {state:next,serverReusedChunks,serverStoredChunks,localOnlyPaths:[...selectActiveFiles(policy.catalog,next)].filter(path=>manifest.files[path].localOnly)};}
  finally{if(serviceWorker?.controller)await updateWorkerMessage(serviceWorker.controller,{type:'local-update-network-close'}).catch(()=>{});}
 }
 };
}
