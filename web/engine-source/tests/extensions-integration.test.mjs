import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {createExtensionsAdapter,EXTENSION_OPERATIONS} from '../src/extensions-adapter.js';
import {createResultSurfaces} from '../src/segmented-results.js';
import {createExtensionEngine} from './fixtures/extensions-fixture.mjs';

const input=()=>({id:'image',bytes:Uint8Array.of(255,216,255,217),pixels:{width:8,height:6,format:'rgb8',data:Uint8Array.from({length:8*6*3},(_,i)=>i)},provenance:{orientation:6,format:'JPEG'}});
const resources={baseURL:new URL('./fixtures/',import.meta.url).href,moduleURL:'extensions-fixture.mjs'};
function fixture(){return globalThis.__extensionBridgeFixture={};}
function npyEntries(bytes){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out={};let at=0;while(view.getUint32(at,true)===0x04034b50){const size=view.getUint32(at+18,true),length=view.getUint16(at+26,true),extra=view.getUint16(at+28,true),name=new TextDecoder().decode(bytes.subarray(at+30,at+30+length)),start=at+30+length+extra;out[name]=bytes.slice(start,start+size);at=start+size;}return out;}

test('maximum admits two GPU jobs in the same core scheduler; aggressive retains one',async()=>{
 for(const[computeProfile,gpu]of[['maximum',2],['aggressive',1]]){const core=createEngine({computeProfile,memoryBudgetBytes:128*1024**2,resourceHints:{hardwareConcurrency:3}});try{assert.deepEqual(core.capabilities().execution.capacity,{cpu:3,gpu});await core.loadExtensionModels(resources);const state=globalThis.__extensionBridgeFixture;assert.equal(state.options.scheduler.capacity.gpu,gpu);assert.equal(state.options.scheduler.budget,state.options.budget);}finally{await core.dispose();}}
});

test('real core registry, shared admission, exact scientific surfaces and NPZ ownership',async()=>{
 const state=fixture(),core=createEngine({memoryBudgetBytes:128*1024**2,cpuKernel:'reference',resourceHints:{hardwareConcurrency:2,deviceMemoryGiB:8}});
 try{
  const caps=core.capabilities(),ids=Object.keys(EXTENSION_OPERATIONS);assert.equal(ids.length,4);for(const id of ids){assert.equal(caps.operations.find(op=>op.id===id).status,'model-required');assert.ok(caps.sourceAccess.segmentedOperations.includes(id));}
  await core.load(input());await assert.rejects(core.run({id:'missing',imageId:'image',operation:ids[0]}),{code:'MODEL_UNAVAILABLE'});
  const loaded=await core.loadExtensionModels(resources);assert.equal(loaded.sharedResources,true);assert.equal(state.calls,undefined);assert.equal(state.options.scheduler.budget,state.options.budget);assert.equal(state.options.budget.limit,128*1024**2);
  const events=[],batch=await core.runExtensions({id:'all',imageId:'image',backend:'webgpu'},{onProgress:e=>events.push(e)});assert.equal(batch.status,'ok');assert.equal(batch.results.length,4);assert.equal(batch.metrics.maxSourceWindowBytes,12);assert.equal(batch.metrics.sourceReads,1);assert.equal(state.config.resultMode,'borrowed');assert.equal(state.source.sourceFormat,'JPEG');assert.equal(state.source.exifOrientation,6);assert.deepEqual(state.source.encodedBytes,input().bytes);assert.equal(state.source.decodeProvenance.orientation,6);assert.equal(events[0].id,'all');assert.equal(state.held,1);
  const compression=batch.results.find(r=>r.operation==='jpeg.comprint');assert.equal(compression.surface.format,'float64');assert.equal(compression.layout,'surface');assert.equal(compression.pixels,undefined);assert.equal(compression.data.anomaly,undefined);
  const small=await core.readPlane({surfaceId:compression.surface.id,revision:1,rect:{x:1,y:2,width:2,height:1}});assert.ok(small.plane.data instanceof Float64Array);assert.deepEqual([...small.plane.data],[1+17/1e9,1+18/1e9]);
  const display=await core.readDisplay({surfaceId:compression.surface.id,revision:1,tile:{x:0,y:0,w:8,h:6,step:2}});assert.equal(display.pixels.data.length,4*3*3);
  const document=batch.results.find(r=>r.operation==='ai.text.doctamper'),mask=await core.readMask({surfaceId:document.maskSurfaces.analyzed.id,revision:1,rect:{x:0,y:0,width:2,height:1}});assert.deepEqual([...mask.mask.data],[0,255]);
  const exported=await core.exportSurface({surfaceId:compression.surface.id,revision:1,format:'npz',storage:'memory'}),archive=await core.readExport({exportId:exported.id,revision:1}),entries=npyEntries(archive.bytes),npy=entries['anomaly.npy'],view=new DataView(npy.buffer,npy.byteOffset,npy.byteLength),headerLength=view.getUint16(8,true),header=new TextDecoder().decode(npy.subarray(10,10+headerLength));assert.match(header,/'descr': '<f8'/);assert.equal(view.getFloat64(10+headerLength+17*8,true),1+17/1e9);
  await core.releaseSurface(compression.surface.id);assert.equal(state.held,1);const fingerprint=await core.readPlane({surfaceId:compression.planeSurfaces.fingerprint.id,revision:1,rect:{x:0,y:0,width:2,height:1}});assert.equal(fingerprint.plane.data[1],Math.fround(1/48));
  await core.unload('image');assert.equal(state.held,0);assert.equal(state.releases,1);await assert.rejects(core.readPlane({surfaceId:compression.surface.id,revision:1,rect:{x:0,y:0,width:1,height:1}}),{code:'NOT_FOUND'});assert.equal((await core.readExport({exportId:exported.id,revision:1,length:4})).bytes[0],80);await core.releaseExport(exported.id);await core.unloadExtensionModels();assert.equal(state.disposed,1);assert.equal(core.capabilities().memory.activeReservationBytes,0);
 }finally{await core.dispose();}assert.equal(state.held,0);
});

