import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
const enabled=process.execArgv.includes('--experimental-test-module-mocks');
let serial=0;
async function fixture(t,{computeFailure,coldFailure,selectionFailure,eligibilityFailure}={}){
 const budget=new Budget(256*1024**2),calls={compute:[0,0,0],cold:[0,0,0],selection:[0,0,0],links:[0,0,0],descriptor:0,mask:0},live=new Set(),owner=label=>{const id=Symbol(label),release=budget.reserve(128);live.add(id);let closed=false;return()=>{if(!closed){closed=true;live.delete(id);release();}};},bytes={byteLength:16,readInto(out){out.fill(1);}},jobs=Array.from({length:3},(_,i)=>({crop:{x:0,y:0},width:4,height:4,pass:{method:0,patch:2,targetPatch:2,reflection:false},eligibility:{},options:{radius:i+1},context:{id:i}}));
 t.mock.module('../src/dense-image.js',{namedExports:{denseImageParams:input=>({coherence:true,patch:2,limit:3,...input}),denseImageJobs:()=>({jobs,plan:{},contexts:[{}],policy:{}})}});
 t.mock.module('../src/dense-paged-zernike.js',{namedExports:{preparePagedZernike:async()=>{calls.descriptor++;return {first:bytes,dispose:owner('descriptor')};}}});
 t.mock.module('../src/dense-paged-regions.js',{namedExports:{preparePagedEligibility:async()=>{calls.mask++;await eligibilityFailure?.(calls.mask);return {mask:bytes,width:4,height:4,dimensions:12,dispose:owner('mask')};}}});
 t.mock.module('../src/dense-paged-field-pool.js',{namedExports:{DensePagedFieldPool:class{
  constructor(){this.jobs=0;this.peakWorkers=3;}
  async start(input,settings){this.jobs++;const id=settings.radius-1;calls.compute[id]++;await computeFailure?.(id,calls.compute[id],settings);return {id,width:4,height:4,targets:bytes,distancesSquared:bytes,allowed:input.mask,ownsAllowed:false,dispose:owner('field')};}
  async drain(){}
 }}});
 t.mock.module('../src/dense-cold-field.js',{namedExports:{storeColdDenseField:async field=>{calls.cold[field.id]++;await coldFailure?.(field.id,calls.cold[field.id]);return field;}}});
 t.mock.module('../src/dense-paged-coherence.js',{namedExports:{runPagedDenseCoherence:async field=>{calls.selection[field.id]++;await selectionFailure?.(field.id,calls.selection[field.id]);return {selected:bytes,dispose:owner('selected')};}}});
 t.mock.module('../src/dense-paged-links.js',{namedExports:{samplePagedDenseLinks:async field=>{calls.links[field.id]++;return {count:1,total:1,denseCount:1,rows:bytes,dispose(){}};}}});
 const {PagedDenseImageEngine}=await import('../src/dense-paged-image.js?checkpoint='+serial++),engine=new PagedDenseImageEngine({surface:{descriptor:{format:'rgb8',width:4,height:4}}},budget,{maxWorkers:3});return {engine,budget,calls,live};
}
for(const phase of ['compute','cold'])test('explicit resume retains validated dense work after five terminal '+phase+' transport failures',{skip:!enabled},async t=>{
 let failing=true;const state=await fixture(t,{[phase==='compute'?'computeFailure':'coldFailure']:id=>{if(id===1&&failing)throw new EngineError('WORKER_MESSAGE_FAILED','injected lost response');}}),{engine,budget,calls,live}=state;let result;
 try{
  await assert.rejects(engine.analyze({}, {checkpointKey:'session/patchmatch'}),error=>error.code==='WORKER_MESSAGE_FAILED'&&error.details?.recovery?.loopDetected===true);
  assert.equal(calls[phase][1],5,'The terminal guard must stop without an automatic restart');const previous=[...calls.compute];assert(live.size>0);assert.equal(calls.descriptor,1);
  failing=false;result=await engine.analyze({}, {checkpointKey:'session/patchmatch'});assert.equal(result.fields.length,3);assert.equal(calls.descriptor,1);assert.equal(calls.mask,3);assert.equal(calls.compute[0],previous[0]);assert.equal(calls.compute[2],previous[2]);assert.equal(calls.compute[1],previous[1]+(phase==='compute'?1:0));
  await engine.clearCheckpoint('unrelated');assert(live.size>0);await engine.clearCheckpoint('session/patchmatch');assert(live.size>0,'Delivered evidence must retain ownership after checkpoint removal');
 }finally{await result?.release();await engine.dispose();}assert.equal(live.size,0);assert.equal(budget.total(),0);
});

