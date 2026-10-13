import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';
import {localFeaturePolicy} from '../sherloq-browser/assets/feature-policy.js';
import {toolCatalog,toolFields} from '../sherloq-browser/assets/tool-catalog.js';
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

test('Full SSG controls deliver only native parameters and keep prior detector IDs stable',()=>{
 const h=environment(),id='tampering.copyMove.sparse';
 assert.equal(CLONE_ALGORITHMS[20],'EfficientLoFTR');assert.equal(CLONE_ALGORITHMS[21],'SSG');
 h.workspace.restore({[id]:{...toolCatalog[id].params,algorithm:'SSG',normalizationLongEdge:0}});h.workspace.select(id);
 for(const key of Object.keys(SSG_DEFAULTS)){const input=h.parameter(key);assert.equal(input.closest('label').hidden,false,key);assert.equal(input.disabled,false,key);assert.equal(input.checkValidity(),true,key);}
 for(const key of ['limit','radius','threshold','minimum','model','patch','longSide','reflections'])assert.equal(h.parameter(key).closest('label').hidden,true,key);
 const params=h.workspace.params();assert.equal(params.normalizationLongEdge,0);assert.equal(params.spatialK,3);assert.doesNotThrow(()=>ssgFullParams(params));
 for(const key of ['limit','radius','threshold','minimum','model','autoRadius','compact','independent','longSide','patch'])assert.equal(Object.hasOwn(params,key),false,key);
 const backend=h.document.getElementById('tool-backend');assert.equal([...backend.options].find(o=>o.value==='webgpu').disabled,true);
 const algorithm=h.parameter('algorithm');algorithm.value=JSON.stringify('EfficientLoFTR');algorithm.onchange();
 assert.equal(h.parameter('longSide').closest('label').hidden,false);assert.equal(h.parameter('normalizationLongEdge').closest('label').hidden,true);
 for(const key of ['limit','minimum','threshold','tolerance','model','geometricThreshold','geometricMinimum'])assert.equal(h.parameter(key).disabled,false,'SSG → EfficientLoFTR restores '+key);
 assert.equal([...backend.options].find(o=>o.value==='webgpu').disabled,false);assert.equal(Object.hasOwn(h.workspace.params(),'spatialK'),false);
 algorithm.value=JSON.stringify('SSG');algorithm.onchange();algorithm.value=JSON.stringify('SIFT');algorithm.onchange();
 for(const key of ['limit','radius','minimum','threshold','tolerance','model','geometricThreshold','geometricMinimum'])assert.equal(h.parameter(key).disabled,false,'SSG → SIFT restores '+key);
});
test('SIFT G2NN algorithm defaults retain their fractional scientific distance after switching detectors',()=>{
 const h=environment();h.workspace.select('tampering.copyMove.sparse');const algorithm=h.parameter('algorithm');
 algorithm.value=JSON.stringify('SIFT + G2NN + RANSAC');algorithm.onchange();const radius=h.parameter('radius');
 assert.equal(radius.value,'808.95');assert.equal(radius.step,'any');assert.equal(radius.reportValidity(),true);assert.equal(h.workspace.params().radius,808.95);
 radius.onkeydown({key:'ArrowUp',preventDefault(){},stopPropagation(){}});assert.equal(Number(radius.value),809.05);assert.equal(h.workspace.params().radius,809.05);
});


test('Opened optional controls become unavailable after uninstall and return with their parameters intact',()=>{
 const h=environment(),catalog={schema:'sherloq.features/1',groups:[{id:'models',fr:'Modèles',en:'Models'}],features:[{id:'m2.cfa',group:'models',protected:false,fr:'CFA',en:'CFA',resources:[],dependsOn:[],tasks:[{operation:'m2.cfa'}]}]};
 localFeaturePolicy.configure({catalog,local:true,state:{}});
 try{
  h.workspace.select('m2.cfa');h.workspace.updateParams({block:64});h.workspace.lock(false,true);
  assert.equal(h.document.getElementById('tool-run').disabled,false);
  localFeaturePolicy.configure({state:{disabledFeatures:['m2.cfa']}});h.workspace.refreshFeatures();h.workspace.lock(false,true);
  assert.equal(h.document.getElementById('tool-run').disabled,true);assert.equal(h.workspace.canRun(),false);assert.equal(h.workspace.params().block,64);
  localFeaturePolicy.configure({state:{}});h.workspace.refreshFeatures();h.workspace.lock(false,true);
  assert.equal(h.document.getElementById('tool-run').disabled,false);assert.equal(h.workspace.canRun(),true);assert.equal(h.workspace.params().block,64);
 }finally{localFeaturePolicy.configure({local:false,state:{}});}
});
