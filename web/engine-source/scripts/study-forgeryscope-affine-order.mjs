import {study} from './m2-browser-study.mjs';
await study('forgeryscope-affine-order',async()=>{
 const ref=await(await fetch('/tests/data/forgeryscope/affine-fma.json')).json(),build=await(await fetch('/.build/forgeryscope/affine-build.json')).json(),m=await(await import('/.build/forgeryscope/prepare.mjs')).default(),n=ref.points.length,ptrs=[],alloc=size=>{const p=m._malloc(size);ptrs.push(p);return p;};
 try{const a=alloc(n*8),b=alloc(n*8),h=alloc(48),mask=alloc(n);m.HEAPF32.set(ref.points.flat(),a/4);m.HEAPF32.set(ref.points.flat(),b/4);const status=m._fg_affine(a,b,n,1,h,mask),matrix=Array.from(m.HEAPF64.slice(h/8,h/8+6)),inliers=m.HEAPU8.slice(mask,mask+n).reduce((a,b)=>a+b,0),maxError=Math.max(...matrix.map((v,i)=>Math.abs(v-ref.matrix[i])));return {build,points:n,status,matrix,nativeMatrix:ref.matrix,inliers,maxError,passed:status===1&&inliers===ref.inliers&&maxError===0};}finally{for(const p of ptrs)m._free(p);}
});
