import test from 'node:test';import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountEqualizationMenu,equalizationState,equalizationMethods} from '../sherloq-browser/assets/equalization-menu.js';
import {toolCatalog} from '../sherloq-browser/assets/tool-catalog.js';
import {normalizeBatchSherloqParams} from '../sherloq-browser/assets/batch-sherloq-settings.js';
import {viewportPopupPosition} from '../sherloq-browser/assets/viewport-popup.js';
const index=equalizationMethods.findIndex(m=>m.id==='sherloq7c');
test('Fresh standalone, shared and batch SHERLOQ settings start at100percent',()=>{assert.equal(toolCatalog['inspection.sherloq7c'].params.revelation,100);assert.equal(toolCatalog['inspection.sherloq7c'].params.micro,100);const state=equalizationState();assert.equal(state.values[index],100);assert.equal(state.sherloq7c.micro,100);const batch=normalizeBatchSherloqParams();assert.equal(batch.revelation,100);assert.equal(batch.micro,100);});
test('Saved explicit zero and fractional SHERLOQ settings remain intentional',()=>{const state=equalizationState();state.values[index]=0;state.sherloq7c.micro=.375;const restored=equalizationState(state);assert.equal(restored.values[index],0);assert.equal(restored.sherloq7c.micro,.375);assert.equal(normalizeBatchSherloqParams({revelation:0,micro:0}).micro,0);});
for(const [width,height,anchor]of [[797,1243,{left:8,right:78,bottom:66}],[1360,420,{left:1000,right:1080,bottom:390}],[320,480,{left:250,right:310,bottom:460}]])test('Header menus stay inside '+width+'x'+height,()=>{const b=viewportPopupPosition(anchor,{width:244,height:640},{width,height},{align:'end'});assert.ok(b.left>=8);assert.ok(b.top>=8);assert.ok(b.left+Math.min(244,b.maxWidth)<=width-8);assert.ok(b.top+Math.min(640,b.maxHeight)<=height-8);});
test('Zoomed visual viewport offsets bound both axes',()=>{const b=viewportPopupPosition({left:110,right:180,bottom:650},{width:230,height:400},{left:100,top:300,width:350,height:380},{align:'end'});assert.ok(b.left>=108);assert.ok(b.top>=308);assert.ok(b.left+Math.min(230,b.maxWidth)<=442);assert.ok(b.top+Math.min(400,b.maxHeight)<=672);});


test('Shared SHERLOQ menus use integer nudges with continuous revelation and microcontrast ranges',()=>{
 const {document,window}=parseHTML('<html><body><section id="host"></section></body></html>');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 let reads=0;window.HTMLElement.prototype.getBoundingClientRect=()=>{reads++;return{left:8,right:238,top:20,bottom:50,width:230,height:30};};window.ResizeObserver=class{observe(){}disconnect(){}};
 let state=equalizationState();state.method='sherloq7c';const menu=mountEqualizationMenu(document.getElementById('host'),{getState:()=>state,experimentalTools:()=>true});
 try{
  for(const range of [menu.slider,menu.microSlider]){assert.equal(range.step,'any');assert.equal(range.dataset.hoverSliderIncrement,'1');assert.equal(range.dataset.hoverSliderSnap,'true');assert.equal(Number(range.value),100);}
  menu.element.open=true;reads=0;for(let i=0;i<20;i++){state.values[index]=i+.375;menu.sync();}assert.equal(reads,0,'Value updates do not force popup geometry reads');
  state.method='histogram';menu.sync();assert.equal(menu.slider.dataset.hoverSliderSnap,undefined);
 }finally{menu.dispose();}
});
