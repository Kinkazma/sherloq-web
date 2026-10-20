import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceEnginePool} from '../sherloq-browser/assets/workspace-engine-pool.js';
import {ocrText} from '../sherloq-browser/assets/ocr-presentation.js';

test('two workspace scopes cannot switch OCR configuration between load and run',async()=>{
 const log=[];let current;
 const pool=createWorkspaceEnginePool(()=>({async loadOcrModels(value){log.push('load:'+value.id);await new Promise(r=>setTimeout(r,1));current=value.id;},async run(task){const admitted=current;await new Promise(r=>setTimeout(r,1));assert.equal(current,admitted);log.push('run:'+task.id+':'+admitted);return{operation:'various.ocr',data:{regions:[],configuration:admitted},layers:[]};},dispose(){log.push('dispose');}}));
 const a=pool({}),b=pool({}),[first,second]=await Promise.all([a.runConfiguredOcr({id:'A',operation:'various.ocr'},{id:'model-A'},{}),b.runConfiguredOcr({id:'B',operation:'various.ocr'},{id:'model-B'},{})]);
 assert.deepEqual(log,['load:model-A','run:A:model-A','load:model-B','run:B:model-B']);assert.equal(first.data.configuration,'model-A');assert.equal(second.data.configuration,'model-B');await a.dispose();assert.equal(log.includes('dispose'),false);await b.dispose();assert.equal(log.at(-1),'dispose');
});
test('filtered OCR text keeps native left-to-right word order when glyph tops differ',()=>{
 const words=[{id:'s',text:'SHERLOQ',score:.9,lineKey:'line',bounds:[26,29,199,58]},{id:'t',text:'TEST',score:.9,lineKey:'line',bounds:[281,29,372,56]},{id:'n',text:'123',score:.9,lineKey:'line',bounds:[214,30,269,56]},{id:'low',text:'ignored',score:.1,lineKey:'other',bounds:[1,80,50,100]}];
 const data={text:'SHERLOQ 123 TEST\nignored',regions:words,lines:[{text:'SHERLOQ 123 TEST',regions:[words[0],words[2],words[1]]},{text:'ignored',regions:[words[3]]}]};assert.equal(ocrText(data,.5),'SHERLOQ 123 TEST');
});
