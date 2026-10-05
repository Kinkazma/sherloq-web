import test from 'node:test';
import assert from 'node:assert/strict';
import {wasmRange,byteRange,byteLength,byteView,closeMemoryRanges} from '../src/memory-range.js';
test('Wasm ranges retain fixed addresses across growth and invalidate with their owner',()=>{
 const memory=new WebAssembly.Memory({initial:1,maximum:3}),module={HEAPU8:new Uint8Array(memory.buffer)},range=wasmRange(module,64,16),old=byteView(range);old.fill(23);
 memory.grow(1);module.HEAPU8=new Uint8Array(memory.buffer);assert.equal(old.byteLength,0);assert.equal(byteLength(range),16);assert.deepEqual([...byteView(range)],Array(16).fill(23));byteView(range,3,2).fill(42);assert.equal(module.HEAPU8[67],42);
 closeMemoryRanges(module);assert.throws(()=>byteView(range),{code:'DISPOSED'});assert.throws(()=>wasmRange(module,64,16),{code:'DISPOSED'});
});
test('an ordinary borrowed range rejects detachment instead of becoming empty',()=>{
 const bytes=new Uint8Array(16),range=byteRange(bytes);structuredClone(bytes.buffer,{transfer:[bytes.buffer]});assert.equal(byteLength(range),16);assert.throws(()=>byteView(range),{code:'MEMORY_RANGE_INVALID'});
});
test('range bounds are checked on creation and at every refreshed access',()=>{
 const module={HEAPU8:new Uint8Array(32)},range=wasmRange(module,8,16);assert.throws(()=>byteView(range,15,2));assert.throws(()=>wasmRange(module,31,2),{code:'MEMORY_RANGE_INVALID'});module.HEAPU8=new Uint8Array(16);assert.throws(()=>byteView(range),{code:'MEMORY_RANGE_INVALID'});
});
