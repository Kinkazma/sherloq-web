import {diagnostic} from './runtime-context.js';
import {browserLanguage} from './language.js';
import {validateMediaPreferences,loupeKey,loupeSettingsKey,loupeSweepKey,imageAccept,typingEvent} from './media-settings.js';
import {mountMediaControls} from './media-controls.js';
import {bindDocumentResize} from './document-resize.js';
import {toolGroups} from './tool-tree.js';
import {mountAnalysisPanel} from './app.js';
import {createWorkspaceState} from './workspace-state.js';
import {createWorkspaceEnginePool} from './workspace-engine-pool.js';
import {validateSettings,settingsFilename} from './settings.js';
import {dependencyPreferences,restoreDependencyPreferences} from './dependency-library.js';

export function mountWorkspace(document=globalThis.document,{panelFactory=mountAnalysisPanel,fetcher=fetch}={}) {
const $=id=>document.getElementById(id),state=createWorkspaceState();
const tools=toolGroups.flatMap(g=>g.items),known=new Set(tools.map(t=>t.id)),engineFactory=createWorkspaceEnginePool();
const labels={
 fr:{file:'Fichier',open:'Ouvrir une image…',tools:'Outils',tile:'Mosaïque',cascade:'Cascade',tabs:'Onglets',closeAll:'Tout fermer',settings:'Réglages',quickExport:'Export rapide',exportImage:'Exporter l’image affichée…',exportReport:'Exporter le rapport…',saveSession:'Exporter la session…',restoreSession:'Restaurer une session…',exportSettings:'Exporter les réglages…',importSettings:'Rappeler les réglages…',compute:'Calcul',maximum:'Maximum utile',aggressive:'Agressif',navigation:'Navigation',automatic:'Automatique',mouse:'Souris',highlight:'Signaler les nouveaux outils',about:'À propos',availability:'Je suis heureux de mettre cette application à la disposition de tous, gratuitement et sans limite de durée d’utilisation.',privacy:'Vos images et résultats restent dans ce navigateur. Aucun envoi d’image ni suivi d’utilisation par cette application.',welcome:'Ouvrez ou glissez une image pour commencer.',fit:'Ajuster',cancel:'Annuler',closeHint:'Fermer tous les documents et arrêter leurs calculs ? Les réglages et favoris seront conservés.',closeConfirm:'Tout fermer et réinitialiser',ready:'Prêt.',loading:'Chargement…',favorites:'Favoris',addFavorite:'Ajouter aux favoris',removeFavorite:'Retirer des favoris',close:'Fermer',background:'calcul(s) dans les autres onglets',busyClose:'Cet onglet calcule encore. Le fermer arrêtera son calcul. Continuer ?',replace:'Ouvrir une nouvelle image fermera les analyses de l’image actuelle. Continuer ?',invalid:'Fichier de réglages invalide.',busySettings:'Les réglages pourront être rappelés après les calculs en cours.',loadedSettings:'Réglages rappelés.',sessionImage:'Ouvrez maintenant l’image originale de cette session.',missingImage:'Cette session appartient à une autre image.'},
 en:{file:'File',open:'Open image…',tools:'Tools',tile:'Tile',cascade:'Cascade',tabs:'Tabs',closeAll:'Close all',settings:'Settings',quickExport:'Quick export',exportImage:'Export displayed image…',exportReport:'Export report…',saveSession:'Export session…',restoreSession:'Restore session…',exportSettings:'Export settings…',importSettings:'Recall settings…',compute:'Computation',maximum:'Maximum useful',aggressive:'Aggressive',navigation:'Navigation',automatic:'Automatic',mouse:'Mouse',highlight:'Highlight new tools',about:'About',availability:'I am happy to make this application available to everyone, free of charge and without a usage time limit.',privacy:'Your images and results stay in this browser. This application does not upload images or track usage.',welcome:'Open or drop an image to begin.',fit:'Fit',cancel:'Cancel',closeHint:'Close all documents and stop their calculations? Settings and favorites will be kept.',closeConfirm:'Close all and reset',ready:'Ready.',loading:'Loading…',favorites:'Favorites',addFavorite:'Add to favorites',removeFavorite:'Remove from favorites',close:'Close',background:'calculation(s) in other tabs',busyClose:'This tab is still calculating. Closing it will stop its calculation. Continue?',replace:'Opening a new image will close the current image analyses. Continue?',invalid:'Invalid settings file.',busySettings:'Recall settings after the running calculations finish.',loadedSettings:'Settings restored.',sessionImage:'Now open this session’s original image.',missingImage:'This session belongs to another image.'}
};
const text=key=>labels[state.language][key]||key,title=id=>tools.find(t=>t.id===id)?.[state.language]||id;
let sourceEntry=null,sourceInput=null,currentFile=null,generation=0,framePending=false,theme='dark',savedTools={},pendingSession=null;
let computeProfile='maximum',navigationMode='auto',highlight=false,media=validateMediaPreferences();
const template=fetcher(new URL('./panel.html',import.meta.url)).then(async r=>{if(!r.ok)throw Error('Panel template unavailable');const page=new DOMParser().parseFromString(await r.text(),'text/html');page.querySelectorAll('script').forEach(s=>s.remove());return [...page.body.children];});
function preferences(){return {...state.preferences(),theme,computeProfile,navigationMode,highlight,...media,dependencies:dependencyPreferences()};}
function setMedia(next){media=validateMediaPreferences(next);applyMedia();savePreferences();}
const comparisonKeys=new Set();let comparisonController=null;let pinnedController=null;
function pinLoupe(open){const next=open?state.documents.get(state.active)?.controller:null;if(next!==pinnedController){pinnedController?.pinLoupe?.(false);pinnedController=next;}pinnedController?.pinLoupe?.(!!open);return pinnedController?.loupeAnchor?.();}
const mediaUI=mountMediaControls(document,{getPreferences:()=>media,setPreferences:setMedia,onLoupePanel:pinLoupe,onSweep:group=>state.documents.get(state.active)?.controller?.toggleLoupeSweep?.(group),stopSweep:()=>state.documents.get(state.active)?.controller?.stopLoupeSweep?.(),sweepState:()=>state.documents.get(state.active)?.controller?.loupeSweepState?.(),getEffectsContext:()=>state.documents.get(state.active)?.controller?.loupeEffectsContext?.(),setEffectsContext:value=>state.documents.get(state.active)?.controller?.setLoupeEffectsContext?.(value),getEnhancementContext:()=>state.documents.get(state.active)?.controller?.loupeEnhancement?.(),setEnhancementContext:value=>state.documents.get(state.active)?.controller?.setLoupeEnhancement?.(value),language:()=>state.language,getMinimumZoom:()=>state.documents.get(state.active)?.controller?.loupeMinimum?.()??2,getImageSize:()=>state.documents.get(state.active)?.controller?.exportSize?.()});
$('image-file').accept=imageAccept;
function savePreferences(){try{localStorage.setItem('sherloq.workspace.preferences',JSON.stringify(preferences()));}catch{}}
function notify(message){$('workspace-status').textContent=message;}
function button(label,action,className=''){const b=document.createElement('button');b.type='button';b.textContent=label;b.className=className;b.onclick=action;return b;}
function download(value,name){const blob=value instanceof Blob?value:new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function closeMenus(){for(const el of document.querySelectorAll('.app-menu'))el.open=false;}
function renderCatalog(){
 const tree=$('tool-tree');tree.replaceChildren();
 const groups=[...(state.favorites.size?[{en:'Favorites',fr:text('favorites'),items:tools.filter(t=>state.favorites.has(t.id))}]:[]),...toolGroups];
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
 mediaUI.translate();renderCatalog();renderDocuments();savePreferences();
}
function entries(){return [...new Set([sourceEntry,...state.documents.values()].filter(Boolean))];}
function scheduleRender(){if(framePending)return;framePending=true;requestAnimationFrame(()=>{framePending=false;renderStatus();});}
function renderStatus(){
 const entry=state.documents.get(state.active),view=entry?.controller?.snapshot();
 for(const record of state.documents.values()){
  const busy=record.controller?.busy||record.loading;record.element.classList.toggle('busy',!!busy);record.tab?.classList.toggle('busy',!!busy);
 }
 const background=[...state.documents.values()].filter(e=>e.id!==state.active&&e.controller?.busy).length;
 $('background-status').textContent=background?background+' '+text('background'):'';
 if(view){notify(view.status);if(view.progress===null)$('workspace-progress').removeAttribute('value');else $('workspace-progress').value=view.progress;$('zoom').value=view.zoom+'%';}
 else {notify(entry?text('loading'):text('ready'));$('workspace-progress').value=0;$('zoom').value='—';}
 $('file-info').textContent=sourceInput?.description||currentFile?.name||'';
 const available=!!entry?.controller&&!entry.loading;
 for(const id of ['fit','zoom-in','zoom-out','save-session'])$(id).disabled=!available;
 $('export-image').disabled=!available||!!view.busy||!(view.hasResult||entry.id==='original');$('quick-export-image').disabled=$('export-image').disabled;$('export-report').disabled=!available||!view.hasReport;
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
function createEntry(id){
 const record={id,loading:true,generation,element:document.createElement('section'),controller:null,position:false};
 record.element.id='document-'+crypto.randomUUID();record.element.className='document-window';
 const header=document.createElement('header'),name=document.createElement('span'),panel=document.createElement('div');name.className='window-name';panel.className='panel-host';
 header.append(name,button('×',()=>closeDocument(id),'window-close'));const resize=button('◢',()=>{},'window-resize');resize.setAttribute('aria-label',state.language==='fr'?'Redimensionner la fenêtre':'Resize window');record.element.append(header,panel,resize);bindDocumentResize(resize,record.element,{layout:()=>state.layout,desk:()=>$('workspace-desk')});$('workspace-desk').append(record.element);
 record.element.addEventListener('pointerdown',()=>{if(state.active!==id)selectDocument(id);},{capture:true});
 let drag=null;header.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0||state.layout!=='cascade')return;const bounds=record.element.getBoundingClientRect();drag={x:e.clientX-bounds.left,y:e.clientY-bounds.top};header.setPointerCapture(e.pointerId);});
 header.addEventListener('pointermove',e=>{if(!drag)return;const bounds=$('workspace-desk').getBoundingClientRect(),x=Math.max(0,Math.min(bounds.width-record.element.offsetWidth,e.clientX-bounds.left-drag.x)),y=Math.max(0,Math.min(bounds.height-26,e.clientY-bounds.top-drag.y));record.element.style.setProperty('--window-x',x+'px');record.element.style.setProperty('--window-y',y+'px');record.position=true;});
 const endDrag=()=>drag=null;header.addEventListener('pointerup',endDrag);header.addEventListener('pointercancel',endDrag);
 record.ready=template.then(nodes=>{
  if(record.closed||record.generation!==generation)return null;
  const root=panel.attachShadow({mode:'open'});
  for(const name of ['app.css','tool-workspace.css','panel.css']){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL(name,import.meta.url).href;link.onload=()=>record.controller?.fit();root.append(link);}
  for(const node of nodes)root.append(document.importNode(node,true));
  record.controller=panelFactory(scopedDocument(root,panel),{managed:true,toolId:id,sourceOnly:id==='original',language:state.language,theme,computeProfile,engineFactory,requestExport:task=>mediaUI.requestExport(task),openLoupeSettings:()=>mediaUI.openLoupe(),onLoupeContextChange:()=>mediaUI.sync(),onLoupeSweepChange:()=>mediaUI.sync(),onLoupeEffectsState:value=>{if(record.id===state.active)mediaUI.effectsState(value);},exportOriginalImage:settings=>sourceEntry?.controller?.exportImage(settings),onLoupeChange:value=>setMedia({...media,loupe:value}),sourceInput:()=>sourceInput,visible:()=>!record.element.hidden&&!record.closed,changed:scheduleRender});
  if(savedTools[id])record.controller.applySettings(savedTools[id]);
  record.controller.setNavigation(navigationMode);record.controller.setTheme(theme);record.controller.setHighlight?.(highlight);record.controller.setLoupe?.(media.loupe);
  return record.controller;
 }).catch(error=>{record.loading=false;record.error=error;notify(error.message);throw error;});
 return record;
}
async function openTool(id){
 diagnostic({level:'info',kind:'tool.open',operation:id});
 if(!known.has(id))return;
 if(state.documents.has(id)){selectDocument(id);return;}
 if(!currentFile){pickImage();return;}
 if(id==='inspection.magnifier'&&!media.loupe.enabled)setMedia({...media,loupe:{...media.loupe,enabled:true}});
 if(id==='original'&&sourceEntry){sourceEntry.closed=false;state.open(id,sourceEntry);$('workspace-desk').append(sourceEntry.element);selectDocument(id);return;}
 const record=createEntry(id);state.open(id,record);renderDocuments();
 try{const controller=await record.ready,input=await sourceEntry.inputReady;if(!controller||record.closed||record.generation!==generation)return;controller.adopt(input);record.loading=false;renderDocuments();}
 catch(error){record.loading=false;notify(error.message);}
}
function remember(record){if(record.controller)savedTools[record.id]=record.controller.settings();}
async function closeDocument(id,{force=false}={}){
 diagnostic({level:'info',kind:'tool.close',operation:id});
 const record=state.documents.get(id);if(!record)return;
 if(!force&&record.controller?.busy&&!confirm(text('busyClose')))return;
 remember(record);state.close(id);record.element.remove();
 if(record===sourceEntry&&state.documents.size){record.element.hidden=true;renderDocuments();return;}
 record.closed=true;const closing=[record];
 if(!state.documents.size){if(sourceEntry&&sourceEntry!==record){sourceEntry.closed=true;sourceEntry.element.remove();closing.push(sourceEntry);}sourceEntry=null;sourceInput=null;currentFile=null;$('image-file').value='';}
 // Remove the view immediately; a queued worker cleanup may wait for another job.
 renderDocuments();await Promise.allSettled(closing.map(entry=>entry.ready.then(c=>c?.dispose())));
}
async function closeAll(){
 generation++;const previous=entries();state.clear();sourceEntry=null;sourceInput=null;currentFile=null;pendingSession=null;$('image-file').value='';
 for(const record of previous){remember(record);record.closed=true;record.element.remove();}
 renderDocuments();await Promise.allSettled(previous.map(record=>record.ready.then(c=>c?.dispose())));
}
async function openImage(file){
 if(!file)return;if(currentFile&&!confirm(text('replace')))return;
 const session=pendingSession;await closeAll();pendingSession=session;currentFile=file;
 const record=createEntry('original');sourceEntry=record;state.open('original',record);renderDocuments();
 record.inputReady=record.ready.then(async controller=>{
  if(!controller)return null;await controller.load(file);
  if(record.closed||record.generation!==generation)return null;
  sourceInput=controller.input();record.loading=false;renderDocuments();return sourceInput;
 });
 try{await record.inputReady;if(pendingSession)await applySession(pendingSession);}
 catch(error){record.loading=false;notify(error.message);}
}
function pickImage(){closeMenus();$('image-file').value='';$('image-file').click();}
for(const id of ['open-image','open-file-menu','welcome-open'])$(id).onclick=pickImage;
$('image-file').onchange=e=>void openImage(e.target.files[0]);
$('toggle-tools').onclick=()=>{state.toggleTools();renderDocuments();savePreferences();};
for(const mode of ['tabs','tile','cascade'])$('layout-'+mode).onclick=()=>{state.setLayout(mode);renderDocuments();savePreferences();};
$('language-toggle').onclick=()=>{state.setLanguage(state.language==='fr'?'en':'fr');translate();};
$('theme-toggle').onclick=()=>{theme=theme==='light'?'dark':'light';document.documentElement.dataset.theme=theme;for(const record of entries())record.controller?.setTheme(theme);savePreferences();};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){notify(e.message);}};
$('close-all').onclick=()=>{if(!state.documents.size)return;$('close-dialog').showModal();};$('cancel-close').onclick=()=>$('close-dialog').close();$('confirm-close').onclick=()=>{$('close-dialog').close();void closeAll();};
const active=()=>state.documents.get(state.active)?.controller;
$('fit').onclick=()=>{active()?.fit();scheduleRender();};$('zoom-in').onclick=()=>{active()?.zoomBy(1.25);scheduleRender();};$('zoom-out').onclick=()=>{active()?.zoomBy(.8);scheduleRender();};
$('quick-export-image').onclick=()=>{closeMenus();void active()?.exportImage({...media.quickExport});};
$('export-image').onclick=()=>{closeMenus();void active()?.exportImage();};$('export-report').onclick=()=>{closeMenus();active()?.exportReport();};$('save-session').onclick=()=>{closeMenus();active()?.saveSession();};
$('background-status').onclick=()=>{const next=[...state.documents.values()].find(e=>e.id!==state.active&&e.controller?.busy);if(next)selectDocument(next.id);};
$('compute-profile').onchange=()=>{computeProfile=$('compute-profile').value;for(const record of entries())record.controller?.setComputeProfile(computeProfile);savePreferences();};
$('navigation-mode').onchange=()=>{navigationMode=$('navigation-mode').value;for(const record of entries())record.controller?.setNavigation(navigationMode);savePreferences();};
$('highlight-tools').onchange=()=>{highlight=$('highlight-tools').checked;$('workspace-app').classList.toggle('highlight-new-features',highlight);for(const entry of entries())entry.controller?.setHighlight?.(highlight);savePreferences();};
$('export-settings').onclick=()=>{for(const record of entries())remember(record);download({schema:'sherloq.workspace/1',preferences:preferences(),tools:savedTools},settingsFilename());closeMenus();};
$('import-settings').onclick=()=>{closeMenus();$('settings-file').value='';$('settings-file').click();};
$('settings-file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(entries().some(e=>e.controller?.busy))throw Error(text('busySettings'));if(file.size>2*1024**2)throw Error(text('invalid'));
  const value=JSON.parse(await file.text());let nextTools,nextPreferences;
  if(value.schema==='sherloq.settings/1'){const settings=validateSettings(value);nextTools={...savedTools,[state.active||'ela.classic']:settings};nextPreferences={...preferences(),...settings.preferences};}
  else{if(value.schema!=='sherloq.workspace/1'||!value.tools||typeof value.tools!=='object')throw Error(text('invalid'));nextTools={};for(const [id,settings]of Object.entries(value.tools)){if(!known.has(id))throw Error(text('invalid'));nextTools[id]=validateSettings(settings);}nextPreferences=value.preferences||{};}
  const candidate=createWorkspaceState();candidate.restore(nextPreferences,[...known]);const nextMedia=validateMediaPreferences(nextPreferences);
  media=nextMedia;savedTools=nextTools;state.restore(candidate.preferences(),[...known]);theme=['light','dark'].includes(nextPreferences.theme)?nextPreferences.theme:theme;computeProfile=['maximum','aggressive'].includes(nextPreferences.computeProfile)?nextPreferences.computeProfile:computeProfile;navigationMode=['auto','mouse','trackpad'].includes(nextPreferences.navigationMode)?nextPreferences.navigationMode:navigationMode;highlight=nextPreferences.highlight===true;
  for(const record of entries())if(savedTools[record.id])record.controller?.applySettings(savedTools[record.id]);
  restoreDependencyPreferences(nextPreferences.dependencies);applyPreferences();translate();notify(text('loadedSettings'));
 }catch(error){notify(error.message);}
};
async function applySession(value){
 const id=value.operation==='ela.energy'?'ela.classic':value.operation;if(!known.has(id))throw Error(text('invalid'));
 if(!sourceInput){pendingSession=value;notify(text('sessionImage'));pickImage();return;}
 if(value.sha256&&value.sha256!==sourceInput.hash)throw Error(text('missingImage'));
 await openTool(id);const record=state.documents.get(id),controller=await record.ready;
 if(record.closed)return;await controller.restoreSession(new Blob([JSON.stringify(value)],{type:'application/json'}));controller.adopt(sourceInput);record.loading=false;pendingSession=null;renderDocuments();
}
$('restore-session').onclick=()=>{closeMenus();$('session-file').value='';$('session-file').click();};$('session-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1024**2)throw Error(text('invalid'));const value=JSON.parse(await file.text());if(value.schema!=='sherloq.session/1')throw Error(text('invalid'));await applySession(value);}catch(e){notify(e.message);}};
const isFileDrag=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
document.addEventListener('dragover',e=>{if(isFileDrag(e)){e.preventDefault();$('workspace-desk').classList.add('file-drag');}});document.addEventListener('dragleave',e=>{if(!e.relatedTarget)$('workspace-desk').classList.remove('file-drag');});document.addEventListener('drop',e=>{if(!isFileDrag(e))return;e.preventDefault();$('workspace-desk').classList.remove('file-drag');void openImage(e.dataTransfer.files[0]);});
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
function applyPreferences(){document.documentElement.dataset.theme=theme;applyMedia();$('compute-profile').value=computeProfile;$('navigation-mode').value=navigationMode;$('highlight-tools').checked=highlight;$('workspace-app').classList.toggle('highlight-new-features',highlight);for(const record of entries()){record.controller?.setTheme(theme);record.controller?.setHighlight?.(highlight);record.controller?.setNavigation(navigationMode);record.controller?.setComputeProfile(computeProfile);}}
state.setLanguage(browserLanguage(document.defaultView?.navigator??globalThis.navigator));
try{const saved=JSON.parse(localStorage.getItem('sherloq.workspace.preferences'));if(saved){media=validateMediaPreferences(saved);state.restore(saved,[...known]);theme=['light','dark'].includes(saved.theme)?saved.theme:theme;computeProfile=['maximum','aggressive'].includes(saved.computeProfile)?saved.computeProfile:computeProfile;navigationMode=['auto','mouse','trackpad'].includes(saved.navigationMode)?saved.navigationMode:navigationMode;highlight=saved.highlight===true;}}catch{}
const query=new URLSearchParams(location.hash.slice(1));if(['fr','en'].includes(query.get('lang')))state.setLanguage(query.get('lang'));
try{const home=new URL(query.get('home')||'../../../../',location.href);if(home.origin===location.origin)$('home').href=home.href;}catch{}
applyPreferences();translate();renderDocuments();

return {state,openImage,openTool,closeAll,selectDocument,closeDocument};
}
