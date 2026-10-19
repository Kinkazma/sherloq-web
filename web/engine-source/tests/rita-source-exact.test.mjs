import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ritaSourceTensors} from '../src/rita-source-tensors.js';
const f=Math.fround;
function reference(data,width,height,channels,top,rows){
 const pw=Math.ceil(width/32)*32,n=pw*rows,out=new Float32Array(n*3),reflect=(i,size)=>size===1?0:(i%(2*(size-1))<size?i%(2*(size-1)):2*(size-1)-i%(2*(size-1)));
 for(let y=0;y<rows;y++)for(let x=0;x<pw;x++)for(let c=0;c<3;c++)out[c*n+y*pw+x]=f(f(f(data[(reflect(top+y,height)*width+reflect(x,width))*channels+c]/255)-f([.485,.456,.406][c]))/f([.229,.224,.225][c]));
 return out;
}
function input(width,height,channels=3,Type=Uint8Array){
 const data=Type.from({length:width*height*channels},(_,i)=>Type===Float32Array?(i%256)+.125:(i*73)%256),reads=[];let released=0;
 return {descriptor:{width,height},data,reads,get released(){return released;},async readWindow(rect){reads.push(rect);const copy=new Type(rect.width*rect.height*channels);for(let y=0;y<rect.height;y++)copy.set(data.subarray(((rect.y+y)*width+rect.x)*channels,((rect.y+y)*width+rect.x+rect.width)*channels),y*rect.width*channels);return {pixels:{data:copy},release(){released++;}};}};
}
const bits=data=>new Uint32Array(data.buffer,data.byteOffset,data.length);
test('normalization lookup preserves every RGB8 value bit for bit, including RGBA/clamped storage',async()=>{
 for(const Type of [Uint8Array,Uint8ClampedArray])for(const channels of [3,4]){
  const source=input(256,2,channels,Type);for(let x=0;x<256;x++)for(let c=0;c<3;c++)source.data[x*channels+c]=x;
  const budget=new Budget(1024**2),prepared=ritaSourceTensors(source,{budget}),part=await prepared.rgb.readRows(0,2);
  assert.deepEqual(bits(part.data),bits(reference(source.data,256,2,channels,0,2)));part.release();assert.equal(budget.active,0);assert.equal(source.released,1);
 }
});
test('narrow reflected row windows equal unchanged normalization for arbitrary padding and native edges',async()=>{
 for(const[width,height]of [[1,1],[2,3],[35,34],[769,513]]){
  const source=input(width,height),budget=new Budget(64*1024**2),prepared=ritaSourceTensors(source,{budget});
  for(const[top,rows]of [[0,1],[Math.max(0,height-1),Math.min(3,prepared.paddedHeight-height+1)],[0,prepared.paddedHeight]]){
   const part=await prepared.rgb.readRows(top,rows);assert.deepEqual(bits(part.data),bits(reference(source.data,width,height,3,top,rows)));assert.deepEqual(part.dims,[1,3,rows,prepared.paddedWidth]);part.release();assert.equal(budget.active,0);
  }
  assert.equal(source.reads.length,3);assert.equal(source.released,3);assert.equal(source.reads[0].height,1);assert.equal(prepared.metadata.rescaled,false);
 }
});
test('non-byte source compatibility retains the original float operation sequence',async()=>{
 const source=input(35,34,4,Float32Array),budget=new Budget(1024**2),part=await ritaSourceTensors(source,{budget}).rgb.readRows(31,5);
 assert.deepEqual(bits(part.data),bits(reference(source.data,35,34,4,31,5)));part.release();assert.equal(budget.active,0);
});
test('normalization cancellation, reservation refusal and source failure leave no row lease',async()=>{
 const source=input(35,34),budget=new Budget(1024**2),prepared=ritaSourceTensors(source,{budget}),controller=new AbortController();controller.abort();
 await assert.rejects(prepared.rgb.readRows(0,1,{signal:controller.signal}),e=>e.code==='CANCELLED');assert.equal(source.reads.length,0);assert.equal(budget.active,0);
 const tiny=new Budget(1);await assert.rejects(ritaSourceTensors(source,{budget:tiny}).rgb.readRows(0,1),e=>e.code==='MEMORY_LIMIT');assert.equal(source.released,1);assert.equal(tiny.active,0);
 const failed={descriptor:{width:35,height:34},async readWindow(){throw Error('source failed');}};await assert.rejects(ritaSourceTensors(failed,{budget}).rgb.readRows(0,1),/source failed/);assert.equal(budget.active,0);
});
