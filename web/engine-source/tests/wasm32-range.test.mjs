import test from 'node:test';
import assert from 'node:assert/strict';
import {unsignedWasm32Pointer} from '../src/memory-range.js';

test('Wasm32 addresses preserve both signed ABI and unsigned JavaScript representations',()=>{
 assert.equal(unsignedWasm32Pointer(-2147483648,3*1024**3,32),2147483648);
 assert.equal(unsignedWasm32Pointer(2147483648,3*1024**3,32),2147483648);
 assert.equal(unsignedWasm32Pointer(-1,2**32,1),2**32-1);
 assert.equal(unsignedWasm32Pointer(-1,2**32,0),2**32-1);
 assert.equal(unsignedWasm32Pointer(0,0,0),0);
 assert.equal(unsignedWasm32Pointer(0,16,4,{allowZero:true}),0);
});

test('Wasm32 span validation never wraps the end offset',()=>{
 for(const [p,h,n,o] of [[null,16,1],[undefined,16,1],[1n,16,1],[Symbol('bad'),16,1],[NaN,16,1],[.5,16,1],[-2147483649,2**32,1],[2**32,2**32,0],[-1,2**32,2],[-1,3*1024**3,1],[0,16,1],[5,16,2,{alignment:2}],[8,16,9],[8,16,-1],[8,16.5,1]])assert.throws(()=>unsignedWasm32Pointer(p,h,n,o),{code:'INVALID_INPUT'});
});
