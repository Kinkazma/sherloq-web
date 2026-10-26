import test from 'node:test';
import assert from 'node:assert/strict';
import factory from '../vendor/ssg-strict/localization.mjs';
import nativeFactory from '../vendor/ssg-full/localization.mjs';
import {allocateWasmMemory} from '../src/allocation.js';

const runtime=()=>factory({wasmMemory:allocateWasmMemory({initial:512,maximum:1024}),maximumHeapBytes:64*1024**2});
const original=()=>nativeFactory({wasmMemory:allocateWasmMemory({initial:512,maximum:1024}),maximumHeapBytes:64*1024**2});
function buffers(m,values){const pointers=[];return{add(Type,a){const p=m._malloc(a.length*Type.BYTES_PER_ELEMENT);pointers.push(p);new Type(m.HEAPU8.buffer,p,a.length).set(a);return p;},out(Type,n){return this.add(Type,new Type(n));},read(Type,p,n){return new Type(m.HEAPU8.buffer,p,n).slice();},dispose(){for(const p of pointers)m._free(p);m._ssg_full_shutdown();}};}
function near(actual,expected,tolerance=3e-12){assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)if(Number.isNaN(expected[i]))assert(Number.isNaN(actual[i]));else assert(Math.abs(actual[i]-expected[i])<=tolerance*Math.max(1,Math.abs(expected[i])),`${i}: ${actual[i]} versus ${expected[i]}`);}
function gaussian(a,known,w,h,r,sigma,replicate){const k=Array.from({length:r*2+1},(_,i)=>Math.exp(-((i-r)**2)/(2*sigma*sigma))),sum=k.reduce((a,b)=>a+b,0);for(let i=0;i<k.length;i++)k[i]/=sum;const values=new Float64Array(w*h),valid=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let numerator=0,weight=0;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const factor=k[dx+r]*k[dy+r],rawX=x+dx,rawY=y+dy;if(!replicate&&(rawX<0||rawY<0||rawX>=w||rawY>=h)){weight+=factor;continue;}const xx=Math.max(0,Math.min(w-1,rawX)),yy=Math.max(0,Math.min(h-1,rawY)),id=yy*w+xx;if(known[id]){numerator+=a[id]*factor;weight+=factor;}}valid[y*w+x]=weight>1e-14;values[y*w+x]=valid[y*w+x]?numerator/weight:NaN;}return{values,valid};}

test('all admitted Gaussian and SSIM retain the original native double arithmetic bit-exactly',async()=>{
 const m=await runtime(),old=await original(),a=buffers(m),b=buffers(old),w=11,h=9,n=w*h,first=Float64Array.from({length:n},(_,i)=>.3+Math.sin(i*.17)),second=Float64Array.from(first,(v,i)=>v+.03*Math.cos(i*.13)),known=new Uint8Array(n).fill(1);
 try{const ip=a.add(Float64Array,first),jp=a.add(Float64Array,second),kp=a.add(Uint8Array,known),op=a.out(Float64Array,n),vp=a.out(Uint8Array,n),oldIp=b.add(Float64Array,first),oldJp=b.add(Float64Array,second),oldOp=b.out(Float64Array,n);assert.equal(m._ssg_strict_blur(ip,kp,op,vp,w,h,7,2,0),0);assert.equal(old._ssg_full_blur(oldIp,oldOp,w,h),0);assert.deepEqual(a.read(Float64Array,op,n),b.read(Float64Array,oldOp,n));assert.equal(m._ssg_strict_ssim(ip,jp,kp,kp,op,vp,w,h,1.3),0);assert.equal(old._ssg_full_ssim(oldIp,oldJp,oldOp,w,h,1.3),0);assert.deepEqual(a.read(Float64Array,op,n),b.read(Float64Array,oldOp,n));assert(a.read(Uint8Array,vp,n).every(v=>v===1));}finally{a.dispose();b.dispose();}
});

