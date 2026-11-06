import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBatchUI} from '../sherloq-browser/assets/batch-ui.js';
import {batchChoiceValue,normalizeBatchSherloqParams,normalizeBatchSherloqRecipe} from '../sherloq-browser/assets/batch-sherloq-settings.js';
import {unavailableResultDisplayFactory} from './batch-display-fixture.mjs';

const operation='inspection.sherloq7c',settingsKey='sherloq.batch.settings';
const legacy={id:operation,params:{revelation:76,micro:12,precision:'reference'},backend:'cpu'};
const saved=(recipes=[legacy])=>({recipes,options:{basis:'total',threshold:1,reuse:true}});
const scope=status=>({status,fingerprint:'f'.repeat(64),regions:[],excluded:[]});

async function fixture({language='fr',settings=saved(),preparation=scope('ready')}={}){
 const {document,window}=parseHTML('<html><body></body></html>');document.documentElement.lang=language;
 const previous={document:globalThis.document,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
 globalThis.document=document;let stored=JSON.stringify(settings);
 globalThis.localStorage={getItem:key=>key===settingsKey?stored:null,setItem(key,value){if(key===settingsKey)stored=value;}};
 globalThis.fetch=async()=>({ok:true,json:async()=>({engineVersion:'ui-protocol',engineCommit:'pinned',runtimeSourceIncrementSha256:'pinned'})});
 window.HTMLInputElement.prototype.setCustomValidity=function(message){this._customValidationMessage=String(message);};
 window.HTMLInputElement.prototype.reportValidity=window.HTMLInputElement.prototype.checkValidity=function(){
  if(this.disabled||this.type!=='number')return true;if(this._customValidationMessage)return false;if(this.value==='')return !this.required;
  const value=Number(this.value);return Number.isFinite(value)&&(this.min==null||this.min===''||value>=Number(this.min))&&(this.max==null||this.max===''||value<=Number(this.max));
 };
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,
  get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.value??this.options[0]?.value??'';},
  set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 window.HTMLSelectElement.prototype.reportValidity=window.HTMLSelectElement.prototype.checkValidity=function(){return this.disabled||[...this.options].some(option=>option.value===this.value);};
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};
 const original=new Blob(['untouched original'],{type:'image/png'}),artifacts=new Map();artifacts.dispose=async()=>{};
 const image={id:'image',hash:'pixels',name:'image.png',width:32,height:32,selected:true,family:'photography',state:'ready',runs:[],blob:original,thumbnail:original,occurrences:[{studyId:'study',page:1}],...(preparation===undefined?{}:{preparation})};
 const model={images:[image],studies:[{id:'study',name:'image.png',kind:'image',blob:original,errors:[]}],errors:[],artifacts,async clear(){}};
 const runs=[];let ui;
 try{ui=await mountBatchUI({document,language:()=>language,importerFactory:async()=>model,
  preparationFactory:()=>({async prepare(){},async dispose(){}}),resultDisplayFactory:unavailableResultDisplayFactory,
  runnerFactory:()=>({async run(value,recipes,options){runs.push(structuredClone({recipes,options}));value.results=[];},async clear(){},cancel(){}})});}
 catch(error){Object.assign(globalThis,previous);throw error;}
 const card=()=>ui.dialog.querySelector('[data-batch-tool="'+operation+'"]').closest('.batch-tool');
 const parameter=key=>card().querySelector('[data-parameter="'+key+'"]');
 const button=key=>ui.dialog.querySelector('.batch-selection-bar [data-batch-word="'+key+'"]');
 return {ui,model,image,runs,card,parameter,button,
  get persisted(){return JSON.parse(stored);},
  get recipe(){return this.persisted.recipes.find(recipe=>recipe.id===operation);},
  async confirm(){await button('selection').onclick();},
  async keepAll(){await button('all').onclick();},
  async dispose(){try{await ui.dispose();}finally{Object.assign(globalThis,previous);}}};
}

