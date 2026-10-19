import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {batchCatalog,catalogRecipe,batchRecipeView,batchTask,batchScopeSupport,batchRitaFullFrameScope} from '../sherloq-browser/assets/batch-catalog.js';
import {mapEvidence} from '../sherloq-browser/assets/batch-evidence.js';
import {createBatchRunner} from '../sherloq-browser/assets/batch-runner.js';
import {batchImageDisplay,batchDisplayCaption} from '../sherloq-browser/assets/batch-export.js';
import {batchAutomaticThreshold} from '../sherloq-browser/assets/batch-selection-policy.js';
import {mountBatchUI} from '../sherloq-browser/assets/batch-ui.js';
import {unavailableResultDisplayFactory} from './batch-display-fixture.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
function scope(sourceSha256='a'.repeat(64)){return {schema:'sherloq.scientific-scope/1',version:'fixture/1',coordinates:'original-pixels',width:8,height:8,status:'ready',sourceSha256,fingerprint:'b'.repeat(64),regions:[{x0:0,y0:0,x1:8,y1:8,type:'photography'}],excluded:[],text:{status:'complete',polygons:[]},models:{}};}

test('RITA is an AI numeric-map method alongside TruFor, with independent native score and view defaults',()=>{
 const r=catalogRecipe('m2.rita');assert.equal(r.kind,'map');assert.equal(r.group,catalogRecipe('m2.trufor').group);assert.equal(r.signal.threshold,.5);assert.equal(r.signal.minimumPixels,32);assert.deepEqual(batchRecipeView(r),{mode:'overlay',threshold:.5,opacity:.6});assert.equal(batchAutomaticThreshold([r]).count,1);
 r.view.opacity=.2;assert.equal(catalogRecipe('m2.rita').view.opacity,.6);assert.match(r.description[1],/Uncalibrated/);
});

test('saved RITA score, mode, opacity and scientific parameters reach the normal M2 task without cropping',()=>{
 const r=catalogRecipe('m2.rita');r.signal.threshold=.82;r.view={mode:'mask',opacity:.31,threshold:.5};r.params={nativeSetting:42};const task=batchTask(r,{id:'task',imageId:'image',scientificScope:scope()});
 assert.deepEqual(task.view,{mode:'mask',opacity:.31,threshold:.82});assert.deepEqual(task.params,{nativeSetting:42});assert.equal(task.scientificScope,undefined);assert.equal(task.regions,undefined);assert.deepEqual(r.view,{mode:'mask',opacity:.31,threshold:.5});
});

test('full-frame admission is conservative; text, holes, polygons and subpanels cannot masquerade as pre-excluded RITA',()=>{
 const r=catalogRecipe('m2.rita'),s=scope();assert.equal(batchRitaFullFrameScope(s),true);assert.equal(batchScopeSupport(r,s).mode,'native-full-frame');
 s.regions[0].polygon=[[0,0],[7,0],[7,7],[0,7]];assert.equal(batchRitaFullFrameScope(s),true);
 for(const edit of [x=>x.excluded.push([[2,2],[3,2],[3,3],[2,3]]),x=>x.text.polygons.push([[2,2],[3,2],[3,3],[2,3]]),x=>x.regions[0].x1=7,x=>x.regions[0].polygon=[[0,0],[7,0],[3,7],[0,7]],x=>x.regions[0].polygon=[[0,0],[7,7],[7,0],[0,7]]]){
  const partial=structuredClone(s);edit(partial);assert.equal(batchRitaFullFrameScope(partial),false);const receipt=batchScopeSupport(r,partial);assert.equal(receipt.mode,'raw-only');assert.equal(receipt.qualifiedForScopedSignal,false);assert.equal(receipt.exclusionsBeforeInference,false);assert.equal(receipt.rawModelOutputsPreserved,true);
 }
});

