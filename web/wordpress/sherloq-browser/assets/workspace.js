import {detectWorkspaceFileKind,isBatchDrop,isWorkspaceFileDrag} from './workspace-file-routing.js';
import {diagnostic} from './runtime-context.js';
import {installHoverSliders} from './hover-sliders.js';
import {browserLanguage} from './language.js';
import {validateMediaPreferences,loupeKey,loupeSettingsKey,loupeSweepKey,imageAccept,typingEvent} from './media-settings.js';
import {mountMediaControls} from './media-controls.js';
import {bindDocumentResize} from './document-resize.js';
import {toolGroups} from './tool-tree.js';
import {isExperimentalTool} from './extension-tools.js';
import {mountAnalysisPanel} from './app.js';
import {createWorkspaceState} from './workspace-state.js';
import {createWorkspaceEnginePool} from './workspace-engine-pool.js';
import {createOriginalSourceRegionsController} from './original-source-regions-controller.js';
import {validateOriginalSourceRegions} from './original-source-regions.js';
import {createDetectionRegionsDock} from './detection-regions-dock.js';
import {createDownloadShelf} from './download-shelf.js';
import {mountSessionControls} from './session-ui.js';
import {recoverSettings,settingsFilename} from './settings.js';
import {dependencyPreferences,restoreDependencyPreferences} from './dependency-library.js';
import {preferenceAccess,recoverWorkspaceSettings,capturePreferenceBackup,downloadPreferenceBackup,mergePreferenceChanges} from './preferences-recovery.js';
import {localFeaturePolicy} from './feature-policy.js';

