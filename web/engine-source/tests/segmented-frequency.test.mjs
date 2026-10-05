import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {Budget} from '../src/cache.js';import {contiguousSurface} from '../src/image-sources.js';import {segmentedFrequency} from '../src/segmented-frequency.js';
const hash=a=>createHash('sha256').update(a).digest('hex');
test('segmented global frequency views preserve native low/high crop order, masks and display filtering',async()=>{
 const ref=JSON.parse(await fs.readFile(new URL('../fixtures/frequency-reference.json',import.meta.url))),budget=new Budget(64*1024**2);
 for(const c of ref.cases){let cache;const image={width:c.width,height:c.height,data:new Uint8Array(await fs.readFile(new URL('../fixtures/'+c.file,import.meta.url)))},surface=contiguousSurface(image,budget);
  try{for(const index of [0,2,31,65,107]){const e=c.expected[index],r=await segmentedFrequency({surface},e.params,{budget,cache,blockPixels:4096});cache=r.frequencyCache;assert.equal(r.data.zeroPercent,e.zeroPercent,c.name+' zeros');
   for(const [i,s]of [r.surface,...Object.values(r.rgbRecords).map(v=>v.surface)].entries()){const v=await s.readWindow();try{assert.equal(hash(v.pixels.data),e.sha256[i],c.name+' '+index+' view'+i);}finally{v.release();await s.dispose();}}await r.tableRecords.mask.surface.dispose();
  }}finally{await cache?.dispose();}assert.equal(budget.total(),0);
 }
});
test('frequency cancellation removes every intermediate and completed view without corrupting cached base',async()=>{
 const budget=new Budget(32*1024**2),image={width:37,height:31,data:Uint8Array.from({length:37*31*3},(_,i)=>(i*71+Math.floor(i/9))%256)},surface=contiguousSurface(image,budget);let live=0;
 const session={async create(length){live++;const bytes=new Uint8Array(length);return {readInto(out,offset){out.set(bytes.subarray(offset,offset+out.length));},write(src,offset){bytes.set(src,offset);},flush(){},dispose(){live--;}};}};
 for(const phase of ['frequency-gray','dft-rows','dft-columns','frequency-polar','frequency-mask-vertical','frequency-render']){const stop=new AbortController();await assert.rejects(segmentedFrequency({surface,session},{split:15,smooth:5,threshold:37},{budget,storage:'temporary',blockPixels:128,signal:stop.signal,onProgress:p=>{if(p.phase===phase)stop.abort();}}),{code:'CANCELLED'});assert.equal(live,0,phase);assert.equal(budget.total(),0,phase);}
 const r=await segmentedFrequency({surface,session},{},{budget,storage:'temporary',blockPixels:128}),baseline=live,stop=new AbortController();await assert.rejects(segmentedFrequency({surface,session},{threshold:37},{budget,cache:r.frequencyCache,storage:'temporary',blockPixels:128,signal:stop.signal,onProgress:p=>{if(p.phase==='dft-columns')stop.abort();}}),{code:'CANCELLED'});assert.equal(live,baseline);await r.surface.dispose();for(const v of Object.values(r.rgbRecords))await v.surface.dispose();await r.tableRecords.mask.surface.dispose();await r.frequencyCache.dispose();assert.equal(live,0);assert.equal(budget.total(),0);
});
test('display cache avoids transforms and retained results survive replacement, abort and cache eviction',async()=>{
 const budget=new Budget(64*1024**2),surface=contiguousSurface({width:37,height:31,data:Uint8Array.from({length:37*31*3},(_,i)=>(i*71+Math.floor(i/9))%256)},budget),image={surface};
 const results=[],release=async r=>Promise.all([r.surface,...Object.values(r.rgbRecords).map(v=>v.surface),r.tableRecords.mask.surface].map(v=>v.dispose()));
 const first=await segmentedFrequency(image,{},{budget});results.push(first);const cache=first.frequencyCache,old=await first.surface.readWindow(),oldHash=hash(old.pixels.data);old.release();
 const phases=[],filtered=await segmentedFrequency(image,{filter:3},{budget,cache,onProgress:p=>phases.push(p.phase)});results.push(filtered);assert.equal(filtered.metrics.analysisCached,true);assert.equal(filtered.metrics.displayCached,false);assert(phases.length&&phases.every(p=>p==='frequency-render'));
 const repeated=await segmentedFrequency(image,{filter:3},{budget,cache,onProgress:()=>assert.fail('Cached view must not calculate')});results.push(repeated);assert.equal(repeated.metrics.workers,0);assert.equal(repeated.metrics.displayCached,true);assert.notEqual(repeated.surface.descriptor.id,first.surface.descriptor.id);
 const baseline=budget.total(),stop=new AbortController();await assert.rejects(segmentedFrequency(image,{filter:5},{budget,cache,signal:stop.signal,onProgress:()=>stop.abort()}),{code:'CANCELLED'});assert.equal(budget.total(),baseline);
 const restored=await segmentedFrequency(image,{filter:3},{budget,cache});results.push(restored);assert.equal(restored.metrics.displayCached,true);
 results.push(await segmentedFrequency(image,{threshold:37},{budget,cache}));await cache.dispose();
 const still=await first.surface.readWindow();assert.equal(hash(still.pixels.data),oldHash);still.release();const page=await first.tableRecords.mask.surface.readRows({offset:0,length:2});assert.equal(page.length,2);page.release();
 await Promise.all(results.map(release));assert.equal(budget.total(),0);
});
