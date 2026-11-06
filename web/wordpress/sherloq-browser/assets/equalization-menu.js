import {positionViewportPopup} from './viewport-popup.js?v=0.33.0';
import {equalizationMethods,equalizationState as normalizeEqualizationState,equalizationOperations} from './unified-engine/src/equalization-settings.js';
export {equalizationMethods,equalizationOperations};
// Shared equalization controls always request Fast/Auto. The standalone
// SHERLOQ panel and the pure engine keep their independent mode contracts.
export function equalizationState(input,legacy=0,operation='inspection.adjust'){
 const state=normalizeEqualizationState(input,legacy,operation);
 const index=equalizationMethods.findIndex(method=>method.id==='sherloq7c');
 if(input?.values?.[index]===undefined)state.values[index]=100;
 if(input?.sherloq7c?.micro===undefined)state.sherloq7c.micro=100;
 state.sherloq7c.backend='auto';
 state.sherloq7c.computationMode='fast';
 state.sherloq7c.precision='1e-2';
 return state;
}
export function readEqualization(parameters,operation){return equalizationState(parameters.equalization,parameters[equalizationOperations[operation]],operation);}
export function writeEqualization(parameters,state,operation){
 parameters.equalization=equalizationState(state);const key=equalizationOperations[operation],active=state.method!=='none';
 if(operation==='inspection.adjust')parameters.equalize=active?1:0;
 else if(operation==='inspection.magnifier')parameters.mode=active?'equalize':'contrast';
 else if(operation==='noise.separation'){if(active)parameters.levels=0;else if(parameters.levels===0)parameters.levels=255;}
 else if(key)parameters[key]=active;
}
// Only this panel is mounted: no viewer, navigation handlers or image state.
export function mountEqualizationMenu(host,{getState,onChange,language=()=> 'fr',noneLabel,disabled=()=>false,experimentalTools=()=>false,sourceDimensions=()=>null,resultMetrics=()=>null}={}){
 const doc=host.ownerDocument,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;},style=node('link'),menu=node('details'),summary=node('summary'),popover=node('div'),parameter=node('div'),heading=node('div'),label=node('label'),output=node('output'),slider=node('input'),list=node('div'),buttons=new Map();
 style.rel='stylesheet';style.href=new URL('./equalization-menu.css',import.meta.url).href;
 menu.className='eq-menu';menu.dataset.equalization='';popover.className='eq-popover';popover.setAttribute('popover','manual');parameter.className='eq-parameter';heading.className='eq-heading';list.className='eq-methods';list.setAttribute('role','menu');slider.type='range';slider.dataset.equalizationParameter='';slider.id='eq-value-'+Math.random().toString(36).slice(2);label.htmlFor=slider.id;heading.append(label,output);parameter.append(heading,slider);popover.append(parameter,list);menu.append(summary,popover);host.append(style,menu);
 const microParameter=node('div'),microHeading=node('div'),microLabel=node('label'),microOutput=node('output'),microSlider=node('input'),choices=node('div'),precision=node('input'),computationMode=node('select'),modeNotice=node('output'),effectiveNotice=node('output'),backend=node('select');
 microParameter.className='eq-parameter';microHeading.className='eq-heading';microSlider.type='range';microSlider.min='0';microSlider.max='100';microSlider.step='any';microSlider.dataset.equalizationMicro='';microSlider.id=slider.id+'-micro';microLabel.htmlFor=microSlider.id;microHeading.append(microLabel,microOutput);microParameter.append(microHeading,microSlider);
 // Retain the returned control handles for integrations, without mounting
 // unavailable choices or transient computation notices in the popover.
 choices.className='eq-parameter eq-sherloq-size';precision.type='hidden';precision.value='1e-2';
 for(const [select,value]of [[computationMode,'fast'],[backend,'auto']]){const option=node('option',value);option.value=value;select.append(option);select.value=value;select.hidden=select.disabled=true;}
 modeNotice.hidden=effectiveNotice.hidden=true;
 const maxSide=node('select'),sizeNotice=node('output');maxSide.id=slider.id+'-max-side';maxSide.dataset.sherloqMaxSide='';for(const value of ['256','512','1024','2048','native']){const option=node('option',value==='native'?'Taille réelle':value+' px');option.value=value;maxSide.append(option);}sizeNotice.hidden=true;choices.append(maxSide);
 const retainedNotice=node('p');retainedNotice.className='eq-retained-notice';retainedNotice.setAttribute('role','status');retainedNotice.hidden=true;
 popover.insertBefore(microParameter,list);popover.insertBefore(choices,list);popover.insertBefore(retainedNotice,list);
 let draft=null,last='histogram',disposed=false,portaled=false,experimental=experimentalTools()===true;
 const topLayer=typeof popover.showPopover==='function';
 function position(){if(!disposed&&menu.open)positionViewportPopup(summary,popover,{align:'start'});}
 function show(){if(menu.open){if(topLayer){if(!popover.matches(':popover-open'))popover.showPopover();}else{if(!portaled){const root=menu.getRootNode();(root.nodeType===11?root:doc.body).append(popover);portaled=true;}popover.hidden=false;}position();}else if(topLayer){if(popover.matches(':popover-open'))popover.hidePopover();}else popover.hidden=true;}
 menu.addEventListener('toggle',show);style.addEventListener('load',position);doc.addEventListener('scroll',position,true);doc.defaultView?.addEventListener('resize',position);if(!topLayer)popover.hidden=true;
 // Size changes reposition the menu; ordinary value/proxy updates never force layout.
 const geometryObserver=doc.defaultView?.ResizeObserver?new doc.defaultView.ResizeObserver(position):null;geometryObserver?.observe(popover);geometryObserver?.observe(summary);doc.defaultView?.visualViewport?.addEventListener('resize',position);doc.defaultView?.visualViewport?.addEventListener('scroll',position);
 const state=()=>draft??equalizationState(getState()),snapshot=()=>structuredClone(state());
 function sync(){
  if(disposed)return;const nextExperimental=experimentalTools()===true;if(experimental&&!nextExperimental){menu.open=false;show();}experimental=nextExperimental;
  const p=state(),fr=language()==='fr',m=equalizationMethods.find(m=>m.id===p.method),shown=m??equalizationMethods.find(m=>m.id===last)??equalizationMethods[0];if(m)last=m.id;const index=equalizationMethods.indexOf(shown),v=p.values[index],locked=disabled(),retained=p.method==='sherloq7c'&&!experimental;
  summary.textContent=(fr?'Égalisation':'Equalization')+' · '+(m?(m.id==='histogram'&&!fr?'Histogram':m.name):(noneLabel?.()??(fr?'Sans':'None')));
  if(m?.id==='sherloq7c')summary.textContent=(fr?'Égalisation':'Equalization')+' · SHERLOQ'+(retained?(fr?' · réglages conservés':' · retained settings'):'');
  summary.setAttribute('aria-label',summary.textContent);slider.min=shown.min;slider.max=shown.max;slider.step=shown.continuous?'any':shown.step;slider.value=v;slider.disabled=locked||!m||retained;slider.setAttribute('aria-label',shown.parameter+' · '+(shown.id==='sherloq7c'?'SHERLOQ':shown.name));label.textContent=fr?shown.parameter:({Intensité:'Strength',Profondeur:'Depth','Limite de contraste':'Contrast limit','Tuiles par axe':'Tiles per axis','Poids des effectifs':'Count weight','Lissage de l’histogramme · σ':'Histogram smoothing · σ','Exposant de pondération':'Weighting exponent','Facteur d’écrêtage':'Clip factor',Voisinage:'Neighborhood','Pondération · α':'Weighting · α'}[shown.parameter]??shown.parameter);output.textContent=v.toLocaleString(fr?'fr-FR':'en-US',{maximumFractionDigits:4})+(shown.unit?' '+shown.unit:'');
  if(shown.id==='sherloq7c')label.textContent=fr?'Révélation':'Revelation';
  for(const control of [slider,microSlider]){if(p.method==='sherloq7c'){control.dataset.hoverSliderIncrement='1';control.dataset.hoverSliderSnap='true';}else{delete control.dataset.hoverSliderIncrement;delete control.dataset.hoverSliderSnap;}}
  const spatial=p.method==='sherloq7c',sherloq=p.sherloq7c;microParameter.hidden=choices.hidden=!spatial;microSlider.disabled=locked||!spatial||retained;precision.value='1e-2';computationMode.value='fast';backend.value='auto';microSlider.value=sherloq.micro;microLabel.textContent=fr?'Microcontrastes':'Microcontrast';microSlider.setAttribute('aria-label',microLabel.textContent+' · SHERLOQ');microOutput.textContent=Number(sherloq.micro).toLocaleString(fr?'fr-FR':'en-US',{maximumFractionDigits:4})+' %';
  maxSide.value=String(sherloq.maxSide??512);maxSide.disabled=locked||!spatial||retained;maxSide.setAttribute('aria-label',fr?'Taille de sortie':'Output size');maxSide.title=fr?'Taille de sortie':'Output size';maxSide.options[4].textContent=fr?'Taille réelle':'Native size';
  retainedNotice.hidden=!retained;retainedNotice.textContent=fr?'SHERLOQ est actif avec les réglages enregistrés. Activez les outils expérimentaux pour les modifier.':'SHERLOQ is active with the saved settings. Enable experimental tools to edit them.';
  const focusId=retained?'none':p.method;
  for(const [id,b]of buttons){b.hidden=id==='sherloq7c'&&!experimental;b.disabled=locked;b.setAttribute('aria-checked',String(p.method===id));b.tabIndex=!b.hidden&&focusId===id?0:-1;if(id==='none')b.textContent=noneLabel?.()??(fr?'Sans égalisation':'No equalization');else if(id==='histogram')b.textContent=fr?'Histogramme':'Histogram';else if(id==='sherloq7c')b.textContent='SHERLOQ';}
  if(!geometryObserver)position();
 }
 function choose(id){if(disabled()||id==='sherloq7c'&&experimentalTools()!==true)return;draft=snapshot();draft.method=id;sync();onChange?.(snapshot(),'method');draft=null;sync();}
 for(const m of [...equalizationMethods,{id:'none',name:'Sans égalisation'}]){const button=node('button',m.name);button.type='button';button.dataset.method=m.id;if(m.preferred)button.dataset.preferred='true';button.setAttribute('role','menuitemradio');button.addEventListener('click',()=>choose(m.id));buttons.set(m.id,button);list.append(button);}
 const canEdit=()=>!disabled()&&(state().method!=='sherloq7c'||experimentalTools()===true);
 slider.addEventListener('input',()=>{if(!canEdit())return;const p=snapshot(),i=equalizationMethods.findIndex(m=>m.id===p.method);if(i<0)return;p.values[i]=Number(slider.value);draft=p;sync();onChange?.(snapshot(),'input');});
 slider.addEventListener('change',()=>{if(!canEdit())return;onChange?.(snapshot(),'change');draft=null;sync();});
 microSlider.addEventListener('input',()=>{if(!canEdit())return;const p=snapshot();p.sherloq7c={...p.sherloq7c,micro:Number(microSlider.value)};draft=p;sync();onChange?.(snapshot(),'input');});
 microSlider.addEventListener('change',()=>{if(!canEdit())return;onChange?.(snapshot(),'change');draft=null;sync();});
 maxSide.addEventListener('change',()=>{if(!canEdit())return;const p=snapshot();p.sherloq7c={...p.sherloq7c,maxSide:maxSide.value==='native'?'native':Number(maxSide.value)};draft=p;sync();onChange?.(snapshot(),'change');draft=null;sync();});
 list.addEventListener('keydown',event=>{const ids=[...buttons.keys()].filter(id=>!buttons.get(id).hidden),i=ids.indexOf(event.target.dataset.method);let k;if(i<0)return;if(event.key==='ArrowDown')k=(i+1)%ids.length;else if(event.key==='ArrowUp')k=(i+ids.length-1)%ids.length;else if(event.key==='Home')k=0;else if(event.key==='End')k=ids.length-1;else return;event.preventDefault();event.stopPropagation();buttons.get(ids[k]).focus();});
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();menu.open=false;summary.focus();event.stopPropagation();}else if(event.key==='Enter'||event.key===' ')event.stopPropagation();});
 const outside=event=>{if(!event.composedPath().includes(menu)&&!event.composedPath().includes(popover))menu.open=false;};doc.addEventListener('pointerdown',outside);sync();
 return {element:menu,slider,microSlider,precision,computationMode,backend,maxSide,sizeNotice,modeNotice,effectiveNotice,snapshot,sync,reset(){draft=null;sync();},dispose(){disposed=true;geometryObserver?.disconnect();doc.defaultView?.visualViewport?.removeEventListener('resize',position);doc.defaultView?.visualViewport?.removeEventListener('scroll',position);doc.removeEventListener('pointerdown',outside);doc.removeEventListener('scroll',position,true);doc.defaultView?.removeEventListener('resize',position);if(topLayer&&popover.matches(':popover-open'))popover.hidePopover();popover.remove();menu.remove();style.remove();}};
}

// Mode belongs to the displayed result, not to an unfinished slider request.
export function sherloqComputationNotice(metrics,language='fr'){
 const m=metrics?.equalization?.sherloq7c??metrics,fr=language==='fr';
 if(!m||!['fast','precision'].includes(m.effectiveComputationMode))return null;
 const name=m.effectiveComputationMode==='fast'?(fr?'Rapide':'Fast'):(fr?'Précision':'Precision');
 return (fr?'Résultat affiché : ':'Displayed result: ')+name+(m.fallbackReason?(fr?' · repli sans GPU':' · fallback without GPU'):'');
}
