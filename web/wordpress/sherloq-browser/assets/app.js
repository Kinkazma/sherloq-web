import {rasterOptions,exportPresentationRaster} from './raster-export-client.js';
import {exportDefaults,linkedExportSize} from './media-settings.js';
import {validateLoupeEffects} from './loupe-effects-settings.js';
import {createPointerLoupe} from './pointer-loupe.js';
import {bindSliderReset} from './slider-reset.js';
import {loupeDefaults,loupeKey,validateLoupeSettings,imageAccept,loupeScale,loupeMinimumZoom} from './media-settings.js';
import {toolCatalog,toolTitle} from './tool-catalog.js';
import {createToolClient} from './tool-client.js';
import {createErrorJournal,errorEvidence,showErrorJournal} from './error-journal.js';
import {localizeStatus,errorText} from './ui-errors.js';
import {detectedRectangles} from './sparse-controls.js';
import {createToolWorkspace} from './tool-workspace.js';
import {createAutomaticClient} from './automatic-client.js';
import {createAutomaticProgress,automaticSelection,automaticReport} from './automatic-state.js';
import {createCompositeClient} from './composite-client.js';
import {resolveComputeProfile} from './resource-policy.js';
import {createRemoteSurface} from './remote-surface.js';
import {createExportSink} from './export-sink.js';
import {removeTerminatedTemporarySession} from './unified-engine/src/temporary-storage.js';
import {createEnergyUI} from './energy-ui.js';
import { bindViewerNavigation, doubleClickCamera } from './viewer-input.js';
import { strings } from './i18n.js';
import { toolGroups } from './tool-tree.js';
import { defaults, validParams, validEnergySettings, validCompositeSettings, validAutomaticSettings, validateSettings, settingsFilename } from './settings.js';
import { createWindowLayout } from './window-layout.js';
import { TileCache } from './tiled-surface.js';
import { exportRGBPNG } from './png-export.js';
export function mountAnalysisPanel(document=globalThis.document,host={}) {
const $=id=>document.getElementById(id);
let activeAnalysis='ela.classic',compositeClient=null,compositeResult=null,compositeAbort=null,compositeCleanup=Promise.resolve(),compositeDisposing=false;
const compositeMode=()=>activeAnalysis==='composite';
const individualMode=()=>!!toolCatalog[activeAnalysis];
let individualUI=null,individualClient=null,individualOpening=null,individualCleanup=Promise.resolve(),individualEpoch=0,individualDisposing=false,individualCancelled=false,pendingMagnifier=false;
function stopIndividual(){pointerLoupe?.cancelImage();individualEpoch++;const client=individualClient;individualClient=null;individualUI?.invalidateResult();if(client){individualDisposing=true;individualCleanup=individualCleanup.then(()=>client.dispose()).catch(error=>console.warn('Tool cleanup:',error)).finally(()=>individualDisposing=false);}}
const automaticMode=()=>['analysis.complete','analysis.clones'].includes(activeAnalysis);
let automaticOpening=null,automaticEpoch=0,automaticDisposing=false;
let automaticClient=null,automaticCleanup=Promise.resolve(),automaticProgress=null,automaticSnapshot=null,automaticStarted=0,automaticClock=null,automaticDisplayRevision=0;
function stopAutomatic(){automaticEpoch++;clearInterval(automaticClock);automaticClock=null;const client=automaticClient;automaticClient=null;if(client){automaticDisposing=true;automaticCleanup=automaticCleanup.then(()=>client.dispose()).catch(error=>console.warn('Automatic cleanup:',error)).finally(()=>{automaticDisposing=false;});}}

function releaseCompositeResult(){if(compositeResult&&compositeClient){const client=compositeClient,id=compositeResult.id;compositeResult=null;compositeCleanup=compositeCleanup.then(()=>client.release(id)).catch(()=>{});}}
function stopComposite(){compositeAbort?.abort();compositeAbort=null;const client=compositeClient;compositeClient=null;compositeResult=null;if(client){compositeDisposing=true;compositeCleanup=compositeCleanup.then(()=>client.dispose()).catch(error=>console.warn('Composite cleanup:',error)).finally(()=>{compositeDisposing=false;});}}
let energyUI=null,energyMode=false,energyViewRevision=0,energyViewBusy=false,energyViewQueued=false,autoRunTimer=null;
function queueAnalysis(){
 clearTimeout(autoRunTimer);autoRunTimer=null;
 if(!fileInput||host.sourceOnly||$('app').classList.contains('original-mode'))return;
 if(localMagnifier()){pendingMagnifier=false;refreshLocalMagnifier();return;}
 if(busy||energyViewBusy){if(activeAnalysis==='inspection.magnifier')pendingMagnifier=true;return;}
 pendingMagnifier=false;
 if(individualMode()&&!individualUI?.canRun())return;
 autoRunTimer=setTimeout(()=>{autoRunTimer=null;if(fileInput&&!busy&&!energyViewBusy&&!drawing)void run();},250);
 host.changed?.();
}

let layouts=null,profiles=[],pendingSettings=null,settingsReady=false;
let lang=new URLSearchParams(location.hash.slice(1)).get('lang')==='en'?'en':'fr';
let source=null,result=null,fileInput=null,imageId='',hash='',expectedHash='',regions=[],revision=0,worker=null,loaded=false,busy=false,pending=new Map(),seq=0;
let previousPresentation=null,presentedSurface=null,comparingOriginal=false,comparisonSource=null,comparisonBase=null;
let destroyed=false;
let pointerLoupe=null,loupeSettings={...loupeDefaults};
let zoom=1,offset={x:0,y:0},drawing=false,draft=null,pointers=new Map(),gesture=null;
const tileCache=new TileCache((navigator.deviceMemory&&navigator.deviceMemory<=4?16:32)*1024**2);
const uiRGBBudget=Math.floor(resolveComputeProfile('aggressive').memoryBudgetBytes/3);
let exportController=null,storageEstimate=null;
const temporarySessions=new Map();
const errorJournal=createErrorJournal();let lastIndividualProgress=null;
let resultMeta=null,params={...defaults},engineCapabilities=null;
const browserCapabilities={secureContext:isSecureContext,worker:typeof Worker!=='undefined',wasm:typeof WebAssembly!=='undefined',webgpuAPI:!!navigator.gpu,cpuThreadsHint:navigator.hardwareConcurrency||null};
const canvas=$('canvas'),ctx=canvas.getContext('2d'),view=$('viewport');
const t=key=>strings[lang][key]||key;
function status(message){$('status').textContent=localizeStatus(message,lang);host.changed?.();}
function localGet(key){if(host.managed)return null;try{return JSON.parse(localStorage.getItem('sherloq.'+key));}catch{return null;}}
function localSet(key,value){if(host.managed)return true;try{localStorage.setItem('sherloq.'+key,JSON.stringify(value));return true;}catch{return false;}}
function translate(){const previous=$('status').textContent;for(const key of Object.keys(strings.fr)){if(previous===strings.fr[key]||previous===strings.en[key]){$('status').textContent=t(key);break;}}document.documentElement.lang=lang;$('language').value=lang;document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));renderCapabilities();renderRegions();renderToolTree();renderProfiles();energyUI?.translate();syncAnalysisControls();individualUI?.translate?.();translateTaskActions();updateChrome();draw();}
function serialize(){return {schema:'sherloq.session/1',individual:individualUI?.serialize(),operation:individualMode()?activeAnalysis:automaticMode()?activeAnalysis:compositeMode()?'composite':energyMode?'ela.energy':'ela.classic',automatic:automaticSettings(),composite:compositeSettings(),energy:energyUI.bundle(),params:{...params},regions:structuredClone(regions),regionMode:$('zone-mode').value,sha256:hash||expectedHash,language:lang};}
function syncParams(){for(const key of Object.keys(defaults)){$(key)[typeof defaults[key]==='boolean'?'checked':'value']=params[key];}}
function retireResult(preserve=true){
 const snapshot=preserve?result?.freeze?.():null;
 if(snapshot){previousPresentation?.close?.();previousPresentation=snapshot;}
 if(!preserve){previousPresentation?.close?.();previousPresentation=null;comparisonSource?.close?.();comparisonSource=null;comparisonBase=null;}
 result?.close?.();result=null;
}
const localMagnifier=()=>activeAnalysis==='inspection.magnifier'&&loupeSettings.enabled;
const processedSurface=()=>result??previousPresentation;
function comparisonSurface(){const shared=host.sourceInput?.()?.source;if(shared&&shared!==comparisonBase){comparisonSource?.close?.();comparisonBase=shared;comparisonSource=shared.fork?.(scheduleDraw);}return comparisonSource??source;}
const selectedSurface=()=>comparingOriginal||localMagnifier()?comparisonSurface():$('layer').value==='result'&&processedSurface()?processedSurface():source;
function invalidate({preserve=true}={}){retireResult(preserve);releaseCompositeResult();$('composite-npz').disabled=true;clearTimeout(autoRunTimer);autoRunTimer=null;revision++;energyViewRevision++;$('energy-npz').disabled=true;$('energy-json').disabled=true;exportController?.abort();resultMeta=null;$('layer').value=previousPresentation?'result':'source';$('export-png').disabled=true;$('export-report').disabled=true;$('provenance').textContent='';draw();}
function setCompareOriginal(value){if(comparingOriginal===value)return;comparingOriginal=value;individualUI?.setOriginal(value||localMagnifier()||$('app').classList.contains('original-mode'));draw();}
const displayedZoom=()=>Math.round((pointerLoupe?.enabled?loupeScale(loupeSettings,zoom,localMagnifier()):zoom)*100);

