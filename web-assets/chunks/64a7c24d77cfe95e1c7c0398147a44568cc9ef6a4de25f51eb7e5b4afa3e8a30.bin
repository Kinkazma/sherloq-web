import test from 'node:test';import assert from 'node:assert/strict';
import {webpChroma} from '../src/media-format.js';
import {createEngine} from '../src/index.js';import {createM2WorkerHost} from '../src/m2-worker-host.js';import {Budget} from '../src/cache.js';import {createReducedSdrSurface} from '../src/adaptive-sdr-resize.js';import {mediaCodecJob} from '../src/media-codec-client.js';import {jpegHeader} from '../src/image-headers.js';import {rasterPresentation} from '../src/raster-presentation.js';
const MiB=1024**2;
test('external exports share the source engine budget, fail atomically and are retired on disposal',async()=>{
 const engine=createEngine({memoryBudgetBytes:128*MiB,cpuKernel:'single'});try{
  const lease=engine.reserveExternalMemory({bytes:80*MiB});assert.equal(engine.capabilities().memory.activeReservationBytes,80*MiB);assert.throws(()=>engine.reserveExternalMemory({bytes:80*MiB}),{code:'MEMORY_LIMIT'});assert.equal(engine.capabilities().memory.activeReservationBytes,80*MiB);
  engine.releaseExternalMemory(lease.id);engine.releaseExternalMemory(lease.id);assert.equal(engine.capabilities().memory.activeReservationBytes,0);engine.reserveExternalMemory({bytes:32*MiB});
 }finally{await engine.dispose();}assert.equal(engine.capabilities().memory.activeReservationBytes,0);
});
test('M2 source ownership also accounts external rendering and clears a surviving lease',async()=>{
 const messages=[],host=createM2WorkerHost({post:m=>messages.push(m)});let sequence=0;const call=async(operation,args={})=>{await host.handle({id:++sequence,operation,args});return messages.find(m=>m.id===sequence);};
 await call('initialize',{memoryBudgetBytes:64*MiB,methods:{}});const lease=(await call('reserveExternalMemory',{bytes:40*MiB})).value;
 assert.equal((await call('memory')).value.activeReservationBytes,40*MiB);assert.equal((await call('reserveExternalMemory',{bytes:40*MiB})).error.code,'MEMORY_LIMIT');await call('releaseExternalMemory',{id:lease.id});assert.equal((await call('memory')).value.activeReservationBytes,0);
 await call('reserveExternalMemory',{bytes:20*MiB});assert.equal((await call('dispose')).value.activeReservationBytes,0);
});
test('JPEG source sampling is independent from quantization table selectors',()=>{
 for(const [sampling,chroma]of [[0x11,'444'],[0x21,'422'],[0x22,'420']]){
  const b=new Uint8Array([255,216,255,192,0,17,8,0,5,0,7,3,1,sampling,2,2,17,0,3,17,1,255,218]);const h=jpegHeader(b);assert.equal(h.chroma,chroma);assert.deepEqual(h.components,[2,0,1]);assert.equal(h.width,7);assert.equal(h.height,5);
 }
});
test('SDR area reduction preserves linear-light energy and owns only row/band workspace',async()=>{
 const budget=new Budget(MiB),source={descriptor:{width:2,height:2,format:'rgb8'},async readWindow(){const release=budget.reserve(6);return{pixels:{data:new Uint8Array([0,0,0,255,255,255])},release};}},scaled=createReducedSdrSurface(source,{width:1,height:1},budget);
 const result=await scaled.readWindow({x:0,y:0,width:1,height:1});assert.deepEqual([...result.pixels.data],[188,188,188]);result.release();assert.equal(budget.total(),0);
 const cancelled=new AbortController();cancelled.abort();await assert.rejects(scaled.readWindow({x:0,y:0,width:1,height:1},{signal:cancelled.signal}),{code:'CANCELLED'});assert.equal(budget.total(),0);
});
test('render export preserves raw evidence and applies requested palette/overlay once',async()=>{
 const budget=new Budget(MiB),data=new Float32Array([0,.5,1]),surface={descriptor:{width:3,height:1,format:'float32'},readWindow:async()=>({pixels:{data},release(){}})},overlay={descriptor:{width:3,height:1,format:'rgb8'},readWindow:async()=>({pixels:{data:new Uint8Array(9).fill(100)},release(){}})};
 const view=rasterPresentation(surface,{red:true,range:[0,1],opacity:.5},{budget,overlay}),part=await view.readWindow({x:0,y:0,width:3,height:1});assert.deepEqual([...part.pixels.data],[100,100,100,114,50,50,178,50,50]);assert.deepEqual([...data],[0,.5,1]);part.release();assert.equal(budget.total(),0);
});
test('codec cancellation waits for an in-flight storage reply before releasing its destination',async()=>{
 const previous=globalThis.Worker;let instance,enter,complete;const entered=new Promise(r=>enter=r),writing=new Promise(r=>complete=r),controller=new AbortController();
 globalThis.Worker=class{constructor(){instance=this;}postMessage(message){if(message.action)queueMicrotask(()=>this.onmessage({data:{request:'decoded-band',sequence:1,value:{}}}));else this.reply=true;}terminate(){this.terminated=true;}};
 try{let settled=false;const promise=mediaCodecJob('decode',{}, {signal:controller.signal,onRequest:async()=>{enter();await writing;return{};}});promise.finally(()=>settled=true).catch(()=>{});await entered;controller.abort();await new Promise(setImmediate);assert.equal(instance.terminated,true);assert.equal(settled,false);complete();await assert.rejects(promise,{code:'CANCELLED'});assert.equal(instance.reply,undefined);}
 finally{complete?.();globalThis.Worker=previous;}
});

