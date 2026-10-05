import {residentBudget} from './resident-budget.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initCvWasm,cvComparison} from '../src/opencv.js';
import {createEngine} from '../src/index.js';
const reference=JSON.parse(await readFile(new URL('../fixtures/comparison-reference.json',import.meta.url)));
const hash=a=>createHash('sha256').update(a).digest('hex');
const input=async(f,field,id)=>{const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+f[field],import.meta.url)));return {id,bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}};};
const wasm=await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
test('Comparison guarded binary64 arithmetic equals software FMA on IEEE boundaries and rounding traps',()=>{
 for(const seed of [1,9744,0xabcdef01]){assert.equal(wasm._cv_comparison_fma_test(seed,2000000),0,'FMA seed '+seed);assert.equal(wasm._cv_comparison_simd_test(seed,2000000),0,'SIMD FMA seed '+seed);}
});
test('Comparison optimized Sewar scores are bit-identical to the selectable software FMA reference',async()=>{
 for(const f of reference.cases){
  const a=(await input(f,'first','i')).pixels,b=(await input(f,'second','r')).pixels;
  const optimized=await cvComparison(a,b,3),original=await cvComparison(a,b,3,{original:true});
  assert.deepEqual(optimized.values,original.values,f.name);
 }
 const engine=createEngine({cpuKernel:'reference'}),f=reference.cases.find(f=>f.name==='noise');
 try{await engine.load(await input(f,'first','i'));await engine.load(await input(f,'second','r'));const r=await engine.run({id:'reference',imageId:'i',operation:'comparison.image',params:{referenceImageId:'r',metrics:true}});assert.equal(r.metrics.kernel,'cpu-pinned-comparison-reference');}finally{engine.dispose();}
});
test('Comparison exposes all 20 native measures and all 528 exact display variants',async()=>{
 const engine=createEngine();try{for(const f of reference.cases){
  await engine.load(await input(f,'first','i'));await engine.load(await input(f,'second','r'));
  for(const v of f.views){
   const params={referenceImageId:'r',metrics:true,view:v.mode,equalized:v.equalized,grayscale:v.grayscale},r=await engine.run({id:'compare',imageId:'i',operation:'comparison.image',params});
   assert.deepEqual(Object.keys(r.data.values).sort(),Object.keys(f.values).sort(),f.name+' values');assert.deepEqual(Object.keys(r.data.errors).sort(),Object.keys(f.errors).sort(),f.name+' errors');
   for(const [name,value] of Object.entries(f.values)){const actual=r.data.values[name];if(typeof value==='string'||['ssimul','butter'].includes(name))assert.equal(actual,value,f.name+' '+name);else assert.ok(Math.abs(actual-value)<=1e-12*Math.max(1,Math.abs(value)),f.name+' '+name+' '+actual+' / '+value);}
   assert.ok(Math.abs(r.data.histogramCorrelationFullBins-f.histogramCorrelationFullBins)<=1e-12);assert.equal(r.data.histogramCorrelationBinDivisor,65536);assert.ok(r.data.warnings.hist_0);
   assert.equal(hash(r.pixels.data),v.sha256,f.name+' '+JSON.stringify(v));assert.equal(r.pixels.width,f.width);assert.equal(r.pixels.height,f.height);assert.equal(r.provenance.references[0].imageId,'r');
   // Returned records and pixels must never mutate any cached analysis.
   r.pixels.data.fill(17);r.data.values.rmse=-1;r.provenance.references[0].imageId='changed';
  }
  engine.unload('r');assert.equal(engine.capabilities().memory.cacheBytes,0);engine.unload('i');
 }}finally{engine.dispose();}
});
test('Pair cache tracks both image lifetimes, including reused IDs with identical original bytes',async()=>{
 const engine=createEngine(),f=reference.cases.find(f=>f.name==='noise'),first=await input(f,'first','i'),second=await input(f,'second','r'),task={id:'pair',imageId:'i',operation:'comparison.image',params:{referenceImageId:'r',view:'difference'}};
 try{
  await engine.load(first);await engine.load(second);
  const initial=await engine.run(task);assert.equal(initial.metrics.cache.result,false);
  assert.equal((await engine.run({...task,params:{...task.params,equalized:true}})).metrics.cache.analysis,true);
  await engine.run({id:'independent',imageId:'i',operation:'inspection.histogram'});
  const before=engine.capabilities().memory.cacheBytes;engine.unload('r');const after=engine.capabilities().memory.cacheBytes;assert.ok(after>0&&after<before);
  await assert.rejects(engine.run(task),{code:'NOT_FOUND'});
  // Caller-provided decoded pixels can differ despite identical original bytes.
  await engine.load({...second,pixels:first.pixels});const replacement=await engine.run(task);assert.equal(replacement.metrics.cache.result,false);assert.ok(replacement.pixels.data.every(x=>x===0));assert.notEqual(hash(initial.pixels.data),hash(replacement.pixels.data));
  const independent=await engine.run({id:'independent',imageId:'i',operation:'inspection.histogram'});assert.equal(independent.metrics.cache.result,true);
  engine.unload('i');assert.equal(engine.capabilities().memory.cacheBytes,0);engine.unload('r');assert.equal(engine.capabilities().memory.retainedBytes,0);
 }finally{engine.dispose();}
});
test('Comparison rejects invalid pairs, budgets and parameters; cancellation is recoverable',async()=>{
 const engine=createEngine(),f=reference.cases.find(f=>f.name==='constant'),first=await input(f,'first','i'),second=await input(f,'second','r'),task={id:'pair',imageId:'i',operation:'comparison.image',params:{referenceImageId:'r',metrics:true}};
 try{
  await engine.load(first);await engine.load(second);
  for(const params of [{},{referenceImageId:3},{referenceImageId:'r',view:'unknown'},{referenceImageId:'r',metrics:1},{referenceImageId:'r',hiddenResize:1}])await assert.rejects(engine.run({...task,params}),{code:'INVALID_INPUT'});
  await assert.rejects(engine.run({...task,backend:'webgpu'}),{code:'UNSUPPORTED_BACKEND'});await assert.rejects(engine.run({...task,regions:[{bounds:[0,0,1,1]}]}),{code:'UNSUPPORTED_REGION'});
  await engine.load(await input(reference.cases[0],'first','tiny'));await assert.rejects(engine.run({...task,params:{referenceImageId:'tiny'}}),{code:'INVALID_INPUT'});engine.unload('tiny');
  const controller=new AbortController();await assert.rejects(engine.run(task,{signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);
  const same=await engine.run({...task,params:{referenceImageId:'i',metrics:true}});assert.equal(same.data.values.psnr,'+Infinity');assert.equal(same.data.values.rmse,0);
  const json=JSON.parse(new TextDecoder().decode(engine.exportResult(same).bytes));assert.equal(json.data.values.psnr,'+Infinity');assert.equal(json.provenance.references[0].originalSha256,same.provenance.originalSha256);
  const csv=new TextDecoder().decode(engine.exportResult(same,{format:'csv'}).bytes);assert.ok(csv.includes('psnr,+Infinity,defined'));assert.ok(csv.includes('histogramCorrelationFullBins'));
 }finally{engine.dispose();}
 const limited=createEngine({memoryBudgetBytes:residentBudget(16*1024**2)});try{await limited.load(first);await limited.load(second);assert.equal((await limited.run({...task,params:{referenceImageId:'r'}})).status,'ok');await assert.rejects(limited.run(task),{code:'MEMORY_LIMIT'});assert.equal(limited.capabilities().memory.activeReservationBytes,0);}finally{limited.dispose();}
});
