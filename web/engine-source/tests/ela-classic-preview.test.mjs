import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createClassicPreviewCache} from '../src/ela-classic-preview.js';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {elaBase,elaRender,validateParams} from '../src/ela.js';
import {createEngine} from '../src/index.js';
import {segmentedEla} from '../src/segmented-ela.js';
import {initJpegWasm,jpegCodec} from '../src/jpeg.js';

const MiB=1024**2;
function source(width,height,budget,sha='a'.repeat(64)){
 const data=Uint8Array.from({length:width*height*3},(_,i)=>(i>>>8)&255),store={byteLength:data.length,readInto:(out,at)=>out.set(data.subarray(at,at+out.length))};
 return {data,image:{sha256:sha,surface:createRgbSurface(store,{width,height,budget,ownsStore:false})}};
}
function expectedSamples(data,width,height,pixels,retainedWidth=pixels.width,retainedHeight=pixels.height){
 const output=new Uint8Array(pixels.data.length);
 for(let y=0;y<pixels.height;y++)for(let x=0;x<pixels.width;x++){
  const rx=Math.min(retainedWidth-1,Math.floor((x+.5)*retainedWidth/pixels.width)),ry=Math.min(retainedHeight-1,Math.floor((y+.5)*retainedHeight/pixels.height)),sx=Math.min(width-1,Math.floor((rx+.5)*width/retainedWidth)),sy=Math.min(height-1,Math.floor((ry+.5)*height/retainedHeight));
  output.set(data.subarray((sy*width+sx)*3,(sy*width+sx)*3+3),(y*pixels.width+x)*3);
 }
 return output;
}
const fixtureCodec={id:'fixture-pinned-pair',recompress(){throw Error('No new JPEG is permitted for captured native Q');}};
function capture(cache,image,original,recompressed,quality=75){const c=cache.beginCapture('image',image,{quality});assert.ok(c);c.captureBand(original,recompressed,{y:0,rows:image.surface.descriptor.height});assert.equal(c.finish(),true);c.dispose();}

test('decode-only codecs preserve captured native samples and reject only an uncaptured JPEG preview without reading source pixels',async()=>{
 const budget=new Budget(4*MiB),{data,image}=source(35,67,budget),other=Uint8Array.from(data,x=>255-x),codec={id:'decode-only',decode(){throw Error('Preview must not decode');}},cache=createClassicPreviewCache({budget,codec});capture(cache,image,data,other);
 const readSample=image.surface.readSampledWindow;let reads=0;image.surface.readSampledWindow=(...args)=>{reads++;return readSample(...args);};
 try{
  const params=validateParams({scale:37,contrast:59,grayscale:true}),preview=await cache.preview('image',image,params),native=await elaRender(await elaBase(data,other,params.linear),params);assert.deepEqual(preview.pixels.data,native);assert.equal(preview.nativePixelSamples,true);assert.equal(reads,0);
  const before=budget.snapshot();await assert.rejects(cache.preview('image',image,{quality:76}),{code:'INVALID_INPUT',message:'Reduced Classic preview requires the shared JPEG recompressor.'});assert.equal(reads,0);assert.equal(budget.active,0);assert.equal(budget.cacheBytes,before.cacheBytes);assert.equal((await cache.preview('image',image,params)).nativePixelSamples,true);
 }finally{budget.clear();await image.surface.dispose();}assert.equal(budget.total(),0);
});

