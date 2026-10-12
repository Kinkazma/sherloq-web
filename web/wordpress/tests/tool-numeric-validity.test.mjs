import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';
import {toolCatalog,toolFields} from '../sherloq-browser/assets/tool-catalog.js';

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
test('All generated numeric defaults pass native bounds and stepping rules, including automatic empty fields',()=>{
 const h=environment(),invalid=[];let count=0;
 for(const id of Object.keys(toolCatalog)){
  h.workspace.select(id);
  for(const field of toolFields(id).filter(field=>field.type==='number'&&!field.choices)){
   const input=h.parameter(field.key);count++;
   if(!input.checkValidity())invalid.push({id,key:field.key,value:input.value,min:input.min,max:input.max,step:input.step,validity:validity(input)});
   assert.equal(input.required,!field.nullable,id+'.'+field.key);
  }
 }
 const expected=Object.keys(toolCatalog).reduce((total,id)=>total+toolFields(id).filter(field=>field.type==='number'&&!field.choices).length,0);
 assert.ok(count>60,'Audit covers catalogue numeric fields');assert.equal(count,expected);assert.deepEqual(invalid,[]);
});
test('Decimal parameters accept scientific values between UI increments without weakening bounds',()=>{
 const h=environment();h.workspace.select('tampering.resampling');const gamma=h.parameter('fourier.gamma');
 assert.equal(gamma.step,'any');assert.equal(Number(gamma.min),0);assert.equal(Number(gamma.max),5);
 gamma.value='4.05';gamma.onchange();assert.equal(gamma.checkValidity(),true);assert.equal(h.workspace.params().fourier.gamma,4.05);
 gamma.value='5.1';gamma.onchange();assert.equal(gamma.reportValidity(),false);assert.equal(h.workspace.params().fourier.gamma,4.05);assert.match(h.messages.at(-1),/Gamma.*maximale.*5/);
 gamma.value='-0.1';gamma.onchange();assert.match(h.messages.at(-1),/Gamma.*minimale.*0/);
 gamma.value='';gamma.onchange();assert.match(h.messages.at(-1),/nombre valide/);assert.equal(h.workspace.params().fourier.gamma,4.05);
});
test('Decimal keyboard editing retains schema increments, stable decimals and endpoint bounds',()=>{
 const h=environment();h.workspace.select('tampering.resampling');const gamma=h.parameter('fourier.gamma'),edit=key=>{let prevented=false,stopped=false;gamma.onkeydown({key,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});return {prevented,stopped};};
 gamma.value='4';assert.deepEqual(edit('ArrowUp'),{prevented:true,stopped:true});assert.equal(Number(gamma.value),4.1);assert.equal(h.workspace.params().fourier.gamma,4.1);
 gamma.value='4.95';edit('ArrowUp');assert.equal(Number(gamma.value),5);gamma.value='0.05';edit('ArrowDown');assert.equal(Number(gamma.value),0);
 h.workspace.select('noise.noisesniffer');const fraction=h.parameter('lowFrequencyFraction');fraction.value='.1';fraction.onkeydown({key:'ArrowUp',preventDefault(){},stopPropagation(){}});assert.equal(fraction.value,'0.11');assert.equal(h.workspace.params().lowFrequencyFraction,.11);
 fraction.disabled=true;fraction.onkeydown({key:'ArrowUp',preventDefault(){throw Error('Disabled edit');},stopPropagation(){}});assert.equal(fraction.value,'0.11');
});
test('Integer and parity constraints survive restored invalid values; Calculate blockers report the field',()=>{
 const h=environment();h.workspace.restore({'m2.cfa':{block:33}});h.workspace.select('m2.cfa');const block=h.parameter('block');
 assert.equal(Number(block.step),2);assert.equal(block.reportValidity(),false);assert.match(h.messages.at(-1),/Bloc.*pas de 2.*8/);
 block.value='32.5';block.onchange();assert.equal(h.workspace.params().block,33,'Invalid edits do not replace saved parameters');
 block.value='32';block.onchange();assert.equal(h.workspace.params().block,32);assert.equal(block.checkValidity(),true);
 h.setLanguage('en');block.value='7';block.reportValidity();assert.match(h.messages.at(-1),/Invalid setting.*Minimum value: 8/);
 h.workspace.select('detail.wavelets');const level=h.parameter('level');assert.equal(level.value,'');assert.equal(level.required,false);assert.equal(level.checkValidity(),true);level.onchange();assert.equal(h.workspace.params().level,null);
});
