import {sourceRegionApplicability} from './source-region-applicability.js';
import {createOcrTextLayer} from './ocr-text-layer.js';
import {bindInteractiveControl} from './interactive-control.js';
import {installHoverSliders} from './hover-sliders.js';
import {createAdaptivePreview,reportAdaptivePreviewPresented} from './adaptive-preview.js';
import {parameterPreviewPolicy} from './parameter-preview-policy.js';
import {createParameterPreviewSession} from './parameter-preview-session.js';
import {localFeaturePolicy} from './feature-policy.js';
import {preferenceAccess,capturePreferenceBackup,downloadPreferenceBackup} from './preferences-recovery.js';
import {downloadSession} from './session-ui.js';
import {createDownloadShelf} from './download-shelf.js';
import {analysisReportFilename,analysisImageFilename} from './report-export-name.js';
import {diagnostic} from './runtime-context.js';
import {rasterOptions,exportPresentationRaster} from './raster-export-client.js';
import {exportDefaults,linkedExportSize} from './media-settings.js';
import {validateLoupeEffects} from './loupe-effects-settings.js';
import {createPointerLoupe} from './pointer-loupe.js';
import {bindSliderReset} from './slider-reset.js';
import {loupeDefaults,loupeKey,validateLoupeSettings,imageAccept,loupeScale,loupeMinimumZoom} from './media-settings.js';
import {isExtensionTool,extensionProgressText} from './extension-tools.js';
import {toolCatalog,toolTitle} from './tool-catalog.js';
import {createToolClient} from './tool-client.js';
import {createErrorJournal,errorEvidence,showErrorJournal} from './error-journal.js';
import {localizeStatus,errorText} from './ui-errors.js';
import {detectIndividualSubimages,individualSubimageProvenance} from './individual-subimages.js';
import {isForgeryscope,neuralDrawingScope} from './neural-clone-ui.js';
import {createToolWorkspace} from './tool-workspace.js';
import {createIndividualRegionController} from './individual-region-controller.js';
import {createAutomaticClient} from './automatic-client.js';
import {createAutomaticProgress,automaticSelection,automaticReport,automaticAnalysisIncomplete} from './automatic-state.js';
import {createCompositeClient} from './composite-client.js';
import {resolveComputeProfile} from './resource-policy.js';
import {createRemoteSurface,createPreviewSurface} from './remote-surface.js';
import {createExportSink} from './export-sink.js';
import {removeTerminatedTemporarySession} from './unified-engine/src/temporary-storage.js';
import {EngineError,serializeEngineError,deserializeEngineError} from './unified-engine/src/errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './unified-engine/src/worker-message-protocol.js';
import {createEnergyUI} from './energy-ui.js';
import {createEnergyHistogramUI} from './energy-histogram-ui.js';
import {bindElaPreviewGesture} from './ela-preview-controls.js';
import { bindViewerNavigation, doubleClickCamera } from './viewer-input.js';
import { strings } from './i18n.js';
import { toolGroups } from './tool-tree.js';
import { defaults, validParams, validEnergySettings, validElaMode, validCompositeSettings, validAutomaticSettings, validateSettings, recoverSettings, settingsFilename } from './settings.js';
import { createWindowLayout } from './window-layout.js';
import { TileCache } from './tiled-surface.js';
import { exportRGBPNG } from './png-export.js';
import {originalBatchScientificScope} from './original-source-regions-batch.js';
import {createOriginalSourceRegionsState} from './original-source-regions.js';
import {compileOriginalSourceRegions,validateOriginalSourceRegions} from './original-source-regions.js';
export function mountAnalysisPanel(document=globalThis.document,host={}) {
const $=id=>document.getElementById(id);
const hoverSliders=host.managed?null:installHoverSliders({root:document,enabled:true,language:()=>lang});
let activeAnalysis='ela.classic',compositeClient=null,compositeResult=null,compositeAbort=null,compositeCleanup=Promise.resolve(),compositeDisposing=false;
const compositeMode=()=>activeAnalysis==='composite';
const individualMode=()=>!!toolCatalog[activeAnalysis];
// Exports and display reads share this client; only a live computation owns the calculation status.
let parameterSession=null,parameterCommitting=false;
let ocrTextLayer=null,inheritedSourceRegions=null,pendingSourceRegions=null,sourceRegionsStale=false,sourceRegionsLocalOverride=false,pendingSourceRegionsLocalOverride=null,inheritedScopeFingerprint=null;
function sourceRegionsSnapshot(){return host.sourceOnly?host.getOriginalSourceRegions?.()??null:inheritedSourceRegions;}
async function localSourceRegionsSnapshot(){if(!sourceRegionsLocalOverride||!regionController?.scope)return sourceRegionsSnapshot();const scope=regionController.scope,state=await createOriginalSourceRegionsState({sourceSha256:hash,width:source.width,height:source.height}),zone=(polygon,id,kind)=>({id,kind,enabled:true,x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1])),polygon});return state.replaceZones([...(scope.regions??[]).map((r,i)=>zone(r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]],'local-positive-'+i,'acquisition')),...(scope.excluded??[]).map((polygon,i)=>zone(polygon,'local-negative-'+i,'exclusion'))],{positiveMode:'selected',enabled:true});}
async function analysisSourceDomain(){const global=host.getOriginalSourceRegions?.()??null,local=host.sourceOnly?global:sourceRegionsLocalOverride?await localSourceRegionsSnapshot():global??sourceRegionsSnapshot();if(!local)return null;const verified=await validateOriginalSourceRegions(local,{sourceSha256:hash,width:source.width,height:source.height});return(await compileOriginalSourceRegions(verified,{ceiling:!host.sourceOnly&&sourceRegionsLocalOverride&&global?global:null})).descriptor;}
async function syncInheritedSourceRegions(){const global=host.getOriginalSourceRegions?.();if(host.sourceOnly||sourceRegionsLocalOverride||!global||!regionController?.active()||inheritedScopeFingerprint===global.fingerprint)return;const expectedHash=hash,scope=await originalBatchScientificScope({originalSourceRegions:global,sourceSha256:hash,width:source.width,height:source.height});if(hash!==expectedHash||host.getOriginalSourceRegions?.()?.fingerprint!==global.fingerprint)throw Object.assign(Error('The original source regions changed before adoption.'),{code:'CANCELLED'});await regionController.restore({schema:'sherloq.individual-regions/1',sourceSha256:hash,scope,excludeTexts:regionController.serialize?.().excludeTexts??true});inheritedScopeFingerprint=global.fingerprint;regions=regionController.rectangles();renderRegions();}
// Capture a fresh immutable ceiling for each native calculation. A later global
// edit marks this result stale without rewriting its scientific provenance.
async function bindSourceRegionTask(task){const applicability=sourceRegionApplicability(task);if(!applicability.applicable){const{sourceRegionDomain,...originalTask}=task;return{...originalTask,sourceRegionApplicability:{...applicability,originalSourceSha256:hash}};}const domain=await analysisSourceDomain();return domain?{...task,sourceRegionDomain:domain}:task;}
function sourceDomainPreviewable(domain){return !domain||domain.countIncluded===domain.width*domain.height;}
async function sourceDomainRestricted(){const descriptor=await analysisSourceDomain();if(!descriptor)return false;const domain=await compileOriginalSourceRegions(descriptor);return domain.countIncluded!==domain.sourceWidth*domain.sourceHeight;}
function sourceRegionSupportNotice(output){const count=output?.metrics?.unanalysablePixels;if(!Number.isSafeInteger(count)||count<=0)return'';return lang==='en'?count.toLocaleString('en')+' selected pixels lack the neighbourhood needed for calculation and were not analysed.':count.toLocaleString('fr')+' pixels sélectionnés n’ont pas le voisinage nécessaire au calcul et n’ont pas été analysés.';}
function sourceRegionCompletedStatus(output){const notice=sourceRegionSupportNotice(output);return t('done')+(notice?' · '+notice:'');}
function sourceRegionTaskIdentity(){return{revision,sourceSha256:hash,imageId,file:fileInput,operation:activeAnalysis};}
function sourceRegionTaskIsCurrent(owner){return !destroyed&&owner?.revision===revision&&owner.sourceSha256===hash&&owner.imageId===imageId&&owner.file===fileInput&&owner.operation===activeAnalysis;}
async function acknowledgeSourceRegionTask(task,owner=sourceRegionTaskIdentity()){if(!sourceRegionTaskIsCurrent(owner)||task?.imageId!==undefined&&task.imageId!==owner.imageId||task?.sourceRegionDomain?.snapshot?.sourceSha256&&task.sourceRegionDomain.snapshot.sourceSha256!==owner.sourceSha256)return false;if(!sourceRegionApplicability(task).applicable){sourceRegionsStale=false;return true;}let current;try{current=await analysisSourceDomain();}catch(error){if(!sourceRegionTaskIsCurrent(owner))return false;throw error;}if(!sourceRegionTaskIsCurrent(owner))return false;sourceRegionsStale=(task?.sourceRegionDomain?.fingerprint??null)!==(current?.fingerprint??null);return !sourceRegionsStale;}
function markSourceRegionsStale(snapshot){if(host.sourceOnly||!fileInput)return;if(elaAutomatic){elaAutomatic=null;syncElaAutomatic();}if(!sourceRegionApplicability({operation:individualUI?.operation?.()??activeAnalysis,params:individualUI?.params?.()??{}}).applicable){sourceRegionsStale=false;return;}clearTimeout(autoRunTimer);autoRunTimer=null;sourceRegionsStale=true;status(autoText('Zones de l’image originale modifiées. Cliquez sur Calculer pour les appliquer.','Original image regions changed. Click Calculate to apply them.'));host.changed?.();}
let individualUI=null,individualClient=null,individualOpening=null,individualCleanup=Promise.resolve(),individualEpoch=0,individualDisposing=false,individualCancelled=false,pendingMagnifier=false,individualComputing=null;
function stopIndividual(){ocrTextLayer?.clear();parameterSession?.reset('tool-change',{restoreResult:false});regionController?.cancel();individualComputing=null;pointerLoupe?.cancelImage();individualEpoch++;const client=individualClient;individualClient=null;individualUI?.invalidateResult();if(client){individualDisposing=true;individualCleanup=individualCleanup.then(()=>client.dispose()).catch(error=>console.warn('Tool cleanup:',error)).finally(()=>individualDisposing=false);}}
const automaticMode=()=>['analysis.complete','analysis.clones'].includes(activeAnalysis);
let automaticOpening=null,automaticEpoch=0,automaticDisposing=false,automaticPresentationDraft=false,automaticGesture=null,automaticGestureVersion=0;
let automaticClient=null,automaticCleanup=Promise.resolve(),automaticProgress=null,automaticSnapshot=null,automaticStarted=0,automaticClock=null,automaticDisplayRevision=0;
function stopAutomatic(){automaticGesture?.reset('cancel');automaticPresentationDraft=false;automaticGestureVersion++;automaticEpoch++;clearInterval(automaticClock);automaticClock=null;const client=automaticClient;automaticClient=null;if(client){automaticDisposing=true;automaticCleanup=automaticCleanup.then(()=>client.dispose()).catch(error=>console.warn('Automatic cleanup:',error)).finally(()=>{automaticDisposing=false;});}}

function releaseCompositeResult(){if(compositeResult&&compositeClient){const client=compositeClient,id=compositeResult.id;compositeResult=null;compositeCleanup=compositeCleanup.then(()=>client.release(id)).catch(()=>{});}}
function stopComposite(){compositeAbort?.abort();compositeAbort=null;const client=compositeClient;compositeClient=null;compositeResult=null;if(client){compositeDisposing=true;compositeCleanup=compositeCleanup.then(()=>client.dispose()).catch(error=>console.warn('Composite cleanup:',error)).finally(()=>{compositeDisposing=false;});}}
let energyUI=null,energyHistogramUI=null,energyHistogramJob=null,energyHistogramQueued=null,energyHistogramVersion=0,energyHistogramKey='',elaMode='classic',energyMode=false,energyViewRevision=0,energyViewBusy=false,energyViewQueued=false,energyViewPreview=null,energyPreviewed=false,autoRunTimer=null;
let lastScientificEnergy=null,lastScientificClassic=null,elaParameterDraft=false,elaPreviewBusy=false,elaPreviewQueued=null,elaPreviewVersion=0,elaPreviewEpoch=0,elaPreviewCommit=false,elaParameterKind=null;
const classicGestures=[];
const displayAdaptive=createAdaptivePreview();let elaAdaptiveFeedback=null;
function observePreviewPresentation(surface,metrics){if(surface&&metrics?.adaptivePreview)surface.adaptiveMetrics=metrics;}
function reportPresentedPreview(surface){
 if(!surface?.adaptiveMetrics||surface.adaptiveReportPending||surface.adaptiveReported===surface.adaptiveMetrics)return;
 const metrics=surface.adaptiveMetrics;surface.adaptiveReportPending=true;
 requestAnimationFrame(()=>{surface.adaptiveReportPending=false;if(destroyed||surface!==result||surface!==presentedSurface||surface.adaptiveMetrics!==metrics)return;surface.adaptiveReported=metrics;const feedback=reportAdaptivePreviewPresented(metrics,{presentedAt:Date.now()});if(feedback){elaAdaptiveFeedback=feedback;diagnostic({level:'info',kind:'parameter-preview.adaptive',metrics:feedback});}});
}

const parameterProvisional=()=>!!parameterSession?.pending||!!individualUI?.interactivePending||automaticPresentationDraft;
const elaProvisional=()=>elaParameterDraft||elaPreviewBusy||elaPreviewCommit||energyViewBusy||energyPreviewed;
function queueAnalysis(){
 clearTimeout(autoRunTimer);autoRunTimer=null;
 if(!fileInput||host.sourceOnly||$('app').classList.contains('original-mode')||parameterSession?.pending&&!parameterCommitting)return;
 if(localMagnifier()){pendingMagnifier=false;refreshLocalMagnifier();return;}
 if(busy||energyViewBusy||elaPreviewBusy){if(activeAnalysis==='inspection.magnifier')pendingMagnifier=true;return;}
 pendingMagnifier=false;
 // Clone and region workflows keep their explicit Calculate action.
 if(activeAnalysis==='ai.clones.d2prl'||regionController?.active()){status(autoText('Choisissez les réglages et les zones, puis cliquez sur Calculer.','Choose the settings and regions, then click Calculate.'));return;}
 if(individualMode()&&!individualUI?.canRun(regions.filter(r=>r.kind!=='exclusion')))return;
 autoRunTimer=setTimeout(()=>{autoRunTimer=null;if(fileInput&&!busy&&!energyViewBusy&&!elaPreviewBusy&&!drawing)void run();},250);
 host.changed?.();
}

