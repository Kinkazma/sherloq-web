import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {contiguousSurface} from '../src/image-sources.js';import {segmentedComparison} from '../src/segmented-comparison.js';
const ref=JSON.parse(await readFile(new URL('../fixtures/comparison-reference.json',import.meta.url))),hash=a=>createHash('sha256').update(a).digest('hex');
async function pair(f,budget){return Promise.all([f.first,f.second].map(async file=>({surface:contiguousSurface({width:f.width,height:f.height,data:new Uint8Array(await readFile(new URL('../fixtures/'+file,import.meta.url)))},budget)})));}
test('comparison segmented input preserves all twenty metrics and four rendered views',async()=>{
 for(const f of ref.cases){const budget=new Budget(512*1024**2),[image,reference]=await pair(f,budget);let cache;
  for(const v of f.views){const p={referenceImageId:'reference',metrics:true,view:v.mode,equalized:v.equalized,grayscale:v.grayscale};const result=await segmentedComparison(image,p,{budget,reference,cache,blockPixels:f.width<=33?137:65536,profile:{maxWorkers:1}});cache=result.comparisonCache;
   for(const [name,value]of Object.entries(f.values)){const actual=result.data.values[name];if(typeof value!=='number')assert.equal(actual,value,`${f.name}/${name}`);else assert.ok(Math.abs(actual-value)<=(['ssimul','butter'].includes(name)?0:1e-12*Math.max(1,Math.abs(value))),`${f.name}/${name}: ${actual} != ${value}`);}
   assert.deepEqual(Object.keys(result.data.errors).sort(),Object.keys(f.errors).sort());const window=await result.surface.readWindow();assert.equal(hash(window.pixels.data),v.sha256,`${f.name}/${JSON.stringify(v)}`);window.release();await result.surface.dispose();assert.equal(budget.total(),0);globalThis.gc?.();
  }
  console.log('comparison reference passed:',f.name);
 }
});
test('comparison cancellation disposes output and preserves metric caches transactionally',async()=>{
 const f=ref.cases.find(f=>f.width>20),budget=new Budget(512*1024**2),[image,reference]=await pair(f,budget);
 for(const phase of ['comparison-basic','comparison-input','comparison-metric','comparison-difference']){const abort=new AbortController();await assert.rejects(segmentedComparison(image,{referenceImageId:'r',metrics:true,view:'difference'},{reference,budget,signal:abort.signal,onProgress:p=>{if(p.phase===phase)abort.abort();}}),{code:'CANCELLED'});assert.equal(budget.total(),0);}
 const low=new Budget(32*1024**2);await assert.rejects(segmentedComparison(image,{referenceImageId:'r',metrics:true},{reference,budget:low}),{code:'MEMORY_LIMIT'});assert.equal(low.total(),0);
});
