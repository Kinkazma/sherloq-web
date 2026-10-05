import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import factory from '../vendor/segmentation/vig-math.js';
const base=new URL('../fixtures/vig-math/',import.meta.url),ref=JSON.parse(await readFile(new URL('reference.json',base)));
const seed=(n,s)=>{const a=new Float32Array(n);for(let i=0;i<n;i++){s=(Math.imul(1664525,s)+1013904223)>>>0;a[i]=((s>>>8)-8388608)/8388608;}return a;};
const digest=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const exact=async(a,spec)=>{assert.equal(a.byteLength,spec.bytes);const b=await readFile(new URL(spec.file,base));assert.equal(digest(b),spec.sha256);assert.equal(digest(a),spec.sha256);};
const withMath=async fn=>{const m=await factory(),pointers=[],put=a=>{const p=m._malloc(a.byteLength);assert(p);pointers.push(p);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};try{assert.equal(m.HEAPU8.length,64*1024**2);await fn(m,put);}finally{pointers.forEach(p=>m._free(p));}};
test('VIG exp and GELU reproduce independent native arithmetic, including signed zero',async()=>{
 for(const r of ref.records.filter(r=>['exp','gelu'].includes(r.kind)))await withMath(async(m,put)=>{
  const a=seed(r.elements,r.seed);
  if(r.kind==='exp'){for(let i=0;i<a.length;i++)a[i]=Math.fround(Math.fround(a[i]+1)*-64);let state=r.bitSeed;const u=new Uint32Array(a.buffer);for(let i=0;i<a.length/2;i++){state=(Math.imul(1664525,state)+1013904223)>>>0;u[i]=(0x80000000|(state%0x43000001))>>>0;}a.set([0,-0,-128,-129,-1e-30,-103.97208,-87.33655,-1]);}
  else{for(let i=0;i<a.length;i++)a[i]*=12;a.set([0,-0,1e-20,-1e-20,1e10,-1e10,1e-6,-1e-6]);}
  const x=put(a),o=put(new Float32Array(a.length));for(let first=0;first<a.length;first+=65536)m[r.kind==='exp'?'_vig_exp_values':'_vig_gelu'](x+first*4,Math.min(65536,a.length-first),o+first*4);await exact(m.HEAPF32.slice(o/4,o/4+a.length),r.output);
 });
});
test('VIG stem, grouped convolution and FFN preserve arithmetic through irregular job boundaries',async()=>{
 for(const r of ref.records.filter(r=>r.kind==='conv'))await withMath(async(m,put)=>{
  const[ci,h,w,co,k,pad,stride,groups]=r.geometry,n=r.output.bytes/4,x=put(seed(ci*h*w,r.seed)),weight=put(seed(co*ci/groups*k*k,r.seed+1)),bias=put(seed(co,r.seed+2)),d=put(Int32Array.from(r.geometry)),o=put(new Float32Array(n));
  for(let first=0;first<n;first+=1231)assert.equal(m._vig_conv(x,weight,bias,d,first,Math.min(1231,n-first),o+first*4),1);
  await exact(m.HEAPF32.slice(o/4,o/4+n),r.output);
 });
});
test('VIG distances, tied TopK, dilation and max-relative packing are native exact',async()=>{
 for(const r of ref.records.filter(r=>r.kind==='graph'))await withMath(async(m,put)=>{
  const values=seed(640*256,r.seed);if(r.name==='ties')for(let c=0;c<640;c++)for(let i=0;i<256;i+=4)values.fill(values[c*256+i],c*256+i,c*256+i+4);
  const x=put(values),normal=put(new Float32Array(values.length)),sums=put(new Float32Array(256)),dist=put(new Float32Array(256**2)),idx=put(new Int32Array(256*r.k*r.dilation)),out=put(new Float32Array(1280*256));m._vig_normalize(x,normal,sums);
  for(let first=0;first<256;first+=7){const count=Math.min(7,256-first);m._vig_distance_rows(normal,sums,first,count,dist);m._vig_topk_rows(dist,first,count,r.k*r.dilation,idx);m._vig_gather_rows(x,r.k,r.dilation,idx,first,count,out);}
  await exact(m.HEAPF32.slice(normal/4,normal/4+values.length),r.normal);await exact(m.HEAPF32.slice(dist/4,dist/4+256**2),r.distance);await exact(m.HEAP32.slice(idx/4,idx/4+256*r.k*r.dilation),r.indices);await exact(m.HEAPF32.slice(out/4,out/4+1280*256),r.gather);
 });
});