let layouts=null,profiles=[],pendingSettings=null,settingsReady=false;
let lang=new URLSearchParams(location.hash.slice(1)).get('lang')==='en'?'en':'fr';
let source=null,result=null,fileInput=null,imageId='',hash='',expectedHash='',regions=[],revision=0,worker=null,loaded=false,busy=false,pending=new Map(),seq=0;
let previousPresentation=null,presentedSurface=null,comparingOriginal=false,comparisonSource=null,comparisonBase=null,sourceRegionComparison=null,sourceRegionDisplayDomain=null;
let destroyed=false;let regionController=null,regionParent=null,pendingScientificRegions=null;
let pointerLoupe=null,loupeSettings={...loupeDefaults};
let zoom=1,offset={x:0,y:0},drawing=false,draft=null,pointers=new Map(),gesture=null;
const tileCache=new TileCache((navigator.deviceMemory&&navigator.deviceMemory<=4?16:32)*1024**2);
const uiRGBBudget=Math.floor(resolveComputeProfile('aggressive').memoryBudgetBytes/3);
let exportController=null,storageEstimate=null;
const temporarySessions=new Map();
const errorJournal=createErrorJournal();let lastIndividualProgress=null;
let resultMeta=null,params={...defaults},engineCapabilities=null,elaAutomatic=null;
const browserCapabilities={secureContext:isSecureContext,worker:typeof Worker!=='undefined',wasm:typeof WebAssembly!=='undefined',webgpuAPI:!!navigator.gpu,cpuThreadsHint:navigator.hardwareConcurrency||null};
const canvas=$('canvas'),ctx=canvas.getContext('2d'),view=$('viewport');
ocrTextLayer=createOcrTextLayer({document,parent:view,language:()=>lang});
const t=key=>strings[lang][key]||key;
function status(message){diagnostic({level:'info',kind:'operation.status',operation:activeAnalysis,message});$('status').textContent=localizeStatus(message,lang);host.changed?.();}
function localGet(key){if(host.managed)return null;return preferenceAccess.read('sherloq.'+key,key==='settings'?{recover:recoverSettings}:{}).value??null;}
function localSet(key,value){if(host.managed)return true;return preferenceAccess.write('sherloq.'+key,value);}
function translate(){
for(const node of document.querySelectorAll('[data-all-sliders-label]'))node.textContent=lang==='fr'?'Tout en curseurs':'Sliders everywhere';const previous=$('status').textContent;for(const key of Object.keys(strings.fr)){if(previous===strings.fr[key]||previous===strings.en[key]){$('status').textContent=t(key);break;}}document.documentElement.lang=lang;$('language').value=lang;document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));renderCapabilities();renderRegions();renderToolTree();renderProfiles();energyUI?.translate();energyHistogramUI?.translate();syncElaAutomatic();syncAnalysisControls();individualUI?.translate?.();translateTaskActions();updateChrome();draw();}
function serialize(){return {schema:'sherloq.session/1',individual:individualUI?.serialize(),operation:host.sourceOnly?'original':individualMode()?activeAnalysis:automaticMode()?activeAnalysis:compositeMode()?'composite':energyMode?'ela.energy':'ela.classic',automatic:automaticSettings(),composite:compositeSettings(),energy:energyUI.bundle(),elaMode,params:{...params},regions:structuredClone(regions),...(regionController?.active()?{scientificRegions:regionController.serialize()}:{}),regionMode:$('zone-mode').value,sha256:hash||expectedHash,language:lang,sourceRegionsLocalOverride,...(sourceRegionsSnapshot()?{sourceRegions:structuredClone(sourceRegionsSnapshot())}:{}),...(host.getOriginalSourceRegions?.()?{originalSourceRegions:structuredClone(host.getOriginalSourceRegions())}:{})};}
function activeElaAutomatic(){return elaAutomatic?.sourceSha256===hash&&Object.keys(defaults).every(key=>elaAutomatic.parameters[key]===params[key])?elaAutomatic:null;}
function syncElaAutomatic(){const active=activeElaAutomatic(),e=active?.estimate?.evidence;let detail='';if(active){const key=e?.status==='exact-IJG-table'?'elaAutoTables':e?.status==='IJG-compatible-statistical-trace'?'elaAutoPixels':e?.kind==='current-file-tables'?'elaAutoEquivalent':'elaAutoUncertain';detail=t(key)+(active.estimate.quality!==null||e?.kind==='current-file-tables'?' · '+active.parameters.quality:'');if(active.calibration?.status==='visibility-calibrated')detail+=' · '+t('elaAutoVisibility');}for(const id of ['ela-auto-detail','energy-ela-auto-detail'])if($(id))$(id).textContent=detail;}
function syncParams(){for(const key of Object.keys(defaults))for(const id of [key,'energy-ela-'+key])if($(id))$(id)[typeof defaults[key]==='boolean'?'checked':'value']=params[key];syncElaAutomatic();}
function retireResult(preserve=true){
 ocrTextLayer?.clear();
 const snapshot=preserve?result?.freeze?.():null;
 if(snapshot){previousPresentation?.close?.();previousPresentation=snapshot;}
 if(!preserve){previousPresentation?.close?.();previousPresentation=null;comparisonSource?.close?.();comparisonSource=null;comparisonBase=null;sourceRegionComparison?.close?.();sourceRegionComparison=null;sourceRegionDisplayDomain=null;}
 result?.close?.();result=null;
}
const localMagnifier=()=>activeAnalysis==='inspection.magnifier'&&loupeSettings.enabled;
const processedSurface=()=>result??previousPresentation;
function adoptSourceRegionPresentation(output,task,owner){if(owner&&!sourceRegionTaskIsCurrent(owner))return false;const display=output?.sourceRegionSourceSurface;if(!display)return;if(sourceRegionComparison?.display?.id!==display.id){sourceRegionComparison?.close?.();sourceRegionComparison=remoteSurface(display);}sourceRegionDisplayDomain=structuredClone(output.sourceRegionDomain??task?.sourceRegionDomain??null);}
function comparisonSurface(){if(!host.sourceOnly&&sourceRegionComparison)return sourceRegionComparison;const shared=host.sourceInput?.()?.source;if(shared&&shared!==comparisonBase){comparisonSource?.close?.();comparisonBase=shared;comparisonSource=shared.fork?.(scheduleDraw);}return comparisonSource??source;}
const selectedSurface=()=>comparingOriginal||localMagnifier()?comparisonSurface():$('layer').value==='result'&&processedSurface()?processedSurface():(host.sourceOnly?source:sourceRegionComparison??source);
function invalidate({preserve=true}={}){parameterSession?.reset('source-change',{restoreResult:false});energyHistogramVersion++;energyHistogramQueued=null;energyHistogramKey='';retireResult(preserve);releaseCompositeResult();$('composite-npz').disabled=true;clearTimeout(autoRunTimer);autoRunTimer=null;revision++;energyViewRevision++;energyUI?.cancelInteraction?.();for(const gesture of classicGestures)gesture.reset();elaPreviewVersion++;elaPreviewEpoch++;elaPreviewBusy=false;elaPreviewQueued=null;elaPreviewCommit=false;elaParameterDraft=false;elaParameterKind=null;energyPreviewed=false;energyViewPreview=null;energyUI?.resetBounds?.();$('energy-npz').disabled=true;$('energy-json').disabled=true;exportController?.abort();resultMeta=null;$('layer').value=previousPresentation?'result':'source';$('export-png').disabled=true;$('export-report').disabled=true;$('provenance').textContent='';draw();}
function setCompareOriginal(value){if(comparingOriginal===value)return;comparingOriginal=value;individualUI?.setOriginal(value||drawing||localMagnifier()||$('app').classList.contains('original-mode'));draw();}
const displayedZoom=()=>Math.round((pointerLoupe?.enabled?loupeScale(loupeSettings,zoom,localMagnifier()):zoom)*100);

function controls(){ syncOcrTextLayer();host.changed?.();individualUI?.lock(busy||energyViewBusy||!!exportController,!!fileInput);for(const b of $('tool-tree').querySelectorAll('button'))b.disabled=busy&&!['original',activeAnalysis].includes(b.dataset.toolId);automaticControls();const locked=busy||energyViewBusy||!!exportController;const previewLock=elaProvisional()||parameterProvisional();energyHistogramUI?.lock(locked||previewLock||!!energyHistogramJob||!hasRetainedEnergy());if(previewLock)for(const id of ['export-png','export-report','energy-npz','energy-json'])$(id).disabled=true;for(const key of ['histogramLow','histogramHigh','shadow','highlight'])for(const suffix of ['','-number'])$('energy-'+key+suffix).disabled=busy||!!exportController;for(const key of ['quality','block','minimum','profile','view','opacity'])$('energy-'+key).disabled=busy||!!exportController;regionController?.refresh();if(regionParent)for(const c of regionParent.querySelectorAll('button,input'))c.disabled=locked||!fileInput||c.dataset.detectionUnavailable==='true';if(regionParent)regionParent.hidden=!(regionController?.active()&&fileInput);if(regionController?.active()&&fileInput){$('inspector').hidden=!!host.regionParent;$('zones').closest('section').hidden=true;}for(const id of ['composite-quality','composite-stage','composite-view'])$(id).disabled=locked;$('composite-run').disabled=!fileInput||locked;$('composite-cancel').disabled=!locked;$('composite-npz').disabled=!compositeResult||locked; $('run').disabled=!fileInput||locked; $('cancel').disabled=!(locked||previewLock); $('file').disabled=locked;$('open-file').disabled=locked;$('empty-open').disabled=locked; for(const k of Object.keys(defaults)){ $(k).disabled=locked;if($('energy-ela-'+k))$('energy-ela-'+k).disabled=locked;} $('energy-run').disabled=!fileInput||locked;$('energy-cancel').disabled=!(locked||previewLock);$('ela-mode').disabled=locked;for(const mode of ['classic','energy','biomes']){const tab=$('ela-tab-'+mode);if(tab)tab.disabled=busy||!!exportController||(mode==='classic'&&energyViewBusy);}for(const id of ['energy-score-field','energy-score-view','energy-score-threshold','energy-score-threshold-number'])$(id).disabled=busy||!!exportController;$('energy-score-run').disabled=!fileInput||locked;$('energy-score-cancel').disabled=!(locked||previewLock); for(const id of ['ela-auto','energy-ela-auto'])if($(id))$(id).disabled=locked||previewLock||!fileInput||!loaded;$('preset').disabled=locked; $('reset').disabled=locked;$('load-session').disabled=locked;$('compute-profile').disabled=locked;for(const id of ['task-zones','task-auto-zones'])if($(id))$(id).disabled=!fileInput||locked;if($('task-run'))$('task-run').disabled=!fileInput||locked||(individualMode()&&!individualUI?.canRun(regions.filter(r=>r.kind!=='exclusion')));}
function cleanupTemporarySessions(){for(const session of temporarySessions.values())void removeTerminatedTemporarySession(session.id,session.backend).catch(()=>{});temporarySessions.clear();}
function stop(){energyHistogramVersion++;energyHistogramQueued=null;energyHistogramKey='';const cancellingParameters=elaParameterDraft||elaPreviewBusy||elaPreviewCommit;elaPreviewVersion++;elaPreviewEpoch++;elaPreviewQueued=null;elaPreviewBusy=false;elaPreviewCommit=false;elaParameterDraft=false;elaParameterKind=null;lastScientificEnergy=lastScientificClassic=null;energyUI?.cancelInteraction?.();for(const gesture of classicGestures)gesture.reset();if(cancellingParameters){resultMeta=null;$('provenance').textContent='';$('export-report').disabled=true;}const cancellingEnergyView=!cancellingParameters&&(energyViewBusy||energyPreviewed);retireResult(!cancellingEnergyView);if(cancellingEnergyView)$('layer').value='source';stopIndividual();stopAutomatic();stopComposite();if(compositeMode()){result?.close?.();result=null;resultMeta=null;$('export-report').disabled=true;$('composite-detail').textContent='';}clearTimeout(autoRunTimer);autoRunTimer=null;revision++;$('energy-npz').disabled=true;$('energy-json').disabled=true;energyViewBusy=false;energyViewQueued=false;energyViewPreview=null;energyPreviewed=false;exportController?.abort();exportController=null;worker?.terminate();worker=null;loaded=false;cleanupTemporarySessions();for(const {reject} of pending.values())reject(Object.assign(new Error('Cancelled'),{code:'CANCELLED'}));pending.clear();busy=false;controls();$('export-png').disabled=!result;if(cancellingEnergyView||cancellingParameters)draw();}
function getWorker(){
 if(worker)return worker;
 const workerURL=new URL('./engine-worker.js',import.meta.url);let created;
 try{created=new Worker(workerURL,{type:'module'});}catch(cause){throw new EngineError('WORKER_FAILED',cause?.message||t('unavailable'),{cause,details:{phase:'worker-create',workerURL:workerURL.href}});}worker=created;
 const fail=error=>{if(worker!==created)return;diagnostic({level:'error',kind:'worker.failure',operation:activeAnalysis,workerURL:workerURL.href,error:serializeEngineError(error)});protocol.dispose();created.onerror=null;created.terminate();worker=null;loaded=false;cleanupTemporarySessions();for(const call of pending.values())call.reject(error);pending.clear();};
 const protocol=installWorkerMessageProtocol(created,async data=>{
  if(worker!==created)return;
  if(data.fatal){if(typeof data.fatal.code!=='string'||typeof data.fatal.message!=='string')throw workerMessageFailure('ela-client','message','invalid-fatal-response');fail(deserializeEngineError(data.fatal));return;}
  if(data.temporarySession){if(typeof data.temporarySession.id!=='string'||!data.temporarySession.id||typeof data.temporarySession.backend!=='string')throw workerMessageFailure('ela-client','message','invalid-storage-owner');temporarySessions.set(data.temporarySession.id,data.temporarySession);return;}
  if(!Number.isSafeInteger(data.id)||data.id<=0)throw workerMessageFailure('ela-client','message','invalid-response-id');
  const call=pending.get(data.id);if(!call)return;
  if(data.chunk!==undefined){
   if(!(data.chunk instanceof Uint8Array)||!Number.isSafeInteger(data.sequence)||data.sequence!==call.chunkSequence+1||call.chunkBusy||typeof call.onChunk!=='function')throw workerMessageFailure('ela-client','message','invalid-export-chunk');
   call.chunkBusy=true;let error;try{await call.onChunk(data.chunk);}catch(cause){error=serializeEngineError(cause);}
   if(worker!==created||pending.get(data.id)!==call)return;protocol.post({id:data.id,action:'export-ack',sequence:data.sequence,...(error?{error}:{})});call.chunkSequence=data.sequence;call.chunkBusy=false;return;
  }
  if(data.progress!==undefined){if(!data.progress||typeof data.progress!=='object'||Array.isArray(data.progress))throw workerMessageFailure('ela-client','message','invalid-progress');$('progress').value=Math.max(0,Math.min(1,data.progress.fraction||0));status(t('running')+' '+data.progress.phase+' '+Math.round(100*$('progress').value)+'%');return;}
  if(data.error!==undefined){if(!data.error||typeof data.error.code!=='string'||typeof data.error.message!=='string')throw workerMessageFailure('ela-client','message','invalid-error-response');const error=deserializeEngineError(data.error);if(['module-load','engine-create'].includes(error.details?.phase)){fail(error);return;}diagnostic({level:'error',kind:'worker.request.failed',operation:activeAnalysis,action:call.action,error:serializeEngineError(error)});pending.delete(data.id);call.reject(error);return;}
  if(!Object.hasOwn(data,'result')||call.chunkBusy)throw workerMessageFailure('ela-client','message','invalid-result-response');pending.delete(data.id);call.resolve(data.result);
 },{label:'ela-client',onFailure:fail});
 created.onerror=event=>fail(new EngineError('WORKER_FAILED',event?.message||t('unavailable'),{cause:event?.error,details:{phase:loaded?'worker-execution':'worker-startup',workerURL:workerURL.href,workerEvent:{type:event?.type,filename:event?.filename,line:event?.lineno,column:event?.colno}}}));
 return created;
}
function request(action,payload,onChunk){if(individualMode())return individualRequest(action,payload);if(automaticMode())return automaticRequest(action,payload);return new Promise((resolve,reject)=>{
 const id=++seq;pending.set(id,{resolve,reject,onChunk,action,chunkSequence:0,chunkBusy:false});
 try{getWorker().postMessage({id,action,payload,options:{energy:energyMode,uiRGBBudgetBytes:uiRGBBudget,uiReserveBytes:tileCache.limit+32*1024**2+Math.ceil((globalThis.innerWidth||1920)*(globalThis.innerHeight||1080)*Math.min(devicePixelRatio||1,2)**2*8)+4*1024**2,computeProfile:$('compute-profile').value,resourceHints:{deviceMemoryGiB:navigator.deviceMemory,heapLimitBytes:performance.memory?.jsHeapSizeLimit,hardwareConcurrency:navigator.hardwareConcurrency}}});}
 catch(error){pending.delete(id);reject(error);}
});}
let displayFramePending=false;function scheduleDraw(){if(destroyed||displayFramePending)return;displayFramePending=true;requestAnimationFrame(()=>{displayFramePending=false;draw();});}
function remoteSurface(display,onFailure){const surface=createRemoteSurface(display,tileCache,(action,payload)=>loaded?request(action,payload):Promise.reject(Object.assign(Error('Source not loaded'),{code:'CANCELLED'})),scheduleDraw,onFailure??(error=>{if(error.code!=='CANCELLED')status(t('error')+' · '+error.message);}));observePreviewPresentation(surface,{adaptivePreview:display.adaptivePreview});return surface;}
function fit(){if(individualUI?.fit?.())return;if(!source||!view.clientWidth||!view.clientHeight)return;const frame=selectedSurface()??source;zoom=Math.min(view.clientWidth/frame.width,view.clientHeight/frame.height)*.95;offset={x:(view.clientWidth-frame.width*zoom)/2,y:(view.clientHeight-frame.height*zoom)/2};draw();}
function syncOcrTextLayer(surface=presentedSurface){ocrTextLayer?.update({presentation:surface?.display?.ocrPresentation,camera:{scale:zoom,x:offset.x,y:offset.y},enabled:activeAnalysis==='various.ocr'&&!!source&&surface===result&&!surface?.previewOnly&&!busy&&!individualCancelled&&!drawing&&!comparingOriginal&&!pointerLoupe?.enabled&&!parameterProvisional()&&!elaProvisional()&&!$('app').classList.contains('original-mode')&&$('layer').value==='result'});}
function draw(){
 if(destroyed)return;
 if(host.visible&&!host.visible()){ocrTextLayer?.clear();return;}
 if(energyViewBusy&&!processedSurface()&&$('layer').value==='result'){$('legend').textContent=t('energyPreviousView');return;}
 const displayed=selectedSurface();
 if(pointerLoupe?.enabled&&displayed){zoom=Math.min(view.clientWidth/displayed.width,view.clientHeight/displayed.height)*.95;offset={x:(view.clientWidth-displayed.width*zoom)/2,y:(view.clientHeight-displayed.height*zoom)/2};}
 layouts?.draw();const dpr=Math.min(devicePixelRatio||1,2),w=view.clientWidth,h=view.clientHeight,bounds={left:-offset.x/zoom,top:-offset.y/zoom,right:(w-offset.x)/zoom,bottom:(h-offset.y)/zoom};
 let nextSurface=layouts&&layouts.mode!=='tabs'&&!comparingOriginal&&!localMagnifier()?processedSurface():displayed;
 if(nextSurface?.prepare&&!nextSurface.prepare(bounds,zoom*dpr)){
  if(nextSurface===result&&previousPresentation)nextSurface=previousPresentation;else{ocrTextLayer?.clear();return;}
 }else if(nextSurface===result&&previousPresentation){previousPresentation.close();previousPresentation=null;}
 presentedSurface=nextSurface;syncOcrTextLayer(nextSurface);
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 if(nextSurface){ctx.save();ctx.translate(offset.x,offset.y);ctx.scale(zoom,zoom);ctx.imageSmoothingEnabled=zoom<3;nextSurface.draw(ctx,bounds,zoom*dpr);
  drawRegionOverlay(ctx);
  ctx.restore();
 }
 if(nextSurface===result)reportPresentedPreview(nextSurface);
 $('analysis-state').hidden=individualMode()||!source||!!processedSurface()||$('app').classList.contains('original-mode');$('analysis-state').textContent=automaticMode()?autoText(busy?'Analyse automatique en cours…':'Prêt pour l’analyse automatique.',busy?'Automatic analysis running…':'Ready for automatic analysis.'):t(compositeMode()?(busy?'compositeComputing':'compositeWaiting'):(busy?'originalComputing':'originalPending'));
 $('zoom').value=displayedZoom()+'%';$('legend').textContent=elaParameterDraft?t('elaDraftView'):energyViewBusy?t('energyPreviousView'):energyPreviewed?t('energyDraftView'):individualMode()?toolTitle(activeAnalysis,lang):automaticMode()&&$('layer').value==='result'&&result?automaticLegend():t($('layer').value==='result'&&processedSurface()?(compositeMode()?'compositeLegend':energyMode?(elaMode==='scores'?(energyUI?.presentation('scores').field==='both'?'energyScoreBothLegend':energyUI?.presentation('scores').field==='unified'?'energyScoreUnifiedLegend':'energyScoreLegend'):'energyLegend'):'resultLegend'):'legend');pointerLoupe?.draw();host.changed?.();
}

