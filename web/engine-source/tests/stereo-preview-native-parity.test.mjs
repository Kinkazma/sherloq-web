import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {contiguousSurface} from '../src/image-sources.js';import {segmentedStereogram} from '../src/segmented-stereogram.js';
const sha=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
// Independent witness captured from the immutable pre-retirement implementation
// using the same native stereo WASM and this deterministic, unresized input.
const nativeViews=['f250e2c74e5137a0113dd9f50c86e8ebe7f629fc73d4d72f7cccf0332bbc9399','894319c2139baefe83e796f13b63a0b46d687ce51345820fe39fcb2914b09691','6377f1adf1a1078ad4b36eddec9e89a97db85c7c574f2a760d924725db2693a0','04d6254708b5e017d0bcc55e7cae2c77cb924c107309fe588dea69c566395270'],nativeFlow='9e16a8abb21504b16a041345f839c7661532238141195d8d1dc6b54972ea15fc';
test('all four real native views and raw flow remain exact, with published pixels surviving cache retirement',async()=>{
 const budget=new Budget(128*1024**2),width=96,height=31,pixels={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>{const c=i%3,x=Math.floor(i/3)%width,y=Math.floor(i/(width*3));return((x%12)*71+y*13+c*11)%230+((x*7+y*17+c)%11)*2;})},image={surface:contiguousSurface(pixels,budget)};let cache,published;
 for(let mode=0;mode<4;mode++){
  const r=await segmentedStereogram(image,{mode},{budget,cache});cache=r.stereoCache;assert.equal(r.data.offset,12);const frame=await r.surface.readWindow();assert.deepEqual([frame.pixels.width,frame.pixels.height],[84,31]);assert.equal(sha(frame.pixels.data),nativeViews[mode]);await frame.release();
  if(mode===0)published=r.surface;else await r.surface.dispose();
  if(r.tableRecords?.flow){assert.equal(sha(await cache.flow.plane.read(0,0,84,31)),nativeFlow);await r.tableRecords.flow.surface.dispose();}
 }
 await cache.dispose();const after=await published.readWindow();assert.equal(sha(after.pixels.data),nativeViews[0]);await after.release();await published.dispose();await image.surface.dispose();assert.equal(budget.total(),0);
});