test('Gaussian uses only observed two-dimensional taps, including native outer padding and true holes',async()=>{
 const m=await runtime(),io=buffers(m),w=9,h=7,n=w*h,known=Uint8Array.from({length:n},(_,i)=>i%9!==4&&i!==7),first=Float64Array.from({length:n},(_,i)=>known[i]?(i%7)*.13:NaN),poison=Float64Array.from(first,(v,i)=>known[i]?v:1e12);try{const kp=io.add(Uint8Array,known),op=io.out(Float64Array,n),vp=io.out(Uint8Array,n);for(const replicate of [0,1]){const expected=gaussian(first,known,w,h,2,1.2,!!replicate);for(let i=0;i<n;i++)if(!known[i]){expected.values[i]=NaN;expected.valid[i]=0;}for(const a of [first,poison]){const ip=io.add(Float64Array,a);assert.equal(m._ssg_strict_blur(ip,kp,op,vp,w,h,2,1.2,replicate),0);near(io.read(Float64Array,op,n),expected.values);assert.deepEqual(io.read(Uint8Array,vp,n),expected.valid);}}}finally{io.dispose();}
});

test('joint-support SSIM moments match an independent direct 2D weighted oracle, never black unknown pixels',async()=>{
 const m=await runtime(),io=buffers(m),w=8,h=7,n=w*h,sigma=1.1,r=Math.ceil(3*sigma),ka=Uint8Array.from({length:n},(_,i)=>i%8!==3),kb=Uint8Array.from({length:n},(_,i)=>i%8!==4&&i>7),joint=Uint8Array.from(ka,(v,i)=>v&&kb[i]?1:0),a=Float64Array.from({length:n},(_,i)=>ka[i]?.2+Math.sin(i*.3)*.1:NaN),b=Float64Array.from({length:n},(_,i)=>kb[i]?.3+Math.cos(i*.11)*.1:NaN),ma=gaussian(a,joint,w,h,r,sigma,true),mb=gaussian(b,joint,w,h,r,sigma,true),aa=gaussian(Float64Array.from(a,v=>v*v),joint,w,h,r,sigma,true),bb=gaussian(Float64Array.from(b,v=>v*v),joint,w,h,r,sigma,true),ab=gaussian(Float64Array.from(a,(v,i)=>v*b[i]),joint,w,h,r,sigma,true),expected=new Float64Array(n),valid=Uint8Array.from(ma.valid,(v,i)=>v&&ka[i]?1:0);
 for(let i=0;i<n;i++){if(!valid[i]){expected[i]=NaN;continue;}const va=Math.max(0,aa.values[i]-ma.values[i]**2),vb=Math.max(0,bb.values[i]-mb.values[i]**2),sd=Math.sqrt(va*vb),cov=ab.values[i]-ma.values[i]*mb.values[i],l=(2*ma.values[i]*mb.values[i]+.0001)/(ma.values[i]**2+mb.values[i]**2+.0001),c=(2*sd+.0009)/(va+vb+.0009),s=(cov+.00045)/(sd+.00045);expected[i]=l*l*l*c*s*s;}
 try{const ap=io.add(Float64Array,a),bp=io.add(Float64Array,b),kap=io.add(Uint8Array,ka),kbp=io.add(Uint8Array,kb),op=io.out(Float64Array,n),vp=io.out(Uint8Array,n);assert.equal(m._ssg_strict_ssim(ap,bp,kap,kbp,op,vp,w,h,sigma),0);near(io.read(Float64Array,op,n),expected,2e-10);assert.deepEqual(io.read(Uint8Array,vp,n),valid);}finally{io.dispose();}
});

