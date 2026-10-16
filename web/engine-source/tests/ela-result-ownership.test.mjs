import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEngine} from '../src/index.js';
import {PIXEL_OPERATIONS,ownedPayloadBytes} from '../src/pixel-operations.js';

const MiB=1024**2,sourceBytes=Uint8Array.of(7),pixels={width:1,height:1,format:'rgb8',data:Uint8Array.of(30,90,150)};
async function fixture(t,operation,{workspace=24*MiB,whole=false,heapAfter=0,budgetBytes=64*MiB}={}){
 let heapBytes=0;
 const descriptor=PIXEL_OPERATIONS[operation],compute=descriptor.compute,engine=createEngine({memoryBudgetBytes:budgetBytes,codec:{memoryBytes:()=>heapBytes},cpuKernel:'single'});let calls=0;
 descriptor.compute=async(_image,_params,_hooks,context)=>{
  calls++;context.reserveMemory(workspace);heapBytes=heapAfter;
  const backing=new Uint8Array(8*MiB);backing[1024]=93;backing[4096]=77;
  // Both small views own the same complete backing, as structuredClone does.
  return {data:{ownershipFixture:true,first:whole?backing:backing.subarray(1024,2048),second:backing.subarray(4096,5120)},layers:[],engineMetrics:{workers:3}};
 };
 t.after(async()=>{descriptor.compute=compute;await engine.dispose();});
 await engine.load({id:'image',bytes:sourceBytes,pixels});
 return {engine,run:hooks=>engine.run({id:'result',imageId:'image',operation},hooks),calls:()=>calls};
}

test('owned payload counts complete unique backing stores and shared/cyclic metadata',()=>{
 const buffer=new ArrayBuffer(4096),first=new Uint8Array(buffer,32,8),second=new Float32Array(buffer,64,4),shared={name:'same'},value={first,second,buffer,shared,alias:shared};value.cycle=value;
 const clone=structuredClone(value),bytes=ownedPayloadBytes(value);
 assert.equal(clone.first.buffer.byteLength,4096);assert.equal(clone.first.buffer,clone.second.buffer);assert.equal(clone.buffer,clone.first.buffer);
 assert.equal(clone.shared,clone.alias);assert.equal(clone.cycle,clone);
 assert(bytes>=4096&&bytes<5000,'One full backing and bounded metadata are counted');
 assert.equal(ownedPayloadBytes(new Uint8Array(buffer,32,8)),4096);
});

