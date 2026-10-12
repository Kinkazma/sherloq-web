import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {EngineError,serializeEngineError} from '../src/errors.js';
import {createD2prlRecovery} from '../experiments/d2prl/recovery.js';
import {createEvaluatorPool} from '../experiments/d2prl/evaluator-pool.js';

const NativeFloat32Array=Float32Array,MiB=1024**2;
function input(side=112){const n=side**2;return{features:new Uint16Array(36*n),offsetX:NativeFloat32Array.from({length:n},(_,i)=>i/4),offsetY:NativeFloat32Array.from({length:n},(_,i)=>-i/4),side,channels:36,candidates:1};}

// Worker allocation errors and heap extents below are explicit injections.
// These tests allocate only small JS arrays, never native heaps or models.
async function fixture({tileSize=4096,maxWorkers=1,recovery=true,onEvaluate,heap,postFailure,roundtrip=false,afterDetach,onRecovery}={}){
 const budget=new Budget(256*MiB),workers=[],attempts=[],returned=[],held=[],events=[],detached=[];
 let droppedReplies=0;
 const operation=recovery?createD2prlRecovery({budget,reclaim:async()=>1,onRecovery:event=>{events.push(event);onRecovery?.(event,budget);}}):undefined;
 const workerFactory=()=>{
  const worker={index:workers.length,closed:false,terminate(){this.closed=true;},postMessage(sent,transfer=[]){
   postFailure?.(sent,worker);
   const buffers=sent.type==='evaluate'?[sent.x.buffer,sent.y.buffer]:[],message=roundtrip?structuredClone(sent,{transfer}):sent;
   if(roundtrip&&sent.type==='evaluate'){detached.push(buffers.map(buffer=>buffer.byteLength));afterDetach?.(message,worker);}
   queueMicrotask(()=>{
    if(worker.closed)return;
    const bytes=heap?.(message,worker)??16*MiB,response={id:message.id,ok:true,heapBytes:bytes};
    const send=data=>{if(worker.closed){droppedReplies++;return;}if(data?.ok&&message.type==='evaluate')returned.push([message.begin,message.end]);if(roundtrip){const outbound=[data?.x,data?.y,data?.reuseX,data?.reuseY].filter(ArrayBuffer.isView).map(view=>view.buffer).filter(buffer=>buffer instanceof ArrayBuffer);data=structuredClone(data,{transfer:[...new Set(outbound)]});}worker.onmessage?.({data});};
    if(message.type==='evaluate'){
     attempts.push([message.begin,message.end]);
     response.x=NativeFloat32Array.from({length:message.end-message.begin},(_,i)=>message.x[i]);response.y=NativeFloat32Array.from({length:message.end-message.begin},(_,i)=>message.y[i]);
     if(roundtrip){response.reuseX=message.x;response.reuseY=message.y;}
     const special=onEvaluate?.(message,worker,response,send);
     if(special==='hold'){held.push(()=>send(response));return;}
     if(special==='messageerror'){worker.onmessageerror?.({});return;}
     if(special!==undefined){send(special);return;}
    }
    send(response);
   });
  }};workers.push(worker);return worker;
 };
 const pool=await createEvaluatorPool('unused',{budget,tileSize,maxWorkers,operation,workerFactory});
 return{budget,pool,workers,attempts,returned,events,detached,drain(){for(const reply of held.splice(0))reply();},get droppedReplies(){return droppedReplies;}};
}

function clean(value){
 assert.equal(value.budget.total(),0);assert.equal(value.budget.recovering,false);assert.ok(value.workers.every(worker=>worker.closed));
 const resources=value.budget.resourceSnapshot();assert.equal(resources.operations.length,0);assert.equal(resources.pressures.length,0);assert.ok(Object.values(resources.domains).every(domain=>domain.backings===0));
 const scheduler=getExecutionScheduler(value.budget).snapshot();assert.equal(scheduler.running,0);assert.equal(scheduler.queued,0);assert.equal(scheduler.active.cpu,0);assert.equal(scheduler.active.gpu,0);
 assert.equal(value.pool.stats.wasmBytes,0);assert.equal(value.pool.stats.transportBytes,0);
}

