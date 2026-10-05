import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {segmentationZoneConcurrency, runSegmentationZones} from '../experiments/segmentation/zone-scheduler.js';
import {createSegmentationAnalysis} from '../experiments/segmentation/analysis.js';
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const model = {id:'test',variant:'test',side:256,kind:'sigmoid',bytes:90*1024**2};
const zones = [0,1,2].map(i=>({id:'zone-'+i,kind:'region',bounds:[i*8,0,(i+1)*8,8]}));

test('concurrency uses shared live memory, source copies and useful jobs; nested pools opt out',()=>{
  const budget=new Budget(3*1024**3),lanes=[{inference:{independentZoneWorker:true,residentBytes:0}}];
  const options={budget,model,lanes,zones,segmented:true,hardwareConcurrency:10};
  assert.equal(segmentationZoneConcurrency(options),3);
  const release=budget.reserve(2*1024**3);
  assert.equal(segmentationZoneConcurrency(options),1);
  lanes[0].inference.residentBytes=2*1024**3;
  assert.equal(segmentationZoneConcurrency(options),3); // own reusable idle sessions
  release();lanes[0].inference.residentBytes=0;
  assert.equal(segmentationZoneConcurrency({...options,hardwareConcurrency:2}),2);
  assert.equal(segmentationZoneConcurrency({...options,zones:[zones[0]]}),1);
  assert.equal(segmentationZoneConcurrency({...options,budget:new Budget(2.5*1024**3),segmented:false,zones:zones.map(z=>({...z,bounds:[0,0,8192,4096]}))}),2);
  lanes[0].inference.independentZoneWorker=false;
  assert.equal(segmentationZoneConcurrency(options),1);
});

test('out-of-order workers retain source order and never exceed admitted lanes',async()=>{
  let active=0,peak=0;const completion=[];
  const result=await runSegmentationZones({count:5,lanes:[0,1,2],run:async i=>{
    active++;peak=Math.max(peak,active);await delay(i===0?30:2);completion.push(i);active--;return i*7;
  }});
  assert.deepEqual(result.values,[0,7,14,21,28]);assert.equal(peak,3);assert.notEqual(completion[0],0);
  assert.deepEqual(result.concurrency,{requested:3,observed:3,memoryBackoffs:0,internalThreadsPerWorker:1});
});

test('real admission pressure drains active work then retries only unfinished work serially',async()=>{
  const budget=new Budget(10),calls=new Map();let running=0;
  const result=await runSegmentationZones({count:5,lanes:[0,1,2],run:async i=>{
    calls.set(i,(calls.get(i)??0)+1);const free=budget.reserve(6);running++;
    try{assert.equal(running,1);await delay(3);return i;}finally{running--;free();}
  }});
  assert.deepEqual(result.values,[0,1,2,3,4]);assert.equal(calls.get(0),1);assert(result.concurrency.memoryBackoffs>0);assert.equal(budget.total(),0);
  await assert.rejects(runSegmentationZones({count:1,lanes:[0],run:()=>{throw new EngineError('MEMORY_LIMIT','too large');}}),{code:'MEMORY_LIMIT'});
});

test('fatal error and external cancellation abort siblings and await their cleanup',async()=>{
  for(const external of [false,true]){
    const controller=new AbortController();let active=0,cleaned=0;
    const task=runSegmentationZones({count:5,lanes:[0,1],signal:controller.signal,run:async(i,lane,signal)=>{
      active++;
      try{
        if(!external&&i===0){await delay(3);throw new EngineError('MODEL_IDENTITY','bad model');}
        await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new EngineError('CANCELLED','cancelled')),{once:true}));
      }finally{await delay(2);active--;cleaned++;}
    }});
    if(external)setTimeout(()=>controller.abort(),3);
    await assert.rejects(task,{code:external?'CANCELLED':'MODEL_IDENTITY'});assert.equal(active,0);assert.equal(cleaned,2);
  }
});