function controls(){ host.changed?.();individualUI?.lock(busy||energyViewBusy||!!exportController,!!fileInput);for(const b of $('tool-tree').querySelectorAll('button'))b.disabled=busy&&!['original',activeAnalysis].includes(b.dataset.toolId);automaticControls();const locked=busy||energyViewBusy||!!exportController;for(const id of ['composite-quality','composite-stage','composite-view'])$(id).disabled=locked;$('composite-run').disabled=!fileInput||locked;$('composite-cancel').disabled=!locked;$('composite-npz').disabled=!compositeResult||locked; $('run').disabled=!fileInput||locked; $('cancel').disabled=!locked; $('file').disabled=locked;$('open-file').disabled=locked;$('empty-open').disabled=locked; for(const k of Object.keys(defaults))$(k).disabled=locked; $('energy-run').disabled=!fileInput||locked;$('energy-cancel').disabled=!locked;$('ela-mode').disabled=locked;for(const mode of ['classic','energy']){const tab=$('ela-tab-'+mode);if(tab)tab.disabled=locked;} $('preset').disabled=locked; $('reset').disabled=locked;$('load-session').disabled=locked;$('compute-profile').disabled=locked;for(const id of ['task-zones','task-auto-zones'])if($(id))$(id).disabled=!fileInput||locked;if($('task-run'))$('task-run').disabled=!fileInput||locked||(individualMode()&&!individualUI?.canRun());}
function cleanupTemporarySessions(){for(const session of temporarySessions.values())void removeTerminatedTemporarySession(session.id,session.backend).catch(()=>{});temporarySessions.clear();}
function stop(){retireResult();stopIndividual();stopAutomatic();stopComposite();if(compositeMode()){result?.close?.();result=null;resultMeta=null;$('export-report').disabled=true;$('composite-detail').textContent='';}clearTimeout(autoRunTimer);autoRunTimer=null;revision++;$('energy-npz').disabled=true;$('energy-json').disabled=true;energyViewBusy=false;energyViewQueued=false;exportController?.abort();exportController=null;worker?.terminate();worker=null;loaded=false;cleanupTemporarySessions();for(const {reject} of pending.values())reject(Object.assign(new Error('Cancelled'),{code:'CANCELLED'}));pending.clear();busy=false;controls();$('export-png').disabled=!result;}
function getWorker(){
 if(worker)return worker;
 const created=new Worker(new URL('./engine-worker.js',import.meta.url),{type:'module'});worker=created;
 created.onmessage=async({data})=>{
  if(data.temporarySession){temporarySessions.set(data.temporarySession.id,data.temporarySession);return;}
  const call=pending.get(data.id);if(!call)return;
  if(data.chunk){try{await call.onChunk(data.chunk);created.postMessage({id:data.id,action:'export-ack',sequence:data.sequence});}catch(error){created.postMessage({id:data.id,action:'export-ack',sequence:data.sequence,error:error.message});}return;}
  if(data.progress){$('progress').value=Math.max(0,Math.min(1,data.progress.fraction||0));status(t('running')+' '+data.progress.phase+' '+Math.round(100*$('progress').value)+'%');return;}
  pending.delete(data.id);data.error?call.reject(Object.assign(new Error(data.error.message),{code:data.error.code})):call.resolve(data.result);
 };
 created.onerror=()=>{for(const c of pending.values())c.reject(new Error(t('unavailable')));pending.clear();created.terminate();if(worker===created){worker=null;loaded=false;cleanupTemporarySessions();}};
 return created;
}
function request(action,payload,onChunk){if(individualMode())return individualRequest(action,payload);if(automaticMode())return automaticRequest(action,payload);return new Promise((resolve,reject)=>{
 const id=++seq;pending.set(id,{resolve,reject,onChunk});
 try{getWorker().postMessage({id,action,payload,options:{energy:energyMode,uiRGBBudgetBytes:uiRGBBudget,uiReserveBytes:tileCache.limit+32*1024**2+Math.ceil((globalThis.innerWidth||1920)*(globalThis.innerHeight||1080)*Math.min(devicePixelRatio||1,2)**2*8)+4*1024**2,computeProfile:$('compute-profile').value,resourceHints:{deviceMemoryGiB:navigator.deviceMemory,heapLimitBytes:performance.memory?.jsHeapSizeLimit,hardwareConcurrency:navigator.hardwareConcurrency}}});}
 catch(error){pending.delete(id);reject(error);}
});}
let displayFramePending=false;function scheduleDraw(){if(destroyed||displayFramePending)return;displayFramePending=true;requestAnimationFrame(()=>{displayFramePending=false;draw();});}
function remoteSurface(display){return createRemoteSurface(display,tileCache,(action,payload)=>loaded?request(action,payload):Promise.reject(Object.assign(Error('Source not loaded'),{code:'CANCELLED'})),scheduleDraw,error=>{if(error.code!=='CANCELLED')status(t('error')+' · '+error.message);});}
function fit(){if(individualUI?.fit?.())return;if(!source||!view.clientWidth||!view.clientHeight)return;const frame=individualMode()&&$('layer').value==='result'&&result?result:source;zoom=Math.min(view.clientWidth/frame.width,view.clientHeight/frame.height)*.95;offset={x:(view.clientWidth-frame.width*zoom)/2,y:(view.clientHeight-frame.height*zoom)/2};draw();}
function draw(){
 if(destroyed)return;
 if(host.visible&&!host.visible())return;
 const displayed=selectedSurface();
 if(pointerLoupe?.enabled&&displayed){zoom=Math.min(view.clientWidth/displayed.width,view.clientHeight/displayed.height)*.95;offset={x:(view.clientWidth-displayed.width*zoom)/2,y:(view.clientHeight-displayed.height*zoom)/2};}
 layouts?.draw();const dpr=Math.min(devicePixelRatio||1,2),w=view.clientWidth,h=view.clientHeight,bounds={left:-offset.x/zoom,top:-offset.y/zoom,right:(w-offset.x)/zoom,bottom:(h-offset.y)/zoom};
 let nextSurface=layouts&&layouts.mode!=='tabs'&&!comparingOriginal&&!localMagnifier()?processedSurface():displayed;
 if(nextSurface?.prepare&&!nextSurface.prepare(bounds,zoom*dpr)){
  if(nextSurface===result&&previousPresentation)nextSurface=previousPresentation;else return;
 }else if(nextSurface===result&&previousPresentation){previousPresentation.close();previousPresentation=null;}
 presentedSurface=nextSurface;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 if(nextSurface){ctx.save();ctx.translate(offset.x,offset.y);ctx.scale(zoom,zoom);ctx.imageSmoothingEnabled=zoom<3;nextSurface.draw(ctx,bounds,zoom*dpr);
  if($('show-zones').checked){ctx.lineWidth=2/zoom;ctx.font=12/zoom+'px "iowan-old-style-bt", "Iowan Old Style", Georgia, serif';for(const [i,r]of [...regions,...(draft?[draft]:[])].entries()){ctx.strokeStyle='#72f3ce';ctx.fillStyle='#72f3ce';ctx.strokeRect(r.x0,r.y0,r.x1-r.x0,r.y1-r.y0);ctx.fillText(String(i+1),r.x0+4/zoom,r.y0+14/zoom);}}
  ctx.restore();
 }
 $('analysis-state').hidden=individualMode()||!source||!!processedSurface()||$('app').classList.contains('original-mode');$('analysis-state').textContent=automaticMode()?autoText(busy?'Analyse automatique en cours…':'Prêt pour l’analyse automatique.',busy?'Automatic analysis running…':'Ready for automatic analysis.'):t(compositeMode()?(busy?'compositeComputing':'compositeWaiting'):(busy?'originalComputing':'originalPending'));
 $('zoom').value=displayedZoom()+'%';$('legend').textContent=individualMode()?toolTitle(activeAnalysis,lang):automaticMode()&&$('layer').value==='result'&&result?automaticLegend():t($('layer').value==='result'&&processedSurface()?(compositeMode()?'compositeLegend':energyMode?'energyLegend':'resultLegend'):'legend');pointerLoupe?.draw();host.changed?.();
}

const imageInteraction=e=>!e?.target?.closest?.('#tool-results,button,input,select,textarea,dialog');
function point(e){const r=view.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function imagePoint(p){return{x:Math.max(0,Math.min(source.width,Math.round((p.x-offset.x)/zoom))),y:Math.max(0,Math.min(source.height,Math.round((p.y-offset.y)/zoom))) };}
function zoomAt(p,factor){if(pointerLoupe?.enabled){loupeSettings={...loupeSettings,zoom:Math.min(3600,Math.max(loupeMinimumZoom(loupeSettings,zoom,localMagnifier()),loupeScale(loupeSettings,zoom,localMagnifier())*100*factor))};pointerLoupe.set(effectiveLoupe());host.onLoupeChange?.(loupeSettings);draw();return;}if(individualUI?.zoomBy?.(factor))return;const next=Math.max(.02,Math.min(36,zoom*factor));offset={x:p.x-(p.x-offset.x)*next/zoom,y:p.y-(p.y-offset.y)*next/zoom};zoom=next;draw();}
function renderRegions(){$('zones').replaceChildren();regions.forEach((r,i)=>{const li=document.createElement('li');li.textContent=`${i+1}${r.envelope?' · '+autoText('Enveloppe','Envelope'):''} · [${r.x0}, ${r.y0}] → [${r.x1}, ${r.y1}]`;const b=document.createElement('button');b.textContent='×';b.setAttribute('aria-label',t('clear')+' '+(i+1));b.onclick=()=>{regions.splice(i,1);renderRegions();draw();};li.append(b);$('zones').append(li);});}
async function openFile(file){
 if(!file)return;stop();invalidate({preserve:false});fileInput=null;loaded=false;source?.close?.();source=null;hash='';$('file-info').textContent=t('noImage');$('empty').hidden=false;draw();busy=true;controls();status(t('loading'));const rev=revision;
 try{
  if(individualDisposing)await individualCleanup;if(automaticDisposing)await automaticCleanup;if(compositeDisposing)await compositeCleanup;if(rev!==revision)return;
  const id=crypto.randomUUID();
  engineCapabilities=await request('capabilities');if(rev!==revision)return;renderCapabilities();
  const descriptor=await request('load',{id,blob:file});if(rev!==revision)return;
  const digest=descriptor.sha256;
  if(expectedHash&&digest!==expectedHash)throw new Error(t('sessionMismatch'));
  if(restoring&&regions.some(r=>r.x1>descriptor.width||r.y1>descriptor.height))throw new Error('Region outside image');
  loaded=true;source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});fileInput=file;individualUI?.setFile(file);hash=digest;imageId=id;expectedHash='';
  if(!restoring)regions=[];restoring=false;renderRegions();$('file-info').textContent=`${file.name} · ${descriptor.width} × ${descriptor.height} · ${(file.size/1024**2).toFixed(2)} MiB`;
  $('empty').hidden=true;fit();status(t('ready'));
 }catch(e){if(rev===revision){worker?.terminate();worker=null;loaded=false;cleanupTemporarySessions();status(t('error')+' · '+(e.code||'')+' '+e.message);}}
 finally{if(rev===revision){busy=false;controls();if(fileInput)queueAnalysis();}}
}