export function mountWorkspace(document=globalThis.document,{panelFactory=mountAnalysisPanel,fetcher=fetch,batchFactory=async options=>(await import('./batch-ui.js')).mountBatchUI(options),localManagement,pdfFactory=async options=>(await import('./pdf-reader.js')).mountPdfReader(options),originalRegionsFactory=createOriginalSourceRegionsController}={}) {
const $=id=>document.getElementById(id),state=createWorkspaceState();
let batchUI,batchOpening;
const downloadShelf=createDownloadShelf({document,parent:$('toolbox'),before:$('toolbox').querySelector('.navigation-tools'),language:()=>state.language,onError:error=>notify(error.message)});
mountSessionControls(document,{download});
const regionsDock=createDetectionRegionsDock({document,parent:$('toolbox'),before:downloadShelf.element,language:()=>state.language});
const tools=toolGroups.flatMap(g=>g.items),known=new Set(tools.map(t=>t.id)),engineFactory=createWorkspaceEnginePool();
const labels={
 fr:{batch:'Traitement par lot',file:'Fichier',open:'Ouvrir une image…',tools:'Outils',tile:'Mosaïque',cascade:'Cascade',tabs:'Onglets',closeAll:'Tout fermer',settings:'Réglages',quickExport:'Export rapide',exportImage:'Exporter l’image affichée…',exportReport:'Exporter le rapport…',saveSession:'Exporter la session…',restoreSession:'Restaurer une session…',exportSettings:'Exporter les réglages…',importSettings:'Rappeler les réglages…',compute:'Calcul',maximum:'Maximum utile',aggressive:'Agressif',navigation:'Navigation',automatic:'Automatique',mouse:'Souris',highlight:'Signaler les nouveaux outils',allSliders:'Tout en curseurs',experimental:'Activer les outils expérimentaux',experimentalDisabled:'Activez les outils expérimentaux dans les réglages pour utiliser cet outil.',about:'À propos',availability:'Je suis heureux de mettre cette application à la disposition de tous, gratuitement et sans limite de durée d’utilisation.',privacy:'Vos images et résultats restent dans ce navigateur. Aucun envoi d’image ni suivi d’utilisation par cette application.',welcome:'Ouvrez ou glissez une image pour commencer.',fit:'Ajuster',cancel:'Annuler',closeHint:'Fermer toutes les analyses et arrêter leurs calculs ? L’image originale, les réglages et les favoris seront conservés.',closeConfirm:'Fermer les analyses',ready:'Prêt.',loading:'Chargement…',favorites:'Favoris',addFavorite:'Ajouter aux favoris',removeFavorite:'Retirer des favoris',close:'Fermer',background:'calcul(s) dans les autres onglets',busyClose:'Cet onglet calcule encore. Le fermer arrêtera son calcul. Continuer ?',replace:'Ouvrir une nouvelle image fermera les analyses de l’image actuelle. Continuer ?',invalid:'Fichier de réglages invalide.',busySettings:'Les réglages pourront être rappelés après les calculs en cours.',loadedSettings:'Réglages rappelés.',sessionImage:'Ouvrez maintenant l’image originale de cette session.',missingImage:'Cette session appartient à une autre image.'},
 en:{batch:'Batch processing',file:'File',open:'Open image…',tools:'Tools',tile:'Tile',cascade:'Cascade',tabs:'Tabs',closeAll:'Close all',settings:'Settings',quickExport:'Quick export',exportImage:'Export displayed image…',exportReport:'Export report…',saveSession:'Export session…',restoreSession:'Restore session…',exportSettings:'Export settings…',importSettings:'Recall settings…',compute:'Computation',maximum:'Maximum useful',aggressive:'Aggressive',navigation:'Navigation',automatic:'Automatic',mouse:'Mouse',highlight:'Highlight new tools',allSliders:'Sliders everywhere',experimental:'Enable experimental tools',experimentalDisabled:'Enable experimental tools in Settings to use this tool.',about:'About',availability:'I am happy to make this application available to everyone, free of charge and without a usage time limit.',privacy:'Your images and results stay in this browser. This application does not upload images or track usage.',welcome:'Open or drop an image to begin.',fit:'Fit',cancel:'Cancel',closeHint:'Close all analyses and stop their calculations? The original image, settings and favorites will be kept.',closeConfirm:'Close analyses',ready:'Ready.',loading:'Loading…',favorites:'Favorites',addFavorite:'Add to favorites',removeFavorite:'Remove from favorites',close:'Close',background:'calculation(s) in other tabs',busyClose:'This tab is still calculating. Closing it will stop its calculation. Continue?',replace:'Opening a new image will close the current image analyses. Continue?',invalid:'Invalid settings file.',busySettings:'Recall settings after the running calculations finish.',loadedSettings:'Settings restored.',sessionImage:'Now open this session’s original image.',missingImage:'This session belongs to another image.'}
};
const text=key=>labels[state.language][key]||key,title=id=>state.documents.get(id)?.title??tools.find(t=>t.id===id)?.[state.language]??id;
let sourceEntry=null,sourceInput=null,currentFile=null,generation=0,framePending=false,theme='dark',savedTools={},pendingSession=null;
let computeProfile='maximum',navigationMode='auto',highlight=false,allSliders=true,experimentalTools=false,media=validateMediaPreferences(),unknownFavorites=[],lastPreferences;const toolSignatures=new Map(),dirtyTools=new Set();
const hoverSliders=installHoverSliders({root:document,enabled:false,language:()=>state.language});
const template=fetcher(new URL('./panel.html',import.meta.url)).then(async r=>{if(!r.ok)throw Error('Panel template unavailable');const page=new DOMParser().parseFromString(await r.text(),'text/html');page.querySelectorAll('script').forEach(s=>s.remove());return [...page.body.children];});
function preferences(){return {...state.preferences(),favorites:[...state.favorites,...unknownFavorites],theme,computeProfile,navigationMode,highlight,allSliders,experimentalTools,...media,dependencies:dependencyPreferences()};}
function setMedia(next){media=validateMediaPreferences(next);applyMedia();savePreferences();}
const comparisonKeys=new Set();let comparisonController=null;let pinnedController=null;
function pinLoupe(open){const next=open?state.documents.get(state.active)?.controller:null;if(next!==pinnedController){pinnedController?.pinLoupe?.(false);pinnedController=next;}pinnedController?.pinLoupe?.(!!open);return pinnedController?.loupeAnchor?.();}
const mediaUI=mountMediaControls(document,{getPreferences:()=>media,setPreferences:setMedia,onLoupePanel:pinLoupe,onSweep:group=>state.documents.get(state.active)?.controller?.toggleLoupeSweep?.(group),stopSweep:()=>state.documents.get(state.active)?.controller?.stopLoupeSweep?.(),sweepState:()=>state.documents.get(state.active)?.controller?.loupeSweepState?.(),getEffectsContext:()=>state.documents.get(state.active)?.controller?.loupeEffectsContext?.(),setEffectsContext:value=>state.documents.get(state.active)?.controller?.setLoupeEffectsContext?.(value),getEnhancementContext:()=>state.documents.get(state.active)?.controller?.loupeEnhancement?.(),setEnhancementContext:value=>state.documents.get(state.active)?.controller?.setLoupeEnhancement?.(value),language:()=>state.language,getMinimumZoom:()=>state.documents.get(state.active)?.controller?.loupeMinimum?.()??2,getImageSize:()=>state.documents.get(state.active)?.controller?.exportSize?.()});
$('image-file').accept=imageAccept+',application/pdf,.pdf';
function savePreferences(){const current=preferences();if(JSON.stringify(current)===JSON.stringify(lastPreferences))return true;const latest=preferenceAccess.read('sherloq.workspace.preferences').value||{},value=mergePreferenceChanges(lastPreferences,current,latest),saved=preferenceAccess.write('sherloq.workspace.preferences',value);if(saved)lastPreferences=structuredClone(current);return saved;}
function saveTools(){for(const record of entries())remember(record);if(!dirtyTools.size)return true;const latest=preferenceAccess.read('sherloq.workspace.tools').value||{},next={...latest};for(const id of dirtyTools)next[id]=savedTools[id];if(!preferenceAccess.write('sherloq.workspace.tools',next))return false;for(const id of dirtyTools)toolSignatures.set(id,JSON.stringify(savedTools[id]));dirtyTools.clear();savedTools=next;return true;}
function notify(message){$('workspace-status').textContent=message;}
function button(label,action,className=''){const b=document.createElement('button');b.type='button';b.textContent=label;b.className=className;b.onclick=action;return b;}
function download(value,name,options){const prepared=value instanceof Blob||value?.blob?value:new Blob([JSON.stringify(value,null,2)],{type:'application/json'});return downloadShelf.download(prepared,name,options).catch(error=>{notify(error.message);throw error;});}
function closeMenus(){for(const el of document.querySelectorAll('.app-menu'))el.open=false;}
function renderCatalog(){
 const tree=$('tool-tree');tree.replaceChildren();
 const visible=tool=>(experimentalTools||!isExperimentalTool(tool.id))&&localFeaturePolicy.isToolAvailable(tool.id);
 const groups=[...(state.favorites.size?[{en:'Favorites',fr:text('favorites'),items:tools.filter(t=>state.favorites.has(t.id))}]:[]),...toolGroups].map(group=>({...group,items:group.items.filter(visible)})).filter(group=>group.items.length);
 for(const group of groups){
  const d=document.createElement('details'),summary=document.createElement('summary');d.className='tool-group';d.open=state.groups.has(group.en);summary.textContent=group[state.language];d.append(summary);
  d.ontoggle=()=>{if(d.isConnected)state.setGroup(group.en,d.open);};
  for(const tool of group.items){const row=document.createElement('div');row.className='tool-row';
   const open=button(tool[state.language],()=>openTool(tool.id),'tool-open');open.dataset.toolId=tool.id;open.classList.toggle('active',tool.id===state.active);if(tool.newFeature)open.dataset.newFeature=tool.newFeature;
   const star=button(state.favorites.has(tool.id)?'★':'☆',()=>{state.toggleFavorite(tool.id);renderCatalog();savePreferences();},'tool-star');star.setAttribute('aria-pressed',String(state.favorites.has(tool.id)));star.setAttribute('aria-label',text(state.favorites.has(tool.id)?'removeFavorite':'addFavorite')+' · '+tool[state.language]);star.title=star.getAttribute('aria-label');row.append(open,star);d.append(row);
  }tree.append(d);
 }
}
function translate(){
 document.documentElement.lang=state.language;
 for(const e of document.querySelectorAll('[data-label]'))e.textContent=text(e.dataset.label);
 $('language-toggle').textContent=state.language==='fr'?'EN':'FR';$('language-toggle').setAttribute('aria-label',state.language==='fr'?'Display in English':'Afficher en français');
 for(const entry of entries())entry.controller?.setLanguage(state.language);
 for(const entry of entries())entry.originalRegions?.refresh();mediaUI.translate();regionsDock.translate();downloadShelf.translate();renderCatalog();renderDocuments();savePreferences();
}
function entries(){return [...new Set([sourceEntry,...state.documents.values()].filter(Boolean))];}
let settingsTimer;
function scheduleRender(){if(framePending)return;framePending=true;requestAnimationFrame(()=>{framePending=false;renderStatus();clearTimeout(settingsTimer);settingsTimer=setTimeout(saveTools,250);});}
function reportTarget(entry=state.documents.get(state.active),view=entry?.controller?.snapshot()){
 if(entry?.controller&&!entry.loading)return view?.hasReport?entry.controller:null;
 return batchUI?.canExport?batchUI:null;
}
function renderStatus(){
 const entry=state.documents.get(state.active),view=entry?.controller?.snapshot();
 regionsDock.attach(entry?.id==='original'?null:entry?.regionElement??null);regionsDock.refresh();
 for(const record of state.documents.values()){
  const busy=record.controller?.busy||record.controller?.importing||record.loading;record.element.classList.toggle('busy',!!busy);record.tab?.classList.toggle('busy',!!busy);
 }
 const background=[...state.documents.values()].filter(e=>e.id!==state.active&&e.controller?.busy).length;
 $('background-status').textContent=background?background+' '+text('background'):'';
 if(view){notify(view.status);if(view.progress===null)$('workspace-progress').removeAttribute('value');else $('workspace-progress').value=view.progress;$('zoom').value=view.zoom+'%';}
 else {notify(entry?text('loading'):text('ready'));$('workspace-progress').value=0;$('zoom').value='—';}
 $('file-info').textContent=entry?.kind==='pdf'?entry.file.name:sourceInput?.description||currentFile?.name||'';
 const available=!!entry?.controller&&!entry.loading;
 for(const id of ['fit','zoom-in','zoom-out'])$(id).disabled=!available;
 $('save-session').disabled=!available||entry.controller.capabilities?.session===false;
 $('export-image').disabled=!available||!!view.busy||!(view.hasResult||entry.id==='original');$('quick-export-image').disabled=$('export-image').disabled;$('export-report').disabled=!reportTarget(entry,view);
 const busy=entries().some(e=>e.controller?.busy||e.loading);$('import-settings').disabled=busy;$('restore-session').disabled=busy;
}
function renderDocuments(){
 syncComparison();mediaUI.sync();if(mediaUI.loupeOpen?.())mediaUI.positionLoupe(pinLoupe(true));
 const tabs=$('workspace-tabs');tabs.replaceChildren();tabs.hidden=state.layout!=='tabs'||!state.documents.size;
 $('workspace-desk').dataset.layout=state.layout;$('welcome').hidden=!!state.documents.size;
 const count=state.documents.size,desk=$('workspace-desk'),columns=Math.max(1,Math.min(count,Math.round(Math.sqrt(count*(desk.clientWidth||800)/(desk.clientHeight||600))))),rows=Math.max(1,Math.ceil(count/columns));
 desk.style.setProperty('--tile-basis',`calc((100% - ${(columns-1)*5}px) / ${columns})`);desk.style.setProperty('--tile-default-height',`max(260px, calc((100% - ${(rows-1)*5}px) / ${rows}))`);
 let index=0;
 for(const record of state.documents.values()){
  const selected=record.id===state.active;record.element.hidden=state.layout==='tabs'&&!selected;record.element.classList.toggle('selected',selected);record.element.style.zIndex=selected?'2':'1';
  record.element.querySelector('.window-name').textContent=title(record.id);record.element.querySelector('.window-resize').setAttribute('aria-label',state.language==='fr'?'Redimensionner la fenêtre':'Resize window');record.element.querySelector('.window-close').setAttribute('aria-label',text('close')+' · '+title(record.id));
  if(!record.position){record.element.style.setProperty('--window-x',(index%8)*24+'px');record.element.style.setProperty('--window-y',(index%8)*25+'px');}index++;
  const tab=document.createElement('div');tab.className='document-tab';tab.classList.toggle('selected',selected);
  const select=button(title(record.id),()=>selectDocument(record.id),'tab-label');select.setAttribute('role','tab');select.setAttribute('aria-selected',String(selected));select.setAttribute('aria-controls',record.element.id);
  const close=button('×',()=>closeDocument(record.id),'tab-close');close.setAttribute('aria-label',text('close')+' · '+title(record.id));tab.append(select,close);tabs.append(tab);record.tab=tab;
  if(!record.element.hidden)requestAnimationFrame(()=>record.controller?.activate());
 }
 for(const mode of ['tabs','tile','cascade'])$('layout-'+mode).setAttribute('aria-pressed',String(state.layout===mode));
 $('workspace-app').classList.toggle('tools-hidden',!state.toolsVisible);$('toggle-tools').setAttribute('aria-pressed',String(state.toolsVisible));
 for(const item of $('tool-tree').querySelectorAll('[data-tool-id]'))item.classList.toggle('active',item.dataset.toolId===state.active);
 renderStatus();
}
function selectDocument(id){if(state.active!==id)state.documents.get(state.active)?.controller?.stopLoupeSweep?.();state.select(id);renderDocuments();}
function scopedDocument(root,host){return {
 getElementById:id=>root.getElementById(id),querySelectorAll:selector=>root.querySelectorAll(selector),createElement:tag=>document.createElement(tag),
 get documentElement(){return host;},fonts:document.fonts,
 addEventListener:(...args)=>root.addEventListener(...args),get fullscreenElement(){return document.fullscreenElement;},exitFullscreen:()=>document.exitFullscreen()
};}
function createEntry(id,{pdf=false}={}){
 const record={id,loading:true,generation,element:document.createElement('section'),regionElement:document.createElement('div'),originalRegionsElement:document.createElement('div'),originalRegions:null,controller:null,position:false};record.regionElement.hidden=true;record.originalRegionsElement.hidden=true;record.originalRegionsElement.className='original-source-controls-owner';
 record.element.id='document-'+crypto.randomUUID();record.element.className='document-window';
 const header=document.createElement('header'),name=document.createElement('span'),panel=document.createElement('div');name.className='window-name';panel.className='panel-host';
 header.append(name,button('×',()=>closeDocument(id),'window-close'));const resize=button('◢',()=>{},'window-resize');resize.setAttribute('aria-label',state.language==='fr'?'Redimensionner la fenêtre':'Resize window');record.element.append(header,panel,resize);bindDocumentResize(resize,record.element,{layout:()=>state.layout,desk:()=>$('workspace-desk')});$('workspace-desk').append(record.element);
 record.element.addEventListener('pointerdown',()=>{if(state.active!==id)selectDocument(id);},{capture:true});
 let drag=null;header.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0||state.layout!=='cascade')return;const bounds=record.element.getBoundingClientRect();drag={x:e.clientX-bounds.left,y:e.clientY-bounds.top};header.setPointerCapture(e.pointerId);});
 header.addEventListener('pointermove',e=>{if(!drag)return;const bounds=$('workspace-desk').getBoundingClientRect(),x=Math.max(0,Math.min(bounds.width-record.element.offsetWidth,e.clientX-bounds.left-drag.x)),y=Math.max(0,Math.min(bounds.height-26,e.clientY-bounds.top-drag.y));record.element.style.setProperty('--window-x',x+'px');record.element.style.setProperty('--window-y',y+'px');record.position=true;});
 const endDrag=()=>drag=null;header.addEventListener('pointerup',endDrag);header.addEventListener('pointercancel',endDrag);
 if(pdf){
  record.ready=Promise.resolve().then(async()=>{
   if(record.closed)return null;
   const controller=await pdfFactory({document,parent:panel,file:record.file,language:state.language,theme,computeProfile,navigationMode,loupe:media.loupe,download,requestExport:(task,size)=>mediaUI.requestExport(task,size),onLoupeChange:value=>setMedia({...media,loupe:value}),onEffectsState:value=>{if(record.id===state.active)mediaUI.effectsState(value);},onInspect:file=>openImage(file,{preservePdfs:true}),changed:scheduleRender});
   if(record.closed){await controller.dispose();return null;}record.controller=controller;record.loading=false;controller.setTheme?.(theme);controller.setNavigation?.(navigationMode);controller.setLoupe?.(media.loupe);scheduleRender();return controller;
  });return record;
 }
 record.ready=template.then(nodes=>{
  if(record.closed||record.generation!==generation)return null;
  const root=panel.attachShadow({mode:'open'});
  for(const name of ['app.css','tool-workspace.css','panel.css']){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL(name,import.meta.url).href;link.onload=()=>record.controller?.fit();root.append(link);}
  for(const node of nodes)root.append(document.importNode(node,true));
  record.controller=panelFactory(scopedDocument(root,panel),{managed:true,regionParent:record.regionElement,download,toolId:id,sourceOnly:id==='original',language:state.language,theme,computeProfile,engineFactory,getAllSliders:()=>allSliders,requestExport:task=>mediaUI.requestExport(task),openLoupeSettings:()=>mediaUI.openLoupe(),onLoupeContextChange:()=>mediaUI.sync(),onLoupeSweepChange:()=>mediaUI.sync(),onLoupeEffectsState:value=>{if(record.id===state.active)mediaUI.effectsState(value);},exportOriginalImage:settings=>sourceEntry?.controller?.exportImage(settings),onLoupeChange:value=>setMedia({...media,loupe:value}),sourceInput:()=>sourceInput,getOriginalSourceRegions:()=>sourceEntry?.originalRegions?.snapshot()??null,getOriginalRegionsHighlight:()=>sourceEntry?.originalRegions?.highlight??null,onOriginalRegionsKeydown:event=>sourceEntry?.originalRegions?.keydown(event)??false,restoreOriginalSourceRegions:value=>restoreOriginalSourceRegions(value),visible:()=>!record.element.hidden&&!record.closed,changed:scheduleRender});
  if(id==='original'){let controls=root.getElementById('tool-controls');if(!controls){controls=document.createElement('section');controls.id='tool-controls';root.getElementById('analysis-controls').after(controls);}controls.classList.add('original-source-controls');controls.append(record.originalRegionsElement);controls.hidden=false;}
  if(savedTools[id])record.controller.applySettings(savedTools[id]);
  record.controller.setNavigation(navigationMode);record.controller.setTheme(theme);record.controller.setHighlight?.(highlight);record.controller.setLoupe?.(media.loupe);
  return record.controller;
 }).catch(error=>{record.loading=false;record.error=error;notify(error.message);throw error;});
 return record;
}
async function openPDF(input){
 const file=/\.pdf$/i.test(input.name)&&input.type==='application/pdf'?input:new File([input],/\.pdf$/i.test(input.name)?input.name:input.name+'.pdf',{type:'application/pdf'});
 const id='pdf:'+crypto.randomUUID(),record=createEntry(id,{pdf:true});record.kind='pdf';record.title=file.name;record.file=file;state.open(id,record);renderDocuments();
 try{await record.ready;record.loading=false;renderDocuments();return record;}catch(error){record.loading=false;record.error=error;notify(error.message);return record;}
}
async function openTool(id){
 diagnostic({level:'info',kind:'tool.open',operation:id});
 if(!known.has(id))return;
 if(!experimentalTools&&isExperimentalTool(id)){notify(text('experimentalDisabled'));return;}
 if(!localFeaturePolicy.isToolAvailable(id)){notify(state.language==='fr'?'Cette fonction a été désinstallée. Réinstallez-la dans les réglages locaux.':'This feature was uninstalled. Reinstall it in local settings.');return;}
 const reader=state.documents.get(state.active);if(reader?.kind==='pdf'){const epoch=generation,file=await reader.controller?.selectedFile();if(reader.closed||state.documents.get(reader.id)!==reader||state.active!==reader.id||generation!==epoch)return;if(!file){notify(state.language==='fr'?'Attendez la première page.':'Wait for the first page.');return;}await openImage(file,{preservePdfs:true,confirmReplace:false});if(reader.closed||state.documents.get(reader.id)!==reader)return;}
 if(state.documents.has(id)){selectDocument(id);return;}
 if(!currentFile){pickImage();return;}
 if(id==='inspection.magnifier'&&!media.loupe.enabled)setMedia({...media,loupe:{...media.loupe,enabled:true}});
 if(id==='original'&&sourceEntry){sourceEntry.closed=false;state.open(id,sourceEntry);$('workspace-desk').append(sourceEntry.element);selectDocument(id);return;}
 const record=createEntry(id);state.open(id,record);renderDocuments();
 try{const controller=await record.ready,input=await sourceEntry.inputReady;if(!controller||record.closed||record.generation!==generation)return;controller.adopt({...input,sourceRegions:sourceEntry.originalRegions?.serialize()??null});record.loading=false;renderDocuments();}
 catch(error){record.loading=false;notify(error.message);}
}
function remember(record){if(known.has(record.id)&&record.controller?.settings){const value=record.controller.settings();savedTools[record.id]=value;if(JSON.stringify(value)!==toolSignatures.get(record.id))dirtyTools.add(record.id);}}
async function disposeEntry(record){await record.originalRegions?.dispose();return record.ready.then(controller=>controller?.dispose());}
async function closeDocument(id,{force=false}={}){
 diagnostic({level:'info',kind:'tool.close',operation:id});
 const record=state.documents.get(id);if(!record)return;
 if(!force&&record.controller?.busy&&!confirm(text('busyClose')))return;
 remember(record);saveTools();state.close(id);record.element.remove();
 if(record===sourceEntry&&[...state.documents.values()].some(value=>value.kind!=='pdf')){record.element.hidden=true;renderDocuments();return;}
 record.closed=true;const closing=[record];if(record===sourceEntry){sourceEntry=null;sourceInput=null;currentFile=null;}
 if(![...state.documents.values()].some(value=>value.kind!=='pdf')){if(sourceEntry&&sourceEntry!==record){sourceEntry.closed=true;sourceEntry.element.remove();closing.push(sourceEntry);}sourceEntry=null;sourceInput=null;currentFile=null;$('image-file').value='';}
 // Remove the view immediately; a queued worker cleanup may wait for another job.
 renderDocuments();await Promise.allSettled(closing.map(disposeEntry));
}
async function closeAll({preservePdfs=false}={}){
 generation++;const kept=preservePdfs?entries().filter(record=>record.kind==='pdf'):[],previous=entries().filter(record=>!kept.includes(record));state.clear();for(const record of kept){record.generation=generation;state.open(record.id,record);}sourceEntry=null;sourceInput=null;currentFile=null;pendingSession=null;$('image-file').value='';
 for(const record of previous){remember(record);record.closed=true;record.element.remove();}
 saveTools();
 renderDocuments();await Promise.allSettled(previous.map(disposeEntry));
}
async function closeAnalyses(){
 const original=sourceEntry;if(!original)return closeAll({preservePdfs:true});
 const closing=entries().filter(record=>record!==original&&record.kind!=='pdf');
 for(const record of closing){remember(record);record.closed=true;state.close(record.id);record.element.remove();}
 // The source may have been hidden by its own close button while analyses kept
 // it alive. Put that same owner back; never decode or load the image again.
 state.open('original',original);if(!original.element.isConnected)$('workspace-desk').append(original.element);
 original.element.hidden=false;saveTools();renderDocuments();
 await Promise.allSettled(closing.map(disposeEntry));
}
async function openImage(file,{preservePdfs=true,confirmReplace=true}={}){
 if(!file)return;const epoch=generation,kind=await detectWorkspaceFileKind(file);if(epoch!==generation)return;if(kind==='pdf')return openPDF(file);if(confirmReplace&&currentFile&&!confirm(text('replace')))return;
 const session=pendingSession;await closeAll({preservePdfs});pendingSession=session;currentFile=file;
 const record=createEntry('original');sourceEntry=record;state.open('original',record);renderDocuments();
 record.inputReady=record.ready.then(async controller=>{
  if(!controller)return null;await controller.load(file);
  if(record.closed||record.generation!==generation)return null;
  sourceInput=controller.input();
  record.originalRegions=originalRegionsFactory({document,parent:record.originalRegionsElement,presentation:'toolbar',source:()=>{const input=record.controller?.input();return input?.file&&input.source?{blob:input.file,name:input.file.name,id:input.imageId,width:input.source.width,height:input.source.height,sourceSha256:input.hash}:null;},language:()=>state.language,computeProfile:()=>computeProfile,navigationMode:()=>navigationMode,getClient:()=>record.controller.regionDetectionClient(),onHighlight:()=>record.controller?.refreshOriginalRegions?.(),onError:error=>notify(error.message),onOpenBatch:snapshot=>openOriginalInBatch(record,snapshot),onChange:snapshot=>{if(record.closed||record!==sourceEntry)return;sourceInput={...sourceInput,sourceRegions:snapshot};record.controller?.refreshOriginalRegions?.();for(const entry of entries())if(entry!==record&&entry.kind!=='pdf')entry.controller?.markSourceRegionsStale?.(snapshot);scheduleRender();}});
  await record.originalRegions.ready;if(record.closed||record.generation!==generation){await record.originalRegions.dispose();return null;}sourceInput={...controller.input(),sourceRegions:record.originalRegions.serialize()};record.loading=false;renderDocuments();return sourceInput;
 });
 try{await record.inputReady;if(pendingSession)await applySession(pendingSession);}
 catch(error){record.loading=false;notify(error.message);}
}
function pickImage(){closeMenus();$('image-file').value='';$('image-file').click();}
async function ensureBatch(){if(!batchUI){batchOpening??=Promise.resolve().then(()=>batchFactory({document,download,language:()=>state.language,computeProfile:()=>computeProfile,getNavigationMode:()=>navigationMode,onInspect:openImage,onChange:scheduleRender})).then(ui=>batchUI=ui).finally(()=>batchOpening=null);await batchOpening;}return batchUI;}
async function openOriginalInBatch(record,snapshot){await record.originalRegions.ready;if(record.closed||record!==sourceEntry)throw Error('The original source is no longer open.');const input=record.controller.input(),verified=await validateOriginalSourceRegions(snapshot,{sourceSha256:input.hash,width:input.source.width,height:input.source.height}),batch=await ensureBatch();if(typeof batch.importSource!=='function')throw Object.assign(Error(state.language==='fr'?'Le transfert des zones vers le lot n’est pas encore disponible.':'Source-region batch transfer is not available yet.'),{code:'BATCH_SOURCE_REGIONS_NOT_READY'});await batch.importSource({file:input.file,sourceRegions:verified});batch.open();}
if($('batch-open'))$('batch-open').onclick=async()=>{closeMenus();try{(await ensureBatch()).open();}catch(error){notify(error.message);}};

