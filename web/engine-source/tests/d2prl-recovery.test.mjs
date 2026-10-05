import {createWasmTensorArena} from '../src/wasm-tensor-arena.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createD2prlRecovery,recoverableStage} from '../experiments/d2prl/recovery.js';
import {createPatchMatch} from '../experiments/d2prl/patchmatch.js';
import {createFeatureMath} from '../experiments/d2prl/feature-math.js';
import {createNeuralMath} from '../experiments/d2prl/neural-math.js';
import {createPreparation} from '../experiments/d2prl/prepare.js';
import {createEvaluatorPool} from '../experiments/d2prl/evaluator-pool.js';
import {EngineError,serializeEngineError} from '../src/errors.js';
import {readVerifiedModelAsset} from '../experiments/d2prl/model.js';
import {createHash} from 'node:crypto';
const state={state:Array.from({length:624},(_,i)=>Math.imul(i+1,1664525)>>>0),left:1,next:0};

test('D2 recovery forwards the real operation graph and recovery stage as serializable diagnostics',async()=>{
 const budget=new Budget(1024),peer=budget.beginOperation({owner:'peer',id:'useful-peer'}),events=[];peer.setState('compute');let attempts=0;
 const operation=createD2prlRecovery({budget,reclaim:async()=>0,onRecovery:event=>events.push(structuredClone(event))});
 try{assert.equal(await operation('diagnostic-admission',()=>{if(++attempts===1)throw new EngineError('MEMORY_LIMIT','Admission fixture',{details:{requestedBytes:1}});return 42;}),42);assert.equal(events.length,1);assert.equal(events[0].recoveryStage,'operation');assert.ok(events[0].resources.operations.some(value=>value.owner==='peer'&&value.id==='useful-peer'&&value.state==='compute'));assert.ok(events[0].resources.operations.some(value=>value.owner==='d2prl'&&value.state==='recovery'));assert.ok(events[0].resources.pressures.some(value=>value.owner==='d2prl'));assert.equal(operation.snapshot().recoveries,1);}finally{peer.release();}assert.equal(budget.resources.operations.size,0);assert.equal(budget.recovering,false);
});

for(const rollback of [0,128])test(`D2 policy refusal requests admission credit with ${rollback} bytes of its own returned prefix`,async()=>{
 const budget=new Budget(1024),held=budget.reserve(768),requests=[];let attempts=0;
 budget.reclaim=async(bytes,options)=>{requests.push({bytes,owner:options.owner,operation:options.operation?.id});held();return 768;};
 const operation=createD2prlRecovery({budget});
 assert.equal(await operation('policy-admission',()=>{if(++attempts===1)throw new EngineError('MEMORY_LIMIT','Cannot admit tensor',{details:{requestedBytes:512,...(rollback?{admission:{requestedBytes:512,rollbackBytes:rollback,retryBytes:512+rollback}}:{})}});return 'committed';}),'committed');
 assert.deepEqual(requests.map(({bytes,owner})=>({bytes,owner})),[{bytes:512+rollback,owner:'d2prl'}]);assert.equal(attempts,2);assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});

for(const kind of ['feature','neural','prepare'])test(`${kind} admission includes borrowed inputs and native heap growth atomically`,async()=>{
 const page=16*1024**2,items=kind==='neural'?448**2:256*1024,borrowed=kind==='prepare'?448*448*3:items*8,peak=page+borrowed,budget=new Budget(page+peak-1),requests=[],reserve=budget.reserve.bind(budget);let allocations=0;
 budget.reserve=bytes=>{requests.push(bytes);return reserve(bytes);};
 const heap=new ArrayBuffer(page),factory=async()=>({HEAPU8:new Uint8Array(heap),HEAPF32:new Float32Array(heap),_malloc(){allocations++;throw Error('Native allocation before complete admission');},_free(){}});
 const helper=await(kind==='feature'?createFeatureMath:kind==='neural'?createNeuralMath:createPreparation)(factory,{budget});
 try{const data=new Float32Array(items);const run=kind==='feature'?()=>helper.run('magnitude',{input:data,imag:data}):kind==='neural'?()=>helper.run('Mul',[{data,shape:[1,1,448,448]},{data,shape:[1,1,448,448]}]):()=>helper.run({rgb:new Uint8Array(borrowed),width:448,height:448});await assert.rejects(run(),{code:'MEMORY_LIMIT'});assert.deepEqual(requests,[page,peak]);assert.equal(allocations,0);assert.equal(budget.total(),page);}finally{helper.dispose();}
 assert.equal(budget.total(),0);
});

