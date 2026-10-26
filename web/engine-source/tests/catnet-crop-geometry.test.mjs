import test from 'node:test';
import assert from 'node:assert/strict';
import {catnetCropOrient} from '../src/catnet-analyzer.js';
const valid={source_shape:[2,2],padded_shape:[2,2],orientation:1},pixels=Float32Array.of(.1,.2,.3,.4);
for(const[name,metadata,input=pixels]of[
 ['missing',null],['missing-source',{padded_shape:[2,2],orientation:1}],['missing-padding',{source_shape:[2,2],orientation:1}],
 ['source-outside',{...valid,source_shape:[3,3]}],['source-zero',{...valid,source_shape:[0,2]}],['source-negative',{...valid,source_shape:[-1,2]}],
 ['fractional-dimension',{...valid,source_shape:[1.5,2]}],['unsafe-product',{...valid,source_shape:[Number.MAX_SAFE_INTEGER,2],padded_shape:[Number.MAX_SAFE_INTEGER,2]}],
 ['extra-source-axis',{...valid,source_shape:[2,2,1]}],['extra-padding-axis',{...valid,padded_shape:[2,2,1]}],
 ['orientation-zero',{...valid,orientation:0}],['orientation-nine',{...valid,orientation:9}],['orientation-fraction',{...valid,orientation:1.5}],['orientation-missing',{source_shape:[2,2],padded_shape:[2,2]}],
 ['map-shape',valid,new Float32Array(3)],['map-type',valid,new Float64Array(4)]
])test('CAT-Net crop refuses '+name+' before allocating a result',()=>{assert.throws(()=>catnetCropOrient(input,metadata),{code:'INVALID_INPUT'});});
test('CAT-Net valid crop owns its output and preserves the input map',()=>{
 const original=pixels.slice(),a=catnetCropOrient(pixels,valid);assert.deepEqual(a.data,pixels);a.data[0]=999;assert.deepEqual(pixels,original);assert.deepEqual(catnetCropOrient(pixels,valid).data,original);
});

import {catnetOrientTensor} from '../src/catnet-segmented-analyzer.js';
import {createNeuralTensor} from '../src/neural-tensor-store.js';
import {Budget} from '../src/cache.js';
for(const[name,metadata]of [['orientation9',{source_shape:[2,3],padded_shape:[2,3],orientation:9}],['orientation0',{source_shape:[2,3],padded_shape:[2,3],orientation:0}],['fraction',{source_shape:[2,3],padded_shape:[2,3],orientation:1.5}],['missing',null],['source-outside',{source_shape:[3,3],padded_shape:[2,3],orientation:1}],['map-shape',{source_shape:[2,2],padded_shape:[2,2],orientation:1}]])test('segmented CAT-Net refuses '+name+' before output allocation',async()=>{const budget=new Budget(1024*1024),tensor=await createNeuralTensor(1,2,3,{budget,storage:'memory'}),before=budget.snapshot();try{await assert.rejects(catnetOrientTensor(tensor,metadata,{budget,storage:'memory'}),{code:'INVALID_INPUT'});assert.deepEqual(budget.snapshot(),before);}finally{await tensor.dispose();}assert.equal(budget.snapshot().activeReservationBytes,0);});
