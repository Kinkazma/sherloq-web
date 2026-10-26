import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
import {createCmsegWindowCnnRuntime} from '../experiments/segmentation/cmseg-window-cnn-runtime.js';
const open=(model,backend='webgpu')=>{const budget=new Budget(2**30),runtime=createCmsegWindowCnnRuntime({budget,model,modelUrl:'http://localhost/native/bundle.json',backend,maxWorkers:10,workerFactory(){throw Error('No model may execute in constructor test');}});return{budget,runtime};};
test('actual pinned addnoise nested native GPU correlation descriptor admits without constructing any neural Worker',async()=>{
 const {budget,runtime}=open(SEGMENTATION_MODELS['cmseg-addnoise']);assert.equal(runtime.snapshot().workerCreations,0);assert.equal(runtime.snapshot().encoderCalls,0);assert.equal(runtime.snapshot().requestedMaxWorkers,10);assert.equal(runtime.snapshot().backend,'webgpu');await runtime.release();assert.equal(budget.total(),0);
});
test('a different nested model identity cannot inherit the original shared GPU admission',()=>{
 const model=SEGMENTATION_MODELS['cmseg-addnoise'];for(const change of [{sha256:'0'.repeat(64)},{id:'foreign'},{bytes:model.bytes+1},{sharedAssets:false},{correlationGpuOnly:false}])assert.throws(()=>open({...model,gpu:{...model.gpu,...change}}),e=>e.code==='INVALID_INPUT');
});
test('generalization native GPU backbone and existing explicit CPU mode remain admitted without model execution',async()=>{
 for(const [model,backend]of[[SEGMENTATION_MODELS['cmseg-generalization'],'webgpu'],[SEGMENTATION_MODELS['cmseg-addnoise'],'cpu']]){const{budget,runtime}=open(model,backend);assert.equal(runtime.snapshot().workerCreations,0);await runtime.release();assert.equal(budget.total(),0);}
});
