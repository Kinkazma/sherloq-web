import test from'node:test';import assert from'node:assert/strict';import factory from'../vendor/segmentation/vig-window-math.js';import{createVigWindowMath}from'../src/mgcfdn-vig-window-math.js';
const module=await factory(),heap=64*1024**2;const exact=(a,b)=>assert.deepEqual(Buffer.from(a.buffer,a.byteOffset,a.byteLength),Buffer.from(b.buffer,b.byteOffset,b.byteLength));
function direct(arrays,length,run){const ps=[];const put=n=>{const p=module._malloc(n);assert.ok(p);ps.push(p);return p};try{const xs=arrays.map(a=>{const p=put(a.byteLength);module.HEAPF32.set(a,p/4);return p}),out=put(length*4);run(xs,out,put);return module.HEAPF32.slice(out/4,out/4+length);}finally{for(const p of ps.reverse())module._free(p);}}
test('Channel chunks preserve full native BN arithmetic and element chunks preserve VIG GELU',async()=>{
 const M=512,C=2560,x=Float32Array.from({length:C*M},(_,i)=>Math.sin(i*.013)),g=Float32Array.from({length:C},(_,i)=>(i%7+1)/8),b=Float32Array.from({length:C},(_,i)=>(i%13-6)/16),mean=Float32Array.from({length:C},(_,i)=>(i%3-1)/16),v=Float32Array.from({length:C},(_,i)=>(i%11+1)/16),math=createVigWindowMath({module,contextCells:M}),answer=await math.batchnorm(x,C,M,g,b,mean,v);
 const expected=direct([x,g,b,mean,v],x.length,([a,g,b,m,v],out,put)=>{const temp=put(C*8);for(let c=0;c<C;c+=640){assert.equal(module._d2prl_batchnorm_parameters(m+c*4,v+c*4,g+c*4,b+c*4,640,1e-5,temp+c*4,temp+(C+c)*4),1);assert.equal(module._d2prl_affine(a+c*M*4,temp+c*4,temp+(C+c)*4,640,M,0,out+c*M*4),1);}});exact(answer,expected);
 const gelu=await math.gelu(x),old=direct([x],x.length,([a],out)=>module._vig_gelu(a,x.length,out));exact(gelu,old);assert.equal(module.HEAPU8.length,heap);
});
test('New1context native KNN16-row orchestration is byteexact to old full256 normalize/distance/TopK/gather',async()=>{
 const M=256,x=Float32Array.from({length:640*M},(_,i)=>Math.sin(i*.037)+Math.cos(i*.013)),math=createVigWindowMath({module,contextCells:M}),answer=await math.neighbours(x,18,4);
 const expected=direct([x],1280*M,([a],out,put)=>{const normal=put(640*M*4),sums=put(M*4),distance=put(M*M*4),idx=put(M*72*4);module._vig_normalize(a,normal,sums);module._vig_distance_rows(normal,sums,0,M,distance);module._vig_topk_rows(distance,0,M,72,idx);module._vig_gather_rows(a,18,4,idx,0,M,out);});exact(answer,expected);
});
test('Actual M512 TopK/gather math consumes a complete512-target controlled distance matrix and reaches other contexts',async()=>{
 const M=512,x=Float32Array.from({length:640*M},(_,i)=>(i%M)/1024+Math.floor(i/M)/2048),math=createVigWindowMath({module,contextCells:M}),seen=[];
 const answer=await math.neighbours(x,9,4,{distanceRows:async({first,count,normal,sums},copy)=>{seen.push({first,count,targets:sums.length});assert.equal(normal.length,640*M);const scores=new Float32Array(count*M);for(let r=0;r<count;r++)for(let j=0;j<M;j++)scores[r*M+j]=(j*173+(first+r)*79)%M;copy(scores);}});
 assert.deepEqual(seen,[{first:0,count:512,targets:512}]);for(let r=0;r<M;r++){const neighbors=Array.from({length:M},(_,j)=>j).sort((a,b)=>((b*173+r*79)%M)-((a*173+r*79)%M)).slice(0,36).filter((_,j)=>j%4===0);assert.ok(neighbors.some(j=>j>=256));for(let c=0;c<640;c++){const center=x[c*M+r];let max=-Infinity;for(const j of neighbors)max=Math.max(max,Math.fround(x[c*M+j]-center));assert.equal(answer[c*2*M+r],center);assert.equal(answer[(c*2+1)*M+r],max);}}
});
