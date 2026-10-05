import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {cloningGeometry} from '../src/cloning-post.js';import {cloningNormFunction} from '../src/cloning-math.js';import {Budget} from '../src/cache.js';
const reference=JSON.parse(await readFile(process.env.M3_FIXTURE_ROOT?process.env.M3_FIXTURE_ROOT+'/cloning/reference.json':new URL('../fixtures/cloning/reference.json',import.meta.url)));
test('endpoint index preserves every native geometry row, duplicate rule and order',async()=>{
 const norm=await cloningNormFunction();for(const c of reference.primitives.geometry){const r=await cloningGeometry(Float64Array.from(c.points),Float64Array.from(c.matches),c.distance,norm,{pairCache:'grid'});assert.deepEqual([...r.lengths],c.lengths);assert.deepEqual([...r.groups],c.groups);}
});
test('endpoint index matches direct predicates around cell/norm boundaries and reversed pairs',async()=>{
 const norm=await cloningNormFunction(),points=[];for(let i=0;i<90;i++)points.push((i%9)*.75-3,Math.floor(i/9)*.75-3,1,0,1,0,0);const raw=[];for(let i=0;i<90;i++)for(let j=0;j<90;j+=7){raw.push(i,j,3);if(i%11===0)raw.push(j,i,4);}
 for(const distance of [1,Math.sqrt(2),Math.sqrt(2)*(1+Number.EPSILON),1e-12]){const input=[Float64Array.from(points),Float64Array.from(raw),distance,norm],direct=await cloningGeometry(...input,{pairCache:'off'}),indexed=await cloningGeometry(...input,{pairCache:'grid'});for(const k of ['matches','lengths','groups'])assert.deepEqual(indexed[k],direct[k]);}
});
test('100000 historical correspondences retain all ordered local groups without a quadratic scan',async()=>{
 const count=100000,points=new Float64Array(count*14),raw=new Float64Array(count*3),budget=new Budget(96*1024**2),frees=[],account=n=>{const free=budget.reserve(n);frees.push(free);return free;};
 for(let i=0;i<count;i++){const x=(i%1000)*.75,y=Math.floor(i/1000)*4;points.set([x,y,1,0,1,0,0,x+10000,y,1,0,1,0,0],i*14);raw.set([i*2,i*2+1,0],i*3);}
 try{const r=await cloningGeometry(points,raw,1,Math.hypot,{account});assert.equal(r.strategy,'endpoint-grid');assert.equal(r.matches.length,count*3);assert.equal(r.groups.length,count*2-count/1000);let at=0;for(let i=0;i<count;i++){assert.equal(r.groups[at++],i);assert.equal(r.lengths[i],i%1000===999?1:2);if(r.lengths[i]===2)assert.equal(r.groups[at++],i+1);}assert.ok(r.metrics.cloningGroupCandidateRows<count*12);assert.equal(r.metrics.cloningGroupAllPairRows,4999950000);console.log(JSON.stringify({rows:count,outputIndices:r.groups.length,metrics:r.metrics,workspacePeakBytes:budget.peak,borrowedInputBytes:points.byteLength+raw.byteLength}));}
 finally{frees.forEach(f=>f());}assert.equal(budget.total(),0);
});
