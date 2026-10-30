import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';
import {gradientDerivatives,gradientRender} from '../src/gradient-math.js';
import {segmentedGradient} from '../src/segmented-gradient.js';
import {Budget} from '../src/cache.js';
import {contiguousSurface} from '../src/image-sources.js';
import {orientRgb} from '../src/image-headers.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';

const reference=JSON.parse(await readFile(new URL('../fixtures/gradient-methods-reference.json',import.meta.url)));
const operation=OPENCV_OPERATIONS['detail.gradient'];
const pixels=f=>({width:f.width,height:f.height,format:'rgb8',data:Uint8Array.from(f.rgb)});
function closeRgb(actual,expected,label){assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[i])<=1,`${label} channel${i}: ${actual[i]} !=${expected[i]}`);}
async function frame(surface){const lease=await surface.readWindow();try{return lease.pixels.data.slice();}finally{lease.release();}}

test('method schema keeps historical defaults and canonicalizes the Krawetz native blue channel',()=>{
 assert.deepEqual(operation.validate(),{method:'sobel',intensity:95,mode:2,invert:false,equalize:false});
 assert.deepEqual(operation.validate({method:'krawetz'}),{method:'krawetz',intensity:0,mode:2,invert:false,equalize:false});
 assert.equal(operation.validate({method:'krawetz',mode:3}).mode,2);
 for(const params of[{method:'unknown'},{method:0},{method:null},{method:'krawetz',mode:4}])assert.throws(()=>operation.validate(params),{code:'INVALID_INPUT'});
});
for(const f of reference.cases)test('independent Python integer derivative and direction reference: '+f.name,async()=>{
 const part=await gradientDerivatives(pixels(f),0,f.height,{method:'krawetz',membership:Uint8Array.from(f.membership)});
 assert.deepEqual([...new Int16Array(part.bytes.buffer,part.bytes.byteOffset,part.bytes.length/2)],f.slopes);
 const rendered=await gradientRender(part.bytes,new Float64Array(6),operation.validate({method:'krawetz'}),f.width*f.height);
 const expected=f.output;for(let i=0;i<f.membership.length;i++)if(f.membership[i])closeRgb(rendered.bytes.subarray(i*3,i*3+3),expected.slice(i*3,i*3+3),f.name);
 if(f.name!=='masked')closeRgb((await operation.compute(pixels(f),operation.validate({method:'krawetz'}),{})).pixels.data,expected,f.name+' contiguous');
});
test('segmented halos, method-separated caches, A/B/A and immutable old results',async()=>{
 const f=reference.cases.find(x=>x.name==='texture'),input=pixels(f),budget=new Budget(256*1024**2),image={surface:contiguousSurface(input,budget)};let previous;
 try{
  for(const method of['sobel','krawetz','sobel','krawetz'])for(const rowsPerBlock of[1,3,17]){
   const params=operation.validate({method}),out=await segmentedGradient(image,params,{budget,rowsPerBlock,cacheKey:'methods/'});
   try{assert.equal(out.metrics.gradientMethod,method);assert.deepEqual(await frame(out.surface),(await operation.compute(input,params,{})).pixels.data);if(previous){assert.deepEqual(await frame(previous.surface),previous.rgb);await previous.surface.dispose();}previous={surface:out.surface,rgb:await frame(out.surface)};}catch(error){await out.surface.dispose();throw error;}
  }
 }finally{await previous?.surface.dispose();budget.clearPrefix('methods/');await image.surface.dispose();}
 assert.equal(budget.total(),0);
});
test('Krawetz presentation uses global equalization and keeps source derivatives across settings',async()=>{
 const f=reference.cases.find(x=>x.name==='texture'),input=pixels(f),budget=new Budget(256*1024**2),image={surface:contiguousSurface(input,budget)};
 try{for(const extra of[{}, {invert:true}, {intensity:70}, {equalize:true}, {equalize:true,intensity:100}]){
  const p=operation.validate({method:'krawetz',...extra}),out=await segmentedGradient(image,p,{budget,rowsPerBlock:2,cacheKey:'present/'});
  try{assert.deepEqual(await frame(out.surface),(await operation.compute(input,p,{})).pixels.data);}finally{await out.surface.dispose();}
 }}finally{budget.clearPrefix('present/');await image.surface.dispose();}assert.equal(budget.total(),0);
});
test('Krawetz all EXIF orientations preserve native direction on the displayed pixel grid',async()=>{
 const input=pixels(reference.cases.find(x=>x.name==='texture')),params=operation.validate({method:'krawetz'});
 for(let orientation=1;orientation<=8;orientation++){
  const budget=new Budget(128*1024**2),store=await createSegmentedBytes(input.data.length,{budget,chunkBytes:113});await store.write(input.data);const image={surface:createRgbSurface(store,{width:input.width,height:input.height,orientation,budget})};
  try{const expected=await operation.compute(await orientRgb(input,orientation),params,{}),actual=await segmentedGradient(image,params,{budget,rowsPerBlock:1});try{assert.deepEqual(await frame(actual.surface),expected.pixels.data);}finally{await actual.surface.dispose();}}finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }
});
test('excluded poison never changes an admitted Krawetz derivative',async()=>{
 const f=reference.cases.find(x=>x.name==='masked'),input=pixels(f),membership=Uint8Array.from(f.membership),before=await gradientDerivatives(input,0,f.height,{method:'krawetz',membership});
 for(let i=0;i<membership.length;i++)if(!membership[i])input.data.fill(255-i%255,i*3,i*3+3);
 const after=await gradientDerivatives(input,0,f.height,{method:'krawetz',membership});assert.deepEqual(after.bytes,before.bytes);assert.deepEqual(after.stats,before.stats);
});
test('Krawetz cancellation at each native stage retires partial output and permits retry',async()=>{
 const input=pixels(reference.cases.find(x=>x.name==='texture')),budget=new Budget(128*1024**2),image={surface:contiguousSurface(input,budget)},params=operation.validate({method:'krawetz',equalize:true});
 try{for(const at of[.1,.4,.6,.9,1]){const stop=new AbortController();await assert.rejects(segmentedGradient(image,params,{budget,rowsPerBlock:2,signal:stop.signal,onProgress:f=>{if(f>=at)stop.abort();}}),{code:'CANCELLED'});assert.equal(budget.active,0);const next=await segmentedGradient(image,params,{budget,rowsPerBlock:2});await next.surface.dispose();}}finally{await image.surface.dispose();}assert.equal(budget.total(),0);
});
