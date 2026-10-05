import test from 'node:test';import assert from 'node:assert/strict';import {Budget} from '../src/cache.js';import {createRgbSurface} from '../src/rgb-surface.js';import {withM3Pixels} from '../src/m3-source.js';
for(let orientation=1;orientation<=8;orientation++)test('M3 segmented oriented source lease '+orientation,async()=>{
 const budget=new Budget(16*1024**2),w=131,h=97,data=Uint8Array.from({length:w*h*3},(_,i)=>(i*37+Math.floor(i/131))%256),store={byteLength:data.length,readInto(target,offset){target.set(data.subarray(offset,offset+target.length));}},surface=createRgbSurface(store,{width:w,height:h,orientation,budget,ownsStore:false}),record={segmented:true,surface};
 const oracle=await surface.readWindow();const expected=oracle.pixels.data.slice();oracle.release();let during;
 await withM3Pixels([record,record],{},async()=>{during=budget.active;assert.equal(record.pixels.width,orientation>=5?h:w);assert.deepEqual(record.pixels.data,expected);});assert.ok(during>=expected.length);assert.equal(record.pixels,undefined);assert.equal(budget.active,0);
 await assert.rejects(withM3Pixels([record],{},async()=>{throw Error('cancelled downstream');}),/cancelled downstream/);assert.equal(record.pixels,undefined);assert.equal(budget.active,0);await surface.dispose();
});
test('M3 materialization refusal releases earlier source and preserves original stores',async()=>{
 const budget=new Budget(100),pixels=Uint8Array.from({length:60},(_,i)=>i),store={byteLength:60,readInto(target,offset){target.set(pixels.subarray(offset,offset+target.length));}},first={segmented:true,surface:createRgbSurface(store,{width:5,height:4,budget,ownsStore:false})},second={segmented:true,surface:createRgbSurface(store,{width:5,height:4,budget,ownsStore:false})};
 await assert.rejects(withM3Pixels([first,second],{},()=>{throw Error('must not run');}),{code:'MEMORY_LIMIT'});assert.equal(first.pixels,undefined);assert.equal(second.pixels,undefined);assert.equal(budget.active,0);assert.equal(pixels[59],59);
});
