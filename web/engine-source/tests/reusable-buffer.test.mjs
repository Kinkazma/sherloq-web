import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {createReusableBuffer} from '../src/reusable-buffer.js';import {allocateTypedArray,allocateOwnedTypedArray} from '../src/allocation.js';
test('one owned backing survives real transfer ACK, reuse and idle retirement',async()=>{
 const budget=new Budget(128),slot=createReusableBuffer({budget,owner:'sift',label:'input'});let reservations=0;
 const reserve=n=>{reservations++;return budget.reserve(n);};slot.hold();const first=slot.checkout(Uint8Array,64,{reserve});first[0]=19;
 const sent=structuredClone(first,{transfer:[first.buffer]});assert.equal(first.byteLength,0);assert.equal(await budget.reclaimAllocation(64),0);assert.equal(slot.byteLength,64);
 assert.throws(()=>slot.park(),/acknowledgement/);const ack=structuredClone(sent.buffer,{transfer:[sent.buffer]});slot.takeBack(ack);slot.park();
 slot.hold();assert.equal(await budget.reclaimAllocation(64),0);const next=slot.checkout(Float32Array,8,{reserve});assert.equal(next.buffer,ack);assert.equal(reservations,1);assert.equal(budget.total(),64);
 slot.park();assert.equal(await budget.reclaimAllocation(64),64);assert.equal(slot.byteLength,0);assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);slot.dispose();assert.equal(budget.asyncReclaimers.size,0);assert.equal(budget.reusableAllocators.size,0);
});
test('constructor refusal retains native cause and exact extent, invalid requests stay invalid',()=>{
 const cause=new RangeError('Array buffer allocation failed'),Type=new Proxy(Float32Array,{construct(){throw cause;}}),budget=new Budget(1024);
 assert.throws(()=>allocateOwnedTypedArray(Type,37,{budget,label:'sift-input'}),e=>e.code==='MEMORY_ALLOCATION'&&e.cause===cause&&e.details.requestedBytes===148&&e.details.allocationKind==='array-buffer');assert.equal(budget.total(),0);
 assert.throws(()=>allocateTypedArray(Uint8Array,-1),{code:'INVALID_INPUT'});assert.throws(()=>allocateOwnedTypedArray(Uint8Array,NaN,{budget}),{code:'INVALID_INPUT'});assert.equal(budget.total(),0);
 const slot=createReusableBuffer({budget,owner:'patchmatch',label:'texture'});slot.checkout(Uint8Array,16);slot.park();
 assert.throws(()=>slot.checkout(Type,37),e=>e.cause===cause);assert.equal(budget.total(),0);assert.equal(slot.byteLength,0);slot.dispose();
});
test('transfer failure retires its sole owner after worker termination',()=>{
 const budget=new Budget(128),slot=createReusableBuffer({budget,owner:'patchmatch',label:'rgb'}),data=slot.checkout(Uint8Array,64);structuredClone(data,{transfer:[data.buffer]});slot.retire();assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].backings,0);slot.dispose();
});

test('an empty held reservation can park without pretending a transfer occurred',()=>{
 const budget=new Budget(128),slot=createReusableBuffer({budget,owner:'patchmatch',label:'scratch'});
 slot.hold();slot.park();assert.equal(slot.busy,false);
 slot.checkout(Uint8Array,32);slot.park();slot.retire();slot.hold();slot.park();
 assert.equal(budget.total(),0);slot.dispose();
});
