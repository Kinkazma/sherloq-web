import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
import {selectSegmentationBackend} from '../experiments/segmentation/backend.js';
const model=SEGMENTATION_MODELS['mgcfdn-st'],bounds=[[20,20,276,276],[100,80,356,336],[12,12,364,344]];
function options(budget){let probes=0;return{value:{requested:'auto',gpuModel:model.gpu,cpuModel:model,regionBounds:bounds,segmented:true,budget,sourceBytes:4*1024**2,zones:3,knownHeapBytes:32*1024**2,hardwareConcurrency:10,gpu:{async requestAdapter(){probes++;return{limits:{maxStorageBuffersPerShaderStage:8}};}}},probes:()=>probes};}
test('ST automatic preference requires three distinct CPU lanes and leaves explicit choices intact',async()=>{
 const o=options(new Budget(3*1024**3));assert.deepEqual(await selectSegmentationBackend(o.value),{backend:'cpu',reason:'parallel-cpu-zones-fit-preference'});assert.equal(o.probes(),0);
 for(const overrides of [{regionBounds:bounds.slice(0,1),zones:1},{regionBounds:[bounds[0],bounds[0],bounds[1]]},{hardwareConcurrency:2},{budget:new Budget(2*1024**3)}])assert.equal((await selectSegmentationBackend({...o.value,...overrides})).backend,'webgpu');
 for(const requested of ['cpu','webgpu'])assert.deepEqual(await selectSegmentationBackend({...o.value,requested}),{backend:requested,reason:'explicit-'+requested});
 assert.equal((await selectSegmentationBackend({...o.value,gpuModel:SEGMENTATION_MODELS.mgcfdn.gpu,cpuModel:SEGMENTATION_MODELS.mgcfdn})).backend,'webgpu');
});
test('ST capacity preserves source and other active owners but recovers its own idle sessions',async()=>{
 const budget=new Budget(3*1024**3),o=options(budget),own=3*(512*1024**2+3*model.bytes),release=budget.reserve(own);
 assert.equal((await selectSegmentationBackend({...o.value,reclaimableInferenceBytes:own})).reason,'parallel-cpu-zones-fit-preference');
 assert.equal((await selectSegmentationBackend(o.value)).backend,'webgpu'); // Unknown ownership is not assumed reclaimable.
 release();budget.retain(700*1024**2);assert.equal((await selectSegmentationBackend(o.value)).backend,'webgpu');budget.retained=0;
 const other=budget.reserve(700*1024**2);assert.equal((await selectSegmentationBackend(o.value)).backend,'webgpu');other();assert.equal(budget.total(),0);
});
