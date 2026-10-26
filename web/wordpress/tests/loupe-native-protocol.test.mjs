import test from 'node:test';
import assert from 'node:assert/strict';
import {isRecord,positiveId,validRect,validRgb,validError,encodeError,decodeError} from '../sherloq-browser/assets/loupe-native-protocol.js';

test('native envelopes reject arrays and typed/container objects, preserving plain structured records',()=>{
 for(const value of [null,[],new Date(),new Map(),new Uint8Array(1)])assert.equal(isRecord(value),false);
 assert.equal(isRecord({}),true);assert.equal(isRecord(Object.create(null)),true);
 for(const value of [0,-1,NaN,Infinity,1.1,Number.MAX_SAFE_INTEGER+1])assert.equal(positiveId(value),false);
 assert.equal(positiveId(Number.MAX_SAFE_INTEGER),true);
});
test('native rectangles preserve inclusive source bounds and reject unsafe or out-of-source arithmetic',()=>{
 assert.equal(validRect({x:7,y:5,width:3,height:2},10,7),true);
 for(const rect of [{x:-1,y:0,width:1,height:1},{x:0,y:.5,width:1,height:1},{x:0,y:0,width:0,height:1},{x:10,y:0,width:1,height:1},{x:Number.MAX_SAFE_INTEGER,y:0,width:1,height:1}])assert.equal(validRect(rect,10,7),false);
});
test('RGB wire values require exact byte type, dimensions, format and length',()=>{
 const pixels={format:'rgb8',width:2,height:1,data:Uint8Array.of(1,2,3,4,5,6)};
 assert.equal(validRgb(pixels,{width:2,height:1}),true);
 for(const patch of [{format:'rgba8'},{data:[1,2,3,4,5,6]},{data:new Uint8ClampedArray(6)},{width:1},{height:2},{data:new Uint8Array(5)}])assert.equal(validRgb({...pixels,...patch},{width:2,height:1}),false);
});
test('received cyclic or malformed causes reject before recursive conversion can orphan a request',()=>{
 const cyclic={code:'CYCLE',message:'cycle'};cyclic.cause=cyclic;
 assert.equal(validError(structuredClone(cyclic)),false);
 for(const value of [cyclic,{code:'X'},{message:'outer',cause:'unencoded'},[],null])assert.throws(()=>decodeError(value),{code:'WORKER_MESSAGE_FAILED'});
});
test('encoded cyclic and very deep causes are finite and remain decodable',()=>{
 const cyclic=Error('outer');cyclic.cause=cyclic;const encoded=encodeError(cyclic);assert.equal(validError(encoded),true);assert.match(decodeError(encoded).cause.message,/Circular/);
 let deep=Error('root');for(let i=0;i<100;i++)deep=Error('level'+i,{cause:deep});const wire=encodeError(deep);assert.equal(validError(wire),true);assert.doesNotThrow(()=>decodeError(wire));assert.ok(JSON.stringify(wire).length<50000);
});
test('valid nested failures preserve diagnostic code, details and cause; primitive throws encode safely',()=>{
 const cause=Object.assign(Error('storage'),{code:'STORAGE',details:{backend:'temporary'}}),error=Object.assign(Error('release',{cause}),{code:'CLEANUP',details:{phase:'release'}}),restored=decodeError(structuredClone(encodeError(error)));
 assert.equal(restored.code,'CLEANUP');assert.equal(restored.details.phase,'release');assert.equal(restored.cause.code,'STORAGE');assert.deepEqual(restored.cause.details,{backend:'temporary'});
 for(const value of [7,null,undefined,Object.create(null)])assert.equal(validError(encodeError(value)),true);
});