let restoring=false;
async function run(){if(busy||energyViewBusy)return;if(drawing)setDrawing(false);if(individualMode())return runIndividual();if(automaticMode())return runAutomatic();if(compositeMode())return runComposite();clearTimeout(autoRunTimer);autoRunTimer=null;if(busy||energyViewBusy)return;if(!fileInput)return status(t('needImage'));const mode=$('zone-mode').value;if(mode==='pair'&&regions.length!==2)return status(t('pairError'));if(mode!=='whole')return status(t('unsupported'));busy=true;controls();invalidate();const rev=revision;$('progress').value=0;status(t('running'));try{if(individualDisposing)await individualCleanup;if(automaticDisposing)await automaticCleanup;if(compositeDisposing)await compositeCleanup;if(rev!==revision)return;if(!loaded){engineCapabilities=await request('capabilities');if(rev!==revision)return;renderCapabilities();const descriptor=await request('load',{id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});$('tab-original').title='Engine RGB8';draw();}const energyRequest=energyMode?energyUI.prepare():null;const output=await request('run',{id:'ela-'+rev,imageId,operation:energyMode?'ela.energy':'ela.classic',params:energyMode?energyRequest.params:{...params},...(energyMode?{presentation:energyRequest.presentation}:{}),backend:'cpu',regions:[]});if(rev!==revision)return;if(energyMode&&!energyUI.accept(output.data.metadata,energyRequest.token))return;engineCapabilities=await request('capabilities');if(rev!==revision)return;renderCapabilities();retireResult();result=remoteSurface(output.display);const {pixels,display,...meta}=output;resultMeta={...meta,parameters:energyMode?output.provenance.params:{...params},capabilities:{browser:browserCapabilities,engine:engineCapabilities},ui:{version:'0.13.2',sourcePreview:'engine.readDisplay: bounded sampled frames; exact original retained',regionMode:'whole',sourceSha256:hash,memory:{rgbBudgetBytes:uiRGBBudget,retainedRGBBytes:(source?.byteLength||0)+(result?.byteLength||0),tileCacheBytes:tileCache.bytes,tileCacheLimitBytes:tileCache.limit,storageEstimate,storageBackend:'engine surface storage; original Blob retained without UI arrayBuffer copy',display:'complete viewport frames; sampled preview below 100%; analysis/export unchanged'}}};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('layer').value=$('app').classList.contains('original-mode')?'source':'result';$('export-png').disabled=false;$('export-report').disabled=false;$('energy-npz').disabled=!energyMode;$('energy-json').disabled=!energyMode;$('progress').value=1;draw();status(t('done'));}catch(e){if(rev===revision)status(e.code==='CANCELLED'?t('cancelled'):t('error')+' · '+(e.code||'')+' '+e.message);}finally{if(rev===revision){busy=false;controls();}}}
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportJSON(value,name){download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),name);}
async function restore(file){if(!file)return;try{if(file.size>1024**2)throw new Error('Session > 1 MiB');const v=JSON.parse(await file.text());if(v.schema!=='sherloq.session/1'||!['ela.classic','ela.energy','composite','analysis.complete','analysis.clones',...Object.keys(toolCatalog)].includes(v.operation))throw new Error('Unsupported session');const p=validParams(v.params),energy=validEnergySettings(v.energy),composite=validCompositeSettings(v.composite),automatic=validAutomaticSettings(v.automatic);if(!Array.isArray(v.regions)||v.regions.length>100)throw new Error('Invalid regions');for(const r of v.regions)if(!['x0','y0','x1','y1'].every(k=>Number.isInteger(r[k])&&r[k]>=0&&r[k]<100000)||r.x0>=r.x1||r.y0>=r.y1)throw new Error('Invalid region');if(!['whole','pair','cross','independent'].includes(v.regionMode))throw new Error('Invalid region mode');if(v.sha256&&!/^[a-f0-9]{64}$/.test(v.sha256))throw new Error('Invalid fingerprint');stop();invalidate({preserve:false});source?.close?.();source=null;fileInput=null;hash='';params=p;energyUI.load(energy);loadAutomaticSettings(automatic);for(const key of ['quality','stage','view'])$('composite-'+key).value=composite[key];individualUI?.restore(v.individual);activeAnalysis=toolCatalog[v.operation]?v.operation:v.operation.startsWith('analysis.')?v.operation:v.operation==='composite'?'composite':'ela.classic';setEnergyMode(v.operation==='ela.energy');chooseTool(activeAnalysis);regions=v.regions;expectedHash=v.sha256||'';restoring=true;$('zone-mode').value=v.regionMode;$('preset').value='manual';syncParams();renderRegions();$('empty').hidden=false;$('file').value='';$('file-info').textContent=t('noImage');controls();status(t('restored'));}catch(e){status(t('error')+' · '+e.message);if(host.managed)throw e;}finally{$('load-session').value='';}}
$('language').onchange=()=>{lang=$('language').value;translate();};$('file').accept=imageAccept;
$('file').onchange=e=>openFile(e.target.files[0]);$('run').onclick=run;$('cancel').onclick=()=>{if(automaticMode())return pauseAutomatic();stop();$('progress').value=0;status(t('cancelled'));};
// Take ownership before the browser changes a numeric control, including a step
// at its limit that emits neither input nor change. Focus/Tab/context menus do not.
function takeManualControl(){
 if(busy)stop();
 $('preset').value='manual';invalidate();status(t('changed'));persistSettings();
}
for(const key of ['quality','scale','contrast']){
 const control=$(key);
 const intent=()=>{if(!control.disabled)takeManualControl();};
 control.addEventListener('pointerdown',e=>{if(e.button===0&&e.isPrimary!==false)intent();},{capture:true});
 control.addEventListener('keydown',e=>{
  // Home/End and Left/Right navigate the number's text; they do not step it.
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&['ArrowUp','ArrowDown'].includes(e.key))intent();
 },{capture:true});
 control.addEventListener('beforeinput',e=>{if(/^(insert|delete)/.test(e.inputType||''))intent();},{capture:true});
 control.addEventListener('pointerup',()=>{if($('preset').value==='manual')queueAnalysis();});
 control.addEventListener('keyup',e=>{if(['ArrowUp','ArrowDown'].includes(e.key)&&$('preset').value==='manual')queueAnalysis();});
 // No custom wheel stepping: scrolling alone must not switch the profile.
}
for(const key of Object.keys(defaults))$(key).onchange=()=>{try{const next={...params,[key]:typeof defaults[key]==='boolean'?$(key).checked:Number($(key).value)};params=validParams(next);$('preset').value='manual';invalidate();status(t('changed'));queueAnalysis();}catch(e){syncParams();status(t('error')+' · '+e.message);}};
$('reset').onclick=()=>{params={...defaults};syncParams();$('preset').value='native';invalidate();queueAnalysis();};
$('preset').onchange=()=>{const value=$('preset').value;if(value==='manual')return;const profile=profiles.find(p=>p.id===value);params={...(profile?profile.params:defaults)};syncParams();invalidate();queueAnalysis();};
function renderProfiles(){const selected=$('preset').value||'native';$('preset').replaceChildren(new Option(t('native'),'native'),new Option(t('manual'),'manual'),...profiles.map(p=>new Option(p.name,p.id)));$('preset').value=[...$('preset').options].some(o=>o.value===selected)?selected:'manual';}
$('save-preset').onclick=()=>{const p=profiles.find(p=>p.id===$('preset').value);$('profile-name').value=p?.name||'';$('save-dialog').showModal();$('profile-name').focus();};
$('favorite').setAttribute('aria-pressed',String(!!localGet('favorite')));$('favorite').onclick=()=>{const v=$('favorite').getAttribute('aria-pressed')!=='true';$('favorite').setAttribute('aria-pressed',String(v));localSet('favorite',v);renderToolTree();};
function setDrawing(value){
 clearTimeout(autoRunTimer);autoRunTimer=null;drawing=value;draft=null;pointers.clear();gesture=null;
 $('draw').setAttribute('aria-pressed',String(drawing));$('task-zones')?.setAttribute('aria-pressed',String(drawing));view.classList.toggle('drawing',drawing);
 if(host.managed)$('inspector').hidden=!drawing;
 if(drawing){$('show-zones').checked=true;const different=result&&(result.width!==source?.width||result.height!==source?.height);$('layer').value='source';individualUI?.setOriginal(true);if(different)fit();}
 else{if(host.managed&&result){$('layer').value='result';fit();}individualUI?.setOriginal(false);}
 translateTaskActions();draw();
}
$('draw').onclick=()=>{if(!busy&&fileInput)setDrawing(!drawing);};$('clear-zones').onclick=()=>{regions=[];renderRegions();draw();};$('show-zones').onchange=draw;$('layer').onchange=()=>{if($('layer').value==='result'&&!result)status(t('noResult'));draw();};$('fit').onclick=()=>{fit();layouts?.fit();};$('zoom-in').onclick=()=>zoomAt({x:view.clientWidth/2,y:view.clientHeight/2},1.25);$('zoom-out').onclick=()=>zoomAt({x:view.clientWidth/2,y:view.clientHeight/2},.8);
bindViewerNavigation(view,{enabled:e=>!pointerLoupe?.enabled&&!drawing&&imageInteraction(e)&&!!source&&(layouts?.mode==='tabs'||!!result),getMode:()=>$('navigation-mode').value,panBy:(x,y)=>{offset.x+=x;offset.y+=y;draw();},zoomBy:zoomAt,isTouchActive:()=>pointers.size>1});
view.addEventListener('dblclick',e=>{if(pointerLoupe?.enabled)return;if(!imageInteraction(e)||e.button!==0||drawing||!source||(layouts?.mode!=='tabs'&&!result))return;e.preventDefault();const c=doubleClickCamera({scale:zoom,x:offset.x,y:offset.y},source,{width:view.clientWidth,height:view.clientHeight},point(e));zoom=c.scale;offset={x:c.x,y:c.y};draw();});
view.onpointerdown=e=>{if(pointerLoupe?.enabled&&!drawing)return;if(!imageInteraction(e)||e.button!==0||!source||(layouts?.mode!=='tabs'&&!result))return;view.setPointerCapture(e.pointerId);const p=point(e);pointers.set(e.pointerId,p);if(pointers.size===2){draft=null;const [a,b]=[...pointers.values()];gesture={distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};}else if(drawing){const q=imagePoint(p);draft={id:crypto.randomUUID(),x0:q.x,y0:q.y,x1:q.x,y1:q.y};gesture={origin:q};}else gesture={pan:p};};
view.onpointermove=e=>{if(!pointers.has(e.pointerId))return;const p=point(e);pointers.set(e.pointerId,p);if(pointers.size===2){const[a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y),center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(gesture?.distance){zoomAt(gesture.center,distance/Math.max(1,gesture.distance));offset.x+=center.x-gesture.center.x;offset.y+=center.y-gesture.center.y;}gesture={distance,center};}else if(draft&&gesture?.origin){const q=imagePoint(p),a=gesture.origin;draft={...draft,x0:Math.min(a.x,q.x),y0:Math.min(a.y,q.y),x1:Math.max(a.x,q.x),y1:Math.max(a.y,q.y)};}else if(gesture?.pan){offset.x+=p.x-gesture.pan.x;offset.y+=p.y-gesture.pan.y;gesture.pan=p;}draw();};
function endPointer(e){pointers.delete(e.pointerId);if(draft){if(draft.x1>draft.x0&&draft.y1>draft.y0&&regions.length<100)regions.push(draft);draft=null;renderRegions();}gesture=pointers.size?{pan:[...pointers.values()][0]}:null;draw();}view.onpointerup=endPointer;view.onpointercancel=()=>{pointers.clear();gesture=null;draft=null;draw();};
view.onkeydown=e=>{if(!imageInteraction(e))return;if(!host.managed&&e.code==='Space'&&source){e.preventDefault();$('layer').value=$('layer').value==='source'&&result?'result':'source';draw();}if(e.key==='Escape')setDrawing(false);if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();regions.pop();renderRegions();draw();}};
pointerLoupe=createPointerLoupe(view,{baseCanvas:canvas,getSurface:()=>presentedSurface,getCamera:()=>({scale:zoom,x:offset.x,y:offset.y}),canInteract:e=>!drawing&&!globalThis.document.querySelector('dialog[open]:not(#loupe-dialog)')&&imageInteraction(e)&&(!host.visible||host.visible()),onZoom:value=>{if(localMagnifier()){setLoupeEffectsContext(value.effects);value={...value,effects:loupeSettings.effects};}loupeSettings=value;host.onLoupeChange?.(value);draw();},effectsAllowed:()=>!comparingOriginal,keepVisibleAtMinimum:()=>localMagnifier(),onEffectsState:value=>{host.onLoupeEffectsState?.(value);if(value.error)status(autoText('Loupe : le traitement n’a pas abouti. ','Magnifier: processing failed. ')+value.error.message);},onSweepChange:value=>host.onLoupeSweepChange?.(value),onError:()=>status(autoText('La loupe nécessite WebGL dans ce navigateur.','The magnifier requires WebGL in this browser.'))});
function loupeEffectsContext(){
 if(individualUI?.active!=='inspection.magnifier')return null;
 const p=individualUI.params(),extras=individualUI.extras;
 extras.magnifierEffects??={adjust:{...loupeSettings.effects.adjust,enabled:false},sweep:{...loupeSettings.effects.sweep,enabled:false}};
 return validateLoupeEffects({...extras.magnifierEffects,enhance:{enabled:true,mode:p.mode,percent:p.percent,channel:p.channel}});
}
function setLoupeEffectsContext(value){
 const previous=loupeEffectsContext();if(!previous)return;const next=validateLoupeEffects(value),p=individualUI.params();
 individualUI.extras.magnifierEffects={adjust:next.adjust,sweep:next.sweep};
 if(['mode','percent','channel'].some(key=>next.enhance[key]!==p[key]))individualUI.updateParams({mode:next.enhance.mode,percent:next.enhance.percent,channel:next.enhance.channel});
 else if(JSON.stringify(previous)!==JSON.stringify(next)){persistSettings();queueAnalysis();host.onLoupeContextChange?.();}
}
function effectiveLoupe(){const effects=loupeEffectsContext();return effects?{...loupeSettings,effects}:loupeSettings;}
function refreshLocalMagnifier(){clearTimeout(autoRunTimer);autoRunTimer=null;pointerLoupe.set(effectiveLoupe());individualUI?.invalidateResult({preserve:true});individualUI?.setOriginal(true);resultMeta=null;$('export-report').disabled=true;$('provenance').textContent='';$('layer').value='source';$('export-png').disabled=!source;status(autoText('Loupe améliorée · effet local. L pour appliquer à toute l’image.','Enhanced magnifier · local effect. L to apply to the whole image.'));draw();}
function setLoupe(value){const next=validateLoupeSettings(value);if(JSON.stringify(next)===JSON.stringify(loupeSettings))return;const wasEnabled=loupeSettings.enabled;loupeSettings=next;pointerLoupe.set(effectiveLoupe());pointers.clear();gesture=null;if(loupeSettings.enabled)fit();else draw();if(activeAnalysis==='inspection.magnifier'&&fileInput){if(localMagnifier())refreshLocalMagnifier();else if(wasEnabled){$('layer').value=processedSurface()?'result':'source';if(busy)queueAnalysis();else void runIndividual();}}}

