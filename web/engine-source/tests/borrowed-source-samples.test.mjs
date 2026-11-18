import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createRgb16Surface} from '../src/rgb16-surface.js';
import {createSourceSamplesService} from '../src/source-samples-service.js';
import {createBorrowedSourceSamples} from '../src/borrowed-source-samples.js';

async function original({native=false,orientation=1}={}){
 const budget=new Budget(16*1024**2),width=9,height=7,Type=native?Uint16Array:Uint8Array;
 const samples=Type.from({length:width*height*3},(_,i)=>(i*258+i%7)%(native?65536:256));
 const store=await createSegmentedBytes(samples.byteLength,{budget,storage:'memory'});
 await store.write(new Uint8Array(samples.buffer),0);await store.flush();
 const surface=(native?createRgb16Surface:createRgbSurface)(store,{width,height,orientation,budget,sourceDepth:12});
 const bindingOriginal={imageId:'original-A',sourceSurfaceId:surface.descriptor.id,sourceRevision:1,
  sourceSha256:'a'.repeat(64),kind:'encoded'};
 const sourcePrecision={schema:'sherloq.source-precision/1',coded:{depth:native?12:8,sampleType:'unsigned-integer'},
  decoded:{sampleType:native?'uint16':'uint8',containerBits:native?16:8,role:native?'decoded':'presentation'}};
 let current=true,owned;const options={surface,budget,bindingOriginal,sourcePrecision,isCurrent:()=>current,onOwner:v=>owned=v};
 return{budget,surface,samples,bindingOriginal,sourcePrecision,options,setCurrent:v=>current=v,get owned(){return owned;},
  async close(){await owned?.dispose();await surface.dispose();assert.equal(budget.total(),0);}};
}

for(const native of [false,true])for(let orientation=1;orientation<=8;orientation++)
 test(`${native?'RGB16':'RGB8'} borrowed windows retain the actual Original orientation ${orientation}`,async()=>{
  const f=await original({native,orientation});try{
   const before=f.budget.total(),adapter=createBorrowedSourceSamples(f.options);
   assert.equal(f.budget.total()-before,4096,'Preparation admits metadata, never another frame');
   assert.equal(adapter.descriptor.storage,'borrowed-original');assert.equal(adapter.descriptor.orientation,1);
   assert.equal(adapter.descriptor.valueEncoding.originalStorageOrientation,orientation);
   const rect={x:1,y:2,width:3,height:2},direct=await f.surface.readWindow(rect),lease=await adapter.readWindow(rect);
   assert.deepEqual(lease.samples,direct.pixels.data);assert.deepEqual(lease.origin,[1,2]);
   assert.deepEqual(lease.bindingOriginal,f.bindingOriginal);assert.equal(lease.surfaceId,adapter.descriptor.id);
   await direct.release();const held=f.budget.total();await assert.rejects(adapter.dispose(),/outstanding window ACKs/);
   assert.equal(f.budget.total(),held,'No refund before the transferred window ACK');
   await lease.release();await adapter.dispose();assert.equal(f.budget.total(),before);
   const stillOriginal=await f.surface.readWindow(rect);assert.deepEqual(stillOriginal.pixels.data,lease.samples);
   await stillOriginal.release();
  }finally{await f.close();}
 });

test('Source sample service publishes the borrowed buffer once; old Original remains usable after ACK',async()=>{
 const f=await original({native:true});let service,adapter,prepares=0;
 try{
  const originalBytes=f.budget.total();service=createSourceSamplesService({budget:f.budget,bindingOriginal:f.bindingOriginal,
   currentBinding:()=>f.bindingOriginal,onOwner:()=>{},prepareProvider:async context=>{
    prepares++;adapter=createBorrowedSourceSamples({...f.options,onOwner:context.adoptSourceOwner});context.publishSource(adapter);
   }});
  const request={domain:'decoded',bindingOriginal:f.bindingOriginal},a=await service.prepareSourceSamples(request),b=await service.prepareSourceSamples(request);
  let received,published=0;const wire=await service.readSourceSamples({...a,rect:{x:0,y:0,width:3,height:2}},{publish(value,transfers){
   published++;received=structuredClone(value,{transfer:transfers});assert.equal(value.samples.byteLength,0);
  }});
  assert.equal(published,1);assert.equal(prepares,1);assert.ok(received.samples instanceof Uint16Array);
  const beforeAck=f.budget.total();await assert.rejects(service.retireSourceSamples(a),/unacknowledged windows/);
  assert.equal(f.budget.total(),beforeAck);await service.retireSourceSamples(wire);await service.retireSourceSamples(a);
  assert.equal(adapter.state.closed,false,'Second beneficiary keeps the same borrowed source');
  await service.retireSourceSamples(b);assert.equal(adapter.state.closed,true);await service.dispose();
  assert.equal(f.budget.total(),originalBytes);const lease=await f.surface.readWindow({x:0,y:0,width:1,height:1});
  assert.deepEqual([...lease.pixels.data],[...f.samples.subarray(0,3)]);await lease.release();
 }finally{await service?.dispose();await f.close();}
});

