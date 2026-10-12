import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import evaluatorFactory from '../vendor/d2prl/evaluator-tiled.js';
import {createEvaluatorPool} from '../experiments/d2prl/evaluator-pool.js';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
const MiB=1024**2,n=448**2,workerUrl=new URL('../experiments/d2prl/evaluator-worker.js',import.meta.url).href;
const variants=[['vendor-CHW','../vendor/d2prl/evaluator-tiled.js','CHW-uint16'],['HWC','../.build/evaluator-cache-original/pixel-major-combined.js','HWC-uint16'],['SIMD-control','../.build/evaluator-bilinear-simd/hwc-control.js','HWC-uint16'],['SIMD-scalar','../.build/evaluator-bilinear-simd/bilinear-simd4-scalar.js','HWC-uint16'],['SIMD-normal','../.build/evaluator-bilinear-simd/bilinear-simd4-normal.js','HWC-uint16'],['table','../.build/evaluator-half-table/half-table.js','HWC-uint16'],['table-SIMD-scalar','../.build/evaluator-table-simd/table-simd4-scalar.js','HWC-uint16'],['table-SIMD-normal','../.build/evaluator-table-simd/table-simd4-normal.js','HWC-uint16']];
variants.push(['table-SIMD-exact-subnormal','../.build/evaluator-table-simd-subnormal/table-simd4-exact-subnormal.js','HWC-uint16']);
const byteView=value=>new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
const banks=new Map();function bank(channels){let value=banks.get(channels);if(!value){value=new Uint16Array(channels*n);banks.set(channels,value);}return value;}
function realWorker(nativeUrl){const pending=new Map(),allocations=[],frees=[];let serial=0;
 const instrumented='data:text/javascript,'+encodeURIComponent(`import factory from ${JSON.stringify(nativeUrl)};export default async function(){const module=await factory(),malloc=module._malloc,free=module._free;module._malloc=bytes=>{const pointer=malloc(bytes);self.postMessage({testAllocation:{bytes,pointer}});return pointer;};module._free=pointer=>{self.postMessage({testFree:pointer});return free(pointer);};return module;}`);
 const worker=new Worker(new URL('./helpers/browser-module-worker.mjs',import.meta.url),{workerData:{module:workerUrl}});
 worker.on('message',value=>{if(value.testAllocation)allocations.push(value.testAllocation);else if(value.testFree!==undefined)frees.push(value.testFree);else{const resolve=pending.get(value.id);assert.ok(resolve);pending.delete(value.id);resolve(value);}});
 return{instrumented,allocations,frees,call(message){return new Promise(resolve=>{const id=++serial;pending.set(id,resolve);worker.postMessage({...message,id});});},close:()=>worker.terminate()};
}
function coordinates(){return{x:Float32Array.from({length:13*4},(_,at)=>(Math.floor(at/4)-6)/16+(at%4)/64),y:Float32Array.from({length:13*4},(_,at)=>(6-Math.floor(at/4))/32-(at%4)/128)};}
function oracle(module,channels,begin){const pointers=[],allocate=bytes=>{const p=module._malloc(bytes);assert.ok(p);pointers.push(p);return p;};try{const {x,y}=coordinates(),f=allocate(bank(channels).byteLength),xp=allocate(x.byteLength),yp=allocate(y.byteLength),out=allocate(32);module.HEAPU8.set(byteView(bank(channels)),f);module.HEAPF32.set(x,xp/4);module.HEAPF32.set(y,yp/4);assert.equal(module._d2prl_evaluate_tile(f,xp,yp,448,channels,13,begin,begin+4,out,out+16,3),1);return{x:module.HEAPU8.slice(out,out+16),y:module.HEAPU8.slice(out+16,out+32)};}finally{for(const p of pointers)module._free(p);}}

