import {createElaEnergyControls} from './energy-engine/src/ela-energy-controls.js';
import {validEnergySettings} from './settings.js';
import {bindSliderReset} from './slider-reset.js';
export function createEnergyUI({$,t,changed,persist,viewChanged}){
 const controller=createElaEnergyControls();let saved=[],selected='standard';
 const keys=['histogramLow','histogramHigh','shadow','highlight'];
 function values(){return controller.snapshot().values;}
 function sync(){const v=values();for(const k of keys){$('energy-'+k).value=v[k];$('energy-'+k+'-number').value=v[k];$('energy-'+k+'-value').textContent=(v[k]/10).toFixed(1)+(k.startsWith('histogram')?' %':'');}$('energy-profile').value=selected;}
 function renderProfiles(){const names={standard:'energyConservative',conservative:'energySensitive',sensitive:'energyAggressive',manual:'manual'};$('energy-profile').replaceChildren(...Object.entries(names).map(([id,key])=>new Option(t(key),id)),...saved.map(p=>new Option(p.name,p.id)));sync();}
 function begin(){controller.beginManualEdit();selected='manual';$('energy-profile').value=selected;changed(false);persist();}
 for(const k of keys)for(const suffix of ['','-number']){const el=$('energy-'+k+suffix);
  el.addEventListener('pointerdown',e=>{if(e.button===0&&e.isPrimary!==false)begin();},{capture:true});
  el.addEventListener('keydown',e=>{if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&(suffix?['ArrowUp','ArrowDown']:['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown']).includes(e.key))begin();},{capture:true});
  el.addEventListener('beforeinput',e=>{if(e.inputType?.startsWith('insert')||e.inputType?.startsWith('delete'))begin();},{capture:true});
  el.addEventListener('pointerup',()=>{if(selected==='manual')changed();});
  el.addEventListener('keyup',e=>{if(selected==='manual'&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key))changed();});
  el.addEventListener('blur',()=>{if(el.value===''||Number(el.value)!==values()[k]){sync();if(selected==='manual')changed();}});
  el.oninput=()=>{const raw=el.value,n=Number(raw);if(raw===''||!Number.isInteger(n)||n<Number(el.min)||n>Number(el.max))return;controller.edit({[k]:n});$('energy-'+k+(suffix?'':'-number')).value=n;$('energy-'+k+'-value').textContent=(n/10).toFixed(1)+(k.startsWith('histogram')?' %':'');selected='manual';$('energy-profile').value=selected;changed(false);persist();};
  if(!suffix)bindSliderReset(el,validEnergySettings().values[k],()=>{begin();el.oninput();changed();});
 }
 for(const k of ['quality','block','minimum'])$('energy-'+k).onchange=()=>{changed();if(!$('energy-'+k).reportValidity())return;try{validEnergySettings(bundle());}catch{return;}persist();};
 $('energy-profile').onchange=()=>{selected=$('energy-profile').value;const p=saved.find(p=>p.id===selected);if(p){controller.applySnapshot({id:p.id,values:p.values});for(const k of ['quality','block','minimum'])$('energy-'+k).value=p[k];}else controller.selectProfile(selected);sync();changed();persist();};
 for(const id of ['energy-view','energy-opacity'])$(id).oninput=()=>{persist();viewChanged();};
 bindSliderReset($('energy-opacity'),validEnergySettings().opacity,()=>$('energy-opacity').oninput());
 function bundle(){return{selected,values:values(),quality:Number($('energy-quality').value),block:Number($('energy-block').value),minimum:Number($('energy-minimum').value),view:$('energy-view').value,opacity:Number($('energy-opacity').value),profiles:structuredClone(saved)};}
 function load(input){const s=validEnergySettings(input);saved=s.profiles;selected=s.selected;controller.applySnapshot({id:selected,values:s.values});for(const k of ['quality','block','minimum','view','opacity'])$('energy-'+k).value=s[k];if(['conservative','sensitive'].includes(selected))controller.selectProfile(selected);renderProfiles();}
 function prepare(){const s=validEnergySettings(bundle()),profile=['standard','conservative','sensitive'].includes(selected)?selected:'manual';if(['conservative','sensitive'].includes(profile))controller.selectProfile(profile);const snap=controller.snapshot();return{token:{revision:snap.revision,profileId:selected},params:{quality:s.quality,block:s.block,minimum:s.minimum,profile,...(profile==='manual'?s.values:{})},presentation:{view:s.view,opacity:s.opacity}};}
 function accept(meta,token){if(!controller.accepts(token))return false;const e=meta.energy;
  if(['conservative','sensitive'].includes(token.profileId)){const v={histogramLow:Math.round(e.quantiles[0]*1000),histogramHigh:Math.round(e.quantiles[1]*1000),shadow:Math.round(e.thresholds[0]*10),highlight:Math.round(e.thresholds[1]*10)};if(!controller.acceptAutomatic({...token,values:v}))return false;sync();persist();}return true;}
 function save(name){const previous=saved.find(p=>p.name===name);if(!previous&&saved.length>=100)throw Error(t('profileLimit'));const s=validEnergySettings(bundle()),p={id:previous?.id||'profile-'+crypto.randomUUID(),name,values:s.values,quality:s.quality,block:s.block,minimum:s.minimum};saved=previous?saved.map(x=>x.id===p.id?p:x):[...saved,p];selected=p.id;controller.applySnapshot({id:p.id,values:p.values});renderProfiles();}
 load();return{bundle,load,prepare,accept,save,translate:renderProfiles,get selectedName(){return saved.find(p=>p.id===selected)?.name||'';},presentation:()=>({view:$('energy-view').value,opacity:Number($('energy-opacity').value)})};
}
