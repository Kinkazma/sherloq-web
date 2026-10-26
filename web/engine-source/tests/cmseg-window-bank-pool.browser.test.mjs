import test from 'node:test';
import assert from 'node:assert/strict';
import {createCmsegWindowCorrelation} from '../experiments/segmentation/cmseg-window-bank-pool.js';
import bankFactory from '../vendor/segmentation/cmseg-window-bank/correlation.js';
const budget=()=>{let bytes=0;return{limit:1024**3,total:()=>bytes,reserve(n){assert.ok(bytes+n<=this.limit);bytes+=n;let done=false;return()=>{if(!done){done=true;bytes-=n;}};}};};
test('Real multi-Worker CMSeg bank pool preserves complete two-context native correlation fields without NN',async()=>{
 const c=96,side=32,k=96,n=2048,input=Float32Array.from({length:c*n},(_,i)=>Math.fround(Math.sin(i*.017)+.3*Math.cos(i*.113))),mask=Uint8Array.from({length:n},(_,i)=>Number(i%13!==0)),positions=Float32Array.from({length:2*n},(_,i)=>i<n?i%side+Math.floor(i/1024)*35:Math.floor((i-n)%1024/side)),plan={channels:c,side,k,count:n,contexts:[{index:0,offset:0,count:1024},{index:1,offset:1024,count:1024}],mask,positions,assertCurrent(){}};
 const b=budget(),pool=createCmsegWindowCorrelation({budget:b,maxWorkers:2,rowsPerJob:64}),m=await bankFactory(),ptr=[];
 const alloc=n=>{const p=m._malloc(n);assert.ok(p);ptr.push(p);return p;},put=a=>{const p=alloc(a.byteLength);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};let result;
 try{
  const p={x:put(input),mask:put(mask),xy:put(positions),norm:alloc(input.byteLength),max:alloc(4*n),inverse:alloc(8*n),scratch:alloc(4*n),gx:alloc(4*n/side),gy:alloc(4*n/side),out:alloc(4*k*n)};
  assert.equal(m._cmseg_bank_normalize(p.x,c,n,side,p.mask,p.norm,1),1);assert.equal(m._cmseg_bank_statistics(p.norm,c,n,side,2.15,p.xy,p.mask,0,n,p.max,p.inverse,p.scratch,p.gy,p.gx,1),1);assert.equal(m._cmseg_bank_topk(p.norm,c,n,side,k,2.15,p.xy,p.mask,p.max,p.inverse,0,n,p.out,p.scratch,p.gy,p.gx,1),1);
  const expected=m.HEAPF32.slice(p.out/4,p.out/4+k*n);result=await pool.run({plan,input,alpha:2.15,nativeFma:true},{onProgress:v=>assert.equal(v.total,n)});
  assert.equal(result.workers,2);assert.equal(result.requestedMaxWorkers,2);assert.equal(result.comparisonsPerPass,n*n);assert.deepEqual(result.data,expected);assert.equal(b.total(),result.data.byteLength);assert.equal(pool.pendingACKs,0);
 }finally{result?.release();await pool.release();for(const p of ptr)m._free(p);}assert.equal(b.total(),0);
});
