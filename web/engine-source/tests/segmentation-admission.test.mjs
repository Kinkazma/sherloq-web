import test from 'node:test';
import assert from 'node:assert/strict';
import {createSegmentationAdapter} from '../src/segmentation-adapter.js';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
import {Budget} from '../src/cache.js';
import {selectSegmentationBackend} from '../experiments/segmentation/backend.js';
const input = {variant: 'mgcfdn-mpdn', url: 'https://models.invalid/mpdn.onnx', bytes: SEGMENTATION_MODELS['mgcfdn-mpdn'].bytes, sha256: SEGMENTATION_MODELS['mgcfdn-mpdn'].sha256};
// Display name and API variant identifier are intentionally separate.
input.variant = 'mgcfdn-mpdn';
const image = {sha256: '0'.repeat(64), provenance: {}, pixels: {width: 8, height: 8, format: 'rgb8', data: new Uint8Array(8 * 8 * 3)}};
const task = {id: 'test', imageId: 'image', operation: 'ai.clones.segmentation', params: {variant: 'mgcfdn-mpdn'}};

test('Segmentation configuration admits only known identity and performs no network or inference', async t => {
  let requests = 0; t.mock.method(globalThis, 'fetch', () => {requests++; throw Error('Unexpected fetch');});
  const budget = new Budget(1024), adapter = createSegmentationAdapter({budget, version: 'test'});
  await assert.rejects(adapter.run(task, image), {code: 'MODEL_UNAVAILABLE'});
  await assert.rejects(adapter.load({...input, sha256: '0'.repeat(64)}), {code: 'MODEL_IDENTITY'});
  await assert.rejects(adapter.load({...input, variant: 'toString'}), {code: 'INVALID_INPUT'});
  for (const variant of ['unknown-neural-model']) await assert.rejects(adapter.load({...input, variant}), {code: 'INVALID_INPUT'});
  await assert.rejects(adapter.load({...input, url: 'relative.onnx'}), {code: 'INVALID_INPUT'});
  const loaded = await adapter.load(input); assert.equal(loaded.parametersLoaded, false); assert.equal(loaded.runtimeInferencePerformed, false);
  assert.equal(requests, 0); assert.equal(budget.total(), 0); await adapter.dispose();
});

test('Segmentation refuses unsupported native choices and insufficient shared memory before model fetch', async t => {
  let requests = 0; t.mock.method(globalThis, 'fetch', () => {requests++; throw Error('Unexpected fetch');});
  const budget = new Budget(1), adapter = createSegmentationAdapter({budget, version: 'test'}); await adapter.load(input);
  await assert.rejects(adapter.run({...task, backend: 'webgpu'}, image), {code: 'UNSUPPORTED_BACKEND'});
  await assert.rejects(adapter.run({...task, params: {...task.params, exclusions: [[0, 0, 8, 8]]}}, image), {code: 'INVALID_INPUT'});
  await assert.rejects(adapter.run({...task, params: {...task.params, selectionPresent: true}}, image), {code: 'INVALID_INPUT'});
  await assert.rejects(adapter.run({...task, params: {variant: 'cmseg-generalization'}}, image), {code: 'INVALID_INPUT'});
  await assert.rejects(adapter.run(task, image), {code: 'MEMORY_LIMIT'});
  assert.equal(requests, 0); assert.equal(budget.total(), 0); await adapter.dispose();
});

