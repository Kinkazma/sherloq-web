import test from 'node:test';import assert from 'node:assert/strict';
import{Budget}from'../src/cache.js';import{EngineError}from'../src/errors.js';
const turn=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
let fixture;
// Only scientific inference and the two independently owned result protocols are
// controlled. The adapter, budget and owner-retirement helper are real.
test('M3 independent asynchronous retirement contracts',async t=>{
 t.mock.module('../src/focal.js',{namedExports:{FocalEngine:class{
  constructor(source){this.image=source;fixture.engine=this;}
  async analyze(){const f=fixture;f.rawCount++;f.budget.retain(13);let freed=false;return{...(f.noRegions?{status:'no-regions',regions:[]}:{map:Float32Array.of(.5)}),metadata:{provider:'cpu',native_shape:[1,1]},async release(){f.rawReleaseCount++;f.rawEntered.resolve();if(f.rawGate)await f.rawGate.promise;if(f.rejectRaw)throw f.rawError;if(!freed){freed=true;f.budget.retained-=13;}}};}
  async dispose(){fixture.engineDisposals++;}
 }}});
 t.mock.module('../src/m3-research-surface.js',{namedExports:{async createResearchSurface(){const f=fixture;f.budget.retain(23);let closed=false;f.surface={descriptor:{id:'result',revision:1,width:2,height:2,format:'rgb8'},async dispose(){if(closed)return;f.surfaceDisposals++;f.surfaceEntered.resolve();if(f.surfaceGate)await f.surfaceGate.promise;if(f.rejectSurface)throw f.cleanup;closed=true;f.budget.retained-=23;}};f.surfaceFactoryEntered.resolve();if(f.surfaceFactoryGate)await f.surfaceFactoryGate.promise;return{surface:f.surface};}}});
 const{createM3Adapter}=await import('../src/m3-adapter.js');
 const make=(extra={})=>{const f={budget:new Budget(1024**2),cleanup:Object.freeze(new EngineError('STORAGE_IO','Unpublished surface ACK failed')),rawError:Object.freeze(new EngineError('STORAGE_IO','Raw result ACK failed')),rejectSurface:false,rejectRaw:false,rawCount:0,rawReleaseCount:0,surfaceDisposals:0,engineDisposals:0,rawEntered:deferred(),surfaceEntered:deferred(),surfaceFactoryEntered:deferred(),...extra};fixture=f;f.adapter=createM3Adapter({budget:f.budget,profile:{maxWorkers:1},version:'test',publishResult(){if(f.primary)throw f.primary;f.published=true;}});f.image={segmented:true,sha256:'a'.repeat(64),provenance:{},surface:{descriptor:{width:2,height:2,format:'rgb8'},readWindow(){throw Error('No model or source read in ownership test');}}};f.run=()=>f.adapter.run({id:'m3-owner',imageId:'original',operation:'ai.localization.focal',params:{}},f.image,{knownHeapBytes:32});f.close=async()=>{f.rejectSurface=f.rejectRaw=false;f.surfaceGate?.resolve();f.rawGate?.resolve();await f.adapter.dispose();if(f.published)await f.surface.dispose();assert.equal(f.budget.total(),0);};return f;};
 await t.test('frozen primary survives surface failure; raw, source and reservation retire independently; retry retains only failed owner',async()=>{
  const f=make({primary:Object.freeze(new EngineError('CANCELLED','Frozen publication failure')),rejectSurface:true});try{await assert.rejects(f.run(),e=>e===f.primary);assert.equal(f.rawReleaseCount,1);assert.equal(f.engine.image,null);assert.equal(f.budget.active,0);assert.equal(f.budget.total(),23);await assert.rejects(f.adapter.clearImages('original'),e=>e===f.cleanup);assert.equal(f.engineDisposals,1);assert.equal(f.budget.total(),23);f.rejectSurface=false;await f.adapter.clearImages('original');assert.equal(f.surfaceDisposals,3);assert.equal(f.engineDisposals,1);assert.equal(f.budget.total(),0);}finally{await f.close();}
 });
 await t.test('a raw ACK is awaited and concurrent clearImages/dispose shares exactly one pending retirement',async()=>{
  const f=make({rawGate:deferred()});const running=f.run();try{await f.rawEntered.promise;let done=false;running.then(()=>done=true,()=>done=true);await turn();assert.equal(done,false);assert.equal(f.budget.active,32);assert.equal(f.rawReleaseCount,1);assert.equal(f.engine.image,null);const one=f.adapter.clearImages('original'),two=f.adapter.dispose();await turn();assert.equal(f.rawReleaseCount,1);assert.equal(f.engineDisposals,0);f.rawGate.resolve();await Promise.all([running,one,two]);assert.equal(f.engineDisposals,1);assert.equal(f.rawReleaseCount,1);assert.equal(f.surfaceDisposals,0,'Published surface ownership remains transferred');assert.equal(f.budget.total(),23);}finally{f.rawGate.resolve();await running.catch(()=>{});await f.close();}
 });
 await t.test('cleanup-only raw failure is propagated and kept for retry without retiring the published surface',async()=>{
  const f=make({rejectRaw:true});try{await assert.rejects(f.run(),e=>e===f.rawError);assert.equal(f.budget.active,0);assert.equal(f.budget.total(),36);assert.equal(f.surfaceDisposals,0);f.rejectRaw=false;await f.adapter.clearImages('original');assert.equal(f.rawReleaseCount,2);assert.equal(f.engineDisposals,1);assert.equal(f.budget.total(),23);}finally{await f.close();}
 });
 await t.test('both failed unpublished owners remain reachable while a frozen primary is preserved',async()=>{
  const f=make({primary:Object.freeze(new EngineError('MEMORY_LIMIT','Frozen primary')),rejectRaw:true,rejectSurface:true});try{await assert.rejects(f.run(),e=>e===f.primary);assert.equal(f.budget.total(),36);assert.equal(f.budget.active,0);f.rejectRaw=f.rejectSurface=false;await f.adapter.clearImages('original');assert.equal(f.budget.total(),0);assert.equal(f.rawReleaseCount,2);assert.equal(f.surfaceDisposals,2);}finally{await f.close();}
 });
 await t.test('reusing a still-live engine acknowledges a failed unpublished owner before new scientific work',async()=>{
  const f=make({primary:Object.freeze(new EngineError('CANCELLED','first failure')),rejectSurface:true});try{await assert.rejects(f.run(),e=>e===f.primary);assert.equal(f.rawCount,1);await assert.rejects(f.run(),e=>e===f.cleanup);assert.equal(f.rawCount,1);f.rejectSurface=false;f.primary=null;await f.run();assert.equal(f.rawCount,2);assert.equal(f.budget.total(),23);}finally{await f.close();}
 });
 await t.test('clearImages cannot lose an unpublished owner while its factory is suspended',async()=>{
  const f=make({surfaceFactoryGate:deferred(),rejectSurface:true,primary:Object.freeze(new EngineError('CANCELLED','Factory publication refused'))});const running=f.run();try{await f.surfaceFactoryEntered.promise;await assert.rejects(f.adapter.clearImages('original'),{code:'BUSY'});assert.equal(f.engineDisposals,0);f.surfaceFactoryGate.resolve();await assert.rejects(running,e=>e===f.primary);assert.equal(f.budget.total(),23);f.rejectSurface=false;await f.adapter.clearImages('original');assert.equal(f.budget.total(),0);assert.equal(f.engineDisposals,1);}finally{f.surfaceFactoryGate.resolve();await running.catch(()=>{});await f.close();}
 });
 await t.test('no-regions also awaits its raw owner before exposing success',async()=>{
  const f=make({noRegions:true,rawGate:deferred()});const running=f.run();try{await f.rawEntered.promise;let done=false;running.then(()=>done=true);await turn();assert.equal(done,false);f.rawGate.resolve();assert.equal((await running).status,'no-regions');assert.equal(f.rawReleaseCount,1);assert.equal(f.surfaceDisposals,0);assert.equal(f.budget.total(),0);}finally{f.rawGate.resolve();await running;await f.close();}
 });
});
