import {recoverSettings,validParams} from './settings.js';
import {validateMediaPreferences,validateExportSettings,validateLoupeSettings} from './media-settings.js';
import {libraryValue} from './dependency-store.js';
import {AUTO_UPDATE_KEY,recoverAutoUpdatePreferences} from './local-auto-update.js';
import {getDocumentDownloadShelf} from './download-shelf.js';

const RECOVERY='sherloq.recovery.';
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
export const isPreferenceKey=key=>typeof key==='string'&&(/^sherloq\.(settings|workspace\.preferences|workspace\.tools|favorite|classicPreset|batch\.settings|feature-policy|local-feature-policy|featurePolicy|local\.feature-state|local\.feature-policy)$/.test(key)||key==='gd-iso-studio-theme'||key===AUTO_UPDATE_KEY);
const clone=value=>structuredClone(value);
const safeStorage=()=>{try{return globalThis.localStorage;}catch{return null;}};
export function mergePreferenceChanges(previous,current,latest={}){
 const result={...latest};for(const [key,value]of Object.entries(current)){
  if(JSON.stringify(previous?.[key])===JSON.stringify(value))continue;
  if(key==='favorites'&&Array.isArray(previous?.[key])&&Array.isArray(value)){const before=new Set(previous[key]),after=new Set(value),merged=new Set(Array.isArray(latest[key])?latest[key]:previous[key]);for(const id of before)if(!after.has(id))merged.delete(id);for(const id of after)if(!before.has(id))merged.add(id);result[key]=[...merged];}
  else if(isObject(previous?.[key])&&isObject(value))result[key]=mergePreferenceChanges(previous[key],value,isObject(latest[key])?latest[key]:previous[key]);
  else result[key]=clone(value);
 }return result;
}
export function capturePreferenceEntry(key,{storage=safeStorage()}={}){return {raw:storage?.getItem(key)??null,overlayRaw:storage?.getItem(RECOVERY+'value.'+key)??null,originalRaw:storage?.getItem(RECOVERY+'original.'+key)??null};}
export function restorePreferenceEntry(key,entry,{storage=safeStorage()}={}){for(const [name,raw]of [[key,entry.raw],[RECOVERY+'value.'+key,entry.overlayRaw],[RECOVERY+'original.'+key,entry.originalRaw]]){if((storage?.getItem(name)??null)===(raw??null))continue;if(raw===null||raw===undefined)storage?.removeItem(name);else storage?.setItem(name,raw);}}

