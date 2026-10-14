import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBatchUI} from '../sherloq-browser/assets/batch-ui.js';
import {displayFixture,unavailableResultDisplayFactory} from './batch-display-fixture.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('imported Biomes preference shows preparation until native replay, never an estimated group count or an earlier result raster',async()=>{
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>'),model=displayFixture(),image=model.images[1];model.images=[image];image.blob=new Blob(['original source']);image.thumbnail=new Blob(['original thumbnail']);image.displayPreferences={schema:'sherloq.batch-result-display-preferences/1',mode:'biomes',opacity:.35};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});window.HTMLCanvasElement.prototype.getContext=function(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};};
 let finish,prepareCalls=0;const waiting=new Promise(resolve=>finish=resolve),scientific=JSON.stringify([image.runs,image.finalDisplay,image.score]),urls=[],create=URL.createObjectURL;URL.createObjectURL=blob=>{urls.push(blob);return create(blob);};
 const service={describe:()=>({available:true,preferences:image.displayPreferences,capabilities:{biomes:{available:true,groupCount:12,methods:['SIFT','PatchMatch Zernike']},corroboration:{available:true}}}),preparePreview:async()=>{prepareCalls++;await waiting;return {width:2,height:2,corroboration:{rgba:new Uint8ClampedArray(16)},biomes:{rgba:new Uint8ClampedArray(16),metadata:{schema:'sherloq.batch-biome-geometry/1',groupCount:11,methods:['SIFT','PatchMatch Zernike']}},metadata:{}};},dispose:async()=>{}};
 const ui=await mountBatchUI({document,importerFactory:async()=>model,resultDisplayFactory:()=>service,preparationFactory:()=>({prepare:async()=>{},dispose:async()=>{}}),runnerFactory:()=>{throw Error('Preparing a result view must not run a detector.');}});
 try{await flush();const card=ui.dialog.querySelector('.batch-image-result'),caption=card.querySelector('figcaption'),layer=card.querySelector('canvas');assert.equal(prepareCalls,1);assert.equal(caption.textContent,'Préparation de la vue Biomes…');assert.doesNotMatch(caption.textContent,/12 groupes/);assert.equal(layer.hidden,true);assert.ok(urls.length>0&&urls.every(blob=>blob===image.thumbnail),'Only the original thumbnail is shown while native geometry is loading.');
  finish();await flush();assert.match(caption.textContent,/Biomes appariés.*11 groupes/);assert.equal(layer.hidden,false);card.querySelector('[data-result-mode=corroboration]').onclick();card.querySelector('[data-result-mode=biomes]').onclick();assert.match(caption.textContent,/11 groupes/);assert.equal(prepareCalls,1);assert.equal(JSON.stringify([image.runs,image.finalDisplay,image.score]),scientific);
 }finally{finish();URL.createObjectURL=create;await ui.dispose();}
});
test('four result datasets select the intended primary display, retain exact counts and expose scientific-support limits',async()=>{
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>'),model=displayFixture(),seen=[],before=[...model.artifacts.entries()];
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};
 const ui=await mountBatchUI({document,resultDisplayFactory:unavailableResultDisplayFactory,importerFactory:async()=>model,preparationFactory:()=>({prepare:async()=>{},dispose:async()=>{}}),onInspect:file=>seen.push(file)});
 try{
  await flush();const cards=[...ui.dialog.querySelectorAll('.batch-image-result')];assert.equal(cards.length,4);
  assert.match(cards[0].querySelector('figcaption').textContent,/Biomes.*1 méthode.*maximum C1/);assert.equal(!!cards[0].querySelector('.batch-corroboration-legend'),false);
  assert.match(cards[1].querySelector('figcaption').textContent,/Carte de corroboration.*2 méthodes.*maximum C2/);assert.match(cards[2].querySelector('figcaption').textContent,/4 méthodes.*maximum C4/);
  const legend=cards[2].querySelector('.batch-corroboration-legend').textContent;for(const text of ['0 : pixels originaux','1 : bleu','2 : jaune','3 et plus : rouge','valeurs exactes','NPZ'])assert.ok(legend.includes(text));assert.doesNotMatch(legend,/0\s*(?:à|\.\.|-)\s*10|probabilité|fraude/i);
  for(const card of cards){assert.ok(card.querySelector('.batch-final-preview img').src.startsWith('blob:'));assert.equal(card.querySelector('.batch-individual-outputs').hasAttribute('open'),false);assert.ok(card.querySelector('.batch-individual-outputs .batch-run-result'));}
  assert.match(cards[3].textContent,/Exclusions appliquées aux preuves dérivées/);assert.match(cards[3].textContent,/Sortie brute pour inspection ; exclusions scientifiques non prises en charge, aucun vote filtré/);
  const button=[...cards[1].querySelectorAll('button')].find(button=>button.textContent==='Afficher la carte de corroboration');await button.onclick();assert.equal(seen.length,0);assert.deepEqual(new Uint8Array(await(await fetch(document.querySelector('.batch-result-inspection img').src)).arrayBuffer()),new Uint8Array(await model.corroboration.arrayBuffer()));
  const single=[...cards[0].querySelectorAll('button')].find(button=>button.textContent==='Afficher les biomes');await single.onclick();assert.equal(seen.length,0);assert.equal(document.querySelectorAll('.batch-result-inspection').length,1);assert.deepEqual(new Uint8Array(await(await fetch(document.querySelector('.batch-result-inspection img').src)).arrayBuffer()),new Uint8Array(await model.native.arrayBuffer()));
  assert.deepEqual([...model.artifacts.entries()],before);
 }finally{await ui.dispose();}
});

