import test from 'node:test';
import assert from 'node:assert/strict';
import {elaSynthesisMedianByte,reduceElaSynthesisBlock} from '../src/ela-synthesis-median.js';
test('byte selection matches the exact odd median and truncates the central pair mean',()=>{
 let state=12345;for(const count of [1,2,3,4,7,99,100,255,256])for(let sample=0;sample<60;sample++){const values=Uint8Array.from({length:count},()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state>>>24;}),sorted=Array.from(values).sort((a,b)=>a-b),middle=count>>1,expected=count&1?sorted[middle]:Math.trunc((sorted[middle-1]+sorted[middle])/2);assert.equal(elaSynthesisMedianByte(values),expected);}
 assert.equal(elaSynthesisMedianByte(Uint8Array.of(0,255)),127);assert.equal(elaSynthesisMedianByte(new Uint8Array(99).fill(255)),255);
});
test('reduction ranks each RGB channel independently after the provided frame bytes',async()=>{
 const matrix=Uint8Array.of(1,200,99,5,20,100,3,70,200),out=new Uint8Array(3);await reduceElaSynthesisBlock(matrix,out,new Uint8Array(3));assert.deepEqual(out,Uint8Array.of(3,70,100));
 const stop=new AbortController();stop.abort();await assert.rejects(reduceElaSynthesisBlock(matrix,out,new Uint8Array(3),{signal:stop.signal}),{code:'CANCELLED'});
});
