import test from 'node:test';import assert from 'node:assert/strict';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';
const width=97,height=513,n=width*height,pixels=Uint8Array.from({length:n*3},(_,i)=>i*37%256),data={width,height,energy_labels:new Int32Array(n),regionColors:[]};
const cooperate=async()=>{};
test('an empty native overlay copies bounded Original bands exactly without a pixel classification loop',async()=>{
 const reads=[],source={width,height,async readPixels(rect){reads.push(rect);return {data:pixels.subarray(rect.y*width*3,(rect.y+rect.height)*width*3)};}};
 const expected=await renderEnergy(data,{width,height,data:pixels},{view:'overlay',opacity:73},{cooperate});
 const actual=await renderEnergy(data,source,{view:'overlay',opacity:73},{cooperate});assert.deepEqual(actual,expected);assert.deepEqual(reads.map(r=>r.height),[256,256,1]);assert(reads.every(r=>r.width===width&&r.x===0));actual.data[0]^=255;assert.notEqual(actual.data[0],pixels[0]);
});
test('empty labels require no Original reads',async()=>{
 const actual=await renderEnergy(data,{width,height,readPixels(){throw Error('Unused Original read');}},{view:'labels'},{cooperate});assert.deepEqual(actual.data,new Uint8Array(n*3));
});
test('native band copies validate their shape and stop after cancellation',async()=>{
 await assert.rejects(renderEnergy(data,{width,height,readPixels:async()=>({data:new Uint8Array(1)})},{view:'overlay'},{cooperate}),/Invalid original RGB rows/);
 const controller=new AbortController();let reads=0;await assert.rejects(renderEnergy(data,{width,height,async readPixels(rect){reads++;controller.abort();return {data:pixels.subarray(0,rect.height*width*3)};}},{view:'overlay'},{signal:controller.signal,cooperate}),{code:'CANCELLED'});assert.equal(reads,1);
});
