import test from 'node:test';import assert from 'node:assert/strict';
import {DenseWriteBatch,commitDenseWriteBatch} from '../src/dense-write-batch.js';
test('uncommitted overlapping field writes remain private and later values win across page seams',async()=>{
 const underlying=new Uint8Array(9000),batch=new DenseWriteBatch(128);batch.begin(new ArrayBuffer(128));batch.write(3,new Uint8Array(20).fill(7),4090);batch.write(3,new Uint8Array(10).fill(9),4098);assert.equal(underlying.some(Boolean),false);
 const read=new Uint8Array(32);batch.overlay(3,read,4088);assert.deepEqual([...read.slice(2,10)],Array(8).fill(7));assert.deepEqual([...read.slice(10,20)],Array(10).fill(9));
 const stores=[];stores[3]={byteLength:underlying.length,write(bytes,at){underlying.set(bytes,at);}};await commitDenseWriteBatch(batch.publication(),stores);assert.deepEqual(underlying.slice(4088,4120),read);
});
test('a partial publication retries idempotently without repeating useful compute',async()=>{
 const out=new Uint8Array(64),batch=new DenseWriteBatch(128);batch.begin(new ArrayBuffer(128));batch.write(3,Uint8Array.of(4,5),0);batch.write(3,Uint8Array.of(7,8),2);let writes=0;
 const stores=[];stores[3]={byteLength:64,write(bytes,at){if(++writes===2)throw Error('temporary storage interruption');out.set(bytes,at);}};
 await assert.rejects(commitDenseWriteBatch(batch.publication(),stores));await commitDenseWriteBatch(batch.publication(),stores);assert.deepEqual([...out.slice(0,4)],[4,5,7,8]);
});
test('invalid publication cannot apply an earlier otherwise-valid record',async()=>{
 const batch=new DenseWriteBatch(64);batch.begin(new ArrayBuffer(64));batch.write(3,Uint8Array.of(1),0);batch.write(3,Uint8Array.of(1),100);const out=new Uint8Array(4),stores=[];stores[3]={byteLength:4,write(bytes,at){out.set(bytes,at);}};
 await assert.rejects(commitDenseWriteBatch(batch.publication(),stores));assert.deepEqual([...out],[0,0,0,0]);
});