function sameOutput(actual,source){assert.deepEqual(actual.x,source.offsetX);assert.deepEqual(actual.y,source.offsetY);}
function errorReply(message,code='MEMORY_ALLOCATION',kind='array-buffer'){return{id:message.id,ok:false,heapBytes:16*MiB,error:serializeEngineError(new EngineError(code,'Injected useful result allocation refusal',{details:{allocationKind:kind,requestedBytes:(message.end-message.begin)*4}}))};}

for(const constructor of ['first','second'])test('parent '+constructor+' transport constructor refusal shrinks only the pending group',async()=>{
 const source=input(),value=await fixture();let armed=false,calls=0,failures=0;
 globalThis.Float32Array=new Proxy(NativeFloat32Array,{construct(target,args,newTarget){
  if(armed&&args[0]===4096&&++calls===(constructor==='first'?1:2)){armed=false;failures++;throw new RangeError('Array buffer allocation failed');}
  return Reflect.construct(target,args,newTarget);
 }});
 try{
  const result=await value.pool.evaluate(source,{onProgress(){if(!failures)armed=true;}});sameOutput(result,source);
  assert.equal(failures,1);assert.equal(value.pool.stats.transportReductions,1);assert.equal(value.pool.stats.minimumTransportPixels,2048);assert.equal(value.workers.length,1);assert.equal(value.pool.stats.activeWorkers,1);
  assert.deepEqual(value.attempts,[[0,4096],[4096,6144],[6144,8192],[8192,12288],[12288,12544]],'Previously committed pixels are never sent again; the following group restores 4096');
 }finally{globalThis.Float32Array=NativeFloat32Array;value.pool.dispose();}clean(value);
});

for(const code of ['MEMORY_ALLOCATION','MEMORY_LIMIT'])test('explicit '+code+' in worker result transport shrinks and preserves completed ranges',async()=>{
 const source=input();let refused=false;
 const value=await fixture({onEvaluate(message){if(message.begin===4096&&!refused){refused=true;return errorReply(message,code);}}});
 try{
  const result=await value.pool.evaluate(source);sameOutput(result,source);
  assert.deepEqual(value.attempts,[[0,4096],[4096,8192],[4096,6144],[6144,8192],[8192,12288],[12288,12544]]);
  assert.deepEqual(value.returned,[[0,4096],[4096,6144],[6144,8192],[8192,12288],[12288,12544]]);assert.equal(value.workers.length,1);assert.equal(value.pool.stats.transportReductions,1);assert.equal(value.pool.stats.minimumTransportPixels,2048);
 }finally{value.pool.dispose();}clean(value);
});

test('generic messageerror restarts transport without inferring a smaller allocation',async()=>{
 let failed=false;const source=input(),value=await fixture({onEvaluate(){if(!failed){failed=true;return'messageerror';}}});
 try{
  sameOutput(await value.pool.evaluate(source),source);assert.equal(value.pool.stats.transportReductions,0);assert.equal(value.pool.stats.minimumTransportPixels,4096);assert.equal(value.pool.stats.activeWorkers,1);assert.equal(value.workers.length,2);
  assert.deepEqual(value.attempts.slice(0,2),[[0,4096],[0,4096]],'Only the uncommitted message is retried at its original capacity');
 }finally{value.pool.dispose();}clean(value);
});

for(const kind of ['wasm',undefined])test('memory refusal in '+(kind??'an unspecified domain')+' keeps the transport size',async()=>{
 let failed=false;const source=input(),value=await fixture({onEvaluate(message){if(!failed){failed=true;return{id:message.id,ok:false,heapBytes:16*MiB,error:serializeEngineError(new EngineError('MEMORY_ALLOCATION','Injected memory refusal',{details:{...(kind?{allocationKind:kind}:{}),requestedBytes:4096}}))};}}});
 try{sameOutput(await value.pool.evaluate(source),source);assert.equal(value.pool.stats.transportReductions,0);assert.equal(value.pool.stats.minimumTransportPixels,4096);assert.deepEqual(value.attempts.slice(0,2),[[0,4096],[0,4096]]);}
 finally{value.pool.dispose();}clean(value);
});

