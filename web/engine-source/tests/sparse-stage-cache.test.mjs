import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {sparseStageCache} from '../src/sparse-stage-cache.js';
import {SparseCopyEngine} from '../src/sparse-copy.js';
const byteLength=value=>value.byteLength;

test('computed stage keeps exactly its existing reservation, then becomes cache without a copied buffer',async()=>{
 const budget=new Budget(100),hits={},session=sparseStageCache(budget,'s/',{byteLength,hits});let release,computed=0;
 const result=await session.memo('features/a',()=>{computed++;release=budget.reserve(80);return new Uint8Array(80).fill(37);});
 assert.equal(await session.memo('features/a',()=>assert.fail('Repeated useful computation')),result);assert.equal(computed,1);assert.equal(budget.active,80);assert.equal(budget.cacheBytes,0);assert.equal(hits.features,false);
 release();session.finish();session.finish();assert.equal(budget.active,0);assert.equal(budget.cacheBytes,80);assert.equal(budget.get('s/features/a').value,result);assert.equal(budget.peak,80);budget.clear();assert.equal(budget.total(),0);
});

test('cache hits are pinned once while in use and eviction cannot unaccount borrowed values',async()=>{
 const budget=new Budget(100),value=new Uint8Array(80).fill(53);budget.put('s/features/a',{value,byteLength:80});const session=sparseStageCache(budget,'s/',{byteLength});
 assert.equal(await session.memo('features/a',()=>assert.fail('Cache hit')),value);assert.equal(budget.active,80);assert.equal(budget.cacheBytes,0);assert.throws(()=>budget.reserve(30),{code:'MEMORY_LIMIT'});assert.equal(value[0],53);assert.equal(budget.active,80);
 session.finish();assert.equal(budget.active,0);assert.equal(budget.cacheBytes,80);const pressure=budget.reserve(100);assert.equal(budget.cacheBytes,0);pressure();assert.equal(budget.total(),0);
});

test('cancellation keeps only completed admitted stages, disposal drops all cache references',async()=>{
 const budget=new Budget(128),cancel=new AbortController(),session=sparseStageCache(budget,'s/',{byteLength,signal:cancel.signal}),releases=[];
 await session.memo('features/a',()=>{releases.push(budget.reserve(32));return new Uint8Array(32);});
 await assert.rejects(session.memo('matches/a',()=>{releases.push(budget.reserve(64));cancel.abort();return new Uint8Array(64);}),{code:'CANCELLED'});
 releases.forEach(f=>f());session.finish();assert.equal(budget.active,0);assert.equal(budget.cacheBytes,32);assert.equal(budget.get('s/matches/a'),undefined);
 const next=sparseStageCache(budget,'s/',{byteLength});await next.memo('features/a',()=>assert.fail('Completed stage retained'));next.finish({publish:false});assert.equal(budget.total(),0);
});

test('real sparse grouping/matching preserves results across cache borrow, eviction and caller mutation',async t=>{
 const budget=new Budget(128*1024**2),engine=new SparseCopyEngine({width:64,height:64,format:'rgb8',data:new Uint8Array(64*64*3)},budget,{maxWorkers:1});let extractions=0;
 t.mock.method(engine.features,'extract',async()=>{extractions++;const free=budget.reserve(512),points=new Float64Array([1,1,1,0,1,0,0,31,31,1,0,1,0,0,51,10,1,0,1,0,0]),descriptors=new Uint8Array(96),members=new Uint8Array(3).fill(1);return {points,descriptors,members,zoneCount:1,descriptorSize:32,totalFeatures:3,metadata:{provider:'cpu'},release:free};});
 const params={algorithm:'ORB',model:'None',limit:100,radius:100,minimum:5,threshold:.7,tolerance:50};let a,b,c;
 try{a=await engine.analyze(params);const expectedPoints=a.points.slice(),expectedPairs=a.pairs.slice();assert.ok(expectedPairs.length>0);a.points.fill(-1);a.release();a=null;b=await engine.analyze(params);assert.deepEqual(b.points,expectedPoints);assert.deepEqual(b.pairs,expectedPairs);assert.equal(extractions,1);assert.equal(b.metadata.stageCache.features,true);b.release();b=null;assert.equal(budget.active,0);const cancelled=new AbortController();await assert.rejects(engine.analyze(params,{signal:cancelled.signal,onProgress:e=>{if(e.phase==='grouping')cancelled.abort();}}),{code:'CANCELLED'});assert.equal(budget.active,0);assert.equal(engine.running,false);const pressure=budget.reserve(budget.limit);pressure();c=await engine.analyze(params);assert.equal(extractions,2);assert.deepEqual(c.points,expectedPoints);assert.deepEqual(c.pairs,expectedPairs);c.release();c=null;}finally{a?.release();b?.release();c?.release();engine.dispose();}assert.equal(budget.total(),0);
});

test('stage cache moves backing ownership through pinning and retires only on real eviction',async()=>{
 const budget=new Budget(1000),value={features:new Float32Array(20)},bytes=value.features.byteLength;let retired=0;
 const backing=budget.registerBacking('array-buffer',bytes,{owner:'sift',label:'features'}),cache=sparseStageCache(budget,'owned/',{byteLength:()=>bytes});const active=budget.reserve(bytes);
 const result=await cache.memo('features/a',async()=>cache.adopt(value,()=>{retired++;backing();budget.notifyBackingRelease('array-buffer',bytes);}));assert.equal(result,value);active();cache.finish();assert.equal(retired,0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,bytes);
 const next=sparseStageCache(budget,'owned/',{byteLength:()=>bytes});assert.equal(await next.memo('features/a',()=>assert.fail('Recomputation')),value);assert.equal(retired,0);next.finish();assert.equal(retired,0);budget.clearPrefix('owned/');assert.equal(retired,1);assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);
});
