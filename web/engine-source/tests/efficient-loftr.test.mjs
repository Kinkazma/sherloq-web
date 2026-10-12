import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {EfficientLoFtrEngine} from '../src/efficient-loftr.js';
import {EFFICIENT_LOFTR_ASSET,efficientLoFtrRuntimes} from '../src/efficient-loftr-assets.js';
import {efficientLoFtrParams,efficientLoFtrCrop,efficientLoFtrWorkspace,prepareEfficientLoFtr,
 transformEfficientLoFtr,mapEfficientLoFtrPoint,efficientLoFtrInside} from '../src/efficient-loftr-input.js';
const image={width:128,height:64,format:'rgb8',data:new Uint8Array(128*64*3).fill(128)},
 regions=[[[0,0],[48,0],[48,48],[0,48]],[[64,0],[112,0],[112,48],[64,48]]],
 profile={maxWorkers:4},hooks={models:{eloftr:{...EFFICIENT_LOFTR_ASSET,url:'https://example.test/model.onnx'}},backend:'cpu'},
 params={regions,model:'None',minimum:0,tolerance:50,geometricMinimum:4};
function fakeResult(points=[[16,16],[24,16],[16,24],[24,24]]){return {keypoints0:{data:Float32Array.from(points.flat()),dims:[points.length,2]},keypoints1:{data:Float32Array.from(points.flat()),dims:[points.length,2]},confidence:{data:new Float32Array(points.length).fill(.9),dims:[points.length]}};}
function fakeFactory(budget,{fail,output=fakeResult(),paused}={}){
 const state={starts:0,closed:0,active:0,peak:0,leases:0,inputs:[]};
 state.factory=()=>({async run(name,inputs,options){state.starts++;state.inputs.push(inputs);state.active++;state.peak=Math.max(state.peak,state.active);try{
  if(paused)await paused(inputs,options,state);
  if(fail)throw fail;
  const release=budget.reserve(Object.values(output).reduce((n,t)=>n+t.data.byteLength,0));state.leases++;let live=true;
  return {result:output,metrics:{provider:'wasm',threads:2,preflightExecutions:0},release(){if(live){live=false;state.leases--;release();}}};
 }finally{state.active--;}}
 ,dispose(){state.closed++;}});return state;
}
test('explicit two-region pair and pinned identity are required before useful reads',async()=>{
 const budget=new Budget(4*1024**3),state=fakeFactory(budget);let reads=0;
 const engine=new EfficientLoFtrEngine({...image,data:undefined,async readRows(){reads++;throw Error('unwanted read');}},budget,profile,{poolFactory:state.factory});
 for(const input of [{},{...params,compare:false},{...params,regions:[regions[0],regions[0]]},{...params,rotations:[45]},{...params,threshold:0}])await assert.rejects(engine.analyze(input,hooks),e=>e.code==='INVALID_INPUT');
 await assert.rejects(engine.analyze(params,{models:{eloftr:{...hooks.models.eloftr,sha256:'0'.repeat(64)}}}),e=>e.code==='INVALID_INPUT');
 assert.equal(reads,0);assert.equal(state.starts,0);assert.equal(budget.total(),0);
});
test('grey preparation reads only required rows, admits temporary buffers and pads after content',async()=>{
 const rgb={width:4,height:3,format:'rgb8',data:Uint8Array.from([255,0,0, 0,255,0, 0,0,255, 255,255,255,...new Array(24).fill(128)])},budget=new Budget(1024**2);
 const crop=efficientLoFtrCrop(rgb,[[0,0],[3,0],[3,0],[0,0]],832),out=await prepareEfficientLoFtr(rgb,crop,{reserveMemory:n=>budget.reserve(n)});
 assert.equal(out.data[0],Math.fround(76/255));assert.equal(out.data[1],Math.fround(150/255));assert.equal(out.data[2],Math.fround(29/255));assert.equal(out.data[3],1);
 assert.equal(out.data[4],0);assert.equal(out.data[32],0);assert.deepEqual(out.dims,[1,1,32,32]);assert.equal(budget.total(),out.data.byteLength);out.release();assert.equal(budget.total(),0);
 let reads=[],released=0;const rows={...rgb,data:undefined,async readRows(y,count){reads.push([y,count]);return {pixels:{data:rgb.data.subarray(y*12,(y+1)*12)},release(){released++;}};}};
 const second=await prepareEfficientLoFtr(rows,crop,{reserveMemory:n=>budget.reserve(n)});assert.deepEqual(reads,[[0,1]]);assert.equal(released,1);second.release();assert.equal(budget.total(),0);
});
test('row read rejection/cancellation and second reservation failure free preparation',async()=>{
 const budget=new Budget(1024**2),crop=efficientLoFtrCrop(image,regions[0],832),cause=new EngineError('NETWORK_TRANSIENT','row fetch refused');
 await assert.rejects(prepareEfficientLoFtr({...image,data:undefined,async readRows(){throw cause;}},crop,{reserveMemory:n=>budget.reserve(n)}),e=>e===cause);assert.equal(budget.total(),0);
 const small=new Budget(crop.widthPadded*crop.heightPadded*4+1);await assert.rejects(prepareEfficientLoFtr(image,crop,{reserveMemory:n=>small.reserve(n)}),e=>e.code==='MEMORY_LIMIT');assert.equal(small.total(),0);
 const c=new AbortController();c.abort();await assert.rejects(prepareEfficientLoFtr(image,crop,{signal:c.signal,reserveMemory:n=>budget.reserve(n)}),e=>e.code==='CANCELLED');assert.equal(budget.total(),0);
});
test('quarter turns and mirrors invert every content pixel, including a non-square padded region',()=>{
 const crop={x:10,y:20,width:5,height:3,contentWidth:5,contentHeight:3,widthPadded:32,heightPadded:32},budget=new Budget(1024**2),data=new Float32Array(32*32);
 for(let y=0;y<3;y++)for(let x=0;x<5;x++)data[y*32+x]=y*5+x+1;
 for(const rotation of [0,90,180,270])for(const reflected of [false,true]){
  const variant={rotation,reflected},result=transformEfficientLoFtr({data,crop},variant,{reserveMemory:n=>budget.reserve(n)}),width=result.dims?.[3]??32,height=result.dims?.[2]??32;
  let seen=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(result.data[y*width+x]){
   const point=mapEfficientLoFtrPoint(x,y,crop,variant),id=result.data[y*width+x]-1;assert.deepEqual(point,[10+id%5,20+Math.floor(id/5)]);seen++;
  }assert.equal(seen,15);result.release();assert.equal(budget.total(),0);
 }
 assert.equal(mapEfficientLoFtrPoint(10,10,crop),null);
 assert.deepEqual(mapEfficientLoFtrPoint(0,0,{...crop,width:10,height:6}),[10.5,20.5]);
});
test('polygon filters include edges and reject padded/unrequested areas',()=>{
 const poly=[[0,0],[10,0],[5,10]];assert.equal(efficientLoFtrInside([5,0],poly),true);assert.equal(efficientLoFtrInside([5,5],poly),true);assert.equal(efficientLoFtrInside([9,9],poly),false);
});
test('UI rectangle vertices are inclusive pixel centres, including the final source pixel',async()=>{
 const rgb={width:320,height:320,format:'rgb8',data:new Uint8Array(320*320*3)},polygon=[[0,0],[319,0],[319,319],[0,319]],budget=new Budget(2*1024**2);
 rgb.data.fill(255,(319*320+319)*3);
 const crop=efficientLoFtrCrop(rgb,polygon,832);assert.equal(crop.width,320);assert.equal(crop.height,320);
 const prepared=await prepareEfficientLoFtr(rgb,crop,{reserveMemory:n=>budget.reserve(n)});
 assert.equal(prepared.data[319*320+319],1);assert.deepEqual(mapEfficientLoFtrPoint(319,319,crop),[319,319]);
 prepared.release();assert.equal(budget.total(),0);
});
test('activation bounds scale with both padded token counts and enforce 2 GiB only before inference',async()=>{
 const a=efficientLoFtrWorkspace({width:832,height:832},{width:832,height:832});assert.equal(a.maximumMatches,10000);assert.equal(a.outputBytes,10000*20);assert(a.workspaceBytes>1024**3&&a.workspaceBytes<2*1024**3);
 const b=efficientLoFtrWorkspace({width:416,height:832},{width:832,height:416});assert(b.workspaceBytes<a.workspaceBytes);
 assert.throws(()=>efficientLoFtrWorkspace({width:831,height:832},{width:832,height:832}),e=>e.code==='INVALID_INPUT');
 const budget=new Budget(8*1024**3),big={format:'rgb8',width:5000,height:2500,async readRows(){throw Error('unexpected read');}},state=fakeFactory(budget),engine=new EfficientLoFtrEngine(big,budget,profile,{poolFactory:state.factory});
 await assert.rejects(engine.analyze({...params,longSide:2048,regions:[[[0,0],[2000,0],[2000,2000],[0,2000]],[[2500,0],[4500,0],[4500,2000],[2500,2000]]]},hooks),e=>e.code==='MEMORY_LIMIT');assert.equal(state.starts,0);assert.equal(budget.total(),0);
});
test('real result contract maps matches to original regions, retains output lease and frees workers',async()=>{
 const budget=new Budget(4*1024**3),state=fakeFactory(budget),engine=new EfficientLoFtrEngine(image,budget,profile,{poolFactory:state.factory});
 const r=await engine.analyze(params,hooks);assert.equal(r.pairs.length,16);assert.equal(r.points.length,56);assert.equal(r.groups.length,1);assert.deepEqual(Array.from(r.groups[0]),[0,1,2,3]);assert.equal(r.points[0],16);assert.equal(r.points[7],80);assert.equal(r.points[1],16);assert.equal(r.pairs[3],64);assert.equal(r.pair_search_regions.length,4);assert.equal(r.backend,'cpu');assert.equal(r.metadata.preflightExecutions,0);assert.equal(state.closed,1);assert.equal(state.leases,0);assert.equal(state.inputs[0].threshold.dims.length,0);assert(budget.total()>0);r.release();r.release();assert.equal(budget.total(),budget.cacheBytes);assert(budget.cacheBytes>0);await engine.dispose();assert.equal(budget.total(),0);
});
test('zero matches is a successful empty result without geometry allocation or inference replay',async()=>{
 const budget=new Budget(4*1024**3),state=fakeFactory(budget,{output:fakeResult([])}),engine=new EfficientLoFtrEngine(image,budget,profile,{poolFactory:state.factory}),r=await engine.analyze(params,hooks);
 assert.equal(r.pairs.length,0);assert.equal(r.groups.length,0);assert.equal(state.starts,1);assert.equal(state.closed,1);assert(budget.peak<1024**2);r.release();assert.equal(budget.total(),budget.cacheBytes);await engine.dispose();assert.equal(budget.total(),0);
});
test('variant jobs reach common admission concurrently and do not merge distinct transform contexts',async()=>{
 const budget=new Budget(4*1024**3),state=fakeFactory(budget,{paused:async()=>new Promise(resolve=>setTimeout(resolve,5))}),engine=new EfficientLoFtrEngine(image,budget,profile,{poolFactory:state.factory}),r=await engine.analyze({...params,rotations:[0,180],reflections:true},hooks);
 assert.equal(state.starts,4);assert.equal(state.peak,4);assert.equal(r.metadata.matching.length,4);assert.deepEqual([...new Set(r.pair_search_regions)],[0,1,2,3]);assert.equal(r.groups.length,4);r.release();assert.equal(budget.total(),budget.cacheBytes);await engine.dispose();assert.equal(budget.total(),0);
});
test('precise inference cause cancels peers and all source/transformed/output leases settle',async()=>{
 const budget=new Budget(4*1024**3),cause=new EngineError('NEURAL_EXECUTION','precise operator failed',{cause:Error('original cause')}),state=fakeFactory(budget,{fail:cause,paused:async()=>new Promise(resolve=>setTimeout(resolve,5))}),engine=new EfficientLoFtrEngine(image,budget,profile,{poolFactory:state.factory});
 await assert.rejects(engine.analyze({...params,rotations:[0,90]},hooks),e=>e===cause&&e.cause.message==='original cause');assert.equal(state.active,0);assert.equal(state.closed,1);assert.equal(state.leases,0);assert.equal(budget.total(),0);
});
test('invalid outputs and cancellation preserve zero accounting and forbid concurrent analyze',async()=>{
 const budget=new Budget(4*1024**3),malformed=fakeResult();malformed.keypoints0.data[0]=NaN;const state=fakeFactory(budget,{output:malformed}),engine=new EfficientLoFtrEngine(image,budget,profile,{poolFactory:state.factory});
 await assert.rejects(engine.analyze(params,hooks),e=>e.code==='INVALID_INPUT');assert.equal(budget.total(),0);
 const state2=fakeFactory(budget,{paused:async(inputs,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new EngineError('CANCELLED','Cancelled')),{once:true}))}),second=new EfficientLoFtrEngine(image,budget,profile,{poolFactory:state2.factory});
 const run=second.analyze(params,hooks);await new Promise(resolve=>setTimeout(resolve,10));await assert.rejects(second.analyze(params,hooks),e=>e.code==='INVALID_INPUT');const disposed=second.dispose();await assert.rejects(run,e=>e.code==='CANCELLED');await disposed;assert.equal(budget.total(),0);assert.equal(state2.active,0);
});
test('owned runtime URLs reuse existing local M3 binaries and admit rather than guess memory',async()=>{
 const r=efficientLoFtrRuntimes();assert(r.wasm.ortUrl.endsWith('/vendor/m3-ort/ort.wasm.min.mjs'));assert(r.wasm.wasmUrl.endsWith('/vendor/d2prl/ort-wasm-simd-threaded.wasm'));assert(r.webgpu.factoryUrl.endsWith('/src/efficient-loftr-runtime-gpu-factory.mjs'));
 const {default:factory}=await import('../src/efficient-loftr-runtime-factory.mjs');const old=globalThis.__sherloqNeuralMemoryPages;try{globalThis.__sherloqNeuralMemoryPages=32769;await assert.rejects(factory({}),/Unadmitted/);}finally{globalThis.__sherloqNeuralMemoryPages=old;}
});
test('published user limit picks globally strongest valid confidences, preserves owners and tie order',async()=>{
 const budget=new Budget(4*1024**3),output=fakeResult();output.confidence.data.set([.4,.8,.8,.9]);
 const state=fakeFactory(budget,{output}),engine=new EfficientLoFtrEngine(image,budget,profile,{poolFactory:state.factory}),r=await engine.analyze({...params,rotations:[0,180],limit:3},hooks);
 assert.equal(r.pairs.length/4,3);assert.deepEqual(Array.from(r.pair_search_regions),[0,0,1]);
 assert.deepEqual(Array.from(r.pairs.filter((_,i)=>i%4===2)),[Math.fround(.8),Math.fround(.9),Math.fround(.9)]);
 assert.equal(r.points[0],24);assert.equal(r.points[14],24);assert.equal(r.metadata.publicationFilter.eligibleMatches,8);assert.equal(r.metadata.publicationFilter.keptMatches,3);assert.equal(r.metadata.rawMatches,8);r.release();assert.equal(budget.total(),budget.cacheBytes);
 await assert.rejects(engine.analyze({...params,limit:0},hooks),e=>e.code==='INVALID_INPUT');await engine.dispose();assert.equal(budget.total(),0);
});
test('raw cache re-filters/regroups output without source reads, CNN work or admission; eviction/dispose retires buffers',async()=>{
 const budget=new Budget(4*1024**3),state=fakeFactory(budget);let reads=0;
 const rows={...image,data:undefined,async readRows(y,count){reads++;return{pixels:{data:image.data.subarray(y*image.width*3,(y+count)*image.width*3)},release(){}};}},engine=new EfficientLoFtrEngine(rows,budget,profile,{poolFactory:state.factory});
 const first=await engine.analyze({...params,rotations:[0,180]},hooks);const sourceReads=reads;assert.equal(first.metadata.inferenceExecutions,2);first.release();assert(budget.cacheBytes>0);
 const second=await engine.analyze({...params,rotations:[0,180],limit:2,tolerance:30,minimum:10,excluded:[[[0,0],[20,0],[20,20],[0,20]]]},hooks);
 assert.equal(state.starts,2);assert.equal(reads,sourceReads);assert.equal(second.metadata.inferenceExecutions,0);assert.equal(second.metadata.rawCacheHits,2);assert(second.metadata.matching.every(m=>m.cacheHit&&m.cpuGranted===0&&m.gpuGranted===0&&m.workers===0));assert.equal(second.pairs.length/4,2);second.release();assert.equal(budget.active,0);
 const third=await engine.analyze({...params,rotations:[0,180],threshold:.3},hooks);assert.equal(state.starts,4);assert.equal(third.metadata.inferenceExecutions,2);third.release();
 budget.clearPrefix(engine.prefix);assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);
 const fourth=await engine.analyze(params,hooks);assert.equal(state.starts,5);fourth.release();await engine.dispose();assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);
});
