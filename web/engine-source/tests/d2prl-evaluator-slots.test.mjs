import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import evaluatorFactory from '../vendor/d2prl/evaluator-tiled.js';
import {createEvaluatorPool} from '../experiments/d2prl/evaluator-pool.js';
import {publishD2prlDescriptor} from '../experiments/d2prl/descriptor-ownership.js';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';

const MiB=1024**2,PAGE=16*MiB;
const moduleUrl=new URL('../vendor/d2prl/evaluator-tiled.js',import.meta.url).href;
// Generated experimental build only. Its compiler/pinned-byte prerequisite is
// owned by the build/parity recipe; this never activates the public runtime.
const hwcModuleUrl=new URL('../.build/evaluator-cache-original/pixel-major-combined.js',import.meta.url).href;
const hasHwcBuild=existsSync(fileURLToPath(hwcModuleUrl));
const workerUrl=new URL('../experiments/d2prl/evaluator-worker.js',import.meta.url).href;
const bytes=view=>new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
const heapLimit=(side,kernelTileSize=512)=>Math.max(2*PAGE,Math.ceil((264*side**2+28*kernelTileSize*4+MiB)/PAGE)*PAGE);

function field(side,channels,seed=1,candidates=5){
 const n=side**2,half=[0,0x8000,1,0x3ff,0x400,0x3555,0x3800,0x3c00,0xbc00,0xb555,0x4200];
 const features=Uint16Array.from({length:channels*n},(_,i)=>half[(Math.imul(i+seed,1103515245)>>>16)%half.length]);
 const offsetX=new Float32Array(candidates*n),offsetY=new Float32Array(candidates*n);
 for(let k=0;k<candidates;k++)for(let i=0;i<n;i++){const at=k*n+i;offsetX[at]=Math.fround(((Math.imul(at+seed,1664525)>>>0)%(17*(side+2)))/17-1-i%side);offsetY[at]=Math.fround(((Math.imul(at+seed,22695477)>>>0)%(13*(side+2)))/13-1-Math.floor(i/side));}
 return{features,offsetX,offsetY,side,channels,candidates,referenceThreads:8};
}

// A real pinned WASM oracle, with no worker transport or replacement arithmetic.
function direct(module,input){
 const n=input.side**2,pointers=[];
 const allocate=size=>{const p=module._malloc(size);assert.ok(p);pointers.push(p);return p;};
 try{
  const fp=allocate(input.features.byteLength),xp=allocate(input.offsetX.byteLength),yp=allocate(input.offsetY.byteLength),out=allocate(8*n);
  module.HEAPU8.set(bytes(input.features),fp);module.HEAPF32.set(input.offsetX,xp/4);module.HEAPF32.set(input.offsetY,yp/4);
  assert.equal(module._d2prl_evaluate_tile(fp,xp,yp,input.side,input.channels,input.candidates,0,n,out,out+4*n,input.referenceThreads),1);
  return{x:module.HEAPF32.slice(out/4,out/4+n),y:module.HEAPF32.slice(out/4+n,out/4+2*n)};
 }finally{for(const p of pointers)module._free(p);}
}

function instrumentedModule(nativeModuleUrl=moduleUrl){return'data:text/javascript,'+encodeURIComponent(`
 import {workerData} from 'node:worker_threads';
 import factory from ${JSON.stringify(nativeModuleUrl)};
 export default async function(){
  const module=await factory(),malloc=module._malloc,free=module._free;let refused=false;
  module._malloc=bytes=>{if(!refused&&bytes===workerData.refuseBytes){refused=true;self.postMessage({testAllocation:{bytes,pointer:0}});return 0;}const pointer=malloc(bytes);self.postMessage({testAllocation:{bytes,pointer}});return pointer;};
  module._free=pointer=>{self.postMessage({testFree:pointer});return free(pointer);};return module;
 }
 `);}

function realWorker({refuseBytes,onReply}={}){
 const allocations=[],frees=[],closing=[];
 const worker=new Worker(new URL('./helpers/browser-module-worker.mjs',import.meta.url),{workerData:{module:workerUrl,refuseBytes}});
 const adapter={postMessage:(data,transfer)=>worker.postMessage(data,transfer),terminate:()=>closing.push(worker.terminate())};
 worker.on('message',data=>{if(data.testAllocation)allocations.push(data.testAllocation);else if(data.testFree!==undefined)frees.push(data.testFree);else{onReply?.(data);adapter.onmessage?.({data});}});
 worker.on('messageerror',()=>adapter.onmessageerror?.({}));worker.on('error',error=>adapter.onerror?.({message:error.message}));
 return{adapter,allocations,frees,async close(){adapter.terminate();await Promise.all(closing);},async closed(){await Promise.all(closing);}};
}

