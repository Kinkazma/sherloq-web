import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {initCvWasm,cvDecode} from '../src/opencv.js';
import {createBlobSource} from '../src/blob-source.js';
import {contiguousSurface} from '../src/image-sources.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionRecord} from '../src/source-region-record.js';
import {createResamplingGray} from '../src/resampling-gray-source.js';
import {segmentedBlocking} from '../src/segmented-blocking.js';
import {segmentedResamplingAnalysis} from '../src/segmented-resampling-analysis.js';

const fixtures=new URL('./',import.meta.resolve('./data/png-formats/reference.json'));
const manifest=JSON.parse(await readFile(new URL('reference.json',fixtures)));
await initCvWasm({wasmBinary:await readFile(new URL('opencv.wasm',import.meta.resolve('../vendor/opencv/opencv.js')))});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(bytes,format){
 const budget=new Budget(256*1024**2),pixels=await cvDecode(bytes),gray=await cvDecode(bytes,{grayscale:true}),surface=contiguousSurface(pixels,budget),source=createBlobSource(new Blob([bytes]),{budget}),original={surface,source,sha256:sha(bytes),provenance:{format}},state=await createOriginalSourceRegionsState({sourceSha256:sha(bytes),width:pixels.width,height:pixels.height});
 const bounds={x0:3,y0:5,x1:Math.min(pixels.width-2,130),y1:Math.min(pixels.height-3,94)};
 await state.add('acquisition',bounds);const domain=await compileOriginalSourceRegions(state.snapshot()),record=createSourceRegionRecord(original,domain,{budget}),native=new Uint8Array(domain.width*domain.height);
 for(let y=0;y<domain.height;y++)native.set(gray.data.subarray((y+bounds.y0)*pixels.width+bounds.x0,(y+bounds.y0)*pixels.width+bounds.x1),y*domain.width);
 return{budget,record,domain,native,original,async close(){await record.surface.dispose();await surface.dispose();source.dispose();assert.equal(budget.total(),0);}};
}
test('actual original PNG file-gray crops preserve native libpng samples including16bit and EXIF orientation',async()=>{
 for(const row of manifest.cases.filter(c=>c.width>10&&c.height>10)){
  const h=await fixture(await readFile(new URL(row.file,fixtures)),'png');let actual;
  try{actual=await createResamplingGray(h.record,{budget:h.budget,raw:true});const part=await actual.surface.readWindow();try{assert.deepEqual(part.pixels.data,h.native,row.file);assert.deepEqual(part.origin,[0,0]);assert.equal(part.surfaceId,actual.surface.descriptor.id);assert.equal(part.revision,actual.surface.descriptor.revision);}finally{part.release();}const sub=await actual.surface.readWindow({x:1,y:2,width:1,height:1});try{assert.equal(sub.pixels.data[0],h.native[2*h.domain.width+1],row.file);assert.deepEqual(sub.origin,[1,2]);assert.equal(sub.surfaceId,actual.surface.descriptor.id);assert.equal(sub.revision,actual.surface.descriptor.revision);}finally{sub.release();}}
  finally{await actual?.dispose();await h.close();}
 }
});
test('native interpolation EM reuses the exact file-gray rectangle and its reductions across retained stages',async()=>{
 const row=manifest.cases.find(c=>c.depth===16&&c.colorType===2),h=await fixture(await readFile(new URL(row.file,fixtures)),'png'),rgb=new Uint8Array(h.native.length*3);for(let i=0;i<h.native.length;i++)rgb.fill(h.native[i],i*3,i*3+3);const independent=contiguousSurface({width:h.domain.width,height:h.domain.height,format:'rgb8',data:rgb},h.budget);let cache,referenceCache;
 const disposeResult=async r=>{if(!r)return;await r.surface.dispose();await Promise.all(Object.values(r.rgbRecords).map(v=>v.surface.dispose()));await Promise.all(Object.values(r.tableRecords).map(v=>v.surface.dispose()));};
 try{for(const size of[3,5]){let actual,expected;try{
  actual=await segmentedResamplingAnalysis(h.record,{size},{budget:h.budget,cache,profile:{maxWorkers:4}});cache=actual.emCache;
  expected=await segmentedResamplingAnalysis({surface:independent,bytes:Uint8Array.of(1)},{size},{budget:h.budget,cache:referenceCache,profile:{maxWorkers:4},decodeGray:async()=>({width:h.domain.width,height:h.domain.height,data:h.native})});referenceCache=expected.emCache;
  assert.equal(actual.metrics.grayCached,size===5);assert.deepEqual(actual.data.maps,expected.data.maps,'native EM geometry, iterations and convergence');
  for(const key of Object.keys(actual.tableRecords)){const a=await actual.tableRecords[key].surface.readRows({length:h.domain.width*h.domain.height}),b=await expected.tableRecords[key].surface.readRows({length:h.domain.width*h.domain.height});try{assert.deepEqual(a.data,b.data,'native binary64 '+key);}finally{a.release();b.release();}}
  const a=await actual.surface.readWindow(),b=await expected.surface.readWindow();try{assert.deepEqual(a.pixels.data,b.pixels.data,'native probability render');}finally{a.release();b.release();}
 }finally{await disposeResult(actual);await disposeResult(expected);}}}
 finally{await cache?.dispose();await referenceCache?.dispose();await independent.dispose();await h.close();}
});
test('actual JPEG native file-gray crop precedes extrema and preserves the native decoder coefficients',async()=>{
 const bytes=await readFile(new URL(import.meta.resolve('./data/recompression-segmented.jpg'))),h=await fixture(bytes,'jpeg');let actual;
 try{actual=await createResamplingGray(h.record,{budget:h.budget});const lo=Math.min(...h.native),hi=Math.max(...h.native);assert.deepEqual(actual.normalization,{minimum:lo,maximum:hi,scope:'whole admitted native file-gray rectangle'});assert.deepEqual(await actual.read(0,0,h.domain.width,h.domain.height),Float64Array.from(h.native,v=>hi>lo?(v-lo)/(hi-lo):0));}
 finally{await actual?.dispose();await h.close();}
});
test('native db8 blocking on an encoded rectangle equals the independent original-file grayscale crop, including cached block changes',async()=>{
 const selected=[manifest.cases.find(c=>c.depth===16&&c.colorType===2),manifest.cases.find(c=>c.orientation===6)].filter(Boolean),cases=await Promise.all(selected.map(async c=>({name:c.file,bytes:await readFile(new URL(c.file,fixtures)),format:'png'})));
 cases.push({name:'native JPEG',bytes:await readFile(new URL(import.meta.resolve('./data/recompression-segmented.jpg'))),format:'jpeg'});
 for(const entry of cases){const h=await fixture(entry.bytes,entry.format),rgb=new Uint8Array(h.native.length*3);for(let i=0;i<h.native.length;i++)rgb.fill(h.native[i],i*3,i*3+3);const independent=contiguousSurface({width:h.domain.width,height:h.domain.height,format:'rgb8',data:rgb},h.budget);let cache,referenceCache;
  try{for(const block of[3,4]){let actual,expected;try{actual=await segmentedBlocking(h.record,{block},{budget:h.budget,cache,blockPixels:4096});cache=actual.blockingCache;expected=await segmentedBlocking({surface:independent},{block},{budget:h.budget,cache:referenceCache,blockPixels:4096});referenceCache=expected.blockingCache;
   assert.deepEqual(actual.data.sourceDimensions,[h.domain.width,h.domain.height]);assert.equal(actual.data.sourceMode,'file grayscale');assert.equal(actual.metrics.detailCached,block===4);assert.deepEqual(await cache.detail.read(0,0,cache.detail.width,cache.detail.height),await referenceCache.detail.read(0,0,referenceCache.detail.width,referenceCache.detail.height),entry.name+' binary64 db8 detail');
   const a=await actual.surface.readWindow(),b=await expected.surface.readWindow();try{assert.deepEqual(a.pixels.data,b.pixels.data,entry.name+' RGB output');}finally{a.release();b.release();}
   const aNoise=await actual.tableRecords.noise.surface.readRows({length:actual.data.rows*actual.data.cols}),bNoise=await expected.tableRecords.noise.surface.readRows({length:expected.data.rows*expected.data.cols});try{assert.deepEqual(aNoise.data,bNoise.data,entry.name+' binary64 noise table');}finally{aNoise.release();bNoise.release();}
  }finally{await actual?.surface.dispose();await actual?.tableRecords.noise.surface.dispose();await expected?.surface.dispose();await expected?.tableRecords.noise.surface.dispose();}}}
  finally{await cache?.dispose();await referenceCache?.dispose();await independent.dispose();await h.close();}
 }
});