test('transport shrinking retains both admitted workers and disjoint completed ranges',async()=>{
 let failed=false;const source=input(),value=await fixture({maxWorkers:2,onEvaluate(message,worker){if(worker.index===1&&!failed){failed=true;return errorReply(message);}}});
 try{
  sameOutput(await value.pool.evaluate(source,{onProgress(){assert.equal(value.pool.stats.activeWorkers,2);}}),source);
  assert.equal(value.workers.length,2);assert.equal(value.pool.stats.createdWorkers,2);assert.equal(value.pool.stats.transportReductions,1);
  const ranges=[...value.returned].sort((a,b)=>a[0]-b[0]);assert.equal(ranges[0][0],0);assert.equal(ranges.at(-1)[1],source.side**2);for(let i=1;i<ranges.length;i++)assert.equal(ranges[i][0],ranges[i-1][1],'Every committed pixel occurs exactly once');
 }finally{value.pool.dispose();}clean(value);
});

test('heap telemetry records one actual backing without a second policy charge',async()=>{
 const source=input(8),value=await fixture({tileSize:8,heap:message=>message.type==='evaluate'?32*MiB:16*MiB});let observed=0;
 try{
  for(let run=0;run<2;run++)sameOutput(await value.pool.evaluate(source,{onProgress(){observed++;const wasm=value.budget.resourceSnapshot().domains.wasm;assert.equal(wasm.backings,1);assert.equal(wasm.materializedBytes,32*MiB);assert.equal(value.pool.stats.wasmBytes,32*MiB);assert.equal(value.budget.total(),value.pool.stats.policyBytes+8*source.side**2);}}),source);
  assert.equal(observed,16);assert.equal(value.pool.stats.peakWasmBytes,32*MiB);assert.equal(value.workers.length,1);
 }finally{value.pool.dispose();}clean(value);
 assert.equal(value.budget.resourceSnapshot().backingReleased.wasm,32*MiB);
});

for(const bytes of [-1,NaN,Number.MAX_SAFE_INTEGER+1,1024*MiB])test('malformed heap extent '+String(bytes)+' settles and cleans the pool',async()=>{
 const value=await fixture({recovery:false,heap:message=>message.type==='evaluate'?bytes:16*MiB});
 try{await assert.rejects(value.pool.evaluate(input(8)),{code:'INVALID_INPUT'});assert.equal(value.pool.stats.transportReductions,0);}
 finally{value.pool.dispose();}clean(value);
});

for(const mode of ['shape','type','id','null'])test('malformed result '+mode+' settles and cleans the pool',async()=>{
 const value=await fixture({recovery:false,onEvaluate(message,_worker,response){if(mode==='shape')response.x=new NativeFloat32Array(0);if(mode==='type')response.x=[];if(mode==='id')response.id=message.id+100;return mode==='null'?null:response;}});
 try{await assert.rejects(value.pool.evaluate(input(8)),{code:'WORKER_MESSAGE_FAILED'});assert.equal(value.pool.stats.transportReductions,0);}
 finally{value.pool.dispose();}clean(value);
});

test('an outbound clone failure does not imply an allocator refusal',async()=>{
 const value=await fixture({recovery:false,postFailure(message){if(message.type==='evaluate')throw new DOMException('Cannot clone injected data','DataCloneError');}});
 try{await assert.rejects(value.pool.evaluate(input(8)),error=>error.name==='DataCloneError');assert.equal(value.pool.stats.transportReductions,0);}
 finally{value.pool.dispose();}clean(value);
});

test('refusal at the minimum transport size stops after the existing recovery limit',async()=>{
 const value=await fixture({tileSize:1,onEvaluate:message=>errorReply(message)});
 try{
  await assert.rejects(value.pool.evaluate(input(2)),error=>error.code==='MEMORY_ALLOCATION'&&error.details.recovery.loopDetected&&error.details.recovery.consecutiveFailures===5);
  assert.deepEqual(value.attempts,Array.from({length:5},()=>[0,1]));assert.equal(value.pool.stats.transportReductions,0);assert.equal(value.pool.stats.minimumTransportPixels,1);assert.equal(value.pool.stats.tiles,0);
 }finally{value.pool.dispose();}clean(value);
});