test('GPU mirror is pinned and lazy; auto honours capabilities, memory and explicit CPU', async t => {
  let requests = 0, probes = 0; t.mock.method(globalThis, 'fetch', () => {requests++; throw Error('Unexpected fetch');});
  const budget = new Budget(3 * 1024 ** 3), adapter = createSegmentationAdapter({budget, version: 'test'}), identity = SEGMENTATION_MODELS['mgcfdn-mpdn'].gpu;
  await assert.rejects(adapter.load({...input, gpu: {...identity, url: 'https://models.invalid/gpu', sha256: '0'.repeat(64)}}), {code: 'MODEL_IDENTITY'});
  await assert.rejects(adapter.load({...input, gpu: {...identity, url: 'file:///gpu.onnx'}}), {code: 'INVALID_INPUT'});
  await adapter.load({...input, gpu: {...identity, url: 'https://models.invalid/gpu'}});
  assert.deepEqual(adapter.backends(), ['cpu', 'webgpu']); assert.equal(requests, 0); assert.equal(budget.total(), 0);
  const options = {requested: 'auto', gpuModel: identity, budget, sourceBytes: 1024, zones: 3, knownHeapBytes: 32 * 1024 ** 2, gpu: {async requestAdapter() {probes++; return {limits: {maxStorageBuffersPerShaderStage: 8}};}}};
  assert.equal((await selectSegmentationBackend({...options, requested: 'cpu'})).backend, 'cpu'); assert.equal(probes, 0);
  assert.equal((await selectSegmentationBackend({...options, budget: new Budget(1024 ** 3)})).reason, 'gpu-residency-exceeds-available-budget'); assert.equal(probes, 0);
  assert.equal((await selectSegmentationBackend({...options, gpu: null})).backend, 'cpu');
  assert.equal((await selectSegmentationBackend({...options, gpu: {async requestAdapter() {return {limits: {maxStorageBuffersPerShaderStage: 7}};}}})).backend, 'cpu');
  assert.equal((await selectSegmentationBackend(options)).backend, 'webgpu'); assert.equal(probes, 1);
  const release = budget.reserve(1024); await adapter.dispose(); release(); assert.equal(budget.total(), 0);
});

test('CMSeg bundles are separate immutable identities, configured without fetching their child graphs', async t => {
  let fetched=0;t.mock.method(globalThis,'fetch',()=>{fetched++;throw Error('No preload');});
  for(const variant of ['cmseg-addnoise']){
    const model=SEGMENTATION_MODELS[variant],budget=new Budget(1),adapter=createSegmentationAdapter({budget,version:'test'});
    await adapter.load({variant,url:'https://models.invalid/'+variant+'/bundle.json',bytes:model.bytes,sha256:model.sha256});
    assert.equal(model.side,512);assert.equal(model.assetBytes,21243915);assert.ok(Object.isFrozen(model.correlation)&&model.correlation.every(Object.isFrozen));
    assert.deepEqual(adapter.backends(),['cpu','webgpu']);assert.equal(model.gpu.sharedAssets,true);assert.equal(model.gpu.sha256,model.sha256);assert.equal(model.gpu.correlationGpuOnly,true);
    await assert.rejects(adapter.run({...task,backend:'webgpu',params:{variant}},image),{code:'MEMORY_LIMIT'});
    await assert.rejects(adapter.run({...task,params:{variant}},image),{code:'MEMORY_LIMIT'});
    await adapter.dispose();assert.equal(budget.total(),0);
  }
  assert.equal(fetched,0);
});

test('Repaired EffNet and source/target identities exclude the rejected original graphs', async t => {
  let fetched=0;t.mock.method(globalThis,'fetch',()=>{fetched++;throw Error('No preload');});
  const rejected={
    'mgcfdn-effnet':{bytes:73699326,sha256:'60e4cca2ef8298f5e5f3655f1b6aad2a99c696358c083d8d322d24ad3a3bbed6'},
    'mgcfdn-st':{bytes:89062921,sha256:'d74d219213e3e84333c91305bb11fba7458ee105d8ba5bfac0e787d948e0be23'}
  };
  for(const [variant,original] of Object.entries(rejected)){
    const model=SEGMENTATION_MODELS[variant],budget=new Budget(1),adapter=createSegmentationAdapter({budget,version:'test'}),url='https://models.invalid/native-mean.onnx';
    await assert.rejects(adapter.load({variant,url,...original}),{code:'MODEL_IDENTITY'});
    await adapter.load({variant,url,bytes:model.bytes,sha256:model.sha256});
    assert.equal(model.kind,variant==='mgcfdn-st'?'softmax':'sigmoid');
    await assert.rejects(adapter.run({...task,params:{variant}},image),{code:'MEMORY_LIMIT'});
    await adapter.dispose();assert.equal(budget.total(),0);
  }
  assert.equal(fetched,0);
});