for(const operation of ['ela.energy','ela.biomes']){
 test(operation+' transfers completed workspace to source plus one copy, retaining exact cached results',async t=>{
  const f=await fixture(t,operation),first=await f.run();
  assert.equal(first.status,'ok');assert.equal(first.metrics.workers,3);
  assert.equal(first.data.first[0],93);assert.equal(first.data.second[0],77);
  assert.equal(first.data.first.buffer,first.data.second.buffer);assert.equal(first.data.first.buffer.byteLength,8*MiB);
  assert.equal(first.metrics.memory.activeReservationBytes,0);
  assert(first.metrics.memory.peakAccountedBytes<64*MiB);
  assert(32*MiB+24*MiB+3*ownedPayloadBytes({data:first.data,layers:[],engineMetrics:{workers:3}})>64*MiB,'The former accumulated workspace plus three-copy demand would refuse this task');
  first.data.first[0]=0;
  const second=await f.run();assert.equal(second.metrics.cache.result,true);assert.equal(second.data.first[0],93);assert.equal(f.calls(),1);
  assert.notEqual(first.data.first.buffer,second.data.first.buffer);assert.equal(second.metrics.memory.activeReservationBytes,0);
 });

 test(operation+' preserves the cache and releases copy pins after a genuine capacity refusal',async t=>{
  const f=await fixture(t,operation);await f.run();const peer=f.engine.reserveExternalMemory({bytes:20*MiB});
  await assert.rejects(f.run(),{code:'MEMORY_LIMIT'});
  assert.equal(f.engine.capabilities().memory.activeReservationBytes,peer.bytes);
  assert(f.engine.capabilities().memory.cacheBytes>=8*MiB,'The taken cache owner is returned after refusal');
  f.engine.releaseExternalMemory(peer.id);
  const retry=await f.run();assert.equal(retry.metrics.cache.result,true);assert.equal(retry.data.first[0],93);assert.equal(f.calls(),1);assert.equal(f.engine.capabilities().memory.activeReservationBytes,0);
 });

 test(operation+' restores the cached source after cancellation or a clone failure',async t=>{
  const f=await fixture(t,operation);await f.run();const controller=new AbortController();
  await assert.rejects(f.run({signal:controller.signal,onProgress:event=>{if(event.phase==='complete')controller.abort();}}),{code:'CANCELLED'});
  assert.equal(f.engine.capabilities().memory.activeReservationBytes,0);
  const nativeClone=globalThis.structuredClone;
  try{
   globalThis.structuredClone=value=>{if(value?.data?.ownershipFixture)throw new DOMException('Injected publication clone refusal','DataCloneError');return nativeClone(value);};
   await assert.rejects(f.run(),{name:'DataCloneError'});
  }finally{globalThis.structuredClone=nativeClone;}
  assert.equal(f.engine.capabilities().memory.activeReservationBytes,0);
  const retry=await f.run();assert.equal(retry.metrics.cache.result,true);assert.equal(retry.data.first[0],93);assert.equal(f.calls(),1);
 });

 test(operation+' carries codec heap growth through the scientific publication phase',async t=>{
  const f=await fixture(t,operation,{heapAfter:48*MiB,budgetBytes:65*MiB}),nativeClone=globalThis.structuredClone;let publication;
  try{
   globalThis.structuredClone=value=>{if(value?.data?.ownershipFixture)publication=f.engine.capabilities().memory;return nativeClone(value);};
   await f.run();
  }finally{globalThis.structuredClone=nativeClone;}
  assert(publication.activeReservationBytes>=64*MiB,'Actual grown 48 MiB heap plus source and copy remain admitted');
  assert.equal(f.engine.capabilities().memory.activeReservationBytes,0);
 });

 test(operation+' refuses publication when its actual grown codec heap and two sources cannot fit',async t=>{
  const f=await fixture(t,operation,{heapAfter:48*MiB,budgetBytes:60*MiB});await assert.rejects(f.run(),{code:'MEMORY_LIMIT'});
  assert.equal(f.engine.capabilities().memory.activeReservationBytes,0);
 });
}

test('unqualified dynamic-result operations keep their existing conservative admission',async t=>{
 const f=await fixture(t,'subimages.detect',{whole:true});await assert.rejects(f.run(),{code:'MEMORY_LIMIT'});assert.equal(f.engine.capabilities().memory.activeReservationBytes,0);
});

test('segmented Biome publication retains native fields, cached ownership and cancellation cleanup',async()=>{
 const root=new URL('./data/',import.meta.url),reference=JSON.parse(await readFile(new URL('ela-pipeline-native.json',root))),expected=reference.cases.find(row=>!row.params.ghost),engine=createEngine({memoryBudgetBytes:256*MiB,cpuKernel:'single'});
 try{
  const source=await engine.loadBlob({id:'image',blob:new Blob([await readFile(new URL(reference.file,root))]),layout:'segmented'});assert.equal(source.provenance.layout,'segmented-scanlines');
  const task={id:'biomes',imageId:'image',operation:'ela.biomes',params:expected.params},first=await engine.run(task);
  assert.equal(first.provenance.layout,'segmented');
  for(const [name,value]of Object.entries(expected.data)){
   if(name==='regions'){assert.deepEqual(first.data.regions,value);continue;}
   const flat=value.flat(5).map(Number);assert.equal(first.data[name].length,flat.length);
   for(let i=0;i<flat.length;i++)assert(Math.abs(first.data[name][i]-flat[i])<=(name==='content'?3e-7:0),name+'/'+i);
  }
  const nativeData=structuredClone(first.data);first.data.score.fill(999);
  const second=await engine.run(task);assert.equal(second.metrics.cache.result,true);assert.deepEqual(second.data,nativeData);
  const before=engine.capabilities().memory.activeReservationBytes,controller=new AbortController();
  await assert.rejects(engine.run(task,{signal:controller.signal,onProgress:event=>{if(event.phase==='complete')controller.abort();}}),{code:'CANCELLED'});
  assert.equal(engine.capabilities().memory.activeReservationBytes,before);
  assert.deepEqual((await engine.run(task)).data,nativeData);
  await engine.unload('image');assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(engine.capabilities().memory.cacheBytes,0);
 }finally{await engine.dispose();}
});