for(const id of ['open-image','open-file-menu','welcome-open'])$(id).onclick=pickImage;
$('image-file').onchange=e=>void openImage(e.target.files[0]);
$('toggle-tools').onclick=()=>{state.toggleTools();renderDocuments();savePreferences();};
for(const mode of ['tabs','tile','cascade'])$('layout-'+mode).onclick=()=>{state.setLayout(mode);renderDocuments();savePreferences();};
$('language-toggle').onclick=()=>{state.setLanguage(state.language==='fr'?'en':'fr');translate();};
$('theme-toggle').onclick=()=>{theme=theme==='light'?'dark':'light';document.documentElement.dataset.theme=theme;for(const record of entries())record.controller?.setTheme(theme);savePreferences();};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){notify(e.message);}};
$('close-all').onclick=()=>{if(!state.documents.size)return;$('close-dialog').showModal();};$('cancel-close').onclick=()=>$('close-dialog').close();$('confirm-close').onclick=()=>{$('close-dialog').close();void closeAnalyses();};
const active=()=>state.documents.get(state.active)?.controller;
$('fit').onclick=()=>{active()?.fit();scheduleRender();};$('zoom-in').onclick=()=>{active()?.zoomBy(1.25);scheduleRender();};$('zoom-out').onclick=()=>{active()?.zoomBy(.8);scheduleRender();};
$('quick-export-image').onclick=()=>{closeMenus();void active()?.exportImage({...media.quickExport});};
$('export-image').onclick=()=>{closeMenus();void active()?.exportImage();};$('export-report').onclick=()=>{closeMenus();return reportTarget()?.exportReport();};$('save-session').onclick=()=>{closeMenus();active()?.saveSession?.();};
$('background-status').onclick=()=>{const next=[...state.documents.values()].find(e=>e.id!==state.active&&e.controller?.busy);if(next)selectDocument(next.id);};
$('compute-profile').onchange=()=>{computeProfile=$('compute-profile').value;for(const record of entries())record.controller?.setComputeProfile(computeProfile);savePreferences();};
$('navigation-mode').onchange=()=>{navigationMode=$('navigation-mode').value;for(const record of entries())record.controller?.setNavigation(navigationMode);savePreferences();};
$('all-sliders').onchange=()=>{allSliders=$('all-sliders').checked;hoverSliders.setEnabled(allSliders);savePreferences();};
$('highlight-tools').onchange=()=>{highlight=$('highlight-tools').checked;$('workspace-app').classList.toggle('highlight-new-features',highlight);for(const entry of entries())entry.controller?.setHighlight?.(highlight);savePreferences();};
$('experimental-tools').onchange=()=>{experimentalTools=$('experimental-tools').checked;syncExperimentalTools();renderCatalog();savePreferences();};
$('export-settings').onclick=()=>{saveTools();download({schema:'sherloq.workspace/1',preferences:preferences(),tools:savedTools},settingsFilename());closeMenus();};
$('import-settings').onclick=()=>{closeMenus();$('settings-file').value='';$('settings-file').click();};
$('settings-file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(entries().some(e=>e.controller?.busy))throw Error(text('busySettings'));if(file.size>2*1024**2)throw Error(text('invalid'));
  const value=JSON.parse(await file.text());let nextTools,nextPreferences,recovery;
  if(value.schema==='sherloq.settings/1'){recovery=recoverSettings(value);nextTools={...savedTools,[state.active||'ela.classic']:recovery.value};nextPreferences={...preferences(),...recovery.value.preferences};}
  else{recovery=recoverWorkspaceSettings(value,{fallback:{schema:'sherloq.workspace/1',preferences:preferences(),tools:savedTools}});nextTools=recovery.value.tools;nextPreferences=recovery.value.preferences;}
  const candidate=createWorkspaceState();candidate.restore(nextPreferences,[...known]);const nextMedia=validateMediaPreferences(nextPreferences);
  saveTools();const rescue=await capturePreferenceBackup();rescue.importedSource=value;rescue.importedReport=recovery.issues;downloadPreferenceBackup(document,rescue);
  unknownFavorites=(nextPreferences.favorites||[]).filter(id=>!known.has(id));
  media=nextMedia;savedTools=nextTools;for(const id of Object.keys(nextTools))dirtyTools.add(id);state.restore(candidate.preferences(),[...known]);theme=['light','dark'].includes(nextPreferences.theme)?nextPreferences.theme:theme;computeProfile=['maximum','aggressive'].includes(nextPreferences.computeProfile)?nextPreferences.computeProfile:computeProfile;navigationMode=['auto','mouse','trackpad'].includes(nextPreferences.navigationMode)?nextPreferences.navigationMode:navigationMode;highlight=nextPreferences.highlight===true;allSliders=nextPreferences.allSliders!==false;experimentalTools=nextPreferences.experimentalTools===true;
  for(const record of entries())if(savedTools[record.id])record.controller?.applySettings?.(savedTools[record.id]);
  restoreDependencyPreferences(nextPreferences.dependencies);applyPreferences();translate();saveTools();notify(text('loadedSettings')+(recovery.issues.length?' · '+recovery.issues.length+(state.language==='fr'?' entrée(s) conservée(s) dans la sauvegarde de secours.':' entry/entries retained in the recovery backup.'):''));
 }catch(error){notify(error.message);}
};
async function restoreOriginalSourceRegions(value){if(!value)return;const owner=sourceEntry?.originalRegions;if(!owner)throw Error(text('sessionImage'));await owner.ready;const input=sourceEntry.controller.input(),verified=await validateOriginalSourceRegions(value,{sourceSha256:input.hash,width:input.source.width,height:input.source.height});await owner.restore(verified);}
async function applySession(value){
 const id=value.operation==='ela.energy'?'ela.classic':value.operation;if(!known.has(id))throw Error(text('invalid'));
 if(!experimentalTools&&isExperimentalTool(id))throw Error(text('experimentalDisabled'));
 if(!sourceInput){pendingSession=value;notify(text('sessionImage'));pickImage();return;}
 if(value.sha256&&value.sha256!==sourceInput.hash)throw Error(text('missingImage'));
 if(value.originalSourceRegions)await restoreOriginalSourceRegions(value.originalSourceRegions);
 await openTool(id);const record=state.documents.get(id);if(!record)return;const controller=await record.ready;
 if(record.closed)return;if(id==='original'){pendingSession=null;renderDocuments();return;}await controller.restoreSession(new Blob([JSON.stringify(value)],{type:'application/json'}));controller.adopt({...sourceInput,sourceRegions:value.sourceRegions??sourceEntry.originalRegions?.serialize()??null});record.loading=false;pendingSession=null;renderDocuments();
}
$('restore-session').onclick=()=>{closeMenus();$('session-file').value='';$('session-file').click();};$('session-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1024**2)throw Error(text('invalid'));const value=JSON.parse(await file.text());if(value.schema!=='sherloq.session/1')throw Error(text('invalid'));await applySession(value);}catch(e){notify(e.message);}};
const isFileDrag=isWorkspaceFileDrag;
const batchOwnsDrop=e=>isBatchDrop(e)||batchUI?.dialog?.open;
document.addEventListener('dragover',e=>{if(!isFileDrag(e))return;if(batchOwnsDrop(e)){e.preventDefault();return;}e.preventDefault();$('workspace-desk').classList.add('file-drag');});
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)$('workspace-desk').classList.remove('file-drag');});
document.addEventListener('drop',e=>{if(!isFileDrag(e))return;$('workspace-desk').classList.remove('file-drag');if(e.defaultPrevented)return;if(batchOwnsDrop(e)){e.preventDefault();if(batchUI?.dialog?.open)void batchUI.importFiles([...e.dataTransfer.files]);return;}e.preventDefault();void openImage(e.dataTransfer.files[0]);});

