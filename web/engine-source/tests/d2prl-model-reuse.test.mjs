import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
const enabled=process.execArgv.includes('--experimental-test-module-mocks'),N=448**2;

// Real model orchestration and parameter store; computation-only doubles.
// This checks ownership/cache wiring, not neural or scientific parity.
test('model reuses verified feature/union/UNet parameters across real pass boundaries and snapshots pool before disposal',{skip:!enabled&&'Run with --experimental-test-module-mocks for model cache orchestration'},async t=>{
 const budget=new Budget(64*1024**2),payloads=new Map(),requests=[];let failHeads=false,descriptorCalls=0;
 const asset=(values,shape)=>{const data=Float32Array.from(values),bytes=new Uint8Array(data.buffer),sha256=createHash('sha256').update(bytes).digest('hex'),file='assets/'+sha256+'.bin';payloads.set(file,bytes);return{file,sha256,bytes:bytes.length,dtype:'float32',shape};};
 const weight=asset([1,2,3],[1,3,1,1]),bias=asset([.25],[1]),bn=asset([1,0,0,1],[4]),union=asset([.75],[1]),unet=asset([.5],[1]);
 const model={schema:1,side:448,iterations:40,seed:22,referenceThreads:8,modelId:'parameter-reuse-protocol',checkpointSha256:'2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36',
  assets:Object.fromEntries([...payloads].map(([file,data])=>[file,{bytes:data.length,sha256:file.slice(7,-4)}])),features:[{name:'fixture',weights:weight,bias,inputShape:[1,3,448,448],padding:0}],batchnorm:[{name:'fixture',params:bn,epsilon:1e-5}],
  union:[{weights:union}],unionBatchnorm:[],dlfWeights:{},graph:{parameters:{fixture:unet}},roles:{modelFile:'roles.onnx'},layouts:{features:{records:[]},union:{records:[]},unet:{records:[]},point:{}}};
 t.mock.method(globalThis,'fetch',async url=>{const file=new URL(url).pathname.slice(1),payload=payloads.get(file);assert.ok(payload,file);requests.push(file);return new Response(payload);});
 const helper=()=>({run(){},dispose(){}});
 t.mock.module('../experiments/d2prl/convolution-cpu.js',{namedExports:{createConvolutionCpu:()=>({...helper(),releaseIdleWorkers(){}})}});
 t.mock.module('../experiments/d2prl/prepare.js',{namedExports:{createPreparation:async()=>({async run({rgb}){return{data:rgb,release:budget.reserve(rgb.byteLength)};},dispose(){}})}});
 for(const [module,name]of [['feature-math','createFeatureMath'],['neural-math','createNeuralMath'],['dlf','createDlf']])t.mock.module('../experiments/d2prl/'+module+'.js',{namedExports:{[name]:async()=>helper()}});
 t.mock.module('../experiments/d2prl/roles-bounded.js',{namedExports:{createBoundedRoles:helper}});
 t.mock.module('../experiments/d2prl/descriptors.js',{namedExports:{createDescriptors:({loadConvolution,loadBatchNorm})=>({async run(_rgb,{signal}={}){descriptorCalls++;const conv=await loadConvolution('fixture',{signal});conv.release();const affine=await loadBatchNorm('fixture',{signal});affine.release();return{zm:new Uint16Array(1),cnn:new Uint16Array(1),release(){}};},checkpointSnapshot(){return null;},releaseCheckpoint(){},dispose(){}})}});
 t.mock.module('../experiments/d2prl/union-head.js',{namedExports:{createUnionHead:({loadParameter})=>({async run(_input,{signal}={}){const lease=await loadParameter('union',union,{signal});try{return lease.data[0];}finally{lease.release();}},releaseCheckpoint(){},dispose(){}})}});
 t.mock.module('../experiments/d2prl/unet-graph.js',{namedExports:{createUnetGraph:({loadParameter})=>({async run(_rgb,{signal}={}){const lease=await loadParameter('fixture',unet,{signal});try{return lease.data[0];}finally{lease.release();}},releaseCheckpoint(){},dispose(){}})}});
 t.mock.module('../experiments/d2prl/evaluator-pool.js',{namedExports:{createEvaluatorPool:async()=>({stats:{tiles:0,rpcMessages:0,activeWorkers:2},dispose(){this.stats.tiles=0;this.stats.activeWorkers=0;}})}});
 t.mock.module('../experiments/d2prl/patchmatch.js',{namedExports:{createPatchMatch:async(_factory,{budget,evaluatorFactory})=>{const pool=await evaluatorFactory(null,{budget});return{async run(){pool.stats.tiles+=7;pool.stats.rpcMessages+=11;return{release(){}};},dispose(){pool.dispose();}};}}});
 t.mock.module('../experiments/d2prl/heads.js',{namedExports:{createHeads:({unionHead,unet})=>({async run({rgb,patchmatch},options){if(failHeads){failHeads=false;throw new EngineError('MEMORY_LIMIT','Terminal heads fixture');}const dedicated=await unionHead.run(patchmatch,options),general=await unet.run(rgb,options),release=budget.reserve(3*N*4);return{union:new Float32Array(N).fill(dedicated),target:new Float32Array(N).fill(general),source:new Float32Array(N).fill(-general),decision:{protocolFixture:true},roleRuntime:{protocolFixture:true},release};},snapshot(){return null;},releaseCheckpoint(){},dispose(){unionHead.dispose();unet.dispose();}})}});
 const {createD2prlModel}=await import('../experiments/d2prl/model.js');
 const pipeline=await createD2prlModel({budget,model,assetBaseUrl:'https://model/',runtime:{convolutionCpuUrl:'unused',evaluatorUrl:'unused'},backend:'cpu',maxWorkers:2}),rgb=Float32Array.of(1,2,3);let first,second;
 try{
  assert.equal(requests.length,0,'Parameters are lazy, with no preload');
  first=await pipeline.run({rgb,width:1,height:1},{checkpointKey:'first'});assert.equal(requests.length,5);assert.equal(first.execution.parameterStore.cacheHits,0);assert.equal(pipeline.checkpointSnapshot(),null);
  second=await pipeline.run({rgb,width:1,height:1},{checkpointKey:'second'});assert.deepEqual(second.raw,first.raw);assert.equal(requests.length,5);assert.equal(second.execution.parameterStore.cacheHits,5);assert.equal(second.execution.parameterStore.committedBytes,40);assert.equal(second.execution.parameterStore.cacheHitBytes,40);
  assert.deepEqual(first.execution.patchmatchPool,{tiles:7,rpcMessages:11,activeWorkers:2});assert.deepEqual(second.execution.patchmatchPool,first.execution.patchmatchPool);
  assert.deepEqual(Object.keys(first.execution.phaseTimes),['preparation','descriptors','patchmatch','heads','raw-output']);assert.ok(Object.values(first.execution.phaseTimes).every(value=>Number.isFinite(value)&&value>=0));assert.match(first.execution.timingSemantics,/wall milliseconds.*not additive CPU/);
  await assert.rejects(pipeline.run({rgb,width:1,height:1},{checkpointKey:'cancelled',signal:AbortSignal.abort()}),{code:'CANCELLED'});assert.equal(requests.length,5);
  failHeads=true;await assert.rejects(pipeline.run({rgb,width:1,height:1},{checkpointKey:'resume'}),{code:'MEMORY_LIMIT'});const failedTimes=pipeline.checkpointSnapshot().phaseTimes,resumed=await pipeline.run({rgb,width:1,height:1},{checkpointKey:'resume'});try{assert.equal(descriptorCalls,3,'Completed descriptor phases are not replayed on resume');for(const phase of ['preparation','descriptors','patchmatch'])assert.equal(resumed.execution.phaseTimes[phase],failedTimes[phase]);assert.ok(resumed.execution.phaseTimes.heads>=failedTimes.heads);assert.deepEqual(resumed.raw,first.raw);assert.equal(requests.length,5);}finally{resumed.release();}
  pipeline.releaseCheckpoint();assert.equal(pipeline.checkpointSnapshot(),null);await pipeline.dispose();assert.ok(budget.total()>0,'Raw results remain their consumers\' ownership');assert.equal(second.raw[N],.5);
 }finally{first?.release();second?.release();await pipeline.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains.wasm.backings,0);
});

