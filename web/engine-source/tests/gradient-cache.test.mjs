import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';import {orientRgb} from '../src/image-headers.js';
import {initCvWasm} from '../src/opencv.js';import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';import {GRADIENT_HEAP_BYTES,initGradientWasm} from '../src/gradient-math.js';import {segmentedGradient} from '../src/segmented-gradient.js';
await initGradientWasm({wasmBinary:await readFile(new URL('../vendor/gradient/gradient.wasm',import.meta.url))});await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const op=OPENCV_OPERATIONS['detail.gradient'],hash=data=>createHash('sha256').update(data).digest('hex'),reference=JSON.parse(await readFile(new URL('../fixtures/opencv-reference.json',import.meta.url)));
const pixels={width:41,height:37,format:'rgb8',data:Uint8Array.from({length:41*37*3},(_,i)=>i*31^(i>>>3))};
async function source(pixels,{orientation=1,limit=128*1024**2}={}){const budget=new Budget(limit),store=await createSegmentedBytes(pixels.data.length,{budget});await store.write(pixels.data);return{budget,image:{surface:createRgbSurface(store,{...pixels,budget,orientation})}};}
async function exact(surface,expected){const view=await surface.readWindow();assert.deepEqual(view.pixels,expected);view.pixels.data.fill(91);view.release();}
test('All 640 native gradient views share private derivatives, resetting length extrema after inversion',async()=>{
 let count=0;for(const f of reference.cases){const pixels={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))},{budget,image}=await source(pixels);let last,previous;
  try{for(const [i,e]of f.expected.filter(e=>e.operation==='detail.gradient').entries()){
   const read=image.surface.readWindow;if(i)image.surface.readWindow=()=>assert.fail('Derivative cache cannot reread source');let result;
   try{result=await segmentedGradient(image,op.validate(e.params),{budget,rowsPerBlock:7,cacheKey:'source\0gradient/'});}finally{image.surface.readWindow=read;}
   assert.equal(result.metrics.analysisCacheHit,i>0);assert.equal(result.metrics.derivativeCacheStored,true);if(i){assert.equal(result.metrics.sourceReads,0);assert.equal(result.metrics.derivativesMs,0);}
   const window=await result.surface.readWindow();assert.equal(hash(window.pixels.data),e.sha256,`${f.name} ${JSON.stringify(e.params)}`);window.pixels.data.fill(57);window.release();
   if(last){const old=await last.readWindow();assert.equal(hash(old.pixels.data),previous);old.release();await last.dispose();}last=result.surface;previous=e.sha256;assert.equal(budget.active,0);count++;
  }}finally{budget.clearPrefix('source\0');await last?.dispose();await image.surface.dispose();}assert.equal(budget.total(),0);
 }assert.equal(count,640);
});
test('Cached gradient orientation, cancellation, eviction and low-budget uncached path remain exact',async()=>{
 for(let orientation=1;orientation<=8;orientation++){
  const {budget,image}=await source(pixels,{orientation}),oriented=await orientRgb(pixels,orientation),hooks={budget,cacheKey:'source\0gradient/',rowsPerBlock:3},p=op.validate({mode:3,invert:true,equalize:true}),first=await segmentedGradient(image,p,hooks),before=budget.cacheBytes;
  for(const threshold of [.35,.4,.6,.9,1]){const abort=new AbortController();await assert.rejects(segmentedGradient(image,p,{...hooks,signal:abort.signal,onProgress:f=>{if(f>=threshold)abort.abort();}}),{code:'CANCELLED'});assert.equal(budget.active,0);assert.equal(budget.cacheBytes,before);assert.equal(budget.retained,pixels.data.length*2);}
  const second=await segmentedGradient(image,{...p,invert:false},hooks);assert.equal(second.metrics.sourceReads,0);await exact(second.surface,(await op.compute(oriented,{...p,invert:false},{})).pixels);
  budget.room(budget.limit-budget.retained);assert.equal(budget.cacheBytes,0);await exact(first.surface,(await op.compute(oriented,p,{})).pixels);await first.surface.dispose();await second.surface.dispose();
  for(const threshold of [.1,.4,.6,.9,1]){const abort=new AbortController();await assert.rejects(segmentedGradient(image,p,{...hooks,signal:abort.signal,onProgress:f=>{if(f>=threshold)abort.abort();}}),{code:'CANCELLED'});assert.equal(budget.cacheBytes,0);assert.equal(budget.active,0);}
  await image.surface.dispose();assert.equal(budget.total(),0);
 }
 const {width:w,height:h}=pixels,{budget,image}=await source(pixels,{limit:GRADIENT_HEAP_BYTES+w*24+Math.max(w,h)*3+16384+30000}),p=op.validate({mode:3,equalize:true,invert:true});
 const result=await segmentedGradient(image,p,{budget,cacheKey:'source\0gradient/'});assert.equal(result.metrics.derivativeCacheStored,false);await exact(result.surface,(await op.compute(pixels,p,{})).pixels);assert.equal(budget.cacheBytes,0);await result.surface.dispose();await image.surface.dispose();assert.equal(budget.total(),0);
});