if(!host.managed)document.addEventListener('keydown',e=>{if(loupeKey(e)){e.preventDefault();setLoupe({...loupeSettings,enabled:!loupeSettings.enabled});}});
async function exportImage(settingsOverride){
 const target=host.sourceOnly||localMagnifier()||$('layer').value==='source'?source:result;if(!target||exportController)return;
 if(!host.sourceOnly&&target===source&&host.exportOriginalImage){const task=value=>host.exportOriginalImage(value);return settingsOverride?task(settingsOverride):host.requestExport(task);}
 const selectedRevision=revision;
 const execute=async settings=>{
  if(selectedRevision!==revision||exportController)return;const rev=revision,controller=new AbortController();exportController=controller;controls();$('export-png').disabled=true;
  const options=rasterOptions(settings.resize?{...settings,...linkedExportSize(settings,target)}:settings,source?.display?.chroma??engineCapabilities?.sourceChroma);let output;
  const progress=event=>{if(rev===revision){$('progress').value=event.fraction??0;status(t('exporting')+' · '+(event.phase??''));}};
  try{
   if(individualMode()&&target.display?.id&&!target.display.pixels&&!target.display.m2Result){output=await(await ensureIndividualClient()).export(options.format,target.display,options);}
   else if(!individualMode()&&!automaticMode()&&!compositeMode()){
    const sink=await createExportSink({memoryBudgetBytes:uiRGBBudget,signal:controller.signal,mime:'image/'+options.format});
    try{const answer=await request('export-raster',{display:target.display,options},chunk=>sink.write(chunk));output={...await sink.finish(),descriptor:answer.descriptor};}catch(error){await sink.abort();throw error;}
   }else{
    const owner=automaticMode()?automaticClient:individualMode()?await ensureIndividualClient():compositeClient;
    output=await exportPresentationRaster(target,options,{reserve:bytes=>owner.reserveExport(bytes,target.display),signal:controller.signal,onProgress:progress});
   }
   if(rev===revision&&!controller.signal.aborted){download(output.blob,'SHERLOQ-'+(host.sourceOnly?'original':activeAnalysis)+'.'+options.format);setTimeout(()=>output.cleanup?.(),60000);status(t('done'));}
   else await output?.cleanup?.();
  }catch(error){if(rev===revision){if(error.code!=='CANCELLED'){errorJournal.record(error,{operation:'export.image',format:options.format,width:target.width,height:target.height});translateTaskActions();}status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+errorText(error,lang));}}
  finally{if(exportController===controller){exportController=null;controls();$('export-png').disabled=!result;}}
 };
 return settingsOverride?execute(settingsOverride):host.requestExport?host.requestExport(execute):execute({...exportDefaults});
}
$('export-png').onclick=()=>exportImage();$('export-report').onclick=()=>{if(resultMeta)exportJSON({...resultMeta,...(errorJournal.length?{diagnosticHistory:errorJournal.snapshot()}:{})},automaticMode()?'SHERLOQ-automatic-report.json':compositeMode()?'SHERLOQ-composite-report.json':individualMode()?'SHERLOQ-'+activeAnalysis+'-report.json':'sherloq-ela-report.json');};$('save-session').onclick=()=>exportJSON(serialize(),'sherloq-session.json');$('load-session').onchange=e=>restore(e.target.files[0]);

