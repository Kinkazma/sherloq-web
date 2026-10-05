import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {createD2prlRecovery} from '../experiments/d2prl/recovery.js';
import {createConvolutionGeneralGpu} from '../experiments/d2prl/convolution-general-gpu.js';
import {createConvolutionGpu} from '../experiments/d2prl/convolution-gpu.js';
const MiB=1024**2;
function environment(t){
 const old=[];const define=(target,key,value)=>{old.push([target,key,Object.getOwnPropertyDescriptor(target,key)]);Object.defineProperty(target,key,{value,configurable:true});};
 t.after(()=>{for(const [target,key,descriptor]of old){if(descriptor)Object.defineProperty(target,key,descriptor);else delete target[key];}});
 define(globalThis,'GPUBufferUsage',{STORAGE:1,COPY_DST:2,COPY_SRC:4,UNIFORM:8,MAP_READ:16});define(globalThis,'GPUMapMode',{READ:1});
 const buffers=[];let submissions=0,destroyed=false,mapFailures=0,rangeFailures=0,mapCalls=0,rangeCalls=0,onMap;
 const device={limits:{maxBufferSize:2**30,maxStorageBufferBindingSize:2**30,maxComputeWorkgroupsPerDimension:65535},lost:new Promise(()=>{}),
  queue:{writeBuffer(buffer,at,data){new Uint8Array(buffer.data,at,data.byteLength).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));},submit(commands){submissions++;for(const commandsOfBatch of commands)for(const execute of commandsOfBatch)execute();},async onSubmittedWorkDone(){}},
  createBuffer({size,usage}){const buffer={size,usage,data:new ArrayBuffer(size),mapState:'unmapped',destroyed:false,unmaps:0,async mapAsync(){mapCalls++;if(mapFailures-->0)throw new RangeError('Array buffer allocation failed');this.mapState='mapped';await onMap?.();},getMappedRange(){rangeCalls++;if(rangeFailures-->0)throw new RangeError('Array buffer allocation failed');assert.equal(this.mapState,'mapped');return this.data;},unmap(){if(this.mapState==='mapped'){this.unmaps++;this.mapState='unmapped';structuredClone(this.data,{transfer:[this.data]});}},destroy(){if(this.destroyed)return;this.unmap();this.destroyed=true;}};buffers.push(buffer);return buffer;},
  createShaderModule(){return{async getCompilationInfo(){return{messages:[]};}};},async createComputePipelineAsync(){return{getBindGroupLayout(){return{};}};},createBindGroup(value){return value;},
  createCommandEncoder(){const commands=[];return{beginComputePass(){let bindings;return{setPipeline(){},setBindGroup(_index,value){bindings=value.entries.map(entry=>entry.resource.buffer);},dispatchWorkgroups(){commands.push(()=>{const output=new Float32Array(bindings[3].data),input=new Float32Array(bindings[0].data);for(let i=0;i<output.length;i++)output[i]=input[i%input.length];});},end(){}};},copyBufferToBuffer(source,sourceAt,target,targetAt,bytes){commands.push(()=>new Uint8Array(target.data,targetAt,bytes).set(new Uint8Array(source.data,sourceAt,bytes)));},finish(){return commands;}};},
  pushErrorScope(){},async popErrorScope(){return null;},destroy(){destroyed=true;for(const buffer of buffers)buffer.destroy();}
 };
 define(globalThis.navigator,'gpu',{async requestAdapter(){return{limits:device.limits,async requestDevice(){return device;}};}});
 return{buffers,get submissions(){return submissions;},get destroyed(){return destroyed;},get mapCalls(){return mapCalls;},get rangeCalls(){return rangeCalls;},failMapping(){mapFailures=1;rangeFailures=1;},afterMapping(fn){onMap=fn;}};
}
const input=()=>({input:Float32Array.of(1,2,3,4),weights:Float32Array.of(1),bias:Float32Array.of(0),channels:1,height:2,width:2,outChannels:1,kernel:1});

for(const [name,create]of [['general',createConvolutionGeneralGpu],['ordered',createConvolutionGpu]])test(`${name} GPU convolution admits its entire useful peak before splitting ownership`,async t=>{
 const env=environment(t),peak=2*MiB+2*(16+4+4)+3*16+2048,limited=new Budget(peak-1),requests=[],reserve=limited.reserve.bind(limited);
 limited.reserve=bytes=>{if(bytes)requests.push(bytes);return reserve(bytes);};
 const rejected=await create({budget:limited});await assert.rejects(rejected.run(input()),{code:'MEMORY_LIMIT'});
 assert.deepEqual(requests,[peak]);assert.equal(limited.total(),0);assert.equal(env.buffers.length,0);assert.equal(env.submissions,0);assert.equal(getExecutionScheduler(limited).snapshot().running,0);rejected.dispose();
 const budget=new Budget(peak),gpu=await create({budget}),first=await gpu.run(input());
 assert.deepEqual([...first.data],[1,2,3,4]);assert.equal(budget.total(),2*MiB+(name==='general'?32:16));first.release();
 const second=await gpu.run(input());assert.deepEqual([...second.data],[1,2,3,4]);second.release();gpu.dispose();assert.equal(budget.total(),0);
});

