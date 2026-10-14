import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';

const scores=()=>({width:4,height:2,energy_high_score:new Float32Array([0,.1,0,.3,.4,0,.6,0]),energy_low_score:new Float32Array([.8,0,1,0,0,1.3,0,1.5]),energy_scope:new Int32Array(8).fill(1)});
const red=value=>Math.min(255,Math.round(value*255));
test('Unified combines native HIGH red and LOW blue in one exact raster without separate panels',async()=>{
 const data=scores(),before={high:data.energy_high_score.slice(),low:data.energy_low_score.slice()},frame=await renderEnergy(data,null,{view:'scores',field:'unified',threshold:0});
 assert.equal(frame.width,4);assert.equal(frame.height,2);assert.equal(frame.data.byteLength,24);assert.equal(frame.preview,false);assert.equal(frame.presentation.nativeResolution,true);
 for(let i=0;i<8;i++)assert.deepEqual(frame.data.subarray(i*3,(i+1)*3),Uint8Array.of(red(data.energy_high_score[i]),0,red(data.energy_low_score[i])));
 assert.equal(frame.presentation.panels,undefined);assert.equal(frame.presentation.signedScore,'high-low');assert.deepEqual(data.energy_high_score,before.high);assert.deepEqual(data.energy_low_score,before.low);
});

test('overlay retains the exact original for black or filtered scores and blends other pixels at fixed 35 percent',async()=>{
 const data={width:3,height:1,energy_high_score:Float32Array.of(0,.5,1),energy_low_score:Float32Array.of(1,0,0),energy_scope:new Int32Array(3).fill(1)},rgb=Uint8Array.from([20,40,60,100,150,200,90,80,70]),before=rgb.slice();let calls=0;
 const frame=await renderEnergy(data,{width:3,height:1,async readPixels(rect){calls++;assert.deepEqual(rect,{x:0,y:0,width:3,height:1});return{data:rgb};}},{view:'scores',field:'unified',threshold:.75,scoreView:'overlay'});
 assert.deepEqual(frame.data,Uint8Array.from([13,26,128,100,150,200,148,52,46]));assert.equal(calls,1);assert.equal(frame.presentation.overlayOpacity,.35);assert.equal(frame.presentation.blackTransparent,true);assert.deepEqual(rgb,before);
});

test('bounded preview samples raw pixel centers but preserves native dimensions, panel coordinates and exact maxima',async()=>{
 const data=scores(),before=data.energy_high_score.slice(),cached={high:2.1,low:3.2},frame=await renderEnergy(data,null,{view:'scores',field:'unified',threshold:0},{preview:{maxWidth:4,maxHeight:1},observedMaxima:cached});
 assert.equal(frame.width,2);assert.equal(frame.height,1);assert.equal(frame.logicalWidth,4);assert.equal(frame.logicalHeight,2);assert.equal(frame.data.byteLength,6);assert.equal(frame.presentation.preview,true);assert.equal(frame.presentation.nativeResolution,false);
 assert.deepEqual(frame.data,Uint8Array.from([0,0,255,0,0,255]));assert.deepEqual(frame.presentation.observedMaxima,cached);assert.equal(frame.presentation.panels,undefined);assert.deepEqual(data.energy_high_score,before);
 const unknown=await renderEnergy(data,null,{view:'scores',field:'unified'},{preview:{maxWidth:4,maxHeight:1}});assert.equal(unknown.presentation.observedMaximum,undefined,'a sampled maximum is not a native maximum');assert.equal(unknown.presentation.observedMaxima,undefined);
});

test('overlay drag reads a bounded sampled original once and never a full original window',async()=>{
 const data=scores();let reads=0;const frame=await renderEnergy(data,{width:4,height:2,readPixels(){throw Error('full original read');},async readSampled(tile){reads++;assert.deepEqual(tile,{x:0,y:0,w:4,h:2,step:2});return{width:2,height:1,data:Uint8Array.from([20,40,60,100,150,200])};}},{view:'scores',field:'unified',threshold:5,scoreView:'overlay'},{preview:{maxWidth:4,maxHeight:1}});
 assert.equal(reads,1);assert.deepEqual(frame.data,Uint8Array.from([20,40,60,100,150,200]));assert.equal(frame.preview,true);
});

test('preview allocation stays within its declared bounds without changing native map or resampling an already small source',async()=>{
 const width=1025,height=769,data={width,height,energy_high_score:new Float32Array(width*height).fill(.2),energy_low_score:new Float32Array(width*height),energy_scope:new Int32Array(width*height).fill(1)};
 const frame=await renderEnergy(data,null,{view:'scores',field:'unified'},{preview:{maxWidth:320,maxHeight:320}});assert.ok(frame.width<=320&&frame.height<=320);assert.ok(frame.data.byteLength<=320*320*3);assert.equal(data.energy_high_score.length,width*height);assert.equal(frame.logicalWidth,width);
 const small=await renderEnergy(scores(),null,{view:'scores',field:'unified'},{preview:{maxWidth:320,maxHeight:320}});assert.equal(small.preview,false);assert.equal(small.presentation.nativeResolution,true);
});

