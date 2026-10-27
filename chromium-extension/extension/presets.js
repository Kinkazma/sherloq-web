import {defaults} from './settings.js';
import {validateLoupeSettings} from './native-media-settings.js';
import {effectRanges} from './vendor/loupe-effects-settings.js';

export function loupePreset(id){
 if(!['default','brush','brush2','histogram'].includes(id))throw Error('Préréglage inconnu.');
 const value=structuredClone(defaults.loupe);
 if(id==='brush'||id==='brush2'){
  value.effects.adjust.enabled=true;
  value.effects.adjust.gamma=effectRanges.adjust.gamma[1];
  value.effects.adjust.equalize=effectRanges.adjust.equalize[1];
  if(id==='brush2')value.effects.adjust.saturation=100;
 }
 if(id==='histogram'){value.effects.enhance.enabled=true;value.effects.enhance.mode='equalize';}
 return validateLoupeSettings(value);
}
export function currentLoupePreset(value){
 const key=JSON.stringify(validateLoupeSettings(value).effects);
 return ['default','brush','brush2','histogram'].find(id=>JSON.stringify(loupePreset(id).effects)===key)??'custom';
}
export function applyLoupePreset(current,id){
 return validateLoupeSettings({...current,effects:loupePreset(id).effects});
}
