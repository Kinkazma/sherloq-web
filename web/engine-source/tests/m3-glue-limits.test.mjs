import test from 'node:test';import assert from 'node:assert/strict';
import {sparseGlueCandidates,selectSparseGlue} from '../src/sparse-glue-candidates.js';
import {Budget} from '../src/cache.js';
const request=n=>{const points=new Float64Array(n*7);for(let i=0;i<n;i++)points[i*7]=i;return {points,members:new Uint8Array(n).fill(1),zoneCount:1,radius:1,minimum:1};};
async function check(n,radius){const input=request(n);input.radius=radius;const budget=new Budget(256*1024**2),frees=[];try{return await sparseGlueCandidates(input,0,{reserveMemory:bytes=>{const f=budget.reserve(bytes);frees.push(f);return f;}});}finally{frees.forEach(f=>f());assert.equal(budget.total(),0);}}
test('learned candidate graph preserves all edges beyond 6000 points',async()=>{const n=6001,result=await check(n,1);assert.equal(result.a.length,n);assert.equal(result.edges.length/2,2*(n-1));for(let i=0;i<result.edges.length;i+=2)assert.equal(Math.abs(result.edges[i]-result.edges[i+1]),1);});
test('learned graph keeps more than four million directed edges globally',async()=>{const n=2002,result=await check(n,n);assert.equal(result.edges.length/2,n*(n-1));const counts=new Uint32Array(n);for(let i=0;i<result.edges.length;i+=2){assert.notEqual(result.edges[i],result.edges[i+1]);counts[result.edges[i]]++;}assert.ok(counts.every(v=>v===n-1));});
test('typed confidence ordering preserves mutual choices and endpoint order',()=>{const job={a:[0,1],b:[2,3],x:Float64Array.of(0,0,1,0),y:Float64Array.of(4,0,5,0),edges:Int32Array.of(0,1,1,0,0,0,1,1)};const rows=selectSparseGlue(job,Float32Array.of(.9,.9,.9,.9),.2);assert.deepEqual(rows,[[0,2,Math.fround(1-Math.fround(.9)),4]]);});
test('confidence threshold cut preserves native greedy seen flags and ties',()=>{
 let seed=1827;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 for(let sample=0;sample<16;sample++){const a=Array.from({length:9},(_,i)=>i),b=Array.from({length:11},(_,i)=>i+20),edges=Int32Array.from(a.flatMap((_,i)=>b.flatMap((_,j)=>[i,j]))),x=Float64Array.from(a.flatMap(i=>[i,0])),y=Float64Array.from(b.flatMap(i=>[i,0])),confidence=Float32Array.from({length:99},()=>Math.floor(random()*8)/8),threshold=[.1,.3,.7,1][sample%4],job={a,b,x,y,edges};const order=Array.from({length:99},(_,i)=>i).sort((i,j)=>confidence[j]-confidence[i]||edges[i*2]-edges[j*2]||edges[i*2+1]-edges[j*2+1]),seenA=new Set(),seenB=new Set(),expected=[];
 for(const e of order){const i=edges[e*2],j=edges[e*2+1],keep=!seenA.has(i)&&!seenB.has(j);seenA.add(i);seenB.add(j);if(keep&&confidence[e]>=Math.fround(1-threshold))expected.push([a[i],b[j],Math.fround(1-confidence[e]),b[j]-a[i]]);}
 expected.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);assert.deepEqual(selectSparseGlue(job,confidence,threshold),expected);}
});