function syncComparison(){const next=comparisonKeys.size?state.documents.get(state.active)?.controller:null;if(next===comparisonController)return;comparisonController?.setCompareOriginal?.(false);comparisonController=next;comparisonController?.setCompareOriginal?.(true);}
function clearComparison(){comparisonKeys.clear();syncComparison();}
document.addEventListener('keydown',e=>{
 if(e.defaultPrevented||document.querySelector('dialog[open]:not(#loupe-dialog)'))return;
 if(loupeSweepKey(e)){e.preventDefault();const c=state.documents.get(state.active)?.controller,chosen=mediaUI.activeEffect();c?.toggleLoupeSweep?.((c?.loupeEffectsContext?.()??media.loupe.effects)[chosen]?.enabled?chosen:undefined);return;}
 if(loupeSettingsKey(e)){e.preventDefault();mediaUI.toggleLoupe();return;}
 if(e.key==='Escape'&&mediaUI.loupeOpen()){e.preventDefault();mediaUI.closeLoupe();return;}
 if(loupeKey(e)){e.preventDefault();setMedia({...media,loupe:{...media.loupe,enabled:!media.loupe.enabled}});return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();pickImage();return;}
 if(!e.ctrlKey&&!e.metaKey&&!e.isComposing&&!typingEvent(e)&&(e.key==='Alt'||e.key.toLowerCase()==='o')){e.preventDefault();comparisonKeys.add(e.key==='Alt'?'Alt':'o');syncComparison();return;}
 if(!typingEvent(e))state.documents.get(state.active)?.controller?.loupeKeydown?.(e);
});
document.addEventListener('keyup',e=>{if(e.key==='Alt'||e.key.toLowerCase()==='o'){comparisonKeys.delete(e.key==='Alt'?'Alt':'o');syncComparison();}});
window.addEventListener('blur',clearComparison);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearComparison();});

