import {AdaptiveRuntimeHistory,ADAPTIVE_SCHEMA,validateAdaptiveState,backendScope} from './unified-engine/src/adaptive-runtime.js';
export const ADAPTIVE_STORAGE_KEY='sherloq.adaptive-runtime';
export const ADAPTIVE_MACHINE_KEY='sherloq.adaptive-machine';
const recoveryKey='sherloq.recovery.adaptive-runtime.original';
// Machine is an opaque random installation id, not a hardware fingerprint. It
// is never exported as an authority token and is never imported from settings.
export function createAdaptivePreferenceStore({storage,crypto=globalThis.crypto,clock=()=>Date.now(),randomId=()=>crypto.randomUUID()}={}){
 let machine,initial,storageError=null;
 try{if(storage===undefined)storage=globalThis.localStorage;}catch(error){storageError=error;}
 try{machine=storage?.getItem(ADAPTIVE_MACHINE_KEY);if(typeof machine!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(machine)){machine=randomId();storage?.setItem(ADAPTIVE_MACHINE_KEY,machine);}}
 catch(error){storageError=error;}
 machine??=randomId();
 try{const raw=storage?.getItem(ADAPTIVE_STORAGE_KEY);if(raw!==null&&raw!==undefined){try{initial=validateAdaptiveState(JSON.parse(raw));}catch(error){storageError=error;try{if(storage?.getItem(recoveryKey)===null)storage.setItem(recoveryKey,raw);}catch{}}}}
 catch(error){storageError=error;}
 const history=new AdaptiveRuntimeHistory({machineId:machine,initial,clock,randomId});
 const save=()=>{try{storage?.setItem(ADAPTIVE_STORAGE_KEY,JSON.stringify(history.export()));return {persisted:!!storage};}catch(error){storageError=error;return {persisted:false,error};}};
 return {
  mode:scope=>history.mode(scope),hasMode:scope=>history.hasMode(scope),
  setModes(entries){if(!Array.isArray(entries)||entries.length>512)throw new TypeError('Invalid backend preferences');for(const c of entries){history.mode(c.scope);if(!['auto','cpu','webgpu'].includes(c.mode))throw new TypeError('Invalid backend preference');}for(const c of entries)history.setMode(c.scope,c.mode);return save();},
  setMode(scope,mode){history.setMode(scope,mode);return save();},
  observe(receipt){const out=history.observe(receipt);return out.recorded?{...out,...save()}:out;},
  recommend:request=>history.recommend(request),
  exportSettings(){return history.export();},
  importSettings(data){const out=history.import(data);return {...out,...save()};},
  snapshot:()=>history.export(),
  diagnostics:()=>({schema:ADAPTIVE_SCHEMA,bytes:history.serializedBytes(),storageAvailable:!!storage,lastStorageError:storageError?.name??null}),
 };
}
export function foreignAdaptiveSettings(input){const data=validateAdaptiveState(input);return {...data,machine:'imported-profile',runs:[],foreign:[...data.foreign,...data.runs.map(run=>({origin:data.machine,importedAt:run.at,run}))].slice(-64)};}
let singleton;
export function getAdaptivePreferenceStore(){return singleton??=createAdaptivePreferenceStore();}

export function importAdaptiveSettings(value,store=getAdaptivePreferenceStore()){
 if(value?.adaptiveRuntime)return store.importSettings(value.adaptiveRuntime);
 const tools=value?.schema==='sherloq.workspace/1'?Object.values(value.tools??{}):[value];
 const choices=tools.flatMap(v=>v?.individual?.uiOptions?.backendChoices??[]);
 const unique=new Map();for(const c of choices){const scope=backendScope(c.tool,c.method);if(!['auto','cpu','webgpu'].includes(c.mode))throw new TypeError('Invalid backend preference');unique.set(scope,{scope,mode:c.mode});}
 return store.setModes([...unique.values()]);
}
