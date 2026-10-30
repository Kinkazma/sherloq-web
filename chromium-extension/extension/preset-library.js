import {validateLoupeEffects} from './effects-settings.js';
export const presetStorageKey='namedLoupePresets';
export function presetName(value){
 if(typeof value!=='string')throw Error('Nom de préréglage invalide.');
 const name=value.trim().normalize('NFC');if(!name||name.length>80||/[\u0000-\u001f\u007f]/.test(name))throw Error('Le nom doit contenir entre 1 et 80 caractères.');return name;
}
export function validateNamedPresets(value=[]){
 if(!Array.isArray(value)||value.length>1000)throw Error('Liste de préréglages invalide.');
 const ids=new Set(),names=new Set();return value.map(record=>{
  if(!record||typeof record.id!=='string'||!/^user-[\w-]{1,100}$/.test(record.id)||ids.has(record.id))throw Error('Préréglage invalide.');
  const name=presetName(record.name),key=name.toLocaleLowerCase();if(names.has(key))throw Error('Ce nom de préréglage existe déjà.');ids.add(record.id);names.add(key);
  return {id:record.id,name,effects:validateLoupeEffects(record.effects)};
 });
}
export function addNamedPreset(records,{name,effects},id='user-'+crypto.randomUUID()){
 return validateNamedPresets([...validateNamedPresets(records),{id,name,effects}]);
}
export function removeNamedPreset(records,id){
 const list=validateNamedPresets(records);if(!list.some(record=>record.id===id))throw Error('Préréglage personnel introuvable.');return list.filter(record=>record.id!==id);
}
export async function readNamedPresets(){return validateNamedPresets((await chrome.storage.local.get(presetStorageKey))[presetStorageKey]??[]);}
