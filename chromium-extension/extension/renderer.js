import {mountLensOCR} from './ocr.js';
import {pdfPresentation,pdfRawPresentation,imagePlacement,eligiblePDFTiles,createPDFScopeClient} from './pdf-layout.js';
import {createPDFSubimageMemory} from './pdf-subimage-memory.js';
import {createPDFImageContext} from './pdf-image-context.js';
import {createRecentSelection} from './recent-selection.js';
import {linkedPageCandidates} from './candidates.js';
import {mountInspection} from './inspection.js';
import {createPointerLoupe} from './native-pointer-loupe.js';
import {mountLoupeEffectControls} from './native-effects-controls.js';
import {mountPanelControls} from './panel-controls.js';
import {applyLoupePreset,currentLoupePreset} from './presets.js';
import {transferSource,pdfSourceId} from './transfer-file.js';
import {mountSettingsSliders} from './settings-sliders.js';
import {mountViewerNavigation,fitViewerCamera} from './viewer-navigation.js';
import {validateLoupeSettings} from './native-media-settings.js';
import {readSettings, saveSettings, language, applyAppearance, normalizeSettings} from './settings.js';
import {createImageMemory} from './image-memory.js';
import {hasLoupeEffects} from './vendor/loupe-effects-settings.js';
import {nudge,selectControlGroup} from './controls.js';
import {createStepPlayback} from './step-playback.js';
import {eventShortcut, resolveShortcut} from './shortcuts.js';
import {getJob, putJob, deleteJob, updateJob} from './db.js';
import {imageGeometry} from './geometry.js';
import {automaticLoupeSize,overlayLoupeSpace} from './loupe-screen.js';
import {mountQuickHelp} from './help.js';

const $ = id => document.getElementById(id), overlay = new URLSearchParams(location.search).has('overlay');
if (!overlay) document.body.classList.add('standalone');else{document.documentElement.style.setProperty('background','transparent','important');document.body.style.setProperty('background','transparent','important');document.documentElement.style.setProperty('color-scheme','light dark','important');}
let p = await readSettings(), port, surface, bitmap, selectedJob, pageGeometry, pointer = {x:innerWidth/2,y:innerHeight/2}, camera = {x:0,y:0,scale:1}, original = false, saveTimer, loadSerial = 0, requestEpoch = 0, model, drawnBase, resolving=false, queuedOpen, currentLoad=Promise.resolve(), activeEntry, adjacent=[],warmTimer,warming=false,warmAgain=false,effectsSignature,activeImageKey,requestedJobId,requestedImageKey,effectSurface,effectSurfaceKey,processing=0,features,visibleFrame=null,sourceChoiceSerial=0,pdfSession=null,pdfPage=null,activePDFSourceId=null,forcePDF=false;
// Activating the page extension starts its lens. A PDF viewer's navigation
// state belongs to that viewer and must not switch other tabs off.
if(overlay)p={...p,loupe:{...p.loupe,enabled:true}};
const view=$('view'),base=$('base'),panel=$('panel');
view.tabIndex=-1;
let settingsSliders,navigation,cameraOwner=null,cameraFitted=true,cameraViewport;
function viewerViewport(){
 const rect=view.getBoundingClientRect(),visual=window.visualViewport,left=Math.max(rect.left,visual?.offsetLeft||0),right=Math.min(rect.right,(visual?.offsetLeft||0)+(visual?.width||innerWidth)),top=Math.max(rect.top,$('bar').getBoundingClientRect().bottom,visual?.offsetTop||0),bottom=Math.min(rect.bottom,(visual?.offsetTop||0)+(visual?.height||innerHeight));
 return {x:left-rect.left+15,y:top-rect.top+15,width:Math.max(1,right-left-30),height:Math.max(1,bottom-top-30)};
}
function loupeSpace(){if(overlay)return pageGeometry?.space||overlayLoupeSpace();const area=viewerViewport();return {width:area.width,height:area.height,extensionViewport:true};}
const t = (fr,en) => language(p)==='fr'?fr:en;
const send = async message => {const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw Error(r?.error||'Extension indisponible.');return r.value;};
let controlPanel,controlRevision=0,savedControlRevision=0,loupeRevision=0,savedLoupeRevision=0,loupeSignature,watchedTransfer;
const refreshControlAvailability=()=>controlPanel?.refreshAvailability();
const status = text => { $('status').textContent=text;port?.postMessage({type:'status',text});refreshControlAvailability(); };
const loupe = createPointerLoupe(view,{baseCanvas:base,getSurface:()=>surface,getEffectsSurface:processedPresentation,getPixelRatio:()=>pageGeometry?.dpr||devicePixelRatio,getScreen:loupeSpace,getCamera:()=>camera,canInteract:event=>!!surface&&!event?.composedPath?.().some(n=>n?.closest?.('#panel,#bar,#pdf-images')),
  keepVisibleAtMinimum:()=>overlay,onZoom:value=>{p.loupe=value;update();persist();},
  getEffectsState:()=>({effectBusy:processing>0,fullImage:{...memory.stats(),native:true}}),onSweepChange:()=>effects?.sync(),onPresented:framePresented,onError:error=>{playback.reset();status(error.message);}});
