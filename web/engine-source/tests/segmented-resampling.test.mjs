import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {Budget} from '../src/cache.js';import {loadSegmentedJpeg,disposeSegmentedImage} from '../src/image-sources.js';import {segmentedResamplingFourier} from '../src/segmented-resampling.js';import {compareFourier} from './resampling-reference.js';
const root=new URL('../fixtures/',import.meta.url),read=name=>fs.readFile(new URL(name,root)),reference=JSON.parse(await read('resampling/reference.json')),payload=new Uint8Array(gunzipSync(await read('resampling/reference.bin.gz')));
const release=async r=>Promise.all([r.surface,...Object.values(r.tableRecords).map(t=>t.surface)].map(s=>s.dispose()));
async function values(table){const page=await table.readRows({offset:0,length:table.descriptor.rowCount});try{return Float64Array.from({length:page.length},(_,i)=>page.data[i*3+2]);}finally{page.release();}}
test('segmented Fourier retains native original grayscale, ROI, windows and all presentations',async()=>{
 // Progressive JPEG needs its admitted 67 MiB decoder workspace before Fourier.
 // Keep this native-parity test in RAM; Node has no browser temporary storage.
 for(const image of reference.images.filter(i=>i.file.endsWith('.jpg'))){const budget=new Budget(96*1024**2),source=await loadSegmentedJpeg(new Blob([await read(image.file)]),{budget});assert.equal(source.metrics.storage,'memory');let cache;
  try{for(const item of image.cases){const r=await segmentedResamplingFourier(source,item.params,{budget,cache,blockPixels:4096});cache=r.resamplingCache;const part=await r.surface.readWindow();try{compareFourier({data:{...r.data,values:await values(r.tableRecords.values.surface)},pixels:part.pixels},item,payload,image.file);assert.deepEqual(r.data.grayNormalization,{minimum:image.minimum,maximum:image.maximum,scope:'whole decoded original grayscale image'});}finally{part.release();await release(r);}}}
  finally{await cache?.dispose();await disposeSegmentedImage(source);}assert.equal(budget.total(),0);
 }
});
test('resampling view-only cache, independent table leases and cancelled strip cleanup',async()=>{
 const budget=new Budget(64*1024**2),source=await loadSegmentedJpeg(new Blob([await read('synthetic.jpg')]),{budget}),results=[];let cache;
 try{const first=await segmentedResamplingFourier(source,{},{budget,blockPixels:4096});results.push(first);cache=first.resamplingCache;const expected=await values(first.tableRecords.magnitude.surface),phases=[],second=await segmentedResamplingFourier(source,{gamma:2.5},{budget,cache,blockPixels:4096,onProgress:p=>phases.push(p.phase)});results.push(second);assert(second.metrics.spectrumCached&&second.metrics.magnitudeCached);assert(phases.every(p=>p==='resampling-view'));
  const repeat=await segmentedResamplingFourier(source,{gamma:2.5},{budget,cache});results.push(repeat);assert.equal(repeat.metrics.workers,0);
  for(const phase of ['resampling-window','resampling-pyrup','resampling-fft-rows','resampling-fft-columns','resampling-magnitude','resampling-view']){const baseline=budget.total(),stop=new AbortController();await assert.rejects(segmentedResamplingFourier(source,{window:'radial',gamma:3},{budget,cache,blockPixels:4096,signal:stop.signal,onProgress:p=>{if(p.phase===phase)stop.abort();}}),{code:'CANCELLED'});assert.equal(budget.total(),baseline,phase);}
  results.push(await segmentedResamplingFourier(source,{window:'radial'},{budget,cache,blockPixels:4096}));await cache.dispose();assert.deepEqual(await values(first.tableRecords.magnitude.surface),expected);
 }finally{await Promise.all(results.map(release));await cache?.dispose();await disposeSegmentedImage(source);}assert.equal(budget.total(),0);
});
