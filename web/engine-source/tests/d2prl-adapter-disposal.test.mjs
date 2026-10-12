import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';

const enabled=process.execArgv.includes('--experimental-test-module-mocks');

// Real adapter lifecycle, with computation-only modules and small accounting
// owners. No model, image decoder, browser, storage or inference is executed.
test('adapter closes all owners and retains the first error through asynchronous disposal',{skip:!enabled&&'Run with --experimental-test-module-mocks for adapter lifecycle contracts'},async t=>{
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
 t.mock.module('../experiments/d2prl/analysis.js',{namedExports:{createD2prlAnalysis:()=>({...owner('session'),async run(){return{width:1,height:1,metadata:{analysisId:'fixture',inferences:1,cache_hits:0,exclusions:[]},release(){}};},releaseCheckpoint(){}})}});
 const {createD2prlAdapter}=await import('../src/d2prl-adapter.js');
 for(const method of ['dispose','clearImages'])for(const failing of ['session','pipeline'])await t.test(method+' after rejected '+failing,async()=>{
  const first=new EngineError('STORAGE_IO','Injected '+failing+' cleanup failure'),later=new EngineError('STORAGE_IO','Injected later spatial failure');
  context={budget:new Budget(1024**2),events:[],failures:{[failing]:first,spatial:later}};
  const adapter=createD2prlAdapter({budget:context.budget,profile:{maxWorkers:2},version:'test'});
  await adapter.load({url:'https://fixture.invalid/model.json',...identity});
  await adapter.run({id:'task',imageId:'image',backend:'cpu'},{pixels:{width:1,height:1,data:new Uint8Array(3)},sha256:'b'.repeat(64),provenance:{fixture:true}});
  await assert.rejects(adapter[method](),error=>error===first);
  assert.deepEqual(first.details.cleanupFailures.map(error=>error.message),[later.message]);
  assert.deepEqual(context.events,['session','pipeline','postprocess','spatial','project']);assert.equal(context.budget.resourceSnapshot().operations.length,0);
  if(method==='dispose'){assert.equal(adapter.configured(),false);assert.equal(context.budget.total(),0);}
  else{assert.equal(adapter.configured(),true);assert.equal(context.budget.total(),identity.bytes*4);}
  await adapter.dispose();assert.equal(context.budget.total(),0);assert.deepEqual(context.events,['session','pipeline','postprocess','spatial','project']);
 });
 await t.test('initialization failure remains primary when pipeline cleanup also rejects',async()=>{
  const original=new EngineError('INVALID_INPUT','Injected spatial initialization failure'),cleanup=new EngineError('STORAGE_IO','Injected pipeline cleanup failure');
  context={budget:new Budget(1024**2),events:[],initializationFailure:original,failures:{pipeline:cleanup}};
  const adapter=createD2prlAdapter({budget:context.budget,profile:{maxWorkers:2},version:'test'});await adapter.load({url:'https://fixture.invalid/model.json',...identity});
  await assert.rejects(adapter.run({id:'task',imageId:'image',backend:'cpu'},{pixels:{width:1,height:1,data:new Uint8Array(3)},sha256:'b'.repeat(64),provenance:{fixture:true}}),error=>error===original);
  assert.deepEqual(context.events,['pipeline','postprocess']);assert.deepEqual(original.details.cleanupFailures.map(error=>error.message),[cleanup.message]);assert.equal(context.budget.total(),identity.bytes*4);
  await adapter.dispose();assert.equal(context.budget.total(),0);
 });
});
