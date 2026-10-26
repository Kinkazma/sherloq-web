import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {initAdjustWasm,ADJUST_HEAP_BYTES} from '../src/adjust-math.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {sourceRegionAdjust} from '../src/source-region-adjust.js';
await initAdjustWasm({wasmBinary:await readFile(new URL('./adjust.wasm',import.meta.resolve('../vendor/adjust/adjust.js')))});
const pixels={width:257,height:193,format:'rgb8',data:Uint8Array.from({length:257*193*3},(_,i)=>(i*31+(i>>>3)*17)&255)},sha256='a'.repeat(64);
async function run(limit,params={gamma:3,equalize:1,threshold:0}){
 const budget=new Budget(limit),store=await createSegmentedBytes(pixels.data.length,{budget});await store.write(pixels.data);
 const source=createRgbSurface(store,{width:pixels.width,height:pixels.height,budget}),state=await createOriginalSourceRegionsState({width:pixels.width,height:pixels.height,sourceSha256:sha256});await state.add('acquisition',{x0:0,y0:0,x1:pixels.width,y1:pixels.height});await state.add('exclusion',{x0:110,y0:30,x1:115,y1:170});
 const domain=await compileOriginalSourceRegions(state.snapshot()),view=await createSourceRegionView(source,domain.descriptor,{budget});let saved;
 try{await sourceRegionAdjust({task:{id:'budget',imageId:'source',operation:'inspection.adjust',params},original:{surface:source,sha256},view,domain,budget,publishResult(_id,r){saved=r.surface;return{surface:r.surface.descriptor};}});const window=await saved.readWindow();try{return{data:window.pixels.data.slice(),peak:budget.peak};}finally{window.release();}}
 finally{await saved?.dispose();view.dispose();await source.dispose();assert.equal(budget.active,0);assert.equal(budget.retained,0);assert.equal(budget.cacheBytes,0);}
}
test('Membership adjustments plan useful windows after the retained output has been admitted',async()=>{
 const expected=await run(128*1024**2),limit=ADJUST_HEAP_BYTES+400*1024,actual=await run(limit);assert.deepEqual(actual.data,expected.data);assert.ok(actual.peak<=limit);
});