const ownsSelection=()=>!!surface&&!!activeEntry&&(!overlay||activeImageKey===requestedImageKey&&activeImageKey===pageGeometry?.key);
const memory=createImageMemory({makeSurface:imageSurface,beforePublish:(entry,effects)=>{const scope=entry===activeEntry||pdfPage?.placements.some(item=>item.job.id===entry.id)?activeImageKey||activeEntry.id:entry.id===requestedJobId?requestedImageKey:null;return scope?playback.beforePublish(stepKey(scope,effects)):undefined;},changed:error=>{if(error){playback.reset();status(error.message);return;}refreshControlAvailability();if(!ownsSelection())return;drawnBase=null;drawBase();loupe.draw();}});
const pdfImageContext=createPDFImageContext(memory,{changed:()=>{effectSurfaceKey=null;loupe.invalidate();loupe.draw();},onError:error=>status(t('Détection des sous-images indisponible : ','Sub-image detection unavailable: ')+error.message),beforePublish:(entry,effects)=>activeEntry?playback.beforePublish(stepKey(activeImageKey||activeEntry.id,effects)):undefined});
function pdfEffectsContext(){const page=pdfPage??pdfImageContext.page(activeEntry);return page?{page,memory:pdfPage?pdfSession.subimages:pdfImageContext.memory}:null;}
function sourceClip(){const r=pageGeometry&&bitmap&&imageGeometry(pageGeometry.rect,bitmap,pageGeometry.style).clip;return r&&{x:(r.x-camera.x)/camera.scale,y:(r.y-camera.y)/camera.scale,width:r.width/camera.scale,height:r.height/camera.scale};}
function presentation(entry,processed=false){
 if(pdfPage&&entry===activeEntry&&!processed)return pdfRawPresentation({page:pdfPage,entry,memory,changed:()=>{drawBase();loupe.draw();},onError:error=>status(error.message)});
 const source=processed?memory.displayed(entry)||entry.raw:entry.raw;
 const others=adjacent.map(item=>({...item,source:processed?memory.displayed(item.entry)||item.entry?.raw:item.entry?.raw}));
 function eachNeighbor(bounds,scale,fn){if(!overlay||!ownsSelection()||!pageGeometry||!camera.scale)return;
  for(const item of others){if(!item.entry||item.entry.closed||item.entry===entry||item.key===activeImageKey||!item.source)continue;const g=imageGeometry(item.rect,item.entry.bitmap,item.style),ox=(g.x-camera.x)/camera.scale,oy=(g.y-camera.y)/camera.scale,sx=g.sx/camera.scale,sy=g.sy/camera.scale;
   const region={left:(bounds.left-ox)/sx,top:(bounds.top-oy)/sy,right:(bounds.right-ox)/sx,bottom:(bounds.bottom-oy)/sy};fn(item.source,region,scale*sx,{g,ox,oy,sx,sy});
  }
 }
 return {owner:entry.id,width:entry.bitmap.width,height:entry.bitmap.height,effectsKey:processed?entry.preparedKey:undefined,
  prepare(bounds,scale){let ready=source.prepare?.(bounds,scale)!==false;eachNeighbor(bounds,scale,(target,region,scale)=>{if(target.prepare?.(region,scale)===false)ready=false;});return ready;},
  draw(ctx,bounds,scale){if(overlay&&(!ownsSelection()||entry!==activeEntry))return;const primary=overlay&&sourceClip();
   if(primary){ctx.save();ctx.beginPath();ctx.rect(bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top);ctx.rect(primary.x,primary.y,primary.width,primary.height);ctx.clip('evenodd');
    eachNeighbor(bounds,scale,(target,region,scale,{g,ox,oy,sx,sy})=>{ctx.save();ctx.translate(ox,oy);ctx.scale(sx,sy);ctx.beginPath();ctx.rect((g.clip.x-g.x)/g.sx,(g.clip.y-g.y)/g.sy,g.clip.width/g.sx,g.clip.height/g.sy);ctx.clip();target.draw(ctx,region,scale);ctx.restore();});ctx.restore();}
   ctx.save();if(primary){ctx.beginPath();ctx.rect(primary.x,primary.y,primary.width,primary.height);ctx.clip();}source.draw(ctx,bounds,scale);ctx.restore();
  },readPixels:rect=>entry.raw.readPixels(rect)};
}
function processedPresentation(){
 const pdf=pdfEffectsContext();
 if(!original&&pdf&&ownsSelection()&&hasLoupeEffects(p.loupe.effects)){const signature=JSON.stringify([pdf.page.job.id,p.loupe.effects,pdf.page.placements.map(item=>item.image.scope?.fingerprint)]);if(effectSurfaceKey!==signature){effectSurfaceKey=signature;effectSurface=pdfPresentation({page:pdf.memory.partition(pdf.page),entry:activeEntry,memory:pdf.memory,effects:p.loupe.effects,force:true,changed:()=>loupe.draw(),onError:error=>status(error.message),beforePublish:()=>playback.beforePublish(stepKey(activeImageKey||activeEntry.id,p.loupe.effects))});}return effectSurface;}
 if(original||!ownsSelection()||!hasLoupeEffects(p.loupe.effects))return null;
 const selected=memory.displayed(activeEntry);if(!selected)return null;
 const signature=[activeEntry.id,selected.id,...adjacent.map(item=>item.id+':'+(memory.displayed(item.entry)?.id??'raw')+':'+JSON.stringify([item.rect,item.style]))].join('|');
 if(effectSurfaceKey!==signature){effectSurfaceKey=signature;effectSurface=presentation(activeEntry,true);}return effectSurface;
}
async function prepareSelected(){if(!p.loupe.enabled||pdfEffectsContext())return;const entry=activeEntry;if(!entry||!hasLoupeEffects(p.loupe.effects)||memory.prepared(entry,p.loupe.effects))return;const settings=p.loupe.effects;processing++;document.documentElement.dataset.effects='busy';
 try{await memory.prepare(entry,settings);if(entry===activeEntry){loupe.draw();scheduleWarm();}}catch(error){if(error.code!=='CANCELLED'){playback.reset();status(error.message);}}finally{processing--;document.documentElement.dataset.effects=processing?'busy':'ready';}
}
function scheduleWarm(){clearTimeout(warmTimer);warmTimer=setTimeout(()=>void warmImages(),150);}
async function warmImages(){
 if(warming){warmAgain=true;return;}if(!activeEntry||loupe.sweeping||processing||playback.busy||!loupe.diagnostics().settled)return;
 warming=true;const entry=activeEntry,preferences=p.loupe.effects;
 try{if(!hasLoupeEffects(preferences)||memory.prepared(entry,preferences))await memory.warm(adjacent.map(item=>item.id),preferences);}
 catch(error){if(error.code!=='CANCELLED')console.warn('SHERLOQ : cache',error.message);}
 finally{warming=false;if(warmAgain){warmAgain=false;scheduleWarm();}}
}
const stepKey=(scope,effects)=>scope+':'+JSON.stringify(effects);
const canAdjust=()=>ownsSelection()&&!!loupe.diagnostics().pointer&&loupe.enabled&&!original&&!document.hidden&&(!requestedJobId||activeEntry.id===requestedJobId);
const playback=createStepPlayback({step:applyStep,getInterval:()=>p.controlInterval,
 canStep:canAdjust,onError:error=>status(error.message)});
function clearVisible(){visibleFrame?.lease?.close();visibleFrame=null;}
function framePresented(frame){
 if(!activeEntry||frame.owner!==activeEntry.id||!ownsSelection())return;
 const scope=activeImageKey||activeEntry.id,key=scope+':'+frame.effectsKey;
 clearVisible();visibleFrame={owner:frame.owner,effects:JSON.parse(frame.effectsKey),lease:pdfEffectsContext()?effectSurface?.fork():memory.displayed(activeEntry)?.fork()};
 window.dispatchEvent(new CustomEvent('sherloq-presented',{detail:{key,imageKey:scope,effects:JSON.parse(frame.effectsKey),time:performance.now()}}));
 playback.presented(key);if(!playback.busy)scheduleWarm();
}
function requestAdjustment(direction,id,repeat=false,binding){
 if(repeat)return;
 if(!ownsSelection()){status(t('Survolez une image.','Move over an image.'));return;}
 loupe.stopSweep();if(id)playback.down(id,direction,{binding});else playback.once(direction,{binding});
}
const effects=mountLoupeEffectControls($('effects'),{getPreferences:()=>p,setPreferences:value=>{const activated=['adjust','enhance','sweep'].find(group=>value.loupe.effects[group].enabled&&!p.loupe.effects[group].enabled);playback.reset();p=activated?selectControlGroup(value,activated):value;if(activated)controlRevision++;update();persist();},language:()=>language(p),
  onSweep:group=>{playback.reset();loupe.toggleSweep(group);},stopSweep:()=>loupe.stopSweep(),sweepState:()=>loupe.sweeping,isEditing:input=>settingsSliders?.isEditing(input)??false});
