import {createFirstSourceFrameGate} from './first-source-frame-gate.js?v=0.31.0';
import {mountEqualizationMenu,equalizationState} from './equalization-menu.js?v=0.31.0';
import {requestedBackend} from './backend-mode-preferences.js?v=0.31.0';
import {stagedCoreOperation} from './core-result-contract.js?v=0.31.0';
import {getAdaptivePreferenceStore,importAdaptiveSettings} from './adaptive-preferences.js?v=0.31.0';
import {createRetainedDisplayReadOwner} from './retained-display-read-owner.js?v=0.31.0';
import {createAutomaticElaContextControl} from './automatic-ela-context-ui.js?v=0.31.0';
import {createCompositeRegionalPresentation} from './composite-regional-presentation.js?v=0.31.0';
import {createCompositeResultRetirement} from './composite-result-retirement.js?v=0.31.0';
import {canPersistSettingsDraft} from './settings-draft-validity.js?v=0.31.0';
import {nativeParameterContexts} from './native-context-constraints.js?v=0.31.0';
import {certifyEfficientLoFtrRoleGeometry} from './unified-engine/src/efficient-loftr-role-geometry.js';
import {nativeSupportNotice} from './native-support-notice.js?v=0.31.0';
import {isCloneWindowOperation} from './clone-window-choice.js?v=0.31.0';
import {automaticSourceContext,captureAutomaticSourceContext,automaticSourceContextMatches} from './automatic-source-context.js?v=0.31.0';
import {prepareParameterScientificTask} from './parameter-scientific-task.js?v=0.31.0';
import {jpegDctAutomaticPreflight,jpegDctFormatNotice} from './jpeg-dct-auto-preflight.js?v=0.31.0';
import {hasProgressCounts,progressText,renderProgress} from './progress-ui.js?v=0.31.0';
import {nativeContextEvaluationNotice} from './native-context-evaluation-ui.js?v=0.31.0';
import {scientificScopeRgbExclusions} from './scientific-scope-rgb-selection.js?v=0.31.0';
import {watchCanvas2D} from './canvas-context-recovery.js?v=0.31.0';
import {sourceRegionApplicability} from './source-region-applicability.js?v=0.31.0';
import {createOcrTextLayer} from './ocr-text-layer.js?v=0.31.0';
import {ocrPresentationSnapshot} from './ocr-presentation.js?v=0.31.0';
import {bindInteractiveControl} from './interactive-control.js?v=0.31.0';
import {createAutomaticD2PreviewSession} from './automatic-d2-preview-session.js?v=0.31.0';
import {installHoverSliders} from './hover-sliders.js?v=0.31.0';
import {createAdaptivePreview,reportAdaptivePreviewPresented,reportAdaptivePreviewComputed} from './adaptive-preview.js?v=0.31.0';
import {parameterPreviewPolicy} from './parameter-preview-policy.js?v=0.31.0';
import {createParameterPreviewSession} from './parameter-preview-session.js?v=0.31.0';
import {createGenericHeldPreviewOwner} from './generic-held-preview-owner.js?v=0.31.0';
import {createLocalHeldPreviewOwners} from './local-held-preview-owner.js?v=0.31.0';
import {retainedNativeBasisStatus} from './parameter-preview-policy.js?v=0.31.0';
import {localFeaturePolicy} from './feature-policy.js?v=0.31.0';
import {preferenceAccess,capturePreferenceBackup,downloadPreferenceBackup} from './preferences-recovery.js?v=0.31.0';
import {downloadSession} from './session-ui.js?v=0.31.0';
import {createDownloadShelf} from './download-shelf.js?v=0.31.0';
import {analysisReportFilename,analysisImageFilename} from './report-export-name.js?v=0.31.0';
import {diagnostic} from './runtime-context.js?v=0.31.0';
import {rasterOptions,exportPresentationRaster} from './raster-export-client.js?v=0.31.0';
import {exportDefaults,linkedExportSize} from './media-settings.js?v=0.31.0';
import {validateLoupeEffects} from './loupe-effects-settings.js?v=0.31.0';
import {createPointerLoupe} from './pointer-loupe.js?v=0.31.0';
import {bindSliderReset} from './slider-reset.js?v=0.31.0';
import {loupeDefaults,loupeKey,validateLoupeSettings,imageAccept,loupeScale,loupeMinimumZoom} from './media-settings.js?v=0.31.0';
import {isExtensionTool,extensionProgressText} from './extension-tools.js?v=0.31.0';
import {toolCatalog,toolTitle} from './tool-catalog.js?v=0.31.0';
import {createToolClient} from './tool-client.js?v=0.31.0';
import {createErrorJournal,errorEvidence,showErrorJournal} from './error-journal.js?v=0.31.0';
import {localizeStatus,errorText} from './ui-errors.js?v=0.31.0';
import {detectIndividualSubimages,individualSubimageProvenance} from './individual-subimages.js?v=0.31.0';
import {isForgeryscope,neuralDrawingScope} from './neural-clone-ui.js?v=0.31.0';
import {createToolWorkspace} from './tool-workspace.js?v=0.31.0';
import {createIndividualRegionController} from './individual-region-controller.js?v=0.31.0';
import {createAutomaticClient} from './automatic-client.js?v=0.31.0';
import {createAutomaticProgress,automaticSelection,automaticReport,automaticAnalysisIncomplete,automaticNativeGroupNotice} from './automatic-state.js?v=0.31.0';
import {createCompositeClient} from './composite-client.js?v=0.31.0';
import {resolveComputeProfile} from './resource-policy.js?v=0.31.0';
import {createRemoteSurface,createPreviewSurface} from './remote-surface.js?v=0.31.0';
import {createExportSink} from './export-sink.js?v=0.31.0';
import {createExportSinkScope,exportSinkScopeFor} from './export-sink-owner.js?v=0.31.0';
import {withDownloadCleanupFailure} from './download-manager.js?v=0.31.0';
import {removeTerminatedTemporarySession} from './unified-engine/src/temporary-storage.js';
import {EngineError,serializeEngineError,deserializeEngineError} from './unified-engine/src/errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './unified-engine/src/worker-message-protocol.js';
import {createEnergyUI} from './energy-ui.js?v=0.31.0';
import {createEnergyHistogramUI} from './energy-histogram-ui.js?v=0.31.0';
import {bindElaPreviewGesture} from './ela-preview-controls.js?v=0.31.0';
import { bindViewerNavigation, doubleClickCamera,viewerCameraIsFitted } from './viewer-input.js?v=0.31.0';
import { strings } from './i18n.js?v=0.31.0';
import { toolGroups } from './tool-tree.js?v=0.31.0';
import { defaults, validParams, validEnergySettings, validElaMode, validCompositeSettings, validAutomaticSettings, validateSettings, recoverSettings, settingsFilename } from './settings.js?v=0.31.0';
import { createWindowLayout } from './window-layout.js?v=0.31.0';
import { TileCache } from './tiled-surface.js?v=0.31.0';
import { exportRGBPNG } from './png-export.js?v=0.31.0';
import {originalBatchScientificScope} from './original-source-regions-batch.js?v=0.31.0';
import {createOriginalSourceRegionsState} from './original-source-regions.js?v=0.31.0';
import {compileOriginalSourceRegions,validateOriginalSourceRegions} from './original-source-regions.js?v=0.31.0';
export function mountAnalysisPanel(document=globalThis.document,host={}) {
 const exportOwners=createExportSinkScope();let retiringExportWorker,exportWorkerRetirement,panelDisposal;const retiredPanelClients=new Map();
 async function retireExportWorker(){if(!retiringExportWorker)return;if(exportWorkerRetirement)return exportWorkerRetirement;const owner=retiringExportWorker;return exportWorkerRetirement=(async()=>{await exportOwners.drainActive();if(!owner.workerRetired){owner.worker?.terminate();owner.workerRetired=true;}while(owner.sessions.length){const session=owner.sessions[0];await removeTerminatedTemporarySession(session.id,session.backend);owner.sessions.shift();}if(retiringExportWorker===owner)retiringExportWorker=null;})().finally(()=>{exportWorkerRetirement=null;});}
 function retirePanelClient(kind,client){
  let entry=retiredPanelClients.get(kind);if(entry&&entry.client!==client)throw Object.assign(Error('Wait for the previous client cleanup acknowledgement.'),{code:'EXPORT_CLEANUP_PENDING'});
  if(!entry){entry={client,task:null};retiredPanelClients.set(kind,entry);}if(entry.task)return entry.task;
  return entry.task=Promise.resolve().then(()=>client.dispose()).then(()=>{retiredPanelClients.delete(kind);if(kind==='individual')individualDisposing=false;else automaticDisposing=false;},error=>{entry.task=null;throw error;});
 }
 async function drainRetiredPanelClients(kind){for(const [key,entry]of retiredPanelClients)if(kind===undefined||kind===key)await retirePanelClient(key,entry.client);}

const $=id=>document.getElementById(id);
const hoverSliders=host.managed?null:installHoverSliders({root:document,enabled:true,language:()=>lang});
let activeAnalysis='ela.classic',compositeClient=null,compositeResult=null,compositeAbort=null,compositeCleanup=Promise.resolve(),compositeDisposing=false;
const compositeRetirement=createCompositeResultRetirement();let compositeSourcePresentation=null;
const compositeMode=()=>activeAnalysis==='composite';
const individualMode=()=>!!toolCatalog[activeAnalysis];
// Exports and display reads share this client; live work owns the task status.
let parameterSession=null,parameterCommitting=false,zeroViewPresentation=null;
// ZERO view changes retain native analysis but still await a real viewport.
// This UI ticket never owns pixels, scientific caches or a worker operation.
function zeroViewCurrent(ticket=zeroViewPresentation){return !!ticket&&ticket===zeroViewPresentation&&!destroyed&&ticket.revision===revision&&ticket.imageId===imageId&&ticket.hash===hash&&activeAnalysis==='jpeg.zero'&&sourceRegionTaskIsCurrent(ticket.owner);}
// A hidden, already-produced viewport does not own global calculation activity.
// Queued native work and actual RGB reads remain busy; exports still use the ticket.
function zeroViewTaskBusy(){return !!zeroViewPresentation&&(!zeroViewPresentation.surface||zeroViewPresentation.reads>0||!host.visible||host.visible());}
function beginZeroViewPresentation(view){const ticket={revision,imageId,hash,owner:sourceRegionTaskIdentity(),view,surface:null,outputId:null,reads:0};zeroViewPresentation=ticket;$('progress').removeAttribute('value');status(autoText('Mise à jour de la vue ZERO…','Updating ZERO view…'));controls();return ticket;}
function clearZeroViewPresentation({restore=false}={}){if(!zeroViewPresentation)return false;zeroViewPresentation=null;if(restore){retireResult();presentedSurface=null;resultMeta=null;$('layer').value=previousPresentation?'result':'source';$('export-png').disabled=true;$('export-report').disabled=true;}return true;}
function finishZeroViewPresentation(surface){const ticket=zeroViewPresentation;if(!zeroViewCurrent(ticket)||ticket.surface!==surface)return;zeroViewPresentation=null;$('progress').value=1;status(ticket.wholeFallback?t('done')+' · '+autoText('Analyse effectuée sur l’image originale entière ; vos zones sont conservées.','Analysis used the complete original image; your regions are kept.'):t('done'));controls();$('export-png').disabled=!result||!!result.previewOnly||parameterProvisional();$('export-report').disabled=!resultMeta||parameterProvisional();}
function zeroViewRendering(){return previousPresentation?autoText('Rendu de la vue ZERO… — vue précédente conservée','Rendering ZERO view… — previous view retained'):autoText('Rendu de la vue ZERO…','Rendering ZERO view…');}
const wholeSourceFallbackTasks=new WeakMap();
let ocrTextLayer=null,inheritedSourceRegions=null,inheritedSourceRegionsCaptured=false,pendingSourceRegions=undefined,sourceRegionsStale=false,sourceRegionsLocalOverride=false,pendingSourceRegionsLocalOverride=null,inheritedScopeFingerprint=null;
// Plot scale bounds follow the current compiled input, never a prior result crop.
let plotSourceConstraints=null,plotSourceConstraintsPending=null,plotSourceConstraintsErrorKey=null;
function plotSourceConstraintsKey(){const snapshot=sourceRegionsSnapshot(),scope=regionController?.scope;return JSON.stringify([revision,imageId,hash,source?.width,source?.height,snapshot?.fingerprint??snapshot?.revision??null,sourceRegionsLocalOverride,sourceRegionsLocalOverride?(scope?.fingerprint??null):null]);}
let nativeControlConstraints=null,nativeControlConstraintsPending=null,nativeControlConstraintsErrorKey=null;
const nativeControlOperation=()=>['detail.wavelets','noise.blocking'].includes(activeAnalysis);
function nativeControlConstraintsKey(){const snapshot=sourceRegionsSnapshot(),scope=regionController?.scope;return JSON.stringify([imageId,hash,source?.width,source?.height,activeAnalysis,snapshot?.fingerprint??snapshot?.revision??null,sourceRegionsLocalOverride,sourceRegionsLocalOverride?(scope?.fingerprint??null):null]);}
function individualSourceContext(){const full={width:source?.width,height:source?.height,byteLength:fileInput?.size};if(nativeControlOperation()&&nativeControlConstraints?.key===nativeControlConstraintsKey())return{...full,nativeContexts:nativeControlConstraints.contexts};return activeAnalysis==='colors.plots'&&plotSourceConstraints?.key===plotSourceConstraintsKey()?{...full,...plotSourceConstraints.dimensions}:full;}
function adoptNativeControlConstraints(contexts,key=nativeControlConstraintsKey()){if(!nativeControlOperation()||key!==nativeControlConstraintsKey())return false;nativeControlConstraintsErrorKey=null;nativeControlConstraints={key,contexts};individualUI?.refreshSourceConstraints?.();return true;}
function refreshNativeControlConstraints({retry=false}={}){if(!nativeControlOperation()||!source)return Promise.resolve(false);const key=nativeControlConstraintsKey();if(nativeControlConstraints?.key===key)return Promise.resolve(true);if(nativeControlConstraintsErrorKey===key&&!retry)return Promise.resolve(false);if(nativeControlConstraintsPending?.key===key)return nativeControlConstraintsPending.promise;const owner=sourceRegionTaskIdentity(),pending={key,promise:null};pending.promise=(async()=>{try{const domain=await analysisSourceDomain(),contexts=await nativeParameterContexts({width:source.width,height:source.height,sourceSha256:hash,sourceRegionDomain:domain});if(!sourceRegionTaskIsCurrent(owner)||key!==nativeControlConstraintsKey())return false;return adoptNativeControlConstraints(contexts,key);}catch(error){if(sourceRegionTaskIsCurrent(owner)&&key===nativeControlConstraintsKey()){nativeControlConstraintsErrorKey=key;diagnostic({level:'warning',kind:'native.parameter.constraints.unavailable',code:error.code,message:error.message});status(t('error')+' · '+errorText(error,lang));}return false;}finally{if(nativeControlConstraintsPending===pending){nativeControlConstraintsPending=null;if(!destroyed)controls();}}})();nativeControlConstraintsPending=pending;return pending.promise;}

function adoptPlotSourceConstraints(domain,key=plotSourceConstraintsKey()){if(activeAnalysis!=='colors.plots'||!source||key!==plotSourceConstraintsKey())return false;plotSourceConstraintsErrorKey=null;plotSourceConstraints={key,dimensions:{width:domain?.width??source.width,height:domain?.height??source.height}};individualUI?.refreshSourceConstraints?.();return true;}
function refreshPlotSourceConstraints(){if(activeAnalysis!=='colors.plots'||!source||!individualUI)return Promise.resolve(false);const key=plotSourceConstraintsKey();if(plotSourceConstraints?.key===key)return Promise.resolve(true);if(plotSourceConstraintsErrorKey===key)return Promise.resolve(false);if(plotSourceConstraintsPending?.key===key)return plotSourceConstraintsPending.promise;const owner=sourceRegionTaskIdentity(),pending={key,promise:null};pending.promise=(async()=>{try{const domain=await analysisSourceDomain();if(!sourceRegionTaskIsCurrent(owner)||key!==plotSourceConstraintsKey())return false;return adoptPlotSourceConstraints(domain,key);}catch(error){if(sourceRegionTaskIsCurrent(owner)&&key===plotSourceConstraintsKey()){plotSourceConstraintsErrorKey=key;diagnostic({level:'warning',kind:'plot.constraints.unavailable',code:error.code,message:error.message});}return false;}finally{if(plotSourceConstraintsPending===pending){plotSourceConstraintsPending=null;if(!destroyed)controls();}}})();plotSourceConstraintsPending=pending;return pending.promise;}
function sourceRegionsSnapshot(){return host.sourceOnly?host.getOriginalSourceRegions?.()??null:inheritedSourceRegions;}
// Each tool owns the Original selection captured when its source is adopted.
// A captured null is deliberately whole-image, not an invitation to read a
// later Original selection when preferences are reapplied to the same source.
function captureInheritedSourceRegions(input,{sourceChanged=false}={}){if(pendingSourceRegions!==undefined||sourceChanged||!inheritedSourceRegionsCaptured){inheritedSourceRegions=structuredClone(pendingSourceRegions!==undefined?pendingSourceRegions:input.sourceRegions??null);inheritedSourceRegionsCaptured=true;inheritedScopeFingerprint=null;}pendingSourceRegions=undefined;}
async function localSourceRegionsSnapshot(){if(!sourceRegionsLocalOverride||!regionController?.scope)return sourceRegionsSnapshot();const scope=regionController.scope,{excluded}=scientificScopeRgbExclusions(scope,{nativeTextCandidates:regionController?.scientificActive?.()??true}),state=await createOriginalSourceRegionsState({sourceSha256:hash,width:source.width,height:source.height}),zone=(polygon,id,kind)=>({id,kind,enabled:true,x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1])),polygon});return state.replaceZones([...(scope.regions??[]).map((r,i)=>zone(r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]],'local-positive-'+i,'acquisition')),...excluded.map((polygon,i)=>zone(polygon,'local-negative-'+i,'exclusion'))],{positiveMode:'selected',enabled:true});}
async function analysisSourceDomain(){const inherited=sourceRegionsSnapshot(),local=!host.sourceOnly&&sourceRegionsLocalOverride?await localSourceRegionsSnapshot():inherited;if(!local)return null;const verified=await validateOriginalSourceRegions(local,{sourceSha256:hash,width:source.width,height:source.height});return(await compileOriginalSourceRegions(verified,{ceiling:!host.sourceOnly&&sourceRegionsLocalOverride&&inherited?inherited:null})).descriptor;}
async function syncInheritedSourceRegions(){const inherited=sourceRegionsSnapshot();if(host.sourceOnly||sourceRegionsLocalOverride||!inherited||!regionController?.active()||inheritedScopeFingerprint===inherited.fingerprint)return;const owner=sourceRegionTaskIdentity(),scope=await originalBatchScientificScope({originalSourceRegions:inherited,sourceSha256:hash,width:source.width,height:source.height});if(!sourceRegionTaskIsCurrent(owner)||sourceRegionsSnapshot()!==inherited||sourceRegionsLocalOverride)throw Object.assign(Error('The tool source regions changed before adoption.'),{code:'CANCELLED'});await regionController.restore({schema:'sherloq.individual-regions/1',sourceSha256:hash,scope,excludeTexts:regionController.serialize?.().excludeTexts??false});if(!sourceRegionTaskIsCurrent(owner))throw Object.assign(Error('The tool source changed during region adoption.'),{code:'CANCELLED'});inheritedScopeFingerprint=inherited.fingerprint;regions=regionController.rectangles();renderRegions();}
// Bind each calculation to the tool-owned selection. Local edits may change
// its next task; later Original edits belong only to subsequently opened tools.
function currentCloneWindowMode(){return automaticMode()?($('automatic-clone-window-global').checked?'global':'independent'):(individualUI?.taskOptions?.().cloneWindowMode??'independent');}
async function bindSourceRegionTask(task){if(task.operation==='tampering.copyMove.sparse'&&task.params?.algorithm==='EfficientLoFTR'&&!task.efficientLoFtrComparison){const choice=individualUI?.taskOptions?.().efficientLoFtrComparison;if(choice)task={...task,efficientLoFtrComparison:await certifyEfficientLoFtrRoleGeometry({roles:choice.roles,sourceSha256:hash,sourceGrid:[source.width,source.height]})};}if(isCloneWindowOperation(task.operation)&&(individualMode()||automaticMode()))task={cloneWindowMode:currentCloneWindowMode(),...task};const applicability=sourceRegionApplicability(task);if(!applicability.applicable){const{sourceRegionDomain,...originalTask}=task;return{...originalTask,sourceRegionApplicability:{...applicability,originalSourceSha256:hash}};}const domain=await analysisSourceDomain();return domain?{...task,sourceRegionDomain:domain}:task;}
async function sourceDomainRestricted(){const descriptor=await analysisSourceDomain();if(!descriptor)return false;const domain=await compileOriginalSourceRegions(descriptor);return domain.countIncluded!==domain.sourceWidth*domain.sourceHeight;}
function sourceRegionSupportNotice(output){const native=nativeContextEvaluationNotice(output,lang);if(native)return native.text;const count=output?.metrics?.unanalysablePixels;if(!Number.isSafeInteger(count)||count<=0)return'';return lang==='en'?count.toLocaleString('en')+' selected pixels lack the neighbourhood needed for calculation and were not analysed.':count.toLocaleString('fr')+' pixels sélectionnés n’ont pas le voisinage nécessaire au calcul et n’ont pas été analysés.';}
function sourceRegionCompletedStatus(output){const notice=sourceRegionSupportNotice(output);return t('done')+(notice?' · '+notice:'');}
function sourceRegionTaskIdentity(){return{revision,sourceSha256:hash,imageId,file:fileInput,operation:activeAnalysis,cloneWindowMode:currentCloneWindowMode(),efficientLoFtrComparisonKey:JSON.stringify(individualUI?.taskOptions?.().efficientLoFtrComparison??null)};}
function sourceRegionTaskIsCurrent(owner){return !destroyed&&owner?.revision===revision&&owner.sourceSha256===hash&&owner.imageId===imageId&&owner.file===fileInput&&owner.operation===activeAnalysis&&(owner.cloneWindowMode??'independent')===currentCloneWindowMode()&&owner.efficientLoFtrComparisonKey===JSON.stringify(individualUI?.taskOptions?.().efficientLoFtrComparison??null);}
async function acknowledgeSourceRegionTask(task,owner=sourceRegionTaskIdentity()){if(!sourceRegionTaskIsCurrent(owner)||task?.imageId!==undefined&&task.imageId!==owner.imageId||task?.sourceRegionDomain?.snapshot?.sourceSha256&&task.sourceRegionDomain.snapshot.sourceSha256!==owner.sourceSha256)return false;if(!sourceRegionApplicability(task).applicable){sourceRegionsStale=false;return true;}let current;try{current=await analysisSourceDomain();}catch(error){if(!sourceRegionTaskIsCurrent(owner))return false;throw error;}if(!sourceRegionTaskIsCurrent(owner))return false;const fallback=wholeSourceFallbackTasks.get(task);sourceRegionsStale=fallback?fallback.sourceSha256!==hash||fallback.requestedFingerprint!==(current?.fingerprint??null):(task?.sourceRegionDomain?.fingerprint??null)!==(current?.fingerprint??null);return !sourceRegionsStale;}
function markSourceRegionsStale(){/* Already-open tools retain their captured Original selection. */}
let individualUI=null,individualClient=null,individualOpening=null,individualCleanup=Promise.resolve(),individualEpoch=0,individualDisposing=false,individualCancelled=false,pendingMagnifier=false,individualComputing=null;
function stopIndividual({keepClient=false}={}){clearZeroViewPresentation();ocrTextLayer?.clear();parameterSession?.reset('tool-change',{restoreResult:false});regionController?.cancel();individualComputing=null;pointerLoupe?.cancelImage();if(keepClient&&individualClient&&!individualDisposing){individualClient.cancel();individualUI?.invalidateResult();return;}individualEpoch++;const client=individualClient;if(client){individualDisposing=true;individualCleanup=retirePanelClient('individual',client);void individualCleanup.catch(error=>console.warn('Tool cleanup:',error));}individualClient=null;individualUI?.invalidateResult();}
const automaticMode=()=>['analysis.complete','analysis.clones'].includes(activeAnalysis);
let automaticOpening=null,automaticOpeningEpoch=-1,automaticEpoch=0,automaticDisposing=false,automaticPauseRequested=false,automaticPresentationDraft=false,automaticGesture=null,automaticGestureVersion=0,automaticD2Gesture=null,automaticD2Preview=null;
let automaticSubmittedContext=null;
function automaticCurrentSourceContext(){if(!automaticMode()||!fileInput||!source)return null;return automaticSourceContext({operation:activeAnalysis,cloneWindowMode:currentCloneWindowMode(),imageId,sourceSha256:hash,revision,width:source.width,height:source.height,ceilingFingerprint:sourceRegionsSnapshot()?.fingerprint??null,scopeFingerprint:regionController?.active()?regionController.scope?.fingerprint??null:null,selection:automaticSelection(source.width,source.height,regions.filter(r=>r.kind!=='exclusion'),$('automatic-scope').value)});}
let automaticElaContextControl;
let automaticClient=null,automaticCleanup=Promise.resolve(),automaticProgress=null,automaticSnapshot=null,automaticStarted=0,automaticClock=null,automaticDisplayRevision=0;
function stopAutomatic(){revokeAutomaticOpacityPreview();automaticSubmittedContext=null;automaticD2Gesture?.reset('cancel');automaticD2Preview?.reset('cancel');automaticGesture?.reset('cancel');automaticPauseRequested=false;automaticProgress=automaticSnapshot=null;automaticStarted=0;automaticPresentationDraft=false;automaticGestureVersion++;automaticEpoch++;clearInterval(automaticClock);automaticClock=null;const client=automaticClient;if(client){automaticDisposing=true;automaticCleanup=retirePanelClient('automatic',client);void automaticCleanup.catch(error=>console.warn('Automatic cleanup:',error));}automaticClient=null;}

