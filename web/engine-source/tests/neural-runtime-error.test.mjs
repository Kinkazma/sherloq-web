import test from 'node:test';
import assert from 'node:assert/strict';
import {EngineError,serializeEngineError,deserializeEngineError,resourceAllocationKind} from '../src/errors.js';
import {neuralRuntimeError} from '../src/neural-runtime-error.js';
for(const [domain,phase]of [['array-buffer','output'],['gpu','inference'],['wasm','initialization'],['wasm','inference']])test('neural error preserves '+domain+' failure in '+phase,()=>{
 const cause=new RangeError(domain==='wasm'?'WebAssembly.Memory(): could not allocate memory':'Array buffer allocation failed'),original=new EngineError('MEMORY_ALLOCATION','Original refused allocation',{cause,details:{allocationKind:domain,requestedBytes:8192}}),error=deserializeEngineError(serializeEngineError(neuralRuntimeError(original,{provider:'wasm',phase,heapBytes:65536,maximumBytes:65536})));
 assert.equal(resourceAllocationKind(error),domain);assert.equal(error.details.requestedBytes,8192);assert.equal(error.cause.message,cause.message);assert.equal(error.details.nativeHeapExhausted===true,domain==='wasm'&&phase==='inference');assert.ok(error.stack.includes('neural-runtime-error.test'));
});
test('unrelated bounds errors and vague memory messages cannot manufacture a resource failure',()=>{for(const error of [new RangeError('Offset is outside the bounds of the DataView'),Error('Invalid memory index'),Error('Memory allocator configuration missing')])assert.equal(neuralRuntimeError(error,{provider:'wasm',phase:'inference',heapBytes:65536,maximumBytes:65536}),error);});