test('Developed RAW and converted CMYK keep their coded precision without claiming source RGB or sensor',async()=>{
 for(const role of ['developed','color-converted']){const f=await original({native:true});try{
  f.sourcePrecision.coded={depth:32,sampleType:'unknown'};f.sourcePrecision.decoded.role=role;
  const adapter=createBorrowedSourceSamples(f.options),d=adapter.descriptor;assert.equal(d.sourceDepth,32);
  assert.equal(d.containerBits,16);assert.equal(d.sampleType,'uint16');assert.equal(d.sampleRole,role);
  assert.equal(d.valueEncoding.codedSampleType,'unknown');assert.equal(d.domain,'decoded');
  assert.deepEqual(d.channelMap,['R','G','B']);assert.match(d.valueEncoding.preservedChannels,/separate source domains/);
  assert.equal('color' in d,false,'Large profiles are not cloned into this descriptor');
 }finally{await f.close();}}
});

test('A changed Original refuses reads but retains its already issued ACK route',async()=>{
 const f=await original();try{const adapter=createBorrowedSourceSamples(f.options),lease=await adapter.readWindow({x:0,y:0,width:1,height:1});
  f.setCurrent(false);await assert.rejects(adapter.readWindow({x:0,y:0,width:1,height:1}),{code:'SOURCE_CHANGED'});
  await lease.release();await adapter.dispose();assert.equal(adapter.state.closed,true);
 }finally{await f.close();}
});

test('Selecting an existing RGB8 presentation does not pretend to borrow the separate RGB16 container',async()=>{
 const f=await original();try{
  f.sourcePrecision.decoded={sampleType:'uint16',containerBits:16,role:'decoded'};
  f.sourcePrecision.gainMap=true;
  const adapter=createBorrowedSourceSamples(f.options),d=adapter.descriptor;
  assert.equal(d.sampleType,'uint8');assert.equal(d.containerBits,8);assert.equal(d.sourceDepth,8);
  assert.equal(d.sampleRole,'presentation');assert.equal(d.sampleModel,'sdr-rgb-presentation');
  assert.equal(d.valueEncoding.gainMap,true);assert.equal(d.valueEncoding.gainMapApplied,false);
  const part=await adapter.readWindow({x:0,y:0,width:1,height:1});assert.ok(part.samples instanceof Uint8Array);await part.release();
 }finally{await f.close();}
});

test('Cancelled read with a falsy retirement refusal keeps the owner recoverable until actual release',async()=>{
 const f=await original(),abort=new AbortController();let releases=0;
 const actual=f.surface,wrapped={descriptor:actual.descriptor,async readWindow(rect,hooks){
  const part=await actual.readWindow(rect,hooks),release=part.release;part.release=()=>++releases===1?0:release();abort.abort();return part;
 }};
 try{const adapter=createBorrowedSourceSamples({...f.options,surface:wrapped});let failure;
  try{await adapter.readWindow({x:0,y:0,width:1,height:1},{signal:abort.signal});}catch(error){failure=error;}
  assert.equal(failure?.code,'CANCELLED');assert.equal(failure?.cleanupOwner,adapter);assert.equal(adapter.state.windows,1);
  const held=f.budget.total();await adapter.dispose();assert.equal(releases,2);assert.equal(adapter.state.closed,true);
  assert.ok(f.budget.total()<held);const part=await actual.readWindow({x:0,y:0,width:1,height:1});await part.release();
 }finally{await f.close();}
});

