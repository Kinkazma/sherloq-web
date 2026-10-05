import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {histogramParams} from '../src/histogram.js';import {segmentedHistogram} from '../src/segmented-histogram.js';
const reference=JSON.parse(await readFile(new URL('../fixtures/pixel-reference.json',import.meta.url)));
test('Segmented histogram preserves native global counts/unique colors/summaries at non-pixel-aligned seams',async()=>{
 let cases=0;for(const fixture of reference.cases){const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+fixture.file,import.meta.url))),budget=new Budget(8*1024**2),store=await createSegmentedBytes(bytes.length,{budget,chunkBytes:113});await store.write(bytes);
  try{for(const e of fixture.expected.filter(x=>x.operation==='inspection.histogram')){const actual=await segmentedHistogram(store,histogramParams(e.params),{budget});assert.deepEqual(Array.from(actual.data.bins),e.bins.flat());assert.equal(actual.data.uniqueColors,e.uniqueColors);assert.equal(actual.data.uniqueRatio,e.uniqueRatio);assert.deepEqual(actual.data.summary,e.summary);cases++;}assert.equal(budget.active,0);}finally{await store.dispose();}assert.equal(budget.total(),0);
 }assert.ok(cases>100);
});
