import {validateFeatureCatalog,normalizeFeatureState,selectedFeatureIds,featureIdsForTask,featureStateChange,featureDeletionPlan} from './feature-catalog.js?v=0.19.0';

export function createFeaturePolicy({storage=globalThis.localStorage,eventTarget=globalThis.window,persist,local=false,catalog={schema:'sherloq.features/1',groups:[],features:[]},state}={}){
 let current=catalog,mode=local,policy=normalizeFeatureState(state),save=persist;
 const key='sherloq.local.feature-policy';
 if(state===undefined)try{const raw=storage?.getItem(key);if(raw)policy=normalizeFeatureState(JSON.parse(raw));}catch(error){throw Object.assign(Error('Feature choices need recovery; the original was preserved.',{cause:error}),{code:'FEATURE_POLICY_RECOVERY_REQUIRED'});}
 const active=()=>selectedFeatureIds(current,policy),ids=task=>featureIdsForTask(task,current),available=task=>!mode||!ids(task).length||ids(task).some(id=>active().has(id));
 async function commit(next){
  if(!mode)throw Error('Feature management is reserved for local installations');
  const previous=policy;await save?.(structuredClone(next));
  try{storage?.setItem(key,JSON.stringify(next));}catch(error){await save?.(previous);throw error;}
  policy=next;eventTarget?.dispatchEvent(new Event('local-feature-change'));return structuredClone(policy);
 }
 return {
  get catalog(){return current;},get state(){return structuredClone(policy);},get local(){return mode;},
  configure({catalog:next=current,state:nextState=policy,local:nextLocal=mode,persist:nextPersist=save}={}){validateFeatureCatalog(next);current=next;policy=normalizeFeatureState(nextState);mode=nextLocal;save=nextPersist;eventTarget?.dispatchEvent(new Event('local-feature-change'));return this;},
  snapshot(){return structuredClone(policy);},
  list(){const selected=active();return current.features.filter(feature=>!feature.internal).map(feature=>({...feature,enabled:!mode||selected.has(feature.id),explicitlyDisabled:policy.disabledFeatures.includes(feature.id),groupDisabled:policy.disabledGroups.includes(feature.group)}));},
  isTaskAvailable:available,
  isToolAvailable(id){if(id==='ai.clones.d2prl')return !mode||current.features.some(feature=>active().has(feature.id)&&feature.tasks.some(task=>['ai.clones.d2prl','ai.clones.segmentation','m2.forgeryscope'].includes(task.operation)));return available({operation:id});},
  assertTaskAvailable(task){if(!available(task))throw Object.assign(Error('Cette fonction a été désinstallée. Réinstallez-la dans les réglages locaux.'),{code:'FEATURE_UNINSTALLED',details:{operation:task.operation,features:ids(task),scientificResult:false}});return task;},
  automaticExcludedFeatures(){if(!mode)return [];return [{operation:'ai.clones.d2prl'},{operation:'m2.forgeryscope',params:{profile:'auto'}}].filter(task=>!available(task)).map(task=>task.operation);},
  automaticExcludedJobs(){if(!mode)return [];return [['d2prl',{operation:'ai.clones.d2prl'}],['forgeryscope',{operation:'m2.forgeryscope',params:{profile:'auto'}}]].filter(([,task])=>!available(task)).map(([id])=>id);},
  planDisable(targets,manifest,options){return featureDeletionPlan(current,manifest,policy,targets,options);},
  disable(targets){return commit(featureStateChange(current,policy,targets,false));},
  enable(targets){return commit(featureStateChange(current,policy,targets,true));}
 };
}
// Online pages never read local exclusions. Local initialization supplies the
// catalogue and policy belonging to the activated release before mounting UI.
export const localFeaturePolicy=createFeaturePolicy({storage:null});