test('completed coherence selections survive the failure of the next selection',{skip:!enabled},async t=>{
 let fail=true;const {engine,budget,calls,live}=await fixture(t,{selectionFailure:id=>{if(id===1&&fail)throw new EngineError('MEMORY_ALLOCATION','injected selection refusal');}});let result;
 try{await assert.rejects(engine.analyze({}, {checkpointKey:'selection'}),{code:'MEMORY_ALLOCATION'});assert.deepEqual(calls.selection,[1,1,0]);fail=false;result=await engine.analyze({}, {checkpointKey:'selection'});assert.deepEqual(calls.compute,[1,1,1]);assert.deepEqual(calls.selection,[1,2,1]);assert.deepEqual(calls.links,[1,1,1]);}finally{await result?.release();await engine.dispose();}assert.equal(live.size,0);assert.equal(budget.total(),0);
});

test('a cancelled checkpoint retains completed hypotheses until explicit cleanup',{skip:!enabled},async t=>{
 const {engine,budget,calls,live}=await fixture(t),controller=new AbortController();let result;
 try{await assert.rejects(engine.analyze({}, {checkpointKey:'cancelled',signal:controller.signal,onProgress:event=>{if(event.phase==='field-complete')controller.abort();}}),{code:'CANCELLED'});const previous=[...calls.compute];assert(live.size>0);result=await engine.analyze({}, {checkpointKey:'cancelled'});assert.deepEqual(calls.compute,previous);assert.equal(calls.descriptor,1);}finally{await result?.release();await engine.dispose();}assert.equal(live.size,0);assert.equal(budget.total(),0);
});

test('changing checkpoint parameters retires the old incomplete owners',{skip:!enabled},async t=>{
 let fail=true;const {engine,budget,live}=await fixture(t,{selectionFailure:id=>{if(id===0&&fail)throw new Error('selection');}});let result;
 try{await assert.rejects(engine.analyze({}, {checkpointKey:'params'}),/selection/);const retained=[...live];fail=false;result=await engine.analyze({iterations:2}, {checkpointKey:'params'});assert(retained.every(id=>!live.has(id)),'Old fields or selections stayed pinned after parameter change');}finally{await result?.release();await engine.dispose();}assert.equal(live.size,0);assert.equal(budget.total(),0);
});

test('preparation resumes on the first useful field completion while another field remains active',{skip:!enabled,timeout:5000},async t=>{
 let releaseFirst,releaseSecond,refused,thirdStarted;const first=new Promise(resolve=>{releaseFirst=resolve;}),second=new Promise(resolve=>{releaseSecond=resolve;}),rejected=new Promise(resolve=>{refused=resolve;}),third=new Promise(resolve=>{thirdStarted=resolve;});let secondFinished=false;
 const {engine,budget,calls,live}=await fixture(t,{eligibilityFailure:count=>{if(count===3){refused();throw new EngineError('MEMORY_LIMIT','Injected transient policy shortage');}},computeFailure:async id=>{if(id===0)await first;if(id===1){await second;secondFinished=true;}if(id===2)thirdStarted();}});let result,pending;
 try{pending=engine.analyze({}, {checkpointKey:'first-return'});await rejected;releaseFirst();await third;assert.equal(secondFinished,false,'A surviving peer must not create an all-fields barrier');assert.deepEqual(calls.compute,[1,1,1]);assert.equal(calls.mask,4);releaseSecond();result=await pending;}finally{releaseFirst();releaseSecond();await pending?.catch(()=>{});await result?.release();await engine.dispose();}assert.equal(live.size,0);assert.equal(budget.total(),0);
});