test('strict bilinear warp distinguishes a missing inner observation from native outer zero padding',async()=>{
 const m=await runtime(),io=buffers(m),w=7,h=5,n=w*h,known=Uint8Array.from({length:n},(_,i)=>i%7!==3),values=Float64Array.from({length:n},(_,i)=>known[i]?i/10:NaN),matrix=[1,0,.5,0,1,0];try{const ip=io.add(Float64Array,values),kp=io.add(Uint8Array,known),mp=io.add(Float64Array,matrix),op=io.out(Float64Array,n),vp=io.out(Uint8Array,n);assert.equal(m._ssg_strict_warp(ip,kp,op,vp,mp,w,h,0),0);const a=io.read(Float64Array,op,n),v=io.read(Uint8Array,vp,n);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const ids=[x-1,x],taps=ids.map(xx=>xx<0?{known:true,value:0}:{known:!!known[y*w+xx],value:values[y*w+xx]}).filter(t=>t.known);assert.equal(v[y*w+x],taps.length?1:0);assert.equal(a[y*w+x],taps.reduce((s,t)=>s+t.value,0)/taps.length);}}finally{io.dispose();}
});

test('observed morphology retains the true native footprint without treating excluded locations as zeros',async()=>{
 const m=await runtime(),io=buffers(m),w=9,h=8,n=w*h,known=Uint8Array.from({length:n},(_,i)=>i%9!==4),values=Float64Array.from({length:n},(_,i)=>known[i]?Number(i%7===0):NaN),radius=4,a=1,b=1;let offsets=new Set(['0,0']);for(const[dx,dy,r]of[[1,0,a],[0,1,a],[1,1,b],[1,-1,b]]){const next=new Set();for(const key of offsets){const[x,y]=key.split(',').map(Number);for(let i=-r;i<=r;i++)next.add([x+dx*i,y+dy*i].join(','));}offsets=next;}
 try{const ip=io.add(Float64Array,values),kp=io.add(Uint8Array,known),op=io.out(Float64Array,n),vp=io.out(Uint8Array,n);for(const dilation of [0,1]){assert.equal(m._ssg_strict_morph(ip,kp,op,vp,w,h,radius,dilation),0);const actual=io.read(Float64Array,op,n),valid=io.read(Uint8Array,vp,n);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const observed=[];for(const key of offsets){const[dx,dy]=key.split(',').map(Number),xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h&&known[yy*w+xx])observed.push(values[yy*w+xx]);}assert.equal(valid[y*w+x],observed.length?1:0);assert.equal(actual[y*w+x],dilation?Math.max(...observed):Math.min(...observed));}}}finally{io.dispose();}
});

test('complete native localizer keeps the original full-domain mask bit-exactly',async()=>{
 const m=await runtime(),old=await original(),a=buffers(m),b=buffers(old),w=17,h=13,n=w*h,gray=Float64Array.from({length:n},(_,i)=>.2+Math.sin(i*.17)*.1),roi=new Float64Array(n).fill(1),known=new Uint8Array(n).fill(1),matrix=[1,0,0,0,1,0],points=[3,3,5,4,7,8,10,9];
 try{const ip=a.add(Float64Array,gray),kp=a.add(Uint8Array,known),rp=a.add(Float64Array,roi),mp=a.add(Float64Array,matrix),pp=a.add(Float64Array,points),op=a.out(Uint8Array,n),vp=a.out(Uint8Array,n),oi=b.add(Float64Array,gray),orr=b.add(Float64Array,roi),om=b.add(Float64Array,matrix),opp=b.add(Float64Array,points),oo=b.out(Uint8Array,n);assert.equal(m._ssg_strict_localize(ip,kp,rp,mp,pp,points.length/2,w,h,.4,.0001,1.2,4,op,vp),0);assert.equal(old._ssg_full_localize(oi,orr,om,opp,points.length/2,w,h,.4,.0001,1.2,4,oo),0);assert.deepEqual(a.read(Uint8Array,op,n),b.read(Uint8Array,oo,n));assert(a.read(Uint8Array,vp,n).every(v=>v===1));}finally{a.dispose();b.dispose();}
});

