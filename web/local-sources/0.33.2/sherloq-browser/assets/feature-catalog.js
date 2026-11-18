// A release owns this graph. Resource paths identify files in its immutable
// dependency manifest; sizes and content identities always come from that manifest.
const idPattern=/^[a-z0-9][a-z0-9._-]{0,120}$/;
export function validateFeatureCatalog(catalog,manifest){
 if(catalog?.schema!=='sherloq.features/1'||!Array.isArray(catalog.features)||!Array.isArray(catalog.groups))throw Error('Invalid feature catalogue');
 const groups=new Set(),features=new Map();
 for(const group of catalog.groups){if(!idPattern.test(group.id)||groups.has(group.id)||typeof group.fr!=='string'||typeof group.en!=='string')throw Error('Invalid feature group');groups.add(group.id);}
 for(const feature of catalog.features){
  if(!idPattern.test(feature.id)||features.has(feature.id)||typeof feature.fr!=='string'||typeof feature.en!=='string'||typeof feature.protected!=='boolean'||feature.group!==null&&!groups.has(feature.group)||!Array.isArray(feature.resources)||!Array.isArray(feature.dependsOn)||!Array.isArray(feature.tasks))throw Error('Invalid feature descriptor');
  if(feature.resources.some(path=>typeof path!=='string'||path.split('/').some(part=>!part||part==='.'||part==='..')||/[\\?#%\x00-\x20]/.test(path)||manifest&&!Object.hasOwn(manifest.files,path)))throw Error('Unknown feature resource');
  if(feature.tasks.some(task=>!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/.test(task.operation)||task.params&&(!task.params||typeof task.params!=='object'||Array.isArray(task.params)||Object.values(task.params).some(value=>!['string','boolean','number'].includes(typeof value)))))throw Error('Invalid feature task');
  features.set(feature.id,feature);
 }
 const visiting=new Set(),visited=new Set();
 function visit(id){if(visiting.has(id))throw Error('Cyclic feature dependencies');if(visited.has(id))return;const feature=features.get(id);if(!feature)throw Error('Unknown feature dependency');visiting.add(id);for(const dependency of feature.dependsOn)visit(dependency);visiting.delete(id);visited.add(id);}
 for(const id of features.keys())visit(id);
 function protect(id){const feature=features.get(id);for(const dependency of feature.dependsOn){const target=features.get(dependency);if(!target.protected&&!target.internal)throw Error('Protected core cannot require an optional uninstallable feature');protect(dependency);}}
 for(const feature of features.values())if(feature.protected)protect(feature.id);
 if(manifest){const covered=new Set(catalog.features.flatMap(feature=>feature.resources));if(Object.keys(manifest.files).some(path=>!covered.has(path)))throw Error('Dependency manifest is not fully covered by the feature catalogue');}
 return catalog;
}
export function normalizeFeatureState(state={}){
 if(state.schema!==undefined&&state.schema!=='sherloq.feature-policy/1')throw Error('Unsupported feature policy');
 const list=value=>{if(value===undefined)return [];if(!Array.isArray(value)||value.some(id=>!idPattern.test(id)))throw Error('Invalid feature exclusions');return [...new Set(value)].sort();};
 // Unknown identifiers are intentional choices too: retain them across releases.
 return {schema:'sherloq.feature-policy/1',disabledFeatures:list(state.disabledFeatures),disabledGroups:list(state.disabledGroups)};
}
export function recoverFeatureState(state){
 if(!state||typeof state!=='object'||Array.isArray(state)||state.schema&&state.schema!=='sherloq.feature-policy/1')throw Error('Unsupported feature policy recovery');
 const issues=[],value={schema:'sherloq.feature-policy/1'};
 for(const key of ['disabledFeatures','disabledGroups']){
  const input=state[key];if(input===undefined){value[key]=[];continue;}if(!Array.isArray(input))throw Error('Feature exclusions need recovery from a backup');
  value[key]=input.filter((id,index)=>{if(idPattern.test(id)&&typeof id==='string')return true;issues.push({path:key+'.'+index,kind:'incompatible',message:'Preserved in recovery backup'});return false;});
 }
 return {value:normalizeFeatureState(value),issues};
}
export function selectedFeatureIds(catalog,state={}){
 const policy=normalizeFeatureState(state),off=new Set(policy.disabledFeatures),groups=new Set(policy.disabledGroups),map=new Map(catalog.features.map(feature=>[feature.id,feature])),chosen=new Set();
 const enabled=(feature,trail=new Set())=>{if(feature.protected)return true;if(off.has(feature.id)||feature.group&&groups.has(feature.group))return false;if(trail.has(feature.id))throw Error('Cyclic feature dependencies');const next=new Set(trail).add(feature.id);return feature.dependsOn.every(id=>{const dependency=map.get(id);if(!dependency)throw Error('Unknown feature dependency');return enabled(dependency,next);});};
 function add(feature){if(chosen.has(feature.id))return;chosen.add(feature.id);for(const id of feature.dependsOn)add(map.get(id));}
 for(const feature of catalog.features)if(feature.protected||!feature.internal&&enabled(feature))add(feature);
 return chosen;
}
export function selectActiveFiles(catalog,state={}){
 const selected=selectedFeatureIds(catalog,state);return new Set(catalog.features.filter(feature=>selected.has(feature.id)).flatMap(feature=>feature.resources));
}
export function requiredFeatureChunks(catalog,manifest,state={}){
 const chunks=new Map();for(const path of selectActiveFiles(catalog,state)){const file=manifest.files[path];if(!file)throw Error('Unknown feature resource: '+path);if(file.localOnly)continue;for(const hash of file.chunks)chunks.set(hash,manifest.chunks[hash]);}return chunks;
}
export function featureIdsForTask(task,catalog){
 const descriptors=catalog.features.filter(feature=>feature.tasks.some(match=>match.operation===task.operation&&Object.entries(match.params??{}).every(([key,value])=>task.params?.[key]===value)));
 // Most specific match wins; a protected container must not bypass an optional submode.
 const specificity=feature=>Math.max(...feature.tasks.filter(match=>match.operation===task.operation&&Object.entries(match.params??{}).every(([key,value])=>task.params?.[key]===value)).map(match=>Object.keys(match.params??{}).length));
 const maximum=Math.max(-1,...descriptors.map(specificity));return descriptors.filter(feature=>specificity(feature)===maximum).map(feature=>feature.id);
}
export function featureStateChange(catalog,state,ids,enabled){
 const next=normalizeFeatureState(state),features=new Map(catalog.features.map(feature=>[feature.id,feature]));
 if(!Array.isArray(ids)||!ids.length)throw Error('Choose at least one feature');
 for(const target of ids){
  const group=target.startsWith('group:')?target.slice(6):null;
  if(group){if(!catalog.groups.some(value=>value.id===group))throw Error('Unknown feature group');if(catalog.features.some(feature=>feature.group===group&&feature.protected))throw Error('Protected feature group');const set=new Set(next.disabledGroups);enabled?set.delete(group):set.add(group);next.disabledGroups=[...set].sort();}
  else{const feature=features.get(target);if(!feature)throw Error('Unknown feature');if(feature.protected||feature.internal)throw Error('Protected feature');const set=new Set(next.disabledFeatures);enabled?set.delete(target):set.add(target);next.disabledFeatures=[...set].sort();}
 }
 return next;
}
export function featureDeletionPlan(catalog,manifest,state,ids,{presentChunks=[]}={}){
 const next=featureStateChange(catalog,state,ids,false),before=selectActiveFiles(catalog,state),after=selectActiveFiles(catalog,next),retained=new Set(),removed=new Set(),candidate=new Set();
 for(const path of after)for(const hash of manifest.files[path].chunks)retained.add(hash);
 const beforeIds=selectedFeatureIds(catalog,state),afterIds=selectedFeatureIds(catalog,next),map=new Map(catalog.features.map(feature=>[feature.id,feature])),seen=new Set();
 function candidates(feature){if(seen.has(feature.id))return;seen.add(feature.id);for(const path of feature.resources)for(const hash of manifest.files[path].chunks)candidate.add(hash);for(const id of feature.dependsOn)candidates(map.get(id));}
 for(const feature of catalog.features)if(beforeIds.has(feature.id)&&!afterIds.has(feature.id))candidates(feature);
 const paths=[...before].filter(path=>!after.has(path));for(const path of paths)for(const hash of manifest.files[path].chunks){candidate.add(hash);if(!retained.has(hash))removed.add(hash);}
 const present=new Set(presentChunks instanceof Map?presentChunks.keys():presentChunks),bytes=hashes=>[...hashes].reduce((total,hash)=>total+(manifest.chunks[hash]??0),0);
 const removable=[...removed].filter(hash=>present.has(hash)),shared=[...candidate].filter(hash=>retained.has(hash)),allBefore=new Set([...before].flatMap(path=>manifest.files[path].chunks));
 return {state:next,paths,chunks:[...removed],presentChunks:removable,removableBytes:bytes(removable),potentialBytes:bytes(removed),retainedSharedBytes:bytes(shared),retainedSharedPresentBytes:bytes(shared.filter(hash=>present.has(hash))),presentBytes:bytes([...allBefore].filter(hash=>present.has(hash))),archiveBytesFreed:0};
}
