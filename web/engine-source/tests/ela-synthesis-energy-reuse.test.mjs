import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {computeElaSynthesisEnergy,createElaSynthesisEnergyCache,synthesisEnergyStageWorkspace} from '../src/ela-synthesis-energy.js';
import {nativeEnergyScores} from '../src/energy-score-native.js';

const MiB=1024**2,log=Math.log;
function fixture({width=160,height=160,limit=128*MiB,contextIdentity}={}){
 const budget=new Budget(limit),original=new Uint8Array(width*height*3).fill(90),residual=Uint8Array.from({length:width*height*3},(_,i)=>(Math.imul(i,37)+(i>>7))%256),store=data=>({byteLength:data.byteLength,readInto(target,offset){target.set(data.subarray(offset,offset+target.length));},dispose(){}});
 const image={sha256:'a'.repeat(64),provenance:{decoder:'controlled-rgb8'},surface:createRgbSurface(store(original),{width,height,budget,ownsStore:false})},base=createRgbSurface(store(residual),{width,height,budget,ownsStore:false});let reads=0,panels=0;
 const synthesis={descriptor:base.descriptor,readWindow(...args){reads++;return base.readWindow(...args);}},hooks={log,scoreBackend:'cpu',panelDetector:async()=>{panels++;return{polygons:[],dispose(){}};}};
 const cache=createElaSynthesisEnergyCache(image,synthesis,budget,{synthesisKey:'verified-synthesis-A',contextIdentity});
 return{budget,image,base,synthesis,cache,hooks,get reads(){return reads;},get panels(){return panels;},async dispose(){await cache.dispose();await image.surface.dispose();await base.dispose();assert.equal(budget.total(),0);}};
}
async function bytes(store){const value=new Uint8Array(store.byteLength);await store.readInto(value,0);return value;}
async function exact(actual,expected){for(const name of['energy_scope','energy_low_score','energy_high_score','energy_labels'])assert.deepEqual(await bytes(actual[name]),await bytes(expected[name]),name);assert.deepEqual(await bytes(actual.energy_planes[0]),await bytes(expected.energy_planes[0]));assert.deepEqual(actual.energy_summary,expected.energy_summary);assert.deepEqual(actual.regions,expected.regions);assert.deepEqual(actual.regionColors,expected.regionColors);const metadata=structuredClone(actual.metadata);delete metadata.energy.preparedIdentity;delete metadata.energy.residualIdentity;assert.deepEqual(metadata,expected.metadata);}

test('threshold/minimum/block commits reuse the exact primitive/panels/scores; quantiles invalidate only preparation',async()=>{
 const h=fixture(),variants=[{block:16,profile:'manual',shadow:20},{block:16,profile:'manual',shadow:80},{block:16,profile:'manual',shadow:80,minimum:4},{block:32,profile:'manual',shadow:80},{block:16,profile:'manual',histogramLow:100,histogramHigh:900},{block:16,profile:'manual',shadow:20}],leases=[];let identity,first,initialReads;
 try{
  for(let i=0;i<variants.length;i++){
   const answer=await h.cache.analyze(variants[i],h.hooks),data=answer.analysis.value,reference=await computeElaSynthesisEnergy(h.image,h.base,variants[i],{...h.hooks,budget:h.budget,synthesisKey:'verified-synthesis-A',panelDetector:async()=>({polygons:[],dispose(){}})});
   try{await exact(data,reference.data);}finally{await reference.dispose();}
   if(i===0){identity=data.metadata.energy.preparedIdentity;initialReads=h.reads;first=answer.analysis;leases.push(first.retain());assert.equal(answer.metrics.synthesisEnergyPlanesComputed,1);assert.equal(answer.metrics.energyPreparationsComputed,1);}
   else{assert.equal(answer.metrics.synthesisEnergyPlanesComputed,0);assert.equal(answer.metrics.energyPanelDetections,0);assert.equal(h.reads,initialReads);assert.equal(answer.metrics.energyPreparationsComputed,i===4?1:0);if(i!==4)assert.equal(data.metadata.energy.preparedIdentity,identity);else assert.notEqual(data.metadata.energy.preparedIdentity,identity);}
   assert.equal(data.metadata.energy.residualIdentity,first.value.metadata.energy.residualIdentity,'native residual identity is independent of quantiles and segmentation');
  }
  assert.equal(h.panels,1);const before=h.reads;await assert.rejects(h.cache.analyze({block:64},h.hooks),{code:'INVALID_INPUT'});assert.equal(h.reads,before,'25-cell admission is not bypassed by the reusable primitive');assert.equal(first.value.energyPlaneCount,1);
 }finally{for(const release of leases)await release();await h.dispose();}
});

