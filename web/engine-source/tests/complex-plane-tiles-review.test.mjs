import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createComplexPlane} from '../src/segmented-complex-plane.js';

const T=128,bytes=view=>new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function samples(ArrayType,count,seed=0){
 const data=new ArrayType(count),words=ArrayType===Float32Array?new Uint32Array(data.buffer):new BigUint64Array(data.buffer),patterns=ArrayType===Float32Array?[0,0x80000000,0x7fc00123,0xffc54321,0x7f800000,0xff800000,1,0x007fffff,0x3f800001,0xdeadbeef]:[0n,0x8000000000000000n,0x7ff8000000000123n,0xfff8abcdef123456n,0x7ff0000000000000n,0xfff0000000000000n,1n,0x000fffffffffffffn,0x3ff0000000000001n,0xdeadbeefcafebaben];
 for(let i=0;i<count;i++)words[i]=patterns[(i*7+Math.floor(i/11)+seed)%patterns.length];return data;
}
function crop(values,width,x,y,w,h){const stride=values.BYTES_PER_ELEMENT*2,out=new values.constructor(w*h*2);for(let row=0;row<h;row++)bytes(out).set(bytes(values).subarray(((y+row)*width+x)*stride,((y+row)*width+x+w)*stride),row*w*stride);return out;}
function patch(values,width,part,x,y,w,h){const stride=values.BYTES_PER_ELEMENT*2;for(let row=0;row<h;row++)bytes(values).set(bytes(part).subarray(row*w*stride,(row+1)*w*stride),((y+row)*width+x)*stride);}
function packed(values,width,height){const stride=values.BYTES_PER_ELEMENT*2,out=new Uint8Array(values.byteLength);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const tx=Math.floor(x/T)*T,ty=Math.floor(y/T)*T,tw=Math.min(T,width-tx),th=Math.min(T,height-ty),to=(ty*width+tx*th+(y-ty)*tw+x-tx)*stride;out.set(bytes(values).subarray((y*width+x)*stride,(y*width+x+1)*stride),to);}return out;}
function temporary({budget,holdBacking=0,refuseClose=0}={}){
 const files=[],state={reads:0,writes:0,readBytes:0,writeBytes:0,maxWindow:0,disposeAttempts:0,onRead:null,onWrite:null};
 const session={backend:'opfs',async create(length){const data=new Uint8Array(length),release=holdBacking?budget.reserve(holdBacking):()=>{},file={data,closed:false,async readInto(out,at,{signal}={}){if(signal?.aborted)throw Object.assign(Error('cancelled'),{code:'CANCELLED'});state.reads++;state.readBytes+=out.byteLength;state.maxWindow=Math.max(state.maxWindow,out.byteLength);await state.onRead?.({out,at,file});if(signal?.aborted)throw Object.assign(Error('cancelled'),{code:'CANCELLED'});out.set(data.subarray(at,at+out.byteLength));return out;},async write(input,at,{signal}={}){if(signal?.aborted)throw Object.assign(Error('cancelled'),{code:'CANCELLED'});state.writes++;state.writeBytes+=input.byteLength;state.maxWindow=Math.max(state.maxWindow,input.byteLength);await state.onWrite?.({input,at,file});if(signal?.aborted)throw Object.assign(Error('cancelled'),{code:'CANCELLED'});data.set(input,at);},async flush(){},async dispose(){state.disposeAttempts++;if(state.disposeAttempts<=refuseClose)throw Object.assign(Error('backing NACK'),{code:'STORAGE_IO'});if(!file.closed){file.closed=true;release();}}};files.push(file);return file;}};
 return{session,state,files,current:()=>files.findLast(file=>!file.closed)};
}
async function fixture({ArrayType=Float32Array,width=259,height=257,storage='temporary',limit=8*1024**2,...backing}={}){
 const budget=new Budget(limit),disk=temporary({budget,...backing}),plane=await createComplexPlane(width,height,{ArrayType,budget,storage,temporarySession:disk.session,temporaryTileSize:T}),values=samples(ArrayType,width*height*2);await plane.write(values,0,0,width,height);return{budget,disk,plane,values,width,height,ArrayType};
}

for(const ArrayType of [Float32Array,Float64Array])test(`${ArrayType.name} temporary tiles preserve every payload bit, odd edges and global row-major windows`,async()=>{
 const f=await fixture({ArrayType});try{assert.equal(f.plane.transportMetrics().layout,'temporary-tiles');assert.equal(f.plane.store.byteLength,f.values.byteLength);assert.equal(typeof f.plane.store.readInto,'undefined');assert.equal(typeof f.plane.store.write,'undefined');assert.deepEqual(f.disk.current().data,packed(f.values,f.width,f.height));
  for(const [x,y,w,h]of [[0,0,f.width,f.height],[127,126,132,131],[258,256,1,1],[128,0,1,257],[0,128,259,1]])assert.deepEqual(bytes(await f.plane.read(x,y,w,h)),bytes(crop(f.values,f.width,x,y,w,h)));
  const outer=samples(ArrayType,131*129*2+16,3),part=outer.subarray(8,8+131*129*2);await f.plane.write(part,127,127,131,129);patch(f.values,f.width,part,127,127,131,129);assert.deepEqual(bytes(await f.plane.read(0,0,f.width,f.height)),bytes(f.values));assert.deepEqual(f.disk.current().data,packed(f.values,f.width,f.height));assert.ok(f.budget.peak<=128*1024,'transport scratch stays within128KiB');
 }finally{await f.plane.dispose();}assert.equal(f.budget.total(),0);
});

