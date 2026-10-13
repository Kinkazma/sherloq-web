import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBatchUI,batchProgressStatus,batchStudyStatusKey} from '../sherloq-browser/assets/batch-ui.js';
import {studyScores} from '../sherloq-browser/assets/batch-catalog.js';
import {displayFixture,unavailableResultDisplayFactory} from './batch-display-fixture.mjs';

test('native panel indices and stage counts are displayed exactly, including the D2PRL journal counters',()=>{
 const context={imageIndex:0,imageTotal:4,imageName:'figure.png',toolName:'D2PRL',detail:{phase:'patchmatch',zoneIndex:5,totalZones:9,completed:101,total:198}};
 assert.equal(batchProgressStatus(context),'Traitement en cours · 1/4 · figure.png · D2PRL · panneau 6/9 · PatchMatch 101/198');
 assert.equal(batchProgressStatus(context,{language:'en'}),'Processing · 1/4 · figure.png · D2PRL · panel 6/9 · PatchMatch 101/198');
 assert.match(batchProgressStatus({...context,detail:{phase:'descriptors',zoneIndex:0,totalZones:16,completed:12,total:45}}),/panneau 1\/16 · Descripteurs 12\/45$/);
 assert.match(batchProgressStatus({...context,detail:{phase:'resource-wait',zoneIndex:5,totalZones:9}}),/panneau 6\/9 · Attente de ressources$/);
 assert.doesNotMatch(batchProgressStatus({...context,imageIndex:5,imageTotal:4,detail:{phase:'unet',zoneIndex:9,totalZones:9,completed:2.5,total:45}}),/6\/4|10\/9|2.5\/45/);
});
test('pending studies have active or queued labels without concealing final failures',()=>{
 const images=[{id:'first',selected:true,occurrences:[{studyId:'a'}]},{id:'second',selected:true,occurrences:[{studyId:'b'}]}],pendingImageIds=new Set(['first','second']);
 assert.equal(batchStudyStatusKey({id:'a',status:'incomplete'},images,{running:true,pendingImageIds,currentImageId:'first'}),'running');
 assert.equal(batchStudyStatusKey({id:'b',status:'incomplete'},images,{running:true,pendingImageIds,currentImageId:'first'}),'queued');
 pendingImageIds.delete('first');assert.equal(batchStudyStatusKey({id:'a',status:'incomplete'},images,{running:true,pendingImageIds,currentImageId:'second'}),'incomplete');
 assert.equal(batchStudyStatusKey({id:'b',status:'incomplete'},images,{running:false,pendingImageIds,currentImageId:'second'}),'incomplete');
 assert.equal(batchStudyStatusKey({id:'unselected',status:'unselected'},images,{running:true,pendingImageIds,currentImageId:'second'}),'unselected');
});

function harness(){
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 window.HTMLElement.prototype.reportValidity=()=>true;
 const model=displayFixture();model.images=model.images.slice(0,3);model.results=null;
 // This harness starts a new batch rather than restoring the display-only
 // fixture's explicit empty selection. Production must continue to honor [].
 delete model.configuration.recipes;
 model.studies=model.images.map((image,index)=>({id:'study-'+index,name:'Study '+index,errors:[]}));
 for(const [index,image]of model.images.entries()){image.state='ready';image.runs=[];image.score=undefined;image.finalDisplay=null;image.occurrences=[{studyId:'study-'+index}];}
 model.clear=async()=>{model.images=[];model.studies=[];};model.import=async()=>{};
 return {document,window,model};
}