test('mapped GPU output survives engine disposal without a copied backing and releases idempotently',async t=>{
 const env=environment(t),budget=new Budget(32*MiB),gpu=await createConvolutionGeneralGpu({budget}),value=input(),retired=[];budget.notifyBackingRelease=(kind,bytes)=>retired.push({kind,bytes});
 t.mock.method(Float32Array.prototype,'slice',()=>{throw new RangeError('Array buffer allocation failed');});
 const result=await gpu.run(value),readback=env.buffers.find(buffer=>buffer.usage&GPUBufferUsage.MAP_READ);
 assert.equal(result.data.buffer,readback.data);assert.deepEqual([...result.data],[1,2,3,4]);assert.equal(env.buffers.filter(buffer=>!buffer.destroyed).length,1);assert.equal(readback.mapState,'mapped');assert.equal(getExecutionScheduler(budget).snapshot().running,0);assert.equal(budget.total(),2*MiB+2*result.data.byteLength);
 gpu.dispose();assert.equal(env.destroyed,false);assert.deepEqual([...result.data],[1,2,3,4]);assert.equal(budget.total(),32);
 result.release();result.release();gpu.dispose();assert.equal(readback.unmaps,1);assert.equal(result.data.byteLength,0);assert.equal(env.destroyed,true);assert.equal(budget.total(),0);assert.deepEqual(retired.at(-1),{kind:'gpu',bytes:16});assert.ok(retired.every(event=>event.kind==='gpu'));
});

test('one owned GPU output feeds another convolution and device lifetime covers every outstanding result',async t=>{
 const env=environment(t),budget=new Budget(32*MiB),gpu=await createConvolutionGeneralGpu({budget}),first=await gpu.run(input()),second=await gpu.run({...input(),input:first.data});
 assert.deepEqual([...second.data],[1,2,3,4]);gpu.dispose();first.release();assert.equal(env.destroyed,false);assert.equal(second.data.byteLength,16);second.release();assert.equal(env.destroyed,true);assert.equal(budget.total(),0);
});

test('mapping and range recovery preserve the completed dispatch and release its transient resources before reclaim',async t=>{
 const env=environment(t),budget=new Budget(32*MiB),events=[],operation=createD2prlRecovery({budget,onRecovery:event=>events.push(event),reclaim:async()=>{assert.equal(env.buffers.filter(buffer=>!buffer.destroyed).length,1);assert.equal(getExecutionScheduler(budget).snapshot().running,0);assert.equal(budget.total(),2*MiB+32);return 16;}}),gpu=await createConvolutionGeneralGpu({budget,operation});
 env.failMapping();const result=await gpu.run(input());assert.equal(env.submissions,1);assert.equal(env.mapCalls,2);assert.equal(env.rangeCalls,2);assert.equal(events.length,2);assert.deepEqual(events.map(event=>event.error.details.requestedBytes),[16,16]);assert.deepEqual([...result.data],[1,2,3,4]);assert.equal(budget.recovering,false);result.release();gpu.dispose();assert.equal(budget.total(),0);
});

test('cancellation after mapping frees unpublished output and does not keep a device lease',async t=>{
 const env=environment(t),budget=new Budget(32*MiB),gpu=await createConvolutionGeneralGpu({budget}),controller=new AbortController();env.afterMapping(()=>controller.abort());
 await assert.rejects(gpu.run(input(),{signal:controller.signal}),{code:'CANCELLED'});assert.equal(env.buffers.filter(buffer=>!buffer.destroyed).length,0);assert.equal(getExecutionScheduler(budget).snapshot().running,0);gpu.dispose();assert.equal(budget.total(),0);assert.equal(env.destroyed,true);
});

for(const cancelled of [false,true])test(`pending GPU readback stays visible until ${cancelled?'cancelled mapping settles':'its useful mapping completes'}`,async t=>{
 const env=environment(t),budget=new Budget(32*MiB),controller=new AbortController(),operation=createD2prlRecovery({budget,signal:controller.signal}),gpu=await createConvolutionGeneralGpu({budget,operation});let enter,finish,result;
 const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>finish=resolve);env.afterMapping(()=>{enter();return gate;});const pending=gpu.run(input(),{signal:controller.signal});
 try{await entered;const live=budget.resourceProgressSnapshot('peer','gpu');assert.ok(live.operations.some(value=>value.id==='convolution:readback-map'&&value.owner==='d2prl'&&value.state==='io'));assert.ok(live.independentProducers>0);assert.equal(getExecutionScheduler(budget).snapshot().running,0);if(cancelled){controller.abort();const rejected=assert.rejects(pending,{code:'CANCELLED'});assert.equal(env.buffers.filter(buffer=>!buffer.destroyed).length,1);finish();await rejected;}else{finish();result=await pending;assert.deepEqual([...result.data],[1,2,3,4]);}assert.equal(budget.resources.operations.size,0);assert.equal(budget.recovering,false);}finally{finish();await pending.catch(()=>{});result?.release();gpu.dispose();}assert.equal(budget.total(),0);
});
