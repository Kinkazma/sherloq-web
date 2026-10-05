import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {readByteStore as openReader} from '../src/portable-byte-store.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';

const enabled=process.execArgv.includes('--experimental-test-module-mocks'),MiB=1024**2;
let serial=0;
for(const phase of ['session','store','reservation','reservation-and-cleanup'])test('broker publication releases its reader when '+phase+' fails',{skip:!enabled,timeout:3000},async t=>{
 const budget=new Budget(512*MiB),copyBytes=256*1024,stagingBytes=128*1024,cause=new RangeError('Injected allocation cause'),failure=new EngineError('MEMORY_ALLOCATION','Injected '+phase+' failure',{cause,details:{allocationKind:'array-buffer',requestedBytes:copyBytes}}),cleanupFailure=new Error('Injected reader cleanup failure');
 const calls={reader:0,disposed:0,terminated:0,inputReleased:0,storeDisposed:0,sessionDisposed:0};
 const channel=new MessageChannel();let remoteClosed;
 const closed=new Promise(resolve=>{remoteClosed=resolve;});channel.port1.onmessage=({data})=>{if(data.closed)remoteClosed();};
 const reserve=budget.reserve.bind(budget);budget.reserve=bytes=>{if(phase.startsWith('reservation')&&calls.reader&&bytes===copyBytes)throw failure;return reserve(bytes);};
 t.mock.module('../src/dense-shared-field.js',{namedExports:{portableDenseInputStagingBytes:()=>0,exportPortableDenseInput:async()=>({value:{stores:[]},transfer:[],transports:[],async release(){calls.inputReleased++;}})}});
 t.mock.module('../src/temporary-storage.js',{namedExports:{createTemporarySession:async()=>{assert.equal(calls.reader,1);if(phase==='session')throw failure;return {async dispose(){calls.sessionDisposed++;}};},removeTerminatedTemporarySession:async()=>{}}});
 t.mock.module('../src/segmented-bytes.js',{namedExports:{adoptSharedSegmentedBytes:()=>{throw Error('Unexpected shared output');},createSegmentedBytes:async()=>{if(phase==='store')throw failure;const free=budget.reserve(17);let disposed=false;return {async dispose(){if(disposed)return;disposed=true;calls.storeDisposed++;free();},write(){throw Error('Failure must precede output writes');}};}}});
 t.mock.module('../src/portable-byte-store.js',{namedExports:{readByteStore:async(...args)=>{const before=budget.total(),reader=await openReader(...args);calls.reader++;assert.equal(budget.total(),before+stagingBytes);return {...reader,async dispose(){calls.disposed++;await reader.dispose();if(phase==='reservation-and-cleanup')throw cleanupFailure;}};}}});
 const {DensePagedFieldPool}=await import('../src/dense-paged-field-pool.js?broker-cleanup='+serial++),scheduler=getExecutionScheduler(budget,{maxWorkers:1});
 const pool=new DensePagedFieldPool(budget,{maxWorkers:1,workerFactory:()=>({postMessage(message){if(message.input)queueMicrotask(()=>this.onmessage({data:{result:{width:10,height:10,comparisons:0n,metrics:{},ownsAllowed:false,stores:{targets:{kind:'broker',byteLength:copyBytes,blockBytes:65536,storage:'temporary',port:channel.port2}}}}}));},terminate(){calls.terminated++;}})});
 const first={byteLength:4800},mask={byteLength:100};
 try{
  const pending=pool.start({first,mask,width:10,height:10,dimensions:12},{storage:'temporary'});assert.ok(pending);
  await assert.rejects(pending,error=>error===failure&&error.cause===cause);
  await closed;
  assert.equal(calls.reader,1);assert.equal(calls.disposed,1);assert.ok(calls.terminated>=1);
  assert.equal(calls.storeDisposed,phase.startsWith('reservation')?1:0);
  assert.equal(calls.sessionDisposed,phase==='session'?0:1);
  assert.equal(budget.total(),0,'Both broker staging and field workspace must retire');
  assert.equal(pool.active.size,0);assert.equal(budget.resourceSnapshot().operations.length,0);
  assert.deepEqual(scheduler.snapshot().active,{cpu:0,gpu:0});
 }finally{channel.port1.close();channel.port2.close();scheduler.dispose();}
});
