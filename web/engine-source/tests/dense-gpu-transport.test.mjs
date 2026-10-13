import test from 'node:test';
import assert from 'node:assert/strict';
import {DenseGpuTransport,denseGpuInputTransfer,denseGpuInputPublication,denseGpuResultTransfer} from '../src/dense-gpu-transport.js';
import {wasmRange,byteView} from '../src/memory-range.js';

const keys=['queryDescriptors','candidateDescriptors','best'];
function job(pairCount=4,dimensions=12,seed=1){
 const arrays=[pairCount*dimensions,pairCount*dimensions,pairCount].map((length,index)=>{const array=new Uint32Array(length);for(let i=0;i<length;i++)array[i]=[0x80000000,0x7fc12345,0x00000001,0x3f000000+seed+index+i][i%4];return new Uint8Array(array.buffer);});
 return {ranges:arrays,pairCount,dimensions,distanceDimensions:dimensions};
}
function fixture({reuse=true,prepare=()=>true,transform,waitGPU}={}){
 const messages=[],requests=[],inputSnapshots=[],detached=[],claims=new Map();let released=0;
 const transport=new DenseGpuTransport({reuse,read:byteView,post(message){messages.push(message);const value=message.gpuConsumed,id=typeof value==='object'?value.id:value;if(value.retained!==true){claims.delete(id);released++;}},async request(kind,value,transfer=[]){
  requests.push({kind,...value});if(kind==='gpuPrepare'){if(value.retireId){assert.ok(claims.has(value.retireId));claims.delete(value.retireId);released++;}if(value.reuseId){assert.equal(claims.get(value.reuseId),value.bytes);claims.delete(value.reuseId);}const allowed=await prepare(value);if(allowed)claims.set(value.id,value.bytes);return allowed;}
  const first=structuredClone(value,{transfer});detached.push(transfer.every(buffer=>buffer.byteLength===0));
  // Exercise the second coordinator→GPU hop and both ownership returns.
  const gpu=structuredClone(first,{transfer:denseGpuInputTransfer(first.job)});
  inputSnapshots.push(keys.map(key=>Array.from(new Uint32Array(gpu.job[key].buffer,0,gpu.job[key].length))));
  await waitGPU?.(gpu);
  let inputs=denseGpuInputPublication(gpu.job),result=new Float32Array(gpu.job.pairCount);result.fill(NaN);const response=transform?.({inputs,result,job:gpu.job})??{inputs,result};
  const second=structuredClone(response,{transfer:denseGpuResultTransfer(response.result,response.inputs)});
  return structuredClone(second,{transfer:denseGpuResultTransfer(second.result,second.inputs)});
 }});
 return {transport,messages,requests,inputSnapshots,detached,claims,get released(){return released;}};
}

test('real transfers recycle three distinct backings, preserve active bits and omit stale tails',async()=>{
 const f=fixture(),sizes=[[8,12],[3,12],[20,12],[2,16],[2,128],[1,12]];
 for(const [pairCount,dimensions] of sizes){const input=job(pairCount,dimensions,pairCount);const expected=input.ranges.map(array=>Array.from(new Uint32Array(array.buffer)));const result=await f.transport.batch(input);assert.equal(result.length,pairCount);assert.ok(result.every(Number.isNaN));assert.deepEqual(f.inputSnapshots.at(-1),expected);f.transport.consumed();assert.equal(f.claims.size,1);}
 const metrics=f.transport.snapshot();assert.equal(metrics.batches,6);assert.equal(metrics.bufferAllocations,9);assert.equal(metrics.reusedBuffers,9);assert.ok(metrics.reusedBytes>0);assert.equal(metrics.copiedBytes,sizes.reduce((sum,[pairs,dimensions])=>sum+pairs*(dimensions*8+4),0));assert.ok(f.detached.every(Boolean));assert.equal(f.requests.filter(value=>value.reuseId).length,3);assert.equal(f.requests.filter(value=>value.retireId).length,2);f.transport.dispose();assert.equal(f.transport.snapshot().retainedBytes,0);
});

test('renewable Wasm sources are acquired after admission across memory growth',async()=>{
 const memory=new WebAssembly.Memory({initial:1,maximum:2}),module={HEAPU8:new Uint8Array(memory.buffer)},input=job(3,12);let pointer=0;
 const ranges=input.ranges.map(bytes=>{const at=pointer;module.HEAPU8.set(bytes,at);pointer+=bytes.byteLength;return wasmRange(module,at,bytes.byteLength);});
 const f=fixture({prepare(){memory.grow(1);module.HEAPU8=new Uint8Array(memory.buffer);return true;}});await f.transport.batch({...input,ranges});assert.deepEqual(f.inputSnapshots[0],input.ranges.map(bytes=>Array.from(new Uint32Array(bytes.buffer))));f.transport.consumed();f.transport.dispose();
});

