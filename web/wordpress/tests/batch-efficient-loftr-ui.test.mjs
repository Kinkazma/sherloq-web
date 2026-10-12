import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBatchUI} from '../sherloq-browser/assets/batch-ui.js';
import {batchCatalog,batchPairSelection} from '../sherloq-browser/assets/batch-catalog.js';

const pair=[{x0:4,y0:6,x1:52,y1:54},{x0:72,y0:12,x1:136,y1:76}];
async function fixture({candidates=pair}={}){
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>');globalThis.document=document;globalThis.localStorage={getItem(){return null;},setItem(){}};
 window.HTMLInputElement.prototype.reportValidity=()=>true;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 const image={id:'image-synthetic',hash:'exact-pixels',name:'source.png',blob:new Blob(['source']),thumbnail:new Blob(['thumbnail'],{type:'image/png'}),width:160,height:96,family:'photography',selected:true,occurrences:[{studyId:'study'}],runs:[],state:'ready'},calls=[];
 const model={images:[image],studies:[{id:'study',name:'source',errors:[]}],errors:[],artifacts:{has(){return false;},async clear(){},async dispose(){}},async import(){},async clear(){}};
 const runner={async preparePair(image){calls.push(['prepare']);image.panels={regions:candidates.map((r,i)=>({id:'p'+i,bounds:[r.x0,r.y0,r.x1,r.y1]}))};const selection=candidates.length===2?image.pairSelection=batchPairSelection(image,candidates,'detected'):null;return {candidates,selection};},async run(model,recipes){calls.push(['run',recipes]);model.results=[];model.finishedAt=new Date().toISOString();},cancel(){},async clear(){}};
 image.preparation={schema:'sherloq.scientific-scope/1',status:'ready',sourceSha256:'a'.repeat(64),width:image.width,height:image.height,fingerprint:'prepared-ui-fixture',regions:[{x0:0,y0:0,x1:image.width,y1:image.height,type:'photography',confidence:1}],excluded:[]};
 const ui=await mountBatchUI({document,language:()=> 'fr',importerFactory:async()=>model,runnerFactory:options=>{assert.equal(typeof options.onProgress,'function');return runner;}});
 const select=ui.dialog.querySelector('[data-batch-tool="'+batchCatalog.find(r=>r.params.algorithm==='EfficientLoFTR').id+'"]');select.checked=true;select.onchange();
 const confirm=[...ui.dialog.querySelectorAll('.batch-selection-bar button')].find(b=>b.textContent==='Confirmer la sélection');confirm.onclick();
 return {ui,document,image,calls};
}

test('batch UI selects EfficientLoFTR and prepares missing pairs before running any recipes',async()=>{
 const f=await fixture();try{assert.equal(f.ui.dialog.querySelector('[data-batch-pairs="all"]').hidden,false);await f.ui.run();assert.deepEqual(f.calls.map(c=>c[0]),['prepare','run']);assert.equal(f.image.pairSelection.regions.length,2);assert.ok(f.calls[1][1].some(r=>r.params.algorithm==='EfficientLoFTR'));}finally{await f.ui.dispose();}
});
test('ambiguous detection stays in Images, shows all panels, and does not start long calculations',async()=>{
 const f=await fixture({candidates:[...pair,{x0:8,y0:78,x1:40,y1:94}]});try{await f.ui.run();assert.deepEqual(f.calls.map(c=>c[0]),['prepare']);assert.equal(f.image.pairSelection,undefined);assert.equal(f.ui.dialog.querySelector('[data-batch-step="1"]').hidden,false);const selectors=[...f.ui.dialog.querySelectorAll('[data-pair-panel]')];assert.equal(selectors.length,2);assert.equal(selectors[0].options.length,4);assert.equal(selectors[0].value,'');
 selectors[0].value='0';selectors[0].onchange();selectors[1].value='2';selectors[1].onchange();f.ui.dialog.querySelector('[data-confirm-pair]').onclick();assert.deepEqual(f.image.pairSelection.regions,[pair[0],{x0:8,y0:78,x1:40,y1:94}]);assert.equal(f.image.pairSelection.source,'selected-panels');await f.ui.run();assert.equal(f.calls.at(-1)[0],'run');}finally{await f.ui.dispose();}
});
test('manual coordinate entry works in any order and requires explicit confirmation after edits',async()=>{
 const f=await fixture({candidates:[]});try{
 const inputs=f.ui.dialog.querySelectorAll('[data-pair-field]');assert.equal(inputs.length,8);
 for(const [index,r]of pair.entries())for(const [key,value]of [['width',r.x1-r.x0],['height',r.y1-r.y0],['y0',r.y0],['x0',r.x0]]){const node=f.ui.dialog.querySelector('[data-pair-field="'+index+':'+key+'"]');node.value=value;node.oninput();}
 assert.equal(f.image.pairDraftDirty,true);await f.ui.run();assert.equal(f.calls.length,0);
 f.ui.dialog.querySelector('[data-confirm-pair]').onclick();assert.deepEqual(f.image.pairSelection.regions,pair);assert.equal(f.image.pairDraftDirty,false);await f.ui.run();assert.deepEqual(f.calls.map(c=>c[0]),['run']);
 }finally{await f.ui.dispose();}
});
test('UI refuses duplicate selected panels without turning them into a confirmed pair',async()=>{
 const f=await fixture({candidates:[...pair,{x0:8,y0:78,x1:40,y1:94}]});try{await f.ui.run();const selects=[...f.ui.dialog.querySelectorAll('[data-pair-panel]')];for(const select of selects){select.value='1';select.onchange();}f.ui.dialog.querySelector('[data-confirm-pair]').onclick();assert.equal(f.image.pairSelection,undefined);assert.equal(f.image.pairError.code,'BATCH_PAIR_REQUIRED');assert.match(f.ui.dialog.querySelector('.batch-pair-editor').textContent,/distincts/);await f.ui.run();assert.equal(f.calls.some(c=>c[0]==='run'),false);}finally{await f.ui.dispose();}
});
