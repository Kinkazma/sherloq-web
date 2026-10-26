import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
const enabled=process.execArgv.includes('--experimental-test-module-mocks');let serial=0;
for(const phase of['success','error','abort'])test('completed Dense temporary owner '+phase+' settles its retirement before termination',{skip:!enabled,timeout:30000},async t=>{
 const budget=new Budget(256*1024**2),controller=new AbortController(),events=[];
 t.mock.module('../src/dense-shared-field.js',{namedExports:{portableDenseInputStagingBytes:()=>0,exportPortableDenseInput:async()=>({value:{stores:[]},transfer:[],transports:[],async release(){events.push('input-release');}})}});
 t.mock.module('../src/temporary-storage.js',{namedExports:{createTemporarySession:()=>{throw Error('No new destination is required by this protocol fixture');},removeTerminatedTemporarySession:async()=>{events.push('delete-session');}}});
 const{DensePagedFieldPool}=await import('../src/dense-paged-field-pool.js?retirement='+serial++),scheduler=getExecutionScheduler(budget,{maxWorkers:1});
 const pool=new DensePagedFieldPool(budget,{maxWorkers:1,workerFactory:()=>({postMessage(message){if(message.input)queueMicrotask(()=>this.onmessage({data:{result:{width:10,height:10,comparisons:0n,metrics:{},ownsAllowed:false,outputRetirement:true,session:{id:'job-00000000-0000-4000-8000-000000000001',backend:'indexeddb'},stores:{}}}}));else if(message.retireOutput){events.push('retire-request');if(phase==='abort')controller.abort();queueMicrotask(()=>{events.push('retire-ack');this.onmessage({data:{outputRetired:{token:message.retireOutput.token,...(phase==='error'?{error:{code:'STORAGE_IO',message:'retirement failed'}}:{})}}});});}},terminate(){events.push('terminate');}})});
 try{const request=pool.start({first:{byteLength:4800},mask:{byteLength:100},width:10,height:10,dimensions:12},{signal:controller.signal,storage:'temporary'});if(phase==='success'){const result=await request;assert(events.indexOf('retire-ack')<events.indexOf('terminate'));await result.dispose();}else await assert.rejects(request,{code:phase==='abort'?'CANCELLED':'STORAGE_IO'});assert(events.includes('retire-request'));assert(events.indexOf('retire-request')<events.indexOf('terminate'));assert.equal(pool.active.size,0);assert.equal(budget.total(),0);assert.deepEqual(scheduler.snapshot().active,{cpu:0,gpu:0});}finally{await pool.drain();scheduler.dispose();}
});