// Merge a validated subtree field by field (including nested media settings).
// Unknown/incompatible values remain in the exact raw backup, not in execution.
function recoverObject(input,fallback,validator,path,issues){
 let result=clone(fallback);
 if(!isObject(input)){if(input!==undefined)issues.push({path,kind:'incompatible',message:'Expected object'});return result;}
 for(const [key,item]of Object.entries(input)){
  if(!Object.hasOwn(result,key)){issues.push({path:path+'.'+key,kind:'unknown',message:'Preserved in recovery backup'});continue;}
  let next=item;
  if(isObject(item)&&isObject(result[key]))next=recoverObject(item,result[key],candidate=>validator({...result,[key]:candidate})[key],path+'.'+key,issues);
  try{result=validator({...result,[key]:next});}catch(error){issues.push({path:path+'.'+key,kind:'incompatible',message:error.message});}
 }return result;
}
export function recoverWorkspacePreferences(input={}, {fallback={}}={}){
 if(!isObject(input))throw Error('Invalid workspace preferences');
 const issues=[],value={...fallback},choices={language:['fr','en'],layout:['tabs','tile','cascade'],theme:['light','dark'],computeProfile:['maximum','aggressive'],navigationMode:['auto','mouse','trackpad']};
 for(const [key,allowed]of Object.entries(choices))if(input[key]!==undefined){if(allowed.includes(input[key]))value[key]=input[key];else issues.push({path:key,kind:'incompatible',message:'Invalid '+key});}
 for(const key of ['toolsVisible','highlight'])if(input[key]!==undefined){if(typeof input[key]==='boolean')value[key]=input[key];else issues.push({path:key,kind:'incompatible',message:'Invalid '+key});}
 if(input.favorites!==undefined){if(Array.isArray(input.favorites)){value.favorites=[];for(const [index,id]of input.favorites.entries())if(typeof id==='string'&&id.length<=120&&!value.favorites.includes(id))value.favorites.push(id);else issues.push({path:'favorites.'+index,kind:'incompatible',message:'Invalid favorite identity'});}else issues.push({path:'favorites',kind:'incompatible',message:'Invalid favorites'});}
 const base=validateMediaPreferences();
 if(input.font!==undefined){if(['iowan','montserrat'].includes(input.font))value.font=input.font;else issues.push({path:'font',kind:'incompatible',message:'Invalid font'});}
 for(const [key,validator]of [['exports',validateExportSettings],['quickExport',validateExportSettings],['loupe',validateLoupeSettings]]){
  let prior;try{prior=validator(fallback[key]);}catch{prior=base[key];}
  value[key]=recoverObject(input[key],prior,validator,key,issues);
 }
 if(input.dependencies!==undefined){if(isObject(input.dependencies))value.dependencies={...input.dependencies,...(typeof input.dependencies.folderName==='string'?{folderName:input.dependencies.folderName.slice(0,200)}:{})};else issues.push({path:'dependencies',kind:'incompatible',message:'Invalid library preferences'});}
 const known=new Set([...Object.keys(choices),'toolsVisible','highlight','favorites','font','exports','quickExport','loupe','dependencies']);
 for(const key of Object.keys(input))if(!known.has(key))issues.push({path:key,kind:'unknown',message:'Preserved in recovery backup'});
 return {value,issues};
}
export function recoverWorkspaceSettings(input,{fallback={schema:'sherloq.workspace/1',preferences:{},tools:{}}}={}){
 if(input?.schema!=='sherloq.workspace/1'||!isObject(input.tools))throw Error('Expected sherloq.workspace/1');
 const recovered=recoverWorkspacePreferences(input.preferences||{},{fallback:fallback.preferences}),tools={...fallback.tools},issues=[...recovered.issues.map(issue=>({...issue,path:'preferences.'+issue.path}))];
 for(const [id,settings]of Object.entries(input.tools)){
  if(!/^[a-zA-Z][a-zA-Z0-9.-]{0,119}$/.test(id)){issues.push({path:'tools.'+id,kind:'incompatible',message:'Invalid tool identity'});continue;}
  try{const recovered=recoverSettings(settings,{...(fallback.tools[id]?{fallback:fallback.tools[id]}:{})});tools[id]=recovered.value;issues.push(...recovered.issues.map(issue=>({...issue,path:'tools.'+id+'.'+issue.path})));}
  catch(error){issues.push({path:'tools.'+id,kind:'incompatible',message:error.message});}
 }
 for(const key of Object.keys(input))if(!['schema','preferences','tools','exportedAt','recovery'].includes(key))issues.push({path:key,kind:'unknown',message:'Preserved in recovery backup'});
 return {value:{schema:'sherloq.workspace/1',preferences:recovered.value,tools},issues};
}
function recoverTools(value){const out={},issues=[];if(!isObject(value))throw Error('Invalid stored tool settings');for(const [id,input]of Object.entries(value))try{const recovered=recoverSettings(input);out[id]=recovered.value;issues.push(...recovered.issues.map(issue=>({...issue,path:id+'.'+issue.path})));}catch(error){issues.push({path:id,kind:'incompatible',message:error.message});}return{value:out,issues};}
export function recoverPreferenceEntry(key,input){
 if(key===AUTO_UPDATE_KEY)return recoverAutoUpdatePreferences(input);
 if(key==='sherloq.settings')return recoverSettings(input);
 if(key==='sherloq.workspace.preferences')return recoverWorkspacePreferences(input);
 if(key==='sherloq.workspace.tools')return recoverTools(input);
 if(key==='sherloq.classicPreset')return {value:validParams(input),issues:[]};
 if(key==='sherloq.favorite'){if(typeof input!=='boolean')throw Error('Invalid favorite');return{value:input,issues:[]};}
 // Feature policy and batch controls are owned by their own validators. Preserve
 // their safe JSON exactly; migration does not invent new scientific controls.
 if(key==='gd-iso-studio-theme'){if(!['light','dark'].includes(input))throw Error('Invalid theme');return{value:input,issues:[]};}
 const safe=(value,depth=0)=>{if(depth>10)throw Error('Preference nesting too deep');if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.length<=65536)return value;if(Array.isArray(value)&&value.length<=10000)return value.map(item=>safe(item,depth+1));if(isObject(value)&&Object.keys(value).length<=1000)return Object.fromEntries(Object.entries(value).map(([key,item])=>{if(['__proto__','prototype','constructor'].includes(key)||key.length>200)throw Error('Invalid preference name');return[key,safe(item,depth+1)];}));throw Error('Invalid preference JSON');};
 return {value:safe(input),issues:[]};
}

