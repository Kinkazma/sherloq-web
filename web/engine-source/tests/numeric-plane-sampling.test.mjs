import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {createNumericSurface} from '../src/numeric-surface.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {numericPlaneSamplePlan,NUMERIC_SAMPLE_MAX_POINTS} from '../src/numeric-plane-sampling.js';
import {sampleEnergyField} from '../../wordpress/sherloq-browser/assets/energy-native-fields.js';
const raw=value=>new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
const coord=(i,source,target,centers,step)=>centers?Math.min(source-1,Math.floor((i+.5)*source/target)):i*step;
function fixture({width=37,height=29,format='float32',budget=new Budget(64*1024**2),words}={}){
 const Type=format==='int32'?Int32Array:format==='float64'?Float64Array:Float32Array,pixels=width*height,prefix=13,backing=new Uint8Array(prefix+pixels*Type.BYTES_PER_ELEMENT+19).fill(199),source=backing.subarray(prefix,prefix+pixels*Type.BYTES_PER_ELEMENT),values=Type.from({length:pixels},(_,i)=>format==='int32'?i%2?-i:i:i%2?-i/7:i*9);source.set(raw(values));if(words){const bytes=raw(Uint32Array.from({length:pixels},(_,i)=>words[i%words.length]));source.set(bytes);}
 const reads=[],buffers=new Set();let hook;
 const store={byteLength:source.byteLength,storage:'test-offset-bytes',readInto(target,offset=0,options){reads.push({offset,length:target.byteLength});buffers.add(target.buffer);const result=()=>{target.set(source.subarray(offset,offset+target.byteLength));return target;};const wait=hook?.(target,offset,options);return wait?.then?wait.then(result):result();}};
 const surface=createNumericSurface(store,{width,height,format,budget,semantics:'native test samples',dispose(){}}),request=extra=>({sourceWidth:width,sourceHeight:height,width:11,height:9,step:3,...extra});
 const legacy=async grid=>{const name=format==='int32'?'energy_scope':'energy_low_score',analysis={data:{width,height},planeSurfaces:{[name]:surface.descriptor}},engine={async readPlane({rect}){const answer=await surface.readWindow(rect);const plane=answer.pixels;answer.release();return{plane};}};return sampleEnergyField(analysis,name,{...grid,maxWindowRows:height},{engine});};
 return{width,height,format,budget,source,backing,reads,buffers,surface,request,legacy,hook:fn=>hook=fn};
}
test('the pure plan admits destination, bounded staging and financed Float64 columns exactly',()=>{
 const plan=numericPlaneSamplePlan({width:3822,height:7716,format:'float32'},{sourceWidth:3822,sourceHeight:7716,width:2028,height:4096,centers:true});assert.equal(plan.outputPixels,2028*4096);assert(plan.outputPixels<=NUMERIC_SAMPLE_MAX_POINTS);assert.equal(plan.outputBytes,4*plan.outputPixels);assert.equal(plan.coordinateBytes,8*2028);assert(plan.scratchBytes<=1024**2);assert.equal(plan.requiredBytes,plan.outputBytes+plan.scratchBytes+plan.coordinateBytes);assert(Object.isFrozen(plan));
});
test('direct numeric samples are byte exact against the legacy integer and center sampler',async()=>{
 for(const format of ['float32','int32'])for(const grid of [{width:11,height:9,step:3},{width:23,height:17,centers:true},{width:37,height:29,step:1}]){const h=fixture({format});let frame;try{const before=h.backing.slice();frame=await h.surface.samplePlane(h.request(grid));const newReads=h.reads.slice();assert.equal(frame.pixels.data.constructor,format==='float32'?Float32Array:Int32Array);assert.deepEqual(raw(frame.pixels.data),raw(await h.legacy(grid)));assert.deepEqual(h.backing,before);assert(newReads.every(r=>Math.floor(r.offset/(h.width*4))===Math.floor((r.offset+r.length-1)/(h.width*4))),'no unused native Y rows are materialized');assert.equal(h.budget.total(),frame.pixels.data.byteLength);frame.pixels.data.fill(0);assert.deepEqual(h.backing,before);}finally{frame?.release();await h.surface.dispose();}assert.equal(h.budget.total(),0);}
});
test('step9 remains step9 on an odd non-dividing grid and never becomes ceil(source/target)',async()=>{
 const h=fixture({width:40,height:40,format:'int32'});let frame;try{frame=await h.surface.samplePlane(h.request({width:5,height:5,step:9}));const expected=[];for(const y of [0,9,18,27,36])for(const x of [0,9,18,27,36]){const i=y*40+x;expected.push(i%2?-i:i);}assert.deepEqual([...frame.pixels.data],expected);assert.deepEqual(h.reads.map(r=>Math.floor(r.offset/(40*4))),[0,9,18,27,36]);}finally{frame?.release();await h.surface.dispose();}assert.equal(h.budget.total(),0);
});
test('Float32 NaN payloads, signed zero and Int32 high bits survive unaligned source padding bit for bit',async()=>{
 const patterns=[0,0x80000000,0x7fc00001,0x7fa00001,0xffc12345,0x3f800000,0xffffffff,0x01234567];for(const format of ['float32','int32']){const h=fixture({width:7,height:5,format,words:patterns}),grid={width:23,height:17,centers:true};let frame;try{const before=h.backing.slice();frame=await h.surface.samplePlane(h.request(grid));const expected=new Uint32Array(grid.width*grid.height);for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++)expected[y*grid.width+x]=patterns[(coord(y,5,17,true)*7+coord(x,7,23,true))%patterns.length];assert.deepEqual(raw(frame.pixels.data),raw(expected));assert.deepEqual(h.backing,before);assert.equal(frame.metrics.readCalls,5,'repeated centers reuse only the current staging row');}finally{frame?.release();await h.surface.dispose();}assert.equal(h.budget.total(),0);}
});
test('wide sparse X sampling reuses one staging buffer of at most one MiB',async()=>{
 const width=800003,height=7,budget=new Budget(2*1024**2),reads=[],buffers=new Set(),store={byteLength:width*height*4,readInto(target,offset){assert(target.byteLength<=1024**2);assert.equal(Math.floor(offset/(width*4)),Math.floor((offset+target.byteLength-1)/(width*4)));reads.push({offset,length:target.byteLength});buffers.add(target.buffer);const words=new Uint32Array(target.buffer,target.byteOffset,target.byteLength/4);for(let i=0;i<words.length;i++)words[i]=(offset/4+i)>>>0;}},surface=createNumericSurface(store,{width,height,format:'int32',budget,semantics:'wide native rows',dispose(){}}),request={sourceWidth:width,sourceHeight:height,width:8,height:3,centers:true};let frame;
 try{frame=await surface.samplePlane(request);const expected=[];for(let y=0;y<3;y++)for(let x=0;x<8;x++)expected.push(coord(y,height,3,true)*width+coord(x,width,8,true));assert.deepEqual([...frame.pixels.data],expected);assert.equal(buffers.size,1);assert(frame.metrics.scratchBytes<=1024**2);assert(reads.length>3);}finally{frame?.release();await surface.dispose();}assert.equal(budget.total(),0);
});
test('sparse segmented zero banks and odd bank boundaries keep the same native bits',async()=>{
 const budget=new Budget(1024**2),width=13,height=9,store=await createSegmentedBytes(width*height*4,{budget,chunkBytes:19}),surface=createNumericSurface(store,{width,height,format:'float32',budget,semantics:'sparse native plane'});let frame;
 try{await store.write(Uint8Array.of(0,0,128,63),4*17);frame=await surface.samplePlane({sourceWidth:width,sourceHeight:height,width,height,step:1});const words=new Uint32Array(frame.pixels.data.buffer);assert.equal(words[17],0x3f800000);assert.equal(words.filter(x=>x!==0).length,1);}finally{frame?.release();await surface.dispose();}assert.equal(budget.total(),0);
});
test('unsupported format, local shape and optional output cap decline before reservation, allocation or I/O',async()=>{
 class AuditBudget extends Budget{reservations=0;backings=0;reserve(n){this.reservations++;return super.reserve(n);}registerBacking(...args){this.backings++;return super.registerBacking(...args);}}
 for(const option of [{format:'float64'},{shape:true},{cap:true}]){const budget=new AuditBudget(1024),h=fixture({format:option.format??'float32',budget}),request=h.request(option.shape?{sourceWidth:36}:option.cap?{width:4096,height:4096,centers:true}:{});try{await assert.rejects(h.surface.samplePlane(request),e=>e.code==='UNSUPPORTED_LAYOUT'&&e.details.samplePlane.phase==='validation'&&e.details.samplePlane.fallbackSafe===true);assert.equal(budget.reservations,0);assert.equal(budget.backings,0);assert.equal(h.reads.length,0);}finally{await h.surface.dispose();}}
});
test('nonsensical grids and out-of-range final integer indices are strict input errors before I/O',async()=>{
 for(const grid of [{width:0},{height:1.5},{step:0},{step:2.5},{width:20,step:3},{centers:'yes'}]){const h=fixture();try{await assert.rejects(h.surface.samplePlane(h.request(grid)),e=>e.code==='INVALID_INPUT'&&!e.details?.samplePlane);assert.equal(h.reads.length,0);assert.equal(h.budget.total(),0);}finally{await h.surface.dispose();}}
});
test('one combined admission fails before any allocation or I/O and is explicitly safe to fall back',async()=>{
 const desc={width:37,height:29,format:'float32'},request={sourceWidth:37,sourceHeight:29,width:11,height:9,step:3},plan=numericPlaneSamplePlan(desc,request),budget=new Budget(plan.requiredBytes-1),h=fixture({budget});try{await assert.rejects(h.surface.samplePlane(request),e=>e.code==='MEMORY_LIMIT'&&e.details.samplePlane.phase==='admission'&&e.details.samplePlane.fallbackSafe===true);assert.equal(h.reads.length,0);assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);}finally{await h.surface.dispose();}
});
test('frozen and falsy admission primaries are neither wrapped nor tagged',async()=>{
 for(const primary of [Object.freeze(new EngineError('MEMORY_LIMIT','frozen admission')),0,false,null,undefined]){class RefusedBudget extends Budget{reserve(){throw primary;}}const h=fixture({budget:new RefusedBudget(1024**2)});try{await assert.rejects(h.surface.samplePlane(h.request()),e=>e===primary);assert.equal(h.reads.length,0);if(primary&&typeof primary==='object')assert.equal(primary.details,undefined);}finally{await h.surface.dispose();}}
});
test('memory, I/O, frozen and falsy failures after readInto starts are strict primaries without fallback tags',async()=>{
 for(const primary of [new EngineError('MEMORY_LIMIT','I/O workspace'),Object.freeze(new EngineError('STORAGE_IO','frozen I/O')),0,false,null,undefined]){const h=fixture();h.hook(()=>{throw primary;});try{await assert.rejects(h.surface.samplePlane(h.request()),e=>e===primary);assert.equal(h.reads.length,1);if(primary&&typeof primary==='object')assert.equal(primary.details?.samplePlane,undefined);assert.equal(h.budget.total(),0);}finally{await h.surface.dispose();}}
});
test('cancellation before allocation or during I/O never publishes and retains leases until the read settles',async()=>{
 const early=fixture();try{await assert.rejects(early.surface.samplePlane(early.request(),{signal:AbortSignal.abort()}),{code:'CANCELLED'});assert.equal(early.reads.length,0);assert.equal(early.budget.total(),0);}finally{await early.surface.dispose();}
 const h=fixture(),controller=new AbortController();let entered,ack;const started=new Promise(r=>entered=r),gate=new Promise(r=>ack=r);h.hook(async()=>{entered();await gate;});let done=false;const task=h.surface.samplePlane(h.request(),{signal:controller.signal});task.then(()=>{done=true;},()=>{done=true;});await started;controller.abort();await Promise.resolve();assert.equal(done,false);assert(h.budget.total()>0);ack();await assert.rejects(task,{code:'CANCELLED'});assert.equal(h.budget.total(),0);await h.surface.dispose();
});
