import test from 'node:test';
import assert from 'node:assert/strict';
import {truforMiniFixture} from './helpers/trufor-mini-strict-fixture.mjs';
import {createM2NpzStream} from '../src/m2-npz-stream.js';
import {truforMiniNpz} from '../src/trufor-mini-npz.js';
import {createM2WorkerHost} from '../src/m2-worker-host.js';
import {createM2WorkerClient} from '../src/m2-worker-client.js';
import {createTruforMiniSourceRegionRouter} from '../src/trufor-mini-source-region-router.js';
import {serveNativeSourceChannel} from '../src/native-source-channel.js';

test('Mini strict outputs retain only real fields and empirical context summaries, with isolated cache/leases',async()=>{
 const f=await truforMiniFixture();let a,b,stream;
 try{
  a=await f.run();assert.equal(f.calls.length,2);assert.equal(a.data.confidence,undefined);assert.equal(a.data.score,undefined);assert.equal(a.data.neuron333,undefined);
  assert.equal(a.data.metadata.method,'trufor-mini');assert.equal(a.data.metadata.scoreKind,'mean_top_1_percent_localization');assert.equal(a.data.context_scores.length,2);
  b=await f.run();assert.equal(f.calls.length,2);assert.equal(b.metrics.cache.result,true);assert.equal(a.data.map.length,8192);
  const x=await a.data.map.readInto(new Float32Array(37),4090);assert(x.every(Number.isFinite));
  stream=await createM2NpzStream('trufor-mini',a,{budget:f.budget});await b.release();b=null;await f.api.clearCache();
  const first=await stream.read(0,Math.min(4*1024**2,stream.length)),text=new TextDecoder().decode(first);
  assert(text.includes('context_scores_top1_percent.npy'));assert(!text.includes('conf.npy'));assert(!text.includes('confidence.npy'));assert(!text.includes('score.npy'));assert(!text.includes('neuron333.npy'));
  assert.equal(f.calls.length,2);await stream.release();stream=null;await a.release();a=null;assert.equal(f.budget.total(),0);
 }finally{await stream?.release();await a?.release();await b?.release();await f.close();assert.equal(f.budget.total(),0);}
});

test('Mini NPZ does not manufacture confidence or official scores for native maps',()=>{
 const map=Float32Array.of(.1,.9,.3,.7),data={width:2,height:2,map,score:.9,metadata:{method:'trufor-mini',scoreKind:'mean_top_1_percent_localization'}};
 let entries;truforMiniNpz({data},Infinity,(_r,_limit,rows)=>entries=rows);
 assert.deepEqual(entries.map(e=>e.key),['map','score_top1_percent','imgsize']);assert.deepEqual([...entries[0].value],[...map]);
 assert.throws(()=>truforMiniNpz({data:{...data,metadata:{method:'trufor'}}},Infinity),/Invalid TruFor Mini/);
});

test('Mini contexts exclude forbidden source pixels before the native analyzer reads them',async()=>{
 const a=await truforMiniFixture({poison:0}),b=await truforMiniFixture({poison:255});let ra,rb;
 try{ra=await a.run();rb=await b.run();assert.deepEqual(a.calls.map(c=>c.signature),b.calls.map(c=>c.signature));assert.deepEqual(await ra.data.map.readInto(new Float32Array(8192)),await rb.data.map.readInto(new Float32Array(8192)));}
 finally{await ra?.release();await rb?.release();await a.close();await b.close();assert.equal(a.budget.total(),0);assert.equal(b.budget.total(),0);}
});

