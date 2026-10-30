import {defaults} from './settings.js';
import {validateLoupeSettings} from './native-media-settings.js';
import {AHE,effectRanges} from './effects-settings.js';

export function loupePreset(id){
 if(!['default','brush','brush2','histogram','ahe','ahe-gamma-equalize','ahe-gamma'].includes(id))throw Error('Préréglage inconnu.');
 const value=structuredClone(defaults.loupe);
 if(id==='brush'||id==='brush2'){
  value.effects.adjust.enabled=true;
  value.effects.adjust.gamma=effectRanges.adjust.gamma[1];
  value.effects.adjust.equalize=5;value.effects.adjust.claheClip=20;
  if(id==='brush2')value.effects.adjust.saturation=100;
 }
 if(id==='ahe'){value.effects.adjust.enabled=true;value.effects.adjust.equalize=AHE;value.effects.adjust.aheTiles=effectRanges.adjust.aheTiles[1];}
 if(id==='ahe-gamma'||id==='ahe-gamma-equalize'){value.effects.adjust.enabled=true;value.effects.adjust.equalize=AHE;value.effects.adjust.aheTiles=8;value.effects.adjust.gamma=20;if(id==='ahe-gamma-equalize'){value.effects.enhance.enabled=true;value.effects.enhance.mode='equalize';}}
 if(id==='histogram'){value.effects.enhance.enabled=true;value.effects.enhance.mode='equalize';}
 return validateLoupeSettings(value);
}
export function currentLoupePreset(value){
 const key=JSON.stringify(validateLoupeSettings(value).effects);
 return ['default','brush','brush2','histogram','ahe','ahe-gamma-equalize','ahe-gamma'].find(id=>JSON.stringify(loupePreset(id).effects)===key)??'custom';
}
export function applyLoupePreset(current,id){
 return validateLoupeSettings({...current,effects:loupePreset(id).effects});
}
