import {bindSliderReset} from './slider-reset.js?v=0.25.0';
import {effectRanges,validateLoupeEffects} from './loupe-effects-settings.js?v=0.25.0';

export const loupeStepFields=Object.freeze([
 ['adjust.brightness','Luminosité','Brightness'],['adjust.saturation','Saturation','Saturation'],['adjust.hue','Teinte','Hue'],['adjust.gamma','Gamma × 10','Gamma × 10'],['adjust.shadows','Ombres','Shadows'],['adjust.highlights','Hautes lumières','Highlights'],['adjust.sweep','Niveau','Level'],['adjust.width','Largeur de niveau','Level width'],['adjust.sharpen','Netteté','Sharpening'],['adjust.threshold','Seuil','Threshold'],['adjust.equalize','Égalisation','Equalization'],['enhance.percent','Écrêtage (%)','Clipping (%)'],['sweep.position','Balayage · niveau','Sweep · level'],['sweep.width','Balayage · largeur','Sweep · width'],['sweep.opacity','Balayage · intensité','Sweep · strength']
].map(row=>Object.freeze(row)));
const targets=new Set(loupeStepFields.map(row=>row[0]));
export const loupeStepDefaults=Object.freeze({target:'adjust.sweep',step:10});
export const loupeStepGroupDefaults=Object.freeze({adjust:loupeStepDefaults,enhance:Object.freeze({target:'enhance.percent',step:10}),sweep:Object.freeze({target:'sweep.position',step:10})});
export function validateLoupeStepGroups(input={},selected=loupeStepDefaults){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Invalid step groups.');
 const result={};
 for(const [group,defaults]of Object.entries(loupeStepGroupDefaults)){
  const entry=validateLoupeStepSettings(input[group]??defaults);
  if(entry.target.split('.')[0]!==group)throw new TypeError('Invalid step group target.');
  result[group]=entry;
 }
 const active=validateLoupeStepSettings(selected);result[active.target.split('.')[0]]=active;return result;
}
export function selectLoupeStepGroup(loupe,group){
 if(!Object.hasOwn(loupeStepGroupDefaults,group))throw new TypeError('Invalid step group.');
 const stepGroups=validateLoupeStepGroups(loupe.stepGroups,{target:loupe.stepTarget,step:loupe.stepSize}),selected=stepGroups[group];
 return{...loupe,stepTarget:selected.target,stepSize:selected.step,stepGroups};
}
export function validateLoupeStepSettings({target=loupeStepDefaults.target,step=loupeStepDefaults.step}={}){
 if(!targets.has(target)||!Number.isInteger(step)||step<1||step>255)throw new TypeError('Invalid step adjustment settings.');
 return{target,step};
}
export function nudgeLoupeEffects(effects,direction,configuration=loupeStepDefaults){
 const {target,step}=validateLoupeStepSettings(configuration),[group,key]=target.split('.');
 if(direction!==-1&&direction!==1)throw new TypeError('Invalid step direction.');
 const current=validateLoupeEffects(effects);
 if(!current[group].enabled)return null;
 const range=effectRanges[group][key],before=current[group][key],value=Math.max(range[0],Math.min(range[1],before+direction*step));
 if(value===before)return null;
 return validateLoupeEffects({...current,[group]:{...current[group],[key]:value}});
}

// The preference owner supplies the same effective effects as the existing
// loupe controls, including any active tool context. This module owns no cache.
export function mountLoupeStepControls(parent,{getSettings,setSettings,getEffects,onStep,language=()=> 'fr',canStep=()=>true,onReset=()=>{}}={}){
 const doc=parent.ownerDocument,node=(tag,text)=>{const item=doc.createElement(tag);if(text)item.textContent=text;return item;};
 const section=node('details'),summary=node('summary'),targetLabel=node('label'),targetText=node('span'),select=node('select'),stepLabel=node('label'),stepText=node('span'),amount=node('input'),actions=node('div'),decrease=node('button','− · :'),value=node('output'),increase=node('button','+ · =');let disposed=false,shortcuts={decrease:':',increase:'='};
 section.className='loupe-step-controls';section.open=true;section.append(summary,targetLabel,stepLabel,actions);targetLabel.append(targetText,select);stepLabel.append(stepText,amount);actions.className='loupe-effect-actions loupe-step-actions';actions.append(decrease,value,increase);decrease.type=increase.type='button';amount.type='number';amount.min='1';amount.max='255';amount.step='1';select.dataset.loupeStep='target';amount.dataset.loupeStep='step';value.dataset.loupeStep='value';decrease.dataset.loupeStep='decrease';increase.dataset.loupeStep='increase';
 for(const [key]of loupeStepFields){const option=node('option');option.value=key;select.append(option);}
 const settings=()=>validateLoupeStepSettings(getSettings()),available=()=>{const p=settings(),[group]=p.target.split('.');return canStep()&&getEffects()[group]?.enabled;};
 function refreshAvailability(){if(!disposed)decrease.disabled=increase.disabled=!available();}
 function sync(){if(disposed)return;const lang=language()==='fr'?1:2,p=settings(),[group,key]=p.target.split('.');summary.textContent=lang===1?'Réglage au pas':'Step adjustment';targetText.textContent=lang===1?'Paramètre':'Parameter';stepText.textContent=lang===1?'Pas':'Step';for(const[i,option]of [...select.options].entries())option.textContent=loupeStepFields[i][lang];select.value=p.target;if(amount.value!==String(p.step)&&doc.activeElement!==amount&&!amount.hasAttribute('data-hover-slider-active'))amount.value=String(p.step);value.textContent=String(getEffects()[group][key]);select.setAttribute('aria-label',targetText.textContent);amount.setAttribute('aria-label',stepText.textContent);decrease.setAttribute('aria-label',lang===1?'Diminuer du pas choisi':'Decrease by the selected step');increase.setAttribute('aria-label',lang===1?'Augmenter du pas choisi':'Increase by the selected step');value.setAttribute('aria-label',lang===1?'Valeur actuelle':'Current value');decrease.textContent='− · '+shortcuts.decrease;increase.textContent='+ · '+shortcuts.increase;decrease.setAttribute('aria-keyshortcuts',shortcuts.decrease);increase.setAttribute('aria-keyshortcuts',shortcuts.increase);refreshAvailability();}
 select.onchange=()=>{if(disposed)return;const next=validateLoupeStepSettings({...settings(),target:select.value});onReset();setSettings(next);sync();};
 // Both native number edits and the shared hover slider emit input. Capture
 // before reset: its owner may synchronously refresh this same control.
 amount.oninput=amount.onchange=()=>{const step=Number(amount.value);if(disposed||amount.value.trim()===''||!Number.isInteger(step)||step<1||step>255||!amount.checkValidity())return;const current=settings(),next=validateLoupeStepSettings({...current,step});if(next.step===current.step)return;onReset();setSettings(next);sync();};
 amount.onblur=()=>sync();bindSliderReset(amount,loupeStepDefaults.step);
 const click=direction=>{if(disposed||!available())return;onStep(direction,{...settings()});};decrease.onclick=()=>click(-1);increase.onclick=()=>click(1);
 parent.append(section);sync();return{element:section,sync,refreshAvailability,setShortcuts(value){shortcuts={...value};sync();},dispose(){if(disposed)return;disposed=true;select.onchange=amount.oninput=amount.onchange=amount.onblur=decrease.onclick=increase.onclick=null;section.remove();}};
}
