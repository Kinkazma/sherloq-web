import {createScientificScopePreviewRetirement} from './batch-scope-preview.js?v=0.25.0';
import {preparationMatchesSourceEnvelope} from './scientific-preparation-envelope.js?v=0.25.0';
import {createScopeDetectionActions} from './scope-detection-actions.js?v=0.25.0';
import {initializeSubimagesSelection,subimagesSelectionMode} from './subimages-selection-intent.js?v=0.25.0';
import {scientificScopeEnvelope} from './batch-scope-geometry.js?v=0.25.0';
import {compileOriginalSourceRegions} from './original-source-regions.js?v=0.25.0';
import {createBatchScopeEditor} from './batch-scope-editor.js?v=0.25.0';
import {createManualScopeDraft,restoreManualScopeZone,applyManualScopeDraft,manualDraftScope,restoreManualScientificScope} from './batch-scope-manual.js?v=0.25.0';
import {createBatchPreparationClient,reprojectNativeTextPreparation} from './batch-preparation-client.js?v=0.25.0';
import {detectIndividualSubimages} from './individual-subimages.js?v=0.25.0';
import {createIndividualScientificScope,individualScopeRectangles,scopeIndividualTask} from './individual-scientific-scope.js?v=0.25.0';
import {createDetectionRegionsPanel} from './detection-regions-panel.js?v=0.25.0';
import {detectionBiomes} from './detection-biomes.js?v=0.25.0';
import {scopeFingerprint,SCIENTIFIC_SCOPE_POLICY} from './batch-scientific-preparation.js?v=0.25.0';
import {clipPolygon} from './batch-scope-geometry.js?v=0.25.0';
import {SCIENTIFIC_TEXT_MODEL} from './scientific-text-detector.js?v=0.25.0';
import {EngineError,checkAbort} from './unified-engine/src/errors.js';

