import test from'node:test';import assert from'node:assert/strict';
import*as runtime from'../src/source-region-runtime.js';import*as results from'../src/segmented-results.js';import*as raster from'../src/raster-export.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
const fault=()=>Object.freeze(Object.assign(new Error('ACK refused'),{code:'STORAGE_IO'}));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
test('Core.dispose retains every unacknowledged owner until an explicit retry succeeds',async t=>{
 let state,registry,exports;
 // Delegating factory observers expose actual owners for lifecycle assertions.
 // The engine, registries and Budget are real; only the final external ACKs
 // are controlled. No scientific calculation or model is substituted/run.
 t.mock.module('../src/source-region-runtime.js',{namedExports:{...runtime,createSourceRegionRuntime(options){state=options;return runtime.createSourceRegionRuntime(options);}}});
 t.mock.module('../src/segmented-results.js',{namedExports:{...results,createResultSurfaces(surfaces){registry=results.createResultSurfaces(surfaces);return registry;}}});
 t.mock.module('../src/raster-export.js',{namedExports:{...raster,createRasterExports(...args){exports=raster.createRasterExports(...args);return exports;}}});
 const{createEngine}=await import('../src/index.js');
 const make=()=>{const engine=createEngine({memoryBudgetBytes:128*1024**2,cpuKernel:'single'});return{engine,state,registry,exports};};
 await t.test('failed segmented Original ACK keeps its real image/surface identities and paid bytes',async()=>{
  const f=make(),error=fault();await f.engine.load({id:'original',bytes:Uint8Array.of(1,2,3),pixels:{width:4,height:4,format:'rgb8',data:new Uint8Array(48)}});const image=f.state.images.get('original'),descriptor=image.surface.descriptor,paid=image.retainedBytes;image.segmented=true;image.retainedBytes=0;f.state.budget.retain(31);let calls=0;
  image.surface={descriptor,async dispose(){if(++calls===1)throw error;f.state.budget.retained-=paid+31;}};
  await assert.rejects(Promise.resolve().then(()=>f.engine.dispose()),e=>e===error);assert.equal(f.state.images.get('original'),image);assert.equal(f.state.surfaces.get(descriptor.id)?.record,image);assert.equal(f.state.budget.retained,paid+31);
  await f.engine.dispose();assert.equal(calls,2);assert.equal(f.state.images.size,0);assert.equal(f.state.surfaces.size,0);assert.equal(f.state.budget.total(),0);
 });
 await t.test('a failed displayed result stays in the actual registry and surface map, with its credit',async()=>{
  const f=make(),error=fault();f.state.budget.retain(23);let calls=0;const surface={descriptor:{id:'owned-result',revision:1,width:2,height:2,format:'rgb8'},async dispose(){if(++calls===1)throw error;f.state.budget.retained-=23;}};f.registry.publish('original',{surface});
  await assert.rejects(Promise.resolve().then(()=>f.engine.dispose()),e=>e===error);assert.equal(f.registry.hasAny(),true);assert.equal(f.state.surfaces.get('owned-result')?.record.surface,surface);assert.equal(f.state.budget.retained,23);
  await f.engine.dispose();assert.equal(calls,2);assert.equal(f.registry.hasAny(),false);assert.equal(f.state.surfaces.size,0);assert.equal(f.state.budget.total(),0);
 });
 await t.test('a failed adopted archive remains addressable to Core after the export registry keeps it',async()=>{
  const f=make(),error=fault();f.state.budget.retain(29);let calls=0;f.exports.adopt({byteLength:4,sha256:'a'.repeat(64),store:{readInto(){}},async dispose(){if(++calls===1)throw error;f.state.budget.retained-=29;}},{imageId:'original',width:2,height:2});
  await assert.rejects(Promise.resolve().then(()=>f.engine.dispose()),e=>e===error);assert.equal(f.exports.size,1);assert.equal(f.state.budget.retained,29);await f.engine.dispose();assert.equal(calls,2);assert.equal(f.exports.size,0);assert.equal(f.state.budget.total(),0);
 });
 await t.test('concurrent Core.dispose calls await one actual external result ACK',async()=>{
  const f=make(),entered=deferred(),ack=deferred();f.state.budget.retain(19);let calls=0;f.registry.publish('original',{surface:{descriptor:{id:'pending-result',revision:1,width:2,height:2,format:'rgb8'},async dispose(){calls++;entered.resolve();await ack.promise;f.state.budget.retained-=19;}}});const first=f.engine.dispose();await entered.promise;
  try{assert.throws(()=>f.engine.imagePixels('source'),e=>e.code==='BUSY');const second=f.engine.dispose();assert.equal(second,first);assert.equal(f.state.surfaces.has('pending-result'),true);assert.equal(f.state.budget.retained,19);ack.resolve();await Promise.all([first,second]);assert.equal(calls,1);assert.equal(f.state.budget.total(),0);}finally{ack.resolve();await first;}
 });
 await t.test('nonsegmented Original async ACK is awaited before its identity or paid credit disappears',async()=>{
  const f=make(),error=fault();await f.engine.load({id:'rgb-source',bytes:Uint8Array.of(1,2,3),pixels:{width:4,height:4,format:'rgb8',data:new Uint8Array(48)}});const image=f.state.images.get('rgb-source'),descriptor=image.surface.descriptor,paid=image.retainedBytes;let calls=0;f.state.budget.retain(17);image.surface={descriptor,async dispose(){if(++calls===1)throw error;f.state.budget.retained-=17;}};
  await assert.rejects(f.engine.dispose(),e=>e===error);assert.equal(f.state.images.get('rgb-source'),image);assert.equal(f.state.surfaces.get(descriptor.id)?.record,image);assert.equal(f.state.budget.retained,paid+17);await assert.rejects(f.engine.load({id:'new',bytes:Uint8Array.of(1)}),e=>e.code==='DISPOSED');
  await f.engine.dispose();assert.equal(calls,2);assert.equal(f.state.budget.total(),0);
 });
 await t.test('refused dependent result ACK keeps the Original backing untouched until retry',async()=>{
  const f=make(),error=fault();await f.engine.load({id:'source',bytes:Uint8Array.of(1,2,3),pixels:{width:4,height:4,format:'rgb8',data:new Uint8Array(48)}});const image=f.state.images.get('source'),descriptor=image.surface.descriptor;let sourceCalls=0,resultCalls=0;image.surface={descriptor,async dispose(){sourceCalls++;}};f.state.budget.retain(23);f.registry.publish('source',{surface:{descriptor:{id:'result-before-source',revision:1,width:2,height:2,format:'rgb8'},async dispose(){if(++resultCalls===1)throw error;f.state.budget.retained-=23;}}});
  await assert.rejects(f.engine.dispose(),e=>e===error);assert.equal(sourceCalls,0);assert.equal(f.state.images.get('source'),image);await f.engine.dispose();assert.equal(resultCalls,2);assert.equal(sourceCalls,1);assert.equal(f.state.budget.total(),0);
 });
 await t.test('independent dependent failures retain the first frozen primary and both owners',async()=>{
  const f=make(),first=fault(),second=Object.freeze(Object.assign(new Error('archive ACK refused'),{code:'STORAGE_IO'}));let resultCalls=0,archiveCalls=0;f.state.budget.retain(31);f.registry.publish('source',{surface:{descriptor:{id:'frozen-result',revision:1,width:2,height:2,format:'rgb8'},async dispose(){if(++resultCalls===1)throw first;f.state.budget.retained-=13;}}});f.exports.adopt({byteLength:4,sha256:'b'.repeat(64),store:{readInto(){}},async dispose(){if(++archiveCalls===1)throw second;f.state.budget.retained-=18;}},{imageId:'source',width:2,height:2});
  await assert.rejects(f.engine.dispose(),e=>e===first);assert.equal(resultCalls,1);assert.equal(archiveCalls,1);assert.equal(f.state.budget.total(),31);assert.equal(f.registry.hasAny(),true);assert.equal(f.exports.size,1);await f.engine.dispose();assert.equal(resultCalls,2);assert.equal(archiveCalls,2);assert.equal(f.state.budget.total(),0);
 });
 await t.test('acknowledged independent Original owners are never retired twice after a sibling refuses',async()=>{
  const f=make(),error=fault(),calls={a:0,b:0};for(const id of ['a','b']){await f.engine.load({id,bytes:Uint8Array.of(1,2,3),pixels:{width:4,height:4,format:'rgb8',data:new Uint8Array(48)}});const image=f.state.images.get(id),descriptor=image.surface.descriptor;image.surface={descriptor,async dispose(){calls[id]++;if(id==='b'&&calls[id]===1)throw error;}};}
  await assert.rejects(f.engine.dispose(),e=>e===error);assert.equal(f.state.images.has('a'),false);assert.equal(f.state.images.has('b'),true);assert.deepEqual(calls,{a:1,b:1});await f.engine.dispose();assert.deepEqual(calls,{a:1,b:2});assert.equal(f.state.budget.total(),0);
 });

 await t.test('derived comparison/PRNU owners stay attached to their real source record after a refused ACK',async()=>{
  for(const field of ['comparisonDomainOwner','prnuDomainOwner']){
   const f=make(),error=fault();await f.engine.load({id:'source',bytes:Uint8Array.of(1,2,3),pixels:{width:16,height:12,format:'rgb8',data:new Uint8Array(576)}});const original=f.state.images.get('source'),state=await createOriginalSourceRegionsState({sourceSha256:original.sha256,width:16,height:12});await state.add('acquisition',{x0:1,y0:1,x1:12,y1:10});const domain=await compileOriginalSourceRegions(state.snapshot());await f.engine.deriveSourceRegionInput({imageId:'source',purpose:'preparation-envelope',sourceRegionDomain:domain.descriptor});const record=[...f.state.images.values()].find(im=>im!==original);f.state.budget.retain(17);let calls=0;const owner={async dispose(){if(++calls===1)throw error;f.state.budget.retained-=17;}};record[field]=owner;
   await assert.rejects(f.engine.dispose(),e=>e===error);assert.equal(record[field],owner);assert.equal(f.state.images.has('source'),true);await f.engine.dispose();assert.equal(calls,2);assert.equal(f.state.budget.total(),0);
  }
 });

 await t.test('reference unload preserves its real comparison owner after a rejected ACK',async()=>{
  const f=make(),error=fault();for(const id of ['source','reference'])await f.engine.load({id,bytes:Uint8Array.of(1,2,3),pixels:{width:16,height:12,format:'rgb8',data:new Uint8Array(576)}});const original=f.state.images.get('source'),state=await createOriginalSourceRegionsState({sourceSha256:original.sha256,width:16,height:12});await state.add('acquisition',{x0:1,y0:1,x1:12,y1:10});const domain=await compileOriginalSourceRegions(state.snapshot());await f.engine.deriveSourceRegionInput({imageId:'source',purpose:'preparation-envelope',sourceRegionDomain:domain.descriptor});const record=[...f.state.images.values()].find(im=>im.originalSource===original);assert(record);f.state.budget.retain(17);let calls=0;const owner={reference:{id:'reference'},async dispose(){if(++calls===1)throw error;f.state.budget.retained-=17;}};record.comparisonDomainOwner=owner;
  await assert.rejects(f.engine.unload('reference'),e=>e===error);assert.equal(record.comparisonDomainOwner,owner);assert.equal(f.state.images.has('reference'),true);await f.engine.unload('reference');assert.equal(calls,2);assert.equal(record.comparisonDomainOwner,null);await f.engine.dispose();assert.equal(f.state.budget.total(),0);
 });

 await t.test('failed contiguous-image cache ACK never closes the Original surface during Core disposal',async()=>{
  const f=make(),error=fault();await f.engine.load({id:'source',bytes:Uint8Array.of(1,2,3),pixels:{width:4,height:4,format:'rgb8',data:new Uint8Array(48)}});const image=f.state.images.get('source'),native=image.surface.dispose.bind(image.surface);let cacheCalls=0,surfaceCalls=0;f.state.budget.retain(17);image.emCache={async dispose(){if(++cacheCalls===1)throw error;f.state.budget.retained-=17;}};image.surface.dispose=async()=>{surfaceCalls++;await native();};
  await assert.rejects(f.engine.dispose(),e=>e===error);assert.equal(surfaceCalls,0);assert.equal(f.state.images.get('source'),image);await f.engine.dispose();assert.equal(cacheCalls,2);assert.equal(surfaceCalls,1);assert.equal(f.state.budget.total(),0);
 });
 await t.test('unload refuses a dependent result ACK before retiring the still-owned Original backing',async()=>{
  const f=make(),error=fault();await f.engine.load({id:'source',bytes:Uint8Array.of(1,2,3),pixels:{width:4,height:4,format:'rgb8',data:new Uint8Array(48)}});const image=f.state.images.get('source'),native=image.surface.dispose.bind(image.surface);let surfaceCalls=0,resultCalls=0;image.surface.dispose=async()=>{surfaceCalls++;await native();};f.state.budget.retain(23);f.registry.publish('source',{surface:{descriptor:{id:'unload-result',revision:1,width:2,height:2,format:'rgb8'},async dispose(){if(++resultCalls===1)throw error;f.state.budget.retained-=23;}}});
  await assert.rejects(f.engine.unload('source'),e=>e===error);assert.equal(surfaceCalls,0);assert.equal(f.state.images.get('source'),image);assert.equal(f.registry.hasAny(),true);await f.engine.unload('source');assert.equal(resultCalls,2);assert.equal(surfaceCalls,1);assert.equal(f.state.images.size,0);await f.engine.dispose();assert.equal(f.state.budget.total(),0);
 });

});