async function patchmatch({faults=false}={}){
 const budget=new Budget(64*1024**2),events=[],trace=[],operation=createD2prlRecovery({budget,onRecovery:e=>events.push(structuredClone(e)),reclaim:async()=>1});
 const Native=globalThis.Float32Array;let label,allocations=0,refusals=0;const seen=new Map();
 const wrapped=async(name,work)=>{const count=(seen.get(name)??0)+1;seen.set(name,count);return operation(name,async()=>{label=name;allocations=0;try{return await work();}finally{label=null;}});};
 if(faults)globalThis.Float32Array=new Proxy(Native,{construct(target,args){
  // Initial offsets fail after one branch has consumed RNG; nonlocal fails
  // after its first noise plane. Every failure must restore the old cursor.
  const planned=label==='patchmatch:initial-offsets'&&refusals===0?5:label==='patchmatch:propagate-zm'&&refusals===1?2:label==='patchmatch:nonlocal-zm'&&refusals===2?4:0;
  if(planned&&++allocations===planned){refusals++;throw new RangeError('Array buffer allocation failed');}return Reflect.construct(target,args);}});
 let engine,result;
 try{
  engine=await createPatchMatch(null,{budget,operation:wrapped,evaluatorFactory:async()=>({residentBytes:0,async evaluate({offsetX,offsetY,side}){return {x:offsetX.slice(0,side*side),y:offsetY.slice(0,side*side)};},dispose(){}})});
  result=await engine.run({zmFeatures:new Uint16Array(36*64),cnnFeatures:new Uint16Array(96*64),side:8,iterations:4,randomState:state},{onTrace:e=>trace.push([e.iteration,e.branch,e.phase,e.call])});
  const value={offsets:result.offsets,coordinates:result.coordinates,random:result.finalRandomState,evaluations:result.evaluations,trace};result.release();result=null;engine.dispose();engine=null;
  assert.equal(budget.total(),0);assert.equal(budget.recovering,false);return {value,events,seen,refusals};
 }finally{result?.release();engine?.dispose();globalThis.Float32Array=Native;}
}
test('D2 PatchMatch preserves committed evaluations and exact RNG across repeated later allocation incidents',async()=>{
 const reference=await patchmatch(),recovered=await patchmatch({faults:true});assert.equal(recovered.refusals,3);assert.equal(recovered.events.length,3);assert.deepEqual(recovered.value,reference.value);
 assert.equal(recovered.seen.get('patchmatch:initial-offsets'),1,'The model did not restart');assert.equal(recovered.value.trace.length,18);
});

test('five failures without progress stop locally while more separated incidents remain recoverable',async()=>{
 const budget=new Budget(1024),events=[],operation=createD2prlRecovery({budget,reclaim:async()=>1,onRecovery:e=>events.push(e)});let attempts=0;
 for(let i=0;i<7;i++){let failed=false;assert.equal(await operation('useful',()=>{attempts++;if(!failed){failed=true;throw new RangeError('Array buffer allocation failed');}return i;}),i);}
 assert.equal(operation.snapshot().recoveries,7);let stuck=0;
 await assert.rejects(operation('stuck',()=>{stuck++;throw new RangeError('Array buffer allocation failed');}),error=>error.code==='MEMORY_ALLOCATION'&&error.details.recovery.loopDetected&&error.details.recovery.consecutiveFailures===5);
 assert.equal(stuck,5);assert.equal(budget.recovering,false);assert.equal(budget.total(),0);
});

