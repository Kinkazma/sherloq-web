import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createOriginalSourceRegionsController} from '../sherloq-browser/assets/original-source-regions-controller.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../sherloq-browser/assets/original-source-regions.js';
const rectangle=(x0,y0,x1,y1)=>({x0,y0,x1,y1});
const deferred=()=>{let resolve;return{promise:new Promise(done=>resolve=done),resolve:value=>resolve(value)};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(options={}){
 const{document,window}=parseHTML('<html><body><section id="regions"></section></body></html>'),parent=document.getElementById('regions');let source={blob:new Blob(['original']),name:'original.png',id:'source-1',width:12,height:10,sourceSha256:'a'.repeat(64)};
 const events=[],errors=[],editors=[],batches=[],highlights=[];
 const controller=createOriginalSourceRegionsController({document,parent,source:()=>source,presentation:options.presentation??'panel',language:()=> 'fr',onChange:(value,event)=>events.push({value,event}),onOpenBatch:value=>batches.push(value),onHighlight:value=>highlights.push(value),onError:error=>errors.push(error),detectFactory:options.detectFactory??(async()=>[]),scopeEditorFactory(config){const value={config,opens:[],disposed:0,async open(options){this.opens.push(options);},async dispose(){this.disposed++;}};editors.push(value);return value;}});
 return{document,window,parent,controller,events,errors,editors,batches,highlights,source:()=>source,setSource:value=>source=value,async seed(){const state=await createOriginalSourceRegionsState(source);await state.add('acquisition',rectangle(1,1,10,8),{id:'positive'});await state.add('exclusion',rectangle(4,2,6,6),{id:'negative'});await state.add('exclusion',rectangle(8,1,9,2),{id:'disabled'});await state.setZoneEnabled('disabled',false);await controller.restore(state.serialize());return state.snapshot();}};
}

test('Original owns a portable disabled full-source state and mounts reused region controls',async()=>{
 const h=setup();try{await h.controller.ready;assert.equal(h.controller.snapshot().enabled,false);assert.equal(h.parent.hidden,false);assert.ok(h.parent.querySelector('.detection-regions-panel'));assert.ok(h.parent.querySelector('[data-original-regions="detect"]'));assert.equal(h.controller.snapshot().sourceSha256,h.source().sourceSha256);assert.deepEqual(h.controller.serialize(),structuredClone(h.controller.snapshot()));}finally{await h.controller.dispose();}
});

test('global toggle, per-zone disable, delete and keyboard undo preserve zone geometry and identity',async()=>{
 const h=setup();try{await h.controller.ready;const original=await h.seed();await h.controller.toggle(false);assert.deepEqual(h.controller.snapshot().zones,original.zones);await h.controller.toggle(true);await h.controller.remove('positive');assert.equal(h.controller.snapshot().zones.some(z=>z.id==='positive'),false);
  const event=new h.window.Event('keydown',{bubbles:true,cancelable:true});event.key='z';event.metaKey=true;h.parent.dispatchEvent(event);await h.controller.ready;assert.equal(event.defaultPrevented,true);assert.equal(h.controller.snapshot().zones[0].id,'positive');await h.controller.setZoneEnabled('positive',false);assert.equal((await compileOriginalSourceRegions(h.controller.snapshot())).empty,true);await h.controller.undo();assert.equal(h.controller.snapshot().zones[0].enabled,true);
 }finally{await h.controller.dispose();}
});

test('the existing mouse editor receives native coordinates and returns edits without losing disabled zones',async()=>{
 const h=setup();try{await h.controller.ready;await h.seed();await h.controller.edit({tool:'select',id:'positive'});const editor=h.editors[0],scope=editor.config.image.preparation;assert.equal(editor.config.classifyAcquisitions,false);assert.equal(editor.opens[0].zoneId,'positive');assert.equal(scope.manual.zones.some(z=>z.id==='disabled'),false);
  const edited=structuredClone(scope.manual.zones),positive=edited.find(z=>z.id==='positive');Object.assign(positive,rectangle(2,1,11,8),{polygon:[[2,1],[11,1],[11,8],[2,8]]});await editor.config.onSave({manual:{zones:edited}});const zones=h.controller.snapshot().zones;assert.equal(zones.find(z=>z.id==='positive').x0,2);assert.equal(zones.find(z=>z.id==='positive').originalGeometry.x0,1);assert.equal(zones.find(z=>z.id==='disabled').enabled,false);
 }finally{await h.controller.dispose();}
});

test('exclusion-only editing uses an implicit whole-image preview without inventing a permanent positive zone',async()=>{
 const h=setup();try{await h.controller.ready;await h.controller.edit({tool:'exclusion'});const editor=h.editors[0],zones=structuredClone(editor.config.image.preparation.manual.zones);assert.equal(zones[0].id,'source-implicit-whole');zones.push({id:'new-exclusion',kind:'exclusion',...rectangle(2,1,5,5),polygon:[[2,1],[5,1],[5,5],[2,5]],origin:'human'});await editor.config.onSave({manual:{zones}});assert.equal(h.controller.snapshot().positiveMode,'whole');assert.equal(h.controller.snapshot().zones.length,1);assert.equal((await compileOriginalSourceRegions(h.controller.snapshot())).countIncluded,108);
 }finally{await h.controller.dispose();}
});

test('deleting all Original editor zones returns to whole-image without a ghost empty selection',async()=>{
 const h=setup();try{await h.controller.ready;await h.controller.edit({tool:'select'});await h.editors[0].config.onSave({manual:{zones:[]}});assert.equal(h.controller.snapshot().positiveMode,'whole');assert.equal((await compileOriginalSourceRegions(h.controller.snapshot())).countIncluded,120);await h.controller.undo();assert.equal(h.controller.snapshot().positiveMode,'whole');}finally{await h.controller.dispose();}
});

test('an open editor cannot apply an obsolete revision after a different source-state command',async()=>{
 const h=setup();try{await h.controller.ready;await h.seed();await h.controller.edit({tool:'select'});const old=h.editors[0],next={manual:{zones:structuredClone(old.config.image.preparation.manual.zones)}};await h.controller.toggle(false);await assert.rejects(old.config.onSave(next),{code:'CANCELLED'});assert.equal(h.controller.snapshot().enabled,false);}finally{await h.controller.dispose();}
});

test('detection returns positive and negative proposals but a source change rejects any late result',async()=>{
 const gate=deferred(),h=setup({detectFactory:()=>gate.promise});try{await h.controller.ready;const detecting=h.controller.detect();await tick();const previous=h.source();h.setSource({...previous,id:'new',sourceSha256:'b'.repeat(64)});await h.controller.sourceChanged();gate.resolve([{id:'old',kind:'acquisition',...rectangle(1,1,5,5)}]);await assert.rejects(detecting);assert.equal(h.controller.snapshot().sourceSha256,'b'.repeat(64));assert.equal(h.controller.snapshot().zones.length,0);}finally{gate.resolve([]);await h.controller.dispose();}
});

test('successful injected detection enables a selected scope with priority exclusions',async()=>{
 const h=setup({detectFactory:async()=>[{id:'p',kind:'acquisition',...rectangle(1,1,8,8)},{id:'text',kind:'exclusion',role:'text',...rectangle(3,2,6,4)}]});try{await h.controller.ready;await h.controller.detect();assert.equal(h.controller.snapshot().enabled,true);assert.equal(h.controller.snapshot().positiveMode,'selected');const scope=await compileOriginalSourceRegions(h.controller.snapshot());assert.equal(scope.countIncluded,43);assert.equal(scope.containsOriginal(4,3),false);}finally{await h.controller.dispose();}
});

test('Open in batch passes the verified snapshot while editing remains local and immutable',async()=>{
 const h=setup();try{await h.controller.ready;await h.seed();h.parent.querySelector('[data-original-regions="batch"]').onclick();await tick();assert.equal(h.batches.length,1);assert.equal(h.batches[0],h.controller.snapshot());assert.ok(Object.isFrozen(h.batches[0]));assert.equal(h.errors.length,0);}finally{await h.controller.dispose();}
});

test('redundant commands publish no spurious change and disposal removes only its own region UI',async()=>{
 const h=setup();await h.controller.ready;const initial=h.events.length;await h.controller.toggle(false);await h.controller.undo();assert.equal(h.events.length,initial);await h.controller.dispose();await h.controller.dispose();assert.equal(h.parent.querySelector('.original-source-regions'),null);assert.equal(h.parent.querySelector('link'),null);
});

test('dispose waits for its cancelled detection owner and prevents a late region publication',async()=>{
 const gate=deferred(),h=setup({detectFactory:()=>gate.promise});await h.controller.ready;const operation=h.controller.detect();await tick();let done=false;const closing=h.controller.dispose().then(()=>done=true);await tick();assert.equal(done,false);let secondDone=false;const secondClosing=h.controller.dispose().then(()=>secondDone=true);await tick();assert.equal(secondDone,false);gate.resolve([{id:'late',kind:'acquisition',...rectangle(1,1,5,5)}]);await assert.rejects(operation);await Promise.all([closing,secondClosing]);assert.equal(secondDone,true);assert.equal(h.controller.snapshot(),null);assert.equal(h.parent.querySelector('.original-source-regions'),null);
});


test('Original toolbar permits explicit whole-image recovery after clearing an active selection',async()=>{
 const h=setup({presentation:'toolbar'});try{await h.controller.ready;const toggle=h.parent.querySelector('[data-original-regions="enabled"]');assert.equal(toggle.tagName,'BUTTON');assert.equal(toggle.hidden,true);await h.seed();const geometry=structuredClone(h.controller.snapshot().zones);assert.equal(toggle.hidden,false);assert.equal(toggle.textContent,'Désactiver les zones');assert.equal(toggle.getAttribute('aria-pressed'),'true');toggle.onclick();await h.controller.ready;assert.equal(toggle.textContent,'Réactiver les zones');assert.equal(toggle.getAttribute('aria-pressed'),'false');assert.deepEqual(h.controller.snapshot().zones,geometry);toggle.onclick();await h.controller.ready;assert.equal(toggle.textContent,'Désactiver les zones');assert.deepEqual(h.controller.snapshot().zones,geometry);await h.controller.clear();assert.equal(toggle.hidden,false);assert.equal((await compileOriginalSourceRegions(h.controller.snapshot())).countIncluded,120);toggle.onclick();await h.controller.ready;assert.equal((await compileOriginalSourceRegions(h.controller.snapshot())).countIncluded,120);assert.equal(toggle.hidden,true);await h.controller.undo();assert.equal(toggle.hidden,false);assert.equal((await compileOriginalSourceRegions(h.controller.snapshot())).countIncluded,120);await h.controller.undo();assert.equal(toggle.hidden,false);assert.deepEqual(h.controller.snapshot().zones,geometry);}finally{await h.controller.dispose();}
});


test('clear and deleting the final Original acquisition recover whole-image with exact single-step undo',async()=>{
 const h=setup();try{await h.controller.ready;const before=await h.seed();await h.controller.clear();let domain=await compileOriginalSourceRegions(h.controller.snapshot());assert.equal(domain.countIncluded,120);assert.equal(h.controller.snapshot().positiveMode,'whole');await h.controller.undo();assert.equal(h.controller.snapshot().fingerprint,before.fingerprint);await h.controller.remove('positive');domain=await compileOriginalSourceRegions(h.controller.snapshot());assert.equal(domain.empty,false);assert.equal(domain.containsOriginal(0,0),true);assert.equal(domain.containsOriginal(4,3),false,'Remaining explicit exclusion is preserved');await h.controller.undo();assert.equal(h.controller.snapshot().fingerprint,before.fingerprint);
 await h.controller.setZoneEnabled('positive',false);assert.equal((await compileOriginalSourceRegions(h.controller.snapshot())).empty,true,'Individually disabling every positive is explicit selected-empty');await h.controller.toggle(false);assert.equal((await compileOriginalSourceRegions(h.controller.snapshot())).countIncluded,120);await h.controller.undo();assert.equal((await compileOriginalSourceRegions(h.controller.snapshot())).empty,true);
 }finally{await h.controller.dispose();}
});
