import test from 'node:test';
import assert from 'node:assert/strict';
import {boundWasmMemory} from '../src/wasm-memory-limit.js';
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
