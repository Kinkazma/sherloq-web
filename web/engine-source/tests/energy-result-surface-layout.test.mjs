import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';

const params={quality:75,block:16,minimum:1,profile:'manual',histogramLow:100,histogramHigh:900,shadow:20,highlight:20};
const pixels={width:96,height:96,format:'rgb8',data:Uint8Array.from({length:96*96*3},(_,i)=>(i*37+(i%17)*91)%256)};
const raw=value=>new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
test('a resident Original can retain exact native Energy maps as surfaces instead of copying them to its consumer',async()=>{
 const engine=createEngine({memoryBudgetBytes:512*1024**2,cpuKernel:'single'});
 try{
  await engine.load({id:'original',bytes:Uint8Array.of(1),pixels});
  for(const profile of ['manual','standard','conservative']){
   const p=profile==='manual'?params:{quality:75,block:16,minimum:1,profile};
   const task={imageId:'original',operation:'ela.energy',params:p,backend:'cpu'};
   const reference=await engine.run({...task,id:'reference-'+profile});
   const actual=await engine.run({...task,id:'surface-'+profile,resultLayout:'surface'});
   assert.equal(actual.layout,'surface');
   assert.equal(actual.data.energy_planes,undefined,'the consumer does not receive a contiguous scientific clone');
   for(const [name,surface] of Object.entries(actual.planeSurfaces)){
    const part=(await engine.readPlane({surfaceId:surface.id,revision:surface.revision,rect:{x:0,y:0,width:96,height:96}})).plane.data;
    const match=/^energy_plane_(\d)$/.exec(name),expected=match?reference.data.energy_planes.subarray(+match[1]*96*96,(+match[1]+1)*96*96):reference.data[name];
    assert.deepEqual(raw(part),raw(expected),profile+' '+name);
   }
   assert.deepEqual(actual.data.regions,reference.data.regions);
   assert.deepEqual(actual.data.energy_summary,reference.data.energy_summary);
   assert.deepEqual(actual.data.metadata.energy,reference.data.metadata.energy);
   for(const id of new Set(Object.values(actual.planeSurfaces).map(s=>s.id)))await engine.releaseSurface(id);
   const cached=await engine.run({...task,id:'cached-'+profile,resultLayout:'surface'});
   assert.equal(cached.metrics.cache.result,true);
   assert.deepEqual(cached.data.regions,reference.data.regions);
   for(const id of new Set(Object.values(cached.planeSurfaces).map(s=>s.id)))await engine.releaseSurface(id);
  }
  await assert.rejects(engine.run({id:'bad',imageId:'original',operation:'ela.classic',resultLayout:'surface'}),{code:'INVALID_INPUT'});
  await engine.unload('original');
  const memory=engine.capabilities().memory;
  assert.equal(memory.retainedBytes,0);assert.equal(memory.activeReservationBytes,0);assert.equal(memory.cacheBytes,0);
 }finally{await engine.dispose();}
});

test('the explicit native surface route never substitutes an injected scientific codec',async()=>{
 let calls=0;const codec={memoryBytes:()=>0,async recompress(image){calls++;return {...image,data:Uint8Array.from(image.data,v=>Math.max(0,v-7))};}};
 const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single',codec});
 try{
  await engine.load({id:'custom',bytes:Uint8Array.of(1),pixels});
  const task={id:'custom-result',imageId:'custom',operation:'ela.energy',params,backend:'cpu'};
  await assert.rejects(engine.run({...task,resultLayout:'surface'}),{code:'UNSUPPORTED_LAYOUT'});assert.equal(calls,0);
  const native=await engine.run(task);assert(native.data.energy_planes instanceof Float32Array);assert.equal(calls,3);
 }finally{await engine.dispose();}
});
