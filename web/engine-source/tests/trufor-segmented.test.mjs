import {test} from 'node:test';import assert from 'node:assert/strict';import {Budget} from '../src/cache.js';
import {createNeuralTensor} from '../src/neural-tensor-store.js';import {neuralQuantiles} from '../src/neural-quantiles.js';import {energyQuantile} from '../src/energy-prepare.js';
import {renderTrufor} from '../src/trufor-render.js';import {renderTruforSegmented} from '../src/trufor-segmented-render.js';import {TruforStatistics} from '../src/trufor-segmented-decoder.js';
test('global radix quantiles exactly match native float32 interpolation including signed values',async()=>{
 const budget=new Budget(2**20),values=Float32Array.from({length:7905},(_,i)=>Math.sin(i)*Math.exp(i%12-6)),t=await createNeuralTensor(1,85,93,{budget,chunkBytes:71});values[3]=-0;values[7]=0;await t.writeRows(0,85,values);
 const qs=[0,.0001,.01,.49,.5,.99,1],actual=await neuralQuantiles(t,qs,{budget,chunkBytes:1276}),sorted=values.slice().sort();assert.deepEqual(actual,qs.map(q=>energyQuantile(sorted,sorted.length,q)));
 const controller=new AbortController();await assert.rejects(neuralQuantiles(t,qs,{budget,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});await t.dispose();assert.equal(budget.total(),0);
});
test('all segmented TruFor views match full rendering at arbitrary source coordinates',async()=>{
 const width=43,height=31,budget=new Budget(2**20),values=Float32Array.from({length:width*height},(_,i)=>Math.sin(i/11)*.7+.5),t=await createNeuralTensor(1,height,width,{budget});await t.writeRows(0,height,values);
 for(const view of ['map','confidence','noiseprint_pp']){
  const full=await renderTrufor({width,height,[view]:values},view,{budget}),rect={x:7,y:5,width:17,height:19},out=await renderTruforSegmented({data:{width,height,[view]:t}},view,rect,{budget}),expected=new Uint8Array(rect.width*rect.height*3);
  for(let y=0;y<rect.height;y++){const at=((rect.y+y)*width+rect.x)*3;expected.set(full.data.subarray(at,at+rect.width*3),y*rect.width*3);}assert.deepEqual(out.data,expected);full.release();out.release();
 }await t.dispose();assert.equal(budget.total(),0);
});
test('image pooling preserves one global weight normalizer under extreme confidences',()=>{
 const stats=new TruforStatistics(),x=[-3,2,7,-1],logs=[-1000,-3,-5,-7];for(let i=0;i<x.length;i++)stats.add(x[i],logs[i]);const z=logs.reduce((s,v)=>s+Math.exp(v),0),weights=logs.map(v=>Math.exp(v)/z),expected=[-Math.log(x.reduce((s,v,i)=>s+weights[i]*Math.exp(-v),0)),Math.log(x.reduce((s,v,i)=>s+weights[i]*Math.exp(v),0)),x.reduce((s,v,i)=>s+weights[i]*v,0),x.reduce((s,v,i)=>s+weights[i]*v*v,0)].map(Math.fround);assert.deepEqual([...stats.values()],expected);
});
