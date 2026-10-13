import test from 'node:test';import assert from 'node:assert/strict';import {createEngine} from '../src/index.js';
test('segmentation capabilities describe the scientific candidate-domain contract while legacy exclusions and CNN-context masking stay unsupported',async()=>{
 const engine=createEngine({memoryBudgetBytes:1024**2});try{const capability=engine.capabilities().operations.find(v=>v.id==='ai.clones.segmentation');assert.equal(capability.exclusions,false);assert.equal(capability.compare,false);assert.deepEqual(capability.scientificScope,{contract:'params.scientificScope',domain:'native-source-and-target-candidates',cnnContextMasked:false,receipts:'metadata.nativePipelines[].scientificScope'});assert.equal(capability.configuredVariant,null);}finally{await engine.dispose();}
});
