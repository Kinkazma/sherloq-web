import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{Budget}from'../src/cache.js';import{createNeuralTensor}from'../src/neural-tensor-store.js';
import{truforNeuron333Field,TRUFOR_NEURON333}from'../src/trufor-neuron333.js';
import{renderTruforSegmented}from'../src/trufor-segmented-render.js';
import{truforFixture}from'./helpers/trufor-strict-fixture.mjs';
import{createM2NpzStream}from'../src/m2-npz-stream.js';
const fixture=JSON.parse(await readFile(new URL('./data/trufor/neuron333.json',import.meta.url),'utf8'));
test('neuron 333 native-grid field matches an independent PyTorch fixture, arbitrary floats and byte windows',async()=>{
 const budget=new Budget(2**20),[ah,aw]=fixture.activationShape,[height,width]=fixture.nativeShape,raw=await createNeuralTensor(1,ah,aw,{budget,cooperation:'bounded'});
 try{await raw.writeRows(0,ah,Float32Array.from(fixture.activation));const retained=budget.total(),field=truforNeuron333Field(raw,width,height,{budget}),all=await field.readInto(new Float32Array(width*height));assert(Math.max(...all.map((v,i)=>Math.abs(v-fixture.response[i])))<1e-6);assert.equal(budget.total(),retained);
  for(const[offset,count]of [[0,17],[36,43],[width*height-11,11]])assert.deepEqual(await field.readInto(new Float32Array(count),offset),all.slice(offset,offset+count));
  const bytes=new Uint8Array(all.buffer);for(const[offset,count]of [[1,23],[151,41],[bytes.length-17,17]])assert.deepEqual(await field.readBytes(new Uint8Array(count),offset),bytes.slice(offset,offset+count));
  const result={data:{width,height,neuron333:field}},full=await renderTruforSegmented(result,'neuron333',undefined,{budget}),rect={x:9,y:4,width:15,height:20},tile=await renderTruforSegmented(result,'neuron333',rect,{budget});
  try{for(let row=0;row<rect.height;row++)assert.deepEqual(tile.data.subarray(row*rect.width*3,(row+1)*rect.width*3),full.data.subarray(((rect.y+row)*width+rect.x)*3,((rect.y+row)*width+rect.x+rect.width)*3));}finally{full.release();tile.release();}
  const controller=new AbortController();controller.abort();await assert.rejects(field.readInto(new Float32Array(8),0,{signal:controller.signal}),{code:'CANCELLED'});assert.equal(budget.total(),retained);
 }finally{await raw.dispose();assert.equal(budget.total(),0);}
});
test('strict native contexts retain the neuron through cached views and streaming export, without another analysis',async()=>{
 const f=await truforFixture(),original=f.native.analyze.bind(f.native);f.native.analyze=async(...args)=>{const r=await original(...args);r.data.neuron333=r.data.map;r.data.metadata.neuron333={...TRUFOR_NEURON333,grid:[16,16],capturedDuringFullInference:true};return r;};let r,hit,stream;
 try{r=await f.run();const calls=f.calls.length;hit=await f.run();assert.equal(f.calls.length,calls);assert.equal(hit.metrics.cache.result,true);assert.equal(r.data.neuron333.length,r.data.pixelCount);const display=await f.api.render(f.image,r,'neuron333');display.release();assert.equal(f.calls.length,calls);
  stream=await createM2NpzStream('trufor',r,{budget:f.budget});await f.api.clearCache();const first=await stream.read(0,64);assert.deepEqual([...first.slice(0,4)],[80,75,3,4]);assert.equal(f.calls.length,calls);const packed=await r.data.neuron333.readInto(new Float32Array(37),r.data.pixelCount-37);assert(packed.every(Number.isFinite));
 }finally{stream?.release();await r?.release();await hit?.release();await f.close();assert.equal(f.budget.total(),0);}
});
test('legacy native results do not trigger inference when neuron 333 was not retained',async()=>{
 const f=await truforFixture();let r;
 try{r=await f.run();const calls=f.calls.length;assert.equal(r.data.neuron333,undefined);await assert.rejects(f.api.render(f.image,r,'neuron333'),/not retained/);assert.equal(f.calls.length,calls);}finally{await r?.release();await f.close();assert.equal(f.budget.total(),0);}
});