features=mountInspection({container:$('inspection'),state:()=>({p,job:selectedJob,entry:activeEntry,bitmap,camera,pointer,sweeping:loupe.sweeping,activeGroup:effects.activeGroup(),visibleEffects:!original&&hasLoupeEffects(p.loupe.effects)&&visibleFrame&&activeEntry&&visibleFrame.owner===activeEntry.id?visibleFrame.effects:null,visibleLease:!original&&hasLoupeEffects(p.loupe.effects)&&visibleFrame&&activeEntry&&visibleFrame.owner===activeEntry.id?visibleFrame.lease:null}),stop:()=>{playback.reset();loupe.stopSweep();},apply:value=>{p={...p,loupe:{...p.loupe,effects:value}};update();persist();},status,send,chooseSource,sweep:(group,range)=>loupe.toggleSweep(group,range)});
const clipboardRequests=new Map();
const ocr=mountLensOCR({container:$('inspection'),getPreferences:()=>p,setPreference:async value=>{p={...p,ocrPreference:value};await saveSettings(p);},send,status,language:()=>language(p),modal:value=>{playback.releaseAll();loupe.pin(value||!panel.hidden);port?.postMessage({type:'modal',open:value});},copy:async text=>{if(!overlay){await navigator.clipboard.writeText(text);return;}const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{clipboardRequests.delete(id);reject(Error(t('Copie indisponible.','Clipboard unavailable.')));},5000);clipboardRequests.set(id,{resolve:()=>{clearTimeout(timer);resolve();},reject:error=>{clearTimeout(timer);reject(error);}});port?.postMessage({type:'clipboard',id,text});});},getSnapshot:async()=>{
 if(!ownsSelection()||!loupe.visible)return null;const {loupeGeometry,loupeScale}=await import('./native-media-settings.js'),point=loupe.diagnostics().pointer;if(!point)return null;const geometry=loupeGeometry(p.loupe,loupeSpace()),scale=loupeScale(p.loupe,camera.scale),circle={x:(point.x-camera.x)/camera.scale,y:(point.y-camera.y)/camera.scale,radius:geometry.diameter/2/scale},lease=!original&&hasLoupeEffects(p.loupe.effects)?visibleFrame?.lease?.fork():null,raw=activeEntry.raw;if(!lease)raw.retain?.();return {source:lease||raw,circle,close(){if(lease)lease.close();else raw.release?.();}};
}});void ocr.refresh().catch(error=>console.warn('SHERLOQ OCR',error.message));
async function chooseSource(url){
 const key=activeImageKey;if(!activeEntry)return;const ticket=++sourceChoiceSerial,sourcePage=selectedJob.sourcePage,variants=selectedJob.variants;playback.reset();loupe.stopSweep();requestEpoch++;loadSerial++;requestedJobId=activeEntry.id;resolving=false;port?.postMessage({type:'source-selecting'});status(t('Préparation de la source choisie…','Preparing selected source…'));
 const task=(async()=>{const result=await send({type:'resolve-source',url,sourcePage});if(ticket!==sourceChoiceSerial||key!==activeImageKey)return;requestedJobId=result.id;const job=await getJob(result.id);job.variants=variants;await putJob(job);if(ticket!==sourceChoiceSerial||key!==activeImageKey)return;await load(job,key);if(ticket===sourceChoiceSerial)port?.postMessage({type:'source-chosen',...result});})();currentLoad=task.catch(()=>{});return task;
}

