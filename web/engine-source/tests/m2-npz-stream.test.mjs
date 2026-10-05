import test from 'node:test';
import assert from 'node:assert/strict';
import {createM2NpzStream} from '../src/m2-npz-stream.js';
import {Budget} from '../src/cache.js';
import {createNeuralTensor} from '../src/neural-tensor-store.js';
import {truforNpz,compositeNpz,catnetNpz,cfaNpz,forgeryscopeNpz} from '../src/npz.js';
const f=(n)=>Float32Array.from({length:n},(_,i)=>(i-7)/13),u=n=>Uint8Array.from({length:n},(_,i)=>i%4);
const meta={metadata:{description:'Détection 🔬',nested:[1,true,null]},provenance:{sha:'abc'}},common={width:3,height:2,metadata:meta.metadata};
const cases=[
 ['trufor',truforNpz,{data:{...common,map:f(6),confidence:f(6),noiseprint_pp:f(6),score:.31},provenance:meta.provenance}],
 ['composite',compositeNpz,{data:{...common,gray:f(6),noise:f(6),noise_rgb:u(18),model:95,map:Float64Array.of(.001,1e5),valid:u(2),statisticsShapes:{map:[1,2],valid:[1,2]}},provenance:meta.provenance}],
 ['catnet',catnetNpz,{data:{...common,map:f(6),native_map:f(2),nativeShape:[1,2]},provenance:meta.provenance}],
 ['cfa',cfaNpz,{data:{...common,gridShape:[1,2],probabilities:f(32),grids:f(8),local_grid:u(2),suspicion:f(2)},provenance:meta.provenance}],
 ['forgeryscope',forgeryscopeNpz,{...common,map:f(6),mask:u(6),candidates:u(6),geometric:u(6),branch_microscopy:u(6),branch_blots:u(6),branch_lanes:u(6),provenance:meta.provenance}]
];
for(const [method,legacy,result]of cases)test(method+' streamed NPZ matches legacy bytes including unaligned reads',async()=>{
 const budget=new Budget(4*1024**2),stream=await createM2NpzStream(method,result,{budget}),expected=legacy(result,4*1024**2).bytes,out=new Uint8Array(stream.length);
 for(let i=0;i<out.length;i+=7)out.set(stream.read(i,Math.min(7,out.length-i)),i);
 assert.deepEqual(out,expected);assert.deepEqual(stream.read(19,51),expected.slice(19,70));assert.throws(()=>stream.read(-1,1));stream.release();stream.release();assert.equal(budget.total(),0);assert.throws(()=>stream.read(0,1));
});
test('Large archive fits a small export budget and preparation cancellation releases it',async()=>{
 const pixels=2*1024**2,result={data:{width:2048,height:1024,map:f(pixels),native_map:f(pixels),nativeShape:[1024,2048],metadata:{}},provenance:{}},budget=new Budget(3*1024**2);
 const stream=await createM2NpzStream('catnet',result,{budget});assert.ok(stream.length>16*1024**2);assert.ok(budget.total()<3*1024**2);assert.equal(stream.read(stream.length-22,4).join(','),'80,75,5,6');stream.release();
 const controller=new AbortController(),pending=createM2NpzStream('catnet',result,{budget,signal:controller.signal});setTimeout(()=>controller.abort(),0);await assert.rejects(pending,{code:'CANCELLED'});assert.equal(budget.total(),0);
});
test('TruFor tensor-backed async NPZ matches all dense bytes across unaligned windows',async()=>{
 const budget=new Budget(4*1024**2),result=cases[0][2],expected=truforNpz(result,4*1024**2).bytes,data={...result.data},stores=[];
 for(const field of ['map','confidence','noiseprint_pp']){const t=await createNeuralTensor(1,2,3,{budget,chunkBytes:7});await t.writeRows(0,2,data[field]);data[field]=t;stores.push(t);}
 const stream=await createM2NpzStream('trufor',{...result,data},{budget}),out=new Uint8Array(stream.length);for(let at=0;at<out.length;at+=11)out.set(await stream.read(at,Math.min(11,out.length-at)),at);assert.deepEqual(out,expected);stream.release();for(const t of stores)await t.dispose();assert.equal(budget.total(),0);
});
test('CAT-Net segmented maps preserve dense NPZ bytes including odd byte offsets',async()=>{
 const budget=new Budget(4*1024**2),result=cases[2][2],expected=catnetNpz(result,4*1024**2).bytes,data={...result.data},stores=[];
 for(const field of ['map','native_map']){const shape=field==='map'?[2,3]:[1,2],t=await createNeuralTensor(1,...shape,{budget,chunkBytes:7});await t.writeRows(0,shape[0],data[field]);data[field]=t;stores.push(t);}
 const stream=await createM2NpzStream('catnet',{...result,data},{budget}),out=new Uint8Array(stream.length);for(let at=0;at<out.length;at+=11)out.set(await stream.read(at,Math.min(11,out.length-at)),at);assert.deepEqual(out,expected);stream.release();for(const t of stores)await t.dispose();assert.equal(budget.total(),0);
});
test('Composite async NPZ preserves scalar types in segmented byte and float banks',async()=>{
 const {createNumericBank}=await import('../src/numeric-bank.js'),budget=new Budget(4*1024**2),result=cases[1][2],expected=compositeNpz(result,4*1024**2).bytes,data={...result.data},stores=[];
 for(const field of ['gray','noise','noise_rgb','map','valid']){const array=data[field],bank=await createNumericBank(array.constructor,[array.length],{budget,chunkBytes:7});await bank.write(array);data[field]=bank;stores.push(bank);}
 const stream=await createM2NpzStream('composite',{...result,data},{budget}),out=new Uint8Array(stream.length);for(let at=0;at<out.length;at+=13)out.set(await stream.read(at,Math.min(13,out.length-at)),at);assert.deepEqual(out,expected);stream.release();for(const bank of stores)await bank.dispose();assert.equal(budget.total(),0);
});