function scheduleCompositeRetirement(){compositeCleanup=compositeRetirement.drain();void compositeCleanup.catch(error=>console.warn('Composite cleanup:',error));return compositeCleanup;}
function releaseCompositeResult(){if(compositeResult&&compositeClient){compositeRetirement.retainResult(compositeClient,compositeResult,compositeSourcePresentation);compositeResult=null;compositeSourcePresentation=null;scheduleCompositeRetirement();}}
function stopComposite(){compositeAbort?.abort();compositeAbort=null;releaseCompositeResult();const client=compositeClient;compositeClient=null;compositeRetirement.retainClient(client);compositeDisposing=true;const cleanup=scheduleCompositeRetirement();void cleanup.then(()=>{compositeDisposing=false;},()=>{});} 
let energyUI=null,energyHistogramUI=null,energyHistogramJob=null,energyHistogramQueued=null,energyHistogramVersion=0,energyHistogramKey='',elaMode='classic',energyMode=false,energyViewRevision=0,energyViewBusy=false,energyViewQueued=false,energyViewPreview=null,energyPreviewed=false,autoRunTimer=null;
let lastScientificEnergy=null,lastScientificClassic=null,elaParameterDraft=false,elaPreviewBusy=false,elaPreviewQueued=null,elaPreviewVersion=0,elaPreviewEpoch=0,elaPreviewCommit=false,elaParameterKind=null;
const classicGestures=[];
const displayAdaptive=createAdaptivePreview();let elaAdaptiveFeedback=null;
function observePreviewPresentation(surface,metrics){if(surface&&metrics?.adaptivePreview)surface.adaptiveMetrics=metrics;}
// Local publication proof only. Past feedback alone cannot prove that a proxy
// still owns the actual visible surface or that its report-rAF has completed.
function captureFrequencyPreviewPublication(event,{signal,sessionEpoch,client,taskOwner,rev,nativeSource,intention}={}){
 const surface=result,metrics=surface?.adaptiveMetrics,feedback=elaAdaptiveFeedback,original=nativeSource,field=intention?.field,toolId=intention?.toolId,gestureEpoch=intention?.gestureEpoch,controlRequestId=intention?.controlRequestId;
 const current=()=>{
  try{return event.operation==='detail.frequency'&&event.field===field&&event.toolId===toolId&&event.gestureEpoch===gestureEpoch&&event.controlRequestId===controlRequestId&&event.continuous===true&&!destroyed&&!busy&&!!fileInput&&!sourceRegionsStale&&!signal?.aborted&&parameterSession?.active===true&&parameterSession.pending===true&&parameterSession.epoch===sessionEpoch&&event.toolId===activeAnalysis&&revision===rev&&individualClient===client&&client?.source===original&&!!original&&taskOwner?.isCurrent()===true&&event.completedPreviewCurrent?.()===true&&result===surface&&presentedSurface===surface&&!!surface&&surface.adaptiveMetrics===metrics&&surface.adaptiveReportPending!==true&&surface.adaptiveReported===metrics&&(!surface.parameterPreviewCurrent||surface.parameterPreviewCurrent()===true)&&elaAdaptiveFeedback===feedback;}catch{return false;}
 };
 if(!current()||metrics?.operation!=='detail.frequency'||feedback?.schema!=='frequency-preview-feedback/3')return null;
 const adaptive=metrics.adaptivePreview,token=adaptive?.token,geometry=feedback.paintedGeometry;
 if(token?.costModel!=='frequency-owned-visible-grid/7'||feedback.scope!==token.scope||feedback.key!==token.key||feedback.environment!==token.environment||feedback.calibration?.lastPaintedId!==token.id||geometry?.sourceId!==metrics.derivedSourceId||typeof geometry.ownerKey!=='string'||!geometry.ownerKey||geometry.ownerKey.length>160||typeof geometry.sourceId!=='string'||!geometry.sourceId||geometry.sourceId.length>160||!Array.isArray(metrics.inputDimensions)||metrics.inputDimensions[0]!==geometry.width||metrics.inputDimensions[1]!==geometry.height)return null;
 const domain=taskOwner.task?.sourceRegionDomain,identity=domain?[original.sha256??original.id,domain.fingerprint]:original.sha256??original.id;
 if(JSON.stringify(metrics.sourceIdentity)!==JSON.stringify(identity))return null;
 return{schema:'frequency-publication-owner/1',operation:event.operation,field:event.field,gestureEpoch:event.gestureEpoch,controlRequestId:event.controlRequestId,sourceIdentity:structuredClone(identity),sourceId:geometry.sourceId,ownerKey:geometry.ownerKey,width:geometry.width,height:geometry.height,scope:token.scope,environment:token.environment,paintId:token.id,pendingPublication:false,isCurrent:current};
}
const nativeParameterPresentations=new WeakMap();let nativeParameterPresentationId=0;
// Exact native previews have no adaptive token. This record only identifies
// a local draw/rAF receipt; it never owns pixels, a lane or resource credits.
function captureNativeParameterPresentation(answer,event,{signal,isCurrent,calculatedEpoch}={}){
 try{
  const metrics=answer?.metrics,session=parameterSession,epoch=calculatedEpoch,currentEpoch=session?.epoch;
  if(!answer?.pixels||answer.exact!==true||event.policy?.kind!=='retained'||event.policy?.strategy!=='clones'||!['tampering.copyMove.sparse','tampering.copyMove.dense'].includes(event.operation)||answer.operation!==event.operation||metrics?.nativePresentation!==true||metrics.retainedNativeTables!==true||metrics.nativeAnalysisCalls!==0||metrics.inferenceCalls!==0||!Number.isFinite(metrics.totalMs)||metrics.totalMs<0||!Number.isSafeInteger(metrics.maximumFramePixels)||metrics.maximumFramePixels<1||!signal||signal.aborted||!Number.isSafeInteger(epoch)||!Number.isSafeInteger(currentEpoch)||typeof isCurrent!=='function'||isCurrent()!==true)return null;
  const owner=sourceRegionTaskIdentity(),sourceOwner=source,client=individualClient,basis=client?.result;
  if(!sourceOwner||!client||!basis)return null;
  const identity=parameterGestureIdentity(event),input=identity.lastAdmittedInput;
  return {id:++nativeParameterPresentationId,epoch,currentEpoch:()=>session.epoch,operation:event.operation,field:event.field,identity,source:{sourceSha256:owner.sourceSha256,imageId:owner.imageId,revision:owner.revision,cloneWindowMode:owner.cloneWindowMode,domainFingerprint:answer.sourceRegionDomain?.fingerprint??null},dimensions:[answer.pixels.width,answer.pixels.height],frameReadyAt:performance.now(),inputAt:input?.clock==='performance.now'&&Number.isFinite(input.observedAt)?input.observedAt:null,metrics:Object.freeze({nativeAnalysisCalls:metrics.nativeAnalysisCalls,inferenceCalls:metrics.inferenceCalls,retainedNativeTables:metrics.retainedNativeTables,nativePresentation:metrics.nativePresentation,totalMs:metrics.totalMs,maximumFramePixels:metrics.maximumFramePixels}),current:()=>!signal.aborted&&!destroyed&&!sourceRegionsStale&&source===sourceOwner&&individualClient===client&&client.result===basis&&parameterSession===session&&isCurrent()===true&&sourceRegionTaskIsCurrent(owner),pending:false,reported:false};
 }catch{return null;}
}
function reportNativeParameterPresentation(surface){
 const record=nativeParameterPresentations.get(surface);if(!record||record.pending||record.reported)return;
 try{
  if(!record.current()||surface!==result||surface!==presentedSurface)return;
  record.pending=true;const drawReturnedAt=performance.now();
  requestAnimationFrame(()=>{record.pending=false;try{
   if(nativeParameterPresentations.get(surface)!==record||record.reported||!record.current()||surface!==result||surface!==presentedSurface)return;
   record.reported=true;const observedAt=performance.now();
   diagnostic({level:'info',kind:'parameter-preview.native-presented',receipt:'guarded-draw-raf/1',presentationId:record.id,previewEpoch:record.epoch,calculatedPreviewEpoch:record.epoch,currentPreviewEpoch:record.currentEpoch(),operation:record.operation,field:record.field,exact:true,metrics:record.metrics,...record.identity,source:record.source,dimensions:record.dimensions,frameReadyAt:record.frameReadyAt,drawReturnedAt,observedAt,observedWallTime:Date.now(),clock:'performance.now',inputToReceiptMs:record.inputAt!==null&&record.inputAt<=observedAt?observedAt-record.inputAt:null,drawToReceiptMs:Math.max(0,observedAt-drawReturnedAt),resourceAcknowledged:false,compositorAcknowledged:false});
  }catch{}});
 }catch{record.pending=false;}
}
// Local presentation acknowledgement only, not a compositor/resource ACK.
// One waiter belongs to this frame and existing preview signal. It cannot
// retain a lane indefinitely when hidden, revoked, replaced or never painted.
function waitForParameterPreviewPaint(surface,{signal,isCurrent=()=>true}={}){
 if(!signal||signal.aborted)return Promise.resolve({presented:false,reason:'revoked'});
 return new Promise(resolve=>{let settled=false,timer;const finish=answer=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);if(surface.parameterPreviewPainted===finish)delete surface.parameterPreviewPainted;let current=false;try{current=!signal.aborted&&isCurrent()===true&&surface===result&&surface===presentedSurface;}catch{}resolve(current&&answer?.presented===true?answer:{presented:false,reason:answer?.reason??'not-current'});},abort=()=>finish({presented:false,reason:'revoked'});
  surface.parameterPreviewPainted=finish;signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish({presented:false,reason:'paint-not-received-within-fallback-window'}),200);
 });
}
function reportPresentedPreview(surface){
 reportNativeParameterPresentation(surface);
 if(!surface?.adaptiveMetrics||surface.adaptiveReportPending||surface.adaptiveReported===surface.adaptiveMetrics)return;
 const metrics=surface.adaptiveMetrics;surface.adaptiveReportPending=true;
 requestAnimationFrame(()=>{surface.adaptiveReportPending=false;if(destroyed||surface!==result||surface!==presentedSurface||surface.adaptiveMetrics!==metrics||surface.parameterPreviewCurrent&&surface.parameterPreviewCurrent()!==true){surface.parameterPreviewPainted?.({presented:false,reason:'surface-changed-before-paint-report'});return;}surface.adaptiveReported=metrics;const feedback=reportAdaptivePreviewPresented(metrics,{presentedAt:Date.now()});if(feedback){elaAdaptiveFeedback=feedback;diagnostic({level:'info',kind:'parameter-preview.adaptive',metrics:feedback});}surface.parameterPreviewPainted?.({presented:true,feedback});});
}

const parameterProvisional=()=>!!zeroViewPresentation||!!parameterSession?.pending||!!individualUI?.interactivePending||automaticPresentationDraft||!!automaticD2Preview?.pending;
const elaProvisional=()=>elaParameterDraft||elaPreviewBusy||elaPreviewCommit||energyViewBusy||energyPreviewed;
function individualComparisonRectangles(){
 const local=regions.filter(r=>r.kind!=='exclusion');
 if(activeAnalysis!=='tampering.copyMove.sparse'||$('tool-param-algorithm')?.value!==JSON.stringify('EfficientLoFTR'))return local;
 const snapshot=sourceRegionsSnapshot(),inherited=!sourceRegionsLocalOverride&&snapshot?.enabled&&snapshot.positiveMode==='selected';
 const current=inherited&&source&&snapshot.sourceSha256===hash&&snapshot.width===source.width&&snapshot.height===source.height;
 const choices=inherited?(current?snapshot.zones.filter(r=>r.enabled&&r.kind==='acquisition'):[]):local;
 return choices.map(r=>{const geometry=r.originalGeometry,id=r.id??geometry?.id??geometry?.zoneId;return{...r,...(typeof id==='string'&&id?{id}:{}),...(inherited&&!geometry?{originalGeometry:{x0:r.x0,y0:r.y0,x1:r.x1,y1:r.y1,polygon:r.polygon}}:{})};});
}
function comparisonRunNotice(){return individualMode()?individualUI?.comparisonRunNotice?.(individualComparisonRectangles())??'':'';}
function queueAnalysis(){
 clearTimeout(autoRunTimer);autoRunTimer=null;
 if(!fileInput||host.sourceOnly||$('app').classList.contains('original-mode')||parameterSession?.pending&&!parameterCommitting)return;
 if(firstSourceFrame.requestAnalysis(source))return;
 if(localMagnifier()){pendingMagnifier=false;refreshLocalMagnifier();return;}
 if(busy||energyViewBusy||elaPreviewBusy){if(activeAnalysis==='inspection.magnifier')pendingMagnifier=true;return;}
 pendingMagnifier=false;
 const comparisonNotice=comparisonRunNotice();if(comparisonNotice){status(comparisonNotice);return;}
 // Clone and region workflows keep their explicit Calculate action.
 if(activeAnalysis==='ai.clones.d2prl'||(regionController?.scientificActive?.()??regionController?.active())){status(autoText('Choisissez les réglages et les zones, puis cliquez sur Calculer.','Choose the settings and regions, then click Calculate.'));return;}
 if(individualMode()&&!individualUI?.canRun(individualComparisonRectangles()))return;
 const queuedTool=activeAnalysis,queuedOperation=individualMode()?individualUI?.operation():activeAnalysis;
 autoRunTimer=setTimeout(async()=>{
  autoRunTimer=null;
  if(queuedTool!==activeAnalysis||queuedOperation!==(individualMode()?individualUI?.operation():activeAnalysis)||parameterSession?.pending||!fileInput||busy||energyViewBusy||elaPreviewBusy||drawing)return;
  if(queuedOperation!=='jpeg.multiple'){void run();return;}
  const file=fileInput,sourceIdentity=source,sourceRevision=revision,contextKey=plotSourceConstraintsKey();
  const current=()=>!destroyed&&queuedTool===activeAnalysis&&queuedOperation===(individualMode()?individualUI?.operation():activeAnalysis)&&file===fileInput&&sourceIdentity===source&&sourceRevision===revision&&contextKey===plotSourceConstraintsKey()&&!parameterSession?.pending&&!busy&&!energyViewBusy&&!elaPreviewBusy&&!drawing;
  if(!file||!current())return;
  if(queuedOperation==='jpeg.multiple'){
   let eligibility;try{eligibility=await jpegDctAutomaticPreflight({operation:queuedOperation,file,isRestricted:sourceDomainRestricted,isCurrent:current});}catch{if(current())status(autoText('Impossible de vérifier le fichier JPEG original pour le calcul automatique.','The original JPEG file could not be checked for automatic calculation.'));return;}
   if(!current()||eligibility.obsolete)return;
   if(!eligibility.allowed){status(eligibility.reason==='whole-original-required'?autoText('Cliquez sur Calculer pour analyser les blocs DCT entièrement admis dans les zones sélectionnées du JPEG original.','Click Calculate to analyse fully admitted DCT blocks in the selected regions of the original JPEG.'):autoText('Les coefficients DCT nécessitent un JPEG original. Choisissez la courbe de recompression pour cette image.','DCT coefficients require an original JPEG. Choose the recompression curve for this image.'));return;}
  }
  if(current())void run();
 },250);
 host.changed?.();
}

let layouts=null,profiles=[],pendingSettings=null,settingsReady=false;
let lang=new URLSearchParams(location.hash.slice(1)).get('lang')==='en'?'en':'fr';
let source=null,result=null,fileInput=null,imageId='',hash='',expectedHash='',regions=[],revision=0,worker=null,loaded=false,busy=false,pending=new Map(),seq=0;
let previousPresentation=null,presentedSurface=null,comparingOriginal=false,comparisonSource=null,comparisonBase=null,sourceRegionComparison=null,sourceRegionDisplayDomain=null;
const retainedDisplayReads=createRetainedDisplayReadOwner({capture:()=>({surface:result,revision,current:captureIndividualHeldPreviewOwner()}),isCurrent:owner=>!destroyed&&result===owner.surface&&revision===owner.revision&&owner.current()});
const sourceRegionPresentationSpaces=new WeakMap();
let destroyed=false;let regionController=null,regionParent=null,pendingScientificRegions=null;
const firstSourceFrame=createFirstSourceFrameGate({isCurrent:owner=>!destroyed&&source===owner.source&&fileInput===owner.file&&imageId===owner.imageId&&hash===owner.hash,onReady:owner=>{controls();if(owner.analysisRequested)queueAnalysis();},onPresented:owner=>host.onSourcePresented?.({imageId:owner.imageId,sourceSha256:owner.hash})});
function sourceFrameVisibilityChanged(){if(host.visible&&!host.visible())firstSourceFrame.background(source);}
function beginSourceFrame(){if(!host.managed){firstSourceFrame.clear();return;}firstSourceFrame.begin({source,file:fileInput,imageId,hash});sourceFrameVisibilityChanged();}
let pointerLoupe=null,loupeSettings={...loupeDefaults};
let zoom=1,offset={x:0,y:0},fittedCamera=null,drawing=false,draft=null,pointers=new Map(),gesture=null;
const tileCache=new TileCache((navigator.deviceMemory&&navigator.deviceMemory<=4?16:32)*1024**2,scheduleDraw);
const uiRGBBudget=Math.floor(resolveComputeProfile('aggressive').memoryBudgetBytes/3);
let exportController=null,storageEstimate=null,parameterWorkerPreparation=null,parameterWorkerBase=null;
function preparePaintedParameterWorker(surface){
 const ticket=parameterWorkerPreparation;if(!ticket||ticket.surface!==surface||busy||exportController)return;
 parameterWorkerPreparation=null;if(!ticket.isCurrent()||parameterSession?.pending||individualUI?.interactiveActive||individualUI?.interactivePending||drawing)return;
 void ticket.client.prepareParameterPreview(ticket.task,{expectedResult:ticket.output,isCurrent:ticket.isCurrent}).then(metrics=>{if(ticket.isCurrent())diagnostic({level:'info',kind:'parameter-preview.preparation',operation:ticket.task.operation,metrics});}).catch(error=>{if(ticket.isCurrent())diagnostic({level:'info',kind:'parameter-preview.preparation-unavailable',operation:ticket.task.operation,code:error?.code,message:error?.message});});
}
function rearmParameterWorkerAfterExport({client,source:clientSource,result:output}={}){
 const ticket=parameterWorkerBase;if(!ticket||ticket.client!==client||ticket.source!==clientSource||ticket.output!==output)return;
 parameterWorkerPreparation=ticket;scheduleDraw();
}
const temporarySessions=new Map();
const errorJournal=createErrorJournal();let lastIndividualProgress=null;
let resultMeta=null,params={...defaults},engineCapabilities=null,elaAutomatic=null;
const browserCapabilities={secureContext:isSecureContext,worker:typeof Worker!=='undefined',wasm:typeof WebAssembly!=='undefined',webgpuAPI:!!navigator.gpu,cpuThreadsHint:navigator.hardwareConcurrency||null};
const canvas=$('canvas'),ctx=canvas.getContext('2d'),view=$('viewport');
// The panel styles load asynchronously. Its display backing must never set
// the viewport's intrinsic height before those styles arrive.
if(view.style)view.style.position='relative';
if(canvas.style)Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%'});
const mainGraphics=watchCanvas2D(canvas,{onLost:()=>diagnostic({level:'warning',kind:'image-view.graphics-lost',metrics:{width:canvas.width,height:canvas.height}}),onRestored:()=>{diagnostic({level:'info',kind:'image-view.graphics-restored',metrics:{width:canvas.width,height:canvas.height}});scheduleDraw();}});
ocrTextLayer=createOcrTextLayer({document,parent:view,language:()=>lang});
const t=key=>strings[lang][key]||key;
function status(message){diagnostic({level:'info',kind:'operation.status',operation:activeAnalysis,message});$('status').textContent=localizeStatus(message,lang);host.changed?.();}
function localGet(key){if(host.managed)return null;return preferenceAccess.read('sherloq.'+key,key==='settings'?{recover:recoverSettings}:{}).value??null;}
function localSet(key,value){if(host.managed)return true;return preferenceAccess.write('sherloq.'+key,value);}
function translate(){
$('automatic-clone-window-label').textContent=lang==='fr'?'Analyser les zones ensemble':'Analyze regions together';for(const node of document.querySelectorAll('[data-all-sliders-label]'))node.textContent=lang==='fr'?'Tout en curseurs':'Sliders everywhere';const previous=$('status').textContent;for(const key of Object.keys(strings.fr)){if(previous===strings.fr[key]||previous===strings.en[key]){$('status').textContent=t(key);break;}}document.documentElement.lang=lang;$('language').value=lang;document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));renderCapabilities();renderRegions();renderToolTree();renderProfiles();energyUI?.translate();energyHistogramUI?.translate();syncElaAutomatic();syncAnalysisControls();individualUI?.translate?.();translateTaskActions();updateChrome();draw();}
function serialize(){const originalOptions=host.getOriginalSourceRegionOptions?.();return {schema:'sherloq.session/1',individual:individualUI?.serialize(),operation:host.sourceOnly?'original':individualMode()?activeAnalysis:automaticMode()?activeAnalysis:compositeMode()?'composite':energyMode?'ela.energy':'ela.classic',automatic:automaticSettings(),composite:compositeSettings(),energy:energyUI.bundle(),elaMode,params:{...params},regions:structuredClone(regions),...(regionController?.active()?{scientificRegions:regionController.serialize()}:{}),regionMode:$('zone-mode').value,sha256:hash||expectedHash,language:lang,sourceRegionsLocalOverride,...(originalOptions?{originalSourceRegionOptions:originalOptions}:{}),...(sourceRegionsSnapshot()?{sourceRegions:structuredClone(sourceRegionsSnapshot())}:{}),...(sourceRegionsSnapshot()?{originalSourceRegions:structuredClone(sourceRegionsSnapshot())}:{})};}
function activeElaAutomatic(){return elaAutomatic?.sourceSha256===hash&&Object.keys(defaults).every(key=>elaAutomatic.parameters[key]===params[key])?elaAutomatic:null;}
function syncElaAutomatic(){const active=activeElaAutomatic(),e=active?.estimate?.evidence;let detail='';if(active){const key=e?.status==='exact-IJG-table'?'elaAutoTables':e?.status==='IJG-compatible-statistical-trace'?'elaAutoPixels':e?.kind==='current-file-tables'?'elaAutoEquivalent':'elaAutoUncertain';detail=t(key)+(active.estimate.quality!==null||e?.kind==='current-file-tables'?' · '+active.parameters.quality:'');if(active.calibration?.status==='visibility-calibrated')detail+=' · '+t('elaAutoVisibility');}for(const id of ['ela-auto-detail','energy-ela-auto-detail'])if($(id))$(id).textContent=detail;}
function syncParams(){elaEqualizationMenu?.sync();for(const key of Object.keys(defaults))for(const id of [key,'energy-ela-'+key])if($(id))$(id)[typeof defaults[key]==='boolean'?'checked':'value']=params[key];syncElaAutomatic();}
function retireResult(preserve=true){
 retainedDisplayReads.discard();
 parameterWorkerBase=parameterWorkerPreparation=null;
 ocrTextLayer?.clear();
 const snapshot=preserve?result?.freeze?.():null;
 if(snapshot){rememberSourceRegionPresentationSpace(snapshot,sourceRegionPresentationSpaces.get(result));previousPresentation?.close?.();previousPresentation=snapshot;}
 if(!preserve){previousPresentation?.close?.();previousPresentation=null;comparisonSource?.close?.();comparisonSource=null;comparisonBase=null;sourceRegionComparison?.close?.();sourceRegionComparison=null;sourceRegionDisplayDomain=null;}
 result?.close?.();result=null;
}
const localMagnifier=()=>activeAnalysis==='inspection.magnifier'&&loupeSettings.enabled;
const processedSurface=()=>result??previousPresentation;
function adoptSourceRegionPresentation(output,task,owner){if(owner&&!sourceRegionTaskIsCurrent(owner))return false;const display=output?.sourceRegionSourceSurface;if(!display){if(wholeSourceFallbackTasks.has(task)){sourceRegionComparison?.close?.();sourceRegionComparison=null;sourceRegionDisplayDomain=null;}return;}if(sourceRegionComparison?.display?.id!==display.id){sourceRegionComparison?.close?.();sourceRegionComparison=remoteSurface(display);}sourceRegionDisplayDomain=structuredClone(output.sourceRegionDomain??task?.sourceRegionDomain??null);}
function comparisonSurface(){if(!host.sourceOnly&&sourceRegionComparison)return sourceRegionComparison;const shared=host.sourceInput?.()?.source;if(shared&&shared!==comparisonBase){comparisonSource?.close?.();comparisonBase=shared;comparisonSource=shared.fork?.(scheduleDraw);}return comparisonSource??source;}
const selectedSurface=()=>comparingOriginal||localMagnifier()?comparisonSurface():$('layer').value==='result'&&processedSurface()?processedSurface():(host.sourceOnly?source:sourceRegionComparison??source);
function invalidate({preserve=true}={}){energyHistogramUI?.update(null);clearZeroViewPresentation();parameterSession?.reset('source-change',{restoreResult:false});automaticD2Gesture?.reset('source-change');automaticD2Preview?.reset('source-change');energyHistogramVersion++;energyHistogramQueued=null;energyHistogramKey='';retireResult(preserve);releaseCompositeResult();$('composite-npz').disabled=true;clearTimeout(autoRunTimer);autoRunTimer=null;revision++;energyViewRevision++;energyUI?.cancelInteraction?.();for(const gesture of classicGestures)gesture.reset();elaPreviewVersion++;elaPreviewEpoch++;elaPreviewBusy=false;elaPreviewQueued=null;elaPreviewCommit=false;elaParameterDraft=false;elaParameterKind=null;energyPreviewed=false;energyViewPreview=null;energyUI?.resetBounds?.();$('energy-npz').disabled=true;$('energy-json').disabled=true;exportController?.abort();resultMeta=null;$('layer').value=previousPresentation?'result':'source';$('export-png').disabled=true;$('export-report').disabled=true;$('provenance').textContent='';draw();}
function setCompareOriginal(value){if(comparingOriginal===value)return;comparingOriginal=value;individualUI?.setOriginal(value||drawing||localMagnifier()||$('app').classList.contains('original-mode'));draw();}
const displayedZoom=()=>Math.round((pointerLoupe?.enabled?loupeScale(loupeSettings,zoom,localMagnifier()):zoom)*100);

