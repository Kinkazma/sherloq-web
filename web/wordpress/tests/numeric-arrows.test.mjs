import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {numericEditingIncrement} from '../sherloq-browser/assets/numeric-increment.js?v=0.32.0';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';
import {localFeaturePolicy} from '../sherloq-browser/assets/feature-policy.js';
import {toolCatalog,toolFields} from '../sherloq-browser/assets/tool-catalog.js';
import {numericSliderWindow} from '../sherloq-browser/assets/hover-sliders.js?v=0.32.0';
import {CLONE_ALGORITHMS,SSG_DEFAULTS} from '../sherloq-browser/assets/clone-methods.js';
import {ssgFullParams} from '../../engine-source/src/ssg-full-input.js';

// Linkedom has no constraint-validation implementation. Model the native number
// input rules independently of the generator, including HTML's min-based lattice.
function validity(input){
 const state={valid:true,valueMissing:false,badInput:false,rangeUnderflow:false,rangeOverflow:false,stepMismatch:false};
 if(input.disabled||input.type!=='number')return state;
 if(input.value===''){state.valueMissing=!!input.required;state.valid=!state.valueMissing;return state;}
 const value=Number(input.value);state.badInput=!Number.isFinite(value);
 if(input.min!==undefined&&input.min!=='')state.rangeUnderflow=value<Number(input.min);
 if(input.max!==undefined&&input.max!=='')state.rangeOverflow=value>Number(input.max);
 if(input.step!=='any'){
  const step=Number(input.step||1),base=Number(input.min||0),quotient=(value-base)/step;
  state.stepMismatch=Number.isFinite(quotient)&&Math.abs(quotient-Math.round(quotient))>1e-7;
 }
 state.valid=![state.valueMissing,state.badInput,state.rangeUnderflow,state.rangeOverflow,state.stepMismatch].some(Boolean);return state;
}
function environment(){
 const {document,window}=parseHTML('<html><body><section id="analysis-controls"></section><div id="viewport"></div></body></html>'),messages=[],changes=[];let language='fr';
 Object.defineProperty(globalThis,'document',{value:document,configurable:true,writable:true});
 Object.defineProperty(globalThis,'Option',{value:class{constructor(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;}},configurable:true,writable:true});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 window.HTMLInputElement.prototype.checkValidity=function(){return validity(this).valid;};
 window.HTMLInputElement.prototype.reportValidity=function(){this.validity=validity(this);if(!this.validity.valid)this.oninvalid?.();return this.validity.valid;};
 const workspace=createToolWorkspace({document,language:()=>language,getClient:async()=>{throw Error('No engine in control tests');},run(){},cancel(){},showSurface(){},download(){},notify:value=>messages.push(value),onSettings:value=>changes.push(value)});
 return {workspace,document,window,messages,changes,setLanguage:value=>language=value,parameter:key=>document.getElementById('tool-param-'+key.replaceAll('.','-'))};
}
test('Every generated continuous number retains an actionable editing increment',()=>{
 const h=environment();let count=0;try{for(const id of Object.keys(toolCatalog)){h.workspace.select(id);for(const field of toolFields(id).filter(f=>f.type==='number'&&!f.choices)){
  const input=h.parameter(field.key);if(input.step==='any'){count++;assert.ok(Number.isFinite(numericEditingIncrement(input))&&numericEditingIncrement(input)>0,id+'.'+field.key);}
 }}assert.ok(count>20);}finally{h.workspace.dispose();}
});
test('SHERLOQ arrows align to integers while the slider and typed values stay continuous',()=>{
 const h=environment();try{h.workspace.select('inspection.sherloq7c');
 for(const C of ['PointerEvent','KeyboardEvent'])if(!h.window[C])h.window[C]=class extends h.window.Event{constructor(type,init={}){super(type,init);for(const [key,value]of Object.entries(init))if(!(key in this))Object.defineProperty(this,key,{value});}};
 const click=(button,detail=1)=>{if(detail){button.dispatchEvent(new h.window.PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,pointerId:1,isPrimary:true}));h.document.dispatchEvent(new h.window.PointerEvent('pointerup',{bubbles:true,pointerId:1}));}else button.dispatchEvent(Object.assign(new h.window.Event('click',{bubbles:true,cancelable:true}),{detail:0}));};
 for(const field of ['revelation','micro']){
  const input=h.parameter(field);assert.equal(input.step,'any');assert.equal(numericEditingIncrement(input),1);input.setAttribute('step',input.step);assert.equal(numericSliderWindow(input).step,'any');
  const up=input.parentNode.querySelector('[data-numeric-direction="1"]'),down=input.parentNode.querySelector('[data-numeric-direction="-1"]');assert.ok(up&&down);
  h.workspace.lock(true,true,{dynamic:true});assert.equal(up.disabled,false);assert.equal(down.disabled,false);h.workspace.lock(true,true);assert.equal(up.disabled,true);assert.equal(down.disabled,true);h.workspace.lock(false,true);assert.equal(up.disabled,false);
  input.value='0.375';input.onchange();assert.equal(h.workspace.params()[field],.375);
  click(up);assert.equal(Number(input.value),1);assert.equal(h.workspace.params()[field],1);
  click(down,0);assert.equal(Number(input.value),0);assert.equal(h.workspace.params()[field],0);input.value='0.375';input.onchange();click(down);assert.equal(Number(input.value),0);
  input.value='99.75';input.onchange();click(up);assert.equal(Number(input.value),100);click(up);assert.equal(Number(input.value),100);
  input.value='0.25';input.onchange();click(down);assert.equal(Number(input.value),0);input.disabled=true;click(up);assert.equal(Number(input.value),0);input.disabled=false;
 }
 }finally{h.workspace.dispose();}
});


test('Other decimal editors keep their original fine increments and continuous sliders',()=>{
 const h=environment();try{for(const [operation,key,increment]of [['tampering.resampling','fourier.gamma',.1],['noise.noisesniffer','lowFrequencyFraction',.01]]){
  h.workspace.select(operation);const input=h.parameter(key);assert.equal(input.step,'any');assert.equal(numericEditingIncrement(input),increment);input.setAttribute('step',input.step);assert.equal(numericSliderWindow(input).step,'any');
 }}finally{h.workspace.dispose();}
});
