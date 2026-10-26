import test from 'node:test';
import assert from 'node:assert/strict';
import {createCmsegWindowDotGpu} from '../experiments/segmentation/cmseg-window-dot-gpu.js';
import {createCmsegDotGpu} from '../experiments/segmentation/cmseg-dot-gpu.js';
import bankFactory from '../vendor/segmentation/cmseg-window-bank/correlation.js';
const budget=()=>{let bytes=0;return{limit:512*1024**2,total:()=>bytes,reserve(n){assert.ok(bytes+n<=this.limit);bytes+=n;let done=false;return()=>{if(!done){done=true;bytes-=n;}};}};};
test('Real GPU bank dot preserves every original native one-context FP32 value',async()=>{
 const c=24,side=128,n=side*side,b=budget(),input=Float32Array.from({length:c*n},(_,i)=>Math.fround(.2*Math.sin(i*.017))),mask=Uint8Array.from({length:n},(_,i)=>Number(i%17!==0));let original,candidate;
 try{
  original=await createCmsegDotGpu({budget:b,input,c,h:side,w:side,rowsPerJob:7,scientificMask:mask});candidate=await createCmsegWindowDotGpu({budget:b,input,c,side,contexts:1,rowsPerJob:7,scientificMask:mask});
  for(const first of [0,n-7]){let a,d;try{a=await original.run({first,count:7});d=await candidate.run({first,count:7});assert.deepEqual(d.data,a.data);assert.ok(d.data.every(Number.isFinite));}finally{a?.release();d?.release();}}
 }finally{original?.dispose();await candidate?.dispose();}assert.equal(b.total(),0);
});
test('Real two-context GPU dot compares complete rows against ordered native CPU FMA statistics, including bank seam',async()=>{
 const c=24,side=128,n=2*side*side,b=budget(),mask=Uint8Array.from({length:n},(_,i)=>Number(i%17!==0)),input=Float32Array.from({length:c*n},(_,i)=>Math.fround(.2*Math.sin(i*.017))),positions=Float32Array.from({length:2*n},(_,i)=>i<n?i%side+Math.floor(i/(side*side))*140:Math.floor(((i-n)%(side*side))/side)),m=await bankFactory(),ptr=[];let gpu;
 const alloc=n=>{const p=m._malloc(n);assert.ok(p);ptr.push(p);return p;},put=a=>{const p=alloc(a.byteLength);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
 try{
  const p={x:put(input),mask:put(mask),xy:put(positions),dots:alloc(4*7*n),max:alloc(4*n),inverse:alloc(8*n),scratch:alloc(4*n),gx:alloc(4*n/side),gy:alloc(4*n/side)};
  gpu=await createCmsegWindowDotGpu({budget:b,input,c,side,contexts:2,rowsPerJob:7,scientificMask:mask});
  for(const first of [0,side*side-2,n-7]){let rows;try{
   rows=await gpu.run({first,count:7});assert.equal(rows.data.length,7*n);assert.ok(rows.data.every(Number.isFinite));m.HEAPF32.set(rows.data,p.dots/4);
   assert.equal(m._cmseg_bank_statistics(p.x,c,n,side,2.15,p.xy,p.mask,first,7,p.max,p.inverse,p.scratch,p.gy,p.gx,1),1);
   const a=[m.HEAPF32.slice(p.max/4+first,p.max/4+first+7),m.HEAPF32.slice(p.inverse/4+first,p.inverse/4+first+7),m.HEAPF32.slice(p.inverse/4+n+first,p.inverse/4+n+first+7)];
   assert.equal(m._cmseg_bank_statistics_dots(p.dots,c,n,side,2.15,p.xy,p.mask,first,7,p.max,p.inverse,p.scratch,p.gy,p.gx),1);
   const d=[m.HEAPF32.slice(p.max/4+first,p.max/4+first+7),m.HEAPF32.slice(p.inverse/4+first,p.inverse/4+first+7),m.HEAPF32.slice(p.inverse/4+n+first,p.inverse/4+n+first+7)];assert.deepEqual(d,a);
  }finally{rows?.release();}}
 }finally{await gpu?.dispose();for(const p of ptr)m._free(p);}assert.equal(b.total(),0);
});
