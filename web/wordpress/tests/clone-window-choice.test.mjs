import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/clone-window-choice-fixture.mjs';
import {CLONE_WINDOW_TOOLS,cloneWindowTaskOptions,restoreCloneWindowChoices,isCloneWindowOperation} from '../sherloq-browser/assets/clone-window-choice.js';

test('The explicit common-analysis choice defaults to independent on every relevant tool',()=>{
 for(const id of CLONE_WINDOW_TOOLS){const h=fixture(id),input=h.document.getElementById('tool-clone-window-global');assert.ok(input,id);assert.equal(!!input.checked,false,id);assert.deepEqual(h.ui.taskOptions(),{cloneWindowMode:'independent'});assert.ok(h.document.querySelector('[data-clone-window-label]').textContent.includes('Analyser les zones ensemble'));h.ui.dispose();}
});
test('A deliberate click changes scope without mutating any native parameter or backend',()=>{
 const h=fixture('tampering.copyMove.sparse'),before=h.ui.params(),backend=h.ui.backend(),input=h.document.getElementById('tool-clone-window-global');input.checked=true;h.emit(input,'change');assert.deepEqual(h.ui.taskOptions(),{cloneWindowMode:'global'});assert.deepEqual(h.ui.params(),before);assert.equal(h.ui.backend(),backend);assert.deepEqual(h.settings,[{analysisModeChanged:true}]);assert.equal(h.events.some(e=>e.phase==='preview'),false);h.ui.dispose();
});
test('Different tools remember their own choice and sessions restore it',()=>{
 const h=fixture('tampering.copyMove.sparse');let input=h.document.getElementById('tool-clone-window-global');input.checked=true;h.emit(input,'change');h.ui.select('ai.clones.d2prl');assert.equal(h.ui.taskOptions().cloneWindowMode,'independent');h.ui.select('tampering.copyMove.sparse');assert.equal(h.document.getElementById('tool-clone-window-global').checked,true);const saved=h.ui.serialize();assert.equal(saved.uiOptions.cloneWindowModes['tampering.copyMove.sparse'],'global');h.ui.restore(saved);assert.equal(h.ui.taskOptions().cloneWindowMode,'global');saved.uiOptions.cloneWindowModes['tampering.copyMove.sparse']='independent';assert.equal(h.ui.taskOptions().cloneWindowMode,'global','Restored settings are independent of the imported object');h.ui.dispose();
});
test('Old or invalid session choices default to independent',()=>{
 const h=fixture('tampering.copyMove.sparse');h.ui.restore({uiOptions:{cloneWindowModes:{'tampering.copyMove.sparse':'global'}}});assert.equal(h.ui.taskOptions().cloneWindowMode,'global');h.ui.restore({uiOptions:{}});assert.equal(h.ui.taskOptions().cloneWindowMode,'independent');h.ui.restore({uiOptions:{cloneWindowModes:{'tampering.copyMove.sparse':'unrecognized'}}});assert.equal(h.ui.taskOptions().cloneWindowMode,'independent');h.ui.dispose();
});
test('Reset restores independent mode without changing other tools',()=>{
 const h=fixture('tampering.copyMove.sparse');h.ui.restore({uiOptions:{cloneWindowModes:{'tampering.copyMove.sparse':'global','ai.clones.d2prl':'global'}}});const reset=[...h.document.querySelectorAll('button')].find(b=>b.textContent==='Réinitialiser');assert.ok(reset);reset.click();assert.equal(h.ui.taskOptions().cloneWindowMode,'independent');h.ui.select('ai.clones.d2prl');assert.equal(h.ui.taskOptions().cloneWindowMode,'global');h.ui.dispose();
});
test('Pixel filters and unrelated controls have no common-analysis option',()=>{
 for(const id of ['inspection.adjust','inspection.histogram','inspection.magnifier','detail.frequency']){const h=fixture(id);assert.equal(h.document.getElementById('tool-clone-window-global'),null);assert.deepEqual(h.ui.taskOptions(),{});h.ui.dispose();}assert.equal(isCloneWindowOperation('ela.classic'),false);assert.equal(isCloneWindowOperation('ela.energy'),false);
});
test('Restoring choices accepts only known tools and exact modes',()=>{
 assert.deepEqual(restoreCloneWindowChoices({'ela.classic':'global','tampering.copyMove.sparse':'global','tampering.copyMove.dense':'other'}),{'tampering.copyMove.sparse':'global'});assert.deepEqual(restoreCloneWindowChoices([]),{});assert.deepEqual(cloneWindowTaskOptions('ela.classic',{'ela.classic':'global'}),{});assert.deepEqual(cloneWindowTaskOptions('tampering.copyMove.sparse',{}),{cloneWindowMode:'independent'});
});
