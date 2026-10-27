import {effectRanges} from './vendor/loupe-effects-settings.js';
export const controlFields = [
 ['adjust.brightness','Luminosité','Brightness'],['adjust.saturation','Saturation','Saturation'],['adjust.hue','Teinte','Hue'],['adjust.gamma','Gamma × 10','Gamma × 10'],['adjust.shadows','Ombres','Shadows'],['adjust.highlights','Hautes lumières','Highlights'],['adjust.sweep','Niveau','Level'],['adjust.width','Largeur de niveau','Level width'],['adjust.sharpen','Netteté','Sharpening'],['adjust.threshold','Seuil','Threshold'],['adjust.equalize','Égalisation','Equalization'],['enhance.percent','Écrêtage (%)','Clipping (%)'],['sweep.position','Balayage · niveau','Sweep · level'],['sweep.width','Balayage · largeur','Sweep · width'],['sweep.opacity','Balayage · intensité','Sweep · strength']
];
export const controlGroupDefaults=Object.freeze({
 adjust:Object.freeze({target:'adjust.sweep',step:10}),
 enhance:Object.freeze({target:'enhance.percent',step:10}),
 sweep:Object.freeze({target:'sweep.position',step:10})
});
const targets=new Set(controlFields.map(([target])=>target));
function validatedControl(value){
 if(!value||!targets.has(value.target)||!Number.isInteger(value.step)||value.step<1||value.step>255)throw Error('Paramètre ou pas invalide.');
 return {target:value.target,step:value.step};
}
// Root fields remain the selected control, independently of loupe/PDF validation.
// Every previously stored step, including 1, is treated as a personal choice.
export function normalizeControlSettings(input={}){
 const saved=input.controlGroups??{};
 if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error('Mémoires de réglage invalides.');
 const controlGroups={};
 for(const [group,defaults]of Object.entries(controlGroupDefaults)){
  const value=validatedControl(saved[group]??defaults);
  if(value.target.split('.')[0]!==group)throw Error('Famille de réglage invalide.');
  controlGroups[group]=value;
 }
 const target=input.controlTarget??controlGroups.adjust.target,group=target.split('.')[0];
 const selected=validatedControl({target,step:input.controlStep??controlGroups[group]?.step});
 controlGroups[group]=selected;
 return {controlTarget:selected.target,controlStep:selected.step,controlGroups};
}
export function selectControlGroup(preferences,group){
 if(!Object.hasOwn(controlGroupDefaults,group))throw Error('Famille de réglage invalide.');
 const normalized=normalizeControlSettings(preferences),selected=normalized.controlGroups[group];
 return {...preferences,...normalized,controlTarget:selected.target,controlStep:selected.step};
}
export function changeControlTarget(preferences,target){
 const normalized=normalizeControlSettings(preferences),group=target.split('.')[0],changed=group!==normalized.controlTarget.split('.')[0];
 const step=changed?normalized.controlGroups[group]?.step:normalized.controlStep;
 return {...preferences,...normalizeControlSettings({...normalized,controlTarget:target,controlStep:step})};
}
export function nudge(preferences,direction,binding){
 const [group,key]=(binding?.target||preferences.controlTarget).split('.'),bounds=effectRanges[group]?.[key];
 if(!bounds||!preferences.loupe.effects[group].enabled)return null;
 const before=preferences.loupe.effects[group][key],value=Math.max(bounds[0],Math.min(bounds[1],before+Math.sign(direction)*(binding?.step||preferences.controlStep)));
 return {...preferences,loupe:{...preferences.loupe,effects:{...preferences.loupe.effects,[group]:{...preferences.loupe.effects[group],[key]:value}}}};
}