test('Mini abort during a context or final progress callback publishes no result and releases staging',async()=>{
 for(const phase of ['native','progress']){
  const controller=new AbortController(),f=await truforMiniFixture({onAnalyze:()=>{if(phase==='native')controller.abort();}});
  try{await assert.rejects(f.run({signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});await f.api.clearCache();assert.equal(f.held.size,0);assert.equal(f.windows.size,0);assert.equal(f.budget.total(),0);}
  finally{await f.close();}
 }
});

test('Mini result retirement waits for pending reads and retries a rejected native ACK without double unpinning',async()=>{
 let resolveRead,enteredRead,block=false;
 const entered=new Promise(r=>enteredRead=r),gate=new Promise(r=>resolveRead=r),f=await truforMiniFixture({onRead:async()=>{if(block){enteredRead();await gate;}}});
 const analyze=f.native.analyze.bind(f.native),cause=Object.freeze(Error('Native Mini loan retirement refused'));let fail=true,attempts=0,result;
 f.native.analyze=async(...args)=>{const r=await analyze(...args),release=r.release.bind(r);r.release=async()=>{attempts++;if(fail){fail=false;throw cause;}return release();};return r;};
 try{
  result=await f.run();await f.api.clearCache();block=true;const read=result.data.map.readInto(new Float32Array(9));await entered;
  let complete=false;const retiring=result.release().then(()=>complete=true);const rejected=assert.rejects(retiring,e=>e===cause);await new Promise(setImmediate);assert.equal(complete,false);assert.equal(attempts,0);
  resolveRead();await read;await rejected;assert(f.budget.total()>0);await result.release();assert.equal(f.held.size,0);assert.equal(f.budget.total(),0);assert(attempts>=3);
 }finally{resolveRead();await result?.release();await f.close();}
});

test('Mini failed native geometry preserves the primary error and retries unpublished output retirement before its source view',async()=>{
 const f=await truforMiniFixture(),analyze=f.native.analyze.bind(f.native),cause=Object.freeze(Error('Unpublished native loan still active'));let fail=true;
 f.native.analyze=async(...args)=>{const r=await analyze(...args),release=r.release.bind(r);r.data.width++;r.release=async()=>{if(fail){fail=false;throw cause;}return release();};return r;};
 try{await assert.rejects(f.run(),e=>e.code==='INVALID_INPUT'&&e.cleanupError===cause);assert.equal(f.held.size,1);assert(f.budget.total()>0);await f.api.clearCache();assert.equal(f.held.size,0);assert.equal(f.budget.total(),0);}
 finally{await f.close();}
});

test('Mini client disposal keeps its worker alive until the actual host retirement ACK succeeds',async()=>{
 const worker={messages:[],postMessage(value){this.messages.push(value);},terminate(){this.terminated=true;}},opening=createM2WorkerClient({methods:{'trufor-mini':{}}},{workerFactory:()=>worker});
 worker.onmessage({data:{id:worker.messages[0].id,value:{windowBytes:4*1024**2}}});const client=await opening;
 const first=client.dispose(),rejected=assert.rejects(first,e=>e.code==='RETIREMENT_PENDING');assert.equal(worker.messages.at(-1).args.gracefulNativeSources,true);
 worker.onmessage({data:{id:worker.messages.at(-1).id,error:{code:'RETIREMENT_PENDING',message:'Dependent Mini loan did not retire'}}});await rejected;assert.notEqual(worker.terminated,true);
 const retried=client.dispose();worker.onmessage({data:{id:worker.messages.at(-1).id,value:{retainedBytes:0}}});await retried;assert.equal(worker.terminated,true);
});

test('real M2 host retains Mini contexts through cache/result release and streaming export, then closes the borrowed source',async()=>{
 const f=await truforMiniFixture(),messages=[],channel=new MessageChannel(),d=f.domain;
 const provider=serveNativeSourceChannel(channel.port1,{width:d.width,height:d.height,readWindow:(rect,hooks)=>f.image.surface.readWindow({...rect,x:rect.x+d.origin[0],y:rect.y+d.origin[1]},hooks)});
 const host=createM2WorkerHost({post:value=>messages.push(value),analyzerFactories:{'trufor-mini':configuration=>createTruforMiniSourceRegionRouter({...configuration,nativeFactory:()=>f.native})}});
 let serial=0;
 const request=async(operation,args={})=>{const id=++serial;await host.handle({id,operation,args});const answer=messages.find(m=>m.id===id&&('value'in m||m.error));assert(answer);if(answer.error)throw Object.assign(Error(answer.error.message),{code:answer.error.code});return answer.value;};
 try{
  await request('initialize',{methods:{'trufor-mini':{}},memoryBudgetBytes:16*1024**2,computeProfile:'aggressive'});
  const descriptor=await request('analyzeNativeSource',{method:'trufor-mini',image:{format:'rgb8-window-source',sha256:d.sourceSha256,width:d.width,height:d.height,origin:[...d.origin],sourceRegionDomain:d.descriptor,purpose:'analysis-native-contexts',analysisContext:'native-trufor-mini-contexts-only',port:channel.port2}});
  assert(descriptor.fields.map);assert(!descriptor.fields.confidence);assert.equal(descriptor.fields.context_scores.length,2);
  const archive=await request('beginExport',{resultId:descriptor.id});await request('releaseResult',{resultId:descriptor.id});await request('clearCache');
  const bytes=await request('readExport',{exportId:archive.id,offset:0,count:archive.bytes});assert.deepEqual([...bytes.subarray(0,4)],[80,75,3,4]);assert(new TextDecoder().decode(bytes).includes('context_scores_top1_percent.npy'));
  assert.equal(f.calls.length,2);await request('releaseExport',{exportId:archive.id});await provider.whenClosed;
  const memory=await request('dispose',{gracefulNativeSources:true});assert.equal(memory.retainedBytes+memory.cacheBytes+memory.activeReservationBytes,0);assert.equal(f.budget.total(),0);
 }finally{await provider.dispose();channel.port2.close();await f.close();}
});