function renderCapabilities(){const m=engineCapabilities?.memory?.budgetBytes;const workers=engineCapabilities?.resourceProfile?.maxWorkers;$('capabilities').textContent=t('memory')+': '+(m?Math.round(m/1024**2)+' MiB':'—')+' · '+t('workerBudget')+': '+(workers||browserCapabilities.cpuThreadsHint||'—')+' · '+t('displayMemory')+' '+Math.round(tileCache.limit/1024**2)+' MiB / RGB '+Math.round(uiRGBBudget/1024**2)+' MiB'+(storageEstimate?.quota?' · '+t('storageQuota')+' '+Math.round(storageEstimate.quota/1024**2)+' MiB':'')+' · WebGPU '+(browserCapabilities.webgpuAPI?'API ✓ / engine —':'API — / CPU ✓');}
$('compute-profile').onchange=()=>{stop();engineCapabilities=null;invalidate();renderCapabilities();status(t('computeChanged'));};
let theme=localGet('theme');
if(!['light','dark'].includes(theme)){try{theme=localStorage.getItem('gd-iso-studio-theme');}catch{} }
if(!['light','dark'].includes(theme))theme=matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';
function updateChrome(){document.documentElement.dataset.theme=theme;$('theme-label').textContent=t(theme==='light'?'darkTheme':'lightTheme');$('theme-toggle').setAttribute('aria-label',t(theme==='light'?'darkTheme':'lightTheme'));$('theme-toggle').setAttribute('aria-pressed',String(theme==='light'));$('locale-label').textContent=lang==='fr'?'EN':'FR';$('language-toggle').setAttribute('aria-label',lang==='fr'?'Display in English':'Afficher en français');$('home').title=t('home');$('home').setAttribute('aria-label',t('home'));$('fullscreen').title=t(document.fullscreenElement?'exitFullscreen':'fullscreen');$('fullscreen').setAttribute('aria-label',$('fullscreen').title);}
function chooseTool(id){if(busy&&id!=='original'&&id!==activeAnalysis)return;const previousAutomatic=automaticMode(),previousIndividual=individualMode(),original=id==='original';if(!original&&id!==activeAnalysis){if(previousIndividual&&toolCatalog[id]){individualUI.hideResult();invalidate({preserve:false});void individualClient?.release().catch(error=>{if(error.code!=='CANCELLED')console.warn('Tool result cleanup:',error);});}else{stop();invalidate({preserve:false});source?.close?.();source=null;}activeAnalysis=id;}syncAnalysisControls();const selectedComposite=compositeMode();$('tab-composite').setAttribute('aria-selected',String(!original&&selectedComposite));layouts?.focus(original?'original-window':'analysis-window');$('app').classList.toggle('original-mode',original);if(individualMode()){individualUI?.setOriginal(original);if(original&&result&&(result.width!==source?.width||result.height!==source?.height))fit();}$('tab-original').setAttribute('aria-selected',String(original));$('tab-ela').setAttribute('aria-selected',String(!original&&!selectedComposite&&!automaticMode()&&!individualMode()));$('layer').value=original?'source':(result?'result':'source');renderToolTree();draw();if(!original&&fileInput&&(previousAutomatic!==automaticMode()||previousIndividual!==individualMode())){void reloadToolSource();}else if(!original&&!result)queueAnalysis();else if(original){clearTimeout(autoRunTimer);autoRunTimer=null;}if(innerWidth<=760){$('app').classList.add('tools-hidden');$('toggle-tools').setAttribute('aria-pressed','false');}}
function renderToolTree(){if(host.managed)return;const tree=$('tool-tree');tree.replaceChildren();const original=$('app').classList.contains('original-mode');const groups=[...($('favorite').getAttribute('aria-pressed')==='true'?[{en:'Favorites',fr:'Favoris',items:[{en:'Error Level Analysis',fr:'ELA — Analyse du niveau d’erreur',id:'ela.classic'}]}]:[]),...toolGroups];for(const g of groups){const d=document.createElement('details');d.className='tool-group';d.open=['General','JPEG','Favorites'].includes(g.en)||g.items.some(item=>item.id===activeAnalysis);const summary=document.createElement('summary');summary.textContent='['+g[lang]+']';d.append(summary);for(const item of g.items){const b=document.createElement('button');b.dataset.toolId=item.id;b.textContent=item[lang];if(item.newFeature)b.dataset.newFeature=item.newFeature;b.disabled=busy&&item.id!=='original'&&item.id!==activeAnalysis;if(b.disabled)b.title=t('treeLimit');b.classList.toggle('active',item.id===(original?'original':activeAnalysis));b.onclick=()=>chooseTool(item.id);d.append(b);}tree.append(d);}}
function pickImage(){$('file').value='';$('file').click();}
$('open-file').onclick=$('empty-open').onclick=pickImage;
$('toggle-tools').onclick=()=>{const hide=$('app').classList.toggle('tools-hidden');$('toggle-tools').setAttribute('aria-pressed',String(!hide));};
if(innerWidth<=760){$('app').classList.add('tools-hidden');$('toggle-tools').setAttribute('aria-pressed','false');}
$('toggle-inspector').onclick=()=>{$('inspector').hidden=!$('inspector').hidden;$('toggle-inspector').setAttribute('aria-expanded',String(!$('inspector').hidden));};
$('language-toggle').onclick=()=>{lang=lang==='fr'?'en':'fr';translate();};
$('theme-toggle').onclick=()=>{theme=theme==='light'?'dark':'light';localSet('theme',theme);updateChrome();draw();};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{status(lang==='fr'?'Le navigateur ne permet pas le plein écran ici.':'Full screen is unavailable here.');}};
document.addEventListener('fullscreenchange',updateChrome);
$('tab-composite').onclick=()=>chooseTool('composite');
$('tab-original').onclick=()=>chooseTool('original');$('tab-ela').onclick=()=>chooseTool('ela.classic');
const homeParam=new URLSearchParams(location.hash.slice(1)).get('home');
try{const home=new URL(homeParam||'../../../../',location.href);if(home.origin===location.origin)$('home').href=home.href;}catch{}
// Capture file drops across both image panes and the welcome overlay. A new
// image explicitly replaces the current job; never let the browser navigate.
let fileDragDepth=0;
const isFileDrag=e=>Array.from(e.dataTransfer?.types||[]).includes('Files')||e.dataTransfer?.files?.length;
document.addEventListener('dragenter',e=>{if(!isFileDrag(e))return;e.preventDefault();fileDragDepth++;$('window-desk').classList.add('file-drag');});
document.addEventListener('dragover',e=>{if(!isFileDrag(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';});
document.addEventListener('dragleave',e=>{if(!isFileDrag(e))return;if(--fileDragDepth<=0){fileDragDepth=0;$('window-desk').classList.remove('file-drag');}});
document.addEventListener('drop',e=>{if(host.managed)return;if(!isFileDrag(e))return;e.preventDefault();fileDragDepth=0;$('window-desk').classList.remove('file-drag');const file=e.dataTransfer.files[0];if(file){chooseTool(activeAnalysis);openFile(file);}});
document.addEventListener('dragend',()=>{fileDragDepth=0;$('window-desk').classList.remove('file-drag');});
document.addEventListener('keydown',e=>{if(!host.managed&&(e.ctrlKey||e.metaKey)&&e.key==='o'){e.preventDefault();if(!busy)pickImage();}});


function compositeSettings(){return validCompositeSettings({quality:Number($('composite-quality').value),stage:$('composite-stage').value,view:$('composite-view').value});}
function settingsBundle(){return{individual:individualUI?.serialize(),automatic:automaticSettings(),composite:compositeSettings(),schema:'sherloq.settings/1',profiles:structuredClone(profiles),current:{...params},activeProfile:$('preset').value,...(energyUI?{energy:energyUI.bundle()}:{}),preferences:{highlightNewFeatures:$('highlight-new-features').checked,elaMode:energyMode?'energy':'classic',theme,language:lang,layout:layouts.mode,computeProfile:$('compute-profile').value,navigationMode:$('navigation-mode').value||'auto',regionMode:$('zone-mode').value,favorite:$('favorite').getAttribute('aria-pressed')==='true',showZones:$('show-zones').checked,toolsVisible:!$('app').classList.contains('tools-hidden'),inspectorVisible:!$('inspector').hidden}};}
function persistSettings(){if(destroyed)return true;if(!settingsReady)return true;return localSet('settings',settingsBundle());}
function applySettings(v){
 stop();invalidate();individualUI?.restore(v.individual);loadAutomaticSettings(v.automatic);const composite=v.composite||{quality:0,stage:'map',view:'map'};for(const key of ['quality','stage','view'])$('composite-'+key).value=composite[key];energyUI?.load(v.energy);profiles=v.profiles;params=v.current;const q=v.preferences;setEnergyMode(q.elaMode==='energy');$('highlight-new-features').checked=q.highlightNewFeatures===true;applyHighlights();theme=q.theme;lang=q.language;
 $('compute-profile').value=q.computeProfile;$('navigation-mode').value=q.navigationMode||'auto';$('zone-mode').value=q.regionMode;$('show-zones').checked=q.showZones;
 $('favorite').setAttribute('aria-pressed',String(q.favorite));$('app').classList.toggle('tools-hidden',!q.toolsVisible);$('toggle-tools').setAttribute('aria-pressed',String(q.toolsVisible));
 $('inspector').hidden=!q.inspectorVisible;$('toggle-inspector').setAttribute('aria-expanded',String(q.inspectorVisible));
 layouts.set(q.layout);renderProfiles();$('preset').value=v.activeProfile;syncParams();translate();queueAnalysis();
}
function applyHighlights(){$('app').classList.toggle('highlight-new-features',$('highlight-new-features').checked);}
$('highlight-new-features').onchange=()=>{applyHighlights();persistSettings();};
function downloadSettings(){exportJSON({...settingsBundle(),exportedAt:new Date().toISOString()},settingsFilename());}
layouts=createWindowLayout({document,getSource:()=>source,getNavigationMode:()=>$('navigation-mode').value,onResize:()=>{fit();draw();}});
for(const mode of ['tabs','tile','cascade'])$('layout-'+mode).onclick=()=>{layouts.set(mode);persistSettings();};
for(const b of document.querySelectorAll('[data-close-dialog]'))b.onclick=()=>$(b.dataset.closeDialog).close();
$('save-profile-form').onsubmit=e=>{
 e.preventDefault();const name=$('profile-name').value.trim();if(!name){$('profile-name').focus();return;}
 if(energyMode){try{energyUI.save(name);const saved=persistSettings();$('save-dialog').close();$('backup-status').textContent=t(saved?'profileSaved':'storageUnavailable');$('backup-dialog').showModal();}catch(e){status(e.message);}return;}
 const existing=profiles.find(p=>p.name===name);if(!existing&&profiles.length>=100){status(t('profileLimit'));return;}
 const profile={id:existing?.id||'profile-'+crypto.randomUUID(),name,operation:'ela.classic',params:{...params}};
 profiles=existing?profiles.map(p=>p.id===existing.id?profile:p):[...profiles,profile];renderProfiles();$('preset').value=profile.id;
 const saved=persistSettings();$('save-dialog').close();$('backup-status').textContent=t(saved?'profileSaved':'storageUnavailable');$('backup-dialog').showModal();
};
$('download-settings').onclick=()=>{downloadSettings();$('backup-dialog').close();};$('export-settings').onclick=downloadSettings;
$('recall-settings').onclick=()=>$('recall-dialog').showModal();
$('choose-settings').onclick=()=>{$('recall-dialog').close();$('settings-file').value='';$('settings-file').click();};
$('settings-file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{if(file.size>2*1024**2)throw new Error('JSON > 2 MiB');pendingSettings=validateSettings(JSON.parse(await file.text()));$('import-summary').textContent=t('profileCount')+' '+(pendingSettings.profiles.length+(pendingSettings.energy?.profiles.length||0));$('import-dialog').showModal();}
 catch(error){pendingSettings=null;status(t('error')+' · '+t('settingsRejected')+' '+error.message);}finally{$('settings-file').value='';}
};
$('confirm-import').onclick=()=>{if(!pendingSettings)return;applySettings(pendingSettings);pendingSettings=null;$('import-dialog').close();status(t(persistSettings()?'settingsRestored':'storageUnavailable'));};
$('close-all').onclick=()=>$('close-dialog').showModal();
$('confirm-close').onclick=()=>{
 const saved=persistSettings();stop();$('close-dialog').close();
 if(saved){location.reload();return;}
 // Keep settings in memory if the browser denies storage; reset image state safely.
 invalidate({preserve:false});source?.close?.();source=null;fileInput=null;hash='';expectedHash='';imageId='';regions=[];restoring=false;pointers.clear();gesture=null;draft=null;drawing=false;
 $('draw').setAttribute('aria-pressed','false');view.classList.remove('drawing');$('empty').hidden=false;$('file-info').textContent=t('noImage');$('file').value='';$('progress').value=0;renderRegions();draw();controls();status(t('storageUnavailable'));
};
energyUI=createEnergyUI({$,t,persist:persistSettings,changed:(calculate=true)=>{if(busy||energyViewBusy)stop();invalidate();status(t('changed'));if(calculate)queueAnalysis();},viewChanged:refreshEnergyView});
$('ela-mode').value='classic';
for(const mode of ['classic','energy']){const tab=$('ela-tab-'+mode);if(tab)tab.onclick=()=>{if(!tab.disabled&&energyMode!==(mode==='energy')){$('ela-mode').value=mode;$('ela-mode').onchange();}};}
function setEnergyMode(enabled){energyMode=enabled;for(const mode of ['classic','energy'])$('ela-tab-'+mode)?.setAttribute('aria-selected',String(mode===(enabled?'energy':'classic')));$('ela-mode').value=enabled?'energy':'classic';$('classic-controls').hidden=energyMode;$('energy-controls').hidden=!energyMode;$('energy-presentation').hidden=!energyMode||compositeMode();controls();}
$('ela-mode').onchange=()=>{const enabled=$('ela-mode').value==='energy';stop();invalidate();setEnergyMode(enabled);persistSettings();queueAnalysis();};
$('energy-run').onclick=run;$('energy-cancel').onclick=$('cancel').onclick;
$('energy-save').onclick=()=>{$('profile-name').value=energyUI.selectedName;$('save-dialog').showModal();$('profile-name').focus();};
async function refreshEnergyView(){
 if(!energyMode||!resultMeta||busy)return;energyViewQueued=true;energyViewRevision++;
 if(energyViewBusy)return;energyViewBusy=true;controls();const rev=revision;
 try{while(energyViewQueued&&rev===revision&&resultMeta){energyViewQueued=false;const viewRev=energyViewRevision,presentation=energyUI.presentation(),id=resultMeta.id;
 $('energy-npz').disabled=true;$('energy-json').disabled=true;$('export-png').disabled=true;
 const answer=await request('view-energy',{resultId:id,presentation});if(rev!==revision)return;if(viewRev!==energyViewRevision)continue;
 retireResult();result=remoteSurface(answer.display);resultMeta.ui.presentation=presentation;draw();
 }}catch(e){if(rev===revision)status(t('error')+' · '+e.message);}finally{if(rev===revision){energyViewBusy=false;controls();$('energy-npz').disabled=!resultMeta;$('energy-json').disabled=!resultMeta;$('export-png').disabled=!result;}}
}
async function exportEnergy(format){
 if(!energyMode||!resultMeta||busy||energyViewBusy)return;
 const rev=revision,id=resultMeta.id,controller=new AbortController();let sink;
 exportController=controller;busy=true;controls();status(t('energyExporting'));
 try{
  sink=await createExportSink({memoryBudgetBytes:uiRGBBudget,signal:controller.signal,mime:format==='npz'?'application/zip':'application/json'});
  await request('export-energy',{resultId:id,format},bytes=>sink.write(bytes));
  if(rev!==revision||controller.signal.aborted){await sink.abort();return;}
  const artifact=await sink.finish();download(artifact.blob,'SHERLOQ-energie.'+format);status(t('energyExported'));
 }catch(error){await sink?.abort();if(rev===revision)status(t('error')+' · '+(error.code||'')+' '+error.message);}
 finally{if(exportController===controller)exportController=null;if(rev===revision){busy=false;controls();}}
}
$('energy-npz').onclick=()=>exportEnergy('npz');$('energy-json').onclick=()=>exportEnergy('json');
function syncAnalysisControls(){
 individualUI?.select(individualMode()?activeAnalysis:null);

 $('automatic-controls').hidden=!automaticMode();$('tab-automatic').setAttribute('aria-selected',String(automaticMode()&&!$('app').classList.contains('original-mode')));
 const composite=compositeMode();$('analysis-controls').hidden=composite||automaticMode()||individualMode();$('composite-controls').hidden=!composite;$('energy-presentation').hidden=composite||automaticMode()||individualMode()||!energyMode;$('analysis-title').textContent=individualMode()?toolTitle(activeAnalysis,lang):automaticMode()?autoText('Analyse automatique','Automatic analysis'):composite?t('compositeTitle'):'ELA';const option=[...$('layer').options].find(o=>o.value==='result');if(option)option.textContent=individualMode()?toolTitle(activeAnalysis,lang):automaticMode()?autoText('Analyse automatique','Automatic analysis'):composite?t('compositeTitle'):t('result');
}
for(let quality=51;quality<=101;quality++)$('composite-quality').append(new Option(quality===101?'101 · No JPEG':String(quality),String(quality)));
$('composite-quality').value='0';$('composite-stage').value='map';$('composite-view').value='map';
for(const key of ['quality','stage'])$('composite-'+key).onchange=()=>{invalidate();persistSettings();queueAnalysis();};
$('composite-run').onclick=run;$('composite-cancel').onclick=$('cancel').onclick;
function showComposite(){
 if(!compositeResult||!compositeClient)return;let selected=$('composite-view').value;
 if(selected==='map'&&!compositeResult.fields.map_rgb){selected='noise';$('composite-view').value=selected;}
 result?.close?.();result=compositeClient.surface(compositeResult,selected,tileCache,scheduleDraw,error=>{if(error.code!=='CANCELLED')status(t('error')+' · '+error.message);});
 $('layer').value=$('app').classList.contains('original-mode')?'source':'result';$('export-png').disabled=false;draw();
}
$('composite-view').onchange=()=>{showComposite();persistSettings();};
async function runComposite(){
 clearTimeout(autoRunTimer);autoRunTimer=null;if(busy||energyViewBusy||!fileInput)return;
 busy=true;controls();invalidate();const rev=revision,abort=new AbortController();compositeAbort=abort;status(t('compositeLoading'));$('progress').value=0;draw();
 try{
  await compositeCleanup;if(rev!==revision)return;
  if(!loaded){engineCapabilities=await request('capabilities');if(rev!==revision)return;const descriptor=await request('load',{id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});draw();}
  // Source display remains in its own engine. Reserve all memory it accounts
  // before admitting M2; no ELA computation runs concurrently with Composite.
  engineCapabilities=await request('capabilities');if(rev!==revision)return;
  if(!compositeClient){
   const memory=engineCapabilities.memory||{},profile=resolveComputeProfile($('compute-profile').value),sourceBytes=(memory.retainedBytes||0)+(memory.cacheBytes||0)+(memory.activeReservationBytes||0)+(memory.knownHeapCapacityBytes||0);
   const reserve=sourceBytes+tileCache.limit+32*1024**2+Math.ceil(view.clientWidth*view.clientHeight*Math.min(devicePixelRatio||1,2)**2*8);
   const client=await createCompositeClient({memoryBudgetBytes:Math.floor(profile.memoryBudgetBytes-reserve),computeProfile:$('compute-profile').value,resourceHints:profile.hints});
   if(rev!==revision){await client.dispose();return;}compositeClient=client;
  }
  const {quality,stage}=compositeSettings(),parameters={quality,stage};
  const output=await compositeClient.analyze(fileInput,parameters,{signal:abort.signal,backend:'auto',onProgress:event=>{if(rev!==revision)return;$('progress').value=Math.max(0,Math.min(1,event.fraction||0));status(t('running')+' '+event.phase);}});
  if(rev!==revision)return;
  compositeResult=output.result;resultMeta={...output.metadata,parameters,fields:output.result.fields,ui:{version:'0.13.2',operation:'composite',engineCommit:compositeClient.deployment.engineCommit,sourceSha256:hash}};
  $('provenance').textContent=JSON.stringify(resultMeta,null,2);
  $('composite-detail').textContent=t('compositeReady')+' '+output.metadata.model+' · '+(output.metadata.provenance?.statisticsPolicy||'Noiseprint')+(output.metadata.mapError?' · '+t('compositePartial')+' : '+(output.metadata.mapError.message||JSON.stringify(output.metadata.mapError)):'');
  $('composite-view').value=parameters.stage==='noise'||output.metadata.mapError?'noise':'map';showComposite();$('export-report').disabled=false;$('progress').value=1;status(t('done'));
 }catch(error){if(rev===revision)status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+(error.code||'')+' '+error.message);}
 finally{if(rev===revision){compositeAbort=null;busy=false;controls();draw();}}
}
$('composite-npz').onclick=async()=>{
 if(!compositeResult||busy)return;const client=compositeClient,id=compositeResult.id,rev=revision,abort=new AbortController();let sink,output;
 compositeAbort=abort;exportController=abort;busy=true;controls();status(t('energyExporting'));
 try{
  const memory=await client.memory(),headroom=Math.max(0,memory.budgetBytes-memory.retainedBytes-memory.cacheBytes-memory.activeReservationBytes-4*client.ready.windowBytes);
  sink=await createExportSink({memoryBudgetBytes:Math.min(uiRGBBudget,headroom),signal:abort.signal,mime:'application/zip'});
  output=await client.beginExport(id,{signal:abort.signal,onProgress:event=>{if(rev===revision){$('progress').value=event.fraction||0;status(t('energyExporting')+' '+event.phase);}}});
  for(let at=0;at<output.bytes;at+=client.ready.windowBytes){if(abort.signal.aborted)throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});await sink.write(await client.readExport(output.id,at,Math.min(client.ready.windowBytes,output.bytes-at)));if(rev===revision)$('progress').value=Math.min(1,(at+client.ready.windowBytes)/output.bytes);}
  if(rev!==revision||abort.signal.aborted){await sink.abort();return;}
  const artifact=await sink.finish();download(artifact.blob,'SHERLOQ-composite-covariance-floor-v1.npz');status(t('energyExported'));
 }catch(error){await sink?.abort();if(rev===revision)status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+error.message);}
 finally{if(output)await client.releaseExport(output.id).catch(()=>{});if(rev===revision){exportController=null;compositeAbort=null;busy=false;controls();}}
};
initAutomaticControls();
individualUI=createToolWorkspace({document,language:()=>lang,getClient:ensureIndividualClient,run,cancel:()=>{individualCancelled=true;pointerLoupe?.cancelImage();individualClient?.cancel();individualUI?.hideResult();},activity:individualActivity,showSurface:showIndividualSurface,onLoupe:()=>host.openLoupeSettings?.(),download,notify:status,onSettings:({presentationOnly=false}={})=>{persistSettings();controls();if(!presentationOnly)queueAnalysis();if(activeAnalysis==='inspection.magnifier')host.onLoupeContextChange?.();}});
try{const stored=localGet('settings');if(stored)applySettings(validateSettings(stored));else{const old=localGet('classicPreset');if(old){profiles=[{id:'profile-legacy',name:t('savedProfile'),operation:'ela.classic',params:validParams(old)}];renderProfiles();}}}catch(error){console.warn('SHERLOQ settings ignored:',error.message);}
settingsReady=true;
// Changes stay in browser storage; explicit exports always include every profile.
document.addEventListener('change',()=>{if(!persistSettings())status(t('storageUnavailable'));});
document.addEventListener('click',()=>queueMicrotask(()=>{if(!persistSettings())status(t('storageUnavailable'));}));

