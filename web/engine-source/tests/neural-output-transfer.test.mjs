import test from 'node:test';
import assert from 'node:assert/strict';
import {neuralOutputTransfer} from '../src/neural-output-transfer.js';
const tensor=(data,location='cpu')=>({data,location,dims:[data.length],type:'float32'});

test('independent ORT CPU output ownership moves without a second array allocation',()=>{
 const source=Float32Array.of(1,2,3),output=neuralOutputTransfer({result:tensor(source)},{},12);
 assert.equal(output.result.result.data,source);assert.equal(output.copiedOutputBytes,0);
 const moved=structuredClone(output.result,{transfer:output.transfers});assert.deepEqual([...moved.result.data],[1,2,3]);assert.equal(source.byteLength,0);
});

test('feed aliases, borrowed slices and pinned memory retain their copy boundary',()=>{
 const input=Float32Array.of(1,2,3,4),pinned=Float32Array.of(9),output=neuralOutputTransfer({alias:tensor(input),slice:tensor(input.subarray(1,3)),pinned:tensor(pinned,'cpu-pinned')},{x:tensor(input)},28);
 const moved=structuredClone(output.result,{transfer:output.transfers});
 assert.deepEqual([...moved.alias.data],[1,2,3,4]);assert.deepEqual([...moved.slice.data],[2,3]);assert.equal(output.copiedOutputBytes,28);
 assert.equal(input.byteLength,16);assert.equal(pinned.byteLength,4);
});

test('shared output storage is copied and duplicate owned buffers transfer once',()=>{
 const shared=new Float32Array(new SharedArrayBuffer(8));shared.set([3,5]);
 const owned=Float32Array.of(8),output=neuralOutputTransfer({shared:tensor(shared),a:tensor(owned),b:tensor(owned)},{},16);
 assert.equal(output.transfers.length,2);assert.equal(output.copiedOutputBytes,8);
 const moved=structuredClone(output.result,{transfer:output.transfers});assert.deepEqual([...moved.shared.data],[3,5]);assert.equal(shared.byteLength,8);
 assert.throws(()=>neuralOutputTransfer({result:tensor(Float32Array.of(1,2))},{},4),/admitted size/);
});