function drawRegionOverlay(c){
 const originalScope=host.sourceOnly?host.getOriginalSourceRegions?.():null;
 const highlight=host.sourceOnly?host.getOriginalRegionsHighlight?.():regionController?.highlight;
 const zoneItems=originalScope?originalScope.zones:regionController?.scope?.manual?.zones??regions;
 const zoneOrigin=!host.sourceOnly&&sourceRegionDisplayDomain&&presentedSurface!==source?sourceRegionDisplayDomain.origin:[0,0];
 const drawPoly=(poly,color,bright=false)=>{if(!poly?.length)return;c.beginPath();poly.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));if(poly.length>2)c.closePath();if(bright){c.fillStyle=color+'66';c.fill();c.strokeStyle='#ffffff';c.lineWidth=6/zoom;c.stroke();}c.strokeStyle=color;c.lineWidth=(bright?3:1.5)/zoom;c.stroke();};
 if(host.sourceOnly&&originalScope&&!originalScope.enabled)return;
 if(regionController?.mode==='biomes'){if(highlight?.kind==='biome'){const group=regionController.groups.find(g=>g.id===highlight.id);for(const p of group?.polygons??[])drawPoly(p,'#328cff',true);}return;}
 if(!originalScope&&!$('show-zones').checked&&!regionController?.active())return;
 for(const r of [...zoneItems,...(draft?[draft]:[])]){if(r.enabled===false)continue;const color=r.kind==='exclusion'?'#f34d42':'#38cf8c',poly=r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];drawPoly(poly.map(([x,y])=>[x-zoneOrigin[0],y-zoneOrigin[1]]),color,highlight?.kind==='zone'&&highlight.id===r.id);}
}
const imageInteraction=e=>!e?.target?.closest?.('#tool-results,button,input,select,textarea,dialog');
function point(e){const r=view.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function imagePoint(p){const frame=selectedSurface()??source,origin=!host.sourceOnly&&sourceRegionDisplayDomain&&frame!==source?sourceRegionDisplayDomain.origin:[0,0];return{x:origin[0]+Math.max(0,Math.min(frame.width,Math.round((p.x-offset.x)/zoom))),y:origin[1]+Math.max(0,Math.min(frame.height,Math.round((p.y-offset.y)/zoom))) };}
function zoomAt(p,factor){if(pointerLoupe?.enabled){loupeSettings={...loupeSettings,zoom:Math.min(3600,Math.max(loupeMinimumZoom(loupeSettings,zoom,localMagnifier()),loupeScale(loupeSettings,zoom,localMagnifier())*100*factor))};pointerLoupe.set(effectiveLoupe());host.onLoupeChange?.(loupeSettings);draw();return;}if(individualUI?.zoomBy?.(factor))return;const next=Math.max(.02,Math.min(36,zoom*factor));offset={x:p.x-(p.x-offset.x)*next/zoom,y:p.y-(p.y-offset.y)*next/zoom};zoom=next;draw();}
function renderRegions(){regionController?.refresh();$('zones').replaceChildren();regions.forEach((r,i)=>{const li=document.createElement('li');li.textContent=`${i+1}${r.envelope?' · '+autoText('Enveloppe','Envelope'):''} · [${r.x0}, ${r.y0}] → [${r.x1}, ${r.y1}]`;const b=document.createElement('button');b.textContent='×';b.setAttribute('aria-label',t('clear')+' '+(i+1));b.onclick=()=>{regions.splice(i,1);renderRegions();draw();};li.append(b);$('zones').append(li);});}
async function openFile(file){
 if(!file)return;stop();invalidate({preserve:false});fileInput=null;loaded=false;source?.close?.();source=null;hash='';energyHistogramUI?.update(null);elaAutomatic=null;syncElaAutomatic();$('file-info').textContent=t('noImage');$('empty').hidden=false;draw();busy=true;controls();status(t('loading'));const rev=revision;
 try{
  if(individualDisposing)await individualCleanup;if(automaticDisposing)await automaticCleanup;if(compositeDisposing)await compositeCleanup;if(rev!==revision)return;
  const id=crypto.randomUUID();
  engineCapabilities=await request('capabilities');if(rev!==revision)return;renderCapabilities();
  const descriptor=await request('load',{id,blob:file});if(rev!==revision)return;
  const digest=descriptor.sha256;
  if(expectedHash&&digest!==expectedHash)throw new Error(t('sessionMismatch'));
  if(restoring&&regions.some(r=>r.x1>descriptor.width||r.y1>descriptor.height))throw new Error('Region outside image');
  loaded=true;source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});fileInput=file;individualUI?.setFile(file);hash=digest;imageId=id;expectedHash='';
  if(!restoring)regions=[];regionController?.sourceChanged();if(pendingScientificRegions){await regionController?.restore(pendingScientificRegions);pendingScientificRegions=null;regions=regionController.rectangles();}restoring=false;renderRegions();$('file-info').textContent=`${file.name} · ${descriptor.width} × ${descriptor.height} · ${(file.size/1024**2).toFixed(2)} MiB`;
  $('empty').hidden=true;fit();status(t('ready'));
 }catch(e){if(rev===revision){worker?.terminate();worker=null;loaded=false;cleanupTemporarySessions();status(t('error')+' · '+(e.code||'')+' '+e.message);}}
 finally{if(rev===revision){busy=false;controls();if(fileInput)queueAnalysis();}}
}

let restoring=false;
async function run(){if(busy||energyViewBusy||elaPreviewBusy){if(elaParameterDraft)commitElaParameters();return;}if(drawing)setDrawing(false);if(individualMode())return runIndividual();if(automaticMode())return runAutomatic();if(compositeMode())return runComposite();clearTimeout(autoRunTimer);autoRunTimer=null;if(busy||energyViewBusy)return;if(!fileInput)return status(t('needImage'));const mode=$('zone-mode').value;if(mode==='pair'&&regions.length!==2)return status(t('pairError'));if(mode!=='whole')return status(t('unsupported'));const previousSize=processedSurface()??source,previousWidth=previousSize?.width,previousHeight=previousSize?.height;busy=true;controls();invalidate();
 // A native run retires the worker's prior result before it can fail. Only a
 // successfully accepted replacement may supply IDs to subsequent previews.
 lastScientificClassic=lastScientificEnergy=null;const rev=revision,sourceRegionOwner=sourceRegionTaskIdentity();let presentationClamped=false;$('progress').value=0;status(t('running'));try{if(individualDisposing)await individualCleanup;if(automaticDisposing)await automaticCleanup;if(compositeDisposing)await compositeCleanup;if(rev!==revision)return;if(!loaded){engineCapabilities=await request('capabilities');if(rev!==revision)return;renderCapabilities();const descriptor=await request('load',{id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});$('tab-original').title='Engine RGB8';draw();}const energyRequest=energyMode?prepareEnergyRequest():null;const submitted=await bindSourceRegionTask({id:'ela-'+rev,imageId,operation:energyMode?'ela.energy':'ela.classic',params:energyMode?energyRequest.params:{...params},...(energyMode?{presentation:energyRequest.presentation}:{}),backend:'cpu',regions:[]});if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;const output=await request('run',submitted);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;await acknowledgeSourceRegionTask(submitted,sourceRegionOwner);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;adoptSourceRegionPresentation(output,submitted,sourceRegionOwner);if(energyMode&&!energyUI.accept(output.data.metadata,energyRequest.token))return;if(energyMode){lastScientificEnergy={id:output.id,quality:output.data.metadata.quality,params:{...output.provenance.params}};lastScientificClassic=null;presentationClamped=energyUI.observePresentation?.(output.presentation)===true;}else{lastScientificClassic={id:output.id};lastScientificEnergy=null;}engineCapabilities=await request('capabilities');if(rev!==revision)return;renderCapabilities();retireResult();result=remoteSurface(output.display);const {pixels,display,...meta}=output;resultMeta={...meta,parameters:energyMode?output.provenance.params:{...params},capabilities:{browser:browserCapabilities,engine:engineCapabilities},ui:{version:'0.20.0',sourcePreview:'engine.readDisplay: bounded sampled frames; exact original retained',regionMode:'whole',sourceSha256:hash,...(activeElaAutomatic()?{elaAutomatic:activeElaAutomatic()}:{}),...(energyMode?{elaMode,...(elaMode==='scores'?{elaParameters:{...params},elaBaseSource:'classic'}:{}),presentation:{...energyRequest.presentation,...output.presentation}}:{}),memory:{rgbBudgetBytes:uiRGBBudget,retainedRGBBytes:(source?.byteLength||0)+(result?.byteLength||0),tileCacheBytes:tileCache.bytes,tileCacheLimitBytes:tileCache.limit,storageEstimate,storageBackend:'engine surface storage; original Blob retained without UI arrayBuffer copy',display:'complete viewport frames; sampled preview below 100%; analysis/export unchanged'}}};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('layer').value=$('app').classList.contains('original-mode')?'source':'result';$('export-png').disabled=false;$('export-report').disabled=false;$('energy-npz').disabled=!energyMode;$('energy-json').disabled=!energyMode;$('progress').value=1;if(!presentationClamped){if(result.width!==previousWidth||result.height!==previousHeight)fit();draw();status(sourceRegionCompletedStatus(output));}}catch(e){if(rev===revision){lastScientificClassic=lastScientificEnergy=null;status(e.code==='CANCELLED'?t('cancelled'):t('error')+' · '+(e.code||'')+' '+e.message);}}finally{if(rev===revision){busy=false;controls();if(presentationClamped&&resultMeta&&hasRetainedEnergy())void refreshEnergyView();else refreshEnergyHistogram();}}}
