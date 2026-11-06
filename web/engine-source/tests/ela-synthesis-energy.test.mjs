import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {describeEnergy,describeEnergyFromResidualRGB} from '../src/energy-primitives.js';
import {createEnergyRows,segmentedResidualEnergyPlane} from '../src/energy-stream.js';
import {prepareEnergy} from '../src/energy-prepare.js';
import {prepareSegmentedEnergy} from '../src/energy-prepare-stream.js';
import {estimateEnergy} from '../src/energy-auto.js';
import {estimateSegmentedEnergy} from '../src/energy-auto-stream.js';
import {nativeEnergyScores} from '../src/energy-score-native.js';
import {computeElaSynthesisEnergy,createElaSynthesisEnergyCache} from '../src/ela-synthesis-energy.js';
import {streamEnergyNpz} from '../src/energy-npz-stream.js';
import {segmentedEnergyResult} from '../src/segmented-energy-result.js';
const f=Math.fround,log=Math.log;
const bytesStore=data=>({byteLength:data.byteLength,readInto(target,offset=0){target.set(data.subarray(offset,offset+target.length));},dispose(){}});
const source=(data,width,height,budget)=>({sha256:'a'.repeat(64),surface:createRgbSurface(bytesStore(data),{width,height,budget,ownsStore:false})});
const read=async store=>{const out=new Uint8Array(store.byteLength);await store.readInto(out,0);return out;};
function fixture(width,height){return Uint8Array.from({length:width*height*3},(_,i)=>{const p=Math.floor(i/3),x=p%width,y=Math.floor(p/width);return(i%3===0?x*23+y*19:i%3===1?x*7+y*31:x*13+y*3)%256;});}

test('direct residual RGB primitive and row stream preserve native gray/7x7 order at tiny borders and SIMD tails',async()=>{
 for(const [width,height]of [[1,1],[2,3],[4,5],[5,4],[7,9],[9,7],[33,35]]){
  const data=fixture(width,height),rgb={width,height,format:'rgb8',data},expected=await describeEnergy({...rgb,data:new Uint8Array(data.length)},rgb),actual=await describeEnergyFromResidualRGB(rgb);
  assert.deepEqual(actual.gray,expected.gray);assert.deepEqual(actual.energy,expected.energy);
  const budget=new Budget(8*1024**2),out=new Uint8Array(width*height*4),rows=createEnergyRows(width,height,{budget,write:(bytes,y)=>out.set(bytes,y*width*4)});
  try{for(let y=0;y<height;y+=2){const h=Math.min(2,height-y);await rows.pushResidual(data.subarray(y*width*3,(y+h)*width*3),{y,rows:h});}await rows.finish();assert.deepEqual(out,new Uint8Array(expected.energy.buffer));}finally{rows.dispose();}assert.equal(budget.total(),0);
 }
});

test('one real plane uses its own panel mean and signed score, with no inter-quality median',async()=>{
 const width=17,height=9,n=width*height,image={width,height,format:'rgb8',data:new Uint8Array(n*3).fill(90)},plane=Float32Array.from({length:n},(_,i)=>(i%41)+.25),base=await prepareEnergy(image,plane,[.1,.9],log,{planeCount:1,panelDetector:async()=>[],scoreBackend:'cpu'});
 assert.equal(base.energy_summary.length,1);assert.equal(base.energy_summary[0].probes.length,1);
 const center=f(base.energy_summary[0].probes[0].central_mean+.25);
 for(let i=0;i<n;i++){const score=f(log(f(center/f(plane[i]+.25)))/f(.2));assert.equal(base.energy_low_score[i],Math.max(score,0));assert.equal(base.energy_high_score[i],Math.max(-score,0));}
 const low=new Float32Array(n),high=new Float32Array(n);await nativeEnergyScores(plane,base.energy_scope,base.energy_summary,{low,high,log,planeCount:1});assert.deepEqual(low,base.energy_low_score);assert.deepEqual(high,base.energy_high_score);
 await assert.rejects(prepareEnergy(image,plane,[.1,.9],log,{panelDetector:async()=>[]}),{code:'INVALID_INPUT'});
});