test('cancellation drains all lanes and ignores replies from retired workers',async()=>{
 const controller=new AbortController(),source=input(16),value=await fixture({tileSize:64,maxWorkers:2,onEvaluate(_message,worker){if(worker.index===1)return'hold';}});let progress=0;
 try{
  await assert.rejects(value.pool.evaluate(source,{signal:controller.signal,onProgress(){progress++;controller.abort();}}),{code:'CANCELLED'});
  assert.equal(progress,1);assert.equal(value.pool.stats.tiles,1);assert.equal(value.workers.length,2);value.drain();assert.equal(value.droppedReplies,1);assert.equal(value.pool.stats.transportReductions,0);
 }finally{value.pool.dispose();}clean(value);
});

test('transferred banks round-trip through growth, a partial tail and fewer candidate planes',async()=>{
 let source;const side=65,n=side**2,value=await fixture({roundtrip:true,onEvaluate(message){
  const count=message.end-message.begin;
  for(let k=0;k<message.candidates;k++)for(let i=0;i<count;i++){assert.equal(message.x[k*count+i],source.offsetX[k*n+message.begin+i]);assert.equal(message.y[k*count+i],source.offsetY[k*n+message.begin+i]);}
 }});
 try{
  for(const [run,candidates] of [5,13,1,5].entries()){
   source={...input(side),candidates,offsetX:NativeFloat32Array.from({length:candidates*n},(_,i)=>run*100000+i/4),offsetY:NativeFloat32Array.from({length:candidates*n},(_,i)=>-run*100000-i/4)};
   const result=await value.pool.evaluate(source);assert.deepEqual(result.x,source.offsetX.subarray(0,n));assert.deepEqual(result.y,source.offsetY.subarray(0,n));
   const capacity=(run?13:5)*4096*8;assert.equal(value.pool.stats.transportBytes,capacity);assert.equal(value.budget.resourceSnapshot().domains['array-buffer'].materializedBytes,capacity);assert.equal(value.budget.total(),value.pool.stats.policyBytes,'Retained transfer banks stay within the declared worker envelope');
  }
  assert.equal(value.pool.stats.transportAllocations,4);assert.equal(value.pool.stats.transportReuses,12);assert.equal(value.workers.length,1);assert.ok(value.detached.every(pair=>pair.every(bytes=>bytes===0)));assert.deepEqual(value.attempts,Array.from({length:4},()=>[[0,4096],[4096,n]]).flat());
 }finally{value.pool.dispose();}clean(value);
});

test('failure after transfer detachment retires both transport backings exactly once',async()=>{
 let failed=false;const value=await fixture({roundtrip:true,recovery:false,afterDetach(){if(!failed){failed=true;throw new EngineError('WORKER_MESSAGE_FAILED','Injected post-detachment transport failure');}}});
 try{const source=input(8);await assert.rejects(value.pool.evaluate(source),{code:'WORKER_MESSAGE_FAILED'});assert.deepEqual(value.detached,[[0,0]]);assert.equal(value.pool.stats.transportAllocations,2);assert.equal(value.budget.resourceSnapshot().backingReleased['array-buffer'],source.features.byteLength+8*64,'The useful upload chunk and both detached transport banks retire exactly once');}
 finally{value.pool.dispose();}clean(value);
});

for(const mode of ['one-missing','wrong-type','short','offset','shared','axes-alias','output-alias'])test('malformed recycled input '+mode+' settles and releases detached ownership',async()=>{
 const value=await fixture({roundtrip:true,recovery:false,onEvaluate(message,_worker,response){
  const length=message.x.length;
  if(mode==='one-missing')response.reuseY=undefined;
  if(mode==='wrong-type')response.reuseX=[];
  if(mode==='short')response.reuseX=message.x.subarray(0,length-1);
  if(mode==='offset')response.reuseX=new NativeFloat32Array(length+1).subarray(1);
  if(mode==='shared')response.reuseX=new NativeFloat32Array(new SharedArrayBuffer(length*4));
  if(mode==='axes-alias')response.reuseY=response.reuseX;
  if(mode==='output-alias')response.reuseX=response.x;
  return response;
 }});
 try{await assert.rejects(value.pool.evaluate(input(8)),error=>error.code==='WORKER_MESSAGE_FAILED'&&['invalid-recycled-input','aliased-recycled-input'].includes(error.details.transport.reason));assert.equal(value.pool.stats.transportReductions,0);assert.deepEqual(value.detached,[[0,0]]);}
 finally{value.pool.dispose();}clean(value);
});

