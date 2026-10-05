import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {automaticSelection,automaticAnalysisPlan,AUTOMATIC_DENSE_PROFILE} from '../src/automatic-analysis-plan.js';
const reference=JSON.parse(await readFile(new URL('./data/automatic-plan-native.json',import.meta.url)));
test('native panel fallback, ordered identity, disabled zones and four real submissions',()=>{
 for(const c of reference.cases){
  const {width,height}=c.input;
  assert.deepEqual(automaticSelection(width,height,c.detected),c.selection,c.input.name+'/selection');
  const plan=automaticAnalysisPlan(c.input);
  assert.deepEqual(plan.native,c.native,c.input.name+'/submission');
  assert.deepEqual(plan.active,c.active,c.input.name+'/active');
  assert.equal(plan.jobs.length,4);
  for(const job of plan.jobs)assert.equal(job.enabled,!!c.active.length&&(job.id!=='forgeryscope'||!!c.native.forgeryscope.regions.length));
 }
});
test('complete analysis adds only ELA; M3/M4 receive independent native settings',()=>{
 const plan=automaticAnalysisPlan({...reference.cases[1].input,complete:true,d2Minimum:0});
 const [dense,sparse,forge,d2,ela]=plan.jobs;
 assert.equal(dense.params.profile,AUTOMATIC_DENSE_PROFILE);assert.equal(dense.params.flip,true);assert.equal(dense.params.compact,true);assert.equal(dense.params.auto,true);
 assert.equal(sparse.params.reflections,true);assert.equal(sparse.params.compact,false);assert.equal(sparse.params.independent,true);assert.equal(sparse.params.minimum,10);assert.equal(sparse.params.threshold,.725);assert.equal(sparse.params.model,'Affine');
 assert.equal(dense.params.minimum,5);assert.equal(dense.params.threshold,.3);assert.equal(dense.params.model,'Similarity');assert.equal(forge.params.regions.length,1);assert.equal(d2.params.regions.length,3);assert.equal(d2.minimum,0);assert.equal(ela.id,'ela');assert.deepEqual(ela.params,{regions:plan.active,excluded:plan.excluded});
});
test('selection and plan own coordinates; empty manual selection never becomes whole-image',()=>{
 const input=structuredClone(reference.cases[1].input),plan=automaticAnalysisPlan(input),selection=automaticSelection(input.width,input.height,input.regions);
 input.regions[0][0][0]=999;input.envelope[0][0]=888;assert.notEqual(plan.active[0][0][0],999);assert.notEqual(plan.envelope[0][0],888);assert.notEqual(selection.regions[0][0][0],999);
 const empty=automaticAnalysisPlan({width:123,height:83,regions:[],complete:true});assert.equal(empty.jobs.length,5);assert.ok(empty.jobs.every(j=>!j.enabled&&j.state==='no-active-zones'));
 assert.throws(()=>automaticSelection(10,10,null),{code:'INVALID_INPUT'});
 for(const update of [{disabled:[999]},{cpu:1},{d2Minimum:5001},{d2Minimum:1.5},{regions:[[[NaN,0],[1,1],[2,2]]]}])assert.throws(()=>automaticAnalysisPlan({...reference.cases[1].input,...update}),{code:'INVALID_INPUT'});
});
