import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {initAdjustWasm} from '../src/adjust-math.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {sourceRegionAdjust} from '../src/source-region-adjust.js';
await initAdjustWasm({wasmBinary:await readFile(new URL(import.meta.resolve('../vendor/adjust/adjust.wasm')))});
// An interior exclusion keeps this membership fixture on its full envelope.
// A removed outer strip is now a native rectangle, covered separately.
async function run(params){
 const width=6,height=2,values=[10,255,40,100,150,220],budget=new Budget(128*1024**2),state=await createOriginalSourceRegionsState({width,height,sourceSha256:'e'.repeat(64)});await state.add('exclusion',{x0:1,y0:0,x1:2,y1:2});const domain=await compileOriginalSourceRegions(state.snapshot());let held=0,scientificRead=0;
 const read=async(rect,science)=>{if(science){scientificRead++;assert(rect.x+rect.width<=1||rect.x>=2);}held++;const data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)data.fill(values[rect.x+x],(y*rect.width+x)*3,(y*rect.width+x+1)*3);let done=false;return{pixels:{...rect,format:'rgb8',data},release(){if(done)return;done=true;held--;}};},original={surface:{readWindow:r=>read(r,false)}},view=await createSourceRegionView({width,height,readWindow:r=>read(r,true)},domain.descriptor,{budget});let record;
 const answer=await sourceRegionAdjust({task:{id:'adjust',imageId:'scope',operation:'inspection.adjust',params},original,view,domain,budget,publishResult(id,value){record=value;return{surface:value.surface.descriptor};}});
 const window=await record.surface.readWindow({x:0,y:0,width,height});const rgb=window.pixels.data.slice();window.release();await record.surface.dispose();view.dispose();assert.equal(held,0);assert(scientificRead>0);assert.equal(budget.snapshot().retainedBytes,0);assert.equal(budget.snapshot().activeReservationBytes,0);return{answer,rgb};
}
test('masked native global equalization omits excluded white pixels from the CDF',async()=>{
 const {rgb}=await run({equalize:1});for(let y=0;y<2;y++)for(let x=0;x<6;x++)assert.deepEqual([...rgb.subarray((y*6+x)*3,(y*6+x+1)*3)],[0,255,64,128,191,255].slice(x,x+1).flatMap(v=>[v,v,v]));
});
test('masked Otsu threshold uses only the admitted grayscale distribution',async()=>{
 const {answer,rgb}=await run({threshold:0});assert.equal(answer.metrics.otsuThreshold,100);for(let y=0;y<2;y++)for(let x=0;x<6;x++){const v=x===1?255:x>=4?255:0;assert.deepEqual([...rgb.subarray((y*6+x)*3,(y*6+x+1)*3)],[v,v,v]);}
});
test('equalization followed by native Otsu and inversion preserves the established order',async()=>{
 const {answer,rgb}=await run({equalize:1,threshold:0,invert:true});assert.equal(answer.metrics.otsuThreshold,64);for(let y=0;y<2;y++)for(let x=0;x<6;x++){const v=x===1||x<=2?255:0;assert.deepEqual([...rgb.subarray((y*6+x)*3,(y*6+x+1)*3)],[v,v,v]);}
});
