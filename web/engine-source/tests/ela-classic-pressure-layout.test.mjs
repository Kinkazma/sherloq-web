import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';

const MiB=1024**2,params={quality:29,scale:78,contrast:0,linear:false,grayscale:false};
function pixels(width,height){return{width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>{const pixel=Math.floor(i/3),x=pixel%width,y=Math.floor(pixel/width);return i%3===0?(3*x+5*y+x*y%73)%256:i%3===1?(x+7*y)%256:(11*x+y+x*y%97)%256;})};}
async function outputRgb(engine,answer){if(answer.pixels)return answer.pixels.data;return(await engine.readPixels({surfaceId:answer.surface.id,revision:answer.surface.revision,rect:{x:0,y:0,width:answer.surface.width,height:answer.surface.height}})).pixels.data;}

test('Classic switches only the inadmissible full workspace to exact full-resolution native surfaces, then recovers',async()=>{
 const engine=createEngine({memoryBudgetBytes:256*MiB,cpuKernel:'single'}),source=pixels(1024,1024),original=source.data.slice();let lease,result;
 try{
  await engine.load({id:'source',bytes:Uint8Array.of(1),pixels:source});
  const request={imageId:'source',operation:'ela.classic',params,backend:'cpu'},reference=await engine.run({...request,id:'ordinary'});assert(reference.pixels);const expected=reference.pixels.data.slice(),memory=engine.capabilities().memory;
  const contiguousAdmission=Math.max(32*MiB,memory.knownHeapCapacityBytes)+source.data.byteLength*16,remaining=contiguousAdmission-1;
  lease=await engine.reserveExternalMemory({bytes:memory.policyAvailableBytes+memory.cacheBytes-remaining});
  const admitted=engine.capabilities().memory;assert.equal(admitted.policyAvailableBytes+admitted.cacheBytes,remaining,'even ordinary cache reclaim cannot admit the old full workspace');
  result=await engine.run({...request,id:'pressure'});assert.equal(result.layout,'surface');assert.deepEqual([result.surface.width,result.surface.height],[source.width,source.height]);assert.deepEqual(result.provenance.params,params);assert.equal(result.provenance.backend,'cpu');assert.equal(result.metrics.recompressions,1);
  assert.deepEqual(await outputRgb(engine,result),expected);assert.deepEqual(source.data,original);
  await engine.releaseSurface(result.surface.id);result=null;await engine.releaseExternalMemory(lease.id);lease=null;
  const recovered=await engine.run({...request,id:'recovered'});assert(recovered.pixels,'the admitted ordinary route remains contiguous');assert.deepEqual(recovered.pixels.data,expected);
  await engine.unload('source');const after=engine.capabilities().memory;assert.equal(after.retainedBytes,0);assert.equal(after.activeReservationBytes,0);assert.equal(after.cacheBytes,0);
 }finally{if(result?.surface)await engine.releaseSurface(result.surface.id);if(lease)await engine.releaseExternalMemory(lease.id);await engine.dispose();}
});

test('a real bounded-layout refusal or cancellation leaves no published result and permits a funded retry',async()=>{
 const engine=createEngine({memoryBudgetBytes:128*MiB,cpuKernel:'single'}),source=pixels(96,96);let lease;
 try{
  await engine.load({id:'source',bytes:Uint8Array.of(1),pixels:source});
  const request={imageId:'source',operation:'ela.classic',params,backend:'cpu'},memory=engine.capabilities().memory,remaining=memory.knownHeapCapacityBytes;
  lease=await engine.reserveExternalMemory({bytes:memory.policyAvailableBytes-remaining});
  await assert.rejects(engine.run({...request,id:'refused'}),{code:'MEMORY_LIMIT'});
  const controller=new AbortController();controller.abort();await assert.rejects(engine.run({...request,id:'cancelled'},{signal:controller.signal}),{code:'CANCELLED'});
  await engine.releaseExternalMemory(lease.id);lease=null;
  const retry=await engine.run({...request,id:'retry'});assert(retry.pixels);assert.deepEqual([retry.pixels.width,retry.pixels.height],[96,96]);
  await engine.unload('source');const after=engine.capabilities().memory;assert.equal(after.retainedBytes,0);assert.equal(after.activeReservationBytes,0);assert.equal(after.cacheBytes,0);
 }finally{if(lease)await engine.releaseExternalMemory(lease.id);await engine.dispose();}
});

test('an injected codec keeps its historical admission refusal without substitution by the native JPEG surface codec',async()=>{
 let recompressions=0;const codec={id:'controlled-custom-codec',memoryBytes:()=>0,async recompress(){recompressions++;assert.fail('The underfunded custom operation must not execute');}},engine=createEngine({codec,memoryBudgetBytes:256*MiB,cpuKernel:'single'}),source=pixels(1024,1024);let lease;
 try{
  await engine.load({id:'source',bytes:Uint8Array.of(1),pixels:source});const memory=engine.capabilities().memory,admission=Math.max(32*MiB,memory.knownHeapCapacityBytes)+source.data.byteLength*16;
  lease=await engine.reserveExternalMemory({bytes:memory.policyAvailableBytes+memory.cacheBytes-admission+1});
  await assert.rejects(engine.run({id:'custom-refused',imageId:'source',operation:'ela.classic',params,backend:'cpu'}),{code:'MEMORY_LIMIT'});assert.equal(recompressions,0);
  await engine.releaseExternalMemory(lease.id);lease=null;await engine.unload('source');const after=engine.capabilities().memory;assert.equal(after.retainedBytes,0);assert.equal(after.activeReservationBytes,0);assert.equal(after.cacheBytes,0);
 }finally{if(lease)await engine.releaseExternalMemory(lease.id);await engine.dispose();}
});
