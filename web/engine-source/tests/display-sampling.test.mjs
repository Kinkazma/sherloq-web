import {createEngine} from '../src/index.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createRgbSurface,createMaskSurface,createFlagSurface} from '../src/rgb-surface.js';
import {createNumericSurface} from '../src/numeric-surface.js';
import {samplePixels,readDisplayFrame,displayGeometry} from '../src/display-sampling.js';
import {orientRgb} from '../src/image-headers.js';
const source={width:37,height:29,format:'rgb8',data:Uint8Array.from({length:37*29*3},(_,i)=>i*73^(i>>>3))};
function store(data){const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);return {byteLength:bytes.length,readBytes:0,readInto(out,at){this.readBytes+=out.length;out.set(bytes.subarray(at,at+out.length));return out;}};}
test('sampled store preserves all EXIF orientations, odd edges and exact 100% pixels',async()=>{
 for(let orientation=1;orientation<=8;orientation++){
  const budget=new Budget(1024**2),surface=createRgbSurface(store(source.data),{...source,orientation,budget,ownsStore:false}),expected=await orientRgb(source,orientation);
  for(const step of [1,2,5,99]){const tile={x:2,y:3,w:expected.width-2,h:expected.height-3,step},a=await surface.readSampledWindow(tile),b=await samplePixels(expected,tile,{budget});assert.deepEqual(a.pixels,b.pixels);a.release();b.release();assert.equal(budget.total(),0);}
  await surface.dispose();assert.throws(()=>surface.readSampledWindow({}),{code:'DISPOSED'});
 }
});
test('sampling skips unused rows and returns only visible pixels, including asynchronous storage',async()=>{
 const budget=new Budget(1024**2),backing=store(source.data),read=backing.readInto;backing.readInto=async function(...args){return read.apply(this,args);};
 const surface=createRgbSurface(backing,{...source,budget,ownsStore:false}),frame=await readDisplayFrame(surface,{x:0,y:0,w:37,h:29,step:5},{budget});
 assert.equal(frame.pixels.data.length,8*6*3);assert.equal(backing.readBytes,36*3*6);assert.equal(frame.metrics.sourceBytes,backing.readBytes);frame.release();assert.equal(budget.total(),0);
});
test('numeric palettes and overlays are applied after sampling and preserve original semantics',async()=>{
 const budget=new Budget(1024**2),values=Float32Array.from({length:37*29},(_,i)=>i%4),plane=createNumericSurface(store(values),{width:37,height:29,format:'float32',semantics:'count',budget}),overlay=createRgbSurface(store(source.data),{...source,budget,ownsStore:false}),palette=[[0,0,0],[20,100,255],[255,0,20],[1,2,3]],tile={x:1,y:2,w:31,h:25,step:3};
 const out=await readDisplayFrame(plane,tile,{budget,overlay,render:{palette,opacity:.6}});
 for(let y=0;y<out.pixels.height;y++)for(let x=0;x<out.pixels.width;x++){const i=(2+y*3)*37+1+x*3,v=values[i];for(let c=0;c<3;c++)assert.equal(out.pixels.data[(y*out.pixels.width+x)*3+c],v>0?Math.round(source.data[i*3+c]*.4+palette[v][c]*.6):source.data[i*3+c]);}
 out.release();assert.equal(budget.total(),0);
});
test('binary masks and RGB flags retain their distinct channel interpretation',async()=>{
 for(const flags of [false,true]){const budget=new Budget(100000),channels=flags?3:1,data=Uint8Array.from({length:9*7*channels},(_,i)=>i%3),surface=flags?createFlagSurface(store(data),{width:9,height:7,budget}):createMaskSurface(store(data),{width:9,height:7,budget,range:[0,2],semantics:'mask'}),out=await readDisplayFrame(surface,{x:0,y:0,w:9,h:7,step:2},{budget});
 for(let y=0;y<4;y++)for(let x=0;x<5;x++)for(let c=0;c<3;c++)assert.equal(out.pixels.data[(y*5+x)*3+c],data[(y*2*9+x*2)*channels+(flags?c:0)]?255:0);out.release();assert.equal(budget.total(),0);}
});
test('cancellation, invalid geometry and failed row allocation release all presentation memory',async()=>{
 const budget=new Budget(16),surface=createRgbSurface(store(source.data),{...source,budget,ownsStore:false});
 await assert.rejects(surface.readSampledWindow({x:0,y:0,w:37,h:29,step:30}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);
 const abort=new AbortController();abort.abort();await assert.rejects(samplePixels(source,{x:0,y:0,w:1,h:1,step:1},{budget,signal:abort.signal}),{code:'CANCELLED'});assert.equal(budget.total(),0);
 assert.throws(()=>displayGeometry(source,{x:0,y:0,w:38,h:29,step:1}));assert.throws(()=>displayGeometry({width:100000,height:100000},{x:0,y:0,w:100000,h:100000,step:1}));
});

test('public display API rejects stale ownership, preserves the exact export source and releases memory',async()=>{
 const engine=createEngine({memoryBudgetBytes:128*1024**2,cpuKernel:'single'});
 try{const loaded=await engine.load({id:'display-source',bytes:Uint8Array.of(1),pixels:source}),before=engine.capabilities().memory.activeReservationBytes,tile={x:2,y:3,w:31,h:21,step:4},request={surfaceId:loaded.surface.id,revision:loaded.surface.revision,tile};
 const frame=await engine.readDisplay(request),expected=await samplePixels(source,tile);assert.deepEqual(frame.pixels,expected.pixels);expected.release();assert.equal(engine.capabilities().memory.activeReservationBytes,before);
 const exact=await engine.readPixels({surfaceId:loaded.surface.id,revision:loaded.surface.revision,rect:{x:0,y:0,width:37,height:29}});assert.deepEqual(exact.pixels.data,source.data);
 await assert.rejects(engine.readDisplay({...request,revision:99}),/Stale/);await engine.unload('display-source');await assert.rejects(engine.readDisplay(request),{code:'NOT_FOUND'});
 }finally{await engine.dispose();}
});

test('many tiny reads still service cancellation without a mandatory timer per window',async()=>{
 const budget=new Budget(10000),surface=createRgbSurface(store(source.data),{...source,budget,ownsStore:false}),abort=new AbortController();let read=0;const timer=setTimeout(()=>abort.abort(),0);
 try{await assert.rejects((async()=>{for(;read<50000;read++){const part=await surface.readWindow({x:0,y:0,width:1,height:1},{signal:abort.signal});part.release();}})(),{code:'CANCELLED'});assert.ok(read<50000);assert.equal(budget.total(),0);}finally{clearTimeout(timer);await surface.dispose();}
});
