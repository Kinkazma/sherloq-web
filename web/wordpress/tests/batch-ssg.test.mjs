import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBatchUI} from '../sherloq-browser/assets/batch-ui.js';
import {batchCatalog,catalogRecipe,batchTask} from '../sherloq-browser/assets/batch-catalog.js';
import {SSG_DEFAULTS} from '../sherloq-browser/assets/clone-methods.js';
import {ssgFullParams,SSG_FULL_DEFAULTS} from '../../engine-source/src/ssg-full-input.js';
import {unavailableResultDisplayFactory} from './batch-display-fixture.mjs';

test('SSG batch exposes only its scientific native parameters and passes their exact defaults',()=>{
 const descriptor=batchCatalog.find(r=>r.params.algorithm==='SSG'),recipe=catalogRecipe(descriptor.id);
 assert.equal(recipe.id,'clone-21');assert.notEqual(recipe.notBatch,true);assert.equal(recipe.kind,'clones');
 assert.deepEqual(recipe.fields.map(f=>f.key).sort(),Object.keys(SSG_DEFAULTS).sort());
 const task=batchTask(recipe,{id:'ssg-default',imageId:'source'}),native=ssgFullParams(task.params);
 for(const [key,value]of Object.entries(SSG_DEFAULTS))assert.equal(native[key],SSG_FULL_DEFAULTS[key],key);
 assert.equal(native.compare,false);assert.equal(native.reflections,false);assert.deepEqual(native.regions,[]);
 assert.equal(recipe.fields.find(f=>f.key==='normalizationLongEdge').max,32768);
 for(const key of ['radius','minimum','threshold','limit','model','geometricThreshold','geometricMinimum','patch','iterations','texture','autoRadius','compact','independent','poolingK'])assert.equal(key in task.params,false,key);
 for(const other of batchCatalog.filter(r=>r.operation==='tampering.copyMove.sparse'&&r.params.algorithm!=='SSG'))assert.equal(other.fields.some(f=>Object.hasOwn(SSG_DEFAULTS,f.key)),false,other.params.algorithm);
});

test('SSG edited parameters and explicit batch panels retain their scientific values and original coordinates',()=>{
 const recipe=catalogRecipe('clone-21');Object.assign(recipe.params,{normalizationLongEdge:0,minimumDistance:50,spatialK:5,ratio:.55,absolute:.07,salienceSigma:.002,roiRadius:4,maskThreshold:.6,minimumArea:.0002,ssimRadius:2.5,ssimOpening:0,rngSeed:42});
 const task=batchTask(recipe,{regions:[{x0:3,y0:7,x1:40,y1:55},{x0:75,y0:12,x1:130,y1:80}]});
 const native=ssgFullParams(task.params);for(const key of Object.keys(SSG_DEFAULTS))assert.equal(native[key],recipe.params[key],key);
 assert.deepEqual(native.regions,[[[3,7],[39,7],[39,54],[3,54]],[[75,12],[129,12],[129,79],[75,79]]]);
 assert.equal(native.compare,false);
});

async function uiFixture(saved){
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>');globalThis.document=document;let persisted;
 globalThis.localStorage={getItem(){return saved?JSON.stringify(saved):null;},setItem(key,value){persisted=JSON.parse(value);}};
 window.HTMLInputElement.prototype.reportValidity=()=>true;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 const image={id:'i',hash:'pixels',name:'source.png',width:80,height:60,blob:new Blob(['image']),thumbnail:new Blob(['thumbnail']),family:'photography',selected:true,occurrences:[{studyId:'s'}],runs:[],state:'ready'},calls=[];
 const model={images:[image],studies:[{id:'s',name:'Source',errors:[]}],errors:[],artifacts:{has(){return false;},async clear(){},async dispose(){}},async import(){},async clear(){}};
 image.preparation={schema:'sherloq.scientific-scope/1',status:'ready',sourceSha256:'a'.repeat(64),width:image.width,height:image.height,fingerprint:'prepared-ui-fixture',regions:[{x0:0,y0:0,x1:image.width,y1:image.height,type:'photography',confidence:1}],excluded:[]};
 const ui=await mountBatchUI({document,language:()=> 'fr',resultDisplayFactory:unavailableResultDisplayFactory,importerFactory:async()=>model,runnerFactory:()=>({async run(model,recipes,options){calls.push({recipes,options});model.results=[];},async clear(){},cancel(){}})});
 const basis=ui.dialog.querySelector('[data-batch-basis]'),checks=()=>[...ui.dialog.querySelectorAll('[data-batch-tool]')],choose=(id,value)=>{const box=checks().find(c=>c.dataset.batchTool===id);box.checked=value;box.onchange();};
 const confirm=[...ui.dialog.querySelectorAll('.batch-selection-bar button')].find(b=>b.textContent==='Confirmer la sélection');confirm.onclick();
 return {ui,basis,checks,choose,calls,get persisted(){return persisted;}};
}

test('temporarily removing every clone uses total and restores the user’s clone preference on reactivation',async()=>{
 const f=await uiFixture();try{
  assert.equal(f.basis.value,'clones');for(const box of f.checks().filter(c=>c.checked))f.choose(box.dataset.batchTool,false);
  assert.equal(f.basis.value,'total');assert.equal(f.basis.querySelector('[value="clones"]').disabled,true);assert.equal(f.persisted.preferredBasis,'clones');
  f.choose('clone-21',true);assert.equal(f.basis.value,'clones');assert.equal(f.basis.querySelector('[value="clones"]').disabled,false);
  await f.ui.run();assert.equal(f.calls[0].options.basis,'clones');assert.equal(f.calls[0].recipes[0].params.algorithm,'SSG');
 }finally{await f.ui.dispose();}
});

test('an explicitly selected total basis survives clone removal, reactivation and saved-setting reload',async()=>{
 const f=await uiFixture();let persisted;try{
  f.basis.value='total';f.basis.onchange();for(const box of f.checks().filter(c=>c.checked))f.choose(box.dataset.batchTool,false);f.choose('clone-21',true);
  assert.equal(f.basis.value,'total');await f.ui.run();assert.equal(f.calls[0].options.basis,'total');persisted=f.persisted;
 }finally{await f.ui.dispose();}
 const restored=await uiFixture(persisted);try{assert.equal(restored.basis.value,'total');await restored.ui.run();assert.equal(restored.calls[0].options.basis,'total');}finally{await restored.ui.dispose();}
});

test('a saved automatic total fallback retains the preferred clone basis when SSG is selected later',async()=>{
 const f=await uiFixture({options:{basis:'total'},preferredBasis:'clones',recipes:[]});try{assert.equal(f.basis.value,'total');f.choose('clone-21',true);assert.equal(f.basis.value,'clones');}finally{await f.ui.dispose();}
});
