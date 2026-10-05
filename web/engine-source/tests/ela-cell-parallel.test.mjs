import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {parallelGhostPlanes} from '../src/ghost-stream-pool.js';
import {createRgbRecompression} from '../src/jpeg-rgb-stream.js';
import {segmentedElaCellPlane} from '../src/ela-cell-stream.js';

test('three native ELA quality workers share CPU admission and exactly preserve serial cell planes',{timeout:15000},async()=>{
 const budget=new Budget(768*1024**2),width=384,height=320,data=Uint8Array.from({length:width*height*3},(_,i)=>(i*23+(i%91)*7)&255),surface=createRgbSurface({byteLength:data.length,readInto(out,at){out.set(data.subarray(at,at+out.length));}},{width,height,budget,ownsStore:false}),image={surface},closing=[],planes=new Map(),publications=[];image.rgbRecompression=createRgbRecompression(image,budget);
 const workerFactory=()=>{const worker=new Worker(new URL('./helpers/browser-module-worker.mjs',import.meta.url),{workerData:{module:new URL('../src/ghost-stream-worker.js',import.meta.url).href}}),adapter={postMessage:(data,transfer)=>worker.postMessage(data,transfer),terminate:()=>closing.push(worker.terminate())};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',error=>adapter.onerror?.(error));return adapter;};
 try{
  const metrics=await parallelGhostPlanes(image,[70,75,80],3,{budget,maxWorkers:3,mode:'cells',block:16,workerFactory,onPlane:async(q,value)=>{await new Promise(r=>setTimeout(r,2));planes.set(q,value);publications.push(q);}});assert.equal(metrics.workers,3);assert.equal(metrics.qualityPlanesComputed,3);assert.equal(publications.length,3);
  for(const q of [70,75,80]){const serial=await segmentedElaCellPlane(image,q,16,{budget});try{for(const name of ['profiles','content','background','usable'])assert.deepEqual(planes.get(q)[name],serial[name],q+'/'+name);}finally{serial.release();}}
 }finally{await image.rgbRecompression.dispose();await surface.dispose();await Promise.all(closing);}assert.equal(budget.total(),0);
});
