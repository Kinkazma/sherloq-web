import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {EngineError} from '../src/errors.js';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {preparePagedEligibility} from '../src/dense-paged-regions.js';
import {runPagedDenseField} from '../src/dense-paged.js';
const enabled=process.execArgv.includes('--experimental-test-module-mocks'),deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('a real texture refusal drains a live native field and resumes only the missing eligibility work',{skip:!enabled,timeout:15000},async t=>{
 const width=260,height=24,n=width*height,budget=new Budget(256*1024**2),pixelStore=await createSegmentedBytes(n*3,{budget,storage:'memory'});await pixelStore.write(Uint8Array.from({length:n*3},(_,i)=>(i*23)&255));
 const surface=createRgbSurface(pixelStore,{width,height,budget}),read=surface.readWindowInto.bind(surface),entered=deferred(),continueField=deferred(),fifthRefusal=deferred(),closing=[];let failing=true,refusals=0,windows=0,firstRead=true,settled=false;
 surface.readWindowInto=async(rect,target,options)=>{windows++;if(failing&&rect.x>0){refusals++;fifthRefusal.resolve();throw new EngineError('STORAGE_IO','Injected texture read failure');}return read(rect,target,options);};
 const nativeFactory=()=>{const worker=new Worker(new URL('./helpers/browser-module-worker.mjs',import.meta.url),{workerData:{module:new URL('../src/dense-texture-worker.js',import.meta.url).href}}),adapter={postMessage:(data,transfer)=>worker.postMessage(data,transfer),terminate:()=>closing.push(worker.terminate())};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',error=>adapter.onerror?.(error));return adapter;};
 const descriptorRelease=budget.reserve(n*48),data=Float32Array.from({length:n*12},(_,i)=>Math.fround((i*11%71)/71)),bytes=new Uint8Array(data.buffer),descriptor={byteLength:bytes.length,async readInto(out,offset=0){if(firstRead){firstRead=false;entered.resolve();await continueField.promise;}const {byteView}=await import('../src/memory-range.js');byteView(out).set(bytes.subarray(offset,offset+out.byteLength));}};
 const progress=[];const jobs=[0,1].map(id=>({crop:{x:0,y:0},width,height,pass:{method:0,patch:3,targetPatch:3,reflection:false},eligibility:{texture:id?2:0},options:{radius:6,minimum:3,iterations:1,seed:729+id},context:{id}})),calls=[0,0];
 t.mock.module('../src/dense-image.js',{namedExports:{denseImageParams:input=>({coherence:false,threshold:.5,patch:3,limit:2,...input}),denseImageJobs:()=>({jobs,plan:{},contexts:[{}],policy:{}})}});
 t.mock.module('../src/dense-paged-zernike.js',{namedExports:{preparePagedZernike:async()=>({first:descriptor,dispose(){}})}});
 t.mock.module('../src/dense-paged-regions.js',{namedExports:{preparePagedEligibility:(image,options)=>preparePagedEligibility(image,{...options,maxWorkers:1,workerFactory:nativeFactory})}});
 t.mock.module('../src/dense-paged-field-pool.js',{namedExports:{DensePagedFieldPool:class{constructor(){this.jobs=0;this.peakWorkers=1;this.pending=[];}start(input,settings){const id=settings.seed-729;calls[id]++;this.jobs++;const task=runPagedDenseField(input,{...settings,storage:'memory'});this.pending.push(task);return task;}async drain(){await Promise.allSettled(this.pending);}}}});
 t.mock.module('../src/dense-cold-field.js',{namedExports:{storeColdDenseField:async field=>field}});
 t.mock.module('../src/dense-paged-links.js',{namedExports:{samplePagedDenseLinks:async()=>({count:0,total:0,denseCount:0,rows:{readInto(){}},dispose(){}})}});
 const {PagedDenseImageEngine}=await import('../src/dense-paged-image.js?drain-native'),engine=new PagedDenseImageEngine({surface},budget,{maxWorkers:2});let result;
 try{
  const attempt=engine.analyze({}, {checkpointKey:'drain',onProgress:event=>progress.push(event)});attempt.finally(()=>{settled=true;}).catch(()=>{});await entered.promise;await fifthRefusal.promise;await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false,'Terminal preparation waits for required active work to finish');const draining=progress.find(e=>e.phase==='resource-draining');assert.equal(draining?.error.code,'STORAGE_IO');assert.equal(draining.activeFields,1);assert.equal(draining.completedFields,0);continueField.resolve();await assert.rejects(attempt,{code:'STORAGE_IO'});
  assert.deepEqual(calls,[1,0]);assert.ok(engine.partial.fields[0]);assert.equal(engine.partial.masks.get(1).textureCheckpoint.completed,1);const before=new Uint8Array(n*4);await engine.partial.fields[0].targets.readInto(before);const comparisons=engine.partial.fields[0].comparisons;
  failing=false;result=await engine.analyze({}, {checkpointKey:'drain'});assert.deepEqual(calls,[1,1]);assert.equal(windows,4);const after=new Uint8Array(n*4);await result.fields[0].targets.readInto(after);assert.deepEqual(after,before);assert.equal(result.fields[0].comparisons,comparisons);
 }finally{continueField.resolve();await result?.release();await engine.dispose();descriptorRelease();await surface.dispose();await Promise.all(closing);}assert.equal(budget.total(),0);
});