test('returned metadata, params and read-only field handles cannot poison a reusable preparation',async()=>{
 const h=fixture({width:80,height:80}),input={block:16,profile:'manual',shadow:20};
 try{const pending=h.cache.analyze(input,h.hooks);input.shadow=80;const first=await pending;assert.equal(first.analysis.value.metadata.energy.thresholds[0],2);
  assert.throws(()=>first.analysis.value.metadata.energy.quantiles[0]=.5,TypeError);assert.throws(()=>first.analysis.value.energy_summary[0].bbox[0]=1,TypeError);assert.throws(()=>first.analysis.value.energy_planes[0]=null,TypeError);assert.throws(()=>first.analysis.value={},TypeError);assert.equal(first.analysis.value.energy_low_score.write,undefined);assert.equal(first.analysis.value.energy_low_score.dispose,undefined);
  first.metrics.cache.result='poison';const again=await h.cache.analyze({block:16,profile:'manual',shadow:20},h.hooks);assert.equal(again.metrics.cache.result,true);assert.equal(again.analysis.value.metadata.energy.thresholds[0],2);assert.equal(again.metrics.energyPreparationsComputed,0);
 }finally{await h.dispose();}
});

test('same-sized source contexts and changed source revisions never share a prepared identity',async()=>{
 const a=fixture({width:80,height:80,contextIdentity:{domain:'domain-A',bounds:[0,0,80,80],originalBounds:[10,20,90,100]}}),b=fixture({width:80,height:80,contextIdentity:{domain:'domain-B',bounds:[80,0,160,80],originalBounds:[90,20,170,100]}});
 try{const first=await a.cache.analyze({block:16},a.hooks),other=await b.cache.analyze({block:16},b.hooks);assert.notEqual(first.analysis.value.metadata.energy.preparedIdentity,other.analysis.value.metadata.energy.preparedIdentity);
  const release=first.analysis.retain(),before=await bytes(first.analysis.value.energy_low_score);a.image.surface={...a.image.surface,descriptor:Object.freeze({...a.image.surface.descriptor,revision:2})};const next=await a.cache.analyze({block:16},a.hooks);assert.equal(next.metrics.synthesisEnergyPlanesComputed,1);assert.notEqual(first.analysis.value.metadata.energy.preparedIdentity,next.analysis.value.metadata.energy.preparedIdentity);assert.deepEqual(await bytes(first.analysis.value.energy_low_score),before,'published old fields remain leased across source replacement');await release();
 }finally{await a.dispose();await b.dispose();}
});

test('CPU/GPU score variants retain their real provider, reuse primitives, and never replay GPU for threshold changes',async()=>{
 const h=fixture({width:80,height:80});let gpuCalls=0;const gpu={selectBackend:()=> 'webgpu',async runScores(planes,scope,summaries,options){gpuCalls++;await nativeEnergyScores(planes,scope,summaries,options);return{backend:'webgpu-fake-only',totalMs:1};}};
 try{const cpu=await h.cache.analyze({block:16,profile:'manual',shadow:20},h.hooks),gpuFirst=await h.cache.analyze({block:16,profile:'manual',shadow:20},{...h.hooks,scoreBackend:'webgpu',scoreGpu:gpu}),gpuNext=await h.cache.analyze({block:16,profile:'manual',shadow:80},{...h.hooks,scoreBackend:'webgpu',scoreGpu:gpu});
  assert.equal(gpuCalls,1);assert.equal(gpuFirst.metrics.backend,'webgpu');assert.equal(gpuNext.metrics.energyPreparationsComputed,0);assert.equal(gpuNext.metrics.energyScoreGpu.cached,true);assert.equal(gpuNext.metrics.energyScoreGpu.totalMs,0);assert.equal(cpu.metrics.backend,'cpu');assert.equal(h.panels,1);assert.notEqual(cpu.analysis.value.metadata.energy.preparedIdentity,gpuFirst.analysis.value.metadata.energy.preparedIdentity);
  assert.equal(cpu.analysis.value.metadata.energy.residualIdentity,gpuFirst.analysis.value.metadata.energy.residualIdentity);for(const name of['energy_scope','energy_low_score','energy_high_score'])assert.deepEqual(await bytes(cpu.analysis.value[name]),await bytes(gpuFirst.analysis.value[name]));await assert.rejects(h.cache.analyze({block:16},{...h.hooks,scoreBackend:'webgpu'}),{code:'GPU_UNAVAILABLE'});
 }finally{await h.dispose();}
});