test('model checkpoint cleanup attempts every release and still closes every owner after a failure',{skip:!enabled&&'Run with --experimental-test-module-mocks for model cleanup orchestration'},async t=>{
 for(const mode of ['dispose-retained','release-retained','run-finally'])await t.test(mode,async t=>{
  const budget=new Budget(64*1024**2),events=[],first=new EngineError('INTERNAL','First checkpoint cleanup failure'),later=new EngineError('INTERNAL','Later owner disposal failure'),terminal=new EngineError('MEMORY_LIMIT','Retained fixture checkpoint');
  let refuse=mode!=='run-finally',throwFirst=true;
  const record=(name,release=()=>{},error)=>()=>{events.push(name);release();if(error)throw error;};
  const helper=name=>({run(){},dispose:record('dispose:'+name)});
  const storeRelease=budget.reserve(8);
  t.mock.module('../experiments/d2prl/parameter-store.js',{namedExports:{createParameterStore:()=>({snapshot(){return{};},clearIncomplete:record('clear:parameters'),async dispose(){record('dispose:parameters',storeRelease)();if(mode!=='run-finally')throw later;}})}});
  t.mock.module('../experiments/d2prl/convolution-cpu.js',{namedExports:{createConvolutionCpu:()=>({...helper('convolution'),releaseIdleWorkers:record('idle:convolution')})}});
  t.mock.module('../experiments/d2prl/prepare.js',{namedExports:{createPreparation:async()=>({...helper('preparation'),async run({rgb}){return{data:rgb,release:record('release:prepared',budget.reserve(rgb.byteLength),mode!=='run-finally'?later:undefined)};}})}});
  for(const [name,create]of [['feature-math','createFeatureMath'],['neural-math','createNeuralMath'],['dlf','createDlf']])t.mock.module('../experiments/d2prl/'+name+'.js',{namedExports:{[create]:async()=>helper(name)}});
  t.mock.module('../experiments/d2prl/roles-bounded.js',{namedExports:{createBoundedRoles:()=>helper('roles')}});
  t.mock.module('../experiments/d2prl/descriptors.js',{namedExports:{createDescriptors:()=>({...helper('descriptors'),async run(){return{zm:new Uint16Array(1),cnn:new Uint16Array(1),release:record('release:features',budget.reserve(4),mode!=='run-finally'?later:undefined)};},checkpointSnapshot(){return null;},releaseCheckpoint:record('clear:descriptors',()=>{},mode!=='run-finally'?later:undefined)})}});
  t.mock.module('../experiments/d2prl/union-head.js',{namedExports:{createUnionHead:()=>helper('union')}});
  t.mock.module('../experiments/d2prl/unet-graph.js',{namedExports:{createUnetGraph:()=>helper('unet')}});
  t.mock.module('../experiments/d2prl/evaluator-pool.js',{namedExports:{createEvaluatorPool:async()=>helper('evaluator')}});
  t.mock.module('../experiments/d2prl/patchmatch.js',{namedExports:{createPatchMatch:async()=>({async run(){if(refuse)throw terminal;return{release:record('release:patchmatch',budget.reserve(4))};},checkpointSnapshot(){return null;},dispose:record('dispose:patchmatch',()=>{},mode!=='run-finally'?later:undefined)})}});
  t.mock.module('../experiments/d2prl/heads.js',{namedExports:{createHeads:()=>({...helper('heads'),async run(){return{union:Float32Array.of(1),target:Float32Array.of(2),source:Float32Array.of(3),decision:{},release:record('release:heads-result',budget.reserve(12))};},snapshot(){return null;},releaseCheckpoint(){events.push('clear:heads');if(throwFirst){throwFirst=false;throw first;}}})}});
  const {createD2prlModel}=await import('../experiments/d2prl/model.js?cleanup='+mode);
  const model={schema:1,side:448,iterations:40,seed:22,referenceThreads:8,checkpointSha256:'2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36',roles:{modelFile:'roles.onnx'},layouts:{features:{records:[]},union:{records:[]},unet:{records:[]},point:{}},graph:{},assets:{}};
  const pipeline=await createD2prlModel({budget,model,assetBaseUrl:'https://model/',runtime:{convolutionCpuUrl:'unused',evaluatorUrl:'unused'},backend:'cpu',maxWorkers:1}),rgb=Float32Array.of(1,2,3);
  await assert.rejects(pipeline.run({rgb,width:1,height:1},{checkpointKey:'cleanup'}),error=>error===(mode==='run-finally'?first:terminal));
  if(mode==='run-finally'){
   assert.equal(pipeline.checkpointSnapshot(),null);assert.equal(budget.total(),8,'Unpublished raw output and every completed result were returned');
   const output=await pipeline.run({rgb,width:1,height:1},{checkpointKey:'retry'});output.release();await pipeline.dispose();
  }else{
   assert.ok(pipeline.checkpointSnapshot().prepared);assert.ok(budget.total()>8);
   if(mode==='release-retained'){assert.throws(()=>pipeline.releaseCheckpoint(),error=>error===first);assert.equal(budget.total(),8);await assert.rejects(pipeline.dispose(),error=>error===later);}
   else await assert.rejects(pipeline.dispose(),error=>error===first);
   assert.equal(pipeline.checkpointSnapshot(),null);
   for(const event of ['clear:heads','clear:descriptors','dispose:patchmatch','release:features','release:prepared','clear:parameters'])assert.equal(events.filter(value=>value===event).length,1,event);
  }
  for(const owner of ['heads','descriptors','roles','dlf','neural-math','feature-math','preparation','convolution','parameters'])assert.equal(events.filter(value=>value==='dispose:'+owner).length,1,owner);
  assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains.wasm.backings,0);
 });
});
