import {defaultBackend} from './backend-mode-preferences.js?v=0.31.0';
import {toolFields} from './tool-catalog.js?v=0.31.0';
import {sparseViewDefaults,SPARSE_BIOME_METHODS} from './sparse-controls.js?v=0.31.0';
import {CLONE_ALGORITHMS,changeCloneAlgorithm,applyAlikedFinePreset} from './clone-methods.js?v=0.31.0';
export const CLONE_PROFILE_SCHEMA='sherloq.clone-profile/1';
export const CLONE_PROFILES_SCHEMA='sherloq.clone-profiles/1';
export const CLONE_PROFILE_TOOL='tampering.copyMove.sparse';
export const CLONE_BUILTIN_STANDARD='builtin:standard',CLONE_BUILTIN_FINE='builtin:small-copies';
const maximumProfiles=100,forbidden=new Set(['__proto__','constructor','prototype','regions','excluded','guides','selection','scientificScope','scope','image','images','source','sourceId','sourceSha256','file','reference','mask','database','training']);
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const scalar=x=>typeof x==='boolean'||typeof x==='string'&&x.length<=200||typeof x==='number'&&Number.isFinite(x);
const requireValue=(ok,message)=>{if(!ok)throw new Error(message);};
const clone=x=>structuredClone(x);
let parameterRules;
function validParameter(key,value){
 parameterRules??=new Map(toolFields(CLONE_PROFILE_TOOL).map(field=>[field.key,field]));const rule=parameterRules.get(key);
 requireValue(rule,'Unsupported clone profile parameter '+key+'.');
 if(rule.choices)requireValue(rule.choices.some(choice=>Object.is(choice.value,value)),'Invalid clone profile choice '+key+'.');
 if(typeof value==='number'){
  if(Number.isFinite(rule.min))requireValue(value>=rule.min,'Clone profile parameter below minimum: '+key+'.');
  if(Number.isFinite(rule.max))requireValue(value<=rule.max,'Clone profile parameter above maximum: '+key+'.');
  // The Native sparse point/inlier counts are integral. UI increments are not
  // precision constraints: distances and tolerances retain arbitrary values.
  if(['limit','geometricMinimum'].includes(key))requireValue(Number.isInteger(value),'Clone profile count/dimension must be integral: '+key+'.');
 }
}

