import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentationZones} from '../experiments/segmentation/zones.js';
import {segmentedNeuralProjection} from '../src/segmented-neural-projection.js';
import {createSegmentationAnalysis} from '../experiments/segmentation/analysis.js';

function fixture(){
 const width=719,height=613,bounds=[7,11,708,608],w=bounds[2]-bounds[0],h=bounds[3]-bounds[1],raw=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)raw[y*w+x]=Math.fround(((x*31+y*17)%101)/100);
 raw[0]=.5;raw[1]=Math.fround(.5+2**-24);raw[raw.length-1]=1;
 return {width,height,side:512,kind:'sigmoid',zones:[{id:'rectangle',bounds,raw,rawWidth:w,rawHeight:h}],mode:'regions'};
}
test('original-size rectangular grids retain every native probability and strict mask edge without resize',async()=>{
 const input=fixture(),budget=new Budget(64*1024**2),spatial={run(){assert.fail('A native source-resolution grid must not be resampled');}};
 const direct=await createSegmentationZones({budget,spatial}).run(input),segmented=await segmentedNeuralProjection({...input,family:'segmentation'},{budget,spatial});
 try{
  const {bounds,raw,rawWidth:w,rawHeight:h}=input.zones[0],map=new Float32Array(input.width*input.height),mask=new Uint8Array(map.length),analyzed=new Uint8Array(map.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const to=(bounds[1]+y)*input.width+bounds[0]+x,v=raw[y*w+x];map[to]=v;mask[to]=Number(v>.5);analyzed[to]=1;}
  for(const [name,expected]of Object.entries({map,mask,analyzed})){
   assert.deepEqual(direct[name],expected);
   const bytes=new Uint8Array(expected.byteLength);await segmented.stores[name].readInto(bytes);
   assert.deepEqual(bytes,new Uint8Array(expected.buffer));
  }
  assert.deepEqual(direct.metadata.zones[0].analysis_shape,[1,h,w]);assert.equal(segmented.metadata.probability_interpolation,'none');
  assert.equal(direct.mask[bounds[1]*input.width+bounds[0]],0);assert.equal(direct.mask[bounds[1]*input.width+bounds[0]+1],1);
 }finally{direct.release();await segmented.dispose();}
 assert.equal(budget.total(),0);
});
test('a source-sized grid with mismatched bounds refuses before publishing or retaining a partial result',async()=>{
 const input=fixture(),budget=new Budget(64*1024**2);input.zones[0].rawWidth--;
 for(const run of [v=>createSegmentationZones({budget,spatial:{run(){assert.fail('Invalid shape reached resize');}}}).run(v),v=>segmentedNeuralProjection({...v,family:'segmentation'},{budget})]){
  await assert.rejects(run(input),{code:'INVALID_INPUT'});assert.equal(budget.total(),0);
 }
});
test('native output dimensions remain correct across cached ROI recomposition and scientific raw exports',async()=>{
 const input=fixture(),budget=new Budget(256*1024**2),model={family:'selfdm-proposal',id:'dynamic-source-grid',side:512,kind:'sigmoid',bytes:100};let jobs=0;
 const prepare={async run(v){return {inferenceInput:v,release(){}};},dispose(){}};
 const inference={model,backend:'cpu',async run(v){jobs++;return {raw:input.zones[0].raw.slice(),width:v.width,height:v.height,release(){}};},dispose(){}};
 const project=createSegmentationZones({budget,spatial:{run(){assert.fail('Native output reached resize');}}});
 const analysis=createSegmentationAnalysis({budget,prepare,inference,project});
 const pixels={width:input.width,height:input.height,data:new Uint8Array(input.width*input.height*3)};
 const first=await analysis.run({pixels,zones:input.zones.map(({id,bounds})=>({id,bounds,kind:'region'}))});
 const expected=first.map.slice(),id=first.metadata.resultId,analysisId=first.metadata.analysisId;first.release();
 const raw=analysis.readRaw(id);assert.deepEqual(raw.rawGrids[0].raw_shape,[1,597,701]);assert.deepEqual(raw.rawGrids[0].raw,input.zones[0].raw);raw.release();
 const repeat=await analysis.reproject({analysisId,zoneIds:['rectangle']});assert.deepEqual(repeat.map,expected);assert.equal(repeat.metadata.inferences,0);repeat.release();
 const reservations=[],originalReserve=budget.reserve.bind(budget);budget.reserve=bytes=>{reservations.push(bytes);return originalReserve(bytes);};
 const cached=await analysis.run({pixels,zones:input.zones.map(({id,bounds})=>({id,bounds,kind:'region'}))});assert.deepEqual(cached.map,expected);assert.equal(cached.metadata.cache_hits,1);assert.equal(cached.metadata.inferences,0);assert.ok(reservations.includes(input.zones[0].raw.byteLength),'The live cached grid must keep its entire backing accounted');cached.release();
 assert.equal(jobs,1);await analysis.dispose();assert.equal(budget.total(),0);
});
