import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeForgeryscopeYolo,parseForgeryscopePanels,classifyForgeryscopePanels,yoloLetterboxShape,roundEven} from '../src/forgeryscope-yolo.js';
const ref=JSON.parse(await readFile(new URL('./data/forgeryscope/yolo-decisions.json',import.meta.url)));
test('native YOLO NMS, class separation, thresholds, clipping and rectangular coordinates',async()=>{
 for(const c of ref.cases){
  const shape=yoloLetterboxShape(c.width,c.height);assert.equal(shape.width,c.inputWidth);assert.equal(shape.height,c.inputHeight);
  assert.deepEqual(await decodeForgeryscopeYolo(Float32Array.from(c.predictions),c),c.boxes);
 }
});
test('native panel exclusions, min side and rounded confidence',()=>{
 const names={0:'Blots',1:'Graphs',2:'Microscopy',3:'Body Imaging',4:'Flow Cytometry'};
 assert.deepEqual(parseForgeryscopePanels([[1,2,6,7,.8125,0],[1,2,5,7,.99,2],[1,2,6,7,.99,1],[1,2,6,7,.99,3]],names),[['Blots',.812,1,2,6,7]]);
 assert.equal(roundEven(2.5),2);assert.equal(roundEven(3.5),4);
});
test('YOLO cancellation and invalid tensors reject',async()=>{
 const c=ref.cases[0],signal=AbortSignal.abort();
 await assert.rejects(decodeForgeryscopeYolo(Float32Array.from(c.predictions),{...c,signal}),{code:'CANCELLED'});
 await assert.rejects(decodeForgeryscopeYolo(new Float32Array(1),c),{code:'INVALID_INPUT'});
});
test('scientific preparation retains graph classes while native panel filtering stays unchanged',()=>{
 const names={0:'Blots',1:'Graphs',2:'Microscopy',3:'Body Imaging',4:'Flow Cytometry',5:'Other'};
 const boxes=Object.keys(names).map((_,i)=>[i*10,2,i*10+8,10,.912345,i]);
 assert.deepEqual(parseForgeryscopePanels(boxes,names).map(row=>row[0]),['Blots','Microscopy','Other']);
 assert.deepEqual(parseForgeryscopePanels(boxes,names,{includeExcluded:true}).map(row=>row[0]),Object.values(names));
 const classified=classifyForgeryscopePanels(boxes,names);
 assert.deepEqual(classified.map(panel=>panel.policyHint),['acquisition','non-acquisition','acquisition','acquisition','non-acquisition','needs-review']);
 assert.equal(classified[1].confidence,.912345);
 assert.deepEqual(classified[3].rectangle,[30,2,38,10]);
 classified[3].rectangle[0]=999;assert.equal(boxes[3][0],30);
});
