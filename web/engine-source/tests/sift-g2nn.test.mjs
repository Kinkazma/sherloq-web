import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {siftG2nnMatch,remapReflectedSiftPoints} from '../src/sift-g2nn.js';
const reference=JSON.parse(await readFile(new URL('./m3-data/g2nn-reference.json',import.meta.url)));
function input(c){return {...c.options,points:Float32Array.from(c.points.flat()),descriptors:Float32Array.from(c.descriptors.flat()),members:Uint8Array.from(c.members.flat()),zoneCount:c.members[0]?.length??1,variants:c.options.variants?Uint8Array.from(c.options.variants):null,axes:c.options.axes?.map(a=>Float32Array.from(a))??null};}
for(const c of reference.cases)test('G2NN native oracle: '+c.name,async()=>{
  let admitted=0;const progress=[];
  const result=await siftG2nnMatch(input(c),{reserveMemory:n=>{admitted+=n;},onProgress:x=>progress.push(x)});
  let first=true;const bounded=await siftG2nnMatch(input(c),{reserveMemory:()=>{if(first){first=false;const e=new Error('force bounded staging');e.code='MEMORY_LIMIT';throw e;}}});
  assert.deepEqual(Array.from(bounded.pairs),c.expected.flat());assert.deepEqual(Array.from(bounded.pairSearchRegions),c.owners);assert.equal(bounded.candidateComparisons,c.evaluated);
  assert.deepEqual(Array.from(result.pairs),c.expected.flat());
  assert.deepEqual(Array.from(result.pairSearchRegions),c.owners);
  assert.equal(result.candidateComparisons,c.evaluated);
  assert.ok(admitted>0);assert.equal(result.preflightExecutions,0);
  assert.ok(progress.every((x,i)=>x>=0&&x<=1&&(!i||x>=progress[i-1])));assert.equal(progress.at(-1),1);
});
test('G2NN cancellation, shared admission, invalid representation and pair budget',async()=>{
  const request=input(reference.cases[0]);
  await assert.rejects(siftG2nnMatch(request),{code:'INVALID_INPUT'});
  await assert.rejects(siftG2nnMatch(request,{reserveMemory:()=>{throw new Error('admission');}}),/admission/);
  await assert.rejects(siftG2nnMatch({...request,descriptors:request.descriptors.map(x=>x+.1)},{reserveMemory:()=>{}}),{code:'INVALID_INPUT'});
  const cancel=new AbortController();
  await assert.rejects(siftG2nnMatch(request,{reserveMemory:()=>{},signal:cancel.signal,onProgress:()=>cancel.abort()}),{code:'CANCELLED'});
  await assert.rejects(siftG2nnMatch(request,{reserveMemory:()=>{},maxPairs:0}),{code:'MEMORY_LIMIT'});
  assert.ok((await siftG2nnMatch(request,{reserveMemory:()=>{}})).pairs.length>0);
});
test('reflection remaps real extracted points without mutating their frame',()=>{
  const p=Float32Array.of(3,5,2,270,.2,1,0,9,4,3,20,.3,2,0),result=remapReflectedSiftPoints(p,11);
  assert.equal(result[0],7);assert.equal(result[3],270);assert.equal(result[7],1);assert.equal(result[10],160);assert.equal(p[0],3);
});
