import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createBlobSource} from '../src/blob-source.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';import {orientRgb} from '../src/image-headers.js';
test('Immutable Blob original: bounded progressive SHA256, cancellation, ownership and byte ranges',async()=>{
 const bytes=Uint8Array.from({length:1024*1024+71},(_,i)=>i*73^(i>>>11)),blob=new Blob([bytes]),budget=new Budget(2*1024**2),source=createBlobSource(blob,{budget,chunkBytes:32771});
 assert.equal(await source.sha256(),createHash('sha256').update(bytes).digest('hex'));assert.ok(budget.peak<=1024**2+32771);assert.equal(budget.total(),0);
 const part=await source.read(65530,123);assert.deepEqual(part.bytes,bytes.slice(65530,65653));part.bytes.fill(0);assert.equal(budget.active,123);part.release();part.release();assert.equal(budget.active,0);assert.deepEqual(new Uint8Array(await source.blob().arrayBuffer()),bytes);
 const cancelled=createBlobSource(blob,{budget,chunkBytes:32771}),controller=new AbortController();await assert.rejects(cancelled.sha256({signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(budget.total(),0);assert.equal(await cancelled.sha256(),await source.sha256());cancelled.dispose();source.dispose();await assert.rejects(source.read(0,1),{code:'DISPOSED'});assert.throws(()=>source.blob(),{code:'DISPOSED'});
});
test('Full-resolution window reads preserve all eight EXIF transforms, segmented seams and owned results',async()=>{
 const image={width:17,height:13,format:'rgb8',data:Uint8Array.from({length:17*13*3},(_,i)=>i*37^(i>>>3))};
 for(let orientation=1;orientation<=8;orientation++){
  const budget=new Budget(10000),store=await createSegmentedBytes(image.data.length,{budget,chunkBytes:47});await store.write(image.data);const surface=createRgbSurface(store,{...image,orientation,budget}),expected=await orientRgb(image,orientation);
  for(const region of [{x:0,y:0,width:expected.width,height:expected.height},{x:2,y:3,width:7,height:5},{x:expected.width-1,y:expected.height-1,width:1,height:1}]){
   const r=await surface.readWindow(region);for(let y=0;y<region.height;y++)assert.deepEqual(r.pixels.data.subarray(y*region.width*3,(y+1)*region.width*3),expected.data.subarray(((region.y+y)*expected.width+region.x)*3,((region.y+y)*expected.width+region.x+region.width)*3));assert.equal(r.surfaceId,surface.descriptor.id);assert.equal(budget.active,region.width*region.height*3);r.pixels.data.fill(0);r.release();assert.equal(budget.active,0);
  }
  const aborted=new AbortController();aborted.abort();await assert.rejects(surface.readWindow({}, {signal:aborted.signal}),{code:'CANCELLED'});assert.equal(budget.active,0);await surface.dispose();assert.equal(budget.total(),0);await assert.rejects(surface.readWindow(),{code:'DISPOSED'});
 }
});
test('Window scratch admission failure releases its output reservation without shrinking the request',async()=>{
 const budget=new Budget(102),store=await createSegmentedBytes(75,{budget,chunkBytes:9}),surface=createRgbSurface(store,{width:5,height:5,budget});
 await assert.rejects(surface.readWindow({width:3,height:3}),{code:'MEMORY_LIMIT'});assert.equal(budget.active,0);assert.equal(budget.retained,75);await surface.dispose();assert.equal(budget.total(),0);
});
test('readWindowInto reuses caller destination and row scratch through every orientation without reservations',async()=>{
 const image={width:17,height:13,format:'rgb8',data:Uint8Array.from({length:17*13*3},(_,i)=>i*37^(i>>>3))};
 for(let orientation=1;orientation<=8;orientation++){
  const budget=new Budget(10000),store=await createSegmentedBytes(image.data.length,{budget,chunkBytes:47});await store.write(image.data);const surface=createRgbSurface(store,{...image,orientation,budget}),expected=await orientRgb(image,orientation),target=new Uint8Array(7*5*3+13),scratch=new Uint8Array(17*3);target.fill(77);
  const region={x:2,y:3,width:7,height:5},r=await surface.readWindowInto(region,target,{scratch,reserve(){assert.fail('No fresh workspace should be reserved');}});assert.equal(r.pixels.data.buffer,target.buffer);
  for(let y=0;y<5;y++)assert.deepEqual(r.pixels.data.subarray(y*21,y*21+21),expected.data.subarray(((3+y)*expected.width+2)*3,((3+y)*expected.width+9)*3));assert.ok(target.subarray(105).every(x=>x===77));r.release();assert.equal(budget.active,0);await surface.dispose();assert.equal(budget.total(),0);
 }
});
test('window storage bounds error preserves its cause and never becomes a memory retry',async()=>{
 const budget=new Budget(1000),cause=new RangeError('offset is out of bounds'),surface=createRgbSurface({byteLength:300,readInto(){throw cause;},dispose(){}},{width:10,height:10,budget});
 await assert.rejects(surface.readWindow({width:5,height:5}),e=>e===cause);assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].backings,0);await surface.dispose();
});
test('releasing window accounting does not mutate the outgoing public pixels object',async()=>{
 const budget=new Budget(100),surface=createRgbSurface({byteLength:12,readInto(target){target.fill(29);},dispose(){}},{width:2,height:2,budget}),window=await surface.readWindow(),{release,...outgoing}=window;release();assert.deepEqual([...outgoing.pixels.data],Array(12).fill(29));assert.equal(budget.total(),0);await surface.dispose();
});
