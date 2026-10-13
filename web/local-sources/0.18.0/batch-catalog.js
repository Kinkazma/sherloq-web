import {localFeaturePolicy} from './feature-policy.js?v=0.18.0';
import {toolCatalog,toolFields} from './tool-catalog.js?v=0.18.0';
import {CLONE_ALGORITHMS,cloneMethodLabel,changeCloneAlgorithm,cloneOperation,isDenseClone,SSG_DEFAULTS} from './clone-methods.js?v=0.18.0';
import {sparseParameters,sparseViewDefaults,CLASSIC_SIFT,PANELS_SIFT} from './sparse-controls.js?v=0.18.0';
import defaults from './tool-defaults.js?v=0.18.0';
import {defaults as classicDefaults} from './settings.js?v=0.18.0';
import {NEURAL_METHODS} from './neural-clone-ui.js?v=0.18.0';
import {clipPolygon} from './batch-scope-geometry.js?v=0.18.0';

const copy=value=>structuredClone(value);
const groups={recommended:['Adaptés au traitement par lot','Suited to batch processing'],complement:['Analyses complémentaires','Additional analyses'],less:['Moins adaptés — inspection humaine','Less suited — human inspection'],required:['Entrée supplémentaire nécessaire','Additional input required']};
export const batchGroups=groups;
// Batch matching separation and displayed group length are distinct controls.
// Individual-tool defaults and the minimum of four witnesses stay unchanged.
export const BATCH_CLONE_DEFAULTS=Object.freeze({minimum:7,low:15});
export function batchRecipeView(recipe){
 if(!['tampering.copyMove.sparse','tampering.copyMove.dense'].includes(recipe.operation))return recipe.view===undefined?undefined:copy(recipe.view);
 return {...sparseViewDefaults(),...(recipe.params?.algorithm==='SSG'?{}:{low:BATCH_CLONE_DEFAULTS.low}),...copy(recipe.view??{})};
}
const extra={
 'analysis.clones':{fr:'Recherche automatique de clones',en:'Automatic clone search',params:{d2Minimum:500,maxConcurrent:1}},
 'analysis.complete':{fr:'Analyse automatique complète',en:'Complete automatic analysis',params:{d2Minimum:500,maxConcurrent:1}},
 'ela.classic':{fr:'ELA classique',en:'Classic ELA',params:copy(classicDefaults)},
 'ela.energy':{fr:'ELA — énergie, profil automatique',en:'ELA — energy, automatic profile',params:{...defaults['ela.energy'].params,profile:'conservative'}},
 'ela.biomes':{fr:'ELA — biomes',en:'ELA — biomes',params:copy(defaults['ela.biomes'].params)},
 'composite':{fr:'Détection de montage',en:'Composite splicing',params:{quality:0}},
 'm2.forgeryscope':{fr:'Forgeryscope Auto',en:'Forgeryscope Auto',params:{profile:'auto'}},
};
const prerequisites={'comparison.image':'reference','noise.prnu':'database','various.median':'median'};
const descriptions={
 clones:['Correspondances ou masque de clones. Les paramètres restent ajustables pour le lot.','Clone correspondences or mask. Parameters remain editable for the batch.'],
 automatic:['Plusieurs détecteurs existants ; calcul important. Les votes sont regroupés par méthode.','Existing multiple detectors; substantial computation. Votes are grouped by method.'],
 map:['Carte numérique : signalement selon le seuil et la surface minimale choisis.','Numeric map: flagging uses the selected threshold and minimum area.'],
 regions:['Régions produites par la méthode ; elles restent à interpréter.','Regions produced by the method; interpretation remains necessary.'],
 ela:['Profils ou biomes calculables en lot ; observations descriptives séparées des votes de clones.','Batch profiles or biomes; descriptive observations are separate from clone votes.'],
 view:['Sortie pour inspection. Cette vue seule ne déclenche aucun signalement automatique.','Inspection output. This view alone does not automatically flag a study.'],
 required:['Une référence, une base ou un modèle doit être fourni pour le lot.','A reference, database or model must be provided for the batch.'],
};
function describe(id,item){
 let kind='view',group='less';
 if(id.startsWith('analysis.')){kind='automatic';group='recommended';}
 else if(id.startsWith('ai.clones.')||id.startsWith('tampering.copyMove.')||id==='m2.forgeryscope'){kind='clones';group='recommended';}
 else if(['m2.trufor','m2.catnet','ai.localization.focal','ai.localization.adaifl'].includes(id)){kind='map';group='complement';}
 else if(id==='noise.noisesniffer'){kind='regions';group='complement';}
 else if(id==='ela.energy'||id==='ela.biomes'){kind='ela';group='complement';}
 if(prerequisites[id]){kind='required';group='required';}
 return {id,operation:id,...item,backend:'auto',params:copy(item.params??{}),kind,group,description:id==='file.similarity'?['Liens vers des services externes ; aucune opération locale à exécuter en lot.','Links to external services; no local batch operation.']:descriptions[kind],notBatch:id==='file.similarity',requires:prerequisites[id],signal:{threshold:.8,minimumPixels:32},fields:toolCatalog[id]?toolFields(id):Object.entries(item.params??{}).map(([key,value])=>({key,label:key,value,type:typeof value==='boolean'?'checkbox':typeof value==='number'?'number':'text'}))};
}
const entries=Object.entries({...toolCatalog,...extra}).filter(([id])=>id!=='tampering.copyMove.sparse').map(([id,item])=>describe(id,item));
const ssgKeys=new Set(Object.keys(SSG_DEFAULTS));
for(const [variant,name]of NEURAL_METHODS.filter(([id])=>!id.startsWith('forgeryscope')&&id!=='d2prl'))entries.push({...describe('ai.clones.segmentation',{fr:name,en:name,params:{variant}}),...(variant==='selfdm-proposal'?{description:['Chaîne complète expérimentale à la résolution originale : cinq réseaux sur CPU ou GPU, étapes OpenCV sur CPU. Les fenêtres réutilisent leur espace de travail sans réduire les pixels source.','Experimental complete pipeline at original resolution: five networks on CPU or GPU, OpenCV stages on CPU. Windows reuse their workspace without downscaling source pixels.']}:variant==='selfdm-map'?{description:['Carte initiale SelfDM uniquement, préparée à la résolution native du modèle. Le raffinement complet est une méthode distincte.','SelfDM initial map only, prepared at the model’s native resolution. Complete refinement is a separate method.']}:{}),id:'segmentation-'+variant,fields:[]});
for(const [index,algorithm] of CLONE_ALGORITHMS.entries()){
 const params=copy(toolCatalog['tampering.copyMove.sparse'].params);changeCloneAlgorithm(params,params.algorithm);params.algorithm=algorithm;changeCloneAlgorithm(params,'PatchMatch Zernike');
 const item=describe('tampering.copyMove.sparse',toolCatalog['tampering.copyMove.sparse']);
 if(algorithm==='SSG'){
  const nativeParams={algorithm,...copy(SSG_DEFAULTS),compare:false,reflections:false};
  entries.push({...item,id:'clone-'+index,fr:cloneMethodLabel(algorithm),en:cloneMethodLabel(algorithm),params:nativeParams,view:sparseViewDefaults(),fields:item.fields.filter(f=>ssgKeys.has(f.key)).map(f=>({...f,...(f.key==='normalizationLongEdge'?{max:32768}:{}),value:nativeParams[f.key]})),description:['SSG : contours structurés, phrases spatiales et localisation SSIM sur CPU. 0 conserve la résolution ; la normalisation agrandit les petites images sans réduire les grandes.','SSG: structured edges, spatial phrases and SSIM localization on CPU. 0 retains resolution; normalization enlarges small images without downscaling large images.']});
  continue;
 }
 params.minimum=BATCH_CLONE_DEFAULTS.minimum;
 const relevant=f=>!ssgKeys.has(f.key)&&!(algorithm==='EfficientLoFTR'&&['radius','autoRadius','compact','independent'].includes(f.key))&&!['algorithm','compare'].includes(f.key)&&(!['longSide','rotationMode'].includes(f.key)||algorithm==='EfficientLoFTR')&&(!['patch','iterations','texture'].includes(f.key)||isDenseClone(algorithm))&&(f.key!=='reflections'||isDenseClone(algorithm)||algorithm===PANELS_SIFT||algorithm==='EfficientLoFTR')&&(f.key!=='independent'||algorithm===CLASSIC_SIFT);
 entries.push({...item,...(algorithm==='EfficientLoFTR'?{pairRequired:true,group:'required',description:['Deux rectangles distincts par image. Préparez la paire dans Images : détection des panneaux ou coordonnées explicites. S’il n’y a pas exactement deux panneaux, le lot attend votre choix.','Two distinct regions per image. Prepare the pair in Images using panel detection or explicit coordinates. Unless exactly two panels are detected, the batch requires your choice.']} : {}),id:'clone-'+index,fr:cloneMethodLabel(algorithm),en:cloneMethodLabel(algorithm),params,view:{...sparseViewDefaults(),low:BATCH_CLONE_DEFAULTS.low},fields:item.fields.filter(relevant).map(f=>({...f,...(algorithm==='EfficientLoFTR'&&f.key==='longSide'?{min:64}:{}),value:params[f.key]??f.value}))});
}
const priority=x=>x.id==='ai.clones.d2prl'?0:x.params.algorithm==='SIFT + G2NN + RANSAC + Panels + Text'?1:x.params.algorithm==='SIFT + G2NN + RANSAC'?2:x.params.algorithm==='PatchMatch Zernike'?3:x.id==='m2.forgeryscope'?4:x.id==='analysis.clones'?5:x.id==='analysis.complete'?6:10;
export const batchCatalog=Object.freeze(entries.sort((a,b)=>priority(a)-priority(b)));
export function batchTask(recipe,{id,imageId,regions=[],scientificScope}={}){
 localFeaturePolicy.assertTaskAvailable(recipe);
 let operation=recipe.operation,params=copy(recipe.params);
 if(scientificScope)assertBatchScientificScope({name:imageId,width:scientificScope.width,height:scientificScope.height,preparation:scientificScope});
 if(operation==='tampering.copyMove.sparse'){
  operation=cloneOperation(params.algorithm);
  if(params.algorithm==='EfficientLoFTR')regions=batchPairRegions(regions,{width:scientificScope?.width,height:scientificScope?.height,scientificScope});
  else if(scientificScope)regions=scientificScope.searchRegions??scientificScope.regions;
  params=sparseParameters({...params,excluded:scientificScope?copy(scientificScope.excluded):[],compare:params.algorithm==='EfficientLoFTR'},regions.map(r=>({...r,polygon:r.polygon??[[r.x0,r.y0],[r.x1-1,r.y0],[r.x1-1,r.y1-1],[r.x0,r.y1-1]]})));
 }
 if(operation==='m2.forgeryscope'&&scientificScope)params.scientificScope=copy(scientificScope);
 if(['ai.clones.d2prl','ai.clones.segmentation'].includes(operation)&&scientificScope)regions=batchNeuralCropRegions(scientificScope.regions,{width:scientificScope.width,height:scientificScope.height});
 return {id,imageId,operation,params,backend:recipe.backend??'auto',...(operation==='tampering.copyMove.sparse'&&scientificScope?{scientificScope:copy(scientificScope)}:{}),...(['tampering.copyMove.sparse','tampering.copyMove.dense'].includes(operation)?{view:batchRecipeView(recipe)}:{}),...(['ai.clones.d2prl','ai.clones.segmentation'].includes(operation)&&regions.length?{regions:regions.map((r,i)=>({id:'panel-'+i,kind:'region',bounds:[r.x0,r.y0,r.x1,r.y1]})),params:{...params,selectionPresent:true}}:{})};
}

