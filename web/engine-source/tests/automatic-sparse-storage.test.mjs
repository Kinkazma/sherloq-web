import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createAutomaticRuntime} from '../src/automatic-runtime.js';
import {SparseCopyEngine} from '../src/sparse-copy.js';
import {DenseCopyEngine} from '../src/dense-copy.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {EngineError} from '../src/errors.js';

test('automatic sparse adapter forwards lazy source storage and leaves borrowed session ownership with the source',async t=>{
 const budget=new Budget(4*1024**2),pixels={width:16,height:16,format:'rgb8',data:new Uint8Array(768)};
 let opened=0,closed=0,disposed=0,attempts=0,session;
 const image={pixels,sha256:'a'.repeat(64),provenance:{source:'protocol-test'},get session(){return session;},async ensureTemporarySession(){opened++;return session??={async create(length){const bytes=new Uint8Array(length);return {write(value,offset){bytes.set(value,offset);},readInto(target,offset){target.set(bytes.subarray(offset,offset+target.length));},flush(){},dispose(){disposed++;}};},dispose(){closed++;}};}};
 // Only the adapter protocol is under test. No detector outputs are fabricated
 // or used as scientific evidence; reaching storage is an explicit group error.
 t.mock.method(DenseCopyEngine.prototype,'analyze',async()=>{throw new EngineError('TEST_SKIPPED','Unrelated dense computation');});
 t.mock.method(SparseCopyEngine.prototype,'analyze',async function(params,hooks){
  attempts++;assert.equal(this.image,pixels);assert.ok(hooks.storageContext);assert.equal(hooks.storageContext.temporarySession,session);
  const store=await createSegmentedBytes(64,{budget,storage:'temporary',...hooks.storageContext});
  try{const expected=Uint8Array.from({length:64},(_,i)=>i*3);await store.write(expected);const actual=new Uint8Array(64);await store.readInto(actual);assert.deepEqual(actual,expected);}finally{await store.dispose();}
  throw new EngineError('TEST_STORAGE_REACHED','Borrowed storage read/write completed');
 });
 const runtime=createAutomaticRuntime({budget,profile:{maxWorkers:1},version:'test',getLanguage:()=>({data:new Uint8Array(1),sha256:'b'.repeat(64)}),getD2prl:()=>null});
 const polygon=[[0,0],[15,0],[15,15],[0,15]],task={id:'a',imageId:'source',operation:'analysis.clones',params:{selection:{regions:[polygon],envelope:polygon,disabled:[]}}};
 try{
  const result=await runtime.run(task,image);assert.equal(result.data.state.errors.sift.code,'TEST_STORAGE_REACHED');assert.equal(opened,1);assert.equal(disposed,1);assert.equal(closed,0);
  const cached=await runtime.run({...task,id:'cached'},image);assert.equal(cached.analysisId,result.analysisId);assert.equal(attempts,1);
  await runtime.clear();assert.equal(closed,0);assert.equal(budget.total(),0);
 }finally{await runtime.dispose();await session?.dispose();}
 assert.equal(closed,1);
});

test('automatic SIFT consumes bounded source rows and windows without retaining full RGB',async t=>{
 const budget=new Budget(4*1024**2),width=4096,height=4096,requests=[];
 const image={segmented:true,sha256:'a'.repeat(64),provenance:{source:'row-protocol-test'},surface:{descriptor:{width,height,format:'rgb8'},async readWindow(rect){requests.push(rect);assert.ok(rect.height<height,'automatic SIFT must not materialize the full source');const free=budget.reserve(rect.width*rect.height*3);return {pixels:{...rect,format:'rgb8',data:new Uint8Array(rect.width*rect.height*3)},release:free};}}};
 t.mock.method(DenseCopyEngine.prototype,'analyze',async()=>{throw new EngineError('TEST_SKIPPED','Unrelated dense computation');});
 t.mock.method(SparseCopyEngine.prototype,'analyze',async function(params,hooks){assert.equal(this.image.data,undefined);assert.equal(this.image.width,width);assert.equal(this.image.height,height);const rows=await this.image.readRows(7,2);rows.release();const crop=await this.image.readWindow({x:13,y:19,width:23,height:3});crop.release();throw new EngineError('TEST_ROWS_REACHED','Bounded original source reached');});
 const runtime=createAutomaticRuntime({budget,profile:{maxWorkers:1},version:'test',getLanguage:()=>({data:new Uint8Array(1),sha256:'b'.repeat(64)}),getD2prl:()=>null}),polygon=[[0,0],[4095,0],[4095,4095],[0,4095]];
 try{const result=await runtime.run({id:'a',imageId:'source',operation:'analysis.clones',params:{selection:{regions:[polygon],envelope:polygon,disabled:[]}}},image);assert.equal(result.data.state.errors.sift.code,'TEST_ROWS_REACHED');assert.deepEqual(requests,[{x:0,y:7,width,height:2},{x:13,y:19,width:23,height:3}]);}finally{await runtime.dispose();}assert.equal(budget.total(),0);
});