function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{const value=p,revision=controlRevision,viewRevision=loupeRevision;void saveSettings(value).then(()=>{if(revision===controlRevision)savedControlRevision=revision;if(viewRevision===loupeRevision)savedLoupeRevision=viewRevision;}).catch(error=>status(error.message));},300);}
function update(external=false){
 const viewKey=JSON.stringify(p.loupe);if(loupeSignature!==viewKey){loupeSignature=viewKey;if(!external)loupeRevision++;}
 port?.postMessage({type:'loupe-settings',loupe:p.loupe});
 const signature=JSON.stringify(p.loupe.effects);
 if(effectsSignature!==signature){effectsSignature=signature;memory.invalidate();pdfSession?.subimages.invalidate();pdfImageContext.invalidate();drawnBase=null;void prepareSelected();scheduleWarm();}
 applyAppearance(p);loupe.set(p.loupe);effects.sync();syncGeometry();syncControl();
 document.body.dataset.navigation=String(!overlay&&!p.loupe.enabled);
 $('panel-title').textContent=t('Réglages de la loupe','Magnifier settings');
 $('help').textContent=p.loupe.enabled?t(''+p.shortcuts.settings+' : réglages · ↑↓ : diamètre · ←→ : transition. Molette : grossissement. Clic : anneaux. Double clic : +1 % de la taille affichée. Alt ou '+p.shortcuts.original+' : original. Les réglages sont enregistrés.',''+p.shortcuts.settings+': settings · ↑↓: diameter · ←→: transition. Wheel: zoom. Click: rings. Double click: +1% of the displayed size. Alt or '+p.shortcuts.original+': original. Settings are saved.'):t('Loupe coupée : molette ou pincement pour zoomer, trackpad ou glisser pour déplacer. Double-clic : ajuster la page. '+p.shortcuts.close+' : réactiver la loupe.','Magnifier off: wheel or pinch to zoom, trackpad or drag to pan. Double-click: fit the page. '+p.shortcuts.close+': enable the magnifier.');
 $('settings').textContent=p.shortcuts.settings;quickHelp.sync();
 $('loupe-toggle').textContent=(p.loupe.enabled?t('Loupe · ','Magnifier · '):t('Loupe coupée · ','Magnifier off · '))+p.shortcuts.close;
 $('loupe-toggle').setAttribute('aria-pressed',String(p.loupe.enabled));$('navigation-mode').value=p.navigationMode;
 for(const node of document.querySelectorAll('[data-fr]'))node.textContent=node.dataset[language(p)];
 for(const node of document.querySelectorAll('[data-effect-scan]'))node.textContent=node.textContent.replace(/ · B$/, ' · '+p.shortcuts.sweep);
 for(const node of document.querySelectorAll('[data-sweep-configure]'))node.textContent=p.shortcuts.sweep+' ⚙';
 $('language').textContent=language(p)==='fr'?'EN':'FR';features?.sync();ocr?.sync();settingsSliders?.refresh();
}
const geometryFields=[['zoom','Agrandissement (+ %)','Enlargement (+ %)',1,3500,.1],['diameter','Diamètre','Diameter',10,2000,10],['transition','Transition','Transition',0,1000,10],['sweepSpeed','Vitesse B','Sweep speed',.1,5,.1],['proportional','Adapter à l’écran','Scale to screen'],['markers','Afficher les anneaux','Show rings'],['ringWidth','Épaisseur','Stroke width',.5,5,.5],['ringOpacity','Opacité (%)','Opacity (%)',10,100,1],['ringColor','Couleur','Colour','color'],['ringStyle','Tracé','Stroke',['solid','dashed']]];
for(const [key,fr,en,min,max,step] of geometryFields){
 const label=document.createElement('label'),span=document.createElement('span'),input=document.createElement(Array.isArray(min)?'select':'input');span.dataset.label=key;label.append(span,input);input.dataset.loupe=key;
 if(Array.isArray(min))for(const value of min){const option=document.createElement('option');option.value=value;option.textContent=value;input.append(option);}else{input.type=min===undefined?'checkbox':min==='color'?'color':'number';if(typeof min==='number'){input.min=min;input.max=max;input.step=step;}}
 input.addEventListener('input',()=>{if(!input.checkValidity())return;try{playback.reset();p.loupe=validateLoupeSettings({...p.loupe,[key]:input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value)+(key==='zoom'?100:0):input.value});loupe.stopSweep();update();persist();}catch{}});$('geometry').append(label);
}
function syncGeometry(){$('loupe-preset').value=currentLoupePreset(p.loupe);for(const [key,fr,en]of geometryFields){const input=$('geometry').querySelector('[data-loupe='+key+']');if(input.type==='checkbox')input.checked=p.loupe[key];else if(!settingsSliders?.isEditing(input))input.value=key==='zoom'?Math.round((p.loupe.zoom-100)*10)/10:p.loupe[key];$('geometry').querySelector('[data-label='+key+']').textContent=t(fr,en);}}
$('loupe-auto').onclick=()=>{p={...p,loupe:automaticLoupeSize(p.loupe)};update();persist();};
$('loupe-preset').onchange=()=>{const id=$('loupe-preset').value,value=applyLoupePreset(p.loupe,id),group=id==='histogram'?'enhance':id.startsWith('brush')?'adjust':null;playback.reset();loupe.stopSweep();p={...p,loupe:value};if(group){p=selectControlGroup(p,group);controlRevision++;}update();for(const section of $('effects').querySelectorAll('[data-effect-group]'))section.open=section.dataset.effectGroup===group;persist();};
function syncControl(){controlPanel?.sync();}
controlPanel=mountPanelControls({root:$('step-controls'),getPreferences:()=>p,setPreferences:value=>{p=value;controlRevision++;persist();},language:()=>language(p),canStep:canAdjust,onReset:()=>playback.reset(),onStep:direction=>requestAdjustment(direction)});
settingsSliders=mountSettingsSliders({root:document,language:()=>language(p)});
navigation=mountViewerNavigation(view,{enabled:()=>!overlay&&!!bitmap&&!loupe.enabled,canInteract:event=>!event?.composedPath?.().some(node=>node?.closest?.('#panel,#bar,#pdf-images')),getCamera:()=>camera,getFit:()=>bitmap?fitViewerCamera(bitmap,viewerViewport()):null,getMode:()=>p.navigationMode,setCamera:(value,{fitted=false}={})=>{camera=value;cameraOwner=activeEntry?.id;cameraFitted=fitted;},onChange:drawBase});
$('navigation-mode').onchange=()=>{navigation.release();p={...p,navigationMode:$('navigation-mode').value};persist();};
function setLoupeEnabled(enabled){playback.reset();loupe.stopSweep();navigation.release();p={...p,loupe:{...p.loupe,enabled}};update();if(enabled){void prepareSelected();loupe.draw();}persist();}
$('loupe-toggle').onclick=()=>setLoupeEnabled(!p.loupe.enabled);
view.addEventListener('pointermove',refreshControlAvailability,{passive:true});view.addEventListener('pointerleave',refreshControlAvailability,{passive:true});
function applyStep(direction,request){const next=nudge(p,direction,request?.binding);if(!next){status(t('Activez le réglage choisi dans la loupe.','Enable the selected effect in the magnifier.'));return null;}if(JSON.stringify(next.loupe.effects)===JSON.stringify(p.loupe.effects))return null;p=next;update();persist();return stepKey(activeImageKey||activeEntry.id,p.loupe.effects);}
function reportPanel(){const r=panel.getBoundingClientRect();port?.postMessage({type:'panel',open:!panel.hidden,rect:{x:r.x,y:r.y,width:r.width,height:r.height}});}
function panelOpen(open=!panel.hidden){panel.hidden=!open;loupe.pin(open);if(!open)settingsSliders.hide();refreshControlAvailability();reportPanel();}
new ResizeObserver(()=>{if(!panel.hidden)reportPanel();}).observe(panel);
document.addEventListener('pointermove',event=>{if(!panel.hidden&&event.isTrusted)port?.postMessage({type:'panel-pointer',x:event.clientX,y:event.clientY});},{passive:true});
$('restart').onclick=()=>void send({type:'restart'});
$('panel-close').onclick=()=>panelOpen(false);$('settings').onclick=()=>panelOpen(panel.hidden);
$('options').onclick=()=>void send({type:'options'});
const quickHelp=mountQuickHelp({button:$('quick-help'),getPreferences:()=>p,language:()=>language(p),modal:open=>{playback.releaseAll();loupe.pin(open||!panel.hidden);port?.postMessage({type:'modal',open});}});
const recent=createRecentSelection({onExpired:()=>{if(!ownsSelection())status(t('Survolez une image.','Move over an image.'));}});
let opening=false;
function transferNotice(value){
 if(!value)return;const pdf=value.kind==='pdf';
 if(value.stage==='error')status(t('Transfert impossible : ','Transfer failed: ')+value.error);
 else if(value.stage==='ready')status(pdf?t('PDF ouvert dans SHERLOQ.','PDF opened in SHERLOQ.'):t('Image ouverte dans SHERLOQ.','Image opened in SHERLOQ.'));
 else if(value.stage==='delivered')status(t('Fichier transmis à SHERLOQ.','File delivered to SHERLOQ.'));
 else status(pdf?t('Ouverture du PDF d’origine dans SHERLOQ…','Opening the original PDF in SHERLOQ…'):t('Transfert de l’image native vers SHERLOQ…','Transferring the native image to SHERLOQ…'));
}
async function sendSelectedJob(job,destination){
 const id=pdfSourceId(job),source=job?.kind==='pdf'?job:id?(pdfSession?.sourceJob?.id===id?pdfSession.sourceJob:await getJob(id)):null;
 const actual=transferSource(job,source);if(!actual?.blob)throw Error(t('Le fichier d’origine est indisponible.','The original file is unavailable.'));
 // Restore a still-open reader's source if an earlier cache purge removed it.
 if(!await getJob(actual.id))await putJob(actual);
 const result=await send({type:'open-job',id:actual.id,destination});watchedTransfer='transfer:'+result.token;
 transferNotice((await chrome.storage.session.get(watchedTransfer))[watchedTransfer]);
}
async function recentJob(value){
 let job=value.id&&await getJob(value.id);if(job?.blob&&!value.resolving)return job;
 const selection=value.selection;
 if(selection?.candidates?.some(v=>/^(https?|file):/.test(v.url))){const candidates=[...selection.candidates];if(selection.linkedPage)try{const page=await send({type:'linked-html',url:selection.linkedPage});candidates.unshift(...linkedPageCandidates(page.html,page.url));}catch{}const result=await send({type:'resolve-selection',selection:{...selection,candidates:candidates.filter(v=>/^(https?|file):/.test(v.url))}});return getJob(result.id);}
 if(job?.blob)return job;
 let blob=value.blob;
 if(!blob){const inline=selection?.candidates?.find(v=>v.url.startsWith('data:'));if(inline)blob=await(await fetch(inline.url)).blob();}
 if(!(blob instanceof Blob)||blob.size>256*1024**2)throw Error(t('Le fichier de cette image n’est pas disponible. Survolez-la à nouveau.','This image file is unavailable. Move over it again.'));
 const bitmap=await createImageBitmap(blob);const {width,height}=bitmap;bitmap.close();if(width*height>100_000_000)throw Error('Image supérieure à 100 MP.');job={id:crypto.randomUUID(),kind:'image',blob,width,height,name:selection?.name||'image.png',reason:selection?.reason||'embedded-source',videoTime:selection?.videoTime,sourcePage:selection?.sourcePage,url:selection?.url,created:Date.now()};await putJob(job);return job;
}
async function open(destination){
 if(opening)return;
 // The original file already exists before rendering, extraction or effects.
 // Sending a PDF must not wait for those independent preparations.
 if(activePDFSourceId){
  opening=true;try{await sendSelectedJob({sourcePDFId:activePDFSourceId},destination);}catch(error){status(error.message);}finally{opening=false;}return;
 }
 if(!ownsSelection()){
  const value=recent.get();if(!value){status(t('Survolez une image. La dernière sélection est conservée 15 secondes après la sortie.','Move over an image. The last selection is kept for 15 seconds after leaving.'));return;}
  opening=true;try{status(t('Ouverture de la dernière image…','Opening last image…'));const job=await recentJob(value);if(!job?.blob)throw Error(t('Image indisponible.','Image unavailable.'));await sendSelectedJob(job,destination);}catch(error){status(error.message);}finally{opening=false;}return;
 }
 if(resolving){queuedOpen=destination;status(t('Recherche de l’original avant ouverture…','Finding the original before opening…'));return;}
 opening=true;try{await currentLoad;if(requestedJobId&&selectedJob?.id!==requestedJobId)throw Error(t('L’original n’est pas encore prêt.','The original is not ready yet.'));if(!selectedJob?.blob)throw Error(t('Sélectionnez une image.','Select an image.'));await sendSelectedJob(selectedJob,destination);}catch(error){status(error.message);}finally{opening=false;}
}

