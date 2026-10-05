import {test} from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {segmentedPca} from '../src/segmented-pca.js';import {cvPcaModel,cvPcaView} from '../src/opencv.js';

test('segmented PCA keeps native basis and every view across chunk boundaries and orientation',async()=>{
 for(const [width,height,orientation] of [[1,1,1],[2,1,1],[3,1,1],[17,13,1],[17,13,6]]){
  const budget=new Budget(64*1024**2),rgb=Uint8Array.from({length:width*height*3},(_,i)=>(i*73+Math.floor(i/7)*19)%256),store=await createSegmentedBytes(rgb.length,{budget});await store.write(rgb);
  const surface=createRgbSurface(store,{width,height,orientation,budget}),window=await surface.readWindow(),image=window.pixels,expectedBasis=await cvPcaModel(image);window.release();
  for(const component of [0,1,2])for(const [modeIndex,mode] of ['distance','project','crossprod'].entries())for(const [invert,equalize] of [[false,false],[true,true]]){
   const actual=await segmentedPca({surface},{component,mode,invert,equalize},{budget,blockPixels:7});
   assert.deepEqual(actual.basis,expectedBasis,`${width}x${height} basis`);
   const result=await actual.surface.readWindow(),expected=await cvPcaView(image,expectedBasis,[component,modeIndex,+invert,+equalize]);
   assert.deepEqual(result.pixels.data,expected.data,`${width}x${height}/${orientation}/${component}/${mode}/${invert}/${equalize}`);
   result.release();await actual.surface.dispose();
  }
  await surface.dispose();assert.equal(budget.total(),0);
 }
});

test('temporary PCA arrays close on cancellation and preserve source on failed writes',async()=>{
 const budget=new Budget(32*1024**2),rgb=new Uint8Array(31*23*3).map((_,i)=>i*41),store=await createSegmentedBytes(rgb.length,{budget});await store.write(rgb);
 let created=0,disposed=0;
 const session={async create(length){created++;const data=new Uint8Array(length);return {readInto(target,offset){target.set(data.subarray(offset,offset+target.length));},write(source,offset){data.set(source,offset);},flush(){},dispose(){disposed++;}};}};
 const image={surface:createRgbSurface(store,{width:31,height:23,budget}),session};
 for(const phase of ['mean','covariance','projection','normalize','equalize']){
  const controller=new AbortController();await assert.rejects(segmentedPca(image,{equalize:true},{budget,storage:'temporary',blockPixels:31,signal:controller.signal,onProgress:p=>{if(p.phase===phase)controller.abort();}}),{code:'CANCELLED'});
  assert.equal(budget.active,0);assert.equal(budget.retained,rgb.length);assert.equal(created,disposed);
 }
 const result=await segmentedPca(image,{mode:'crossprod',equalize:true},{budget,storage:'temporary',blockPixels:31});assert.equal(result.surface.descriptor.storage,'temporary');await result.surface.dispose();assert.equal(created,disposed);
 image.session={async create(){return {write(){throw Object.assign(new Error('quota'),{code:'STORAGE_QUOTA'});},dispose(){}};}};
 await assert.rejects(segmentedPca(image,{}, {budget,storage:'temporary',blockPixels:31}),{code:'STORAGE_QUOTA'});assert.equal(budget.active,0);assert.equal(budget.retained,rgb.length);
 await image.surface.dispose();assert.equal(budget.total(),0);
});
