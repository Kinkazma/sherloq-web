import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {segmentedPixelStats} from '../src/segmented-results.js';import {statsParams} from '../src/pixel-stats.js';
import {segmentedBitPlanes} from '../src/segmented-planes.js';import {planesParams} from '../src/bit-planes.js';
import {segmentedMinmax} from '../src/segmented-minmax.js';import {minmaxParams} from '../src/minmax.js';
import {segmentedDefects} from '../src/segmented-defects.js';import {defectParams} from '../src/defect-pixels.js';
test('All segmented result adapters name allocation exhaustion and retain the original source after cleanup',async()=>{
 for(const [run,params,limit] of [[segmentedPixelStats,statsParams(),120000],[segmentedBitPlanes,planesParams(),120000],[segmentedMinmax,minmaxParams(),150000],[segmentedDefects,defectParams(),170000]]){
  const budget=new Budget(limit),store=await createSegmentedBytes(30000,{budget}),surface=createRgbSurface(store,{width:100,height:100,budget});let calls=0;
  const image={store,surface,session:{create:async()=>{calls++;throw new RangeError('Array buffer allocation failed during injected storage creation');}}};
  await assert.rejects(run(image,params,{budget}),{code:'MEMORY_ALLOCATION'});assert.equal(calls,1);assert.equal(budget.retained,30000);assert.equal(budget.active,0);const window=await surface.readWindow({x:0,y:0,width:2,height:2});assert.ok(window.pixels.data.every(x=>x===0));window.release();await surface.dispose();assert.equal(budget.total(),0);
 }
});


test('segmented adapters preserve unrelated bounds failures instead of misreporting memory pressure',async()=>{
 const budget=new Budget(120000),store=await createSegmentedBytes(30000,{budget}),surface=createRgbSurface(store,{width:100,height:100,budget}),failure=new RangeError('Offset is outside the bounds of the DataView');
 try{await assert.rejects(segmentedPixelStats({store,surface,session:{create:async()=>{throw failure;}}},statsParams(),{budget}),error=>error===failure);assert.equal(budget.active,0);}finally{await surface.dispose();}assert.equal(budget.total(),0);
});