navigator.storage?.estimate?.().then(value=>{storageEstimate={usage:value.usage??null,quota:value.quota??null};renderCapabilities();}).catch(()=>{});
const panelResize=new ResizeObserver(()=>{draw();individualUI?.redraw?.();});panelResize.observe(view);const onPageHide=()=>{stop();source?.close?.();};window.addEventListener('pagehide',onPageHide);translate();controls();status(t('ready'));

const onFonts=()=>draw();document.fonts?.addEventListener('loadingdone',onFonts);

function autoText(fr,en){return lang==='fr'?fr:en;}
async function ensureAutomaticClient(){
 if(automaticClient)return automaticClient;
 if(!automaticOpening){const epoch=automaticEpoch;automaticOpening=(async()=>{await automaticCleanup;const client=await createAutomaticClient({computeProfile:$('compute-profile').value,onProgress:automaticEvent});if(epoch!==automaticEpoch){await client.dispose();throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});}return automaticClient=client;})().finally(()=>{automaticOpening=null;});}
 return automaticOpening;
}
async function automaticRequest(action,payload){
 const client=await ensureAutomaticClient();
 if(action==='capabilities')return client.capabilities();
 if(action==='load')return client.load(payload);
 if(action==='read-display')return {pixels:await client.readTile(payload.display,payload.tile)};
 if(action==='read-window')return {pixels:await client.readWindow(payload.display,payload.rect)};
 throw Error('Unsupported automatic UI action: '+action);
}
function automaticControls(){
 const locked=busy||energyViewBusy||!!exportController;
 $('automatic-run').disabled=!fileInput||locked;$('automatic-pause').disabled=!busy;
 $('automatic-resume').disabled=!automaticClient?.checkpoint||locked;
 $('automatic-export').disabled=!(automaticClient?.result||automaticClient?.checkpoint)||locked;
 $('automatic-progress-export').disabled=!automaticProgress;
 for(const id of ['automatic-scope','automatic-source','automatic-view','automatic-relation','automatic-branch','automatic-d2-minimum','automatic-opacity'])$(id).disabled=locked;
}
function automaticEvent(event){
 if(!automaticMode())return;
 if(automaticProgress)automaticSnapshot=automaticProgress.accept(event);
 if(event.phase==='automatic-state')renderAutomaticProgress();
 else if(!event.phase?.startsWith('diagnostic-')){
  status(autoText('Analyse automatique','Automatic analysis')+' · '+event.phase+(event.stage?' · '+event.stage:''));
  // The progress bar remains indeterminate: a field's fraction is not total progress.
  $('progress').removeAttribute('value');renderAutomaticProgress();
 }
}
function renderAutomaticProgress(){
 if(!automaticProgress)return;
 const value=automaticProgress.snapshot();automaticSnapshot=value;
 const hours=Math.floor(value.elapsedMs/3600000),minutes=Math.floor(value.elapsedMs/60000)%60,seconds=Math.floor(value.elapsedMs/1000)%60;
 $('automatic-time').textContent=`${hours} h ${String(minutes).padStart(2,'0')} min ${String(seconds).padStart(2,'0')} s · ${value.recoveries} `+autoText('reprises mémoire','memory recoveries');
 const names={patchmatch:'PatchMatch',sift:'SIFT',forgeryscope:'Forgeryscope',d2prl:'D2PRL',ela:'ELA'};
 const states={pending:autoText('En attente','Pending'),running:autoText('En cours','Running'),done:autoText('Terminé','Done'),failed:autoText('Échec','Failed'),cancelled:autoText('Suspendu','Paused'),'waiting-memory':autoText('Attend de la mémoire','Waiting for memory')};
 $('automatic-groups').replaceChildren();
 for(const [id,group]of Object.entries(value.groups)){
  const row=document.createElement('li');row.textContent=names[id]+' — '+(states[group.state]||group.state)+(group.stage?' · '+group.stage:'')+(group.iteration!==undefined?' · '+autoText('itération ','iteration ')+group.iteration:'')+(group.total?' · '+Math.round(100*group.completed/group.total)+'% '+autoText('de cette sous-étape','of this sub-step'):'')+(group.error?' · '+group.error.code+' : '+group.error.message:'');$('automatic-groups').append(row);
 }
}
async function runAutomatic(resume=false){
 if(busy||!fileInput)return;clearTimeout(autoRunTimer);autoRunTimer=null;
 busy=true;controls();const rev=revision;status(autoText('Préparation de l’analyse automatique…','Preparing automatic analysis…'));$('progress').removeAttribute('value');
 try{
  await automaticCleanup;await compositeCleanup;if(rev!==revision)return;
  const client=await ensureAutomaticClient();if(rev!==revision)return;
  if(!loaded||!client.source){const descriptor=await client.load({id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});if(!zoom)fit();draw();}
  if(!resume){retireResult();resultMeta=null;$('provenance').textContent='';$('export-png').disabled=true;$('export-report').disabled=true;automaticProgress=createAutomaticProgress(activeAnalysis==='analysis.complete');automaticStarted=Date.now();automaticSnapshot=automaticProgress.snapshot();}
  clearInterval(automaticClock);automaticClock=setInterval(renderAutomaticProgress,1000);renderAutomaticProgress();
  let output;
  if(resume)output=await client.resume();
  else{const selection=automaticSelection(source.width,source.height,regions,$('automatic-scope').value);output=await client.run({id:'automatic-'+crypto.randomUUID(),imageId,operation:activeAnalysis,backend:'auto',params:{...(selection?{selection}:{}),maxConcurrent:5,d2Minimum:Number($('automatic-d2-minimum').value)}});}
  if(rev!==revision)return;
  output=await client.update(automaticViewActions());if(rev!==revision)return;
  automaticEvent({phase:'automatic-state',state:output.data.state});
  resultMeta=automaticReport(output,automaticProgress.snapshot(),client.deployment);$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;
  await showAutomatic();if(rev!==revision)return;
  const failed=output.status!=='ok'||Object.values(output.data.state.states).some(x=>!['done','skipped'].includes(x));
  status(failed?autoText('Analyse partielle : tous les groupes n’ont pas abouti. Les résultats acquis restent exportables.','Partial analysis: some groups did not complete. Completed results remain exportable.'):autoText('Analyse automatique terminée.','Automatic analysis complete.'));
  $('progress').value=1;
 }catch(error){if(rev===revision){
  if(automaticClient?.checkpoint){const state=automaticClient.checkpoint.state;automaticEvent({phase:'automatic-state',state});}
  if(error.imagesCleared){loaded=false;source?.close?.();source=null;}
  status(error.code==='CANCELLED'?(automaticClient?.checkpoint?autoText('Analyse suspendue. Reprendre conserve le travail acquis.','Analysis paused. Resume preserves completed work.'):autoText('Arrêt avant la création d’un point de reprise. Relancer pour commencer.','Stopped before a resume point was created. Run to start again.')):t('error')+' · '+(error.code||'')+' '+error.message);
 }}finally{clearInterval(automaticClock);automaticClock=null;if(rev===revision){busy=false;controls();draw();}}
}
async function pauseAutomatic(){if(!automaticClient)return;status(autoText('Suspension en cours : conservation des étapes acquises…','Pausing: preserving committed work…'));$('automatic-pause').disabled=true;await automaticClient.pause();controls();}
async function showAutomatic(){
 const client=automaticClient;if(!client?.result)return;
 const token=++automaticDisplayRevision,rev=revision,layer=$('automatic-view').value;
 const display=await client.display(layer,{overlay:layer==='corroboration',opacity:Number($('automatic-opacity').value)/100});
 if(token!==automaticDisplayRevision||rev!==revision)return;
 retireResult();result=remoteSurface(display);$('layer').value='result';$('export-png').disabled=false;draw();

}
async function updateAutomaticView(){
 if(!automaticClient?.result||busy||energyViewBusy)return;energyViewBusy=true;controls();const rev=revision;
 try{
  const output=await automaticClient.update(automaticViewActions());
  if(rev!==revision)return;resultMeta=automaticReport(output,automaticProgress?.snapshot(),automaticClient.deployment);$('provenance').textContent=JSON.stringify(resultMeta,null,2);await showAutomatic();
 }catch(error){if(rev===revision)status(t('error')+' · '+error.message);}finally{if(rev===revision){energyViewBusy=false;controls();}}
}
async function exportAutomatic(){
 const client=automaticClient;if(!client||busy)return;busy=true;controls();let sink;const rev=revision;
 try{
  const {memory}=await client.capabilities();sink=await createExportSink({memoryBudgetBytes:Math.max(0,Math.min(64*1024**2,memory.budgetBytes-memory.retainedBytes-memory.cacheBytes-memory.activeReservationBytes)),mime:'application/zip'});
  await client.exportTo(sink);if(rev!==revision){await sink.abort();return;}
  const artifact=await sink.finish();download(artifact.blob,client.result?.status==='ok'?'SHERLOQ-automatic.npz':'SHERLOQ-automatic-partial.npz');status(t('done'));
 }catch(error){await sink?.abort();if(rev===revision)status(t('error')+' · '+error.message);}finally{if(rev===revision){busy=false;controls();}}
}
function initAutomaticControls(){
 $('automatic-scope').value='detected';$('automatic-source').value='overlay';$('automatic-view').value='corroboration';$('automatic-relation').value='within';$('automatic-branch').value='';$('automatic-d2-minimum').value=500;$('automatic-opacity').value=70;
 $('tab-automatic').onclick=()=>chooseTool('analysis.complete');$('automatic-run').onclick=()=>runAutomatic(false);$('automatic-resume').onclick=()=>runAutomatic(true);$('automatic-pause').onclick=pauseAutomatic;$('automatic-export').onclick=exportAutomatic;
 $('automatic-scope').onchange=queueAnalysis;
 $('automatic-progress-export').onclick=()=>exportJSON(automaticReport(automaticClient?.result,automaticProgress?.snapshot(),automaticClient?.deployment||{}),'SHERLOQ-avancement.json');
 for(const id of ['automatic-source','automatic-relation','automatic-branch','automatic-d2-minimum'])$(id).onchange=updateAutomaticView;
 for(const id of ['automatic-view','automatic-opacity'])$(id).onchange=()=>showAutomatic().catch(error=>status(t('error')+' · '+error.message));
 bindSliderReset($('automatic-opacity'),validAutomaticSettings().opacity,()=>$('automatic-opacity').onchange());
}

