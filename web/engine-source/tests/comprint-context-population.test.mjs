import test from 'node:test';
import assert from 'node:assert/strict';
import {comprintContextPopulation,comprintContextFingerprintMoments,estimateComprintContextStatisticsPlan} from '../../extensions-source/comprint-context-population.js';
import {comprintFingerprintMoments,comprintFeatureWindow,estimateComprintStatisticsPlan} from '../../extensions-source/comprint-streaming-statistics.js';

function context(width,height,offset=0){const fingerprint=Float32Array.from({length:width*height},(_,i)=>Math.fround(Math.sin((i+offset)*.17)*3+((i+offset)%19)*.013));return{width,height,fingerprint,luminance:new Float32Array(width*height)};}
test('canonical native contexts keep separate SPAM grids and no synthetic joining cells',()=>{
 const contexts=[context(160,144),context(208,192)],plan=comprintContextPopulation(contexts);
 assert.deepEqual(plan.grids.map(g=>[g.rows,g.columns,g.start]),[[6,8,0],[12,14,48]]);
 assert.equal(plan.cells,48+168);assert.equal(plan.pixels,160*144+208*192);
 for(const g of plan.grids)for(let y=0;y<g.rows;y+=8)for(let x=0;x<g.columns;x+=256){const r=comprintFeatureWindow(g.width,g.height,y,x,Math.min(8,g.rows-y),Math.min(256,g.columns-x));assert(r.x>=0&&r.y>=0&&r.x+r.width<=g.width&&r.y+r.height<=g.height);}
});
test('global float32 moments equal the existing native concatenation exactly across8192 and128 boundaries',async()=>{
 const cases=[[1,7,8,127,128,8191,8192,8193],[160*144,208*192],[8193,7,16377],[128*128]];
 for(const lengths of cases){let index=0;const contexts=lengths.map(n=>{const c=context(n,1,index);index+=n;return c;}),data=new Float32Array(index);let at=0;for(const c of contexts){data.set(c.fingerprint,at);at+=c.fingerprint.length;}const native=comprintFingerprintMoments(data),actual=await comprintContextFingerprintMoments(contexts);assert.equal(actual.mean,native.mean);assert.equal(actual.variance,native.variance);assert.equal(actual.pixels,data.length);}
});
test('context moments are genuinely global rather than a mean of independently normalized populations',async()=>{
 const a=context(160,144),b=context(208,192);for(let i=0;i<b.fingerprint.length;i++)b.fingerprint[i]=Math.fround(b.fingerprint[i]*7+40);
 const combined=await comprintContextFingerprintMoments([a,b]),first=comprintFingerprintMoments(a.fingerprint),second=comprintFingerprintMoments(b.fingerprint);assert.notEqual(combined.variance,(first.variance+second.variance)/2);assert(combined.mean>first.mean&&combined.mean<second.mean);
});
test('small native contexts carry no invented SPAM cells but remain explicit in the observation population',()=>{
 const p=comprintContextPopulation([context(99,160),context(100,100),context(1,1)]);assert.deepEqual(p.grids.map(g=>[g.evaluable,g.cells]),[[false,0],[true,1],[false,0]]);assert.equal(p.cells,1);assert.equal(p.pixels,99*160+100*100+1);
});
test('malformed geometry and non-FP32 planes reject before statistical stages',async()=>{
 for(const value of[[],[{...context(10,10),width:1.5}],[{...context(10,10),fingerprint:new Float64Array(100)}],[{...context(10,10),luminance:new Float32Array(99)}]])assert.throws(()=>comprintContextPopulation(value),{code:'INVALID_INPUT'});
 await assert.rejects(comprintContextFingerprintMoments([{...context(4,4),fingerprint:new Float32Array(16)}]),{code:'INVALID_INPUT'});
});
test('cancelled global reduction never returns late moments',async()=>{
 const c=new AbortController();c.abort();await assert.rejects(comprintContextFingerprintMoments([context(512,512)],{signal:c.signal}),{code:'CANCELLED'});
});
test('native population resource plan preserves native heap/observations policy and does not size a nonexistent gap grid',()=>{
 const ordinary=estimateComprintStatisticsPlan(160,144,{maxWorkers:6}),single=estimateComprintContextStatisticsPlan([{width:160,height:144}],{maxWorkers:6});assert.equal(single.trainingWorstBytes,ordinary.trainingWorstBytes);assert.equal(single.fitHeapBytes,ordinary.fitHeapBytes);assert.equal(single.callerLuminanceFingerprintBytes,ordinary.callerLuminanceFingerprintBytes);assert.equal(single.minimumBytes,ordinary.minimumBytes+256);assert.equal(single.variants.length,6);
 const multiple=estimateComprintContextStatisticsPlan([{width:160,height:144},{width:208,height:192}],{maxWorkers:6,availableBytes:1});assert.equal(multiple.population.cells,216);assert.equal(multiple.trainingWorstBytes,216*32*8);assert.equal(multiple.selected,null);assert.equal(multiple.callerLuminanceFingerprintBytes,(160*144+208*192)*8);
});
