import test from 'node:test';
import assert from 'node:assert/strict';
import {createComplete96Progress,preserveComplete96Archive,startComplete96Diagnostics} from './m5-complete-96mp-browser.js';

test('qualification records every recovery transition and observes surviving peers after a detector failure',()=>{
 const emitted=[],observer=createComplete96Progress({started:0,now:()=>42,emit:e=>emitted.push(e)});
 const failed={states:{d2prl:'failed',patchmatch:'running'},errors:{d2prl:{code:'MEMORY_ALLOCATION',message:'Array buffer allocation failed'}},completed:[]};
 observer.progress({phase:'automatic-state',state:failed});
 const initialError=observer.firstFailure;
 for(const waitStage of ['waiting','resumed'])observer.progress({phase:'resource-wait',stage:'inference',waitStage,group:'patchmatch'});
 observer.progress({phase:'automatic-state',state:{...failed,states:{d2prl:'failed',patchmatch:'done'},completed:['patchmatch']}});
 assert.equal(observer.firstFailure,initialError);assert.equal(initialError.detector,'d2prl');
 assert.deepEqual(observer.state.completed,['patchmatch']);assert.equal(emitted.length,4);
 assert.deepEqual(emitted.filter(e=>e.phase==='resource-wait').map(e=>e.waitStage),['waiting','resumed']);
});

test('periodic diagnostics use only accounting and cancel their read without cancelling useful work',async()=>{
 let tick,activeSignal,stopCount=0,reads=0;const events=[];
 const engine={capabilities({signal}){reads++;activeSignal=signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('read cancelled')),{once:true}));}};
 const stop=startComplete96Diagnostics(engine,e=>events.push(e),{schedule(fn){tick=fn;return 1;},unschedule(id){assert.equal(id,1);stopCount++;}});
 const pending=tick();await tick();assert.equal(reads,1);stop();await pending;
 assert.equal(activeSignal.aborted,true);assert.equal(stopCount,1);assert.deepEqual(events,[]);await tick();assert.equal(reads,1);
});

test('post-analysis failure exports retained science before disposing its owner',async()=>{
 const events=[],calls=[],archive={id:'a',revision:1,byteLength:8,sha256:'hash'};
 const engine={async exportAutomatic(args){calls.push(args.analysisId);return archive;},async releaseExport(id){calls.push('release:'+id);}};
 await preserveComplete96Archive({engine,analysis:{analysisId:'retained',state:{states:{d2prl:'done'}}},progress:e=>events.push(e),verify:async()=>({verifiedBytes:8,strings:{metadata_json:'{}'}}),deliver:()=>{}});
 assert.deepEqual(calls,['retained','release:a']);assert.equal(events[0].phase,'diagnostic-partial-archive');assert.equal(events[0].passed,false);
});

test('post-unload failure reuses committed archive and reports cleanup as secondary',async()=>{
 const events=[],archive={id:'committed',revision:1,byteLength:8,sha256:'hash'};
 const engine={async exportAutomatic(){assert.fail('source analysis was unloaded');},async releaseExport(){throw Object.assign(Error('cleanup refused'),{code:'STORAGE_IO'});}};
 await preserveComplete96Archive({engine,analysis:{analysisId:'unloaded'},archive,progress:e=>events.push(e),verify:async()=>({verifiedBytes:8,strings:{metadata_json:'{}'}}),deliver:()=>{}});
 assert.deepEqual(events.map(e=>e.phase),['diagnostic-partial-archive','diagnostic-cleanup-error']);
 events.length=0;
 await preserveComplete96Archive({engine,archive,progress:e=>events.push(e),verify:async()=>{throw Error('read failed');}});
 assert.deepEqual(events.map(e=>e.message),['read failed','cleanup refused']);
});