test('analysis keeps ordered probabilities, deduplicates identical bounds and reprojects without inference',async()=>{
  const budget=new Budget(3*1024**3);let calls=0,disposed=0;
  const createLane=()=>({prepare:{async run(input){return {tensor:new Float32Array([input.value]),release(){}};},dispose(){disposed++;}},inference:{model,independentZoneWorker:true,backend:'cpu',async run(input){calls++;await delay(input[0]===0?15:1);return{raw:new Float32Array(256**2).fill(input[0]/10),sessionCache:{enabled:true,creations:1,reuses:2,pressureEvictions:0},parameterCache:{enabled:true,hits:2,misses:3,hitBytes:64,fetchBytes:96,evictions:0,sessionPeakResidentBytes:1000},release(){}};},dispose(){disposed++;}}});
  const first=createLane(),project={async run(input){return{metadata:{zones:input.zones.map(z=>({id:z.id}))},values:input.zones.map(z=>z.raw[0]),release(){}};}},session=createSegmentationAnalysis({budget,...first,project,createLane});
  const inputSource={width:24,height:8,async sha256(){return 'a'.repeat(64);},region(bounds){return{value:bounds[0]/8};}};
  const selected=[...zones,{...zones[0],id:'same-bounds'}];
  const result=await session.run({inputSource,zones:selected});
  assert.deepEqual(result.values,[0,Math.fround(.1),Math.fround(.2),0]);assert.equal(calls,3);assert.equal(result.metadata.cache_hits,1);assert.equal(result.metadata.execution.parameterCache.hits,6);assert.equal(result.metadata.execution.parameterCache.fetchBytes,288);assert.equal(result.metadata.execution.sessionCache.creations,3);assert.equal(result.metadata.execution.sessionCache.reuses,6);
  const cached=await session.reproject({analysisId:result.metadata.analysisId,zoneIds:['zone-2','zone-0']});
  assert.deepEqual(cached.values,[0,Math.fround(.2)]);assert.equal(calls,3);assert.equal(cached.metadata.inferences,0);assert.equal(cached.metadata.execution.parameterCache.hits,0);assert.equal(cached.metadata.execution.parameterCache.fetchBytes,0);assert.equal(cached.metadata.execution.sessionCache.creations,0);assert.equal(cached.metadata.execution.sessionCache.reuses,0);
  const raw=session.readRaw(cached.metadata.resultId);raw.rawGrids[0].raw.fill(-9);raw.release();
  const again=session.readRaw(cached.metadata.resultId);assert.equal(again.rawGrids[0].raw[0],0);again.release();
  const allCached=await session.run({inputSource,zones:selected});assert.equal(allCached.metadata.inferences,0);assert.equal(allCached.metadata.execution.parameterCache.hits,0);assert.equal(allCached.metadata.execution.parameterCache.fetchBytes,0);assert.equal(allCached.metadata.execution.sessionCache.creations,0);assert.equal(allCached.metadata.execution.sessionCache.reuses,0);
  await session.dispose();assert(disposed%2===0);assert.equal(budget.total(),0);
});

test('large projected planes reclaim idle model sessions while preserving owned raw grids',async()=>{
  const budget=new Budget(3*1024**3),softmax={...model,kind:'softmax'},residentSize=800*1024**2;
  const createLane=()=>{
    let release;
    return{prepare:{async run(){return{tensor:new Float32Array(1),release(){}};},dispose(){}},inference:{model:softmax,independentZoneWorker:true,
      get residentBytes(){return release?residentSize:0;},releaseIdle(){release?.();release=undefined;},
      async run(){release??=budget.reserve(residentSize);await delay(3);return{raw:new Float32Array(3*256**2),release(){}};},dispose(){this.releaseIdle();}}};
  };
  const first=createLane(),project={async run(input){assert(budget.limit-budget.total()>=12000*8000*15+96*1024**2);return{metadata:{zones:input.zones.map(z=>({id:z.id}))},release(){}};}},session=createSegmentationAnalysis({budget,...first,project,createLane});
  const result=await session.run({inputSource:{width:12000,height:8000,async sha256(){return 'b'.repeat(64);},region(){return{};}},zones});
  assert(result.metadata.execution.projectionReleasedSessionBytes>=residentSize);assert(budget.cacheBytes>0);
  const raw=session.readRaw(result.metadata.resultId);assert.equal(raw.rawGrids.length,3);raw.release();await session.dispose();first.inference.dispose();assert.equal(budget.total(),0);
});

test('hybrid sessions stay warm when results fit, yield to cached large views, and reload on later useful work',async()=>{
  const budget=new Budget(3*1024**3),sourceBytes=288000000,planeBytes=1440000000,residentBytes=1355716525;
  budget.retain(sourceBytes);let release,creations=0,inferences=0,projections=0;
  const inference={model:{...model,kind:'softmax'},backend:'webgpu-cpu',independentZoneWorker:false,
    get residentBytes(){return release?residentBytes:0;},releaseIdle(){release?.();release=undefined;},
    async run(){if(!release){release=budget.reserve(residentBytes);creations++;}inferences++;return{raw:new Float32Array(3*256**2),release(){}};},dispose(){this.releaseIdle();}};
  const project={async run(input){projections++;if(projections===1)assert.equal(inference.residentBytes,residentBytes);if(projections===2)assert.equal(inference.residentBytes,0);
    budget.retain(planeBytes);let owned=true;return{metadata:{zones:input.zones.map(z=>({id:z.id}))},release(){if(owned){owned=false;budget.retained-=planeBytes;}}};}};
  const prepare={async run(){return{tensor:new Float32Array(1),release(){}};}},session=createSegmentationAnalysis({budget,prepare,inference,project});
  let identity='c'.repeat(64);const inputSource={width:12000,height:8000,async sha256(){return identity;},region(){return{};}};
  const first=await session.run({inputSource,zones});assert.equal(creations,1);assert.equal(inferences,3);assert.equal(first.metadata.execution.projectionReleasedSessionBytes,0);
  const second=await session.reproject({analysisId:first.metadata.analysisId,zoneIds:zones.map(z=>z.id)});assert.equal(second.metadata.inferences,0);assert.equal(second.metadata.execution.projectionReleasedSessionBytes,residentBytes);assert.equal(inferences,3);
  const raw=session.readRaw(second.metadata.resultId);assert.equal(raw.rawGrids.length,3);raw.release();first.release();second.release();
  identity='d'.repeat(64);const third=await session.run({inputSource,zones});assert.equal(creations,2);assert.equal(inferences,6);assert.equal(third.metadata.execution.projectionReleasedSessionBytes,0);third.release();
  await session.dispose();inference.dispose();budget.retained-=sourceBytes;assert.equal(budget.total(),0);
});
