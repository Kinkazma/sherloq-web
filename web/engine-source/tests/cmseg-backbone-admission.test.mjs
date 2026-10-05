import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createCmsegBackbone} from '../experiments/segmentation/cmseg-backbone.js';
// Synthetic dependency graph used only to exercise failure cleanup before any
// convolution. Scientific execution is covered by real-checkpoint browser proofs.
const graph=()=>({schema:1,input:'rgb',inputShape:[1,3,512,512],parameters:{w:{dtype:'float32',bytes:12,shape:[1,3,1,1],sha256:'0'.repeat(64),file:'parameters/'+'0'.repeat(64)+'.bin'}},nodes:Array.from({length:149},(_,i)=>({op:i?'Clip6':'Conv',input:i?['v'+(i-1)]:['rgb','w'],output:'v'+i,attrs:i?{}:{kernel:1,padding:0,stride:1,groups:1}})),outputs:{bypass:'v7',x2:'v24',x3:'v50',x4:'v111',x5:'v148'}});
test('Backbone rejects invalid structure before admission and rolls back partial helper setup',async()=>{
 const budget=new Budget(32*1024**2),read=()=>{throw Error('No parameter preload');};
 await assert.rejects(createCmsegBackbone({budget,graph:{...graph(),nodes:[]},read}),{code:'INVALID_INPUT'});
 await assert.rejects(createCmsegBackbone({budget,graph:graph(),read}),{code:'MEMORY_LIMIT'});
 assert.equal(budget.total(),0);assert.equal(budget.reclaimers.size,0);
});
test('Backbone read failure and malformed verified bytes release temporary input leases and permit retry',async()=>{
 const budget=new Budget(128*1024**2);let mode=0;
 const backbone=await createCmsegBackbone({budget,graph:graph(),maxWorkers:1,read:async()=>{if(mode++===0)throw Error('Asset transport failed');return new ArrayBuffer(12);}}),resident=budget.total();
 try{
  await assert.rejects(backbone.run(new Float32Array(3*512**2)),/Asset transport failed/);assert.equal(budget.total(),resident);
  await assert.rejects(backbone.run(new Float32Array(3*512**2)),{code:'INVALID_INPUT'});assert.equal(budget.total(),resident);
 }finally{backbone.dispose();backbone.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.reclaimers.size,0);
});
test('Backbone cancellation during parameter fetch frees borrowed input and read reservations',async()=>{
 const budget=new Budget(128*1024**2),abort=new AbortController();
 const backbone=await createCmsegBackbone({budget,graph:graph(),maxWorkers:1,read:async()=>{abort.abort();return new Uint8Array(12);}}),resident=budget.total();
 try{await assert.rejects(backbone.run(new Float32Array(3*512**2),{signal:abort.signal}),{code:'CANCELLED'});assert.equal(budget.total(),resident);}finally{backbone.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.reclaimers.size,0);
});