test('individual score ownership, input validation, partial errors and retry after cancellation',async()=>{
 const state=fixture(),core=createEngine({memoryBudgetBytes:128*1024**2});try{await core.load(input());await core.loadExtensionModels(resources);
  const result=await core.run({id:'score',imageId:'image',operation:'ai.generation.bfree'});assert.equal(result.data.scores.raw_logit,-.125);assert.equal(result.surface,undefined);assert.equal(state.held,0);
  for(const task of [{methods:['bfree','bfree']},{methods:['aide']},{methods:['bfree'],backend:'metal'},{methods:['bfree'],regions:[[0,0,1,1]]}])await assert.rejects(core.runExtensions({id:'bad',imageId:'image',...task}),{code:'INVALID_INPUT'});
  state.failedMethod='spai';const partial=await core.runExtensions({id:'partial',imageId:'image',methods:['bfree','spai']});assert.equal(partial.status,'partial');assert.equal(partial.results[1].error.code,'FIXTURE_FAILURE');await assert.rejects(core.run({id:'error',imageId:'image',operation:'ai.generation.spai'}),{code:'FIXTURE_FAILURE'});assert.equal(state.held,0);state.failedMethod=null;
  const stop=new AbortController();await assert.rejects(core.runExtensions({id:'cancel',imageId:'image',methods:['comprint']},{signal:stop.signal,onProgress:()=>stop.abort()}),{code:'CANCELLED'});assert.equal(state.held,0);assert.equal(core.capabilities().memory.activeReservationBytes,0);await core.run({id:'retry',imageId:'image',operation:'ai.generation.bfree'});
 }finally{await core.dispose();}assert.equal(state.held,0);assert.equal(state.disposed,1);
});

test('segmented original byte-source is passed through without full RGB or encoded copies',async()=>{
 const state=fixture(),budget=new Budget(16*1024**2),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),surfaces=new Map(),published=createResultSurfaces(surfaces),adapter=createExtensionsAdapter({budget,scheduler,profile:{maxWorkers:1},version:'fixture',publishResult:(id,r)=>published.publishBundle(id,r),releaseSurface:id=>published.release(id),loadModule:async()=>({createExtensionEngine})});
 const source={byteLength:4,visit:async()=>{},read:async()=>({bytes:Uint8Array.of(255,216,255,217),release(){}})};let readCalls=0,releases=0;const image={sha256:'a'.repeat(64),source,provenance:{orientation:8},surface:{descriptor:{width:12000,height:8000,format:'rgb8'},async readWindow(rect){readCalls++;assert.deepEqual(rect,{x:1,y:1,width:2,height:2});return {pixels:{...rect,format:'rgb8',data:new Uint8Array(12)},release(){releases++;}}}}};
 // The score-only fixture is bounded even when the identified source is 96MP.
 await adapter.load({baseURL:'https://example.invalid/'});
 // Avoid allocating test maps at the source dimensions: this case tests the
 // source contract with a score-only replacement, not a neural implementation.
 state.throwError=Object.assign(Error('Source observed'),{code:'OBSERVED'});
 try{await assert.rejects(adapter.run({id:'bounded',imageId:'large',operation:'ai.generation.bfree'},image),{code:'OBSERVED'});assert.equal(state.source.source,source);assert.equal(state.source.encodedBytes,undefined);assert.equal(state.source.sourceFormat,'JPEG');assert.equal(state.source.exifOrientation,8);assert.equal(readCalls,1);assert.equal(releases,1);assert.equal(budget.total(),0);}finally{await adapter.dispose();scheduler.dispose();}
});

test('invalid resources and failed surface publication roll back leases and remain retryable',async()=>{
 const state=fixture(),budget=new Budget(16*1024**2),scheduler=getExecutionScheduler(budget,{maxWorkers:1});let invalid=true;
 const adapter=createExtensionsAdapter({budget,scheduler,profile:{maxWorkers:1},version:'fixture',publishResult(){throw Error('Publication failed');},releaseSurface(){assert.fail('Nothing was published');},loadModule:async()=>({createExtensionEngine:async options=>{const engine=await createExtensionEngine(options);if(invalid)engine.capabilities=()=>({methods:['bfree','bfree','spai','doctamper','comprint'],sharedBudget:true});return engine;}})});
 const image={sha256:'a'.repeat(64),bytes:Uint8Array.of(255,216),surface:{descriptor:{width:8,height:6,format:'rgb8'},async readWindow(){return{pixels:{width:2,height:2,format:'rgb8',data:new Uint8Array(12)},release(){}};}}};
 try{await assert.rejects(adapter.load({baseURL:'https://example.invalid/'}),{code:'INVALID_INPUT'});assert.equal(adapter.configured(),false);assert.equal(state.disposed,1);invalid=false;await adapter.load({baseURL:'https://example.invalid/'});await assert.rejects(adapter.run({id:'failed',imageId:'image',operation:'jpeg.comprint'},image),/Publication failed/);assert.equal(state.held,0);assert.equal(budget.total(),0);assert.equal((await adapter.run({id:'retry',imageId:'image',operation:'ai.generation.bfree'},image)).status,'ok');assert.equal(state.held,0);}finally{await adapter.dispose();scheduler.dispose();}assert.equal(state.disposed,2);assert.equal(budget.total(),0);
});
