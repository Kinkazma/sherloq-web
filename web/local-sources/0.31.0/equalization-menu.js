import {equalizationMethods,equalizationState,equalizationOperations} from './unified-engine/src/equalization-settings.js';
export {equalizationMethods,equalizationState,equalizationOperations};
export function readEqualization(parameters,operation){return equalizationState(parameters.equalization,parameters[equalizationOperations[operation]],operation);}
export function writeEqualization(parameters,state,operation){
 parameters.equalization=equalizationState(state);const key=equalizationOperations[operation],active=state.method!=='none';
 if(operation==='inspection.adjust')parameters.equalize=active?1:0;
 else if(operation==='inspection.magnifier')parameters.mode=active?'equalize':'contrast';
 else if(operation==='noise.separation'){if(active)parameters.levels=0;else if(parameters.levels===0)parameters.levels=255;}
 else if(key)parameters[key]=active;
}
// Only this panel is mounted: no viewer, navigation handlers or image state.
export function mountEqualizationMenu(host,{getState,onChange,language=()=> 'fr',noneLabel,disabled=()=>false}={}){
 const doc=host.ownerDocument,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;},style=node('link'),menu=node('details'),summary=node('summary'),popover=node('div'),parameter=node('div'),heading=node('div'),label=node('label'),output=node('output'),slider=node('input'),list=node('div'),buttons=new Map();
 style.rel='stylesheet';style.href=new URL('./equalization-menu.css',import.meta.url).href;
 menu.className='eq-menu';menu.dataset.equalization='';popover.className='eq-popover';popover.setAttribute('popover','manual');parameter.className='eq-parameter';heading.className='eq-heading';list.className='eq-methods';list.setAttribute('role','menu');slider.type='range';slider.dataset.equalizationParameter='';slider.id='eq-value-'+Math.random().toString(36).slice(2);label.htmlFor=slider.id;heading.append(label,output);parameter.append(heading,slider);popover.append(parameter,list);menu.append(summary,popover);host.append(style,menu);
 let draft=null,last='histogram',disposed=false,portaled=false;
 const topLayer=typeof popover.showPopover==='function';
 function position(){if(!menu.open)return;const rect=summary.getBoundingClientRect(),win=doc.defaultView??globalThis,box=popover.getBoundingClientRect(),width=win.innerWidth??1024,height=win.innerHeight??768;popover.style.left=Math.max(8,Math.min(rect.left,width-box.width-8))+'px';popover.style.top=Math.max(8,Math.min(rect.bottom+3,height-Math.min(box.height,height-16)-8))+'px';popover.style.maxHeight=Math.max(80,height-16)+'px';}
 function show(){if(menu.open){if(topLayer){if(!popover.matches(':popover-open'))popover.showPopover();}else{if(!portaled){const root=menu.getRootNode();(root.nodeType===11?root:doc.body).append(popover);portaled=true;}popover.hidden=false;}position();}else if(topLayer){if(popover.matches(':popover-open'))popover.hidePopover();}else popover.hidden=true;}
 menu.addEventListener('toggle',show);style.addEventListener('load',position);doc.addEventListener('scroll',position,true);doc.defaultView?.addEventListener('resize',position);if(!topLayer)popover.hidden=true;
 const state=()=>draft??equalizationState(getState()),snapshot=()=>structuredClone(state());
 function sync(){
  if(disposed)return;const p=state(),fr=language()==='fr',m=equalizationMethods.find(m=>m.id===p.method),shown=m??equalizationMethods.find(m=>m.id===last)??equalizationMethods[0];if(m)last=m.id;const index=equalizationMethods.indexOf(shown),v=p.values[index],locked=disabled();
  summary.textContent=(fr?'Égalisation':'Equalization')+' · '+(m?(m.id==='histogram'&&!fr?'Histogram':m.name):(noneLabel?.()??(fr?'Sans':'None')));
  summary.setAttribute('aria-label',summary.textContent);slider.min=shown.min;slider.max=shown.max;slider.step=shown.step;slider.value=v;slider.disabled=locked||!m;slider.setAttribute('aria-label',shown.parameter+' · '+shown.name);label.textContent=fr?shown.parameter:({Intensité:'Strength',Profondeur:'Depth','Limite de contraste':'Contrast limit','Tuiles par axe':'Tiles per axis','Poids des effectifs':'Count weight','Lissage de l’histogramme · σ':'Histogram smoothing · σ','Exposant de pondération':'Weighting exponent','Facteur d’écrêtage':'Clip factor',Voisinage:'Neighborhood','Pondération · α':'Weighting · α'}[shown.parameter]??shown.parameter);output.textContent=v.toLocaleString(fr?'fr-FR':'en-US',{maximumFractionDigits:4})+(shown.unit?' '+shown.unit:'');
  for(const [id,b]of buttons){b.disabled=locked;b.setAttribute('aria-checked',String(p.method===id));b.tabIndex=p.method===id?0:-1;if(id==='none')b.textContent=noneLabel?.()??(fr?'Sans égalisation':'No equalization');else if(id==='histogram')b.textContent=fr?'Histogramme':'Histogram';}
 }
 function choose(id){draft=snapshot();draft.method=id;sync();onChange?.(snapshot(),'method');draft=null;sync();}
 for(const m of [...equalizationMethods,{id:'none',name:'Sans égalisation'}]){const button=node('button',m.name);button.type='button';button.dataset.method=m.id;if(m.preferred)button.dataset.preferred='true';button.setAttribute('role','menuitemradio');button.addEventListener('click',()=>choose(m.id));buttons.set(m.id,button);list.append(button);}
 slider.addEventListener('input',()=>{const p=snapshot(),i=equalizationMethods.findIndex(m=>m.id===p.method);if(i<0)return;p.values[i]=Number(slider.value);draft=p;sync();onChange?.(snapshot(),'input');});
 slider.addEventListener('change',()=>{onChange?.(snapshot(),'change');draft=null;sync();});
 list.addEventListener('keydown',event=>{const ids=[...buttons.keys()],i=ids.indexOf(event.target.dataset.method);let k;if(i<0)return;if(event.key==='ArrowDown')k=(i+1)%ids.length;else if(event.key==='ArrowUp')k=(i+ids.length-1)%ids.length;else if(event.key==='Home')k=0;else if(event.key==='End')k=ids.length-1;else return;event.preventDefault();event.stopPropagation();buttons.get(ids[k]).focus();});
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();menu.open=false;summary.focus();event.stopPropagation();}else if(event.key==='Enter'||event.key===' ')event.stopPropagation();});
 const outside=event=>{if(!event.composedPath().includes(menu)&&!event.composedPath().includes(popover))menu.open=false;};doc.addEventListener('pointerdown',outside);sync();
 return {element:menu,slider,snapshot,sync,reset(){draft=null;sync();},dispose(){disposed=true;doc.removeEventListener('pointerdown',outside);doc.removeEventListener('scroll',position,true);doc.defaultView?.removeEventListener('resize',position);if(topLayer&&popover.matches(':popover-open'))popover.hidePopover();popover.remove();menu.remove();style.remove();}};
}