test('Admission refusal registers an unfunded retry owner and never reads pixels',async()=>{
 const f=await original();let registered,reads=0;try{
  const limited=new Budget(32),surface={descriptor:f.surface.descriptor,readWindow(){reads++;throw Error('unexpected read');}};
  assert.throws(()=>createBorrowedSourceSamples({...f.options,surface,budget:limited,onOwner:owner=>registered=owner}));
  assert.ok(registered);assert.equal(registered.state.funded,false);assert.equal(reads,0);await registered.dispose();assert.equal(limited.total(),0);
 }finally{await f.close();}
});

test('The identical adapter borrows a real temporary-backed Original and leaves its file open until Original retires',async()=>{
 const directory=await fs.mkdtemp(new URL('./disk-test-',import.meta.url)),filename=directory+'/pixels',budget=new Budget(1024**2);
 let fileOpen=false,reads=0,adapter,surface;
 const temporarySession={backend:'node-private-test',async create(byteLength){
  const fd=nodeFs.openSync(filename,'wx+');nodeFs.ftruncateSync(fd,byteLength);fileOpen=true;
  return{byteLength,readInto(target,offset){reads++;assert.equal(nodeFs.readSync(fd,target,0,target.length,offset),target.length);return target;},
   write(source,offset){assert.equal(nodeFs.writeSync(fd,source,0,source.length,offset),source.length);},flush(){},
   async dispose(){if(fileOpen){nodeFs.closeSync(fd);fileOpen=false;await fs.unlink(filename);}}};
 }};
 try{
  const store=await createSegmentedBytes(4*3*6,{budget,storage:'temporary',temporarySession});
  const data=Uint16Array.from({length:36},(_,i)=>i*1001);await store.write(new Uint8Array(data.buffer),0);await store.flush();
  surface=createRgb16Surface(store,{width:4,height:3,budget,sourceDepth:16});
  const bindingOriginal={imageId:'disk-original',sourceSurfaceId:surface.descriptor.id,sourceRevision:1,sourceSha256:'d'.repeat(64),kind:'fixture'};
  adapter=createBorrowedSourceSamples({surface,budget,bindingOriginal,isCurrent:()=>true,onOwner:()=>{},
   sourcePrecision:{schema:'sherloq.source-precision/1',coded:{depth:16,sampleType:'unsigned-integer'},decoded:{sampleType:'uint16',containerBits:16,role:'decoded'}}});
  assert.equal(reads,0);assert.equal(fileOpen,true);const lease=await adapter.readWindow({x:1,y:1,width:2,height:1});
  assert.deepEqual(lease.samples,data.subarray(15,21));assert.equal(reads,1);await lease.release();await adapter.dispose();
  assert.equal(fileOpen,true);assert.equal((await fs.stat(filename)).size,72);
  const remaining=await surface.readWindow({x:0,y:0,width:1,height:1});assert.deepEqual(remaining.pixels.data,data.subarray(0,3));await remaining.release();
  await surface.dispose();assert.equal(fileOpen,false);assert.equal(budget.total(),0);
 }finally{await adapter?.dispose();await surface?.dispose();await fs.rm(directory,{recursive:true,force:true});}
});

test('Window and source ACKs release an actual borrowed view while its entire parent budget is saturated',async()=>{
 const f=await original({native:true});let service,pressure;
 try{
  service=createSourceSamplesService({budget:f.budget,bindingOriginal:f.bindingOriginal,currentBinding:()=>f.bindingOriginal,onOwner:()=>{},
   async prepareProvider(context){const adapter=createBorrowedSourceSamples({...f.options,onOwner:context.adoptSourceOwner});context.publishSource(adapter);}});
  const source=await service.prepareSourceSamples({domain:'decoded',bindingOriginal:f.bindingOriginal});
  const window=await service.readSourceSamples({...source,rect:{x:0,y:0,width:3,height:2}});
  pressure=f.budget.reserve(f.budget.limit-f.budget.total());assert.equal(f.budget.total(),f.budget.limit);
  await service.retireSourceSamples(window);await service.retireSourceSamples(source);await service.dispose();
  assert.ok(f.budget.total()<f.budget.limit);pressure();pressure=null;
  const live=await f.surface.readWindow({x:0,y:0,width:1,height:1});assert.deepEqual(live.pixels.data,f.samples.subarray(0,3));await live.release();
 }finally{pressure?.();await service?.dispose();await f.close();}
});
