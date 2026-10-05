import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createDenseMath,denseDescriptorHeapBound,denseGray} from '../src/dense-math.js';
import {preparePagedZernike} from '../src/dense-paged-zernike.js';
import {preparePagedSift} from '../src/dense-paged-sift.js';
import {preparePagedEligibility} from '../src/dense-paged-regions.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {ElasticWorkerPool} from '../src/elastic-worker-pool.js';

const MiB=1024**2,width=32,height=32,area=width*height,patch=3;
function nativeWorkers(module){
 const closing=[];let calls=0;
 return {get calls(){return calls;},factory(){
  const worker=new Worker(new URL('./helpers/browser-module-worker.mjs',import.meta.url),{workerData:{module:new URL('../src/'+module,import.meta.url).href}});
  let terminated=false;
  const adapter={postMessage(message,transfer){calls++;worker.postMessage(message,transfer);},terminate(){if(!terminated){terminated=true;closing.push(worker.terminate());}}};
  worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',error=>adapter.onerror?.(error));return adapter;
 },async close(){await Promise.all(closing);}};
}
async function source(budget){
 const store=await createSegmentedBytes(area*3,{budget,storage:'memory'}),pixels=Uint8Array.from({length:area*3},(_,i)=>(i*31+(i/19|0)*17)&255);
 await store.write(pixels);return {image:{surface:createRgbSurface(store,{width,height,budget})},pixels};
}
const zernikeWorkspace=denseDescriptorHeapBound(width,height,0,patch,false)+area*52+128*128*48;
const windowAllowance=area*3+width*3;

test('native Zernike completes with exactly the planned source, descriptors, workspace and I/O budget',async()=>{
 const budget=new Budget(area*3+area*48+zernikeWorkspace+windowAllowance+2*MiB),workers=nativeWorkers('dense-zernike-tile-worker.js'),{image,pixels}=await source(budget);let result,actual;
 try{
  result=await preparePagedZernike(image,{patch,budget,storage:'memory',maxWorkers:1,workerFactory:workers.factory});
  actual=new Float32Array(area*12);await result.first.readInto(new Uint8Array(actual.buffer));
  assert.equal(workers.calls,1);assert.equal(budget.peak,budget.limit);assert.equal(budget.total(),area*51);
 }finally{await result?.dispose();await image.surface.dispose();await workers.close();}
 assert.equal(budget.total(),0);
 const math=await createDenseMath({print:()=>{}}),expected=math.features(denseGray(pixels),width,height,{method:0,patch});assert.deepEqual(actual,expected.first);
});

test('native compact SIFT completes every preparation stage at its exact planned I/O budget',async()=>{
 const dataBytes=area*64+(width-3*patch)*(height-3*patch)*18,workspace=16*MiB+area*112;
 const budget=new Budget(area*3+dataBytes+workspace+2*MiB+windowAllowance),workers=nativeWorkers('dense-sift-stream-worker.js'),{image}=await source(budget);let result;
 try{
  result=await preparePagedSift(image,{patch,budget,storage:'memory',maxWorkers:1,workerFactory:workers.factory});
  assert.ok(workers.calls>=5);assert.equal(result.metrics.execution.completed,workers.calls);assert.equal(budget.peak,budget.limit);
  const hist=new Float32Array(area*8);await result.hist.readInto(new Uint8Array(hist.buffer));assert.ok(hist.some(value=>value>0));
 }finally{await result?.dispose();await image.surface.dispose();await workers.close();}
 assert.equal(budget.total(),0);
});

test('native texture eligibility transfers its input window out of the planned allowance',async()=>{
 const workspace=48*MiB+area*64,budget=new Budget(area*3+area+1+workspace+2*MiB+windowAllowance+128*128+128),workers=nativeWorkers('dense-texture-worker.js'),{image}=await source(budget);let result;
 try{
  result=await preparePagedEligibility(image,{method:0,patch,texture:2,budget,storage:'memory',maxWorkers:1,workerFactory:workers.factory});
  assert.equal(workers.calls,1);assert.equal(budget.peak,budget.limit);assert.equal(budget.total(),area*4+1);
  const mask=new Uint8Array(area);await result.mask.readInto(mask);assert.ok(mask.some(value=>value===1));
 }finally{await result?.dispose();await image.surface.dispose();await workers.close();}
 assert.equal(budget.total(),0);
});

test('a transferred window keeps its output charged after the original allowance closes',async()=>{
 const budget=new Budget(area*3+windowAllowance),{image,pixels}=await source(budget),allowance=budget.reserve(windowAllowance);let window;
 try{
  window=await image.surface.readWindow({width,height},{reserve:bytes=>allowance.split(bytes)});
  allowance();assert.equal(budget.total(),area*6);assert.deepEqual(window.pixels.data,pixels);
  window.release();window.release();assert.equal(budget.total(),area*3);assert.equal(budget.peak,budget.limit);
 }finally{window?.release();allowance();await image.surface.dispose();}
 assert.equal(budget.total(),0);
});

test('failed window I/O returns transferred output and scratch ownership',async()=>{
 const budget=new Budget(windowAllowance),allowance=budget.reserve(windowAllowance),surface=createRgbSurface({byteLength:area*3,readInto(){throw Error('read failed');},dispose(){}},{width,height,budget});
 try{await assert.rejects(surface.readWindow({width,height},{reserve:bytes=>allowance.split(bytes)}),/read failed/);assert.equal(budget.total(),width*3);}finally{allowance();await surface.dispose();}
 assert.equal(budget.total(),0);
});

test('cancelling CPU admission returns the transferred window and its originating lane allowance',async()=>{
 const budget=new Budget(area*3+windowAllowance+100),{image}=await source(budget),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),peer=await scheduler.acquire({cpu:1}),controller=new AbortController();
 let prepared,calls=0;const ready=new Promise(resolve=>{prepared=resolve;}),pool=new ElasticWorkerPool(budget,{maxWorkers:1,workerBytes:100,ioBytes:windowAllowance,workerFactory:()=>({terminate(){},postMessage(){calls++;}})});
 try{
  const pending=pool.run(1,{signal:controller.signal,prepare:async(index,{signal,reserveInput})=>{const window=await image.surface.readWindow({width,height},{signal,reserve:reserveInput});prepared();return {message:{rgb:window.pixels.data},release:window.release};},consume:()=>assert.fail('Cancelled work produced output')});
  await ready;controller.abort();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(calls,0);assert.equal(budget.total(),area*3);
 }finally{pool.dispose();peer.release();await image.surface.dispose();}
 assert.equal(budget.total(),0);
});
