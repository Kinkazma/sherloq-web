import {toolCatalog,toolFields} from './tool-catalog.js';
import {CLONE_ALGORITHMS,cloneMethodLabel,changeCloneAlgorithm,cloneOperation,isDenseClone} from './clone-methods.js';
import {sparseParameters,CLASSIC_SIFT,PANELS_SIFT} from './sparse-controls.js';
import defaults from './tool-defaults.js';
import {defaults as classicDefaults} from './settings.js';
import {NEURAL_METHODS} from './neural-clone-ui.js';

const copy=value=>structuredClone(value);
const groups={recommended:['Adaptés au traitement par lot','Suited to batch processing'],complement:['Analyses complémentaires','Additional analyses'],less:['Moins adaptés — inspection humaine','Less suited — human inspection'],required:['Entrée supplémentaire nécessaire','Additional input required']};
export const batchGroups=groups;
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
for(const [variant,name]of NEURAL_METHODS.filter(([id])=>!id.startsWith('forgeryscope')&&id!=='d2prl'))entries.push({...describe('ai.clones.segmentation',{fr:name,en:name,params:{variant}}),...(variant==='selfdm-proposal'?{description:['Chaîne complète expérimentale à la résolution native. Le chemin GPU reste en cours de qualification ; les dimensions non qualifiées sont signalées sans substitution.','Experimental complete pipeline at native resolution. The GPU path is being qualified; unqualified dimensions are reported without substitution.']}:variant==='selfdm-map'?{description:['Carte initiale SelfDM uniquement, préparée à la résolution native du modèle. Le raffinement complet est une méthode distincte.','SelfDM initial map only, prepared at the model’s native resolution. Complete refinement is a separate method.']}:{}),id:'segmentation-'+variant,fields:[]});
for(const [index,algorithm] of CLONE_ALGORITHMS.entries()){
 const params=copy(toolCatalog['tampering.copyMove.sparse'].params);changeCloneAlgorithm(params,params.algorithm);params.algorithm=algorithm;changeCloneAlgorithm(params,'PatchMatch Zernike');
 const item=describe('tampering.copyMove.sparse',toolCatalog['tampering.copyMove.sparse']);
 const relevant=f=>!(algorithm==='EfficientLoFTR'&&['radius','autoRadius','compact','independent'].includes(f.key))&&!['algorithm','compare'].includes(f.key)&&(!['longSide','rotationMode'].includes(f.key)||algorithm==='EfficientLoFTR')&&(!['patch','iterations','texture'].includes(f.key)||isDenseClone(algorithm))&&(f.key!=='reflections'||isDenseClone(algorithm)||algorithm===PANELS_SIFT||algorithm==='EfficientLoFTR')&&(f.key!=='independent'||algorithm===CLASSIC_SIFT);
 entries.push({...item,...(algorithm==='EfficientLoFTR'?{pairRequired:true,group:'required',description:['Deux rectangles distincts par image. Préparez la paire dans Images : détection des panneaux ou coordonnées explicites. S’il n’y a pas exactement deux panneaux, le lot attend votre choix.','Two distinct regions per image. Prepare the pair in Images using panel detection or explicit coordinates. Unless exactly two panels are detected, the batch requires your choice.']} : {}),id:'clone-'+index,fr:cloneMethodLabel(algorithm),en:cloneMethodLabel(algorithm),params,fields:item.fields.filter(relevant).map(f=>({...f,...(algorithm==='EfficientLoFTR'&&f.key==='longSide'?{min:64}:{}),value:params[f.key]??f.value}))});
}
const priority=x=>x.id==='ai.clones.d2prl'?0:x.params.algorithm==='SIFT + G2NN + RANSAC + Panels + Text'?1:x.params.algorithm==='SIFT + G2NN + RANSAC'?2:x.params.algorithm==='PatchMatch Zernike'?3:x.id==='m2.forgeryscope'?4:x.id==='analysis.clones'?5:x.id==='analysis.complete'?6:10;
export const batchCatalog=Object.freeze(entries.sort((a,b)=>priority(a)-priority(b)));
export function batchTask(recipe,{id,imageId,regions=[]}={}){
 let operation=recipe.operation,params=copy(recipe.params);
 if(operation==='tampering.copyMove.sparse'){
  operation=cloneOperation(params.algorithm);
  if(params.algorithm==='EfficientLoFTR')regions=batchPairRegions(regions);
  params=sparseParameters({...params,excluded:[],compare:params.algorithm==='EfficientLoFTR'},regions.map(r=>({...r,polygon:r.polygon??[[r.x0,r.y0],[r.x1-1,r.y0],[r.x1-1,r.y1-1],[r.x0,r.y1-1]]})));
 }
 return {id,imageId,operation,params,backend:recipe.backend??'auto',...(['ai.clones.d2prl','ai.clones.segmentation'].includes(operation)&&regions.length?{regions:regions.map((r,i)=>({id:'panel-'+i,kind:'region',bounds:[r.x0,r.y0,r.x1,r.y1]})),params:{...params,selectionPresent:true}}:{})};
}
export const recipeKey=recipe=>JSON.stringify([recipe.operation,recipe.params,recipe.backend??'auto']);
export const catalogRecipe=id=>{const entry=batchCatalog.find(x=>x.id===id);if(!entry)throw Error('Unknown batch tool');return {...entry,params:copy(entry.params),signal:copy(entry.signal)};};

export function batchPairRegions(regions,{width,height}={}){
 const invalid=message=>{throw Object.assign(Error(message),{code:'BATCH_PAIR_REQUIRED',details:{requiredRegions:2,width,height}});};
 if(!Array.isArray(regions)||regions.length!==2)invalid('EfficientLoFTR nécessite exactement deux rectangles distincts. Préparez la paire dans Images.');
 const pair=regions.map(r=>{
  if(!r||r.envelope||![r.x0,r.y0,r.x1,r.y1].every(Number.isSafeInteger)||r.x0<0||r.y0<0||r.x1-r.x0<8||r.y1-r.y0<8||width!==undefined&&r.x1>width||height!==undefined&&r.y1>height)invalid('Paire EfficientLoFTR invalide : deux rectangles réels de 8 pixels minimum, à l’intérieur de l’image, sans enveloppe.');
  return {x0:r.x0,y0:r.y0,x1:r.x1,y1:r.y1};
 });
 if(JSON.stringify(pair[0])===JSON.stringify(pair[1]))invalid('Les deux rectangles EfficientLoFTR doivent être distincts.');
 return pair;
}
export function batchPairSelection(image,regions,source='manual'){
 if(!['manual','detected','selected-panels'].includes(source)||typeof image.hash!=='string')throw Object.assign(Error('Identité de paire invalide.'),{code:'BATCH_PAIR_REQUIRED'});
 return {pixelHash:image.hash,width:image.width,height:image.height,source,regions:batchPairRegions(regions,image)};
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
