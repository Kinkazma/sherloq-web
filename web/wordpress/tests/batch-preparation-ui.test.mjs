import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBatchUI} from '../sherloq-browser/assets/batch-ui.js';
import {composeScientificScope} from '../sherloq-browser/assets/batch-scientific-preparation.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness({waitForCancel=false,withAmbiguous=false}={}){
 const {document,window}=parseHTML('<!doctype html><html lang="fr"><body></body></html>'),events=[];
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 const artifacts=new Map();artifacts.dispose=async()=>{events.push('artifacts-disposed');artifacts.clear();};
 const model={images:[],studies:[],errors:[],artifacts,async clear(){this.images=[];this.studies=[];}};
 const make=(id,selected,family,status)=>({id,name:id+'.png',selected,family,width:200,height:100,blob:new Blob(['original pixels']),thumbnail:new Blob(['thumbnail']),state:'ready',runs:[],occurrences:[{studyId:'study'}],preparation:{status,regions:status==='ready'?[{x0:10,y0:20,x1:90,y1:80,type:'microscopy',confidence:.95}]:[],excluded:[[[12,22],[30,22],[30,28],[12,28]]],warnings:status==='ready'?[]:[{message:'Aucune zone d’acquisition reconnue.'}]}});
 let preparationSignal,preparationProgress;
 const importerFactory=async()=>{model.import=async()=>{events.push('imported');model.studies=[{id:'study',kind:'images',name:'Local input'}];model.images=[make('ready',true,'microscopy','ready'),make('human-excluded',false,'mixed','ready'),make('uncertain',true,'unknown','needs-review')];if(withAmbiguous){const i=make('ambiguous',false,'gel','needs-review'),large=[[0,0],[190,0],[190,90],[0,90]],label=[[10,1],[15,1],[15,5],[10,5]];i.preparation=composeScientificScope(i,{width:200,height:100,sourceSha256:'a'.repeat(64),panels:{panels:[{label:'Blots',rectangle:[0,0,200,100],confidence:.96}]},text:{status:'needs-review',polygons:[large,label],detections:[{polygon:large},{polygon:label}],warnings:[{code:'large-text-region',detection:0}]}});model.images.push(i);}};return model;};
 const preparationFactory=({onProgress})=>{preparationProgress=onProgress;return {async prepare(model,{signal}){events.push('preparation-start');preparationSignal=signal;onProgress({phase:'preparation',image:model.images[0],index:0,total:3,detail:{phase:'text-detection'}});if(waitForCancel)await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{events.push('preparation-aborted');reject(new DOMException('Cancelled','AbortError'));},{once:true}));events.push('preparation-done');},async dispose(){events.push('preparation-disposed');}};};
 return {document,events,model,get signal(){return preparationSignal;},get progress(){return preparationProgress;},open:()=>mountBatchUI({document,importerFactory,preparationFactory})};
}

