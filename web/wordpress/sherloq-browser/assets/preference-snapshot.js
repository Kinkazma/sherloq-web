// Raw preservation is available before any engine-backed validation or
// migration. The bridge must retain unknown or malformed values unchanged.
import {libraryValue} from './dependency-store.js?v=0.31.0';
import {AUTO_UPDATE_KEY} from './local-auto-update.js?v=0.31.0';

export const isPreferenceKey=key=>typeof key==='string'&&(/^sherloq\.(adaptive-runtime|settings|workspace\.preferences|workspace\.tools|favorite|classicPreset|batch\.settings|feature-policy|local-feature-policy|featurePolicy|local\.feature-state|local\.feature-policy)$/.test(key)||key==='gd-iso-studio-theme'||key===AUTO_UPDATE_KEY);
const safeStorage=()=>{try{return globalThis.localStorage;}catch{return null;}};
export async function capturePreferenceSnapshot({storage=safeStorage(),library=libraryValue,origin=globalThis.location?.origin||'unknown',now=()=>new Date()}={}){
 const entries={},issues=[];
 for(let i=0;i<(storage?.length||0);i++){
  const key=storage.key(i);
  if(isPreferenceKey(key))entries[key]={raw:storage.getItem(key),overlayRaw:storage.getItem('sherloq.recovery.value.'+key),originalRaw:storage.getItem('sherloq.recovery.original.'+key)};
 }
 let folder=null,folderName='';
 try{[folder,folderName]=await Promise.all([library('folder'),library('folderName')]);}catch(error){issues.push({path:'library',kind:'permission',message:error.message});}
 return {schema:'sherloq.preference-backup/1',createdAt:now().toISOString(),origin,entries,library:{folder:folder||null,folderName:folderName||''},issues,preferenceReport:[]};
}
