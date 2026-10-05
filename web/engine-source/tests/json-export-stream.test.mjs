import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {resultJsonParts,streamResultJson} from '../src/json-export-stream.js';
const result=data=>({status:'ok',operation:'tampering.copyMove.brisk',provenance:{originalSha256:'a'.repeat(64)},data});
test('paged JSON preserves current numeric arrays, escapes, nulls and key order',async()=>{
 const r=result({values:new Float64Array([0,-0,NaN,Infinity,-Infinity,1e-20,1e20]),nested:[undefined,null,'é💡\ud800\n\"',{'1':true,skip:undefined}],empty:new Uint8Array()}),expected=JSON.stringify(r,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v);
 assert.equal([...resultJsonParts(r)].join(''),expected);const budget=new Budget(16*1024**2),file=await streamResultJson(r,{storage:'memory'},{budget});const bytes=new Uint8Array(file.byteLength);await file.store.readInto(bytes);assert.equal(new TextDecoder().decode(bytes),expected);await file.dispose();assert.equal(budget.active+budget.retained,0);
});
test('large integer fields write bounded chunks, cancellation and limits release',async()=>{
 const r=result({groups:Uint32Array.from({length:200000},(_,i)=>i)}),budget=new Budget(24*1024**2),file=await streamResultJson(r,{}, {budget});assert.ok(file.metrics.encodedWriteCalls>1);assert.equal(file.metrics.maxEncodedChunkBytes,262144);await file.dispose();
 await assert.rejects(streamResultJson(r,{maxBytes:100},{budget}),{code:'EXPORT_LIMIT'});assert.equal(budget.active+budget.retained,0);
 const signal=new AbortController();await assert.rejects(streamResultJson(r,{}, {budget,signal:signal.signal,onProgress:()=>signal.abort()}),{code:'CANCELLED'});assert.equal(budget.active+budget.retained,0);
});