test('active banks remain pinned during GPU wait and cannot serve a concurrent call',async()=>{
 let unblock,entered;const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{unblock=resolve;});const f=fixture({waitGPU:async()=>{entered();await gate;}}),input=job();const pending=f.transport.batch(input);await ready;
 assert.equal(f.transport.drop(1),false);await assert.rejects(f.transport.batch(input),{code:'BUSY'});assert.equal(f.claims.size,1);unblock();await pending;assert.equal(f.transport.drop(1),false,'native result has not yet been consumed');f.transport.consumed();assert.equal(f.transport.drop(1),true);assert.equal(f.transport.drop(1),false);assert.equal(f.transport.snapshot().retainedBytes,0);assert.equal(f.transport.snapshot().evictions,1);
});

test('memory admission denial does not allocate or publish a distance job',async()=>{
 const f=fixture({prepare:()=>false});assert.equal(await f.transport.batch(job()),null);f.transport.consumed();assert.equal(f.requests.length,1);assert.equal(f.messages.length,0);assert.equal(f.claims.size,0);assert.equal(f.transport.snapshot().allocatedBytes,0);f.transport.dispose();
});

for(const mode of ['error','discard'])test(mode+' retires returned banks and releases its staging claim',async()=>{
 const f=fixture({transform:response=>({...response,...(mode==='error'?{error:{code:'GPU_FAILED',message:'GPU lost'}}:{discard:true})})});const pending=f.transport.batch(job());if(mode==='error')await assert.rejects(pending,{code:'GPU_FAILED'});else await pending;f.transport.consumed();assert.equal(f.claims.size,0);assert.equal(f.released,1);assert.equal(f.transport.snapshot().retainedBytes,0);assert.equal(f.transport.cache,null);f.transport.dispose();
});

test('baseline option returns ownership but retains no cache',async()=>{
 const f=fixture({reuse:false});for(let i=0;i<3;i++){await f.transport.batch(job());f.transport.consumed();assert.equal(f.claims.size,0);}assert.equal(f.transport.snapshot().bufferAllocations,9);assert.equal(f.transport.snapshot().reusedBuffers,0);assert.equal(f.transport.cache,null);
});

test('transport validation rejects aliasing, detached zero banks and borrowed views',()=>{
 const make=()=>({pairCount:1,dimensions:1,queryDescriptors:Float32Array.of(1),candidateDescriptors:Float32Array.of(2),best:Float32Array.of(3)});
 let value=make();value.best=value.queryDescriptors;assert.throws(()=>denseGpuInputTransfer(value),/distinct backings/);
 value=make();value.queryDescriptors=new Float32Array(new ArrayBuffer(8),4,1);assert.throws(()=>denseGpuInputTransfer(value),/transport input/);
 value={pairCount:0,dimensions:1,queryDescriptors:new Float32Array(0),candidateDescriptors:new Float32Array(0),best:new Float32Array(0)};structuredClone(value.queryDescriptors,{transfer:[value.queryDescriptors.buffer]});assert.throws(()=>denseGpuInputTransfer(value),/detached/);
});

test('a synchronous transfer fault cannot orphan the granted claim',async()=>{
 let active=false;const messages=[],transport=new DenseGpuTransport({reuse:true,read:byteView,post:message=>{messages.push(message);active=false;},request(kind){if(kind==='gpuPrepare'){active=true;return true;}throw new DOMException('Injected transfer failure','DataCloneError');}});
 await assert.rejects(transport.batch(job()),{name:'DataCloneError'});assert.equal(active,true);transport.consumed();assert.equal(active,false);assert.equal(messages[0].gpuConsumed,1);assert.equal(transport.cache,null);transport.dispose();
});

test('unexpected returned capacities are rejected before cache publication',async()=>{
 const f=fixture({transform:response=>{const before=response.inputs.queryDescriptors,bank=new ArrayBuffer(before.buffer.byteLength+4);new Uint8Array(bank).set(new Uint8Array(before.buffer));response.inputs.queryDescriptors=new Float32Array(bank,0,before.length);return response;}});
 await assert.rejects(f.transport.batch(job()),/unexpected capacities/);f.transport.consumed();assert.equal(f.claims.size,0);assert.equal(f.transport.cache,null);assert.equal(f.transport.snapshot().retainedBytes,0);f.transport.dispose();
});
