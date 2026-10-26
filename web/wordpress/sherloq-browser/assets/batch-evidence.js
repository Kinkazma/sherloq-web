import {nativeContextMapEvidence} from './native-context-map-evidence.js';
import {catnetNativeMapEvidence} from './catnet-batch-evidence.js';
import {Budget} from './unified-engine/src/cache.js';
import {createCloneCorroboration} from './unified-engine/src/clone-corroboration.js';
import {automaticPointEntries} from './unified-engine/src/automatic-point-entries.js';
import {biomeSides} from './unified-engine/src/copy-geometry.js';
import {createCloneEntryGeometry} from './unified-engine/src/clone-entry-geometry.js';
import {streamedD2prlRegions} from './unified-engine/src/d2prl-regions-stream.js';
import {forgeryscopeEntries} from './unified-engine/src/automatic-ai-entries.js';
import {SIFT_SOURCE,CLONE_SOURCES} from './unified-engine/src/clone-relations.js';
import {createBatchScopeMask,scopedMaskStore} from './batch-scope-mask.js';

const check=signal=>signal?.throwIfAborted();
const invalid=message=>Object.assign(Error(message),{code:'BATCH_EVIDENCE_INVALID'});
function scopeSignature(scope){if(!scope||typeof scope!=='object')throw invalid('Le périmètre scientifique est absent ou invalide.');return JSON.stringify([scope.fingerprint,scope.width,scope.height,scope.sourceSha256,scope.regions,scope.excluded]);}
function sourceIdentity(image,output,client){
 const identities=[image.sourceSha256,output?.provenance?.originalSha256,output?.provenance?.originalSourceSha256,client?.source?.sha256].filter(value=>value!==undefined&&value!==null);
 if(!identities.length&&output?.provenance?.sourceRGBSha256)identities.push(output.provenance.sourceRGBSha256);
 if(!identities.length||identities.some(value=>typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))||identities.some(value=>value!==identities[0]))throw invalid('L’identité de la source scientifique est absente ou incohérente.');
 return identities[0];
}
function imageScope(image,output,client,context){
 if(image.preparation===undefined)return null;
 const identity={width:image.width,height:image.height,sourceSha256:sourceIdentity(image,output,client)};
 return context?context.validateScope(image.preparation,identity):createBatchScopeMask(image.preparation,identity);
}
export function batchForgeryscopeMetadata(value){
 const metadata=value?.metadata??value;
 if(Array.isArray(metadata?.zones))return metadata;
 // Standalone M2 analyzes the whole source. The automatic orchestrator wraps
 // the same native comparisons in zones with an explicit crop origin.
 if(metadata?.profile==='Forgeryscope Auto'&&Array.isArray(metadata.comparisons))return {...metadata,zones:[{...metadata,origin:[0,0]}]};
 throw Error('Métadonnées Forgeryscope Auto absentes ou non reconnues.');
}
export function compactEvidence(value){
 if(typeof value==='bigint')return value.toString();
 if(ArrayBuffer.isView(value))return {type:value.constructor.name,length:value.length};
 if(value instanceof Blob)return {bytes:value.size};
 if(Array.isArray(value))return value.map(compactEvidence);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!['pixel_mask','pixels','stores','release'].includes(key)).map(([k,v])=>[k,compactEvidence(v)]));
}
export function evidenceContext({composerFactory=createCloneCorroboration}={}){
 const budget=new Budget(256*1024**2),composer=composerFactory({budget}),validated=new WeakMap();
 function validatedMask(scope,width,height){
  if(scope===undefined)return null;const value=validated.get(scope);if(!value||value.signature!==scopeSignature(scope)||value.width!==width||value.height!==height)throw invalid('Le périmètre de corroboration doit être validé sur la source originale.');return value.mask;
 }
 async function corroborationStripes(entries,width,height,consume,{signal,scope,stripRows=32,methods}={}){
  if(typeof consume!=='function')throw invalid('Un consommateur de bandes de corroboration est requis.');const mask=validatedMask(scope,width,height),activeMethods=[...new Set(entries.map(e=>e.methodKey??e.source))];
  if(methods!==undefined&&(!Array.isArray(methods)||methods.some(method=>typeof method!=='string'||!method)||activeMethods.some(method=>!methods.includes(method))))throw invalid('La liste des méthodes de corroboration est incohérente.');
  const declaredMethods=methods===undefined?activeMethods:[...new Set(methods)];let maximum=0;
  // One vote per algorithm, regardless of the number of zones/search contexts.
  const normalized=entries.map(e=>({...e,source:SIFT_SOURCE,search_context:e.methodKey??e.source}));
  await composer.stripes({entries:normalized,width,height,byContext:true,stripRows},async strip=>{
   mask?.filterRows(strip.values,strip.top,strip.height,{signal});for(const value of strip.values)maximum=Math.max(maximum,value);await consume(strip);
  },{signal});
  return {width,height,maximum,methods:declaredMethods,activeMethods,valueType:'uint32',valueMeaning:'distinct clone algorithms corroborating this original pixel',coordinates:'original-pixels',...(mask?{evidencePreparation:mask.policy}:{})};
 }
 return {budget,validateScope(scope,identity){const signature=scopeSignature(scope),previous=validated.get(scope);if(previous&&previous.signature===signature&&previous.sourceSha256===identity.sourceSha256&&previous.width===identity.width&&previous.height===identity.height)return previous.mask;const mask=createBatchScopeMask(scope,identity);validated.set(scope,{signature,mask,...identity});return mask;},corroborationStripes,async maximum(entries,width,height,signal,scope){
  if(!entries.length)return 0;
  return (await corroborationStripes(entries,width,height,()=>{},{signal,scope,stripRows:256})).maximum;
 },dispose(){composer.dispose();}};
}
async function maskStore(client,descriptor,width,height,scope,budget,signal){
 const raw={byteLength:width*height,async readInto(destination,offset){
  let at=0;while(at<destination.length){const pos=offset+at,x=pos%width,y=Math.floor(pos/width),length=Math.min(destination.length-at,width-x);const values=await client.readScalar(descriptor,{x,y,width:length,height:1},'mask');if(values.length!==length)throw invalid('Les dimensions du masque scientifique diffèrent de l’image.');for(let i=0;i<length;i++){if(!Number.isFinite(values[i]))throw invalid('Le masque scientifique contient une valeur non finie.');destination[at+i]=values[i]?1:0;}at+=length;}return destination;
 }};return scopedMaskStore(raw,scope,{width,height,budget,signal});
}
export function scopedForgeryscopeMetadata(value,{scope,sourceSha256,width,height}={}){
 const metadata=batchForgeryscopeMetadata(value),policies=[];
 const zones=metadata.zones.map(zone=>{
  const preparation=zone.scientific_scope??metadata.scientific_scope;
  if(!preparation){if(scope)throw invalid('Forgeryscope ne fournit pas de preuves géométriques qualifiées pour ce périmètre.');return zone;}
  const validated=createBatchScopeMask(preparation,{width,height,sourceSha256});
  if(scope&&preparation.fingerprint!==scope.policy.fingerprint)throw invalid('Le périmètre Forgeryscope diffère du périmètre scientifique retenu.');
  if(scope&&JSON.stringify([validated.compiled.regions.map(region=>region.polygon),validated.compiled.excluded.map(region=>region.polygon)])!==JSON.stringify([scope.compiled.regions.map(region=>region.polygon),scope.compiled.excluded.map(region=>region.polygon)]))throw invalid('La géométrie du périmètre Forgeryscope diffère de la préparation scientifique.');
  const filtered=zone.filtered_evidence??metadata.filtered_evidence;
  if(preparation.geometry?.keypointsExcludedBeforeMatching!==true||filtered?.scopeFingerprint!==preparation.fingerprint||!Array.isArray(filtered?.comparisons))throw invalid('Les preuves géométriques filtrées de Forgeryscope sont absentes ou incohérentes.');
  const counts=points=>points&&points.schema===preparation.schema&&points.coordinates==='original-pixels'&&points.fingerprint===preparation.fingerprint&&points.stage==='keypoints-before-matching'&&['original','retained','excluded'].every(key=>Number.isSafeInteger(points[key])&&points[key]>=0)&&points.original===points.retained+points.excluded;
  const comparisons=filtered.comparisons.filter(match=>{const filtering=match.scientificScope?.featureFiltering;return match.supported===true&&match.accepted===true&&match.scientificScope?.qualified===true&&Number.isSafeInteger(match.inliers)&&match.inliers>0&&filtering?.fingerprint===preparation.fingerprint&&filtering.stage==='keypoints-before-matching'&&counts(filtering.points0)&&counts(filtering.points1);});
  const featureCounts=comparisons.reduce((total,match)=>{for(const points of [match.scientificScope.featureFiltering.points0,match.scientificScope.featureFiltering.points1])for(const key of ['original','retained','excluded'])total[key]+=points[key];total.inliers+=match.inliers;return total;},{original:0,retained:0,excluded:0,inliers:0});
  policies.push({...validated.policy,rawComparisons:(zone.comparisons??[]).length,qualifiedGeometricComparisons:comparisons.length,rawLanePairs:(zone.lane_pairs??[]).length,similarityAndLanesQualify:false,featureCounts:{...featureCounts,meaning:'summed across the qualified comparison sides; repeated panel extractions may occur'}});
  return {...zone,comparisons,lane_pairs:[]};
 });
 return {...metadata,zones,evidencePreparation:policies.length?{filtered:true,stage:'qualified-scoped-geometry-only',zones:policies,rawScientificOutputsPreserved:true}:undefined};
}
export async function cloneEvidence(output,recipe,client,image,context,signal){
 const {budget}=context,scope=imageScope(image,output,client,context),algorithm=recipe.params.algorithm,methodKey=(algorithm==='SIFT + G2NN + RANSAC'?SIFT_SOURCE:algorithm)??recipe.params.variant??(recipe.operation==='m2.forgeryscope'?'Forgeryscope Auto':recipe.operation==='ai.clones.d2prl'?'D2PRL':recipe.operation);let owned,evidencePreparation=scope?.policy;
 if(algorithm==='EfficientLoFTR'&&(output.data?.metadata?.algorithm!=='EfficientLoFTR'||output.data.compare!==true||!Array.isArray(output.data.regions)||output.data.regions.length!==2))throw Object.assign(Error('Les preuves EfficientLoFTR doivent provenir de la comparaison réelle de deux rectangles.'),{code:'BATCH_EVIDENCE_INVALID'});
 if(recipe.kind==='automatic')return {entries:(output.data?.entries??[]).filter(e=>CLONE_SOURCES.includes(e.source)).map(e=>({...e,methodKey:e.source})),evidencePreparation,release(){}};
 if(algorithm==='SSG'){
  const d=output.data;
  if(d?.metadata?.completeDetector!==true||d.params?.algorithm!=='SSG'||d.width!==image.width||d.height!==image.height||!(d.mask instanceof Uint8Array)||d.mask.length!==image.width*image.height)throw Object.assign(Error('Le masque localisé du détecteur SSG complet est absent ou ses coordonnées diffèrent de l’image.'),{code:'BATCH_EVIDENCE_INVALID'});
  const raw={byteLength:d.mask.byteLength,readInto(destination,offset){destination.set(d.mask.subarray(offset,offset+destination.length));return destination;}},mask=scopedMaskStore(raw,scope,{width:image.width,height:image.height,budget,signal});
  owned=await streamedD2prlRegions({width:image.width,height:image.height,mask,minimum:0},{budget,signal});
  owned.entries=owned.entries.map(entry=>({...entry,id:'ssg-'+entry.id.slice(6),source:SIFT_SOURCE,label:'SSG',search_context:'ssg-full-localization',provenance:{method:'SSG',coordinates:'original-image-pixels',original_shape:[image.height,image.width],evidence:'SSIM-and-ROI-localization',scientificDefinitions:d.metadata.scientificDefinitions}}));
 }else if(recipe.operation==='ai.clones.d2prl'||recipe.operation==='ai.clones.segmentation'){
  const mask=output.maskSurfaces?.mask??output.maskSurfaces?.union;
  if(!mask)throw Error('Le masque scientifique D2PRL est absent.');
  owned=await streamedD2prlRegions({width:image.width,height:image.height,mask:await maskStore(client,mask,image.width,image.height,scope,budget,signal),minimum:recipe.operation==='ai.clones.segmentation'?0:recipe.params.minimum??500},{budget,signal});
 }else if(recipe.operation==='m2.forgeryscope'){
  const original=batchForgeryscopeMetadata(output.data),scoped=original.scientific_scope||original.zones.some(zone=>zone.scientific_scope),metadata=scopedForgeryscopeMetadata(original,{scope,width:image.width,height:image.height,sourceSha256:scope?.policy.sourceSha256??(scoped?sourceIdentity(image,output,client):undefined)});evidencePreparation=metadata.evidencePreparation??evidencePreparation;
  owned=await forgeryscopeEntries({metadata},{budget,low:0,signal});
 }else if(output.data?.pairs&&output.data?.groups){
  const combined=output.operation==='tampering.copyMove.dense'&&Array.isArray(output.data.group_algorithms);
  owned=await automaticPointEntries(output.data,{budget,geometry:{biomeSides},source:combined?null:SIFT_SOURCE,low:0,signal});
  if(combined)return {...owned,evidencePreparation,entries:owned.entries.map(e=>({...e,methodKey:e.source}))};
 }else if(output.data?.matches&&output.data?.groupLengths){
  const d=output.data,kernel=await createCloneEntryGeometry({budget,signal}),entries=[],leases=[];let offset=0;
  try{for(const [group,length]of Array.from(d.groupLengths).entries()){
   check(signal);const a=[],b=[];for(let j=0;j<length;j++){const row=d.groupIndices[offset+j],left=d.matches[row*3],right=d.matches[row*3+1];a.push([d.points[left*7],d.points[left*7+1]]);b.push([d.points[right*7],d.points[right*7+1]]);}offset+=length;
   if(length<(recipe.params.minimum??5))continue;const entry=await kernel.entry(SIFT_SOURCE,[a,b],length,{group},{signal});if(entry){entries.push(entry.entry);leases.push(entry.release);}
  }owned={entries,release(){for(const free of leases)free();}};
  }finally{kernel.dispose();}
 }else throw Error('Sortie de clones non reconnue : aucun signalement inventé.');
 return {...owned,evidencePreparation,entries:owned.entries.map(e=>({...e,methodKey}))};
}
export async function mapEvidence(output,recipe,client,image,signal){
 if((output.operation==='m2.trufor'&&output.data?.metadata?.fragmented)||(output.operation==='jpeg.comprint'&&output.metrics?.sourceRegionPolicy==='native-comprint-contexts-global-statistics'))return nativeContextMapEvidence(output,recipe,client,image,{scope:imageScope(image,output,client),signal});
 if(output?.operation==='m2.catnet'&&output.data?.metadata?.fragmented)return catnetNativeMapEvidence(output,recipe,client,image,{scope:imageScope(image,output,client),signal});
 const map=output.surface??output.planeSurfaces?.map;
 if(!map&&!output.m2Result?.fields?.map)throw Error('Carte scientifique absente.');
 const scope=imageScope(image,output,client),threshold=Number(recipe.signal.threshold),minimum=Number(recipe.signal.minimumPixels);let pixels=0,max=0,eligiblePixels=0,rawPixels=0,rawMaximum=0,left=image.width,top=image.height,right=-1,bottom=-1;
 if(!Number.isFinite(threshold)||threshold<0||threshold>1||!Number.isSafeInteger(minimum)||minimum<1)throw Error('Seuil de carte ou surface minimale invalide.');
 for(let y=0;y<image.height;y+=32){check(signal);const rows=Math.min(32,image.height-y),values=await client.readScalar(map,{x:0,y,width:image.width,height:rows},'map');
  if(values.length!==image.width*rows)throw invalid('Les dimensions de la carte diffèrent de l’image originale.');const eligible=scope?.readRows(y,rows,{signal});
  try{for(let i=0;i<values.length;i++){if(!Number.isFinite(values[i]))throw Error('Valeur non finie dans la carte.');rawMaximum=Math.max(rawMaximum,values[i]);if(values[i]>=threshold)rawPixels++;if(eligible&&!eligible.data[i])continue;eligiblePixels++;max=Math.max(max,values[i]);if(values[i]>=threshold){pixels++;const x=i%image.width,yy=y+Math.floor(i/image.width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,yy);bottom=Math.max(bottom,yy);}}}finally{eligible?.release();}
 }
 return {positive:pixels>=minimum,pixels,maximum:max,threshold,minimumPixels:minimum,...(recipe.operation==='m2.rita'?{scoreMeaning:'uncalibrated-class-margin',defaultThreshold:.5}:{}),...(scope?{evidencePreparation:{...scope.policy,filtered:true,eligiblePixels,excludedPixels:image.width*image.height-eligiblePixels,rawPositivePixels:rawPixels,rawMaximum}}:{}),regions:right>=0?[{bbox:[left,top,right-left+1,bottom-top+1],kind:'threshold-envelope',note:'Enveloppe des pixels admis dépassant le seuil ; ce rectangle ne représente pas un masque plein.'}]:[]};
}
export function regionEvidence(output,recipe){
 const regions=output.data?.regions??output.data?.metadata?.regions??[];
 const inconclusive=!!output.data?.metadata?.inconclusive;
 return {positive:regions.length>0&&!inconclusive,inconclusive,regions:compactEvidence(regions),descriptive:recipe.kind==='ela'};
}
