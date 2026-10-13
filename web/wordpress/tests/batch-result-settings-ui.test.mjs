import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBatchUI} from '../sherloq-browser/assets/batch-ui.js';
import {BATCH_DISPLAY_PREFERENCES_SCHEMA} from '../sherloq-browser/assets/batch-result-display.js';
import {displayFixture} from './batch-display-fixture.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function dom(){
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};
 window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};
 window.HTMLElement.prototype.checkValidity=function(){return true;};
 window.HTMLCanvasElement.prototype.getContext=function(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:data=>{this.lastPixels=Array.from(data.data);}};};
 return document;
}
test('result opacity and biome switching change presentation without new analysis, counts, source or score changes',async()=>{
 const document=dom(),model=displayFixture(),image=model.images[1];model.images=[image];
 const before=structuredClone({runs:image.runs,score:image.score,configuration:model.configuration,finalDisplay:image.finalDisplay}),seen=[];
 let previews=0,renders=0,detectors=0;
 const service={
  describe(image){return {available:true,preferences:image.displayPreferences??{schema:BATCH_DISPLAY_PREFERENCES_SCHEMA,version:1,mode:'corroboration',opacity:.35}};},
  async preparePreview(){previews++;return {width:2,height:2,corroboration:{rgba:new Uint8ClampedArray([255,0,0,255,0,0,0,0,255,0,0,255,0,0,0,0])},biomes:{rgba:new Uint8ClampedArray([230,170,30,255,0,0,0,0,230,170,30,255,0,0,0,0])}};},
  async ensureRendered(image,options){renders++;assert.equal(options.mode,'biomes');assert.equal(options.opacity,.15);return {blob:new Blob(['existing-counts-rendered-view'])};},
  async dispose(){},
 };
 const ui=await mountBatchUI({document,importerFactory:async()=>model,preparationFactory:()=>({prepare:async()=>{},dispose:async()=>{}}),resultDisplayFactory:()=>service,runnerFactory:()=>{detectors++;throw Error('Display must not start a runner');},onInspect:file=>seen.push(file)});
 try{
  await flush();const card=ui.dialog.querySelector('.batch-image-result'),opacity=card.querySelector('input[type=range]'),mode=card.querySelector('[data-result-mode=biomes]'),canvas=card.querySelector('canvas');
  assert.equal(opacity.value,'35');assert.equal(canvas.style.opacity,'0.35');assert.equal(previews,1);assert.equal(renders,0);
  opacity.value='15';opacity.oninput();assert.equal(canvas.style.opacity,'0.15');assert.equal(card.querySelector('output').textContent,'15 %');
  mode.onclick();assert.equal(mode.getAttribute('aria-pressed'),'true');assert.equal(card.querySelector('[data-result-mode=corroboration]').getAttribute('aria-pressed'),'false');assert.match(card.querySelector('figcaption').textContent,/Biomes.*maximum C2/);assert.match(card.querySelector('.batch-biome-legend').textContent,/Même couleur/);
  assert.deepEqual(canvas.lastPixels.slice(0,4),[230,170,30,255]);assert.equal(previews,1);assert.equal(renders,0);assert.equal(detectors,0);
  const button=[...card.querySelectorAll('button')].find(button=>button.textContent==='Afficher les biomes');await button.onclick();assert.equal(renders,1);assert.equal(await seen[0].text(),'existing-counts-rendered-view');
  assert.deepEqual({runs:image.runs,score:image.score,configuration:model.configuration,finalDisplay:image.finalDisplay},before);
  assert.equal(image.displayPreferences.schema,BATCH_DISPLAY_PREFERENCES_SCHEMA);assert.equal(image.displayPreferences.mode,'biomes');assert.equal(image.displayPreferences.opacity,.15);
 }finally{await ui.dispose();}
});

test('ZIP image format defaults to PNG and exposes the existing lossless/quality/chroma protocol',async()=>{
 const document=dom(),model=displayFixture();let detectors=0;
 const ui=await mountBatchUI({document,importerFactory:async()=>model,preparationFactory:()=>({prepare:async()=>{},dispose:async()=>{}}),resultDisplayFactory:()=>({describe:()=>({available:false,reason:'Legacy preview only'}),dispose:async()=>{}}),runnerFactory:()=>{detectors++;throw Error('No detector allowed');}});
 const settings=()=>ui.dialog.querySelector('.batch-export-settings');
 const field=text=>[...settings().querySelectorAll('label')].find(label=>label.querySelector('span')?.textContent===text)?.querySelector('input,select');
 try{
  assert.equal(field('Format d’export des images').value,'png');assert.deepEqual([...field('Format d’export des images').options].map(o=>o.value),['png','webp','tiff','avif','heic']);assert.equal(field('Compression PNG').value,'6');
  const format=field('Format d’export des images');format.value='webp';format.onchange();assert.equal(field('Sans perte').checked,true);assert.equal(!!field('Qualité (%)'),false);
  field('Sans perte').checked=false;field('Sans perte').onchange();assert.equal(Number(field('Qualité (%)').min),1);field('Qualité (%)').value='87';field('Qualité (%)').oninput();assert.equal(model.imageExportSettings.webpQuality,87);assert.equal(model.imageExportSettings.webpLossless,false);
  field('Format d’export des images').value='avif';field('Format d’export des images').onchange();assert.equal(!!field('Chroma'),true);field('Sans perte').checked=true;field('Sans perte').onchange();assert.equal(!!field('Chroma'),false);assert.equal(!!field('Qualité (%)'),false);
  field('Redimensionner les images').checked=true;field('Redimensionner les images').onchange();field('Hauteur (px)').value='120';field('Hauteur (px)').onchange();assert.equal(model.imageExportSettings.resizeAxis,'height');assert.equal(model.imageExportSettings.height,120);assert.equal(detectors,0);
 }finally{await ui.dispose();}
});

