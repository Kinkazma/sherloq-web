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
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};window.HTMLInputElement.prototype.checkValidity=window.HTMLInputElement.prototype.reportValidity=()=>true;window.HTMLInputElement.prototype.setCustomValidity=function(message){this.validationMessage=message;};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 const blob=new Blob(['fixture']),image={id:'source',name:'figure.png',hash:'pixels',sourceSha256:'a'.repeat(64),width:32,height:32,selected:true,state:'ready',blob,thumbnail:blob,occurrences:[{studyId:'study',page:1}],preparation:{status:'ready',fingerprint:'f'.repeat(64),regions:[{x0:0,y0:0,x1:32,y1:32}],excluded:[]}},artifacts=new Map();artifacts.dispose=async()=>{};
 const model={images:[image],studies:[{id:'study',name:'paper.pdf',kind:'pdf',errors:[]}],errors:[],artifacts,async clear(){},async import(){}};let editorOpens=[],editorOptions=[],factoryOptions=[],runOptions,notifyRun;
 const runEntered=new Promise(resolve=>notifyRun=resolve);
 const ui=await mountBatchUI({document,importerFactory:async()=>model,preparationFactory:()=>({async prepare(){},async dispose(){}}),resultDisplayFactory:unavailableResultDisplayFactory,scopeDetectionFactory:options=>{factoryOptions.push(options);return{onDetectAutomatically:async request=>({scope:request.scope,kind:'automatic'}),onDetectSubimages:async request=>({scope:request.scope,kind:'subimages'})};},scopeEditorFactory:options=>{editorOptions.push(options);return{async open(options){editorOpens.push(options);},async dispose(){}};},runnerFactory:()=>({async clear(){},cancel(){},async run(value,recipes,options){runOptions=options;value.cancelled=false;value.results=[];notifyRun();}})});
 return {ui,model,image,document,runEntered,get persisted(){return persisted;},editorOptions,factoryOptions,get editorOpens(){return editorOpens;},get runOptions(){return runOptions;},async dispose(){try{await ui.dispose();}finally{Object.assign(globalThis,old);}}};
}
test('batch common editor receives both real detection callbacks, dynamic OCR option and a source-membership invalidation guard',async()=>{
 const f=await fixture();try{await f.ui.dialog.querySelector('.batch-image-preview img').onclick();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.editorOptions.length,1);assert.equal(f.factoryOptions.length,1);const options=f.editorOptions[0],provider=f.factoryOptions[0],scope=f.image.preparation;assert.equal(typeof options.onDetectAutomatically,'function');assert.equal(typeof options.onDetectSubimages,'function');assert.equal((await options.onDetectAutomatically({image:f.image,scope})).kind,'automatic');assert.equal((await options.onDetectSubimages({image:f.image,scope})).kind,'subimages');assert.equal(provider.excludeTexts(),true);f.image.preparation.text={disabled:true};assert.equal(provider.excludeTexts(),false);assert.equal(provider.isCurrent(),true);f.model.images=[];assert.equal(provider.isCurrent(),false);}finally{await f.dispose();}
});