test('worker ticks update status without rerendering outputs; completed batch notifies the closed-dialog report menu',async()=>{
 const {document,window,model}=harness(),beforeSelection=model.images.map(i=>i.selected),beforePreparation=structuredClone(model.images.map(i=>i.preparation)),beforeArtifacts=[...model.artifacts.entries()];
 let progress,finish,enter,ui;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>finish=resolve),notifications=[];
 ui=await mountBatchUI({document,resultDisplayFactory:unavailableResultDisplayFactory,importerFactory:async()=>model,preparationFactory:()=>({async prepare(){},async dispose(){}}),onChange:()=>notifications.push({running:ui.running,canExport:ui.canExport}),runnerFactory:({onProgress})=>{
  progress=onProgress;return {async run(){enter();await gate;},cancel(){finish();},async clear(){}};
 }});
 let pending;
 try{
  ui.dialog.querySelector('[data-batch-word="selection"]').onclick();pending=ui.run();await Promise.race([entered,pending.then(()=>{throw Error('The new-batch progress harness did not enter its runner: '+ui.dialog.querySelector('.batch-status').textContent);})]);
  const image=model.images[0];progress({phase:'image-start',image,index:0,total:3});progress({phase:'tool',image,recipe:{fr:'D2PRL',en:'D2PRL'}});
  const cards=[...ui.dialog.querySelectorAll('.batch-study-result')];assert.deepEqual(cards.map(c=>c.querySelector('.batch-badge').textContent),['Traitement en cours','En attente de traitement','En attente de traitement']);
  progress({phase:'kernel',detail:{phase:'patchmatch',zoneIndex:5,totalZones:9,completed:101,total:198}});
  assert.match(ui.dialog.querySelector('.batch-status').textContent,/1\/3.*D2PRL.*panneau 6\/9.*PatchMatch 101\/198/);
  assert.equal(ui.dialog.querySelector('.batch-study-result'),cards[0],'kernel progress does not replace result DOM or preview URLs');
  ui.dialog.dispatchEvent(new window.Event('close'));assert.deepEqual(notifications.at(-1),{running:true,canExport:false});
  for(const [index,i]of model.images.entries()){i.state='done';i.score={clones:0,additional:0,total:0,incomplete:false};progress({phase:'image-done',image:i,index:index+1,total:3});}
  model.results=studyScores(model.studies,model.images);finish();await pending;pending=null;
  assert.deepEqual(notifications.at(-1),{running:false,canExport:true});assert.match(ui.dialog.querySelector('.batch-status').textContent,/Traitement terminé/);
  assert.deepEqual(model.images.map(i=>i.selected),beforeSelection);assert.deepEqual(model.images.map(i=>i.preparation),beforePreparation);assert.deepEqual([...model.artifacts.entries()],beforeArtifacts);
 }finally{finish();await pending;await ui.dispose();}
});

test('an actual tool failure remains incomplete after its image finishes while other studies are still queued',async()=>{
 const {document,model}=harness();let progress,finish,enter;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>finish=resolve);
 const ui=await mountBatchUI({document,resultDisplayFactory:unavailableResultDisplayFactory,importerFactory:async()=>model,preparationFactory:()=>({async prepare(){},async dispose(){}}),runnerFactory:({onProgress})=>{progress=onProgress;return {async run(){enter();await gate;},cancel(){finish();},async clear(){}};}});
 let pending;
 try{
  ui.dialog.querySelector('[data-batch-word="selection"]').onclick();pending=ui.run();await Promise.race([entered,pending.then(()=>{throw Error('The new-batch failure harness did not enter its runner: '+ui.dialog.querySelector('.batch-status').textContent);})]);
  const image=model.images[0];progress({phase:'image-start',image,index:0,total:3});image.state='done';image.score={clones:0,additional:0,total:0,incomplete:true};image.runs=[{title:'D2PRL',status:'error',files:[],error:{code:'MODEL_UNAVAILABLE',message:'Native model unavailable'}}];
  progress({phase:'image-done',image,index:1,total:3});const cards=[...ui.dialog.querySelectorAll('.batch-study-result')];
  assert.equal(cards[0].querySelector('.batch-badge').textContent,'Traitement incomplet');assert.equal(cards[1].querySelector('.batch-badge').textContent,'En attente de traitement');
  assert.match(ui.dialog.querySelector('.batch-failure-summary').textContent,/MODEL_UNAVAILABLE.*Native model unavailable/);
  model.results=studyScores(model.studies,model.images);finish();await pending;pending=null;
  assert.match(ui.dialog.querySelector('.batch-status').textContent,/Traitement incomplet/);
 }finally{finish();await pending;await ui.dispose();}
});

test('import completion and reset notify global report availability after their state transition',async()=>{
 const {document,model}=harness();let ui;const seen=[];
 ui=await mountBatchUI({document,resultDisplayFactory:unavailableResultDisplayFactory,importerFactory:async()=>model,preparationFactory:()=>({async prepare(){},async dispose(){}}),onChange:()=>seen.push({running:ui.running,canExport:ui.canExport})});
 try{await ui.importFiles([new Blob(['local fixture'])]);assert.deepEqual(seen.at(-1),{running:false,canExport:true});ui.dialog.querySelector('[data-batch-word="clear"]').onclick();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(seen.at(-1),{running:false,canExport:false});}
 finally{await ui.dispose();}
});
