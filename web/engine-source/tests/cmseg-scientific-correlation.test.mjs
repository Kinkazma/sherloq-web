import test from 'node:test';
import assert from 'node:assert/strict';
import plainFactory from '../vendor/segmentation/correlation.js';
import fmaFactory from '../vendor/segmentation/correlation-fma.js';
import scopedFactory from '../vendor/segmentation/scientific-correlation/correlation.js';
import {cmsegDotShader} from '../experiments/segmentation/cmseg-dot-gpu.js';

function execute(module,{input,c=5,h=4,w=4,k=8,alpha=2.15,mask,fma=0,dots}){
 const n=h*w,pointers=[],alloc=(bytes)=>{const p=module._malloc(bytes);assert.ok(p);pointers.push(p);return p;},put=array=>{const p=alloc(array.byteLength);module.HEAPU8.set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength),p);return p;};
 try{
  const x=put(input),xn=alloc(input.byteLength),gy=alloc(h*4),gx=alloc(w*4),mx=alloc(n*4),iv=alloc(n*8),scratch=alloc(n*4),out=alloc(n*k*4),m=mask?put(mask):0;
  assert.equal(mask?module._cmseg_scoped_normalize(x,c,h,w,m,xn,gy,gx,fma):module._cmseg_normalize(x,c,h,w,xn,gy,gx),1);
  if(dots){const d=put(dots);assert.equal(module._cmseg_scoped_statistics_dots(d,c,h,w,alpha,gy,gx,m,0,n,mx,iv,scratch),1);assert.equal(module._cmseg_scoped_topk_dots(d,c,h,w,k,alpha,gy,gx,m,mx,iv,0,n,out,scratch),1);}
  else if(mask){assert.equal(module._cmseg_scoped_statistics(xn,c,h,w,alpha,gy,gx,m,0,n,mx,iv,scratch,fma),1);assert.equal(module._cmseg_scoped_topk(xn,c,h,w,k,alpha,gy,gx,m,mx,iv,0,n,out,scratch,fma),1);}
  else{assert.equal(module._cmseg_statistics(xn,c,h,w,alpha,gy,gx,0,n,mx,iv,scratch),1);assert.equal(module._cmseg_topk(xn,c,h,w,k,alpha,gy,gx,mx,iv,0,n,out,scratch),1);}
  return {output:module.HEAPF32.slice(out/4,out/4+n*k),normalized:module.HEAPF32.slice(xn/4,xn/4+c*n),maximum:module.HEAPF32.slice(mx/4,mx/4+n),inverse:module.HEAPF32.slice(iv/4,iv/4+n*2)};
 }finally{for(const p of pointers)module._free(p);}
}
const fixture=(n=80)=>Float32Array.from({length:n},(_,i)=>Math.fround(Math.sin(i*.71)+Math.cos(i*.17)*.2));
test('additive scientific WASM all-admitted domain preserves both pinned CPU operators byte for byte',async()=>{
 const scoped=await scopedFactory(),input=fixture(),original=input.slice(),mask=new Uint8Array(16).fill(1);
 for(const [factory,fma]of [[plainFactory,0],[fmaFactory,1]]){const native=execute(await factory(),{input}),actual=execute(scoped,{input,mask,fma});for(const key of Object.keys(native))assert.deepEqual(actual[key],native[key],key+' FMA '+fma);}
 assert.deepEqual(input,original);
});
test('scoped source and target correlations ignore excluded features before statistics and TopK',async()=>{
 const module=await scopedFactory(),input=fixture(),mask=Uint8Array.from({length:16},(_,i)=>Number(i%3===0)),altered=input.slice();
 for(let channel=0;channel<5;channel++)for(let i=0;i<16;i++)if(!mask[i])altered[channel*16+i]=(i%2?-1:1)*10000;
 for(const fma of [0,1]){const native=execute(module,{input,mask,fma}),changed=execute(module,{input:altered,mask,fma});assert.deepEqual(changed,native);assert(native.output.every(Number.isFinite));for(let i=0;i<16;i++)for(let k=0;k<8;k++)if(!mask[i]||k>=6)assert.equal(native.output[k*16+i],0);}
});
test('fully excluded native domain has zero finite output and GPU-dot postprocessing ignores invalid pairs',async()=>{
 const module=await scopedFactory(),input=fixture(),empty=new Uint8Array(16);assert(execute(module,{input,mask:empty}).output.every(v=>v===0));
 const mask=Uint8Array.from({length:16},(_,i)=>Number(i%3===0)),normalized=execute(module,{input,mask,fma:1}).normalized,dots=new Float32Array(256);
 for(let i=0;i<16;i++)for(let j=0;j<16;j++){let v=0;for(let c=0;c<5;c++)v=Math.fround(v+Math.fround(normalized[c*16+i]*normalized[c*16+j]));dots[i*16+j]=v;}
 const native=execute(module,{input,mask,dots}),corrupt=dots.slice();for(let i=0;i<16;i++)for(let j=0;j<16;j++)if(!mask[i]||!mask[j])corrupt[i*16+j]=1e30;
 assert.deepEqual(execute(module,{input,mask,dots:corrupt}),native);
 const shader=cmsegDotShader(24,128*128,true);assert.ok(shader.indexOf('scientific[i]==0u')<shader.indexOf('fma('));assert.match(shader,/scientific\[j\]==0u/);assert.doesNotMatch(cmsegDotShader(24,128*128),/scientific/);
});
test('additive scoped ABI fits every admitted largest hybrid tile inside its unchanged 32 MiB worker reservation',async()=>{
 for(const [c,h,w,k]of [[24,128,128,24],[32,64,64,32],[96,32,32,96]]){const module=await scopedFactory(),n=h*w,pointers=[];try{for(const floats of [c*n,c*n,h,w,n,2*n,n,k*n,256*n,Math.ceil(n/4)]){const p=module._malloc(floats*4);assert(p>0);pointers.push(p);assert(module.HEAPU8.byteLength<=32*1024**2);}}finally{for(const p of pointers)module._free(p);}}
});
