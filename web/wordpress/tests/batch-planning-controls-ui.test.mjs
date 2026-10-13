import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBatchUI} from '../sherloq-browser/assets/batch-ui.js';
import {batchCatalog} from '../sherloq-browser/assets/batch-catalog.js';
import {BATCH_RESUME_PLAN_SCHEMA} from '../sherloq-browser/assets/batch-run-resume.js';
import {batchAutomaticThreshold} from '../sherloq-browser/assets/batch-selection-policy.js';
import {unavailableResultDisplayFactory} from './batch-display-fixture.mjs';

async function fixture(){
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>'),old={document:globalThis.document,localStorage:globalThis.localStorage};globalThis.document=document;
 let persisted;globalThis.localStorage={getItem:()=>null,setItem:(key,value)=>{persisted=JSON.parse(value);}};
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};window.HTMLInputElement.prototype.checkValidity=window.HTMLInputElement.prototype.reportValidity=()=>true;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 const blob=new Blob(['fixture']),image={id:'source',name:'figure.png',hash:'pixels',sourceSha256:'a'.repeat(64),width:32,height:32,selected:true,state:'ready',blob,thumbnail:blob,occurrences:[{studyId:'study',page:1}],preparation:{status:'ready',fingerprint:'f'.repeat(64),regions:[{x0:0,y0:0,x1:32,y1:32}],excluded:[]}},artifacts=new Map();artifacts.dispose=async()=>{};
 const model={images:[image],studies:[{id:'study',name:'paper.pdf',kind:'pdf',errors:[]}],errors:[],artifacts,async clear(){},async import(){}};let editorOpens=[],runOptions,notifyRun;
 const runEntered=new Promise(resolve=>notifyRun=resolve);
 const ui=await mountBatchUI({document,importerFactory:async()=>model,preparationFactory:()=>({async prepare(){},async dispose(){}}),resultDisplayFactory:unavailableResultDisplayFactory,scopeEditorFactory:()=>({async open(options){editorOpens.push(options);},async dispose(){}}),runnerFactory:()=>({async clear(){},cancel(){},async run(value,recipes,options){runOptions=options;value.cancelled=false;value.results=[];notifyRun();}})});
 return {ui,model,image,document,runEntered,get persisted(){return persisted;},get editorOpens(){return editorOpens;},get runOptions(){return runOptions;},async dispose(){try{await ui.dispose();}finally{Object.assign(globalThis,old);}}};
}
test('batch controls update integer-half automatic threshold, retain manual override and allow auto again',async()=>{
 const f=await fixture();try{
  const checks=[...f.ui.dialog.querySelectorAll('[data-batch-tool]')],number=f.ui.dialog.querySelector('[data-batch-threshold]'),auto=f.ui.dialog.querySelector('[data-batch-threshold-auto]');assert.equal(auto.checked,true);
  const targets=batchCatalog.filter(r=>r.kind==='clones'&&!r.pairRequired).slice(0,6).map(r=>r.id);
  for(const check of checks){check.checked=targets.includes(check.dataset.batchTool);check.onchange();}
  const expected=batchAutomaticThreshold(f.persisted.recipes.map(r=>({...batchCatalog.find(x=>x.id===r.id),...r})));
  assert.equal(Number(number.value),expected.threshold);number.value='7';number.checkValidity=()=>true;number.oninput();assert.equal(auto.checked,false);
  checks[0].checked=!checks[0].checked;checks[0].onchange();assert.equal(Number(number.value),7);
  auto.checked=true;auto.onchange();assert.equal(f.persisted.options.thresholdMode,'auto');assert.notEqual(Number(number.value),7);
 }finally{await f.dispose();}
});
test('AI methods remain inside recommended, D2PRL is explicit, image opens editor and LoFTR pair tools appear only when selected',async()=>{
 const f=await fixture();try{
  const group=f.ui.dialog.querySelector('.batch-tool-group'),ai=group.querySelector('.batch-ai-tools');assert.ok(ai);assert.equal(ai.querySelector('[data-batch-tool="ai.clones.d2prl"]').closest('label').textContent,'D2PRL');
  assert.equal(f.ui.dialog.querySelector('.batch-pair-editor'),null);
  assert.equal([...f.ui.dialog.querySelectorAll('.batch-image-card summary')].some(node=>node.textContent==='Documents'),false);
  await f.ui.dialog.querySelector('.batch-image-preview img').onclick();assert.equal(f.editorOpens.length,1);
  const id=batchCatalog.find(r=>r.pairRequired).id,check=f.ui.dialog.querySelector('[data-batch-tool="'+id+'"]');check.checked=true;check.onchange();assert.ok(f.ui.dialog.querySelector('.batch-pair-editor'));
  await f.ui.dialog.querySelector('.batch-pair-editor .batch-primary').onclick();assert.equal(f.editorOpens.at(-1).selectionPurpose,'pair');check.checked=false;check.onchange();assert.equal(f.ui.dialog.querySelector('.batch-pair-editor'),null);
 }finally{await f.dispose();}
});
test('Resume is a real separate action passing resume without resetting a previously confirmed interrupted selection',async()=>{
 const f=await fixture();try{f.model.cancelled=true;f.ui.show(3);const resume=[...f.ui.dialog.querySelectorAll('.batch-actions button')].find(b=>b.textContent==='Reprendre');assert.equal(resume.hidden,false);assert.equal(resume.disabled,false);resume.onclick();await f.runEntered;await new Promise(setImmediate);assert.equal(f.runOptions.resume,true);assert.equal(f.model.cancelled,false);assert.equal(resume.hidden,true);}finally{await f.dispose();}
});

test('a planned pending image with historical diagnostics cannot block Resume or masquerade as a current failure',async()=>{
 const f=await fixture();try{f.model.cancelled=true;f.image.state='incomplete';f.image.runs=[{title:'Historical method',status:'cancelled',files:[],error:{code:'OLD_ATTEMPT',message:'old diagnostic'}}];f.model.resumePlan={schema:BATCH_RESUME_PLAN_SCHEMA,units:[{imageId:f.image.id,started:false}]};f.ui.open();f.ui.show(3);const resume=[...f.ui.dialog.querySelectorAll('.batch-actions button')].find(b=>b.textContent==='Reprendre');assert.equal(resume.hidden,false);assert.equal(resume.disabled,false);assert.equal(f.ui.dialog.querySelector('.batch-failure-summary'),null);assert.equal(f.ui.dialog.querySelector('.batch-image-result'),null);assert.equal(f.image.runs.length,1);
 }finally{await f.dispose();}
});