let localDownloadShelf;
function download(value,name,options){if(host.download)return host.download(value,name,options);localDownloadShelf??=createDownloadShelf({document,parent:$('toolbox'),before:$('toolbox').querySelector('.availability-note'),language:()=>lang,onError:error=>status(t('error')+' · '+error.message)});return localDownloadShelf.download(value,name,options);}
function exportJSON(value,name){return download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),name);}
async function restore(file){if(!file)return;try{if(file.size>1024**2)throw new Error('Session > 1 MiB');const v=JSON.parse(await file.text());if(v.schema!=='sherloq.session/1'||!['original','ela.classic','ela.energy','composite','analysis.complete','analysis.clones',...Object.keys(toolCatalog)].includes(v.operation))throw new Error('Unsupported session');const p=validParams(v.params),energy=validEnergySettings(v.energy),composite=validCompositeSettings(v.composite),automatic=validAutomaticSettings(v.automatic),restoredElaMode=v.operation==='ela.energy'?validElaMode(v.elaMode??'biomes'):'classic';if(!Array.isArray(v.regions)||v.regions.length>100)throw new Error('Invalid regions');for(const r of v.regions)if(!['x0','y0','x1','y1'].every(k=>Number.isInteger(r[k])&&r[k]>=0&&r[k]<100000)||r.x0>=r.x1||r.y0>=r.y1)throw new Error('Invalid region');if(!['whole','pair','cross','independent'].includes(v.regionMode))throw new Error('Invalid region mode');if(v.sha256&&!/^[a-f0-9]{64}$/.test(v.sha256))throw new Error('Invalid fingerprint');const restoredSourceRegions=v.sourceRegions?await validateOriginalSourceRegions(v.sourceRegions):null;if(restoredSourceRegions&&v.sha256&&restoredSourceRegions.sourceSha256!==v.sha256)throw new Error('Source-region session belongs to another image.');if(v.sourceRegionsLocalOverride!==undefined&&typeof v.sourceRegionsLocalOverride!=='boolean')throw new Error('Invalid local source region mode.');pendingSourceRegions=restoredSourceRegions;pendingSourceRegionsLocalOverride=v.sourceRegionsLocalOverride??!!v.scientificRegions?.scope;stop();invalidate({preserve:false});source?.close?.();source=null;fileInput=null;hash='';params=p;energyUI.load(energy);loadAutomaticSettings(automatic);for(const key of ['quality','stage','view'])$('composite-'+key).value=composite[key];individualUI?.restore(v.individual);activeAnalysis=toolCatalog[v.operation]?v.operation:v.operation.startsWith('analysis.')?v.operation:v.operation==='composite'?'composite':'ela.classic';setElaMode(restoredElaMode);chooseTool(activeAnalysis);regions=v.regions;pendingScientificRegions=v.scientificRegions??null;expectedHash=v.sha256||'';restoring=true;$('zone-mode').value=v.regionMode;$('preset').value='manual';syncParams();renderRegions();$('empty').hidden=false;$('file').value='';$('file-info').textContent=t('noImage');controls();status(t('restored'));}catch(e){status(t('error')+' · '+e.message);if(host.managed)throw e;}finally{$('load-session').value='';}}
$('language').onchange=()=>{lang=$('language').value;translate();};$('file').accept=imageAccept;
$('file').onchange=e=>openFile(e.target.files[0]);$('run').onclick=run;$('cancel').onclick=()=>{if(automaticMode())return pauseAutomatic();stop();$('progress').value=0;status(t('cancelled'));};
// Numeric gestures keep the engine's native source and scientific result alive.
// Each input replaces the sole queued draft; release discards drafts and commits
// the normal native calculation once, with the existing stage caches.
function beginElaParameters({newIntent=false}={}){
 // A trailing change/blur belongs to the existing edit and must not cancel its
 // scheduled exact result. Only an actual new gesture can reopen that commit.
 if(elaParameterDraft){
  if(newIntent&&elaPreviewCommit){clearTimeout(autoRunTimer);autoRunTimer=null;elaPreviewCommit=false;elaPreviewQueued=null;elaPreviewVersion++;elaPreviewEpoch++;}
  return;
 }
 clearTimeout(autoRunTimer);autoRunTimer=null;
 if(!energyViewBusy&&!busy)revision++;
 energyViewRevision++;energyViewQueued=false;elaPreviewVersion++;elaPreviewEpoch++;elaPreviewCommit=false;elaParameterDraft=true;
 retireResult();if(previousPresentation)$('layer').value='result';
 exportController?.abort();controls();draw();status(t('running'));
}
function commitElaParameters(){
 if(!elaParameterDraft||elaPreviewCommit)return;elaPreviewQueued=null;elaPreviewVersion++;elaPreviewEpoch++;elaPreviewCommit=true;
 controls();if(!elaPreviewBusy&&!energyViewBusy&&!busy)finishElaParameters();
}
async function estimateClassicAuto(){
 if(busy||energyViewBusy||elaProvisional()||exportController||!fileInput||!loaded||!worker||individualMode()||automaticMode()||compositeMode())return;
 clearTimeout(autoRunTimer);autoRunTimer=null;const owner=sourceRegionTaskIdentity(),rev=revision,sourceId=imageId,sourceHash=hash,sourceWidth=source.width,sourceHeight=source.height;busy=true;controls();status(t('elaAutoEstimating'));
 try{const submitted=await bindSourceRegionTask({});if(!sourceRegionTaskIsCurrent(owner))return;const domain=submitted.sourceRegionDomain??null,answer=await request('estimate-ela-auto',{imageId:sourceId,sourceSha256:sourceHash,params:{...params},...(domain?{sourceRegionDomain:domain}:{})});
  if(!sourceRegionTaskIsCurrent(owner))return;
  if(answer.imageId!==sourceId||answer.sourceSha256!==sourceHash||answer.width!==sourceWidth||answer.height!==sourceHeight)throw new EngineError('INVALID_INPUT','Automatic ELA estimate differs from its native source.');
  if(domain){const observed=await compileOriginalSourceRegions(answer.sourceRegionDomain),grid=answer.analysisGrid;if(observed.fingerprint!==domain.fingerprint||!grid||grid.width!==domain.width||grid.height!==domain.height||grid.origin?.[0]!==domain.origin[0]||grid.origin?.[1]!==domain.origin[1])throw new EngineError('SOURCE_REGIONS_INVALID','Automatic ELA estimate differs from its admitted source domain.');}
  else if(answer.sourceRegionDomain)throw new EngineError('SOURCE_REGIONS_INVALID','Automatic ELA estimate unexpectedly belongs to a restricted source domain.');
  if(!sourceRegionTaskIsCurrent(owner))return;const current=await analysisSourceDomain();if(!sourceRegionTaskIsCurrent(owner))return;
  if((domain?.fingerprint??null)!==(current?.fingerprint??null)){sourceRegionsStale=true;status(t('changed'));return;}
  const proposal=validParams(answer.parameters);busy=false;elaParameterKind='classic';beginElaParameters();params=proposal;elaAutomatic={...answer,sourceRegionFingerprint:domain?.fingerprint??null,parameters:{...proposal}};syncParams();$('preset').value='manual';persistSettings();
  diagnostic({level:'info',kind:'ela.auto.estimated',operation:'ela.classic',sourceSha256:hash,...(domain?{sourceRegionDomain:domain,analysisGrid:answer.analysisGrid}:{}),estimate:answer.estimate,calibration:answer.calibration,parameters:{...params}});commitElaParameters();
 }catch(error){if(sourceRegionTaskIsCurrent(owner))status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+(error.code||'')+' '+error.message);}
 finally{if(rev===revision){busy=false;controls();}}
}
for(const id of ['ela-auto','energy-ela-auto'])if($(id))$(id).onclick=estimateClassicAuto;
function queueElaParameterPreview(){
 if(!loaded||!worker||!fileInput||busy||individualMode()||automaticMode()||compositeMode())return;
 const preview={adaptive:true,...(elaAdaptiveFeedback?{adaptiveFeedback:elaAdaptiveFeedback}:{})};let job;
 if(energyMode&&elaParameterKind!=='classic'){if(!lastScientificEnergy)return;const prepared=prepareEnergyRequest();energyHistogramUI?.markers(prepared.params,resultMeta?.data?.metadata,{draft:true});job={action:'preview-energy-parameters',payload:{resultId:lastScientificEnergy.id,params:{...prepared.params},presentation:{...prepared.presentation},preview}};}
 else job={action:'preview-classic',payload:{imageId,...(lastScientificClassic?.id?{resultId:lastScientificClassic.id}:{}),params:{...params},preview}};
 elaPreviewQueued=job;elaPreviewCommit=false;elaPreviewVersion++;void pumpElaParameterPreview();
}
async function pumpElaParameterPreview(){
 if(!elaParameterDraft||elaPreviewCommit){elaPreviewQueued=null;return;}
 if(elaPreviewBusy||energyViewBusy||busy||!elaPreviewQueued)return;
 elaPreviewBusy=true;controls();const rev=revision,epoch=elaPreviewEpoch,sourceId=imageId;
 try{while(elaPreviewQueued&&rev===revision&&epoch===elaPreviewEpoch&&elaParameterDraft&&!elaPreviewCommit){
  const job=elaPreviewQueued,version=elaPreviewVersion;elaPreviewQueued=null;
  const submitted=await bindSourceRegionTask({operation:job.action==='preview-classic'?'ela.classic':'ela.energy',params:job.payload.params}),domain=submitted.sourceRegionDomain;if(rev!==revision||epoch!==elaPreviewEpoch||sourceId!==imageId)return;if(sourceRegionsStale||!sourceDomainPreviewable(domain)){continue;}
  let answer;try{answer=await request(job.action,{...job.payload,...(domain?{sourceRegionDomain:domain}:{})});}catch(error){if(rev!==revision||epoch!==elaPreviewEpoch)return;if(version!==elaPreviewVersion)continue;if(error.code==='DRAFT_BASE_MISMATCH'){status(t('elaDraftView'));continue;}throw error;}
  if(rev!==revision||epoch!==elaPreviewEpoch||sourceId!==imageId)return;if(!elaParameterDraft||elaPreviewCommit||sourceRegionsStale)continue;
  if(job.action==='preview-classic'&&(answer.sourceRegionDomain?.fingerprint??null)!==(domain?.fingerprint??null))throw new EngineError('SOURCE_REGIONS_INVALID','The provisional image differs from its admitted source region.');
  if(domain)sourceRegionDisplayDomain=structuredClone(domain);
  // Complete drafts advance monotonically while inputs replace only the next
  // job. Their bounded RGB snapshot survives later worker display revisions.
  diagnostic({level:'info',kind:'ela.preview.displayed',operation:elaParameterKind==='classic'?'ela.classic':'ela.energy',sourceSha256:hash,parameters:job.payload.params,presentation:answer.presentation,metrics:answer.metrics??answer.draft,provisional:true});const next=createPreviewSurface(answer.pixels,{document});observePreviewPresentation(next,answer.metrics??answer.draft);retireResult();result=next;$('layer').value=$('app').classList.contains('original-mode')?'source':'result';draw();status(t('elaDraftView'));
 }}catch(error){if(rev===revision)status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+error.message);}
 finally{if(rev===revision){elaPreviewBusy=false;controls();if(elaPreviewCommit)finishElaParameters();else if(elaPreviewQueued)void pumpElaParameterPreview();}}
}
function takeManualControl(options){
 elaAutomatic=null;syncElaAutomatic();$('preset').value='manual';elaParameterKind='classic';beginElaParameters(options);persistSettings();
}
function updateClassicValue(key,control=$(key)){
 const raw=control.value;if(raw===''&&typeof defaults[key]!=='boolean')return false;
 try{params=validParams({...params,[key]:typeof defaults[key]==='boolean'?control.checked:Number(raw)});return true;}catch{return false;}
}
for(const key of ['quality','scale','contrast'])for(const id of [key,'energy-ela-'+key]){
 const control=$(id);if(!control)continue;const gesture=bindElaPreviewGesture(control,{begin:()=>takeManualControl({newIntent:true}),preview:queueElaParameterPreview,finish:commitElaParameters});classicGestures.push(gesture);
 control.addEventListener('beforeinput',e=>{if(!control.disabled&&/^(insert|delete)/.test(e.inputType||''))takeManualControl({newIntent:true});},{capture:true});
 control.oninput=()=>{if(control.disabled||!updateClassicValue(key,control))return;takeManualControl();syncParams();persistSettings();if(gesture.active)gesture.markChanged();};
 control.onchange=()=>{if(!updateClassicValue(key,control)){syncParams();if(!gesture.active)commitElaParameters();return;}takeManualControl();syncParams();persistSettings();if(gesture.active)gesture.markChanged();else commitElaParameters();};
 control.addEventListener('blur',()=>{if(control.dataset?.hoverSliderActive==='true')return;if(!updateClassicValue(key,control))syncParams();if(!gesture.active)commitElaParameters();});
}
for(const key of ['linear','grayscale'])for(const id of [key,'energy-ela-'+key])if($(id))$(id).onchange=()=>{try{params=validParams({...params,[key]:$(id).checked});syncParams();$('preset').value='manual';if(elaMode==='scores'){takeManualControl();commitElaParameters();}else{invalidate();status(t('changed'));queueAnalysis();}}catch(e){syncParams();status(t('error')+' · '+e.message);}};
$('reset').onclick=()=>{params={...defaults};syncParams();$('preset').value='native';invalidate();queueAnalysis();};
$('preset').onchange=()=>{const value=$('preset').value;if(value==='manual')return;const profile=profiles.find(p=>p.id===value);params={...(profile?profile.params:defaults)};syncParams();invalidate();queueAnalysis();};
function renderProfiles(){const selected=$('preset').value||'native';$('preset').replaceChildren(new Option(t('native'),'native'),new Option(t('manual'),'manual'),...profiles.map(p=>new Option(p.name,p.id)));$('preset').value=[...$('preset').options].some(o=>o.value===selected)?selected:'manual';}
$('save-preset').onclick=()=>{const p=profiles.find(p=>p.id===$('preset').value);$('profile-name').value=p?.name||'';$('save-dialog').showModal();$('profile-name').focus();};
$('favorite').setAttribute('aria-pressed',String(!!localGet('favorite')));$('favorite').onclick=()=>{const v=$('favorite').getAttribute('aria-pressed')!=='true';$('favorite').setAttribute('aria-pressed',String(v));localSet('favorite',v);renderToolTree();};
function setDrawing(value){
 clearTimeout(autoRunTimer);autoRunTimer=null;drawing=value;draft=null;pointers.clear();gesture=null;
 $('draw').setAttribute('aria-pressed',String(drawing));$('task-zones')?.setAttribute('aria-pressed',String(drawing));view.classList.toggle('drawing',drawing);
 if(host.managed)$('inspector').hidden=regionController?.active()&&fileInput?!!host.regionParent:!drawing;
 if(drawing){$('show-zones').checked=true;const different=result&&(result.width!==source?.width||result.height!==source?.height);$('layer').value='source';individualUI?.setOriginal(true);if(different)fit();}
 else{const original=comparingOriginal||localMagnifier()||$('app').classList.contains('original-mode');$('layer').value=result&&!original?'result':'source';if(result&&!original)fit();individualUI?.setOriginal(original);}
 translateTaskActions();draw();
}
$('draw').onclick=()=>{if(!busy&&fileInput){if(regionController?.active())void regionController.edit({tool:'acquisition'}).catch(e=>status(t('error')+' · '+e.message));else setDrawing(!drawing);}};$('clear-zones').onclick=()=>{if(regionController?.scope)return void regionController.edit({tool:'select'}).catch(e=>status(t('error')+' · '+e.message));regions=[];renderRegions();draw();};$('show-zones').onchange=draw;$('layer').onchange=()=>{if($('layer').value==='result'&&!result)status(t('noResult'));individualUI?.setOriginal($('layer').value==='source'||comparingOriginal||drawing||localMagnifier()||$('app').classList.contains('original-mode'));draw();};$('fit').onclick=()=>{fit();layouts?.fit();};$('zoom-in').onclick=()=>zoomAt({x:view.clientWidth/2,y:view.clientHeight/2},1.25);$('zoom-out').onclick=()=>zoomAt({x:view.clientWidth/2,y:view.clientHeight/2},.8);
bindViewerNavigation(view,{enabled:e=>!pointerLoupe?.enabled&&!drawing&&imageInteraction(e)&&!!source&&(layouts?.mode==='tabs'||!!result),getMode:()=>$('navigation-mode').value,panBy:(x,y)=>{offset.x+=x;offset.y+=y;draw();},zoomBy:zoomAt,isTouchActive:()=>pointers.size>1});
view.addEventListener('dblclick',e=>{if(pointerLoupe?.enabled)return;if(!imageInteraction(e)||e.button!==0||drawing||!source||(layouts?.mode!=='tabs'&&!result))return;e.preventDefault();if(regionController?.active()){const local=point(e),p={x:(local.x-offset.x)/zoom,y:(local.y-offset.y)/zoom};void regionController.resetAt(p).then(reset=>{if(!reset)fit();}).catch(error=>status(t('error')+' · '+error.message));return;}if(energyMode&&elaMode==='scores'&&energyUI.presentation('scores').field==='both'&&selectedSurface()!==source){fit();return;}const c=doubleClickCamera({scale:zoom,x:offset.x,y:offset.y},selectedSurface()??source,{width:view.clientWidth,height:view.clientHeight},point(e));zoom=c.scale;offset={x:c.x,y:c.y};draw();});
view.onpointerdown=e=>{if(pointerLoupe?.enabled&&!drawing)return;if(!imageInteraction(e)||e.button!==0||!source||(layouts?.mode!=='tabs'&&!result))return;view.setPointerCapture(e.pointerId);const p=point(e);pointers.set(e.pointerId,p);if(pointers.size===2){draft=null;const [a,b]=[...pointers.values()];gesture={distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};}else if(drawing){const q=imagePoint(p);draft={id:crypto.randomUUID(),x0:q.x,y0:q.y,x1:q.x,y1:q.y};gesture={origin:q};}else gesture={pan:p};};
view.onpointermove=e=>{if(!pointers.has(e.pointerId))return;const p=point(e);pointers.set(e.pointerId,p);if(pointers.size===2){const[a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y),center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(gesture?.distance){zoomAt(gesture.center,distance/Math.max(1,gesture.distance));offset.x+=center.x-gesture.center.x;offset.y+=center.y-gesture.center.y;}gesture={distance,center};}else if(draft&&gesture?.origin){const q=imagePoint(p),a=gesture.origin;draft={...draft,x0:Math.min(a.x,q.x),y0:Math.min(a.y,q.y),x1:Math.max(a.x,q.x),y1:Math.max(a.y,q.y)};}else if(gesture?.pan){offset.x+=p.x-gesture.pan.x;offset.y+=p.y-gesture.pan.y;gesture.pan=p;}draw();};
function endPointer(e){pointers.delete(e.pointerId);if(draft){if(draft.x1>draft.x0&&draft.y1>draft.y0&&regions.length<100)regions.push(draft);draft=null;renderRegions();}gesture=pointers.size?{pan:[...pointers.values()][0]}:null;draw();}view.onpointerup=endPointer;view.onpointercancel=()=>{pointers.clear();gesture=null;draft=null;draw();};
view.onkeydown=e=>{if(!imageInteraction(e))return;if(host.sourceOnly&&host.onOriginalRegionsKeydown?.(e))return;if(!host.managed&&e.code==='Space'&&source){e.preventDefault();$('layer').value=$('layer').value==='source'&&result?'result':'source';individualUI?.setOriginal($('layer').value==='source'||comparingOriginal||drawing||localMagnifier()||$('app').classList.contains('original-mode'));draw();}if(e.key==='Escape')setDrawing(false);if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();regions.pop();renderRegions();draw();}};
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
 if(parameterProvisional())return status(autoText('Attendez le rendu final avant d’exporter.','Wait for the final rendering before exporting.'));
 if(!host.sourceOnly&&!individualMode()&&!automaticMode()&&!compositeMode()&&elaProvisional())return status(t('elaExactNeeded'));
 const target=host.sourceOnly?source:localMagnifier()||$('layer').value==='source'?comparisonSurface():result;if(!target||exportController)return;if(target.previewOnly)return status(autoText('Attendez le rendu final avant d’exporter.','Wait for the final rendering before exporting.'));
 if(!host.sourceOnly&&target===source&&host.exportOriginalImage){const task=value=>host.exportOriginalImage(value);return settingsOverride?task(settingsOverride):host.requestExport(task);}
 const selectedRevision=revision,exportMeta=resultMeta,exportOperation=activeAnalysis;
 const execute=async settings=>{
  if(selectedRevision!==revision||exportController)return;const rev=revision,controller=new AbortController();exportController=controller;controls();$('export-png').disabled=true;
  const options=rasterOptions(settings.resize?{...settings,...linkedExportSize(settings,target)}:settings,source?.display?.chroma??engineCapabilities?.sourceChroma);let output;
  const progress=event=>{if(rev===revision){$('progress').value=event.fraction??0;status(t('exporting')+' · '+(event.phase??''));}};
  try{
   if(individualMode()&&target.display?.id&&!target.display.pixels&&!target.display.m2Result&&!target.display.cloneView&&!target.display.biomePresentation&&!target.display.dtdPresentation&&!target.display.comprintPresentation&&!target.display.retainedParameterView){output=await(await ensureIndividualClient()).export(options.format,target.display,options);}
   else if(!individualMode()&&!automaticMode()&&!compositeMode()){
    const sink=await createExportSink({memoryBudgetBytes:uiRGBBudget,signal:controller.signal,mime:'image/'+options.format});
    try{const answer=await request('export-raster',{display:target.display,options},chunk=>sink.write(chunk));output={...await sink.finish(),descriptor:answer.descriptor};}catch(error){await sink.abort();throw error;}
   }else{
    const owner=automaticMode()?automaticClient:individualMode()?await ensureIndividualClient():compositeClient;
    output=await exportPresentationRaster(target,options,{reserve:bytes=>owner.reserveExport(bytes,target.display),signal:controller.signal,onProgress:progress});
   }
   if(rev===revision&&!controller.signal.aborted){await download(output,analysisImageFilename(exportMeta,{fallbackOperation:exportOperation,format:options.format,original:host.sourceOnly||target===source}),{signal:controller.signal});status(t('done'));}
   else await output?.cleanup?.();
  }catch(error){if(rev===revision){if(error.code!=='CANCELLED'){errorJournal.record(error,{operation:'export.image',format:options.format,width:target.width,height:target.height});translateTaskActions();}status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+errorText(error,lang));}}
  finally{if(exportController===controller){exportController=null;controls();$('export-png').disabled=!result;}}
 };
 return settingsOverride?execute(settingsOverride):host.requestExport?host.requestExport(execute):execute({...exportDefaults});
}
$('export-png').onclick=()=>exportImage();$('export-report').onclick=()=>{if(resultMeta&&!elaProvisional()&&!parameterProvisional())return downloadSession({document,button:$('export-report'),operation:'tool-report',report:{...resultMeta,...(regionController?.active()?{scientificRegions:regionController.serialize()}:{}),...(errorJournal.length?{diagnosticHistory:errorJournal.snapshot()}:{})},download,name:automaticMode()?'SHERLOQ-automatic-report.json':compositeMode()?'SHERLOQ-composite-report.json':individualMode()?analysisReportFilename(resultMeta,{fallbackOperation:activeAnalysis}):'sherloq-ela-report.json'});};$('save-session').onclick=()=>exportJSON(serialize(),'sherloq-session.json');$('load-session').onchange=e=>restore(e.target.files[0]);