test('one positive magnitude threshold removes HIGH red and LOW blue together; at the native maximum no pixel remains',async()=>{
 const data={width:5,height:1,energy_high_score:Float32Array.of(.5,0,0,0,1),energy_low_score:Float32Array.of(0,.25,.75,0,0),energy_scope:Int32Array.of(1,2,1,1,0)},before={high:data.energy_high_score.slice(),low:data.energy_low_score.slice(),scope:data.energy_scope.slice()};
 const both=await renderEnergy(data,null,{view:'scores',field:'unified',threshold:0});assert.deepEqual(both.data,Uint8Array.of(128,0,0,0,0,64,0,0,191,0,0,0,0,0,0));assert.equal(both.presentation.observedMaximum,.75);assert.equal(both.presentation.thresholdCondition,'magnitude>threshold');assert.deepEqual(both.presentation.signedRanges,{high:{minimum:-.75,maximum:.5},low:{minimum:-.5,maximum:.75}});
 const filtered=await renderEnergy(data,null,{view:'scores',field:'unified',threshold:.5});assert.deepEqual(filtered.data,Uint8Array.of(0,0,0,0,0,0,0,0,191,0,0,0,0,0,0));
 const empty=await renderEnergy(data,null,{view:'scores',field:'unified',threshold:both.presentation.observedMaximum});assert.ok(empty.data.every(value=>value===0));assert.deepEqual(data.energy_high_score,before.high);assert.deepEqual(data.energy_low_score,before.low);assert.deepEqual(data.energy_scope,before.scope);
 const high=await renderEnergy(data,null,{view:'scores',field:'high'}),low=await renderEnergy(data,null,{view:'scores',field:'low'});assert.deepEqual(high.data,Uint8Array.of(128,0,0,0,0,0,0,0,0,0,0,0,0,0,0));assert.deepEqual(low.data,Uint8Array.of(0,0,0,64,0,0,191,0,0,0,0,0,0,0,0));assert.equal(high.presentation.observedMaximum,.5);assert.equal(low.presentation.observedMaximum,.75);for(const frame of [high,low]){const final=await renderEnergy(data,null,{view:'scores',field:frame.presentation.field,threshold:frame.presentation.observedMaximum});assert.ok(final.data.every(value=>value===0));}
});

test('scope exclusion survives every mode and preview; single zero-threshold maps retain historical red bytes',async()=>{
 const data={width:4,height:1,energy_high_score:Float32Array.of(.5,0,1,0),energy_low_score:Float32Array.of(0,.25,0,2),energy_scope:Int32Array.of(1,2,0,-1)},rgb=Uint8Array.of(100,100,100,100,100,100,50,60,70,20,30,40);
 for(const field of ['high','low']){const zero=await renderEnergy(data,null,{view:'scores',field}),old=new Uint8Array(12);for(let i=0;i<4;i++)if(data.energy_scope[i]>0)old[i*3]=red(data['energy_'+field+'_score'][i]);assert.deepEqual(zero.data,old);}
 const overlay=await renderEnergy(data,{data:rgb},{view:'scores',field:'unified',threshold:.1,scoreView:'overlay'});assert.deepEqual(overlay.data,Uint8Array.of(110,65,65,65,65,87,50,60,70,20,30,40));
 const preview=await renderEnergy(data,null,{view:'scores',field:'unified',threshold:.1},{preview:{maxWidth:2,maxHeight:1}});assert.deepEqual(preview.data,Uint8Array.of(0,0,64,0,0,0));
 const originalPreview=await renderEnergy(data,{data:rgb},{view:'scores',field:'unified',threshold:.1,scoreView:'overlay'},{preview:{maxWidth:2,maxHeight:1}});assert.deepEqual(originalPreview.data.subarray(3,6),rgb.subarray(9,12));
 for(const field of ['high','low','both','unified']){const empty=await renderEnergy(data,{data:rgb},{view:'scores',field,threshold:2,scoreView:'overlay'});assert.deepEqual(empty.data,field==='both'?new Uint8Array([...rgb,...rgb]):rgb,'empty overlay retains the original exactly in each native panel');}
});

test('positive magnitude input shapes reject absent/wrong reference domains, invalid scores and negative thresholds',async()=>{
 const complete=scores();for(const change of [{energy_scope:undefined},{energy_scope:new Uint8Array(8)},{energy_scope:new Int32Array(1)},{energy_low_score:undefined},{energy_low_score:new Float64Array(8)},{energy_high_score:new Float32Array(1)}])await assert.rejects(renderEnergy({...complete,...change},null,{view:'scores',field:'high'}),/Invalid raw energy score map/);
 for(const value of [NaN,Infinity,-.1]){const data=scores();data.energy_low_score[0]=value;await assert.rejects(renderEnergy(data,null,{view:'scores',field:'high'}),/Invalid raw energy score/);}
 for(const threshold of [-.1,NaN,Infinity,-Infinity])await assert.rejects(renderEnergy(complete,null,{view:'scores',threshold}),/Invalid energy score presentation/);
});

