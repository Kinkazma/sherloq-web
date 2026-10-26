import test from 'node:test';
import assert from 'node:assert/strict';
import bankFactory from '../vendor/segmentation/cmseg-window-bank/correlation.js';
import plainFactory from '../vendor/segmentation/correlation.js';
import fmaFactory from '../vendor/segmentation/correlation-fma.js';
import scopedFactory from '../vendor/segmentation/scientific-correlation/correlation.js';

const fixture=n=>Float32Array.from({length:n},(_,i)=>i===0?-0:Math.fround(Math.sin(i*.71)+Math.cos(i*.17)*.2));
function allocator(module){
 const pointers=[],alloc=bytes=>{const p=module._malloc(bytes);assert.ok(p);pointers.push(p);return p;},put=a=>{const p=alloc(a.byteLength);module.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
 return {alloc,put,release(){for(const p of pointers)module._free(p);}};
}
function executeNative(module,{input,c=5,h=4,w=4,k=8,alpha=2.15,mask,fma=0}){
 const n=h*w,a=allocator(module),{alloc,put}=a;
 try{
  const x=put(input),xn=alloc(input.byteLength),gy=alloc(h*4),gx=alloc(w*4),mx=alloc(n*4),iv=alloc(n*8),scratch=alloc(n*4),out=alloc(n*k*4),m=mask?put(mask):0;
  assert.equal(mask?module._cmseg_scoped_normalize(x,c,h,w,m,xn,gy,gx,fma):module._cmseg_normalize(x,c,h,w,xn,gy,gx),1);
  assert.equal(mask?module._cmseg_scoped_statistics(xn,c,h,w,alpha,gy,gx,m,0,n,mx,iv,scratch,fma):module._cmseg_statistics(xn,c,h,w,alpha,gy,gx,0,n,mx,iv,scratch),1);
  assert.equal(mask?module._cmseg_scoped_topk(xn,c,h,w,k,alpha,gy,gx,m,mx,iv,0,n,out,scratch,fma):module._cmseg_topk(xn,c,h,w,k,alpha,gy,gx,mx,iv,0,n,out,scratch),1);
  return {output:module.HEAPF32.slice(out/4,out/4+n*k),normalized:module.HEAPF32.slice(xn/4,xn/4+c*n),maximum:module.HEAPF32.slice(mx/4,mx/4+n),inverse:module.HEAPF32.slice(iv/4,iv/4+n*2)};
 }finally{a.release();}
}
function executeBank(module,{input,c=5,side=4,k=8,alpha=2.15,mask,positions,fma=0,chunk=5,dots,inPlace=false}){
 const n=input.length/c,a=allocator(module),{alloc,put}=a;mask??=new Uint8Array(n).fill(1);
 positions??=Float32Array.from({length:2*n},(_,i)=>i<n?i%side:Math.floor((i-n)%(side*side)/side));
 try{
  const x=put(input),xn=inPlace?x:alloc(input.byteLength),pos=put(positions),m=put(mask),mx=alloc(n*4),iv=alloc(n*8),scratch=alloc(n*4),gy=alloc(n/side*4),gx=alloc(n/side*4),out=alloc(chunk*k*4),dot=dots?alloc(chunk*n*4):0;
  assert.equal(module._cmseg_bank_normalize(x,c,n,side,m,xn,fma),1);
  for(let first=0;first<n;first+=chunk){const count=Math.min(chunk,n-first);if(dots)module.HEAPF32.set(dots.subarray(first*n,(first+count)*n),dot/4);
   assert.equal(dots?module._cmseg_bank_statistics_dots(dot,c,n,side,alpha,pos,m,first,count,mx,iv,scratch,gy,gx):module._cmseg_bank_statistics(xn,c,n,side,alpha,pos,m,first,count,mx,iv,scratch,gy,gx,fma),1);
  }
  const output=new Float32Array(n*k);
  for(let first=0;first<n;first+=chunk){const count=Math.min(chunk,n-first);if(dots)module.HEAPF32.set(dots.subarray(first*n,(first+count)*n),dot/4);
   assert.equal(dots?module._cmseg_bank_topk_dots(dot,c,n,side,k,alpha,pos,m,mx,iv,first,count,out,scratch,gy,gx):module._cmseg_bank_topk(xn,c,n,side,k,alpha,pos,m,mx,iv,first,count,out,scratch,gy,gx,fma),1);
   for(let channel=0;channel<k;channel++)output.set(module.HEAPF32.subarray(out/4+channel*count,out/4+(channel+1)*count),channel*n+first);
  }
  return {output,normalized:module.HEAPF32.slice(xn/4,xn/4+c*n),maximum:module.HEAPF32.slice(mx/4,mx/4+n),inverse:module.HEAPF32.slice(iv/4,iv/4+2*n)};
 }finally{a.release();}
}
test('One-context bank preserves every FP32 value of both pinned native operators and both masked variants',async()=>{
 const bank=await bankFactory(),scoped=await scopedFactory(),input=fixture(80),original=input.slice();
 for(const [factory,fma]of [[plainFactory,0],[fmaFactory,1]]){
  const ordinary=executeNative(await factory(),{input}),actual=executeBank(bank,{input,fma});assert.deepEqual(actual,ordinary,'Complete native grids/axes/TopK, FMA='+fma);
  for(const mask of [new Uint8Array(16).fill(1),Uint8Array.from({length:16},(_,i)=>Number(i%3===0))])assert.deepEqual(executeBank(bank,{input,mask,fma}),executeNative(scoped,{input,mask,fma}));
 }
 assert.deepEqual(input,original);
});
test('Multiple literal contexts share real correlations; excluded inputs are removed before normalization, both softmax axes and TopK',async()=>{
 const bank=await bankFactory(),input=fixture(160),mask=Uint8Array.from({length:32},(_,i)=>Number(i%3===0)),positions=Float32Array.from({length:64},(_,i)=>i<32?(i%16)%4+(i>=16?8:0):Math.floor((i-32)%16/4)),poison=input.slice();
 for(let channel=0;channel<5;channel++)for(let i=0;i<32;i++)if(!mask[i])poison[channel*32+i]=i%2?-1e30:1e30;
 for(const fma of [0,1]){
  const actual=executeBank(bank,{input,mask,positions,fma});assert.deepEqual(executeBank(bank,{input:poison,mask,positions,fma}),actual);assert.ok(actual.output.every(Number.isFinite));
  const changed=input.slice();for(let channel=0;channel<5;channel++)for(let i=16;i<32;i++)if(mask[i])changed[channel*32+i]=Math.fround((i+channel)%7);
  const combined=executeBank(bank,{input:changed,mask,positions,fma});assert.notDeepEqual(combined.output.subarray(0,16),actual.output.subarray(0,16),'Admitted features in another portion alter the common head; no independent per-portion head');
 }
});
test('Streaming tiles and in-place normalization preserve exact fields without retaining K*N per worker',async()=>{
 const module=await bankFactory(),input=fixture(160);
 for(const fma of [0,1]){
  const full=executeBank(module,{input,fma,chunk:32});for(const chunk of [1,3,7,16])assert.deepEqual(executeBank(module,{input,fma,chunk,inPlace:true}),full);
 }
});
test('Complete GPU-dot rows use the same postprocessing and ignore invalid pairs before every reduction',async()=>{
 const module=await bankFactory(),input=fixture(160),mask=Uint8Array.from({length:32},(_,i)=>Number(i%3===0)),normalized=executeBank(module,{input,mask,fma:1}).normalized,dots=new Float32Array(32*32);
 for(let i=0;i<32;i++)for(let j=0;j<32;j++){let sum=0;for(let c=0;c<5;c++)sum=Math.fround(normalized[c*32+i]*normalized[c*32+j]+sum);dots[i*32+j]=sum;}
 const post=executeBank(module,{input,mask,fma:1,dots}),poison=dots.slice();for(let i=0;i<32;i++)for(let j=0;j<32;j++)if(!mask[i]||!mask[j])poison[i*32+j]=1e30;
 assert.deepEqual(executeBank(module,{input,mask,fma:1,dots:poison}),post);
 assert.deepEqual(post,executeBank(module,{input,mask,fma:1}),'Full native FMA rows, no pair/window shortcut');
});
test('Empty candidates stay finite zero and do not manufacture a native maximum or TopK match',async()=>{
 const module=await bankFactory(),input=fixture(160),mask=new Uint8Array(32),result=executeBank(module,{input,mask});
 assert.ok(result.output.every(v=>v===0));assert.ok(result.normalized.every(v=>v===0));assert.ok(result.maximum.every(v=>v===0));
 for(let i=0;i<32;i++){assert.equal(result.inverse[i],0);assert.equal(result.inverse[32+i],1);}
});
