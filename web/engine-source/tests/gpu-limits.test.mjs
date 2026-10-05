import test from 'node:test';import assert from 'node:assert/strict';
import {requestStorageDevice} from '../src/gpu-limits.js';
const MiB=1024**2;
test('storage limits negotiate supported useful capacity without allocating workload buffers',async()=>{
 const requests=[],adapter={limits:{maxStorageBufferBindingSize:512*MiB,maxBufferSize:1024*MiB},async requestDevice(value){requests.push(value);return {limits:value.requiredLimits};}};
 await requestStorageDevice(adapter,{desiredBytes:256*MiB,minimumBytes:192*MiB});assert.deepEqual(requests.pop().requiredLimits,{maxStorageBufferBindingSize:256*MiB,maxBufferSize:256*MiB});
 await requestStorageDevice(adapter);assert.deepEqual(requests.pop().requiredLimits,adapter.limits);
 await requestStorageDevice(adapter,{desiredBytes:0});assert.equal(requests.pop().requiredLimits.maxBufferSize,256,'Uniforms must fit even for empty descriptors');
 await assert.rejects(requestStorageDevice(adapter,{minimumBytes:513*MiB}),error=>error.code==='GPU_LIMIT'&&error.details.maxStorageBufferBindingSize===512*MiB);assert.equal(requests.length,0);
});