function controls(){ if(!firstSourceFrame.pending(source)&&nativeControlOperation()&&source&&nativeControlConstraints?.key!==nativeControlConstraintsKey()&&nativeControlConstraintsErrorKey!==nativeControlConstraintsKey()&&(!nativeControlConstraintsPending||nativeControlConstraintsPending.key!==nativeControlConstraintsKey()))void refreshNativeControlConstraints();const nativeConstraintsBusy=nativeControlOperation()&&!!nativeControlConstraintsPending;if(!firstSourceFrame.pending(source)&&activeAnalysis==='colors.plots'&&source&&plotSourceConstraints?.key!==plotSourceConstraintsKey()&&plotSourceConstraintsErrorKey!==plotSourceConstraintsKey()&&!plotSourceConstraintsPending)void refreshPlotSourceConstraints();syncOcrTextLayer();host.changed?.();individualUI?.lock(busy||energyViewBusy||!!exportController||!!zeroViewPresentation||nativeConstraintsBusy||activeAnalysis==='colors.plots'&&!!plotSourceConstraintsPending,!!fileInput);for(const b of $('tool-tree').querySelectorAll('button'))b.disabled=busy&&!['original',activeAnalysis].includes(b.dataset.toolId);automaticControls();const locked=busy||energyViewBusy||!!exportController||!!zeroViewPresentation;const previewLock=elaProvisional()||parameterProvisional();energyHistogramUI?.lock(locked||previewLock||!!energyHistogramJob||!hasRetainedEnergy());if(previewLock)for(const id of ['export-png','export-report','energy-npz','energy-json'])$(id).disabled=true;for(const key of ['histogramLow','histogramHigh','shadow','highlight'])for(const suffix of ['','-number'])$('energy-'+key+suffix).disabled=busy||!!exportController;for(const key of ['quality','block','minimum','profile','view','opacity'])$('energy-'+key).disabled=busy||!!exportController;regionController?.refresh();if(regionParent)for(const c of regionParent.querySelectorAll('button,input'))c.disabled=locked||!fileInput||c.dataset.detectionUnavailable==='true';if(regionParent)regionParent.hidden=!(regionController?.active()&&fileInput);if(regionController?.active()&&fileInput){$('inspector').hidden=!!host.regionParent;$('zones').closest('section').hidden=true;}for(const id of ['composite-quality','composite-stage','composite-view'])$(id).disabled=locked;$('composite-run').disabled=!fileInput||locked;$('composite-cancel').disabled=!locked;$('composite-npz').disabled=!compositeResult||locked; $('run').disabled=!fileInput||locked; $('cancel').disabled=!(locked||previewLock); $('file').disabled=locked;$('open-file').disabled=locked;$('empty-open').disabled=locked; for(const k of Object.keys(defaults)){ $(k).disabled=locked;if($('energy-ela-'+k))$('energy-ela-'+k).disabled=locked;} $('energy-run').disabled=!fileInput||locked;$('energy-cancel').disabled=!(locked||previewLock);$('ela-mode').disabled=locked;for(const mode of ['classic','energy','biomes']){const tab=$('ela-tab-'+mode);if(tab)tab.disabled=busy||!!exportController||(mode==='classic'&&energyViewBusy);}for(const id of ['energy-score-field','energy-score-view','energy-score-threshold','energy-score-threshold-number'])$(id).disabled=busy||!!exportController;$('energy-score-run').disabled=!fileInput||locked;$('energy-score-cancel').disabled=!(locked||previewLock); for(const id of ['ela-auto','energy-ela-auto'])if($(id))$(id).disabled=locked||previewLock||!fileInput||!source;$('preset').disabled=locked; $('reset').disabled=locked;$('load-session').disabled=locked;$('compute-profile').disabled=locked;for(const id of ['task-zones','task-auto-zones','task-detect-subimages'])if($(id))$(id).disabled=!fileInput||locked;if($('task-run'))$('task-run').disabled=!fileInput||locked||nativeConstraintsBusy||(individualMode()&&!individualUI?.canRun(individualComparisonRectangles()));}
function cleanupTemporarySessions(){for(const session of temporarySessions.values())void removeTerminatedTemporarySession(session.id,session.backend).catch(()=>{});temporarySessions.clear();}
function stop({keepIndividual=false}={}){firstSourceFrame.clear();energyHistogramVersion++;energyHistogramQueued=null;energyHistogramKey='';const cancellingParameters=elaParameterDraft||elaPreviewBusy||elaPreviewCommit;elaPreviewVersion++;elaPreviewEpoch++;elaPreviewQueued=null;elaPreviewBusy=false;elaPreviewCommit=false;elaParameterDraft=false;elaParameterKind=null;lastScientificEnergy=lastScientificClassic=null;energyUI?.cancelInteraction?.();for(const gesture of classicGestures)gesture.reset();if(cancellingParameters){resultMeta=null;$('provenance').textContent='';$('export-report').disabled=true;}const cancellingEnergyView=!cancellingParameters&&(energyViewBusy||energyPreviewed);retireResult(!cancellingEnergyView);if(cancellingEnergyView)$('layer').value='source';stopIndividual({keepClient:keepIndividual});stopAutomatic();stopComposite();if(compositeMode()){result?.close?.();result=null;resultMeta=null;$('export-report').disabled=true;$('composite-detail').textContent='';}clearTimeout(autoRunTimer);autoRunTimer=null;revision++;$('energy-npz').disabled=true;$('energy-json').disabled=true;energyViewBusy=false;energyViewQueued=false;energyViewPreview=null;energyPreviewed=false;exportController?.abort();exportController=null;if(exportOwners.pending){retiringExportWorker??={worker,sessions:[...temporarySessions.values()]};temporarySessions.clear();worker=null;void retireExportWorker().catch(error=>console.warn('Export cleanup:',error));}else{worker?.terminate();worker=null;cleanupTemporarySessions();}loaded=false;for(const {reject} of pending.values())reject(Object.assign(new Error('Cancelled'),{code:'CANCELLED'}));pending.clear();busy=false;controls();$('export-png').disabled=!result;if(cancellingEnergyView||cancellingParameters)draw();}
function getWorker(){
 if(worker)return worker;
 const workerURL=new URL('./engine-worker.js?v=0.31.0',import.meta.url);let created;
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
  if(data.progress!==undefined){if(!data.progress||typeof data.progress!=='object'||Array.isArray(data.progress))throw workerMessageFailure('ela-client','message','invalid-progress');const fraction=renderProgress($('progress'),data.progress);status(progressText(t('running'),data.progress,{counts:false,language:lang})+(fraction===null?'':' · '+Math.round(100*fraction)+'%'));return;}
  if(data.error!==undefined){if(!data.error||typeof data.error.code!=='string'||typeof data.error.message!=='string')throw workerMessageFailure('ela-client','message','invalid-error-response');const error=deserializeEngineError(data.error);if(['module-load','engine-create'].includes(error.details?.phase)){fail(error);return;}diagnostic({level:'error',kind:'worker.request.failed',operation:activeAnalysis,action:call.action,error:serializeEngineError(error)});pending.delete(data.id);call.reject(error);return;}
  if(!Object.hasOwn(data,'result')||call.chunkBusy)throw workerMessageFailure('ela-client','message','invalid-result-response');pending.delete(data.id);call.resolve(data.result);
 },{label:'ela-client',onFailure:fail});
 created.onerror=event=>fail(new EngineError('WORKER_FAILED',event?.message||t('unavailable'),{cause:event?.error,details:{phase:loaded?'worker-execution':'worker-startup',workerURL:workerURL.href,workerEvent:{type:event?.type,filename:event?.filename,line:event?.lineno,column:event?.colno}}}));
 return created;
}
function request(action,payload,onChunk,displayRead){if(retiringExportWorker)return retireExportWorker().then(()=>request(action,payload,onChunk,displayRead));if(individualMode())return individualRequest(action,payload,displayRead);if(automaticMode())return automaticRequest(action,payload);return new Promise((resolve,reject)=>{
 const id=++seq;pending.set(id,{resolve,reject,onChunk,action,chunkSequence:0,chunkBusy:false});
 try{getWorker().postMessage({id,action,payload,options:{energy:energyMode,uiRGBBudgetBytes:uiRGBBudget,uiReserveBytes:tileCache.limit+32*1024**2+Math.ceil((globalThis.innerWidth||1920)*(globalThis.innerHeight||1080)*Math.min(devicePixelRatio||1,2)**2*8)+4*1024**2,computeProfile:$('compute-profile').value,resourceHints:{deviceMemoryGiB:navigator.deviceMemory,heapLimitBytes:performance.memory?.jsHeapSizeLimit,hardwareConcurrency:navigator.hardwareConcurrency}}});}
 catch(error){pending.delete(id);reject(error);}
});}
let displayFramePending=false;function scheduleDraw(){if(destroyed||displayFramePending)return;displayFramePending=true;requestAnimationFrame(()=>{displayFramePending=false;draw();});}
function remoteSurface(display,onFailure){const surface=createRemoteSurface(display,tileCache,(action,payload,displayRead)=>loaded?request(action,payload,undefined,displayRead):Promise.reject(Object.assign(Error('Source not loaded'),{code:'CANCELLED'})),scheduleDraw,onFailure??(error=>{if(error.code!=='CANCELLED')status(t('error')+' · '+error.message);}));observePreviewPresentation(surface,{adaptivePreview:display.adaptivePreview});return surface;}
function fit(){if(individualUI?.fit?.()){fittedCamera=null;return;}if(!source||!view.clientWidth||!view.clientHeight)return;const frame=selectedSurface()??source;zoom=Math.min(view.clientWidth/frame.width,view.clientHeight/frame.height)*.95;offset={x:(view.clientWidth-frame.width*zoom)/2,y:(view.clientHeight-frame.height*zoom)/2};fittedCamera={zoom,x:offset.x,y:offset.y,width:frame.width,height:frame.height};draw();}
function resizePanel(){const frame=selectedSurface()??source;if(activeAnalysis!=='colors.plots'&&fittedCamera&&frame?.width===fittedCamera.width&&frame?.height===fittedCamera.height&&zoom===fittedCamera.zoom&&offset.x===fittedCamera.x&&offset.y===fittedCamera.y)fit();else draw();individualUI?.redraw?.();}
function syncOcrTextLayer(surface=presentedSurface){ocrTextLayer?.update({presentation:surface?.display?.ocrPresentation,camera:{scale:zoom,x:offset.x,y:offset.y},enabled:activeAnalysis==='various.ocr'&&!!source&&surface===result&&!surface?.previewOnly&&!busy&&!individualCancelled&&!drawing&&!comparingOriginal&&!pointerLoupe?.enabled&&!parameterProvisional()&&!elaProvisional()&&!$('app').classList.contains('original-mode')&&$('layer').value==='result'});}
function draw(){
 if(destroyed)return;
 if(host.visible&&!host.visible()){sourceFrameVisibilityChanged();ocrTextLayer?.clear();return;}
 const dpr=Math.min(devicePixelRatio||1,2),w=view.clientWidth,h=view.clientHeight;
 if(!w||!h)return;
 // A lost oversized backing still needs to shrink when the layout settles.
 // Healthy frames keep their existing backing until prepare() is ready.
 if(mainGraphics.lost||ctx.isContextLost?.()){
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  return;
 }
 if(energyViewBusy&&!processedSurface()&&$('layer').value==='result'){$('legend').textContent=t('energyPreviousView');return;}
 const displayed=selectedSurface();
 if(pointerLoupe?.enabled&&displayed){zoom=Math.min(view.clientWidth/displayed.width,view.clientHeight/displayed.height)*.95;offset={x:(view.clientWidth-displayed.width*zoom)/2,y:(view.clientHeight-displayed.height*zoom)/2};}
 layouts?.draw();const bounds={left:-offset.x/zoom,top:-offset.y/zoom,right:(w-offset.x)/zoom,bottom:(h-offset.y)/zoom};
 let nextSurface=layouts&&layouts.mode!=='tabs'&&!comparingOriginal&&!localMagnifier()?processedSurface():displayed;
 if(nextSurface?.prepare&&!nextSurface.prepare(bounds,zoom*dpr)){
  if(nextSurface===result&&previousPresentation)nextSurface=previousPresentation;else{ocrTextLayer?.clear();return;}
 }else if(nextSurface===result&&previousPresentation){previousPresentation.close();previousPresentation=null;}
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 if(mainGraphics.lost||ctx.isContextLost?.())return;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 if(nextSurface){ctx.save();ctx.translate(offset.x,offset.y);ctx.scale(zoom,zoom);ctx.imageSmoothingEnabled=zoom<3;nextSurface.draw(ctx,bounds,zoom*dpr);
  drawRegionOverlay(ctx,nextSurface);
  ctx.restore();
 }
 if(mainGraphics.lost||ctx.isContextLost?.())return;
 presentedSurface=nextSurface;if(nextSurface===source)firstSourceFrame.presented(source);syncOcrTextLayer(nextSurface);
 if(nextSurface===result){reportPresentedPreview(nextSurface);preparePaintedParameterWorker(nextSurface);finishZeroViewPresentation(nextSurface);}
 $('analysis-state').hidden=individualMode()||!source||!!processedSurface()||$('app').classList.contains('original-mode');$('analysis-state').textContent=automaticMode()?autoText(busy?'Analyse automatique en cours…':'Prêt pour l’analyse automatique.',busy?'Automatic analysis running…':'Ready for automatic analysis.'):t(compositeMode()?(busy?'compositeComputing':'compositeWaiting'):(busy?'originalComputing':'originalPending'));
 $('zoom').value=displayedZoom()+'%';$('legend').textContent=zeroViewPresentation?zeroViewRendering():elaParameterDraft?t('elaDraftView'):energyViewBusy?t('energyPreviousView'):energyPreviewed?t('energyDraftView'):individualMode()?toolTitle(activeAnalysis,lang):automaticMode()&&$('layer').value==='result'&&result?automaticLegend():t($('layer').value==='result'&&processedSurface()?(compositeMode()?'compositeLegend':energyMode?(elaMode==='scores'?(energyUI?.presentation('scores').field==='both'?'energyScoreBothLegend':energyUI?.presentation('scores').field==='unified'?'energyScoreUnifiedLegend':'energyScoreLegend'):'energyLegend'):'resultLegend'):'legend');pointerLoupe?.draw();host.changed?.();
}

// Presentation metadata stays with the actual frame, including a frozen prior
// viewport; native display descriptors and source selections remain untouched.
function rememberSourceRegionPresentationSpace(frame,presentation){
 const value=typeof presentation==='string'?{coordinateSpace:presentation}:presentation;if(!frame||!value)return;
 const context={};if(typeof value.coordinateSpace==='string')context.coordinateSpace=value.coordinateSpace;else if(typeof value.coordinates==='string')context.coordinateSpace=value.coordinates;
 if(Array.isArray(value.sourceOrigin)&&value.sourceOrigin.length===2&&value.sourceOrigin.every(n=>Number.isSafeInteger(n)&&n>=0)){context.sourceOrigin=Object.freeze([...value.sourceOrigin]);if(value.clip===true)context.clip=true;}
 if(value.sourceContours===false)context.sourceContours=false;
 sourceRegionPresentationSpaces.set(frame,Object.freeze(context));
}
function sourceRegionPresentationOrigin(frame){
 const explicit=sourceRegionPresentationSpaces.get(frame)?.sourceOrigin;if(explicit)return[...explicit];
 const origin=sourceRegionDisplayDomain?.origin;
 if(host.sourceOnly||!frame||frame===source||!Array.isArray(origin)||origin.length!==2||!origin.every(v=>Number.isSafeInteger(v)&&v>=0))return[0,0];
 // A native result may already be restored to the full Original grid. The
 // analysis crop origin then describes inputs, not this canvas coordinate frame.
 const width=source?.width??sourceRegionDisplayDomain?.sourceWidth,height=source?.height??sourceRegionDisplayDomain?.sourceHeight;
 if(frame.width===width&&frame.height===height)return[0,0];
 return[...origin];
}
function drawRegionOverlay(c,frame=presentedSurface){
 const originalScope=host.sourceOnly?host.getOriginalSourceRegions?.():null;
 const highlight=host.sourceOnly?host.getOriginalRegionsHighlight?.():regionController?.highlight;
 const zoneItems=originalScope?originalScope.zones:regionController?.scope?.manual?.zones??regions;
 const zoneOrigin=sourceRegionPresentationOrigin(frame);
 const drawPoly=(poly,color,bright=false)=>{if(!poly?.length)return;c.beginPath();poly.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));if(poly.length>2)c.closePath();if(bright){c.fillStyle=color+'66';c.fill();c.strokeStyle='#ffffff';c.lineWidth=6/zoom;c.stroke();}c.strokeStyle=color;c.lineWidth=(bright?3:1.5)/zoom;c.stroke();};
 if(host.sourceOnly&&originalScope&&!originalScope.enabled)return;
 if(regionController?.mode==='biomes'){if(highlight?.kind==='biome'){const group=regionController.groups.find(g=>g.id===highlight.id);for(const p of group?.polygons??[])drawPoly(p,'#328cff',true);}return;}
 const presentation=sourceRegionPresentationSpaces.get(frame);if(presentation?.sourceContours===false||['frequency','frequency-grid','independent-native-frequency-grid','independent-native-frequency-atlas'].includes(presentation?.coordinateSpace))return;
 if(!originalScope&&!$('show-zones').checked&&!regionController?.active())return;
 const clipped=presentation?.clip===true;if(clipped)c.save();
 try{if(clipped){c.beginPath();c.rect(0,0,frame.width,frame.height);c.clip();}for(const r of [...zoneItems,...(draft?[draft]:[])]){if(r.enabled===false)continue;const color=r.kind==='exclusion'?'#f34d42':'#38cf8c',poly=r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];drawPoly(poly.map(([x,y])=>[x-zoneOrigin[0],y-zoneOrigin[1]]),color,highlight?.kind==='zone'&&highlight.id===r.id);}}
 finally{if(clipped)c.restore();}
}
const imageInteraction=e=>!e?.target?.closest?.('#tool-results,button,input,select,textarea,dialog');
function point(e){const r=view.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function imagePoint(p){const frame=selectedSurface()??source,origin=sourceRegionPresentationOrigin(frame);return{x:origin[0]+Math.max(0,Math.min(frame.width,Math.round((p.x-offset.x)/zoom))),y:origin[1]+Math.max(0,Math.min(frame.height,Math.round((p.y-offset.y)/zoom))) };}
function zoomAt(p,factor){if(pointerLoupe?.enabled){loupeSettings={...loupeSettings,zoom:Math.min(3600,Math.max(loupeMinimumZoom(loupeSettings,zoom,localMagnifier()),loupeScale(loupeSettings,zoom,localMagnifier())*100*factor))};pointerLoupe.set(effectiveLoupe());host.onLoupeChange?.(loupeSettings);draw();return;}if(individualUI?.zoomBy?.(factor))return;const next=Math.max(.02,Math.min(36,zoom*factor));offset={x:p.x-(p.x-offset.x)*next/zoom,y:p.y-(p.y-offset.y)*next/zoom};zoom=next;draw();}
function renderRegions(){regionController?.refresh();$('zones').replaceChildren();regions.forEach((r,i)=>{const li=document.createElement('li');li.textContent=`${i+1}${r.envelope?' · '+autoText('Enveloppe','Envelope'):''} · [${r.x0}, ${r.y0}] → [${r.x1}, ${r.y1}]`;const b=document.createElement('button');b.textContent='×';b.setAttribute('aria-label',t('clear')+' '+(i+1));b.onclick=()=>{regions.splice(i,1);renderRegions();draw();};li.append(b);$('zones').append(li);});}
async function openFile(file){
 if(!file)return;stop({keepIndividual:individualMode()});invalidate({preserve:false});fileInput=null;loaded=false;source?.close?.();source=null;hash='';energyHistogramUI?.update(null);elaAutomatic=null;syncElaAutomatic();$('file-info').textContent=t('noImage');$('empty').hidden=false;draw();busy=true;controls();status(t('loading'));const rev=revision;
 try{
  if(individualDisposing)await drainRetiredPanelClients('individual');if(automaticDisposing)await drainRetiredPanelClients('automatic');if(compositeDisposing)await compositeCleanup;if(rev!==revision)return;
  const id=crypto.randomUUID();
  engineCapabilities=await request('capabilities');if(rev!==revision)return;renderCapabilities();
  const descriptor=await request('load',{id,blob:file});if(rev!==revision)return;
  const digest=descriptor.sha256;
  if(expectedHash&&digest!==expectedHash)throw new Error(t('sessionMismatch'));
  if(restoring&&regions.some(r=>r.x1>descriptor.width||r.y1>descriptor.height))throw new Error('Region outside image');
  loaded=true;source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});fileInput=file;hash=digest;imageId=id;beginSourceFrame();individualUI?.setFile(file);expectedHash='';captureInheritedSourceRegions({sourceRegions:null},{sourceChanged:true});if(pendingSourceRegionsLocalOverride!==null)sourceRegionsLocalOverride=pendingSourceRegionsLocalOverride;else sourceRegionsLocalOverride=false;pendingSourceRegionsLocalOverride=null;
  if(!restoring)regions=[];regionController?.sourceChanged();$('file-info').textContent=`${file.name} · ${descriptor.width} × ${descriptor.height} · ${(file.size/1024**2).toFixed(2)} MiB`;$('empty').hidden=true;fit();host.onSourceNativeReady?.({file:fileInput,imageId,hash,source,description:$('file-info').textContent,...(sourceRegionsSnapshot()?{sourceRegions:structuredClone(sourceRegionsSnapshot())}:{})});
  if(pendingScientificRegions){const pendingRegions=pendingScientificRegions;await regionController?.restore(pendingRegions);if(rev!==revision)return;if(pendingScientificRegions===pendingRegions)pendingScientificRegions=null;regions=regionController.rectangles();}restoring=false;renderRegions();draw();status(t('ready'));
 }catch(e){if(rev===revision){worker?.terminate();worker=null;loaded=false;cleanupTemporarySessions();status(t('error')+' · '+errorText(e,lang));}}
 finally{if(rev===revision){busy=false;controls();if(fileInput)queueAnalysis();}}
}

let restoring=false;
function publishCalculationError(error,{operation,phase='calculation',parameters,view,backend,preserveResult=false}={}){
 const evidence=errorJournal.record(error,{operation,phase,parameters,view,backend,width:source?.width,height:source?.height,sourceSha256:hash});
 if(!preserveResult){retireResult(false);presentedSurface=null;$('layer').value='source';}
 resultMeta={...(preserveResult&&resultMeta?{...resultMeta,calculationStatus:resultMeta.calculationStatus??resultMeta.status}:{}),operation,status:'error',originalSha256:hash,error:evidence.error,context:evidence.context};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;translateTaskActions();status(t('error')+' · '+errorText(error,lang));
}
async function run(options={}){firstSourceFrame.cancelAnalysis();if(busy||energyViewBusy||elaPreviewBusy){if(elaParameterDraft)commitElaParameters();return;}if(drawing)setDrawing(false);if(individualMode())return runIndividual(options);if(automaticMode())return runAutomatic();if(compositeMode())return runComposite();clearTimeout(autoRunTimer);autoRunTimer=null;if(busy||energyViewBusy)return;if(!fileInput)return status(t('needImage'));const mode=$('zone-mode').value;if(mode==='pair'&&regions.length!==2)return status(t('pairError'));if(mode!=='whole')return status(t('unsupported'));const previousSize=processedSurface()??source,previousWidth=previousSize?.width,previousHeight=previousSize?.height;busy=true;controls();invalidate();
 // A native run retires the worker's prior result before it can fail. Only a
 // successfully accepted replacement may supply IDs to subsequent previews.
 lastScientificClassic=lastScientificEnergy=null;const rev=revision,sourceRegionOwner=sourceRegionTaskIdentity();let presentationClamped=false,submitted,energyRequest,calculationPhase='preparation';$('progress').value=0;status(t('running'));try{if(individualDisposing)await drainRetiredPanelClients('individual');if(automaticDisposing)await drainRetiredPanelClients('automatic');if(compositeDisposing)await compositeCleanup;if(rev!==revision)return;if(!loaded){engineCapabilities=await request('capabilities');if(rev!==revision)return;renderCapabilities();const descriptor=await request('load',{id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});$('tab-original').title='Engine RGB8';draw();}energyRequest=energyMode?prepareEnergyRequest():null;submitted=await bindSourceRegionTask({id:'ela-'+rev,imageId,operation:energyMode?'ela.energy':'ela.classic',params:energyMode?energyRequest.params:{...params},...(energyMode?{presentation:energyRequest.presentation}:{}),backend:requestedBackend({operation:energyMode?'ela.energy':'ela.classic',params:energyMode?energyRequest.params:params},{},getAdaptivePreferenceStore()),regions:[]});if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;calculationPhase='calculation';const output=await request('run',submitted);calculationPhase='presentation';if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;await acknowledgeSourceRegionTask(submitted,sourceRegionOwner);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;adoptSourceRegionPresentation(output,submitted,sourceRegionOwner);if(energyMode&&!energyUI.accept(output.data.metadata,energyRequest.token))return;if(energyMode){lastScientificEnergy={id:output.id,quality:output.data.contexts?.[0]?.nativeMetadata?.quality??output.data.metadata.quality,params:{...output.provenance.params},...(output.data.contextLayout?{emptyContexts:output.data.contexts.length===0}:{})};lastScientificClassic=null;energyHistogramUI?.setContexts(output.data.contexts??[],output.presentation?.sourceFragment);presentationClamped=energyUI.observePresentation?.(output.presentation)===true;}else{lastScientificClassic={id:output.id};lastScientificEnergy=null;}engineCapabilities=await request('capabilities');if(rev!==revision)return;renderCapabilities();retireResult();result=remoteSurface(output.display);const {pixels,display,...meta}=output;resultMeta={...meta,parameters:energyMode?output.provenance.params:{...params},capabilities:{browser:browserCapabilities,engine:engineCapabilities},ui:{version:'0.31.0',sourcePreview:'engine.readDisplay: bounded sampled frames; exact original retained',regionMode:'whole',sourceSha256:hash,...(activeElaAutomatic()?{elaAutomatic:activeElaAutomatic()}:{}),...(energyMode?{elaMode,...(elaMode==='scores'?{elaParameters:{...params},elaBaseSource:'classic'}:{}),presentation:{...energyRequest.presentation,...output.presentation}}:{}),memory:{rgbBudgetBytes:uiRGBBudget,retainedRGBBytes:(source?.byteLength||0)+(result?.byteLength||0),tileCacheBytes:tileCache.bytes,tileCacheLimitBytes:tileCache.limit,storageEstimate,storageBackend:'engine surface storage; original Blob retained without UI arrayBuffer copy',display:'complete viewport frames; sampled preview below 100%; analysis/export unchanged'}}};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('layer').value=$('app').classList.contains('original-mode')?'source':'result';$('export-png').disabled=false;$('export-report').disabled=false;$('energy-npz').disabled=!energyMode;$('energy-json').disabled=!energyMode;$('progress').value=1;if(!presentationClamped){if(result.width!==previousWidth||result.height!==previousHeight)fit();draw();status(sourceRegionCompletedStatus(output));}}catch(e){if(rev===revision){lastScientificClassic=lastScientificEnergy=null;if(e.code==='CANCELLED')status(t('cancelled'));else publishCalculationError(e,{operation:submitted?.operation??(energyMode?'ela.energy':'ela.classic'),phase:calculationPhase,parameters:submitted?.params??(energyMode?energyRequest?.params:{...params}),view:energyRequest?.presentation,backend:submitted?.backend??(energyMode?'auto':'cpu')});}}finally{if(rev===revision){busy=false;controls();if(presentationClamped&&resultMeta&&hasRetainedEnergy())void refreshEnergyView();else refreshEnergyHistogram();}}}
