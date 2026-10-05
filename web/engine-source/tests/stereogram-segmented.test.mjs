import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {contiguousSurface} from '../src/image-sources.js';import {segmentedStereogram} from '../src/segmented-stereogram.js';
const file=f=>readFile(new URL('../fixtures/'+f,import.meta.url)),refs=JSON.parse(await file('stereo-reference.json')),hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
test('segmented stereo preserves all searches, four views, raw flow and absence',async()=>{
 let views=0;
 for(const f of refs.cases){const budget=new Budget(512*1024**2),image={surface:contiguousSurface({width:f.width,height:f.height,data:new Uint8Array(await file(f.file))},budget)};let cache;
  for(let mode=0;mode<(f.offset===null?1:4);mode++){const r=await segmentedStereogram(image,{mode},{budget,cache,blockPixels:8192});cache=r.stereoCache;assert.equal(r.data.offset,f.offset);if(f.difference)assert.deepEqual(Array.from(r.data.differences),f.difference,f.name+' differences');if(f.offset===null){assert.equal(r.surface,null);continue;}const part=await r.surface.readWindow();assert.equal(hash(part.pixels.data),f.views[mode],f.name+'/'+mode);part.release();await r.surface.dispose();if(mode>=2){const plane=cache.flow.plane,v=await plane.read(0,0,plane.width,plane.height);assert.equal(hash(v),f.flowSha256,f.name+' flow');await r.tableRecords.flow.surface.dispose();}views++;}
  await cache.dispose();assert.equal(budget.total(),0,f.name+' lifetime');
 }console.log({nativeViews:views,searches:refs.cases.length});
});
test('stereo cancellation cleans incomplete work and old published views survive cache release',async()=>{
 const f=refs.cases.find(f=>f.name==='odd'),budget=new Budget(128*1024**2),image={surface:contiguousSurface({width:f.width,height:f.height,data:new Uint8Array(await file(f.file))},budget)};
 for(const phase of ['stereo-search','stereo-pattern','stereo-flow-input','stereo-flow','stereo-disparity-render']){const abort=new AbortController();await assert.rejects(segmentedStereogram(image,{mode:3},{budget,signal:abort.signal,onProgress:p=>{if(p.phase===phase)abort.abort();}}),{code:'CANCELLED'});assert.equal(budget.total(),0,phase);}
 const a=await segmentedStereogram(image,{mode:0},{budget}),b=await segmentedStereogram(image,{mode:2},{budget,cache:a.stereoCache});await b.stereoCache.dispose();const part=await a.surface.readWindow();assert.equal(hash(part.pixels.data),f.views[0]);part.release();await a.surface.dispose();await b.surface.dispose();await b.tableRecords.flow.surface.dispose();assert.equal(budget.total(),0);
});