const copy=v=>structuredClone(v);
const supported=id=>['tampering.copyMove.sparse','ai.clones.d2prl','analysis.clones','analysis.complete'].includes(id);
// One image owns its editable scope. A result owns separate presentation
// contours; editing those contours never mutates its native pairs or groups.
export function createIndividualRegionController({document,parent,panelMode='legacy',canEditScope=supported,language=()=> 'fr',source,operation,getClient,getSourceDomain=async()=>null,prepareSourceScope=async()=>{},computeProfile=()=> 'maximum',navigationMode=()=> 'auto',preparationClientFactory=createBatchPreparationClient,scopeEditorFactory=createBatchScopeEditor,detectionActionsFactory=createScopeDetectionActions,onChange=()=>{},onHighlight=()=>{},onPresentation=()=>{},onError=()=>{},onProgress=()=>{}}={}){
 const realDocument=parent.ownerDocument??document;
 let scope=null,editor=null,highlight=null,mode='zones',groups=[],identity=null,overrides={},excludeTexts=false,disposed=false,sourceKey=null,controller=null,past=[],future=[],presentationRevision=0,savedPresentation=null;
 const pendingPreparations=new Set();
 let cancellationEpoch=0,editorEpoch=0,adoptingNative=false,disposeTask=null,fullyDisposed=false;
 const retiredEditors=createScientificScopePreviewRetirement(),editorCleanupOwners=new WeakMap();
 function retireEditor(value){if(!value)return Promise.resolve();let owner=editorCleanupOwners.get(value);if(!owner){let closed=false;owner={async cleanup(){if(closed)return;await value.dispose();closed=true;}};editorCleanupOwners.set(value,owner);}return retiredEditors.release(owner);}
 function preparationTask(fn){const epoch=cancellationEpoch,promise=Promise.resolve().then(()=>{if(disposed||epoch!==cancellationEpoch)throw new EngineError('CANCELLED','Individual preparation cancelled before startup.');return fn();});pendingPreparations.add(promise);promise.then(()=>pendingPreparations.delete(promise),()=>pendingPreparations.delete(promise));return promise;}
 const editorOnly=panelMode==='editor-only';
 const panel=createDetectionRegionsPanel({document,parent:editorOnly?null:parent,language,
  onHighlight:value=>{if(disposed)return;highlight=value;onHighlight(value);},
  onEdit:value=>void edit(value).catch(onError),
  onAddAcquisition:()=>void edit({tool:'acquisition'}).catch(onError),
  onAddExclusion:()=>void edit({tool:'exclusion'}).catch(onError),
  onModify:()=>void edit({tool:'select'}).catch(onError),
  onUndo:()=>history('undo'),onRedo:()=>history('redo'),
  onModeChange:value=>{if(disposed)return;mode=value;if(!adoptingNative)onPresentation(presentation());onHighlight(null);},
 });
 const textLabel=document.createElement('label'),textToggle=document.createElement('input');textToggle.type='checkbox';textToggle.checked=false;
 const textCaption=document.createElement('span');textLabel.className='detection-text-option';textLabel.append(textToggle,textCaption);parent.append(textLabel);
 const compactHistory=editorOnly?document.createElement('div'):null,compactUndo=editorOnly?document.createElement('button'):null,compactRedo=editorOnly?document.createElement('button'):null;
 if(compactHistory){compactHistory.className='individual-region-history';for(const [button,action]of [[compactUndo,'undo'],[compactRedo,'redo']]){button.type='button';button.dataset.regionHistory=action;button.onclick=()=>history(action);compactHistory.append(button);}parent.append(compactHistory);}
 textToggle.onchange=()=>{if(disposed)return;cancellationEpoch++;controller?.abort();excludeTexts=textToggle.checked;onChange({preparationOnly:true});};
 async function currentDomain(){const descriptor=await getSourceDomain();if(!descriptor)return null;const domain=await compileOriginalSourceRegions(descriptor);if(domain.empty)throw new EngineError('SOURCE_SCOPE_EMPTY','No original pixels are admitted by these regions.');return domain.countIncluded===domain.sourceWidth*domain.sourceHeight?null:domain;}
 const scopedTextUnavailable=()=>new EngineError('SOURCE_SCOPE_OCR_UNSUPPORTED','Scoped text detection requires a native source-region preparation adapter. The full original image is not substituted.');
 async function prepareText(input,domain,preparation,signal){
  if(!domain)return preparation.prepare(input.blob,{textOnly:true,signal,onProgress});
  const client=await getClient();checkAbort(signal);if(typeof client.acquirePreparationSource!=='function'||typeof preparation.prepareNativeSource!=='function')throw scopedTextUnavailable();let reader;
  try{reader=await client.acquirePreparationSource({sourceRegionDomain:domain.descriptor});checkAbort(signal);const prepared=await preparation.prepareNativeSource(reader,{sourceRegionDomain:domain.descriptor,textOnly:true,signal,onProgress});checkAbort(signal);return reprojectNativeTextPreparation(prepared,input,domain);}finally{await reader?.dispose();}
 }
 async function domainDetector(client,domain){if(!domain)return client;return{async detectSubimages(){const data=await client.detectSubimages({sourceRegionDomain:domain.descriptor});if(data?.sourceRegionDomain?.fingerprint!==domain.fingerprint)throw new EngineError('SOURCE_SCOPE_DETECTION_UNSUPPORTED','The subimage detector did not acknowledge the native source domain.');if(!Array.isArray(data.regions)||data.regions.some(region=>!Array.isArray(region?.bounds)||region.bounds.length!==4||!region.bounds.every(Number.isSafeInteger)||region.bounds[0]<0||region.bounds[1]<0||region.bounds[2]>domain.width||region.bounds[3]>domain.height||region.bounds[0]>=region.bounds[2]||region.bounds[1]>=region.bounds[3]))throw new EngineError('INVALID_INPUT','Subimage detector regions must use the admitted native crop grid.');const [dx,dy]=domain.origin;return{...data,regions:data.regions?.map(region=>({...region,bounds:[region.bounds[0]+dx,region.bounds[1]+dy,region.bounds[2]+dx,region.bounds[3]+dy]})),...(data.polygons?{polygons:data.polygons.map(polygon=>polygon.map(([x,y])=>[x+dx,y+dy]))}:{})};}};}
 function currentImage(){if(disposed)throw new EngineError('DISPOSED','Individual region controller disposed.');const input=source();if(!input?.blob||!input.sourceSha256||!input.width||!input.height)throw Error('Ouvrez une image avant de modifier ses zones.');return {...input,preparation:scope};}
 function active(){return !disposed&&canEditScope(operation());}
 function scientificActive(){return !disposed&&supported(operation());}
 function visibleGroups(){return groups.map(g=>overrides[g.id]?{...g,polygons:copy(overrides[g.id].polygons),presentationEdited:true}:g);}
 function presentation(){if(disposed)return null;const image=source();return mode==='biomes'&&groups.length&&image?{id:'biome-presentation-'+identity+':scope:'+(scope?.fingerprint??'whole'),revision:presentationRevision+1,width:image.width,height:image.height,format:'rgb8',biomePresentation:{groups:visibleGroups(),nativeResultIdentity:identity,scope:copy(scope),edited:Object.keys(overrides).length>0}}:null;}
 const snapshot=()=>({scope:copy(scope),overrides:copy(overrides),excludeTexts});
 function remember({preparationOnly=false,textOption=excludeTexts}={}){past.push({...snapshot(),excludeTexts:textOption,...(preparationOnly?{preparationOnly:true}:{})});if(past.length>50)past.shift();future=[];}
 function history(action){if(disposed)return;const from=action==='undo'?past:future,to=action==='undo'?future:past;if(!from.length)return;const previous=from.pop();to.push({...snapshot(),...(previous.preparationOnly?{preparationOnly:true}:{})});const scopeChanged=JSON.stringify(scope)!==JSON.stringify(previous.scope);scope=previous.scope;overrides=previous.overrides;excludeTexts=previous.excludeTexts??excludeTexts;presentationRevision++;refresh();onPresentation(presentation());onChange({scopeChanged,presentationOnly:!scopeChanged,...(scopeChanged&&previous.preparationOnly?{preparationOnly:true}:{})});}
 function refresh(){
  if(disposed)return;
  parent.hidden=!active();if(!active())return;
  textCaption.textContent=language()==='en'?'Exclude texts automatically (OCR)':'Exclure automatiquement les textes (OCR)';
  textLabel.title=language()==='en'?'Excludes candidates and correspondences on detected text; the model context may still see it. Human and Original exclusions remain strict.':'Écarte les candidats et correspondances sur le texte détecté ; le contexte du modèle peut encore le voir. Les exclusions humaines et Original restent strictes.';
  textToggle.checked=excludeTexts;textLabel.hidden=!scientificActive();
  if(compactHistory){compactUndo.textContent=language()==='en'?'Undo regions':'Annuler les zones';compactRedo.textContent=language()==='en'?'Redo regions':'Rétablir les zones';for(const [button,available]of [[compactUndo,past.length>0],[compactRedo,future.length>0]]){button.disabled=!available;button.dataset.detectionUnavailable=String(!available);if(available)delete button.dataset.detectionUnavailable;}compactHistory.hidden=!past.length&&!future.length;}
  const zones=scope&&source()?.blob?createManualScopeDraft(currentImage()).zones:[];
  panel.update({zones,biomes:visibleGroups(),resultIdentity:identity,canUndo:past.length>0,canRedo:future.length>0});
 }
 async function ensureScope(){await prepareSourceScope();if(disposed)throw new EngineError('CANCELLED','Individual source adoption cancelled.');if(!scope){scope=await createIndividualScientificScope(currentImage(),{manualFullSource:true,excludeTexts:false});}return scope;}
 async function edit({kind, id, tool='select'}={}){
  if(disposed)return;const editTicket=++editorEpoch;await retiredEditors.drain();await retireEditor(editor);editor=null;
  if(disposed||editTicket!==editorEpoch)return;
  const image=currentImage();
  if(kind==='biome'){
   const g=visibleGroups().find(g=>g.id===id);if(!g)return;
   if(g.polygons.some(p=>p.length<3))throw Error('Ce contour natif dégénéré ne définit pas une surface modifiable.');
   const rectangles=g.polygons.map((polygon,i)=>({id:'biome-'+i,x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1])),polygon}));
   const prepared=await createIndividualScientificScope({...image,preparation:undefined},{rectangles,excludeTexts:false,includeEnvelope:false});
   if(disposed)return;
   // Store immutable native origins even when reopening a presentation edit.
   const draftImage={...image,preparation:prepared};const initial=createManualScopeDraft(draftImage),native=groups.find(x=>x.id===id);
   // The two native sides have separate identities even when their geometries
   // coincide. The scientific-zone constructor may deduplicate equal polygons.
   initial.zones=rectangles.map((r,i)=>({id:'zone-'+(i+1),kind:'acquisition',x0:r.x0,y0:r.y0,x1:r.x1,y1:r.y1,polygon:copy(r.polygon),type:'acquisition',label:'Acquisition',origin:'human',originalGeometry:{x0:Math.min(...native.polygons[i].map(p=>p[0])),y0:Math.min(...native.polygons[i].map(p=>p[1])),x1:Math.max(...native.polygons[i].map(p=>p[0])),y1:Math.max(...native.polygons[i].map(p=>p[1])),polygon:copy(native.polygons[i])}}));initial.nextId=3;
   draftImage.preparation.manual={...initial,schema:'sherloq.batch-manual-scope/1',zones:initial.zones,actions:[],actor:'human'};
   editor=scopeEditorFactory({document:realDocument,image:draftImage,language:language(),classifyAcquisitions:false,computeProfile:computeProfile(),getNavigationMode:navigationMode,onError,
    onSave:next=>{if(disposed)return;const polygons=next.manual.zones.filter(z=>z.kind==='acquisition').map(z=>copy(z.polygon));if(polygons.length!==2)throw Error('Un biome conserve ses deux côtés appariés.');if(JSON.stringify(polygons)===JSON.stringify(g.polygons))return;remember();overrides[id]={polygons,originalPolygons:copy(native.polygons),nativeGroupIndex:native.nativeGroupIndex,method:native.method};presentationRevision++;refresh();onPresentation(presentation());onChange({presentationOnly:true});},
   });
   await editor.open({editing:true,tool:'select',zoneId:initial.zones[0]?.id});return;
  }
  await ensureScope();if(disposed||editTicket!==editorEpoch)return;const editImage=currentImage(),base=scope,epoch=cancellationEpoch;
  const isCurrent=()=>{const now=source();return !disposed&&editTicket===editorEpoch&&epoch===cancellationEpoch&&scope===base&&now&&now.blob===editImage.blob&&now.id===editImage.id&&now.sourceSha256===editImage.sourceSha256&&now.width===editImage.width&&now.height===editImage.height;};
  const actions=detectionActionsFactory({getClient,computeProfile,excludeTexts:()=>excludeTexts,language,preparationClientFactory,isCurrent});
  editor=scopeEditorFactory({document:realDocument,image:editImage,subimagesSelection:{positiveMode:'selected',afterLastAcquisitionDelete:'selected'},language:language(),classifyAcquisitions:false,computeProfile:computeProfile(),getNavigationMode:navigationMode,onError,...actions,
   onSave:next=>adoptEditedScope(next,isCurrent),
  });await editor.open({editing:true,tool,zoneId:id});
 }
 function adoptEditedScope(next,isCurrent){
  if(!isCurrent())throw new EngineError('CANCELLED','The image or its regions changed before the editor was saved.');if(JSON.stringify(next)===JSON.stringify(scope))return scope;remember();scope=next;refresh();onChange({scopeChanged:true});return scope;
 }
 async function detectEditorOperation(kind){
  const epoch=cancellationEpoch,ticket=++editorEpoch;controller?.abort();let local;
  try{
   await retiredEditors.drain();await retireEditor(editor);editor=null;await ensureScope();if(disposed||ticket!==editorEpoch||epoch!==cancellationEpoch)throw new EngineError('CANCELLED','Individual region detection cancelled.');local=controller=new AbortController();const signal=local.signal;
   const image=currentImage(),base=scope,isCurrent=()=>{const now=!disposed&&source();return !disposed&&!signal.aborted&&ticket===editorEpoch&&epoch===cancellationEpoch&&scope===base&&now&&now.blob===image.blob&&now.id===image.id&&now.sourceSha256===image.sourceSha256&&now.width===image.width&&now.height===image.height&&(now.sourceRegionCeiling?.fingerprint??null)===(image.sourceRegionCeiling?.fingerprint??null);};
   const draft=createManualScopeDraft(image);initializeSubimagesSelection(draft,{positiveMode:'selected',afterLastAcquisitionDelete:'selected'});const staged=await applyManualScopeDraft(image,draft);checkAbort(signal);if(!isCurrent())throw new EngineError('CANCELLED','The image or its regions changed during region detection.');
   const actions=detectionActionsFactory({getClient,computeProfile,excludeTexts:()=>excludeTexts,language,preparationClientFactory,isCurrent}),callback=kind==='automatic'?actions.onDetectAutomatically:actions.onDetectSubimages;
   const answer=await callback({image,scope:staged,draft:copy(draft),sourceSelectionMode:subimagesSelectionMode(draft),signal,onProgress});checkAbort(signal);if(!isCurrent())throw new EngineError('CANCELLED','The image or its regions changed during region detection.');
   const next=answer?.scope??answer;if(!next||next.sourceSha256!==image.sourceSha256||next.width!==image.width||next.height!==image.height||await scopeFingerprint(next)!==next.fingerprint)throw new EngineError('INVALID_INPUT','Detected regions do not match the original source or their fingerprint.');checkAbort(signal);if(!isCurrent())throw new EngineError('CANCELLED','The image or its regions changed during region detection.');if(answer?.unchanged===true)return scope;
   return adoptEditedScope(next,isCurrent);
  }finally{if(local&&controller===local)controller=null;}
 }
 function modernText(value){const model=value?.metadata?.model;return model?.id===SCIENTIFIC_TEXT_MODEL.id&&model.sha256===SCIENTIFIC_TEXT_MODEL.sha256;}
 function readyForCalculation(value){return value?.status==='ready'&&value.text?.status==='complete'&&value.regions?.length>0;}
 function scopeRequired(value){return new EngineError('SCIENTIFIC_SCOPE_REQUIRED','Vérifiez les zones et les exclusions de texte avant de calculer.',{details:{status:value?.status,textStatus:value?.text?.status,warnings:value?.warnings??[]}});}
 async function validateScope(value,image){
  if(!value)return;if(value.sourceSha256!==image.sourceSha256||value.width!==image.width||value.height!==image.height)throw new EngineError('INVALID_INPUT','Scientific regions belong to another original image.');
  createManualScopeDraft({...image,preparation:value});if(await scopeFingerprint(value)!==value.fingerprint)throw new EngineError('INVALID_INPUT','Scientific region fingerprint does not match its geometry.');
  if(value.manual?.actor==='human'&&value.text?.status==='complete'&&['ready','excluded'].includes(value.status))await restoreManualScientificScope({...image,preparation:value});
 }
 const polygonKey=polygon=>{const variants=[];for(const order of [polygon,[...polygon].reverse()])for(let i=0;i<order.length;i++)variants.push(JSON.stringify(order.slice(i).concat(order.slice(0,i))));return variants.sort()[0];};
 function retainEnvelope(next,base){
  next.envelope=scientificScopeEnvelope(next);next.searchRegions=next.regions.map(copy);const envelope=next.envelope;
  if(base.individual?.includeEnvelope!==false&&next.regions.length>1&&envelope&&!next.regions.some(r=>polygonKey(r.polygon)===polygonKey(envelope.polygon)))next.searchRegions.push({...copy(envelope),role:'cross-panel-search'});
 }

 // The checkbox temporarily hides automatic native OCR masks. It never
 // deletes a human text edit, and a global acquisition review does not change
 // the origin of untouched automatic boxes.
 function restoreDisabledAutomaticText(draft,base){
  if(base.text?.disabled!==true)return;const saved=base.text.disabledAutomaticZones??[],order=base.text.disabledAutomaticOrder;
  if(!Array.isArray(saved)||saved.length>8192||order!==undefined&&(!Array.isArray(order)||order.length>8192||order.some(id=>typeof id!=='string')))throw new EngineError('INVALID_INPUT','Invalid disabled automatic text metadata.');
  const ids=new Set(draft.zones.map(zone=>zone.id));
  for(const value of saved){if(value?.kind!=='exclusion'||value.role!=='text'||value.origin!=='automatic')throw new EngineError('INVALID_INPUT','Disabled text metadata cannot replace a human exclusion.');const zone=copy(value),existing=draft.zones.find(z=>z.id===zone.id);if(existing&&existing.kind===zone.kind&&existing.role===zone.role&&existing.origin===zone.origin&&polygonKey(existing.polygon)===polygonKey(zone.polygon))continue;
   if(ids.has(zone.id)){do{zone.id='zone-'+draft.nextId++;}while(ids.has(zone.id));}ids.add(zone.id);draft.zones.push(zone);
  }
  if(order){const rank=new Map(order.map((id,index)=>[id,index]));draft.zones.sort((a,b)=>(rank.get(a.id)??Infinity)-(rank.get(b.id)??Infinity));}
 }
 function scopeWithTextDraft(input,base,draft,text,action){
  const next=manualDraftScope(draft,copy(base));next.version=base.version;next.text=text;next.individual={...(base.individual??{}),excludeTexts:!text.disabled,originalPixelsPreserved:true};retainEnvelope(next,base);
  next.manual={...(base.manual??{}),schema:draft.schema,version:1,actor:base.manual?.actor??'system',coordinates:'original-pixels',edgeConvention:'half-open-rectangles',sourceSha256:input.sourceSha256,width:input.width,height:input.height,baseFingerprint:base.manual?.baseFingerprint??base.fingerprint,zones:copy(draft.zones),actions:[...(base.manual?.actions??[]),action].slice(-512),originalPixelsPreserved:true};
  next.warnings=(base.warnings??[]).filter(w=>!['TEXT_DETECTION_INCOMPLETE','TEXT_ACQUISITION_AMBIGUITY'].includes(w.code));if(next.warnings.length)next.status='needs-review';return next;
 }
 async function publishTextToggle(input,previous,next,signal,epoch){
  next.fingerprint=await scopeFingerprint(next);checkAbort(signal);if(disposed||epoch!==cancellationEpoch)throw new EngineError('CANCELLED','Individual text preparation cancelled.');const current=source();if(scope!==previous||!current||current.sourceSha256!==input.sourceSha256||current.width!==input.width||current.height!==input.height)throw new EngineError('INVALID_INPUT','The image or its regions changed during the OCR option update.');remember({preparationOnly:true,textOption:previous.text?.disabled!==true});scope=next;refresh();onChange({scopeChanged:true,preparationOnly:true});return next;
 }
 async function prepareForCalculation({signal:outerSignal}={}){
  if(disposed)throw new EngineError('DISPOSED','Individual region controller disposed.');checkAbort(outerSignal);if(!active())return scope;const epoch=cancellationEpoch;await prepareSourceScope();checkAbort(outerSignal);if(disposed||epoch!==cancellationEpoch)throw new EngineError('CANCELLED','Individual source adoption cancelled.');
  const assertOwner=(input,previous)=>{const now=source();if(disposed||epoch!==cancellationEpoch||scope!==previous||!now||now.blob!==input.blob||now.id!==input.id||now.sourceSha256!==input.sourceSha256||now.width!==input.width||now.height!==input.height)throw new EngineError('CANCELLED','The source or its regions changed during preparation validation.');};
  if(!scientificActive()){const input=currentImage(),previous=scope;await validateScope(previous,input);checkAbort(outerSignal);assertOwner(input,previous);return previous;}
  const input=currentImage(),previous=scope,domain=await currentDomain(),sameDomain=preparationMatchesSourceEnvelope(previous,domain,input);await validateScope(previous,input);checkAbort(outerSignal);assertOwner(input,previous);
  if(!excludeTexts){
   if(!previous||previous.text?.disabled===true)return previous;
   const draft=createManualScopeDraft({...input,preparation:previous}),raw=previous.text?.rawDetection??previous.text??null,pdfText=new Set((previous.pdfText?.polygons??[]).map(polygonKey));
   // The checkbox controls automatic OCR boxes independently of an overall
   // scope review. Moved/resized text and inherited Original holes stay hard.
   const disabledAutomaticOrder=draft.zones.map(zone=>zone.id),removed=draft.zones.filter(z=>z.kind==='exclusion'&&z.role==='text'&&z.origin==='automatic'&&!pdfText.has(polygonKey(z.polygon)));
   const ids=new Set(removed.map(z=>z.id));draft.zones=draft.zones.filter(z=>!ids.has(z.id));
   const texts=draft.zones.filter(z=>z.kind==='exclusion'&&z.role==='text'),text={...(previous.text??{}),status:'complete',disabled:true,automatic:false,polygons:texts.map(z=>copy(z.polygon)),detections:texts.map(z=>({polygon:copy(z.polygon),zoneId:z.id,actor:z.origin==='human'?'human':'automatic'})),warnings:[],rawDetection:copy(raw),disabledAutomaticZones:copy(removed),disabledAutomaticOrder,reason:'Automatic OCR exclusions disabled; human text decisions and manual exclusions preserved.'};
   const next=scopeWithTextDraft(input,previous,draft,text,{operation:'disable-automatic-text',actor:'system',coordinates:'original-pixels',removedZoneIds:[...ids]});return publishTextToggle(input,previous,next,outerSignal,epoch);
  }
  const raw=previous?.text?.rawDetection,reviewed=sameDomain&&previous?.text?.review?.actor==='human'&&modernText(raw)&&['complete','needs-review'].includes(raw.status);
  if(sameDomain&&previous?.text?.review?.actor==='human'&&modernText(raw)&&!['complete','needs-review'].includes(raw.status)){
   const blocked=copy(previous);blocked.status='needs-review';blocked.text.status=raw.status??'incomplete';blocked.warnings=[...(blocked.warnings??[]),{code:'TEXT_DETECTION_INCOMPLETE',message:'La révision des zones ne remplace pas une préparation OCR interrompue.'}];blocked.fingerprint=await scopeFingerprint(blocked);checkAbort(outerSignal);if(disposed||epoch!==cancellationEpoch)throw new EngineError('CANCELLED','Individual text preparation cancelled.');if(scope!==previous)throw new EngineError('INVALID_INPUT','Regions changed during text validation.');scope=blocked;refresh();onChange({scopeChanged:true,preparationOnly:true});throw scopeRequired(blocked);
  }
  if(reviewed){
   if(previous.text.disabled){const draft=createManualScopeDraft({...input,preparation:previous});restoreDisabledAutomaticText(draft,previous);const text={...copy(previous.text),disabled:false,automatic:false,polygons:draft.zones.filter(z=>z.kind==='exclusion'&&z.role==='text').map(z=>copy(z.polygon)),detections:draft.zones.filter(z=>z.kind==='exclusion'&&z.role==='text').map(z=>({polygon:copy(z.polygon),zoneId:z.id,actor:z.origin==='human'?'human':'automatic'})),reason:'Native OCR masks restored; human text edits and deletions retained without inference.'};delete text.disabledAutomaticZones;delete text.disabledAutomaticOrder;const next=scopeWithTextDraft(input,previous,draft,text,{operation:'enable-reviewed-text',actor:'system',coordinates:'original-pixels'});const value=await publishTextToggle(input,previous,next,outerSignal,epoch);if(!readyForCalculation(value))throw scopeRequired(value);return value;}
   if(!readyForCalculation(previous))throw scopeRequired(previous);return previous;
  }
  if(sameDomain&&modernText(previous?.text)&&!previous.text.skipped&&!previous.text.disabled){if(!readyForCalculation(previous))throw scopeRequired(previous);return previous;}
  controller?.abort();const local=new AbortController();controller=local;const abort=()=>local.abort(outerSignal?.reason);outerSignal?.addEventListener('abort',abort,{once:true});if(outerSignal?.aborted)abort();let preparation;
  try{
   checkAbort(local.signal);const base=previous??await createIndividualScientificScope(input,{manualFullSource:true,excludeTexts:false});checkAbort(local.signal);
   const cached=sameDomain&&previous?.text?.disabled===true&&modernText(raw)&&raw.status==='complete';let prepared;
   if(cached)prepared={width:input.width,height:input.height,sourceSha256:input.sourceSha256,text:copy(raw),provenance:copy(previous.provenance?.modernTextPreparation??previous.provenance??{})};
   else{if(domain&&typeof(await getClient()).acquirePreparationSource!=='function')throw scopedTextUnavailable();preparation=await preparationClientFactory({computeProfile:computeProfile()});checkAbort(local.signal);prepared=await prepareText(input,domain,preparation,local.signal);}checkAbort(local.signal);if((await currentDomain())?.fingerprint!==(domain?.fingerprint))throw new EngineError('CANCELLED','The original source domain changed during text preparation.');
   if(disposed)throw new EngineError('CANCELLED','Individual text preparation cancelled.');const current=source();if(!current||current.sourceSha256!==input.sourceSha256||current.width!==input.width||current.height!==input.height||scope!==previous)throw new EngineError('INVALID_INPUT','The image or its regions changed during text preparation.');
   if(prepared?.sourceSha256!==input.sourceSha256||prepared.width!==input.width||prepared.height!==input.height||!modernText(prepared.text)||prepared.text.metadata?.sourceSha256&&prepared.text.metadata.sourceSha256!==input.sourceSha256)throw new EngineError('INVALID_INPUT','Modern text preparation belongs to another original image or detector.');
   if(!Array.isArray(prepared.text.polygons))throw new EngineError('INVALID_INPUT','Modern text polygons are missing.');
   const draft=createManualScopeDraft({...input,preparation:base});restoreDisabledAutomaticText(draft,base);const seen=new Set(draft.zones.filter(z=>z.kind==='exclusion').map(z=>polygonKey(z.polygon))),added=[],humanReview=base.text?.review?.actor==='human',priorRaw=base.text?.rawDetection??base.text;
   const originalTexts=draft.zones.filter(z=>z.kind==='exclusion'&&z.role==='text'&&(z.origin==='human'||humanReview)).map(z=>copy(z.originalGeometry.polygon)),acceptedKeys=new Set(originalTexts.map(polygonKey)),previousOverrides=base.text?.humanOverrides;
   if(previousOverrides&&previousOverrides.sourceSha256!==input.sourceSha256)throw new EngineError('INVALID_INPUT','Human text decisions belong to another original image.');
   const rejectedTexts=humanReview?(priorRaw?.polygons??[]).filter(p=>!acceptedKeys.has(polygonKey(p))).map(copy):copy(previousOverrides?.rejectedPolygons??[]);
   // A detector refresh can add genuinely new candidates, but it cannot reset
   // a source-bound human deletion or put a moved text box back at its origin.
   for(const polygon of [...originalTexts,...rejectedTexts,...(previousOverrides?.acceptedOriginalPolygons??[])])seen.add(polygonKey(polygon));
   for(const polygon of prepared.text.polygons){const clipped=clipPolygon(polygon,input.width,input.height);if(!clipped.length||JSON.stringify(clipped)!==JSON.stringify(polygon))throw new EngineError('INVALID_INPUT','Modern text polygon exceeds original image coordinates.');const key=polygonKey(polygon);if(seen.has(key))continue;seen.add(key);const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]),geometry={x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys),polygon:copy(polygon)},saved=(base.text?.disabledAutomaticZones??[]).find(z=>polygonKey(z.polygon)===key);let id=saved?.id;if(!id||draft.zones.some(z=>z.id===id)){do{id='zone-'+draft.nextId++;}while(draft.zones.some(z=>z.id===id));}draft.zones.push(saved?{...copy(saved),id}:{id,kind:'exclusion',...geometry,role:'text',label:'Text',origin:'automatic',originalGeometry:copy(geometry)});added.push(id);}
   const next=manualDraftScope(draft,copy(base)),text=copy(prepared.text);text.rawDetection=copy(prepared.text);const activeTexts=draft.zones.filter(z=>z.kind==='exclusion'&&z.role==='text');text.polygons=activeTexts.map(z=>copy(z.polygon));text.detections=activeTexts.map(z=>{const raw=(prepared.text.detections??[]).find(d=>polygonKey(d.polygon)===polygonKey(z.polygon));return {...(raw?copy(raw):{}),polygon:copy(z.polygon),zoneId:z.id,...(z.origin==='human'?{actor:'human'}:{})};});if(originalTexts.length||rejectedTexts.length||previousOverrides)text.humanOverrides={sourceSha256:input.sourceSha256,rejectedPolygons:rejectedTexts,acceptedOriginalPolygons:[...new Map([...(previousOverrides?.acceptedOriginalPolygons??[]),...originalTexts].map(p=>[polygonKey(p),copy(p)])).values()]};if(base.text&&!cached){const before=copy(base.text);delete before.previousPreparation;delete before.disabledAutomaticZones;text.previousPreparation=before;}next.text=text;next.models={...(base.models??{}),text:copy(text.metadata.model)};next.provenance={...(base.provenance??{}),modernTextPreparation:copy(prepared.provenance??{originalSourceSha256:prepared.sourceSha256,originalPixelsModified:false})};
   next.version='individual-preparation-1+modern-text';next.individual={...(base.individual??{}),excludeTexts:true,preparedSource:'modern-text-only-preparation',originalPixelsPreserved:true};
   retainEnvelope(next,base);
   const actions=[...(base.manual?.actions??[]),{operation:'merge-modern-text',actor:'system',coordinates:'original-pixels',model:copy(text.metadata.model),addedZoneIds:added}];next.manual={...(base.manual??{}),schema:draft.schema,version:1,actor:base.manual?.actor??'system',coordinates:'original-pixels',edgeConvention:'half-open-rectangles',sourceSha256:input.sourceSha256,width:input.width,height:input.height,baseFingerprint:base.manual?.baseFingerprint??base.fingerprint,zones:copy(draft.zones),actions:actions.slice(-512),originalPixelsPreserved:true};
   const warnings=(base.warnings??[]).filter(w=>!['TEXT_DETECTION_INCOMPLETE','TEXT_ACQUISITION_AMBIGUITY'].includes(w.code));if(text.status!=='complete')warnings.push({code:'TEXT_DETECTION_INCOMPLETE',message:'La préparation moderne du texte doit être vérifiée.',warnings:copy(text.warnings??[])});
   // Complete OCR can still contain an ambiguous large blot/text candidate.
   for(const [index,polygon]of text.polygons.entries())for(const [regionIndex,r]of next.regions.entries()){const local=polygon.map(([x,y])=>[x-r.x0,y-r.y0]),intersection=clipPolygon(local,r.x1-r.x0,r.y1-r.y0),area=intersection.length?Math.abs(intersection.reduce((sum,p,i)=>{const q=intersection[(i+1)%intersection.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2:0,fraction=area/((r.x1-r.x0)*(r.y1-r.y0));if(fraction>=SCIENTIFIC_SCOPE_POLICY.maxTextAcquisitionFraction)warnings.push({code:'TEXT_ACQUISITION_AMBIGUITY',detection:index,region:regionIndex,fraction,message:'Une proposition de texte recouvre largement une acquisition.'});}
   next.warnings=warnings;if(warnings.length)next.status='needs-review';next.fingerprint=await scopeFingerprint(next);checkAbort(local.signal);if(disposed||scope!==previous)throw new EngineError('CANCELLED','Individual text preparation cancelled.');
   remember({preparationOnly:true});scope=next;refresh();onChange({scopeChanged:true,preparationOnly:true});if(!readyForCalculation(next))throw scopeRequired(next);return next;
  }finally{outerSignal?.removeEventListener('abort',abort);try{await preparation?.dispose();}finally{if(controller===local)controller=null;}}
 }
 async function detect(){
  const epoch=cancellationEpoch;await prepareSourceScope();if(disposed||epoch!==cancellationEpoch)throw new EngineError('CANCELLED','Individual source adoption cancelled.');
  controller?.abort();controller=new AbortController();const signal=controller.signal,input=currentImage(),key=input.sourceSha256;
  let preparation;
  try{
   const domain=await currentDomain();const client=await getClient();if(domain&&excludeTexts&&typeof client.acquirePreparationSource!=='function')throw scopedTextUnavailable();const detector=await domainDetector(client,domain);const rectangles=await detectIndividualSubimages(detector,{width:input.width,height:input.height,sourceSha256:key,neural:false});
   signal.throwIfAborted();let prepared;if(!domain||excludeTexts){preparation=await preparationClientFactory({computeProfile:computeProfile()});prepared=domain?await prepareText(input,domain,preparation,signal):await preparation.prepare(input.blob,{signal,onProgress,detectText:excludeTexts});}signal.throwIfAborted();const latestDomain=await currentDomain();if((latestDomain?.fingerprint??null)!==(domain?.fingerprint??null))throw new EngineError('CANCELLED','The original source domain changed during region detection.');
   if(disposed)throw new EngineError('CANCELLED','Individual region detection cancelled.');if(source()?.sourceSha256!==key)throw Error('L’image a changé pendant la préparation.');
   const next=await createIndividualScientificScope(input,{rectangles,prepared,excludeTexts,includeEnvelope:true});checkAbort(signal);if(disposed)throw new EngineError('CANCELLED','Individual region detection cancelled.');remember();scope=next;mode='zones';panel.setMode('zones');refresh();onPresentation(null);onChange({scopeChanged:true});return scope;
  }finally{await preparation?.dispose();if(controller?.signal===signal)controller=null;}
 }
 return {
  active,scientificActive,refresh,detect:()=>preparationTask(detect),detectAutomatically:()=>preparationTask(()=>detectEditorOperation('automatic')),detectSubimages:()=>preparationTask(()=>detectEditorOperation('subimages')),edit,prepareForCalculation:options=>preparationTask(()=>prepareForCalculation(options)),rectangles:()=>scope?individualScopeRectangles(scope):[],task:task=>scope&&scientificActive()?scopeIndividualTask(task,scope):task,
  get scope(){return scope;},get highlight(){return highlight;},get mode(){return mode;},get groups(){return visibleGroups();},
  sourceChanged(){if(disposed)return;const next=source()?.sourceSha256;if(next!==sourceKey){editorEpoch++;controller?.abort();if(editor){const previous=editor;void retireEditor(previous).catch(onError);editor=null;}scope=null;groups=[];identity=null;overrides={};savedPresentation=null;past=[];future=[];mode='zones';sourceKey=next;highlight=null;}refresh();},
  accept(output){if(disposed)return;const data=detectionBiomes(output);groups=data.groups;identity=data.identity;overrides={};if(savedPresentation){for(const [id,edit]of Object.entries(savedPresentation.overrides)){const g=groups.find(g=>g.id===id);if(g&&g.nativeGroupIndex===edit.nativeGroupIndex&&g.method===edit.method&&JSON.stringify(g.polygons)===JSON.stringify(edit.originalPolygons))overrides[id]=copy(edit);}savedPresentation=null;}presentationRevision++;
   // Old presentation-only transactions are not meaningful for a new native
   // result. Keep distinct scientific-scope undo steps, not empty undo actions.
   const scoped=past.map(s=>({...s,overrides:{}}));past=scoped.filter((entry,i)=>JSON.stringify(entry.scope)!==JSON.stringify((scoped[i+1]??{scope}).scope));future=[];
   // Updating the editor tabs must not replace the just-rendered native view.
   // Only an explicit presentation action publishes edited biome contours.
   adoptingNative=true;try{refresh();}finally{adoptingNative=false;}},
  async resetAt(point){if(disposed||!point||![point.x,point.y].every(Number.isFinite))return false;const inside=poly=>{let value=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i],cross=(point.x-a[0])*(b[1]-a[1])-(point.y-a[1])*(b[0]-a[0]);if(Math.abs(cross)<=1e-7&&point.x>=Math.min(a[0],b[0])&&point.x<=Math.max(a[0],b[0])&&point.y>=Math.min(a[1],b[1])&&point.y<=Math.max(a[1],b[1]))return true;if((a[1]>point.y)!==(b[1]>point.y)&&point.x<(b[0]-a[0])*(point.y-a[1])/(b[1]-a[1])+a[0])value=!value;}return value;};if(mode==='biomes'){const g=[...visibleGroups()].reverse().find(g=>g.polygons.some(inside));if(!g)return false;if(overrides[g.id]){remember();delete overrides[g.id];presentationRevision++;refresh();onPresentation(presentation());onChange({presentationOnly:true});}return true;}if(!scope)return false;const image=currentImage(),previous=scope,draft=createManualScopeDraft(image),z=draft.zones.filter(z=>inside(z.polygon)).sort((a,b)=>(a.kind==='exclusion'?0:1)-(b.kind==='exclusion'?0:1)||(a.x1-a.x0)*(a.y1-a.y0)-(b.x1-b.x0)*(b.y1-b.y0))[0];if(!z)return false;if(!restoreManualScopeZone(draft,z.id))return true;const next=await applyManualScopeDraft(image,draft);if(disposed)return false;if(scope!==previous||source()?.sourceSha256!==image.sourceSha256)throw new EngineError('CANCELLED','The edited image changed before restoring its region.');remember();scope=next;refresh();onChange({scopeChanged:true});return true;},
  serialize(){return {schema:'sherloq.individual-regions/1',sourceSha256:(!disposed?source()?.sourceSha256:null)??sourceKey,scope:copy(scope),excludeTexts,biomePresentation:copy(savedPresentation??{nativeResultIdentity:identity,overrides})};},
  async restore(value){if(disposed||!value)return;if(value.schema!=='sherloq.individual-regions/1'||typeof value.excludeTexts!=='boolean'||!/^[a-f0-9]{64}$/.test(value.sourceSha256??''))throw Error('Invalid individual regions session.');const image=source(),previousScope=scope,epoch=cancellationEpoch;if(image&&value.sourceSha256!==image.sourceSha256)throw Error('Les zones ne correspondent pas à cette image.');const nextScope=copy(value.scope);if(nextScope)await validateScope(nextScope,image??{width:nextScope.width,height:nextScope.height,sourceSha256:value.sourceSha256});if(disposed)return;const current=source();if(epoch!==cancellationEpoch||scope!==previousScope||image&&(!current||current.blob!==image.blob||current.id!==image.id||current.sourceSha256!==image.sourceSha256||current.width!==image.width||current.height!==image.height)||!image&&current&&current.sourceSha256!==value.sourceSha256)throw new EngineError('CANCELLED','The image or its regions changed during session validation.');
   const view=value.biomePresentation;if(view){if(!view.overrides||typeof view.overrides!=='object'||Array.isArray(view.overrides)||Object.keys(view.overrides).length>1024)throw Error('Invalid biome presentation session.');for(const edit of Object.values(view.overrides)){if(!Number.isSafeInteger(edit.nativeGroupIndex)||edit.nativeGroupIndex<0||typeof edit.method!=='string')throw Error('Invalid biome presentation origin.');for(const field of ['polygons','originalPolygons'])if(!Array.isArray(edit[field])||edit[field].length!==2||edit[field].some(p=>!Array.isArray(p)||p.length<3||p.length>8192||p.some(q=>!Array.isArray(q)||q.length!==2||!q.every(Number.isFinite)||q.some(n=>n<0)||image&&(field==='originalPolygons'?q[0]>=image.width||q[1]>=image.height:q[0]>image.width||q[1]>image.height))))throw Error('Invalid biome presentation geometry.');}}
   controller?.abort();scope=nextScope;excludeTexts=value.excludeTexts;sourceKey=value.sourceSha256;savedPresentation=view?copy(view):null;overrides={};past=[];future=[];refresh();},
  cancel(){cancellationEpoch++;controller?.abort();},dispose(){if(fullyDisposed)return Promise.resolve();if(disposeTask)return disposeTask;if(!disposed){disposed=true;cancellationEpoch++;editorEpoch++;controller?.abort();}const task=(async()=>{await Promise.allSettled([...pendingPreparations]);await retiredEditors.drain();await retireEditor(editor);editor=null;panel.dispose();textLabel.remove();compactHistory?.remove();fullyDisposed=true;})();disposeTask=task;task.then(()=>{disposeTask=null;},()=>{disposeTask=null;});return task;},
 };
}