let localDownloadShelf;
function download(value,name,options){if(host.download)return host.download(value,name,options);localDownloadShelf??=createDownloadShelf({document,parent:$('toolbox'),before:$('toolbox').querySelector('.availability-note'),language:()=>lang,onError:error=>status(t('error')+' · '+error.message)});return localDownloadShelf.download(value,name,options);}
function exportJSON(value,name){return download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),name);}
async function restore(file){if(!file)return;try{if(file.size>1024**2)throw new Error('Session > 1 MiB');const v=JSON.parse(await file.text());if(v.schema!=='sherloq.session/1'||!['original','ela.classic','ela.energy','composite','analysis.complete','analysis.clones',...Object.keys(toolCatalog)].includes(v.operation))throw new Error('Unsupported session');const p=validParams(v.params),energy=validEnergySettings(v.energy),composite=validCompositeSettings(v.composite),automatic=validAutomaticSettings(v.automatic),restoredElaMode=v.operation==='ela.energy'?validElaMode(v.elaMode??'biomes'):'classic';if(!Array.isArray(v.regions)||v.regions.length>100)throw new Error('Invalid regions');for(const r of v.regions)if(!['x0','y0','x1','y1'].every(k=>Number.isInteger(r[k])&&r[k]>=0&&r[k]<100000)||r.x0>=r.x1||r.y0>=r.y1)throw new Error('Invalid region');if(!['whole','pair','cross','independent'].includes(v.regionMode))throw new Error('Invalid region mode');if(v.sha256&&!/^[a-f0-9]{64}$/.test(v.sha256))throw new Error('Invalid fingerprint');const restoredSourceRegions=v.sourceRegions?await validateOriginalSourceRegions(v.sourceRegions):null;if(restoredSourceRegions&&v.sha256&&restoredSourceRegions.sourceSha256!==v.sha256)throw new Error('Source-region session belongs to another image.');if(v.sourceRegionsLocalOverride!==undefined&&typeof v.sourceRegionsLocalOverride!=='boolean')throw new Error('Invalid local source region mode.');pendingSourceRegions=restoredSourceRegions;pendingSourceRegionsLocalOverride=v.sourceRegionsLocalOverride??!!v.scientificRegions?.scope;stop();invalidate({preserve:false});source?.close?.();source=null;fileInput=null;hash='';params=p;energyUI.load(energy);loadAutomaticSettings(automatic);for(const key of ['quality','stage','view'])$('composite-'+key).value=composite[key];individualUI?.restore(v.individual);activeAnalysis=toolCatalog[v.operation]?v.operation:v.operation.startsWith('analysis.')?v.operation:v.operation==='composite'?'composite':'ela.classic';setElaMode(restoredElaMode);chooseTool(activeAnalysis);regions=v.regions;pendingScientificRegions=v.scientificRegions??null;expectedHash=v.sha256||'';restoring=true;$('zone-mode').value=v.regionMode;$('preset').value='manual';syncParams();renderRegions();$('empty').hidden=false;$('file').value='';$('file-info').textContent=t('noImage');controls();status(t('restored'));}catch(e){status(t('error')+' · '+e.message);if(host.managed)throw e;}finally{$('load-session').value='';}}
$('language').onchange=()=>{lang=$('language').value;translate();};$('file').accept=imageAccept;
$('file').onchange=e=>openFile(e.target.files[0]);$('run').onclick=run;$('cancel').onclick=()=>{if(automaticMode()){if(automaticD2Preview?.pending)return cancelAutomaticD2Preview();if(automaticPresentationDraft)return cancelAutomaticOpacityPreview();return pauseAutomatic();}stop();$('progress').value=0;status(t('cancelled'));};
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
 if(busy||energyViewBusy||elaProvisional()||exportController||!fileInput||!source||individualMode()||automaticMode()||compositeMode())return;
 clearTimeout(autoRunTimer);autoRunTimer=null;const owner=sourceRegionTaskIdentity(),rev=revision,sourceId=imageId,sourceHash=hash,sourceWidth=source.width,sourceHeight=source.height;busy=true;controls();status(t('elaAutoEstimating'));
 try{
  // An adopted workspace display is ready for Auto even before its native
  // worker exists. Each await must retain this exact source and operation.
  if(individualDisposing){await drainRetiredPanelClients('individual');if(!sourceRegionTaskIsCurrent(owner))return;}
  if(automaticDisposing){await drainRetiredPanelClients('automatic');if(!sourceRegionTaskIsCurrent(owner))return;}
  if(compositeDisposing){await compositeCleanup;if(!sourceRegionTaskIsCurrent(owner))return;}
  if(!loaded){
   const capabilities=await request('capabilities');if(!sourceRegionTaskIsCurrent(owner))return;engineCapabilities=capabilities;renderCapabilities();
   const descriptor=await request('load',{id:sourceId,blob:owner.file});if(!sourceRegionTaskIsCurrent(owner))return;
   loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});$('tab-original').title='Engine RGB8';draw();
  }
  const submitted=await bindSourceRegionTask({});if(!sourceRegionTaskIsCurrent(owner))return;const domain=submitted.sourceRegionDomain??null,answer=await request('estimate-ela-auto',{imageId:sourceId,sourceSha256:sourceHash,params:{...params},...(domain?{sourceRegionDomain:domain}:{})});
  if(!sourceRegionTaskIsCurrent(owner))return;
  if(answer.imageId!==sourceId||answer.sourceSha256!==sourceHash||answer.width!==sourceWidth||answer.height!==sourceHeight)throw new EngineError('INVALID_INPUT','Automatic ELA estimate differs from its native source.');
  if(domain){const observed=await compileOriginalSourceRegions(answer.sourceRegionDomain),grid=answer.analysisGrid;if(observed.fingerprint!==domain.fingerprint||!grid||grid.width!==domain.width||grid.height!==domain.height||grid.origin?.[0]!==domain.origin[0]||grid.origin?.[1]!==domain.origin[1])throw new EngineError('SOURCE_REGIONS_INVALID','Automatic ELA estimate differs from its admitted source domain.');}
  else if(answer.sourceRegionDomain)throw new EngineError('SOURCE_REGIONS_INVALID','Automatic ELA estimate unexpectedly belongs to a restricted source domain.');
  if(!sourceRegionTaskIsCurrent(owner))return;const current=await analysisSourceDomain();if(!sourceRegionTaskIsCurrent(owner))return;
  if((domain?.fingerprint??null)!==(current?.fingerprint??null)){sourceRegionsStale=true;status(t('changed'));return;}
  const proposal=validParams(answer.parameters);busy=false;elaParameterKind='classic';beginElaParameters();params=proposal;elaAutomatic={...answer,sourceRegionFingerprint:domain?.fingerprint??null,parameters:{...proposal}};syncParams();$('preset').value='manual';persistSettings();
  diagnostic({level:'info',kind:'ela.auto.estimated',operation:'ela.classic',sourceSha256:hash,...(domain?{sourceRegionDomain:domain,analysisGrid:answer.analysisGrid}:{}),estimate:answer.estimate,calibration:answer.calibration,parameters:{...params}});commitElaParameters();
 }catch(error){if(sourceRegionTaskIsCurrent(owner))status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+errorText(error,lang));}
 finally{if(rev===revision){busy=false;controls();}}
}
for(const id of ['ela-auto','energy-ela-auto'])if($(id))$(id).onclick=estimateClassicAuto;
function parameterGestureIdentity(event={}){return Number.isSafeInteger(event.gestureEpoch)&&event.gestureEpoch>0?{gestureEpoch:event.gestureEpoch,controlRequestId:event.controlRequestId,lastAdmittedInput:event.lastAdmittedInput}:{};}
const elaHeldOwners=createLocalHeldPreviewOwners(),energyHeldOwners=createLocalHeldPreviewOwners();let energyViewFrame=null;
function captureElaHeldOwner(){const owner=sourceRegionTaskIdentity(),sourceOwner=source,fileOwner=fileInput,workerOwner=worker,rev=revision,epoch=elaPreviewEpoch,mode=elaMode,nativeEnergy=lastScientificEnergy,nativeClassic=lastScientificClassic,controller=regionController,scope=controller?.scope,scopeFingerprint=scope?.fingerprint,scopeActive=!!controller?.active?.(),scopeScientific=!!controller?.scientificActive?.(),snapshot=sourceRegionsSnapshot(),snapshotFingerprint=snapshot?.fingerprint,local=sourceRegionsLocalOverride;return()=>!destroyed&&!sourceRegionsStale&&worker===workerOwner&&!!workerOwner&&source===sourceOwner&&fileInput===fileOwner&&revision===rev&&elaPreviewEpoch===epoch&&elaMode===mode&&lastScientificEnergy===nativeEnergy&&lastScientificClassic===nativeClassic&&regionController===controller&&controller?.scope===scope&&scope?.fingerprint===scopeFingerprint&&!!controller?.active?.()===scopeActive&&!!controller?.scientificActive?.()===scopeScientific&&sourceRegionsSnapshot()===snapshot&&snapshot?.fingerprint===snapshotFingerprint&&sourceRegionsLocalOverride===local&&sourceRegionTaskIsCurrent(owner);}
function elaHeldSettings(action){const prepared=prepareEnergyRequest();return{action,mode:elaMode,params:action==='preview-classic'?{...params}:{...prepared.params},presentation:action==='preview-classic'?{}:{...prepared.presentation},context:energyContextSelection()};}
function energyHeldSettings(){return{mode:elaMode,params:prepareEnergyRequest().params,presentation:energyUI.presentation(elaMode),context:energyContextSelection()};}
function queueElaParameterPreview(gestureEvent){
 if(!loaded||!worker||!fileInput||busy||individualMode()||automaticMode()||compositeMode())return;
 const preview={adaptive:true,...(elaAdaptiveFeedback?{adaptiveFeedback:elaAdaptiveFeedback}:{})};let job;
 if(energyMode&&elaParameterKind!=='classic'){if(!lastScientificEnergy)return;const prepared=prepareEnergyRequest();energyHistogramUI?.markers(prepared.params,resultMeta?.data?.metadata,{draft:true});job={action:'preview-energy-parameters',payload:{resultId:lastScientificEnergy.id,...energyContextSelection(),params:{...prepared.params},presentation:{...prepared.presentation},preview}};}
 else job={action:'preview-classic',payload:{imageId,...(lastScientificClassic?.id?{resultId:lastScientificClassic.id}:{}),params:{...params},preview}};
 if(Number.isSafeInteger(gestureEvent?.gestureEpoch)&&gestureEvent.gestureEpoch>0){job.gesture={...gestureEvent};const held=gestureEvent.field.replace(/^energy-ela-|^energy-/,'').replace(/-number$/,''),nativeOwner=captureElaHeldOwner();job.frame=elaHeldOwners.own(job.gesture,{settings:elaHeldSettings(job.action),heldPath:['params',held],getSettings:()=>elaHeldSettings(job.action),isCurrent:()=>elaParameterDraft&&!elaPreviewCommit&&nativeOwner()});}elaPreviewQueued=job;elaPreviewCommit=false;elaPreviewVersion++;void pumpElaParameterPreview();
}
async function pumpElaParameterPreview(){
 if(!elaParameterDraft||elaPreviewCommit){elaPreviewQueued=null;return;}
 if(elaPreviewBusy||energyViewBusy||busy||!elaPreviewQueued)return;
 elaPreviewBusy=true;controls();const rev=revision,epoch=elaPreviewEpoch,sourceId=imageId;
 try{while(elaPreviewQueued&&rev===revision&&epoch===elaPreviewEpoch&&elaParameterDraft&&!elaPreviewCommit){
  const job=elaPreviewQueued,version=elaPreviewVersion;elaPreviewQueued=null;
  const submitted=await bindSourceRegionTask({operation:job.action==='preview-classic'?'ela.classic':'ela.energy',params:job.payload.params}),domain=submitted.sourceRegionDomain;if(rev!==revision||epoch!==elaPreviewEpoch||sourceId!==imageId)return;if(sourceRegionsStale){continue;}
  let answer;try{answer=await request(job.action,{...job.payload,...(domain?{sourceRegionDomain:domain}:{})});}catch(error){if(rev!==revision||epoch!==elaPreviewEpoch)return;if(version!==elaPreviewVersion)continue;if(error.code==='DRAFT_BASE_MISMATCH'){status(t('elaDraftView'));continue;}throw error;}
  if(rev!==revision||epoch!==elaPreviewEpoch||sourceId!==imageId)return;if(!elaParameterDraft||elaPreviewCommit||sourceRegionsStale||(job.frame?!job.frame.isCurrent():version!==elaPreviewVersion))continue;
  if(job.action==='preview-classic'&&(answer.sourceRegionDomain?.fingerprint??null)!==(domain?.fingerprint??null))throw new EngineError('SOURCE_REGIONS_INVALID','The provisional image differs from its admitted source region.');
  if(domain)sourceRegionDisplayDomain=structuredClone(domain);
  // Complete drafts advance monotonically while inputs replace only the next
  // job. Their bounded RGB snapshot survives later worker display revisions.
  diagnostic({level:'info',operation:elaParameterKind==='classic'?'ela.classic':'ela.energy',sourceSha256:hash,parameters:job.payload.params,requestedParameters:job.payload.params,calculatedParameters:answer.presentation?.params??answer.draft?.params??job.payload.params,latestRequestedParameters:job.frame?.latest().params??job.payload.params,requestedView:job.payload.presentation??{},calculatedView:answer.presentation??{},latestRequestedView:job.frame?.latest().presentation??job.payload.presentation??{},presentation:answer.presentation,metrics:answer.metrics??answer.draft,provisional:true,...job.gesture,gestureKind:job.gesture?.kind,kind:'ela.preview.displayed'});const next=createPreviewSurface(answer.pixels,{document});next.previewOnly=true;next.parameterPreviewCurrent=job.frame?.isCurrent??(()=>rev===revision&&epoch===elaPreviewEpoch&&elaParameterDraft&&!elaPreviewCommit&&version===elaPreviewVersion);observePreviewPresentation(next,answer.metrics??answer.draft);retireResult();result=next;$('layer').value=$('app').classList.contains('original-mode')?'source':'result';draw();status(autoText('Aperçu provisoire','Provisional preview'));
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
 const control=$(id);if(!control)continue;let newGestureIntent=false;const takeInputControl=()=>{const newIntent=newGestureIntent;newGestureIntent=false;takeManualControl({newIntent});};const gesture=bindElaPreviewGesture(control,{onDiagnostic:value=>diagnostic({level:'info',kind:'parameter-preview.gesture',operation:elaMode==='classic'?'ela.classic':'ela.energy',field:id,metrics:value}),begin:()=>{newGestureIntent=true;},commitUnchanged:false,preview:event=>queueElaParameterPreview({field:id,...event}),finish:commitElaParameters});classicGestures.push(gesture);
 control.addEventListener('beforeinput',e=>{if(!control.disabled&&/^(insert|delete)/.test(e.inputType||''))newGestureIntent=true;},{capture:true});
 control.oninput=event=>{if(control.disabled||!updateClassicValue(key,control))return;takeInputControl();syncParams();persistSettings();if(gesture.active)gesture.markChanged(event);};
 control.onchange=event=>{if(!updateClassicValue(key,control)){syncParams();if(!gesture.active)commitElaParameters();return;}takeInputControl();syncParams();persistSettings();if(gesture.active)gesture.markChanged(event);else commitElaParameters();};
 control.addEventListener('blur',()=>{if(control.dataset?.hoverSliderActive==='true')return;if(!updateClassicValue(key,control))syncParams();if(!gesture.active)commitElaParameters();});
 bindSliderReset(control,defaults[key]);
}
for(const key of ['linear','grayscale'])for(const id of [key,'energy-ela-'+key])if($(id))$(id).onchange=()=>{try{params=validParams({...params,[key]:$(id).checked});syncParams();$('preset').value='manual';if(elaMode==='scores'){takeManualControl();commitElaParameters();}else{invalidate();status(t('changed'));queueAnalysis();}}catch(e){syncParams();status(t('error')+' · '+e.message);}};
const elaEqualizationHost=document.createElement('div');elaEqualizationHost.className='ela-equalization';$('linear').closest('label').after(elaEqualizationHost);
const elaEqualizationMenu=mountEqualizationMenu(elaEqualizationHost,{getState:()=>equalizationState(params.equalization),language:()=>lang,disabled:()=>busy,onChange:(state,phase)=>{
 params=validParams({...params,equalization:state});$('preset').value='manual';persistSettings();if(phase!=='input'){invalidate();status(t('changed'));queueAnalysis();}
}});
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
view.addEventListener('dblclick',e=>{if(pointerLoupe?.enabled)return;if(!imageInteraction(e)||e.button!==0||drawing||!source||(layouts?.mode!=='tabs'&&!result))return;e.preventDefault();if(regionController?.active()&&!viewerCameraIsFitted({scale:zoom,x:offset.x,y:offset.y},selectedSurface()??source,{width:view.clientWidth,height:view.clientHeight})){fit();return;}if(regionController?.active()){const local=point(e),p={x:(local.x-offset.x)/zoom,y:(local.y-offset.y)/zoom};void regionController.resetAt(p).then(reset=>{if(!reset)fit();}).catch(error=>status(t('error')+' · '+error.message));return;}if(energyMode&&elaMode==='scores'&&energyUI.presentation('scores').field==='both'&&selectedSurface()!==source){fit();return;}const c=doubleClickCamera({scale:zoom,x:offset.x,y:offset.y},selectedSurface()??source,{width:view.clientWidth,height:view.clientHeight},point(e));zoom=c.scale;offset={x:c.x,y:c.y};draw();});
view.onpointerdown=e=>{if(pointerLoupe?.enabled&&!drawing)return;if(!imageInteraction(e)||e.button!==0||!source||(layouts?.mode!=='tabs'&&!result))return;view.setPointerCapture(e.pointerId);const p=point(e);pointers.set(e.pointerId,p);if(pointers.size===2){draft=null;const [a,b]=[...pointers.values()];gesture={distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};}else if(drawing){const q=imagePoint(p);draft={id:crypto.randomUUID(),x0:q.x,y0:q.y,x1:q.x,y1:q.y};gesture={origin:q};}else gesture={pan:p};};
view.onpointermove=e=>{if(!pointers.has(e.pointerId))return;const p=point(e);pointers.set(e.pointerId,p);if(pointers.size===2){const[a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y),center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(gesture?.distance){zoomAt(gesture.center,distance/Math.max(1,gesture.distance));offset.x+=center.x-gesture.center.x;offset.y+=center.y-gesture.center.y;}gesture={distance,center};}else if(draft&&gesture?.origin){const q=imagePoint(p),a=gesture.origin;draft={...draft,x0:Math.min(a.x,q.x),y0:Math.min(a.y,q.y),x1:Math.max(a.x,q.x),y1:Math.max(a.y,q.y)};}else if(gesture?.pan){offset.x+=p.x-gesture.pan.x;offset.y+=p.y-gesture.pan.y;gesture.pan=p;}draw();};
function endPointer(e){pointers.delete(e.pointerId);if(draft){if(draft.x1>draft.x0&&draft.y1>draft.y0&&regions.length<100)regions.push(draft);draft=null;renderRegions();}gesture=pointers.size?{pan:[...pointers.values()][0]}:null;draw();}view.onpointerup=endPointer;view.onpointercancel=()=>{pointers.clear();gesture=null;draft=null;draw();};
view.onkeydown=e=>{if(!imageInteraction(e))return;if(host.sourceOnly&&host.onOriginalRegionsKeydown?.(e))return;if(!host.managed&&e.code==='Space'&&source){e.preventDefault();$('layer').value=$('layer').value==='source'&&result?'result':'source';individualUI?.setOriginal($('layer').value==='source'||comparingOriginal||drawing||localMagnifier()||$('app').classList.contains('original-mode'));draw();}if(e.key==='Escape')setDrawing(false);if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();regions.pop();renderRegions();draw();}};
pointerLoupe=createPointerLoupe(view,{baseCanvas:canvas,getSurface:()=>presentedSurface,getCamera:()=>({scale:zoom,x:offset.x,y:offset.y}),canInteract:e=>!drawing&&!globalThis.document.querySelector('dialog[open]:not(#loupe-dialog)')&&imageInteraction(e)&&(!host.visible||host.visible()),onZoom:value=>{if(localMagnifier()){setLoupeEffectsContext(value.effects);value={...value,effects:loupeSettings.effects};}loupeSettings=value;host.onLoupeChange?.(value);draw();},effectsAllowed:()=>!comparingOriginal,keepVisibleAtMinimum:()=>localMagnifier(),onEffectsState:value=>{host.onLoupeEffectsState?.(value);if(value.error)status(autoText('Loupe : le traitement n’a pas abouti. ','Magnifier: processing failed. ')+value.error.message);},onPresented:value=>host.onLoupePresented?.(value),onSweepChange:value=>host.onLoupeSweepChange?.(value),onError:()=>status(autoText('La loupe nécessite WebGL dans ce navigateur.','The magnifier requires WebGL in this browser.'))});
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
  let options,output;
  const progress=event=>{if(rev===revision){renderProgress($('progress'),event);status(progressText(t('exporting'),event,{language:lang}));}};
  try{
   options=rasterOptions(settings.resize?{...settings,...linkedExportSize(settings,target)}:settings,source?.display?.chroma??engineCapabilities?.sourceChroma);
   if(individualMode()&&target.display?.id&&!target.display.pixels&&!target.display.m2Result&&!target.display.cloneView&&!target.display.biomePresentation&&!target.display.dtdPresentation&&!target.display.comprintPresentation&&!target.display.retainedParameterView){output=await(await ensureIndividualClient()).export(options.format,target.display,options);}
   else if(!individualMode()&&!automaticMode()&&!compositeMode()){
    await exportOwners.retryFailed();const owner=exportOwners.begin();try{const sink=await owner.open(createExportSink,{memoryBudgetBytes:uiRGBBudget,signal:controller.signal,mime:'image/'+options.format});const answer=await request('export-raster',{display:target.display,options},chunk=>sink.write(chunk));output={...owner.borrow(owner.finish(sink,await sink.finish())),descriptor:answer.descriptor};}catch(error){await owner.fail(error);}
   }else{
    const owner=automaticMode()?automaticClient:individualMode()?await ensureIndividualClient():compositeClient;
    const scope=exportSinkScopeFor(owner);await scope.retryFailed();const exportOwner=scope.begin();try{output=exportOwner.borrow(await exportPresentationRaster(target,options,{reserve:bytes=>owner.reserveExport(bytes,target.display),signal:controller.signal,onProgress:progress,onOwner:exportOwner.adopt}));}catch(error){await exportOwner.fail(error);}
   }
   if(rev===revision&&!controller.signal.aborted){await download(output,analysisImageFilename(exportMeta,{fallbackOperation:exportOperation,format:options.format,original:host.sourceOnly||target===source}),{signal:controller.signal});status(t('done'));}
   else await output?.cleanup?.();
  }catch(error){if(output&&!error?.downloadOwnershipTransferred)try{await output.cleanup?.();}catch(secondary){error=withDownloadCleanupFailure(error,secondary);}if(rev===revision){if(error?.code!=='CANCELLED'){errorJournal.record(error,{operation:'export.image',format:options?.format??settings.format,width:target.width,height:target.height});translateTaskActions();}status(error?.code==='CANCELLED'?t('cancelled'):t('error')+' · '+errorText(error,lang));}}
  finally{if(exportController===controller){exportController=null;controls();$('export-png').disabled=!result;if(parameterWorkerPreparation)scheduleDraw();}}
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
function persistSettings(){if(destroyed)return true;if(!settingsReady)return true;if(!canPersistSettingsDraft($))return true;return localSet('settings',settingsBundle());}
function applySettings(v){
 stop();invalidate();individualUI?.restore(v.individual);loadAutomaticSettings(v.automatic);const composite=v.composite||{quality:0,stage:'map',view:'map'};for(const key of ['quality','stage','view'])$('composite-'+key).value=composite[key];energyUI?.load(v.energy);profiles=v.profiles;params=v.current;const q=v.preferences;setElaMode(q.elaMode??'classic');if($('all-sliders'))$('all-sliders').checked=q.allSliders===true;hoverSliders?.setEnabled(q.allSliders===true);$('highlight-new-features').checked=q.highlightNewFeatures===true;applyHighlights();theme=q.theme;lang=q.language;
 $('compute-profile').value=q.computeProfile;$('navigation-mode').value=q.navigationMode||'auto';$('zone-mode').value=q.regionMode;$('show-zones').checked=q.showZones;
 $('favorite').setAttribute('aria-pressed',String(q.favorite));$('app').classList.toggle('tools-hidden',!q.toolsVisible);$('toggle-tools').setAttribute('aria-pressed',String(q.toolsVisible));
 $('inspector').hidden=!q.inspectorVisible;$('toggle-inspector').setAttribute('aria-expanded',String(q.inspectorVisible));
 layouts.set(q.layout);renderProfiles();$('preset').value=v.activeProfile;syncParams();translate();queueAnalysis();
}
function applyHighlights(){$('app').classList.toggle('highlight-new-features',$('highlight-new-features').checked);}
if($('all-sliders'))$('all-sliders').onchange=()=>{hoverSliders?.setEnabled($('all-sliders').checked);persistSettings();};
$('highlight-new-features').onchange=()=>{applyHighlights();persistSettings();};
function downloadSettings(){exportJSON({...settingsBundle(),adaptiveRuntime:getAdaptivePreferenceStore().exportSettings(),exportedAt:new Date().toISOString()},settingsFilename());}
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
$('confirm-import').onclick=()=>{if(!pendingSettings)return;importAdaptiveSettings(pendingSettings);applySettings(pendingSettings);pendingSettings=null;$('import-dialog').close();status(t(persistSettings()?'settingsRestored':'storageUnavailable'));};
$('close-all').onclick=()=>$('close-dialog').showModal();
$('confirm-close').onclick=()=>{
 persistSettings();stop();$('close-dialog').close();invalidate({preserve:false});
 individualUI?.hideResult();void individualClient?.release().catch(error=>{if(error.code!=='CANCELLED')console.warn('Tool result cleanup:',error);});
 regions=[];pointers.clear();gesture=null;draft=null;drawing=false;
 $('draw').setAttribute('aria-pressed','false');view.classList.remove('drawing');renderRegions();
 chooseTool('original');$('progress').value=0;controls();status(t('ready'));
};
if($('energy-histograms'))energyHistogramUI=createEnergyHistogramUI({root:document,document,t,contextHost:$('energy-presentation'),onSelection:energyContextChanged});
energyUI=createEnergyUI({$,t,persist:persistSettings,changed:(calculate=true,options={})=>{if(options.cancel){clearTimeout(autoRunTimer);autoRunTimer=null;elaPreviewVersion++;elaPreviewEpoch++;elaPreviewQueued=null;elaParameterDraft=elaPreviewCommit=false;elaParameterKind=null;if(hasRetainedEnergy())void refreshEnergyView();controls();return;}if(options.intent||options.preview||options.commit){elaParameterKind='energy';beginElaParameters({newIntent:options.intent===true});if(options.preview)queueElaParameterPreview(options.gesture);if(calculate)commitElaParameters();return;}if(elaParameterDraft){commitElaParameters();return;}if(busy||energyViewBusy)stop();invalidate();status(t('changed'));if(calculate)queueAnalysis();},viewChanged:refreshEnergyView});
$('ela-mode').value='classic';
for(const [tabId,mode]of [['classic','classic'],['energy','scores'],['biomes','biomes']]){const tab=$('ela-tab-'+tabId);if(tab)tab.onclick=()=>{if(!tab.disabled&&elaMode!==mode){$('ela-mode').value=mode;$('ela-mode').onchange();}};}
function setElaMode(value){elaMode=validElaMode(value);energyMode=elaMode!=='classic';for(const [tabId,mode]of [['classic','classic'],['energy','scores'],['biomes','biomes']])$('ela-tab-'+tabId)?.setAttribute('aria-selected',String(elaMode===mode));$('ela-mode').value=elaMode;$('classic-controls').hidden=energyMode;$('energy-controls').hidden=!energyMode;$('energy-score-controls').hidden=elaMode!=='scores';if($('energy-ela-controls'))$('energy-ela-controls').hidden=elaMode!=='scores';$('energy-biome-controls').hidden=elaMode!=='biomes';$('energy-biome-presentation').hidden=elaMode!=='biomes';$('energy-presentation').hidden=!energyMode||compositeMode();controls();}
function setEnergyMode(enabled){setElaMode(enabled?'biomes':'classic');}
function prepareEnergyRequest(mode=elaMode){const prepared=energyUI.prepare(mode);return mode==='scores'?{...prepared,params:{...prepared.params,quality:params.quality}}:prepared;}
function retainedEnergyQualityMatches(requested){const native=lastScientificEnergy;if(native?.emptyContexts)return requested.quality===native.params.quality; if(!native||!Number.isInteger(native.quality)||!native.params)return false;const q=requested.quality===0?(native.params.quality===0?native.quality:null):requested.quality;return q===native.quality;}
function retainedEnergyMatches(requested,mode=elaMode){
 const native=lastScientificEnergy;if(native?.emptyContexts)return ['quality','block','minimum','profile',...(requested.profile==='manual'?['histogramLow','histogramHigh','shadow','highlight']:[])].every(key=>requested[key]===native.params[key]);if(!native||!Number.isInteger(native.quality)||native.quality<1||native.quality>100)return false;
 const stored=native.params;if(!stored)return false;const q=requested.quality===0?(stored.quality===0?native.quality:null):requested.quality;if(q!==native.quality)return false;
 const keys=['block','minimum','profile',...(requested.profile==='manual'?['histogramLow','histogramHigh','shadow','highlight']:[])];return keys.every(key=>requested[key]===stored[key]);
}
function finishElaParameters(){if(elaMode==='scores'&&elaParameterKind==='classic'){const prepared=prepareEnergyRequest();if(retainedEnergyMatches(prepared.params)){void finishEnergyEla();return;}diagnostic({level:'info',kind:'ela.energy.base.changed',operation:'ela.energy',sourceSha256:hash,previousQuality:lastScientificEnergy?.quality??null,requestedQuality:params.quality,parameters:prepared.params,state:'native-pending'});}queueAnalysis();}
async function finishEnergyEla(){
 if(elaPreviewBusy||energyViewBusy||busy||!elaPreviewCommit||!resultMeta)return;
 const prepared=prepareEnergyRequest(),rev=revision,epoch=elaPreviewEpoch,id=lastScientificEnergy.id,elaParams={...params};energyViewBusy=true;controls();status(t('energyRendering'));
 let retry=false,superseded=false;diagnostic({level:'info',kind:'ela.energy.presentation.commit',operation:'ela.energy',sourceSha256:hash,baseResultId:id,elaParameters:elaParams,scientificParameters:prepared.params,state:'rendering'});
 try{const answer=await request('commit-energy-ela',{imageId,resultId:id,...energyContextSelection(),params:elaParams,energyParams:prepared.params,presentation:prepared.presentation});if(rev!==revision||epoch!==elaPreviewEpoch||!elaPreviewCommit){superseded=rev===revision&&elaPreviewCommit;return;}
  retireResult();result=remoteSurface(answer.display);elaParameterDraft=false;elaPreviewCommit=false;elaParameterKind=null;energyPreviewed=false;resultMeta.ui.elaMode=elaMode;resultMeta.ui.elaParameters=elaParams;resultMeta.ui.elaBaseSource='classic';diagnostic({level:'info',kind:'ela.energy.presentation.commit',operation:'ela.energy',sourceSha256:hash,baseResultId:id,elaParameters:elaParams,state:'done',reusedNativeEnergy:true,nativeRun:false});resultMeta.ui.presentation={...prepared.presentation,...answer.presentation};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('layer').value=$('app').classList.contains('original-mode')?'source':'result';draw();status(sourceRegionCompletedStatus(resultMeta));
 }catch(error){if(rev===revision){if(epoch!==elaPreviewEpoch||!elaPreviewCommit)superseded=elaPreviewCommit;else if(error.code==='ENERGY_BASE_CHANGED')retry=true;else status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+errorText(error,lang));}}
 finally{if(rev===revision){energyViewBusy=false;controls();if(!elaProvisional()){for(const name of ['export-png','export-report','energy-npz','energy-json'])$(name).disabled=false;}if(superseded&&elaPreviewCommit)finishElaParameters();else if(retry)queueAnalysis();else if(energyViewQueued&&!elaParameterDraft)void refreshEnergyView({preview:energyViewPreview});else if(elaPreviewQueued)void pumpElaParameterPreview();}}
}
function energyContextSelection(){const sourceFragment=energyHistogramUI?.selected().sourceFragment,planFingerprint=resultMeta?.data?.metadata?.contextPlanFingerprint;return planFingerprint?{...(sourceFragment?{sourceFragment}:{}),planFingerprint}:{};}
function energyContextChanged(selection){const context=resultMeta?.data?.contexts?.find(c=>c.id===selection.sourceFragment);if(context&&lastScientificEnergy&&selection.sourceFragment!==resultMeta?.ui?.presentation?.sourceFragment){lastScientificEnergy.quality=context.nativeMetadata.quality;energyUI?.resetBounds?.();energyViewRevision++;energyHistogramVersion++;energyHistogramQueued=null;energyHistogramKey='';void refreshEnergyView();}else refreshEnergyHistogram();}
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
   const answer=await request('energy-histogram',{resultId:ticket.id,imageId:ticket.imageId,...energyContextSelection(),...selected});
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
 if(!options.preview){energyHeldOwners.reset();energyViewFrame=null;}else if(options.gesture){const nativeOwner=captureElaHeldOwner(),held=options.gesture.field==='energy-opacity'?'opacity':'threshold';energyViewFrame=energyHeldOwners.own(options.gesture,{settings:energyHeldSettings(),heldPath:['presentation',held],getSettings:energyHeldSettings,isCurrent:()=>!elaParameterDraft&&nativeOwner()});}
 if(elaParameterDraft){if(elaParameterKind==='classic'&&elaPreviewCommit){energyViewQueued=true;energyViewPreview=options.preview??null;energyViewRevision++;}else queueElaParameterPreview();return;}if(!energyMode||!resultMeta||busy)return;if(!hasRetainedEnergy()){status(t('energyRecompute'));return;}energyViewQueued=true;energyViewPreview=options.preview??null;energyViewRevision++;
 if(energyViewBusy)return;energyViewBusy=true;controls();const rev=revision,previousSize=processedSurface()??source;let previousWidth=previousSize?.width,previousHeight=previousSize?.height;
 try{retireResult();draw();status(t('energyRendering'));while(energyViewQueued&&rev===revision&&resultMeta){energyViewQueued=false;const viewRev=energyViewRevision,presentation=energyUI.presentation(elaMode),id=resultMeta.id,frame=energyViewFrame,preview=energyViewPreview?{...energyViewPreview,...(elaAdaptiveFeedback?{adaptiveFeedback:elaAdaptiveFeedback}:{})}:null;
 $('energy-npz').disabled=true;$('energy-json').disabled=true;$('export-png').disabled=true;$('export-report').disabled=true;
 let answer;try{answer=await request('view-energy',{resultId:id,...energyContextSelection(),presentation,...(preview?{preview}:{})});}catch(error){if(rev!==revision)return;if(viewRev!==energyViewRevision||elaParameterDraft)continue;throw error;}if(rev!==revision)return;if(elaParameterDraft||(preview&&frame?!frame.isCurrent():viewRev!==energyViewRevision))continue;
 const draft=!!preview||answer.display.preview===true;if(draft)diagnostic({level:'info',operation:'ela.energy',...frame?.gesture,gestureKind:frame?.gesture?.kind,kind:'parameter-preview.frame',provisional:true,requestedView:presentation,calculatedView:answer.presentation??presentation,latestRequestedView:frame?.latest().presentation??presentation,metrics:answer.metrics??answer.draft});if(!draft&&energyUI.observePresentation?.(answer.presentation)===true){energyViewQueued=true;energyViewPreview=null;energyViewRevision++;continue;}
 retireResult();if(draft&&answer.pixels){result=createPreviewSurface(answer.pixels,{document});result.previewOnly=true;result.parameterPreviewCurrent=frame?.isCurrent??(()=>rev===revision&&viewRev===energyViewRevision&&!elaParameterDraft);}else result=remoteSurface(answer.display);if(draft)observePreviewPresentation(result,answer.metrics??answer.draft);energyPreviewed=draft;if(!energyPreviewed){resultMeta.ui.elaMode=elaMode;resultMeta.ui.presentation={...presentation,...answer.presentation};$('provenance').textContent=JSON.stringify(resultMeta,null,2);}$('layer').value=$('app').classList.contains('original-mode')?'source':'result';if(result.width!==previousWidth||result.height!==previousHeight)fit();previousWidth=result.width;previousHeight=result.height;draw();status(energyPreviewed?autoText('Aperçu provisoire','Provisional preview'):sourceRegionCompletedStatus(resultMeta));
 }}catch(e){if(rev===revision){retireResult(false);energyPreviewed=false;$('layer').value='source';draw();if(e.code==='CANCELLED')status(t('cancelled'));else publishCalculationError(e,{operation:'ela.energy',phase:'presentation',parameters:lastScientificEnergy?.params,view:energyUI.presentation(elaMode),backend:'cpu',preserveResult:true});}}finally{if(rev===revision){energyViewBusy=false;controls();$('energy-npz').disabled=!hasRetainedEnergy()||elaProvisional();$('energy-json').disabled=!hasRetainedEnergy()||elaProvisional();$('export-png').disabled=!result||elaProvisional();$('export-report').disabled=!resultMeta||elaProvisional();draw();if(!energyPreviewed&&!elaProvisional())refreshEnergyHistogram();if(elaPreviewCommit)finishElaParameters();else if(elaPreviewQueued)void pumpElaParameterPreview();else if(energyViewQueued&&!elaParameterDraft)void refreshEnergyView({preview:energyViewPreview});}}
}
async function exportEnergy(format){
 if(!energyMode||!resultMeta||busy||elaProvisional())return;if(!hasRetainedEnergy()){status(t('energyRecompute'));return;}
 const rev=revision,id=resultMeta.id,controller=new AbortController();let sink,owner;
 exportController=controller;busy=true;controls();status(t('energyExporting'));
 try{
  await exportOwners.retryFailed();owner=exportOwners.begin();sink=await owner.open(createExportSink,{memoryBudgetBytes:uiRGBBudget,signal:controller.signal,mime:format==='npz'?'application/zip':'application/json'});
  await request('export-energy',{resultId:id,...energyContextSelection(),format},bytes=>sink.write(bytes));
  if(rev!==revision||controller.signal.aborted){owner.complete();await owner.retire();return;}
  const artifact=owner.borrow(owner.finish(sink,await sink.finish()));await download(artifact,'SHERLOQ-energie.'+format,{signal:controller.signal});status(t('energyExported'));
 }catch(error){try{if(error?.downloadOwnershipTransferred||!owner)throw error;await owner.fail(error);}catch(primary){if(rev===revision)status(t('error')+' · '+errorText(primary,lang));}}
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
function showComposite(previousDimensions){
 if(!compositeResult||!compositeClient)return;const previous=previousDimensions??selectedSurface(),previousWidth=previous?.width,previousHeight=previous?.height;let selected=$('composite-view').value;
 if(selected==='map'&&!compositeResult.fields.map_rgb){selected='noise';$('composite-view').value=selected;}
 result?.close?.();result=compositeClient.surface(compositeResult,selected,tileCache,scheduleDraw,error=>{if(error.code!=='CANCELLED')status(t('error')+' · '+error.message);});
 $('layer').value=$('app').classList.contains('original-mode')?'source':'result';$('export-png').disabled=false;if(selectedSurface()===result&&(result.width!==previousWidth||result.height!==previousHeight))fit();draw();
}
$('composite-view').onchange=()=>{showComposite();persistSettings();};
async function runComposite(){
 clearTimeout(autoRunTimer);autoRunTimer=null;if(busy||energyViewBusy||!fileInput)return;
 const previousFrame=selectedSurface(),previousDimensions={width:previousFrame?.width,height:previousFrame?.height};
 busy=true;controls();invalidate();const rev=revision,sourceRegionOwner=sourceRegionTaskIdentity(),abort=new AbortController(),compositeBackend=requestedBackend({operation:'composite'},{},getAdaptivePreferenceStore());let pendingCompositeResult,pendingCompositePresentation;compositeAbort=abort;status(t('compositeLoading'));$('progress').value=0;draw();
 try{
  await compositeRetirement.drain();if(rev!==revision)return;
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
  const activeCompositeClient=compositeClient,{quality,stage}=compositeSettings(),parameters={quality,stage};
  let submitted=await bindSourceRegionTask({operation:'composite',imageId,params:parameters,backend:compositeBackend});if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;
  const execution=await runWithSourceFallback(submitted,sourceRegionOwner,{
   execute:task=>activeCompositeClient.analyze(fileInput,parameters,{...task,expectedSourceSha256:hash,signal:abort.signal,backend:task.backend,onProgress:event=>{if(rev!==revision)return;renderProgress($('progress'),event);status(progressText(t('running'),event,{language:lang}));}}),
   makeWhole:task=>({...task})
  });submitted=execution.task;const output=execution.output;pendingCompositeResult={client:activeCompositeClient,result:output.result};
  if(!sourceRegionTaskIsCurrent(sourceRegionOwner)){compositeRetirement.retainResult(activeCompositeClient,output.result);pendingCompositeResult=null;await compositeRetirement.drain();return;}
  await acknowledgeSourceRegionTask(submitted,sourceRegionOwner);if(!sourceRegionTaskIsCurrent(sourceRegionOwner)){compositeRetirement.retainResult(activeCompositeClient,output.result);pendingCompositeResult=null;await compositeRetirement.drain();return;}
  if(output.sourceRegionDomain){const originalDisplay=source.display,capturedHash=hash,capturedImageId=imageId;pendingCompositePresentation=createCompositeRegionalPresentation({display:originalDisplay,domain:output.sourceRegionDomain,sourceSha256:capturedHash,cache:tileCache,request,isCurrent:()=>rev===revision&&hash===capturedHash&&imageId===capturedImageId&&loaded&&compositeMode(),changed:scheduleDraw,onError:error=>{if(error.code!=='CANCELLED')status(t('error')+' · '+error.message);}});sourceRegionComparison?.close?.();sourceRegionComparison=pendingCompositePresentation.fork(scheduleDraw);compositeSourcePresentation=pendingCompositePresentation;pendingCompositePresentation=null;sourceRegionDisplayDomain=structuredClone(output.sourceRegionDomain);}else adoptSourceRegionPresentation(output,submitted,sourceRegionOwner);compositeResult=output.result;pendingCompositeResult=null;resultMeta={...output.metadata,parameters,fields:output.result.fields,ui:{version:'0.31.0',operation:'composite',engineCommit:compositeClient.deployment.engineCommit,sourceSha256:hash}};
  $('provenance').textContent=JSON.stringify(resultMeta,null,2);
  $('composite-detail').textContent=t('compositeReady')+' '+output.metadata.model+' · '+(output.metadata.provenance?.statisticsPolicy||'Noiseprint')+(output.metadata.mapError?' · '+t('compositePartial')+' : '+(output.metadata.mapError.message||JSON.stringify(output.metadata.mapError)):'');
  $('composite-view').value=parameters.stage==='noise'||output.metadata.mapError?'noise':'map';showComposite(previousDimensions);$('export-report').disabled=false;$('progress').value=1;status(t('done'));if(wholeSourceFallbackTasks.has(submitted))status(t('done')+' · '+autoText('Analyse effectuée sur l’image originale entière ; vos zones sont conservées.','Analysis used the complete original image; your regions are kept.'));
 }catch(error){if(pendingCompositeResult){compositeRetirement.retainResult(pendingCompositeResult.client,pendingCompositeResult.result,pendingCompositePresentation);pendingCompositeResult=null;pendingCompositePresentation=null;try{await compositeRetirement.drain();}catch(cleanup){if(error&&typeof error==='object'&&Object.isExtensible(error))error.cleanupError=cleanup;}}if(rev===revision){if(error?.code==='CANCELLED')status(t('cancelled'));else publishCalculationError(error,{operation:'composite',phase:'calculation',parameters:compositeSettings(),backend:compositeBackend});}}
 finally{if(rev===revision){compositeAbort=null;busy=false;controls();draw();}}
}
$('composite-npz').onclick=async()=>{
 if(!compositeResult||busy)return;const client=compositeClient,id=compositeResult.id,rev=revision,abort=new AbortController();const scope=exportSinkScopeFor(client);let sink,output,owner;
 compositeAbort=abort;exportController=abort;busy=true;controls();status(t('energyExporting'));
 try{
  await scope.retryFailed();owner=scope.begin();owner.after(async()=>{if(output){await client.releaseExport(output.id);output=null;}});const memory=await client.memory(),headroom=Math.max(0,memory.budgetBytes-memory.retainedBytes-memory.cacheBytes-memory.activeReservationBytes-4*client.ready.windowBytes);
  sink=await owner.open(createExportSink,{memoryBudgetBytes:Math.min(uiRGBBudget,headroom),signal:abort.signal,mime:'application/zip'});
  output=await client.beginExport(id,{signal:abort.signal,onProgress:event=>{if(rev===revision){renderProgress($('progress'),event);status(progressText(t('energyExporting'),event,{language:lang}));}}});
  for(let at=0;at<output.bytes;at+=client.ready.windowBytes){if(abort.signal.aborted)throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});await sink.write(await client.readExport(output.id,at,Math.min(client.ready.windowBytes,output.bytes-at)));if(rev===revision)$('progress').value=Math.min(1,(at+client.ready.windowBytes)/output.bytes);}
  if(rev!==revision||abort.signal.aborted){owner.complete();await owner.retire();return;}
  const artifact=owner.borrow(owner.finish(sink,await sink.finish()));await download(artifact,'SHERLOQ-composite-covariance-floor-v1.npz',{signal:abort.signal});status(t('energyExported'));
 }catch(error){try{if(error?.downloadOwnershipTransferred||!owner)throw error;await owner.fail(error);}catch(primary){if(rev===revision)status(primary?.code==='CANCELLED'?t('cancelled'):t('error')+' · '+errorText(primary,lang));}}
 finally{if(rev===revision){exportController=null;compositeAbort=null;busy=false;controls();}}
};
initAutomaticControls();
// Generic parameter drafts retain the scientific result until one native
// replacement commits. Their owner is independent from the engine run queue.
// Parameter events carry a UI recipe without the currently displayed regions.
// Build their scientific input with the same live UI factory as Calculate;
// event/session and source owners still reject a superseded gesture afterward.
function parameterScientificInput(event){
 let intent;try{intent=individualUI.params();}catch{intent=individualUI.serialize()[event.toolId];}
 if(event.toolId!==activeAnalysis||event.operation!==individualUI.operation()||JSON.stringify(event.params)!==JSON.stringify(intent)||JSON.stringify(event.view)!==JSON.stringify(individualUI.view())||JSON.stringify(event.extras??{})!==JSON.stringify(individualUI.extras??{}))throw Object.assign(Error('Parameter intent changed before scientific geometry was prepared.'),{code:'CANCELLED'});
 const analysisRegions=regions.filter(region=>region.kind!=='exclusion'),options={scientificScope:regionController?.scope};
 return{toolId:event.toolId,operation:event.operation,params:individualUI.params(analysisRegions,options),view:event.view,regions:individualUI.taskRegions(analysisRegions,options),backend:individualUI.backend()};
}
// A completed Frequency frame can lag within one held gesture, but its source,
// domain, view and owner must still be the live UI context. This owns no pixels.
function ownCompletedFrequencyPreview(event){
 if(event.phase!=='preview'||event.operation!=='detail.frequency'||!event.continuous)return event;
 const owner=sourceRegionTaskIdentity(),sourceOwner=source,fileOwner=fileInput,controller=regionController,scope=controller?.scope,fingerprint=scope?.fingerprint,snapshot=sourceRegionsSnapshot(),local=sourceRegionsLocalOverride,view=JSON.stringify(event.view),extras=JSON.stringify(event.extras??{}),backend=individualUI?.backend?.();
 return{...event,completedPreviewCurrent:()=>!destroyed&&!sourceRegionsStale&&source===sourceOwner&&fileInput===fileOwner&&sourceRegionTaskIsCurrent(owner)&&regionController===controller&&controller?.scope===scope&&controller?.scope?.fingerprint===fingerprint&&sourceRegionsSnapshot()===snapshot&&sourceRegionsLocalOverride===local&&JSON.stringify(individualUI?.view())===view&&JSON.stringify(individualUI?.extras??{})===extras&&individualUI?.backend?.()===backend};
}
// Only the held numeric display field may move while an exact native clone
// frame finishes. All scientific settings and the retained basis stay owned.
function ownCompletedRetainedClonePreview(event){
 if(event.phase!=='preview'||!event.continuous||!['tampering.copyMove.sparse','tampering.copyMove.dense'].includes(event.operation)||event.policy?.kind!=='retained'||event.policy.strategy!=='clones'||event.policy.final==='explicit')return event;
 const key=event.field?.startsWith('view.')?event.field.slice(5):null;
 const settings=(view,extras={})=>{if(!key||key.includes('.')||typeof view?.[key]!=='number'||!Number.isFinite(view[key]))return null;const rest={...view},other={...extras};delete rest[key];if(other.sparseView){if(Object.hasOwn(other.sparseView,key)&&other.sparseView[key]!==view[key])return null;other.sparseView={...other.sparseView};delete other.sparseView[key];}return JSON.stringify([rest,other]);};
 const display=settings(event.view,event.extras);if(display===null)return event;
 const owner=sourceRegionTaskIdentity(),sourceOwner=source,fileOwner=fileInput,controller=regionController,scope=controller?.scope,fingerprint=scope?.fingerprint,scopeActive=!!controller?.active?.(),scopeScientific=!!controller?.scientificActive?.(),snapshot=sourceRegionsSnapshot(),snapshotFingerprint=snapshot?.fingerprint,local=sourceRegionsLocalOverride,backend=individualUI?.backend?.(),client=individualClient,basis=client?.result,nativeSource=client?.source,parameters=JSON.stringify(event.params);
 return{...event,completedPreviewCurrent:()=>{let params;try{params=individualUI?.params();}catch{params=individualUI?.serialize()?.[event.toolId];}return !!client&&!!basis&&!!nativeSource&&!destroyed&&!sourceRegionsStale&&event.toolId===activeAnalysis&&event.operation===individualUI?.operation?.()&&source===sourceOwner&&fileInput===fileOwner&&sourceRegionTaskIsCurrent(owner)&&regionController===controller&&controller?.scope===scope&&controller?.scope?.fingerprint===fingerprint&&!!controller?.active?.()===scopeActive&&!!controller?.scientificActive?.()===scopeScientific&&sourceRegionsSnapshot()===snapshot&&snapshot?.fingerprint===snapshotFingerprint&&sourceRegionsLocalOverride===local&&individualUI?.backend?.()===backend&&individualClient===client&&client.result===basis&&client.source===nativeSource&&JSON.stringify(params)===parameters&&settings(individualUI?.view(),individualUI?.extras)===display;}};
}
// Median and SSG localization drafts borrow native tables/checkpoints, but
// their sampled pixels remain provisional. Only one held parameter may move.
function ownCompletedRetainedParameterPreview(event){
 const median=event.operation==='various.median'&&event.policy?.strategy==='median',ssg=event.operation==='tampering.copyMove.sparse'&&event.params?.algorithm==='SSG'&&event.policy?.strategy==='ssg-localization',fields=median?['threshold','variance']:ssg?['maskThreshold','minimumArea','ssimRadius','ssimOpening','roiRadius']:[];
 if(event.phase!=='preview'||!event.continuous||event.policy?.kind!=='retained'||event.policy.final==='explicit'||!fields.includes(event.field))return event;
 const settings=params=>{if(typeof params?.[event.field]!=='number'||!Number.isFinite(params[event.field]))return null;const rest={...params};delete rest[event.field];return JSON.stringify(rest);},parameters=settings(event.params);if(parameters===null)return event;
 const owner=sourceRegionTaskIdentity(),sourceOwner=source,fileOwner=fileInput,controller=regionController,scope=controller?.scope,fingerprint=scope?.fingerprint,scopeActive=!!controller?.active?.(),scopeScientific=!!controller?.scientificActive?.(),snapshot=sourceRegionsSnapshot(),snapshotFingerprint=snapshot?.fingerprint,local=sourceRegionsLocalOverride,backend=individualUI?.backend?.(),client=individualClient,basis=client?.result,nativeSource=client?.source,view=JSON.stringify(event.view),extras=JSON.stringify(event.extras??{});
 return{...event,completedPreviewCurrent:()=>{let params;try{params=individualUI?.params();}catch{params=individualUI?.serialize()?.[event.toolId];}return !!client&&!!basis&&!!nativeSource&&basis.operation===event.operation&&(!ssg||basis.data?.params?.algorithm==='SSG')&&!destroyed&&!sourceRegionsStale&&event.toolId===activeAnalysis&&event.operation===individualUI?.operation?.()&&source===sourceOwner&&fileInput===fileOwner&&sourceRegionTaskIsCurrent(owner)&&regionController===controller&&controller?.scope===scope&&controller?.scope?.fingerprint===fingerprint&&!!controller?.active?.()===scopeActive&&!!controller?.scientificActive?.()===scopeScientific&&sourceRegionsSnapshot()===snapshot&&snapshot?.fingerprint===snapshotFingerprint&&sourceRegionsLocalOverride===local&&individualUI?.backend?.()===backend&&individualClient===client&&client.result===basis&&client.source===nativeSource&&settings(params)===parameters&&JSON.stringify(individualUI?.view())===view&&JSON.stringify(individualUI?.extras??{})===extras;}};
}
function ownCompletedRetainedD2Preview(event){
 if(event.phase!=='preview'||!event.continuous||event.operation!=='ai.clones.d2prl'||event.field!=='minimum'||event.policy?.kind!=='retained'||event.policy.strategy!=='d2prl-refilter')return event;
 const settings=params=>{if(!Number.isInteger(params?.minimum)||params.minimum<0||params.minimum>5000)return null;const rest={...params};delete rest.minimum;return JSON.stringify(rest);},parameters=settings(event.params);if(parameters===null)return event;
 const owner=sourceRegionTaskIdentity(),sourceOwner=source,fileOwner=fileInput,controller=regionController,scope=controller?.scope,fingerprint=scope?.fingerprint,scopeActive=!!controller?.active?.(),scopeScientific=!!controller?.scientificActive?.(),snapshot=sourceRegionsSnapshot(),snapshotFingerprint=snapshot?.fingerprint,local=sourceRegionsLocalOverride,backend=individualUI?.backend?.(),client=individualClient,basis=client?.result,nativeSource=client?.source,analysisId=basis?.data?.metadata?.analysisId,nativeResultId=basis?.data?.metadata?.resultId,view=JSON.stringify(event.view),extras=JSON.stringify(event.extras??{});
 return{...event,completedPreviewCurrent:()=>{let params;try{params=individualUI?.params();}catch{params=individualUI?.serialize()?.[event.toolId];}return !!client&&!!basis&&!!nativeSource&&basis.operation==='ai.clones.d2prl'&&typeof analysisId==='string'&&!!analysisId&&basis.data?.metadata?.analysisId===analysisId&&basis.data?.metadata?.resultId===nativeResultId&&!destroyed&&!sourceRegionsStale&&event.toolId===activeAnalysis&&event.operation===individualUI?.operation?.()&&source===sourceOwner&&fileInput===fileOwner&&sourceRegionTaskIsCurrent(owner)&&regionController===controller&&controller?.scope===scope&&controller?.scope?.fingerprint===fingerprint&&!!controller?.active?.()===scopeActive&&!!controller?.scientificActive?.()===scopeScientific&&sourceRegionsSnapshot()===snapshot&&snapshot?.fingerprint===snapshotFingerprint&&sourceRegionsLocalOverride===local&&individualUI?.backend?.()===backend&&individualClient===client&&client.result===basis&&client.source===nativeSource&&settings(params)===parameters&&JSON.stringify(individualUI?.view())===view&&JSON.stringify(individualUI?.extras??{})===extras;}};
}
function captureIndividualHeldPreviewOwner(event={toolId:activeAnalysis,operation:individualUI?.operation?.()}){
 const owner=sourceRegionTaskIdentity(),client=individualClient,basis=client?.result,nativeSource=client?.source,sourceOwner=source,fileOwner=fileInput,controller=regionController,scope=controller?.scope,scopeFingerprint=scope?.fingerprint,snapshot=sourceRegionsSnapshot(),fingerprint=snapshot?.fingerprint,local=sourceRegionsLocalOverride,backend=individualUI?.backend?.(),scopeActive=!!controller?.active?.(),scopeScientific=!!controller?.scientificActive?.(),attachments=['file','reference','mask','database','training'].map(k=>individualUI?.extras?.[k]);
 return()=>!!client&&!!nativeSource&&!destroyed&&!sourceRegionsStale&&event.toolId===activeAnalysis&&event.operation===individualUI?.operation?.()&&source===sourceOwner&&fileInput===fileOwner&&sourceRegionTaskIsCurrent(owner)&&regionController===controller&&controller?.scope===scope&&scope?.fingerprint===scopeFingerprint&&!!controller?.active?.()===scopeActive&&!!controller?.scientificActive?.()===scopeScientific&&sourceRegionsSnapshot()===snapshot&&snapshot?.fingerprint===fingerprint&&sourceRegionsLocalOverride===local&&individualUI?.backend?.()===backend&&individualClient===client&&client.result===basis&&client.source===nativeSource&&attachments.every((v,i)=>individualUI?.extras?.[['file','reference','mask','database','training'][i]]===v);
}
const genericHeldPreviewOwner=createGenericHeldPreviewOwner({getState:()=>({params:individualUI?.params(),view:individualUI?.view(),extras:individualUI?.extras??{}}),capture:captureIndividualHeldPreviewOwner,mirrors:event=>event.toolId==='tampering.copyMove.sparse'&&event.field?.startsWith('view.')?['extras.sparseView.'+event.field.slice(5)]:[]});
function ensureRetainedParameterBasis(event,task,{unavailable=false}={}){
 const basis=retainedNativeBasisStatus(event.policy,individualClient,task);if(!unavailable&&basis.available)return true;
 discardIndividualPresentation();const message=autoText('Résultat natif indisponible pour ces réglages. Cliquez sur Calculer.','Native result unavailable for these settings. Click Calculate.');
 resultMeta={operation:event.operation,status:'unavailable',parameters:event.params,error:{code:'NATIVE_BASIS_UNAVAILABLE',message,reason:basis.reason??'retained-final-unavailable'}};
 $('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;status(message);controls();return false;
}
parameterSession=createParameterPreviewSession({
 // Brief clicks coalesce into a native calculation and never paint a proxy.
 // Retained trace controls have no feature extraction or matching work.
 // Keep latest-intent coalescing, without the generic scientific-edit wait.
 schedule:(finish,event)=>setTimeout(finish,event.continuous||(event.operation==='ai.clones.d2prl'&&event.policy?.kind==='retained'&&event.policy.strategy==='d2prl-refilter'&&event.field==='minimum')||(event.operation==='tampering.copyMove.sparse'&&event.policy?.kind==='retained'&&event.policy.strategy==='clones'&&['view.circles','view.lines','view.points','view.areas','view.traceOverlap','view.maxBiomeArea','view.circleScale','view.clipLinesToCircles','view.biomeMethod'].includes(event.field))?0:120),
 computed:answer=>{const feedback=reportAdaptivePreviewComputed(answer.metrics);if(feedback)diagnostic({level:'info',kind:'parameter-preview.computed-cost',metrics:feedback});},
 onControl:metrics=>diagnostic({level:'info',kind:'parameter-preview.control',metrics}),
 preview:async(event,{signal,previewControl})=>{
  const previewSessionEpoch=parameterSession.epoch,previewIntention={field:event.field,toolId:event.toolId,gestureEpoch:event.gestureEpoch,controlRequestId:event.controlRequestId};
  if(!signal.aborted&&previewControl?.yieldBeforeNative?.()){previewControl.report?.({phase:'superseded-before-source-preparation',intentAgeMilliseconds:previewControl.ageMilliseconds(),queueWaitMs:previewControl.queueWaitMs});return null;}
  if(!fileInput||busy||event.toolId!==activeAnalysis||event.previewHandled||event.policy?.final==='explicit')return null;if(!ensureRetainedParameterBasis(event))return null;if(event.policy?.strategy==='ssg-localization'&&individualClient?.result?.data?.params?.algorithm!=='SSG')return null;
  const owner=sourceRegionTaskIdentity(),rev=revision,taskOwner=await prepareParameterScientificTask(parameterScientificInput(event),{getController:()=>regionController,bindTask:bindSourceRegionTask,isSourceCurrent:()=>sourceRegionTaskIsCurrent(owner)}),submitted=taskOwner.task;if(signal.aborted||!taskOwner.isCurrent()||sourceRegionsStale)return null;if(!ensureRetainedParameterBasis(event,submitted))return null;const client=await ensureIndividualClient();if(signal.aborted||!taskOwner.isCurrent())return null;
  if(!client.source){const descriptor=await client.load({id:imageId,blob:fileInput});if(signal.aborted||rev!==revision)return null;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});}
  const previewNativeSource=client.source,publicationControl=event.operation==='detail.frequency'&&previewControl?{...previewControl,publicationSnapshot:()=>captureFrequencyPreviewPublication(event,{signal,sessionEpoch:previewSessionEpoch,client,taskOwner,rev,nativeSource:previewNativeSource,intention:previewIntention})}:previewControl;
  const answer=await client.previewParameters(submitted,{field:event.field,extras:event.extras,heldPreviewIntent:{params:event.params??{},view:event.view??{}},signal,...(publicationControl?{previewControl:publicationControl}:{}),...(event.operation==='detail.frequency'&&elaAdaptiveFeedback?.schema==='frequency-preview-feedback/3'?{adaptiveFeedback:elaAdaptiveFeedback}:{})});if(signal.aborted||!taskOwner.isCurrent()||sourceRegionsStale)return null;return answer;
 },
 show:(answer,event,presentationOwner={})=>{
  if(event.toolId!==activeAnalysis||destroyed||sourceRegionsStale)return;
  let painted;const nativePresentation=captureNativeParameterPresentation(answer,event,presentationOwner);
  if(answer.sourceRegionDomain)sourceRegionDisplayDomain=structuredClone(answer.sourceRegionDomain);
  diagnostic({level:'info',kind:'parameter-preview.frame',operation:event.operation,field:event.field,exact:answer.exact===true,metrics:answer.metrics,...(answer.heldPreview?{heldPreview:answer.heldPreview}:{}),...parameterGestureIdentity(event),...(nativePresentation?{presentationId:nativePresentation.id,previewEpoch:nativePresentation.epoch,calculatedPreviewEpoch:nativePresentation.epoch,currentPreviewEpoch:nativePresentation.currentEpoch()}:{} )});
  if(answer.pixels){const coordinates=answer.pixels.previewCoordinates??'source';if(coordinates!=='source')sourceRegionDisplayDomain=null;const next=createPreviewSurface({...answer.pixels,preview:true,logicalWidth:answer.pixels.logicalWidth??answer.logicalWidth??source?.width,logicalHeight:answer.pixels.logicalHeight??answer.logicalHeight??source?.height},{document,...(coordinates==='source'&&answer.pixels.membership?{background:source,backgroundOrigin:answer.sourceRegionOrigin??[0,0]}:{})});rememberSourceRegionPresentationSpace(next,coordinates);retireResult();result=next;observePreviewPresentation(result,answer.metrics);if(nativePresentation)nativeParameterPresentations.set(next,nativePresentation);if(answer.heldPreview&&typeof presentationOwner.isCurrent==='function'){const strict=captureIndividualHeldPreviewOwner(event);next.parameterPreviewCurrent=()=>presentationOwner.isCurrent()===true&&strict()===true;}else if(['median','ssg-localization','d2prl-refilter'].includes(event.policy?.strategy)&&typeof event.completedPreviewCurrent==='function'&&typeof presentationOwner.isCurrent==='function')next.parameterPreviewCurrent=presentationOwner.isCurrent;if(event.operation==='detail.frequency')painted=waitForParameterPreviewPaint(result,presentationOwner);$('layer').value='result';draw();}
  const completedView=answer.metrics?.continuousPreview??(answer.heldPreview?{typedFamily:answer.heldPreview.family,requestedParameters:answer.heldPreview.requested.params,calculatedParameters:answer.heldPreview.calculated.params,latestRequestedParameters:event.params,requestedView:answer.heldPreview.requested.view,calculatedView:answer.heldPreview.calculated.view,latestRequestedView:event.view}:null),heldKey=event.field?.slice(5);individualUI.renderParameterPreview?.(answer);status(completedView?.typedFamily?autoText('Aperçu provisoire','Provisional preview'):completedView?.retainedD2===true?autoText('Aperçu D2 provisoire · minimum calculé : ','Provisional D2 preview · calculated minimum: ')+completedView.calculatedParameters.minimum+autoText(' · minimum demandé : ',' · requested minimum: ')+completedView.latestRequestedParameters.minimum:completedView?.retainedParameters===true?autoText('Aperçu provisoire · valeur calculée : ','Provisional preview · calculated value: ')+completedView.calculatedParameters[event.field]+autoText(' · valeur demandée : ',' · requested value: ')+completedView.latestRequestedParameters[event.field]:completedView?.retainedNative===true?autoText('Vue calculée : ','Calculated view: ')+completedView.calculatedView[heldKey]+autoText(' · valeur demandée : ',' · requested value: ')+completedView.latestRequestedView[heldKey]:event.policy?.strategy==='ssg-localization'?autoText('Aperçu temporaire de localisation — résultat natif au relâchement','Temporary localization preview — native result on release'):autoText('Aperçu rapide','Quick preview'));controls();return painted;
 },
 commit:async(event,{isCurrent=()=>true}={})=>{
  if(!fileInput||event.toolId!==activeAnalysis||destroyed)return;
  persistSettings();translateTaskActions();diagnostic({level:'info',kind:'parameter-preview.commit',operation:event.operation,field:event.field,parameters:event.params});
  // Explicit analyses retain the submitted settings until Calculate. Their
  // parameter commit must not configure a model or start inference/OCR.
  if(event.policy?.final==='explicit'){status(autoText('Choisissez les réglages, puis cliquez sur Calculer.','Choose settings, then click Calculate.'));controls();return;}
  // A committed setting is a native calculation intention, including fields
  // without a provisional proxy. The initial Calculate command stays available.
  if(!ensureRetainedParameterBasis(event))return;
  parameterCommitting=true;
  try{
   const client=individualClient,owner=sourceRegionTaskIdentity(),taskOwner=await prepareParameterScientificTask(parameterScientificInput(event),{getController:()=>regionController,bindTask:bindSourceRegionTask,isSourceCurrent:()=>sourceRegionTaskIsCurrent(owner)}),submitted=taskOwner.task;if(!isCurrent()||!taskOwner.isCurrent())return;if(!ensureRetainedParameterBasis(event,submitted))return;
   const retainedSsg=event.policy?.strategy==='ssg-localization',retainedD2=event.policy?.strategy==='d2prl-refilter',retainedTransaction=retainedSsg||retainedD2||['clones','median'].includes(event.policy?.strategy),present=async(next,{previous=client?.result}={})=>{const current=()=>isCurrent()&&taskOwner.isCurrent()&&event.toolId===activeAnalysis&&!destroyed;if(!current())return false;try{adoptSourceRegionPresentation(next,submitted,owner);await acknowledgeSourceRegionTask(submitted,owner);if(!current())return false;await individualUI.render(next);if(current())return true;if(previous&&event.toolId===activeAnalysis&&!destroyed&&sourceRegionTaskIsCurrent(owner))await individualUI.render(previous);return false;}catch(error){if(previous&&event.toolId===activeAnalysis&&!destroyed&&sourceRegionTaskIsCurrent(owner))try{await individualUI.render(previous);}catch(cleanup){if(Object.isExtensible(error))error.cleanupErrors=[...(error.cleanupErrors??[]),cleanup];}throw error;}};
   const next=client&&await client.updateRetainedParameters(submitted,{field:event.field,isCurrent:()=>isCurrent()&&taskOwner.isCurrent(),...(retainedTransaction?{onRetainedResult:present}:{})});
   if(!isCurrent()||!taskOwner.isCurrent())return;
   if(next){if(!retainedTransaction&&!await present(next))return;resultMeta={id:next.id,operation:next.operation,status:next.status,provenance:next.provenance,metrics:next.metrics};$('provenance').textContent=JSON.stringify(resultMeta,null,2);status(t('done'));}
   else if(event.policy?.strategy==='ssg-localization'){individualUI?.restorePresentation?.();status(autoText('Checkpoint de localisation indisponible. Cliquez sur Calculer.','Localization checkpoint unavailable. Click Calculate.'));controls();}
   else if(retainedD2){individualUI?.restorePresentation?.();status(autoText('Les données D2PRL retenues ne correspondent plus à ces zones. Le résultat précédent est conservé ; cliquez sur Calculer pour une nouvelle analyse.','The retained D2PRL data no longer match these regions. The previous result is preserved; choose Calculate for a new analysis.'));controls();}
   else if(event.policy?.nativeBasis==='required')ensureRetainedParameterBasis(event,submitted,{unavailable:true});
   else await run();
  }finally{parameterCommitting=false;}
 },
 restore:()=>{individualUI?.restorePresentation?.();},
 state:({pending})=>{if(!individualUI||destroyed)return;if(!pending)retainedDisplayReads.settle();controls();if(!pending&&!busy){$('export-png').disabled=!result||!!result.previewOnly||parameterProvisional();$('export-report').disabled=!resultMeta;}host.changed?.();},
 error:(error,context)=>{diagnostic({level:'warning',kind:'parameter-preview.'+context.phase,operation:activeAnalysis,code:error.code,message:error.message});if(context.event?.policy?.strategy==='d2prl-refilter'&&['PREVIEW_UNAVAILABLE','CACHE_MISS'].includes(error.code)){individualUI?.restorePresentation?.();status(autoText('Données D2PRL retenues indisponibles ; le résultat précédent est conservé. Cliquez sur Calculer pour une nouvelle analyse.','Retained D2PRL data unavailable; the previous result is preserved. Choose Calculate for a new analysis.'));controls();return;}if(context.event?.policy?.nativeBasis==='required'&&['PREVIEW_UNAVAILABLE','CACHE_MISS'].includes(error.code)){ensureRetainedParameterBasis(context.event,undefined,{unavailable:true});return;}if(error.code==='CANCELLED')return;if(context.phase==='final'&&context.event?.policy?.strategy==='ssg-localization')individualUI?.restorePresentation?.();else if(context.phase==='final')discardIndividualPresentation();publishCalculationError(error,{operation:context.event?.operation??activeAnalysis,phase:'parameter-'+context.phase,parameters:context.event?.params,view:context.event?.view,backend:individualUI?.backend?.(),preserveResult:true});controls();}
});
individualUI=createToolWorkspace({document,language:()=>lang,getClient:ensureIndividualClient,getNavigationMode:()=>$('navigation-mode').value,getSourceContext:individualSourceContext,manualRecomputeAvailable:()=>{const b=parameterWorkerBase;return activeAnalysis==='noise.separation'&&b?.task?.params?.mode===4&&['native-regions','membership'].includes(b.output?.metrics?.sourceRegion?.shape)&&b.recomputeCurrent?.()===true;},run,cancel:()=>{const zeroCancelled=clearZeroViewPresentation({restore:true});parameterSession.reset('cancel',{restoreResult:false});individualCancelled=true;regionController?.cancel();pointerLoupe?.cancelImage();individualClient?.cancel();individualUI?.hideResult();if(zeroCancelled){status(t('cancelled'));controls();draw();}},activity:individualActivity,showSurface:showIndividualSurface,capturePreviewOwner:()=>captureIndividualHeldPreviewOwner(),onLoupe:()=>host.openLoupeSettings?.(),download,notify:status,onInteractive:event=>{if(event.phase==='begin'&&event.operation==='ai.clones.d2prl'&&event.field==='minimum'&&event.policy?.strategy==='d2prl-refilter')retainedDisplayReads.begin();event=genericHeldPreviewOwner(ownCompletedRetainedD2Preview(ownCompletedRetainedParameterPreview(ownCompletedRetainedClonePreview(ownCompletedFrequencyPreview(event)))));if(event.operation==='jpeg.zero'&&event.field==='view'&&event.phase==='commit')beginZeroViewPresentation(event.params.view);if(event.phase==='begin'||event.phase==='cancel'&&event.reason!=='result-change')individualClient?.cancelRetainedParameters?.();if(parameterCommitting&&event.phase==='cancel'&&event.reason==='result-change')return;if(event.phase==='cancel'&&event.reason!=='unchanged'){if(event.reason!=='result-change')clearZeroViewPresentation();parameterSession.reset(event.reason,{restoreResult:false});}else parameterSession.handle(event);},onSettings:({presentationOnly=false,requireCalculate=false}={})=>{persistSettings();controls();translateTaskActions();if(requireCalculate){firstSourceFrame.cancelAnalysis();clearTimeout(autoRunTimer);autoRunTimer=null;}else if(!presentationOnly)queueAnalysis();if(activeAnalysis==='inspection.magnifier')host.onLoupeContextChange?.();}});
regionParent=host.regionParent??document.createElement('div');regionParent.className='individual-region-owner';if(!host.regionParent)$('inspector').prepend(regionParent);
regionController=(host.regionControllerFactory??createIndividualRegionController)({...(host.scopeEditorFactory?{scopeEditorFactory:host.scopeEditorFactory}:{}),document,parent:regionParent,panelMode:'editor-only',canEditScope:id=>!host.sourceOnly&&id!=='composite'&&sourceRegionApplicability({operation:id,params:toolCatalog[id]?.params??{}}).applicable,language:()=>lang,source:()=>fileInput&&source?{blob:fileInput,name:fileInput.name,id:imageId,width:source.width,height:source.height,sourceSha256:hash,...(!host.sourceOnly&&sourceRegionsSnapshot()?{sourceRegionCeiling:sourceRegionsSnapshot()}:{})}:null,operation:()=>activeAnalysis,getClient:ensureIndividualClient,getSourceDomain:analysisSourceDomain,prepareSourceScope:syncInheritedSourceRegions,computeProfile:()=>$('compute-profile').value,navigationMode:()=>$('navigation-mode').value,
 onHighlight:()=>draw(),onPresentation:display=>{if(display&&individualMode()){individualUI.setOriginal(false);showIndividualSurface(display);}else if(source){$('layer').value='source';individualUI?.setOriginal(true);draw();}},
 onChange:({scopeChanged,preparationOnly}={})=>{if(scopeChanged){clearZeroViewPresentation();if(!preparationOnly)sourceRegionsLocalOverride=true;void refreshPlotSourceConstraints();clearTimeout(autoRunTimer);autoRunTimer=null;regions=regionController.rectangles();renderRegions();$('layer').value='source';individualUI?.setOriginal(true);if(resultMeta){resultMeta.ui={...resultMeta.ui,pendingScientificScope:regionController.scope?.fingerprint};$('provenance').textContent=JSON.stringify(resultMeta,null,2);}if(!busy||!preparationOnly)status(autoText('Zones modifiées. Cliquez sur Calculer pour les appliquer.','Regions edited. Click Calculate to apply them.'));if(automaticMode())automaticControls();draw();controls();const notice=comparisonRunNotice();if(notice&&(!busy||!preparationOnly))status(notice);translateTaskActions();}host.changed?.();},
 onError:error=>status(t('error')+' · '+error.message),onProgress:event=>status(autoText('Détection des zones','Detecting regions')+' · '+(event.phase??'')),});