test('concurrent disjoint and overlapping writes sharing physical tiles retain ordered updates and queued-read semantics',{timeout:5000},async()=>{
 const f=await fixture();try{const jobs=[];for(const [index,x]of [1,31,63,127].entries()){const part=samples(Float32Array,2*f.height,index+2);jobs.push(f.plane.write(part,x,0,1,f.height));patch(f.values,f.width,part,x,0,1,f.height);}const a=samples(Float32Array,2*5*7,7),b=samples(Float32Array,2*5*7,8);jobs.push(f.plane.write(a,124,126,5,7));patch(f.values,f.width,a,124,126,5,7);jobs.push(f.plane.write(b,126,128,5,7));patch(f.values,f.width,b,126,128,5,7);const after=f.plane.read(0,0,f.width,f.height);await Promise.all(jobs);assert.deepEqual(bytes(await after),bytes(f.values));assert.deepEqual(f.disk.current().data,packed(f.values,f.width,f.height));}finally{await f.plane.dispose();}assert.equal(f.budget.total(),0);
});

test('a write waits for an already active read, while a later read waits for that write without a dependency cycle',{timeout:5000},async()=>{
 const f=await fixture(),entered=deferred(),gate=deferred();try{let first=true;f.disk.state.onRead=async()=>{if(first){first=false;entered.resolve();await gate.promise;}};const prior=crop(f.values,f.width,1,2,129,131),reading=f.plane.read(1,2,129,131);await entered.promise;const writeCalls=f.disk.state.writes,part=samples(Float32Array,129*131*2,5),writing=f.plane.write(part,1,2,129,131),later=f.plane.read(1,2,129,131);await new Promise(setImmediate);assert.equal(f.disk.state.writes,writeCalls,'no RMW may publish while its preceding read is active');gate.resolve();assert.deepEqual(bytes(await reading),bytes(prior));await writing;assert.deepEqual(bytes(await later),bytes(part));}finally{gate.resolve();await f.plane.dispose();}assert.equal(f.budget.total(),0);
});

for(const ArrayType of [Float32Array,Float64Array])test(`${ArrayType.name} scratch refusal retains physical tiled addressing and bit-exact partial updates`,async()=>{
 const f=await fixture({ArrayType,limit:1024});try{const part=samples(ArrayType,7*131*2,9);await f.plane.write(part,126,125,7,131);patch(f.values,f.width,part,126,125,7,131);assert.deepEqual(bytes(await f.plane.read(126,125,7,131)),bytes(part));assert.deepEqual(f.disk.current().data,packed(f.values,f.width,f.height));assert.ok(f.plane.transportMetrics().scratchRefusals>0);assert.ok(f.budget.peak<=1024);}finally{await f.plane.dispose();}assert.equal(f.budget.total(),0);
});

test('an aborted read releases scratch and does not retain its signal for the next transfer',async()=>{
 const f=await fixture(),stop=new AbortController();try{const before=f.budget.total();f.disk.state.onRead=()=>stop.abort();await assert.rejects(f.plane.read(127,126,129,129,{signal:stop.signal}),{code:'CANCELLED'});assert.equal(f.budget.total(),before);f.disk.state.onRead=null;assert.deepEqual(bytes(await f.plane.read(127,126,129,129)),bytes(crop(f.values,f.width,127,126,129,129)));}finally{await f.plane.dispose();}assert.equal(f.budget.total(),0);
});

test('disposal waits for in-flight tiled I/O and retries refused physical retirement without refunding backing early',{timeout:5000},async()=>{
 const f=await fixture({holdBacking:37,refuseClose:1}),entered=deferred(),gate=deferred();try{let first=true;f.disk.state.onRead=async()=>{if(first){first=false;entered.resolve();await gate.promise;}};const reading=f.plane.read(127,126,129,129);await entered.promise;const close=f.plane.dispose(),settled=Promise.allSettled([close]);await new Promise(setImmediate);assert.equal(f.disk.state.disposeAttempts,0);await assert.rejects(f.plane.read(0,0,1,1),{code:'DISPOSED'});gate.resolve();await reading;assert.equal((await settled)[0].status,'rejected');assert.equal(f.budget.total(),37);await f.plane.dispose();assert.equal(f.disk.state.disposeAttempts,2);assert.equal(f.budget.total(),0);}finally{gate.resolve();await f.plane.dispose();}
});