test('import prepares regions before human confirmation, preserves discarded images and previews original-coordinate exclusions',async()=>{
 const h=harness(),ui=await h.open();try{
  await ui.importFiles([new Blob(['input'])]);assert.deepEqual(h.events,['imported','preparation-start','preparation-done']);
  assert.equal([...h.document.querySelectorAll('button')].find(b=>b.textContent==='Exporter le dossier ZIP').disabled,false);
  const cards=[...h.document.querySelectorAll('.batch-image-card')];assert.equal(cards.length,3);assert.equal(cards.some(card=>card.querySelector('select')),false);
  assert.ok(cards[0].textContent.includes('Préclassement automatique'));assert.ok(cards[0].textContent.includes('Zones préparées'));assert.ok(cards[2].textContent.includes('Aucune zone d’acquisition reconnue.'));
  assert.equal(cards[0].querySelector('input').checked,true);assert.equal(cards[1].querySelector('input').checked,false);assert.equal(cards[2].querySelector('input').checked,false);assert.equal(cards[2].querySelector('input').disabled,true);
  const svg=cards[0].querySelector('svg');assert.equal(svg.getAttribute('viewBox'),'0 0 200 100');assert.equal(svg.querySelector('.batch-acquisition-zone').getAttribute('points'),'10,20 90,20 90,80 10,80');assert.equal(svg.querySelector('.batch-exclusion-zone').getAttribute('points'),'12,22 30,22 30,28 12,28');
  const toggle=[...h.document.querySelectorAll('button')].find(button=>button.textContent==='Masquer les zones');toggle.onclick();assert.equal(svg.hasAttribute('hidden'),true);assert.equal(toggle.getAttribute('aria-pressed'),'false');toggle.onclick();assert.equal(svg.hasAttribute('hidden'),false);
  const mandatory=[...h.document.querySelectorAll('.batch-option')].find(row=>row.textContent.includes('Préclassement automatique'));assert.equal(mandatory.querySelector('input').checked,true);assert.equal(mandatory.querySelector('input').disabled,true);
  const confirm=[...h.document.querySelectorAll('button')].find(button=>button.textContent==='Confirmer la sélection');h.model.images[2].selected=true;confirm.onclick();assert.ok(h.document.querySelector('.batch-status').textContent.includes('Zones d’acquisition à vérifier'));h.model.images[2].selected=false;confirm.onclick();assert.equal(h.document.querySelector('.batch-status').textContent,'Sélection confirmée.');
  const all=[...h.document.querySelectorAll('button')].find(button=>button.textContent==='Tout retenir');all.onclick();assert.deepEqual(h.model.images.map(image=>image.selected),[true,true,false]);
 }finally{await ui.dispose();}assert.deepEqual(h.events.slice(-2),['preparation-disposed','artifacts-disposed']);
});

test('Recognized acquisitions with an OCR conflict remain selectable; checking records the review and keeps unrelated labels excluded',async()=>{
 const h=harness({withAmbiguous:true}),ui=await h.open();try{
  await ui.importFiles([new Blob(['input'])]);let card=h.document.querySelector('[data-image-id="ambiguous"]'),check=card.querySelector('input[type=checkbox]');assert.equal(check.disabled,false);assert.equal(check.checked,false);assert.ok(check.title.includes('acquisitions reconnues'));
  check.checked=true;await check.onchange();const image=h.model.images.at(-1);assert.equal(image.selected,true);assert.equal(image.preparation.status,'ready');assert.equal(image.preparation.text.review.actor,'human');assert.equal(image.preparation.text.detections.length,1);assert.equal(image.preparation.text.rawDetection.detections.length,2);
  card=h.document.querySelector('[data-image-id="ambiguous"]');assert.equal(card.querySelector('input').checked,true);assert.ok(card.querySelector('.batch-acquisition-outline'));assert.equal(card.querySelectorAll('.batch-exclusion-zone').length,1);assert.ok(card.textContent.includes('validation humaine'));
  card.querySelector('input').checked=false;await card.querySelector('input').onchange();assert.equal(image.selected,false);
 }finally{await ui.dispose();}
});

test('Keep all includes recognized acquisitions after a human review while unknown images remain unselected',async()=>{
 const h=harness({withAmbiguous:true}),ui=await h.open();try{await ui.importFiles([new Blob(['input'])]);const all=[...h.document.querySelectorAll('button')].find(b=>b.textContent==='Tout retenir');await all.onclick();assert.deepEqual(h.model.images.map(i=>i.selected),[true,true,false,true]);assert.equal(h.model.images.at(-1).preparation.text.review.actor,'human');}finally{await ui.dispose();}
});

test('Stop aborts scientific preparation and dispose waits for cancellation before releasing its client',async()=>{
 const h=harness({waitForCancel:true}),ui=await h.open(),pending=ui.importFiles([new Blob(['input'])]);await flush();assert.equal(ui.running,true);assert.ok(h.document.querySelector('.batch-status').textContent.includes('Détection des textes'));
 const stop=[...h.document.querySelectorAll('button')].find(button=>button.textContent==='Arrêter');stop.onclick();assert.equal(h.signal.aborted,true);await pending;assert.equal(ui.running,false);assert.ok(h.document.querySelector('.batch-status').textContent.includes('Les résultats terminés seront conservés.'));await ui.dispose();
 assert.deepEqual(h.events,['imported','preparation-start','preparation-aborted','preparation-disposed','artifacts-disposed']);
});
