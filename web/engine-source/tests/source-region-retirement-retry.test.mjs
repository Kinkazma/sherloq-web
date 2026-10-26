import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {createSourceRegionRuntime} from '../src/source-region-runtime.js';
import {createResultSurfaces} from '../src/segmented-results.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createEngine} from '../src/index.js';import {FocalEngine} from '../src/focal.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function fixture(){
 const budget=new Budget(1048576),store=await createSegmentedBytes(144,{budget}),surface=createRgbSurface(store,{width:8,height:6,budget}),source={kind:'image',segmented:true,sha256:'a'.repeat(64),surface,store,retainedBytes:144,provenance:{}},images=new Map([['original',source]]),surfaces=new Map([[surface.descriptor.id,{imageId:'original',record:source}]]),resultSurfaces=createResultSurfaces(surfaces),state=await createOriginalSourceRegionsState({sourceSha256:source.sha256,width:8,height:6});
 await state.add('acquisition',{x0:1,y0:1,x1:6,y1:5});const domain=await compileOriginalSourceRegions(state.snapshot()),owners=new Map();let calls=0,failure,gate,entered,originalDisposals=0;const nativeDispose=surface.dispose.bind(surface);surface.dispose=()=>{originalDisposals++;return nativeDispose();};
 const runtime=createSourceRegionRuntime({budget,images,surfaces,resultSurfaces,getImage:id=>images.get(id),withBusy:fn=>fn(),knownHeapBytes:()=>0,runLegacy:async task=>({id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',analysisId:'native-analysis'}),retireAnalysis:async id=>{calls++;if(gate){entered.resolve();await gate.promise;}if(failure){const e=failure;failure=null;throw e;}owners.get(id)?.();owners.delete(id);}});
 const reader=await runtime.deriveInput({imageId:'original',purpose:'preparation-envelope',sourceRegionDomain:domain.descriptor}),id=[...images.keys()].find(x=>x!=='original'),record=images.get(id);owners.set(id,budget.reserve(1024));
 return{budget,source,images,surfaces,resultSurfaces,runtime,reader,id,record,domain,owners,get calls(){return calls;},get originalDisposals(){return originalDisposals;},failNative(error){failure=error;},pause(){gate=deferred();entered=deferred();return{entered:entered.promise,resume:()=>gate.resolve()};},async close(){failure=null;gate?.resolve();await runtime.clear();for(const f of owners.values())f();owners.clear();await resultSurfaces.clear();await surface.dispose();assert.equal(budget.total(),0);}};
}
test('failed native cleanup preserves derived source identity and metadata until retry succeeds',async()=>{
 const h=await fixture();try{const error=Object.freeze(new Error('native ACK'));h.failNative(error);await assert.rejects(h.runtime.clear('original'),e=>e===error);assert.equal(h.runtime.owns(h.id),true);assert.equal(h.images.get(h.id),h.record);assert.equal(h.owners.has(h.id),true);assert.equal(h.originalDisposals,0);assert(h.budget.total()>144+1024);
  await h.runtime.clear('original');assert.equal(h.calls,2);assert.equal(h.runtime.size,0);assert.equal(h.images.has(h.id),false);assert.equal(h.owners.size,0);assert.equal(h.budget.total(),144);assert.equal(h.originalDisposals,0);
 }finally{await h.close();}
});
test('failed result cleanup never starts native retirement or closes derived pixels',async()=>{
 const h=await fixture();try{const presentation=h.surfaces.get(h.reader.sourceRegionSourceSurface.id).record.surface,dispose=presentation.dispose.bind(presentation),error=Object.freeze(new Error('result ACK'));let attempts=0;presentation.dispose=()=>{if(++attempts===1)throw error;return dispose();};await assert.rejects(h.runtime.clear('original'),e=>e===error);assert.equal(h.calls,0);assert.equal(h.runtime.owns(h.id),true);assert.equal(h.resultSurfaces.hasFor(h.id),true);const read=await h.record.surface.readWindow();read.release();await h.runtime.clear('original');assert.equal(attempts,2);assert.equal(h.calls,1);assert.equal(h.budget.total(),144);
 }finally{await h.close();}
});
test('failed derived pixel cleanup retries only that stage and keeps Original untouched',async()=>{
 const h=await fixture();try{const dispose=h.record.surface.dispose.bind(h.record.surface),error=Object.freeze(new Error('pixel ACK'));let attempts=0;h.record.surface.dispose=()=>{if(++attempts===1)throw error;return dispose();};await assert.rejects(h.runtime.clear('original'),e=>e===error);assert.equal(h.calls,1);assert.equal(h.owners.size,0);assert.equal(h.runtime.owns(h.id),true);assert.equal(h.originalDisposals,0);await h.runtime.clear('original');assert.equal(attempts,2);assert.equal(h.calls,1);assert.equal(h.budget.total(),144);
 }finally{await h.close();}
});
test('concurrent derived retirement shares its native ACK and retains identity while pending',async()=>{
 const h=await fixture();try{const pause=h.pause(),a=h.runtime.clear('original');await pause.entered;const b=h.runtime.clear('original');assert.equal(h.calls,1);assert.equal(h.images.get(h.id),h.record);assert.equal(h.runtime.owns(h.id),true);pause.resume();await Promise.all([a,b]);assert.equal(h.calls,1);assert.equal(h.budget.total(),144);
 }finally{await h.close();}
});
test('a source domain requested after failed retirement completes old cleanup before recreating its pixels',async()=>{
 const h=await fixture();try{h.failNative(new Error('native ACK'));await assert.rejects(h.runtime.clear('original'),/native ACK/);const next=await h.runtime.deriveInput({imageId:'original',purpose:'preparation-envelope',sourceRegionDomain:h.domain.descriptor});assert.equal(h.calls,2);assert.notEqual(next.sourceRegionSourceSurface.id,h.reader.sourceRegionSourceSurface.id);assert.notEqual(h.images.get(h.id),h.record);assert.equal(h.owners.size,0);await h.runtime.clear('original');assert.equal(h.budget.total(),144);
 }finally{await h.close();}
});
test('retained analysis metadata stays owned but is not reusable while its source is retiring',async()=>{
 const h=await fixture();try{await h.runtime.run({id:'controlled-retained',imageId:'original',operation:'ai.clones.d2prl',params:{minimum:500},sourceRegionDomain:h.domain.descriptor});const request={analysisId:'native-analysis',imageId:'original'};assert.equal(h.runtime.internalRequest(request).imageId,h.id);h.failNative(new Error('native ACK'));await assert.rejects(h.runtime.clear('original'),/native ACK/);assert.throws(()=>h.runtime.internalRequest(request),{code:'CACHE_MISS'});assert(h.budget.active>1024);await h.runtime.clear('original');assert.deepEqual(h.runtime.internalRequest(request),request);assert.equal(h.budget.total(),144);
 }finally{await h.close();}
});
test('public unload retries the retained derived FOCAL owner before retiring Original',async t=>{
 const nativeDispose=FocalEngine.prototype.dispose;let failures=1,attempts=0;const owners=new Set();
 t.mock.method(FocalEngine.prototype,'analyze',async function(){if(!this.testLease){this.testLease=this.budget.reserve(512);owners.add(this);}return{map:new Float32Array(4096).fill(.4),features:new Float32Array(4096*288),metadata:{native_shape:[64,64],image_shape:[this.image.height,this.image.width],provider:'wasm'},release(){}};});
 t.mock.method(FocalEngine.prototype,'dispose',function(){attempts++;if(failures){failures--;throw Object.assign(new Error('native FOCAL cleanup ACK'),{code:'STORAGE_IO'});}this.testLease?.();this.testLease=null;owners.delete(this);return nativeDispose.call(this);});
 const engine=createEngine({memoryBudgetBytes:128*1024**2,cpuKernel:'single'});try{const loaded=await engine.load({id:'original',bytes:Uint8Array.of(1,2,3),pixels:{width:24,height:20,format:'rgb8',data:new Uint8Array(24*20*3)}});await engine.loadM3Models({models:{focal:{controlled:true}}});const state=await createOriginalSourceRegionsState({sourceSha256:loaded.sha256,width:24,height:20});await state.add('acquisition',{x0:2,y0:2,x1:10,y1:18});await state.add('acquisition',{x0:14,y0:2,x1:22,y1:18});const domain=await compileOriginalSourceRegions(state.snapshot());await engine.run({id:'focal',imageId:'original',operation:'ai.localization.focal',params:{},backend:'cpu',sourceRegionDomain:domain.descriptor});assert.equal(owners.size,2);
  await assert.rejects(engine.unload('original'),{code:'RESEARCH_CLEANUP_FAILED'});assert.equal(owners.size,1);assert.deepEqual(engine.original('original'),Uint8Array.of(1,2,3));await engine.unload('original');assert.equal(owners.size,0);assert.equal(attempts,3);await engine.unloadM3Models();const memory=engine.capabilities().memory;assert.equal(memory.retainedBytes+memory.cacheBytes+memory.activeReservationBytes,0);
 }finally{await engine.dispose();}
});