// The rejected original bundle cannot be configured under the repaired variant.
test('CMSeg generalization accepts only repaired lazy identity and refuses the former bundle', async t => {
  let fetched=0;t.mock.method(globalThis,'fetch',()=>{fetched++;throw Error('No preload');});
  const model=SEGMENTATION_MODELS['cmseg-generalization'],budget=new Budget(1),adapter=createSegmentationAdapter({budget,version:'test'}),url='https://models.invalid/bundle.json',variant='cmseg-generalization';
  await assert.rejects(adapter.load({variant,url,bytes:1003,sha256:'6438da3ce27581a262b75b7e2580038bd9bed75de0dc2f6ef5c47cae069c5072'}),{code:'MODEL_IDENTITY'});
  assert.equal(adapter.configured(),null);
  const loaded=await adapter.load({variant,url,bytes:model.bytes,sha256:model.sha256});
  assert.equal(loaded.parametersLoaded,false);assert.equal(loaded.runtimeInferencePerformed,false);
  assert.equal(model.status,'experimental-cpu-corpus');assert.ok(Object.isFrozen(model.backbone));
  await assert.rejects(adapter.run({...task,params:{variant}},image),{code:'MEMORY_LIMIT'});
  assert.equal(fetched,0);assert.equal(budget.total(),0);await adapter.dispose();
  const {createEngine}=await import('../src/index.js'),engine=createEngine({memoryBudgetBytes:1024**2});
  try {const caps=engine.capabilities().operations.find(v=>v.id==='ai.clones.segmentation');assert.ok(caps.variants.includes(variant));assert.equal(caps.unavailableVariants[variant],undefined);}finally{await engine.dispose();}
});


test('TNT shares its qualified CPU/GPU bundle and rejects the old full ONNX',async t=>{
 let fetched=0;t.mock.method(globalThis,'fetch',()=>{fetched++;throw Error('No preload');});
 const variant='mgcfdn-tnt',model=SEGMENTATION_MODELS[variant],budget=new Budget(1),adapter=createSegmentationAdapter({budget,version:'test'}),url='https://models.invalid/tnt/bundle.json';
 await assert.rejects(adapter.load({variant,url,bytes:288776096,sha256:'cfd67861cef605e84ce7db5fa79cf9e194db79c6cdd25f195dcb402103a969f3'}),{code:'MODEL_IDENTITY'});
 const loaded=await adapter.load({variant,url,bytes:model.bytes,sha256:model.sha256});assert.equal(loaded.parametersLoaded,false);assert.equal(loaded.runtimeInferencePerformed,false);assert(Object.isFrozen(model.backbone)&&Object.isFrozen(model.tail));
 assert.deepEqual(adapter.backends(),['cpu','webgpu']);assert.equal(model.gpu.sharedAssets,true);
 await assert.rejects(adapter.run({...task,params:{variant},backend:'webgpu'},image),{code:'MEMORY_LIMIT'});await assert.rejects(adapter.run({...task,params:{variant}},image),{code:'MEMORY_LIMIT'});await adapter.dispose();assert.equal(fetched,0);assert.equal(budget.total(),0);
});

test('VIG admits the qualified shared CPU/GPU bundle and refuses the divergent ONNX identity',async t=>{
 let requests=0;t.mock.method(globalThis,'fetch',()=>{requests++;throw Error('No preload');});
 const variant='mgcfdn-vig',model=SEGMENTATION_MODELS[variant],budget=new Budget(1),adapter=createSegmentationAdapter({budget,version:'test'}),url='https://models.invalid/vig/bundle.json';
 try{await assert.rejects(adapter.load({variant,url,bytes:371300216,sha256:'5e402f702152dae3f29f9c461adcaee6e40467f29827e3d425f8d73fd9a8bb6f'}),{code:'MODEL_IDENTITY'});await adapter.load({variant,url,bytes:model.bytes,sha256:model.sha256});assert.deepEqual(adapter.backends(),['cpu','webgpu']);assert.equal(model.gpu.sharedAssets,true);await assert.rejects(adapter.run({...task,backend:'webgpu',params:{variant}},image),{code:'MEMORY_LIMIT'});await assert.rejects(adapter.run({...task,params:{variant}},image),{code:'MEMORY_LIMIT'});assert.equal(requests,0);assert.equal(budget.total(),0);}finally{await adapter.dispose();}
});

test('VIG auto uses shared assets and its staged GPU/CPU residency without a workload probe',async()=>{
 const model=SEGMENTATION_MODELS['mgcfdn-vig'];let probes=0;
 const options={requested:'auto',gpuModel:model.gpu,budget:new Budget(1024**3),sourceBytes:4*1024**2,zones:3,knownHeapBytes:32*1024**2,gpu:{async requestAdapter(){probes++;return{limits:{maxStorageBuffersPerShaderStage:8}};}}};
 assert.equal((await selectSegmentationBackend({...options,requested:'cpu'})).backend,'cpu');assert.equal(probes,0);
 assert.equal((await selectSegmentationBackend(options)).backend,'webgpu');assert.equal(probes,1);
 assert.equal((await selectSegmentationBackend({...options,budget:new Budget(640*1024**2)})).reason,'gpu-residency-exceeds-available-budget');assert.equal(probes,1);
 assert.equal((await selectSegmentationBackend({...options,gpu:null})).backend,'cpu');
});

