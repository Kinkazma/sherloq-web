import {Budget} from './unified-engine/src/cache.js';
import {createCloneCorroboration} from './unified-engine/src/clone-corroboration.js';
import {automaticPointEntries} from './unified-engine/src/automatic-point-entries.js';
import {biomeSides} from './unified-engine/src/copy-geometry.js';
import {createCloneEntryGeometry} from './unified-engine/src/clone-entry-geometry.js';
import {streamedD2prlRegions} from './unified-engine/src/d2prl-regions-stream.js';
import {forgeryscopeEntries} from './unified-engine/src/automatic-ai-entries.js';
import {SIFT_SOURCE,CLONE_SOURCES} from './unified-engine/src/clone-relations.js';

const check=signal=>signal?.throwIfAborted();
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
export function evidenceContext(){
 const budget=new Budget(256*1024**2),composer=createCloneCorroboration({budget});
 return {budget,async maximum(entries,width,height,signal){
  if(!entries.length)return 0;let maximum=0;
  // One vote per algorithm, regardless of the number of zones/search contexts.
  const normalized=entries.map(e=>({...e,source:SIFT_SOURCE,search_context:e.methodKey??e.source}));
  await composer.stripes({entries:normalized,width,height,byContext:true},strip=>{for(const value of strip.values)maximum=Math.max(maximum,value);},{signal});return maximum;
 },dispose(){composer.dispose();}};
}
async function maskStore(client,descriptor,width,height){
 return {byteLength:width*height,async readInto(destination,offset){
  let at=0;while(at<destination.length){const pos=offset+at,x=pos%width,y=Math.floor(pos/width),length=Math.min(destination.length-at,width-x);const values=await client.readScalar(descriptor,{x,y,width:length,height:1},'mask');for(let i=0;i<length;i++)destination[at+i]=values[i]?1:0;at+=length;}return destination;
 }};
}
export async function cloneEvidence(output,recipe,client,image,context,signal){
 const {budget}=context,algorithm=recipe.params.algorithm,methodKey=(algorithm==='SIFT + G2NN + RANSAC'?SIFT_SOURCE:algorithm)??recipe.params.variant??(recipe.operation==='m2.forgeryscope'?'Forgeryscope Auto':recipe.operation==='ai.clones.d2prl'?'D2PRL':recipe.operation);let owned;
 if(algorithm==='EfficientLoFTR'&&(output.data?.metadata?.algorithm!=='EfficientLoFTR'||output.data.compare!==true||!Array.isArray(output.data.regions)||output.data.regions.length!==2))throw Object.assign(Error('Les preuves EfficientLoFTR doivent provenir de la comparaison réelle de deux rectangles.'),{code:'BATCH_EVIDENCE_INVALID'});
 if(recipe.kind==='automatic')return {entries:(output.data?.entries??[]).filter(e=>CLONE_SOURCES.includes(e.source)).map(e=>({...e,methodKey:e.source})),release(){}};
 if(recipe.operation==='ai.clones.d2prl'||recipe.operation==='ai.clones.segmentation'){
  const mask=output.maskSurfaces?.mask??output.maskSurfaces?.union;
  if(!mask)throw Error('Le masque scientifique D2PRL est absent.');
  owned=await streamedD2prlRegions({width:image.width,height:image.height,mask:await maskStore(client,mask,image.width,image.height),minimum:recipe.operation==='ai.clones.segmentation'?0:recipe.params.minimum??500},{budget,signal});
 }else if(recipe.operation==='m2.forgeryscope'){
  owned=await forgeryscopeEntries({metadata:batchForgeryscopeMetadata(output.data)},{budget,low:0,signal});
 }else if(output.data?.pairs&&output.data?.groups){
  const combined=output.operation==='tampering.copyMove.dense'&&Array.isArray(output.data.group_algorithms);
  owned=await automaticPointEntries(output.data,{budget,geometry:{biomeSides},source:combined?null:SIFT_SOURCE,low:0,signal});
  if(combined)return {...owned,entries:owned.entries.map(e=>({...e,methodKey:e.source}))};
 }else if(output.data?.matches&&output.data?.groupLengths){
  const d=output.data,kernel=await createCloneEntryGeometry({budget,signal}),entries=[],leases=[];let offset=0;
  try{for(const [group,length]of Array.from(d.groupLengths).entries()){
   check(signal);const a=[],b=[];for(let j=0;j<length;j++){const row=d.groupIndices[offset+j],left=d.matches[row*3],right=d.matches[row*3+1];a.push([d.points[left*7],d.points[left*7+1]]);b.push([d.points[right*7],d.points[right*7+1]]);}offset+=length;
   if(length<(recipe.params.minimum??5))continue;const entry=await kernel.entry(SIFT_SOURCE,[a,b],length,{group},{signal});if(entry){entries.push(entry.entry);leases.push(entry.release);}
  }owned={entries,release(){for(const free of leases)free();}};
  }finally{kernel.dispose();}
 }else throw Error('Sortie de clones non reconnue : aucun signalement inventé.');
 return {...owned,entries:owned.entries.map(e=>({...e,methodKey}))};
}
export async function mapEvidence(output,recipe,client,image,signal){
 const map=output.surface??output.planeSurfaces?.map;
 if(!map&&!output.m2Result?.fields?.map)throw Error('Carte scientifique absente.');
 const threshold=Number(recipe.signal.threshold),minimum=Number(recipe.signal.minimumPixels);let pixels=0,max=0,left=image.width,top=image.height,right=-1,bottom=-1;
 if(!Number.isFinite(threshold)||threshold<0||threshold>1||!Number.isSafeInteger(minimum)||minimum<1)throw Error('Seuil de carte ou surface minimale invalide.');
 for(let y=0;y<image.height;y+=32){check(signal);const rows=Math.min(32,image.height-y),values=await client.readScalar(map,{x:0,y,width:image.width,height:rows},'map');
  for(let i=0;i<values.length;i++){if(!Number.isFinite(values[i]))throw Error('Valeur non finie dans la carte.');max=Math.max(max,values[i]);if(values[i]>=threshold){pixels++;const x=i%image.width,yy=y+Math.floor(i/image.width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,yy);bottom=Math.max(bottom,yy);}}
 }
 return {positive:pixels>=minimum,pixels,maximum:max,threshold,minimumPixels:minimum,regions:right>=0?[{bbox:[left,top,right-left+1,bottom-top+1],kind:'threshold-envelope',note:'Enveloppe des pixels dépassant le seuil ; ce rectangle ne représente pas un masque plein.'}]:[]};
}
export function regionEvidence(output,recipe){
 const regions=output.data?.regions??output.data?.metadata?.regions??[];
 const inconclusive=!!output.data?.metadata?.inconclusive;
 return {positive:regions.length>0&&!inconclusive,inconclusive,regions:compactEvidence(regions),descriptive:recipe.kind==='ela'};
}