test('feature copy recovery retains completed native work and releases all ownership',async()=>{
 const budget=new Budget(64*1024**2),operation=createD2prlRecovery({budget,reclaim:async()=>1});let calls=0,copyAttempts=0,at=16;
 const buffer=new ArrayBuffer(16*1024**2),HEAPU8=new Uint8Array(buffer),HEAPF32=new Float32Array(buffer);
 const arena=createWasmTensorArena({budget,memoryFactory:descriptor=>{if(++copyAttempts<=2)throw new RangeError('WebAssembly.Memory(): could not allocate memory');return new WebAssembly.Memory(descriptor);}});
 HEAPF32.slice=()=>{throw Error('Ordinary output backing copy forbidden');};
 const math=await createFeatureMath(async()=>({HEAPU8,HEAPF32,_malloc(bytes){const p=at;at+=bytes;return p;},_free(){},_d2prl_magnitude(a,b,n,out){calls++;for(let i=0;i<n;i++)HEAPF32[out/4+i]=Math.hypot(HEAPF32[a/4+i],HEAPF32[b/4+i]);return 1;}}),{budget,operation,arena});
 const result=await math.run('magnitude',{input:Float32Array.of(3,0),imag:Float32Array.of(4,1)});
 assert.deepEqual([...result.data],[5,1]);assert.equal(calls,1);assert.equal(copyAttempts,3);result.release();math.dispose();arena.dispose();assert.equal(budget.total(),0);
});

test('cancelled local recovery immediately releases pressure and does not retry',async()=>{
 const budget=new Budget(1024),controller=new AbortController();let attempts=0;
 const operation=createD2prlRecovery({budget,signal:controller.signal,reclaim:async()=>{controller.abort();return 0;}});
 await assert.rejects(operation('cancel',()=>{attempts++;throw new RangeError('Array buffer allocation failed');}),{code:'CANCELLED'});assert.equal(attempts,1);assert.equal(budget.recovering,false);assert.equal(budget.total(),0);
});

