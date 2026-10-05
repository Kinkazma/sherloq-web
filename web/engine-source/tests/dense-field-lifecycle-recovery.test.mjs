import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
const enabled=process.execArgv.includes('--experimental-test-module-mocks');

// Protocol doubles isolate ownership and retry boundaries; arithmetic remains
// qualified by the native field corpus, not by these fixtures.
test('field recovery retains completed hypotheses and descriptors, and retries storage without recomputing the field',
 {skip:!enabled&&'Run with --experimental-test-module-mocks for isolated ownership protocol tests'},async t=>{
 const budget=new Budget(256*1024**2),runs=[0,0,0],freed=[],events=[];let prepared=0,descriptorFreed=0,storeAttempts=0,masksFreed=0;
 const bytes={byteLength:16,readInto(out){out.fill(1);}};
 const jobs=Array.from({length:3},(_,i)=>({crop:{x:0,y:0},width:4,height:4,pass:{method:0,patch:2,targetPatch:2,reflection:false},eligibility:{},options:{radius:i+1},context:{id:i}}));
 t.mock.module('../src/dense-image.js',{namedExports:{denseImageParams:input=>({coherence:true,patch:2,limit:3,...input}),denseImageJobs:()=>({jobs,plan:{},contexts:[{}],policy:{}})}});
 t.mock.module('../src/dense-paged-zernike.js',{namedExports:{preparePagedZernike:async()=>{prepared++;return {first:bytes,dispose(){descriptorFreed++;}};}}});
 t.mock.module('../src/dense-paged-regions.js',{namedExports:{preparePagedEligibility:async()=>{let disposed=false;return {mask:bytes,width:4,height:4,dimensions:12,dispose(){if(!disposed){disposed=true;masksFreed++;}}};}}});
 t.mock.module('../src/dense-paged-field-pool.js',{namedExports:{DensePagedFieldPool:class{
  constructor(){this.jobs=0;this.peakWorkers=3;}
  start(input,settings){this.jobs++;const id=settings.radius-1;runs[id]++;
   if((id===1&&runs[id]<=2)||(id===2&&runs[id]===1))return Promise.reject(new RangeError('Array buffer allocation failed'));
   const release=budget.reserve(128);let disposed=false;return Promise.resolve({id,width:4,height:4,targets:bytes,distancesSquared:bytes,allowed:input.mask,ownsAllowed:false,dispose(){if(!disposed){disposed=true;freed.push(id);release();}}});
  }
  async drain(){}
 }}});
 t.mock.module('../src/dense-cold-field.js',{namedExports:{storeColdDenseField:async field=>{assert.equal(descriptorFreed,0);if(field.id===1&&++storeAttempts===1)throw new RangeError('Array buffer allocation failed');return field;}}});
 t.mock.module('../src/dense-paged-coherence.js',{namedExports:{runPagedDenseCoherence:async()=>({selected:bytes,dispose(){}})}});
 t.mock.module('../src/dense-paged-links.js',{namedExports:{samplePagedDenseLinks:async()=>({count:1,total:1,denseCount:1,rows:bytes,dispose(){}})}});
 const {PagedDenseImageEngine}=await import('../src/dense-paged-image.js'),engine=new PagedDenseImageEngine({surface:{descriptor:{format:'rgb8',width:4,height:4}}},budget,{maxWorkers:3});
 let answer;
 try{
  answer=await engine.analyze({}, {onProgress:event=>events.push(event)});
  assert.deepEqual(runs,[1,3,2]);assert.equal(prepared,1);assert.equal(storeAttempts,2);
  assert.equal(descriptorFreed,1);assert.deepEqual(freed,[]);assert.equal(answer.fields.length,3);
  assert.equal(events.filter(e=>e.phase==='resource-recovery').length,4);assert.equal(events.filter(e=>e.phase==='field-complete').length,3);
  assert.equal(answer.metrics.parallel.resourceRetries,4);assert.equal(budget.recovering,false);
  await engine.dispose();assert.deepEqual(freed,[],'Delivered field owner survives engine disposal');
 }finally{await answer?.release();await engine.dispose();}
 assert.deepEqual(freed.sort(),[0,1,2]);assert.equal(masksFreed,3);assert.equal(budget.total(),0);
});