test('complete448 descriptor banks, both allocation orders and native tail coordinates fit64MiB without evaluation malloc',{timeout:20000},async t=>{
 const module=await evaluatorFactory(),expected=new Map(),ranges=[0,66900,n-4],records=[];
 for(const channels of [36,96])for(const begin of ranges)expected.set(channels+':'+begin,oracle(module,channels,begin));
 for(const [name,relative,layout]of variants){const url=new URL(relative,import.meta.url);if(!existsSync(fileURLToPath(url))){t.diagnostic('Experimental build unavailable; not qualified here: '+name);continue;}
  for(const order of [[36,96],[96,36]]){const worker=realWorker(url.href);let peakHeap=0,peakAbi=0;
   try{const init=await worker.call({type:'init',moduleUrl:worker.instrumented,heapLimit:64*MiB,abiLimit:MiB,tileSize:4096,kernelTileSize:512,side:448,descriptorLayout:layout});assert.equal(init.ok,true);assert.equal(init.heapBytes,16*MiB);
    for(const [index,channels]of [...order,...order].entries()){const reply=await worker.call({type:'features',key:index+1,channels,side:448,values:bank(channels)});assert.equal(reply.ok,true,JSON.stringify(reply.error));assert.ok(reply.heapBytes<=64*MiB);assert.ok(reply.abiBytes<=MiB);peakHeap=Math.max(peakHeap,reply.heapBytes);peakAbi=Math.max(peakAbi,reply.abiBytes);}
    assert.equal(worker.allocations.length,5,'Three kernel buffers and two persistent channel slots only');assert.equal(worker.frees.length,0);
    for(const [index,channels]of order.entries())for(const begin of ranges){const {x,y}=coordinates(),reply=await worker.call({type:'evaluate',key:index+3,side:448,channels,candidates:13,begin,end:begin+4,x,y,referenceThreads:3});assert.equal(reply.ok,true);for(const axis of ['x','y'])assert.deepEqual(byteView(reply[axis]),expected.get(channels+':'+begin)[axis],name+'/'+order+'/'+channels+'/'+begin+'/'+axis);assert.ok(reply.heapBytes<=64*MiB);}
    assert.equal(worker.allocations.length,5,'Every native evaluation branch remains allocation-free');assert.equal(worker.frees.length,0);records.push({name,order,peakHeap,peakAbi});
   }finally{await worker.close();}
  }
 }
 assert.ok(records.some(row=>row.name==='vendor-CHW'));t.diagnostic(JSON.stringify({actualNativeVariants:records.length/2,orders:records.length,descriptorPayloadBytes:264*n,kernelBufferBytes:28*512*4,capBytes:64*MiB,records}));
});

// Policy/reclaimer fixtures below are simulated ownership; no fake cache bytes
// are claimed as physical RAM. The preceding test uses actual native modules.
function workers(){const created=[];return{created,factory(){const worker={closed:false,terminate(){this.closed=true;},postMessage(message){queueMicrotask(()=>{if(this.closed)return;const reply={id:message.id,ok:true,heapBytes:16*MiB};if(message.type==='evaluate'){reply.x=message.x.slice(0,message.end-message.begin);reply.y=message.y.slice(0,message.end-message.begin);}this.onmessage?.({data:reply});});}};created.push(worker);return worker;}};}
const input=()=>({features:new Uint16Array(36*64),offsetX:Float32Array.from({length:64},(_,i)=>i/4),offsetY:Float32Array.from({length:64},(_,i)=>-i/8),side:8,channels:36,candidates:1});
function idleCache(budget,onReclaim){let hold=budget.reserve(40*MiB),calls=0;const clear=()=>{hold?.();hold=null;},unregister=budget.registerAsyncReclaimer(async request=>{calls++;await onReclaim?.(request);clear();},{owner:'d2prl',label:'synthetic-idle-parameters',allocationKind:'wasm'});return{get calls(){return calls;},dispose(){unregister();clear();}};}

test('windowed external448 banks retain one fixed73.4375MiB policy envelope while legacy full clones retain102.1875MiB',async()=>{
 for(const descriptorTransport of ['windowed','legacy-auto']){const budget=new Budget(160*MiB),factory=workers(),messages=[],pool=await createEvaluatorPool('unused',{budget,maxWorkers:1,descriptorTransport,workerFactory:()=>{const worker=factory.factory(),post=worker.postMessage;worker.postMessage=function(message){messages.push({type:message.type,bytes:message.chunks?.reduce((sum,chunk)=>sum+chunk.value.byteLength,0),chunks:message.chunks?.map(chunk=>chunk.value.byteLength)});return post.call(this,message);};return worker;}});
  try{for(const channels of [36,96]){const source={features:bank(channels),offsetX:new Float32Array(n),offsetY:new Float32Array(n),side:448,channels,candidates:1},result=await pool.evaluate(source);assert.deepEqual(result.x,source.offsetX);assert.equal(source.features.byteLength,channels*n*2,'The external source was never transferred');assert.equal(pool.stats.perWorkerPolicyBytes,(descriptorTransport==='windowed'?73.4375:102.1875)*MiB);assert.equal(pool.stats.descriptorUploadLimitBytes,descriptorTransport==='windowed'?8*MiB:192*n);}
   assert.equal(messages.some(message=>message.type==='features'),descriptorTransport==='legacy-auto');if(descriptorTransport==='windowed'){const uploads=messages.filter(message=>message.type==='features-chunks');assert.ok(uploads.length>=7);assert.ok(uploads.every(message=>message.bytes<=8*MiB&&message.chunks.every(bytes=>bytes<=MiB)));assert.ok(pool.stats.peakTransportBytes<=8*MiB+28*4096*4);}
  }finally{pool.dispose();}assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);assert.ok(factory.created.every(worker=>worker.closed));
 }
});

