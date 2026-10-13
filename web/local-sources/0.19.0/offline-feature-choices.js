import {validateFeatureCatalog,normalizeFeatureState,selectedFeatureIds,selectActiveFiles,featureStateChange} from './feature-catalog.js?v=0.19.0';

const bytesText=(bytes,language)=>{if(bytes<1000)return bytes+(language==='fr'?' o':' B');const unit=bytes>=1_000_000_000?1_000_000_000:1_000_000;return new Intl.NumberFormat(language,{maximumFractionDigits:1}).format(bytes/unit)+(unit===1_000_000_000?' Go':' Mo');};
function featureResources(plan,ids){
 const features=new Map(plan.catalog.features.map(feature=>[feature.id,feature])),visited=new Set(),paths=new Set();
 function visit(id){if(visited.has(id))return;visited.add(id);const feature=features.get(id);if(!feature)throw Error('Unknown installation feature');for(const path of feature.resources)paths.add(path);for(const dependency of feature.dependsOn)visit(dependency);}
 for(const id of ids)visit(id);return {ids:visited,paths};
}
export function offlineFeatureVolumes(plan,{featureIds,verifiedPresentChunks=null}={}){
 validateFeatureCatalog(plan.catalog,plan.manifest);const state=normalizeFeatureState(plan.featurePolicy),files=featureIds?featureResources(plan,featureIds).paths:selectActiveFiles(plan.catalog,state),publicChunks=new Map(),localChunks=new Map();
 for(const path of files){const file=plan.manifest.files[path],chunks=file.localOnly?localChunks:publicChunks;for(const hash of file.chunks)chunks.set(hash,plan.manifest.chunks[hash]);}
 const sum=chunks=>[...chunks.values()].reduce((total,bytes)=>total+bytes,0),present=verifiedPresentChunks===null?null:new Set(verifiedPresentChunks instanceof Map?verifiedPresentChunks.keys():verifiedPresentChunks),presentBytes=present?[...publicChunks].filter(([hash])=>present.has(hash)).reduce((total,[,size])=>total+size,0):null;
 const localOnlyPresentBytes=present?[...localChunks].filter(([hash])=>present.has(hash)).reduce((total,[,size])=>total+size,0):null;
 return {publicBytes:sum(publicChunks),localOnlyBytes:sum(localChunks),presentBytes,remainingBytes:presentBytes===null?null:sum(publicChunks)-presentBytes,localOnlyPresentBytes,localOnlyRemainingBytes:localOnlyPresentBytes===null?null:sum(localChunks)-localOnlyPresentBytes,publicChunks};
}

// The managed Python inventory verifies archive/object bodies before listing
// their hashes. Reading that proof must not copy the TAR into browser storage.
export async function offlineServerPresentChunks(plan,verifiedCacheChunks,{fetcher=globalThis.fetch}={}){
 const verified=new Set(verifiedCacheChunks);
 if(!plan.local||plan.config?.offlineMode!=='archive')return verified;
 try{
  const response=await fetcher(new URL('__managed/inventory',plan.appBase),{credentials:'omit'});
  if(!response.ok)return null;
  const inventory=await response.json();
  // A native read-only inventory describes locations; their SHA is checked
  // only when read. Keep presence unknown until that verification occurs.
  if(inventory.verification==='verified-on-read'||!plan.config.managedStorage)return null;
  if(!Array.isArray(inventory.presentChunks))return null;
  for(const hash of inventory.presentChunks)if(typeof hash==='string'&&Object.hasOwn(plan.manifest.chunks,hash))verified.add(hash);
  return verified;
 }catch{return null;}
}