function parameters(value,defaults,{portable=false}={}){
 requireValue(plain(value)&&plain(defaults),'Invalid clone profile parameters.');
 if(portable)for(const key of Object.keys(value))requireValue(!forbidden.has(key)&&Object.hasOwn(defaults,key),'Clone profile contains non-portable or unsupported parameters.');
 const out={};for(const [key,fallback]of Object.entries(defaults)){if(forbidden.has(key))continue;const v=Object.hasOwn(value,key)?value[key]:fallback;requireValue(scalar(v)&&typeof v===typeof fallback,'Invalid clone profile parameter '+key+'.');validParameter(key,v);out[key]=v;}
 requireValue(CLONE_ALGORITHMS.includes(out.algorithm),'Clone profile method is unavailable.');return out;
}
function presentation(value,defaults){
 requireValue(plain(value)&&plain(defaults),'Invalid clone profile view.');for(const key of Object.keys(value))requireValue(Object.hasOwn(defaults,key)&&!forbidden.has(key),'Unsupported clone profile presentation field.');
 const out={};for(const [key,fallback]of Object.entries(defaults)){const v=value[key]??fallback;requireValue(scalar(v)&&typeof v===typeof fallback,'Invalid clone profile view '+key+'.');out[key]=v;}
 requireValue(out.low>=0&&out.high>=out.low&&Number.isInteger(out.minimum)&&out.minimum>=1,'Invalid clone profile display interval.');
 for(const [key,minimum]of[['traceOverlap',0],['maxBiomeArea',1]])if(Object.hasOwn(out,key))requireValue(Number.isInteger(out[key])&&out[key]>=minimum&&out[key]<=100,'Invalid clone profile '+key+'.');
 if(Object.hasOwn(out,'circleScale'))requireValue(Number.isInteger(out.circleScale)&&out.circleScale>=1&&out.circleScale<=300&&(!Object.hasOwn(value,'circleScale')||typeof value.circleScale==='number'),'Invalid clone profile circleScale.');
 if(Object.hasOwn(out,'clipLinesToCircles'))requireValue(typeof out.clipLinesToCircles==='boolean'&&(!Object.hasOwn(value,'clipLinesToCircles')||typeof value.clipLinesToCircles==='boolean'),'Invalid clone profile clipLinesToCircles.');
 if(Object.hasOwn(out,'biomeMethod'))requireValue(SPARSE_BIOME_METHODS.includes(out.biomeMethod)&&(!Object.hasOwn(value,'biomeMethod')||typeof value.biomeMethod==='string'),'Invalid clone profile biomeMethod.');return out;
}
/** No source, file, ROI, exclusion or source identity is copied into a profile. */
export function captureCloneProfile({parameters:value,view,backend=defaultBackend(CLONE_PROFILE_TOOL,value),cloneWindowMode='independent'},{parameterDefaults,viewDefaults}={}){
 requireValue(['auto','cpu','webgpu'].includes(backend)&&['independent','global'].includes(cloneWindowMode),'Invalid clone profile backend or region mode.');
 return{schema:CLONE_PROFILE_SCHEMA,tool:CLONE_PROFILE_TOOL,parameters:parameters(value,parameterDefaults),view:presentation(view??viewDefaults,viewDefaults),backend,cloneWindowMode};
}
export function restoreCloneProfile(value,options){
 requireValue(plain(value)&&value.schema===CLONE_PROFILE_SCHEMA&&value.tool===CLONE_PROFILE_TOOL,'Unsupported clone profile version or tool.');
 for(const key of Object.keys(value))requireValue(['schema','tool','parameters','view','backend','cloneWindowMode'].includes(key),'Clone profile contains a non-portable field.');
 const out=captureCloneProfile(value,options);out.parameters=parameters(value.parameters,options.parameterDefaults,{portable:true});return out;
}
export const emptyCloneProfiles=()=>({schema:CLONE_PROFILES_SCHEMA,profiles:[],selectedId:null});
export function restoreCloneProfiles(value,options){
 const out=emptyCloneProfiles();if(!plain(value)||value.schema!==CLONE_PROFILES_SCHEMA||!Array.isArray(value.profiles))return out;
 const ids=new Set(),names=new Set();for(const entry of value.profiles.slice(0,maximumProfiles))try{
  requireValue(plain(entry)&&Object.keys(entry).every(k=>['id','name','snapshot'].includes(k))&&typeof entry.id==='string'&&/^user-[A-Za-z0-9_-]{1,96}$/.test(entry.id)&&!ids.has(entry.id),'Invalid clone profile ID.');
  const name=profileName(entry.name),key=name.toLowerCase();requireValue(!names.has(key),'Duplicate clone profile name.');const snapshot=restoreCloneProfile(entry.snapshot,options);ids.add(entry.id);names.add(key);out.profiles.push({id:entry.id,name,snapshot});
 }catch{/* An invalid imported profile never alters settings or source. */}
 if([CLONE_BUILTIN_STANDARD,CLONE_BUILTIN_FINE].includes(value.selectedId)||ids.has(value.selectedId))out.selectedId=value.selectedId;return out;
}
function profileName(value){requireValue(typeof value==='string','Name the clone profile.');const name=value.trim().normalize('NFC');requireValue(name.length>0&&name.length<=80&&!/[\u0000-\u001f\u007f]/.test(name),'Clone profile name must contain1 to 80 characters.');return name;}
export function saveCloneProfile(collection,name,snapshot,options,{makeId=()=> 'user-'+crypto.randomUUID()}={}){
 const store=restoreCloneProfiles(collection,options),valid=restoreCloneProfile(snapshot,options),label=profileName(name),existing=store.profiles.find(p=>p.name.toLowerCase()===label.toLowerCase());
 if(existing){existing.name=label;existing.snapshot=valid;store.selectedId=existing.id;return store;}
 requireValue(store.profiles.length<maximumProfiles,'The clone profile collection is full.');const id=makeId();requireValue(typeof id==='string'&&/^user-[A-Za-z0-9_-]{1,96}$/.test(id)&&!store.profiles.some(p=>p.id===id),'Invalid new clone profile ID.');store.profiles.push({id,name:label,snapshot:valid});store.selectedId=id;return store;
}
export function deleteCloneProfile(collection,id,options){const store=restoreCloneProfiles(collection,options);store.profiles=store.profiles.filter(p=>p.id!==id);if(store.selectedId===id)store.selectedId=null;return store;}
export function builtinCloneProfile(id,{algorithm,parameterDefaults,viewDefaults}){
 requireValue([CLONE_BUILTIN_STANDARD,CLONE_BUILTIN_FINE].includes(id),'Unknown built-in clone profile.');const p=clone(parameterDefaults),previous=p.algorithm;p.algorithm=id===CLONE_BUILTIN_FINE?(algorithm?.startsWith('ALIKED')?algorithm:'ALIKED'):algorithm;changeCloneAlgorithm(p,previous);
 if(id===CLONE_BUILTIN_FINE)applyAlikedFinePreset(p);return captureCloneProfile({parameters:p,view:clone(viewDefaults),backend:defaultBackend(CLONE_PROFILE_TOOL,p),cloneWindowMode:p.algorithm==='EfficientLoFTR'?'global':'independent'},{parameterDefaults,viewDefaults});
}
export function cloneProfileEquivalent(a,b){if(!a||!b)return false;const ordered=o=>Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)));return JSON.stringify({...a,parameters:ordered(a.parameters),view:ordered(a.view)})===JSON.stringify({...b,parameters:ordered(b.parameters),view:ordered(b.view)});}