test('a refused useful optional reservation reclaims idle policy with no CPU hold or physical-refusal claim',async()=>{
 const budget=new Budget(96*MiB),factory=workers(),cache=idleCache(budget,()=>{assert.equal(budget.recovering,true);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);}),pool=await createEvaluatorPool('unused',{budget,maxWorkers:2,tileSize:4,workerFactory:()=>factory.factory()});
 try{const source=input(),result=await pool.evaluate(source);assert.deepEqual(result.x,source.offsetX);assert.equal(pool.stats.activeWorkers,2);assert.equal(pool.stats.optionalPolicyReclaims,1);assert.equal(pool.stats.optionalPolicyReclaimedBytes,40*MiB);assert.equal(cache.calls,1);assert.equal(budget.lastAllocationReclaim,null);assert.equal(budget.recovering,false);}finally{pool.dispose();cache.dispose();}assert.equal(budget.total(),0);assert.ok(factory.created.every(worker=>worker.closed));assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('available-only optional policy preserves an idle cache and proceeds with the fitting useful worker',async()=>{
 const budget=new Budget(96*MiB),factory=workers(),cache=idleCache(budget),pool=await createEvaluatorPool('unused',{budget,maxWorkers:2,tileSize:4,optionalMemory:'available-only',workerFactory:()=>factory.factory()});
 try{const source=input(),result=await pool.evaluate(source);assert.deepEqual(result.y,source.offsetY);assert.equal(pool.stats.activeWorkers,1);assert.equal(cache.calls,0);}finally{pool.dispose();cache.dispose();}assert.equal(budget.total(),0);
});

test('an independent productive peer prevents optional cache reclaim or waiting while useful work proceeds',async()=>{
 const budget=new Budget(96*MiB),factory=workers(),cache=idleCache(budget),peer=budget.beginOperation({owner:'another-detector',id:'real-admission-fixture'});peer.setState('compute');const pool=await createEvaluatorPool('unused',{budget,maxWorkers:2,tileSize:4,workerFactory:()=>factory.factory()});
 try{const source=input(),result=await pool.evaluate(source);assert.deepEqual(result.x,source.offsetX);assert.equal(pool.stats.activeWorkers,1);assert.equal(pool.stats.optionalPeerDeferrals,1);assert.equal(cache.calls,0);assert.equal(budget.recovering,false);assert.equal(budget.resourceSnapshot().pressures.length,0);peer.release();const next=await pool.evaluate(source);assert.deepEqual(next.x,source.offsetX);assert.equal(pool.stats.activeWorkers,2,'The completed peer must not permanently block useful future capacity');assert.equal(cache.calls,1);}finally{pool.dispose();peer.release();cache.dispose();}assert.equal(budget.total(),0);
});

test('cancellation during optional policy reclaim drains pressure, CPU and useful worker ownership',async()=>{
 const budget=new Budget(96*MiB),factory=workers(),controller=new AbortController(),cache=idleCache(budget,()=>controller.abort()),pool=await createEvaluatorPool('unused',{budget,maxWorkers:2,tileSize:4,workerFactory:()=>factory.factory()});
 try{await assert.rejects(pool.evaluate(input(),{signal:controller.signal}),{code:'CANCELLED'});assert.equal(cache.calls,1);assert.equal(budget.recovering,false);assert.equal(budget.resourceSnapshot().pressures.length,0);assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);assert.ok(factory.created.every(worker=>worker.closed));}finally{pool.dispose();cache.dispose();}assert.equal(budget.total(),0);
});

test('an explicitly injected unsupported native ABI is rejected before any kernel or descriptor publication',async()=>{
 const fake='data:text/javascript,'+encodeURIComponent('export default async function(){const HEAPU8=new Uint8Array(16*1024**2);return{HEAPU8,HEAPF32:new Float32Array(HEAPU8.buffer),_malloc:()=>1024**2+16,_free:()=>{}};}'),worker=realWorker(fake);
 try{const result=await worker.call({type:'init',moduleUrl:worker.instrumented,heapLimit:64*MiB,abiLimit:MiB,tileSize:4096,kernelTileSize:512,side:448,descriptorLayout:'CHW-uint16'});assert.equal(result.ok,false);assert.equal(result.error.code,'MODEL_IDENTITY');assert.equal(result.descriptorBytes,0);assert.equal(worker.allocations.length,1);assert.equal(worker.frees.length,1);}finally{await worker.close();}
});
