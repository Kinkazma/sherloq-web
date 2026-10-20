import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {installHoverSliders} from '../sherloq-browser/assets/hover-sliders.js';
test('compact popup reserves its value column even when Auto hides the duplicate value',async()=>{
 const css=await readFile(new URL(import.meta.resolve('../sherloq-browser/assets/hover-sliders.css')),'utf8');
 assert.match(css,/\.hover-slider-value\{[^}]*width:8ch;min-width:8ch;max-width:8ch;/);
 assert.match(css,/\[data-automatic="true"\] \.hover-slider-value\{visibility:hidden\}/);
 assert.doesNotMatch(css,/\[data-automatic="true"\] \.hover-slider-value\{display:none/);
});
test('full decimal and Auto values remain accessible while visual text may be truncated',()=>{
 const {document,window}=parseHTML('<html><body><label>Value<input id="n" type="number" min="0" max="1" step="any" value="0.930231712345678"></label></body></html>');
 window.HTMLElement.prototype.getBoundingClientRect=()=>({left:100,top:100,right:280,bottom:130,width:180,height:30});const input=document.getElementById('n'),api=installHoverSliders({root:document,enabled:true});
 try{input.dispatchEvent(Object.assign(new window.Event('pointerover',{bubbles:true}),{clientX:110,clientY:110,pointerType:'mouse'}));const active=api.active,label=active.popup.querySelector('.hover-slider-value');assert.equal(label.textContent,input.value);assert.equal(label.title,input.value);assert.equal(label.getAttribute('aria-label'),input.value);assert.equal(active.range.title,input.value);input.setAttribute('data-hover-slider-automatic','null');input.value='';api.refresh();assert.equal(active.popup.dataset.automatic,'true');assert.equal(label.title,'Automatique');assert.equal(active.range.getAttribute('aria-valuetext'),'Automatique');assert.equal(active.popup.querySelector('.hover-slider-auto-label').textContent,'Auto');}finally{api.dispose();}
});
