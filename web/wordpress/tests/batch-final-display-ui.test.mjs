import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBatchUI} from '../sherloq-browser/assets/batch-ui.js';
import {displayFixture} from './batch-display-fixture.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('four result datasets select the intended primary display, retain exact counts and expose scientific-support limits',async()=>{
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>'),model=displayFixture(),seen=[],before=[...model.artifacts.entries()];
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};
 const ui=await mountBatchUI({document,importerFactory:async()=>model,preparationFactory:()=>({prepare:async()=>{},dispose:async()=>{}}),onInspect:file=>seen.push(file)});
 try{
  await flush();const cards=[...ui.dialog.querySelectorAll('.batch-image-result')];assert.equal(cards.length,4);
  assert.match(cards[0].querySelector('figcaption').textContent,/Biomes.*1 méthode.*maximum C1/);assert.equal(cards[0].querySelector('.batch-corroboration-legend'),null);
  assert.match(cards[1].querySelector('figcaption').textContent,/Carte de corroboration.*2 méthodes.*maximum C2/);assert.match(cards[2].querySelector('figcaption').textContent,/4 méthodes.*maximum C4/);
  const legend=cards[2].querySelector('.batch-corroboration-legend').textContent;for(const text of ['0 : pixels originaux','1 : bleu','2 : jaune','3 et plus : rouge','valeurs exactes','NPZ'])assert.ok(legend.includes(text));assert.doesNotMatch(legend,/0\s*(?:à|\.\.|-)\s*10|probabilité|fraude/i);
  for(const card of cards){assert.ok(card.querySelector('.batch-final-preview img').src.startsWith('blob:'));assert.equal(card.querySelector('.batch-individual-outputs').hasAttribute('open'),false);assert.ok(card.querySelector('.batch-individual-outputs .batch-run-result'));}
  assert.match(cards[3].textContent,/Exclusions appliquées aux preuves dérivées/);assert.match(cards[3].textContent,/Sortie brute pour inspection ; exclusions scientifiques non prises en charge, aucun vote filtré/);
  const button=[...cards[1].querySelectorAll('button')].find(button=>button.textContent==='Afficher la carte de corroboration');await button.onclick();assert.equal(seen.length,1);assert.deepEqual(new Uint8Array(await seen[0].arrayBuffer()),new Uint8Array(await model.corroboration.arrayBuffer()));
  const single=[...cards[0].querySelectorAll('button')].find(button=>button.textContent==='Afficher les biomes');await single.onclick();assert.deepEqual(new Uint8Array(await seen[1].arrayBuffer()),new Uint8Array(await model.native.arrayBuffer()));
  assert.deepEqual([...model.artifacts.entries()],before);
 }finally{await ui.dispose();}
});

test('pending or stale final displays cannot replace a native single-method output and preview URLs are retired on rerender/dispose',async()=>{
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>'),model=displayFixture(),oldRevoke=URL.revokeObjectURL,revoked=[];model.images=model.images.slice(0,1);model.images[0].finalDisplay.pendingRendering=true;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};URL.revokeObjectURL=url=>{revoked.push(url);oldRevoke(url);};
 let ui;
 try{ui=await mountBatchUI({document,importerFactory:async()=>model,preparationFactory:()=>({prepare:async()=>{},dispose:async()=>{}})});await flush();const original=ui.dialog.querySelector('.batch-final-preview img').src;assert.match(ui.dialog.querySelector('figcaption').textContent,/Biomes/);ui.open();await flush();assert.ok(revoked.includes(original));const latest=ui.dialog.querySelector('.batch-final-preview img').src;await ui.dispose();ui=null;assert.ok(revoked.includes(latest));}
 finally{await ui?.dispose();URL.revokeObjectURL=oldRevoke;}
});
test('Failures are visible outside collapsed outputs, while the partial result and exports remain available',async()=>{
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>'),model=displayFixture();model.images=model.images.slice(1,2);model.images[0].score.incomplete=true;model.images[0].runs.push({title:'SSG',kind:'clones',status:'error',files:[],error:{code:'INVALID_INPUT',message:'Original forest unavailable'}});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 const ui=await mountBatchUI({document,importerFactory:async()=>model,preparationFactory:()=>({prepare:async()=>{},dispose:async()=>{}})});
 try{const errors=ui.dialog.querySelector('.batch-failure-summary');assert.ok(errors);assert.match(errors.textContent,/1 analyses incomplètes sur 2/);assert.match(errors.textContent,/SSG.*INVALID_INPUT.*Original forest unavailable/);assert.match(ui.dialog.querySelector('figcaption').textContent,/partielle.*1\/2 analyses terminées/);assert.equal(ui.canExport,true);assert.equal([...ui.dialog.querySelectorAll('button')].find(b=>b.textContent==='Exporter le rapport PDF').disabled,false);}finally{await ui.dispose();}
});