// Neural inputs are rectangular integer pixel windows. YOLO acquisition bounds
// are continuous original coordinates: round only the read window outwards,
// while retaining the exact scientific polygons for the later evidence filter.
export function batchNeuralCropRegions(regions,{width,height}={}){
 const invalid=message=>{throw Object.assign(Error(message),{code:'BATCH_SCIENTIFIC_ROI_INVALID'});};
 if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0)||!Array.isArray(regions)||!regions.length)invalid('Les acquisitions préparées et les dimensions originales sont requises pour les fenêtres neuronales.');
 return regions.map((region,index)=>{
  if(!region||region.envelope||![region.x0,region.y0,region.x1,region.y1].every(Number.isFinite)||region.x1<=region.x0||region.y1<=region.y0)invalid('Acquisition neuronale invalide : '+index+'.');
  const crop={x0:Math.max(0,Math.floor(region.x0)),y0:Math.max(0,Math.floor(region.y0)),x1:Math.min(width,Math.ceil(region.x1)),y1:Math.min(height,Math.ceil(region.y1))};
  if(crop.x1-crop.x0<8||crop.y1-crop.y0<8)invalid('L’acquisition '+index+' est trop petite pour une fenêtre native D2PRL/MGCFDN de 8 pixels minimum.');
  return crop;
 });
}

