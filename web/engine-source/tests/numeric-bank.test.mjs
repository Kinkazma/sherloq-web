import test from 'node:test';import assert from 'node:assert/strict';
import {createNumericBank} from '../src/numeric-bank.js';import {Budget} from '../src/cache.js';
test('Scientific row banks preserve float64, float32 and bytes through unaligned byte pages',async()=>{
 const budget=new Budget(10000);
 for(const Type of [Float32Array,Float64Array,Uint8Array]){
  const expected=Type.from({length:77},(_,i)=>i/13),bank=await createNumericBank(Type,[7,11],{budget,chunkBytes:19});await bank.write(expected);const part=await bank.readRows(2,3);assert.deepEqual(part.data,expected.slice(22,55));part.release();const bytes=new Uint8Array(expected.buffer,expected.byteOffset,expected.byteLength),copy=new Uint8Array(37);await bank.readBytes(copy,3);assert.deepEqual(copy,bytes.slice(3,40));const replacement=Type.from({length:22},(_,i)=>19+i);await bank.writeRows(4,2,replacement);expected.set(replacement,44);assert.deepEqual(await bank.readInto(new Type(77)),expected);await bank.dispose();assert.equal(budget.total(),0);
 }
});
test('Numeric bank cancellation and invalid scalar types never retain scratch memory',async()=>{
 const budget=new Budget(10000),bank=await createNumericBank(Float64Array,[13,7],{budget});await assert.rejects(bank.readRows(0,5,{signal:AbortSignal.abort()}),{code:'CANCELLED'});assert.equal(budget.active,0);await assert.rejects(bank.readInto(new Float32Array(2)),{code:'INVALID_INPUT'});await bank.dispose();assert.equal(budget.total(),0);
});
