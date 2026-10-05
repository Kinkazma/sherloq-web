import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {initAdjustWasm} from '../src/adjust-math.js';import {initCvWasm} from '../src/opencv.js';import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';import {segmentedAdjust} from '../src/segmented-adjust.js';
await initAdjustWasm({wasmBinary:await readFile(new URL('../vendor/adjust/adjust.wasm',import.meta.url))});await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const pixels={width:32,height:33,format:'rgb8',data:Uint8Array.from({length:32*33*3},(_,i)=>i*31^(i>>>3))},op=OPENCV_OPERATIONS['inspection.adjust'];
async function source(){const budget=new Budget(128*1024**2),store=await createSegmentedBytes(pixels.data.length,{budget});await store.write(pixels.data);return{budget,image:{surface:createRgbSurface(store,{...pixels,budget})}};}
async function exact(surface,expected){const w=await surface.readWindow();assert.deepEqual(w.pixels,expected);w.pixels.data.fill(91);w.release();}
test('Adjustment prefix caches skip source/local/global work for Otsu, fixed thresholds and inversion',async()=>{
 const {budget,image}=await source();let last;
 for(const [index,params]of [{gamma:3},{sharpen:100},{brightness:23,saturation:-17,hue:180,gamma:11,shadows:-25,highlights:30,width:77,sweep:23},{equalize:1},{equalize:3,sharpen:28},{equalize:5}].entries()){
  for(const [i,[threshold,invert]]of [[255,false],[0,false],[127,true],[255,true]].entries()){
   const p=op.validate({...params,threshold,invert}),expected=(await op.compute(pixels,p,{})).pixels,read=image.surface.readWindow;if(i)image.surface.readWindow=()=>assert.fail('Cache cannot reread original');let result;
   try{result=await segmentedAdjust(image,p,{budget,rowsPerBlock:3,cacheKey:'source\0adjust/'+index+'/'});}finally{image.surface.readWindow=read;}
   assert.equal(result.metrics.analysisCacheHit,i>0);assert.equal(result.metrics.workers,i?0:1);if(i)assert.equal(result.metrics.sourceReads,0);else assert.equal(result.metrics.prefixCacheStored,true);await exact(result.surface,expected);if(last)await last.dispose();last=result.surface;assert.equal(budget.active,0);
  }
 }
 assert.ok(budget.cacheBytes>0);budget.clearPrefix('source\0');assert.equal(budget.cacheBytes,0);await exact(last,(await op.compute(pixels,op.validate({equalize:5,invert:true}),{})).pixels);await last.dispose();await image.surface.dispose();assert.equal(budget.total(),0);
});
test('Adjustment cache is complete, private and evictable; cancelling cached or cold passes cleans partial output',async()=>{
 const {budget,image}=await source(),p=op.validate({sharpen:28,equalize:4}),hooks={budget,cacheKey:'source\0adjust/'};const first=await segmentedAdjust(image,p,hooks),before=budget.cacheBytes;
 const cancel=new AbortController();await assert.rejects(segmentedAdjust(image,{...p,threshold:0},{...hooks,signal:cancel.signal,onProgress:()=>cancel.abort()}),{code:'CANCELLED'});assert.equal(budget.cacheBytes,before);assert.equal(budget.retained,pixels.data.length*2);assert.equal(budget.active,0);
 const second=await segmentedAdjust(image,{...p,threshold:0,invert:true},hooks);await exact(second.surface,(await op.compute(pixels,{...p,threshold:0,invert:true},{})).pixels);
 budget.room(budget.limit-budget.retained);assert.equal(budget.cacheBytes,0);await exact(first.surface,(await op.compute(pixels,p,{})).pixels);await first.surface.dispose();await second.surface.dispose();
 const cold=new AbortController();await assert.rejects(segmentedAdjust(image,p,{...hooks,rowsPerBlock:3,signal:cold.signal,onProgress:f=>{if(f>.5)cold.abort();}}),{code:'CANCELLED'});assert.equal(budget.cacheBytes,0);assert.equal(budget.active,0);await image.surface.dispose();assert.equal(budget.total(),0);
 const f=await source(),identity=await segmentedAdjust(f.image,op.validate({threshold:127}),{budget:f.budget,cacheKey:'source\0adjust/'});assert.equal(identity.metrics.prefixCacheStored,false);await identity.surface.dispose();await f.image.surface.dispose();assert.equal(f.budget.total(),0);
});
