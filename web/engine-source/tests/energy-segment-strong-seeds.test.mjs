import test from 'node:test';
import assert from 'node:assert/strict';
import {segmentEnergy} from '../src/energy-segment.js';
function base(width,height,block=1){const n=width*height;return{width,height,metadata:{block},energy_scope:new Int32Array(n).fill(7),energy_low_score:new Float32Array(n),energy_high_score:new Float32Array(n),energy_summary:[{id:7,bbox:[0,0,width,height]}]};}
test('strong seeds recover entire weak components, retain disconnected aggregate order, and discard unseeded components',async()=>{
 const b=base(12,5),s=b.energy_low_score;for(const[x,y,value]of[[0,0,3],[1,0,3],[2,0,3],[3,0,6],[8,0,6],[8,1,3],[1,4,3],[2,4,3]])s[y*12+x]=value;
 const original=s.slice(),result=await segmentEnergy(b,{threshold:6,minimum:0,offset:12}),expected=new Int32Array(60);for(const i of[0,1,2,3,8,20])expected[i]=13;
 assert.deepEqual(result.labels,expected);assert.equal(result.regions.length,1);assert.deepEqual(result.regions[0],{id:13,kind:'low',energy_region:7,components:2,cells:6,pixels:6,bbox:[0,0,9,2],score:3,strong_pixels:2,dominant_descriptor:'energy_low',sources:['Low ELA energy']});assert.deepEqual(s,original);
});
test('global strong support below a physical block skips all weak components but preserves progress and later panel validation',async()=>{
 const b=base(17,9,2);b.energy_low_score.fill(3);b.energy_low_score[15]=6;b.energy_low_score[120]=6;b.energy_low_score[121]=6;let queueWrites=0;const progress=[],result=await segmentEnergy(b,{threshold:6,minimum:0},{onProgress:p=>progress.push(p),allocate:(Type,length,name)=>name==='queue'?new Proxy(new Type(length),{set(array,key,value){queueWrites++;array[key]=value;return true;},get:(array,key)=>Reflect.get(array,key,array)}):new Type(length)});
 assert.deepEqual(result.regions,[]);assert(result.labels.every(x=>x===0));assert.equal(queueWrites,0,'global insufficient strong support never traverses the weak graph');assert.deepEqual(progress,[.5,1]);b.energy_summary.push({id:8,bbox:[0,0,0,1]});await assert.rejects(segmentEnergy(b,{threshold:6,minimum:0}),{code:'INVALID_INPUT'});
});
test('positive underflow thresholds keep zero strong; exact zero excludes zero, including -0',async()=>{
 const b=base(3,2);b.energy_low_score[1]=-0;
 const positive=await segmentEnergy(b,{thresholds:[Number.MIN_VALUE,0],minimum:0}),zero=await segmentEnergy(b,{thresholds:[0,0],minimum:0});assert.deepEqual([...positive.labels],[1,1,1,1,1,1]);assert.equal(positive.regions[0].strong_pixels,6);assert.equal(positive.regions[0].components,1);assert.equal(zero.regions.length,0);assert(zero.labels.every(x=>x===0));
});
test('fractional preview support keeps ceil(strongSamples), allowed holes, and independent overlapping panel identities',async()=>{
 const b=base(9,5,3);b.energy_scope.fill(17,0,18);b.energy_scope.fill(29,18);b.energy_low_score.fill(2);b.energy_low_score[0]=5;b.energy_low_score[1]=5;b.energy_low_score[18]=5;b.energy_low_score[19]=5;b.energy_low_score[20]=5;b.energy_summary=[{id:17,bbox:[0,0,9,5]},{id:29,bbox:[0,0,9,5]}];b.energy_allowed=new Uint8Array(45).fill(1);
 let result=await segmentEnergy(b,{threshold:4,minimum:0,offset:5},{draftSpatialScale:2});assert.equal(result.regions.length,1);assert.equal(result.regions[0].energy_region,29);assert.equal(result.regions[0].id,6);assert.equal(result.regions[0].strong_pixels,3);assert(result.labels.subarray(0,18).every(x=>x===0));b.energy_allowed[20]=0;
 result=await segmentEnergy(b,{threshold:4,minimum:0},{draftSpatialScale:2});assert.equal(result.regions.length,0);
});
test('accepted even medians retain Float32 overflow and input validation is never bypassed by a zero-strong skip',async()=>{
 const b=base(2,1);b.energy_low_score.fill(Math.fround(3e38));const result=await segmentEnergy(b,{threshold:1,minimum:0});assert.equal(result.regions[0].score,Infinity);b.energy_low_score.fill(0);b.energy_high_score[1]=NaN;await assert.rejects(segmentEnergy(b,{threshold:1,minimum:0}),{code:'INVALID_INPUT'});
});
test('progress cancellation and consumer failures retain original contracts when a class has no possible strong component',async()=>{
 const b=base(8,8),controller=new AbortController();await assert.rejects(segmentEnergy(b,{threshold:1},{signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});const primary=Object.freeze(Error('consumer'));await assert.rejects(segmentEnergy(b,{threshold:1},{onProgress:()=>{throw primary;}}),e=>e===primary);const pre=new AbortController();pre.abort();let allocations=0;await assert.rejects(segmentEnergy(b,{}, {signal:pre.signal,allocate:()=>allocations++}),{code:'CANCELLED'});assert.equal(allocations,0);
});