test('segmented one-plane preparation, automatic profile sampling and GPU provider contract match contiguous CPU',async()=>{
 const width=17,height=9,n=width*height,rgb=new Uint8Array(n*3).fill(90),plane=Float32Array.from({length:n},(_,i)=>(i%41)+.25),budget=new Budget(32*1024**2),image=source(rgb,width,height,budget),store=bytesStore(new Uint8Array(plane.buffer));let cpu,gpu,calls=0;
 const provider={selectBackend:()=> 'webgpu',async runScores(planes,scope,summaries,options){calls++;assert.equal(options.planeCount,1);assert.equal(planes.length,n);assert.equal(summaries[0].probes.length,1);await nativeEnergyScores(planes,scope,summaries,options);return{backend:'webgpu-fake-dispatch-only',totalMs:1};}};
 try{
  const expected=await prepareEnergy({width,height,format:'rgb8',data:rgb},plane,[.1,.9],log,{planeCount:1,panelDetector:async()=>[],scoreBackend:'cpu'});
  cpu=await prepareSegmentedEnergy(image,[store],[.1,.9],log,{budget,polygons:[],planeCount:1,scoreBackend:'cpu'});
  gpu=await prepareSegmentedEnergy(image,[store],[.1,.9],log,{budget,polygons:[],planeCount:1,scoreBackend:'webgpu',scoreGpu:provider});assert.equal(calls,1);
  for(const field of ['energy_low_score','energy_high_score','energy_scope']){assert.deepEqual(await read(cpu[field]),new Uint8Array(expected[field].buffer));assert.deepEqual(await read(gpu[field]),new Uint8Array(expected[field].buffer));}
  assert.deepEqual(cpu.energy_summary,expected.energy_summary);assert.deepEqual(gpu.energy_summary,expected.energy_summary);
  const contiguous=await estimateEnergy({energy_planes:plane,energy_scope:expected.energy_scope,energy_summary:expected.energy_summary,energyPlaneCount:1},log);
  const streamed=await estimateSegmentedEnergy({...cpu,energy_planes:[store],energyPlaneCount:1},log,{budget});assert.deepEqual(streamed,contiguous);
 }finally{await cpu?.dispose();await gpu?.dispose();await image.surface.dispose();}assert.equal(budget.total(),0);
});

test('synthesis energy retains Original for panels/validity and publishes exactly one energy plane',async()=>{
 const width=80,height=80,n=width*height,budget=new Budget(64*1024**2),original=new Uint8Array(n*3).fill(90),residual=fixture(width,height),image=source(original,width,height,budget),synthesis=source(residual,width,height,budget);let computed,record,checkedOriginal=false;
 try{
  computed=await computeElaSynthesisEnergy(image,synthesis.surface,{block:16},{budget,scoreBackend:'cpu',synthesisKey:'verified-test-key',log,panelDetector:async candidate=>{assert.equal(candidate,image);checkedOriginal=true;return{polygons:[],dispose(){}};}});
  assert(checkedOriginal);assert.equal(computed.data.energy_planes.length,1);assert.equal(computed.data.energyPlaneCount,1);assert.equal(computed.data.metadata.energy.quality_confirmation,'median-already-aggregated');assert.equal(computed.metrics.energyRecompressions,0);assert.deepEqual(computed.data.metadata.qualities,[]);
  const expected=await describeEnergyFromResidualRGB({width,height,format:'rgb8',data:residual});assert.deepEqual(await read(computed.data.energy_planes[0]),new Uint8Array(expected.energy.buffer));
  record=await segmentedEnergyResult(computed.analysis,{budget});assert(record.planeRecords.energy_plane_0);assert.equal(record.planeRecords.energy_plane_1,undefined);assert(record.semantics.includes('synthesis'));await computed.dispose();computed=null;
  const part=await record.surface.readWindow({x:0,y:0,width:1,height:1});await part.release();
 }finally{await record?.surface.dispose();for(const item of Object.values(record?.planeRecords??{}))await item.surface.dispose();await computed?.dispose();await image.surface.dispose();await synthesis.surface.dispose();}assert.equal(budget.total(),0);
});