/** Bounded import envelope for settings.js. Only this versioned subtree may
 * exceed the ordinary tool-settings depth; all other settings retain their
 * original validator. Workspace restoration then applies the current catalog. */
export function validateCloneProfilesTransport(value){
 requireValue(plain(value)&&value.schema===CLONE_PROFILES_SCHEMA&&Array.isArray(value.profiles)&&value.profiles.length<=maximumProfiles,'Invalid clone profile collection.');
 const profiles=[],ids=new Set(),names=new Set();for(const entry of value.profiles){
  requireValue(plain(entry)&&Object.keys(entry).every(k=>['id','name','snapshot'].includes(k))&&typeof entry.id==='string'&&/^user-[A-Za-z0-9_-]{1,96}$/.test(entry.id)&&!ids.has(entry.id),'Invalid clone profile identity.');
  const name=profileName(entry.name),key=name.toLowerCase(),raw=entry.snapshot?.parameters;requireValue(!names.has(key)&&plain(raw)&&Object.keys(raw).length<=64,'Invalid clone profile parameters.');for(const k of Object.keys(raw))requireValue(/^[a-zA-Z][a-zA-Z0-9.]*$/.test(k)&&!forbidden.has(k)&&scalar(raw[k]),'Non-portable clone profile parameter.');
  const snapshot=restoreCloneProfile(entry.snapshot,{parameterDefaults:raw,viewDefaults:sparseViewDefaults()});profiles.push({id:entry.id,name,snapshot});ids.add(entry.id);names.add(key);
 }
 const selectedId=value.selectedId??null;requireValue(selectedId===null||[CLONE_BUILTIN_STANDARD,CLONE_BUILTIN_FINE].includes(selectedId)||ids.has(selectedId),'Invalid selected clone profile.');return{schema:CLONE_PROFILES_SCHEMA,profiles,selectedId};
}
