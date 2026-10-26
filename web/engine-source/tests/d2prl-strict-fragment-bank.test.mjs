import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createStrictFragmentPlan} from '../experiments/d2prl/strict-fragment-plan.js';
import {createStrictFragmentBank} from '../experiments/d2prl/strict-fragment-bank.js';

const sha='a'.repeat(64);
async function fixture(width=20,height=16){
 const budget=new Budget(32*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});await state.add('acquisition',{x0:1,y0:1,x1:width-1,y1:height-1});await state.add('exclusion',{x0:7,y0:5,x1:11,y1:9});const domain=await compileOriginalSourceRegions(state.snapshot()),reads=[];
 const source={width,height,sha256:sha,async readWindow(r){for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++)assert.ok(domain.containsOriginal(x,y),'An excluded RGB pixel reached fragment preprocessing');reads.push({...r});return{pixels:{format:'rgb8',width:r.width,height:r.height,data:Uint8Array.from({length:r.width*r.height*3},(_,i)=>(r.x*17+r.y*31+i)%256)},release(){}};}};
 const view=await createSourceRegionView(source,domain.descriptor,{budget});return{budget,state,domain,view,reads};
}
test('strict fragments cover every native pixel, preserve fractional mapping, and never read the real RGB hole',async()=>{
 const h=await fixture();let plan;try{plan=await createStrictFragmentPlan(h.view,{budget:h.budget});const covered=new Uint8Array(h.domain.width*h.domain.height);
  for(const f of plan.fragments){assert.equal(f.modelSide,448);const input=plan.input(f.index),window=await input.readRows(0,input.height);window.release();for(let y=f.bounds[1];y<f.bounds[3];y++)for(let x=f.bounds[0];x<f.bounds[2];x++)covered[y*h.domain.width+x]++;for(const [x,y]of[[0,0],[447,447],[123.25,317.5]]){const original=plan.toOriginal(f,x,y),back=plan.fromOriginal(f,...original);assert.ok(Math.abs(back[0]-x)<1e-10&&Math.abs(back[1]-y)<1e-10);}}
  let count=0;for(let y=0;y<h.domain.height;y++)for(let x=0;x<h.domain.width;x++){assert.equal(covered[y*h.domain.width+x],h.domain.contains(x,y)?1:0);count+=covered[y*h.domain.width+x];}assert.equal(plan.includedPixels,count);assert.equal(count,h.domain.countIncluded);assert.equal(plan.locateOriginal(8,6),null);assert.ok(plan.locateOriginal(2,2));assert.equal(h.reads.length,plan.fragments.length);
 }finally{plan?.release();h.view.dispose();}assert.equal(h.budget.total(),0);
});
test('strict planning retains more than 256 tiny fragments instead of dropping them or lowering the model grid',async()=>{
 const width=66,height=18,budget=new Budget(32*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});await state.add('acquisition',{x0:0,y0:0,x1:width,y1:height});for(let y=0;y<height;y++)for(let x=y%2;x<width;x+=2)await state.add('exclusion',{x0:x,y0:y,x1:x+1,y1:y+1});const domain=await compileOriginalSourceRegions(state.snapshot()),view=await createSourceRegionView({width,height,sha256:sha,readWindow(){throw Error('Planning must not read or fabricate RGB');}},domain.descriptor,{budget});let plan;
 try{plan=await createStrictFragmentPlan(view,{budget});assert.ok(plan.fragments.length>256);assert.equal(plan.includedPixels,width*height/2);assert.ok(plan.fragments.every(f=>f.width===1&&f.height===1&&f.modelSide===448));}finally{plan?.release();view.dispose();}assert.equal(budget.total(),0);
});
test('the strict bank preserves every float16/FP32 bit, immutable fields, and owned read leases',async()=>{
 const h=await fixture(),plan=await createStrictFragmentPlan(h.view,{budget:h.budget}),bank=createStrictFragmentBank(plan,{budget:h.budget});try{
  const half=Uint16Array.from({length:36*8*8},(_,i)=>(i*17)%0x7bff),real=Float32Array.from({length:3*8*8},(_,i)=>i%3?-i/17:-0),halfBefore=half.slice(),realBits=new Uint32Array(real.buffer).slice();
  await bank.publish(0,'zm',{data:half,dtype:'float16',shape:[1,36,8,8]});await bank.publish(0,'rgb',{data:real,dtype:'float32',shape:[1,3,8,8]});half.fill(0);real.fill(99);
  const a=await bank.read(0,'zm'),b=await bank.read(0,'rgb');assert.deepEqual(a.data,halfBefore);assert.deepEqual(new Uint32Array(b.data.buffer),realBits);a.data.fill(0);a.release();b.release();const again=await bank.read(0,'zm');assert.deepEqual(again.data,halfBefore);again.release();await assert.rejects(bank.publish(0,'zm',{data:half,dtype:'float16',shape:[1,36,8,8]}),{code:'INVALID_INPUT'});assert.equal(bank.snapshot().publishedTensors,2);assert.equal(bank.snapshot().leases,0);
 }finally{await bank.dispose();plan.release();h.view.dispose();}assert.equal(h.budget.total(),0);
});
test('a nonfinite or cancelled tensor is never published and releases its partial store',async()=>{
 const h=await fixture(),plan=await createStrictFragmentPlan(h.view,{budget:h.budget}),bank=createStrictFragmentBank(plan,{budget:h.budget});try{
  const bad=new Float32Array(3*8*8);bad[3]=NaN;const before=h.budget.total();await assert.rejects(bank.publish(0,'bad',{data:bad,dtype:'float32',shape:[1,3,8,8]}),{code:'INVALID_INPUT'});assert.equal(bank.has(0,'bad'),false);assert.equal(h.budget.total(),before);
  const controller=new AbortController();controller.abort();await assert.rejects(bank.publish(0,'cancel',{data:new Float32Array(3*8*8),dtype:'float32',shape:[1,3,8,8]},{signal:controller.signal}),{code:'CANCELLED'});assert.equal(bank.has(0,'cancel'),false);assert.equal(h.budget.total(),before);
 }finally{await bank.dispose();plan.release();h.view.dispose();}assert.equal(h.budget.total(),0);
});
test('source ownership and plan lifetime cannot be replaced by a transported schema string',async()=>{
 const h=await fixture(),plan=await createStrictFragmentPlan(h.view,{budget:h.budget});try{assert.throws(()=>createStrictFragmentBank({...plan},{budget:h.budget}),{code:'INVALID_INPUT'});plan.release();assert.throws(()=>createStrictFragmentBank(plan,{budget:h.budget}),{code:'DISPOSED'});}finally{plan.release();h.view.dispose();}assert.equal(h.budget.total(),0);
});