export function createPreferenceAccess(providedStorage){
 const protectedKeys=new Set(),reports=new Map();
 function read(key,{recover=recoverPreferenceEntry.bind(null,key)}={}){
  const storage=providedStorage??safeStorage();
  try{
   const original=storage?.getItem(key),overlay=storage?.getItem(RECOVERY+'value.'+key),raw=overlay??original;if(raw===null||raw===undefined)return{value:null,issues:[]};
   const parsed=key==='gd-iso-studio-theme'?raw:JSON.parse(raw),result=recover(parsed),issues=result.issues||[];
   if(overlay!==null&&overlay!==undefined||issues.length){protectedKeys.add(key);reports.set(key,issues);if(original!==null&&original!==undefined&&!storage.getItem(RECOVERY+'original.'+key))storage.setItem(RECOVERY+'original.'+key,original);}
   return {...result,protected:protectedKeys.has(key)};
  }catch(error){protectedKeys.add(key);const issues=[{path:key,kind:'corrupt',message:error.message}];reports.set(key,issues);return{value:null,issues,protected:true};}
 }
 function write(key,value){const storage=providedStorage??safeStorage();try{
  // Check first even if a caller only writes, so malformed originals are never
  // overwritten by startup defaults. An overlay is the active repaired copy.
  if(!reports.has(key)&&!protectedKeys.has(key))read(key);
  const raw=key==='gd-iso-studio-theme'?value:JSON.stringify(value);
  if(protectedKeys.has(key)){const original=storage?.getItem(key);if(original!==null&&original!==undefined&&!storage.getItem(RECOVERY+'original.'+key))storage.setItem(RECOVERY+'original.'+key,original);storage?.setItem(RECOVERY+'value.'+key,raw);}else storage?.setItem(key,raw);
  return !!storage;
 }catch{return false;}}
 return {read,write,issues:()=>[...reports.entries()].flatMap(([key,items])=>items.map(item=>({key,...item}))),protectedKeys:()=>[...protectedKeys]};
}
export const preferenceAccess=createPreferenceAccess();

