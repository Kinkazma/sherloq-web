import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {Budget} from '../src/cache.js';import {contiguousSurface} from '../src/image-sources.js';import {createBlobSource} from '../src/blob-source.js';import {segmentedBlocking} from '../src/segmented-blocking.js';import {blockingData,blockingView,blockingParams} from '../src/wavelet-blocking.js';
const root=new URL('../.build/blocking-stream/',import.meta.url),read=async(name,T=Uint8Array)=>{const b=await fs.readFile(new URL(name,root));return new T(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
test('original grayscale db8 axes, medians and rendered maps match native across orientation and block sizes',async()=>{
 const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root))),budget=new Budget(64*1024**2);
 for(const orientation of [1,6,8]){let cache;const cases=manifest.filter(c=>c.orientation===orientation),c=cases[0],image={width:c.width,height:c.height,data:await read(orientation+'.rgb')},surface=contiguousSurface(image,budget),source=createBlobSource(new Blob([await read(c.file)]),{budget});
  try{for(const c of cases){const r=await segmentedBlocking({surface,source},{block:c.block},{budget,cache,blockPixels:4096});assert.equal(r.metrics.detailCached,!!cache);cache=r.blockingCache;
   try{const pixels=await r.surface.readWindow();try{assert.deepEqual(pixels.pixels.data,await read(c.stem+'.rgb'));}finally{pixels.release();}
    const page=await r.tableRecords.noise.surface.readRows({length:c.rows*c.cols});try{assert.deepEqual(Float64Array.from({length:c.rows*c.cols},(_,i)=>page.data[i*3+2]),await read(c.stem+'.noise',Float64Array));}finally{page.release();}
    const csv=await r.tableRecords.noise.surface.readCsv({offset:1,length:2});assert.equal(new TextDecoder().decode(csv.bytes).trim().split('\r\n').length,Math.min(2,c.rows*c.cols-1));csv.release();
   }finally{await r.surface.dispose();await r.tableRecords.noise.surface.dispose();}
  }}finally{await cache?.dispose();source.dispose();}assert.equal(budget.total(),0);
 }
});
test('fallback loaded grayscale and cancellation retain global boundaries and clean stores',async()=>{
 const budget=new Budget(32*1024**2),image={width:51,height:43,data:Uint8Array.from({length:51*43*3},(_,i)=>(i*71+Math.floor(i/9))%256)},surface=contiguousSurface(image,budget);let live=0;
 const session={async create(length){live++;const bytes=new Uint8Array(length);return {readInto(out,offset){out.set(bytes.subarray(offset,offset+out.length));},write(src,offset){bytes.set(src,offset);},flush(){},dispose(){live--;}};}};
 for(const phase of ['gray-plane','db8-axis-0','db8-axis-1','noise-blocks','render']){const stop=new AbortController();await assert.rejects(segmentedBlocking({surface,session},{block:3},{budget,storage:'temporary',blockPixels:128,signal:stop.signal,onProgress:p=>{if(p.phase===phase)stop.abort();}}),{code:'CANCELLED'});assert.equal(live,0);assert.equal(budget.total(),0);}
 const p=blockingParams({block:3}),expected=await blockingView(await blockingData(image,p,{}, {bytes:new Uint8Array(),codec:{}}),p,{}),r=await segmentedBlocking({surface,session},p,{budget,storage:'temporary',blockPixels:128}),view=await r.surface.readWindow();assert.deepEqual(view.pixels.data,expected.pixels.data);view.release();await r.surface.dispose();await r.tableRecords.noise.surface.dispose();await r.blockingCache.dispose();assert.equal(live,0);assert.equal(budget.total(),0);
});
