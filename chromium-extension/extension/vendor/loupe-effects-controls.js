import {bindSliderReset} from './slider-reset.js';
import {effectDefaults,validateLoupeEffects} from './loupe-effects-settings.js';
const groups={adjust:['Réglages globaux','Global adjustments'],enhance:['Loupe améliorée','Enhanced magnifier'],sweep:['Balayage de niveau','Level sweep']};
const fields={
 adjust:[['brightness','Luminosité','Brightness',-255,255],['saturation','Saturation','Saturation',-255,255],['hue','Teinte','Hue',0,180],['gamma','Gamma × 10','Gamma × 10',1,50],['shadows','Ombres','Shadows',-100,100],['highlights','Hautes lumières','Highlights',-100,100],['sweep','Niveau','Level',0,255],['width','Largeur de niveau','Level width',0,255],['sharpen','Netteté','Sharpening',0,100],['threshold','Seuil · 0 = auto','Threshold · 0 = auto',0,255],['equalize','Égalisation','Equalization',['Sans','Histogramme','CLAHE 1','CLAHE 2','CLAHE 3','CLAHE 4'],['None','Histogram','CLAHE 1','CLAHE 2','CLAHE 3','CLAHE 4']],['invert','Inverser','Invert']],
 enhance:[['mode','Méthode','Method',['Égalisation','Contraste automatique'],['Equalization','Auto contrast'],['equalize','contrast']],['percent','Écrêtage (%)','Clipping (%)',0,100],['channel','Par canal','Per channel']],
 sweep:[['position','Niveau','Level',0,255],['width','Largeur','Width',1,255],['opacity','Intensité (%)','Strength (%)',0,100]]
};
export function mountLoupeEffectControls(parent,{getPreferences,setPreferences,language,forced=()=>false,onSweep=()=>{},stopSweep=()=>{},sweepState=()=>null}){
 let activeGroup=null;const doc=parent.ownerDocument,entries=[];const node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 for(const [group,names]of Object.entries(groups)){
  const section=node('details'),summary=node('summary'),label=node('label'),enable=node('input'),title=node('span'),grid=node('div');section.className='loupe-effect';section.dataset.effectGroup=group;grid.className='loupe-effect-grid';enable.type='checkbox';enable.dataset.effect=group+'.enabled';label.append(enable,title);summary.append(label);section.append(summary,grid);parent.append(section);section.addEventListener('focusin',()=>activeGroup=group);section.addEventListener('pointerdown',()=>activeGroup=group);
  // The checkbox changes the effect, the rest of the summary folds its controls.
  enable.addEventListener('click',e=>e.stopPropagation());enable.onchange=()=>{const p=getPreferences();section.open=enable.checked;setPreferences({...p,loupe:{...p.loupe,effects:validateLoupeEffects({...p.loupe.effects,[group]:{...p.loupe.effects[group],enabled:enable.checked}})}});};
  const controls=[];
  for(const [key,fr,en,min,max,values]of fields[group]){
   const row=node('label'),caption=node('span');row.append(caption);let input,number;
   if(Array.isArray(min)){input=node('select');min.forEach((text,i)=>{const option=node('option',text);option.value=values?.[i]??i;input.append(option);});}
   else if(min===undefined){input=node('input');input.type='checkbox';row.classList.add('effect-checkbox');}
   else{input=node('input');input.type='range';input.min=min;input.max=max;input.step=1;number=node('input');number.type='number';number.min=min;number.max=max;number.step=1;row.append(input);}
   input.dataset.effect=group+'.'+key;row.append(number??input);if(number)number.dataset.effectNumber=group+'.'+key;grid.append(row);
   const update=target=>{if(target.type==='number'&&!target.checkValidity())return;const p=getPreferences(),value=target.type==='checkbox'?target.checked:values?target.value:Number(target.value);try{setPreferences({...p,loupe:{...p.loupe,effects:validateLoupeEffects({...p.loupe.effects,[group]:{...p.loupe.effects[group],[key]:value}})}});}catch{}};
   input.oninput=()=>update(input);if(number)number.oninput=()=>update(number);if(input.type==='range')bindSliderReset(input,()=>effectDefaults[group][key],()=>{stopSweep();update(input);});controls.push({input,number,caption,key,fr,en,labels:Array.isArray(min)?[min,max]:null});
  }
  const actions=node('div'),scan=node('button','B'),reset=node('button');actions.className='loupe-effect-actions';scan.type=reset.type='button';scan.dataset.effectScan=group;scan.setAttribute('aria-keyshortcuts','B');scan.onclick=()=>{activeGroup=group;onSweep(group);};reset.dataset.effectReset=group;reset.onclick=()=>{stopSweep();const p=getPreferences();setPreferences({...p,loupe:{...p.loupe,effects:{...p.loupe.effects,[group]:{...effectDefaults[group],enabled:p.loupe.effects[group].enabled}}}});};actions.append(scan,reset);
  let configure,target;if(group==='adjust'){configure=node('button','B ⚙');configure.type='button';configure.dataset.sweepConfigure='';configure.setAttribute('aria-expanded','false');target=node('select');target.dataset.sweepTarget='';target.hidden=true;for(const [key]of fields.adjust){const option=node('option',key);option.value=key;target.append(option);}configure.onclick=()=>{target.hidden=!target.hidden;configure.setAttribute('aria-expanded',String(!target.hidden));};target.onchange=()=>{stopSweep();const p=getPreferences();setPreferences({...p,loupe:{...p.loupe,sweepTarget:target.value}});};actions.append(configure,target);}
  section.append(actions);entries.push({group,names,section,enable,title,controls,scan,reset,configure,target});
 }
 return{activeGroup:()=>activeGroup,sync(){
  const p=getPreferences(),effects=p.loupe.effects,index=language()==='fr'?0:1,running=sweepState();
  for(const {group,names,section,enable,title,controls,scan,reset,configure,target}of entries){
   title.textContent=names[index];enable.checked=effects[group].enabled;enable.disabled=forced(group);enable.title=enable.disabled?(index?'This effect belongs to the active Enhanced magnifier tool. L switches between local and whole-image enhancement.':'Cet effet appartient à l’outil Loupe améliorée actif. L bascule entre amélioration locale et image entière.') : '';
   const equalize=group==='enhance'&&effects.enhance.mode==='equalize';
   for(const c of controls){c.caption.textContent=index?c.en:c.fr;const unused=equalize&&['percent','channel'].includes(c.key);c.input.disabled=!enable.checked||unused;c.input.title=unused?(index?'Used by Auto contrast; histogram equalization has no clipping parameter.':'Utilisé par Contraste automatique ; l’égalisation n’utilise pas l’écrêtage.') : '';if(c.number){c.number.disabled=c.input.disabled;c.number.title=c.input.title;}if(c.input.type==='checkbox')c.input.checked=effects[group][c.key];else c.input.value=effects[group][c.key];if(c.number)c.number.value=effects[group][c.key];if(c.labels)for(const [i,o]of [...c.input.options].entries())o.textContent=c.labels[index][i];}
   scan.textContent=(running===group?(index?'Stop':'Arrêter'):(index?'Sweep':'Balayer'))+' · B';scan.disabled=!p.loupe.enabled||!enable.checked||equalize;scan.setAttribute('aria-pressed',String(running===group));reset.textContent=index?'Reset values':'Réinitialiser les valeurs';
   if(target){target.value=p.loupe.sweepTarget;configure.title=index?'Choose the parameter swept by B':'Choisir le paramètre balayé par B';target.setAttribute('aria-label',configure.title);for(const [i,o]of [...target.options].entries())o.textContent=fields.adjust[i][index?2:1];}
   if(enable.checked&&!section.dataset.initialized)section.open=true;section.dataset.initialized='true';
  }
 }};
}
