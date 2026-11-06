import test from 'node:test';
import assert from 'node:assert/strict';
import {createGhostJpegService} from '../src/ghost-jpeg-service.js';
import {EngineError} from '../src/errors.js';
const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
function navigatorGpu(gpu){Object.defineProperty(globalThis,'navigator',{value:{gpu},configurable:true});}
function restore(){if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;}
test('selected Ghost strict GPU rejects absent WebGPU without executing a codec producer',async()=>{
 navigatorGpu(undefined);let produced=0;const service=createGhostJpegService({});
 try{await assert.rejects(service.runExternalQuality(16,16,()=>produced++,{backend:'webgpu',strict:true}),{code:'GPU_UNAVAILABLE'});assert.equal(produced,0);assert.equal(service.ownsResources(),false);}
 finally{await service.dispose();restore();}
});
test('selected Ghost automatic refusal returns a CPU-fallback decision without running a fake GPU',async()=>{
 navigatorGpu(undefined);const service=createGhostJpegService({});let produced=0;
 try{assert.equal(await service.runExternalQuality(16,16,()=>produced++,{backend:'webgpu'}),null);assert.equal(produced,0);}
 finally{await service.dispose();restore();}
});
for(const strict of[false,true])test('selected Ghost '+(strict?'strict propagates':'automatic retires')+' acknowledged provider refusal',async()=>{
 navigatorGpu({});const refused=new EngineError('GPU_LIMIT','Qualified transport limit');let disposals=0,runs=0;
 const provider={runExternalQuality:async()=>{runs++;throw refused;},mayFallback:e=>e===refused,dispose:async()=>{disposals++;}},service=createGhostJpegService({}, {createProvider:()=>provider});
 try{const result=service.runExternalQuality(16,16,async()=>{}, {backend:'webgpu',strict});if(strict)await assert.rejects(result,e=>e===refused);else{assert.equal(await result,null);assert.equal(service.metrics().gpuFallback,'GPU_LIMIT');assert.equal(disposals,1);}assert.equal(runs,1);}
 finally{await service.dispose();assert.equal(disposals,1);restore();}
});
test('selected Ghost automatic mode propagates application failures',async()=>{
 navigatorGpu({});const failure=new Error('consumer failed'),provider={runExternalQuality:async()=>{throw failure;},mayFallback:()=>false,dispose:async()=>{}},service=createGhostJpegService({}, {createProvider:()=>provider});
 try{await assert.rejects(service.runExternalQuality(16,16,async()=>{}, {backend:'webgpu'}),e=>e===failure);assert.equal(service.metrics().gpuFallback,null);}
 finally{await service.dispose();restore();}
});
test('selected Ghost GPU requests share their serialized owner and drain before disposal',async()=>{
 navigatorGpu({});let live=0,max=0,calls=0,disposed=false;const provider={async runExternalQuality(w,h,produce){live++;max=Math.max(max,live);await produce();live--;calls++;return{width:w,height:h};},dispose:async()=>{assert.equal(live,0);disposed=true;}},service=createGhostJpegService({}, {createProvider:()=>provider});
 try{const result=await Promise.all([service.runExternalQuality(16,32,async()=>{await Promise.resolve();},{backend:'webgpu',strict:true}),service.runExternalQuality(32,16,async()=>{await Promise.resolve();},{backend:'webgpu',strict:true})]);assert.deepEqual(result,[{width:16,height:32},{width:32,height:16}]);assert.equal(max,1);assert.equal(calls,2);}
 finally{await service.dispose();assert.equal(disposed,true);restore();}
});