function rpcWorker(options){
 const pending=new Map();let sequence=0;
 const value=realWorker({...options,onReply:data=>{const resolve=pending.get(data.id);assert.ok(resolve,'Expected response ID');pending.delete(data.id);resolve(data);}});
 return{...value,call(message){return new Promise(resolve=>{const id=++sequence;pending.set(id,resolve);value.adapter.postMessage({...message,id});});}};
}

const exact=(actual,expected)=>{for(const axis of ['x','y'])assert.deepEqual(bytes(actual[axis]),bytes(expected[axis]),axis+' native bits');};

for(const descriptorTransport of ['windowed','legacy-auto'])test(`${descriptorTransport} dedicated channel slots reuse pointers and preserve exact native outputs while replacing either channel`,{timeout:15000},async()=>{
 const side=17,n=side**2,budget=new Budget(256*MiB),module=await evaluatorFactory(),messages=[],worker=realWorker();
 const originals=[field(side,96,1),field(side,36,2),field(side,36,3),field(side,36,4)],revokes=originals.map(input=>publishD2prlDescriptor(input.features));
 // A nonzero view extent also exercises the streamed upload path.
 const backing=new Uint16Array(originals[2].features.length+8);backing.set(originals[2].features,4);revokes[2]();originals[2].features=backing.subarray(4,backing.length-4);revokes[2]=publishD2prlDescriptor(originals[2].features);
 const post=worker.adapter.postMessage;worker.adapter.postMessage=(message,transfer)=>{messages.push({type:message.type,channels:message.channels,side:message.side});post(message,transfer);};
 const pool=await createEvaluatorPool(instrumentedModule(),{budget,maxWorkers:1,tileSize:4096,descriptorTransport,workerFactory:()=>worker.adapter});
 try{
  for(const input of [...originals,originals[0],originals[1]])exact(await pool.evaluate(input),direct(module,input));
  assert.equal(pool.stats.descriptorUploads,5,'Replacing 36 must leave the first 96 key uploaded');
  for(const channels of [36,96])assert.equal(worker.allocations.filter(value=>value.bytes===2*channels*n&&value.pointer).length,1,'One native extent per channel');
  assert.equal(worker.frees.length,0,'No published or reusable slot is freed while the worker lives');
  assert.equal(pool.stats.descriptorBytes,264*n);assert.equal(pool.stats.peakDescriptorBytes,264*n);assert.equal(pool.stats.descriptorSlotCapacityBytes,264*n);
  const domain=budget.resourceSnapshot().domains.wasm;assert.equal(domain.backings,1);assert.equal(domain.materializedBytes,pool.stats.wasmBytes);
  assert.ok(messages.some(message=>message.type==='features-begin'&&message.channels===36));
  assert.equal(messages.some(message=>message.type==='features'),descriptorTransport==='legacy-auto');
  assert.ok(messages.filter(message=>['features','features-begin'].includes(message.type)).every(message=>message.side===side&&[36,96].includes(message.channels)));
 }finally{for(const revoke of revokes)revoke();pool.dispose();await worker.closed();}
 assert.equal(budget.total(),0);assert.equal(pool.stats.descriptorBytes,0);assert.equal(pool.stats.wasmBytes,0);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);
});