async function reloadToolSource(){
 const rev=revision;busy=true;controls();
 try{await individualCleanup;await automaticCleanup;await compositeCleanup;if(rev!==revision)return;const caps=await request('capabilities');if(rev!==revision)return;engineCapabilities=caps;const descriptor=await request('load',{id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});renderCapabilities();draw();}
 catch(error){if(rev===revision)status(t('error')+' · '+error.message);}
 finally{if(rev===revision){busy=false;controls();queueAnalysis();}}
}

function automaticLegend(){const layer=$('automatic-view').value;return layer==='corroboration'?autoText('Corroboration : nombre de détecteurs × contextes de recherche. L’ELA ne compte pas comme un vote.','Corroboration: detector × search-context count. ELA is not a vote.'):layer==='ela-preview'?autoText('Aperçu ELA calculé sur l’image originale.','ELA preview calculated from the original image.'):autoText('Énergie JPEG relative, affichée de 0 à 1. Ce n’est pas une probabilité.','Relative JPEG energy, displayed from 0 to 1. This is not a probability.');}
function automaticSettings(){return validAutomaticSettings(Object.fromEntries(['scope','source','view','relation','branch','d2-minimum','opacity'].map(key=>[key,['d2-minimum','opacity'].includes(key)?Number($('automatic-'+key).value):$('automatic-'+key).value])));}
function loadAutomaticSettings(value){for(const [key,item]of Object.entries(validAutomaticSettings(value)))$('automatic-'+key).value=item;}

function automaticViewActions(){return [{method:'selectTab',value:$('automatic-source').value},{method:'setRelation',value:$('automatic-relation').value},{method:'setForgeryscopeBranch',value:$('automatic-branch').value},{method:'setD2prlMinimum',value:Number($('automatic-d2-minimum').value)}];}

