import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {contiguousSurface} from '../src/image-sources.js';
import {segmentedNoisesniffer} from '../src/segmented-noisesniffer.js';
import {noisesnifferParams} from '../src/noisesniffer.js';
import {previewCachedNoisesniffer} from '../src/noisesniffer-preview.js';
for(const value of[0,128,255])test('flat native image '+value+' remains explicitly inconclusive in every retained view',async()=>{
 const budget=new Budget(128*1024**2),source={width:32,height:24,format:'rgb8',data:new Uint8Array(32*24*3).fill(value)},image={surface:contiguousSurface(source,budget)},held=[];let cache;
 try{for(const view of['regions','mask','distribution']){const p=noisesnifferParams({view,cellSize:10,samplesPerBin:100,lowFrequencyFraction:1,lowNoiseFraction:.99}),result=await segmentedNoisesniffer(image,p,{budget,cache});cache=result.noisesnifferCache;held.push(result);assert.equal(result.data.metadata.inconclusive,true);assert.equal(result.data.metadata.selected_blocks,0);assert.deepEqual(result.data.metadata.regions,[]);const native=await result.surface.readWindow();try{assert.deepEqual(native.pixels.data,new Uint8Array(source.data.length).fill(view==='mask'?0:value));const before=budget.total(),draft=await previewCachedNoisesniffer(image,cache,{...p,lowNoiseFraction:.01},{maxSide:64,maxPixels:4096,maxWorkingBytes:64*1024**2},{budget});assert.deepEqual(draft.pixels.data,native.pixels.data);assert.equal(draft.metrics.nativeAnalysisCalls,0);assert.equal(budget.total(),before);}finally{native.release();}}}
 finally{await cache?.dispose();for(const r of held)await r.surface.dispose();}assert.equal(budget.total(),0);
});
