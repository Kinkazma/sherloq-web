import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {initSeparationWasm} from '../src/separation-math.js';import {initCvWasm} from '../src/opencv.js';import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';import {segmentedSeparation} from '../src/segmented-separation.js';
await initSeparationWasm({wasmBinary:await readFile(new URL('../vendor/separation/separation.wasm',import.meta.url))});await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const pixels={width:41,height:37,data:Uint8Array.from({length:41*37*3},(_,i)=>i*31^(i>>>3)),format:'rgb8'},op=OPENCV_OPERATIONS['noise.separation'];
async function source(limit=128*1024**2){const budget=new Budget(limit),store=await createSegmentedBytes(pixels.data.length,{budget});await store.write(pixels.data);return{budget,image:{surface:createRgbSurface(store,{...pixels,budget})}};}
async function exact(surface,expected){const w=await surface.readWindow();assert.deepEqual(w.pixels,expected);w.pixels.data.fill(91);w.release();}
test('All five cached filters preserve gray/color, denoised/residual and global display; levels do not refilter',async()=>{
 const {budget,image}=await source();let last;
 for(let mode=0;mode<5;mode++)for(const grayscale of [false,true])for(const denoised of [false,true])for(const [i,levels]of [32,0,255].entries()){
  const p=op.validate({mode,radius:mode%2?10:2,grayscale,denoised,levels}),expected=await op.compute(pixels,p,{}),r=await segmentedSeparation(image,p,{budget,rowsPerBlock:7,cacheKey:'source\0noise/'});
  assert.equal(r.metrics.analysisCacheHit,i>0);assert.equal(r.metrics.sourceReads===0,i>0);assert.equal(r.metrics.workers,i>0?0:1);await exact(r.surface,expected.pixels);if(last)await last.dispose();last=r.surface;assert.equal(budget.active,0);
 }
 assert.ok(budget.cacheBytes>0);budget.clearPrefix('source\0');assert.equal(budget.cacheBytes,0);const p=op.validate({mode:4,radius:2,grayscale:true,denoised:true,levels:255});await exact(last,(await op.compute(pixels,p,{})).pixels);await last.dispose();await image.surface.dispose();assert.equal(budget.total(),0);
});
test('Cache cancellation restores only complete private bases; pressure can evict cache without changing owned outputs',async()=>{
 const {budget,image}=await source(),p=op.validate({mode:1,radius:10,levels:32}),hooks={budget,cacheKey:'source\0noise/'},first=await segmentedSeparation(image,p,hooks),bytes=budget.cacheBytes;
 const controller=new AbortController();await assert.rejects(segmentedSeparation(image,{...p,levels:0},{...hooks,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(budget.active,0);assert.equal(budget.cacheBytes,bytes);assert.equal(budget.retained,pixels.data.length*2);
 const read=image.surface.readWindow;image.surface.readWindow=()=>assert.fail('Cached view must not read source');const second=await segmentedSeparation(image,{...p,levels:255},hooks);await exact(second.surface,(await op.compute(pixels,{...p,levels:255},{})).pixels);image.surface.readWindow=read;
 budget.room(budget.limit-budget.retained);assert.equal(budget.cacheBytes,0);await exact(first.surface,(await op.compute(pixels,p,{})).pixels);await first.surface.dispose();await second.surface.dispose();await image.surface.dispose();assert.equal(budget.total(),0);
 const f=await source(),cancel=new AbortController();await assert.rejects(segmentedSeparation(f.image,p,{budget:f.budget,cacheKey:'source\0noise/',rowsPerBlock:7,signal:cancel.signal,onProgress:()=>cancel.abort()}),{code:'CANCELLED'});assert.equal(f.budget.cacheBytes,0);assert.equal(f.budget.active,0);await f.image.surface.dispose();assert.equal(f.budget.total(),0);
});
test('RAM-only admission does not let optional cache force unavailable temporary output',async()=>{
 const {budget,image}=await source(64*1024**2+45000),p=op.validate({mode:1,levels:32}),r=await segmentedSeparation(image,p,{budget,cacheKey:'source\0noise/',rowsPerBlock:7});assert.equal(r.metrics.filterCacheStored,false);assert.equal(budget.cacheBytes,0);await exact(r.surface,(await op.compute(pixels,p,{})).pixels);await r.surface.dispose();await image.surface.dispose();assert.equal(budget.total(),0);
});
