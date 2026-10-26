import test from 'node:test';
import assert from 'node:assert/strict';
import nativeFactory from '../vendor/segmentation/scientific-correlation/correlation.js';
const side=32,c=96,k=96,n=side*side,heap64=64*1024**2,heap32=32*1024**2;
const positions=Float32Array.from({length:2*n},(_,i)=>i<n?i%side:Math.floor((i-n)/side));
const input=Float32Array.from({length:c*n},(_,i)=>Math.fround(Math.sin(i*.013)+.25*Math.cos(i*.91))),mask=Uint8Array.from({length:n},(_,i)=>Number(i%5!==0));
const geometry={c,n,side,k,rowsPerJob:7,nativeFma:true};
function rpc(){
 const worker=new Worker(new URL('../experiments/segmentation/cmseg-window-bank-worker.js',import.meta.url),{type:'module'}),pending=new Map();let next=0;
 worker.onmessage=({data})=>{const p=pending.get(data.id);if(p){pending.delete(data.id);clearTimeout(p.timer);p.resolve(data);}};
 worker.onerror=e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(e.message));}pending.clear();};
 return {async call(data){return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);worker.terminate();reject(Error('Bounded native correlation worker timeout'));},10000);pending.set(id,{resolve,reject,timer});worker.postMessage({...data,id});});},dispose(){worker.terminate();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Test owner retired'));}pending.clear();}};
}
const url=name=>new URL('../vendor/segmentation/cmseg-window-bank/'+name,import.meta.url).href;
async function reference(){
 const m=await nativeFactory(),ps=[],alloc=bytes=>{const p=m._malloc(bytes);assert.ok(p);ps.push(p);return p;},put=a=>{const p=alloc(a.byteLength);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
 const p={x:put(input),mask:put(mask),normalized:alloc(c*n*4),gy:alloc(side*4),gx:alloc(side*4),mx:alloc(n*4),iv:alloc(n*8),scratch:alloc(n*4),out:alloc(k*n*4)};
 assert.equal(m._cmseg_scoped_normalize(p.x,c,side,side,p.mask,p.normalized,p.gy,p.gx,1),1);
 return {m,p,normalized:()=>m.HEAPF32.slice(p.normalized/4,p.normalized/4+c*n),dispose(){for(const p of ps)m._free(p);}};
}
test('Real normalize-only Worker preserves every native FMA normalized value with no model, pool or GPU',async()=>{
 const w=rpc(),r=await reference();
 try{const a=await w.call({type:'normalize',mode:'normalize',moduleUrl:url('correlation.js'),geometry,mask,input});assert.equal(a.ok,true);assert.deepEqual(a.normalized,r.normalized());assert.ok(a.heapBytes<=heap64);}
 finally{w.dispose();r.dispose();}
});
test('Real bounded CPU Worker statistics, distributed axes and tiled TopK equal the original scoped kernel',async()=>{
 const w=rpc(),r=await reference(),{m,p}=r,alpha=2.15,first=3,count=7;
 try{
  assert.equal((await w.call({type:'init',mode:'cpu',moduleUrl:url('correlation.js'),geometry,mask,input,positions})).ok,true);
  assert.equal(m._cmseg_scoped_statistics(p.normalized,c,side,side,alpha,p.gy,p.gx,p.mask,0,n,p.mx,p.iv,p.scratch,1),1);
  const a=await w.call({type:'statistics',first,count,alpha});assert.equal(a.ok,true);assert.deepEqual(a.maxima,m.HEAPF32.slice(p.mx/4+first,p.mx/4+first+count));assert.deepEqual(a.inverse,m.HEAPF32.slice(p.iv/4+first,p.iv/4+first+count));assert.deepEqual(a.columnSum,m.HEAPF32.slice(p.iv/4+n+first,p.iv/4+n+first+count));
  const maxima=m.HEAPF32.slice(p.mx/4,p.mx/4+n),inverse=m.HEAPF32.slice(p.iv/4,p.iv/4+2*n);assert.equal((await w.call({type:'distribute',maxima,inverse})).ok,true);
  const b=await w.call({type:'topk',first,count,alpha});assert.equal(b.ok,true);assert.ok(b.heapBytes<=heap64);assert.equal(m._cmseg_scoped_topk(p.normalized,c,side,side,k,alpha,p.gy,p.gx,p.mask,p.mx,p.iv,first,count,p.out,p.scratch,1),1);
  const expected=new Float32Array(k*count);for(let channel=0;channel<k;channel++)expected.set(m.HEAPF32.subarray(p.out/4+channel*n+first,p.out/4+channel*n+first+count),channel*count);assert.deepEqual(b.output,expected);
  assert.equal((await w.call({type:'topk',first:n-1,count:7,alpha})).ok,false,'No clipped or shortened invalid row range');
 }finally{w.dispose();r.dispose();}
});
test('Real32MiB post Worker needs no feature copy and preserves exact native reductions on complete supplied rows',async()=>{
 const w=rpc(),all=new Uint8Array(n).fill(1),first=5,count=7,alpha=5;
 try{
  const ready=await w.call({type:'init',mode:'post',moduleUrl:url('post.js'),geometry,mask:all,positions});assert.equal(ready.ok,true);assert.ok(ready.heapBytes<=heap32);
  const rows=new Float32Array(count*n),a=await w.call({type:'statistics',first,count,alpha,dots:rows});assert.equal(a.ok,true);assert.deepEqual(a.maxima,new Float32Array(count));assert.deepEqual(a.inverse,new Float32Array(count).fill(1/n));assert.deepEqual(a.columnSum,new Float32Array(count).fill(n));
  const maxima=new Float32Array(n),inverse=new Float32Array(2*n);inverse.fill(1/n,0,n);inverse.fill(n,n);assert.equal((await w.call({type:'distribute',maxima,inverse})).ok,true);
  const b=await w.call({type:'topk',first,count,alpha,dots:rows});assert.equal(b.ok,true);assert.ok(b.heapBytes<=heap32);assert.deepEqual(b.output,new Float32Array(k*count).fill(1/(n*n)));
  assert.equal((await w.call({type:'topk',first,count,alpha,dots:rows.subarray(1)})).ok,false,'Incomplete comparison row refused');
 }finally{w.dispose();}
});
