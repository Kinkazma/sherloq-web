import {byteView,byteLength as rangeLength} from '../src/memory-range.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {createBlobSource} from '../src/blob-source.js';
import {pagedJpegDctHistograms,decodePagedJpegRows} from '../src/jpeg-dct-paged.js';
import {initJpegWasm,jpegCodec,inspectJpeg} from '../src/jpeg.js';

const wasmBinary=await readFile(new URL('../vendor/jpeg-dct-paged/jpeg-dct-paged.wasm',import.meta.url));
const reference=JSON.parse(await readFile(new URL('../fixtures/double-jpeg-reference.json',import.meta.url)));
function storage({failWrite=false}={}){
 let alive=0,created=0;
 return {get alive(){return alive;},get created(){return created;},async create(byteLength){
  let data=new Uint8Array(byteLength);alive++;created++;
  return {byteLength,readInto:async(out,offset)=>byteView(out).set(data.subarray(offset,offset+rangeLength(out))),write:async(bytes,offset)=>{if(failWrite)throw Object.assign(Error('Injected I/O failure'),{code:'STORAGE_IO'});data.set(byteView(bytes),offset);},async dispose(){if(data){data=null;alive--;}}};
 }};
}
test('paged libjpeg coefficients equal all native histograms with forced backing stores',async()=>{
 let external=0;
 for(const item of reference.cases){
  const budget=new Budget(96*1024**2),session=storage(),bytes=await readFile(new URL('../fixtures/'+item.file,import.meta.url)),source=createBlobSource(new Blob([bytes]),{budget});
  const {histograms:hist,metrics}=await pagedJpegDctHistograms(source,{budget,getTemporarySession:async()=>session,wasmBinary,cacheBytes:65536});
  assert.deepEqual([...hist.subarray(0,2)],item.expected.dimensions,item.name);assert.equal(hist[2],item.expected.complete_blocks);assert.equal(!!hist[3],item.expected.progressive);
  for(let i=0;i<9;i++){const offset=4+i*258,expected=item.expected.records[i];assert.equal(hist[offset],expected.current_step);assert.equal(hist[offset+1],expected.ignored_tail);assert.deepEqual([...hist.subarray(offset+2,offset+258)],expected.histogram,item.name+'/'+i);}
  external+=metrics.coefficientStores;assert.equal(session.alive,0);assert.equal(budget.total(),0);source.dispose();
 }
 assert(external>0,'Must exercise backing storage, including progressive scans');
});
test('paged coefficients release stores and reservations on I/O failure, cancellation and truncation',async()=>{
 const bytes=await readFile(new URL('../fixtures/double-jpeg-progressive.jpg',import.meta.url));
 for(const mode of ['io','cancel','truncated']){
  const budget=new Budget(96*1024**2),session=storage({failWrite:mode==='io'}),controller=new AbortController(),source=createBlobSource(new Blob([mode==='truncated'?bytes.subarray(0,-200):bytes]),{budget});
  await assert.rejects(pagedJpegDctHistograms(source,{budget,getTemporarySession:async()=>session,wasmBinary,cacheBytes:65536,signal:controller.signal,onProgress:event=>{if(mode==='cancel'&&session.created&&event.encodedBytes>65536)controller.abort();}}),{code:mode==='io'?'STORAGE_IO':mode==='cancel'?'CANCELLED':'INVALID_INPUT'});
  assert.equal(session.alive,0,mode);assert.equal(budget.total(),0,mode);source.dispose();
 }
});
test('bounded coefficient admission fails before allocating storage',async()=>{
 const budget=new Budget(1024),session=storage(),source=createBlobSource(new Blob([new Uint8Array(2)]),{budget});
 await assert.rejects(pagedJpegDctHistograms(source,{budget,getTemporarySession:async()=>session,wasmBinary}),{code:'MEMORY_LIMIT'});
 assert.equal(session.created,0);assert.equal(budget.total(),0);source.dispose();
});
test('paged original RGB decode preserves baseline and progressive native-codec pixels',async()=>{
 await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});
 for(const item of reference.cases.filter(item=>item.name!=='orientation6')){
  const bytes=await readFile(new URL('../fixtures/'+item.file,import.meta.url)),expected=await jpegCodec.decode(bytes),header=inspectJpeg(bytes),budget=new Budget(96*1024**2),session=storage(),source=createBlobSource(new Blob([bytes]),{budget});
  const pixels=new Uint8Array(header.sourceWidth*header.sourceHeight*3),store={byteLength:pixels.length,write:(part,offset)=>pixels.set(byteView(part),offset),flush(){}};
  const metrics=await decodePagedJpegRows(source,header,store,{budget,getTemporarySession:async()=>session,wasmBinary,cacheBytes:65536});
  assert.deepEqual(pixels,expected.data,item.name);if(header.progressive)assert(metrics.coefficientStores>0,'Progressive coefficient backing required');assert.equal(metrics.decodedBytes,pixels.length);assert.equal(budget.total(),0);assert.equal(session.alive,0);source.dispose();
 }
});
test('progressive decode closes backing stores after output failure or cancellation',async()=>{
 const bytes=await readFile(new URL('../fixtures/double-jpeg-progressive.jpg',import.meta.url)),header=inspectJpeg(bytes);
 for(const mode of ['output','cancel']){
  const budget=new Budget(96*1024**2),session=storage(),source=createBlobSource(new Blob([bytes]),{budget}),controller=new AbortController(),store={byteLength:header.sourceWidth*header.sourceHeight*3,write(){if(mode==='output')throw Object.assign(Error('Injected output failure'),{code:'STORAGE_IO'});controller.abort();},flush(){}};
  await assert.rejects(decodePagedJpegRows(source,header,store,{budget,getTemporarySession:async()=>session,wasmBinary,cacheBytes:65536,signal:controller.signal}),{code:mode==='output'?'STORAGE_IO':'CANCELLED'});
  assert(session.created>0);assert.equal(session.alive,0);assert.equal(budget.total(),0);source.dispose();
 }
});