test('Both CMSeg variants share verified GPU assets and retain explicit CPU without preloading',async t=>{
 let requests=0;t.mock.method(globalThis,'fetch',()=>{requests++;throw Error('No preload');});
 for(const variant of ['cmseg-generalization','cmseg-addnoise']){
 const model=SEGMENTATION_MODELS[variant],budget=new Budget(1024**3),adapter=createSegmentationAdapter({budget,version:'test'});
 try{
  await adapter.load({variant,url:'https://models.invalid/cmseg/bundle.json',bytes:model.bytes,sha256:model.sha256});
  assert.deepEqual(adapter.backends(),['cpu','webgpu']);assert.equal(model.gpu.sharedAssets,true);assert.equal(model.gpu.sha256,model.sha256);assert(Object.isFrozen(model.gpu));
  let probes=0;const options={requested:'auto',gpuModel:model.gpu,budget,sourceBytes:4*1024**2,zones:3,knownHeapBytes:32*1024**2,gpu:{async requestAdapter(){probes++;return{limits:{maxStorageBuffersPerShaderStage:8}};}}};
  assert.equal((await selectSegmentationBackend({...options,requested:'cpu'})).backend,'cpu');assert.equal(probes,0);
  assert.equal((await selectSegmentationBackend(options)).backend,'webgpu');assert.equal(probes,1);
  assert.equal((await selectSegmentationBackend({...options,budget:new Budget(768*1024**2)})).reason,'gpu-residency-exceeds-available-budget');assert.equal(probes,1);
  assert.equal((await selectSegmentationBackend({...options,gpu:null})).backend,'cpu');assert.equal(requests,0);assert.equal(budget.total(),0);
 }finally{await adapter.dispose();}
 }
});

test('MGCF16 and repaired EffNet share exact pinned CPU/GPU assets with no startup work',async t=>{
  let requests=0;t.mock.method(globalThis,'fetch',()=>{requests++;throw Error('No preload');});
  for(const variant of ['mgcfdn-16','mgcfdn-effnet']){
    const model=SEGMENTATION_MODELS[variant],budget=new Budget(2*1024**3),adapter=createSegmentationAdapter({budget,version:'test'});
    try{
      const loaded=await adapter.load({variant,url:'https://models.invalid/'+variant+'.onnx',bytes:model.bytes,sha256:model.sha256});
      assert.equal(loaded.parametersLoaded,false);assert.equal(loaded.runtimeInferencePerformed,false);
      assert.deepEqual(adapter.backends(),['cpu','webgpu']);assert(Object.isFrozen(model.gpu));
      assert.equal(model.gpu.sharedAssets,true);assert.equal(model.gpu.bytes,model.bytes);assert.equal(model.gpu.sha256,model.sha256);
      let probes=0;const options={requested:'auto',gpuModel:model.gpu,budget,sourceBytes:4*1024**2,zones:3,knownHeapBytes:32*1024**2,gpu:{async requestAdapter(){probes++;return{limits:{maxStorageBuffersPerShaderStage:8}};}}};
      assert.equal((await selectSegmentationBackend({...options,requested:'cpu'})).backend,'cpu');assert.equal(probes,0);
      assert.equal((await selectSegmentationBackend(options)).backend,'webgpu');assert.equal(probes,1);
      assert.equal((await selectSegmentationBackend({...options,budget:new Budget(1024**3)})).reason,'gpu-residency-exceeds-available-budget');assert.equal(probes,1);
      assert.equal((await selectSegmentationBackend({...options,gpu:null})).backend,'cpu');
    }finally{await adapter.dispose();}
    assert.equal(budget.total(),0);
  }
  assert.match(SEGMENTATION_MODELS['mgcfdn-effnet'].gpu.numericalParity,/threshold-crossing mask pixel/);
  assert.equal(SEGMENTATION_MODELS.mgcfdn.gpu.sharedAssets,undefined);assert.equal(SEGMENTATION_MODELS['mgcfdn-st'].gpu.sharedAssets,undefined);
  assert.equal(requests,0);
});
