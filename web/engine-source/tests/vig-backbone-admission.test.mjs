import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {createVigBackbone,validateVigBackbone} from '../experiments/segmentation/vig-backbone.js';
const shapes=JSON.parse(await readFile(new URL('../fixtures/vig-math/backbone-shapes.json',import.meta.url)));
const graph=()=>({...shapes,parameters:Object.fromEntries(Object.entries(shapes.parameters).map(([key,shape])=>[key,{shape,bytes:shape.reduce((n,v)=>n*v,4),dtype:'float32',sha256:'0'.repeat(64),file:'parameters/'+'0'.repeat(64)+'.bin'}]))});
test('VIG rejects a modified architecture and rolls back a refused heap before parameter fetch',async()=>{
 const budget=new Budget(32*1024**2),read=()=>{throw Error('Unexpected preload');};
 assert.throws(()=>validateVigBackbone({...graph(),kind:'altered'}),{code:'INVALID_INPUT'});
 const extra=graph();extra.parameters.invented=extra.parameters.pos_embed;assert.throws(()=>validateVigBackbone(extra),{code:'INVALID_INPUT'});
 await assert.rejects(createVigBackbone({budget,graph:graph(),read}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);assert.equal(budget.reclaimers.size,0);
});
test('VIG parameter transport, wrong verified-byte type and cancellation preserve retry and free admission',async()=>{
 const budget=new Budget(256*1024**2),abort=new AbortController();let mode=0;
 const backbone=await createVigBackbone({budget,graph:graph(),read:async spec=>{if(mode===0)throw Error('Transport');if(mode===1)return new ArrayBuffer(spec.bytes);abort.abort();return new Uint8Array(spec.bytes);}}),resident=budget.total(),input=new Float32Array(3*256**2);
 try{await assert.rejects(backbone.run(input),/Transport/);assert.equal(budget.total(),resident);mode=1;await assert.rejects(backbone.run(input),{code:'INVALID_INPUT'});assert.equal(budget.total(),resident);mode=2;await assert.rejects(backbone.run(input,{signal:abort.signal}),{code:'CANCELLED'});assert.equal(budget.total(),resident);}finally{backbone.dispose();backbone.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.reclaimers.size,0);
});
test('VIG refuses its fixed staging reservation without retaining a partial result',async()=>{
 const budget=new Budget(128*1024**2),backbone=await createVigBackbone({budget,graph:graph(),read:()=>{throw Error('No read before staging admission');}}),resident=budget.total();
 try{await assert.rejects(backbone.run(new Float32Array(3*256**2)),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),resident);}finally{backbone.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.reclaimers.size,0);
});

test('VIG linear pool drops admitted worker heaps after initialization failure and can be disposed',async t=>{
 const {createVigConvolution}=await import('../experiments/segmentation/vig-convolution.js');
 let stopped=0;
 class BrokenWorker{postMessage(){queueMicrotask(()=>this.onerror?.({message:'helper init failed'}));}terminate(){stopped++;}}
 const original=Object.getOwnPropertyDescriptor(globalThis,'Worker');Object.defineProperty(globalThis,'Worker',{configurable:true,value:BrokenWorker});t.after(()=>{if(original)Object.defineProperty(globalThis,'Worker',original);else delete globalThis.Worker;});
 const budget=new Budget(512*1024**2),pool=createVigConvolution({budget,maxWorkers:2});
 try{await assert.rejects(pool.run({input:new Float32Array(640*256),weight:new Float32Array(640*640),bias:new Float32Array(640),geometry:[640,16,16,640,1,0,1,1]}),{code:'WORKER_FAILED'});assert.equal(budget.total(),0);assert.equal(stopped,1);}finally{pool.dispose();}
 assert.equal(budget.reclaimers.size,0);
});
