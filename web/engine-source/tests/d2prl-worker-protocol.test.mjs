import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {createD2prlRecovery,recoverableStage} from '../experiments/d2prl/recovery.js';
import {createEvaluatorPool} from '../experiments/d2prl/evaluator-pool.js';
import {createConvolutionCpu} from '../experiments/d2prl/convolution-cpu.js';
import {createPostprocess} from '../experiments/d2prl/postprocess.js';
import {createSpatial} from '../experiments/d2prl/spatial.js';
import {createBoundedRoles} from '../experiments/d2prl/roles-bounded.js';
import {EngineError,serializeEngineError} from '../src/errors.js';
import {workerMessageFailure} from '../src/worker-message-protocol.js';

function recovery(budget,events=[],signal){return createD2prlRecovery({budget,signal,onRecovery:e=>events.push(e),reclaim(){assert.fail('Transport must not reclaim global memory');}});}
function idle(budget){assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);assert.equal(budget.total(),0);assert.equal(budget.recovering,false);}
function deliver(worker,kind,data){if(kind==='null')worker.onmessage?.({data:null});else if(kind==='messageerror')worker.onmessageerror?.({});else if(kind==='wrong-id')worker.onmessage?.({data:{...data,id:data.id+100}});else if(kind==='endpoint')worker.onmessage?.({data:{protocolFailure:true,ok:false,error:serializeEngineError(workerMessageFailure('fixture','message','null-data'))}});else worker.onmessage?.({data});}
function evaluatorWorkers(faults){const workers=[],attempts=new Map();return {workers,attempts,factory(){const index=workers.length,worker={closed:false,uploads:0,computes:0,terminate(){this.closed=true;},postMessage(m){queueMicrotask(()=>{if(this.closed)return;const data={id:m.id,ok:true};if(m.type==='features')this.uploads++;if(m.type==='evaluate'){this.computes++;attempts.set(m.begin,(attempts.get(m.begin)??0)+1);data.x=m.x.slice(0,m.end-m.begin);data.y=m.y.slice(0,m.end-m.begin);}deliver(this,faults?.(index,m,this),data);});}};workers.push(worker);return worker;}};}
const field=()=>({features:new Uint16Array(36*64),offsetX:Float32Array.from({length:64},(_,i)=>i/4),offsetY:Float32Array.from({length:64},(_,i)=>-i/8),side:8,channels:36,candidates:1});
for(const kind of ['null','messageerror','endpoint','wrong-id'])test(`evaluator ${kind} retires only its worker and resumes the same tile`,async()=>{
 const budget=new Budget(256*1024**2),events=[],fixture=evaluatorWorkers((index,m,w)=>index===0&&m.type==='evaluate'&&w.computes===3?kind:null),pool=await createEvaluatorPool('unused',{budget,maxWorkers:2,tileSize:4,operation:recovery(budget,events),workerFactory:()=>fixture.factory()});
 try{const input=field(),result=await pool.evaluate(input);assert.deepEqual(result.x,input.offsetX);assert.deepEqual(result.y,input.offsetY);assert.equal(pool.stats.tiles,16);assert.equal(pool.stats.activeWorkers,2);assert.equal(pool.stats.peakWorkers,2);assert.equal(pool.stats.descriptorUploads,3);assert.equal(fixture.workers.length,3);assert.equal(fixture.workers[0].closed,true);assert.equal(fixture.workers[1].closed,false);assert.equal(fixture.workers[1].uploads,1);assert.equal([...fixture.attempts.values()].filter(n=>n===2).length,1);assert.equal([...fixture.attempts.values()].reduce((a,b)=>a+b,0),17);assert.equal(events.length,1);assert.equal(events[0].error.code,'WORKER_MESSAGE_FAILED');}finally{pool.dispose();}idle(budget);
});
test('five unreadable evaluator attempts stop locally with no orphaned scheduler lease',async()=>{
 const budget=new Budget(128*1024**2),events=[],fixture=evaluatorWorkers((_,m)=>m.type==='evaluate'?'null':null),pool=await createEvaluatorPool('unused',{budget,maxWorkers:1,tileSize:4,operation:recovery(budget,events),workerFactory:()=>fixture.factory()});
 try{await assert.rejects(pool.evaluate(field()),e=>e.code==='WORKER_MESSAGE_FAILED'&&e.details.recovery.loopDetected&&e.details.recovery.consecutiveFailures===5);assert.equal(fixture.workers.length,5);assert.equal(fixture.attempts.get(0),5);assert.ok(fixture.workers.every(w=>w.closed));assert.equal(events.filter(event=>event.phase==='resource-recovery').length,4);assert.equal(events.filter(event=>event.phase==='resource-terminal').length,1);}finally{pool.dispose();}idle(budget);
});
test('cancellation after unreadable evaluator data cannot recreate the failed worker',async()=>{
 const budget=new Budget(128*1024**2),controller=new AbortController(),fixture=evaluatorWorkers((_,m)=>m.type==='evaluate'?'null':null),operation=createD2prlRecovery({budget,signal:controller.signal,onRecovery:()=>controller.abort(),reclaim(){assert.fail('Transport reclaimed');}}),pool=await createEvaluatorPool('unused',{budget,maxWorkers:1,tileSize:4,operation,workerFactory:()=>fixture.factory()});
 try{await assert.rejects(pool.evaluate(field(),{signal:controller.signal}),{code:'CANCELLED'});assert.equal(fixture.workers.length,1);assert.ok(fixture.workers[0].closed);}finally{pool.dispose();}idle(budget);
});
test('optional evaluator bootstrap retries transport without reducing the healthy pool',async()=>{
 const budget=new Budget(256*1024**2),fixture=evaluatorWorkers((index,m)=>index===1&&m.type==='init'?'messageerror':null),pool=await createEvaluatorPool('unused',{budget,maxWorkers:2,tileSize:4,operation:recovery(budget),workerFactory:()=>fixture.factory()});
 try{await pool.evaluate(field());assert.equal(fixture.workers.length,3);assert.equal(fixture.workers[0].closed,false);assert.equal(fixture.workers[1].closed,true);assert.equal(pool.stats.activeWorkers,2);assert.equal(pool.stats.optionalWorkerRefusals,0);}finally{pool.dispose();}idle(budget);
});
function convolutionWorkers(faults){const workers=[],attempts=new Map();return{workers,attempts,factory(){const index=workers.length,worker={closed:false,uploads:0,computes:0,terminate(){this.closed=true;},postMessage(m){queueMicrotask(()=>{if(this.closed)return;const data={ok:true,heapBytes:16*1024**2};if(m.kind==='load')this.uploads++;if(m.kind==='compute'){this.computes++;attempts.set(m.start,(attempts.get(m.start)??0)+1);data.values=Float32Array.from({length:m.count},(_,i)=>(m.start+i)/16);}deliver(this,faults?.(index,m,this),data);});}};workers.push(worker);return worker;}};}
const convolutionInput=()=>({input:new Float32Array(3*128*128),weights:new Float32Array(16*3*9),bias:new Float32Array(16),channels:3,height:128,width:128,outChannels:16,kernel:3,padding:1});
test('CPU convolution reuses an admitted arena output at exact remaining input and copy credit',async()=>{
 const budget=new Budget(512*1024**2),fixture=convolutionWorkers(),engine=createConvolutionCpu({budget,moduleUrl:'unused',maxWorkers:1,workerFactory:()=>fixture.factory()}),input=convolutionInput(),inputBytes=input.input.byteLength+input.weights.byteLength+input.bias.byteLength,copyBytes=inputBytes+16384*8+4096;let result,peer;
 try{result=await engine.run(input);const bank=result.data.buffer;result.release();result=null;peer=budget.reserve(budget.limit-budget.total()-inputBytes-copyBytes);assert.ok(budget.limit-budget.total()<inputBytes+16*128*128*4);result=await engine.run(input);assert.equal(result.data.buffer,bank);assert.equal(fixture.workers.length,1);for(let i=0;i<result.data.length;i++)assert.equal(result.data[i],i/16);}finally{peer?.();result?.release();engine.dispose();}idle(budget);
});
test('CPU convolution retry includes retired previous-worker credit but not a retained arena bank',async()=>{
 const budget=new Budget(512*1024**2),fixture=convolutionWorkers(),engine=createConvolutionCpu({budget,moduleUrl:'unused',maxWorkers:1,workerFactory:()=>fixture.factory()}),input=convolutionInput(),inputBytes=input.input.byteLength+input.weights.byteLength+input.bias.byteLength,copyBytes=inputBytes+16384*8+4096,reserve=budget.reserve.bind(budget);let peer,result,armed=false;
 budget.reserve=bytes=>{if(armed&&bytes===copyBytes){armed=false;peer=reserve(budget.limit-budget.total()-copyBytes+1);}return reserve(bytes);};
 try{
  result=await engine.run(input);result.release();result=null;assert.equal(fixture.workers.length,1);armed=true;
  await assert.rejects(engine.run(input),error=>{assert.equal(error.code,'MEMORY_LIMIT');assert.equal(error.details.admission.requestedBytes,copyBytes);assert.equal(error.details.admission.rollbackBytes,256*1024**2+inputBytes);assert.equal(error.details.admission.retryBytes,256*1024**2+inputBytes+copyBytes);assert.equal(error.details.admission.retryBytes,budget.limit-budget.total()+1);return true;});
  assert.equal(fixture.workers[0].closed,true);assert.equal(budget.total(),peer.bytes+16*1024**2,'The idle arena bank retains its physical credit');peer();peer=null;
  result=await engine.run(input);assert.equal(result.data.length,16*128*128);assert.equal(fixture.workers.length,2);
 }finally{peer?.();result?.release();engine.dispose();}idle(budget);
});
for(const kind of ['null','messageerror','endpoint'])test(`CPU convolution ${kind} preserves completed tiles and worker capacity`,async()=>{
 const budget=new Budget(768*1024**2),events=[],fixture=convolutionWorkers((index,m,w)=>index===0&&m.kind==='compute'&&w.computes===3?kind:null),engine=createConvolutionCpu({budget,moduleUrl:'unused',maxWorkers:2,operation:recovery(budget,events),workerFactory:()=>fixture.factory()});let result;
 try{result=await engine.run(convolutionInput());assert.equal(result.workers,2);for(let i=0;i<result.data.length;i++)assert.equal(result.data[i],i/16);assert.equal(fixture.workers.length,3);assert.equal(fixture.workers[0].closed,true);assert.equal(fixture.workers[1].closed,false);assert.equal(fixture.workers[1].uploads,1);assert.equal([...fixture.attempts.values()].reduce((a,b)=>a+b,0),17);assert.equal(events.length,1);assert.equal(events[0].error.code,'WORKER_MESSAGE_FAILED');}finally{result?.release();engine.dispose();}idle(budget);
});
test('unreadable convolution clear retains completed output and recreates only the idle slot on next layer',async()=>{
 const budget=new Budget(768*1024**2),fixture=convolutionWorkers((index,m)=>index===0&&m.kind==='clear'?'null':null),engine=createConvolutionCpu({budget,moduleUrl:'unused',maxWorkers:2,operation:recovery(budget),workerFactory:()=>fixture.factory()});let first,second;
 try{first=await engine.run(convolutionInput());assert.equal(fixture.workers.length,2);assert.equal(fixture.workers[0].closed,true);assert.equal([...fixture.attempts.values()].reduce((a,b)=>a+b,0),16);second=await engine.run(convolutionInput());assert.deepEqual(second.data,first.data);assert.equal(second.workers,2);assert.equal(fixture.workers.length,3);assert.equal(fixture.workers[1].closed,false);}finally{first?.release();second?.release();engine.dispose();}idle(budget);
});
test('spatial transport retry retires its lease before retry and preserves input',async t=>{
 const budget=new Budget(768*1024**2),workers=[];const oldWorker=globalThis.Worker;t.after(()=>{if(oldWorker===undefined)delete globalThis.Worker;else globalThis.Worker=oldWorker;});globalThis.Worker=class{constructor(){workers.push(this);}terminate(){this.closed=true;}postMessage(m){queueMicrotask(()=>{if(workers.length===1)deliver(this,'null');else deliver(this,null,{ok:true,values:Float32Array.from(m.input),heapBytes:16*1024**2});});}};
 const spatial=createSpatial({budget,moduleUrl:'unused'}),input=Float32Array.of(1,2,3,4);let result;
 try{result=await spatial.run({input,width:2,height:2,outWidth:2,outHeight:2,nearest:true});assert.deepEqual(result.data,input);assert.equal(workers.length,2);assert.ok(workers.every(w=>w.closed));}finally{result?.release();spatial.dispose();}idle(budget);
});
test('bounded roles transport retry preserves prior inputs and releases each failed worker',async t=>{
 const budget=new Budget(1024**3),workers=[];const oldWorker=globalThis.Worker;t.after(()=>{if(oldWorker===undefined)delete globalThis.Worker;else globalThis.Worker=oldWorker;});globalThis.Worker=class{constructor(){workers.push(this);}terminate(){this.closed=true;}postMessage(){queueMicrotask(()=>{if(workers.length===1)deliver(this,'messageerror');else deliver(this,null,{ok:true,target:new Float32Array(448**2),source:new Float32Array(448**2),heapBytes:16*1024**2,ort:'fixture'});});}};
 const stage=createBoundedRoles({budget,model:{modelBytes:4,modelSha256:'0'.repeat(64)},modelUrl:'https://fixture.invalid/model',runtime:{runtimeId:'ort130-wasm-512mib',memoryMaximumBytes:512*1024**2},runtimeFactoryUrl:'https://fixture.invalid/runtime',wasmPath:'https://fixture.invalid/'}),roles=recoverableStage(stage,'roles',recovery(budget)),plane=new Float32Array(448**2);let result;
 try{result=await roles.run({rgb:new Float32Array(3*448**2),coordinates:{zm:{x:plane,y:plane},cnn:{x:plane,y:plane}},union:plane});assert.equal(result.target.length,448**2);assert.equal(workers.length,2);assert.ok(workers.every(w=>w.closed));}finally{result?.release();roles.dispose();}idle(budget);
});

