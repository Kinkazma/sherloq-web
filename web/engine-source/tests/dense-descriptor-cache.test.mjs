import test from 'node:test';
import assert from 'node:assert/strict';
import {createDenseDescriptorCache,denseDescriptorCacheByteBound,selectDenseDescriptorCacheJobs} from '../src/dense-descriptor-cache.js';
import {canonicalDenseSift} from '../src/dense-math.js';
import {alignDenseSupports} from '../src/dense-links.js';
const features=(width,height,reflect=false)=>{const a=Float32Array.from({length:width*height*128},(_,i)=>Math.fround(((i*97+43)%127)/127)),b=reflect?a.slice().reverse():a;return {width,height,dimensions:128,shift:6,first:a,second:b};};

test('private source publication reuses packed banks once and retires an old key before new features',()=>{
 const c=createDenseDescriptorCache(),v=features(11,9);assert.equal(c.lookup('crop0'),undefined);const p=c.publish('crop0',v);
 assert.equal(c.lookup('crop0'),p);assert.equal(c.snapshot.retainedBytes,v.first.byteLength);assert.equal(c.snapshot.reusedBytes,v.first.byteLength);
 assert.equal(c.lookup('crop1'),undefined);assert.equal(c.snapshot.retainedBytes,0);assert.equal(c.snapshot.evictions,1);c.clear();assert.equal(c.snapshot.evictions,1);
});
for(const reflection of [false,true])test('quarter-turn copies preserve every private raw source bit and alias for reflection='+reflection,()=>{
 const c=createDenseDescriptorCache(),v=features(11,9,reflection),before=[v.first.slice(),v.second.slice()];c.publish('source',v);
 const first=c.writable(v.first),second=v.first===v.second?first:c.writable(v.second);
 assert.equal(first===second,!reflection);canonicalDenseSift(first);if(second!==first)canonicalDenseSift(second);
 assert.deepEqual(v.first,before[0]);assert.deepEqual(v.second,before[1]);assert.deepEqual(c.lookup('source').first,before[0]);
 assert.equal(c.snapshot.cloneBytes,v.first.byteLength*(reflection?2:1));c.clear();assert.equal(c.snapshot.retainedBytes,0);
});
test('fresh aligned cropped arrays can be canonicalized without another copy or corrupting the full source bank',()=>{
 const c=createDenseDescriptorCache(),source=features(19,17),target=features(13,11),before=source.first.slice();c.publish('source',source);
 const aligned=alignDenseSupports(source,target,4,6);assert.notEqual(aligned.first.buffer,source.first.buffer);assert.equal(c.writable(aligned.first),aligned.first);
 canonicalDenseSift(aligned.first);assert.deepEqual(source.first,before);assert.equal(c.snapshot.cloneBytes,0);
});
test('aliases of a private bank, including subviews, require their own writable copy',()=>{
 const c=createDenseDescriptorCache(),v=features(11,9);c.publish('source',v);const alias=v.first.subarray(128,256),copy=c.writable(alias);
 assert.notEqual(copy.buffer,alias.buffer);assert.deepEqual(copy,alias);copy.fill(-7);assert.notEqual(alias[0],-7);
});
test('oversized/shared/non-Float32 publications cannot create an unaccounted private backing',()=>{
 const c=createDenseDescriptorCache();for(const first of [new Float32Array(new ArrayBuffer(1024),0,128),new Uint8Array(512),new Float32Array(new SharedArrayBuffer(512))])assert.throws(()=>c.publish('bad',{first,second:first}),{code:'INVALID_INPUT'});
 assert.equal(c.snapshot.retainedBytes,0);
});
test('cache bound is the exact already-planned primary feature extent and inactive modes retain zero',()=>{
 const job={descriptorCache:true,sourceImage:{},width:96,height:80,pass:{method:1,patch:4,targetPatch:6,reflection:true}};
 assert.equal(denseDescriptorCacheByteBound(job),84*68*128*4);
 assert.equal(denseDescriptorCacheByteBound({...job,pass:{...job.pass,targetPatch:4}}),2*84*68*128*4);
 for(const value of [{descriptorCache:false},{compactDescriptors:true},{field:{}}])assert.equal(denseDescriptorCacheByteBound({...job,...value}),0);
});

test('automatic source reuse joins paired hypotheses but keeps crops and source identities separate',()=>{
 const sourceImage={},job={sourceImage,crop:{x:0,y:0},width:96,height:80,pass:{method:1,patch:4,targetPatch:4,reflection:false}};
 const paired={...job,pass:{...job.pass,targetPatch:6,quarterTurn:true}};
 const differentCrop={...job,crop:{x:1,y:0}},differentSource={...job,sourceImage:{}};
 const result=selectDenseDescriptorCacheJobs([job,paired,differentCrop,differentSource]);
 assert.deepEqual(result.map(j=>j.descriptorCache),[true,true,false,false]);
 assert.equal(job.descriptorCache,undefined);assert.equal(paired.descriptorCache,undefined);
});
test('automatic reuse distinguishes reflected primary banks and skips compact or cached fields',()=>{
 const job={sourceImage:{},crop:{x:0,y:0},width:96,height:80,pass:{method:1,patch:4,targetPatch:4,reflection:true}};
 const unequal={...job,pass:{...job.pass,targetPatch:6}},otherUnequal={...unequal,pass:{...unequal.pass,targetPatch:8}};
 const result=selectDenseDescriptorCacheJobs([job,unequal,otherUnequal,{...job,compactDescriptors:true},{...job,field:{}}]);
 assert.deepEqual(result.map(j=>j.descriptorCache),[false,true,true,false,false]);
});
test('explicit cache overrides are respected and disabled jobs do not enable a singleton',()=>{
 const job={sourceImage:{},crop:{x:0,y:0},width:96,height:80,pass:{method:0,patch:4,targetPatch:4,reflection:false}};
 assert.deepEqual(selectDenseDescriptorCacheJobs([job,{...job,descriptorCache:false}]).map(j=>j.descriptorCache),[false,false]);
 assert.deepEqual(selectDenseDescriptorCacheJobs([{...job,descriptorCache:true}]).map(j=>j.descriptorCache),[true]);
 assert.deepEqual(selectDenseDescriptorCacheJobs([{...job,gray:new Float32Array(1),sourceImage:undefined},job]).map(j=>j.descriptorCache),[false,false]);
});