$('web').onclick=()=>void open('web');$('local').onclick=()=>void open('local');
$('theme').onclick=()=>{p.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';update();persist();};
$('language').onclick=()=>{p.language=language(p)==='fr'?'en':'fr';update();persist();};
function drawBase(){
 const width=view.clientWidth,height=view.clientHeight,dpr=pageGeometry?.dpr||devicePixelRatio,w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));if(base.width!==w||base.height!==h){base.width=w;base.height=h;drawnBase=null;}const ctx=base.getContext('2d');
 if(!bitmap||overlay&&(!ownsSelection()||activeImageKey!==pageGeometry?.key)){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,base.width,base.height);return;}
 if(overlay&&pageGeometry){const g=imageGeometry(pageGeometry.rect,bitmap,pageGeometry.style);camera={x:g.x,y:g.y+(pointer.y-g.y)*(1-g.sx/g.sy),scale:g.sx};const signature=JSON.stringify([g,adjacent.map(item=>[item.id,item.rect,item.style])]);if(drawnBase===signature){loupe.draw();return;}drawnBase=signature;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);for(const item of adjacent)if(item.entry&&!item.entry.closed&&item.entry!==activeEntry){const n=imageGeometry(item.rect,item.entry.bitmap,item.style);ctx.save();ctx.beginPath();ctx.rect(n.clip.x,n.clip.y,n.clip.width,n.clip.height);ctx.clip();ctx.drawImage(item.entry.bitmap,n.x,n.y,item.entry.bitmap.width*n.sx,item.entry.bitmap.height*n.sy);ctx.restore();}ctx.save();ctx.beginPath();ctx.rect(g.clip.x,g.clip.y,g.clip.width,g.clip.height);ctx.clip();ctx.drawImage(bitmap,g.x,g.y,bitmap.width*g.sx,bitmap.height*g.sy);ctx.restore();camera={x:g.x,y:g.y+(pointer.y-g.y)*(1-g.sx/g.sy),scale:g.sx};}
 else{
  const area=viewerViewport(),owner=activeEntry?.id;
  if(cameraOwner!==owner){cameraOwner=owner;cameraFitted=true;cameraViewport=null;}
  if(cameraFitted)camera=fitViewerCamera(bitmap,area);
  else if(cameraViewport&&(area.width!==cameraViewport.width||area.height!==cameraViewport.height||area.x!==cameraViewport.x||area.y!==cameraViewport.y))camera={...camera,x:camera.x+area.x+area.width/2-cameraViewport.x-cameraViewport.width/2,y:camera.y+area.y+area.height/2-cameraViewport.y-cameraViewport.height/2};
  cameraViewport=area;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const bounds={left:-camera.x/camera.scale,top:-camera.y/camera.scale,right:(width-camera.x)/camera.scale,bottom:(height-camera.y)/camera.scale};
  ctx.setTransform(dpr*camera.scale,0,0,dpr*camera.scale,dpr*camera.x,dpr*camera.y);
  // Page and lens reuse the embedded images at their native definition.
  surface.prepare?.(bounds,camera.scale*dpr);surface.draw(ctx,bounds,camera.scale*dpr);
 }
 loupe.draw();
}
function imageSurface(image){
 const canvas=new OffscreenCanvas(1,1),ctx=canvas.getContext('2d',{willReadFrequently:true});let refs=1;
 return{retain(){refs++;},release(){if(--refs===0){image.close();canvas.width=canvas.height=0;}},width:image.width,height:image.height,draw:context=>context.drawImage(image,0,0),async readPixels({x,y,width,height}){canvas.width=width;canvas.height=height;ctx.drawImage(image,x,y,width,height,0,0,width,height);const rgba=ctx.getImageData(0,0,width,height).data,data=new Uint8Array(width*height*3);for(let i=0,j=0;i<rgba.length;i+=4,j+=3)data.set(rgba.subarray(i,i+3),j);return{width,height,format:'rgb8',data};}};
}
async function load(job,imageKey){
 const serial=++loadSerial;if(!job)throw Error(t('Cette sélection a expiré.','This selection has expired.'));activePDFSourceId=pdfSourceId(job);
 if(!overlay)requestedJobId=job.id;refreshControlAvailability();
 if(job.kind==='pdf'){await loadPDF(job);return;}
 pdfSession?.subimages.invalidate();pdfImageContext.invalidate();pdfPage=pdfSession?.pages.get(job.id)??null;forcePDF=false;
 const entry=await memory.get(job.id,{foreground:true});if(serial!==loadSerial||!entry)return;
 pdfImageContext.select(job,pdfSession);
 if(pdfSession){const focused=pdfPage?[...new Set(pdfPage.placements.map(item=>item.image.image.id))]:[...pdfSession.images.values()].filter(image=>image.job.id===job.id).map(image=>image.image.id);pdfSession.scope.prioritize(focused);}
 if(job.blob&&(job.width!==entry.bitmap.width||job.height!==entry.bitmap.height)){job.width=entry.bitmap.width;job.height=entry.bitmap.height;await putJob(job);if(serial!==loadSerial)return;}
 if(activeEntry&&entry.id!==activeEntry.id&&(!imageKey||imageKey!==activeImageKey)){playback.reset();clearVisible();}
 if(imageKey&&imageKey===activeImageKey&&activeEntry&&entry.id!==activeEntry.id&&hasLoupeEffects(p.loupe.effects)){
  status(t('Source disponible · préparation de l’original…','Available source · preparing original…'));
  while(hasLoupeEffects(p.loupe.effects)){
   try{await memory.prepare(entry,p.loupe.effects);}catch(error){if(error.code!=='CANCELLED'){status(error.message);return;}}if(serial!==loadSerial)return;
   const completed=memory.prepared(entry,p.loupe.effects);if(!completed)continue;
   const g=overlay&&pageGeometry?imageGeometry(pageGeometry.rect,entry.bitmap,pageGeometry.style):null;
   if(g){const {loupeGeometry,loupeScale}=await import('./native-media-settings.js'),geometry=loupeGeometry(p.loupe,loupeSpace()),radius=geometry.diameter/2+geometry.transition,zoom=loupeScale(p.loupe,g.sx),scale=Math.min(g.sx,zoom,Math.sqrt(zoom*g.sx)),x=(pointer.x-g.x)/g.sx,y=(pointer.y-g.y)/g.sy,extent=radius/scale;await completed.ready({left:x-extent,top:y-extent,right:x+extent,bottom:y+extent,circle:{x,y,radius:extent}},scale*(pageGeometry?.dpr||devicePixelRatio));}
   if(completed===memory.prepared(entry,p.loupe.effects))break;
  }
  if(serial!==loadSerial)return;
 }
 memory.select(job.id,adjacent.map(item=>item.id));activeImageKey=imageKey;activeEntry=entry;bitmap=entry.bitmap;drawnBase=null;surface=presentation(entry);selectedJob=job;pdfSession?.summary?.();void features.refresh();update();drawBase();if(overlay)move(pointer.x,pointer.y);else if(panel.hidden&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input:not([type=file]),textarea,select,[contenteditable=true]'))view.focus({preventScroll:true});void prepareSelected();playback.wake();scheduleWarm();
 status(bitmap.width+' × '+bitmap.height+(job.reason==='pdf-rendered-page'?t(' · page PDF',' · PDF page'):job.reason?.includes('pdf')?t(' · image du PDF',' · PDF image'):''));
}
async function loadPDF(job){
 const selectionSerial=loadSerial;pdfImageContext.dispose();
 pdfSession?.controller.abort();pdfSession?.scope.dispose();pdfSession?.subimages.dispose();if(model)await model.artifacts.dispose();
 const owner=await chrome.tabs.getCurrent();if(owner?.id){job={...job,cacheOwnerTabId:owner.id};await putJob(job);}
 const session={sourceJob:job,selectionSerial,pages:new Map(),images:new Map(),controller:new AbortController(),scope:createPDFScopeClient(),subimages:createPDFSubimageMemory(memory,{changed:()=>loupe.draw(),beforePublish:(entry,effects)=>activeEntry?playback.beforePublish(stepKey(activeImageKey||activeEntry.id,effects)):undefined})},gallery=$('pdf-images');pdfSession=session;pdfPage=null;
 const summary=()=>{const focused=pdfPage?[...new Set(pdfPage.placements.map(item=>item.image))]:[...session.images.values()].filter(image=>image.job.id===selectedJob?.id),images=focused.length?focused:[...session.images.values()],zones=images.reduce((n,v)=>n+(v.scope?.subimages?.length??0),0),unsplit=images.filter(v=>v.scope?.coverage?.subimages==='embedded-bitmap').length,suffix=images.some(v=>v.scopeError)?t(' · détection incomplète',' · incomplete detection'):images.some(v=>!v.scope)?t(' · recherche des sous-images',' · detecting sub-images'):' · '+zones+t(' zones d’histogramme',' histogram domains')+(unsplit?' · '+unsplit+t(' images sans découpe',' unsplit images'):'')+t(' · effets sur toute la page',' · effects across the page');progress.textContent=session.pages.size+t(' pages prêtes',' pages ready')+suffix;};
 session.summary=summary;gallery.replaceChildren();gallery.hidden=false;document.body.classList.add('pdf-mode');
 const progress=document.createElement('p');progress.id='pdf-progress';progress.textContent=t('Préparation du PDF…','Preparing PDF…');gallery.append(progress);
 const pages=document.createElement('nav');pages.id='pdf-pages';pages.setAttribute('aria-label',t('Pages prêtes','Ready pages'));gallery.append(pages);
 const collectAll=document.createElement('button');collectAll.textContent=t('Ajouter les images à la sélection','Add images to selection');collectAll.id='collect-pdf';gallery.append(collectAll);
 collectAll.onclick=async()=>{collectAll.disabled=true;try{for(const image of session.images.values())await send({type:'collection-add',id:image.job.id});status(t('Images ajoutées à la sélection.','Images added to selection.'));}catch(error){status(error.message);}finally{collectAll.disabled=false;}};
 const {createBatchImporter}=await import('./pdf-import.js');let first=true;
 model=await createBatchImporter({onProgress:value=>{if(value.phase==='pdf')progress.textContent=t('Préparation · page ','Preparing · page ')+value.page+' / '+value.pages;},onPage:async({page,pdfPage:documentPage,study,images})=>{
  session.controller.signal.throwIfAborted();
  const viewport=documentPage.getViewport({scale:2}),canvas=new OffscreenCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));if(canvas.width*canvas.height>100_000_000)throw Error('Page PDF supérieure à 100 MP à cette définition.');
  await documentPage.render({canvasContext:canvas.getContext('2d'),viewport,background:'white'}).promise;
  session.controller.signal.throwIfAborted();const blob=await canvas.convertToBlob({type:'image/png'});session.controller.signal.throwIfAborted();const pageJob={id:crypto.randomUUID(),kind:'image',blob,width:canvas.width,height:canvas.height,name:job.name.replace(/\.pdf$/i,'')+'-p'+page+'.png',reason:'pdf-rendered-page',sourcePage:job.sourcePage,url:job.url,pdfPage:page,sourcePDFId:job.id,cacheOwnerTabId:job.cacheOwnerTabId,created:Date.now(),tabId:job.tabId};canvas.width=canvas.height=1;
  await putJob(pageJob);const descriptor={job:pageJob,placements:[],number:page};session.pages.set(pageJob.id,descriptor);
  for(const image of images){let value=session.images.get(image.id);if(!value){const child={id:crypto.randomUUID(),kind:'image',blob:image.blob,name:image.name,width:image.width,height:image.height,reason:image.encoding,sourcePage:job.sourcePage,url:job.url,pdfPage:page,sourcePDFId:job.id,cacheOwnerTabId:job.cacheOwnerTabId,created:Date.now(),tabId:job.tabId};await putJob(child);value={image,job:child,scope:null,allowedTiles:undefined,entry:null};session.images.set(image.id,value);
    const button=document.createElement('button'),thumb=document.createElement('img'),caption=document.createElement('span');thumb.src=URL.createObjectURL(image.thumbnail);thumb.onload=()=>URL.revokeObjectURL(thumb.src);caption.textContent=image.width+' × '+image.height+' · p. '+page;button.append(thumb,caption);value.button=button;button.onclick=()=>void load(child).catch(error=>status(error.message));gallery.append(button);
    void session.scope.prepare(image).then(async scope=>{if(pdfSession!==session)return;value.scope=scope;value.job={...value.job,pdfSubimageScope:scope};await updateJob(value.job.id,current=>current?{...current,pdfSubimageScope:scope}:undefined);if(pdfSession!==session)return;if(value.button)value.button.title=scope.coverage?.subimages==='embedded-bitmap'?t('Image entière : aucune découpe plus fine détectée.','Whole image: no finer split detected.'):(scope.subimages?.length??0)+t(' zones d’histogramme indépendantes.',' independent histogram domains.');value.allowedTiles=scope.schema==='sherloq.pdf-subimages/1'?undefined:await eligiblePDFTiles(scope,image.width,image.height);effectSurfaceKey=null;loupe.invalidate();summary();}).catch(error=>{if(pdfSession===session&&error.code!=='CANCELLED'){value.scopeError=JSON.stringify({message:error.message,details:error.details,cause:error.cause});progress.title=t('Détection des sous-images indisponible : ','Sub-image detection unavailable: ')+error.message;summary();}});
  }
   for(const occurrence of image.occurrences.filter(o=>o.studyId===study.id&&o.page===page))descriptor.placements.push({job:value.job,image:value,occurrence,matrix:imagePlacement(viewport,occurrence,image.width,image.height)});
  }
  const link=document.createElement('a');link.href='#page-'+page;link.textContent=t('Page ','Page ')+page;link.dataset.page=page;link.onclick=event=>{event.preventDefault();void load(pageJob).catch(error=>status(error.message));};pages.append(link);
  if(first){first=false;if(activePDFSourceId===job.id&&loadSerial===session.selectionSerial)await load(pageJob);}progress.dataset.ready=session.pages.size;summary();
 }});
 await model.import([new File([job.blob],job.name,{type:'application/pdf'})],session.controller.signal);
 if(pdfSession!==session)return;session.complete=true;summary();progress.dataset.complete='true';
 if(model.errors.length)progress.title=model.errors.map(e=>e.message).join(' ; ');
}

