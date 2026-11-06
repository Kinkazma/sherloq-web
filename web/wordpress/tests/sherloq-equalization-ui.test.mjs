import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountEqualizationMenu,equalizationMethods,equalizationState} from '../sherloq-browser/assets/equalization-menu.js';
import {toolCatalog,toolFields,toolTitle} from '../sherloq-browser/assets/tool-catalog.js';
import {isExperimentalTool} from '../sherloq-browser/assets/extension-tools.js';
import {BackendModePreferences,defaultBackend} from '../sherloq-browser/assets/backend-mode-preferences.js';
import {mountLoupeEffectControls} from '../sherloq-browser/assets/loupe-effects-controls.js';
import {validateMediaPreferences} from '../sherloq-browser/assets/media-settings.js';

function navigatorFixture(value){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value});
 return()=>{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;};
}
function dom(){
 const {document,window}=parseHTML('<html lang="fr"><body><div id="host"></div></body></html>');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 window.HTMLElement.prototype.getBoundingClientRect=()=>({x:0,y:0,left:0,right:200,top:0,bottom:30,width:200,height:30});
 return{document,window,host:document.getElementById('host')};
}
function environment({experimental=false,saved}={}){
 const e=dom(),changes=[];let enabled=experimental,language='fr',state=saved??equalizationState();
 const menu=mountEqualizationMenu(e.host,{getState:()=>state,experimentalTools:()=>enabled,language:()=>language,onChange:(next,phase)=>{state=next;changes.push({next,phase});}});
 return{...e,menu,changes,get state(){return state;},setExperimental(value){enabled=value;menu.sync();},setLanguage(value){language=value;menu.sync();},button:id=>e.host.querySelector('[data-method="'+id+'"]')??e.document.querySelector('[data-method="'+id+'"]')};
}

test('SHERLOQ stays at its saved positional index and only its menu choice is experimental',()=>{
 assert.equal(equalizationMethods[16].id,'sherloq7c');assert.equal(equalizationMethods.length,17);
 const e=environment();try{
  assert.equal(e.button('sherloq7c').hidden,true);assert.equal(e.button('histogram').hidden,false);
  e.button('sherloq7c').click();assert.equal(e.changes.length,0);assert.equal(e.state.method,'none');
  e.setExperimental(true);assert.equal(e.button('sherloq7c').hidden,false);assert.equal(e.button('sherloq7c').textContent,'SHERLOQ');
  e.button('sherloq7c').click();assert.equal(e.state.method,'sherloq7c');assert.equal(e.menu.slider.disabled,false);
  assert.equal(e.state.values.length,17);assert.equal(e.state.values[16],0);
 }finally{e.menu.dispose();}
});

test('a saved SHERLOQ choice remains explicit and effective in normal mode without rewriting settings',()=>{
 const saved=equalizationState();saved.method='sherloq7c';saved.values[16]=27.125;saved.sherloq7c={micro:6.25,precision:'1e-4',backend:'cpu'};
 const original=structuredClone(saved),e=environment({saved});try{
  assert.equal(e.button('sherloq7c').hidden,true);assert.match(e.menu.element.querySelector('summary').textContent,/SHERLOQ.*réglages conservés/);
  const notice=e.host.querySelector('.eq-retained-notice');assert.equal(notice.hidden,false);assert.match(notice.textContent,/actif avec les réglages enregistrés/);
  for(const control of [e.menu.slider,e.menu.microSlider,e.menu.precision,e.menu.backend])assert.equal(control.disabled,true);
  e.menu.slider.value='55';e.menu.slider.dispatchEvent(new e.window.Event('input'));e.menu.microSlider.value='40';e.menu.microSlider.dispatchEvent(new e.window.Event('input'));
  assert.equal(e.changes.length,0);assert.deepEqual(e.state,original);assert.deepEqual(e.menu.snapshot(),original);
  e.setLanguage('en');assert.match(e.menu.element.querySelector('summary').textContent,/SHERLOQ.*retained settings/);assert.match(notice.textContent,/active with the saved settings/);
  e.button('histogram').click();assert.equal(e.state.method,'histogram');assert.equal(e.menu.slider.disabled,false);assert.equal(notice.hidden,true);assert.equal(e.state.values[16],27.125);
 }finally{e.menu.dispose();}
});

test('disabling experimental tools closes a portaled popover and preserves every SHERLOQ parameter',()=>{
 const saved=equalizationState();saved.method='sherloq7c';saved.values[16]=13.75;saved.sherloq7c={micro:2.5,precision:'reference',backend:'auto'};
 const e=environment({saved,experimental:true});try{
  e.menu.element.open=true;e.menu.element.dispatchEvent(new e.window.Event('toggle'));
  const popover=e.document.querySelector('.eq-popover');assert.equal(popover.hidden,false);
  const before=structuredClone(e.state);e.setExperimental(false);
  assert.equal(e.menu.element.open,false);assert.equal(popover.hidden,true);assert.deepEqual(e.state,before);assert.equal(e.changes.length,0);
  e.setExperimental(true);assert.equal(e.menu.slider.disabled,false);assert.equal(e.menu.slider.value,'13.75');assert.equal(e.menu.microSlider.value,'2.5');assert.equal(e.menu.precision.value,'reference');assert.equal(e.menu.backend.value,'auto');assert.deepEqual(e.state,before);
 }finally{e.menu.dispose();}
});

test('Inspection SHERLOQ is normal and bilingual, with passive GPU defaults and authoritative saved modes',()=>{
 assert.ok(toolCatalog['inspection.sherloq7c']);assert.equal(isExperimentalTool('inspection.sherloq7c'),false);
 assert.equal(toolTitle('inspection.sherloq7c','fr'),'Égalisation SHERLOQ');assert.equal(toolTitle('inspection.sherloq7c','en'),'SHERLOQ Equalization');
 assert.deepEqual(toolCatalog['inspection.sherloq7c'].params,{revelation:0,micro:0,precision:'1e-2'});
 assert.deepEqual(toolFields('inspection.sherloq7c').map(f=>f.key),['revelation','micro','precision']);
 let probes=0;const restore=navigatorFixture({gpu:{requestAdapter(){probes++;throw Error('No active probe');}}});try{
  assert.equal(defaultBackend('inspection.sherloq7c'),'webgpu');assert.equal(equalizationState().sherloq7c.backend,'webgpu');
  const cpu=equalizationState();cpu.sherloq7c.backend='cpu';assert.equal(equalizationState(cpu).sherloq7c.backend,'cpu');
  const modes=new BackendModePreferences({choices:[{tool:'inspection.sherloq7c',method:'default',mode:'cpu'}]});assert.equal(modes.get('inspection.sherloq7c'),'cpu');assert.equal(probes,0);
 }finally{restore();}
});

test('both loupe menus follow experimental visibility while saved effects remain intact',()=>{
 const e=dom();let enabled=false,preferences=validateMediaPreferences({loupe:{effects:{adjust:{enabled:true},enhance:{enabled:true}}}});
 const controls=mountLoupeEffectControls(e.host,{getPreferences:()=>preferences,setPreferences:value=>{preferences=value;},language:()=> 'fr',experimentalTools:()=>enabled});
 try{
  controls.sync();let choices=[...e.host.querySelectorAll('[data-method="sherloq7c"]')];assert.equal(choices.length,2);assert.ok(choices.every(n=>n.hidden));
  const before=structuredClone(preferences);enabled=true;controls.sync();assert.ok(choices.every(n=>!n.hidden));enabled=false;controls.sync();assert.ok(choices.every(n=>n.hidden));assert.deepEqual(preferences,before);
 }finally{controls.dispose();}
});
