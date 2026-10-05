import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pairedBiomes} from '../src/copy-biomes.js';
const reference=JSON.parse(await readFile(new URL('./m3-data/copy-biomes-reference.json',import.meta.url)));
for(const c of reference.cases)test('Native paired biomes: '+c.name,async()=>{
  let memory=0;const groups=await pairedBiomes(Float32Array.from(c.points.flat()),Float64Array.from(c.pairs.flat()),c.tolerance,{reserveMemory:n=>memory+=n,pairSearchRegions:c.zones?Int32Array.from(c.zones):null});
  assert.deepEqual(groups.map(x=>Array.from(x)),c.expected);assert.ok(memory>0);
});
test('paired biomes cancellation, invalid endpoints and admission',async()=>{
  const c=reference.cases[0],points=Float32Array.from(c.points.flat()),pairs=Float64Array.from(c.pairs.flat()),cancel=new AbortController();
  cancel.abort();await assert.rejects(pairedBiomes(points,pairs,25,{reserveMemory:()=>{},signal:cancel.signal}),{code:'CANCELLED'});
  await assert.rejects(pairedBiomes(points,pairs,25,{reserveMemory:()=>{throw Error('admission');}}),/admission/);
  pairs[0]=1000;await assert.rejects(pairedBiomes(points,pairs,25,{reserveMemory:()=>{}}),{code:'INVALID_INPUT'});
});
