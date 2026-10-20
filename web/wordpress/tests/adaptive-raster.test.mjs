import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptivePreview} from '../sherloq-browser/assets/adaptive-preview.js';
import {createParameterPreview,encodeParameterPreviewPng} from '../sherloq-browser/assets/tool-parameter-preview.js';
const request={operation:'inspection.adjust',params:{brightness:30},sourceIdentity:'source-a',logicalWidth:1024,logicalHeight:768};
function setup(calibrations=new Map()){
 const sources=new Map(),calls={sides:[],unloads:[],leases:0,releases:0,disposed:0,metrics:[]},adaptive=createAdaptivePreview({initialSide:32,calibrations,persist:false}),engine={async load({id,pixels}){sources.set(id,pixels);return{surface:{id:'surface-'+id,revision:1,width:pixels.width,height:pixels.height,format:'rgb8'}};},async run({imageId}){return{pixels:sources.get(imageId)};},async unload(id){calls.unloads.push(id);sources.delete(id);},async dispose(){sources.clear();calls.disposed++;}};
 const owner=createParameterPreview({adaptive,readSource:async({side,sourceIdentity,logicalWidth,logicalHeight})=>{calls.sides.push(side);const step=Math.ceil(Math.max(logicalWidth,logicalHeight)/side),width=Math.ceil(logicalWidth/step),height=Math.ceil(logicalHeight/step);return{sourceIdentity,logicalWidth,logicalHeight,pixels:{width,height,format:'rgb8',data:new Uint8Array(width*height*3)}};},engineFactory:async()=>engine,reserve:async({bytes})=>{calls.leases++;assert.ok(bytes>192*1024**2);return{id:calls.leases};},release:async()=>calls.releases++,onMetrics:m=>calls.metrics.push(m)});
 return{owner,calls,calibrations,sources,engine};
}
test('raster resolution grows beyond old fixed grids, while source cache and reservations stay bounded',async()=>{
 const h=setup();for(let i=0;i<10;i++){const answer=await h.owner.preview(request);assert.equal(answer.exact,false);assert.deepEqual(answer.metrics.requestedParams,request.params);assert.ok(answer.pixels.width*answer.pixels.height<=answer.metrics.admittedPixels);assert.ok(h.owner.state.cachedSourceGrids<=3);}
 assert.ok(Math.max(...h.calls.sides)>192);assert.ok(h.calls.unloads.length>0);assert.ok(h.sources.size<=3);assert.equal(h.calls.leases,1);await h.owner.dispose();assert.equal(h.calls.releases,1);assert.equal(h.sources.size,0);
});
test('calibration survives owner disposal and source changes, without preserving source buffers',async()=>{
 const h=setup();for(let i=0;i<8;i++)await h.owner.preview(request);const last=h.calls.sides.at(-1);await h.owner.dispose();const next=setup(h.calibrations);await next.owner.preview({...request,sourceIdentity:'new-source'});assert.ok(next.calls.sides[0]>=last/2);assert.ok(next.calls.sides[0]>32);await next.owner.dispose();assert.equal(next.calls.releases,1);
});
test('the derived PNG supports admitted larger previews losslessly instead of imposing the former256 ceiling',()=>{
 const pixels={width:513,height:257,format:'rgb8',data:new Uint8Array(513*257*3)};assert.ok(encodeParameterPreviewPng(pixels).length>pixels.data.length);assert.throws(()=>encodeParameterPreviewPng({...pixels,width:2049,data:new Uint8Array(2049*257*3)}),{code:'INVALID_INPUT'});
});
test('kernel admission counts RGB scratch units and current heaps before proposing a large grid',async()=>{
 const h=setup();h.engine.capabilities=async()=>({memory:{knownHeapCapacityBytes:64*1024**2,retainedBytes:20*1024**2,activeReservationBytes:0}});
 for(let i=0;i<12;i++){const answer=await h.owner.preview(request);if(i){const n=answer.pixels.width*answer.pixels.height;assert.ok(64*1024**2+20*1024**2+32*1024**2+n*(192+6)+2*1024**2<=192*1024**2);assert.ok(n<=answer.metrics.admittedPixels);}}
 await h.owner.dispose();assert.equal(h.calls.leases,h.calls.releases);
});
