import test from'node:test';import assert from'node:assert/strict';
import{Budget}from'../src/cache.js';import{createSegmentedBytes}from'../src/segmented-bytes.js';import{createRgbSurface}from'../src/rgb-surface.js';
import{createOriginalSamplesRegistry}from'../src/source-samples-core.js';
async function fixture({nack=false}={}){const budget=new Budget(1024**2),data=Uint8Array.from({length:12},(_,i)=>i),store=await createSegmentedBytes(12,{budget});await store.write(data,0);const original=createRgbSurface(store,{width:4,height:1,budget});let declines=nack?1:0;
 const surface=nack?{descriptor:original.descriptor,async readWindow(rect,hooks){const part=await original.readWindow(rect,hooks),release=part.release;part.release=()=>declines--===1?0:release();return part;}}:original;
 const record={kind:'image',surface,sha256:'ab'.repeat(32),sourcePrecision:{schema:'sherloq.source-precision/1',defaultWorkingDepth:8,coded:{depth:8,sampleType:'unsigned-integer'},decoded:{sampleType:'uint8',containerBits:8,role:'presentation'}}};let current=record;
 const registry=createOriginalSamplesRegistry({budget,getRecord:()=>current}),bindingOriginal={imageId:'same',sourceSurfaceId:surface.descriptor.id,sourceRevision:1,sourceSha256:record.sha256,kind:'encoded'};
 return{budget,record,registry,surface,original,bindingOriginal,change:next=>current=next,request:{imageId:'same',domain:'decoded',bindingOriginal},async close(){await registry.dispose();await original.dispose();assert.equal(budget.total(),0);}};}
test('captured old Core service still retires after record replacement, NACK and retry without targeting the new Original',async()=>{
 const f=await fixture({nack:true});try{const source=await f.registry.prepare(f.request),window=await f.registry.read({...source,rect:{x:0,y:0,width:1,height:1}}),held=f.budget.total();
  f.change({...f.record,sha256:'cd'.repeat(32)});assert.throws(()=>f.registry.read({...source,rect:{x:0,y:0,width:1,height:1}}),{code:'SOURCE_CHANGED'});
  await assert.rejects(f.registry.retire(window),value=>value===0);assert.equal(f.budget.total(),held);
  await f.registry.retire(window);await f.registry.retire(source);await f.registry.closeRecord(f.record);
  const still=await f.original.readWindow({x:0,y:0,width:1,height:1});assert.deepEqual(still.pixels.data,new Uint8Array([0,1,2]));await still.release();
 }finally{await f.close();}
});
test('a different selected surface/precision cannot silently replace a live decoded receipt',async()=>{
 const f=await fixture();try{const source=await f.registry.prepare(f.request),previous=f.record.sourcePrecision;f.record.sourcePrecision={...previous};
  assert.throws(()=>f.registry.read({...source,rect:{x:0,y:0,width:1,height:1}}),{code:'SOURCE_CHANGED'});await f.registry.retire(source);await f.registry.closeRecord(f.record);
 }finally{await f.close();}
});
test('registry retirement keeps pre-funded owners while useful budget is fully admitted',async()=>{
 const f=await fixture({nack:true});let pressure;try{const source=await f.registry.prepare(f.request),window=await f.registry.read({...source,rect:{x:0,y:0,width:1,height:1}});pressure=f.budget.reserve(f.budget.limit-f.budget.total());
  await assert.rejects(f.registry.retire(window),value=>value===0);assert.equal(f.budget.total(),f.budget.limit);await f.registry.retire(window);await f.registry.retire(source);await f.registry.closeRecord(f.record);pressure();pressure=null;
 }finally{pressure?.();await f.close();}
});

test('an unpublished read whose cleanup NACKed is retried locally at close without waiting for an impossible peer ACK',async()=>{
 const f=await fixture({nack:true});try{const source=await f.registry.prepare(f.request),primary=Object.freeze(new Error('publish refused'));
  await assert.rejects(f.registry.read({...source,rect:{x:0,y:0,width:1,height:1}},{publish(){throw primary;}}));assert.equal(f.registry.state.windows,1);
  await f.registry.closeRecord(f.record);assert.equal(f.registry.state.windows,0);const still=await f.original.readWindow({x:0,y:0,width:1,height:1});assert.deepEqual(still.pixels.data,new Uint8Array([0,1,2]));await still.release();
 }finally{await f.close();}
});