test('postprocess retries unreadable transport after retiring its workspace',async t=>{
 const budget=new Budget(768*1024**2),workers=[],old=globalThis.Worker;t.after(()=>{if(old===undefined)delete globalThis.Worker;else globalThis.Worker=old;});globalThis.Worker=class{constructor(){workers.push(this);}terminate(){this.closed=true;}postMessage(m){queueMicrotask(()=>{if(workers.length===1)deliver(this,'messageerror');else deliver(this,null,{ok:true,masks:m.raw.slice(),filtered:m.raw.slice(0,m.width*m.height),heapBytes:16*1024**2});});}};
 const stage=createPostprocess({budget,moduleUrl:'unused'}),raw=Float32Array.from({length:12},(_,i)=>i/16);let result;
 try{result=await stage.run({raw,width:2,height:2});assert.deepEqual(result.masks,raw);assert.equal(workers.length,2);assert.ok(workers.every(w=>w.closed));}finally{result?.release();stage.dispose();}idle(budget);
});

for(const kind of ['evaluator','convolution'])test(`${kind} terminal upload drains a companion retry before releasing shared buffers`,async()=>{
 const budget=new Budget(768*1024**2),workers=[],label=kind==='evaluator'?'evaluator:features':'convolution:upload';let releaseRetry,announceRetry,failFirst,settled=false,uploads=0;
 const retryPaused=new Promise(resolve=>announceRetry=resolve),gate=new Promise(resolve=>releaseRetry=resolve);
 const operation=async(name,work)=>{if(name!==label||uploads++!==1)return work();try{return await work();}catch(error){assert.equal(error.code,'WORKER_MESSAGE_FAILED');announceRetry();await gate;return work();}};
 const factory=()=>{const index=workers.length,worker={closed:false,terminate(){this.closed=true;},postMessage(m){queueMicrotask(()=>{if(this.closed)return;if(m.type==='features'||m.kind==='load'){if(index===1)deliver(this,'null');else failFirst=()=>deliver(this,null,{id:m.id,ok:false,error:serializeEngineError(new EngineError('NUMERIC_RANGE','terminal fixture'))});}else deliver(this,null,{id:m.id,ok:true,heapBytes:16*1024**2});});}};workers.push(worker);return worker;};
 const stage=kind==='evaluator'?await createEvaluatorPool('unused',{budget,maxWorkers:2,tileSize:4,operation,workerFactory:factory}):createConvolutionCpu({budget,moduleUrl:'unused',maxWorkers:2,operation,workerFactory:factory});
 const pending=(kind==='evaluator'?stage.evaluate(field()):stage.run(convolutionInput())).finally(()=>settled=true);const rejection=assert.rejects(pending,{code:'NUMERIC_RANGE'});
 try{await retryPaused;failFirst();await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false,'Companion retry still owns the operation');assert.ok(budget.total()>0,'Output/input ownership remains until every lane settles');assert.equal(workers.length,2);assert.ok(workers.every(w=>w.closed));releaseRetry();await rejection;assert.equal(workers.length,2,'A companion cannot resurrect a cleared pool');}finally{releaseRetry();await rejection;stage.dispose();}idle(budget);
});

