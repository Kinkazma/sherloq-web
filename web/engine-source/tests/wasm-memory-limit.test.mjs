import test from 'node:test';
import assert from 'node:assert/strict';
import {boundWasmMemory,importedWasmMemoryDescriptor} from '../src/wasm-memory-limit.js';
// memory(min=1,max=10), export 'memory', no code.
const moduleBytes=Uint8Array.of(0,97,115,109,1,0,0,0,5,4,1,1,1,10,7,10,1,6,109,101,109,111,114,121,2,0);
test('bounded WebAssembly keeps instructions while enforcing admitted pages',async()=>{
  const original=moduleBytes.slice(),bounded=boundWasmMemory(moduleBytes,2*65536),{instance}=await WebAssembly.instantiate(bounded);
  assert.deepEqual(moduleBytes,original);assert.equal(instance.exports.memory.grow(1),1);assert.throws(()=>instance.exports.memory.grow(1),RangeError);
  const larger=await WebAssembly.instantiate(boundWasmMemory(moduleBytes,20*65536));assert.equal(larger.instance.exports.memory.grow(9),1);assert.throws(()=>larger.instance.exports.memory.grow(1),RangeError);
});
test('invalid memory layouts and insufficient admission are explicit',()=>{
  assert.throws(()=>boundWasmMemory(moduleBytes,1),{code:'INVALID_INPUT'});
  const two=moduleBytes.slice();two[12]=2;assert.throws(()=>boundWasmMemory(two,65536),{code:'MEMORY_LIMIT'});
  const shared=moduleBytes.slice();shared[11]=3;assert.throws(()=>boundWasmMemory(shared,65536),{code:'INVALID_INPUT'});
  assert.throws(()=>boundWasmMemory(moduleBytes.slice(0,13),65536),{code:'INVALID_INPUT'});
});

// import a.a memory(min=1,max=32768); no data, code or large allocation.
const importedModule=Uint8Array.of(0,97,115,109,1,0,0,0,2,11,1,1,97,1,97,2,1,1,128,128,2);
test('a large policy allowance must respect the actual imported-memory type',async()=>{
  const tooWide=new WebAssembly.Memory({initial:1,maximum:56458});
  assert.equal(tooWide.buffer.byteLength,65536);
  await assert.rejects(WebAssembly.instantiate(importedModule,{a:{a:tooWide}}),WebAssembly.LinkError);
  const descriptor=importedWasmMemoryDescriptor({initialBytes:65536,memoryBudgetBytes:56458*65536,moduleMaximumBytes:2**31});
  assert.deepEqual(descriptor,{initial:1,maximum:32768});
  const bounded=new WebAssembly.Memory(descriptor);
  await WebAssembly.instantiate(importedModule,{a:{a:bounded}});
  assert.equal(bounded.buffer.byteLength,65536,'The maximum must not eagerly allocate its growth allowance');
});
test('import admission floors partial pages and enforces its genuine small capacity',async()=>{
  const descriptor=importedWasmMemoryDescriptor({initialBytes:65536,memoryBudgetBytes:2*65536+123,moduleMaximumBytes:2**31});
  const memory=new WebAssembly.Memory(descriptor);
  await WebAssembly.instantiate(importedModule,{a:{a:memory}});
  assert.equal(memory.grow(1),1);assert.equal(memory.buffer.byteLength,2*65536);
  assert.throws(()=>memory.grow(1),RangeError);
  assert.throws(()=>importedWasmMemoryDescriptor({initialBytes:2*65536,memoryBudgetBytes:2*65536-1,moduleMaximumBytes:2**31}),{code:'MEMORY_LIMIT'});
  assert.throws(()=>importedWasmMemoryDescriptor({initialBytes:65536,memoryBudgetBytes:Infinity,moduleMaximumBytes:2**31}),{code:'INVALID_INPUT'});
  assert.deepEqual(importedWasmMemoryDescriptor({initialBytes:65536,memoryBudgetBytes:2**32,moduleMaximumBytes:2**32}),{initial:1,maximum:65536},'The shared helper must not impose the target module maximum on other modules');
});
