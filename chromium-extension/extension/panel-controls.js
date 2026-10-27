import {controlFields,normalizeControlSettings,selectControlGroup,changeControlTarget} from './controls.js';

// Availability never writes editable fields. Numeric drafts survive native frames,
// preference notifications and slider gestures; blur commits or restores validity.
export function mountPanelControls({root,getPreferences,setPreferences,language,canStep,onReset=()=>{},onStep=()=>{}}){
 const doc=root.ownerDocument,$=id=>root.querySelector('#'+id),target=$('control-target'),group=$('control-group'),step=$('control-step'),interval=$('control-interval'),value=$('control-value'),decrease=$('decrease'),increase=$('increase');
 const groups={adjust:['Réglages globaux','Global adjustments'],enhance:['Loupe améliorée','Enhanced magnifier'],sweep:['Balayage de niveau','Level sweep']};
 let disposed=false;
 for(const key of Object.keys(groups)){const option=doc.createElement('option');option.value=key;group.append(option);}
 for(const [key]of controlFields){const option=doc.createElement('option');option.value=key;target.append(option);}
 const editing=input=>doc.activeElement===input||input.hasAttribute('data-hover-slider-active');
 const write=(input,text)=>{if(!editing(input)&&input.value!==String(text))input.value=String(text);};
 function refreshAvailability(){
  if(disposed)return;const p=getPreferences(),[family,key]=p.controlTarget.split('.');
  const unused=family==='enhance'&&key==='percent'&&p.loupe.effects.enhance.mode==='equalize';
  decrease.disabled=increase.disabled=!canStep()||!p.loupe.effects[family]?.enabled||unused;
 }
 function sync(){
  if(disposed)return;const p=getPreferences(),index=language()==='fr'?0:1,[family,key]=p.controlTarget.split('.');
  for(const option of group.options)option.textContent=groups[option.value][index];
  for(const [i,option]of [...target.options].entries())option.textContent=controlFields[i][index+1];
  group.value=family;target.value=p.controlTarget;write(step,p.controlStep);write(interval,p.controlInterval);
  value.textContent=p.loupe.effects[family]?.[key]??'';
  decrease.textContent='− · '+p.shortcuts.decrease;increase.textContent='+ · '+p.shortcuts.increase;
  decrease.setAttribute('aria-keyshortcuts',p.shortcuts.decrease);increase.setAttribute('aria-keyshortcuts',p.shortcuts.increase);
  refreshAvailability();
 }
 function commit(input,key,min,max){
  // Capture before onReset, which may synchronously cause a refresh.
  const text=input.value,number=Number(text);if(!text.trim()||!Number.isInteger(number)||number<min||number>max||!input.checkValidity())return;
  const p=getPreferences();if(p[key]===number)return;const next={...p,[key]:number};
  if(key==='controlStep')Object.assign(next,normalizeControlSettings(next));
  onReset();setPreferences(next);sync();
 }
 group.onchange=()=>{const selected=group.value,next=selectControlGroup(getPreferences(),selected);onReset();setPreferences(next);sync();};
 target.onchange=()=>{const selected=target.value,next=changeControlTarget(getPreferences(),selected);onReset();setPreferences(next);sync();};
 for(const [input,key,min,max]of [[step,'controlStep',1,255],[interval,'controlInterval',0,5000]]){
  input.oninput=input.onchange=()=>commit(input,key,min,max);
  input.onblur=()=>{commit(input,key,min,max);sync();};
 }
 decrease.onclick=()=>{refreshAvailability();if(!decrease.disabled)onStep(-1);};
 increase.onclick=()=>{refreshAvailability();if(!increase.disabled)onStep(1);};
 sync();return {sync,refreshAvailability,dispose(){if(disposed)return;disposed=true;group.onchange=target.onchange=decrease.onclick=increase.onclick=null;for(const input of [step,interval])input.oninput=input.onchange=input.onblur=null;}};
}
