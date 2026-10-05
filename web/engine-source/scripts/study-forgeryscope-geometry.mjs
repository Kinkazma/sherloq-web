import {study} from './m2-browser-study.mjs';
await study('forgeryscope-geometry',async()=>{
  const {overlapFromAffine}=await import('/src/forgeryscope-geometry.js');
  const ref=await(await fetch('/tests/data/forgeryscope/geometry.json')).json();
  const wasm=await(await import('/.build/forgeryscope/prepare.mjs')).default(),records=[];
  for(const c of ref.cases){
    const ptrs=[],alloc=n=>{const p=wasm._malloc(n);if(!p)throw Error('allocation');ptrs.push(p);return p;};
    try{
      const count=c.scores.length,p0=alloc(count*8),p1=alloc(count*8),mp=alloc(48),ip=alloc(count);
      wasm.HEAPF32.set(c.points0.flat(),p0/4);wasm.HEAPF32.set(c.points1.flat(),p1/4);
      const status=wasm._fg_affine(p0,p1,count,+c.blot,mp,ip);
      if(status!==1)throw Error('affine '+status);
      const matrix=wasm.HEAPF64.slice(mp/8,mp/8+6),inliers=wasm.HEAPU8.slice(ip,ip+count);
      const result=overlapFromAffine(matrix,inliers,new Float32Array(c.scores),c.size0,c.size1,c.transform);
      const expected=c.expected.H_transformed.slice(0,2).flat();
      records.push({blot:c.blot,transform:c.transform,affineMaxError:Math.max(...matrix.map((x,i)=>Math.abs(x-expected[i]))),inliers:result.inliers,nativeInliers:c.expected.inliers,score:result.inlier_mean_score,nativeScore:c.expected.inlier_mean_score});
    }finally{for(const p of ptrs)wasm._free(p);}
  }
  return {records,passed:records.every(r=>r.affineMaxError<=1e-4&&r.inliers===r.nativeInliers&&r.score===r.nativeScore)};
});
