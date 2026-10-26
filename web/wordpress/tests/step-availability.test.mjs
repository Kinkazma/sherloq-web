import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML,DOMParser} from 'linkedom';
import {mountWorkspace} from '../sherloq-browser/assets/workspace.js';
import {mountLoupeStepControls} from '../sherloq-browser/assets/loupe-step-controls.js';
import {effectDefaults} from '../sherloq-browser/assets/loupe-effects-settings.js';

const html=await readFile(new URL(import.meta.resolve('../sherloq-browser/assets/app.html')),'utf8'),panel=await readFile(new URL(import.meta.resolve('../sherloq-browser/assets/panel.html')),'utf8');
function selectValue(window){Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return[...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});}

test('a readiness-only refresh updates both step buttons without replacing an in-progress number or selected target',()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>');selectValue(window);
 let ready=false;const settings={target:'adjust.gamma',step:19},effects={...effectDefaults,adjust:{...effectDefaults.adjust,enabled:true}};
 const ui=mountLoupeStepControls(document.querySelector('main'),{getSettings:()=>settings,setSettings(){},getEffects:()=>effects,canStep:()=>ready,onStep(){}});
 const number=document.querySelector('[data-loupe-step=step]'),increase=document.querySelector('[data-loupe-step=increase]'),decrease=document.querySelector('[data-loupe-step=decrease]'),target=document.querySelector('[data-loupe-step=target]');
 assert.equal(increase.disabled,true);assert.equal(decrease.disabled,true);number.value='';ready=true;ui.refreshAvailability();assert.equal(increase.disabled,false);assert.equal(decrease.disabled,false);assert.equal(number.value,'','status refresh must not overwrite an editing draft');assert.equal(target.value,'adjust.gamma');
 ready=false;ui.refreshAvailability();assert.equal(increase.disabled,true);assert.equal(decrease.disabled,true);assert.equal(number.value,'');ui.dispose();assert.doesNotThrow(()=>ui.refreshAvailability());
});

function setup(){
 const {document,window}=parseHTML(html),frames=[],controllers=new Map();selectValue(window);
 for(const[key,value]of Object.entries({document,window,DOMParser,location:{hash:'#lang=fr',href:'http://localhost/app.html',origin:'http://localhost'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>(frames.push(fn),frames.length),cancelAnimationFrame(){},confirm:()=>true}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const common={activate(){},fit(){},zoomBy(){},setLanguage(){},setTheme(){},setNavigation(){},setComputeProfile(){},setHighlight(){},setLoupe(){},settings:()=>({}),dispose(){},pinLoupe(){}};
 const workspace=mountWorkspace(document,{fetcher:async()=>({ok:true,text:async()=>panel}),originalRegionsFactory:()=>({ready:Promise.resolve(),serialize:()=>null,dispose(){},refresh(){}}),
  async pdfFactory(options){const c={...common,kind:'pdf',capabilities:{session:false},busy:false,snapshot:()=>({busy:false,status:'PDF ready',hasResult:true,hasReport:false,progress:1,zoom:100}),loupePresentationIdentity:()=>({owner:'pdf-native',effectsKey:'pdf'}),exportSize:()=>({width:20,height:30})};controllers.set('pdf',c);return c;},
  panelFactory(_document,options){let file,native=false;const c={...common,busy:false,async load(value){file=value;},input:()=>({file,imageId:'ready-image',hash:'f'.repeat(64),description:'image fixture',source:{width:40,height:30,draw(){},close(){}}}),snapshot:()=>({busy:c.busy,status:'Image ready',hasResult:false,hasReport:false,progress:1,zoom:100}),loupePresentationIdentity:()=>native?{owner:'image-native',effectsKey:'image'}:null,nativeReady(value){native=value;options.changed();},setBusy(value){c.busy=value;options.changed();}};controllers.set('original',c);return c;}
 });
 return{document,window,workspace,controllers,flush(){while(frames.length)frames.shift()();},async dispose(){window.dispatchEvent(new window.Event('pagehide'));await workspace.closeAll();while(frames.length)frames.shift()();window.dispatchEvent(new window.Event('pagehide'));}};
}

test('an open loupe panel follows PDF to image readiness without requiring close/reopen or disturbing its step',async()=>{
 const h=setup();try{
  const enable=h.document.getElementById('global-loupe');enable.checked=true;enable.onchange({target:enable});const adjust=h.document.querySelector('[data-effect="adjust.enabled"]');adjust.checked=true;adjust.onchange();
  await h.workspace.openPDF(new File(['%PDF-1.7\ntransport'],'fixture.pdf',{type:'application/pdf'}));h.flush();h.document.getElementById('loupe-settings').onclick();
  const button=h.document.querySelector('[data-loupe-step=increase]'),number=h.document.querySelector('[data-loupe-step=step]'),dialog=h.document.getElementById('loupe-dialog');assert.equal(button.disabled,false,'ready PDF starts with usable step buttons');assert.equal(dialog.hasAttribute('open'),true);assert.equal(number.value,'10');
  await h.workspace.openImage(new File(['image transport'],'fixture.png',{type:'image/png'}),{preservePdfs:true});h.flush();assert.equal(button.disabled,true,'new image has no native presentation owner yet');assert.equal(dialog.hasAttribute('open'),true);assert.equal(number.value,'10');
  const image=h.controllers.get('original');image.nativeReady(true);h.flush();assert.equal(button.disabled,false,'readiness notification enables buttons without reopening R');assert.equal(dialog.hasAttribute('open'),true);assert.equal(number.value,'10');
  image.setBusy(true);h.flush();assert.equal(button.disabled,true,'a running calculation suspends step admission');image.setBusy(false);h.flush();assert.equal(button.disabled,false,'finishing resumes step admission');
  image.nativeReady(false);h.flush();assert.equal(button.disabled,true,'lost owner suspends admission');image.nativeReady(true);h.flush();assert.equal(button.disabled,false,'new native owner resumes admission');
 }finally{await h.dispose();}
});
