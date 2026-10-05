import test from 'node:test';import assert from 'node:assert/strict';import {Budget} from '../src/cache.js';
const enabled=process.execArgv.includes('--experimental-test-module-mocks');
test('geometry failure retains fully filtered evidence and releases it after both checkpoint and result owners close',{skip:!enabled},async t=>{
 const budget=new Budget(1024);let computations=0,verification=0,evidenceReleased=0,fieldClears=0;
 t.mock.module('../src/dense-image.js',{namedExports:{DenseImageEngine:class{async analyze(){computations++;const release=budget.reserve(128);return {metrics:{},async release(){evidenceReleased++;release();}};}async clear(){}async clearCheckpoint(){fieldClears++;}async dispose(){}}}});
 t.mock.module('../src/dense-postprocess.js',{namedExports:{verifyDenseEvidence:async()=>{if(++verification===1)throw Error('geometry interrupted');const release=budget.reserve(16);return {release,groups:[]};}}});
 const {DenseCopyEngine}=await import('../src/dense-copy.js'),geometry=Object.fromEntries(['pairedBiomes','verifyCopyGeometry','copyPalette','createGeometryKernel'].map(key=>[key,()=>{}])),engine=new DenseCopyEngine({width:1,height:1,data:new Uint8Array(3)},budget,{geometry});let result;
 try{await assert.rejects(engine.analyze({}, {checkpointKey:'evidence'}),/geometry interrupted/);assert.equal(computations,1);assert.equal(evidenceReleased,0);result=await engine.analyze({}, {checkpointKey:'evidence'});assert.equal(computations,1);await engine.clearCheckpoint('evidence');assert.equal(evidenceReleased,0);assert.equal(fieldClears,1);await result.release();result=null;assert.equal(evidenceReleased,1);}finally{await result?.release();await engine.dispose();}assert.equal(budget.total(),0);
});