// Mirrored ELA fields have no HTML defaults. Initialize every mounted panel
// before optional preference recovery; managed panels have no local settings.
syncParams();
try{const stored=localGet('settings');if(stored)applySettings(stored);else{const old=localGet('classicPreset');if(old){profiles=[{id:'profile-legacy',name:t('savedProfile'),operation:'ela.classic',params:validParams(old)}];renderProfiles();}}}catch(error){console.warn('SHERLOQ settings ignored:',error.message);}
const onFeatureChange=()=>{renderToolTree();if(!busy)individualUI?.refreshFeatures?.();controls();};window.addEventListener('local-feature-change',onFeatureChange);
settingsReady=true;
// Changes stay in browser storage; explicit exports always include every profile.
document.addEventListener('change',()=>{if(!persistSettings())status(t('storageUnavailable'));});
document.addEventListener('click',()=>queueMicrotask(()=>{if(!persistSettings())status(t('storageUnavailable'));}));

navigator.storage?.estimate?.().then(value=>{storageEstimate={usage:value.usage??null,quota:value.quota??null};renderCapabilities();}).catch(()=>{});
const panelResize=new ResizeObserver(resizePanel);panelResize.observe(view);const onPageHide=()=>{stop();source?.close?.();};window.addEventListener('pagehide',onPageHide);translate();controls();status(t('ready'));