test('a decode-only public engine retains source-byte APIs and remains reusable after an unsupported JPEG preview',async()=>{
 let decodes=0;const codec={id:'decode-only',memoryBytes:()=>0,decode(){decodes++;throw Error('Caller pixels require no decode');}},engine=createEngine({codec,memoryBudgetBytes:128*MiB,cpuKernel:'single'}),bytes=Uint8Array.of(1,2,3,4),pixels={width:2,height:2,format:'rgb8',data:new Uint8Array(12).fill(100)};
 try{
  await engine.load({id:'image',bytes,pixels});assert.deepEqual((await engine.readOriginal('image',{offset:0,length:4})).bytes,bytes);const result=await engine.run({id:'hex',imageId:'image',operation:'file.hex'});assert.equal(result.status,'ok');assert.equal(result.operation,'file.hex');assert.equal(result.provenance.input,'original-bytes');
  await assert.rejects(engine.previewElaClassic({imageId:'image'}),{code:'INVALID_INPUT',message:'Reduced Classic preview requires the shared JPEG recompressor.'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.deepEqual((await engine.readOriginal('image',{offset:0,length:4})).bytes,bytes);assert.equal(decodes,0);await engine.unload('image');assert.equal(engine.capabilities().memory.retainedBytes,0);
 }finally{await engine.dispose();}
});

test('packed pairs preserve all65 536channel pairs, linear/nonlinear rounding and native grayscale, without a new JPEG',async()=>{
 const budget=new Budget(32*MiB),{data,image}=source(256,256,budget),other=Uint8Array.from({length:data.length},(_,i)=>i&255),before=data.slice(),cache=createClassicPreviewCache({budget,codec:fixtureCodec});capture(cache,image,data,other);
 try{for(const linear of [false,true])for(const grayscale of [false,true]){
  const params=validateParams({quality:75,scale:37,contrast:59,linear,grayscale}),native=await elaRender(await elaBase(data,other,linear),params),preview=await cache.preview('image',image,params,320);
  assert.deepEqual(preview.pixels.data,native);assert.equal(preview.nativePixelSamples,true);assert.equal(preview.presentation.method,'native-jpeg-pixel-samples');assert.equal(preview.pixels.preview,true);assert.equal(preview.logicalWidth,256);assert.equal(budget.active,0);
 }assert.deepEqual(data,before);assert.equal(budget.cacheBytes,256*256*6);}finally{budget.clear();await image.surface.dispose();}assert.equal(budget.total(),0);
});

test('large native samples stay bounded and correspond to exact original pixels without retaining full Float32planes',async()=>{
 const budget=new Budget(8*MiB),{data,image}=source(1103,701,budget),other=Uint8Array.from(data,x=>255-x),cache=createClassicPreviewCache({budget,codec:fixtureCodec});capture(cache,image,data,other);const params=validateParams({linear:false,scale:73,contrast:39,grayscale:true});
 try{const preview=await cache.preview('image',image,params,320),native=await elaRender(await elaBase(data,other,false),params);assert.deepEqual(preview.pixels.data,expectedSamples(native,1103,701,preview.pixels));assert.ok(preview.pixels.width<=320&&preview.pixels.height<=320);assert.ok(budget.cacheBytes<=320*320*6);assert.ok(budget.peak<2*MiB);
  const small=await cache.preview('image',image,params,80);assert.deepEqual(small.pixels.data,expectedSamples(native,1103,701,small.pixels,preview.pixels.width,preview.pixels.height));assert.ok(small.pixels.width<=80&&small.pixels.height<=80);
 }finally{budget.clear();await image.surface.dispose();}
});

test('optional native sample admission respects its budget fraction and adapts without eviction and a refusal never modifies its native band',()=>{
 const budget=new Budget(150000),{data,image}=source(1103,701,budget),other=data.slice(),cache=createClassicPreviewCache({budget,codec:fixtureCodec});capture(cache,image,data,other);assert.ok(budget.get('image\0ela-classic-preview/native').width<=160);budget.clear();
 const held=budget.reserve(150000);assert.equal(cache.beginCapture('image',image,{quality:76}),null);assert.equal(budget.active,150000);held();assert.equal(budget.total(),0);
 const Type=globalThis.Uint16Array;try{globalThis.Uint16Array=class extends Type{constructor(length){if(length>20000)throw new RangeError('Injected preview backing refusal');super(length);}};capture(cache,image,data,other);assert.ok(budget.get('image\0ela-classic-preview/native').width<=80);assert.equal(budget.active,0);}finally{globalThis.Uint16Array=Type;budget.clear();}
});

test('partial capture cancellation, optional cache eviction and image/SHA identity never reuse incomplete or stale pairs',async()=>{
 const budget=new Budget(4*MiB),{data,image}=source(35,67,budget),other=data.slice(),cache=createClassicPreviewCache({budget,codec:fixtureCodec}),c=cache.beginCapture('image',image,{});c.captureBand(data.subarray(0,35*3),other.subarray(0,35*3),{y:0,rows:1});c.dispose();assert.equal(budget.total(),0);
 capture(cache,image,data,other);await assert.rejects(cache.preview('image',{...image,sha256:'b'.repeat(64)},{},320),/No new JPEG/);budget.clearPrefix('image\0');assert.equal(budget.total(),0);await assert.rejects(cache.preview('image',image,{},320),/No new JPEG/);assert.equal(budget.active,0);
});

test('a captured sample is pinned during allocations and cancellation restores its cache ownership',async()=>{
 const budget=new Budget(4*MiB),{data,image}=source(129,117,budget),cache=createClassicPreviewCache({budget,codec:fixtureCodec});capture(cache,image,data,data);const controller=new AbortController(),pending=cache.preview('image',image,{contrast:61},320,{signal:controller.signal});controller.abort();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(budget.active,0);assert.ok(budget.get('image\0ela-classic-preview/native').pairs);assert.equal((await cache.preview('image',image,{},320)).nativePixelSamples,true);budget.clear();
});

await initJpegWasm({wasmBinary:await readFile(new URL(import.meta.resolve('../vendor/libjpeg/jpeg.wasm')))});
test('public engine retains native Q samples, performs0JPEGs for visual edits, labels changed-Q drafts and clears them on unload/dispose',async()=>{
 const calls=[],codec={...jpegCodec,recompress(pixels,q,hooks){calls.push({width:pixels.width,height:pixels.height,quality:q});return jpegCodec.recompress(pixels,q,hooks);}},engine=createEngine({codec,memoryBudgetBytes:128*MiB,cpuKernel:'single'}),pixels={width:75,height:83,format:'rgb8',data:Uint8Array.from({length:75*83*3},(_,i)=>(i*31+(i>>>7))&255)};
 try{
  await engine.load({id:'image',bytes:Uint8Array.of(1),pixels});const native=await engine.run({id:'native',imageId:'image',operation:'ela.classic'});assert.equal(calls.length,1);const params=validateParams({scale:73,contrast:59,grayscale:true}),view=await engine.previewElaClassic({imageId:'image',params});assert.equal(calls.length,1);const exact=await engine.run({id:'native-edited',imageId:'image',operation:'ela.classic',params});assert.deepEqual(view.pixels.data,exact.pixels.data);assert.equal(calls.length,1);assert.equal(view.presentation.nativePixelSamples,true);assert.deepEqual(native.provenance.params,validateParams());
  const draft=await engine.previewElaClassic({imageId:'image',params:{...params,quality:81},side:32});assert.equal(calls.length,2);assert.ok(calls[1].width<=32&&calls[1].height<=32);assert.equal(draft.nativePixelSamples,false);assert.equal(draft.presentation.method,'preview-size-jpeg');assert.equal(draft.presentation.params.quality,81);assert.equal(draft.logicalWidth,75);assert.match(draft.presentation.reason,/reduced preview/);
  const committed=await engine.run({id:'new-quality',imageId:'image',operation:'ela.classic',params:{...params,quality:81}});assert.equal(calls.length,3);assert.equal(calls[2].width,75);assert.equal(committed.provenance.params.quality,81);assert.equal((await engine.previewElaClassic({imageId:'image',params:{quality:81}})).nativePixelSamples,true);assert.equal(calls.length,3);
  await engine.unload('image');assert.equal(engine.capabilities().memory.cacheBytes,0);assert.equal(engine.capabilities().memory.retainedBytes,0);await assert.rejects(engine.previewElaClassic({imageId:'image'}),{code:'NOT_FOUND'});
  await engine.load({id:'image',bytes:Uint8Array.of(2),pixels});const fresh=await engine.previewElaClassic({imageId:'image'});assert.equal(fresh.nativePixelSamples,false);assert.notEqual(fresh.presentation.sourceSha256,view.presentation.sourceSha256);assert.equal(engine.capabilities().memory.activeReservationBytes,0);
 }finally{await engine.dispose();}await assert.rejects(engine.previewElaClassic({imageId:'image'}),{code:'DISPOSED'});
});

test('public preview serializes with native engine work and rejects cancellation without publishing scientific output',async()=>{
 const engine=createEngine({codec:jpegCodec,memoryBudgetBytes:128*MiB,cpuKernel:'single'}),pixels={width:33,height:35,format:'rgb8',data:new Uint8Array(33*35*3).fill(100)};try{await engine.load({id:'image',bytes:Uint8Array.of(1),pixels});await engine.run({id:'native',imageId:'image',operation:'ela.classic'});const c=new AbortController(),preview=engine.previewElaClassic({imageId:'image',params:{contrast:71}},{signal:c.signal});await assert.rejects(engine.run({id:'racing',imageId:'image',operation:'ela.classic'}),{code:'BUSY'});c.abort();await assert.rejects(preview,{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal((await engine.previewElaClassic({imageId:'image'})).nativePixelSamples,true);await assert.rejects(engine.previewElaClassic({imageId:'image',side:2049}),{code:'INVALID_INPUT'});}finally{await engine.dispose();}
});

test('an actual optional Uint16 backing refusal cannot fail or alter a completed native Classic run',async()=>{
 const engine=createEngine({codec:jpegCodec,memoryBudgetBytes:128*MiB,cpuKernel:'single'}),pixels={width:33,height:35,format:'rgb8',data:Uint8Array.from({length:33*35*3},(_,i)=>i*31)},params=validateParams({linear:true,scale:37,contrast:59,grayscale:true}),Type=globalThis.Uint16Array;let native;
 try{await engine.load({id:'image',bytes:Uint8Array.of(1),pixels});globalThis.Uint16Array=class extends Type{constructor(){throw new RangeError('Injected optional capture refusal');}};native=await engine.run({id:'native',imageId:'image',operation:'ela.classic',params});globalThis.Uint16Array=Type;
  const expected=await elaRender(await elaBase(pixels.data,(await jpegCodec.recompress(pixels,params.quality)).data,params.linear),params);assert.deepEqual(native.pixels.data,expected);assert.deepEqual(native.provenance.params,params);assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal((await engine.previewElaClassic({imageId:'image',params})).nativePixelSamples,false);
 }finally{globalThis.Uint16Array=Type;await engine.dispose();}
});

test('cancelled native scanlines discard only partial preview pairs and keep the completed global JPEG for an exact retry',async()=>{
 const budget=new Budget(128*MiB),{image}=source(35,67,budget),cache=createClassicPreviewCache({budget,codec:jpegCodec}),controller=new AbortController();let result;
 try{await assert.rejects(segmentedEla(image,validateParams(),{budget,signal:controller.signal,createPreviewCapture:()=>cache.beginCapture('image',image,{}),onProgress:event=>{if(event.phase==='jpeg-render')controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.get('image\0ela-classic-preview/native'),undefined);assert.equal(image.rgbRecompression.hasEncoded(75),true);
  result=await segmentedEla(image,validateParams(),{budget,createPreviewCapture:()=>cache.beginCapture('image',image,{})});assert.equal(result.metrics.recompressions,0);assert.equal((await cache.preview('image',image,{})).nativePixelSamples,true);
 }finally{await result?.surface.dispose();await image.rgbRecompression?.dispose();await image.surface.dispose();budget.clear();}assert.equal(budget.total(),0);
});

test('native segmented scanlines capture the same JPEG pass and retain pixel parity for odd bands and large input',async()=>{
 const budget=new Budget(128*MiB),{image}=source(659,676,budget),calls=[],codec={...jpegCodec,recompress(p,q,hooks){calls.push([p.width,p.height,q]);return jpegCodec.recompress(p,q,hooks);}},cache=createClassicPreviewCache({budget,codec});let result;
 try{
  const params=validateParams({scale:37,contrast:59,grayscale:true});result=await segmentedEla(image,params,{budget,createPreviewCapture:()=>cache.beginCapture('image',image,params)});assert.equal(result.metrics.recompressions,1);const preview=await cache.preview('image',image,params),full=await result.surface.readWindow();assert.deepEqual(preview.pixels.data,expectedSamples(full.pixels.data,659,676,preview.pixels));full.release();assert.equal(preview.nativePixelSamples,true);assert.equal(calls.length,0);
  await result.surface.dispose();result=await segmentedEla(image,validateParams({linear:true}),{budget,createPreviewCapture:()=>cache.beginCapture('image',image,{linear:true})});assert.equal(result.metrics.recompressions,0);const linear=await cache.preview('image',image,{linear:true}),linearFull=await result.surface.readWindow();assert.deepEqual(linear.pixels.data,expectedSamples(linearFull.pixels.data,659,676,linear.pixels));linearFull.release();assert.equal(calls.length,0);assert.equal(budget.active,0);
 }finally{await result?.surface.dispose();await image.rgbRecompression?.dispose();await image.surface.dispose();budget.clear();}assert.equal(budget.total(),0);
});

test('optional capture beyond320 uses only its budget fraction, exact native pairs, and zero new JPEGs',async()=>{
 const budget=new Budget(128*MiB),{data,image}=source(659,676,budget),other=Uint8Array.from(data,x=>255-x),cache=createClassicPreviewCache({budget,codec:fixtureCodec});capture(cache,image,data,other);const entry=budget.get('image\0ela-classic-preview/native');assert.ok(entry.width>320);assert.ok(entry.byteLength<=Math.min(24*MiB,budget.limit/32));const before=data.slice(),p=validateParams({scale:19,contrast:31,grayscale:true});
 try{const result=await cache.preview('image',image,p,2048),native=await elaRender(await elaBase(data,other,p.linear),p);assert.deepEqual(result.pixels.data,native);assert.equal(result.nativePixelSamples,true);assert.equal(budget.active,0);assert.deepEqual(data,before);const c=new AbortController(),pending=cache.preview('image',image,p,1024,{signal:c.signal});c.abort();await assert.rejects(pending,{code:'CANCELLED'});assert.ok(budget.get('image\0ela-classic-preview/native').pairs);assert.equal(budget.active,0);assert.throws(()=>cache.beginCapture('image',image,p,{side:2049}),{code:'INVALID_INPUT'});}finally{budget.clear();await image.surface.dispose();}assert.equal(budget.total(),0);
});
