import {installResourceFetch,resourcePresence,ensureResources,sharedChunk} from './resource-library.js';
import {collect,collection,removeCollected} from './collection.js';
import {readSettings, destinationURL} from './settings.js';
import {putJob, getJob, pruneJobs, deleteJob,updateJob} from './db.js';
import {transferMetadata} from './transfer-file.js';
import {resolveImage, fetchResource, fileName} from './resources.js';
import {readNamedPresets,addNamedPreset,removeNamedPreset,presetStorageKey} from './preset-library.js';
import {activateTab} from './tab-activation.js';

const own = name => chrome.runtime.getURL(name), pendingImports = new Map(), deliveries = new Map(), imageRequests = new Map();
installResourceFetch();
const protectedPage = 'Cette page est protégée par Chromium. Ouvrez l’image ou le PDF depuis son adresse d’origine.';
function contentSender(sender) { return sender.tab?.id !== undefined && /^(https?|file):/.test(sender.url || ''); }
function extensionSender(sender) { return sender.url?.startsWith(own('')); }
async function remember(value, sender, id = crypto.randomUUID()) {
  await pruneJobs();
  const job = {...value, id, tabId: sender.tab?.id, created: Date.now()};
  await putJob(job); return {id: job.id, width: job.width, height: job.height, reason: job.reason};
}
async function inspectPDF(url, tab) {
  const {blob, url: finalURL} = await fetchResource(url);
  if (!(await blob.slice(0, 5).text()).startsWith('%PDF-')) throw Error('Ce lien ne contient pas de PDF.');
  // Keep the PDF alive even if its source tab closes before create() resolves.
  const token=crypto.randomUUID(),until=Date.now()+120_000;
  const source={blob,url:finalURL,kind:'pdf',sourcePage:url,name:fileName(url,'application/pdf'),transferPins:{[token]:until},transferUntil:until},job=await remember(source,{tab});
  let reader;
  try{
   // Open the final URL in one operation. Some embedded Chromium browsers
   // cannot address a newly created blank tab through tabs.update().
   reader=await chrome.tabs.create({url:own('renderer.html')+'?job='+job.id});
   await updateJob(job.id,current=>({...source,...current,id:job.id,tabId:tab.id,created:current?.created??Date.now(),cacheOwnerTabId:reader.id}));
   return reader;
  }catch(error){if(reader)await chrome.tabs.remove(reader.id).catch(()=>{});await deleteJob(job.id);throw error;}
  finally{await releaseTransferPins([job.id],token);}
}
export async function toggle(tab) {
  return activateTab(tab,{openPDF:inspectPDF,protectedPage,
    inject:tabId=>chrome.scripting.executeScript({target:{tabId,allFrames:true},files:['content.js']})});
}
async function showError(error, tabId) {
  await chrome.action.setBadgeBackgroundColor({color: '#8c382f', tabId});
  await chrome.action.setBadgeText({text: '!', tabId});
  await chrome.action.setTitle({title: error.message, tabId});
  const url = own('options.html') + '?error=' + encodeURIComponent(error.message);
  await chrome.tabs.create({url});
}
chrome.action.onClicked.addListener(tab => void toggle(tab).catch(error => showError(error, tab.id)));
function menus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({id:'collect',title:'Ajouter l’image à la sélection SHERLOQ',contexts:['image']});
    chrome.contextMenus.create({id: 'web', title: 'Ouvrir l’image dans SHERLOQ web', contexts: ['image']});
    chrome.contextMenus.create({id: 'local', title: 'Ouvrir l’image dans SHERLOQ local', contexts: ['image']});
    chrome.contextMenus.create({id: 'pdf-link', title: 'Extraire les images du PDF avec SHERLOQ', contexts: ['link'], targetUrlPatterns: ['*://*/*.pdf*']});
    chrome.contextMenus.create({id: 'pdf-page', title: 'Extraire les images du PDF avec SHERLOQ', contexts: ['page'], documentUrlPatterns: ['*://*/*.pdf*']});
    chrome.contextMenus.create({id:'restart',title:'Redémarrer l’extension SHERLOQ',contexts:['action']});
    chrome.contextMenus.create({id: 'settings', title: 'Réglages de SHERLOQ', contexts: ['action']});
  });
}
chrome.runtime.onInstalled.addListener(menus);
chrome.runtime.onStartup.addListener(() => void pruneJobs({all: true}));
chrome.tabs.onRemoved.addListener(tabId => { void finishTransfer(tabId,{stage:'error',error:'L’onglet destinataire a été fermé.'}).finally(()=>pruneJobs({tabId})); });
chrome.contextMenus.onClicked.addListener((info, tab) => {
  void (async () => {
    if(info.menuItemId==='restart')return restart();
    if (info.menuItemId === 'settings') return chrome.runtime.openOptionsPage();
    if (String(info.menuItemId).startsWith('pdf-')) return inspectPDF(info.linkUrl || info.pageUrl, tab);
    // Inject without activating the loupe, then recover the image's linked originals.
    await chrome.scripting.executeScript({target: {tabId: tab.id, frameIds: [info.frameId || 0]}, func: () => { globalThis.__sherloqPrepareOnly = true; }});
    await chrome.scripting.executeScript({target: {tabId: tab.id, frameIds: [info.frameId || 0]}, files: ['content.js']});
    const selection = await chrome.tabs.sendMessage(tab.id, {type: 'selection', url: info.srcUrl}, {frameId: info.frameId || 0});
    const image = await resolveImage(selection || {candidates: [{url: info.srcUrl, reason: 'context-image'}], sourcePage: info.pageUrl});
    const job = await remember(image, {tab});
    return info.menuItemId==='collect'?addCollected(job.id):openJob(job.id, info.menuItemId);
  })().catch(error => showError(error, tab?.id));
});

