import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';

const enabled=process.execArgv.includes('--experimental-test-module-mocks');

// Real adapter lifecycle, with computation-only modules and small accounting
// owners. No model, image decoder, browser, storage or inference is executed.
test('a rejected output release frees all independent owners and leaves the adapter usable',{skip:!enabled&&'Run with --experimental-test-module-mocks for adapter lifecycle contracts'},async t=>{
 const manifest={schema:1,side:448,iterations:40,seed:22,referenceThreads:8,modelId:'disposal-fixture',checkpointSha256:'2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36'},bytes=new TextEncoder().encode(JSON.stringify(manifest)),identity={bytes:bytes.length,sha256:'a'.repeat(64)};
 let context;
 const owner=label=>{
  const current=context,release=current.budget.reserve(32);let closed=false;
  return{async dispose(){if(closed)return;closed=true;current.events.push(label);release();if(current.failures[label])throw current.failures[label];}};
 };
 t.mock.module('../src/d2prl-model-identity.js',{namedExports:{D2PRL_MODEL_IDENTITY:identity}});
 t.mock.module('../src/d2prl-runtime.js',{namedExports:{d2prlRuntime:async()=>({})}});
 t.mock.module('../experiments/d2prl/model.js',{namedExports:{readVerifiedModelAsset:async()=>bytes,createD2prlModel:async()=>({...owner('pipeline'),releaseCheckpoint(){}})}});
 t.mock.module('../experiments/d2prl/zones.js',{namedExports:{createD2prlZones:()=>({})}});
 t.mock.module('../experiments/d2prl/postprocess.js',{namedExports:{createPostprocess:()=>owner('postprocess')}});
 t.mock.module('../experiments/d2prl/spatial.js',{namedExports:{createSpatial:()=>{if(context.initializationFailure)throw context.initializationFailure;return owner('spatial');}}});
 t.mock.module('../src/neural-projector.js',{namedExports:{createNeuralProjector:()=>({...owner('project'),setImage(){}})}});
 t.mock.module('../experiments/d2prl/analysis.js',{namedExports:{createD2prlAnalysis:()=>({...owner('session'),async run(){return{width:1,height:1,metadata:{analysisId:'fixture',inferences:1,cache_hits:0,exclusions:[]},async release(){throw new EngineError('STORAGE_IO','Injected output release failure');}};},releaseCheckpoint(){}})}});
 const {createD2prlAdapter}=await import('../src/d2prl-adapter.js');

 context={budget:new Budget(1024**2),events:[],failures:{}};
 const adapter=createD2prlAdapter({budget:context.budget,profile:{maxWorkers:2},version:'test'}),image={pixels:{width:1,height:1,data:new Uint8Array(3)},sha256:'b'.repeat(64),provenance:{fixture:true}};
 await adapter.load({url:'https://fixture.invalid/model.json',...identity});
 await assert.rejects(adapter.run({id:'task',imageId:'image',backend:'cpu'},image,{knownHeapBytes:32}),{code:'STORAGE_IO'});
 const afterFailure=context.budget.total();let second;
 try{await adapter.run({id:'next',imageId:'image',backend:'cpu'},image);}catch(error){second={code:error.code,message:error.message};}
 assert.equal(afterFailure,identity.bytes*4+160,'Output cleanup skipped the independently admitted resident owner');assert.equal(second?.code,'STORAGE_IO','The next call must run and reach its own labelled cleanup, not remain BUSY');await adapter.dispose();assert.equal(context.budget.total(),0);
});