async function individualActivity(fn){if(busy)return;busy=true;controls();try{return await fn();}finally{busy=false;controls();}}
async function ensureIndividualClient(){
 if(individualClient)return individualClient;
 if(!individualOpening){const epoch=individualEpoch;individualOpening=(async()=>{await individualCleanup;const client=await createToolClient({computeProfile:$('compute-profile').value,...(host.engineFactory?{engineFactory:host.engineFactory}:{}),onInvalidated:({resultLost})=>{if(epoch!==individualEpoch||!resultLost)return;result?.close?.();result=null;individualUI?.invalidateResult();resultMeta={...resultMeta,status:'unavailable',error:{code:'WORKER_RECREATED',message:autoText('Le moteur a été recréé. L’image originale est conservée ; ce résultat doit être recalculé.','The engine was recreated. The original is retained; this result must be recalculated.')}};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-png').disabled=true;status(resultMeta.error.message);controls();draw();},onProgress:event=>{if(epoch!==individualEpoch)return;lastIndividualProgress={phase:event.phase,completed:event.completed,total:event.total};const f=event.fraction??(event.total?event.completed/event.total:0);$('progress').value=Math.max(0,Math.min(1,f||0));status(t('running')+' · '+event.phase+(event.total?' · '+event.completed+'/'+event.total:''));}});if(epoch!==individualEpoch){await client.dispose();throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});}return individualClient=client;})().finally(()=>individualOpening=null);}
 return individualOpening;
}
async function individualRequest(action,payload){const client=await ensureIndividualClient();if(action==='capabilities')return client.capabilities();if(action==='load')return client.load(payload);if(action==='read-display')return {pixels:await client.readTile(payload.display,payload.tile)};if(action==='read-window')return {pixels:await client.readWindow(payload.display,payload.rect)};throw Error('Unsupported tool action: '+action);}
function showIndividualSurface(display){retireResult();result=remoteSurface(display);$('layer').value=$('app').classList.contains('original-mode')?'source':'result';$('export-png').disabled=false;if(source&&(display.width!==source.width||display.height!==source.height))fit();else draw();}
async function runIndividual(){
 clearTimeout(autoRunTimer);autoRunTimer=null;if(busy||!fileInput||activeAnalysis==='file.similarity')return;if(localMagnifier()){refreshLocalMagnifier();return;}
 const form=$('tool-form');if(!form.reportValidity())return;
 individualCancelled=false;lastIndividualProgress=null;busy=true;controls();const rev=revision;let submitted;status(t('running'));$('progress').value=0;individualUI.invalidateResult({preserve:true});retireResult();resultMeta=null;$('provenance').textContent='';$('export-png').disabled=true;$('export-report').disabled=true;
 try{await individualCleanup;await automaticCleanup;await compositeCleanup;if(rev!==revision)return;
 let output;
 if(activeAnalysis==='inspection.magnifier'&&!individualUI.params(regions).bounds){
  const effects=loupeEffectsContext(),parameters=individualUI.params(),prepared=await pointerLoupe.prepareImage(comparisonSurface(),effects,scheduleDraw);
  if(rev!==revision||individualCancelled){prepared.close();throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});}
  result=prepared;output={operation:activeAnalysis,status:'ok',provenance:{params:parameters,effects,sourceSha256:hash},metrics:prepared.metrics};
  resultMeta={...output,ui:{presentation:'shared prepared loupe image'}};individualUI.renderPrepared(output);$('layer').value='result';$('export-png').disabled=false;
 }else{
 const client=await ensureIndividualClient();if(!client.source){const descriptor=await client.load({id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});}
 individualUI.setFile(fileInput);
 submitted={id:'tool-'+crypto.randomUUID(),imageId,operation:individualUI.operation(),params:individualUI.params(regions),backend:individualUI.backend(),view:individualUI.view(),regions:individualUI.taskRegions(regions)};output=await client.run(submitted,individualUI.extras);if(rev!==revision)return;
 resultMeta={id:output.id,operation:output.operation,status:output.status,provenance:output.provenance,metrics:output.metrics};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;
 await individualUI.render(output);
 }
 $('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;
 if(rev!==revision)return;if(individualCancelled)throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});individualUI.setOriginal(localMagnifier()||$('app').classList.contains('original-mode'));$('progress').value=1;if(localMagnifier())refreshLocalMagnifier();else status(output.status==='no-regions'?autoText('Aucune région correspondante.','No matching regions.'):t('done'));
 }catch(error){if(rev===revision){let diagnostic;if(error.code!=='CANCELLED'){const parameters=submitted?.params??individualUI.serialize()[activeAnalysis];diagnostic=errorJournal.record(error,{operation:submitted?.operation??individualUI.operation(),algorithm:parameters?.algorithm??parameters?.profile,parameters,view:individualUI.view(),backend:individualUI.backend(),width:source?.width,height:source?.height,progress:lastIndividualProgress});translateTaskActions();}resultMeta={operation:individualUI.operation(),status:error.code==='CANCELLED'?'cancelled':'error',originalSha256:hash,error:diagnostic?.error??errorEvidence(error),...(diagnostic?{context:diagnostic.context}:{})};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+(error.code||'')+' '+error.message);}}
 finally{if(rev===revision){busy=false;controls();draw();if(pendingMagnifier)queueAnalysis();}}
}

 function translateTaskActions(){
  const calculate=$('task-run'),zones=$('task-zones'),detect=$('task-auto-zones'),errors=$('task-errors');
  if(errors){errors.hidden=!errorJournal.length;errors.textContent=autoText('Diagnostic','Diagnostics')+' ('+errorJournal.length+')';errors.title=autoText('Lire ou exporter les dernières erreurs de cet outil.','Read or export recent errors from this tool.');}
  if(calculate){calculate.textContent=individualMode()?autoText('Calculer','Calculate'):t('run');calculate.title=autoText('Lancer ou recalculer avec les réglages et les zones actuels.','Run or recalculate with the current settings and regions.');}
  if(zones){zones.textContent=drawing?autoText('Terminer le tracé','Finish drawing'):t('draw');zones.title=autoText('Cliquez puis glissez sur l’image pour ajouter une zone. Échap termine le tracé ; Calculer lance ensuite l’analyse.','Click and drag on the image to add a region. Escape ends drawing; Calculate then starts analysis.');}
  if(detect){detect.textContent=autoText('Détecter les sous-images','Detect subimages');detect.title=autoText('Repère les panneaux séparés par un fond uniforme et ajoute leur enveloppe commune. Remplace les zones si des sous-images sont trouvées ; lancez ensuite Calculer.','Detects panels separated by a flat background and adds their shared envelope. Replaces regions when subimages are found; then choose Calculate.');}
 }
 async function detectRegions(){
  if(busy||!fileInput)return;clearTimeout(autoRunTimer);autoRunTimer=null;setDrawing(false);
  const rev=revision;busy=true;controls();status(autoText('Détection des sous-images…','Detecting subimages…'));
  try{
   const client=await ensureIndividualClient();if(!client.source){const descriptor=await client.load({id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});}
   const data=await client.detectSubimages();if(rev!==revision||destroyed)return;
   const found=detectedRectangles(data);
   if(found.length){regions=found;renderRegions();setDrawing(true);status(autoText('Sous-images détectées. Ajustez les zones si nécessaire, puis cliquez sur Calculer.','Subimages detected. Adjust the regions if needed, then click Calculate.'));}
   else status(autoText('Aucune sous-image détectée ; vos zones précédentes sont conservées.','No subimages detected; your previous regions are preserved.'));
  }catch(error){if(rev===revision&&!destroyed){resultMeta={...resultMeta,regionDetectionError:errorEvidence(error)};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;status(t('error')+' · '+errorText(error,lang));}}
  finally{if(rev===revision&&!destroyed){busy=false;controls();draw();}}
 }

 if(host.managed){
  activeAnalysis=host.sourceOnly?'file.digest':host.toolId;
  $('app').classList.add('embedded-panel');
  $('app').classList.toggle('original-mode',!!host.sourceOnly);
  $('compute-profile').value=host.computeProfile||'maximum';
  lang=host.language||'fr';theme=host.theme||theme;
  document.querySelectorAll('details').forEach(e=>e.open=false);
  syncAnalysisControls();translate();controls();
  const place=document.createElement('div');place.className='panel-actions';
  const calculate=document.createElement('button');calculate.id='task-run';calculate.className='primary';calculate.onclick=run;place.append(calculate);
  const errors=document.createElement('button');errors.id='task-errors';errors.hidden=true;errors.onclick=()=>showErrorJournal(document,errorJournal,{language:lang,download});place.append(errors);
  const zones=document.createElement('button');zones.id='task-zones';zones.setAttribute('aria-pressed','false');zones.onclick=()=>{$('draw').onclick();if(drawing&&automaticMode())$('automatic-scope').value='selected';if(drawing&&activeAnalysis==='ai.clones.d2prl'){const scope=$('tool-neural-scope');scope.value='regions';scope.onchange();}};
  if(automaticMode()||['inspection.magnifier','tampering.resampling','tampering.copyMove.sparse','ai.clones.d2prl'].includes(activeAnalysis))place.append(zones);
  if(activeAnalysis==='tampering.copyMove.sparse'){const detect=document.createElement('button');detect.id='task-auto-zones';detect.onclick=detectRegions;place.append(detect);}
  $('zone-mode').closest('label').hidden=true;document.querySelectorAll('[data-i18n=zoneLimit]').forEach(e=>e.hidden=true);
  const target=automaticMode()?$('automatic-controls'):individualMode()?$('tool-controls'):compositeMode()?$('composite-controls').querySelector('.parameter-bar'):$('analysis-controls');
  if(!host.sourceOnly)target.prepend(place);
  // These are presentation controls of the current task, not a footer toolbar.
  if(!host.sourceOnly)$('energy-controls').append($('energy-presentation'));
  if(host.sourceOnly)$('tool-controls').hidden=true;
  translate();controls();
 }
 function adoptInput(input){if(!input)return;source?.close?.();fileInput=input.file;imageId=input.imageId;hash=input.hash;source=input.source.fork?.(scheduleDraw)??{...input.source,close(){}};loaded=false;individualUI.setFile(fileInput);$('empty').hidden=true;$('file-info').textContent=input.description;fit();controls();queueAnalysis();}
 return {
  async load(file){await openFile(file);if(!fileInput)throw new Error($('status').textContent);},
  adopt:adoptInput,
  input(){return {file:fileInput,imageId,hash,source,description:$('file-info').textContent};},
  get busy(){return busy||energyViewBusy||!!exportController;},
  snapshot(){return {busy:busy||energyViewBusy||!!exportController,status:$('status').textContent,progress:$('progress').hasAttribute('value')?Number($('progress').value):null,hasResult:!!result||localMagnifier()&&!!source,hasReport:!!resultMeta,zoom:displayedZoom(),loupe:pointerLoupe?.enabled,previewPending:!!previousPresentation&&!result,fileInfo:$('file-info').textContent};},
  setHighlight(value){$('highlight-new-features').checked=!!value;applyHighlights();},setLanguage(value){lang=value;translate();individualUI?.redraw?.();},setTheme(value){theme=value;updateChrome();individualUI?.redraw?.();},
  toggleLoupeSweep:group=>pointerLoupe?.toggleSweep(group),stopLoupeSweep:()=>pointerLoupe?.stopSweep(),loupeSweepState:()=>pointerLoupe?.sweeping,loupeEffectsContext,setLoupeEffectsContext,loupeEnhancement(){if(activeAnalysis!=='inspection.magnifier')return null;const p=individualUI.params();return{enabled:true,mode:p.mode,percent:p.percent,channel:p.channel};},setLoupeEnhancement(value){if(activeAnalysis==='inspection.magnifier')individualUI.updateParams({mode:value.mode,percent:value.percent,channel:value.channel});},setCompareOriginal,pinLoupe:value=>pointerLoupe?.pin(value),loupeAnchor:()=>pointerLoupe?.anchor(),loupeDiagnostics:()=>pointerLoupe?.diagnostics(),loupeKeydown:e=>pointerLoupe?.keydown(e),exportSize(){const s=host.sourceOnly?source:selectedSurface();return s?{width:s.width,height:s.height}:null;},setLoupe,loupeMinimum(){const frame=$('layer').value==='result'&&result?result:source;return frame&&view.clientWidth&&view.clientHeight?loupeMinimumZoom(loupeSettings,Math.min(view.clientWidth/frame.width,view.clientHeight/frame.height)*.95,activeAnalysis==='inspection.magnifier'):2;},activate(){if(host.managed&&!drawing)$('layer').value=host.sourceOnly||localMagnifier()?'source':processedSurface()?'result':'source';draw();individualUI?.redraw?.();},setNavigation(value){$('navigation-mode').value=value;},setComputeProfile(value){if(!individualClient&&!automaticClient&&!compositeClient&&!worker&&!busy)$('compute-profile').value=value;},restoreSession:restore,fit,zoomBy(factor){zoomAt({x:view.clientWidth/2,y:view.clientHeight/2},factor);},
  exportImage,
  exportReport(){return $('export-report').onclick();},saveSession(){return $('save-session').onclick();},
  settings:settingsBundle,
  applySettings(value){if(busy)throw new Error(t('running'));const validated=validateSettings(value);if(host.sourceOnly)return;applySettings(validated);if(host.managed){$('app').classList.remove('original-mode');syncAnalysisControls();adoptInput(host.sourceInput?.());}},
  async dispose(){if(destroyed)return;destroyed=true;pointerLoupe?.dispose();comparisonSource?.close?.();comparisonSource=comparisonBase=null;stop();retireResult(false);source?.close?.();source=result=fileInput=null;tileCache.release('');panelResize.disconnect();layouts?.dispose?.();window.removeEventListener('pagehide',onPageHide);document.fonts?.removeEventListener('loadingdone',onFonts);await Promise.allSettled([individualCleanup,automaticCleanup,compositeCleanup]);},
 };
}