function storageKeys(storage){const keys=[];for(let i=0;i<(storage?.length||0);i++)keys.push(storage.key(i));return keys;}
export async function capturePreferenceBackup({storage=safeStorage(),library=libraryValue,origin=globalThis.location?.origin||'unknown',now=()=>new Date()}={}){
 const entries={},issues=[];for(const key of storageKeys(storage))if(isPreferenceKey(key))entries[key]={raw:storage.getItem(key),overlayRaw:storage.getItem(RECOVERY+'value.'+key),originalRaw:storage.getItem(RECOVERY+'original.'+key)};
 const preferenceReport=[];for(const [key,entry]of Object.entries(entries))try{const raw=entry.originalRaw??entry.raw??entry.overlayRaw,recovered=recoverPreferenceEntry(key,key==='gd-iso-studio-theme'?raw:JSON.parse(raw));preferenceReport.push(...recovered.issues.map(issue=>({key,...issue})));}catch(error){preferenceReport.push({key,path:key,kind:'corrupt',message:error.message});}
 let folder=null,folderName='';try{[folder,folderName]=await Promise.all([library('folder'),library('folderName')]);}catch(error){issues.push({path:'library',kind:'permission',message:error.message});}
 return {schema:'sherloq.preference-backup/1',createdAt:now().toISOString(),origin,entries,library:{folder:folder||null,folderName:folderName||''},issues,preferenceReport};
}
export function serializePreferenceBackup(backup){
 if(backup?.schema!=='sherloq.preference-backup/1')throw Error('Invalid preference backup');
 return {...backup,library:{folderName:backup.library?.folderName||'',reconnectRequired:!!(backup.library?.folder||backup.library?.reconnectRequired)},issues:[...(backup.issues||[]),...(backup.library?.folder?[{path:'library.folder',kind:'permission',message:'Reconnect the library folder after moving to another origin or restoring permissions.'}]:[])]};
}
export function migratePreferenceBackup(backup,release={}){
 if(backup?.schema!=='sherloq.preference-backup/1'||!isObject(backup.entries))throw Error('Invalid preference backup');
 const versions=release.schemaVersions||{};for(const key of ['settings','workspace','preferences'])if(versions[key]!==undefined&&![1,'1','sherloq.settings/1','sherloq.workspace/1'].includes(versions[key]))throw Object.assign(Error('Unsupported preference migration: '+key+' '+versions[key]),{code:'PREFERENCE_MIGRATION_UNSUPPORTED'});
 const entries={},issues=[...(backup.issues||[])];
 for(const [key,entry]of Object.entries(backup.entries)){
  if(!isPreferenceKey(key)){issues.push({path:key,kind:'unknown',message:'Preserved in recovery backup'});continue;}
  const raw=entry.overlayRaw??entry.raw;if(typeof raw!=='string')continue;
  try{const result=recoverPreferenceEntry(key,key==='gd-iso-studio-theme'?raw:JSON.parse(raw));entries[key]=key==='gd-iso-studio-theme'?result.value:JSON.stringify(result.value);issues.push(...result.issues.map(issue=>({key,...issue})));}
  catch(error){issues.push({key,path:key,kind:'corrupt',message:error.message});}
 }
 return {schema:'sherloq.preference-migration/1',entries,backup,issues};
}
// A failed storage/permission write restores the exact snapshot. The release
// updater invokes this only after candidate bytes and migrations have passed.
export async function commitPreferenceMigration(migration,{storage=safeStorage(),library=libraryValue}={}){
 if(migration?.schema!=='sherloq.preference-migration/1')throw Error('Invalid preference migration');
 const before=await capturePreferenceBackup({storage,library}),rollback=()=>restorePreferenceBackup(before,{storage,library});
 try{
  for(const [key,raw]of Object.entries(migration.entries)){
   if(!isPreferenceKey(key))throw Error('Invalid preference key');const prior=migration.backup.entries[key],original=prior?.originalRaw??prior?.raw;
   if(original!==undefined&&original!==null)storage.setItem(RECOVERY+'original.'+key,original);
   // Keep the original key intact; an updater writes its compatible overlay.
   // This preserves unknown fields even after the new UI changes its settings.
   storage.setItem(RECOVERY+'value.'+key,raw);
  }
  storage.setItem(RECOVERY+'last-report',JSON.stringify({createdAt:new Date().toISOString(),issues:migration.issues}));
  return {issues:migration.issues,rollback};
 }catch(error){await rollback().catch(()=>{});throw error;}
}
export async function restorePreferenceBackup(backup,{storage=safeStorage(),library=libraryValue}={}){
 if(backup?.schema!=='sherloq.preference-backup/1')throw Error('Invalid preference backup');
 const write=(key,raw)=>raw===null||raw===undefined?storage.removeItem(key):storage.setItem(key,raw);
 // Remove only managed preference entries absent from the snapshot. No image,
 // result, session, imported model, cache or unrelated site data is touched.
 for(const key of storageKeys(storage))if(isPreferenceKey(key)&&!Object.hasOwn(backup.entries,key)){storage.removeItem(key);storage.removeItem(RECOVERY+'value.'+key);storage.removeItem(RECOVERY+'original.'+key);}
 for(const [key,entry]of Object.entries(backup.entries))if(isPreferenceKey(key)){write(key,entry.raw);write(RECOVERY+'value.'+key,entry.overlayRaw);write(RECOVERY+'original.'+key,entry.originalRaw);}
 if(backup.library?.folder){await library('folder',backup.library.folder);await library('folderName',backup.library.folderName||'');}
 else if(backup.library){await library('folder',null);await library('folderName',backup.library.folderName||'');}
 return {issues:backup.issues||[],reconnectRequired:!!backup.library?.reconnectRequired,originChanged:backup.origin!==globalThis.location?.origin};
}
export async function importPreferenceBackup(input,options={}){
 if(input?.schema!=='sherloq.preference-backup/1')throw Error('Invalid preference backup');
 const migration=migratePreferenceBackup(input),before=await capturePreferenceBackup(options);
 try{await restorePreferenceBackup(input,options);await commitPreferenceMigration(migration,options);return{issues:migration.issues,reconnectRequired:!!input.library?.reconnectRequired,originChanged:input.origin!==globalThis.location?.origin};}
 catch(error){await restorePreferenceBackup(before,options).catch(()=>{});throw error;}
}
export function preferenceBackupFilename(date=new Date()){return'SHERLOQ-sauvegarde-reglages-'+date.toISOString().replace(/[:.]/g,'-')+'.json';}
export async function downloadPreferenceBackup(document,backup,{download}={}){const value=serializePreferenceBackup(backup),blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});await(download??getDocumentDownloadShelf(document).download)(blob,preferenceBackupFilename(),{mime:'application/json'});return value;}