test('batch choices preserve each option type, including native size and nullable choices',()=>{
 const definition={key:'maxSide',value:512,choices:[{value:256},{value:512},{value:'native'},{value:null}]};
 assert.equal(batchChoiceValue(definition,'256'),256);assert.equal(batchChoiceValue(definition,'native'),'native');assert.equal(batchChoiceValue(definition,'null'),null);
 assert.equal(batchChoiceValue({...definition,nullable:true},''),null);assert.throws(()=>batchChoiceValue(definition,''),{code:'INVALID_INPUT'});
 assert.throws(()=>batchChoiceValue(definition,'invalid'),{code:'INVALID_INPUT'});
});

test('legacy SHERLOQ batch preferences migrate without changing other operations or explicit settings',()=>{
 const params=normalizeBatchSherloqParams(legacy.params);assert.deepEqual(params,{computationMode:'fast',maxSide:512,revelation:76,micro:12,precision:'1e-2'});
 assert.equal(normalizeBatchSherloqParams({maxSide:NaN}).maxSide,512);assert.equal(normalizeBatchSherloqParams({maxSide:null}).maxSide,512);
 assert.equal(normalizeBatchSherloqParams({maxSide:'native',computationMode:'precision'}).maxSide,'native');
 assert.throws(()=>normalizeBatchSherloqParams({maxSide:333}),{code:'INVALID_INPUT'});assert.throws(()=>normalizeBatchSherloqParams({computationMode:'wrong'}),{code:'INVALID_INPUT'});
 const other={operation:'ela.classic',params:{quality:85},backend:'webgpu'};assert.equal(normalizeBatchSherloqRecipe(other),other);
});

test('SHERLOQ controls migrate old preferences and retain the precision backend when Fast hides it',async()=>{
 const f=await fixture();try{
  assert.equal(f.parameter('computationMode').value,'fast');assert.equal(f.parameter('maxSide').value,'512');
  assert.equal(f.parameter('revelation').value,'76');assert.equal(f.parameter('micro').value,'12');
  const backendRow=()=>f.card().querySelector('[data-batch-sherloq-backend]'),backend=()=>backendRow().querySelector('select');
  assert.equal(backendRow().hidden,true);assert.equal(backend().disabled,true);assert.equal(backend().value,'cpu');
  f.parameter('computationMode').value='precision';f.parameter('computationMode').onchange();
  assert.equal(backendRow().hidden,false);assert.equal(backend().disabled,false);assert.equal(backend().value,'cpu');
  backend().value='webgpu';backend().onchange();f.parameter('computationMode').value='fast';f.parameter('computationMode').onchange();
  assert.equal(backendRow().hidden,true);assert.equal(f.recipe.backend,'webgpu');
  f.parameter('maxSide').value='native';f.parameter('maxSide').onchange();assert.equal(f.recipe.params.maxSide,'native');
  f.parameter('maxSide').value='1024';f.parameter('maxSide').onchange();assert.equal(f.recipe.params.maxSide,1024);
  assert.equal(f.recipe.params.precision,'1e-2');assert.equal(f.recipe.params.revelation,76);assert.equal(f.recipe.params.micro,12);
  await f.confirm();await f.ui.run();assert.equal(f.runs.length,1);assert.equal(f.runs[0].recipes[0].params.maxSide,1024);
 }finally{await f.dispose();}
});

test('SHERLOQ labels follow the batch language without exposing French and English together',async()=>{
 for(const language of ['fr','en']){const f=await fixture({language});try{
  assert.equal(f.parameter('computationMode').closest('label').querySelector('span').textContent,language==='fr'?'Mode de calcul':'Computation mode');
  assert.deepEqual([...f.parameter('computationMode').options].map(option=>option.textContent),language==='fr'?['Rapide','Précision']:['Fast','Precision']);
  assert.equal([...f.parameter('maxSide').options].find(option=>option.value==='native').textContent,language==='fr'?'Taille réelle':'Native size');
  f.parameter('maxSide').value='native';f.parameter('maxSide').onchange();await f.confirm();await f.ui.run();assert.equal(f.runs[0].recipes[0].params.maxSide,'native');
 }finally{await f.dispose();}}
});

