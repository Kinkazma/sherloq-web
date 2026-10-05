import test from 'node:test';
import assert from 'node:assert/strict';
import {siftReplyWithInput} from '../src/sift-input-transport.js';

test('SIFT returns the same input backing on useful success and serialized failure',()=>{
 for(const error of [false,true]){
  const input=Float32Array.of(1,2,3,4),original=input.buffer,job=structuredClone({input,reusableInput:{id:7,capacityBytes:16}},{transfer:[original]});assert.equal(original.byteLength,0);
  const output=Float32Array.of(9,8),result=error?{error:{code:'MEMORY_ALLOCATION',message:'allocation refused'}}:{points:output},packet=siftReplyWithInput(job,result),reply=structuredClone(packet.message,{transfer:packet.transfer});
  assert.equal(job.input.buffer.byteLength,0);assert.equal(reply.returnedInput.id,7);assert.deepEqual([...new Float32Array(reply.returnedInput.buffer)],[1,2,3,4]);
  if(error)assert.equal(reply.error.code,'MEMORY_ALLOCATION');else{assert.equal(output.byteLength,0);assert.deepEqual([...reply.points],[9,8]);assert.notEqual(reply.points.buffer,reply.returnedInput.buffer);}
 }
});
test('SIFT keeps ordinary inputs compatible and rejects a changed returned extent',()=>{
 const result={points:Float32Array.of(3)};assert.equal(siftReplyWithInput({input:new Uint8Array(8)},result).message,result);
 assert.throws(()=>siftReplyWithInput({input:new Uint8Array(8),reusableInput:{id:1,capacityBytes:9}},result),{code:'INVALID_INPUT'});
});
