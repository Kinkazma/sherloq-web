import test from 'node:test';
import assert from 'node:assert/strict';
import {toolCatalog,toolFields} from '../sherloq-browser/assets/tool-catalog.js';
import {CLONE_ALGORITHMS,cloneOperation} from '../sherloq-browser/assets/clone-methods.js';
import {cloningParams} from '../../engine-source/src/cloning.js';

test('BRISK remains available in expanded clone detection without a separate legacy menu',()=>{
 assert.equal(toolCatalog['tampering.copyMove.brisk'],undefined);
 assert.ok(toolCatalog['tampering.copyMove.sparse']);
 const choices=toolFields('tampering.copyMove.sparse').find(field=>field.key==='algorithm').choices;
 assert.ok(choices.some(choice=>choice.value==='BRISK'));
 assert.ok(CLONE_ALGORITHMS.includes('BRISK'));
 assert.equal(cloneOperation('BRISK'),'tampering.copyMove.sparse');
});
// Old saved requests still have their native validation contract, independently
// of the retired menu. The expanded selector uses its own parameter controls.
for(const [key,min,max]of [['response',0,100],['matching',1,100],['distance',1,100],['minimum',1,20]]){
 test('Legacy native BRISK '+key+' endpoints remain accepted',()=>{
  assert.doesNotThrow(()=>cloningParams({[key]:min}));
  assert.doesNotThrow(()=>cloningParams({[key]:max}));
 });
}
