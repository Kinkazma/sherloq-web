import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';
import {SparseCopyEngine} from '../src/sparse-copy.js';
import {createM3Adapter} from '../src/m3-adapter.js';
import {Budget} from '../src/cache.js';
import {payloadBytes} from '../src/pixel-operations.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const source=(id='source')=>{const pixels={format:'rgb8',width:32,height:24,data:Uint8Array.from({length:32*24*3},(_,i)=>i%251)};return {id,pixels,bytes:Uint8Array.of(1,5,17,43)};};
const task=(id='source',algorithm='SIFT')=>({id:'native-lifecycle-'+id,imageId:id,operation:'tampering.copyMove.sparse',params:{algorithm}});
function controlledDisposal(t){
 const original=SparseCopyEngine.prototype.dispose,queued=[],waiting=[];let held=true,count=0;
 t.mock.method(SparseCopyEngine.prototype,'analyze',async function(params){return {status:'no-regions',params,regions:[],metadata:{...(params.algorithm==='SSG'?{}:{algorithm:params.algorithm}),sourceCommit:'66bb26eca0c7e95c76042d5bcca58f744d70a27d'},release(){}};});
 t.mock.method(SparseCopyEngine.prototype,'dispose',function(){if(!held)return original.call(this);count++;const gate=deferred();if(waiting.length)waiting.shift()(gate);else queued.push(gate);return gate.promise.then(()=>original.call(this));});
 return {next(){return queued.length?Promise.resolve(queued.shift()):new Promise(resolve=>waiting.push(resolve));},releaseAll(){held=false;for(const gate of queued.splice(0))gate.resolve();},get count(){return count;}};
}
async function fixture(t){const control=controlledDisposal(t),engine=createEngine({memoryBudgetBytes:128*1024**2,cpuKernel:'reference'}),input=source(),models={models:{fixture:{data:new Uint8Array(91)}}};await engine.load(input);await engine.loadM3Models(models);await engine.run(task());return {control,engine,input,models,async cleanup(){control.releaseAll();try{await engine.dispose();}catch(e){if(e.code!=='DISPOSED')throw e;}}};}

test('M3 model replacement awaits the real disposer, holds old resources and keeps the public engine busy',async t=>{
 const f=await fixture(t);try{
  const before=f.engine.capabilities().memory.retainedBytes,replacement={models:{replacement:{data:new Uint8Array(157)}}};let complete=false;
  const replacing=f.engine.loadM3Models(replacement).then(r=>{complete=true;return r;}),gate=await f.control.next();
  assert.equal(complete,false);assert.equal(f.engine.capabilities().memory.retainedBytes,before);
  await assert.rejects(f.engine.run(task()),{code:'BUSY'});assert.throws(()=>f.engine.unload('source'),{code:'BUSY'});
  gate.resolve();assert.deepEqual((await replacing).models,['replacement']);
  assert.equal(f.engine.capabilities().memory.retainedBytes,before-payloadBytes(f.models)+payloadBytes(replacement));
  assert.equal(f.engine.capabilities().memory.activeReservationBytes,0);assert.deepEqual(f.engine.imagePixels('source').data,f.input.pixels.data);
 }finally{await f.cleanup();}
});

test('unloading M3 models waits for workers while preserving the image and accounting',async t=>{
 const f=await fixture(t);try{
  const before=f.engine.capabilities().memory.retainedBytes,closing=f.engine.unloadM3Models(),gate=await f.control.next();
  assert.equal(f.engine.capabilities().memory.retainedBytes,before);await assert.rejects(f.engine.loadM3Models({models:{}}),{code:'BUSY'});
  gate.resolve();await closing;assert.equal(f.engine.capabilities().memory.retainedBytes,before-payloadBytes(f.models));assert.deepEqual(f.engine.original('source'),f.input.bytes);
 }finally{await f.cleanup();}
});

test('unloading a source preserves its bytes and retained ownership until its M3 disposer finishes',async t=>{
 const f=await fixture(t);try{
  const before=f.engine.capabilities().memory.retainedBytes,closing=f.engine.unload('source'),gate=await f.control.next();assert.equal(typeof closing.then,'function');
  assert.equal(f.engine.capabilities().memory.retainedBytes,before);assert.throws(()=>f.engine.original('source'),{code:'BUSY'});
  gate.resolve();await closing;assert.throws(()=>f.engine.original('source'),{code:'NOT_FOUND'});assert.equal(f.engine.capabilities().memory.retainedBytes,payloadBytes(f.models));
 }finally{await f.cleanup();}
});

