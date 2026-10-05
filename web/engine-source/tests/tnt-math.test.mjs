import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import factory from '../vendor/segmentation/tnt-math.js';
const base=new URL('../fixtures/tnt-math/',import.meta.url);
const reference=JSON.parse(await readFile(new URL('reference.json',base)));
export function tntSeeded(length,seed){const out=new Float32Array(length);let state=seed;for(let i=0;i<length;i++){state=(Math.imul(1664525,state)+1013904223)>>>0;out[i]=((state>>>8)-8388608)/8388608;}return out;}
const expected=async spec=>{const b=await readFile(new URL(spec.file,base));assert.equal(b.length,spec.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),spec.sha256);return new Float32Array(b.buffer,b.byteOffset,b.length/4);};
const exact=(a,b)=>{assert.equal(a.length,b.length);const digest=x=>createHash('sha256').update(new Uint8Array(x.buffer,x.byteOffset,x.byteLength)).digest('hex');assert.equal(digest(a),digest(b));};
const transpose=(x,r,c)=>{const y=new Float32Array(x.length);for(let i=0;i<r;i++)for(let j=0;j<c;j++)y[j*r+i]=x[i*c+j];return y;};
test('TNT patch unfolding, padded stride4 convolution and layout are native exact',async()=>{
 const m=await factory(),pointers=[],put=a=>{const p=m._malloc(a.byteLength);assert(p);pointers.push(p);m.HEAPF32.set(a,p/4);return p;};
 try{const x=put(tntSeeded(3*256**2,941)),w=put(tntSeeded(40*3*7*7,942)),b=put(tntSeeded(40,943)),out=put(new Float32Array(256*16*40));m._tnt_patch(x,w,b,out);exact(m.HEAPF32.slice(out/4,out/4+256*16*40),await expected(reference.records.find(r=>r.kind==='patch').output));}finally{pointers.forEach(p=>m._free(p));}
});
test('TNT native linear channels remain exact across partition boundaries',async()=>{
 const m=await factory();
 for(const row of reference.records.filter(v=>v.kind==='linear')){
  const{rows,ci,co,seed}=row,pointers=[],put=a=>{const p=m._malloc(a.byteLength);assert(p);pointers.push(p);m.HEAPF32.set(a,p/4);return p;};
  try{const x=put(transpose(tntSeeded(rows*ci,seed),rows,ci)),w=put(tntSeeded(co*ci,seed+1)),b=put(tntSeeded(co,seed+2)),out=put(new Float32Array(rows*co));
   // Deliberately split across channel 32, where biased width40 changes order.
   for(let first=0;first<co;first+=17)m._tnt_linear(x,w,b,rows,ci,co,Number(row.bias),first,Math.min(17,co-first),out+first*rows*4);
   exact(transpose(m.HEAPF32.slice(out/4,out/4+rows*co),co,rows),await expected(row.output));
  }finally{pointers.forEach(p=>m._free(p));}
 }
});
test('TNT Welford norms and attention outputs match independent native fixtures',async()=>{
 const m=await factory();
 for(const row of reference.records.filter(v=>['norm','attention'].includes(v.kind))){
  const pointers=[],put=a=>{const p=m._malloc(a.byteLength);assert(p);pointers.push(p);m.HEAPF32.set(a,p/4);return p;},take=(p,n)=>m.HEAPF32.slice(p/4,p/4+n);
  try{
   if(row.kind==='norm'){const{rows,width}=row,x=tntSeeded(rows*width,901);for(let i=0;i<width;i++){x[width+i]+=1000;x[2*width+i]=.125;x[3*width+i]=Math.fround(x[3*width+i]*Math.fround(1e-12));}const a=put(x),g=put(tntSeeded(width,902)),b=put(tntSeeded(width,903)),o=put(new Float32Array(x.length));m._tnt_norm(a,g,b,rows,width,1e-5,o);exact(take(o,x.length),await expected(row.output));
   }else{const{batch,heads,n,d}=row,bh=batch*heads,packed=tntSeeded(batch*n*2*heads*d,911),vl=tntSeeded(batch*n*heads*d,913),qa=new Float32Array(bh*n*d),ka=qa.slice(),va=qa.slice();for(let b=0;b<batch;b++)for(let h=0;h<heads;h++)for(let t=0;t<n;t++)for(let c=0;c<d;c++){const dst=((b*heads+h)*n+t)*d+c,src=(b*n+t)*heads*d+h*d+c;qa[dst]=packed[(b*n+t)*2*heads*d+h*d+c];ka[dst]=packed[(b*n+t)*2*heads*d+heads*d+h*d+c];va[dst]=vl[src];}const q=put(qa),k=put(ka),v=put(va),s=put(new Float32Array(bh*n*n)),p=put(new Float32Array(bh*n*n)),c=put(new Float32Array(bh*n*d));
    m._tnt_matmul(q,k,bh,n,d,n,1,0,s);exact(take(s,bh*n*n),await expected(row.scores));
    const scale=Math.fround(d**-.5);for(let i=0;i<bh*n*n;i++)m.HEAPF32[s/4+i]*=scale;exact(take(s,bh*n*n),await expected(row.scaled));
    m._tnt_softmax(s,bh*n,n,p);exact(take(p,bh*n*n),await expected(row.probability));
    m._tnt_matmul(p,v,bh,n,n,d,0,0,c);exact(take(c,bh*n*d),await expected(row.context));
   }
  }finally{pointers.forEach(p=>m._free(p));}
 }
});
test('TNT GELU retains declared finite error and sign of zero; never advertised as bit-exact',async t=>{
 const row=reference.records.find(v=>v.kind==='gelu'),m=await factory(),x=tntSeeded(row.elements,930);for(let i=0;i<x.length;i++)x[i]*=12;x.set([0,-0,1e-20,-1e-20,1e10,-1e10,1e-6,-1e-6]);const expectedValues=await expected(row.output),a=m._malloc(x.byteLength),b=m._malloc(x.byteLength);assert(a&&b);
 try{m.HEAPF32.set(x,a/4);m._tnt_gelu(a,x.length,b);let maxAbs=0,different=0;for(let i=0;i<x.length;i++){const actual=m.HEAPF32[b/4+i];assert(Number.isFinite(actual));maxAbs=Math.max(maxAbs,Math.abs(actual-expectedValues[i]));different+=!Object.is(actual,expectedValues[i]);}assert(maxAbs<=1e-6);assert(Object.is(m.HEAPF32[b/4],expectedValues[0]));assert(Object.is(m.HEAPF32[b/4+1],expectedValues[1]));t.diagnostic(JSON.stringify({maxAbs,different,elements:x.length}));}finally{m._free(a);m._free(b);}
});
