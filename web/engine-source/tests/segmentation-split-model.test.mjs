import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
import {validateSplitModel,readPinnedSplitAsset} from '../experiments/segmentation/split-model.js';
import {createSegmentationAdapter} from '../src/segmentation-adapter.js';
import {createSegmentationInference} from '../experiments/segmentation/inference.js';
import {selectSegmentationBackend} from '../experiments/segmentation/backend.js';
import {Budget} from '../src/cache.js';

test('Split manifests pin unchanged complete boundaries and variant-specific CPU/GPU placement',async()=>{
 for(const variant of ['mgcfdn','mgcfdn-st']){
  const original=SEGMENTATION_MODELS[variant],model={...original,...original.gpu},bytes=await readFile(new URL('../fixtures/segmentation/gpu-split/'+variant+'.json',import.meta.url));
  assert.equal(bytes.length,model.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),model.sha256);
  const manifest=JSON.parse(bytes);assert.equal(validateSplitModel(manifest,model),manifest);assert(Object.isFrozen(model.stageBackends));
  assert.equal(model.cpuSha256,original.sha256);assert.equal(manifest.stages[1].backend,variant==='mgcfdn-st'?'wasm':'webgpu');
  for(const alter of [m=>m.stages[0].file='../escape.onnx',m=>m.stages[1].backend='invalid',m=>m.boundary[0].shape[3]=16,m=>m.assetBytes--,m=>m.sourceSha256='0'.repeat(64),m=>m.stages[0].outputs.reverse()]){
   const bad=structuredClone(manifest);alter(bad);assert.throws(()=>validateSplitModel(bad,model),{code:'INVALID_INPUT'});
  }
 }
});

test('Split asset reader verifies actual bytes and rejects truncation, excess and wrong SHA',async t=>{
 const bytes=await readFile(new URL('../fixtures/segmentation/gpu-split/mgcfdn.json',import.meta.url)),spec=SEGMENTATION_MODELS.mgcfdn.gpu;let payload=bytes;
 t.mock.method(globalThis,'fetch',async()=>new Response(payload));
 assert.deepEqual(await readPinnedSplitAsset('https://models.invalid/bundle.json',spec),new Uint8Array(bytes));
 payload=bytes.subarray(0,bytes.length-1);await assert.rejects(readPinnedSplitAsset('https://models.invalid/bundle.json',spec),/identity/);
 payload=Buffer.concat([bytes,Buffer.from([0])]);await assert.rejects(readPinnedSplitAsset('https://models.invalid/bundle.json',spec),/exceeds/);
 payload=bytes;await assert.rejects(readPinnedSplitAsset('https://models.invalid/bundle.json',{...spec,sha256:'0'.repeat(64)}),/identity/);
});

test('Split GPU mirror is lazy and budgets both child graphs and bridge, not just tiny manifest',async t=>{
 let requests=0;t.mock.method(globalThis,'fetch',()=>{requests++;throw Error('No fetch');});
 for(const variant of ['mgcfdn','mgcfdn-st']){
  const model=SEGMENTATION_MODELS[variant],gpuModel=model.gpu,budget=new Budget(2*1024**3),adapter=createSegmentationAdapter({budget,version:'test'});
  await adapter.load({variant,url:'https://models.invalid/full.onnx',bytes:model.bytes,sha256:model.sha256,gpu:{...gpuModel,url:'https://models.invalid/gpu-split-bundle.json'}});
  assert.deepEqual(adapter.backends(),['cpu','webgpu']);assert.equal(budget.total(),0);
  let probes=0;const options={requested:'auto',gpuModel,budget,sourceBytes:4*1024**2,zones:3,knownHeapBytes:32*1024**2,gpu:{async requestAdapter(){probes++;return{limits:{maxStorageBuffersPerShaderStage:8}};}}};
  assert.equal((await selectSegmentationBackend({...options,budget:new Budget(1152*1024**2)})).reason,'gpu-residency-exceeds-available-budget');assert.equal(probes,0);
  assert.equal((await selectSegmentationBackend(options)).backend,'webgpu');assert.equal(probes,1);
  assert.equal((await selectSegmentationBackend({...options,requested:'cpu'})).backend,'cpu');assert.equal(probes,1);
  await adapter.dispose();
  const low=new Budget(1152*1024**2),inference=createSegmentationInference({budget:low,variant,backend:'webgpu',modelUrl:'https://models.invalid/gpu-split-bundle.json'});
  await assert.rejects(inference.run(new Float32Array(3*256**2)),{code:'MEMORY_LIMIT'});inference.dispose();assert.equal(low.total(),0);
 }
 assert.equal(requests,0);
});