function setOriginal(value){if(original===value)return;original=value;if(value)playback.releaseAll();loupe.draw();refreshControlAvailability();}
function keyAction(action,key,shiftKey){
 if(action==='help'){quickHelp.show();return;}
 if(action==='ocr'){void ocr.run();return;}
 if(['mark','export','basket','previousMark','nextMark'].includes(action))void features.command(action);
 else if(action==='settings')panelOpen(panel.hidden);
 else if(action==='decrease'||action==='increase')requestAdjustment(action==='decrease'?-1:1);
 else if(action==='sweep'){playback.reset();const chosen=effects.activeGroup(),group=p.loupe.effects[chosen]?.enabled?chosen:['adjust','sweep','enhance'].find(g=>p.loupe.effects[g].enabled);if(group)loupe.toggleSweep(group);else status(t('Activez un effet dans les réglages pour le balayer.','Enable an effect in settings before sweeping.'));}
 else if(action==='geometry')loupe.keydown({key,shiftKey,preventDefault(){}});
}
function move(x,y){const r=view.getBoundingClientRect();pointer={x:x-r.left,y:y-r.top};if(overlay)drawBase();view.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y,bubbles:false}));refreshControlAvailability();}
function receive(data){
 if(data.type==='clipboard-result'){const request=clipboardRequests.get(data.id);clipboardRequests.delete(data.id);if(data.ok)request?.resolve();else request?.reject(Error(data.error||'Copie impossible.'));return;}
 if(data.type==='pending'){recent.clear();sourceChoiceSerial++;playback.reset();clearVisible();features.reset();requestedImageKey=data.key;activeEntry=null;activeImageKey=null;bitmap=null;adjacent=[];clearTimeout(warmTimer);resolving=true;queuedOpen=null;requestedJobId=null;requestEpoch++;loadSerial++;selectedJob=null;surface=null;loupe.stopSweep();loupe.hide();}
 if(data.type==='job'){if(data.key!==requestedImageKey)return;requestedJobId=data.id;const epoch=++requestEpoch;currentLoad=getJob(data.id).then(job=>{if(epoch===requestEpoch){if(!job){port?.postMessage({type:'cache-miss',id:data.id});return;}return load(job,data.key);}}).catch(error=>status(error.message));}
 if(data.type==='source-candidates')features.setCandidates(data.candidates);
 if(data.type==='resolution-complete'){if(selectedJob?.blob)void getJob(selectedJob.id).then(job=>{if(job?.id===selectedJob?.id){selectedJob=job;features.sync();}});resolving=false;if(queuedOpen){const destination=queuedOpen;queuedOpen=null;void open(destination);}}
 if(data.type==='page-bitmap'){
  if(data.key!==requestedImageKey||requestedJobId||!(data.bitmap instanceof ImageBitmap)){data.bitmap?.close();return;}
  const job={id:'page-'+crypto.randomUUID(),kind:'image',name:data.name,reason:'loaded-page-image',width:data.bitmap.width,height:data.bitmap.height};
  const entry=memory.adopt(job.id,data.bitmap,job);memory.select(job.id);activeImageKey=data.key;activeEntry=entry;bitmap=entry.bitmap;drawnBase=null;surface=presentation(entry);selectedJob=job;void features.refresh();update();drawBase();move(pointer.x,pointer.y);void prepareSelected();
 }
 if(data.type==='blob-image'){
  const epoch=++requestEpoch;
  currentLoad=(async()=>{
   if(!(data.blob instanceof Blob)||data.blob.size>256*1024**2)throw Error('Image incorporée invalide ou trop volumineuse.');
   const suffix={'image/jpeg':'jpg','image/webp':'webp','image/avif':'avif','image/gif':'gif','image/svg+xml':'svg','image/bmp':'bmp'}[data.blob.type]||'png';
   const job={id:crypto.randomUUID(),kind:'image',blob:data.blob,name:data.name||'image-incorporee.'+suffix,reason:data.reason||'embedded-source',videoTime:data.videoTime,sourcePage:data.sourcePage,url:data.url,created:Date.now()};
   await putJob(job);if(epoch!==requestEpoch){await deleteJob(job.id);return;}requestedJobId=job.id;await load(job,data.key);if(epoch===requestEpoch)port?.postMessage({type:'blob-ready',token:data.token,id:job.id,width:bitmap.width,height:bitmap.height});
  })().catch(error=>status(error.message));
 }
 if(data.type==='geometry'){
  if(data.key!==requestedImageKey)return;const before=JSON.stringify(adjacent.map(item=>[item.id,item.rect,item.style]));pageGeometry=data;pointer=data.pointer;
  adjacent=(data.neighbors||[]).filter(item=>item.key!==data.key&&item.id!==activeEntry?.id).slice(0,3).map(item=>({...item,entry:adjacent.find(old=>old.id===item.id)?.entry}));
  for(const item of adjacent)if(!item.entry)void memory.get(item.id).then(entry=>{if(!entry||!adjacent.includes(item))return;item.entry=entry;if(activeEntry)surface=presentation(activeEntry);drawnBase=null;drawBase();scheduleWarm();});
  if(before!==JSON.stringify(adjacent.map(item=>[item.id,item.rect,item.style]))){if(activeEntry)surface=presentation(activeEntry);drawnBase=null;scheduleWarm();}move(pointer.x,pointer.y);
 }
 if(data.type==='leave'){if(activeEntry){recent.set({id:requestedJobId||selectedJob?.id,resolving,selection:data.selection,blob:data.blob});}sourceChoiceSerial++;playback.reset();clearVisible();features.reset();requestedImageKey=null;activeImageKey=null;activeEntry=null;bitmap=null;surface=null;selectedJob=null;adjacent=[];clearTimeout(warmTimer);resolving=false;queuedOpen=null;requestEpoch++;loadSerial++;requestedJobId=null;loupe.stopSweep();view.dispatchEvent(new PointerEvent('pointerleave'));loupe.hide();if(recent.get())status(t('Dernière image disponible · 15 s','Last image available · 15 s'));}
 if(data.type==='adjust-key'){if(data.phase==='up')playback.up(data.id);else requestAdjustment(data.direction,data.id,data.repeat,data.binding);}
 if(data.type==='release-keys')playback.releaseAll();
 if(data.type==='key')keyAction(data.action,data.key,data.shiftKey);
 if(data.type==='original')setOriginal(data.value);
 if(data.type==='open')void open(data.destination);
 if(['wheel','click','dblclick'].includes(data.type)){move(data.x,data.y);const EventType=data.type==='wheel'?WheelEvent:MouseEvent;view.dispatchEvent(new EventType(data.type,{clientX:data.x,clientY:data.y,deltaY:data.deltaY,deltaMode:data.deltaMode,shiftKey:data.shiftKey,detail:data.detail,button:data.button,cancelable:true}));}
 if(data.type==='dispose'){recent.clear();pdfImageContext.dispose();ocr.dispose();effects.dispose();controlPanel.dispose();settingsSliders.dispose();navigation.dispose();clearVisible();playback.dispose();clearTimeout(warmTimer);memory.dispose();loupe.dispose();}
 refreshControlAvailability();
}
if(overlay)addEventListener('message',function connect(event){if(event.source!==parent||event.data?.type!=='sherloq-connect'||event.data.token!==location.hash.slice(1)||!event.ports[0]||port)return;port=event.ports[0];port.onmessage=({data})=>receive(data);port.start();port.postMessage({type:'ready'});removeEventListener('message',connect);});
function keydown(event){
 if(event.hoverSlider)return; // The physical key will bubble once from the presentation range.
 if(document.querySelector('dialog[open]'))return;
 if(event.key==='Shift'&&pdfEffectsContext()&&loupe.visible&&!event.repeat){forcePDF=true;return;}
 if(event.isComposing||event.composedPath().some(n=>['TEXTAREA','SELECT'].includes(n?.tagName)||n?.tagName==='INPUT'&&!['range','checkbox','button','file'].includes(n.type)||n?.isContentEditable))return;
 const combo=eventShortcut(event),{action,binding}=resolveShortcut(p,combo);
 const arrow=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key);
 if(event.repeat&&!['decrease','increase'].includes(action)&&!arrow)return;
 if(action==='decrease'||action==='increase'){event.preventDefault();requestAdjustment(action==='decrease'?-1:1,'frame:'+(event.code||event.key),event.repeat,binding);return;}
 if(action==='original'||event.key==='Alt'){setOriginal(true);return;}
 if(action==='close'||event.key==='Escape'){event.preventDefault();if(!panel.hidden)panelOpen(false);else if(overlay)port?.postMessage({type:'close'});else setLoupeEnabled(!p.loupe.enabled);return;}
 if(action){event.preventDefault();keyAction(action);return;}
 if(arrow&&!event.composedPath().some(n=>n?.closest?.('#panel'))){if(loupe.keydown({key:event.key,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey,preventDefault(){}}))event.preventDefault();return;}
 loupe.keydown(event);
}
document.addEventListener('keydown',keydown);document.addEventListener('keyup',event=>{if(event.key==='Shift'&&forcePDF)forcePDF=false;playback.up('frame:'+(event.code||event.key));if(event.key==='Alt'||eventShortcut(event)===p.shortcuts.original){setOriginal(false);}});
addEventListener('blur',()=>{forcePDF=false;navigation.release();playback.releaseAll();setOriginal(false);refreshControlAvailability();});document.addEventListener('visibilitychange',()=>{if(document.hidden){navigation.release();playback.releaseAll();}else{loupe.draw();playback.wake();}refreshControlAvailability();});addEventListener('resize',drawBase);visualViewport?.addEventListener('resize',drawBase);visualViewport?.addEventListener('scroll',drawBase);addEventListener('pagehide',()=>{recent.clear();pdfImageContext.dispose();ocr.dispose();effects.dispose();controlPanel.dispose();settingsSliders.dispose();navigation.dispose();pdfSession?.controller.abort();pdfSession?.scope.dispose();pdfSession?.subimages.dispose();clearVisible();playback.dispose();clearTimeout(warmTimer);loupe.dispose();memory.dispose();void model?.artifacts.dispose();});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&watchedTransfer&&changes[watchedTransfer])transferNotice(changes[watchedTransfer].newValue);if(changes.preferences){let next=normalizeSettings(changes.preferences.newValue);next={...next,loupe:{...next.loupe,enabled:overlay?true:p.loupe.enabled}};if(controlRevision!==savedControlRevision)next={...next,controlTarget:p.controlTarget,controlStep:p.controlStep,controlGroups:p.controlGroups,controlInterval:p.controlInterval};if(loupeRevision!==savedLoupeRevision)next={...next,loupe:p.loupe};if(JSON.stringify([next.loupe.effects,next.controlTarget,next.controlStep,next.controlInterval,next.parameterBindings])!==JSON.stringify([p.loupe.effects,p.controlTarget,p.controlStep,p.controlInterval,p.parameterBindings]))playback.reset();p=next;update(true);}});
async function openLocalFile(file){if(!file)return;const job={id:crypto.randomUUID(),kind:/\.pdf$/i.test(file.name)?'pdf':'image',blob:file,name:file.name,reason:'selected-file',sourcePage:'',created:Date.now()};await putJob(job);void load(job).catch(error=>{if(error.name!=='AbortError'&&error.code!=='CANCELLED')status(error.message);});}
$('file').onchange=event=>void openLocalFile(event.target.files[0]);document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});document.addEventListener('drop',event=>{const file=event.dataTransfer?.files[0];if(file){event.preventDefault();void openLocalFile(file);}});
window.__sherloqLoupe={get ocr(){return ocr.state;},get pdf(){return pdfSession&&{ready:pdfSession.pages.size,active:pdfPage?.number,force:forcePDF,fullPageEffects:true,subimages:pdfSession.subimages.stats(),images:[...pdfSession.images.values()].map(v=>({id:v.job.id,decoded:!!v.entry&&!v.entry.closed,scope:v.scope,scopeError:v.scopeError,allowedTiles:v.allowedTiles,metrics:v.entry?.prepared?.metrics}))};},diagnostics:()=>({...loupe.diagnostics(),camera:{...camera},keyboard:playback.diagnostics()}),get navigation(){return {camera:{...camera},enabled:!overlay&&!!bitmap&&!loupe.enabled,mode:p.navigationMode,fitted:cameraFitted,viewport:viewerViewport(),loupeSpace:loupeSpace()};},get source(){return selectedJob&&{width:bitmap?.width,height:bitmap?.height,name:selectedJob.name,reason:selectedJob.reason};},get imageDomains(){return pdfImageContext.stats();},get stage(){return {prepared:!!memory.prepared(activeEntry,p.loupe.effects),imageKey:activeImageKey,requestedImageKey,neighbors:adjacent.map(item=>({key:item.key,id:item.id}))};},get cache(){return memory.stats();},get preferences(){return p;}};
update(true);if(overlay)parent.postMessage({type:'sherloq-renderer-ready',token:location.hash.slice(1)},'*');const id=new URLSearchParams(location.search).get('job');if(id)void getJob(id).then(load).catch(error=>status(error.message));