function renderCapabilities(){const m=engineCapabilities?.memory?.budgetBytes;const workers=engineCapabilities?.resourceProfile?.maxWorkers;$('capabilities').textContent=t('memory')+': '+(m?Math.round(m/1024**2)+' MiB':'—')+' · '+t('workerBudget')+': '+(workers||browserCapabilities.cpuThreadsHint||'—')+' · '+t('displayMemory')+' '+Math.round(tileCache.limit/1024**2)+' MiB / RGB '+Math.round(uiRGBBudget/1024**2)+' MiB'+(storageEstimate?.quota?' · '+t('storageQuota')+' '+Math.round(storageEstimate.quota/1024**2)+' MiB':'')+' · WebGPU '+(browserCapabilities.webgpuAPI?'API ✓ / engine —':'API — / CPU ✓');}
$('compute-profile').onchange=()=>{stop();engineCapabilities=null;invalidate();renderCapabilities();status(t('computeChanged'));};
let theme=localGet('theme');
if(!['light','dark'].includes(theme)){try{theme=localStorage.getItem('gd-iso-studio-theme');}catch{} }
if(!['light','dark'].includes(theme))theme=matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';
function updateChrome(){document.documentElement.dataset.theme=theme;$('theme-label').textContent=t(theme==='light'?'darkTheme':'lightTheme');$('theme-toggle').setAttribute('aria-label',t(theme==='light'?'darkTheme':'lightTheme'));$('theme-toggle').setAttribute('aria-pressed',String(theme==='light'));$('locale-label').textContent=lang==='fr'?'EN':'FR';$('language-toggle').setAttribute('aria-label',lang==='fr'?'Display in English':'Afficher en français');$('home').title=t('home');$('home').setAttribute('aria-label',t('home'));$('fullscreen').title=t(document.fullscreenElement?'exitFullscreen':'fullscreen');$('fullscreen').setAttribute('aria-label',$('fullscreen').title);}
function chooseTool(id){if(!localFeaturePolicy.isToolAvailable(id)){status('FEATURE_UNINSTALLED · '+autoText('Réinstallez cette fonction dans les réglages locaux.','Reinstall this function in local settings.'));return;}if(busy&&id!=='original'&&id!==activeAnalysis)return;const previousAutomatic=automaticMode(),previousIndividual=individualMode(),original=id==='original';if(!original&&id!==activeAnalysis){if(previousIndividual&&toolCatalog[id]){individualUI.hideResult();invalidate({preserve:false});void individualClient?.release().catch(error=>{if(error.code!=='CANCELLED')console.warn('Tool result cleanup:',error);});}else{stop();invalidate({preserve:false});source?.close?.();source=null;}activeAnalysis=id;}syncAnalysisControls();const selectedComposite=compositeMode();$('tab-composite').setAttribute('aria-selected',String(!original&&selectedComposite));layouts?.focus(original?'original-window':'analysis-window');$('app').classList.toggle('original-mode',original);if(individualMode()){individualUI?.setOriginal(original||comparingOriginal||drawing||localMagnifier());if(original&&result&&(result.width!==source?.width||result.height!==source?.height))fit();}$('tab-original').setAttribute('aria-selected',String(original));$('tab-ela').setAttribute('aria-selected',String(!original&&!selectedComposite&&!automaticMode()&&!individualMode()));$('layer').value=original?'source':(result?'result':'source');renderToolTree();draw();if(!original&&fileInput&&(previousAutomatic!==automaticMode()||previousIndividual!==individualMode())){void reloadToolSource();}else if(!original&&!result)queueAnalysis();else if(original){clearTimeout(autoRunTimer);autoRunTimer=null;}if(innerWidth<=760){$('app').classList.add('tools-hidden');$('toggle-tools').setAttribute('aria-pressed','false');}}
function renderToolTree(){if(host.managed)return;const tree=$('tool-tree');tree.replaceChildren();const original=$('app').classList.contains('original-mode');const groups=[...($('favorite').getAttribute('aria-pressed')==='true'?[{en:'Favorites',fr:'Favoris',items:[{en:'Error Level Analysis',fr:'ELA — Analyse du niveau d’erreur',id:'ela.classic'}]}]:[]),...toolGroups];for(const g of groups){const d=document.createElement('details');d.className='tool-group';d.open=['General','JPEG','Favorites'].includes(g.en)||g.items.some(item=>item.id===activeAnalysis);const summary=document.createElement('summary');summary.textContent='['+g[lang]+']';d.append(summary);for(const item of g.items.filter(item=>localFeaturePolicy.isToolAvailable(item.id))){const b=document.createElement('button');b.dataset.toolId=item.id;b.textContent=item[lang];if(item.newFeature)b.dataset.newFeature=item.newFeature;b.disabled=busy&&item.id!=='original'&&item.id!==activeAnalysis;if(b.disabled)b.title=t('treeLimit');b.classList.toggle('active',item.id===(original?'original':activeAnalysis));b.onclick=()=>chooseTool(item.id);d.append(b);}tree.append(d);}}
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
function settingsBundle(){return{individual:individualUI?.serialize(),automatic:automaticSettings(),composite:compositeSettings(),schema:'sherloq.settings/1',profiles:structuredClone(profiles),current:{...params},activeProfile:$('preset').value,...(energyUI?{energy:energyUI.bundle()}:{}),preferences:{allSliders:host.getAllSliders?.()??($('all-sliders')?.checked===true),highlightNewFeatures:$('highlight-new-features').checked,elaMode,theme,language:lang,layout:layouts.mode,computeProfile:$('compute-profile').value,navigationMode:$('navigation-mode').value||'auto',regionMode:$('zone-mode').value,favorite:$('favorite').getAttribute('aria-pressed')==='true',showZones:$('show-zones').checked,toolsVisible:!$('app').classList.contains('tools-hidden'),inspectorVisible:!$('inspector').hidden}};}
function persistSettings(){if(destroyed)return true;if(!settingsReady)return true;return localSet('settings',settingsBundle());}
function applySettings(v){
 stop();invalidate();individualUI?.restore(v.individual);loadAutomaticSettings(v.automatic);const composite=v.composite||{quality:0,stage:'map',view:'map'};for(const key of ['quality','stage','view'])$('composite-'+key).value=composite[key];energyUI?.load(v.energy);profiles=v.profiles;params=v.current;const q=v.preferences;setElaMode(q.elaMode??'classic');if($('all-sliders'))$('all-sliders').checked=q.allSliders!==false;hoverSliders?.setEnabled(q.allSliders!==false);$('highlight-new-features').checked=q.highlightNewFeatures===true;applyHighlights();theme=q.theme;lang=q.language;
 $('compute-profile').value=q.computeProfile;$('navigation-mode').value=q.navigationMode||'auto';$('zone-mode').value=q.regionMode;$('show-zones').checked=q.showZones;
 $('favorite').setAttribute('aria-pressed',String(q.favorite));$('app').classList.toggle('tools-hidden',!q.toolsVisible);$('toggle-tools').setAttribute('aria-pressed',String(q.toolsVisible));
 $('inspector').hidden=!q.inspectorVisible;$('toggle-inspector').setAttribute('aria-expanded',String(q.inspectorVisible));
 layouts.set(q.layout);renderProfiles();$('preset').value=v.activeProfile;syncParams();translate();queueAnalysis();
}
function applyHighlights(){$('app').classList.toggle('highlight-new-features',$('highlight-new-features').checked);}
if($('all-sliders'))$('all-sliders').onchange=()=>{hoverSliders?.setEnabled($('all-sliders').checked);persistSettings();};
$('highlight-new-features').onchange=()=>{applyHighlights();persistSettings();};
function downloadSettings(){exportJSON({...settingsBundle(),exportedAt:new Date().toISOString()},settingsFilename());}
layouts=createWindowLayout({document,getSource:()=>sourceRegionComparison??source,getNavigationMode:()=>$('navigation-mode').value,onResize:()=>{fit();draw();}});
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
 try{if(file.size>2*1024**2)throw new Error('JSON > 2 MiB');const original=JSON.parse(await file.text()),recovery=recoverSettings(original,{fallback:settingsBundle()}),rescue=await capturePreferenceBackup();rescue.importedSource=original;await downloadPreferenceBackup(document,rescue,{download});pendingSettings=recovery.value;$('import-summary').textContent=t('profileCount')+' '+(pendingSettings.profiles.length+(pendingSettings.energy?.profiles.length||0))+(recovery.issues.length?' · '+recovery.issues.length+' '+autoText('champs conservés dans la sauvegarde de secours','fields retained in the recovery backup'):'');$('import-dialog').showModal();}
 catch(error){pendingSettings=null;status(t('error')+' · '+t('settingsRejected')+' '+error.message);}finally{$('settings-file').value='';}
};
$('confirm-import').onclick=()=>{if(!pendingSettings)return;applySettings(pendingSettings);pendingSettings=null;$('import-dialog').close();status(t(persistSettings()?'settingsRestored':'storageUnavailable'));};
$('close-all').onclick=()=>$('close-dialog').showModal();
$('confirm-close').onclick=()=>{
 persistSettings();stop();$('close-dialog').close();invalidate({preserve:false});
 individualUI?.hideResult();void individualClient?.release().catch(error=>{if(error.code!=='CANCELLED')console.warn('Tool result cleanup:',error);});
 regions=[];pointers.clear();gesture=null;draft=null;drawing=false;
 $('draw').setAttribute('aria-pressed','false');view.classList.remove('drawing');renderRegions();
 chooseTool('original');$('progress').value=0;controls();status(t('ready'));
};
if($('energy-histograms'))energyHistogramUI=createEnergyHistogramUI({root:document,document,t,onSelection:refreshEnergyHistogram});
energyUI=createEnergyUI({$,t,persist:persistSettings,changed:(calculate=true,options={})=>{if(options.cancel){clearTimeout(autoRunTimer);autoRunTimer=null;elaPreviewVersion++;elaPreviewEpoch++;elaPreviewQueued=null;elaParameterDraft=elaPreviewCommit=false;elaParameterKind=null;if(hasRetainedEnergy())void refreshEnergyView();controls();return;}if(options.intent||options.preview||options.commit){elaParameterKind='energy';beginElaParameters({newIntent:options.intent===true});if(options.preview)queueElaParameterPreview();if(calculate)commitElaParameters();return;}if(elaParameterDraft){commitElaParameters();return;}if(busy||energyViewBusy)stop();invalidate();status(t('changed'));if(calculate)queueAnalysis();},viewChanged:refreshEnergyView});
$('ela-mode').value='classic';
for(const [tabId,mode]of [['classic','classic'],['energy','scores'],['biomes','biomes']]){const tab=$('ela-tab-'+tabId);if(tab)tab.onclick=()=>{if(!tab.disabled&&elaMode!==mode){$('ela-mode').value=mode;$('ela-mode').onchange();}};}
function setElaMode(value){elaMode=validElaMode(value);energyMode=elaMode!=='classic';for(const [tabId,mode]of [['classic','classic'],['energy','scores'],['biomes','biomes']])$('ela-tab-'+tabId)?.setAttribute('aria-selected',String(elaMode===mode));$('ela-mode').value=elaMode;$('classic-controls').hidden=energyMode;$('energy-controls').hidden=!energyMode;$('energy-score-controls').hidden=elaMode!=='scores';if($('energy-ela-controls'))$('energy-ela-controls').hidden=elaMode!=='scores';$('energy-biome-controls').hidden=elaMode!=='biomes';$('energy-biome-presentation').hidden=elaMode!=='biomes';$('energy-presentation').hidden=!energyMode||compositeMode();controls();}
function setEnergyMode(enabled){setElaMode(enabled?'biomes':'classic');}
function prepareEnergyRequest(mode=elaMode){const prepared=energyUI.prepare(mode);return mode==='scores'?{...prepared,params:{...prepared.params,quality:params.quality}}:prepared;}
function retainedEnergyQualityMatches(requested){const native=lastScientificEnergy;if(!native||!Number.isInteger(native.quality)||!native.params)return false;const q=requested.quality===0?(native.params.quality===0?native.quality:null):requested.quality;return q===native.quality;}
function retainedEnergyMatches(requested,mode=elaMode){
 const native=lastScientificEnergy;if(!native||!Number.isInteger(native.quality)||native.quality<1||native.quality>100)return false;
 const stored=native.params;if(!stored)return false;const q=requested.quality===0?(stored.quality===0?native.quality:null):requested.quality;if(q!==native.quality)return false;
 const keys=['block','minimum','profile',...(requested.profile==='manual'?['histogramLow','histogramHigh','shadow','highlight']:[])];return keys.every(key=>requested[key]===stored[key]);
}
function finishElaParameters(){if(elaMode==='scores'&&elaParameterKind==='classic'){const prepared=prepareEnergyRequest();if(retainedEnergyMatches(prepared.params)){void finishEnergyEla();return;}diagnostic({level:'info',kind:'ela.energy.base.changed',operation:'ela.energy',sourceSha256:hash,previousQuality:lastScientificEnergy?.quality??null,requestedQuality:params.quality,parameters:prepared.params,state:'native-pending'});}queueAnalysis();}
async function finishEnergyEla(){
 if(elaPreviewBusy||energyViewBusy||busy||!elaPreviewCommit||!resultMeta)return;
 const prepared=prepareEnergyRequest(),rev=revision,epoch=elaPreviewEpoch,id=lastScientificEnergy.id,elaParams={...params};energyViewBusy=true;controls();status(t('energyRendering'));
 let retry=false,superseded=false;diagnostic({level:'info',kind:'ela.energy.presentation.commit',operation:'ela.energy',sourceSha256:hash,baseResultId:id,elaParameters:elaParams,scientificParameters:prepared.params,state:'rendering'});
 try{const answer=await request('commit-energy-ela',{imageId,resultId:id,params:elaParams,energyParams:prepared.params,presentation:prepared.presentation});if(rev!==revision||epoch!==elaPreviewEpoch||!elaPreviewCommit){superseded=rev===revision&&elaPreviewCommit;return;}
  retireResult();result=remoteSurface(answer.display);elaParameterDraft=false;elaPreviewCommit=false;elaParameterKind=null;energyPreviewed=false;resultMeta.ui.elaMode=elaMode;resultMeta.ui.elaParameters=elaParams;resultMeta.ui.elaBaseSource='classic';diagnostic({level:'info',kind:'ela.energy.presentation.commit',operation:'ela.energy',sourceSha256:hash,baseResultId:id,elaParameters:elaParams,state:'done',reusedNativeEnergy:true,nativeRun:false});resultMeta.ui.presentation={...prepared.presentation,...answer.presentation};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('layer').value=$('app').classList.contains('original-mode')?'source':'result';draw();status(t('done'));
 }catch(error){if(rev===revision){if(epoch!==elaPreviewEpoch||!elaPreviewCommit)superseded=elaPreviewCommit;else if(error.code==='ENERGY_BASE_CHANGED')retry=true;else status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+error.message);}}
 finally{if(rev===revision){energyViewBusy=false;controls();if(!elaProvisional()){for(const name of ['export-png','export-report','energy-npz','energy-json'])$(name).disabled=false;}if(superseded&&elaPreviewCommit)finishElaParameters();else if(retry)queueAnalysis();else if(energyViewQueued&&!elaParameterDraft)void refreshEnergyView({preview:energyViewPreview});else if(elaPreviewQueued)void pumpElaParameterPreview();}}
}
function hasRetainedEnergy(){return !!worker&&loaded&&!!lastScientificEnergy&&!!resultMeta&&(resultMeta.operation==='ela.energy'||resultMeta.provenance?.operation==='ela.energy');}
function refreshEnergyHistogram(){
 if(!energyHistogramUI||elaMode!=='biomes'||!hasRetainedEnergy()||busy||elaProvisional())return;
 const selection=energyHistogramUI.selected(),key=resultMeta.id+'|'+JSON.stringify(selection);
 if(key===energyHistogramKey){energyHistogramUI.markers(prepareEnergyRequest('biomes').params,resultMeta.data?.metadata);return;}
 energyHistogramQueued={version:++energyHistogramVersion,id:resultMeta.id,imageId,revision,selection};
 if(energyHistogramJob)return;
 const job={};energyHistogramJob=job;controls();
 void(async()=>{let failure=null;try{while(energyHistogramQueued){const ticket=energyHistogramQueued;energyHistogramQueued=null;
   const selected=Object.fromEntries(Object.entries(ticket.selection).filter(([,value])=>value!==null&&value!==undefined));
   const answer=await request('energy-histogram',{resultId:ticket.id,imageId:ticket.imageId,...selected});
   if(ticket.version!==energyHistogramVersion||ticket.revision!==revision||ticket.imageId!==imageId||ticket.id!==resultMeta?.id||elaMode!=='biomes'||elaProvisional())continue;
   if(answer.histogram?.source?.resultId!==ticket.id||answer.histogram.source.imageId!==imageId||answer.histogram.source.sourceSha256!==hash)throw new EngineError('INVALID_INPUT','Native histogram differs from its source or analysis.');
   energyHistogramUI.update(answer.histogram);energyHistogramUI.markers(prepareEnergyRequest('biomes').params,resultMeta.data?.metadata);energyHistogramKey=ticket.id+'|'+JSON.stringify(energyHistogramUI.selected());
   diagnostic({level:'info',kind:'ela.histogram.native',operation:'ela.energy',sourceSha256:hash,resultId:ticket.id,selection:answer.histogram.selection,counts:{scores:answer.histogram.scores.count,reference:answer.histogram.reference?.count??0},native:true});
  }}catch(error){if(error.code!=='CANCELLED'){failure=error;diagnostic({level:'error',kind:'ela.histogram.error',operation:'ela.energy',error:serializeEngineError(error)});}}
  finally{if(energyHistogramJob===job){energyHistogramJob=null;controls();if(failure&&$('energy-histogram-status'))$('energy-histogram-status').textContent=t('error')+' · '+failure.message;if(energyHistogramQueued)refreshEnergyHistogram();}}
 })();
}
$('ela-mode').onchange=()=>{const next=validElaMode($('ela-mode').value);if(next===elaMode){setElaMode(next);return;}if(elaParameterDraft)elaPreviewEpoch++;const target=next!=='classic'&&lastScientificEnergy?prepareEnergyRequest(next):null;if(target&&elaParameterDraft&&!elaPreviewCommit&&energyMode&&next!=='classic'&&retainedEnergyQualityMatches(target.params)){setElaMode(next);persistSettings();void refreshEnergyView();return;}const reuse=next!=='classic'&&hasRetainedEnergy()&&retainedEnergyMatches(target.params,next);if(reuse){setElaMode(next);persistSettings();void refreshEnergyView();}else{invalidate();setElaMode(next);persistSettings();queueAnalysis();}};
$('energy-run').onclick=$('energy-score-run').onclick=run;$('energy-cancel').onclick=$('energy-score-cancel').onclick=$('cancel').onclick;
$('energy-save').onclick=()=>{$('profile-name').value=energyUI.selectedName;$('save-dialog').showModal();$('profile-name').focus();};
async function refreshEnergyView(options={}){
 if(elaParameterDraft){if(elaParameterKind==='classic'&&elaPreviewCommit){energyViewQueued=true;energyViewPreview=options.preview??null;energyViewRevision++;}else queueElaParameterPreview();return;}if(!energyMode||!resultMeta||busy)return;if(!hasRetainedEnergy()){status(t('energyRecompute'));return;}energyViewQueued=true;energyViewPreview=options.preview??null;energyViewRevision++;
 if(energyViewBusy)return;energyViewBusy=true;controls();const rev=revision,previousSize=processedSurface()??source;let previousWidth=previousSize?.width,previousHeight=previousSize?.height;
 try{retireResult();draw();status(t('energyRendering'));while(energyViewQueued&&rev===revision&&resultMeta){energyViewQueued=false;const viewRev=energyViewRevision,presentation=energyUI.presentation(elaMode),id=resultMeta.id,preview=energyViewPreview?{...energyViewPreview,...(elaAdaptiveFeedback?{adaptiveFeedback:elaAdaptiveFeedback}:{})}:null;
 $('energy-npz').disabled=true;$('energy-json').disabled=true;$('export-png').disabled=true;$('export-report').disabled=true;
 let answer;try{answer=await request('view-energy',{resultId:id,presentation,...(preview?{preview}:{})});}catch(error){if(rev!==revision)return;if(viewRev!==energyViewRevision||elaParameterDraft)continue;throw error;}if(rev!==revision)return;if(viewRev!==energyViewRevision||elaParameterDraft)continue;
 const draft=!!preview||answer.display.preview===true;if(!draft&&energyUI.observePresentation?.(answer.presentation)===true){energyViewQueued=true;energyViewPreview=null;energyViewRevision++;continue;}
 retireResult();result=remoteSurface(answer.display);if(draft)observePreviewPresentation(result,answer.metrics??answer.draft);energyPreviewed=draft;if(!energyPreviewed){resultMeta.ui.elaMode=elaMode;resultMeta.ui.presentation={...presentation,...answer.presentation};$('provenance').textContent=JSON.stringify(resultMeta,null,2);}$('layer').value=$('app').classList.contains('original-mode')?'source':'result';if(result.width!==previousWidth||result.height!==previousHeight)fit();previousWidth=result.width;previousHeight=result.height;draw();status(t(energyPreviewed?'energyDraftView':'done'));
 }}catch(e){if(rev===revision){retireResult(false);energyPreviewed=false;$('layer').value='source';draw();status(e.code==='CANCELLED'?t('cancelled'):t('error')+' · '+e.message);}}finally{if(rev===revision){energyViewBusy=false;controls();$('energy-npz').disabled=!hasRetainedEnergy()||elaProvisional();$('energy-json').disabled=!hasRetainedEnergy()||elaProvisional();$('export-png').disabled=!result||elaProvisional();$('export-report').disabled=!resultMeta||elaProvisional();draw();if(!energyPreviewed&&!elaProvisional())refreshEnergyHistogram();if(elaPreviewCommit)finishElaParameters();else if(elaPreviewQueued)void pumpElaParameterPreview();else if(energyViewQueued&&!elaParameterDraft)void refreshEnergyView({preview:energyViewPreview});}}
}
async function exportEnergy(format){
 if(!energyMode||!resultMeta||busy||elaProvisional())return;if(!hasRetainedEnergy()){status(t('energyRecompute'));return;}
 const rev=revision,id=resultMeta.id,controller=new AbortController();let sink;
 exportController=controller;busy=true;controls();status(t('energyExporting'));
 try{
  sink=await createExportSink({memoryBudgetBytes:uiRGBBudget,signal:controller.signal,mime:format==='npz'?'application/zip':'application/json'});
  await request('export-energy',{resultId:id,format},bytes=>sink.write(bytes));
  if(rev!==revision||controller.signal.aborted){await sink.abort();return;}
  const artifact=await sink.finish();await download(artifact,'SHERLOQ-energie.'+format,{signal:controller.signal});status(t('energyExported'));
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
 busy=true;controls();invalidate();const rev=revision,sourceRegionOwner=sourceRegionTaskIdentity(),abort=new AbortController();compositeAbort=abort;status(t('compositeLoading'));$('progress').value=0;draw();
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
  const submitted=await bindSourceRegionTask({});if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;const output=await compositeClient.analyze(fileInput,parameters,{...submitted,signal:abort.signal,backend:'auto',onProgress:event=>{if(rev!==revision)return;$('progress').value=Math.max(0,Math.min(1,event.fraction||0));status(t('running')+' '+event.phase);}});
  if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;
  await acknowledgeSourceRegionTask(submitted,sourceRegionOwner);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;adoptSourceRegionPresentation(output,submitted,sourceRegionOwner);compositeResult=output.result;resultMeta={...output.metadata,parameters,fields:output.result.fields,ui:{version:'0.20.0',operation:'composite',engineCommit:compositeClient.deployment.engineCommit,sourceSha256:hash}};
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
  const artifact=await sink.finish();await download(artifact,'SHERLOQ-composite-covariance-floor-v1.npz',{signal:abort.signal});status(t('energyExported'));
 }catch(error){await sink?.abort();if(rev===revision)status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+error.message);}
 finally{if(output)await client.releaseExport(output.id).catch(()=>{});if(rev===revision){exportController=null;compositeAbort=null;busy=false;controls();}}
};
initAutomaticControls();
// Generic parameter drafts retain the scientific result until one native
// replacement commits. Their owner is independent from the engine run queue.
parameterSession=createParameterPreviewSession({
 // Brief clicks coalesce into a native calculation and never paint a proxy.
 schedule:(finish,event)=>setTimeout(finish,event.continuous?0:120),
 preview:async(event,{signal})=>{
  if(!fileInput||busy||event.toolId!==activeAnalysis||event.previewHandled||event.policy?.final==='explicit')return null;
  const owner=sourceRegionTaskIdentity(),rev=revision,submitted=await bindSourceRegionTask({toolId:event.toolId,operation:event.operation,params:event.params,view:event.view});if(signal.aborted||!sourceRegionTaskIsCurrent(owner)||sourceRegionsStale)return null;const client=await ensureIndividualClient();if(signal.aborted||!sourceRegionTaskIsCurrent(owner))return null;
  if(!client.source){const descriptor=await client.load({id:imageId,blob:fileInput});if(signal.aborted||rev!==revision)return null;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});}
  return client.previewParameters(submitted,{field:event.field,extras:event.extras,signal});
 },
 show:(answer,event)=>{
  if(event.toolId!==activeAnalysis||destroyed||sourceRegionsStale)return;
  if(answer.sourceRegionDomain)sourceRegionDisplayDomain=structuredClone(answer.sourceRegionDomain);
  diagnostic({level:'info',kind:'parameter-preview.frame',operation:event.operation,field:event.field,exact:false,metrics:answer.metrics});
  if(answer.pixels){retireResult();result=createPreviewSurface({...answer.pixels,preview:true,logicalWidth:answer.pixels.logicalWidth??answer.logicalWidth??source?.width,logicalHeight:answer.pixels.logicalHeight??answer.logicalHeight??source?.height},{document});observePreviewPresentation(result,answer.metrics);$('layer').value='result';draw();}
  individualUI.renderParameterPreview?.(answer);status(autoText('Aperçu rapide','Quick preview'));controls();
 },
 commit:async(event,{isCurrent=()=>true}={})=>{
  if(!fileInput||event.toolId!==activeAnalysis||destroyed)return;
  persistSettings();translateTaskActions();diagnostic({level:'info',kind:'parameter-preview.commit',operation:event.operation,field:event.field,parameters:event.params});
  // A committed setting is a native calculation intention, including fields
  // without a provisional proxy. The initial Calculate command stays available.
  parameterCommitting=true;
  try{
   const client=individualClient,owner=sourceRegionTaskIdentity(),submitted=await bindSourceRegionTask({toolId:event.toolId,operation:event.operation,params:event.params,view:event.view});if(!isCurrent()||!sourceRegionTaskIsCurrent(owner))return;const next=client&&await client.updateRetainedParameters(submitted,{isCurrent:()=>isCurrent()&&sourceRegionTaskIsCurrent(owner)});
   if(!isCurrent())return;
   if(next){adoptSourceRegionPresentation(next,submitted,owner);await acknowledgeSourceRegionTask(submitted,owner);if(!isCurrent()||!sourceRegionTaskIsCurrent(owner))return;await individualUI.render(next);if(!isCurrent())return;resultMeta={id:next.id,operation:next.operation,status:next.status,provenance:next.provenance,metrics:next.metrics};$('provenance').textContent=JSON.stringify(resultMeta,null,2);status(t('done'));}
   else await run();
  }finally{parameterCommitting=false;}
 },
 restore:()=>{individualUI?.restorePresentation?.();},
 state:({pending})=>{if(!individualUI||destroyed)return;controls();if(!pending&&!busy){$('export-png').disabled=!result||!!result.previewOnly||parameterProvisional();$('export-report').disabled=!resultMeta;}host.changed?.();},
 error:(error,context)=>{diagnostic({level:'warning',kind:'parameter-preview.'+context.phase,operation:activeAnalysis,code:error.code,message:error.message});if(context.phase==='final'){discardIndividualPresentation();resultMeta={operation:activeAnalysis,status:'error',error:errorEvidence(error),parameters:context.event?.params};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;status(t('error')+' · '+errorText(error,lang));}}
});
individualUI=createToolWorkspace({document,language:()=>lang,getClient:ensureIndividualClient,getNavigationMode:()=>$('navigation-mode').value,getSourceContext:()=>({width:source?.width,height:source?.height,byteLength:fileInput?.size}),run,cancel:()=>{parameterSession.reset('cancel',{restoreResult:false});individualCancelled=true;regionController?.cancel();pointerLoupe?.cancelImage();individualClient?.cancel();individualUI?.hideResult();},activity:individualActivity,showSurface:showIndividualSurface,onLoupe:()=>host.openLoupeSettings?.(),download,notify:status,onInteractive:event=>{if(parameterCommitting&&event.phase==='cancel'&&event.reason==='result-change')return;if(event.phase==='cancel'&&event.reason!=='unchanged')parameterSession.reset(event.reason,{restoreResult:false});else parameterSession.handle(event);},onSettings:({presentationOnly=false}={})=>{persistSettings();controls();translateTaskActions();if(!presentationOnly)queueAnalysis();if(activeAnalysis==='inspection.magnifier')host.onLoupeContextChange?.();}});
regionParent=host.regionParent??document.createElement('div');regionParent.className='individual-region-owner';if(!host.regionParent)$('inspector').prepend(regionParent);
regionController=(host.regionControllerFactory??createIndividualRegionController)({document,parent:regionParent,language:()=>lang,source:()=>fileInput&&source?{blob:fileInput,name:fileInput.name,id:imageId,width:source.width,height:source.height,sourceSha256:hash}:null,operation:()=>activeAnalysis,getClient:ensureIndividualClient,getSourceDomain:analysisSourceDomain,computeProfile:()=>$('compute-profile').value,navigationMode:()=>$('navigation-mode').value,
 onHighlight:()=>draw(),onPresentation:display=>{if(display&&individualMode()){individualUI.setOriginal(false);showIndividualSurface(display);}else if(source){$('layer').value='source';individualUI?.setOriginal(true);draw();}},
 onChange:({scopeChanged,preparationOnly}={})=>{if(scopeChanged){if(!preparationOnly)sourceRegionsLocalOverride=true;clearTimeout(autoRunTimer);autoRunTimer=null;regions=regionController.rectangles();renderRegions();$('layer').value='source';individualUI?.setOriginal(true);if(resultMeta){resultMeta.ui={...resultMeta.ui,pendingScientificScope:regionController.scope?.fingerprint};$('provenance').textContent=JSON.stringify(resultMeta,null,2);}status(autoText('Zones modifiées. Cliquez sur Calculer pour les appliquer.','Regions edited. Click Calculate to apply them.'));draw();}host.changed?.();},
 onError:error=>status(t('error')+' · '+error.message),onProgress:event=>status(autoText('Détection des zones','Detecting regions')+' · '+(event.phase??'')),});