let collectionWrite=Promise.resolve(),presetWrite=Promise.resolve();
function changePreset(message){const task=presetWrite.then(async()=>{const records=await readNamedPresets(),id=message.type==='preset-save'?'user-'+crypto.randomUUID():message.id,next=message.type==='preset-save'?addNamedPreset(records,message,id):removeNamedPreset(records,id);await chrome.storage.local.set({[presetStorageKey]:next});return {id};});presetWrite=task.catch(()=>{});return task;}
function addCollected(id){const task=collectionWrite.then(()=>collect(id)).then(async id=>{await chrome.storage.local.set({collectionRevision:crypto.randomUUID()});return {id,count:(await collection()).length};});collectionWrite=task.catch(()=>{});return task;}
async function openJob(id, destination, ids, batch=false) {
  const selected=ids||[id],files=[],sources=[],pinned=[],token=crypto.randomUUID(),until=Date.now()+10*60_000;
  let tab,url,job;
  try{
   // Pin in the same transaction that reads the source. Hashing a large PDF
   // must not leave a window where closing its reader can delete the file.
   for(const selectedId of selected){
    const source=await updateJob(selectedId,source=>{if(!source)throw Error('Fichier expiré avant le transfert.');if(!['image','pdf'].includes(source.kind)||batch&&source.kind!=='image')throw Error('Sélectionnez une image ou le PDF d’origine.');const transferPins=Object.fromEntries(Object.entries({...source.transferPins,[token]:until}).filter(([,expires])=>expires>Date.now()));return {...source,transferPins,transferUntil:Math.max(...Object.values(transferPins))};});
    pinned.push(selectedId);sources.push(source);if(selectedId===id)job=source;
   }
   const p=await readSettings(),address=destination==='local'?p.localURL:p.webURL;
   if(!address)throw Error('Indiquez l’adresse de votre SHERLOQ local dans les réglages de l’extension.');
   url=destinationURL(address,destination==='local');
   for(const source of sources)files.push(await transferMetadata(source));
   tab=await chrome.tabs.create({url});
  }catch(error){await releaseTransferPins(pinned,token);throw error;}
  const pending={id,ids:selected,files,batch,expected:url,started:Date.now(),token};
  pendingImports.set(tab.id,pending);
  // Also store the pending import across MV3 worker suspension.
  await chrome.storage.session.set({['import:' + tab.id]: pending});
  await transferState(pending,{stage:'opening'});
  const current = await chrome.tabs.get(tab.id);
  if (current.status === 'complete') void deliver(tab.id).catch(error=>showError(error,tab.id));
  return {tabId: tab.id,token:pending.token,kind:job.kind};
}
async function transferState(pending,value){if(pending?.token)await chrome.storage.session.set({['transfer:'+pending.token]:{token:pending.token,id:pending.id,kind:pending.files[0]?.kind,updated:Date.now(),...value}});}
async function releaseTransferPins(ids,token){for(const id of ids)await updateJob(id,source=>{if(!source)return;const transferPins=Object.fromEntries(Object.entries(source.transferPins||{}).filter(([key,expires])=>key!==token&&expires>Date.now()));return {...source,transferPins,transferUntil:Math.max(0,...Object.values(transferPins))};});}
async function finishTransfer(tabId,value){
 const key='import:'+tabId,pending=pendingImports.get(tabId)||(await chrome.storage.session.get(key))[key];if(!pending)return;
 await transferState(pending,value);pendingImports.delete(tabId);await chrome.storage.session.remove([key,'receiving:'+tabId]);
 await releaseTransferPins(pending.ids||[pending.id],pending.token);
}
function sameDestination(actual, expected) {
  const a = new URL(actual), e = new URL(expected);
  return a.protocol === e.protocol && a.host === e.host && a.pathname === e.pathname;
}
function deliver(tabId) {
  if(deliveries.has(tabId))return deliveries.get(tabId);
  const task=deliverOnce(tabId).catch(async error=>{await finishTransfer(tabId,{stage:'error',error:error.message});throw error;}).finally(()=>deliveries.delete(tabId));deliveries.set(tabId,task);return task;
}
async function deliverOnce(tabId) {
  const key = 'import:' + tabId, pending = pendingImports.get(tabId) || (await chrome.storage.session.get(key))[key];
  if (!pending || Date.now() - pending.started > 10 * 60_000) return;
  const deadline=Date.now()+120_000;
  // A WordPress wrapper may embed the real workspace; inspect only frames on the
  // configured origin. The image never goes into a URL or to a remote server.
  const expectedOrigin = new URL(pending.expected).origin;
  while(Date.now()<deadline){
  const tab=await chrome.tabs.get(tabId);if(!sameDestination(tab.url,pending.expected))return;
  let found;try{found=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:()=>({input:!!document.getElementById('image-file'),url:location.href})});}catch(error){if((await chrome.tabs.get(tabId)).status==='complete')throw error;found=[];}
  for (const frame of found) {
    if (!frame.result?.input || new URL(frame.result.url).origin !== expectedOrigin) continue;
    await chrome.scripting.executeScript({target: {tabId, frameIds: [frame.frameId]}, files: ['receiver.js']});
    const response = await chrome.tabs.sendMessage(tabId, {type: 'import-start', id: pending.id,ids:pending.ids,batch:pending.batch}, {frameId: frame.frameId});
    if (!response?.ok) throw Error(response?.error || 'Le transfert de l’image a échoué.');
    return;
  }
  // Poll frame readiness as well as the wrapper DOM: observers do not cross iframes.
  await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw Error('SHERLOQ n’a pas ouvert son espace de travail à temps.');
}
async function installLibraryBridge(tab){
 const settings=await readSettings();if(!tab?.id||!tab.url)return;
 const roots=[settings.webURL,settings.localURL].filter(Boolean).map(value=>new URL(value)),page=new URL(tab.url),allowed=roots.filter(root=>root.origin===page.origin&&page.pathname.startsWith(root.pathname.replace(/[^/]*$/,'')));if(!allowed.length)return;
 // WordPress mounts its workspace in a same-origin frame outside the wrapper's
 // path. Its resource client posts to its own window, so it needs its own bridge.
 const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>({url:location.href,workspace:!!document.getElementById('image-file')})}),frameIds=frames.filter(frame=>{try{const url=new URL(frame.result?.url);return url.origin===page.origin&&(frame.result.workspace||allowed.some(root=>url.pathname.startsWith(root.pathname.replace(/[^/]*$/,''))));}catch{return false;}}).map(frame=>frame.frameId);
 if(frameIds.length)await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds},files:['resource-bridge.js']});
}
chrome.tabs.onUpdated.addListener((_id,change,tab)=>{if(change.status==='complete')void installLibraryBridge(tab).catch(()=>{});});
chrome.runtime.onInstalled.addListener(()=>{void chrome.tabs.query({}).then(tabs=>Promise.allSettled(tabs.map(installLibraryBridge)));});
chrome.tabs.onUpdated.addListener((id, change) => { if (change.status === 'complete') void deliver(id).catch(error => showError(error, id)); });