test('partial or invalid upload never publishes a candidate key or damages the other channel',{timeout:15000},async()=>{
 const side=8,n=side**2,worker=rpcWorker(),module=await evaluatorFactory(),cnn=field(side,96,1),zm=field(side,36,2),replacement=field(side,36,3);
 const evaluate=key=>worker.call({type:'evaluate',key,side,channels:key===1?96:36,candidates:5,begin:0,end:n,x:(key===1?cnn:replacement).offsetX,y:(key===1?cnn:replacement).offsetY,referenceThreads:8});
 try{
  assert.equal((await worker.call({type:'init',moduleUrl:instrumentedModule(),heapLimit:heapLimit(side,64),tileSize:64,kernelTileSize:64,side})).ok,true);
  for(const [key,input]of [[1,cnn],[2,zm]])assert.equal((await worker.call({type:'features',key,channels:input.channels,side,values:input.features})).ok,true);
  assert.equal((await worker.call({type:'features-begin',key:3,channels:36,side,bytes:replacement.features.byteLength})).ok,true);
  assert.equal((await worker.call({type:'features-chunks',key:3,chunks:[{at:0,value:bytes(replacement.features).slice(0,16)}]})).ok,true);
  const incomplete=await worker.call({type:'features-end',key:3});assert.equal(incomplete.ok,false);assert.equal(incomplete.error.code,'INVALID_INPUT');
  assert.equal((await evaluate(3)).ok,false,'Partial new key is uncommitted');assert.equal((await evaluate(2)).ok,false,'Overwritten old key is revoked');
  exact(await evaluate(1),direct(module,cnn));
  for(const metadata of [{side:side+1,channels:36,bytes:replacement.features.byteLength},{side,channels:37,bytes:replacement.features.byteLength},{side,channels:36,bytes:replacement.features.byteLength-2}]){const failed=await worker.call({type:'features-begin',key:4,...metadata});assert.equal(failed.ok,false);assert.equal(failed.error.code,'INVALID_INPUT');exact(await evaluate(1),direct(module,cnn));}
  assert.equal((await worker.call({type:'features-begin',key:4,channels:36,side,bytes:replacement.features.byteLength})).ok,true);
  assert.equal((await worker.call({type:'features-chunks',key:4,chunks:[{at:0,value:bytes(replacement.features).slice(0,16)},{at:16,value:bytes(replacement.features).slice(16)}]})).ok,true);
  assert.equal((await worker.call({type:'features-end',key:4})).ok,true);exact(await evaluate(4),direct(module,replacement));
  assert.equal(worker.allocations.filter(value=>value.bytes===72*n).length,1);assert.equal(worker.allocations.filter(value=>value.bytes===192*n).length,1);assert.equal(worker.frees.length,0);
 }finally{await worker.close();}
});

test('injected native slot allocation refusal preserves an already committed other channel',{timeout:15000},async()=>{
 const side=8,n=side**2,worker=rpcWorker({refuseBytes:72*n}),cnn=field(side,96),module=await evaluatorFactory();
 try{
  assert.equal((await worker.call({type:'init',moduleUrl:instrumentedModule(),heapLimit:heapLimit(side,64),tileSize:64,kernelTileSize:64,side})).ok,true);
  assert.equal((await worker.call({type:'features',key:1,channels:96,side,values:cnn.features})).ok,true);
  const failed=await worker.call({type:'features-begin',key:2,channels:36,side,bytes:72*n});assert.equal(failed.ok,false);assert.equal(failed.error.code,'MEMORY_ALLOCATION');assert.equal(failed.descriptorBytes,192*n);
  exact(await worker.call({type:'evaluate',key:1,side,channels:96,candidates:5,begin:0,end:n,x:cnn.offsetX,y:cnn.offsetY,referenceThreads:8}),direct(module,cnn));
  assert.equal(worker.frees.length,0);assert.equal((await worker.call({type:'features-begin',key:3,channels:36,side,bytes:72*n})).ok,true);
 }finally{await worker.close();}
});

test('both maximum-side native descriptor extents fit the reduced real heap cap',{timeout:15000},async()=>{
 const side=448,n=side**2,worker=rpcWorker(),limit=heapLimit(side);assert.equal(limit,64*MiB);
 try{
  assert.equal((await worker.call({type:'init',moduleUrl:instrumentedModule(),heapLimit:limit,tileSize:4096,kernelTileSize:512,side})).ok,true);
  for(const [key,channels]of [[1,96],[2,36],[3,36]]){
   const reply=await worker.call({type:'features',key,channels,side,values:new Uint16Array(channels*n)});assert.equal(reply.ok,true);assert.ok(reply.heapBytes<=limit);assert.equal(reply.descriptorBytes,key===1?192*n:264*n);
  }
  assert.equal(worker.allocations.filter(value=>value.bytes===72*n).length,1);assert.equal(worker.allocations.filter(value=>value.bytes===192*n).length,1);assert.equal(worker.frees.length,0);
  // Four useful pixels only: this validates an existing committed CNN slot
  // after ZM replacement without running a full-field benchmark or model.
  const x=Float32Array.of(0,.25,.5,.75),y=Float32Array.of(0,-.125,-.25,-.375);
  const result=await worker.call({type:'evaluate',key:1,side,channels:96,candidates:1,begin:n-4,end:n,x,y,referenceThreads:8});assert.equal(result.ok,true);
  // The last global pixel is at the right border: the qualified native output
  // clamps its positive X displacement to zero even for one candidate.
  exact(result,{x:Float32Array.of(0,.25,.5,0),y});
 }finally{await worker.close();}
});

