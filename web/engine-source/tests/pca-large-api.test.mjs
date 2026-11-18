import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';
const bits=value=>new Uint8Array(value.buffer,value.byteOffset,value.byteLength);

test('large contiguous Originals use bounded PCA and keep the independent OpenCV model/renders',async()=>{
 const width=1103,height=953,data=new Uint8Array(width*height*3);
 // A permutation of RGB24: every pixel is distinct. This also qualifies the
 // low-reuse projector fallback rather than only favourable repeated colours.
 for(let i=0;i<width*height;i++){const rgb=Math.imul(i,2654435761)&0xffffff;data[3*i]=rgb>>>16;data[3*i+1]=(rgb>>>8)&255;data[3*i+2]=rgb&255;}
 const image={width,height,format:'rgb8',data},reference=createEngine({cpuKernel:'reference',memoryBudgetBytes:512*1024**2}),engine=createEngine({memoryBudgetBytes:512*1024**2});
 try{
  for(const current of [reference,engine])await current.load({id:'same',bytes:data,pixels:image});
  for(const params of [{},{component:1,mode:'project',invert:true},{component:2,mode:'crossprod',equalize:true}]){
   const expected=await reference.run({id:'ref',imageId:'same',operation:'colors.pca',params}),actual=await engine.run({id:'optimized',imageId:'same',operation:'colors.pca',params});
   assert(expected.pixels);assert.equal(actual.layout,'surface');assert.equal(actual.data.cloud.total,width*height);
   if(params.mode==='project'){assert.equal(actual.metrics.projectionCache.disabledForLowReuse,true);assert.equal(actual.metrics.projectionCache.hits,0);assert(actual.metrics.projectionCache.misses<width*height);}
   for(const key of ['mean','eigenvectors','eigenvalues'])assert.deepEqual(bits(actual.data[key]),bits(expected.data[key]),key);
   const output=await engine.readPixels({surfaceId:actual.surface.id,revision:actual.surface.revision,rect:{x:0,y:0,width,height}});assert.deepEqual(output.pixels.data,expected.pixels.data);await engine.releaseSurface(actual.surface.id);
  }
 }finally{await reference.dispose();await engine.dispose();}
 for(const current of [reference,engine]){const m=current.capabilities().memory;assert.equal(m.retainedBytes,0);assert.equal(m.cacheBytes,0);assert.equal(m.activeReservationBytes,0);}
});
