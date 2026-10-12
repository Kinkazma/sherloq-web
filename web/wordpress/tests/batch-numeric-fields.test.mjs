import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBatchUI} from '../sherloq-browser/assets/batch-ui.js';
import {catalogRecipe} from '../sherloq-browser/assets/batch-catalog.js';
import {ssgFullParams} from '../../engine-source/src/ssg-full-input.js';

// Independently model HTML number validity in Linkedom, including min-based
// stepping. This proves the generator never asks the browser to reject a
// valid native decimal merely because its editing increment has another base.
function valid(input){
 if(input.disabled||input.type!=='number')return true;
 if(input.value==='')return !input.required;
 const n=Number(input.value);if(!Number.isFinite(n))return false;
 if(input.min!==undefined&&input.min!==''&&n<Number(input.min)||input.max!==undefined&&input.max!==''&&n>Number(input.max))return false;
 if(input.step!=='any'){const q=(n-Number(input.min||0))/Number(input.step||1);if(Math.abs(q-Math.round(q))>1e-7)return false;}
 return true;
}
async function fixture(){
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>');globalThis.document=document;
 const recipe=catalogRecipe('clone-21');globalThis.localStorage={getItem(){return JSON.stringify({recipes:[recipe],options:{basis:'clones'}});},setItem(){}};
 window.HTMLInputElement.prototype.reportValidity=function(){return valid(this);};window.HTMLInputElement.prototype.checkValidity=function(){return valid(this);};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(v){for(const o of this.options)o.toggleAttribute('selected',o.value===String(v));}});
 const image={id:'i',hash:'same-pixels',name:'source.png',width:80,height:64,blob:new Blob(['image']),thumbnail:new Blob(['thumbnail']),family:'photography',selected:true,occurrences:[{studyId:'s'}],runs:[],state:'ready'},calls=[];
 const model={images:[image],studies:[{id:'s',name:'Source',errors:[]}],errors:[],artifacts:{has(){return false;},async clear(){},async dispose(){}},async import(){},async clear(){}};
 const ui=await mountBatchUI({document,language:()=> 'fr',importerFactory:async()=>model,runnerFactory:()=>({async run(model,recipes){calls.push(recipes);model.results=[];},async clear(){},cancel(){}})});
 const card=ui.dialog.querySelector('[data-batch-tool="clone-21"]').closest('.batch-tool');
 [...ui.dialog.querySelectorAll('.batch-selection-bar button')].find(b=>b.textContent==='Confirmer la sélection').onclick();
 return {ui,calls,parameter:key=>card.querySelector('[data-parameter="'+key+'"]')};
}

test('all batch numeric defaults have valid bounds and stepping, including the native SSG decimal defaults',async()=>{
 const f=await fixture();try{const numeric=[...f.ui.dialog.querySelectorAll('.batch-fields input')].filter(n=>n.type==='number');assert.ok(numeric.length>100);const invalid=numeric.filter(n=>!valid(n)).map(n=>({key:n.dataset.parameter,value:n.value,min:n.min,max:n.max,step:n.step}));assert.deepEqual(invalid,[]);assert.equal(f.parameter('salienceSigma').value,'0.001');assert.equal(f.parameter('salienceSigma').step,'any');assert.equal(Number(f.parameter('salienceSigma').min),.000001);
  const siftRadius=f.ui.dialog.querySelector('[data-batch-tool="clone-15"]').closest('.batch-tool').querySelector('[data-parameter="radius"]');assert.equal(Number(siftRadius.value),808.95);assert.equal(siftRadius.step,'any');siftRadius.onkeydown({key:'ArrowUp',preventDefault(){},stopPropagation(){}});assert.equal(Number(siftRadius.value),809.95);
  await f.ui.run();assert.doesNotThrow(()=>ssgFullParams(f.calls[0][0].params));}finally{await f.ui.dispose();}
});

test('SSG edits retain finite scientific values between UI increments and report invalid bounds before a calculation',async()=>{
 const f=await fixture();try{
  const sigma=f.parameter('salienceSigma');sigma.value='.001035';sigma.onchange();assert.equal(valid(sigma),true);await f.ui.run();assert.equal(f.calls[0][0].params.salienceSigma,.001035);
  for(const invalid of ['0','1.1','Infinity','NaN','']){sigma.value=invalid;sigma.onchange();assert.equal(valid(sigma),false,invalid);await f.ui.run();assert.equal(f.calls.length,1,'Invalid visible setting must not silently run an older value');assert.match(f.ui.dialog.querySelector('.batch-status').textContent,/Réglage invalide.*SSG/);}
  sigma.value='.002';sigma.onchange();await f.ui.run();assert.equal(f.calls[1][0].params.salienceSigma,.002);assert.doesNotThrow(()=>ssgFullParams(f.calls[1][0].params));
 }finally{await f.ui.dispose();}
});

test('decimal Arrow keys keep their declared increment and clamp endpoints without bypassing integer constraints',async()=>{
 const f=await fixture();try{
  const sigma=f.parameter('salienceSigma'),edit=(node,key,modifiers={})=>node.onkeydown?.({key,...modifiers,preventDefault(){},stopPropagation(){}});
  edit(sigma,'ArrowUp');assert.equal(Number(sigma.value),.0011);await f.ui.run();assert.equal(f.calls[0][0].params.salienceSigma,.0011);
  sigma.value='.99995';edit(sigma,'ArrowUp');assert.equal(Number(sigma.value),1);sigma.value='.00002';edit(sigma,'ArrowDown');assert.equal(Number(sigma.value),.000001);
  sigma.disabled=true;edit(sigma,'ArrowUp');assert.equal(Number(sigma.value),.000001);sigma.disabled=false;edit(sigma,'ArrowUp',{altKey:true});assert.equal(Number(sigma.value),.000001);
  const spatial=f.parameter('spatialK');assert.equal(Number(spatial.step),1);spatial.value='3.5';spatial.onchange();await f.ui.run();assert.equal(f.calls.length,1);assert.equal(valid(spatial),false);spatial.value='4';spatial.onchange();await f.ui.run();assert.equal(f.calls[1][0].params.spatialK,4);assert.equal(f.calls[1][0].params.salienceSigma,.000001);
 }finally{await f.ui.dispose();}
});