test('restored result summary keeps its original reporting threshold rather than next-run defaults',async()=>{
 const document=dom(),model=displayFixture();model.images=[model.images[1]];model.results=null;model.configuration.options.threshold=3;
 const ui=await mountBatchUI({document,importerFactory:async()=>model,preparationFactory:()=>({prepare:async()=>{},dispose:async()=>{}}),resultDisplayFactory:()=>({describe:()=>({available:false}),dispose:async()=>{}})});
 try{assert.match(ui.dialog.querySelector('.batch-summary').textContent,/^0 études à examiner/);assert.equal(model.images[0].score.clones,2);assert.equal(model.configuration.options.threshold,3);}finally{await ui.dispose();}
});

test('a biome capability rejected after reading metadata selects the real corroboration map, preserves edited opacity and explains the missing geometry',async()=>{
 const document=dom(),model=displayFixture(),image=model.images[1];model.images=[image];
 image.displayPreferences={schema:BATCH_DISPLAY_PREFERENCES_SCHEMA,version:1,mode:'biomes',opacity:.35};
 const before=structuredClone({runs:image.runs,score:image.score,configuration:model.configuration,finalDisplay:image.finalDisplay}),original=image.blob,seen=[];
 const reason='Les coordonnées scientifiques des biomes sont absentes de cette archive.';
 const rgba=Uint8ClampedArray.from([255,31,0,255,0,0,0,0,255,31,0,255,0,0,0,0]);
 let entered,finish,verified=false,previews=0,renders=0,detectors=0;
 const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>finish=resolve);
 const capabilities=()=>({biomes:{available:!verified,...(verified?{reason}:{})},corroboration:{available:true}});
 const service={
  describe(){return {available:true,capabilities:capabilities(),preferences:{...image.displayPreferences,...(verified?{mode:'corroboration',opacity:.99}:{})},...(verified?{reason}:{})};},
  async preparePreview(){previews++;entered();await gate;verified=true;return {width:2,height:2,corroboration:{rgba},biomes:null,metadata:{capabilities:capabilities()}};},
  async ensureRendered(value,options){renders++;assert.equal(value,image);assert.equal(options.mode,'corroboration');assert.equal(options.opacity,.47);return {blob:new Blob(['real corroboration from existing counts'])};},
  async dispose(){},
 };
 const ui=await mountBatchUI({document,importerFactory:async()=>model,preparationFactory:()=>({async prepare(){},async dispose(){}}),resultDisplayFactory:()=>service,runnerFactory:()=>{detectors++;throw Error('Display fallback must not run detectors');},onInspect:file=>seen.push(file)});
 try{
  await started;const card=ui.dialog.querySelector('.batch-image-result'),biomes=card.querySelector('[data-result-mode=biomes]'),corroboration=card.querySelector('[data-result-mode=corroboration]'),opacity=card.querySelector('input[type=range]'),canvas=card.querySelector('canvas');
  assert.equal(biomes.getAttribute('aria-pressed'),'true');opacity.value='47';opacity.oninput();finish();await flush();
  assert.equal(image.displayPreferences.mode,'corroboration');assert.equal(image.displayPreferences.opacity,.47);
  assert.equal(biomes.disabled,true);assert.equal(biomes.getAttribute('aria-pressed'),'false');assert.equal(biomes.title,reason);
  assert.equal(corroboration.disabled,false);assert.equal(corroboration.getAttribute('aria-pressed'),'true');
  assert.match(card.querySelector('figcaption').textContent,/corroboration.*C2/);assert.ok(card.textContent.includes(reason));
  assert.equal(canvas.hidden,false);assert.equal(canvas.style.opacity,'0.47');assert.deepEqual(canvas.lastPixels,Array.from(rgba));
  biomes.onclick();assert.equal(image.displayPreferences.mode,'corroboration');assert.equal(previews,1);assert.equal(renders,0);assert.equal(detectors,0);
  await [...card.querySelectorAll('button')].find(button=>button.textContent==='Afficher la carte de corroboration').onclick();
  assert.equal(renders,1);assert.equal(await seen[0].text(),'real corroboration from existing counts');
  assert.deepEqual({runs:image.runs,score:image.score,configuration:model.configuration,finalDisplay:image.finalDisplay},before);
  assert.equal(image.blob,original);assert.equal(detectors,0);
 }finally{finish();await ui.dispose();}
});
