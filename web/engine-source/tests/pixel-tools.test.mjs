import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {pixelStats,statsParams} from '../src/pixel-stats.js';import {bitPlanes,planesParams} from '../src/bit-planes.js';import {histogram,histogramParams} from '../src/histogram.js';import {minmax,minmaxParams} from '../src/minmax.js';import {defectPixels,defectParams} from '../src/defect-pixels.js';
const functions={'colors.stats':[statsParams,pixelStats],'noise.planes':[planesParams,bitPlanes],'inspection.histogram':[histogramParams,histogram],'noise.minmax':[minmaxParams,minmax],'pixels.defects':[defectParams,defectPixels]};
const sha=b=>createHash('sha256').update(b).digest('hex');
const reference=JSON.parse(await readFile(new URL('../fixtures/pixel-reference.json',import.meta.url)));
for(const [operation,[validate,compute]] of Object.entries(functions))test(operation+' matches native pixels, masks and numeric data for all fixtures',async()=>{
 for(const fixture of reference.cases){
  const data=new Uint8Array(await readFile(new URL('../fixtures/'+fixture.file,import.meta.url)));assert.equal(sha(data),fixture.sha256);
  const image={width:fixture.width,height:fixture.height,format:'rgb8',data};
  for(const expected of fixture.expected.filter(x=>x.operation===operation)){
   const label=fixture.name+' '+JSON.stringify(expected.params),result=await compute(image,validate(expected.params));
   if(expected.pixels)assert.equal(sha(result.pixels.data),expected.pixels,label);
   for(const [name,hash] of Object.entries(expected.masks??{}))assert.equal(sha(result.masks[name].data),hash,label+' mask '+name);
   if(expected.flags){assert.equal(sha(result.data.flags.data),expected.flags,label+' flags');assert.equal(result.data.count,expected.count,label+' count');}
   if(expected.bins){assert.deepEqual(Array.from(result.data.bins),expected.bins.flat(),label+' bins');assert.equal(result.data.uniqueColors,expected.uniqueColors);assert.equal(result.data.uniqueRatio,expected.uniqueRatio);assert.deepEqual(result.data.summary,expected.summary,label+' summary');}
  }
 }
});
test('Pixel tool parameters reject unknown keys and invalid variants',()=>{
 for(const [validate] of Object.values(functions))assert.throws(()=>validate({unused:1}),{code:'INVALID_INPUT'});
 assert.throws(()=>planesParams({bit:8}),{code:'INVALID_INPUT'});assert.throws(()=>statsParams({inclusive:1}),{code:'INVALID_INPUT'});assert.throws(()=>minmaxParams({filter:6}),{code:'INVALID_INPUT'});assert.throws(()=>defectParams({threshold:0}),{code:'INVALID_INPUT'});
});
test('Histogram preserves integer counts beyond the float32 exact limit',async()=>{
 const width=4097,height=4097,data=new Uint8Array(width*height*3);data.fill(17);
 const result=await histogram({width,height,format:'rgb8',data},histogramParams());
 for(let c=0;c<4;c++)assert.equal(result.data.bins[c*256+17],width*height);
 assert.equal(result.data.uniqueColors,1);assert.equal(result.data.summary.count,width*height);
});