const onFonts=()=>draw();document.fonts?.addEventListener('loadingdone',onFonts);

function autoText(fr,en){return lang==='fr'?fr:en;}
async function ensureAutomaticClient(){
 if(automaticClient)return automaticClient;
 if(!automaticOpening||automaticOpeningEpoch!==automaticEpoch){const epoch=automaticEpoch,opening=(async()=>{await drainRetiredPanelClients('automatic');const client=await createAutomaticClient({computeProfile:$('compute-profile').value,onProgress:event=>{if(epoch===automaticEpoch)automaticEvent(event);}});if(epoch!==automaticEpoch){await client.dispose();throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});}return automaticClient=client;})().finally(()=>{if(automaticOpening===opening)automaticOpening=null;});automaticOpeningEpoch=epoch;automaticOpening=opening;}
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
function syncAutomaticElaContext(){return automaticElaContextControl?.update(automaticClient?.result?.data?.elaNativeContexts,automaticClient?.result?.data?.view?.elaNativeContextId,{locked:busy||energyViewBusy||!!exportController,complete:activeAnalysis==='analysis.complete'});}
function automaticControls(){
 syncAutomaticElaContext();
 // Clone-only analyses have no ELA provider; do not offer an unavailable layer.
 for(const option of $('automatic-view').options){const unavailable=activeAnalysis==='analysis.clones'&&option.value!=='corroboration';option.hidden=unavailable;option.disabled=unavailable;}
 if(activeAnalysis==='analysis.clones')$('automatic-view').value='corroboration';
 const availableForge=localFeaturePolicy.isTaskAvailable({operation:'m2.forgeryscope',params:{profile:'auto'}}),availableD2=localFeaturePolicy.isTaskAvailable({operation:'ai.clones.d2prl'});
 for(const option of $('automatic-source').options){const unavailable=option.value==='Forgeryscope Auto'&&!availableForge||option.value==='D2PRL'&&!availableD2;option.hidden=unavailable;option.disabled=unavailable;}
 $('automatic-branch').closest('label').hidden=!availableForge;$('automatic-d2-minimum').closest('label').hidden=!availableD2;
 const locked=busy||energyViewBusy||!!exportController;
 $('automatic-run').disabled=!fileInput||locked;$('automatic-pause').disabled=!busy;
 $('automatic-resume').disabled=!automaticClient?.checkpoint||locked||!automaticSourceContextMatches(automaticSubmittedContext,automaticCurrentSourceContext());
 $('automatic-export').disabled=!(automaticClient?.result||automaticClient?.checkpoint)||locked||parameterProvisional();
 $('automatic-progress-export').disabled=!automaticProgress;
 for(const id of ['automatic-scope','automatic-source','automatic-view','automatic-relation','automatic-branch','automatic-d2-minimum','automatic-opacity','automatic-clone-window-global'])$(id).disabled=locked;
}
function automaticEvent(event){
 if(!automaticMode())return;
 if(automaticProgress)automaticSnapshot=automaticProgress.accept(event);
 if(event.phase==='automatic-state')renderAutomaticProgress();
 else if(!event.phase?.startsWith('diagnostic-')){
  status(progressText(autoText('Analyse automatique','Automatic analysis'),event,{counts:false,stage:true,language:lang}));
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
  const notice=automaticNativeGroupNotice(group,lang),row=document.createElement('li');row.textContent=names[id]+' — '+(notice?.label??(states[group.state]||group.state))+(group.stage?' · '+group.stage:'')+(group.iteration!==undefined?' · '+autoText('itération ','iteration ')+group.iteration:'')+(hasProgressCounts(group)?' · '+Math.round(100*group.completed/group.total)+'% '+autoText('de cette sous-étape','of this sub-step'):'')+(notice?' · '+notice.text:'')+(group.error?' · '+group.error.code+' : '+group.error.message:'');$('automatic-groups').append(row);
 }
}
async function runAutomatic(resume=false){
 if(busy||!fileInput)return;if(resume&&!automaticSourceContextMatches(automaticSubmittedContext,automaticCurrentSourceContext()))return status(autoText('Zones modifiées. Cliquez sur Calculer pour appliquer ce nouveau périmètre.','Regions changed. Click Calculate to apply this new scope.'));clearTimeout(autoRunTimer);autoRunTimer=null;
 automaticPauseRequested=false;busy=true;controls();let submitted,submittedView,progressForRun=null,calculationPhase='preparation';const rev=revision,sourceRegionOwner=sourceRegionTaskIdentity();const checkPreparation=()=>{if(automaticPauseRequested)throw Object.assign(Error('Analysis paused before execution.'),{code:'CANCELLED'});};status(autoText('Préparation de l’analyse automatique…','Preparing automatic analysis…'));$('progress').removeAttribute('value');
 const reportExecution=state=>{
  if(!progressForRun||progressForRun!==automaticProgress)return;
  automaticSnapshot=state==='running'?progressForRun.resume():progressForRun.settle(state);
  const runId=automaticSnapshot.runId;
  if(typeof runId==='string')diagnostic({level:'info',kind:'automatic.execution',operation:activeAnalysis,execution:{schema:'sherloq.automatic-execution/1',runId,state:automaticSnapshot.state,phase:calculationPhase,elapsedMs:automaticSnapshot.elapsedMs,settledAt:automaticSnapshot.settledAt}});
  renderAutomaticProgress();
 };
 try{
  await drainRetiredPanelClients('automatic');await compositeCleanup;if(rev!==revision)return;checkPreparation();
  const client=await ensureAutomaticClient();if(rev!==revision)return;checkPreparation();
  if(!loaded||!client.source){const descriptor=await client.load({id:imageId,blob:fileInput});if(rev!==revision)return;checkPreparation();loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});if(!zoom)fit();draw();}
  if(!resume&&regionController?.active())await regionController.prepareForCalculation();
  if(rev!==revision)return;checkPreparation();
  if(!resume){retireResult();resultMeta=null;$('provenance').textContent='';$('export-png').disabled=true;$('export-report').disabled=true;automaticProgress=createAutomaticProgress(activeAnalysis==='analysis.complete');progressForRun=automaticProgress;automaticStarted=Date.now();automaticSnapshot=automaticProgress.snapshot();}
  clearInterval(automaticClock);automaticClock=setInterval(renderAutomaticProgress,1000);renderAutomaticProgress();
  let output;
  if(resume){const currentUi=automaticCurrentSourceContext(),domain=await analysisSourceDomain();if(!sourceRegionTaskIsCurrent(sourceRegionOwner)||currentUi!==automaticCurrentSourceContext()){checkPreparation();throw Object.assign(Error('Automatic source changed before resume.'),{code:'CANCELLED'});}if(!automaticSourceContextMatches(automaticSubmittedContext,currentUi,domain))throw Object.assign(Error(autoText('Zones modifiées. Cliquez sur Calculer pour appliquer ce nouveau périmètre.','Regions changed. Click Calculate to apply this new scope.')),{code:'SCIENTIFIC_SCOPE_CHANGED'});checkPreparation();calculationPhase='calculation';progressForRun=automaticProgress;reportExecution('running');output=await client.resume();if(!sourceRegionTaskIsCurrent(sourceRegionOwner)||currentUi!==automaticCurrentSourceContext())return;}
  else{const submittedUi=automaticCurrentSourceContext(),selection=automaticSelection(source.width,source.height,regions.filter(r=>r.kind!=='exclusion'),$('automatic-scope').value);let task={id:'automatic-'+crypto.randomUUID(),imageId,operation:activeAnalysis,backend:'auto',params:{...(selection?{selection}:{}),maxConcurrent:5,d2Minimum:Number($('automatic-d2-minimum').value)}};task=regionController?.active()?regionController.task(task):task;task=await bindSourceRegionTask(task);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;checkPreparation();if(submittedUi!==automaticCurrentSourceContext())throw Object.assign(Error('Automatic scientific scope changed during preparation.'),{code:'CANCELLED'});const submittedContext=captureAutomaticSourceContext(submittedUi,task);submitted=task;progressForRun.bindRunId(task.id);calculationPhase='calculation';try{output=await client.run(task);automaticSubmittedContext=submittedContext;}catch(error){if(error?.details?.retainedAnalysis?.analysisId)automaticSubmittedContext=submittedContext;throw error;}if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;await acknowledgeSourceRegionTask(task,sourceRegionOwner);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;adoptSourceRegionPresentation(output,task,sourceRegionOwner);}
  if(rev!==revision)return;
  calculationPhase='presentation';syncAutomaticElaContext();
  submittedView=automaticViewActions();output=await client.update(submittedView);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;
  if(output.sourceRegionDomain)adoptSourceRegionPresentation(output,{sourceRegionDomain:output.sourceRegionDomain},sourceRegionOwner);
  automaticEvent({phase:'automatic-state',state:output.data.state});
  await showAutomatic();if(rev!==revision)return;
  const failed=automaticAnalysisIncomplete(output);reportExecution(failed?'partial':'completed');
  resultMeta=automaticReport(output,automaticProgress.snapshot(),client.deployment);$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;
  status(failed?autoText('Analyse partielle : tous les groupes n’ont pas abouti. Les résultats acquis restent exportables.','Partial analysis: some groups did not complete. Completed results remain exportable.'):autoText('Analyse automatique terminée.','Automatic analysis complete.'));
  $('progress').value=1;
 }catch(error){if(rev===revision){
  if(automaticClient?.checkpoint){const state=automaticClient.checkpoint.state;automaticEvent({phase:'automatic-state',state});}
  reportExecution(error?.code==='CANCELLED'?(automaticClient?.checkpoint?'suspended':'cancelled'):'failed');
  if(error?.imagesCleared){loaded=false;source?.close?.();source=null;}
  if(error?.code!=='CANCELLED')publishCalculationError(error,{operation:submitted?.operation??activeAnalysis,phase:calculationPhase,parameters:submitted?.params??automaticClient?.result?.provenance?.params,view:submittedView,backend:submitted?.backend??'auto',preserveResult:!!(resultMeta&&result)});
  if(error?.code==='CANCELLED')status(automaticClient?.checkpoint?autoText('Analyse suspendue. Reprendre conserve le travail acquis.','Analysis paused. Resume preserves completed work.'):autoText('Arrêt avant la création d’un point de reprise. Relancer pour commencer.','Stopped before a resume point was created. Run to start again.'));
 }}finally{if(rev===revision&&progressForRun?.snapshot().state==='running')reportExecution('cancelled');clearInterval(automaticClock);automaticClock=null;if(rev===revision){busy=false;controls();draw();}}
}
async function pauseAutomatic(){if(!busy)return;automaticPauseRequested=true;regionController?.cancel();status(autoText('Suspension en cours : conservation des étapes acquises…','Pausing: preserving committed work…'));$('automatic-pause').disabled=true;await automaticClient?.pause();controls();}
function automaticD2Event(event){
 const operation=activeAnalysis,client=automaticClient,basis=client?.result,analysisId=basis?.analysisId,nativeSource=client?.source,nativeSourceSha=nativeSource?.sha256,sourceOwner=source,fileOwner=fileInput,owner=sourceRegionTaskIdentity(),submitted=automaticSubmittedContext,controller=regionController,scope=controller?.scope,fingerprint=scope?.fingerprint,scopeActive=!!controller?.active?.(),scopeScientific=!!controller?.scientificActive?.(),snapshot=sourceRegionsSnapshot(),snapshotFingerprint=snapshot?.fingerprint,local=sourceRegionsLocalOverride,policy=JSON.stringify(localFeaturePolicy.snapshot()),basisView=JSON.stringify(basis?.data?.view),settings=automaticSettings(),strict={...settings};delete strict['d2-minimum'];const extras=JSON.stringify(strict);
 const scientificView=view=>{const value={...view};delete value.d2prlMinimum;return JSON.stringify(value);},viewExceptMinimum=scientificView(basis?.data?.view);
 const current=(final=false)=>{const now=automaticSettings(),rest={...now};delete rest['d2-minimum'];return !destroyed&&!sourceRegionsStale&&automaticMode()&&operation===activeAnalysis&&!!client&&!!basis&&!!nativeSource&&automaticClient===client&&(final?client.result?.analysisId===analysisId&&scientificView(client.result?.data?.view)===viewExceptMinimum:client.result===basis)&&client.source===nativeSource&&nativeSource.sha256===nativeSourceSha&&basis.analysisId===analysisId&&source===sourceOwner&&fileInput===fileOwner&&sourceRegionTaskIsCurrent(owner)&&automaticSubmittedContext===submitted&&automaticSourceContextMatches(submitted,automaticCurrentSourceContext())&&regionController===controller&&controller?.scope===scope&&controller?.scope?.fingerprint===fingerprint&&!!controller?.active?.()===scopeActive&&!!controller?.scientificActive?.()===scopeScientific&&sourceRegionsSnapshot()===snapshot&&snapshot?.fingerprint===snapshotFingerprint&&sourceRegionsLocalOverride===local&&JSON.stringify(localFeaturePolicy.snapshot())===policy&&(final||JSON.stringify(basis.data?.view)===basisView)&&JSON.stringify(rest)===extras&&Number.isInteger(now['d2-minimum'])&&now['d2-minimum']>=0&&now['d2-minimum']<=5000;};
 return{...event,operation,field:'automatic-d2-minimum',params:{minimum:event.value},view:{...structuredClone(basis?.data?.view),d2prlMinimum:event.value},extras:strict,completedPreviewCurrent:()=>current(),finalPreviewCurrent:()=>current(true)};
}
function showAutomaticD2Preview(answer,event,presentationOwner){
 if(!presentationOwner.isCurrent())return;automaticDisplayRevision++;
 const next=createPreviewSurface({...answer.pixels,preview:true,logicalWidth:answer.pixels.logicalWidth,logicalHeight:answer.pixels.logicalHeight},{document});next.previewOnly=true;next.parameterPreviewCurrent=presentationOwner.isCurrent;
 retireResult();result=next;sourceRegionDisplayDomain=answer.sourceRegionDomain??null;rememberSourceRegionPresentationSpace(next,'source');observePreviewPresentation(next,answer.metrics);$('layer').value='result';
 const held=answer.metrics.continuousPreview;diagnostic({level:'info',kind:'parameter-preview.frame',operation:event.operation,field:event.field,exact:false,metrics:answer.metrics,...parameterGestureIdentity(event)});status(autoText('Aperçu D2 automatique provisoire · minimum calculé : ','Provisional automatic D2 preview · calculated minimum: ')+held.calculatedParameters.minimum+autoText(' · minimum demandé : ',' · requested minimum: ')+held.latestRequestedParameters.minimum);controls();draw();
}
function cancelAutomaticD2Preview(){
 const minimum=automaticClient?.result?.data?.view?.d2prlMinimum;if(Number.isInteger(minimum))$('automatic-d2-minimum').value=minimum;
 automaticD2Gesture?.reset('user-cancel');automaticD2Preview?.reset('user-cancel',{restore:true});status(t('cancelled'));controls();
}
const automaticOpacityOwners=createLocalHeldPreviewOwners();let automaticOpacityQueued=null,automaticOpacityBusy=false,automaticOpacityCommitted=null;
function queueAutomaticOpacityPreview(event){
 const operation=activeAnalysis,client=automaticClient,basis=client?.result,nativeSource=client?.source,nativeSha=nativeSource?.sha256,owner=sourceRegionTaskIdentity(),sourceOwner=source,fileOwner=fileInput,submitted=automaticSubmittedContext,controller=regionController,scope=controller?.scope,scopeFingerprint=scope?.fingerprint,scopeActive=!!controller?.active?.(),scopeScientific=!!controller?.scientificActive?.(),snapshot=sourceRegionsSnapshot(),snapshotFingerprint=snapshot?.fingerprint,local=sourceRegionsLocalOverride,policy=JSON.stringify(localFeaturePolicy.snapshot()),basisView=JSON.stringify(basis?.data?.view),version=automaticGestureVersion;
 const frame=automaticOpacityOwners.own({field:'automatic-opacity',...event},{settings:automaticSettings(),heldPath:['opacity'],getSettings:automaticSettings,isCurrent:()=>automaticPresentationDraft&&automaticGestureVersion===version&&!destroyed&&!sourceRegionsStale&&automaticMode()&&activeAnalysis===operation&&!!client&&!!basis&&!!nativeSource&&automaticClient===client&&client.result===basis&&client.source===nativeSource&&nativeSource.sha256===nativeSha&&source===sourceOwner&&fileInput===fileOwner&&sourceRegionTaskIsCurrent(owner)&&automaticSubmittedContext===submitted&&automaticSourceContextMatches(submitted,automaticCurrentSourceContext())&&regionController===controller&&controller?.scope===scope&&scope?.fingerprint===scopeFingerprint&&!!controller?.active?.()===scopeActive&&!!controller?.scientificActive?.()===scopeScientific&&sourceRegionsSnapshot()===snapshot&&snapshot?.fingerprint===snapshotFingerprint&&sourceRegionsLocalOverride===local&&JSON.stringify(localFeaturePolicy.snapshot())===policy&&JSON.stringify(basis?.data?.view)===basisView});
 if(!frame)return;automaticOpacityQueued={client,frame};void pumpAutomaticOpacityPreview();
}
async function pumpAutomaticOpacityPreview(){
 if(automaticOpacityBusy)return;automaticOpacityBusy=true;
 try{while(automaticOpacityQueued){const {client,frame}=automaticOpacityQueued;automaticOpacityQueued=null;if(!frame.isCurrent())continue;const settings=frame.calculated,answer=await client.previewOpacity({layer:settings.view,overlay:settings.view==='corroboration',opacity:settings.opacity/100},{isCurrent:frame.isCurrent});if(!answer||!frame.isCurrent())continue;
  automaticDisplayRevision++;const next=createPreviewSurface(answer.pixels,{document});next.previewOnly=true;next.parameterPreviewCurrent=frame.isCurrent;retireResult();result=next;rememberSourceRegionPresentationSpace(next,'source');observePreviewPresentation(next,answer.metrics);$('layer').value='result';diagnostic({level:'info',operation:activeAnalysis,...frame.gesture,gestureKind:frame?.gesture?.kind,kind:'parameter-preview.frame',provisional:true,calculatedPresentation:answer.presentation,requestedSettings:frame.calculated,latestRequestedSettings:frame.latest(),metrics:answer.metrics});status(autoText('Opacité calculée : ','Calculated opacity: ')+answer.presentation.opacity+autoText(' · opacité demandée : ',' · requested opacity: ')+frame.latest().opacity/100);controls();draw();
 }}catch(error){if(error.code!=='CANCELLED')status(t('error')+' · '+error.message);}finally{automaticOpacityBusy=false;if(automaticOpacityQueued?.frame.isCurrent())void pumpAutomaticOpacityPreview();}
}
function revokeAutomaticOpacityPreview(){automaticOpacityOwners.reset();automaticOpacityQueued=null;}
function cancelAutomaticOpacityPreview(){revokeAutomaticOpacityPreview();automaticGesture?.reset('user-cancel');if(Number.isFinite(automaticOpacityCommitted))$('automatic-opacity').value=automaticOpacityCommitted;const token=++automaticGestureVersion;automaticPresentationDraft=true;void showAutomatic({isCurrent:()=>token===automaticGestureVersion}).catch(error=>status(t('error')+' · '+error.message)).finally(()=>{if(token!==automaticGestureVersion)return;automaticPresentationDraft=false;controls();});status(t('cancelled'));controls();}
async function showAutomatic({preview=false,isCurrent=()=>true}={}){
 const client=automaticClient;if(!client?.result||!isCurrent())return;
 const token=++automaticDisplayRevision,rev=revision,layer=$('automatic-view').value;
 let display=await client.display(layer,{overlay:layer==='corroboration',opacity:Number($('automatic-opacity').value)/100});
 if(preview){const plan=displayAdaptive.plan({key:'automatic/'+layer,width:display.width,height:display.height,maxSide:2048,maxPixels:1024**2});display={...display,previewStep:plan.step,adaptivePreview:{token:plan.token}};}
 if(token!==automaticDisplayRevision||rev!==revision||client!==automaticClient||!isCurrent())return;
 retireResult();result=remoteSurface(display);$('layer').value='result';$('export-png').disabled=preview||automaticPresentationDraft;draw();

}
async function updateAutomaticView({heldD2Final=false,minimum,isCurrent=()=>true}={}){
 const requestedActions=automaticViewActions();
 if(!heldD2Final){revokeAutomaticOpacityPreview();automaticD2Gesture?.reset('settings-change');automaticD2Preview?.reset('settings-change');}
 if(!automaticClient?.result||busy||energyViewBusy||!isCurrent())return;const actions=requestedActions.map(action=>heldD2Final&&action.method==='setD2prlMinimum'?{...action,value:minimum}:action);energyViewBusy=true;controls();const rev=revision,client=automaticClient;
 try{
  const output=await client.update(actions);
  if(rev!==revision||client!==automaticClient||!isCurrent())return;resultMeta=automaticReport(output,automaticProgress?.snapshot(),client.deployment);$('provenance').textContent=JSON.stringify(resultMeta,null,2);await showAutomatic({isCurrent});
 }catch(error){if(rev===revision)status(t('error')+' · '+error.message);}finally{if(rev===revision){energyViewBusy=false;controls();}}
}
async function exportAutomatic(){
 const client=automaticClient;if(!client||busy||parameterProvisional())return;busy=true;controls();let sink,owner;const rev=revision,scope=exportSinkScopeFor(client);
 try{
  await scope.retryFailed();owner=scope.begin();const {memory}=await client.capabilities();sink=await owner.open(createExportSink,{memoryBudgetBytes:Math.max(0,Math.min(64*1024**2,memory.budgetBytes-memory.retainedBytes-memory.cacheBytes-memory.activeReservationBytes)),mime:'application/zip'});
  await client.exportTo(sink);if(rev!==revision){owner.complete();await owner.retire();return;}
  const artifact=owner.borrow(owner.finish(sink,await sink.finish()));await download(artifact,client.result?.status==='ok'?'SHERLOQ-automatic.npz':'SHERLOQ-automatic-partial.npz');status(t('done'));
 }catch(error){try{if(error?.downloadOwnershipTransferred||!owner)throw error;await owner.fail(error);}catch(primary){if(rev===revision)status(t('error')+' · '+errorText(primary,lang));}}finally{if(rev===revision){busy=false;controls();}}
}
function initAutomaticControls(){
 automaticElaContextControl=createAutomaticElaContextControl({after:$('automatic-view'),language:()=>lang,onChange:()=>{void updateAutomaticView();}});
 $('automatic-scope').value='detected';$('automatic-source').value='overlay';$('automatic-view').value='corroboration';$('automatic-relation').value='within';$('automatic-branch').value='';$('automatic-d2-minimum').value=500;$('automatic-opacity').value=70;
 $('tab-automatic').onclick=()=>chooseTool('analysis.complete');$('automatic-run').onclick=()=>runAutomatic(false);$('automatic-resume').onclick=()=>runAutomatic(true);$('automatic-pause').onclick=pauseAutomatic;$('automatic-export').onclick=exportAutomatic;
 $('automatic-scope').onchange=queueAnalysis;
 $('automatic-clone-window-global').checked=false;$('automatic-clone-window-global').onchange=()=>{persistSettings();automaticControls();queueAnalysis();};
 $('automatic-progress-export').onclick=()=>{if(!automaticProgress)return;exportJSON(automaticReport(automaticClient?.result,automaticProgress.snapshot(),automaticClient?.deployment||{}),'SHERLOQ-avancement.json');};
 for(const id of ['automatic-source','automatic-relation','automatic-branch'])$(id).onchange=updateAutomaticView;
 const minimum=$('automatic-d2-minimum');automaticD2Preview=createAutomaticD2PreviewSession({preview:(event,{signal,isCurrent})=>automaticClient?.previewD2Minimum({minimum:event.params.minimum,layer:event.extras.view,overlay:true,opacity:event.extras.opacity/100},{signal,isCurrent}),show:showAutomaticD2Preview,commit:async(event,{isCurrent})=>{if(!isCurrent())return;persistSettings();await updateAutomaticView({heldD2Final:true,minimum:event.params.minimum,isCurrent});},restore:(_event,{isCurrent=()=>true}={})=>showAutomatic({isCurrent}),changed:()=>{controls();},error:(error,{phase})=>{diagnostic({level:'warning',kind:'parameter-preview.'+phase,operation:activeAnalysis,field:'automatic-d2-minimum',code:error.code,message:error.message});status(autoText('Aperçu D2 indisponible ; le résultat engagé est conservé.','D2 preview unavailable; the committed result is preserved.'));controls();}});
 automaticD2Gesture=bindInteractiveControl(minimum,{onDiagnostic:value=>diagnostic({level:'info',kind:'parameter-preview.gesture',operation:activeAnalysis,field:'automatic-d2-minimum',metrics:value}),read:()=>({valid:minimum.value!==''&&minimum.checkValidity(),value:Number(minimum.value)}),begin:event=>{revokeAutomaticOpacityPreview();automaticGesture?.reset('d2-minimum');automaticD2Preview.begin(automaticD2Event(event));},preview:event=>automaticD2Preview.preview(automaticD2Event(event)),commit:event=>automaticD2Preview.commit(automaticD2Event(event)),cancel:event=>automaticD2Preview.reset(event.reason,{restore:event.reason==='unchanged'})});bindSliderReset(minimum,validAutomaticSettings()['d2-minimum'],()=>{automaticD2Gesture.input();automaticD2Gesture.finish('reset');});
 $('automatic-view').onchange=()=>{revokeAutomaticOpacityPreview();automaticGesture?.reset('settings-change');automaticD2Gesture?.reset('settings-change');automaticD2Preview?.reset('settings-change');void showAutomatic().catch(error=>status(t('error')+' · '+error.message));};
 const opacity=$('automatic-opacity');automaticGesture=bindInteractiveControl(opacity,{onDiagnostic:value=>diagnostic({level:'info',kind:'parameter-preview.gesture',operation:activeAnalysis,field:'automatic-opacity',metrics:value}),read:()=>({valid:opacity.value!==''&&opacity.checkValidity(),value:Number(opacity.value)}),begin:()=>{automaticOpacityCommitted=Number(opacity.value);revokeAutomaticOpacityPreview();automaticD2Gesture?.reset('opacity-change');automaticD2Preview?.reset('opacity-change');automaticPresentationDraft=true;automaticGestureVersion++;controls();},preview:queueAutomaticOpacityPreview,commit:()=>{revokeAutomaticOpacityPreview();const token=++automaticGestureVersion;persistSettings();void showAutomatic().catch(error=>status(t('error')+' · '+error.message)).finally(()=>{if(token!==automaticGestureVersion)return;automaticPresentationDraft=false;controls();$('export-png').disabled=!result;});},cancel:event=>{revokeAutomaticOpacityPreview();const token=++automaticGestureVersion;automaticPresentationDraft=event.reason==='unchanged';if(event.reason==='unchanged')void showAutomatic({isCurrent:()=>token===automaticGestureVersion}).catch(error=>status(t('error')+' · '+error.message)).finally(()=>{if(token===automaticGestureVersion){automaticPresentationDraft=false;controls();}});controls();}});
 bindSliderReset(opacity,validAutomaticSettings().opacity,()=>{automaticGesture.input();automaticGesture.finish('reset');});
}