test('idle reclaim drops cache-only references while published field leases stay readable; small budgets recompute exactly',async()=>{
 const h=fixture({width:80,height:80});
 try{const first=await h.cache.analyze({block:16},h.hooks),release=first.analysis.retain(),expected=await bytes(first.analysis.value.energy_low_score);await h.budget.reclaim(h.budget.limit);assert.deepEqual(await bytes(first.analysis.value.energy_low_score),expected);await release();assert.equal(h.budget.total(),0);const after=await h.cache.analyze({block:16},h.hooks);assert.equal(after.metrics.synthesisEnergyPlanesComputed,1);
 }finally{await h.dispose();}
 const low=fixture({width:80,height:80,limit:16*MiB});low.budget.isBackingUnderPressure=()=>true;let retain;try{const a=await low.cache.analyze({block:16,profile:'manual',shadow:20},low.hooks);retain=a.analysis.retain();const b=await low.cache.analyze({block:16,profile:'manual',shadow:80},low.hooks);assert.equal(b.metrics.synthesisEnergyPlanesComputed,1,'optional staged cache is not retained under backing pressure even when native computation fits');assert.equal(a.analysis.value.energyPlaneCount,1);}finally{await retain?.();await low.dispose();}
});

test('sensitive and conservative reuse their automatic estimate but retain their own effective quantile maps',async()=>{
 const h=fixture({width:80,height:80});try{
  const sensitive=await h.cache.analyze({block:16,profile:'sensitive'},h.hooks),reads=h.reads,conservative=await h.cache.analyze({block:16,profile:'conservative'},h.hooks);
  assert.equal(sensitive.metrics.energyAutomaticProfilesComputed,1);assert.equal(conservative.metrics.energyAutomaticProfilesComputed,0);assert.equal(conservative.metrics.synthesisEnergyPlanesComputed,0);assert.equal(h.reads,reads);assert.equal(h.panels,1);
  const reference=await computeElaSynthesisEnergy(h.image,h.base,{block:16,profile:'conservative'},{...h.hooks,budget:h.budget,synthesisKey:'verified-synthesis-A',panelDetector:async()=>({polygons:[],dispose(){}})});try{await exact(conservative.analysis.value,reference.data);}finally{await reference.dispose();}
  assert.equal(sensitive.analysis.value.metadata.energy.residualIdentity,conservative.analysis.value.metadata.energy.residualIdentity);
 }finally{await h.dispose();}
});

test('source mutation while a new primitive is being acquired cannot publish or poison a staged cache',async()=>{
 const h=fixture({width:80,height:80}),read=h.synthesis.readWindow;let changed=false;
 h.synthesis.readWindow=async(...args)=>{const answer=await read(...args);if(!changed){changed=true;h.image.surface={...h.image.surface,descriptor:Object.freeze({...h.image.surface.descriptor,revision:2})};}return answer;};
 try{await assert.rejects(h.cache.analyze({block:16},h.hooks),{code:'STALE_RESULT'});assert.equal(h.panels,0);assert.equal(h.budget.total(),0);const actual=await h.cache.analyze({block:16},h.hooks);assert.equal(actual.metrics.synthesisEnergyPlanesComputed,1);assert.equal(h.panels,1);}finally{await h.dispose();}
});

