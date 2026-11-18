import test from 'node:test';import assert from 'node:assert/strict';
import {createNumericSurface} from '../src/numeric-surface.js';import {Budget} from '../src/cache.js';

async function controlledClock(run){
 const descriptor=Object.getOwnPropertyDescriptor(performance,'now'),timer=globalThis.setTimeout;let clock=0,yields=0;
 Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
 globalThis.setTimeout=(fn,delay,...args)=>{assert.equal(delay,0);yields++;queueMicrotask(()=>fn(...args));return 0;};
 try{return await run({advance:ms=>clock+=ms,yields:()=>yields});}
 finally{globalThis.setTimeout=timer;if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}
}

test('pending storage and time between numeric windows do not create repeated timer pauses',()=>controlledClock(async clock=>{
 const data=Float32Array.from({length:64*32},(_,i)=>(i-100)/17),bytes=new Uint8Array(data.buffer),budget=new Budget(1024**2);
 const store={byteLength:bytes.length,storage:'test-async',readInto(out,offset){return Promise.resolve().then(()=>{clock.advance(100);out.set(bytes.subarray(offset,offset+out.length));});},dispose(){}};
 const surface=createNumericSurface(store,{width:64,height:32,format:'float32',budget,semantics:'Exact synthetic float samples.'});
 for(let y=0;y<8;y++){
  clock.advance(100);const result=await surface.readWindow({x:0,y,width:64,height:1});
  try{assert.deepEqual(result.pixels.data,data.subarray(y*64,(y+1)*64));}finally{result.release();}
 }
 assert.equal(clock.yields(),0,'Only useful CPU work may consume the cooperation interval.');assert.equal(budget.total(),0);await surface.dispose();
}));

test('useful synchronous numeric copy work still yields and preserves exact crop coordinates',()=>controlledClock(async clock=>{
 const data=Int32Array.from({length:64*32},(_,i)=>i*11-700),bytes=new Uint8Array(data.buffer),budget=new Budget(1024**2);
 const store={byteLength:bytes.length,readInto(out,offset){clock.advance(5);out.set(bytes.subarray(offset,offset+out.length));return out;},dispose(){}};
 const surface=createNumericSurface(store,{width:64,height:32,format:'int32',budget,semantics:'Exact synthetic integer samples.'});
 for(let y=0;y<8;y++){
  const result=await surface.readWindow({x:7,y,width:19,height:1});
  try{assert.deepEqual(result.pixels.data,data.subarray(y*64+7,y*64+26));}finally{result.release();}
 }
 assert.ok(clock.yields()>0,'Removing idle pauses must not remove CPU cooperation.');assert.equal(budget.total(),0);await surface.dispose();
}));

test('cancellation during an asynchronous numeric read releases its owned output',async()=>{
 const budget=new Budget(1024**2),controller=new AbortController(),store={byteLength:64*32*4,readInto(out){return Promise.resolve().then(()=>{controller.abort();out.fill(0);});},dispose(){}};
 const surface=createNumericSurface(store,{width:64,height:32,format:'float32',budget,semantics:'Cancellation fixture.'});
 await assert.rejects(surface.readWindow({x:0,y:0,width:64,height:2},{signal:controller.signal}),error=>error.code==='CANCELLED');
 assert.equal(budget.total(),0);await surface.dispose();
});