test('returned banks are released when cancellation races their next publication',async()=>{
 const controller=new AbortController(),value=await fixture({roundtrip:true,tileSize:8,maxWorkers:2});let progress=0;
 try{await assert.rejects(value.pool.evaluate(input(8),{signal:controller.signal,onProgress(){progress++;controller.abort();}}),{code:'CANCELLED'});assert.equal(progress,1);assert.ok(value.detached.length>=1);assert.ok(value.detached.every(pair=>pair.every(bytes=>bytes===0)));}
 finally{value.pool.dispose();}clean(value);
});

test('every admitted RPC belongs to its useful bootstrap, feature or tile parent',async()=>{
 const observed=new Set();let value;
 value=await fixture({maxWorkers:2,tileSize:8,postFailure(message){
  const graph=value.budget.resourceSnapshot().operations,children=graph.filter(operation=>operation.id==='d2prl-evaluator'&&operation.state==='compute');assert.ok(children.length>0);
  for(const child of children){const parent=graph.find(operation=>operation.key===child.parent);assert.ok(parent,'Admitted worker calls always have a live useful parent');assert.equal(parent.owner,'d2prl');assert.equal(parent.state,'waiting-child');assert.ok(parent.children.includes(child.key));assert.ok(parent.dependencies.includes(child.key));assert.ok(['evaluator:bootstrap','evaluator:optional-bootstrap','evaluator:features','evaluator:tile'].includes(parent.id));observed.add(parent.id);}
  const expected=message.type==='init'?['evaluator:bootstrap','evaluator:optional-bootstrap']:message.type.startsWith('features')?['evaluator:features']:['evaluator:tile'];assert.ok(children.some(child=>expected.includes(graph.find(operation=>operation.key===child.parent).id)));
 }});
 try{sameOutput(await value.pool.evaluate(input(8)),input(8));assert.deepEqual([...observed].sort(),['evaluator:bootstrap','evaluator:features','evaluator:optional-bootstrap','evaluator:tile'].sort());}
 finally{value.pool.dispose();}clean(value);
});

for(const phase of ['features-begin','features-chunks','features-end'])for(const fault of ['messageerror','cancel'])test(`windowed ${phase} ${fault} preserves ordinary source ownership and drains transport`,async()=>{
 const controller=new AbortController(),source=input(8),original=source.features.slice();let injected=false;
 const value=await fixture({roundtrip:true,postFailure(message,worker){if(injected||message.type!==phase)return;injected=true;if(fault==='cancel')controller.abort();else worker.onmessageerror?.({});}});
 try{if(fault==='cancel')await assert.rejects(value.pool.evaluate(source,{signal:controller.signal}),{code:'CANCELLED'});else{sameOutput(await value.pool.evaluate(source),source);assert.equal(value.workers.length,2);assert.ok(value.events.some(event=>event.error?.code==='WORKER_MESSAGE_FAILED'));}assert.equal(injected,true);assert.deepEqual(source.features,original);assert.equal(source.features.buffer.byteLength,original.byteLength);assert.equal(value.pool.stats.transportReductions,0);}
 finally{value.pool.dispose();}clean(value);
});

test('failed useful RPC releases its child lease before parent recovery can wait',async()=>{
 let failed=false,recoveries=0;
 const value=await fixture({tileSize:8,onEvaluate(message){if(!failed){failed=true;return errorReply(message);}},onRecovery(event,budget){
  if(event.phase!=='resource-recovery')return;recoveries++;const graph=event.resources.operations,parent=graph.find(operation=>operation.id==='evaluator:tile');assert.ok(parent);assert.equal(parent.state,'recovery');assert.deepEqual(parent.children,[]);assert.equal(graph.some(operation=>operation.id==='d2prl-evaluator'),false);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);
 }});
 try{sameOutput(await value.pool.evaluate(input(8)),input(8));assert.equal(recoveries,1);}
 finally{value.pool.dispose();}clean(value);
});
