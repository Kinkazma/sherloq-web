import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ALIKED_MODELS} from '../src/aliked-assets.js';
import {createAlikedStrictPoolRuntime} from '../src/aliked-strict-pool-runtime.js';
// Exact byte-size/identity placeholders only. No model is read, parsed,
// imported or run. The endpoint records the native pool session contract.
test('the ALIKED pool preserves the original dense GPU output placement before any model session (0NN)',async()=>{
 const models=Object.fromEntries(Object.entries(ALIKED_MODELS['aliked-n16'].graphs).map(([n,m])=>[n,{data:new Uint8Array(m.bytes),sha256:m.sha256}])),arena=new Budget(64*1024**2);let options;
 const runtime=createAlikedStrictPoolRuntime({provider:'webgpu',models,profile:{id:'maximum',maxWorkers:10},poolFactory(_b,_p,o){options=o;return{async disposeGracefully(){}};}});
 try{runtime.bindRuntimeBudget(arena);const session=await runtime.ort.InferenceSession.create(models.dense.data,{executionProviders:['webgpu'],graphOptimizationLevel:'all',preferredOutputLocation:{features:'gpu-buffer',scores:'cpu'}});try{assert.deepEqual(options.assets.dense.preferredOutputLocation,{features:'gpu-buffer',scores:'cpu'});assert.equal(options.assets.detect.preferredOutputLocation,undefined);}finally{await session.release();}}
 finally{await runtime.dispose();assert.equal(arena.total(),0);}
});