test('five unreadable convolution tiles stop without reducing future configured parallelism or orphaning CPU',async()=>{
 const budget=new Budget(768*1024**2),fixture=convolutionWorkers((_,m)=>m.kind==='compute'?'null':null),engine=createConvolutionCpu({budget,moduleUrl:'unused',maxWorkers:1,operation:recovery(budget),workerFactory:()=>fixture.factory()});
 try{await assert.rejects(engine.run(convolutionInput()),e=>e.code==='WORKER_MESSAGE_FAILED'&&e.details.recovery.loopDetected&&e.details.recovery.consecutiveFailures===5);assert.equal(fixture.workers.length,5);assert.ok(fixture.workers.every(w=>w.closed));assert.equal(fixture.attempts.get(0),5);}finally{engine.dispose();}idle(budget);
});
test('role child backing ledger is covered by the existing lease and follows growth, release and cancellation',async t=>{
 const oldWorker=globalThis.Worker;t.after(()=>{if(oldWorker===undefined)delete globalThis.Worker;else globalThis.Worker=oldWorker;});
 for(const cancelled of [false,true]){const budget=new Budget(1024**3),controller=new AbortController();let admitted;
  globalThis.Worker=class{terminate(){this.closed=true;}postMessage(){queueMicrotask(()=>{const backing=(id,action,bytes)=>deliver(this,null,{phase:'parameter-backing',backing:{id,action,bytes,kind:'wasm',label:'fixture'}});admitted=budget.total();backing(1,'allocate',16*1024**2);assert.equal(budget.total(),admitted,'Ledger debited global budget twice');backing(1,'resize',32*1024**2);assert.equal(budget.resourceSnapshot().domains.wasm.materializedBytes,32*1024**2);backing(2,'allocate',65536);backing(2,'release',65536);if(cancelled){controller.abort();return;}backing(1,'release',32*1024**2);deliver(this,null,{ok:true,target:new Float32Array(448**2),source:new Float32Array(448**2),heapBytes:32*1024**2,ort:'fixture'});});}};
  const stage=createBoundedRoles({budget,model:{modelBytes:4,modelSha256:'0'.repeat(64)},modelUrl:'https://fixture.invalid/model',runtime:{runtimeId:'ort130-wasm-512mib',memoryMaximumBytes:512*1024**2},runtimeFactoryUrl:'https://fixture.invalid/runtime',wasmPath:'https://fixture.invalid/'}),plane=new Float32Array(448**2),job=stage.run({rgb:new Float32Array(3*448**2),coordinates:{zm:{x:plane,y:plane},cnn:{x:plane,y:plane}},union:plane},{signal:controller.signal});if(cancelled)await assert.rejects(job,{code:'CANCELLED'});else(await job).release();stage.dispose();idle(budget);assert.equal(budget.resourceSnapshot().domains.wasm.materializedBytes,0);
 }
});