try{const stored=localGet('settings');if(stored)applySettings(stored);else{const old=localGet('classicPreset');if(old){profiles=[{id:'profile-legacy',name:t('savedProfile'),operation:'ela.classic',params:validParams(old)}];renderProfiles();}}}catch(error){console.warn('SHERLOQ settings ignored:',error.message);}
const onFeatureChange=()=>{renderToolTree();if(!busy)individualUI?.refreshFeatures?.();controls();};window.addEventListener('local-feature-change',onFeatureChange);
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
 const availableForge=localFeaturePolicy.isTaskAvailable({operation:'m2.forgeryscope',params:{profile:'auto'}}),availableD2=localFeaturePolicy.isTaskAvailable({operation:'ai.clones.d2prl'});
 for(const option of $('automatic-source').options){const unavailable=option.value==='Forgeryscope Auto'&&!availableForge||option.value==='D2PRL'&&!availableD2;option.hidden=unavailable;option.disabled=unavailable;}
 $('automatic-branch').closest('label').hidden=!availableForge;$('automatic-d2-minimum').closest('label').hidden=!availableD2;
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
 const states={pending:autoText('En attente','Pending'),running:autoText('En cours','Running'),done:autoText('Terminé','Done'),'feature-uninstalled':autoText('Désinstallé volontairement · non exécuté','Intentionally uninstalled · not executed'),failed:autoText('Échec','Failed'),cancelled:autoText('Suspendu','Paused'),'waiting-memory':autoText('Attend de la mémoire','Waiting for memory')};
 $('automatic-groups').replaceChildren();
 for(const [id,group]of Object.entries(value.groups)){
  const row=document.createElement('li');row.textContent=names[id]+' — '+(states[group.state]||group.state)+(group.stage?' · '+group.stage:'')+(group.iteration!==undefined?' · '+autoText('itération ','iteration ')+group.iteration:'')+(group.total?' · '+Math.round(100*group.completed/group.total)+'% '+autoText('de cette sous-étape','of this sub-step'):'')+(group.error?' · '+group.error.code+' : '+group.error.message:'');$('automatic-groups').append(row);
 }
}
async function runAutomatic(resume=false){
 if(busy||!fileInput)return;clearTimeout(autoRunTimer);autoRunTimer=null;
 busy=true;controls();const rev=revision,sourceRegionOwner=sourceRegionTaskIdentity();status(autoText('Préparation de l’analyse automatique…','Preparing automatic analysis…'));$('progress').removeAttribute('value');
 try{
  await automaticCleanup;await compositeCleanup;if(rev!==revision)return;
  const client=await ensureAutomaticClient();if(rev!==revision)return;
  if(!loaded||!client.source){const descriptor=await client.load({id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});if(!zoom)fit();draw();}
  if(!resume&&regionController?.active())await regionController.prepareForCalculation();
  if(!resume){retireResult();resultMeta=null;$('provenance').textContent='';$('export-png').disabled=true;$('export-report').disabled=true;automaticProgress=createAutomaticProgress(activeAnalysis==='analysis.complete');automaticStarted=Date.now();automaticSnapshot=automaticProgress.snapshot();}
  clearInterval(automaticClock);automaticClock=setInterval(renderAutomaticProgress,1000);renderAutomaticProgress();
  let output;
  if(resume)output=await client.resume();
  else{const selection=automaticSelection(source.width,source.height,regions.filter(r=>r.kind!=='exclusion'),$('automatic-scope').value);let task={id:'automatic-'+crypto.randomUUID(),imageId,operation:activeAnalysis,backend:'auto',params:{...(selection?{selection}:{}),maxConcurrent:5,d2Minimum:Number($('automatic-d2-minimum').value)}};task=regionController?.active()?regionController.task(task):task;task=await bindSourceRegionTask(task);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;output=await client.run(task);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;await acknowledgeSourceRegionTask(task,sourceRegionOwner);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;adoptSourceRegionPresentation(output,task,sourceRegionOwner);}
  if(rev!==revision)return;
  output=await client.update(automaticViewActions());if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;
  if(output.sourceRegionDomain)adoptSourceRegionPresentation(output,{sourceRegionDomain:output.sourceRegionDomain},sourceRegionOwner);
  automaticEvent({phase:'automatic-state',state:output.data.state});
  resultMeta=automaticReport(output,automaticProgress.snapshot(),client.deployment);$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;
  await showAutomatic();if(rev!==revision)return;
  const failed=automaticAnalysisIncomplete(output);
  status(failed?autoText('Analyse partielle : tous les groupes n’ont pas abouti. Les résultats acquis restent exportables.','Partial analysis: some groups did not complete. Completed results remain exportable.'):autoText('Analyse automatique terminée.','Automatic analysis complete.'));
  $('progress').value=1;
 }catch(error){if(rev===revision){
  if(automaticClient?.checkpoint){const state=automaticClient.checkpoint.state;automaticEvent({phase:'automatic-state',state});}
  if(error.imagesCleared){loaded=false;source?.close?.();source=null;}
  status(error.code==='CANCELLED'?(automaticClient?.checkpoint?autoText('Analyse suspendue. Reprendre conserve le travail acquis.','Analysis paused. Resume preserves completed work.'):autoText('Arrêt avant la création d’un point de reprise. Relancer pour commencer.','Stopped before a resume point was created. Run to start again.')):t('error')+' · '+(error.code||'')+' '+error.message);
 }}finally{clearInterval(automaticClock);automaticClock=null;if(rev===revision){busy=false;controls();draw();}}
}
async function pauseAutomatic(){if(!automaticClient)return;status(autoText('Suspension en cours : conservation des étapes acquises…','Pausing: preserving committed work…'));$('automatic-pause').disabled=true;await automaticClient.pause();controls();}
async function showAutomatic({preview=false}={}){
 const client=automaticClient;if(!client?.result)return;
 const token=++automaticDisplayRevision,rev=revision,layer=$('automatic-view').value;
 let display=await client.display(layer,{overlay:layer==='corroboration',opacity:Number($('automatic-opacity').value)/100});
 if(preview){const plan=displayAdaptive.plan({key:'automatic/'+layer,width:display.width,height:display.height,maxSide:2048,maxPixels:1024**2});display={...display,previewStep:plan.step,adaptivePreview:{token:plan.token}};}
 if(token!==automaticDisplayRevision||rev!==revision)return;
 retireResult();result=remoteSurface(display);$('layer').value='result';$('export-png').disabled=preview||automaticPresentationDraft;draw();

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
  const artifact=await sink.finish();await download(artifact,client.result?.status==='ok'?'SHERLOQ-automatic.npz':'SHERLOQ-automatic-partial.npz');status(t('done'));
 }catch(error){await sink?.abort();if(rev===revision)status(t('error')+' · '+error.message);}finally{if(rev===revision){busy=false;controls();}}
}
function initAutomaticControls(){
 $('automatic-scope').value='detected';$('automatic-source').value='overlay';$('automatic-view').value='corroboration';$('automatic-relation').value='within';$('automatic-branch').value='';$('automatic-d2-minimum').value=500;$('automatic-opacity').value=70;
 $('tab-automatic').onclick=()=>chooseTool('analysis.complete');$('automatic-run').onclick=()=>runAutomatic(false);$('automatic-resume').onclick=()=>runAutomatic(true);$('automatic-pause').onclick=pauseAutomatic;$('automatic-export').onclick=exportAutomatic;
 $('automatic-scope').onchange=queueAnalysis;
 $('automatic-progress-export').onclick=()=>exportJSON(automaticReport(automaticClient?.result,automaticProgress?.snapshot(),automaticClient?.deployment||{}),'SHERLOQ-avancement.json');
 for(const id of ['automatic-source','automatic-relation','automatic-branch','automatic-d2-minimum'])$(id).onchange=updateAutomaticView;
 $('automatic-view').onchange=()=>showAutomatic().catch(error=>status(t('error')+' · '+error.message));
 const opacity=$('automatic-opacity');automaticGesture=bindInteractiveControl(opacity,{read:()=>({valid:opacity.value!==''&&opacity.checkValidity(),value:Number(opacity.value)}),begin:()=>{automaticPresentationDraft=true;automaticGestureVersion++;controls();},preview:()=>{void showAutomatic({preview:true}).catch(error=>status(t('error')+' · '+error.message));},commit:()=>{const token=++automaticGestureVersion;persistSettings();void showAutomatic().catch(error=>status(t('error')+' · '+error.message)).finally(()=>{if(token!==automaticGestureVersion)return;automaticPresentationDraft=false;controls();$('export-png').disabled=!result;});},cancel:event=>{automaticGestureVersion++;automaticPresentationDraft=false;if(event.reason==='unchanged')void showAutomatic();controls();}});
 bindSliderReset(opacity,validAutomaticSettings().opacity,()=>{automaticGesture.input();automaticGesture.finish('reset');});
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
 if(!individualOpening){const epoch=individualEpoch;individualOpening=(async()=>{await individualCleanup;const client=await createToolClient({computeProfile:$('compute-profile').value,...(host.engineFactory?{engineFactory:host.engineFactory}:{}),onInvalidated:({resultLost})=>{if(epoch!==individualEpoch||!resultLost)return;discardIndividualPresentation();resultMeta={...resultMeta,status:'unavailable',error:{code:'WORKER_RECREATED',message:autoText('Le moteur a été recréé. L’image originale est conservée ; ce résultat doit être recalculé.','The engine was recreated. The original is retained; this result must be recalculated.')}};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-png').disabled=true;status(resultMeta.error.message);controls();draw();},onProgress:event=>{if(epoch!==individualEpoch||individualComputing?.revision!==revision)return;lastIndividualProgress={phase:event.phase,completed:event.completed,total:event.total};const f=event.fraction??(event.total?event.completed/event.total:0);$('progress').value=Math.max(0,Math.min(1,f||0));status(isExtensionTool(activeAnalysis)?extensionProgressText(event,lang):t('running')+' · '+event.phase+(event.total?' · '+event.completed+'/'+event.total:''));}});if(epoch!==individualEpoch){await client.dispose();throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});}return individualClient=client;})().finally(()=>individualOpening=null);}
 return individualOpening;
}
async function individualRequest(action,payload){const client=await ensureIndividualClient();if(action==='capabilities')return client.capabilities();if(action==='load')return client.load(payload);if(action==='read-display')return {pixels:await client.readTile(payload.display,payload.tile)};if(action==='read-window')return {pixels:await client.readWindow(payload.display,payload.rect)};throw Error('Unsupported tool action: '+action);}
function discardIndividualPresentation(){
 individualUI?.invalidateResult();retireResult(false);presentedSurface=null;$('layer').value='source';$('export-png').disabled=true;
 // The original may still need its first viewport. Clear the old canvas now,
 // so it cannot be mistaken for a result belonging to this failed operation.
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.restore();
}
function showIndividualSurface(display){
 const rev=revision,operation=resultMeta?.operation??individualUI.operation(),view=structuredClone(individualUI.view());let next;
 retireResult();next=remoteSurface(display,error=>{
  // A failed viewport must not keep showing an older calculation. Reads may
  // finish after a layer change or cancellation; only their current owner acts.
  if(destroyed||rev!==revision||result!==next||individualCancelled)return;
  if(display.responsePreview){
   // Failure of a disposable preview cannot invalidate retained scientific data.
   next.close?.();result=null;$('layer').value=previousPresentation?'result':'source';
   diagnostic({level:'info',kind:'parameter-preview.unavailable',operation,code:error.code,message:error.message});
   status(autoText('Aperçu indisponible ; le résultat natif est conservé. Relâchez pour terminer.','Preview unavailable; the native result is retained. Release to finish.'));controls();draw();return;
  }
  const evidence=errorJournal.record(error,{operation,phase:'display-read',surfaceId:display.id,surfaceRevision:display.revision,width:display.width,height:display.height,sourceSha256:hash,view});
  const calculationStatus=resultMeta?.status;discardIndividualPresentation();
  resultMeta={...resultMeta,operation,status:'error',calculationStatus,phase:'display',error:evidence.error,context:evidence.context};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;translateTaskActions();status(t('error')+' · '+errorText(error,lang));controls();draw();
 });observePreviewPresentation(next,{adaptivePreview:display.adaptivePreview});result=next;$('layer').value=$('app').classList.contains('original-mode')?'source':'result';$('export-png').disabled=!!display.responsePreview||!!parameterSession?.pending;if(source&&(display.width!==source.width||display.height!==source.height))fit();else draw();
}
async function runIndividual(){
 if(!parameterCommitting)parameterSession?.reset('calculate',{restoreResult:false});
 clearTimeout(autoRunTimer);autoRunTimer=null;if(busy||!fileInput||activeAnalysis==='file.similarity')return;if(localMagnifier()&&!await sourceDomainRestricted()){refreshLocalMagnifier();return;}
 const form=$('tool-form');if(!form.reportValidity())return;
 individualCancelled=false;lastIndividualProgress=null;busy=true;controls();const rev=revision,sourceRegionOwner=sourceRegionTaskIdentity(),computation={revision:rev};individualComputing=computation;let submitted;status(t('running'));$('progress').value=0;individualUI.invalidateResult({preserve:true});retireResult();resultMeta=null;$('provenance').textContent='';$('export-png').disabled=true;$('export-report').disabled=true;
 try{await individualCleanup;await automaticCleanup;await compositeCleanup;if(rev!==revision)return;
 let output;
 if(activeAnalysis==='inspection.magnifier'&&!individualUI.params(regions).bounds&&!await sourceDomainRestricted()){
  const effects=loupeEffectsContext(),parameters=individualUI.params(),prepared=await pointerLoupe.prepareImage(comparisonSurface(),effects,scheduleDraw);
  if(individualComputing===computation)individualComputing=null;
  if(rev!==revision||individualCancelled){prepared.close();throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});}
  result=prepared;output={operation:activeAnalysis,status:'ok',provenance:{params:parameters,effects,sourceSha256:hash},metrics:prepared.metrics};
  resultMeta={...output,ui:{presentation:'shared prepared loupe image'}};individualUI.renderPrepared(output);$('layer').value='result';$('export-png').disabled=false;
 }else{
 const client=await ensureIndividualClient();if(!client.source){const descriptor=await client.load({id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});}
 individualUI.setFile(fileInput);
 await syncInheritedSourceRegions();if(regionController?.active())await regionController.prepareForCalculation();if(individualCancelled)throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});
 const analysisRegions=regions.filter(r=>r.kind!=='exclusion');submitted={id:'tool-'+crypto.randomUUID(),imageId,operation:individualUI.operation(),params:individualUI.params(analysisRegions,{scientificScope:regionController?.scope}),backend:individualUI.backend(),view:individualUI.view(),regions:individualUI.taskRegions(analysisRegions,{scientificScope:regionController?.scope})};submitted=regionController?.active()?regionController.task(submitted):submitted;submitted=await bindSourceRegionTask(submitted);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;output=await client.run(submitted,{...individualUI.extras,...(submitted.sourceRegionDomain?{sourceRegionDomain:submitted.sourceRegionDomain}:{})});if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;await acknowledgeSourceRegionTask(submitted,sourceRegionOwner);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;adoptSourceRegionPresentation(output,submitted,sourceRegionOwner);if(individualComputing===computation)individualComputing=null;
 const subimageSelection=activeAnalysis==='ai.clones.d2prl'&&submitted.params.selectionPresent?individualSubimageProvenance(regions,{width:source?.width,height:source?.height,sourceSha256:hash}):null;
 resultMeta={id:output.id,operation:output.operation,status:output.status,provenance:output.provenance,metrics:output.metrics,...(isExtensionTool(output.operation)?{data:output.data}:{}),...(subimageSelection?{ui:{subimageSelection,requestedRegions:structuredClone(submitted.regions),selectionPresent:submitted.params.selectionPresent}}:{})};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;
 await individualUI.render(output);if(regionController?.active())regionController.accept(output);
 }
 $('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;
 if(rev!==revision||resultMeta?.phase==='display'&&resultMeta.status==='error')return;if(individualCancelled)throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});individualUI.setOriginal(comparingOriginal||drawing||localMagnifier()||$('app').classList.contains('original-mode'));$('progress').value=1;if(localMagnifier())refreshLocalMagnifier();else status(output.status==='no-regions'?autoText('Aucune région correspondante.','No matching regions.'):t('done'));
 }catch(error){if(rev===revision){discardIndividualPresentation();let diagnostic;if(error.code!=='CANCELLED'){const parameters=submitted?.params??individualUI.serialize()[activeAnalysis];diagnostic=errorJournal.record(error,{operation:submitted?.operation??individualUI.operation(),algorithm:parameters?.algorithm??parameters?.profile,parameters,view:individualUI.view(),backend:individualUI.backend(),width:source?.width,height:source?.height,progress:lastIndividualProgress});translateTaskActions();}resultMeta={operation:individualUI.operation(),status:error.code==='CANCELLED'?'cancelled':'error',originalSha256:hash,error:diagnostic?.error??errorEvidence(error),...(diagnostic?{context:diagnostic.context}:{})};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+(error.code||'')+' '+error.message);}}
 finally{if(individualComputing===computation)individualComputing=null;if(rev===revision){busy=false;controls();draw();if(pendingMagnifier)queueAnalysis();}}
}

 function translateTaskActions(){
  const calculate=$('task-run'),zones=$('task-zones'),detect=$('task-auto-zones'),errors=$('task-errors');
  if(errors){errors.hidden=!errorJournal.length;errors.textContent=autoText('Diagnostic','Diagnostics')+' ('+errorJournal.length+')';errors.title=autoText('Lire ou exporter les dernières erreurs de cet outil.','Read or export recent errors from this tool.');}
  if(calculate){calculate.textContent=individualMode()?autoText('Calculer','Calculate'):t('run');calculate.title=autoText('Lancer ou recalculer avec les réglages et les zones actuels.','Run or recalculate with the current settings and regions.');}
  if(zones){zones.textContent=regionController?.active()?autoText('Modifier les zones','Edit regions'):drawing?autoText('Terminer le tracé','Finish drawing'):t('draw');zones.title=autoText('Cliquez puis glissez sur l’image pour ajouter une zone. Échap termine le tracé ; Calculer lance ensuite l’analyse.','Click and drag on the image to add a region. Escape ends drawing; Calculate then starts analysis.');}
  if(detect){const neural=activeAnalysis==='ai.clones.d2prl';detect.hidden=false;detect.textContent=regionController?.active()?autoText('Détecter les zones','Detect regions'):autoText('Détecter les sous-images','Detect subimages');detect.title=neural?autoText('Repère les panneaux séparés par un fond uniforme et sélectionne leurs rectangles. Chaque panneau sera analysé séparément, sans comparaison entre panneaux. Ajustez les zones puis lancez Calculer.','Detects panels separated by a flat background and selects their rectangles. Each panel will be analyzed independently, without cross-panel comparison. Adjust the regions then choose Calculate.'):autoText('Repère les panneaux séparés par un fond uniforme et ajoute leur enveloppe commune. Remplace les zones si des sous-images sont trouvées ; lancez ensuite Calculer.','Detects panels separated by a flat background and adds their shared envelope. Replaces regions when subimages are found; then choose Calculate.');}
 }
 async function detectRegions(){
  if(busy||!fileInput)return;clearTimeout(autoRunTimer);autoRunTimer=null;setDrawing(false);
  const rev=revision;busy=true;controls();status(autoText('Détection des sous-images…','Detecting subimages…'));
  try{
   const client=await ensureIndividualClient();if(!client.source){const descriptor=await client.load({id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});}
   if(regionController?.active()){const scope=await regionController.detect();if(rev!==revision||destroyed)return;regions=regionController.rectangles();renderRegions();status(scope.status==='ready'?autoText('Zones et exclusions préparées. Ajustez-les, puis cliquez sur Calculer.','Regions and exclusions prepared. Edit them, then Calculate.'):autoText('Préparation à vérifier. Ouvrez Modifier les zones avant de calculer.','Preparation requires review. Open Edit regions before calculating.'));return;}
   const neural=activeAnalysis==='ai.clones.d2prl';
   const found=await detectIndividualSubimages(client,{width:source.width,height:source.height,sourceSha256:hash,neural});if(rev!==revision||destroyed)return;
   if(found.length){regions=found;if(neural){const scope=$('tool-neural-scope');scope.value='regions';scope.onchange();}renderRegions();setDrawing(true);status(neural?autoText('Sous-images détectées. Chaque panneau sera analysé séparément. Ajustez les zones puis cliquez sur Calculer.','Subimages detected. Each panel will be analyzed independently. Adjust the regions then click Calculate.'):autoText('Sous-images détectées. Ajustez les zones si nécessaire, puis cliquez sur Calculer.','Subimages detected. Adjust the regions if needed, then click Calculate.'));}
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
  const zones=document.createElement('button');zones.id='task-zones';zones.setAttribute('aria-pressed','false');zones.onclick=()=>{$('draw').onclick();if(drawing&&automaticMode())$('automatic-scope').value='selected';if(drawing&&activeAnalysis==='ai.clones.d2prl'){const scope=$('tool-neural-scope');scope.value=neuralDrawingScope(individualUI.extras.neuralMethod,scope.value);scope.onchange();}};
  if(automaticMode()||['inspection.magnifier','tampering.resampling','tampering.copyMove.sparse','ai.clones.d2prl'].includes(activeAnalysis))place.append(zones);
  if(['tampering.copyMove.sparse','ai.clones.d2prl','analysis.complete','analysis.clones'].includes(activeAnalysis)){const detect=document.createElement('button');detect.id='task-auto-zones';detect.onclick=detectRegions;place.append(detect);}
  $('zone-mode').closest('label').hidden=true;document.querySelectorAll('[data-i18n=zoneLimit]').forEach(e=>e.hidden=true);
  const target=automaticMode()?$('automatic-controls'):individualMode()?$('tool-controls'):compositeMode()?$('composite-controls').querySelector('.parameter-bar'):$('analysis-controls');
  if(!host.sourceOnly)target.prepend(place);
  // These are presentation controls of the current task, not a footer toolbar.
  if(!host.sourceOnly)$('energy-controls').append($('energy-presentation'));
  if(host.sourceOnly)$('tool-controls').hidden=true;
  translate();controls();
 }
 function adoptInput(input){if(!input)return;if(input.hash!==hash){sourceRegionsLocalOverride=false;inheritedScopeFingerprint=null;}if(pendingSourceRegionsLocalOverride!==null)sourceRegionsLocalOverride=pendingSourceRegionsLocalOverride;pendingSourceRegionsLocalOverride=null;if(pendingSourceRegions||input.hash!==hash||!inheritedSourceRegions)inheritedSourceRegions=structuredClone(pendingSourceRegions??input.sourceRegions??null);pendingSourceRegions=null;sourceRegionsStale=false;source?.close?.();fileInput=input.file;imageId=input.imageId;hash=input.hash;energyHistogramUI?.update(null);elaAutomatic=null;syncElaAutomatic();source=input.source.fork?.(scheduleDraw)??{...input.source,close(){}};loaded=false;individualUI.setFile(fileInput);regionController?.sourceChanged();if(pendingScientificRegions){void regionController?.restore(pendingScientificRegions).then(()=>{regions=regionController.rectangles();renderRegions();draw();}).catch(e=>status(t('error')+' · '+e.message));pendingScientificRegions=null;}$('empty').hidden=true;$('file-info').textContent=input.description;fit();controls();queueAnalysis();}
 return {
  async load(file){await openFile(file);if(!fileInput)throw new Error($('status').textContent);},
  adopt:adoptInput,
  input(){return {file:fileInput,imageId,hash,source,description:$('file-info').textContent,...(sourceRegionsSnapshot()?{sourceRegions:structuredClone(sourceRegionsSnapshot())}:{})};},
  analysisSourceDomain,markSourceRegionsStale,refreshOriginalRegions(){draw();},regionDetectionClient:ensureIndividualClient,
  get busy(){return busy||energyViewBusy||!!exportController;},
  snapshot(){return {busy:busy||energyViewBusy||elaPreviewBusy||!!exportController,status:$('status').textContent,progress:$('progress').hasAttribute('value')?Number($('progress').value):null,hasResult:!!result&&!result.previewOnly&&!elaProvisional()&&!parameterProvisional()||localMagnifier()&&!!source,hasReport:!!resultMeta&&!elaProvisional()&&!parameterProvisional(),zoom:displayedZoom(),loupe:pointerLoupe?.enabled,sourceRegionsStale,sourceRegionsLocalOverride,previewPending:!!previousPresentation&&!result,fileInfo:$('file-info').textContent};},
  setHighlight(value){$('highlight-new-features').checked=!!value;applyHighlights();},setLanguage(value){lang=value;translate();individualUI?.redraw?.();},setTheme(value){theme=value;updateChrome();individualUI?.redraw?.();},
  toggleLoupeSweep:group=>pointerLoupe?.toggleSweep(group),stopLoupeSweep:()=>pointerLoupe?.stopSweep(),loupeSweepState:()=>pointerLoupe?.sweeping,loupeEffectsContext,setLoupeEffectsContext,loupeEnhancement(){if(activeAnalysis!=='inspection.magnifier')return null;const p=individualUI.params();return{enabled:true,mode:p.mode,percent:p.percent,channel:p.channel};},setLoupeEnhancement(value){if(activeAnalysis==='inspection.magnifier')individualUI.updateParams({mode:value.mode,percent:value.percent,channel:value.channel});},setCompareOriginal,pinLoupe:value=>pointerLoupe?.pin(value),loupeAnchor:()=>pointerLoupe?.anchor(),loupeDiagnostics:()=>pointerLoupe?.diagnostics(),loupeKeydown:e=>pointerLoupe?.keydown(e),exportSize(){const s=host.sourceOnly?source:selectedSurface();return s?{width:s.width,height:s.height}:null;},setLoupe,loupeMinimum(){const frame=$('layer').value==='result'&&result?result:source;return frame&&view.clientWidth&&view.clientHeight?loupeMinimumZoom(loupeSettings,Math.min(view.clientWidth/frame.width,view.clientHeight/frame.height)*.95,activeAnalysis==='inspection.magnifier'):2;},activate(){if(host.managed&&!drawing)$('layer').value=host.sourceOnly||localMagnifier()?'source':processedSurface()?'result':'source';draw();individualUI?.redraw?.();},setNavigation(value){$('navigation-mode').value=value;},setComputeProfile(value){if(!individualClient&&!automaticClient&&!compositeClient&&!worker&&!busy)$('compute-profile').value=value;},restoreSession:restore,fit,zoomBy(factor){zoomAt({x:view.clientWidth/2,y:view.clientHeight/2},factor);},
  exportImage,
  exportReport(){return $('export-report').onclick();},saveSession(){return $('save-session').onclick();},
  settings:settingsBundle,
  applySettings(value){if(busy)throw new Error(t('running'));const validated=validateSettings(value);if(host.sourceOnly)return;applySettings(validated);if(host.managed){$('app').classList.remove('original-mode');syncAnalysisControls();adoptInput(host.sourceInput?.());}},
  async dispose(){if(destroyed)return;destroyed=true;ocrTextLayer?.dispose();ocrTextLayer=null;hoverSliders?.dispose();parameterSession?.dispose();automaticGesture?.dispose();await localDownloadShelf?.dispose();const regionsOwner=regionController;regionController=null;await regionsOwner?.dispose();pointerLoupe?.dispose();energyUI?.dispose?.();energyHistogramUI?.dispose();for(const gesture of classicGestures)gesture.dispose();comparisonSource?.close?.();comparisonSource=comparisonBase=null;stop();individualUI?.dispose?.();retireResult(false);source?.close?.();source=result=fileInput=null;tileCache.release('');panelResize.disconnect();layouts?.dispose?.();window.removeEventListener('pagehide',onPageHide);window.removeEventListener('local-feature-change',onFeatureChange);document.fonts?.removeEventListener('loadingdone',onFonts);await Promise.allSettled([individualCleanup,automaticCleanup,compositeCleanup]);},
 };
}