test('cancelled direct residual filtering and strict GPU absence fail honestly without leaving memory',async()=>{
 const budget=new Budget(32*1024**2),width=80,height=80,image=source(new Uint8Array(width*height*3).fill(90),width,height,budget),stop=new AbortController();stop.abort();
 try{await assert.rejects(segmentedResidualEnergyPlane(image.surface,{budget,signal:stop.signal}),{code:'CANCELLED'});assert.equal(budget.total(),0);await assert.rejects(computeElaSynthesisEnergy(image,image.surface,{block:16},{budget,scoreBackend:'webgpu'}),{code:'GPU_UNAVAILABLE'});assert.equal(budget.total(),0);}finally{await image.surface.dispose();}
});


test('one-plane scientific NPZ declares and stores exactly one native plane',async()=>{
 const width=17,height=9,n=width*height,budget=new Budget(16*1024**2),plane=Float32Array.from({length:n},(_,i)=>i/7),analysis={width,height,energyPlaneCount:1,energy_planes:[bytesStore(new Uint8Array(plane.buffer))],metadata:{method:'ela_energy_synthesis',energyPlaneCount:1,quality:null,qualities:[]}};
 for(const key of ['energy_low_score','energy_high_score','energy_scope','energy_labels'])analysis[key]=bytesStore(new Uint8Array(n*4));let result;
 try{result=await streamEnergyNpz(analysis,{test:'synthesis-one-real-plane'},{storage:'memory'},{budget});const bytes=await read(result.store),view=new DataView(bytes.buffer),decode=new TextDecoder();let at=0,found=false;
  while(view.getUint32(at,true)===0x04034b50){const size=view.getUint32(at+18,true),nameLength=view.getUint16(at+26,true),extraLength=view.getUint16(at+28,true),name=decode.decode(bytes.subarray(at+30,at+30+nameLength)),start=at+30+nameLength+extraLength;
   if(name==='energy_planes.npy'){const length=view.getUint16(start+8,true),header=decode.decode(bytes.subarray(start+10,start+10+length));assert(header.includes('(1, 9, 17)'));assert.deepEqual(bytes.subarray(start+10+length,start+size),new Uint8Array(plane.buffer));found=true;}at=start+size;
  }assert(found);
 }finally{await result?.store.dispose();await result?.session?.dispose();}assert.equal(budget.total(),0);
});

test('synthesis energy cache reuses A/B/A and ignores absent quality neighbours',async()=>{
 const width=80,height=80,budget=new Budget(64*1024**2),image=source(new Uint8Array(width*height*3).fill(90),width,height,budget),residual=source(fixture(width,height),width,height,budget),cache=createElaSynthesisEnergyCache(image,residual.surface,budget,{synthesisKey:'base-A'});let panels=0;
 const hooks={scoreBackend:'cpu',log,panelDetector:async candidate=>{assert.equal(candidate,image);panels++;return{polygons:[],dispose(){}};}};
 try{const a=await cache.analyze({block:16},hooks),same=await cache.analyze({block:16,quality:99},hooks);assert.equal(same.metrics.cache.result,true);assert.equal(same.analysis.value,a.analysis.value);assert.equal(panels,1);
  const b=await cache.analyze({block:16,profile:'manual',shadow:10},hooks);assert.notEqual(b.analysis.value,a.analysis.value);assert.equal(panels,1);const again=await cache.analyze({block:16},hooks);assert.equal(again.analysis.value,a.analysis.value);assert.equal(again.metrics.cache.result,true);assert.equal(panels,1);
 }finally{await cache.dispose();await image.surface.dispose();await residual.surface.dispose();}assert.equal(budget.total(),0);
});
