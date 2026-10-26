import test from 'node:test';import assert from 'node:assert/strict';
import {segmentedHistogram} from '../src/segmented-histogram.js';
import {histogram,histogramParams} from '../src/histogram.js';
import {Budget} from '../src/cache.js';

test('segmented integer counts remain exact beyond 2^24 pixels with a bounded virtual byte source',async()=>{
 const pixels=2**24+19,bytes=pixels*3,chunk=new Uint8Array(500003).fill(127),budget=new Budget(3*1024**2);let visits=0;
 const store={byteLength:bytes,async visit(visitor){for(let at=0;at<bytes;at+=chunk.length){visits++;await visitor(chunk.subarray(0,Math.min(chunk.length,bytes-at)),at);}}};
 const answer=await segmentedHistogram(store,histogramParams(),{budget});
 assert.ok(visits>2);for(let c=0;c<4;c++){assert.equal(answer.data.bins[c*256+127],pixels);assert.equal(answer.data.cumulative[c*256+255],pixels);assert.equal(answer.data.bins.subarray(c*256,c*256+256).reduce((a,b)=>a+b),pixels);}
 assert.equal(answer.data.uniqueColors,1);assert.equal(answer.data.summary.count,pixels);assert.equal(answer.data.summary.mean,127);assert.equal(answer.data.summary.stddev,0);assert.equal(budget.total(),0);assert.ok(budget.peak<3*1024**2);
});

test('every RGB seam phase agrees with contiguous native counts and releases workspace on a failed source',async()=>{
 const image={width:71,height:13,format:'rgb8',data:Uint8Array.from({length:71*13*3},(_,i)=>(i*31+(i>>>2)*17)&255)},expected=await histogram(image,histogramParams());
 for(const chunkBytes of [1,2,3,4,5,7,113,255,256,257]){
  const budget=new Budget(3*1024**2),store={byteLength:image.data.length,async visit(fn){for(let at=0;at<this.byteLength;at+=chunkBytes)await fn(image.data.subarray(at,at+chunkBytes),at);}};
  const answer=await segmentedHistogram(store,histogramParams(),{budget});assert.deepEqual(answer.data,expected.data);assert.equal(budget.total(),0);
 }
 const budget=new Budget(3*1024**2),store={byteLength:image.data.length,async visit(fn){await fn(image.data.subarray(0,257),0);throw Object.assign(Error('source stopped'),{code:'SOURCE_TEST_STOP'});}};
 await assert.rejects(segmentedHistogram(store,histogramParams(),{budget}),{code:'SOURCE_TEST_STOP'});assert.equal(budget.total(),0);
});
