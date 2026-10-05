import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {orientRgb} from '../src/image-headers.js';
import {createOrientedSourceCache,prepareOrientedSourceCache} from '../src/oriented-source-cache.js';
function session({failWrite=false}={}){let count=0;return{get count(){return count;},async create(byteLength){let bytes=new Uint8Array(byteLength);count++;return{byteLength,write(data,offset){if(failWrite)throw Object.assign(Error('quota'),{code:'STORAGE_QUOTA'});bytes.set(data,offset);},readInto(out,offset){out.set(bytes.subarray(offset,offset+out.length));},flush(){},dispose(){if(bytes){bytes=null;count--;}}};}};}
test('source orientation cache keeps raw store, IDs, metadata and exact whole/cropped pixels',async()=>{
 const image={width:257,height:131,format:'rgb8',data:Uint8Array.from({length:257*131*3},(_,i)=>i*37^(i>>>3))};
 for(let orientation=5;orientation<=8;orientation++){
  const budget=new Budget(8*1024**2),temporary=session(),store=await createSegmentedBytes(image.data.length,{budget});await store.write(image.data);const raw=createRgbSurface(store,{...image,orientation,budget}),before=raw.descriptor,expected=await orientRgb(image,orientation);
  const {surface,metrics}=await createOrientedSourceCache(raw,{budget,temporarySession:temporary,maxWindowBytes:expected.width*3*17});assert.equal(surface.descriptor,before);assert(metrics.orientationCacheWindows>1);assert.equal(temporary.count,1);
  for(const rect of [{x:0,y:0,width:expected.width,height:expected.height},{x:3,y:11,width:61,height:49}]){const part=await surface.readWindow(rect);assert.equal(part.surfaceId,before.id);for(let y=0;y<rect.height;y++)assert.deepEqual(part.pixels.data.subarray(y*rect.width*3,(y+1)*rect.width*3),expected.data.subarray(((rect.y+y)*expected.width+rect.x)*3,((rect.y+y)*expected.width+rect.x+rect.width)*3));part.release();}
  const encodedOrder=new Uint8Array(image.data.length);await store.readInto(encodedOrder);assert.deepEqual(encodedOrder,image.data,'Raw detector input remains unchanged');await surface.dispose();assert.equal(temporary.count,0);assert.equal(budget.total(),0);
 }
});
test('cache failure and cancellation remove only the cache and leave raw source owned',async()=>{
 const image={width:257,height:131,format:'rgb8',data:new Uint8Array(257*131*3)};
 for(const mode of ['write','cancel']){
  const budget=new Budget(8*1024**2),temporary=session({failWrite:mode==='write'}),store=await createSegmentedBytes(image.data.length,{budget});await store.write(image.data);const raw=createRgbSurface(store,{...image,orientation:6,budget}),controller=new AbortController();
  await assert.rejects(createOrientedSourceCache(raw,{budget,temporarySession:temporary,signal:controller.signal,maxWindowBytes:131*3*17,onProgress:()=>controller.abort()}),{code:mode==='write'?'STORAGE_QUOTA':'CANCELLED'});
  assert.equal(temporary.count,0);assert.equal(budget.active,0);const part=await raw.readWindow({width:1,height:1});part.release();await raw.dispose();assert.equal(budget.total(),0);
 }
});

test('optional orientation cache falls back only on resource limits and preserves raw ownership',async()=>{
 const descriptor={width:8000,height:12000,sourceWidth:12000,sourceHeight:8000,orientation:6,format:'rgb8',storage:'temporary'},surface={descriptor,dispose(){throw Error('must stay owned');}};
 const budget=new Budget(1024),low=await prepareOrientedSourceCache(surface,{budget,temporarySession:{}});assert.equal(low.surface,surface);assert.equal(low.metrics.orientationCacheFallback.code,'MEMORY_LIMIT');assert.equal(budget.total(),0);
 for(const code of ['STORAGE_QUOTA','STORAGE_UNAVAILABLE','STORAGE_IO']){
  const budget=new Budget(64*1024**2),options={budget,temporarySession:{create(){throw Object.assign(Error(code),{code});}}};
  if(code==='STORAGE_IO')await assert.rejects(prepareOrientedSourceCache(surface,options),{code});else{const result=await prepareOrientedSourceCache(surface,options);assert.equal(result.surface,surface);assert.equal(result.metrics.orientationCacheFallback.code,code);}
  assert.equal(budget.total(),0);
 }
 const controller=new AbortController();controller.abort();await assert.rejects(prepareOrientedSourceCache(surface,{budget:new Budget(64*1024**2),temporarySession:{},signal:controller.signal}),{code:'CANCELLED'});
});

test('both source stores are released even if one disposer throws synchronously',async()=>{
 const budget=new Budget(8*1024**2),temporary=session(),store=await createSegmentedBytes(257*131*3,{budget}),raw=createRgbSurface(store,{width:257,height:131,orientation:6,budget}),dispose=raw.dispose;
 raw.dispose=()=>{dispose();throw Object.assign(Error('source close failed'),{code:'STORAGE_IO'});};
 const {surface}=await createOrientedSourceCache(raw,{budget,temporarySession:temporary});await assert.rejects(surface.dispose(),{code:'STORAGE_IO'});assert.equal(temporary.count,0);assert.equal(budget.total(),0);
});
