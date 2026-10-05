import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cloningMatches,cloningSelect} from '../src/cloning-math.js';
const reference=JSON.parse(await readFile(new URL('../fixtures/cloning-descriptors.json',import.meta.url)));

test('ORB32 and AKAZE61 Hamming include the final byte and preserve native tie order across batches',async()=>{
  for(const item of reference.cases){
    const progress=[],actual=await cloningMatches(Uint8Array.from(item.descriptors),item.radius,{descriptorSize:item.stride,onProgress:f=>progress.push(f)});
    assert.deepEqual(Array.from(actual),item.matches,`${item.stride}/${item.kind}/${item.radius}`);
    assert.equal(progress.at(-1),1);
  }
});

test('AKAZE selection keeps all 61 descriptor bytes and refuses mismatched strides',async()=>{
  const points=new Float64Array(3*7),descriptors=Uint8Array.from({length:3*61},(_,i)=>i%256);
  for(let i=0;i<3;i++)points[i*7+4]=i;
  const selected=await cloningSelect({points,descriptors,descriptorSize:61},50);
  assert.equal(selected.descriptorSize,61);
  assert.deepEqual(selected.points,points.slice(7));
  assert.deepEqual(selected.descriptors,descriptors.slice(61));
  await assert.rejects(cloningSelect({points,descriptors,descriptorSize:32},50),{code:'INVALID_INPUT'});
  await assert.rejects(cloningMatches(descriptors,1,{descriptorSize:60}),{code:'INVALID_INPUT'});
});