test('two evaluator lanes refusing every useful tile stop without leaking work or pressure',async()=>{
 const budget=new Budget(256*1024**2),operation=createD2prlRecovery({budget,reclaim:async()=>1}),workers=[];let attempts=0;
 const pool=await createEvaluatorPool('unused',{budget,maxWorkers:2,tileSize:8,operation,workerFactory(){const worker={closed:false,terminate(){this.closed=true;},postMessage(message){queueMicrotask(()=>{if(this.closed)return;const response={id:message.id,ok:true};if(message.type==='evaluate'){attempts++;response.ok=false;response.error=serializeEngineError(new RangeError('Array buffer allocation failed'));}this.onmessage({data:response});});}};workers.push(worker);return worker;}});
 try{await assert.rejects(pool.evaluate({features:new Uint16Array(36*64),offsetX:new Float32Array(64),offsetY:new Float32Array(64),side:8,channels:36,candidates:1}),error=>error.code==='MEMORY_ALLOCATION'&&error.details.recovery.loopDetected);assert.ok(attempts>=5&&attempts<=10);assert.equal(workers.length,2);assert.ok(workers.every(w=>w.closed));}finally{pool.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});

test('concurrent useful tiles do not combine independent first refusals into a loop',async()=>{
 const budget=new Budget(1024),operation=createD2prlRecovery({budget,reclaim:async()=>1}),attempts=Array(6).fill(0);
 const results=await Promise.all(attempts.map((_,index)=>operation('same-tile-stage',()=>{if(++attempts[index]===1)throw new RangeError('Array buffer allocation failed');return index;})));
 assert.deepEqual(results,[0,1,2,3,4,5]);assert.deepEqual(attempts,[2,2,2,2,2,2]);assert.equal(operation.snapshot().recoveries,6);assert.equal(budget.recovering,false);
});

test('guarded stages retain dynamic getters and original method ownership',async()=>{
 const stage={resident:16,get residentBytes(){return this.resident;},run(){this.resident+=32;return this.resident;},dispose(){this.resident=0;}},wrapped=recoverableStage(stage,'test',(_label,work)=>work());
 assert.equal(wrapped.residentBytes,16);assert.equal(await wrapped.run(),48);assert.equal(wrapped.residentBytes,48);wrapped.dispose();assert.equal(wrapped.residentBytes,0);
});

test('a refused optional evaluator preserves the ready pool and grows again after external release',async()=>{
 const budget=new Budget(256*1024**2),competing=budget.reserve(32*1024**2),operation=createD2prlRecovery({budget,reclaim:async()=>1}),workers=[];
 const pool=await createEvaluatorPool('unused',{budget,maxWorkers:2,tileSize:8,operation,workerFactory(){const number=workers.length+1,worker={closed:false,terminate(){this.closed=true;},postMessage(message){queueMicrotask(()=>{if(this.closed)return;let response={id:message.id,ok:true};if(message.type==='init'&&number===2)response={id:message.id,ok:false,error:serializeEngineError(new RangeError('Array buffer allocation failed'))};if(message.type==='evaluate')Object.assign(response,{x:message.x.slice(0,message.end-message.begin),y:message.y.slice(0,message.end-message.begin)});this.onmessage({data:response});});}};workers.push(worker);return worker;}});
 const input={features:new Uint16Array(36*64),offsetX:new Float32Array(64),offsetY:new Float32Array(64),side:8,channels:36,candidates:1};
 try{await pool.evaluate(input);assert.equal(pool.stats.activeWorkers,1);assert.equal(pool.stats.optionalWorkerRefusals,1);assert.equal(workers[0].closed,false);await pool.evaluate(input);assert.equal(workers.length,2,'No retry caused by returning the failed worker reservation');competing();await pool.evaluate(input);assert.equal(pool.stats.activeWorkers,2);assert.equal(workers.length,3);assert.equal(pool.stats.descriptorUploads,2,'The ready worker retained its descriptor');assert.equal(pool.stats.tiles,24);}finally{competing();pool.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});

test('parameter digest recovery retains already fetched useful model bytes',async t=>{
 const bytes=Uint8Array.of(2,4,6,8),budget=new Budget(1024),operation=createD2prlRecovery({budget,reclaim:async()=>1}),nativeDigest=crypto.subtle.digest.bind(crypto.subtle);let fetched=0,digests=0;
 t.mock.method(globalThis,'fetch',async()=>{fetched++;return new Response(bytes);});
 t.mock.method(crypto.subtle,'digest',(...args)=>{if(++digests<=2)throw new RangeError('Array buffer allocation failed');return nativeDigest(...args);});
 const result=await readVerifiedModelAsset('https://fixture.invalid/model.bin',{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},{operation});
 assert.deepEqual(result,bytes);assert.equal(fetched,1);assert.equal(digests,3);assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});


test('cancellation at a successful bootstrap boundary cannot create optional evaluator workers',async()=>{
 const budget=new Budget(256*1024**2),controller=new AbortController(),workers=[];
 const operation=async(label,work)=>{const result=await work();if(label==='evaluator:bootstrap')controller.abort();return result;};
 const pool=await createEvaluatorPool('unused',{budget,maxWorkers:2,tileSize:8,operation,workerFactory(){const worker={closed:false,terminate(){this.closed=true;},postMessage(message){queueMicrotask(()=>{if(!this.closed)this.onmessage({data:{id:message.id,ok:true}});});}};workers.push(worker);return worker;}});
 try{await assert.rejects(pool.evaluate({features:new Uint16Array(36*64),offsetX:new Float32Array(64),offsetY:new Float32Array(64),side:8,channels:36,candidates:1},{signal:controller.signal}),{code:'CANCELLED'});assert.equal(workers.length,1);assert.ok(workers[0].closed);}finally{pool.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});