test('engine disposal holds all ownership until M3 closure and only then clears the common budget',async t=>{
 const f=await fixture(t);try{
  const before=f.engine.capabilities().memory.retainedBytes,closing=f.engine.dispose(),gate=await f.control.next();
  assert.equal(f.engine.capabilities().memory.retainedBytes,before);assert.throws(()=>f.engine.imagePixels('source'),{code:'BUSY'});
  gate.resolve();await closing;assert.equal(f.engine.capabilities().memory.retainedBytes,0);assert.equal(f.engine.capabilities().memory.activeReservationBytes,0);assert.throws(()=>f.engine.imagePixels('source'),{code:'DISPOSED'});
 }finally{await f.cleanup();}
});

test('a failed M3 source closure preserves the original cause, image and accounting for a useful retry',async t=>{
 const f=await fixture(t);try{
  const before=f.engine.capabilities().memory.retainedBytes,error=Object.assign(new Error('Worker disposal acknowledgment failed',{cause:Object.assign(new Error('Worker disconnected'),{code:'WORKER_LOST'})}),{code:'DISPOSE_ACK'});
  const closing=f.engine.unload('source'),gate=await f.control.next();gate.reject(error);await assert.rejects(closing,e=>e===error&&e.cause.code==='WORKER_LOST');
  assert.equal(f.engine.capabilities().memory.retainedBytes,before);assert.deepEqual(f.engine.original('source'),f.input.bytes);
  const retry=f.engine.unload('source'),second=await f.control.next();second.resolve();await retry;assert.equal(f.control.count,2);assert.throws(()=>f.engine.original('source'),{code:'NOT_FOUND'});
 }finally{await f.cleanup();}
});

test('model replacement failures keep the authoritative old resources and release the unused destination',async t=>{
 const f=await fixture(t);try{
  const before=f.engine.capabilities().memory.retainedBytes,error=new Error('close refused'),replacing=f.engine.loadM3Models({models:{next:{data:new Uint8Array(213)}}}),gate=await f.control.next();gate.reject(error);
  await assert.rejects(replacing,e=>e===error);assert.equal(f.engine.capabilities().memory.retainedBytes,before);assert.equal(f.engine.capabilities().memory.activeReservationBytes,0);
  const closing=f.engine.unloadM3Models(),second=await f.control.next();second.resolve();await closing;assert.equal(f.engine.capabilities().memory.retainedBytes,before-payloadBytes(f.models));
 }finally{await f.cleanup();}
});

test('all image closures settle before model release and a successful closure is not repeated after a peer failure',async t=>{
 const f=await fixture(t);try{
  await f.engine.load(source('second'));await f.engine.run(task('second'));const before=f.engine.capabilities().memory.retainedBytes,error=new Error('first close failed');let settled=false;
  const closing=f.engine.unloadM3Models();closing.then(()=>{settled=true;},()=>{settled=true;});const first=await f.control.next(),second=await f.control.next();first.reject(error);await tick();assert.equal(settled,false);assert.equal(f.engine.capabilities().memory.retainedBytes,before);
  second.resolve();await assert.rejects(closing,e=>e===error);assert.equal(f.engine.capabilities().memory.retainedBytes,before);
  const retry=f.engine.unloadM3Models(),onlyRemaining=await f.control.next();onlyRemaining.resolve();await retry;assert.equal(f.control.count,3);assert.equal(f.engine.capabilities().memory.retainedBytes,before-payloadBytes(f.models));
 }finally{await f.cleanup();}
});

test('concurrent adapter close requests coalesce the same real disposer rather than double-closing the worker',async t=>{
 const control=controlledDisposal(t),budget=new Budget(64*1024**2),adapter=createM3Adapter({budget,profile:{maxWorkers:1},version:'lifecycle-test'}),input=source(),image={pixels:input.pixels,sha256:'fixture',provenance:{decoder:'fixture'}};
 try{await adapter.load({models:{}});await adapter.run(task(),image);const one=adapter.clearImages('source'),two=adapter.clearImages('source'),gate=await control.next();assert.equal(control.count,1);gate.resolve();await Promise.all([one,two]);assert.equal(budget.total(),payloadBytes({models:{}}));}finally{control.releaseAll();await adapter.dispose();assert.equal(budget.total(),0);}
});

test('SSG result provenance names the real author pipeline and explicitly identifies its paper-v2 protocol',async t=>{
 const f=await fixture(t);try{const result=await f.engine.run(task('source','SSG'));assert.equal(result.provenance.native,'word2phraseCMFD/PostP.m');assert.equal(result.provenance.protocol,'ssg-paper-v2-full');assert.equal(result.provenance.nativeSourceCommit,'66bb26eca0c7e95c76042d5bcca58f744d70a27d');assert.notEqual(result.provenance.native,'core/cloning2.py');}finally{await f.cleanup();}
});
