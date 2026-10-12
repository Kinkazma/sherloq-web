import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {createBoundedRoles} from '../experiments/d2prl/roles-bounded.js';
import {roleModelWorkspaceBytes} from '../experiments/d2prl/role-model.js';
import {D2PRL_ROLE_MODEL,D2PRL_ROLE_RUNTIME_256,validateRoleRuntime,validateRoleFactory,validateRoleHeap,validateRoleInputs} from '../experiments/d2prl/role-runtime.js';
import {prepareD2prlRoleRuntime256,selectD2prlRoleStagingRecord} from '../scripts/build-d2prl-role-runtime-256.mjs';
const MiB=1024**2,N=448**2,legacy={runtimeId:'ort130-wasm-512mib',memoryMaximumBytes:512*MiB},model={modelBytes:D2PRL_ROLE_MODEL.bytes,modelSha256:D2PRL_ROLE_MODEL.sha256,inputs:[...D2PRL_ROLE_MODEL.inputs],outputs:[...D2PRL_ROLE_MODEL.outputs]};
const inputs=()=>{const plane=Float32Array.from({length:N},(_,i)=>i===0?.125:0);return{rgb:new Float32Array(3*N),coordinates:{zm:{x:plane,y:plane},cnn:{x:plane,y:plane}},union:plane};};
const feeds=()=>{const value=inputs();return{rgb:value.rgb,x_cor:value.union,y_cor:value.union,x_cor2:value.union,y_cor2:value.union,union:value.union};};
test('role runtime validates only exact old512 or model-pinned D2-only256 pairs and copies its immutable cap',()=>{
 assert.equal(validateRoleRuntime(legacy,{}).memoryMaximumBytes,512*MiB);
 const value={...D2PRL_ROLE_RUNTIME_256},bound=validateRoleRuntime(value,model);value.memoryMaximumBytes=512*MiB;assert.equal(bound.memoryMaximumBytes,256*MiB);assert.ok(Object.isFrozen(bound));
 for(const runtime of [{...legacy,memoryMaximumBytes:256*MiB},{...D2PRL_ROLE_RUNTIME_256,memoryMaximumBytes:512*MiB},{runtimeId:'arbitrary',memoryMaximumBytes:256*MiB}])assert.throws(()=>validateRoleRuntime(runtime,model),{code:'INVALID_INPUT'});
 for(const changed of [{...model,modelBytes:model.modelBytes-1},{...model,modelSha256:'0'.repeat(64)},{...model,inputs:model.inputs.slice(1)},{...model,outputs:['target']}])assert.throws(()=>validateRoleRuntime(D2PRL_ROLE_RUNTIME_256,changed),{code:'INVALID_INPUT'});
});
test('a D2-only256 factory must advertise the real cap and exact graph, while the old512 factory remains compatible',()=>{
 const factory={heapBytes:()=>16*MiB,...D2PRL_ROLE_RUNTIME_256,modelIdentity:D2PRL_ROLE_MODEL};validateRoleFactory(D2PRL_ROLE_RUNTIME_256,factory);validateRoleFactory(legacy,{heapBytes(){}});
 for(const changed of [{heapBytes(){}},{...factory,memoryMaximumBytes:512*MiB},{...factory,modelIdentity:{...D2PRL_ROLE_MODEL,bytes:4}}])assert.throws(()=>validateRoleFactory(D2PRL_ROLE_RUNTIME_256,changed),{code:'INVALID_INPUT'});
 for(const bytes of [0,-1,NaN,Infinity,256*MiB+65536])assert.throws(()=>validateRoleHeap(D2PRL_ROLE_RUNTIME_256,bytes),{code:'INVALID_INPUT'});
 assert.equal(validateRoleHeap(D2PRL_ROLE_RUNTIME_256,256*MiB),256*MiB);assert.equal(validateRoleHeap(legacy,400*MiB),400*MiB);
});
test('the new worker contract requires all six actual fixed448 Float32 inputs',()=>{
 const value=feeds();validateRoleInputs(D2PRL_ROLE_RUNTIME_256,value);const short={...value,x_cor:Float32Array.of(0)},missing={...value};delete missing.union;
 for(const changed of [short,missing,{...value,extra:value.union}])assert.throws(()=>validateRoleInputs(D2PRL_ROLE_RUNTIME_256,changed),{code:'INVALID_INPUT'});
});
test('the candidate loader changes exactly one cap literal and preserves every shared512 source byte',async()=>{
 const source=await readFile(new URL('../vendor/d2prl/ort-wasm-simd-threaded.mjs',import.meta.url),'utf8'),pins=JSON.parse(await readFile(new URL('../vendor/d2prl/PINNED.json',import.meta.url))),result=prepareD2prlRoleRuntime256(source,pins);
 assert.equal(result.loader.replace('new WebAssembly.Memory({initial:256,maximum:4096,shared:!0})','new WebAssembly.Memory({initial:256,maximum:8192,shared:!0})'),source);
 assert.match(result.factory,/ort-wasm-simd-threaded-roles256\.mjs/);assert.match(result.factory,/ort130-wasm-256mib-d2prl/);assert.equal(result.record.wasmSha256,pins.files['ort-wasm-simd-threaded.wasm'].sha256);assert.equal(Object.keys(result.record.files).length,2);assert.doesNotMatch(JSON.stringify(result.record),/\/Users\//);
 assert.equal(await readFile(new URL('../vendor/d2prl/ort-wasm-simd-threaded.mjs',import.meta.url),'utf8'),source);
 assert.throws(()=>prepareD2prlRoleRuntime256(source.replace('maximum:8192','maximum:4096'),pins));
});
test('restaging the same qualified role artifacts preserves their proof instead of downgrading to experimental',async()=>{
 const source=await readFile(new URL('../vendor/d2prl/ort-wasm-simd-threaded.mjs',import.meta.url),'utf8'),pins=JSON.parse(await readFile(new URL('../vendor/d2prl/PINNED.json',import.meta.url))),{record}=prepareD2prlRoleRuntime256(source,pins);
 const qualified={...structuredClone(record),status:'qualified-exact-current-engine-memory-cap',qualification:{directModel:{status:'passed-exact-parity',threeRawAndDecisionsExact:true,finalOwnershipZero:true,globalSpeedQualified:false},rolePair:{status:'passed-real-role-pair-parity',policySavingBytes:256*MiB}}};
 assert.equal(selectD2prlRoleStagingRecord(record,undefined),record);assert.equal(selectD2prlRoleStagingRecord(record,structuredClone(record)),record);assert.equal(selectD2prlRoleStagingRecord(record,qualified),qualified);
 for(const change of [value=>value.status='arbitrary',value=>value.files['factory-roles256.mjs'].sha256='0'.repeat(64),value=>value.source.sha256='0'.repeat(64),value=>value.memoryMaximumBytes=512*MiB,value=>value.qualification.directModel.globalSpeedQualified=true,value=>value.qualification.rolePair.policySavingBytes=0]){const changed=structuredClone(qualified);change(changed);assert.throws(()=>selectD2prlRoleStagingRecord(record,changed));}
 assert.equal(record.status,'experimental-memory-cap-candidate');assert.equal(qualified.qualification.directModel.status,'passed-exact-parity');
});
function worker(t,{fault,cancel}={}){
 const previous=globalThis.Worker,workers=[];t.after(()=>{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;});
 globalThis.Worker=class{constructor(){workers.push(this);}terminate(){this.closed=true;}postMessage(message,transfer){const data=structuredClone(message,{transfer});assert.ok(Object.values(message.inputs).every(view=>view.byteLength===0));this.request=data;queueMicrotask(()=>{
  const send=value=>this.onmessage?.({data:value}),backing=(action,bytes)=>send({phase:'parameter-backing',backing:{id:Number.MAX_SAFE_INTEGER,action,kind:'wasm',bytes,label:'ort-heap'}}),over=data.roleRuntime.memoryMaximumBytes+65536;
  backing('allocate',fault==='allocate'?over:16*MiB);if(this.closed)return;backing('resize',fault==='resize'?over:32*MiB);if(this.closed)return;
  if(cancel){cancel.abort();return;}send({ok:true,target:new Float32Array(N),source:new Float32Array(N),heapBytes:fault==='output'?over:32*MiB,parameterLoading:{fixture:true}});
 });}};return workers;
}
const stage=(budget,runtime)=>createBoundedRoles({budget,model,modelUrl:'https://fixture.invalid/model',runtime,runtimeFactoryUrl:'https://fixture.invalid/'+(runtime===legacy?'factory.mjs':'factory-roles256.mjs'),ortUrl:'https://fixture.invalid/ort.mjs',wasmPath:'https://fixture.invalid/'});
const empty=budget=>{assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains.wasm.backings,0);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);assert.equal(getExecutionScheduler(budget).snapshot().running,0);};
test('D2-only256 admission saves exactly256MiB policy with unchanged transferred inputs and no duplicate ledger debit',async t=>{
 const workers=worker(t),value=inputs(),before=value.union[0],peaks=[];
 for(const runtime of [legacy,D2PRL_ROLE_RUNTIME_256]){const budget=new Budget(1024*MiB),engine=stage(budget,runtime),result=await engine.run(value);
  assert.equal(result.target.length,N);assert.equal(result.heapBytes,32*MiB);assert.equal(budget.total(),2*N*4,'Only the caller-owned output reservation remains');assert.equal(budget.resourceSnapshot().domains.wasm.backings,0);peaks.push(budget.peak);const request=workers.at(-1).request;assert.deepEqual(request.roleRuntime,runtime);assert.deepEqual(request.modelInputs,model.inputs);assert.deepEqual(request.modelOutputs,model.outputs);assert.equal(request.inputs.union[0],before);assert.equal(value.union[0],before);result.release();result.release();engine.dispose();empty(budget);
 }assert.equal(peaks[0]-peaks[1],256*MiB);assert.ok(workers.every(value=>value.closed));
});
for(const fault of ['allocate','resize','output'])test(`the first ${fault} report cannot exceed the admitted256 cap or retain backing/accounting`,async t=>{
 const workers=worker(t,{fault}),budget=new Budget(1024*MiB),engine=stage(budget,D2PRL_ROLE_RUNTIME_256);await assert.rejects(engine.run(inputs()),{code:'INVALID_INPUT'});engine.dispose();empty(budget);assert.equal(workers.length,1);assert.ok(workers[0].closed);
});
test('cancellation and exact admission refusal release the256 role owner without ever creating an unadmitted worker',async t=>{
 const controller=new AbortController(),workers=worker(t,{cancel:controller}),budget=new Budget(1024*MiB),engine=stage(budget,D2PRL_ROLE_RUNTIME_256);await assert.rejects(engine.run(inputs(),{signal:controller.signal}),{code:'CANCELLED'});engine.dispose();empty(budget);
 const bytes=256*MiB+roleModelWorkspaceBytes(model.modelBytes)+2*(8*N*4)+3*(2*N*4),limited=new Budget(bytes-1),refused=stage(limited,D2PRL_ROLE_RUNTIME_256);await assert.rejects(refused.run(inputs()),{code:'MEMORY_LIMIT'});refused.dispose();empty(limited);assert.equal(workers.length,1);
});
