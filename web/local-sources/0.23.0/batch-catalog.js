import {localFeaturePolicy} from './feature-policy.js?v=0.23.0';
import {toolCatalog,toolFields} from './tool-catalog.js?v=0.23.0';
import {CLONE_ALGORITHMS,cloneMethodLabel,changeCloneAlgorithm,cloneOperation,isDenseClone,SSG_DEFAULTS} from './clone-methods.js?v=0.23.0';
import {sparseParameters,sparseViewDefaults,CLASSIC_SIFT,PANELS_SIFT} from './sparse-controls.js?v=0.23.0';
import defaults from './tool-defaults.js?v=0.23.0';
import {defaults as classicDefaults} from './settings.js?v=0.23.0';
import {NEURAL_METHODS} from './neural-clone-ui.js?v=0.23.0';
import {clipPolygon} from './batch-scope-geometry.js?v=0.23.0';

const copy=value=>structuredClone(value);
const groups={recommended:['Adaptés au traitement par lot','Suited to batch processing'],complement:['Analyses complémentaires','Additional analyses'],less:['Moins adaptés — inspection humaine','Less suited — human inspection'],required:['Entrée supplémentaire nécessaire','Additional input required']};
export const batchGroups=groups;
// Batch matching separation and displayed group length are distinct controls.
// Individual-tool defaults and the minimum of four witnesses stay unchanged.
export const BATCH_CLONE_DEFAULTS=Object.freeze({minimum:7,low:15});
export function batchRecipeView(recipe){
 if(recipe.operation==='m2.rita')return {mode:'overlay',opacity:.6,...copy(recipe.view??{}),threshold:recipe.signal?.threshold??recipe.view?.threshold??.5};
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
 else if(['m2.trufor','m2.rita','m2.catnet','ai.localization.focal','ai.localization.adaifl'].includes(id)){kind='map';group='complement';}
 else if(id==='noise.noisesniffer'){kind='regions';group='complement';}
 else if(id==='ela.energy'||id==='ela.biomes'){kind='ela';group='complement';}
 if(prerequisites[id]){kind='required';group='required';}
 return {id,operation:id,...item,backend:'auto',params:copy(item.params??{}),kind,group,description:id==='file.similarity'?['Liens vers des services externes ; aucune opération locale à exécuter en lot.','Links to external services; no local batch operation.']:descriptions[kind],notBatch:id==='file.similarity',requires:prerequisites[id],...(id==='m2.rita'?{view:{mode:'overlay',threshold:.5,opacity:.6},description:['RITA — tampon et IA générative, à la taille native. Score non calibré ; 0,5 reproduit le masque du modèle. Les images comportant des exclusions restent des sorties brutes, sans vote scientifique filtré.','RITA — stamping and generative AI, at native size. Uncalibrated score; 0.5 reproduces the model mask. Images with exclusions remain raw outputs and do not cast a scientifically scoped vote.']}:{}),signal:{threshold:id==='m2.rita'?.5:.8,minimumPixels:32},fields:toolCatalog[id]?toolFields(id):Object.entries(item.params??{}).map(([key,value])=>({key,label:key,value,type:typeof value==='boolean'?'checkbox':typeof value==='number'?'number':'text'}))};
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
 if(['ai.clones.d2prl','ai.clones.segmentation'].includes(operation)&&scientificScope){regions=batchNeuralCropRegions(scientificScope.regions,{width:scientificScope.width,height:scientificScope.height});params.scientificScope=copy(scientificScope);}
 return {id,imageId,operation,params,backend:recipe.backend??'auto',...(operation==='tampering.copyMove.sparse'&&scientificScope?{scientificScope:copy(scientificScope)}:{}),...(batchRecipeView(recipe)!==undefined?{view:batchRecipeView(recipe)}:{}),...(['ai.clones.d2prl','ai.clones.segmentation'].includes(operation)&&regions.length?{regions:regions.map((r,i)=>({id:'panel-'+i,kind:'region',bounds:[r.x0,r.y0,r.x1,r.y1]})),params:{...params,selectionPresent:true}}:{})};
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

// Qualified original resource identities. These are checks on completed native
// receipts, not a new asset registry or a reason to fetch a model.
const neuralReceiptPins={
 'cmseg-generalization':{models:['5971bb653cecd0c6f9672bed99c2f694151ed9b50693501642ca66213b820c2c'],family:'cmseg'},
 'cmseg-addnoise':{models:['699c450495030f6dcb8b03bfa5d6fbcb0835763af9e31f20a05aa42856e2908a'],family:'cmseg'},
 mgcfdn:{models:['8b99302269be19e214139b533e198f85169c3821a637a89ff93f6ab0c720b44e','cb88c2132a178ef411625c004d4509c4f0361f699cf606dc33cf3ce6d82d1402'],graphs:['8b99302269be19e214139b533e198f85169c3821a637a89ff93f6ab0c720b44e','6da571500c82be5ed474962d1daac53f0a868d1fb3e5f9bd0ee0fced4b856ba9'],family:'mgcf',side:40},
 'mgcfdn-st':{models:['d7b577b68f862a43d12959291e93ecd2143d0feb4723efeb56f2bd7f941cba6d','94bd9ac8162eb86bd16c3edc09433f7077a4788706b5e8640137f8d8b2a65090'],graphs:['d7b577b68f862a43d12959291e93ecd2143d0feb4723efeb56f2bd7f941cba6d','ed18f1799651542fc0f950c26908d7e57fe2b027087df0ecea511fc91aaac784'],family:'mgcf',side:40},
 'mgcfdn-16':{models:['81efce16baa78f0383fa822918fd51f0a3843163756c6d16421065175c1d7a90'],family:'mgcf',side:16},
 'mgcfdn-effnet':{models:['e132aa38d8c2726e1e6bc4a2e2a9760b24901757b938580f00742ea25ce569fe'],family:'mgcf',side:16},
 'mgcfdn-mpdn':{models:['d90097900a0005e19f7240ee1fd6c1f05b6ebf6fac2bc553ba2ccc01d6a5195b','179a4275466aecae1e2a9d1cb5eea044eb4bd8198e87386b3fb88ba8d388ae39'],family:'mgcf',side:16},
 'mgcfdn-vig':{models:['5ea0f37330567c601ccfb9a7dcd45bbf2dcda0f2405cb60e66a74ed6f980639a'],graphs:['606b6d93a54142cf469fccd023b2200dfe755b190e5527c58c25aa61b847f57f'],family:'mgcf',side:16},
 'mgcfdn-tnt':{models:['27e4a64f492e0c161c9d50a850bf6e57ba3365e3e7633075bbba4a1edf4c75e3'],graphs:['0972f12d0ce15c58d1dcd0aa992ca28b3ddb46afeacaf8c9d15dc5419ba5f55b'],family:'mgcf',side:16},
 'selfdm-map':{models:['933ce196b044f0df1d3e0aa2dabe79907b6406e1aa9384cc7bb831922b1d4d59'],family:'selfdm',side:64},
 'selfdm-proposal':{models:['b446e758115af4c71080e06573e66cdae7e0f3853cf7bd403eaf3bea1e64ed79'],family:'proposal',side:64},
};
const selfdmInitialSha='933ce196b044f0df1d3e0aa2dabe79907b6406e1aa9384cc7bb831922b1d4d59';
const selfdmInitialStage='gather-before-attention-and-correlation-MatMul; native-TopK48; ScatterND-native-layout; output-support-guard';
const selfdmProposalStage='SelfDM-before-attention-correlation; DeepMask-mask-before-banks; SuperPoint-before-NMS-TopK; points-before-SuperGlue; SEEDS-excluded-labels; CRF-adjacency-before-probability-propagation';
const receiptDigest=value=>/^[a-f0-9]{64}$/.test(value??'');
const receiptEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const receiptCount=value=>Number.isSafeInteger(value)&&value>=0;

// Validate source geometry and small admission domains, never RGB, probabilities
// or model weights. Learned DeepMask/point counts remain native stage receipts;
// only actual executed stages receive an execution label. Reused domain receipts
// remain available separately from the list of new inference executions.
async function validateSelfDMReceipt(scope,bounds,pipeline,{proposal,budget,signal}){
 const receipt=pipeline.scientificScope,fail=reason=>({reason});
 if(receipt.stage!==(proposal?selfdmProposalStage:selfdmInitialStage)||receipt.policy!=='selfdm-native-scope-v2'||receipt.fingerprint!==scope.fingerprint||receipt.sourceSha256!==scope.sourceSha256||!receiptEqual(receipt.bounds,bounds)||receipt.coordinates!=='original-pixels'||!receiptEqual(receipt.grid,[64,64])||receipt.gridDtype!=='uint8'||!receiptDigest(receipt.gridSha256))return fail('Source-bound SelfDM admission receipt missing or predates native grid hashes.');
 const {createSelfDMScientificScopeInput}=await import('./unified-engine/src/selfdm-scientific-scope.js');
 let actual;
 try{
  actual=await createSelfDMScientificScopeInput({scope,width:scope.width,height:scope.height,sourceSha256:scope.sourceSha256,bounds},{budget,signal});
  for(const field of ['gridSha256','admittedCentres','refusedCentres','totalCentres','outputAdmittedCentres','attentionAndCorrelationPairsPerBranch'])if(receipt[field]!==actual.metadata[field])return fail('Reprojected SelfDM admission/output domain differs from the completed native receipt.');
  const partial=actual.metadata.admittedCentres!==64**2||actual.metadata.outputAdmittedCentres!==512**2;
  if(receipt.bypassOriginal!==!partial)return fail('SelfDM native bypass flag differs from the exact admitted domain.');
  const graph=receipt.graphTransform;
  if(partial&&(graph?.policy!=='selfdm-native-scope-v2'||graph.sourceSha256!==selfdmInitialSha||!receiptDigest(graph.derivedSha256)))return fail('Original/scoped SelfDM graph receipt missing.');
  const checked={stage:receipt.stage,grids:[{grid:[64,64],admitted:actual.metadata.admittedCentres,rejected:actual.metadata.refusedCentres,gridSha256:receipt.gridSha256}],outputAdmittedCentres:actual.metadata.outputAdmittedCentres,bypassOriginal:!partial,...(graph?{graph:copy(graph)}:{})};
  if(!proposal)return checked;
  const {createProposalPointAdmission,createProposalCRFScientificScope}=await import('./unified-engine/src/selfdm-proposal-scope.js');
  const {proposalCRFWindows}=await import('./unified-engine/src/selfdm-proposal-pyramid.js');
  const {proposalResize}=await import('./unified-engine/src/selfdm-proposal-process.js');
  const {controlCheckpoint}=await import('./unified-engine/src/errors.js');
  const executed=receipt.executedStages,skipped=receipt.skippedStages,boxes=pipeline.proposals,resize=pipeline.resize,cropWidth=bounds[2]-bounds[0],cropHeight=bounds[3]-bounds[1];
  const allowed=new Set(['selfdm','selfdm-scoped','deepmask','superpoint','superpoint-post','superglue','crf','crf-scoped']);
  if(receipt.proposalPolicy!=='selfdm-proposal-native-domain-v1'||!receiptEqual(pipeline.sourceDimensions,[cropWidth,cropHeight])||!Array.isArray(executed)||!executed.every(s=>allowed.has(s))||new Set(executed).size!==executed.length||!Array.isArray(skipped)||!skipped.every(s=>s&&['roi-and-SEEDS','superpoint','superpoint-post','superglue'].includes(s.stage)&&typeof s.reason==='string')||!Array.isArray(boxes)||boxes.length>500||!boxes.every(b=>Array.isArray(b)&&Array.isArray(b[0])&&b[0].length===4&&b[0].every(Number.isSafeInteger)&&b[0][0]>=0&&b[0][1]>=0&&b[0][2]<=cropWidth&&b[0][3]<=cropHeight&&b[0][2]>b[0][0]&&b[0][3]>b[0][1])||!receiptEqual(resize,proposalResize(boxes)))return fail('Proposal stages or native source-rectangle/resize receipts are incomplete.');
  if((executed.includes('selfdm-scoped')&&!partial)||(executed.includes('selfdm')&&partial))return fail('Proposal initial graph execution disagrees with its bypass domain.');
  const pointsExpected=boxes.length>=2?boxes.length:0;
  if(!Array.isArray(receipt.proposals)||receipt.proposals.length!==pointsExpected)return fail('Every executed proposal requires its native descriptor/point receipt.');
  if(!pointsExpected&&(['superpoint','superpoint-post','superglue'].some(s=>executed.includes(s))||!['roi-and-SEEDS','superpoint','superpoint-post','superglue'].every(s=>skipped.some(v=>v.stage===s&&v.reason==='fewer-than-two-accepted-proposals'))))return fail('Proposal stages that were not reached cannot be credited as executed.');
  if(executed.includes('superglue')&&skipped.some(v=>v.stage==='superglue')||!executed.includes('superglue')&&!skipped.some(v=>v.stage==='superglue'))return fail('SuperGlue execution/skip receipt is inconsistent.');
  if(!Array.isArray(receipt.deepMask)||receipt.deepMask.length!==7)return fail('All seven native DeepMask scale banks require receipts.');
  for(let i=0;i<7;i++){
   const d=receipt.deepMask[i],scale=2**(-2.5+i*.5),slots=(Math.ceil((Math.floor(cropWidth*scale)+160)/16)-9)*(Math.ceil((Math.floor(cropHeight*scale)+160)/16)-9);
   if(d?.scaleIndex!==i||d.stage!=='masked-support-before-Top500-proposal-ranking'||d.nativeSlots!==slots||!receiptCount(d.retainedProposalMasks)||!receiptCount(d.removedProposalMasks)||d.retainedProposalMasks+d.removedProposalMasks!==slots||!partial&&d.removedProposalMasks!==0)return fail('DeepMask native scale-domain counts are incomplete or inconsistent.');
  }
  const descriptorDomains=[];
  for(let index=0;index<pointsExpected;index++){
   const d=receipt.proposals[index];if(d?.index!==index)return fail('Proposal index differs from its native source rectangle.');
   if(!partial){if(d.descriptorCells||d.denseScores||d.points)return fail('All-admitted Proposal used a scoped point path instead of the original path.');continue;}
   const descriptor=d.descriptorCells,scores=d.denseScores,points=d.points,[rw,rh]=resize;
   if(descriptor?.stage!=='bilinear-descriptor-support-before-NMS-TopK-and-SuperGlue'||descriptor.gridDtype!=='uint8'||!receiptEqual(descriptor.rectangle,boxes[index][0])||!receiptEqual(descriptor.resize,[rh,rw])||!receiptDigest(descriptor.gridSha256)||scores?.policy!=='selfdm-proposal-native-domain-v1'||scores.stage!=='dense-scores-before-native-NMS-and-TopK'||points?.policy!=='selfdm-proposal-native-domain-v1'||points.stage!=='points-before-SuperGlue-attention-and-matching')return fail('Source-bound pre-NMS/descriptor/SuperGlue point admission receipts missing.');
   let admission;
   try{
    admission=await createProposalPointAdmission(actual,boxes[index][0],rw,rh,{budget,signal});
    for(const field of ['gridSha256','admittedCells','excludedCells','totalCells','nativeStride','nativeCentre','coordinates'])if(descriptor[field]!==admission.metadata[field])return fail('Reprojected descriptor support differs from the completed native receipt.');
    if(!receiptEqual(descriptor.grid,admission.metadata.grid))return fail('Proposal descriptor grid dimensions differ.');
    const denseWidth=Math.floor(rw/8)*8,denseHeight=Math.floor(rh/8)*8;let admitted=0;
    for(let y=0;y<denseHeight;y++){if((y&31)===0)await controlCheckpoint(signal);for(let x=0;x<denseWidth;x++)if(actual.admitsResizedPoint(x,y,boxes[index][0],rw,rh)&&admission.admits(x,y))admitted++;}
    if(scores.admitted!==admitted||scores.excluded!==denseWidth*denseHeight-admitted||scores.total!==denseWidth*denseHeight||!['admitted','excluded','total'].every(k=>receiptCount(points[k]))||points.admitted+points.excluded!==points.total||points.total>2048||points.admitted>admitted)return fail('Native pre-NMS/point admission counts differ from the scoped domain.');
    descriptorDomains.push({index,rectangle:[...boxes[index][0]],resize:[...resize],grid:[...descriptor.grid],gridSha256:descriptor.gridSha256,admittedCells:descriptor.admittedCells,excludedCells:descriptor.excludedCells,admittedScores:admitted,admittedPoints:points.admitted,rejectedPoints:points.excluded});
   }finally{admission?.release();}
  }
  const windows=proposalCRFWindows(cropWidth,cropHeight),crfDomains=[];
  if(!partial){if(receipt.crf?.length)return fail('All-admitted Proposal must retain the original CRF path.');}
  else{
   if(!Array.isArray(receipt.crf)||receipt.crf.length!==windows.length)return fail('Every CRF window requires a source-bound admission receipt.');
   for(let i=0;i<windows.length;i++){
    const d=receipt.crf[i];if(d?.policy!=='selfdm-proposal-crf-scope-v1'||d.stage!=='source-and-target-adjacency-before-unary-message-multiplication'||!receiptEqual(d.window,windows[i])||d.gridDtype!=='uint8'||!receiptDigest(d.gridSha256)||!receiptDigest(d.outputScopeSha256))return fail('CRF native coarse/output grid receipt missing or mismatched.');
    let crf;
    try{
     crf=await createProposalCRFScientificScope(actual,windows[i],{budget,signal});
     for(const field of ['gridSha256','outputScopeSha256','admittedCells','excludedCells','totalCells','admittedPixels','excludedPixels'])if(d[field]!==crf.metadata[field])return fail('Reprojected CRF source/target domain differs from the native receipt.');
     if(!receiptEqual(d.coarseShape,crf.metadata.coarseShape)||!receiptEqual(d.outputShape,crf.metadata.outputShape))return fail('CRF admission grid dimensions differ.');
     const active=crf.metadata.admittedPixels>0,scoped=crf.metadata.excludedCells>0||crf.metadata.excludedPixels>0,graph=d.graphTransform;
     if(d.inferencePerformed!==active||active&&d.bypassOriginal!==!scoped||!active&&d.reason!=='fully-excluded-before-CRF')return fail('CRF cancellation/original-bypass receipt differs from the admitted pixels.');
     if(active&&scoped&&(graph?.policy!=='selfdm-proposal-crf-scope-v1'||graph.sourceSha256!=='e614ae178a99af889a0fbfc58be1e281281c41934e5b16d00ad475d3952482ff'||!receiptDigest(graph.derivedSha256)))return fail('Original/scoped CRF graph receipt missing.');
     crfDomains.push({window:{...windows[i]},coarseShape:[...d.coarseShape],outputShape:[...d.outputShape],gridSha256:d.gridSha256,outputScopeSha256:d.outputScopeSha256,admittedCells:d.admittedCells,rejectedCells:d.excludedCells,admittedPixels:d.admittedPixels,rejectedPixels:d.excludedPixels,inferencePerformed:active,...(active?{bypassOriginal:!scoped}:{reason:d.reason})});
    }finally{crf?.release();}
   }
  }
  return {...checked,executedStages:[...executed],skippedStages:copy(skipped),proposalDomains:{descriptorDomains,crfDomains,deepMask:copy(receipt.deepMask),deepMaskValidation:'Pinned native stage and bank-count receipts; learned mask values are not reconstructed from geometry.'},qualifiedExecutedStages:partial?executed.filter(s=>['selfdm-scoped','deepmask','superpoint-post','superglue','crf-scoped'].includes(s)):[],allAdmittedOriginal:!partial};
 }finally{actual?.release();}
}
export async function batchNativeScopeExecution(recipe,scope,output,{budget,signal}={}){
 const fail=reason=>({schema:'sherloq.batch-native-scope-execution/1',validated:false,reason});
 const variant=recipe.params?.variant,pin=neuralReceiptPins[variant],provenance=output?.provenance,metadata=output?.data?.metadata??output?.metadata?.metadata??output?.metadata;
 if(!pin||!metadata||provenance?.operation!=='ai.clones.segmentation'||provenance.params?.variant!==variant||!pin.models.includes(provenance.model?.sha256))return fail('Native variant/model receipt missing or unqualified.');
 if(!['cpu-wasm','webgpu-cpu'].includes(provenance.backend)||provenance.backend==='cpu-wasm'&&provenance.model.sha256!==pin.models[0])return fail('Native model/backend identity differs from the selected pipeline.');
 if(provenance.originalSha256!==scope.sourceSha256||metadata.scientificScope?.fingerprint!==scope.fingerprint)return fail('Native source identity or prepared scope differs.');
 const data=output.data??output.metadata;if(data.width!==scope.width||data.height!==scope.height)return fail('Native output dimensions differ from the original scientific source.');
 const zones=metadata.zones,pipelines=metadata.nativePipelines;
 if(!Array.isArray(zones)||!zones.length||!Array.isArray(pipelines)||pipelines.length!==zones.length||new Set(pipelines.map(p=>p.zoneId)).size!==zones.length)return fail('Every original input region requires its own native pipeline receipt.');
 const {prepareSegmentationScientificMask}=await import('./unified-engine/src/segmentation-scientific-scope.js');
 if(!budget){const {Budget}=await import('./unified-engine/src/cache.js');budget=new Budget(2*1024**2);}
 const checked=[],digest=v=>/^[a-f0-9]{64}$/.test(v??''),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 for(const zone of zones){
  const pipeline=pipelines.find(p=>p.zoneId===zone.id),receipt=pipeline?.scientificScope,bounds=zone.bounds;
  if(!receipt||!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isSafeInteger)||bounds[0]<0||bounds[1]<0||bounds[2]>scope.width||bounds[3]>scope.height||bounds[2]<=bounds[0]||bounds[3]<=bounds[1]||!provenance.regions?.some(r=>r.id===zone.id&&equal(r.bounds,bounds))||pipeline.originalBounds&&!equal(pipeline.originalBounds,bounds))return fail('Native region bounds differ from the delivered original input.');
  if(pin.family==='selfdm'||pin.family==='proposal'){
   const validation=await validateSelfDMReceipt(scope,bounds,pipeline,{proposal:pin.family==='proposal',budget,signal});if(validation.reason)return fail(validation.reason);checked.push({zoneId:zone.id,bounds:[...bounds],...validation});continue;
  }
  const expected=pin.family==='cmseg'?[128,64,32]:[pin.side],domains=pin.family==='cmseg'?receipt.grids:[receipt],actualFingerprint=receipt.scopeFingerprint??receipt.fingerprint;
  if(actualFingerprint!==scope.fingerprint||!Array.isArray(domains)||domains.length!==expected.length)return fail('Native candidate-domain scope/grid receipt missing.');
  const stage=pin.family==='cmseg'?'source-and-target-before-correlation-softmax-topk':pin.family==='mgcf'?'source-and-target-before-dot-softmax-topk-and-global-attention':'gather-before-attention-and-correlation-MatMul; native-TopK48; ScatterND-native-layout; output-support-guard';
  if(receipt.stage!==stage)return fail('The native receipt does not establish filtering before candidate scoring.');
  let anyPartial=false;const grids=[];
  for(let i=0;i<expected.length;i++){
   const side=expected[i],d=domains[i],selfdm=pin.family==='selfdm',grid=d.grid??d.nativeGrid,inputSide=pin.family==='mgcf'?256:512;
   if(!equal(grid,[side,side])||d.sourceSha256!==scope.sourceSha256||!equal(d.bounds,bounds)||d.coordinates!=='original-pixels'||!digest(d.gridSha256)||(d.scopeFingerprint??d.fingerprint)!==scope.fingerprint||!selfdm&&(d.width!==scope.width||d.height!==scope.height||d.inputSide!==inputSide||d.interpolation!=='pillow-bilinear'))return fail('Native admission grid is not tied to the exact source, crop and scope.');
   const options={rows:side,columns:side,inputSide,budget,signal,...(pin.family!=='mgcf'?{originX:0,originY:0,strideX:512/side,strideY:512/side}:{}),interpolation:selfdm?'selfdm-opencv-linear':'pillow-bilinear'};
   let actual;try{actual=await prepareSegmentationScientificMask({scope,width:scope.width,height:scope.height,sourceSha256:scope.sourceSha256,bounds},options);
    const admitted=selfdm?d.admittedCentres:d.admittedSources,rejected=selfdm?d.refusedCentres:d.rejectedSources;
    if(actual.admitted!==admitted||actual.total-actual.admitted!==rejected||actual.metadata.gridSha256!==d.gridSha256||!selfdm&&(d.admittedTargets!==admitted||d.rejectedTargets!==rejected))return fail('Reprojected exact acquisition/exclusion geometry differs from the native admission grid.');
    anyPartial ||= actual.partial;grids.push({grid:[side,side],admitted,rejected,gridSha256:d.gridSha256});
   }finally{actual?.release();}
  }
  if(pin.family==='cmseg'&&receipt.bypassOriginal!==!anyPartial||pin.family==='mgcf'&&receipt.bypassOriginal!==!anyPartial)return fail('Native bypass flag disagrees with the actual admitted domain.');
  const graph=receipt.graph??receipt.graphTransform;
  if(pin.family!=='cmseg'&&!receipt.bypassOriginal){const policy=pin.family==='mgcf'?'mgcfdn-admitted-correlations-query-scatter/1':'selfdm-native-scope-v2',sources=pin.graphs??pin.models,source=sources.length===1?sources[0]:sources[pin.models.indexOf(provenance.model.sha256)];if(graph?.policy!==policy||graph.sourceSha256!==source||!digest(graph.derivedSha256))return fail('Verified original/scoped model graph receipt missing.');}
  checked.push({zoneId:zone.id,bounds:[...bounds],stage,grids,bypassOriginal:receipt.bypassOriginal,...(graph?{graph:copy(graph)}:{})});
 }
 return {schema:'sherloq.batch-native-scope-execution/1',validated:true,variant,sourceSha256:scope.sourceSha256,scopeFingerprint:scope.fingerprint,modelSha256:provenance.model.sha256,backend:provenance.backend,geometryValidation:'Reprojected exact original-coordinate acquisitions/exclusions and SHA-256 of every native admission grid.',cnnContextMasked:false,regions:checked};
}
// RITA has global attention and categorical feedback. Cropping, blanking or
// post-filtering cannot establish that excluded pixels were absent from its
// native computation. Qualify only a demonstrably complete original frame.
export function batchRitaFullFrameScope(scope){
 if(!scope||scope.excluded?.length||scope.text?.polygons?.length||!Number.isSafeInteger(scope.width)||!Number.isSafeInteger(scope.height))return false;
 return (scope.regions??[]).some(r=>{
  if(r.envelope||r.x0>0||r.y0>0||r.x1<scope.width||r.y1<scope.height)return false;
  if(!r.polygon)return true;
  if(r.polygon.length!==4)return false;
  const xs=r.polygon.map(p=>p[0]),ys=r.polygon.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  return left<=0&&top<=0&&right>=scope.width-1&&bottom>=scope.height-1&&new Set(r.polygon.map(([x,y])=>((x===left?'l':x===right?'r':'?')+(y===top?'t':y===bottom?'b':'?')))).size===4&&r.polygon.every(([x,y],i)=>{const next=r.polygon[(i+1)%4];return (x===left||x===right)&&(y===top||y===bottom)&&((x===next[0])!==(y===next[1]));});
 });
}
export function batchScopeSupport(recipe,scope,output,validationOptions){
 if(!scope)return {mode:'native-diagnostic',scientificFiltering:false};
 const common={scientificFiltering:true,scopeFingerprint:scope.fingerprint,coordinates:'original-pixels',originalPixelsPreserved:true};
 if(recipe.operation==='m2.rita')return batchRitaFullFrameScope(scope)?{...common,mode:'native-full-frame',scientificFiltering:false,qualifiedForScopedSignal:true,input:'whole-original-image',excludedPixels:0,cnnContext:'whole-original-image',rawModelOutputsPreserved:true}:{...common,mode:'raw-only',qualifiedForScopedSignal:false,input:'whole-original-image',exclusionsBeforeInference:false,rawModelOutputsPreserved:true,reason:'RITA conserve le contexte global original. Les exclusions de texte, graphiques ou sous-zones ne sont pas encore prises en charge avant son calcul ; la sortie brute ne participe pas au signalement scientifique.'};
 if(recipe.operation==='tampering.copyMove.sparse')return {...common,mode:'input-exclusions',stage:'before-matching',method:recipe.params.algorithm};
 if(recipe.operation==='m2.forgeryscope')return {...common,mode:'geometry-before-matching',rawBranches:['embeddings','lanes'],qualifiedEvidence:'filtered_evidence.comparisons'};
 if(recipe.operation==='ai.clones.d2prl')return {...common,mode:'matching-exclusions',input:'acquisition-rois',stage:'source-and-target-before-native-patchmatch',cnnContext:'original-rectangle-context',textFiltering:'matching-and-derived-evidence',nativeMapsPreserved:true};
 if(recipe.operation==='ai.clones.segmentation'){
  const base={...common,mode:'derived-evidence',input:'acquisition-rois',textFiltering:'derived-evidence-only',nativeMapsPreserved:true};
  if(output===undefined)return base;
  return batchNativeScopeExecution(recipe,scope,output,validationOptions).then(nativeExecution=>nativeExecution.validated?{...common,mode:'candidate-domain-exclusions',input:'acquisition-rois',stage:'source-and-target-before-native-candidate-scoring',textFiltering:'native-candidate-domain-and-projected-support-guard',cnnContext:'original-rectangle-context',cnnContextMasked:false,rawModelOutputsPreserved:true,projectedScopeGuard:true,nativeExecution}:{...base,nativeExecution});
 }
 if(['analysis.clones','analysis.complete'].includes(recipe.operation))return {...common,mode:'mixed-exclusions',input:'prepared-acquisitions; native-classical-search-regions',stages:{patchmatch:'input-exclusions-before-matching',sift:'input-exclusions-before-matching',d2prl:'source-and-target-before-native-patchmatch',forgeryscope:'geometric-keypoints-before-matching',...(recipe.operation==='analysis.complete'?{ela:'descriptive-only'}:{})},cnnContext:'original-rectangle-context',rawBranches:['forgeryscope-embeddings','forgeryscope-lanes'],nativeMapsPreserved:true};
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