test('layout metadata rejects a mismatched native module before any descriptor allocation',{timeout:15000},async()=>{
 const variants=[[moduleUrl,'HWC-uint16'],...(hasHwcBuild?[[hwcModuleUrl,'CHW-uint16']]:[])];
 for(const [nativeModuleUrl,descriptorLayout]of variants){const worker=rpcWorker();
  try{const reply=await worker.call({type:'init',moduleUrl:instrumentedModule(nativeModuleUrl),heapLimit:heapLimit(8,64),tileSize:64,kernelTileSize:64,side:8,descriptorLayout});assert.equal(reply.ok,false);assert.equal(reply.error.code,'INVALID_INPUT');assert.equal(reply.descriptorBytes,0);assert.equal(worker.allocations.length,0);}finally{await worker.close();}
 }
});

test('experimental native HWC worker uploads preserve every original output bit across native tails and subviews',{timeout:20000,skip:!hasHwcBuild&&'Requires separately compiled and byte-qualified experimental HWC build'},async()=>{
 const module=await evaluatorFactory();let cases=0;
 for(const side of [8,17,65]){
  const budget=new Budget(256*MiB),worker=realWorker(),pool=await createEvaluatorPool(instrumentedModule(hwcModuleUrl),{budget,maxWorkers:1,tileSize:4096,descriptorLayout:'HWC-uint16',workerFactory:()=>worker.adapter});
  try{
   for(const channels of [36,96])for(const candidates of [5,13]){
    const input=field(side,channels,candidates,candidates),backing=new Uint16Array(input.features.length+8);backing.set(input.features,4);input.features=backing.subarray(4,backing.length-4);
    const before=bytes(input.features).slice(),revoke=publishD2prlDescriptor(input.features);
    try{exact(await pool.evaluate(input),direct(module,input));assert.deepEqual(bytes(input.features),before);cases++;}finally{revoke();}
   }
   assert.equal(pool.stats.descriptorLayout,'HWC-uint16');assert.equal(pool.stats.descriptorBytes,264*side**2);assert.equal(worker.frees.length,0);
  }finally{pool.dispose();await worker.closed();}
  assert.equal(budget.total(),0);assert.equal(pool.stats.descriptorBytes,0);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);
 }
 assert.equal(cases,12);
});

test('experimental HWC raw-bit chunk permutation handles channel seams, rejects odd extents, and commits atomically',{timeout:15000,skip:!hasHwcBuild&&'Requires separately compiled and byte-qualified experimental HWC build'},async()=>{
 const side=17,n=side**2,worker=rpcWorker(),module=await evaluatorFactory(),cnn=field(side,96,2,13),zm=field(side,36,3,13);
 const evaluate=(key,input)=>worker.call({type:'evaluate',key,side,channels:input.channels,candidates:13,begin:0,end:n,x:input.offsetX,y:input.offsetY,referenceThreads:8});
 const upload=async(key,input)=>{
  assert.equal((await worker.call({type:'features-begin',key,channels:input.channels,side,bytes:input.features.byteLength})).ok,true);
  const source=bytes(input.features),ends=[2,2*n,2*(2*n+7),source.length];let at=0;
  for(const end of ends){assert.equal((await worker.call({type:'features-chunks',key,chunks:[{at,value:source.subarray(at,end)}]})).ok,true);at=end;}
  assert.equal((await worker.call({type:'features-end',key})).ok,true);
 };
 try{
  assert.equal((await worker.call({type:'init',moduleUrl:instrumentedModule(hwcModuleUrl),heapLimit:heapLimit(side,64),tileSize:4096,kernelTileSize:64,side,descriptorLayout:'HWC-uint16'})).ok,true);
  assert.equal((await worker.call({type:'features',key:1,channels:96,side,values:cnn.features})).ok,true);exact(await evaluate(1,cnn),direct(module,cnn));
  await upload(2,zm);exact(await evaluate(2,zm),direct(module,zm));
  assert.equal((await worker.call({type:'features-begin',key:3,channels:36,side,bytes:zm.features.byteLength})).ok,true);
  const odd=await worker.call({type:'features-chunks',key:3,chunks:[{at:0,value:new Uint8Array(1)}]});assert.equal(odd.ok,false);assert.equal(odd.error.code,'INVALID_INPUT');assert.equal((await worker.call({type:'features-end',key:3})).ok,false);
  assert.equal((await evaluate(2,zm)).ok,false);exact(await evaluate(1,cnn),direct(module,cnn));await upload(4,zm);exact(await evaluate(4,zm),direct(module,zm));
  for(const channels of [36,96])assert.equal(worker.allocations.filter(value=>value.bytes===2*channels*n).length,1);assert.equal(worker.frees.length,0);
 }finally{await worker.close();}
});
