import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';import {createResearchSurface} from '../src/m3-research-surface.js';import {renderResearch} from '../src/research-view.js';
for(const orientation of [1,2,3,4,5,6,7,8])test('research result windows preserve native nearest sampling and oriented RGB '+orientation,async()=>{
 const budget=new Budget(4*1024**2),store=await createSegmentedBytes(31*23*3,{budget}),bytes=Uint8Array.from({length:store.byteLength},(_,i)=>(i*17)&255);await store.write(bytes);const source=createRgbSurface(store,{width:31,height:23,orientation,budget});
 const image={surface:source},data={map:Float32Array.from({length:4096},(_,i)=>(i%71)/70),metadata:{method:'focal',native_shape:[64,64]}},record=await createResearchSurface(image,data,{mode:'overlay'},{budget});
 // Public raw transfer cannot detach the live window/export owner.
 structuredClone(data,{transfer:[data.map.buffer]});assert.equal(data.map.byteLength,0);
 const original=await source.readWindow(),frees=[];try{const expected=await renderResearch(original.pixels,record.m3Research.data,{mode:'overlay'},{reserveMemory:n=>{const f=budget.reserve(n);frees.push(f);return f;}});const {width,height}=source.descriptor;
  for(let y=0;y<height;y+=5)for(let x=0;x<width;x+=7){const w=Math.min(7,width-x),h=Math.min(5,height-y),window=await record.surface.readWindow({x,y,width:w,height:h});try{for(let row=0;row<h;row++)assert.deepEqual(window.pixels.data.subarray(row*w*3,(row+1)*w*3),expected.pixels.data.subarray(((y+row)*width+x)*3,((y+row)*width+x+w)*3));}finally{window.release();}}
 }finally{frees.forEach(f=>f());original.release();record.surface.dispose();await source.dispose();}assert.equal(budget.total(),0);
});
test('map windows need no RGB source reads and refusal releases reservations',async()=>{
 const budget=new Budget(131072),image={surface:{descriptor:{width:12000,height:8000},readWindow(){throw Error('unnecessary RGB read');}}},data={map:new Float32Array(4096),metadata:{method:'focal',native_shape:[64,64]}},record=await createResearchSurface(image,data,{mode:'map'},{budget});
 try{const window=await record.surface.readWindow({x:11983,y:7987,width:17,height:13});assert.equal(window.pixels.data.length,17*13*3);window.release();await assert.rejects(record.surface.readWindow({width:12000,height:8000}),{code:'MEMORY_LIMIT'});assert.equal(budget.active,0);}finally{record.surface.dispose();}assert.equal(budget.total(),0);
});
