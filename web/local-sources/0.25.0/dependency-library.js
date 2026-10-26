import {withLocalActivity,localActivityFrozen} from './local-activity.js?v=0.25.0';
import {localFeaturePolicy} from './feature-policy.js?v=0.25.0';
import {updateWorkerMessage} from './local-update-core.js?v=0.25.0';
import {offlineCacheName} from './offline-browser-store.js?v=0.25.0';
import {browserUpdateStore} from './local-update-store.js?v=0.25.0';
import {validateManifest,remoteBase,sha256,publicDependencyEntries,requiredDependencyChunks} from './dependency-core.js?v=0.25.0';
import {libraryValue,createChunkLoader,saveLibraryFile} from './dependency-store.js?v=0.25.0';
import {importResourceTar,importLibraryFile} from './dependency-tar.js?v=0.25.0';
const scope=new URL('./',import.meta.url);
let folderName='';
export const dependencyPreferences=()=>({folderName});
export function restoreDependencyPreferences(value){folderName=typeof value?.folderName==='string'?value.folderName.slice(0,200):'';}
export async function readDependencyManifest(config,{storage=globalThis.caches,store=browserUpdateStore({base:scope}),fetcher=fetch,scopeURL=scope}={}){
 if(!/^[a-f0-9]{64}$/.test(config.manifest))throw Error('Invalid dependency manifest identity');
 let response,identity;
 if(config.offline){
  identity=(await store.read()).active?.identity;
  if(!/^[a-f0-9]{64}$/.test(identity||''))throw Error('Reload the local application before importing models.');
  const cache=await storage.open(offlineCacheName(identity)),cached=await cache.match(new URL('__manifest.json',scopeURL));
  if(cached){const bytes=await cached.arrayBuffer();if(bytes.byteLength<=8_000_000&&await sha256(bytes)===config.manifest)return validateManifest(JSON.parse(new TextDecoder().decode(bytes)));}
 }
 response=await fetcher(new URL(config.offline?'__manifest.json':'dependency-manifest-'+config.manifest+'.json',scopeURL),config.offline?{headers:{'X-Sherloq-Release':identity},cache:'no-store'}:undefined);
 if(!response.ok)throw Error('Dependency manifest unavailable');
 if(config.offline&&response.headers.get('X-Sherloq-Release')!==identity)throw Error('The local helper release differs; reload the matching application.');
 const bytes=await response.arrayBuffer();if(bytes.byteLength>8_000_000||await sha256(bytes)!==config.manifest)throw Error('Dependency manifest integrity failure');
 return validateManifest(JSON.parse(new TextDecoder().decode(bytes)));
}
export function localModelEntries(manifest){
 validateManifest(manifest);
 return Object.entries(manifest.files).filter(([,file])=>file.localOnly===true).map(([path,file])=>({path,name:path.split('/').at(-1),file}));
}
// Only pinned original files are accepted. The existing importer admits one
// manifest chunk at a time; the integral SHA never collects the complete model.
export async function importLocalModelFiles(files,manifest,cache,{signal,progress=()=>{},onAddedChunk=()=>{},scopeURL=scope}={}){
 const allowed=localModelEntries(manifest),publicChunks=new Set(requiredDependencyChunks(manifest).map(([hash])=>hash)),result={imported:[],rejected:[],duplicates:[],addedChunks:[]},seen=new Set();
 const {createSHA256}=await import('./unified-engine/vendor/hash-wasm/hashes.js');
 const key=hash=>new URL('./__dependency_chunks__/'+hash,scopeURL).href;
 for(const [index,blob]of Array.from(files).entries()){
  signal?.throwIfAborted();let entries;
  try{
   entries=allowed.filter(entry=>entry.name===blob.name);
   if(!entries.length)throw Object.assign(Error('This filename is not an allowed local model.'),{code:'LOCAL_MODEL_NAME'});
   const matching=entries.filter(entry=>entry.file.size===blob.size);
   if(!matching.length)throw Object.assign(Error('Local model length differs.'),{code:'LOCAL_MODEL_LENGTH',details:{receivedBytes:blob.size,expectedBytes:[...new Set(entries.map(entry=>entry.file.size))]}});
   const identities=new Set(matching.map(entry=>JSON.stringify([entry.file.sha256,entry.file.chunks])));
   if(identities.size!==1)throw Object.assign(Error('Ambiguous local filename; the manifest expects different model identities.'),{code:'LOCAL_MODEL_AMBIGUOUS',details:{paths:matching.map(entry=>entry.path)}});
   const file=matching[0].file,identity=JSON.stringify([blob.name,file.size,file.sha256,file.chunks]);
   if(seen.has(identity)){result.duplicates.push(blob.name);continue;}
   const hash=await createSHA256();hash.init();
   await importLibraryFile(blob,file,manifest,(_chunk,bytes)=>{signal?.throwIfAborted();hash.update(bytes);},signal);
   signal?.throwIfAborted();const receivedSha256=hash.digest('hex');
   if(receivedSha256!==file.sha256)throw Object.assign(Error('The complete local model SHA-256 differs.'),{code:'LOCAL_MODEL_INTEGRITY',details:{expectedSha256:file.sha256,receivedSha256}});
   await importLibraryFile(blob,file,manifest,async(chunk,bytes)=>{
    signal?.throwIfAborted();const url=key(chunk),previous=await cache.match(url);
    const aliases=typeof cache.keys==='function'?await cache.keys():[];let reused=false;
    for(const request of aliases){const alias=typeof request==='string'?request:request.url;if(!alias.endsWith('/__dependency_chunks__/'+chunk))continue;const existing=await cache.match(alias);if(existing){const b=await existing.arrayBuffer();if(b.byteLength===bytes.length&&await sha256(b)===chunk){reused=true;break;}}}
    if(reused)return;await cache.put(url,new Response(bytes));
    if(!previous&&!publicChunks.has(chunk)&&!result.addedChunks.includes(chunk)){result.addedChunks.push(chunk);onAddedChunk(chunk);}
   },signal);
   seen.add(identity);result.imported.push({name:blob.name,paths:matching.map(entry=>entry.path),size:file.size,sha256:file.sha256,chunks:[...file.chunks]});
  }catch(error){if(signal?.aborted||error.name==='AbortError')throw error;result.rejected.push({name:blob.name,code:error.code??'LOCAL_MODEL_IMPORT',message:error.message,details:error.details});}
  finally{progress({completed:index+1,total:files.length,imported:result.imported.length,rejected:result.rejected.length,name:blob.name});}
 }
 return result;
}
// A dialog records only keys that did not exist before its own import. Public
// or unrelated keys remain protected even if an invalid receipt is supplied.
export async function removeImportedLocalChunks(manifest,hashes,cache,{signal,scopeURL=scope,retainedHashes=new Set(),beforeDelete=async()=>{}}={}){
 const localChunks=new Set(localModelEntries(manifest).flatMap(entry=>entry.file.chunks)),publicChunks=new Set(requiredDependencyChunks(manifest).map(([hash])=>hash)),result={removed:[],missing:[],kept:[]};
 for(const hash of new Set(hashes)){signal?.throwIfAborted();if(!localChunks.has(hash)||publicChunks.has(hash)||retainedHashes.has(hash)){result.kept.push(hash);continue;}
  await beforeDelete();signal?.throwIfAborted();
  (await cache.delete(new URL('./__dependency_chunks__/'+hash,scopeURL).href)?result.removed:result.missing).push(hash);
 }
 return result;
}
export async function retainedLocalImportHashes(storage,scopeURL,state){
 const retained=new Set(),identities=new Set([state?.previous,state?.candidate,state?.bootstrapCandidate].filter(Boolean).map(record=>record.identity));
 for(const name of await storage.keys()){
  if(!name.startsWith('sherloq-offline-app-'))continue;
  const cache=await storage.open(name),keys=await cache.keys();
  for(const request of keys){
   const url=new URL(request.url);if(!url.pathname.endsWith('/__installation.json'))continue;
   const appBase=new URL('./',url),receipt=await cache.match(request.url);
   let record;try{record=await receipt.json();}catch{throw Error('A retained installation is unreadable; restore it before removing imports.');}
   if(appBase.href===new URL(scopeURL).href&&!identities.has(name.slice('sherloq-offline-app-'.length)))continue;
   const response=await cache.match(new URL('__manifest.json',appBase));
   if(!response)throw Error('A retained installation inventory is missing; restore it before removing imports.');
   const bytes=await response.arrayBuffer();
   if(await sha256(bytes)!==record.manifest)throw Error('A retained installation inventory differs; restore it before removing imports.');
   const manifest=validateManifest(JSON.parse(new TextDecoder().decode(bytes)));
   for(const file of Object.values(manifest.files))for(const hash of file.chunks)retained.add(hash);
  }
 }
 return retained;
}
export function mountDependencyControls(document,config){
 if((!config.enabled&&!config.offline)||document.getElementById('dependency-settings'))return;
 const fr=()=>document.documentElement.lang!=='en',t=(a,b)=>fr()?a:b;
 const entry=document.createElement('button');entry.id='dependency-settings';entry.type='button';
 document.querySelector('#settings-menu > div').append(entry);
 const dialog=document.createElement('dialog');dialog.id='dependency-dialog';
 dialog.innerHTML='<h2></h2><p class="dependency-description"></p><p class="dependency-folder"></p><div class="dependency-actions"></div><progress max="1" value="0" hidden></progress><p role="status" aria-live="polite"></p>';
 document.body.append(dialog);const actions=dialog.querySelector('.dependency-actions'),status=dialog.querySelector('[role=status]'),meter=dialog.querySelector('progress');let busy=false,controller,manifestPromise,localEntries=[];const importedChunks=new Set();
 const manifest=()=>manifestPromise??=readDependencyManifest(config).catch(e=>{manifestPromise=null;throw e;});
 const buttons=[];const add=(id,action)=>{const b=document.createElement('button');b.type='button';b.id=id;b.onclick=action;actions.append(b);buttons.push(b);return b;};
 const report=e=>{status.textContent=t('Impossible de terminer : ','Unable to finish: ')+(e.message||String(e));};
 async function useFolder(mode='read'){
  const folder=await showDirectoryPicker({id:'sherloq-dependencies',mode});
  await libraryValue('folder',folder);folderName=folder.name;await libraryValue('folderName',folderName);translate();return folder;
 }
 async function job(fn,{remove=false}={}){if(busy||localActivityFrozen())return;busy=true;controller=new AbortController();buttons.forEach(b=>b.disabled=b!==cancel);meter.hidden=false;status.textContent=t('Préparation…','Preparing…');
  let worker,lease=false;try{if(remove&&localFeaturePolicy.local){worker=globalThis.navigator?.serviceWorker?.controller;if(!worker)throw Error('Reload the local application before removing imports.');await updateWorkerMessage(worker,{type:'local-feature-lock'});lease=true;}const message=await withLocalActivity(()=>fn(controller.signal,{worker,lease}),{allowFrozen:lease});status.textContent=typeof message==='string'?message:t('Ressources reçues et vérifiées.','Received resources verified.');}
  catch(e){if(e.name==='AbortError')status.textContent=t('Arrêté. Les morceaux déjà reçus sont conservés.','Stopped. Completed pieces are kept.');else report(e);}
  finally{if(lease)await updateWorkerMessage(worker,{type:'local-feature-unlock'}).catch(()=>{});busy=false;buttons.forEach(b=>b.disabled=false);cancel.disabled=true;meter.hidden=true;syncLocalControls();}
 }
 const folderInput=document.createElement('input');folderInput.type='file';folderInput.webkitdirectory=true;folderInput.multiple=true;folderInput.hidden=true;dialog.append(folderInput);
 const choose=add('dependency-choose',async()=>{if(!globalThis.showDirectoryPicker){folderInput.value='';folderInput.click();return;}try{await useFolder();status.textContent=t('Dossier connecté. Les fichiers présents seront réutilisés ; les manquants viendront de GitHub.','Folder connected. Existing files will be reused; missing ones will come from GitHub.');}catch(e){if(e.name!=='AbortError')report(e);}});
 const download=add('dependency-download',async()=>{
  // Ask for a writable directory while still inside the user's click gesture.
  if(!globalThis.showDirectoryPicker){downloadDependencyArchive(document,new URL('./__dependency_download__/resources.tar',scope));status.textContent=t('Téléchargement de l’archive lancé. Suivez sa progression dans les téléchargements du navigateur.','Archive download started. Follow its progress in your browser downloads.');return;}
  let destination;try{if(globalThis.showDirectoryPicker)destination=await useFolder('readwrite');}catch(e){if(e.name!=='AbortError')report(e);return;}
  await job(async signal=>{const m=await manifest(),entries=publicDependencyEntries(m),load=createChunkLoader(m,{base:remoteBase(m.remoteBase,{allowLocal:['localhost','127.0.0.1'].includes(location.hostname)}),scope});meter.max=entries.length;meter.value=0;
   const progress=n=>{meter.value=n;status.textContent=t('Téléchargement : ','Download: ')+n+' / '+entries.length;};
   if(destination){let n=0;for(const [path,file] of entries){signal.throwIfAborted();await saveLibraryFile(destination,path,file,load,{signal});progress(++n);}const w=await(await destination.getFileHandle('manifest.json',{create:true})).createWritable();try{await w.write(JSON.stringify(m));await w.close();}catch(e){await w.abort().catch(()=>{});throw e;}}

  });
 });
 const input=document.createElement('input');input.type='file';input.accept='.tar,application/x-tar';input.hidden=true;dialog.append(input);
 const restore=add('dependency-import',()=>{input.value='';input.click();});input.onchange=()=>{const file=input.files[0];if(file)void job(async signal=>{const m=await manifest(),cache=await caches.open('sherloq-dependency-chunks-v1');meter.max=Object.keys(m.files).length;await importResourceTar(file,m,(h,b)=>cache.put(new URL('./__dependency_chunks__/'+h,scope).href,new Response(b)),{signal,progress:n=>{meter.value=n;}});});};
 const localInput=document.createElement('input');localInput.type='file';localInput.id='dependency-local-model-files';localInput.multiple=true;localInput.hidden=true;dialog.append(localInput);
 const localImport=add('dependency-import-local',()=>{if(busy||!localEntries.length)return;localInput.value='';localInput.click();});
 const localList=document.createElement('details'),localSummary=document.createElement('summary'),localNames=document.createElement('ul'),localNote=document.createElement('p');localList.className='dependency-local-model-list';localList.append(localSummary,localNames,localNote);dialog.insertBefore(localList,actions);
 const localRemove=add('dependency-remove-local',()=>job(async(signal,{worker,lease})=>{
  const m=await manifest(),cache=await caches.open('sherloq-dependency-chunks-v1'),state=localFeaturePolicy.local?await browserUpdateStore({base:scope}).read():null,retainedHashes=await retainedLocalImportHashes(caches,scope,state),result=await removeImportedLocalChunks(m,importedChunks,cache,{signal,retainedHashes,beforeDelete:()=>lease?updateWorkerMessage(worker,{type:'local-feature-validate'}):Promise.resolve()});
  for(const hash of [...result.removed,...result.missing])importedChunks.delete(hash);
  return t(result.removed.length+' morceaux de ces imports retirés du cache. Les sauvegardes, autres installations et fichiers originaux sont conservés.',result.removed.length+' chunks from these imports removed from cache. Previous resources and original files are retained.')+(result.kept.length?t(' '+result.kept.length+' morceaux conservés par les sauvegardes ou autres installations.',' '+result.kept.length+' chunks retained by backups or other installations.'):'');
 },{remove:true}));
 localInput.onchange=()=>{const files=[...localInput.files];if(!files.length)return;return job(async signal=>{
  const m=await manifest(),cache=await caches.open('sherloq-dependency-chunks-v1');meter.max=files.length;meter.value=0;
  const result=await importLocalModelFiles(files,m,cache,{signal,onAddedChunk:hash=>importedChunks.add(hash),progress:value=>{meter.value=value.completed;status.textContent=t('Vérification : ','Verifying: ')+value.completed+' / '+value.total+' · '+value.name;}});
  const errorText=error=>error.code==='LOCAL_MODEL_NAME'?t('nom absent de la liste autorisée','filename is not in the allowed list'):error.code==='LOCAL_MODEL_LENGTH'?t('taille incorrecte : '+error.details.receivedBytes+' octets ; attendu '+error.details.expectedBytes.join(' / '),'wrong length: '+error.details.receivedBytes+' bytes; expected '+error.details.expectedBytes.join(' / ')):error.code==='LOCAL_MODEL_AMBIGUOUS'?t('nom ambigu dans le manifeste','ambiguous filename in the manifest'):error.code==='LOCAL_MODEL_INTEGRITY'||/integrity/i.test(error.message)?t('empreinte SHA-256 incorrecte','SHA-256 integrity mismatch'):error.message;
  return t(result.imported.length+' modèle(s) importé(s) et vérifié(s).',result.imported.length+' model(s) imported and verified.')+(result.rejected.length?t(' '+result.rejected.length+' fichier(s) refusé(s) : ',' '+result.rejected.length+' file(s) rejected: ')+result.rejected.map(error=>error.name+' — '+errorText(error)).join('; '):'')+(result.duplicates.length?t(' '+result.duplicates.length+' doublon(s) ignoré(s).',' '+result.duplicates.length+' duplicate(s) skipped.'):'');
 }).finally(()=>{localInput.value='';});};
 folderInput.onchange=()=>{const files=[...folderInput.files];if(files.length)void job(async signal=>{const m=await manifest(),cache=await caches.open('sherloq-dependency-chunks-v1');let n=0,matched=0;meter.max=files.length;for(const file of files){signal.throwIfAborted();const path=file.webkitRelativePath.split('/').slice(1).join('/');if(m.files[path]){await importLibraryFile(file,m.files[path],m,(h,b)=>cache.put(new URL('./__dependency_chunks__/'+h,scope).href,new Response(b)),signal);matched++;}meter.value=++n;}if(!matched)throw Error(t('Aucune ressource compatible dans ce dossier.','No compatible resources in this folder.'));folderName=files[0].webkitRelativePath.split('/')[0];await libraryValue('folderName',folderName);translate();});};
 const forget=add('dependency-disconnect',async()=>{await libraryValue('folder',null);await libraryValue('folderName','');folderName='';translate();status.textContent=t('Dossier déconnecté. Aucun fichier supprimé.','Folder disconnected. No files deleted.');});
 if(config.offline){download.hidden=true;restore.hidden=true;}
 const cancel=add('dependency-cancel',()=>controller?.abort());cancel.disabled=true;
 const close=add('dependency-close',()=>dialog.close());
 function syncLocalControls(){localImport.disabled=busy||!localEntries.length;localRemove.disabled=busy||!importedChunks.size;localRemove.textContent=t('Retirer ces imports du cache','Remove these imports from cache')+(importedChunks.size?' ('+importedChunks.size+')':'');}
 function translate(){entry.textContent=t('Ressources de calcul…','Calculation resources…');dialog.querySelector('h2').textContent=entry.textContent;
  dialog.querySelector('.dependency-description').textContent=t('Les ressources publiques sont téléchargées depuis GitHub uniquement selon les besoins. Les modèles soumis à des restrictions de redistribution doivent être importés depuis leurs fichiers originaux vérifiés. Le téléchargement complet contient les ressources publiques. Le navigateur peut demander de reconnecter le dossier après une suppression des autorisations.','Public resources are downloaded from GitHub only as needed. Models with redistribution restrictions must be imported from their verified original files. The complete download contains public resources. The browser may ask you to reconnect the folder after permissions are cleared.');
  dialog.querySelector('.dependency-folder').textContent=folderName?t('Dossier mémorisé : ','Remembered folder: ')+folderName:t('Aucun dossier connecté.','No folder connected.');
  choose.textContent=t('Connecter un dossier…','Connect a folder…');download.textContent=t('Télécharger toutes les ressources…','Download all resources…');restore.textContent=t('Recharger une archive…','Load an archive…');localImport.textContent=t('Importer modèles locaux…','Import local models…');localSummary.textContent=t('Fichiers de modèles locaux autorisés','Allowed local model files');localNote.textContent=t('Choisissez les fichiers originaux portant exactement ces noms. Leur taille et leur SHA-256 seront vérifiés. Le retrait ne supprime que les morceaux ajoutés ici, pas les fichiers originaux ni les ressources déjà présentes.','Choose original files with these exact names. Their size and SHA-256 will be verified. Removal deletes only chunks added here, preserving original files and resources already present.');forget.textContent=t('Oublier le dossier','Forget folder');cancel.textContent=t('Arrêter','Stop');close.textContent=t('Fermer','Close');syncLocalControls();
 }
 entry.onclick=()=>{translate();dialog.showModal();};new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 void libraryValue('folderName').then(name=>{if(name)folderName=name;translate();}).catch(()=>{});translate();
 const ready=manifest().then(m=>{localEntries=localModelEntries(m);const names=[...new Set(localEntries.map(entry=>entry.name))].sort();localNames.replaceChildren(...names.map(name=>{const item=document.createElement('li');item.textContent=name;return item;}));localInput.accept=[...new Set(names.map(name=>name.match(/\.[a-z0-9]{1,12}$/i)?.[0]).filter(Boolean))].sort().join(',');syncLocalControls();}).catch(report);
 return {ready,open(){translate();dialog.showModal();}};
}

// A download-attribute link may bypass the controlling service worker in Chromium.
// An attachment navigation reaches the streaming handler. Keep failures out of
// the application document so a failed export never replaces the user's work.
export function downloadDependencyArchive(document,url){
 url=new URL(url);const id=url.searchParams.get('id')||crypto.randomUUID();url.searchParams.set('id',id);
 const frame=document.createElement('iframe');frame.hidden=true;frame.title='SHERLOQ archive';frame.src=url.href;
 const worker=globalThis.navigator?.serviceWorker;
 const clean=()=>{frame.remove();worker?.removeEventListener('message',finished);};
 const finished=e=>{if(e.data?.type==='dependency-download-progress'&&e.data.id===id&&e.data.done)setTimeout(clean,1000);};
 worker?.addEventListener('message',finished);document.body.append(frame);
 // Attachment downloads detach from the navigation; load fires for an HTTP
 // failure document. Successful callers clean up when their stream finishes.
 frame.addEventListener('load',()=>setTimeout(clean,1000),{once:true});
 return clean;
}
