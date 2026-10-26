import test from 'node:test';import assert from 'node:assert/strict';
import * as runtime from '../src/source-region-runtime.js';
import {sampleCachedSource,hasCachedPreviewSamples} from '../src/cached-parameter-preview.js';
const fault=()=>Object.freeze(Object.assign(new Error('source frame ACK refused'),{code:'STORAGE_IO'}));
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
test('engine keeps every Original with an unacknowledged cached-preview sample',async t=>{
 let state;t.mock.module('../src/source-region-runtime.js',{namedExports:{...runtime,createSourceRegionRuntime(options){state=options;return runtime.createSourceRegionRuntime(options);}}});const{createEngine}=await import('../src/index.js');
 async function make(id,failures=2){const engine=createEngine({memoryBudgetBytes:128*1024**2,cpuKernel:'single'});await engine.load({id,bytes:Uint8Array.of(4,9,1),pixels:{width:4,height:4,format:'rgb8',data:new Uint8Array(48)}});const record=state.images.get(id),descriptor=record.surface.descriptor,error=fault();let releases=0,disposals=0,gate;record.surface={descriptor,async readSampledWindow(){const free=state.budget.reserve(48);let done=false;return{pixels:{width:4,height:4,format:'rgb8',data:new Uint8Array(48)},async release(){if(done)return;releases++;if(gate)await gate.promise;if(releases<=failures)throw error;done=true;free();}};},dispose(){disposals++;}};return{engine,record,error,state,get releases(){return releases;},get disposals(){return disposals;},set gate(value){gate=value;}};}
 await t.test('unload refuses and retains the image, then retries its exact sample before forgetting',async()=>{
  const f=await make('unload-original');await assert.rejects(sampleCachedSource(f.record,{x:0,y:0,w:4,h:4,step:1}),value=>value===f.error);const owned=f.engine.capabilities().memory.activeReservationBytes;
  await assert.rejects(Promise.resolve().then(()=>f.engine.unload('unload-original')),value=>value===f.error);assert.equal(f.state.images.get('unload-original'),f.record);assert.equal(f.disposals,0);assert.equal(f.engine.capabilities().memory.activeReservationBytes,owned);assert.equal(hasCachedPreviewSamples(f.record),true);
  await f.engine.unload('unload-original');assert.equal(f.state.images.has('unload-original'),false);assert.equal(f.releases,3);assert.equal(f.disposals,1);assert.equal(f.engine.capabilities().memory.activeReservationBytes,0);await f.engine.dispose();
 });
 await t.test('dispose retains old and new Originals while one ACK refuses, then retries before its final close',async()=>{
  const f=await make('old-original');await assert.rejects(sampleCachedSource(f.record,{x:0,y:0,w:4,h:4,step:1}),value=>value===f.error);await f.engine.load({id:'new-original',bytes:Uint8Array.of(7),pixels:{width:1,height:1,format:'rgb8',data:new Uint8Array(3)}});const newest=f.state.images.get('new-original');
  await assert.rejects(Promise.resolve().then(()=>f.engine.dispose()),value=>value===f.error);assert.equal(f.state.images.get('old-original'),f.record);assert.equal(f.state.images.get('new-original'),newest);assert.equal(f.disposals,0);assert.equal(f.engine.capabilities().memory.activeReservationBytes,48);
  await f.engine.dispose();assert.equal(f.state.images.size,0);assert.equal(f.releases,3);assert.equal(f.disposals,1);
 });
 await t.test('a pending ACK keeps BUSY until unload can actually retire the old Original',async()=>{
  const f=await make('suspended-original',1);await assert.rejects(sampleCachedSource(f.record,{x:0,y:0,w:4,h:4,step:1}),value=>value===f.error);const gate=deferred();f.gate=gate;let finished=false;const request=Promise.resolve(f.engine.unload('suspended-original')).then(()=>finished=true);await turn();assert.equal(finished,false);assert.equal(f.disposals,0);assert.throws(()=>f.engine.unload('suspended-original'),{code:'BUSY'});gate.resolve();await request;assert.equal(finished,true);assert.equal(f.disposals,1);await f.engine.dispose();
 });
});
