import test from 'node:test';
import assert from 'node:assert/strict';
import {ritaSessionCachePlan} from '../src/rita-cache-plan.js';
const MiB=1024**2,manifest={assets:{one:{bytes:222404116,sha256:'a'.repeat(64)}}};
test('a complete model cycle fits small native work without changing CPU/GPU work',()=>{
 for(const [backend,expected]of [['cpu',432],['webgpu',640]]){const p=ritaSessionCachePlan(manifest,{width:416,height:320,budgetBytes:2048*MiB,backend,gpuAvailable:true});assert.equal(p.modelCacheBytes,expected*MiB);assert.equal(p.policy,'complete-graph-cycle');}
});
test('feature banks take priority over an incomplete cyclic cache on constrained RAM',()=>{
 for(const backend of ['cpu','webgpu']){const p=ritaSessionCachePlan(manifest,{width:2000,height:2000,budgetBytes:2048*MiB,backend,gpuAvailable:true});assert.equal(p.modelCacheBytes,0);assert.equal(p.policy,'feature-banks-first');assert(p.completeCacheBytes>p.availableCacheBytes);}
});
test('native54MP keeps its complete GPU cache when the shared budget can fund both',()=>{const p=ritaSessionCachePlan(manifest,{width:9000,height:6000,budgetBytes:24*1024*MiB,backend:'auto',gpuAvailable:true});assert.equal(p.modelCacheBytes,640*MiB);assert(p.modelCacheBytes*2+p.workingSetEstimateBytes<=24*1024*MiB);});
test('graph identities are deduplicated and small RAM never reserves an unusable partial cycle',()=>{const twice={assets:{...manifest.assets,two:manifest.assets.one}},p=ritaSessionCachePlan(twice,{width:35,height:34,budgetBytes:256*MiB,backend:'cpu'});assert.equal(p.completeCacheBytes,432*MiB);assert.equal(p.modelCacheBytes,0);assert.equal(p.workingSetEstimateBytes,512*MiB+64*64*195);});
test('invalid cache geometry and assets are rejected before model admission',()=>{for(const width of [0,-1,NaN,1.5])assert.throws(()=>ritaSessionCachePlan(manifest,{width,height:32,budgetBytes:MiB}));assert.throws(()=>ritaSessionCachePlan({assets:{a:{bytes:-1,sha256:'x'}}},{width:32,height:32,budgetBytes:MiB}));});
