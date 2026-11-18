import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountLoupeEffectControls} from '../sherloq-browser/assets/loupe-effects-controls.js';
import {mountMediaControls} from '../sherloq-browser/assets/media-controls.js';
import {equalizationMethods,readEqualization} from '../sherloq-browser/assets/equalization-menu.js';
import {validateMediaPreferences} from '../sherloq-browser/assets/media-settings.js';

function dom(){
 const {document,window}=parseHTML('<html><body><details id="settings-menu"><div><hr></div></details><div id="panel"></div><div id="dialog"></div></body></html>');
 const select=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value'),bounds=Object.getOwnPropertyDescriptor(window.HTMLElement.prototype,'getBoundingClientRect');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 window.HTMLElement.prototype.getBoundingClientRect=()=>({x:0,y:0,left:0,right:200,top:0,bottom:30,width:200,height:30});
 return{document,window,close(){if(select)Object.defineProperty(window.HTMLSelectElement.prototype,'value',select);else delete window.HTMLSelectElement.prototype.value;if(bounds)Object.defineProperty(window.HTMLElement.prototype,'getBoundingClientRect',bounds);else delete window.HTMLElement.prototype.getBoundingClientRect;}};
}
const group=(host,name='enhance')=>host.querySelector('[data-effect-group="'+name+'"]');
const choose=(host,id)=>group(host).querySelector('[data-method="'+id+'"]').click();
const selected=host=>group(host).querySelector('[data-method][aria-checked="true"]').dataset.method;
function dual(){
 const d=dom(),hosts=['panel','dialog'].map(id=>d.document.getElementById(id)),controls=[];let preferences=validateMediaPreferences({loupe:{enabled:true,effects:{enhance:{enabled:true}}}}),stops=0;
 const sync=()=>{for(const c of controls)c.sync();};
 for(const host of hosts)controls.push(mountLoupeEffectControls(host,{getPreferences:()=>preferences,setPreferences:value=>{preferences=validateMediaPreferences(value);sync();},language:()=> 'fr',experimentalTools:()=>true,forced:name=>name==='enhance',stopSweep:()=>{stops++;}}));sync();
 return{...d,hosts,controls,sync,get preferences(){return preferences;},get stops(){return stops;},close(){for(const c of controls)c.dispose();d.close();}};
}

test('both loupe control mounts retain every explicit equalization method and its parameter',()=>{
 const h=dual();try{
  for(const method of equalizationMethods){choose(h.hosts[0],method.id);assert.equal(h.preferences.loupe.effects.enhance.equalization.method,method.id);assert.equal(h.preferences.loupe.effects.enhance.mode,'equalize');assert.equal(selected(h.hosts[0]),method.id);assert.equal(selected(h.hosts[1]),method.id);}
  choose(h.hosts[0],'clahe');const slider=group(h.hosts[0]).querySelector('[data-equalization-parameter]');slider.value='12.5';slider.dispatchEvent(new h.window.Event('input',{bubbles:true}));
  assert.equal(readEqualization(h.preferences.loupe.effects.enhance,'inspection.magnifier').values[1],12.5);assert.equal(group(h.hosts[1]).querySelector('[data-equalization-parameter]').value,'12.5');
  choose(h.hosts[1],'ahe');assert.equal(selected(h.hosts[0]),'ahe','the other menu must discard its previous slider draft');assert.equal(selected(h.hosts[1]),'ahe');
  slider.dispatchEvent(new h.window.Event('change',{bubbles:true}));assert.equal(h.preferences.loupe.effects.enhance.equalization.method,'ahe','a late change cannot restore the obsolete method');assert.equal(h.preferences.loupe.effects.enhance.equalization.values[1],12.5,'other methods keep their saved parameter');
 }finally{h.close();}
});

test('the active Enhanced magnifier checkbox can disable and restore its saved method',()=>{
 const h=dual();try{
  choose(h.hosts[0],'ahe');const before=structuredClone(h.preferences.loupe.effects.enhance.equalization),box=group(h.hosts[1]).querySelector('[data-effect="enhance.enabled"]');assert.equal(box.disabled,false);
  box.checked=false;box.dispatchEvent(new h.window.Event('change',{bubbles:true}));assert.equal(h.preferences.loupe.effects.enhance.enabled,false);assert.ok(h.hosts.every(host=>!group(host).querySelector('[data-effect="enhance.enabled"]').checked));assert.deepEqual(h.preferences.loupe.effects.enhance.equalization,before);assert.ok(h.stops>0,'disabling stops a running sweep');
  box.checked=true;box.dispatchEvent(new h.window.Event('change',{bubbles:true}));assert.equal(h.preferences.loupe.effects.enhance.enabled,true);assert.deepEqual(h.preferences.loupe.effects.enhance.equalization,before);assert.ok(h.hosts.every(host=>selected(host)==='ahe'));
  choose(h.hosts[1],'none');assert.equal(h.preferences.loupe.effects.enhance.enabled,true);assert.equal(h.preferences.loupe.effects.enhance.mode,'contrast');assert.equal(h.preferences.loupe.effects.enhance.equalization.method,'none');assert.ok(h.hosts.every(host=>group(host).querySelector('.eq-menu summary').textContent.includes('Contraste automatique')),'no equalization keeps the historical Auto contrast meaning');
 }finally{h.close();}
});

test('the media-dialog enhancement-context fallback forwards enabled-only changes',()=>{
 const d=dom();let preferences=validateMediaPreferences({loupe:{enabled:true}}),context=validateMediaPreferences({loupe:{effects:{enhance:{enabled:true,mode:'equalize'}}}}).loupe.effects.enhance,ui;const calls=[];
 ui=mountMediaControls(d.document,{getPreferences:()=>preferences,setPreferences:value=>{preferences=validateMediaPreferences(value);ui?.sync();},language:()=> 'fr',getEnhancementContext:()=>context,setEnhancementContext:value=>{calls.push(structuredClone(value));context=value;}});
 try{
  const host=d.document.getElementById('loupe-dialog'),box=group(host).querySelector('[data-effect="enhance.enabled"]');assert.equal(box.checked,true);assert.equal(box.disabled,false);
  box.checked=false;box.dispatchEvent(new d.window.Event('change',{bubbles:true}));assert.equal(calls.length,1);assert.equal(context.enabled,false);assert.equal(context.mode,'equalize');assert.equal(preferences.loupe.effects.enhance.enabled,false,'the active-tool context does not overwrite global loupe effect preferences');
  box.checked=true;box.dispatchEvent(new d.window.Event('change',{bubbles:true}));assert.equal(calls.length,2);assert.equal(context.enabled,true);assert.equal(context.mode,'equalize');
 }finally{ui.dispose();d.close();}
});