function applyMedia(){document.documentElement.style.setProperty('--ui-font',media.font==='montserrat'?'"Montserrat", Arial, sans-serif':'"iowan-old-style-bt", "Iowan Old Style", Georgia, serif');mediaUI.sync();for(const record of entries())record.controller?.setLoupe?.(media.loupe);}
function syncExperimentalTools(){
 $('experimental-tools').checked=experimentalTools;
 if(!experimentalTools)for(const record of [...state.documents.values()])if(isExperimentalTool(record.id))void closeDocument(record.id,{force:true});
}
function applyPreferences(){syncExperimentalTools();$('all-sliders').checked=allSliders;hoverSliders.setEnabled(allSliders);document.documentElement.dataset.theme=theme;applyMedia();$('compute-profile').value=computeProfile;$('navigation-mode').value=navigationMode;$('highlight-tools').checked=highlight;$('workspace-app').classList.toggle('highlight-new-features',highlight);for(const record of entries()){record.controller?.setTheme(theme);record.controller?.setHighlight?.(highlight);record.controller?.setNavigation(navigationMode);record.controller?.setComputeProfile(computeProfile);}}
state.setLanguage(browserLanguage(document.defaultView?.navigator??globalThis.navigator));
const storedPreferences=preferenceAccess.read('sherloq.workspace.preferences'),saved=storedPreferences.value;
if(saved){media=validateMediaPreferences(saved);unknownFavorites=(saved.favorites||[]).filter(id=>!known.has(id));state.restore(saved,[...known]);theme=['light','dark'].includes(saved.theme)?saved.theme:theme;computeProfile=['maximum','aggressive'].includes(saved.computeProfile)?saved.computeProfile:computeProfile;navigationMode=['auto','mouse','trackpad'].includes(saved.navigationMode)?saved.navigationMode:navigationMode;highlight=saved.highlight===true;allSliders=saved.allSliders!==false;experimentalTools=saved.experimentalTools===true;restoreDependencyPreferences(saved.dependencies);}
savedTools=preferenceAccess.read('sherloq.workspace.tools').value||{};
for(const [id,value]of Object.entries(savedTools))toolSignatures.set(id,JSON.stringify(value));lastPreferences=preferences();
const query=new URLSearchParams(location.hash.slice(1));if(['fr','en'].includes(query.get('lang')))state.setLanguage(query.get('lang'));
try{const home=new URL(query.get('home')||'../../../../',location.href);if(home.origin===location.origin)$('home').href=home.href;}catch{}
applyPreferences();translate();renderDocuments();
if(storedPreferences.issues.length)notify(state.language==='fr'?'Réglages récupérés partiellement. L’original reste conservé ; exportez la sauvegarde de secours dans les réglages locaux.':'Settings partially recovered. The original is retained; export a recovery backup from local settings.');
window.addEventListener('local-feature-change',renderCatalog);
window.addEventListener('pagehide',()=>{clearTimeout(settingsTimer);saveTools();savePreferences();});
localManagement?.mount(document,{isBusy:()=>entries().some(entry=>entry.loading||entry.controller?.busy)||!!batchUI?.busy,onBeforeBackup:()=>{saveTools();savePreferences();},onFreeze:value=>{if(value){saveTools();savePreferences();}$('workspace-app').inert=value;},onPolicyChange:renderCatalog});

return {state,openImage,openPDF,openTool,closeAll,closeAnalyses,selectDocument,closeDocument,savePreferences,saveTools,restoreOriginalSourceRegions};
}
