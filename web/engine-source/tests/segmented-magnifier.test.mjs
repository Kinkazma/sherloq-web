import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {segmentedMagnifier} from '../src/segmented-magnifier.js';import {magnifier,magnifierParams} from '../src/magnifier.js';import {orientRgb} from '../src/image-headers.js';
const hash=data=>createHash('sha256').update(data).digest('hex');
async function source(pixels,{orientation=1,limit=2*1024**2,chunkBytes=113}={}){
 const budget=new Budget(limit),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes});await store.write(pixels.data);
 return{budget,image:{surface:createRgbSurface(store,{...pixels,budget,orientation})}};
}
test('Segmented magnifier: all 440 native outputs across small storage seams',async()=>{
 const ref=JSON.parse(await readFile(new URL('../fixtures/magnifier-reference.json',import.meta.url)));let count=0;
 for(const f of ref.cases){const pixels={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))}, {budget,image}=await source(pixels);
  try{for(const e of f.expected){const actual=await segmentedMagnifier(image,magnifierParams(e.params),{budget});assert.deepEqual(actual.data.bounds,e.bounds);assert.equal(actual.pixels?hash(actual.pixels.data):null,e.sha256,`${f.name} ${JSON.stringify(e.params)}`);if(actual.pixels)assert.deepEqual(actual.layers[0].origin,e.bounds.slice(0,2));assert.equal(budget.active,0);count++;}}
  finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }assert.equal(count,440);
});
test('All eight source orientations use the selected native-resolution ROI, including clipped bounds',async()=>{
 const pixels={width:39,height:35,format:'rgb8',data:Uint8Array.from({length:39*35*3},(_,i)=>i*37^(i>>>3))};
 for(let orientation=1;orientation<=8;orientation++){
  const {budget,image}=await source(pixels,{orientation,chunkBytes:2}),oriented=await orientRgb(pixels,orientation);
  try{for(const bounds of [[3,5,28,30],[-5,31,100,43],[100,0,110,8]])for(const mode of ['equalize','contrast']){
   const p=magnifierParams({bounds,mode,percent:50,channel:orientation%2===0}),actual=await segmentedMagnifier(image,p,{budget}),expected=await magnifier(oriented,p);
   assert.deepEqual(actual.pixels,expected.pixels);assert.deepEqual(actual.data,expected.data);assert.deepEqual(actual.layers,expected.layers);assert.equal(budget.active,0);
  }}finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }
});
test('A huge virtual source reads only the ROI; missing temporary storage is reported before reads',async()=>{
 const width=100000,height=90000,budget=new Budget(1024**2),reads=[],store={byteLength:width*height*3,readInto(target,offset){reads.push({offset,length:target.length});for(let i=0;i<target.length;i++)target[i]=(offset+i)*13%256;},dispose(){}};
 const image={surface:createRgbSurface(store,{width,height,budget})},bounds=[93456,81324,93521,81391],p=magnifierParams({bounds}),actual=await segmentedMagnifier(image,p,{budget});
 const expectedPixels={width:65,height:67,format:'rgb8',data:new Uint8Array(65*67*3)};
 for(let y=0;y<67;y++)for(let i=0;i<65*3;i++)expectedPixels.data[y*65*3+i]=((y+bounds[1])*width*3+bounds[0]*3+i)*13%256;
 assert.deepEqual(actual.pixels,(await magnifier(expectedPixels,magnifierParams())).pixels);assert.equal(reads.length,67);assert.equal(reads.reduce((n,r)=>n+r.length,0),65*67*3);assert.ok(budget.peak<100000);
 const readCount=reads.length;await assert.rejects(segmentedMagnifier(image,magnifierParams(),{budget}),{code:'STORAGE_UNAVAILABLE'});assert.equal(reads.length,readCount);assert.equal(budget.active,0);await image.surface.dispose();
});
test('ROI input/result caches are bounded, owned and invalidated by source prefix',async()=>{
 const pixels={width:83,height:71,format:'rgb8',data:Uint8Array.from({length:83*71*3},(_,i)=>i*7^(i>>>5))}, {budget,image}=await source(pixels),cacheKey='source\0segmented/magnifier/',p=magnifierParams({bounds:[3,2,78,65]});
 const first=await segmentedMagnifier(image,p,{budget,cacheKey}),original=first.pixels.data.slice();first.pixels.data.fill(0);first.data.bounds[0]=999;
 const cached=await segmentedMagnifier(image,p,{budget,cacheKey});assert.equal(cached.metrics.cache.result,true);assert.equal(cached.metrics.sourceWindowBytes,0);assert.deepEqual(cached.pixels.data,original);assert.deepEqual(cached.data.bounds,p.bounds);
 const changed=await segmentedMagnifier(image,{...p,mode:'contrast',percent:50},{budget,cacheKey});assert.deepEqual(changed.metrics.cache,{result:false,input:true});assert.equal(changed.metrics.sourceWindowBytes,0);assert.deepEqual(changed.pixels,(await magnifier(pixels,{...p,mode:'contrast',percent:50})).pixels);
 budget.clearPrefix('source\0');assert.equal(budget.cacheBytes,0);const reread=await segmentedMagnifier(image,p,{budget,cacheKey});assert.ok(reread.metrics.sourceWindowBytes>0);
 const release=budget.reserve(budget.limit-budget.retained);assert.equal(budget.cacheBytes,0);release();assert.equal(budget.active,0);await image.surface.dispose();assert.equal(budget.total(),0);
});
test('Abort at window, kernel or completion publishes no cache and releases all leases; source remains usable',async()=>{
 const pixels={width:81,height:73,format:'rgb8',data:Uint8Array.from({length:81*73*3},(_,i)=>i*53)},p=magnifierParams({bounds:[4,3,79,70]});
 for(const phase of ['source-window','kernel','complete']){
  const {budget,image}=await source(pixels),controller=new AbortController();
  await assert.rejects(segmentedMagnifier(image,p,{budget,signal:controller.signal,cacheKey:'cancel/',onProgress:e=>{if(e.phase===phase&&e.fraction>0)controller.abort();}}),{code:'CANCELLED'});
  assert.equal(budget.active,0);assert.equal(budget.cacheBytes,0);assert.equal(budget.retained,pixels.data.length);
  const retry=await segmentedMagnifier(image,p,{budget});assert.deepEqual(retry.pixels,(await magnifier(pixels,p)).pixels);await image.surface.dispose();assert.equal(budget.total(),0);
 }
});