let restarting=false;const stateWrites=new Map(),stateVersions=new Map();
async function restart(){
 if(restarting)return {};restarting=true;
 try{
  await Promise.allSettled([...stateWrites.values()]);
  const session=await chrome.storage.session.get(null),targets=Object.keys(session).filter(key=>key.startsWith('active:')).map(key=>session[key]);
  await Promise.allSettled(targets.map(({tabId,frameId})=>chrome.tabs.sendMessage(tabId,{type:'restart-shutdown'},{frameId})));
  for(const controller of imageRequests.values())controller.abort();imageRequests.clear();
  // Recreate frames and their computation workers without reloading the user's page.
  for(const {tabId,frameId}of targets)try{await chrome.scripting.executeScript({target:{tabId,frameIds:[frameId]},files:['content.js']});}catch{}
  return {restarted:true};
 }finally{restarting=false;}
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const respond = async () => {
    const content = contentSender(sender), extension = extensionSender(sender);
    if (!content && !extension) throw Error('Origine refusée.');
    if(message.type==='loupe-state'&&content){
      const key='active:'+sender.tab.id+':'+sender.frameId,version=Number(message.version)||0;
      if(version<(stateVersions.get(key)||0))return {};stateVersions.set(key,version);
      const write=(stateWrites.get(key)||Promise.resolve()).then(async()=>{if(version!==stateVersions.get(key))return;if(message.active)await chrome.storage.session.set({[key]:{tabId:sender.tab.id,frameId:sender.frameId}});else await chrome.storage.session.remove(key);});stateWrites.set(key,write);await write;return {};
    }
    if(message.type==='restart')return restart();
    if(extension&&['preset-save','preset-remove'].includes(message.type))return changePreset(message);
    if(message.type==='resource-shared-chunk'&&content)return sharedChunk(message,sender);
    if(message.type==='resource-presence'&&extension&&['pdf','ocr'].includes(message.group))return resourcePresence(message.group);
    if(message.type==='resource-ensure'&&extension&&['pdf','ocr'].includes(message.group))return ensureResources(message.group);
    if(message.type==='collection-open'&&extension)return chrome.tabs.create({url:own('collection.html')});
    if(message.type==='collection-add'&&extension)return addCollected(message.id);
    if(message.type==='collection-remove'&&extension){await collectionWrite;await removeCollected(message.ids||[]);await chrome.storage.local.set({collectionRevision:crypto.randomUUID()});return {};}
    if(message.type==='open-batch'&&extension){const ids=[...new Set(message.ids||[])];if(!ids.length||ids.length>50)throw Error('Sélection invalide.');for(const id of ids)if(!(await getJob(id))?.basket)throw Error('Image absente de la sélection.');return openJob(ids[0],message.destination,ids,true);}
    if(message.type==='resolve-selection'&&extension){const image=await resolveImage(message.selection);return remember(image,sender);}
    if(message.type==='resolve-source'&&extension){const image=await resolveImage({candidates:[{url:message.url,reason:'chosen-source'}],sourcePage:message.sourcePage});return remember(image,sender);}

    if (message.type === 'activate-tab' && extension) { await toggle(await chrome.tabs.get(message.tabId)); return {}; }
    if (message.type === 'prepare-image' && content) {
      const key=sender.tab.id+':'+sender.frameId+':'+(message.warm?'warm:'+message.warm:message.preview?'preview':'original');imageRequests.get(key)?.abort();const controller=new AbortController();imageRequests.set(key,controller);
      let result;
      try{const resolved=await resolveImage(message.selection,{signal:controller.signal,...(message.warm?{maxPixels:5_000_000,maxBytes:32*1024**2}:{}),onCandidate:async value=>{
        result=await remember(value,sender);controller.signal.throwIfAborted();
        if(!message.warm)await chrome.tabs.sendMessage(sender.tab.id,{type:'image-progress',token:message.token,...result},{frameId:sender.frameId});
      }});if(result){const job=await getJob(result.id);await putJob({...job,variants:resolved.variants,errors:resolved.errors});}return result;}
      finally{if(imageRequests.get(key)===controller)imageRequests.delete(key);}
    }
    if (message.type === 'cancel-image' && content) {for(const [key,controller] of imageRequests)if(key.startsWith(sender.tab.id+':'+sender.frameId+':')&&(message.all||!key.includes(':warm:')))controller.abort();return {};}
    if (message.type === 'linked-html' && (content||extension)) { const value = await fetchResource(message.url, {html: true}); return {html: await value.blob.text(), url: value.url}; }
    if (message.type === 'pdf' && content) return inspectPDF(message.url, sender.tab);
    if (message.type === 'open-job' && extension) return openJob(message.id, message.destination);
    if (message.type === 'options') { await chrome.runtime.openOptionsPage(); return {}; }
    if (message.type === 'receiver-ready' && content) { void deliver(sender.tab.id).catch(error=>showError(error,sender.tab.id)); return {}; }
    if (message.type === 'import-chunk' && content) {
      const pending = (await chrome.storage.session.get('receiving:' + sender.tab.id))['receiving:' + sender.tab.id];
      if (!pending || !(pending.ids||[pending.id]).includes(message.id) || pending.frameId !== sender.frameId || !sameDestination(sender.url, pending.url)) throw Error('Transfert refusé.');
      const job = await getJob(message.id); if (!job) throw Error('Image expirée.');
      const offset = Number(message.offset); if (!Number.isSafeInteger(offset) || offset < 0 || offset > job.blob.size) throw Error('Position invalide.');
      const bytes = new Uint8Array(await job.blob.slice(offset, offset + 384 * 1024).arrayBuffer());
      let binary = ''; for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
      const details=pending.files?.find(file=>file.id===message.id);
      return {base64: btoa(binary), offset,total: job.blob.size,name:details?.name||job.name,mime:details?.mime||job.blob.type};
    }
    if (message.type === 'import-authorize' && content) {
      const key = 'import:' + sender.tab.id, p = (await chrome.storage.session.get(key))[key];
      if (!p || Date.now()-p.started>10*60_000 || !(p.ids||[p.id]).includes(message.id) || new URL(sender.url).origin !== new URL(p.expected).origin) throw Error('Transfert non demandé.');
      await chrome.storage.session.set({['receiving:' + sender.tab.id]: {id:p.id,ids:p.ids||[p.id],files:p.files,frameId:sender.frameId,url:sender.url}});await transferState(p,{stage:'transferring'});return {files:p.files,batch:p.batch};
    }
    if (['import-done','import-failed'].includes(message.type) && content) {
      const pending=(await chrome.storage.session.get('receiving:'+sender.tab.id))['receiving:'+sender.tab.id];
      if(!pending||pending.id!==message.id||pending.frameId!==sender.frameId||!sameDestination(sender.url,pending.url))throw Error('Accusé de transfert refusé.');
      await finishTransfer(sender.tab.id,message.type==='import-failed'?{stage:'error',error:message.error}:{stage:message.readable?'ready':'delivered',verification:message.verification});return {};
    }
    if (message.type === 'drop-job' && extension) { await deleteJob(message.id); return {}; }
    throw Error('Commande inconnue.');
  };
  void respond().then(value => reply({ok: true, value}), error => reply({ok: false, error: error.message}));
  return true;
});