export function assertBatchScientificScope(image){
 const scope=image.preparation,invalid=reason=>{throw Object.assign(Error('Préparation scientifique requise pour '+(image.name??image.id??'cette image')+' : '+reason),{code:'SCIENTIFIC_SCOPE_REQUIRED',details:{imageId:image.id,status:scope?.status,reason}});};
 if(scope?.schema!=='sherloq.scientific-scope/1'||scope.coordinates!=='original-pixels')invalid('version ou coordonnées absentes');
 if(scope.status!=='ready'||scope.text?.status!=='complete')invalid('les acquisitions et exclusions de texte ne sont pas entièrement préparées');
 if(scope.width!==image.width||scope.height!==image.height)invalid('les dimensions ne correspondent pas à la source');
 if(!/^[a-f0-9]{64}$/.test(scope.sourceSha256??'')||!/^[a-f0-9]{64}$/.test(scope.fingerprint??''))invalid('identité ou empreinte de préparation absente');
 const polygon=p=>Array.isArray(p)&&p.length>=3&&p.every(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite));
 if(!Array.isArray(scope.regions)||!scope.regions.length||!scope.regions.every(r=>r&&!r.envelope&&[r.x0,r.y0,r.x1,r.y1].every(Number.isFinite)&&r.x1>r.x0&&r.y1>r.y0&&(!r.polygon||polygon(r.polygon))))invalid('aucune acquisition réelle définie');
 if(!Array.isArray(scope.excluded)||!scope.excluded.every(polygon))invalid('polygones d’exclusion invalides');
 if(scope.searchRegions&&(!Array.isArray(scope.searchRegions)||!scope.searchRegions.every(r=>r&&[r.x0,r.y0,r.x1,r.y1].every(Number.isFinite)&&r.x1>r.x0&&r.y1>r.y0&&(!r.polygon||polygon(r.polygon)))))invalid('zones de recherche invalides');
 return scope;
}

