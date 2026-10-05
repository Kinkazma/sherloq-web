import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeometryKernel} from '../src/copy-geometry.js';
import {renderSparseCopy} from '../src/sparse-copy-view.js';
import {createDenseAdapter} from '../src/dense-adapter.js';
import {createResultSurfaces} from '../src/segmented-results.js';
import {Budget} from '../src/cache.js';

const image={format:'rgb8',width:96,height:72,data:new Uint8Array(96*72*3).fill(90)};
function evidence(){
 const points=new Float32Array(8*7),pairs=new Float64Array(4*4);
 for(let i=0;i<4;i++){const x=8.25+i%2*16,y=10.5+Math.floor(i/2)*16;points.set([x,y,7,0,1,0,0],i*7);points.set([x+48,y+20,7,0,1,0,0],(i+4)*7);pairs.set([i,i+4,.1,52],i*4);}
 return {points,pairs,colors:new Uint8Array([255,60,20,255,80,20,255,100,20,255,120,20]),groups:[new Uint32Array([0,1,2,3])],bases:[[20,160,240]],models:[],dense_maps:[],metrics:{},release(){}};
}
test('native renderer widens dense float32 subarrays exactly, with all drawing flags',async()=>{
 const r=evidence(),copy=r.points.slice(),storage=new Float32Array(r.points.length+5);storage.set(r.points,3);const points=storage.subarray(3,3+r.points.length);
 const kernel=await createGeometryKernel({reserveMemory:()=>{}});
 try{for(const flags of [0,1,2,4,8,15]){
  const render=p=>{const out=kernel.renderer(image,p,r.pairs,r.colors);try{out.group(r.groups[0],r.bases[0],flags);return out.pixels();}finally{out.dispose();}};
  const compact=render(points);assert.deepEqual(compact,render(Float64Array.from(points)));if(flags)assert.notDeepEqual(compact,image.data);else assert.deepEqual(compact,image.data);
 }assert.deepEqual(points,copy);assert.deepEqual(r.points,copy);}finally{kernel.dispose();}
});
test('dense adapter publishes actual native surface and reuses evidence for view changes',async()=>{
 const budget=new Budget(768*1024**2),surfaces=new Map(),registry=createResultSurfaces(surfaces),raw=evidence();let analyses=0,releases=0;
 raw.release=()=>releases++;
 const adapter=createDenseAdapter({budget,profile:{maxWorkers:2},version:'regression',publishResult:(id,r)=>registry.publish(id,r),create:()=>({analyze:async()=>{analyses++;return raw;},dispose(){}})});
 const run=view=>adapter.run({id:'draw',imageId:'source',params:{profile:'PatchMatch Zernike'},view},{pixels:image,sha256:'fixture',provenance:{}});
 try{
  const first=await run({circles:false,lines:false,areas:true});assert.equal(first.status,'ok');assert.deepEqual(first.visible,[[0,4]]);assert.ok(first.data.points instanceof Float32Array);
  const record=surfaces.get(first.surface.id).record,window=await record.surface.readWindow();try{assert.notDeepEqual(window.pixels.data,image.data);}finally{window.release();}
  const second=await run({circles:true,lines:true,areas:false});assert.equal(second.metrics.cache.result,true);assert.equal(analyses,1);
  await registry.release(first.surface.id);await registry.release(second.surface.id);
 }finally{await registry.clear();await adapter.dispose();}
 assert.equal(releases,1);assert.equal(budget.total(),0);
});
test('presentation failure and cancellation return all admitted memory',async()=>{
 for(const fail of ['invalid','cancel']){
  const budget=new Budget(768*1024**2),releases=[],controller=new AbortController(),raw=evidence();
  if(fail==='invalid')raw.points=new Int32Array(raw.points.length);
  else controller.abort();
  try{await assert.rejects(renderSparseCopy(image,raw,{}, {signal:controller.signal,reserveMemory:n=>{const release=budget.reserve(n);releases.push(release);return release;}}),{code:fail==='invalid'?'INVALID_INPUT':'CANCELLED'});}finally{releases.forEach(f=>f());}
  assert.equal(budget.total(),0);
 }
});