test('gaps remain barriers and minimumArea uses the admitted population rather than the bounding grid',async()=>{
 const m=await runtime(),io=buffers(m),w=21,h=3,n=w*h,known=Uint8Array.from({length:n},(_,i)=>i<42&&(i%w<4||i%w>=17)?1:0),gray=Float64Array.from(known,v=>v?.3:NaN),roi=new Float64Array(n).fill(1),matrix=[1,0,0,0,1,0],points=[0,0,1,0,2,1,17,0,18,0,19,1];assert.equal(known.filter(Boolean).length,16);
 try{const ip=io.add(Float64Array,gray),kp=io.add(Uint8Array,known),rp=io.add(Float64Array,roi),mp=io.add(Float64Array,matrix),pp=io.add(Float64Array,points),op=io.out(Uint8Array,n),vp=io.out(Uint8Array,n);assert.equal(m._ssg_strict_localize(ip,kp,rp,mp,pp,6,w,h,.4,.2,1,0,op,vp),0);const out=io.read(Uint8Array,op,n);assert.deepEqual(out,known);assert.equal(out.filter(Boolean).length,16);assert(8>16*.2&&8<63*.2,'The fixture distinguishes native area thresholds on admitted and bounding populations.');}finally{io.dispose();}
});

test('real exclusions cannot be filled as component holes and absent warp support remains explicit',async()=>{
 const m=await runtime(),io=buffers(m),w=9,h=9,n=w*h,known=Uint8Array.from({length:n},(_,i)=>{const x=i%w,y=Math.floor(i/w);return x>=3&&x<6&&y>=3&&y<6?0:1;}),gray=Float64Array.from(known,v=>v?.2:NaN),roi=new Float64Array(n).fill(1),matrix=[1,0,0,0,1,0],points=[1,1,7,1,1,7,7,7];
 try{const ip=io.add(Float64Array,gray),kp=io.add(Uint8Array,known),rp=io.add(Float64Array,roi),mp=io.add(Float64Array,matrix),pp=io.add(Float64Array,points),op=io.out(Uint8Array,n),vp=io.out(Uint8Array,n);assert.equal(m._ssg_strict_localize(ip,kp,rp,mp,pp,4,w,h,.4,0,1,1,op,vp),0);assert.deepEqual(io.read(Uint8Array,op,n),known);
  const empty=new Uint8Array(n),ep=io.add(Uint8Array,empty);assert.equal(m._ssg_strict_localize(ip,ep,rp,mp,pp,0,w,h,.4,0,1,1,op,vp),0);assert(io.read(Uint8Array,op,n).every(v=>v===0));assert(io.read(Uint8Array,vp,n).every(v=>v===0));
 }finally{io.dispose();}
});

test('an allowed RGB envelope never turns its gap into candidate support or component connectivity',async()=>{
 const m=await runtime(),io=buffers(m),w=21,h=3,n=w*h,known=new Uint8Array(n).fill(1),candidates=Uint8Array.from({length:n},(_,i)=>i<42&&(i%w<4||i%w>=17)?1:0),gray=new Float64Array(n).fill(.3),roi=new Float64Array(n).fill(1),matrix=[1,0,0,0,1,0],points=[0,0,1,0,2,1,17,0,18,0,19,1];
 try{const ip=io.add(Float64Array,gray),kp=io.add(Uint8Array,known),cp=io.add(Uint8Array,candidates),rp=io.add(Float64Array,roi),mp=io.add(Float64Array,matrix),pp=io.add(Float64Array,points),op=io.out(Uint8Array,n),vp=io.out(Uint8Array,n);assert.equal(m._ssg_strict_localize(ip,kp,rp,mp,pp,6,w,h,.4,.2,1,0,op,vp,cp),0);assert.deepEqual(io.read(Uint8Array,op,n),candidates);assert.deepEqual(io.read(Uint8Array,vp,n),candidates);}finally{io.dispose();}
});