export function batchScopeSupport(recipe,scope){
 if(!scope)return {mode:'native-diagnostic',scientificFiltering:false};
 const common={scientificFiltering:true,scopeFingerprint:scope.fingerprint,coordinates:'original-pixels',originalPixelsPreserved:true};
 if(recipe.operation==='tampering.copyMove.sparse')return {...common,mode:'input-exclusions',stage:'before-matching',method:recipe.params.algorithm};
 if(recipe.operation==='m2.forgeryscope')return {...common,mode:'geometry-before-matching',rawBranches:['embeddings','lanes'],qualifiedEvidence:'filtered_evidence.comparisons'};
 if(['ai.clones.d2prl','ai.clones.segmentation'].includes(recipe.operation))return {...common,mode:'derived-evidence',input:'acquisition-rois',textFiltering:'derived-evidence-only',nativeMapsPreserved:true};
 return {...common,mode:'raw-only',qualifiedForScopedSignal:false,reason:'Cette méthode ne possède pas encore d’exclusions scientifiques qualifiées avant l’analyse.'};
}
export const recipeKey=recipe=>JSON.stringify([recipe.operation,recipe.params,recipe.backend??'auto',batchRecipeView(recipe)??null]);
export const catalogRecipe=id=>{const entry=batchCatalog.find(x=>x.id===id);if(!entry)throw Error('Unknown batch tool');return {...entry,params:copy(entry.params),signal:copy(entry.signal),...(entry.view?{view:copy(entry.view)}:{})};};

