import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {contiguousSurface} from '../src/image-sources.js';
import {waveletParams,waveletPixels,wavelets} from '../src/wavelets.js';import {segmentedWavelet} from '../src/segmented-wavelet.js';
const image=(width,height)=>({width,height,data:Uint8Array.from({length:width*height*3},(_,i)=>(i*73+Math.floor(i/7)*19)%256)});
test('complete-axis strips preserve all 59 native wavelets and all threshold modes',async()=>{
 const input=image(83,79),budget=new Budget(64*1024**2),surface=contiguousSurface(input,budget);
 for(const wavelet of wavelets){let cache;
  try{for(const mode of ['soft','hard','garrote','greater','less']){
   const p=waveletParams({wavelet,mode,threshold:31,level:3}),expected=await waveletPixels(input,p,{}),actual=await segmentedWavelet({surface},p,{budget,blockPixels:499,cache});cache=actual.waveletCache;
   const view=await actual.surface.readWindow();assert.deepEqual(view.pixels.data,expected.pixels.data,`${wavelet}/${mode}`);view.release();await actual.surface.dispose();
  }}finally{await cache?.dispose();}assert.equal(budget.total(),0);
 }
});
test('odd reconstruction cropping, zero threshold and cancellation clean temporary planes',async()=>{
 const input=image(37,29),budget=new Budget(32*1024**2),surface=contiguousSurface(input,budget);let live=0;
 const session={async create(length){live++;const bytes=new Uint8Array(length);return {readInto(out,offset){out.set(bytes.subarray(offset,offset+out.length));},write(src,offset){bytes.set(src,offset);},flush(){},dispose(){live--;}};}};
 for(const phase of ['blue-channel','decompose-0-vertical','reconstruct-0-vertical','render']){
  const controller=new AbortController();await assert.rejects(segmentedWavelet({surface,session},{wavelet:'db2',threshold:0},{budget,storage:'temporary',blockPixels:149,signal:controller.signal,onProgress:p=>{if(p.phase===phase)controller.abort();}}),{code:'CANCELLED'});assert.equal(live,0);assert.equal(budget.total(),0);
 }
 const p=waveletParams({wavelet:'db2',threshold:0}),r=await segmentedWavelet({surface,session},p,{budget,storage:'temporary',blockPixels:149}),v=await r.surface.readWindow(),e=await waveletPixels(input,p,{});assert.deepEqual(v.pixels.data,e.pixels.data);v.release();await r.surface.dispose();await r.waveletCache.dispose();assert.equal(live,0);assert.equal(budget.total(),0);
});