test('WebP source sampling follows the image payload even with an extended header/profile',()=>{
 const chunks=[['VP8X',new Uint8Array(10)],['ICCP',new Uint8Array(3)],['VP8L',new Uint8Array(9)]],size=12+chunks.reduce((n,[,b])=>n+8+b.length+(b.length&1),0),bytes=new Uint8Array(size),v=new DataView(bytes.buffer),ascii=(s,at)=>bytes.set(new TextEncoder().encode(s),at);ascii('RIFF',0);v.setUint32(4,size-8,true);ascii('WEBP',8);let at=12;for(const [tag,b]of chunks){ascii(tag,at);v.setUint32(at+4,b.length,true);bytes.set(b,at+8);at+=8+b.length+(b.length&1);}assert.equal(webpChroma(bytes),'444');assert.equal(webpChroma(bytes.subarray(0,size-10)),null);
});
test('pixel resizing preserves proportions, reuses rows and supports partial HEIC-cell windows',async()=>{
 const {exportDimensions,createResizedSdrSurface,resizeAlgorithm}=await import('../src/adaptive-sdr-resize.js');const size={width:31,height:19,format:'rgb8'},budget=new Budget(4*MiB),rgb=Uint8Array.from({length:31*19*3},(_,i)=>i*17),reads=[];
 const source={descriptor:size,async readWindow(r){reads.push(r);const release=budget.reserve(r.width*r.height*3);return{pixels:{data:rgb.slice(r.y*31*3,(r.y+1)*31*3)},release};}};
 assert.deepEqual(exportDimensions(size,{resize:{width:17}}),{width:17,height:10});assert.deepEqual(exportDimensions(size,{resize:{height:10}}),{width:16,height:10});assert.throws(()=>exportDimensions(size,{resize:{width:15,height:15}}),{code:'INVALID_INPUT'});assert.equal(resizeAlgorithm(size,{width:6,height:4}),'area');assert.equal(resizeAlgorithm(size,{width:17,height:10}),'lanczos3');
 for(const algorithm of ['lanczos3','area','nearest']){
  const resized=createResizedSdrSurface(source,{width:17,height:10},budget,algorithm),full=await resized.readWindow({x:0,y:0,width:17,height:10});reads.length=0;
  const part=await resized.readWindow({x:3,y:2,width:9,height:5});for(let y=0;y<5;y++)assert.deepEqual(part.pixels.data.subarray(y*27,(y+1)*27),full.pixels.data.subarray(((y+2)*17+3)*3,((y+2)*17+12)*3));
  assert.equal(new Set(reads.map(r=>r.y)).size,reads.length,'each source row is read once in a band');part.release();full.release();assert.equal(budget.total(),0);
 }
 const constant={descriptor:size,readWindow:async()=>({pixels:{data:new Uint8Array(31*3).fill(117)},release(){}})};
 for(const algorithm of ['lanczos3','area']){const r=await createResizedSdrSurface(constant,{width:17,height:10},budget,algorithm).readWindow({x:0,y:0,width:17,height:10});assert.ok(r.pixels.data.every(v=>v===117));r.release();}
});
