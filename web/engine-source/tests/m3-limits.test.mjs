import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {TypedPages,finishCorrespondences} from '../src/m3-typed-pages.js';
import {cloningSelect,cloningMatches} from '../src/cloning-math.js';
import {cloningGroupRows} from '../src/cloning-post.js';
import {siftG2nnMatch} from '../src/sift-g2nn.js';
import {spatialCopyMatches} from '../src/copy-spatial.js';
const admission=limit=>{const budget=new Budget(limit),releases=[];return {budget,account:n=>{const f=budget.reserve(n);releases.push(f);return f;},release:()=>releases.forEach(f=>f())};};
test('typed correspondence pages reduce page size under pressure and preserve last assignment and contexts',()=>{
 const a=admission(8192),rows=new TypedPages(Float64Array,5,a.account);
 rows.push(1,3,.1,4,1);rows.push(1,3,.2,5,0);rows.push(1,3,.3,6,1);rows.push(0,2,.4,7,0);
 const out=finishCorrespondences(rows,{deduplicate:true});assert.deepEqual([...out.pairs],[0,2,.4,7,1,3,.2,5,1,3,.3,6]);assert.deepEqual([...out.pairSearchRegions],[0,0,1]);assert.ok(a.budget.peak<=8192);a.release();assert.equal(a.budget.total(),0);
});
test('30001 historical points survive response selection and enter useful Hamming work',async()=>{
 const count=30001,points=new Float64Array(count*7),descriptors=new Uint8Array(count*32);let seed=1701;
 for(let i=0;i<descriptors.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;descriptors[i]=seed>>>24;}for(let i=0;i<count;i++)points[i*7+4]=i;
 const a=admission(32*1024**2),selected=await cloningSelect({points,descriptors},100,{account:a.account});assert.equal(selected.points.length/7,count);assert.deepEqual(selected.descriptors,descriptors);
 const stop=new AbortController();let progress=0;
 await assert.rejects(cloningMatches(selected.descriptors,1,{account:a.account,signal:stop.signal,onProgress:f=>{progress=f;stop.abort();}}),{code:'CANCELLED'});assert.equal(progress,64/count);a.release();assert.equal(a.budget.total(),0);
});
test('global historical grouping retains more than the former 128 MiB index allowance',async()=>{
 const n=8300,matches=new Float64Array(n*3),displacements=new Float64Array(n).fill(100),near=new Uint8Array(16);near[1]=near[4]=near[11]=near[14]=1;
 for(let i=0;i<n;i++){matches[i*3]=i%2;matches[i*3+1]=2+i%2;}
 const a=admission(200*1024**2),out=await cloningGroupRows({matches,displacements,near,pointCount:4,distance:1},0,n,{account:a.account});
 assert.equal(out.groups.length,n+n*n/4);assert.ok(out.groups.length>128*1024**2/8);let offset=0;
 for(let i=0;i<n;i++){assert.equal(out.groups[offset],i);const expected=1+Math.ceil((n-i-1)/2);assert.equal(out.lengths[i],expected);for(let j=1;j<expected;j++)assert.equal(out.groups[offset+j],i+2*j-1);offset+=expected;}assert.equal(offset,out.groups.length);a.release();assert.equal(a.budget.total(),0);
});
test('spatial matcher keeps every pair beyond 100000, with separate context provenance',async()=>{
 const n=450,points=new Float32Array(n*7),descriptors=new Uint8Array(n),members=new Uint8Array(n*2).fill(1);for(let i=0;i<n;i++)points[i*7]=i;
 const a=admission(128*1024**2),out=await spatialCopyMatches({points,descriptors,descriptorSize:1,members,zoneCount:2,radius:500,minimum:0,threshold:1,binary:true},{reserveMemory:a.account});
 const each=n*(n-1)/2;assert.equal(out.pairs.length/4,each*2);for(let i=0;i<each;i++){assert.equal(out.pairSearchRegions[i],0);assert.equal(out.pairSearchRegions[i+each],1);assert.deepEqual(out.pairs.subarray(i*4,i*4+4),out.pairs.subarray((i+each)*4,(i+each)*4+4));}a.release();assert.equal(a.budget.total(),0);
});
test('G2NN retains more than 100000 deduplicated pairs across global contexts',async()=>{
 const n=26,zones=8000,points=new Float32Array(n*7),descriptors=new Float32Array(n*128),members=new Uint8Array(n*zones).fill(1);for(let i=0;i<n;i++){points[i*7]=i;descriptors.fill(Math.floor(i/2)*16,i*128,(i+1)*128);}
 const a=admission(80*1024**2),out=await siftG2nnMatch({points,descriptors,members,zoneCount:zones,radius:100,minimum:0,ratio:.8},{reserveMemory:a.account});
 assert.equal(out.pairs.length/4,zones*13);for(let i=0;i<zones*13;i++){assert.equal(out.pairSearchRegions[i],Math.floor(i/13));assert.deepEqual([...out.pairs.subarray(i*4,i*4+4)],[(i%13)*2,(i%13)*2+1,0,1]);}a.release();assert.equal(a.budget.total(),0);
});

test('G2NN training blocks preserve global neighbours across staging boundaries',async()=>{
 const n=9001,points=new Float32Array(n*7),descriptors=new Float32Array(n*128),members=new Uint8Array(n).fill(1);for(let i=0;i<n;i++){points[i*7]=i;descriptors.fill(Math.floor((i+1)/2)%16,i*128,(i+1)*128);}
 const input={points,descriptors,members,zoneCount:1,radius:3,minimum:0,ratio:.8},full=await siftG2nnMatch(input,{reserveMemory:()=>{}}),a=admission(6*1024**2),progress=[];
 const bounded=await siftG2nnMatch(input,{reserveMemory:a.account,onProgress:p=>progress.push(p)});assert.equal(bounded.metadata.staging,'bounded-global');assert.ok(bounded.metadata.trainingRows<n);assert.deepEqual(bounded.pairs,full.pairs);assert.deepEqual(bounded.pairSearchRegions,full.pairSearchRegions);assert.equal(bounded.candidateComparisons,full.candidateComparisons);assert.ok(progress.every((p,i)=>i===0||p>=progress[i-1]));a.release();assert.equal(a.budget.total(),0);
});