test('failed stage retirement retains its credit and preserves a frozen ACK error until cleanup retry',async()=>{
 const h=fixture({width:80,height:80});let refuse=true,enter,ack;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>ack=resolve),failure=Object.freeze(Object.assign(Error('Panel retirement ACK refused'),{code:'ACK_REFUSED'}));
 h.hooks.panelDetector=async()=>{const free=h.budget.reserve(4096);return{polygons:[],async dispose(){enter();await gate;if(refuse)throw failure;free();}};};
 try{await h.cache.analyze({block:16},h.hooks);const closing=h.cache.dispose(),rejected=assert.rejects(closing,error=>error===failure);await entered;assert(h.budget.total()>=4096);ack();await rejected;assert(h.budget.total()>=4096);refuse=false;await h.cache.dispose();assert.equal(h.budget.total(),0);}finally{refuse=false;ack?.();await h.dispose();}
});

test('a published lease may outlive cache closure and still retain/retry a late failed retirement',async()=>{
 const h=fixture({width:80,height:80}),failure=Object.freeze(Object.assign(Error('Late panel retirement ACK refused'),{code:'ACK_REFUSED'}));let refuse=true;
 h.hooks.panelDetector=async()=>{const free=h.budget.reserve(4096);return{polygons:[],dispose(){if(refuse)throw failure;free();}};};
 try{const answer=await h.cache.analyze({block:16},h.hooks),lease=answer.analysis.retain(),expected=await bytes(answer.analysis.value.energy_low_score);await h.cache.dispose();assert.deepEqual(await bytes(answer.analysis.value.energy_low_score),expected);await assert.rejects(lease(),error=>error===failure);assert(h.budget.total()>=4096);refuse=false;await h.budget.reclaim(h.budget.limit);assert.equal(h.budget.total(),0);await lease();}finally{refuse=false;await h.dispose();}
});


test('phase admission keeps a large prepared hit eligible without reserving an unexecuted GPU preparation',()=>{
 const width=6000,height=6000,n=width*height,limit=2*1024**3,occupied=1024**3;
 const segment=synthesisEnergyStageWorkspace(width,height,'segment'),cpu=synthesisEnergyStageWorkspace(width,height,'prepared',{backend:'cpu'}),gpu=synthesisEnergyStageWorkspace(width,height,'prepared',{backend:'auto',scoreGpu:true});
 assert(segment>=14*n,'all live queue/labels/values at the selected-region peak are counted');assert(segment<14*n+16*MiB,'retired pagers are not charged again during rank selection');
 assert(occupied+segment+1024<limit,'same prepared maps can stay retained before a segmentation-only threshold commit');assert(occupied+gpu>limit,'a GPU miss still asks cache-only owners to retire before the native44N gate');
 assert(cpu>=21*n);assert(gpu>=44*n+8*MiB);assert.equal(synthesisEnergyStageWorkspace(width,height,'prepared',{backend:'cpu',scoreGpu:true}),cpu);
 const odd=synthesisEnergyStageWorkspace(6001,height,'segment');assert(odd>segment,'odd-width horizontal-run queues are included without rounding down');
 assert.throws(()=>synthesisEnergyStageWorkspace(6000,height,'unknown'),{code:'INVALID_INPUT'});
});

test('a rejected unpublished stage preserves its primary source failure and retries a refused retirement ACK',async()=>{
 const h=fixture({width:80,height:80}),failure=Object.freeze(Object.assign(Error('unpublished panel ACK refused'),{code:'ACK_REFUSED'}));let refuse=true;
 h.hooks.panelDetector=async()=>{const free=h.budget.reserve(4096);h.image.surface={...h.image.surface,descriptor:Object.freeze({...h.image.surface.descriptor,revision:2})};return{polygons:[],dispose(){if(refuse)throw failure;free();}};};
 try{await assert.rejects(h.cache.analyze({block:16},h.hooks),{code:'STALE_RESULT'});assert(h.budget.total()>=4096);refuse=false;await h.cache.dispose();assert.equal(h.budget.total(),0);}finally{refuse=false;await h.dispose();}
});