// Installation choices belong to the candidate plan. This renderer never reads
// or writes the running application's policy, localStorage or IndexedDB.
export function renderOfflineFeatureChoices(document,container,{getPlan,onChange=()=>{},getPresentChunks=()=>null,language=()=>document.documentElement.lang==='en'?'en':'fr',locked=()=>false,onError=()=>{}}={}){
 let plan,state=normalizeFeatureState(),incomingSignature='',presencePromise,verified=null,renderEpoch=0,changing=false,disposed=false;
 const t=(fr,en)=>language()==='fr'?fr:en,el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
 container.classList.add('offline-feature-choices');
 if(!document.getElementById('offline-feature-choices-style')){const link=el('link');link.id='offline-feature-choices-style';link.rel='stylesheet';link.href=new URL('offline-feature-choices.css',import.meta.url).href;document.head?.append(link);}
 function receive(next,{force=false}={}){if(!next)return;const policy=normalizeFeatureState(next.featurePolicy),signature=JSON.stringify(policy);if(force||next!==plan){presencePromise=null;verified=null;state=policy;}else if(signature!==incomingSignature)state=policy;plan=next;incomingSignature=signature;}
 function effectivePlan(){return {...plan,featurePolicy:state};}
 async function change(target,enabled){if(locked()||changing)return;const previous=state;changing=true;setLocked(true);
  try{state=featureStateChange(plan.catalog,state,[target],enabled);await onChange(structuredClone(state));await render();}
  catch(error){state=previous;onError(error);await render();}
  finally{changing=false;setLocked(locked());}
 }
 function checkbox(target,labelText,{checked=false,protectedFeature=false,groupDisabled=false,indeterminate=false}={}){
  const label=el('label','offline-feature-choice'),input=el('input');input.type='checkbox';input.dataset.featureTarget=target;input.checked=checked;input.indeterminate=indeterminate;input.dataset.permanentDisabled=String(protectedFeature||groupDisabled);input.disabled=protectedFeature||groupDisabled||changing||locked();input.setAttribute('aria-label',labelText);input.onchange=()=>void change(target,input.checked);label.append(input,el('strong',null,labelText));return label;
 }
 function volumeLabel(volume){return t('Ressources publiques : ','Public resources: ')+bytesText(volume.publicBytes,language())+(volume.presentBytes===null?t(' · présence à vérifier',' · presence needs verification'):t(' · présentes ',' · present ')+bytesText(volume.presentBytes,language())+t(' · à recevoir ',' · to download ')+bytesText(volume.remainingBytes,language()))+(volume.localOnlyBytes?(volume.localOnlyPresentBytes===null?t(' · imports locaux à vérifier ',' · local imports to verify ')+bytesText(volume.localOnlyBytes,language()):t(' · imports présents ',' · present imports ')+bytesText(volume.localOnlyPresentBytes,language())+' / '+bytesText(volume.localOnlyBytes,language())+(volume.localOnlyRemainingBytes?t(' · à importer localement ',' · requires local import ')+bytesText(volume.localOnlyRemainingBytes,language()):'')):'');}
 function draw(){
  container.replaceChildren();if(!plan?.catalog){container.hidden=true;return;}container.hidden=false;validateFeatureCatalog(plan.catalog,plan.manifest);const selected=selectedFeatureIds(plan.catalog,state),visible=plan.catalog.features.filter(feature=>!feature.internal),candidate=effectivePlan(),summary=offlineFeatureVolumes(candidate,{verifiedPresentChunks:verified});
  container.append(el('h2',null,t('Choisir les fonctions à emporter','Choose functions to take offline')),el('p','offline-feature-note',t('Les outils protégés restent inclus. Décochez les fonctions lourdes dont vous n’avez pas besoin. Les choix de l’archive importée sont conservés jusqu’à une modification explicite. Les contenus partagés sont comptés une seule fois dans le total.','Protected tools stay included. Uncheck heavy functions you do not need. Imported archive choices stay in place until you explicitly change them. Shared contents are counted once in the total.')),el('p','offline-feature-total',volumeLabel(summary)));
  const groups=[...plan.catalog.groups,...(visible.some(feature=>feature.group===null)?[{id:null,fr:'Autres fonctions',en:'Other functions'}]:[])].sort((a,b)=>Number(visible.filter(feature=>feature.group===a.id).every(feature=>feature.protected))-Number(visible.filter(feature=>feature.group===b.id).every(feature=>feature.protected)));
  for(const group of groups){const features=visible.filter(feature=>feature.group===group.id);if(!features.length)continue;const protectedGroup=features.every(feature=>feature.protected),section=el(protectedGroup?'details':'section','offline-feature-group');
   if(protectedGroup)section.append(el('summary',null,group[language()]));else if(group.id!==null){const disabled=state.disabledGroups.includes(group.id),partial=!disabled&&features.some(feature=>!selected.has(feature.id));section.append(checkbox('group:'+group.id,group[language()],{checked:!disabled,indeterminate:partial}));}
   else section.append(el('h3',null,group[language()]));
   for(const feature of features){const row=el('div','offline-feature-row'),groupDisabled=!!feature.group&&state.disabledGroups.includes(feature.group),name=feature[language()],control=checkbox(feature.id,name,{checked:selected.has(feature.id),protectedFeature:feature.protected,groupDisabled}),footprint=offlineFeatureVolumes(candidate,{featureIds:[feature.id],verifiedPresentChunks:verified});row.append(control,el('small',null,volumeLabel(footprint)));
    const dependencies=[...featureResources(plan,[feature.id]).ids].filter(id=>id!==feature.id).map(id=>plan.catalog.features.find(item=>item.id===id)?.[language()]).filter(Boolean);if(dependencies.length)row.append(el('small','offline-feature-dependencies',t('Dépendances : ','Dependencies: ')+dependencies.join(', ')));
    if(feature.protected)row.append(el('small',null,t('Composant protégé','Protected component')));else if(groupDisabled)row.append(el('small',null,t('Groupe écarté ; réactivez le groupe pour modifier cette fonction.','Group excluded; reenable the group to change this function.')));
    section.append(row);
   }container.append(section);
  }
 }
 async function render(){if(disposed)return;receive(getPlan?.());const epoch=++renderEpoch;draw();if(!plan?.catalog)return;
  try{presencePromise??=Promise.resolve(getPresentChunks(plan));const present=await presencePromise;if(disposed||epoch!==renderEpoch)return;verified=present===undefined?null:present;draw();}
  catch(error){if(!disposed&&epoch===renderEpoch){verified=null;draw();onError(error);}}
 }
 function setLocked(value){for(const input of container.querySelectorAll('input[type=checkbox]'))input.disabled=!!value||input.dataset.permanentDisabled==='true';}
 const observer=typeof MutationObserver==='function'?new MutationObserver(()=>void render()):null;observer?.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 void render();
 return {render,state:()=>structuredClone(state),setPlan(next){receive(next,{force:true});return render();},setLocked,refreshPresence(){presencePromise=null;return render();},dispose(){disposed=true;observer?.disconnect();container.replaceChildren();}};
}
