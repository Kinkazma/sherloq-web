import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML,DOMParser} from 'linkedom';
import {mountWorkspace} from '../sherloq-browser/assets/workspace.js';
const html=await readFile(new URL('../sherloq-browser/assets/app.html',import.meta.url),'utf8');
const panel=await readFile(new URL('../sherloq-browser/assets/panel.html',import.meta.url),'utf8');
function setup(){
 const {document,window}=parseHTML(html),controllers=new Map();
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 const frames=[];for(const [key,value]of Object.entries({document,window,DOMParser,location:{hash:'#lang=fr',href:'http://localhost/app.html',origin:'http://localhost'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>(frames.push(fn),frames.length),confirm:()=>true}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 let stopped=0,loads=0;
 const workspace=mountWorkspace(document,{fetcher:async()=>({ok:true,text:async()=>panel}),panelFactory(_,{toolId,sourceOnly,requestExport}){
  let file=null,adopted=null;const id=sourceOnly?'original':toolId;
  const c={busy:false,async load(value){loads++;file=value;},adopt(input){adopted=input;},input(){return adopted||{file,imageId:'shared-original',hash:'same-hash',source:{width:100,height:100,draw(){},close(){}},description:'fixture transport'};},snapshot(){return {busy:c.busy,hasResult:false,hasReport:false,status:'ready',progress:0,zoom:100};},activate(){},settings(){return {};},setHighlight(value){c.highlight=value;},setLoupe(value){c.loupe={...value};},exportImage(settings){if(settings){c.exported=settings;return;}return requestExport(settings=>{c.exported=settings;});},setLanguage(){},setTheme(){},setNavigation(){},setComputeProfile(){},dispose(){stopped++;},fit(){},zoomBy(){}};controllers.set(id,c);return c;
 }});
 return {document,workspace,controllers,counts:()=>({stopped,loads}),flush(){while(frames.length)frames.shift()();}};
}
test('The shipped shell has no empty tabs/windows; language and layout do not reopen categories',async()=>{
 const h=setup(),$=id=>h.document.getElementById(id);h.flush();assert.equal($('workspace-tabs').hidden,true);assert.equal(h.document.querySelectorAll('.document-window').length,0);
 const group=$('tool-tree').querySelector('details');assert.equal(group.open,false);group.open=true;group.ontoggle();$('toggle-tools').onclick();$('layout-cascade').onclick();$('language-toggle').onclick();h.flush();
 assert.equal(h.workspace.state.toolsVisible,false);assert.equal(h.workspace.state.groups.has('Favorites'),true);assert.equal($('tool-tree').querySelector('details').open,true);assert.equal(h.document.querySelectorAll('.document-window').length,0);assert.equal($('workspace-tabs').hidden,true);
});
test('Tab selection preserves a running controller and original; close all removes every document',async()=>{
 const h=setup(),file=new Blob(['transport only, no decoded image']);await h.workspace.openImage(file);await h.workspace.openTool('analysis.complete');await h.workspace.openTool('inspection.adjust');h.flush();
 h.controllers.get('analysis.complete').busy=true;h.workspace.selectDocument('analysis.complete');h.workspace.selectDocument('original');h.workspace.selectDocument('inspection.adjust');h.document.getElementById('language-toggle').onclick();h.workspace.selectDocument('analysis.complete');h.flush();
 assert.deepEqual(h.counts(),{loads:1,stopped:0});assert.equal(h.controllers.get('analysis.complete').busy,true);assert.equal(h.controllers.get('inspection.adjust').input().file,file);assert.equal(h.workspace.state.documents.size,3);
 await h.workspace.closeAll();h.flush();assert.equal(h.workspace.state.documents.size,0);assert.equal(h.document.querySelectorAll('.document-window').length,0);assert.equal(h.document.getElementById('workspace-tabs').hidden,true);assert.equal(h.document.getElementById('welcome').hidden,false);assert.equal(h.counts().stopped,3);
});
test('Closing only the Original view retains the shared source while an analysis exists',async()=>{
 const h=setup();await h.workspace.openImage(new Blob(['transport']));await h.workspace.openTool('file.hex');await h.workspace.closeDocument('original');assert.equal(h.counts().stopped,0);assert.equal(h.workspace.state.documents.has('original'),false);await h.workspace.openTool('original');assert.deepEqual(h.counts(),{loads:1,stopped:0});await h.workspace.closeAll();h.flush();
});
test('A slow worker cleanup cannot leave the closed tab or an empty active view on screen',async()=>{
 const h=setup();await h.workspace.openImage(new Blob(['transport']));await h.workspace.openTool('file.hex');let finish;
 h.controllers.get('file.hex').dispose=()=>new Promise(r=>finish=r);
 const closing=h.workspace.closeDocument('file.hex');h.flush();assert.equal(h.workspace.state.active,'original');assert.equal(h.document.querySelectorAll('.document-window').length,1);assert.equal(h.document.querySelector('.document-window').hidden,false);await new Promise(r=>setImmediate(r));finish();await closing;await h.workspace.closeAll();h.flush();
});

test('New-algorithm highlighting reaches existing and newly opened panel documents',async()=>{
 const h=setup();await h.workspace.openImage(new Blob(['transport']));await h.workspace.openTool('tampering.copyMove.sparse');const checkbox=h.document.getElementById('highlight-tools');checkbox.checked=true;checkbox.onchange();assert.equal(h.controllers.get('tampering.copyMove.sparse').highlight,true);await h.workspace.openTool('colors.pca');assert.equal(h.controllers.get('colors.pca').highlight,true);checkbox.checked=false;checkbox.onchange();assert.equal(h.controllers.get('colors.pca').highlight,false);await h.workspace.closeAll();
});

test('shipped menu wires L, all open panels, fonts and the export chooser',async()=>{
 const h=setup(),$=id=>h.document.getElementById(id);assert.ok($('global-loupe'));assert.ok($('interface-font'));assert.ok($('image-export-dialog'));assert.equal($('app-version').textContent,'0.14.3');
 await h.workspace.openImage(new Blob(['transport']));await h.workspace.openTool('ela.classic');
 const event=new h.document.defaultView.Event('keydown',{bubbles:true,cancelable:true});event.key='l';event.code='KeyQ';h.document.dispatchEvent(event);
 assert.equal($('global-loupe').checked,true);for(const c of h.controllers.values())assert.equal(c.loupe.enabled,true);
 $('interface-font').value='montserrat';$('interface-font').onchange({target:$('interface-font')});assert.match(h.document.documentElement.style.getPropertyValue('--ui-font'),/Montserrat/);
 $('loupe-settings').onclick();assert.ok($('loupe-dialog').hasAttribute('open'));
 const original=h.controllers.get('original'),exporting=original.exportImage();assert.equal(original.exported,undefined);assert.ok($('image-export-dialog').hasAttribute('open'));
 const format=$('image-export-dialog').querySelector('[data-export="format"]');assert.deepEqual([...format.options].map(o=>o.value),['avif','webp','heic','png','tiff']);format.value='heic';format.oninput();
 $('image-export-dialog').querySelector('[data-action="export"]').onclick();await exporting;assert.equal(original.exported.format,'heic');await h.workspace.closeAll();
});
test('Alt and logical O compare only the active document; release, blur and tab changes restore it',async()=>{
 const h=setup();await h.workspace.openImage(new Blob(['transport']));await h.workspace.openTool('ela.classic');const original=h.controllers.get('original'),ela=h.controllers.get('ela.classic');for(const c of [original,ela])c.setCompareOriginal=value=>{c.comparing=value;};
 const send=(type,key,target=h.document)=>{const e=new h.document.defaultView.Event(type,{bubbles:true,cancelable:true});e.key=key;target.dispatchEvent(e);return e;};
 send('keydown','o');assert.equal(ela.comparing,true);send('keydown','Alt');send('keyup','o');assert.equal(ela.comparing,true);h.workspace.selectDocument('original');assert.equal(ela.comparing,false);assert.equal(original.comparing,true);send('keyup','Alt');assert.equal(original.comparing,false);
 const input=h.document.createElement('input');h.document.body.append(input);send('keydown','o',input);assert.equal(original.comparing,false);send('keydown','O');assert.equal(original.comparing,true);h.document.defaultView.dispatchEvent(new h.document.defaultView.Event('blur'));assert.equal(original.comparing,false);await h.workspace.closeAll();
});

test('quick export executes the stored preset directly without showing export controls',async()=>{const h=setup();await h.workspace.openImage(new Blob(['transport']));h.flush();const action=h.document.getElementById('quick-export-image');assert.equal(action.disabled,false);action.onclick();const original=h.controllers.get('original');assert.equal(original.exported.format,'webp');assert.equal(original.exported.webpLossless,true);assert.equal(h.document.getElementById('image-export-dialog').hasAttribute('open'),false);await h.workspace.closeAll();});

test('R pins only the active loupe, is non-modal, retargets tabs and closes with Escape',async()=>{
 const h=setup();await h.workspace.openImage(new Blob(['transport']));await h.workspace.openTool('ela.classic');for(const c of h.controllers.values()){c.pinLoupe=v=>c.pinned=v;c.loupeAnchor=()=>({x:100,y:200});}
 const send=(key,target=h.document)=>{const e=new h.document.defaultView.Event('keydown',{bubbles:true,cancelable:true});e.key=key;target.dispatchEvent(e);};const dialog=h.document.getElementById('loupe-dialog');send('r');assert.equal(dialog.hasAttribute('open'),true);assert.equal(h.controllers.get('ela.classic').pinned,true);assert.equal(dialog.dataset.side,'right');assert.equal(h.document.getElementById('loupe-settings').querySelector('kbd').textContent,'R');
 h.workspace.selectDocument('original');assert.equal(h.controllers.get('ela.classic').pinned,false);assert.equal(h.controllers.get('original').pinned,true);const input=dialog.querySelector('input');send('r',input);assert.equal(dialog.hasAttribute('open'),true);send('Escape');assert.equal(dialog.hasAttribute('open'),false);assert.equal(h.controllers.get('original').pinned,false);await h.workspace.closeAll();
});
test('Enhanced tool opens with loupe on, preserves manual off, and R edits its own parameters only',async()=>{
 const h=setup(),$=id=>h.document.getElementById(id);await h.workspace.openImage(new Blob(['transport']));await h.workspace.openTool('inspection.magnifier');const c=h.controllers.get('inspection.magnifier');assert.equal(c.loupe.enabled,true);
 let enhance={enabled:true,mode:'contrast',percent:23,channel:true};c.loupeEnhancement=()=>enhance;c.setLoupeEnhancement=value=>{enhance={...value};};c.loupeMinimum=()=>40;
 $('loupe-settings').onclick();const dialog=$('loupe-dialog'),field=key=>dialog.querySelector('[data-effect="enhance.'+key+'"]');assert.equal(field('enabled').disabled,true);assert.equal(field('mode').value,'contrast');field('percent').value='17';field('percent').oninput();assert.equal(enhance.percent,17);assert.equal(c.loupe.effects.enhance.percent,20);assert.equal(c.loupe.effects.enhance.enabled,false);
 const unlock=dialog.querySelector('[data-loupe="unlock"]');assert.equal(unlock.disabled,true);assert.equal(dialog.querySelector('[data-loupe="zoom"]').min,'40');
 const event=new h.document.defaultView.Event('keydown',{bubbles:true,cancelable:true});event.key='l';h.document.dispatchEvent(event);assert.equal(c.loupe.enabled,false);await h.workspace.openTool('inspection.magnifier');assert.equal(c.loupe.enabled,false);
 h.workspace.selectDocument('original');assert.equal(field('enabled').disabled,false);assert.equal(field('enabled').checked,false);assert.equal(unlock.disabled,false);await h.workspace.closeAll();
});
