import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createVigBackbone} from '../experiments/segmentation/vig-backbone.js';import mathFactory from '../vendor/segmentation/vig-math.js';
const shapes=JSON.parse(await readFile(new URL('../fixtures/vig-math/backbone-shapes.json',import.meta.url)));
const graph=()=>({...shapes,parameters:Object.fromEntries(Object.entries(shapes.parameters).map(([name,shape])=>[name,{name,shape,bytes:shape.reduce((n,v)=>n*v,4),dtype:'float32',sha256:'0'.repeat(64),file:'parameters/'+'0'.repeat(64)+'.bin'}]))});
const hash=data=>createHash('sha256').update(new Uint8Array(data.buffer,data.byteOffset,data.byteLength)).digest('hex');
function mappedPool(budget,{mapped,stop,cleanupFailure}={}){
 const owners=[];let calls=0,captured,releases=0;
 return {owners,get captured(){return captured;},get releases(){return releases;},async run({input,geometry}){
  if(++calls===3){captured=input.slice();throw stop;}
  const [_,h,w,c,k,pad,stride]=geometry,rows=(Math.floor((h+2*pad-k)/stride)+1)*(Math.floor((w+2*pad-k)/stride)+1),data=Float32Array.from({length:c*rows},(_,i)=>Math.fround((i%71-35)/31)),free=budget.reserve(data.byteLength);let live=true;
  const owner={data,workers:mapped?0:1,gpu:mapped?{peakAccountedBytes:data.byteLength,allocations:1}:undefined,release(){if(!live)return;live=false;releases++;if(mapped)structuredClone(data.buffer,{transfer:[data.buffer]});free();if(cleanupFailure)throw cleanupFailure;}};owners.push(owner);return owner;
 },dispose(){assert.ok(owners.every(o=>!mapped||o.data.byteLength===0),'The consumer releases every mapped output before disposing its device.');}};
}
const values=spec=>{const data=new Float32Array(spec.bytes/4);if(spec.name.endsWith('.weight')||spec.name.endsWith('.running_var'))data.fill(1);return new Uint8Array(data.buffer);};

test('legacy VIG result.data + release sequence provably detaches the source before the actual Wasm copy',async()=>{
 const m=await mathFactory(),data=Float32Array.of(1,2,3,4),pointer=m._malloc(data.byteLength);try{structuredClone(data.buffer,{transfer:[data.buffer]});assert.equal(data.byteLength,0);assert.throws(()=>m.HEAPF32.set(data,pointer/4),TypeError);}finally{m._free(pointer);}
});

test('VIG retains mapped convolution outputs through real BN/GELU and gives exactly the same Float32 tensors as host outputs',async()=>{
 const stop=new Error('stop after two tested convolutions'),outputs=[];
 for(const mapped of [false,true]){const budget=new Budget(512*1024**2),pool=mappedPool(budget,{mapped,stop}),backbone=await createVigBackbone({budget,graph:graph(),read:async spec=>values(spec),backend:mapped?'webgpu':'cpu',convolutionFactory:()=>pool}),resident=budget.total();
  try{await assert.rejects(backbone.run(new Float32Array(3*256**2)),e=>e===stop);assert.ok(pool.captured.length>0);assert.ok(pool.captured.every(Number.isFinite));outputs.push(hash(pool.captured));assert.equal(pool.releases,2);assert.equal(budget.total(),resident);}finally{backbone.dispose();}assert.equal(budget.total(),0);
 }
 assert.equal(outputs[0],outputs[1],'Actual compiled BN/GELU results are byte-identical; ownership adds no new activation copy or arithmetic.');
});

for(const cancelled of [false,true])test('VIG releases an outstanding mapping when BN parameter '+(cancelled?'cancels':'fails')+' before its consumer',async()=>{
 const budget=new Budget(512*1024**2),cause=new Error('BN download failed'),controller=new AbortController(),pool=mappedPool(budget,{mapped:true}),backbone=await createVigBackbone({budget,graph:graph(),backend:'webgpu',convolutionFactory:()=>pool,read:async spec=>{if(spec.name==='stem.convs.1.weight'){if(cancelled)controller.abort();else throw cause;}return values(spec);}}),resident=budget.total();
 try{await assert.rejects(backbone.run(new Float32Array(3*256**2),{signal:controller.signal}),e=>cancelled?e.code==='CANCELLED':e===cause);assert.equal(pool.releases,1);assert.equal(pool.owners[0].data.byteLength,0);assert.equal(budget.total(),resident);}finally{backbone.dispose();}assert.equal(budget.total(),0);
});

test('VIG mapped cleanup preserves the original parameter error while still returning its reservations',async()=>{
 const budget=new Budget(512*1024**2),cause=new Error('parameter network failure'),cleanupFailure=new Error('unmap failed after retirement'),pool=mappedPool(budget,{mapped:true,cleanupFailure}),backbone=await createVigBackbone({budget,graph:graph(),backend:'webgpu',convolutionFactory:()=>pool,read:async spec=>{if(spec.name==='stem.convs.1.weight')throw cause;return values(spec);}}),resident=budget.total();
 try{await assert.rejects(backbone.run(new Float32Array(3*256**2)),e=>e===cause&&e.details.cleanupErrors[0].message===cleanupFailure.message);assert.equal(pool.releases,1);assert.equal(budget.total(),resident);}finally{backbone.dispose();}assert.equal(budget.total(),0);
});