async function reloadToolSource(){
 const rev=revision;busy=true;controls();
 try{await drainRetiredPanelClients('individual');await drainRetiredPanelClients('automatic');await compositeCleanup;if(rev!==revision)return;const caps=await request('capabilities');if(rev!==revision)return;engineCapabilities=caps;const descriptor=await request('load',{id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});renderCapabilities();draw();}
 catch(error){if(rev===revision)status(t('error')+' · '+error.message);}
 finally{if(rev===revision){busy=false;controls();queueAnalysis();}}
}

function automaticLegend(){const layer=$('automatic-view').value;return layer==='corroboration'?autoText('Corroboration : nombre de détecteurs × contextes de recherche. L’ELA ne compte pas comme un vote.','Corroboration: detector × search-context count. ELA is not a vote.'):layer==='ela-preview'?autoText('Aperçu ELA calculé sur l’image originale.','ELA preview calculated from the original image.'):autoText('Énergie JPEG relative, affichée de 0 à 1. Ce n’est pas une probabilité.','Relative JPEG energy, displayed from 0 to 1. This is not a probability.');}
function automaticSettings(){return validAutomaticSettings({cloneWindowMode:$('automatic-clone-window-global').checked?'global':'independent',...Object.fromEntries(['scope','source','view','relation','branch','d2-minimum','opacity'].map(key=>[key,['d2-minimum','opacity'].includes(key)?Number($('automatic-'+key).value):$('automatic-'+key).value]))});}
function loadAutomaticSettings(value){for(const [key,item]of Object.entries(validAutomaticSettings(value))){if(key==='cloneWindowMode')$('automatic-clone-window-global').checked=item==='global';else $('automatic-'+key).value=item;}}

function automaticViewActions(){return [...(activeAnalysis==='analysis.complete'&&automaticElaContextControl?.available?[{method:'setElaNativeContext',value:automaticElaContextControl.value}]:[]),{method:'selectTab',value:$('automatic-source').value},{method:'setRelation',value:$('automatic-relation').value},{method:'setForgeryscopeBranch',value:$('automatic-branch').value},{method:'setD2prlMinimum',value:Number($('automatic-d2-minimum').value)}];}

