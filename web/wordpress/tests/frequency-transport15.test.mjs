// Controlled API plumbing only: inert engine, no FFT/Worker/GPU/numerical oracle.
import test from 'node:test';import assert from 'node:assert/strict';
import {createParameterPreview} from '../sherloq-browser/assets/tool-parameter-preview.js';
import {reportAdaptivePreviewComputed,reportAdaptivePreviewPresented} from '../sherloq-browser/assets/adaptive-preview.js';
const MiB=1024**2;
test('real preview consumer passes actual grid/cache status, counts scratch before creation and preserves explicit adaptive injection',async()=>{
 const oldPerformance=globalThis.performance;let time=0;Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>time}});
 const held=new Set(),images=new Map(),built=new Set(),reads=[],runs=[],reserved=[];let created=0,disposed=0,failClose=false;
 const preview=createParameterPreview({readSource:async({logicalWidth,logicalHeight,side})=>{reads.push(side);const step=Math.max(1,Math.ceil(Math.max(logicalWidth,logicalHeight)/side)),width=Math.ceil(logicalWidth/step),height=Math.ceil(logicalHeight/step);return{pixels:{width,height,format:'rgb8',data:new Uint8Array(width*height*3)}};},reserve:async value=>{reserved.push(value.bytes);held.add(value);return value},release:async value=>{assert(held.delete(value))},updateReservation:async()=>({}),engineFactory:async()=>{assert.equal(held.size,1);created++;return{
  capabilities:async()=>({resourceProfile:{maxWorkers:10},memory:{knownHeapCapacityBytes:32*MiB,activeReservationBytes:0,retainedBytes:0,cacheBytes:0}}),
  load:async input=>{images.set(input.id,input.pixels);return{surface:{id:input.id}}},unload:async id=>images.delete(id),
  run:async task=>{const pixels=images.get(task.imageId),baseCached=built.has(task.imageId);built.add(task.imageId);time+=baseCached?12:900;runs.push({params:structuredClone(task.params),backend:task.backend,width:pixels.width,height:pixels.height,baseCached});return{pixels,metrics:{baseCached,analysisCached:false}}},
  dispose:async()=>{disposed++;if(failClose)throw 0;images.clear();built.clear();}
 };}});
 try{
  const request={operation:'detail.frequency',params:{split:33,smooth:0,threshold:0,filter:0},field:'split',sourceIdentity:['sha','domain'],logicalWidth:129,logicalHeight:46};
  const a=await preview.preview(request);assert.deepEqual(a.metrics.inputDimensions,[65,23]);assert.equal(a.metrics.adaptivePreview.feedback.learnedWarmGrid,false);assert.equal(reportAdaptivePreviewComputed(a.metrics),null);
  const feedback=reportAdaptivePreviewPresented(a.metrics,{milliseconds:901,displayMilliseconds:1});
  const b=await preview.preview({...request,params:{...request.params,split:51},adaptiveFeedback:feedback});assert.deepEqual(b.metrics.inputDimensions,[65,23]);assert.equal(b.metrics.adaptivePreview.feedback.learnedWarmGrid,true);assert.equal(b.metrics.adaptivePreview.feedback.calibration.grids[0].ms,12);
  const c=await preview.preview({...request,params:{...request.params,split:67}});assert.deepEqual(c.metrics.inputDimensions,[129,46]);assert.equal(c.metrics.adaptivePreview.feedback.learnedWarmGrid,false,'new grid must build its own bases');
  const d=await preview.preview(request);assert.deepEqual(d.metrics.inputDimensions,[129,46]);assert.equal(d.metrics.adaptivePreview.feedback.learnedWarmGrid,true);assert.equal(created,1);assert.equal(reads.length,2);assert.deepEqual(runs.map(r=>r.params.split),[33,51,67,33]);assert(runs.every(r=>r.backend==='cpu'),'existing proxy backend unchanged');assert.ok(reserved[0]>192*MiB,'outer lease includes UI sampling and distinct sizing scratch');
  failClose=true;await assert.rejects(preview.reset(),error=>error===0);assert.equal(held.size,1,'failed ACK retains credit');failClose=false;await preview.dispose();assert.equal(held.size,0);assert.equal(disposed,2);
 }finally{Object.defineProperty(globalThis,'performance',{configurable:true,value:oldPerformance});}
});
test('explicit adaptive:false keeps the former fixed-side plumbing with no Frequency model',async()=>{
 let reads=0;const p=createParameterPreview({adaptive:false,readSource:async()=>{reads++;return{width:4,height:3,format:'rgb8',data:new Uint8Array(36)}},engineFactory:async()=>({load:async()=>({surface:{id:'s'}}),run:async()=>({pixels:{width:4,height:3,format:'rgb8',data:new Uint8Array(36)}}),dispose:async()=>{}})});
 const r=await p.preview({operation:'detail.frequency',params:{split:33,smooth:0,threshold:0,filter:0},sourceIdentity:'A',logicalWidth:4,logicalHeight:3});assert.equal(r.metrics.adaptivePreview,null);assert.equal(p.state.frequencySizing,undefined);assert.equal(reads,1);await p.dispose();
});
