import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {contiguousSurface} from '../src/image-sources.js';
import {createDenseRegions} from '../src/dense-regions.js';
import {corroborateDenseDetail,corroborateDenseGroups} from '../src/dense-detail.js';
import {createPagedDetailSampler,clearPagedDetailCache} from '../src/dense-paged-detail.js';
const MiB=1024**2;
const points=()=>Float32Array.from({length:8*7},(_,i)=>i%7===0?20+(i/7|0)*5:i%7===1?30+(i/7|0)*3:0);
const model=()=>({source_point_indices:Array.from({length:8},(_,i)=>i),matrix:[[1,0,64],[0,1,0],[0,0,1]]});

test('direct and grouped corroboration avoid a timer per offset while preserving every sample and float score',async t=>{
 t.mock.method(performance,'now',()=>1);let timers=0,calls=0;const original=setTimeout;
 t.mock.method(globalThis,'setTimeout',(...args)=>{timers++;return original(...args);});
 const sampler={sample(x,y){calls++;return Float32Array.from(x,(v,i)=>Math.fround(Math.sin(v%64)*80+Math.cos(y[i])*45));}},detail={width:279,height:231},p=points(),m=model();
 const expected=await corroborateDenseDetail(detail,sampler,p,m);assert.equal(calls,26);assert.equal(expected.accepted,true);
 calls=0;const groups=[Uint32Array.of(0),Uint32Array.of(1)],actual=await corroborateDenseGroups(detail,sampler,p,groups,[m,m]);
 assert.equal(calls,52);assert.equal(timers,0);assert.deepEqual(actual.groups,groups);for(const fitted of actual.models)assert.deepEqual(fitted.detail_corroboration,expected);
});

test('native paged detail remains bit-exact against full-image sampling and native corroboration',async()=>{
 const width=279,height=231,data=Uint8Array.from({length:width*height*3},(_,i)=>{const pixel=i/3|0,x=pixel%width,y=pixel/width|0;return ((x%64)*37+y*11+(i%3)*57)%256;}),budget=new Budget(64*MiB),image={surface:contiguousSurface({width,height,data},budget)},native=await createDenseRegions(),full=native.detail({width,height,data}),reference=native.sampler(full),sampler=await createPagedDetailSampler(image,{budget});
 try{
  const edge=[-.5,0,.015625,.046875,63.984375,64.015625,127.984375,128.015625,width-.03125,width-.015625,width+.25];let seed=9380;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/2**32;};
  for(let run=0;run<2;run++){const x=Float32Array.from({length:2592},(_,i)=>i<edge.length?edge[i]:random()*(width+2)-1),y=Float32Array.from(x,(_,i)=>i<edge.length?i%2?0:height-.015625:random()*(height+2)-1),expected=reference.sample(x,y,32,81),actual=await sampler.sample(x,y,32,81);assert.deepEqual(new Uint8Array(actual.buffer),new Uint8Array(expected.buffer));}
  const p=points(),m=model(),expected=await corroborateDenseDetail(full,reference,p,m),actual=await corroborateDenseDetail(sampler.detail,sampler,p,m);assert.deepEqual(actual,expected);assert.equal(actual.accepted,true);
  const grouped=await corroborateDenseGroups(sampler.detail,sampler,p,[Uint32Array.of(2),Uint32Array.of(3)],[m,m]);assert.equal(grouped.models.length,2);for(const fitted of grouped.models)assert.deepEqual(fitted.detail_corroboration,expected);
 }finally{sampler.dispose();reference.dispose();clearPagedDetailCache(image,budget);await image.surface.dispose();}
 assert.equal(budget.total(),0);
});

test('one cooperation deadline spans quickly rejected models and admits a queued cancellation timer',{timeout:3000},async()=>{
 const controller=new AbortController(),total=100000,p=new Float32Array(7).fill(-100);let examined=0,fired=false;
 const m={get source_point_indices(){examined++;return [0];},matrix:[[1,0,0],[0,1,0],[0,0,1]]},models=Array(total).fill(m),groups=Array(total).fill(new Uint32Array());
 const timer=setTimeout(()=>{fired=true;controller.abort();},0);
 try{await assert.rejects(corroborateDenseGroups({width:100,height:100},{sample(){assert.fail('Rejected model sampled pixels');}},p,groups,models,{signal:controller.signal}),{code:'CANCELLED'});assert.equal(fired,true);assert.ok(examined>0&&examined<total);}finally{clearTimeout(timer);}
});

test('sampler cooperation deadline survives many short cached sample calls and admits timer cancellation',{timeout:3000},async()=>{
 const width=128,height=128,data=Uint8Array.from({length:width*height*3},(_,i)=>i%253),budget=new Budget(64*MiB),image={surface:contiguousSurface({width,height,data},budget)},controller=new AbortController(),sampler=await createPagedDetailSampler(image,{budget,signal:controller.signal}),x=Float32Array.of(20),y=Float32Array.of(20);let calls=0,fired=false,timer;
 try{
  await sampler.sample(x,y,1,1);timer=setTimeout(()=>{fired=true;controller.abort();},0);
  await assert.rejects((async()=>{for(;calls<100000;calls++)await sampler.sample(x,y,1,1);})(),{code:'CANCELLED'});
  assert.equal(fired,true);assert.ok(calls<100000);
 }finally{clearTimeout(timer);sampler.dispose();clearPagedDetailCache(image,budget);await image.surface.dispose();}
 assert.equal(budget.total(),0);
});

test('direct corroboration has its own cooperation and accepts cancellation queued during useful sampling',{timeout:3000},async()=>{
 const controller=new AbortController();let calls=0,fired=false,timer;
 const sampler={sample(x,y){calls++;if(calls===1)timer=setTimeout(()=>{fired=true;controller.abort();},0);const until=performance.now()+1;while(performance.now()<until){}return Float32Array.from(x,(v,i)=>Math.fround(Math.sin(v%64)*80+Math.cos(y[i])*45));}};
 try{await assert.rejects(corroborateDenseDetail({width:279,height:231},sampler,points(),model(),{signal:controller.signal}),{code:'CANCELLED'});assert.equal(fired,true);assert.ok(calls>0&&calls<26);}finally{clearTimeout(timer);}
});
