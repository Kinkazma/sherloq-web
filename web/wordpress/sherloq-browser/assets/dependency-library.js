import {validateManifest,remoteBase,sha256} from './dependency-core.js';
import {libraryValue,createChunkLoader,saveLibraryFile} from './dependency-store.js';
import {importResourceTar,importLibraryFile} from './dependency-tar.js';
const scope=new URL('./',import.meta.url);
let folderName='';
export const dependencyPreferences=()=>({folderName});
export function restoreDependencyPreferences(value){folderName=typeof value?.folderName==='string'?value.folderName.slice(0,200):'';}
export async function readDependencyManifest(config){
 if(!/^[a-f0-9]{64}$/.test(config.manifest))throw Error('Invalid dependency manifest identity');
 const r=await fetch(new URL('dependency-manifest-'+config.manifest+'.json',scope));if(!r.ok)throw Error('Dependency manifest unavailable');
 const b=await r.arrayBuffer();if(await sha256(b)!==config.manifest)throw Error('Dependency manifest integrity failure');
 return validateManifest(JSON.parse(new TextDecoder().decode(b)));
}
export function mountDependencyControls(document,config){
 if(!config.enabled||document.getElementById('dependency-settings'))return;
 const fr=()=>document.documentElement.lang!=='en',t=(a,b)=>fr()?a:b;
 const entry=document.createElement('button');entry.id='dependency-settings';entry.type='button';
 document.querySelector('#settings-menu > div').append(entry);
 const dialog=document.createElement('dialog');dialog.id='dependency-dialog';
 dialog.innerHTML='<h2></h2><p class="dependency-description"></p><p class="dependency-folder"></p><div class="dependency-actions"></div><progress max="1" value="0" hidden></progress><p role="status" aria-live="polite"></p>';
 document.body.append(dialog);const actions=dialog.querySelector('.dependency-actions'),status=dialog.querySelector('[role=status]'),meter=dialog.querySelector('progress');let busy=false,controller,manifestPromise;
 const manifest=()=>manifestPromise??=readDependencyManifest(config).catch(e=>{manifestPromise=null;throw e;});
 const buttons=[];const add=(id,action)=>{const b=document.createElement('button');b.type='button';b.id=id;b.onclick=action;actions.append(b);buttons.push(b);return b;};
 const report=e=>{status.textContent=t('Impossible de terminer : ','Unable to finish: ')+(e.message||String(e));};
 async function useFolder(mode='read'){
  const folder=await showDirectoryPicker({id:'sherloq-dependencies',mode});
  await libraryValue('folder',folder);folderName=folder.name;await libraryValue('folderName',folderName);translate();return folder;
 }
 async function job(fn){if(busy)return;busy=true;controller=new AbortController();buttons.forEach(b=>b.disabled=b!==cancel);meter.hidden=false;status.textContent=t('Préparation…','Preparing…');
  try{await fn(controller.signal);status.textContent=t('Ressources reçues et vérifiées.','Received resources verified.');}
  catch(e){if(e.name==='AbortError')status.textContent=t('Arrêté. Les morceaux déjà reçus sont conservés.','Stopped. Completed pieces are kept.');else report(e);}
  finally{busy=false;buttons.forEach(b=>b.disabled=false);cancel.disabled=true;meter.hidden=true;}
 }
 const folderInput=document.createElement('input');folderInput.type='file';folderInput.webkitdirectory=true;folderInput.multiple=true;folderInput.hidden=true;dialog.append(folderInput);
 const choose=add('dependency-choose',async()=>{if(!globalThis.showDirectoryPicker){folderInput.value='';folderInput.click();return;}try{await useFolder();status.textContent=t('Dossier connecté. Les fichiers présents seront réutilisés ; les manquants viendront de GitHub.','Folder connected. Existing files will be reused; missing ones will come from GitHub.');}catch(e){if(e.name!=='AbortError')report(e);}});
 const download=add('dependency-download',async()=>{
  // Ask for a writable directory while still inside the user's click gesture.
  if(!globalThis.showDirectoryPicker){const a=document.createElement('a');a.href=new URL('./__dependency_download__/resources.tar',scope).href;a.download='SHERLOQ-resources.tar';a.click();status.textContent=t('Téléchargement de l’archive lancé. Suivez sa progression dans les téléchargements du navigateur.','Archive download started. Follow its progress in your browser downloads.');return;}
  let destination;try{if(globalThis.showDirectoryPicker)destination=await useFolder('readwrite');}catch(e){if(e.name!=='AbortError')report(e);return;}
  await job(async signal=>{const m=await manifest(),entries=Object.entries(m.files),load=createChunkLoader(m,{base:remoteBase(m.remoteBase,{allowLocal:['localhost','127.0.0.1'].includes(location.hostname)}),scope});meter.max=entries.length;meter.value=0;
   const progress=n=>{meter.value=n;status.textContent=t('Téléchargement : ','Download: ')+n+' / '+entries.length;};
   if(destination){let n=0;for(const [path,file] of entries){signal.throwIfAborted();await saveLibraryFile(destination,path,file,load,{signal});progress(++n);}const w=await(await destination.getFileHandle('manifest.json',{create:true})).createWritable();try{await w.write(JSON.stringify(m));await w.close();}catch(e){await w.abort().catch(()=>{});throw e;}}

  });
 });
 const input=document.createElement('input');input.type='file';input.accept='.tar,application/x-tar';input.hidden=true;dialog.append(input);
 const restore=add('dependency-import',()=>{input.value='';input.click();});input.onchange=()=>{const file=input.files[0];if(file)void job(async signal=>{const m=await manifest(),cache=await caches.open('sherloq-dependency-chunks-v1');meter.max=Object.keys(m.files).length;await importResourceTar(file,m,(h,b)=>cache.put(new URL('./__dependency_chunks__/'+h,scope).href,new Response(b)),{signal,progress:n=>{meter.value=n;}});});};
 folderInput.onchange=()=>{const files=[...folderInput.files];if(files.length)void job(async signal=>{const m=await manifest(),cache=await caches.open('sherloq-dependency-chunks-v1');let n=0,matched=0;meter.max=files.length;for(const file of files){signal.throwIfAborted();const path=file.webkitRelativePath.split('/').slice(1).join('/');if(m.files[path]){await importLibraryFile(file,m.files[path],m,(h,b)=>cache.put(new URL('./__dependency_chunks__/'+h,scope).href,new Response(b)),signal);matched++;}meter.value=++n;}if(!matched)throw Error(t('Aucune ressource compatible dans ce dossier.','No compatible resources in this folder.'));folderName=files[0].webkitRelativePath.split('/')[0];await libraryValue('folderName',folderName);translate();});};
 const forget=add('dependency-disconnect',async()=>{await libraryValue('folder',null);await libraryValue('folderName','');folderName='';translate();status.textContent=t('Dossier déconnecté. Aucun fichier supprimé.','Folder disconnected. No files deleted.');});
 const cancel=add('dependency-cancel',()=>controller?.abort());cancel.disabled=true;
 const close=add('dependency-close',()=>dialog.close());
 function translate(){entry.textContent=t('Ressources de calcul…','Calculation resources…');dialog.querySelector('h2').textContent=entry.textContent;
  dialog.querySelector('.dependency-description').textContent=t('Les ressources sont téléchargées depuis GitHub uniquement selon les besoins. Vous pouvez toutes les conserver pour les réutiliser. Le navigateur peut demander de reconnecter le dossier après une suppression des autorisations.','Resources are downloaded from GitHub only as needed. You can keep them all for reuse. The browser may ask you to reconnect the folder after permissions are cleared.');
  dialog.querySelector('.dependency-folder').textContent=folderName?t('Dossier mémorisé : ','Remembered folder: ')+folderName:t('Aucun dossier connecté.','No folder connected.');
  choose.textContent=t('Connecter un dossier…','Connect a folder…');download.textContent=t('Télécharger toutes les ressources…','Download all resources…');restore.textContent=t('Recharger une archive…','Load an archive…');forget.textContent=t('Oublier le dossier','Forget folder');cancel.textContent=t('Arrêter','Stop');close.textContent=t('Fermer','Close');
 }
 entry.onclick=()=>{translate();dialog.showModal();};new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 void libraryValue('folderName').then(name=>{if(name)folderName=name;translate();}).catch(()=>{});translate();
 return {open(){dialog.showModal();}};
}
