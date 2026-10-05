import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createDensePagedHeap} from '../src/dense-paged-heap.js';
import {denseAllocationError,serializeDenseError,deserializeDenseError} from '../src/dense-memory-error.js';
const MiB=1024**2;
test('actual linear-memory growth beyond planned vectors is charged and released',()=>{
 const budget=new Budget(64*MiB),release=budget.reserve(24*MiB),heap=createDensePagedHeap(budget,24*MiB);
 assert.equal(heap.memory.grow(128),128);assert.equal(budget.total(),24*MiB);
 assert.equal(heap.memory.grow(256),256);assert.equal(budget.total(),34*MiB);assert.equal(heap.reservedBytes,34*MiB);
 heap.dispose();heap.dispose();release();assert.equal(budget.total(),0);
});
test('shared peer pressure prevents growth before the VM allocates the memory',()=>{
 const budget=new Budget(40*MiB),release=budget.reserve(24*MiB),peer=budget.reserve(12*MiB),heap=createDensePagedHeap(budget,24*MiB);
 assert.throws(()=>heap.memory.grow(512),e=>e.code==='MEMORY_LIMIT');assert.equal(heap.memory.buffer.byteLength,8*MiB);assert.equal(budget.total(),36*MiB);
 peer();assert.equal(heap.memory.grow(128),128);assert.equal(heap.error,null);heap.dispose();release();assert.equal(budget.total(),0);
});
test('VM-rejected growth does not leak a reservation',()=>{
 const budget=new Budget(64*MiB),release=budget.reserve(24*MiB),heap=createDensePagedHeap(budget,24*MiB);
 assert.throws(()=>heap.memory.grow(16384),RangeError);assert.equal(heap.memory.buffer.byteLength,8*MiB);assert.equal(budget.total(),24*MiB);
 heap.dispose();release();assert.equal(budget.total(),0);
});
test('physical growth failures retain allocator evidence and release speculative capacity',()=>{
 const RealMemory=WebAssembly.Memory;let refuse=true;
 WebAssembly.Memory=class extends RealMemory{grow(pages){if(refuse)throw new RangeError('Injected allocator refusal');return super.grow(pages);}};
 const budget=new Budget(64*MiB),release=budget.reserve(24*MiB);let heap;
 try{heap=createDensePagedHeap(budget,24*MiB);assert.throws(()=>heap.memory.grow(512),error=>error.code==='MEMORY_ALLOCATION'&&error.details.requestedBytes===40*MiB&&error.details.currentBytes===8*MiB);assert.equal(budget.total(),24*MiB);const clone=deserializeDenseError(serializeDenseError(heap.error));assert.deepEqual(clone.details,heap.error.details);assert.equal(clone.cause.name,'RangeError');assert.match(clone.cause.message,/Injected/);heap.clearError();assert.equal(heap.error,null);refuse=false;heap.memory.grow(512);assert.equal(heap.error,null);}finally{heap?.dispose();release();WebAssembly.Memory=RealMemory;}assert.equal(budget.total(),0);
});
test('initial physical allocation failure is distinct from a logical budget refusal',()=>{
 const RealMemory=WebAssembly.Memory;WebAssembly.Memory=class{constructor(){throw new RangeError('Injected create refusal');}};
 try{assert.throws(()=>createDensePagedHeap(new Budget(64*MiB),24*MiB),error=>error.code==='MEMORY_ALLOCATION'&&error.details.operation==='wasm-memory-create'&&error.cause.message==='Injected create refusal');}finally{WebAssembly.Memory=RealMemory;}
});

test('dense errors preserve both names, nested causes and requested Wasm bytes over both transports',()=>{
 const original=new RangeError('WebAssembly.Memory(): could not allocate memory'),error=denseAllocationError(original,{operation:'wasm-memory-create',requestedBytes:8*1024**2,currentBytes:0});
 const twice=deserializeDenseError(serializeDenseError(deserializeDenseError(serializeDenseError(error))));assert.equal(twice.code,'MEMORY_ALLOCATION');assert.equal(twice.name,'EngineError');assert.equal(twice.cause.name,'RangeError');assert.equal(twice.cause.message,original.message);assert.equal(twice.cause.stack,original.stack);assert.equal(twice.details.requestedBytes,8*1024**2);assert.equal(twice.details.allocationKind,'wasm');
 const logical=Object.assign(Error('Policy full'),{code:'MEMORY_LIMIT',details:{requestedBytes:17}});assert.equal(denseAllocationError(logical,{operation:'wasm-memory-grow',currentBytes:8}).details.currentBytes,8);assert.equal(logical.details.requestedBytes,17);assert.equal(logical.details.allocationKind,undefined);
});