test('RITA map evidence consumes native scalar scores and labels their interpretation without using rendered red pixels',async()=>{
 const r=catalogRecipe('m2.rita');r.signal.minimumPixels=2;let reads=0;const values=Float32Array.of(.49,.5,.9,0),output={m2Result:{fields:{map:{}}}},client={async readScalar(_,rect,field){reads++;assert.equal(field,'map');assert.deepEqual(rect,{x:0,y:0,width:2,height:2});return values;}};
 const found=await mapEvidence(output,r,client,{width:2,height:2},new AbortController().signal);assert.equal(reads,1);assert.equal(found.positive,true);assert.equal(found.pixels,2);assert.equal(found.threshold,.5);assert.equal(found.scoreMeaning,'uncalibrated-class-margin');assert.equal(found.defaultThreshold,.5);assert.deepEqual(found.regions[0].bbox,[0,0,2,2]);
});

// A transport fixture only. Real browser-native model/PNG/NPZ/archive behavior
// is qualified separately; these tests exercise cancellation and durable reuse.
function fixture({partial=false,count=1}={}){
 const images=Array.from({length:count},(_,i)=>{const bytes='original source '+i,sha=digest(bytes),s=scope(sha);if(partial)s.excluded=[[[1,1],[2,1],[2,2],[1,2]]];return {id:'image-'+i,name:'source-'+i+'.png',hash:digest('decoded'+i),sourceSha256:sha,width:8,height:8,blob:new Blob([bytes],{type:'image/png'}),selected:true,state:'ready',runs:[],family:'photography',occurrences:[{studyId:'study-'+i}],preparation:s};});
 const artifacts=new Map(),calls=[],model={images,studies:images.map((image,i)=>({id:'study-'+i,name:image.name,kind:'image',blob:image.blob,errors:[]})),artifacts,errors:[]};let source,runner,stop=false,interruptionScheduled=false;
 const tool={get source(){return source;},async load(input){source={id:input.id,sha256:images.find(i=>i.id===input.id).sourceSha256};return source;},async run(task){calls.push(task);if(stop){stop=false;runner.cancel();throw Object.assign(Error('Interrupted'),{code:'CANCELLED'});}return {operation:'m2.rita',data:{metadata:{scoreType:'uncalibrated-class-margin'}},provenance:{originalSha256:source.sha256},metrics:{fixture:true},m2Result:{id:'result',fields:{map:{},official_mask:{},labels:{},logits:{}}},views:[{width:8,height:8,m2Result:'result',view:task.view.mode}]};},async readWindow(_,rect){return {...rect,data:new Uint8Array(rect.width*rect.height*3)};},async readScalar(){return new Float32Array(64).fill(.75);},async export(type){return new Blob([type==='json'?'{}':type]);},cancel(){},async dispose(){source=null;}};
 runner=createBatchRunner({toolFactory:async()=>tool,onProgress:event=>{if(count>1&&!interruptionScheduled&&event.phase==='image-done'&&event.index===1){stop=true;interruptionScheduled=true;}}});return {images,artifacts,calls,model,runner};
}
async function local(fn){const previousFetch=globalThis.fetch,previousCanvas=globalThis.OffscreenCanvas;globalThis.fetch=async()=>({ok:true,json:async()=>({engineVersion:'fixture',engineCommit:'fixed',runtimeSourceIncrementSha256:'fixed'})});globalThis.OffscreenCanvas=class{getContext(){return {createImageData:(w,h)=>({data:new Uint8Array(w*h*4)}),putImageData(){}};}async convertToBlob(){return new Blob(['PNG transport fixture']);}};try{return await fn();}finally{globalThis.fetch=previousFetch;if(previousCanvas===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previousCanvas;}}

test('full native RITA batch signals, exports, saves provenance and reuses a completed image without another method call',async()=>local(async()=>{
 const f=fixture(),r=catalogRecipe('m2.rita');r.view={mode:'mask',threshold:.5,opacity:.3};await f.runner.run(f.model,[r],{basis:'total',reuse:true});const run=f.images[0].runs[0];assert.equal(run.status,'done');assert.equal(run.scopeSupport.mode,'native-full-frame');assert.equal(run.positive,true);assert.equal(run.pixels,64);assert.equal(f.images[0].score.additional,1);assert.equal(f.images[0].score.clones,0);assert.equal(run.provenance.originalSha256,f.images[0].sourceSha256);assert.deepEqual(run.effectiveView,r.view);for(const ext of ['png','npz','json'])assert.ok(run.files.some(p=>p.endsWith('.'+ext)));assert.ok(run.resumeEvidence);
 const display=batchImageDisplay(f.images[0],f.artifacts);assert.equal(display.kind,'native');assert.equal(display.rawInspection,false);assert.equal(display.view.mode,'mask');await f.runner.run(f.model,[r],{basis:'total',reuse:true});assert.equal(f.calls.length,1);assert.equal(f.images[0].reused,true);
}));

test('RITA with an excluded patch keeps raw PNG/NPZ/provenance but cannot cast a scoped signal or misleading preview caption',async()=>local(async()=>{
 const f=fixture({partial:true});await f.runner.run(f.model,[catalogRecipe('m2.rita')],{basis:'total'});const run=f.images[0].runs[0];assert.equal(run.status,'done');assert.equal(run.scopeSupport.mode,'raw-only');assert.equal(run.positive,false);assert.equal(f.images[0].score.additional,0);assert.equal(run.pixels,undefined);assert.ok(run.files.some(p=>p.endsWith('.npz')));const display=batchImageDisplay(f.images[0],f.artifacts);assert.equal(display.rawInspection,true);assert.match(batchDisplayCaption(display,{language:'en'}),/exclusions not applied/);
}));

test('interrupted RITA batch resumes only the unfinished image and retains the completed native artifacts',async()=>local(async()=>{
 const f=fixture({count:2}),r=catalogRecipe('m2.rita');await f.runner.run(f.model,[r],{basis:'total'});assert.equal(f.model.cancelled,true);const saved=f.images[0].runs[0],files=saved.files.map(p=>[p,f.artifacts.get(p)]);assert.deepEqual(f.images.map(i=>i.runs[0].status),['done','cancelled']);await f.runner.run(f.model,[r],{basis:'total',resume:true});assert.equal(f.calls.length,3);assert.equal(f.images[0].reused,true);assert.equal(f.images[1].runs[0].status,'done');for(const [path,blob]of files)assert.equal(f.artifacts.get(path),blob);
}));

test('RITA batch user controls persist score, mode and opacity, without accidental clone-length controls',async()=>{
 const {document,window}=parseHTML('<html lang="fr"><body></body></html>'),old={document:globalThis.document,localStorage:globalThis.localStorage};globalThis.document=document;let saved;globalThis.localStorage={getItem:()=>null,setItem:(key,value)=>{saved=JSON.parse(value);}};window.HTMLInputElement.prototype.reportValidity=()=>true;Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 const artifacts=new Map();artifacts.dispose=async()=>{};const model={images:[],studies:[],errors:[],artifacts,async clear(){},async import(){}},ui=await mountBatchUI({document,importerFactory:async()=>model,preparationFactory:()=>({async prepare(){},async dispose(){}}),resultDisplayFactory:unavailableResultDisplayFactory});
 try{const check=ui.dialog.querySelector('[data-batch-tool="m2.rita"]'),card=check.closest('.batch-tool');assert.equal(card.querySelector('[data-batch-view="low"]'),null);check.checked=true;check.onchange();const mode=card.querySelector('[data-batch-rita-view="mode"]'),opacity=card.querySelector('[data-batch-rita-view="opacity"]'),threshold=card.querySelector('[data-batch-signal="threshold"]');assert.equal(mode.value,'overlay');assert.equal(opacity.value,'60');assert.equal(threshold.value,'0.5');mode.value='probability';mode.onchange();opacity.value='25';opacity.oninput();threshold.value='.82';threshold.onchange();const r=saved.recipes.find(r=>r.id==='m2.rita');assert.deepEqual(r.view,{mode:'probability',threshold:.82,opacity:.25});assert.equal(r.signal.threshold,.82);assert.match(threshold.closest('label').textContent,/non calibré/);assert.ok(batchCatalog.find(r=>r.id==='m2.rita'));}finally{await ui.dispose();Object.assign(globalThis,old);}
});
