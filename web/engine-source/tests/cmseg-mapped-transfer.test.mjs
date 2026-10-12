import test from 'node:test';import assert from 'node:assert/strict';import {MessageChannel,markAsUntransferable} from 'node:worker_threads';
import {copyMappedCorrelationRows} from '../experiments/segmentation/cmseg-correlation-gpu.js';

test('a protected readback buffer is nontransferable, while the admitted exact tile copy transfers without detaching the source prematurely',()=>{
 const memory=new WebAssembly.Memory({initial:1}),view=new Float32Array(memory.buffer,0,16);view.set([0,-0,1,-1,Math.fround(.125),Math.fround(1e-30)]);const expected=view.slice(),channel=new MessageChannel();let releases=0;
 try{
  assert.throws(()=>channel.port1.postMessage(view,[view.buffer]),{name:'DataCloneError'});
  const transfer=copyMappedCorrelationRows({data:view,release(){releases++;assert.deepEqual(view,expected);}},16,64);
  assert.equal(releases,1);assert.deepEqual(transfer,expected);assert.notEqual(transfer.buffer,view.buffer);assert.equal(transfer.byteLength,64);channel.port1.postMessage(transfer,[transfer.buffer]);assert.equal(transfer.byteLength,0);assert.equal(view.byteLength,64);
 }finally{channel.port1.close();channel.port2.close();}
});

test('ordinary ArrayBuffer detachment at unmap occurs only after the bounded Float32 copy, preserving exact bits and signed zero',()=>{
 const data=Float32Array.of(1,-0,3,4),expected=new Uint8Array(data.buffer).slice();markAsUntransferable(data.buffer);let releases=0;
 const result=copyMappedCorrelationRows({data,release(){releases++;assert.equal(data.byteLength,16);}},4,16);assert.equal(releases,1);assert.deepEqual(new Uint8Array(result.buffer),expected);
 const mapped=Float32Array.of(1,-0,3,4),copied=copyMappedCorrelationRows({data:mapped,release(){structuredClone(mapped.buffer,{transfer:[mapped.buffer]});}},4,16);assert.equal(mapped.byteLength,0);assert.deepEqual(new Uint8Array(copied.buffer),expected);
});

test('the handoff refuses a tile exceeding its existing envelope and preserves that cause if mapped cleanup also fails',()=>{
 const data=new Float32Array(16);let released=0;assert.throws(()=>copyMappedCorrelationRows({data,release(){released++;throw Error('unmap cleanup failed');}},16,60),e=>e.code==='INVALID_INPUT'&&e.details.cleanupErrors[0].message==='unmap cleanup failed');assert.equal(released,1);
});

test('host tile allocation failure retains its primary cause and retires the readback exactly once',t=>{
 const cause=new RangeError('Array buffer allocation failed');let released=0;t.mock.method(Float32Array.prototype,'slice',()=>{throw cause;});assert.throws(()=>copyMappedCorrelationRows({data:new Float32Array(16),release(){released++;throw Error('cleanup failure');}},16,64),e=>e===cause&&e.details.cleanupErrors[0].message==='cleanup failure');assert.equal(released,1);
});