export function batchPairRegions(regions,{width,height,scientificScope}={}){
 const invalid=message=>{throw Object.assign(Error(message),{code:'BATCH_PAIR_REQUIRED',details:{requiredRegions:2,width,height}});};
 if(!Array.isArray(regions)||regions.length!==2)invalid('EfficientLoFTR nécessite exactement deux rectangles distincts. Préparez la paire dans Images.');
 const pair=regions.map(r=>{
  if(!r||r.envelope||![r.x0,r.y0,r.x1,r.y1].every(Number.isSafeInteger)||r.x0<0||r.y0<0||r.x1-r.x0<8||r.y1-r.y0<8||width!==undefined&&r.x1>width||height!==undefined&&r.y1>height)invalid('Paire EfficientLoFTR invalide : deux rectangles réels de 8 pixels minimum, à l’intérieur de l’image, sans enveloppe.');
  return {x0:r.x0,y0:r.y0,x1:r.x1,y1:r.y1};
 });
 if(JSON.stringify(pair[0])===JSON.stringify(pair[1]))invalid('Les deux rectangles EfficientLoFTR doivent être distincts.');
 if(scientificScope){
  const intersection=(poly,r)=>{const clipped=clipPolygon(poly.map(([x,y])=>[x-r.x0,y-r.y0]),r.x1-r.x0,r.y1-r.y0);return clipped.length>0;};
  const polygon=r=>r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];
  const graphs=(scientificScope.panels?.panels??[]).filter(p=>p.policyHint==='non-acquisition'||['Graphs','Flow Cytometry'].includes(p.label)).map(p=>polygon({x0:p.rectangle[0],y0:p.rectangle[1],x1:p.rectangle[2],y1:p.rectangle[3]}));
  for(const r of pair){if(!scientificScope.regions.some(acquisition=>intersection(polygon(acquisition),r)))invalid('Chaque rectangle EfficientLoFTR doit couvrir une acquisition réelle préparée.');if(graphs.some(graph=>intersection(graph,r)))invalid('Une paire EfficientLoFTR ne peut pas inclure un panneau de graphique ou de schéma.');}
 }
 return pair;
}
export function batchPairSelection(image,regions,source='manual'){
 if(!['manual','detected','selected-panels'].includes(source)||typeof image.hash!=='string')throw Object.assign(Error('Identité de paire invalide.'),{code:'BATCH_PAIR_REQUIRED'});
 return {pixelHash:image.hash,width:image.width,height:image.height,source,regions:batchPairRegions(regions,{width:image.width,height:image.height,scientificScope:image.preparation})};
}
export function restoredBatchPair(image){
 if(image.pairCleared)return null;
 const value=image.pairSelection??image.restored?.configuration?.pairSelections?.[image.hash];
 if(!value)return null;
 if(value.pixelHash!==image.hash||value.width!==image.width||value.height!==image.height)throw Object.assign(Error('La paire enregistrée appartient à une autre image.'),{code:'BATCH_PAIR_REQUIRED'});
 return batchPairSelection(image,value.regions,value.source);
}

export function imageScore(runs){
 const successful=runs.filter(x=>x.status==='done'||x.status==='partial');
 const clones=Math.max(0,...successful.map(x=>x.cloneMaximum??0));
 const additional=new Set([...successful.filter(x=>x.kind!=='clones'&&x.kind!=='automatic'&&x.positive).map(x=>x.operation==='ela.biomes'?'ela.biomes':x.methodKey??x.toolId),...successful.flatMap(x=>x.additionalMethods??[])]).size;
 return {clones,additional,total:clones+additional,incomplete:runs.some(x=>['error','cancelled','partial'].includes(x.status))};
}
export function studyScores(studies,images,{threshold=1,basis='clones'}={}){
 if(!Number.isInteger(threshold)||threshold<1||!['clones','total'].includes(basis))throw Error('Invalid batch threshold');
 return studies.map(study=>{
  const related=images.filter(image=>image.selected&&image.occurrences.some(o=>o.studyId===study.id));
  let best={clones:0,additional:0,total:0},incomplete=!!study.errors?.length,completed=0;
  for(const image of related){const score=image.score??{clones:0,additional:0,total:0,incomplete:true};if(score.total>best.total||(score.total===best.total&&score.clones>best.clones))best=score;if(score.incomplete||image.state!=='done')incomplete=true;else completed++;}
  // The clone maximum can be on a different image from the greatest total.
  const clones=Math.max(0,...related.map(i=>i.score?.clones??0));
  const retained=study.manualMarked||(basis==='clones'?clones:best.total)>=threshold;
  return {...study,score:{clones,additional:best.additional,total:best.total},retained,completed,selected:related.length,status:incomplete?'incomplete':!related.length?'unselected':retained?'flagged':'no-signal'};
 });
}
