// Actual native OpenCV/WASM renderer, no feature extractor or learned model.
import test from 'node:test';import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';import {renderSparseCopy} from '../src/sparse-copy-view.js';
test('retained sparse final uses complete native tables and exact native drawing across view changes',async()=>{
 const width=112,height=64,image={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>i%251)},engine=createEngine({memoryBudgetBytes:1024*1024**2});
 const source=await engine.load({id:'im',bytes:Uint8Array.of(7),pixels:image}),params={algorithm:'XFeat',limit:6000},points=new Float64Array(56);
 for(let i=0;i<8;i++)points.set([10+(i%4%2)*18+(i>=4?60:0),10+Math.floor(i%4/2)*18,4,0,1,0,i],i*7);
 const data={params,points,pairs:Float64Array.of(0,4,.1,10,1,5,.1,20,2,6,.1,30,3,7,.1,40),groups:[Uint32Array.of(0,1,2,3)],colors:Uint8Array.of(255,0,0,255,0,0,255,0,0,255,0,0),bases:[Uint8Array.of(255,0,0,0,255,0,0,0)],models:[{matrix:[[1,0,60],[0,1,0],[0,0,1]],inliers:4}],windowResults:[{id:'zone-with-arbitrary-id',dataNatif:{unknown:Uint16Array.of(31,33),counter:9007199254740995n}}],preprocessing:{text_exclusions:[]}},retained={operation:'tampering.copyMove.sparse',sourceSha256:source.sha256,cloneWindowMode:'independent',params,data,provenance:{params,cloneWindowMode:'independent'}};
 try{
  const a={minimum:1,circles:true,lines:true,points:true,areas:true},b={...a,lines:false,areas:false,circles:false};
  for(const view of [a,b,a]){
   const frees=[],expected=await renderSparseCopy(image,data,view,{reserveMemory:n=>{const free=()=>{};frees.push([n,free]);return free;}}),result=await engine.renderRetainedNativeParameters({task:{id:'render',imageId:'im',operation:'tampering.copyMove.sparse',cloneWindowMode:'independent',params,view},retained}),actual=(await engine.readPixels({surfaceId:result.surface.id,revision:1,rect:{x:0,y:0,width,height}})).pixels;
   assert.deepEqual(actual,expected.pixels);assert.deepEqual(result.visible,expected.visible);assert.deepEqual(result.selectedGroups,expected.selectedGroups);assert.deepEqual(result.legend,expected.legend);assert.deepEqual(result.data.windowResults,data.windowResults);assert.deepEqual(result.data.points,data.points);assert.deepEqual(result.data.pairs,data.pairs);assert.equal(result.metrics.nativeAnalysisCalls,0);assert.equal(result.metrics.inferenceCalls,0);assert.equal(result.cloneWindowMode,'independent');assert.equal(result.provenance.cloneWindowMode,'independent');assert.notStrictEqual(result.data.points,data.points);await engine.releaseSurface(result.surface.id);assert.equal(engine.capabilities().memory.activeReservationBytes,0);
  }
 }finally{await engine.unload('im');const m=engine.capabilities().memory;assert.equal(m.retainedBytes,0);assert.equal(m.cacheBytes,0);assert.equal(m.activeReservationBytes,0);await engine.dispose();}
});