test('SHERLOQ-only lots can select and run excluded or unprepared whole images without changing their regions',async()=>{
 const excluded={...scope('excluded'),regions:[{x0:0,y0:0,x1:32,y1:32}],excluded:[[[0,0],[32,0],[32,32],[0,32]]]};
 for(const preparation of [excluded,null]){const before=structuredClone(preparation),f=await fixture({preparation});try{
  const check=f.ui.dialog.querySelector('.batch-image-card input[type="checkbox"]');assert.equal(check.disabled,false);
  f.image.selected=false;await f.keepAll();assert.equal(f.image.selected,true);assert.deepEqual(f.image.preparation,before);
  await f.confirm();await f.ui.run();assert.equal(f.runs.length,1);assert.equal(f.runs[0].recipes.length,1);assert.deepEqual(f.image.preparation,before);
 }finally{await f.dispose();}}
});

test('numeric choices in the other tools keep their types and backend controls',async()=>{
 const f=await fixture({settings:saved([{id:'ela.energy'},{id:'colors.plots'}])});try{
  const card=id=>f.ui.dialog.querySelector('[data-batch-tool="'+id+'"]').closest('.batch-tool');
  const block=card('ela.energy').querySelector('[data-parameter="block"]');block.value='64';block.onchange();
  const channel=card('colors.plots').querySelector('[data-parameter="x"]');channel.value='2';channel.onchange();
  assert.equal(f.persisted.recipes.find(recipe=>recipe.id==='ela.energy').params.block,64);
  assert.equal(f.persisted.recipes.find(recipe=>recipe.id==='colors.plots').params.x,2);
  assert.equal(card('ela.energy').querySelector('[data-batch-sherloq-backend]'),null);
  assert.equal([...card('ela.energy').querySelectorAll('label')].find(label=>label.querySelector('span')?.textContent==='Calcul').hidden,false);
 }finally{await f.dispose();}
});

test('adding another method retains the acquisition preparation requirement for a mixed lot',async()=>{
 const preparation=scope('excluded'),f=await fixture({preparation});try{
  const other=f.ui.dialog.querySelector('[data-batch-tool="ela.classic"]');other.checked=true;other.onchange();
  const check=f.ui.dialog.querySelector('.batch-image-card input[type="checkbox"]');assert.equal(check.disabled,true);assert.equal(f.image.selected,false);
  await f.keepAll();assert.equal(f.image.selected,false);await f.confirm();await f.ui.run();assert.equal(f.runs.length,0);assert.deepEqual(f.image.preparation,preparation);
 }finally{await f.dispose();}
});


test('SHERLOQ batch arrows edit continuous values and align their values to integers without changing typed decimal validity',async()=>{
 const f=await fixture();try{for(const field of ['revelation','micro']){
  const input=f.parameter(field),win=input.ownerDocument.defaultView;assert.equal(input.step,'any');
  if(!win.PointerEvent)win.PointerEvent=class extends win.Event{constructor(type,init={}){super(type,init);for(const [key,value]of Object.entries(init))if(!(key in this))Object.defineProperty(this,key,{value});}};
  const up=input.parentNode.querySelector('[data-numeric-direction="1"]'),down=input.parentNode.querySelector('[data-numeric-direction="-1"]');assert.ok(up&&down);
  const click=button=>{button.dispatchEvent(new win.PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,pointerId:1,isPrimary:true}));input.ownerDocument.dispatchEvent(new win.PointerEvent('pointerup',{bubbles:true,pointerId:1}));};
  input.value='.375';input.onchange();click(up);assert.equal(f.recipe.params[field],1);click(down);assert.equal(f.recipe.params[field],0);
 }}finally{await f.dispose();}
});
