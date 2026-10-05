import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {lightglueConfidenceThreshold,decideLightglueLayer,updateLightglueIndices} from '../src/forgeryscope-lightglue-control.js';
const ref=JSON.parse(await readFile(new URL('./data/forgeryscope/lightglue-control.json',import.meta.url)));
test('native adaptive microscopy controls at every threshold, equality and pruned totals',()=>{
 for(const c of ref.cases){assert.equal(lightglueConfidenceThreshold(c.layer),c.threshold);const data={...c};for(const k of ['confidence0','confidence1','matchability0','matchability1'])data[k]=Float32Array.from(c[k]);const result=decideLightglueLayer(data);assert.equal(result.stop,c.stop);assert.deepEqual([...result.keep0],c.keep0);assert.deepEqual([...result.keep1],c.keep1);}
});
test('final layer does not prune; original identities and prune counts survive successive gathers',()=>{
 const c={...ref.cases[0],layer:8};for(const k of ['confidence0','confidence1','matchability0','matchability1'])c[k]=Float32Array.from(c[k]);const result=decideLightglueLayer(c);assert.equal(result.stop,false);assert.deepEqual([...result.keep0],[0,1,2,3]);
 const counts=new Uint32Array(5).fill(1);let ids=Uint32Array.of(0,1,2,3,4);ids=updateLightglueIndices(ids,Uint32Array.of(1,3,4),counts);ids=updateLightglueIndices(ids,Uint32Array.of(0,2),counts);assert.deepEqual([...ids],[1,4]);assert.deepEqual([...counts],[1,3,1,2,3]);
 const before=counts.slice();assert.throws(()=>updateLightglueIndices(ids,Uint32Array.of(1,0),counts),{code:'INVALID_INPUT'});assert.deepEqual(counts,before);
});
