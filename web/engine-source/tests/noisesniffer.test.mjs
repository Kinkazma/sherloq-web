import {residentBudget} from './resident-budget.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {initCvWasm,cvNoisesnifferStatistics,cvNoisesnifferTailFunction} from '../src/opencv.js';import {createEngine} from '../src/index.js';
import {noisesnifferCorpus} from './noisesniffer-corpus.js';import {noisesnifferLifecycle} from './noisesniffer-lifecycle.js';
import {noisesnifferRegions,noisesnifferAdmission,noisesnifferParams} from '../src/noisesniffer.js';
import {noisesnifferLargeInput} from './noisesniffer-large-input.js';import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=async name=>new Uint8Array(await readFile(new URL('fixtures/'+name,root)));
await initCvWasm({wasmBinary:await readFile(new URL('vendor/opencv/opencv.wasm',root))});
test('Noisesniffer native statistics, unstable selection ties, positive regions and three views',async()=>{const p=await noisesnifferCorpus(read);assert.equal(p.status,'core-parity-passed');});
test('Noisesniffer original FMA statistics and independent DCT bands preserve each native value',async()=>{
 const ref=JSON.parse(new TextDecoder().decode(await read('noisesniffer-reference.json')));
 for(const f of ref.cases.filter(c=>c.name.startsWith('patch-'))){
  const image={width:f.width,height:f.height,data:await read(f.input.file)},original=await cvNoisesnifferStatistics(image,f.block,{fast:false}),optimized=await cvNoisesnifferStatistics(image,f.block,{fast:true});assert.deepEqual(optimized,original);
  const cols=original.width,rows=original.height,variance=new Float32Array(cols*rows*3);
  for(let band=0;band<7;band++){const y0=Math.floor(band*rows/7),y1=Math.floor((band+1)*rows/7),start=y0*image.width*3,end=(y1+f.block-1)*image.width*3,part=await cvNoisesnifferStatistics({width:image.width,height:y1-y0+f.block-1,data:image.data.slice(start,end)},f.block,{part:'dct'});for(let c=0;c<3;c++)variance.set(part.variance.subarray(c*cols*(y1-y0),(c+1)*cols*(y1-y0)),c*cols*rows+y0*cols);}
  assert.deepEqual(variance,original.variance);const base=await cvNoisesnifferStatistics(image,f.block,{part:'base'});assert.deepEqual(base.means,original.means);assert.deepEqual(base.valid,original.valid);
 }
});
test('Noisesniffer 1 MP statistics retain the full native bitstream without resizing',async()=>{
 const f=JSON.parse(new TextDecoder().decode(await read('noisesniffer-large-reference.json'))),image=noisesnifferLargeInput(f),hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');assert.equal(hash(image.data),f.inputSha256);
 for(const c of f.cases){const r=await cvNoisesnifferStatistics(image,c.block);for(const [key,sha] of Object.entries(c.statistics))assert.equal(hash(r[key]),sha,c.block+' '+key);}
 const tail=await cvNoisesnifferTailFunction();for(const t of f.tails){const value=tail(t.K,t.N,t.w,t.m),expected=t.logTail==='-Infinity'?-Infinity:t.logTail;assert.ok(value===expected||Math.abs(value-expected)<=1e-7+1e-13*Math.abs(expected),'Large binomial log survival');}
});
test('Noisesniffer public lifecycle, defensive buffers, stage/view caches and exports',async()=>{assert.equal((await noisesnifferLifecycle(()=>createEngine(),read)).status,'passed');});
test('Noisesniffer reports numerical ambiguity instead of silently changing a boundary decision',async()=>{
 const counts={gridWidth:1,gridHeight:1,all_blocks:Float64Array.of(1000),low_noise_blocks:Float64Array.of(900)};
 const normalization=Math.log(4.5)+Math.log(.316915)+Math.log(4.062570);
 await assert.rejects(noisesnifferRegions(10,10,3,10,.5,counts,{tail:()=>-normalization}),{code:'NUMERIC_RANGE'});
 await assert.rejects(noisesnifferRegions(10,10,3,10,.5,counts,{signal:AbortSignal.abort()}),{code:'CANCELLED'});
});
test('Noisesniffer budget and parameter rejection leave the source intact',async()=>{
 assert.throws(()=>noisesnifferAdmission({width:100000,height:100000},noisesnifferParams()),{code:'MEMORY_LIMIT'});
 const engine=createEngine({memoryBudgetBytes:residentBudget(16*1024**2)}),pixels={width:16,height:16,format:'rgb8',data:new Uint8Array(768)};
 try{await engine.load({id:'i',bytes:pixels.data,pixels});await assert.rejects(engine.run({id:'ns',imageId:'i',operation:'noise.noisesniffer'}),{code:'MEMORY_LIMIT'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.deepEqual(engine.imagePixels('i'),pixels);}finally{engine.dispose();}
});