test('pending or stale final displays cannot replace a native single-method output and preview URLs are retired on rerender/dispose',async()=>{
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>'),model=displayFixture(),oldRevoke=URL.revokeObjectURL,revoked=[];model.images=model.images.slice(0,1);model.images[0].finalDisplay.pendingRendering=true;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};URL.revokeObjectURL=url=>{revoked.push(url);oldRevoke(url);};
 let ui;
 try{ui=await mountBatchUI({document,resultDisplayFactory:unavailableResultDisplayFactory,importerFactory:async()=>model,preparationFactory:()=>({prepare:async()=>{},dispose:async()=>{}})});await flush();const original=ui.dialog.querySelector('.batch-final-preview img').src;assert.match(ui.dialog.querySelector('figcaption').textContent,/Biomes/);ui.open();await flush();assert.ok(revoked.includes(original));const latest=ui.dialog.querySelector('.batch-final-preview img').src;await ui.dispose();ui=null;assert.ok(revoked.includes(latest));}
 finally{await ui?.dispose();URL.revokeObjectURL=oldRevoke;}
});
test('Failures are visible outside collapsed outputs, while the partial result and exports remain available',async()=>{
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>'),model=displayFixture();model.images=model.images.slice(1,2);model.images[0].score.incomplete=true;model.images[0].runs.push({title:'SSG',kind:'clones',status:'error',files:[],error:{code:'INVALID_INPUT',message:'Original forest unavailable'}});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 const ui=await mountBatchUI({document,resultDisplayFactory:unavailableResultDisplayFactory,importerFactory:async()=>model,preparationFactory:()=>({prepare:async()=>{},dispose:async()=>{}})});
 try{const errors=ui.dialog.querySelector('.batch-failure-summary');assert.ok(errors);assert.match(errors.textContent,/1 analyses incomplètes sur 2/);assert.match(errors.textContent,/SSG.*INVALID_INPUT.*Original forest unavailable/);assert.match(ui.dialog.querySelector('figcaption').textContent,/partielle.*1\/2 analyses terminées/);assert.equal(ui.canExport,true);assert.equal([...ui.dialog.querySelectorAll('button')].find(b=>b.textContent==='Exporter le rapport PDF').disabled,false);}finally{await ui.dispose();}
});