test('a temporary tiled plane retains its physical layout through RAM promotion and a second spill',async()=>{
 const f=await fixture({ArrayType:Float64Array});try{await f.plane.store.promote();assert.equal(f.plane.store.storage,'memory');assert.equal(f.plane.transportMetrics().layout,'temporary-tiles');assert.deepEqual(bytes(await f.plane.read(0,0,f.width,f.height)),bytes(f.values));const part=samples(Float64Array,5*7*2,8);await f.plane.write(part,125,126,5,7);patch(f.values,f.width,part,125,126,5,7);await f.plane.store.spill();assert.equal(f.plane.store.storage,'temporary');assert.deepEqual(bytes(await f.plane.read(0,0,f.width,f.height)),bytes(f.values));assert.deepEqual(f.disk.current().data,packed(f.values,f.width,f.height));}finally{await f.plane.dispose();}assert.equal(f.budget.total(),0);
});

test('an initially RAM row-major plane is never reinterpreted as tiled after physical migration to temporary storage',async()=>{
 const f=await fixture({ArrayType:Float64Array,storage:'memory'});try{assert.equal(f.plane.transportMetrics().layout,'row-major');await f.plane.store.spill();assert.equal(f.plane.store.storage,'temporary');assert.equal(f.plane.transportMetrics().layout,'row-major');assert.deepEqual(f.disk.current().data,bytes(f.values));const part=samples(Float64Array,9*129*2,4);await f.plane.write(part,124,127,9,129);patch(f.values,f.width,part,124,127,9,129);assert.deepEqual(bytes(await f.plane.read(124,127,9,129)),bytes(part));assert.deepEqual(f.disk.current().data,bytes(f.values));}finally{await f.plane.dispose();}assert.equal(f.budget.total(),0);
});

test('100MP geometry reads only intersected physical tiles for one complete-axis strip without allocating the whole plane',async()=>{
 const width=10000,height=10000,w=26,stride=8,budget=new Budget(8*1024**2);let physicalBytes=0,readCalls=0,alive=0;
 const temporarySession={backend:'opfs',async create(byteLength){alive++;assert.equal(byteLength,width*height*stride);return{async readInto(out){readCalls++;physicalBytes+=out.byteLength;out.fill(0);return out;},async write(){},async flush(){},async dispose(){alive--;}};}},plane=await createComplexPlane(width,height,{budget,storage:'temporary',temporarySession,temporaryTileSize:128}),releaseOutput=budget.reserve(w*height*stride);
 try{const values=await plane.read(26,0,w,height);assert.equal(values.byteLength,w*height*stride);assert.equal(values.some(value=>value!==0),false);assert.equal(readCalls,Math.ceil(height/T));assert.equal(physicalBytes,height*T*stride);assert.ok(physicalBytes<plane.store.byteLength/20,'one strip must not reread the full800MB plane');assert.equal(plane.transportMetrics().readBytes,physicalBytes);assert.ok(budget.peak<=releaseOutput.bytes+128*1024);}finally{releaseOutput();await plane.dispose();}assert.equal(alive,0);assert.equal(budget.total(),0);
});

test('parallel reads share one budget and a second scratch refusal completes exactly while the first read still owns its scratch',{timeout:5000},async()=>{
 const f=await fixture({limit:192*1024}),entered=deferred(),gate=deferred();try{let first=true;f.disk.state.onRead=async()=>{if(first){first=false;entered.resolve();await gate.promise;}};const prior=f.plane.read(1,2,3,7);await entered.promise;const next=await f.plane.read(31,13,5,11);assert.deepEqual(bytes(next),bytes(crop(f.values,f.width,31,13,5,11)));assert.ok(f.plane.transportMetrics().scratchRefusals>0);assert.equal(f.budget.total(),128*1024);assert.ok(f.budget.peak<=192*1024);gate.resolve();assert.deepEqual(bytes(await prior),bytes(crop(f.values,f.width,1,2,3,7)));}finally{gate.resolve();await f.plane.dispose();}assert.equal(f.budget.total(),0);
});

for(const ArrayType of [Float32Array,Float64Array])test(`${ArrayType.name} full physical columns transfer only a21-row band across128, including subviews and the odd right edge`,async()=>{
 const f=await fixture({ArrayType}),y=120,h=21;try{for(const [x,w]of [[0,259],[128,128],[256,3]]){const outer=samples(ArrayType,w*h*2+19,x+3),part=outer.subarray(7,7+w*h*2);f.disk.state.readBytes=0;f.disk.state.writeBytes=0;f.disk.state.reads=0;f.disk.state.writes=0;await f.plane.write(part,x,y,w,h);patch(f.values,f.width,part,x,y,w,h);assert.equal(f.disk.state.reads,0,'whole physical rows never require RMW');assert.equal(f.disk.state.writeBytes,part.byteLength,'only selected physical rows are written');assert.deepEqual(f.disk.current().data,packed(f.values,f.width,f.height));f.disk.state.readBytes=0;assert.deepEqual(bytes(await f.plane.read(x,y,w,h)),bytes(part));assert.equal(f.disk.state.readBytes,part.byteLength,'only selected physical rows are read');}
 }finally{await f.plane.dispose();}assert.equal(f.budget.total(),0);
});