test('preview uses only complete native extrema, including the common magnitude bound, and never sampled or partial bounds',async()=>{
 const data=scores(),known={high:{minimum:-4,maximum:2},low:{minimum:-2,maximum:4}},maxima={high:2,low:4},full=await renderEnergy(data,null,{view:'scores',field:'unified'},{preview:{maxWidth:2,maxHeight:1},signedRanges:known,observedMaxima:maxima});assert.equal(full.presentation.observedMaximum,4);assert.deepEqual(full.presentation.signedRanges,known);assert.equal(full.presentation.signedMinimum,undefined,'signed range is never a threshold slider range');
 const partial=await renderEnergy(data,null,{view:'scores',field:'unified'},{preview:{maxWidth:2,maxHeight:1},signedRanges:{high:known.high},observedMaxima:{high:2}});assert.equal(partial.presentation.observedMaximum,undefined);assert.equal(partial.presentation.signedRanges,undefined);const absent=await renderEnergy(data,null,{view:'scores',field:'unified'},{preview:{maxWidth:2,maxHeight:1}});assert.equal(absent.presentation.signedRanges,undefined);
});

test('Both retains the validated two-panel pixels at zero, negative and boundary thresholds alongside the separate Unified view',async()=>{
 const data={width:5,height:1,energy_high_score:Float32Array.of(.5,0,0,0,1),energy_low_score:Float32Array.of(0,.25,.75,0,0),energy_scope:Int32Array.of(1,2,1,1,0)};
 const zero=await renderEnergy(data,null,{view:'scores',field:'both'});assert.equal(zero.width,10);assert.equal(zero.logicalWidth,10);assert.deepEqual(zero.data,Uint8Array.of(128,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,64,0,0,191,0,0,0,0,0,0,0,0));assert.deepEqual(zero.presentation.panels.map(p=>p.field),['high','low']);
 const negative=await renderEnergy(data,null,{view:'scores',field:'both',threshold:-.5});assert.deepEqual(negative.data,Uint8Array.of(128,0,0,0,0,64,0,0,0,0,0,0,0,0,0,0,0,128,64,0,0,191,0,0,0,0,0,0,0,0));
 const boundary=await renderEnergy(data,null,{view:'scores',field:'both',threshold:.5});assert.equal(boundary.data[0],128,'Both keeps its inclusive v1 threshold');assert.equal(boundary.data[21],191);assert.equal(boundary.presentation.signedMinimum,-.75);assert.equal(boundary.presentation.signedMaximum,.75);
 const preview=await renderEnergy(data,null,{view:'scores',field:'both',threshold:-.5},{preview:{maxWidth:4,maxHeight:1},observedMaxima:{high:.5,low:.75},signedRanges:{high:{minimum:-.75,maximum:.5},low:{minimum:-.5,maximum:.75}}});assert.equal(preview.width,4);assert.equal(preview.logicalWidth,10);assert.deepEqual(preview.data,Uint8Array.of(0,0,64,0,0,0,64,0,0,0,0,0));
 const unified=await renderEnergy(data,null,{view:'scores',field:'unified',threshold:.5});assert.equal(unified.width,5);assert.equal(unified.presentation.panels,undefined);assert.equal(unified.data[0],0,'Unified has a strict magnitude threshold');assert.equal(unified.data[8],191);
});

test('bad preview bounds, invalid overlay pixels and cancelled reads never publish an approximate result',async()=>{
 for(const preview of [{maxWidth:513,maxHeight:320},{maxWidth:0,maxHeight:320},{maxWidth:320,maxHeight:0},{maxWidth:3.2,maxHeight:320}])await assert.rejects(renderEnergy(scores(),null,{view:'scores',field:'unified'},{preview}),/Invalid energy preview bounds/);
 await assert.rejects(renderEnergy(scores(),{width:4,height:2,readPixels:async()=>({data:new Uint8Array(1)})},{view:'scores',field:'unified',scoreView:'overlay'}),/Invalid original RGB rows/);
 const controller=new AbortController(),data=scores(),before=data.energy_low_score.slice();await assert.rejects(renderEnergy(data,{width:4,height:2,async readSampled(){controller.abort();return{width:2,height:1,data:new Uint8Array(6)};}},{view:'scores',field:'unified',scoreView:'overlay'},{preview:{maxWidth:4,maxHeight:1},signal:controller.signal}),{code:'CANCELLED'});assert.deepEqual(data.energy_low_score,before);
});
