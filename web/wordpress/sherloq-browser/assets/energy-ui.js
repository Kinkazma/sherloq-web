import {diagnostic} from './runtime-context.js?v=0.30.0';
import {configureAutomaticSlider} from './source-parameter-constraints.js?v=0.30.0';
import {bindInteractiveControl} from './interactive-control.js?v=0.30.0';
import {createElaEnergyControls} from './energy-engine/src/ela-energy-controls.js';
import {validEnergySettings,energyProfilePresets} from './settings.js?v=0.30.0';
import {bindSliderReset} from './slider-reset.js?v=0.30.0';
export function createEnergyUI({$,t,changed,persist,viewChanged,interactiveControlOptions={}}){
 configureAutomaticSlider($('energy-quality'),'ela.energy','quality');
 const controller=createElaEnergyControls();let saved=[],selected='standard',scoreField='unified',scoreThreshold=0,scoreView='map',interacting=false,interactionChanged=false,perContextProfile=false;const maxima={},listeners=[];
 const keys=['histogramLow','histogramHigh','shadow','highlight'];
 const gesture=(input,event)=>({field:input.id,...event});
 const diagnosticOptions=input=>({...interactiveControlOptions,onDiagnostic:value=>{try{interactiveControlOptions.onDiagnostic?.(value);}catch{}diagnostic({level:'info',kind:'parameter-preview.gesture',operation:'ela.energy',field:input.id,metrics:value});}});
 function values(){return controller.snapshot().values;}
 function syncProfileLabels(v=values()){for(const k of keys){const label=$('energy-'+k+'-value');label.textContent=perContextProfile?t('energyPerContextProfile'):(v[k]/10).toFixed(1)+(k.startsWith('histogram')?' %':'');label.title=perContextProfile?t('energyPerContextHint'):'';}}
 function sync(){const v=values();for(const k of keys){$('energy-'+k).value=v[k];$('energy-'+k+'-number').value=v[k];}syncProfileLabels(v);$('energy-profile').value=selected;}
 function renderProfiles(){const names={standard:'energyConservative',conservative:'energySensitive',sensitive:'energyAggressive',manual:'manual'};$('energy-profile').replaceChildren(...Object.entries(names).map(([id,key])=>new Option(t(key),id)),...Object.entries(energyProfilePresets).map(([id,p])=>new Option(p.name,id)),...saved.map(p=>new Option(p.name,p.id)));sync();}
 const gestures=[],boundedPreview={adaptive:true};let manualEditing=false;
 function begin(){if(manualEditing)return;manualEditing=true;perContextProfile=false;controller.beginManualEdit();selected='manual';syncProfileLabels();$('energy-profile').value=selected;for(const binding of optionBindings)if(binding.control===$('energy-profile'))binding.reset('manual-profile');changed(false,{intent:true});persist();}
 function cancelInteraction(){manualEditing=false;for(const gesture of gestures)gesture.reset();interacting=false;interactionChanged=false;}
 function finishManual(event={}){if(!manualEditing)return;manualEditing=false;for(const gesture of gestures)gesture.reset();sync();changed(true,{commit:true,continuous:event.continuous,usedPreview:event.usedPreview,kind:event.kind});}
 const biomeBindings=[];
 for(const k of keys)for(const suffix of ['','-number']){
  const el=$('energy-'+k+suffix),binding=bindInteractiveControl(el,{...diagnosticOptions(el),read:()=>{const n=Number(el.value);return{valid:el.value!==''&&Number.isInteger(n)&&n>=Number(el.getAttribute('min'))&&n<=Number(el.getAttribute('max')),value:n};},update:n=>{begin();controller.edit({[k]:n});$('energy-'+k+(suffix?'':'-number')).value=n;$('energy-'+k+'-value').textContent=(n/10).toFixed(1)+(k.startsWith('histogram')?' %':'');for(const other of biomeBindings)if(other.key===k&&other!==binding)other.reset('paired-control');persist();},preview:event=>changed(false,{preview:boundedPreview,gesture:gesture(el,event)}),commit:finishManual,cancel:event=>{if(event.reason==='unchanged'){manualEditing=false;sync();changed(false,{cancel:true});}}});
  binding.key=k;gestures.push(binding);biomeBindings.push(binding);el.oninput=binding.input;el.onchange=binding.change;
  bindSliderReset(el,validEnergySettings().values[k],()=>{binding.input();binding.finish('reset');});
 }
 const optionBindings=[];
 const bindOption=(input,{apply=()=>{},canPreview=false}={})=>{
  const binding=bindInteractiveControl(input,{...diagnosticOptions(input),read:()=>{let valid=input.tagName==='SELECT'||input.value!==''&&Number.isFinite(Number(input.value))&&(!input.checkValidity||input.checkValidity());if(valid)try{validEnergySettings(bundle());}catch{valid=false;}return {valid,value:input.tagName==='SELECT'?input.value:Number(input.value)};},update:value=>{apply(value);if(input===$('energy-profile'))for(const other of optionBindings)if(other!==binding)other.reset('profile-change');persist();},begin:()=>changed(false,{intent:true}),preview:event=>{if(canPreview)changed(false,{preview:boundedPreview,gesture:gesture(input,event)});},commit:event=>changed(true,{commit:true,continuous:event.continuous,usedPreview:event.usedPreview,kind:event.kind}),cancel:event=>{if(event.reason==='unchanged')changed(false,{cancel:true});}});
  binding.control=input;gestures.push(binding);optionBindings.push(binding);input.oninput=binding.input;input.onchange=binding.change;return binding;
 };
 for(const k of ['quality','block','minimum']){const binding=bindOption($('energy-'+k),{canPreview:true});bindSliderReset($('energy-'+k),validEnergySettings()[k],()=>{binding.input();binding.finish('reset');});}
 bindOption($('energy-profile'),{apply:value=>{perContextProfile=false;selected=value;const p=saved.find(p=>p.id===selected)??energyProfilePresets[selected];if(p){controller.applySnapshot({id:selected,values:p.values});for(const k of ['quality','block','minimum','view','opacity'])if(Object.hasOwn(p,k))$('energy-'+k).value=p[k];}else controller.selectProfile(selected);sync();}});
 $('energy-view').oninput=()=>{persist();viewChanged();};
 const opacity=$('energy-opacity'),opacityGesture=bindInteractiveControl(opacity,{...diagnosticOptions(opacity),read:()=>({valid:opacity.value!==''&&Number.isFinite(Number(opacity.value)),value:Number(opacity.value)}),update:()=>persist(),preview:event=>viewChanged({preview:boundedPreview,gesture:gesture(opacity,event)}),commit:()=>viewChanged(),cancel:event=>{if(event.reason==='unchanged')viewChanged();}});gestures.push(opacityGesture);opacity.oninput=opacityGesture.input;opacity.onchange=opacityGesture.change;
 bindSliderReset(opacity,validEnergySettings().opacity,()=>{opacityGesture.input();opacityGesture.finish('reset');});
 function scoreMaximum(){if(Object.hasOwn(maxima,scoreField))return maxima[scoreField];if(['both','unified'].includes(scoreField)&&Object.hasOwn(maxima,'high')&&Object.hasOwn(maxima,'low'))return Math.max(maxima.high,maxima.low);}
 function scoreMinimum(){return scoreField==='both'?-(scoreMaximum()??Math.max(1,Math.abs(scoreThreshold))):0;}
 function clampScore(){const max=scoreMaximum(),min=scoreMinimum(),value=Math.max(min,max===undefined?scoreThreshold:Math.min(max,scoreThreshold));if(value!==scoreThreshold){scoreThreshold=value;return true;}return false;}
 function syncScores(){const max=scoreMaximum()??Math.max(1,scoreField==='both'?Math.abs(scoreThreshold):scoreThreshold);$('energy-score-field').value=scoreField;$('energy-score-view').value=scoreView;for(const suffix of ['','-number']){const input=$('energy-score-threshold'+suffix);input.max=String(max);input.min=String(scoreMinimum());input.value=String(scoreThreshold);input.title=t(scoreField==='both'?'energyScoreBothHint':'energyScoreHint');input.setAttribute?.('aria-label',t('energyScoreThreshold'));}}
 $('energy-score-field').onchange=()=>{const field=$('energy-score-field').value;if(!['low','high','both','unified'].includes(field))return;scoreField=field;clampScore();syncScores();for(const binding of scoreBindings)binding.reset('field-change');persist();viewChanged();};
 $('energy-score-view').onchange=()=>{const value=$('energy-score-view').value;if(!['map','overlay'].includes(value))return;scoreView=value;persist();viewChanged();};
 const scoreBindings=[];
 for(const suffix of ['','-number']){
  const input=$('energy-score-threshold'+suffix),binding=bindInteractiveControl(input,{...diagnosticOptions(input),read:()=>{const raw=input.value,value=Number(raw),max=scoreMaximum();return {valid:raw!==''&&Number.isFinite(value)&&(value>=0||scoreField==='both')&&(max===undefined||value>=scoreMinimum()&&value<=max),value};},update:value=>{scoreThreshold=value;syncScores();for(const other of scoreBindings)if(other!==binding)other.reset('paired-control');persist();},preview:event=>viewChanged({preview:boundedPreview,gesture:gesture(input,event)}),commit:()=>viewChanged(),cancel:event=>{if(event.reason==='unchanged')viewChanged();}});
  gestures.push(binding);scoreBindings.push(binding);input.oninput=binding.input;input.onchange=binding.change;
 }
 for(const [i,suffix]of['','-number'].entries()){const input=$('energy-score-threshold'+suffix);bindSliderReset(input,0,()=>{input.oninput();scoreBindings[i].finish('reset');});}
 const presentation=(mode='biomes')=>mode==='scores'?{view:'scores',field:scoreField,threshold:scoreThreshold,scoreView}:{view:$('energy-view').value,opacity:Number($('energy-opacity').value)};
 function bundle(){return{selected,values:values(),quality:Number($('energy-quality').value),block:Number($('energy-block').value),minimum:Number($('energy-minimum').value),view:$('energy-view').value,opacity:Number($('energy-opacity').value),scoreField,scoreThreshold,scoreView,profiles:structuredClone(saved)};}
 function load(input){perContextProfile=false;const s=validEnergySettings(input);saved=s.profiles;selected=s.selected;scoreField=s.scoreField;scoreThreshold=s.scoreThreshold;scoreView=s.scoreView;interacting=false;interactionChanged=false;manualEditing=false;for(const gesture of gestures)gesture.reset();for(const key of Object.keys(maxima))delete maxima[key];controller.applySnapshot({id:selected,values:s.values});for(const k of ['quality','block','minimum','view','opacity'])$('energy-'+k).value=s[k];if(['conservative','sensitive'].includes(selected))controller.selectProfile(selected);renderProfiles();syncScores();for(const gesture of gestures)gesture.reset();}
 function prepare(mode='biomes'){const s=validEnergySettings(bundle()),profile=['standard','conservative','sensitive'].includes(selected)?selected:'manual';if(['conservative','sensitive'].includes(profile))controller.selectProfile(profile);const snap=controller.snapshot();return{token:{revision:snap.revision,profileId:selected},params:{quality:s.quality,block:s.block,minimum:s.minimum,profile,...(profile==='manual'?s.values:{})},presentation:presentation(mode)};}
 function accept(meta,token){if(!controller.accepts(token))return false;const e=meta.energy;
  if(['conservative','sensitive'].includes(token.profileId)){
   // Fragmented native contexts may have different automatic thresholds.
   // Keep their scientific values in the result. The four common values are
   // only the seed for a later explicit manual edit, never an averaged profile.
   const local=e?.profileLayout==='per-native-context';
   const v=local?values():{histogramLow:Math.round(e.quantiles[0]*1000),histogramHigh:Math.round(e.quantiles[1]*1000),shadow:Math.round(e.thresholds[0]*10),highlight:Math.round(e.thresholds[1]*10)};
   if(!controller.acceptAutomatic({...token,values:v}))return false;
   perContextProfile=local;sync();persist();
  }return true;}
 function save(name){const previous=saved.find(p=>p.name===name);if(!previous&&saved.length>=100)throw Error(t('profileLimit'));const s=validEnergySettings(bundle()),p={id:previous?.id||'profile-'+crypto.randomUUID(),name,values:s.values,quality:s.quality,block:s.block,minimum:s.minimum};saved=previous?saved.map(x=>x.id===p.id?p:x):[...saved,p];selected=p.id;controller.applySnapshot({id:p.id,values:p.values});renderProfiles();}
 load();return{get interactiveActive(){return gestures.some(gesture=>gesture.active);},get interactivePending(){return gestures.some(gesture=>gesture.pending);},bundle,load,prepare,accept,save,cancelInteraction,translate:()=>{renderProfiles();syncScores();for(const gesture of gestures)gesture.reset();},get selectedName(){return saved.find(p=>p.id===selected)?.name||energyProfilePresets[selected]?.name||'';},presentation,resetBounds(){for(const key of Object.keys(maxima))delete maxima[key];syncScores();},dispose(){for(const remove of listeners.splice(0))remove();for(const gesture of gestures)gesture.dispose();manualEditing=false;interacting=false;interactionChanged=false;},observePresentation(value){if(value?.view!=='scores'||!['low','high','both','unified'].includes(value.field))return false;if(Number.isFinite(value.observedMaximum)&&value.observedMaximum>=0)maxima[value.field]=value.observedMaximum;for(const key of ['low','high'])if(Number.isFinite(value.observedMaxima?.[key])&&value.observedMaxima[key]>=0)maxima[key]=value.observedMaxima[key];if(Object.hasOwn(maxima,'high')&&Object.hasOwn(maxima,'low')){maxima.both=Math.max(maxima.high,maxima.low);maxima.unified=maxima.both;}const clamped=clampScore();syncScores();if(clamped)persist();return clamped;}};
}
