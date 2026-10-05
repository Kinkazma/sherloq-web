import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createEngine,exportAnalysis} from '../src/index.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const reference=JSON.parse(await readFile(new URL('../fixtures/pixel-reference.json',import.meta.url)));
async function load(e,fixture=reference.cases.find(c=>c.name==='defects')){const data=new Uint8Array(await readFile(new URL('../fixtures/'+fixture.file,import.meta.url)));await e.load({id:'i',bytes:data,pixels:{width:fixture.width,height:fixture.height,format:'rgb8',data},provenance:{source:'synthetic raw RGB fixture'}});return fixture;}
const task=operation=>({id:'t',imageId:'i',operation});
test('Pixel operations share admission, lifecycle, provenance and defensive cache ownership',async()=>{
 const e=createEngine();await load(e);
 for(const operation of ['inspection.histogram','colors.stats','noise.planes','noise.minmax','pixels.defects']){
  const a=await e.run(task(operation)),b=await e.run(task(operation));assert.equal(a.metrics.cache.result,false);assert.equal(b.metrics.cache.result,true);assert.deepEqual(a.provenance,b.provenance);assert.equal(a.provenance.decode.source,'synthetic raw RGB fixture');
  if(b.pixels)b.pixels.data.fill(0);if(b.data?.bins)b.data.bins.fill(0);if(b.data?.candidates)b.data.candidates.fill(0);for(const m of Object.values(b.masks??{}))m.data.fill(0);
  const c=await e.run(task(operation));assert.deepEqual(c.pixels,a.pixels);assert.deepEqual(c.masks,a.masks);assert.deepEqual(c.data,a.data);
  const exported=exportAnalysis(c);const restored=JSON.parse(new TextDecoder().decode(exported.bytes));assert.equal(restored.provenance.originalSha256,a.provenance.originalSha256);if(c.pixels)assert.deepEqual(restored.pixels.data,Array.from(c.pixels.data));
 }
 const ranged=await e.run({...task('inspection.histogram'),params:{start:127,end:128,channel:0}});assert.equal(ranged.metrics.cache.result,true);assert.equal(ranged.data.summary.start,127);
 e.unload('i');assert.equal(e.capabilities().memory.cacheBytes,0);assert.equal(e.capabilities().memory.retainedBytes,0);e.dispose();
});
test('Defect CSV bytes match native export for all radius/kind/view/threshold variants',async()=>{
 const e=createEngine(),fixture=await load(e);
 for(const expected of fixture.expected.filter(x=>x.operation==='pixels.defects')){
  const result=await e.run({...task(expected.operation),params:expected.params});assert.equal(sha(exportAnalysis(result,{format:'csv'}).bytes),expected.csvSha256,JSON.stringify(expected.params));
 }
 const result=await e.run(task('pixels.defects'));assert.throws(()=>exportAnalysis(result,{maxBytes:10}),{code:'MEMORY_LIMIT'});assert.throws(()=>exportAnalysis(result,{format:'npz'}),{code:'UNSUPPORTED_EXPORT'});e.dispose();
});
test('Cancellation does not publish or retain partial masks and results',async()=>{
 const e=createEngine();await load(e);
 for(const operation of ['inspection.histogram','colors.stats','noise.planes','noise.minmax','pixels.defects']){
  const c=new AbortController();await assert.rejects(e.run(task(operation),{signal:c.signal,onProgress:()=>c.abort()}),{code:'CANCELLED'});assert.equal(e.capabilities().memory.activeReservationBytes,0);assert.equal(e.capabilities().memory.cacheBytes,0);
 }
 const first=e.run(task('pixels.defects'));await assert.rejects(e.run(task('colors.stats')),{code:'BUSY'});await first;
 await assert.rejects(e.run({...task('colors.stats'),backend:'gpu'}),{code:'UNSUPPORTED_BACKEND'});await assert.rejects(e.run({...task('noise.planes'),regions:[[0,0,1,1]]}),{code:'UNSUPPORTED_REGION'});e.dispose();
 const limited=createEngine({memoryBudgetBytes:33*1024**2});const n=128*128*3;await limited.load({id:'i',bytes:new Uint8Array([1]),pixels:{width:128,height:128,format:'rgb8',data:new Uint8Array(n)}});await assert.rejects(limited.run(task('pixels.defects')),{code:'MEMORY_LIMIT'});assert.equal(limited.capabilities().memory.activeReservationBytes,0);limited.dispose();
});
