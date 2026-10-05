import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {imageCodec} from '../src/codecs.js';import {Budget} from '../src/cache.js';import {contiguousSurface} from '../src/image-sources.js';import {segmentedRecompressionLosses} from '../src/segmented-recompression.js';import {recompressionLosses} from '../src/jpeg-recompression.js';
test('scanline recompression equals the qualified full-frame arithmetic including Q0 and odd dimensions',async()=>{
 for(const name of ['recompression-0.png','ela-content.png']){const image=await imageCodec.decode(new Uint8Array(await readFile(new URL('./data/'+name,import.meta.url)))),budget=new Budget(48*1024**2),surface=contiguousSurface(image,budget),qualities=[0,1,30,75,99,100];
 const expected=await recompressionLosses(image,qualities,{}, {codec:imageCodec}),actual=await segmentedRecompressionLosses(surface,qualities,{budget});assert.deepEqual(actual.raw,expected.raw,name);assert.equal(actual.metrics.codecHeapMaximumBytes,32*1024**2);assert.equal(budget.active,0);await surface.dispose();
 }
});
test('completed quality checkpoint survives direct cancellation and budget refusal is explicit',async()=>{
 const budget=new Budget(48*1024**2),surface=contiguousSurface({width:17,height:19,format:'rgb8',data:Uint8Array.from({length:17*19*3},(_,i)=>i*37) },budget),controller=new AbortController(),done=[];
 await assert.rejects(segmentedRecompressionLosses(surface,[0,1,2],{budget,signal:controller.signal,onQuality:(q,loss)=>{done.push([q,loss]);controller.abort();}}),{code:'CANCELLED'});assert.equal(done.length,1);assert.equal(done[0][0],0);assert.equal(budget.active,0);
 await assert.rejects(segmentedRecompressionLosses(surface,[0],{budget:new Budget(1024)}),{code:'MEMORY_LIMIT'});await surface.dispose();
});
test('all eight oriented surfaces preserve full-frame JPEG arithmetic',async()=>{
 const {createRgbSurface}=await import('../src/rgb-surface.js'),{orientRgb}=await import('../src/image-headers.js'),image={width:31,height:23,format:'rgb8',data:Uint8Array.from({length:31*23*3},(_,i)=>i*43)},qualities=[1,75,100];
 for(let orientation=1;orientation<=8;orientation++){
  const budget=new Budget(48*1024**2),store={byteLength:image.data.length,readInto(target,offset){target.set(image.data.subarray(offset,offset+target.length));}},surface=createRgbSurface(store,{width:image.width,height:image.height,orientation,budget,ownsStore:false}),oriented=await orientRgb(image,orientation),expected=await recompressionLosses(oriented,qualities,{}, {codec:imageCodec}),actual=await segmentedRecompressionLosses(surface,qualities,{budget});assert.deepEqual(actual.raw,expected.raw,'orientation '+orientation);assert.equal(budget.active,0);await surface.dispose();
 }
});