async function individualActivity(fn){if(busy)return;busy=true;controls();try{return await fn();}finally{busy=false;controls();if(parameterWorkerPreparation)scheduleDraw();}}
async function ensureIndividualClient(){
 if(individualClient)return individualClient;
 if(!individualOpening){const epoch=individualEpoch;individualOpening=(async()=>{await drainRetiredPanelClients('individual');const client=await createToolClient({computeProfile:$('compute-profile').value,onParameterExportRetired:rearmParameterWorkerAfterExport,...(host.engineFactory?{engineFactory:host.engineFactory}:{}),onInvalidated:({resultLost})=>{if(epoch!==individualEpoch||!resultLost)return;discardIndividualPresentation();resultMeta={...resultMeta,status:'unavailable',error:{code:'WORKER_RECREATED',message:autoText('Le moteur a été recréé. L’image originale est conservée ; ce résultat doit être recalculé.','The engine was recreated. The original is retained; this result must be recalculated.')}};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-png').disabled=true;status(resultMeta.error.message);controls();draw();},onProgress:event=>{if(epoch!==individualEpoch||individualComputing?.revision!==revision)return;lastIndividualProgress={phase:event.phase,completed:event.completed,total:event.total,fragmentIndex:event.fragmentIndex,fragments:event.fragments};if(zeroViewPresentation&&activeAnalysis==='jpeg.zero')$('progress').removeAttribute('value');else renderProgress($('progress'),event);status(isExtensionTool(activeAnalysis)?extensionProgressText(event,lang):progressText(t('running'),event,{language:lang}));}});if(epoch!==individualEpoch){await client.dispose();throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});}return individualClient=client;})().finally(()=>individualOpening=null);}
 return individualOpening;
}
async function individualRequest(action,payload,displayRead){const ticket=action==='read-display'&&zeroViewCurrent()&&zeroViewPresentation.surface?.display===payload.display?zeroViewPresentation:null;if(ticket)ticket.reads++;try{const client=await ensureIndividualClient();if(action==='capabilities')return client.capabilities();if(action==='load')return client.load(payload);if(action==='read-display')return {pixels:await client.readTile(payload.display,payload.tile,displayRead)};if(action==='read-window')return {pixels:await client.readWindow(payload.display,payload.rect)};throw Error('Unsupported tool action: '+action);}finally{if(ticket){ticket.reads--;if(zeroViewCurrent(ticket))host.changed?.();}}}
function discardIndividualPresentation(){
 const preserveZero=zeroViewCurrent();if(zeroViewPresentation){clearZeroViewPresentation({restore:preserveZero});if(preserveZero){individualUI?.invalidateResult();draw();return;}}
 individualUI?.invalidateResult();retireResult(false);presentedSurface=null;$('layer').value='source';$('export-png').disabled=true;
 // The original may still need its first viewport. Clear the old canvas now,
 // so it cannot be mistaken for a result belonging to this failed operation.
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.restore();
}
function showIndividualSurface(display,presentation={}){
 if(display.responsePreview&&display.pixels){
  if(typeof presentation.previewCurrent!=='function'||presentation.previewCurrent()!==true)return;
  const next=createPreviewSurface(display.pixels,{document});next.parameterPreviewCurrent=presentation.previewCurrent;rememberSourceRegionPresentationSpace(next,presentation);observePreviewPresentation(next,{adaptivePreview:display.adaptivePreview});retireResult();result=next;$('layer').value=$('app').classList.contains('original-mode')?'source':'result';$('export-png').disabled=true;
  diagnostic({level:'info',operation:individualUI.operation(),...presentation.gesture,gestureKind:presentation.gesture?.kind,kind:'parameter-preview.frame',provisional:true,calculatedPresentation:presentation.calculated,requestedPresentation:presentation.requested,latestRequestedSettings:presentation.latest?.(),metrics:{adaptivePreview:display.adaptivePreview}});draw();status(autoText('Aperçu provisoire','Provisional preview'));return;
 }
 const rev=revision,operation=resultMeta?.operation??individualUI.operation(),view=structuredClone(individualUI.view()),reportOwner=resultMeta,sourceOwner=sourceRegionTaskIdentity();let next;
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
 });rememberSourceRegionPresentationSpace(next,presentation);observePreviewPresentation(next,{adaptivePreview:display.adaptivePreview});result=next;if(zeroViewCurrent()&&zeroViewPresentation.outputId===resultMeta?.id)zeroViewPresentation.surface=next;const ocrPresentation=ocrPresentationSnapshot(display,reportOwner,hash);if(ocrPresentation&&!individualCancelled&&resultMeta===reportOwner&&sourceRegionTaskIsCurrent(sourceOwner)){resultMeta={...reportOwner,presentation:{...reportOwner.presentation,ocr:ocrPresentation}};$('provenance').textContent=JSON.stringify(resultMeta,null,2);}$('layer').value=$('app').classList.contains('original-mode')?'source':'result';$('export-png').disabled=!!display.responsePreview||!!parameterSession?.pending;if(source&&(display.width!==source.width||display.height!==source.height))fit();else draw();
}
async function runWithSourceFallback(task,owner,{execute,makeWhole}){
 try{return{task,output:await execute(task)};}
 catch(error){
  if(error.code!=='SOURCE_SCOPE_UNSUPPORTED'||!task.sourceRegionDomain||!host.requestWholeSourceFallback||!sourceRegionTaskIsCurrent(owner))throw error;
  let fullTask;try{fullTask=makeWhole(task);}catch{throw error;}
  delete fullTask.sourceRegionDomain;delete fullTask.sourceRegionLocalization;
  const context={sourceSha256:hash,requestedFingerprint:task.sourceRegionDomain.fingerprint,reason:error.details?.sourceRegionCapability?.limitation??error.code};
  const current=async()=>sourceRegionTaskIsCurrent(owner)&&context.requestedFingerprint===(await analysisSourceDomain())?.fingerprint;
  const limitation=error.details?.sourceRegionCapability?.limitation;
  const reason=limitation==='ORIGINAL_ENCODED_SOURCE_REQUIRED'?autoText('Cet outil examine les données du fichier original ; des pixels recadrés ne peuvent pas les remplacer.','This tool examines the original encoded file; cropped pixels cannot replace that evidence.'):autoText('Cet outil ne prend pas encore en charge ce périmètre de sélection avant son calcul.','This tool does not yet support this selection domain before its calculation.');
  const approved=await host.requestWholeSourceFallback({operation:task.operation,reason,isCurrent:current});
  if(!approved||!await current())throw Object.assign(Error('Whole-source calculation cancelled.'),{code:'CANCELLED'});
  const output=await execute(fullTask);
  if(!await current())throw Object.assign(Error('Source regions changed during whole-source fallback.'),{code:'CANCELLED'});
  wholeSourceFallbackTasks.set(fullTask,context);
  const receipt={...context,wholeOriginal:true,userAuthorized:true};
  return{task:fullTask,output:{...output,provenance:{...output.provenance,sourceScopeFallback:receipt},...(output.metadata?{metadata:{...output.metadata,sourceScopeFallback:receipt}}:{})}};
 }
}
async function runScopedIndividualTask(client,task,owner,context){
 const extras=individualUI.extras;
 return runWithSourceFallback(task,owner,{
  execute:submitted=>client.run(submitted,{...extras,sourceRegionDomain:submitted.sourceRegionDomain},context),
  makeWhole:submitted=>({...submitted,id:'whole-source-'+crypto.randomUUID(),params:individualUI.params([]),regions:individualUI.taskRegions([])})
 });
}
async function runIndividual(options={}){
 const recomputeBackend=['cpu','webgpu'].includes(options?.recomputeBackend)?options.recomputeBackend:null;
 if(!parameterCommitting)parameterSession?.reset('calculate',{restoreResult:false});
 clearTimeout(autoRunTimer);autoRunTimer=null;if(busy||!fileInput||activeAnalysis==='file.similarity')return;if(localMagnifier()&&!await sourceDomainRestricted()){refreshLocalMagnifier();return;}
 if(nativeControlOperation()&&!await refreshNativeControlConstraints({retry:true}))return;
 const form=$('tool-form');if(!form.reportValidity())return;
 const previousCore=(stagedCoreOperation({operation:activeAnalysis})||activeAnalysis==='various.ocr'&&individualUI.params().algorithm==='tesseract')?{client:individualClient,output:individualClient?.result,metadata:resultMeta,recomputeTicket:parameterWorkerBase,file:fileInput,hash,revision,operation:activeAnalysis}:null;
 const restorePreviousCore=async()=>{const current=()=>!!previousCore?.output&&individualClient===previousCore.client&&individualClient.result===previousCore.output&&fileInput===previousCore.file&&hash===previousCore.hash&&revision===previousCore.revision&&activeAnalysis===previousCore.operation&&!destroyed&&(!recomputeBackend||previousCore.recomputeTicket?.output===previousCore.output&&previousCore.recomputeTicket.recomputeCurrent?.()===true);if(!current())return false;resultMeta=previousCore.metadata??{id:previousCore.output.id,operation:previousCore.output.operation,status:previousCore.output.status,provenance:previousCore.output.provenance,metrics:previousCore.output.metrics};await individualUI.render(previousCore.output);if(!current())return false;if(recomputeBackend){parameterWorkerBase=previousCore.recomputeTicket;parameterWorkerPreparation=null;}resultMeta={...resultMeta,ui:{...resultMeta.ui,pendingScientificScope:regionController?.scope?.fingerprint}};$('provenance').textContent=JSON.stringify(resultMeta,null,2);return true;};
 const zeroTicket=activeAnalysis==='jpeg.zero'?(zeroViewCurrent()?zeroViewPresentation:beginZeroViewPresentation(individualUI.params().view)):null;individualCancelled=false;lastIndividualProgress=null;busy=true;controls();const rev=revision,sourceRegionOwner=sourceRegionTaskIdentity(),computation={revision:rev};individualComputing=computation;let submitted;status(t('running'));if(zeroTicket)$('progress').removeAttribute('value');else $('progress').value=0;individualUI.invalidateResult({preserve:true});retireResult();resultMeta=null;$('provenance').textContent='';$('export-png').disabled=true;$('export-report').disabled=true;
 try{await drainRetiredPanelClients('individual');await drainRetiredPanelClients('automatic');await compositeCleanup;if(rev!==revision)return;
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
 const coreScopeOwner=(stagedCoreOperation({operation:activeAnalysis})||activeAnalysis==='various.ocr'&&individualUI.params().algorithm==='tesseract')?{client,nativeSource:client.source,panelSource:source,scope:regionController?.scope,fingerprint:regionController?.scope?.fingerprint,inherited:sourceRegionsSnapshot(),localOverride:sourceRegionsLocalOverride}:null,coreScopeCurrent=()=>!!coreScopeOwner&&sourceRegionTaskIsCurrent(sourceRegionOwner)&&!individualCancelled&&client===individualClient&&client.source===coreScopeOwner.nativeSource&&source===coreScopeOwner.panelSource&&regionController?.scope===coreScopeOwner.scope&&regionController?.scope?.fingerprint===coreScopeOwner.fingerprint&&sourceRegionsSnapshot()===coreScopeOwner.inherited&&sourceRegionsLocalOverride===coreScopeOwner.localOverride,coreRecomputeScopeCurrent=()=>!!coreScopeOwner&&sourceRegionTaskIsCurrent(sourceRegionOwner)&&client===individualClient&&client.source===coreScopeOwner.nativeSource&&source===coreScopeOwner.panelSource&&regionController?.scope===coreScopeOwner.scope&&regionController?.scope?.fingerprint===coreScopeOwner.fingerprint&&sourceRegionsSnapshot()===coreScopeOwner.inherited&&sourceRegionsLocalOverride===coreScopeOwner.localOverride;
 const plotConstraintOwner=activeAnalysis==='colors.plots'?plotSourceConstraintsKey():null;const analysisRegions=regions.filter(r=>r.kind!=='exclusion');submitted={id:'tool-'+crypto.randomUUID(),imageId,operation:individualUI.operation(),params:individualUI.params(analysisRegions,{scientificScope:regionController?.scope}),backend:individualUI.backend(),view:individualUI.view(),regions:individualUI.taskRegions(analysisRegions,{scientificScope:regionController?.scope})};submitted=regionController?.active()?regionController.task(submitted):submitted;submitted=await bindSourceRegionTask(submitted);if(!sourceRegionTaskIsCurrent(sourceRegionOwner))return;if(nativeControlOperation()){const key=nativeControlConstraintsKey(),contexts=await nativeParameterContexts({width:source.width,height:source.height,sourceSha256:hash,sourceRegionDomain:submitted.sourceRegionDomain});if(!sourceRegionTaskIsCurrent(sourceRegionOwner)||key!==nativeControlConstraintsKey())return;adoptNativeControlConstraints(contexts,key);if(!form.reportValidity())return;submitted.params=individualUI.params(analysisRegions,{scientificScope:regionController?.scope});}if(activeAnalysis==='colors.plots'){if(plotConstraintOwner!==plotSourceConstraintsKey())throw Object.assign(Error('Original regions changed before the plot input was ready.'),{code:'CANCELLED'});adoptPlotSourceConstraints(submitted.sourceRegionDomain,plotConstraintOwner);submitted.params=individualUI.params(analysisRegions,{scientificScope:regionController?.scope});}if(recomputeBackend){if(submitted.operation!=='noise.separation'||submitted.params?.mode!==4||submitted.backend!==recomputeBackend)throw Object.assign(Error('The explicit recomputation selection changed.'),{code:'CANCELLED'});submitted={...submitted,recompute:{kind:'human-backend',backend:recomputeBackend}};}const guardedCore=stagedCoreOperation(submitted)||submitted.operation==='various.ocr'&&submitted.params?.algorithm==='tesseract',context=guardedCore?{...(recomputeBackend?{humanRecompute:true}:{}),isCurrent:coreScopeCurrent,onCoreResult:async(next,{task:completed,isCurrent})=>{
 if(!isCurrent()||!sourceRegionTaskIsCurrent(sourceRegionOwner)||!await acknowledgeSourceRegionTask(completed,sourceRegionOwner)||!isCurrent()||!sourceRegionTaskIsCurrent(sourceRegionOwner)){await restorePreviousCore();return false;}
 try{
  adoptSourceRegionPresentation(next,completed,sourceRegionOwner);resultMeta={id:next.id,operation:next.operation,status:next.status,provenance:next.provenance,metrics:next.metrics};await individualUI.render(next);
  if(!isCurrent()||!sourceRegionTaskIsCurrent(sourceRegionOwner)||!await acknowledgeSourceRegionTask(completed,sourceRegionOwner)||!isCurrent()){await restorePreviousCore();return false;}
  if(regionController?.active())regionController.accept(next);if(completed.sourceRegionDomain&&result){const surface=result,ticket={client,task:completed,output:next,surface,source:client.source,panelSource:source,file:fileInput};ticket.recomputeCurrent=()=>coreRecomputeScopeCurrent()&&client.result===next;ticket.isCurrent=()=>!destroyed&&!panelDisposal&&client===individualClient&&client.source===ticket.source&&source===ticket.panelSource&&fileInput===ticket.file&&rev===revision&&!busy&&!individualCancelled&&activeAnalysis===completed.operation&&sourceRegionTaskIsCurrent(sourceRegionOwner)&&result===surface&&presentedSurface===surface;parameterWorkerBase=parameterWorkerPreparation=ticket;scheduleDraw();}$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;$('progress').value=1;status(t('done'));return true;
 }catch(error){try{await restorePreviousCore();}catch(cleanup){try{if(Object.isExtensible(error))error.cleanupErrors=[...(error.cleanupErrors??[]),cleanup];}catch{}}throw error;}
}}:undefined;const execution=await runScopedIndividualTask(client,submitted,sourceRegionOwner,context);if(guardedCore){if(!execution.output){await restorePreviousCore();status(autoText('Zones modifiées. Cliquez sur Calculer pour les appliquer.','Regions edited. Click Calculate to apply them.'));}else if(resultMeta?.id===execution.output.id)$('provenance').textContent=JSON.stringify(resultMeta,null,2);return;}submitted=execution.task;output=execution.output;if(!sourceRegionTaskIsCurrent(sourceRegionOwner)||zeroTicket&&!zeroViewCurrent(zeroTicket))return;await acknowledgeSourceRegionTask(submitted,sourceRegionOwner);if(!sourceRegionTaskIsCurrent(sourceRegionOwner)||zeroTicket&&!zeroViewCurrent(zeroTicket))return;adoptSourceRegionPresentation(output,submitted,sourceRegionOwner);if(individualComputing===computation)individualComputing=null;
 const subimageSelection=activeAnalysis==='ai.clones.d2prl'&&submitted.params.selectionPresent?individualSubimageProvenance(regions,{width:source?.width,height:source?.height,sourceSha256:hash}):null;
 resultMeta={id:output.id,operation:output.operation,status:output.status,provenance:output.provenance,metrics:output.metrics,...(output.notice?{notice:output.notice}:{}),...(isExtensionTool(output.operation)?{data:output.data}:{}),...(subimageSelection?{ui:{subimageSelection,requestedRegions:structuredClone(submitted.regions),selectionPresent:submitted.params.selectionPresent}}:{})};$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;
 if(zeroViewCurrent(zeroTicket)){zeroTicket.outputId=output.id;zeroTicket.wholeFallback=wholeSourceFallbackTasks.has(submitted);$('progress').removeAttribute('value');status(zeroViewRendering());}await individualUI.render(output);if(regionController?.active())regionController.accept(output);
 if(['detail.gradient','inspection.adjust','detail.frequency','detail.echo','noise.separation'].includes(submitted.operation)&&submitted.sourceRegionDomain&&result){const surface=result,ticket={client,task:submitted,output,surface,source:client.source,panelSource:source,file:fileInput};ticket.isCurrent=()=>!destroyed&&!panelDisposal&&client===individualClient&&client.source===ticket.source&&source===ticket.panelSource&&fileInput===ticket.file&&rev===revision&&!busy&&!individualCancelled&&activeAnalysis===submitted.operation&&sourceRegionTaskIsCurrent(sourceRegionOwner)&&result===surface&&presentedSurface===surface;parameterWorkerBase=parameterWorkerPreparation=ticket;scheduleDraw();}
 }
 $('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;
 if(rev!==revision||resultMeta?.phase==='display'&&resultMeta.status==='error')return;if(individualCancelled)throw Object.assign(Error('Cancelled'),{code:'CANCELLED'});individualUI.setOriginal(comparingOriginal||drawing||localMagnifier()||$('app').classList.contains('original-mode'));if(zeroViewCurrent(zeroTicket)){$('progress').removeAttribute('value');status(zeroViewRendering());}else $('progress').value=1;if(localMagnifier())refreshLocalMagnifier();else if(!zeroViewCurrent(zeroTicket))status((output.status==='insufficient-support'||output.status==='partial')?nativeSupportNotice(output,lang)??t('done'):output.status==='no-regions'?autoText('Aucune région correspondante.','No matching regions.'):t('done'));
 if(wholeSourceFallbackTasks.has(submitted)&&!zeroViewCurrent(zeroTicket))status(t('done')+' · '+autoText('Analyse effectuée sur l’image originale entière ; vos zones sont conservées.','Analysis used the complete original image; your regions are kept.'));
 }catch(error){if(rev===revision){let restoredCore=false;try{restoredCore=await restorePreviousCore();}catch(cleanup){try{if(Object.isExtensible(error))error.cleanupErrors=[...(error.cleanupErrors??[]),cleanup];}catch{}}if(!restoredCore)discardIndividualPresentation();let diagnostic;if(error.code!=='CANCELLED'){const parameters=submitted?.params??individualUI.serialize()[activeAnalysis];diagnostic=errorJournal.record(error,{operation:submitted?.operation??individualUI.operation(),algorithm:parameters?.algorithm??parameters?.profile,parameters,view:individualUI.view(),backend:individualUI.backend(),width:source?.width,height:source?.height,progress:lastIndividualProgress});translateTaskActions();}const failedAttempt={operation:individualUI.operation(),status:error.code==='CANCELLED'?'cancelled':'error',originalSha256:hash,error:diagnostic?.error??errorEvidence(error),...(diagnostic?{context:diagnostic.context}:{})};resultMeta=restoredCore?{...resultMeta,ui:{...resultMeta.ui,failedAttempt}}:failedAttempt;$('provenance').textContent=JSON.stringify(resultMeta,null,2);$('export-report').disabled=false;status(error.code==='CANCELLED'?t('cancelled'):t('error')+' · '+(jpegDctFormatNotice(error,{operation:submitted?.operation??individualUI.operation(),language:lang})??errorText(error,lang)));}}
 finally{if(individualComputing===computation)individualComputing=null;if(rev===revision){busy=false;controls();draw();if(pendingMagnifier)queueAnalysis();}}
}

 function translateTaskActions(){
  const calculate=$('task-run'),zones=$('task-zones'),detect=$('task-auto-zones'),subimages=$('task-detect-subimages'),errors=$('task-errors');
  if(errors){errors.hidden=!errorJournal.length;errors.textContent=autoText('Diagnostic','Diagnostics')+' ('+errorJournal.length+')';errors.title=autoText('Lire ou exporter les dernières erreurs de cet outil.','Read or export recent errors from this tool.');}
  if(calculate){calculate.textContent=individualMode()?autoText('Calculer','Calculate'):t('run');calculate.title=comparisonRunNotice()||autoText('Lancer ou recalculer avec les réglages et les zones actuels.','Run or recalculate with the current settings and regions.');}
  if(zones){zones.textContent=regionController?.active()?autoText('Modifier les zones','Edit regions'):drawing?autoText('Terminer le tracé','Finish drawing'):t('draw');zones.title=autoText('Cliquez puis glissez sur l’image pour ajouter une zone. Échap termine le tracé ; Calculer lance ensuite l’analyse.','Click and drag on the image to add a region. Escape ends drawing; Calculate then starts analysis.');}
  if(detect){detect.hidden=!regionController?.active();detect.textContent=autoText('Détecter automatiquement','Detect automatically');detect.title=autoText('Prépare les zones avec le classificateur de panneaux et le choix OCR actuel, comme dans Modifier les zones. Ajustez-les puis cliquez sur Calculer.','Prepares regions with the panel classifier and the current OCR choice, as in Edit regions. Adjust them then click Calculate.');}
  if(subimages){subimages.hidden=false;subimages.textContent=autoText('Détecter les sous-images','Detect subimages');subimages.title=autoText('Repère géométriquement les panneaux dans les pixels admis, sans classification ni OCR, comme dans Modifier les zones. Ajustez-les puis cliquez sur Calculer.','Detects geometric panels within the admitted pixels, without classification or OCR, as in Edit regions. Adjust them then click Calculate.');}
 }
 async function detectRegions(kind='subimages'){
  if(busy||!fileInput)return;clearTimeout(autoRunTimer);autoRunTimer=null;setDrawing(false);
  const rev=revision;busy=true;controls();status(kind==='automatic'?autoText('Détection automatique…','Detecting automatically…'):autoText('Détection des sous-images…','Detecting subimages…'));
  try{
   const client=await ensureIndividualClient();if(!client.source){const descriptor=await client.load({id:imageId,blob:fileInput});if(rev!==revision)return;loaded=true;source?.close?.();source=remoteSurface({...descriptor.surface,chroma:descriptor.provenance?.chroma});}
   if(regionController?.active()){const scope=await (kind==='automatic'?regionController.detectAutomatically():regionController.detectSubimages());if(rev!==revision||destroyed)return;regions=regionController.rectangles();renderRegions();status(scope.status==='ready'?autoText('Zones et exclusions préparées. Ajustez-les, puis cliquez sur Calculer.','Regions and exclusions prepared. Edit them, then Calculate.'):autoText('Préparation à vérifier. Ouvrez Modifier les zones avant de calculer.','Preparation requires review. Open Edit regions before calculating.'));return;}
   if(kind==='automatic')throw Object.assign(Error('Automatic region detection requires the editable region owner.'),{code:'SOURCE_SCOPE_UNSUPPORTED'});
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
  const zones=document.createElement('button');zones.id='task-zones';zones.setAttribute('aria-pressed','false');zones.onclick=()=>{if(regionController?.active()){void regionController.edit({tool:'select'}).catch(error=>status(t('error')+' · '+error.message));return;}$('draw').onclick();if(drawing&&automaticMode())$('automatic-scope').value='selected';if(drawing&&activeAnalysis==='ai.clones.d2prl'){const scope=$('tool-neural-scope');scope.value=neuralDrawingScope(individualUI.extras.neuralMethod,scope.value);scope.onchange();}};
  if(regionController?.active())place.append(zones);
  if(['tampering.copyMove.sparse','ai.clones.d2prl','analysis.complete','analysis.clones'].includes(activeAnalysis)){const detect=document.createElement('button'),subimages=document.createElement('button');detect.id='task-auto-zones';detect.onclick=()=>detectRegions('automatic');subimages.id='task-detect-subimages';subimages.onclick=()=>detectRegions('subimages');place.append(detect,subimages);}
  $('zone-mode').closest('label').hidden=true;document.querySelectorAll('[data-i18n=zoneLimit]').forEach(e=>e.hidden=true);
  const target=automaticMode()?$('automatic-controls'):individualMode()?$('tool-controls'):compositeMode()?$('composite-controls').querySelector('.parameter-bar'):$('analysis-controls');
  if(!host.sourceOnly){target.prepend(place);if(regionController?.active()){regionParent.classList.add('individual-region-inline');place.append(regionParent);}}
  // These are presentation controls of the current task, not a footer toolbar.
  if(!host.sourceOnly)$('energy-controls').append($('energy-presentation'));
  if(host.sourceOnly)$('tool-controls').hidden=true;
  translate();controls();
 }
 function adoptInput(input){if(!input)return;const sourceChanged=input.hash!==hash||input.imageId!==imageId||input.file!==fileInput;if(sourceChanged){if(clearZeroViewPresentation()){retireResult(false);status(t('ready'));}sourceRegionsLocalOverride=false;inheritedScopeFingerprint=null;}if(pendingSourceRegionsLocalOverride!==null)sourceRegionsLocalOverride=pendingSourceRegionsLocalOverride;pendingSourceRegionsLocalOverride=null;captureInheritedSourceRegions(input,{sourceChanged});sourceRegionsStale=false;source?.close?.();fileInput=input.file;imageId=input.imageId;hash=input.hash;energyHistogramUI?.update(null);elaAutomatic=null;syncElaAutomatic();source=input.source.fork?.(scheduleDraw)??{...input.source,close(){}};if(sourceChanged||!presentedSurface)beginSourceFrame();loaded=false;individualUI.setFile(fileInput);regionController?.sourceChanged();if(pendingScientificRegions){const controller=regionController,sourceOwner=source;void controller?.restore(pendingScientificRegions).then(()=>{if(destroyed||regionController!==controller||source!==sourceOwner)return;regions=controller.rectangles();renderRegions();draw();controls();}).catch(e=>status(t('error')+' · '+e.message));pendingScientificRegions=null;}$('empty').hidden=true;$('file-info').textContent=input.description;fit();controls();queueAnalysis();}
 return {
  async load(file){await openFile(file);if(!fileInput)throw new Error($('status').textContent);},
  adopt:adoptInput,
  input(){return {file:fileInput,imageId,hash,source,description:$('file-info').textContent,...(sourceRegionsSnapshot()?{sourceRegions:structuredClone(sourceRegionsSnapshot())}:{})};},
  analysisSourceDomain,markSourceRegionsStale,visibilityChanged:sourceFrameVisibilityChanged,refreshOriginalRegions(){draw();},regionDetectionClient:ensureIndividualClient,
  get busy(){return busy||energyViewBusy||!!exportController||zeroViewTaskBusy();},
  snapshot(){return {busy:busy||energyViewBusy||elaPreviewBusy||!!exportController||zeroViewTaskBusy(),status:$('status').textContent,progress:$('progress').hasAttribute('value')?Number($('progress').value):null,hasResult:!!result&&!result.previewOnly&&!elaProvisional()&&!parameterProvisional()||localMagnifier()&&!!source,hasReport:!!resultMeta&&!elaProvisional()&&!parameterProvisional(),zoom:displayedZoom(),loupe:pointerLoupe?.enabled,sourceRegionsStale,sourceRegionsLocalOverride,previewPending:!!zeroViewPresentation||!!previousPresentation&&!result,fileInfo:$('file-info').textContent};},
  setHighlight(value){$('highlight-new-features').checked=!!value;applyHighlights();},setLanguage(value){lang=value;translate();individualUI?.redraw?.();},setTheme(value){theme=value;updateChrome();individualUI?.redraw?.();},
  toggleLoupeSweep:group=>pointerLoupe?.toggleSweep(group),stopLoupeSweep:()=>pointerLoupe?.stopSweep(),loupeSweepState:()=>pointerLoupe?.sweeping,loupeEffectsContext,setLoupeEffectsContext,loupeEnhancement(){if(activeAnalysis!=='inspection.magnifier')return null;const p=individualUI.params();return{enabled:true,mode:p.mode,percent:p.percent,channel:p.channel,...(p.equalization?{equalization:p.equalization}:{})};},setLoupeEnhancement(value){if(activeAnalysis==='inspection.magnifier')individualUI.updateParams({mode:value.mode,percent:value.percent,channel:value.channel,equalization:equalizationState(value.equalization,value.mode,'inspection.magnifier')});},setCompareOriginal,pinLoupe:value=>pointerLoupe?.pin(value),loupeAnchor:()=>pointerLoupe?.anchor(),loupeDiagnostics:()=>pointerLoupe?.diagnostics(),loupePresentationIdentity:()=>pointerLoupe?.presentationIdentity?.(),loupeKeydown:e=>pointerLoupe?.keydown(e),exportSize(){const s=host.sourceOnly?source:selectedSurface();return s?{width:s.width,height:s.height}:null;},setLoupe,loupeMinimum(){const frame=$('layer').value==='result'&&result?result:source;return frame&&view.clientWidth&&view.clientHeight?loupeMinimumZoom(loupeSettings,Math.min(view.clientWidth/frame.width,view.clientHeight/frame.height)*.95,activeAnalysis==='inspection.magnifier'):2;},activate(){if(host.managed&&!drawing)$('layer').value=host.sourceOnly||localMagnifier()?'source':processedSurface()?'result':'source';draw();individualUI?.redraw?.();},setNavigation(value){$('navigation-mode').value=value;},setComputeProfile(value){if(!individualClient&&!automaticClient&&!compositeClient&&!worker&&!busy)$('compute-profile').value=value;},restoreSession:restore,fit,zoomBy(factor){zoomAt({x:view.clientWidth/2,y:view.clientHeight/2},factor);},
  exportImage,
  exportReport(){return $('export-report').onclick();},saveSession(){return $('save-session').onclick();},
  settings:settingsBundle,
  applySettings(value){if(busy)throw new Error(t('running'));const validated=validateSettings(value);if(host.sourceOnly)return;applySettings(validated);if(host.managed){$('app').classList.remove('original-mode');syncAnalysisControls();adoptInput(host.sourceInput?.());}},
  dispose(){if(panelDisposal)return panelDisposal;return panelDisposal=(async()=>{exportController?.abort();await localDownloadShelf?.dispose();await exportOwners.dispose();await retireExportWorker();await drainRetiredPanelClients();if(destroyed)return;destroyed=true;mainGraphics.dispose();ocrTextLayer?.dispose();ocrTextLayer=null;hoverSliders?.dispose();parameterSession?.dispose();automaticGesture?.dispose();automaticD2Gesture?.dispose();automaticD2Preview?.dispose();automaticElaContextControl?.dispose();const regionsOwner=regionController;regionController=null;await regionsOwner?.dispose();pointerLoupe?.dispose();energyUI?.dispose?.();energyHistogramUI?.dispose();for(const gesture of classicGestures)gesture.dispose();comparisonSource?.close?.();comparisonSource=comparisonBase=null;stop();individualUI?.dispose?.();retireResult(false);source?.close?.();source=result=fileInput=null;tileCache.release('');panelResize.disconnect();layouts?.dispose?.();window.removeEventListener('pagehide',onPageHide);window.removeEventListener('local-feature-change',onFeatureChange);document.fonts?.removeEventListener('loadingdone',onFonts);await Promise.allSettled([individualCleanup,automaticCleanup,compositeCleanup]);await drainRetiredPanelClients();})().catch(error=>{panelDisposal=null;throw error;});},
 };
}
