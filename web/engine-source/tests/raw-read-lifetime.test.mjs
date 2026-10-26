import test from 'node:test';
import assert from 'node:assert/strict';
import {withRawReadLifetime} from '../src/raw-read-lifetime.js';
import {sourceRegionRawResult} from '../src/source-region-raw-result.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createAutomaticD2prlProvider} from '../src/automatic-d2prl-provider.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('ordinary raw reads remain synchronous and keep exact typed-array identity',()=>{
 const value={raw:Float32Array.of(1,-0,NaN)},events=[],answer=withRawReadLifetime(()=>value,v=>v,{hold(){throw Error('Synchronous reads do not borrow an asynchronous lock');},release(){events.push('released');}});assert.equal(answer,value);assert.equal(answer instanceof Promise,false);assert.equal(Object.is(answer.raw[1],-0),true);assert.deepEqual(events,['released']);
});
for(const rejected of [false,true])test('asynchronous raw '+(rejected?'rejection':'completion')+' retains lock and reservation until its final transformation settles',async()=>{
 const stage=deferred(),events=[],failure=Object.assign(new Error('storage failed'),{code:'STORAGE_IO'}),answer=withRawReadLifetime(()=>stage.promise,p=>p.then(value=>({result:value})),{hold(){events.push('locked');return()=>events.push('unlocked');},release(){events.push('released');}});assert.deepEqual(events,['locked']);assert.equal(answer instanceof Promise,true);if(rejected){stage.reject(failure);await assert.rejects(answer,e=>e===failure);}else{const raw=Float32Array.of(1,-0);stage.resolve(raw);assert.equal((await answer).result,raw);}assert.deepEqual(events,['locked','unlocked','released']);
});
test('synchronous source or provenance failures release their reservation exactly once',()=>{
 for(const where of ['read','transform']){const failure=new Error(where),events=[];assert.throws(()=>withRawReadLifetime(()=>{if(where==='read')throw failure;return{};},()=>{throw failure;},{hold(){throw Error('No lock for rejected synchronous work');},release(){events.push('released');}}),e=>e===failure);assert.deepEqual(events,['released']);}
});
test('cleanup failure never hides the storage failure and both cleanup actions are attempted',async()=>{
 const failure=Object.assign(new Error('storage'),{code:'STORAGE_IO'}),events=[],answer=withRawReadLifetime(()=>Promise.reject(failure),v=>v,{hold(){return()=>{events.push('unlock');throw new Error('unlock failed');};},release(){events.push('release');throw new Error('release failed');}});await assert.rejects(answer,e=>e===failure&&e.details.cleanupErrors.length===2);assert.deepEqual(events,['unlock','release']);
});
test('asynchronous strict raw provenance restores Original identity without copying or detaching scientific arrays',async()=>{
 const state=await createOriginalSourceRegionsState({width:40,height:30,sourceSha256:'a'.repeat(64)});await state.add('acquisition',{x0:7,y0:5,x1:27,y1:25});const domain=await compileOriginalSourceRegions(state.snapshot()),values=Float32Array.of(0,-0,NaN,1.25),raw={id:'raw',imageId:'internal',operation:'ai.clones.d2prl',data:{values},provenance:{output:'native-before-postprocess'}},context={task:{imageId:'original',operation:raw.operation},original:{sha256:'a'.repeat(64)},entry:{id:'internal'},domain},answer=await sourceRegionRawResult(Promise.resolve(raw),context);assert.equal(answer.imageId,'original');assert.equal(answer.data.values,values);assert.equal(raw.imageId,'internal');assert.equal(answer.sourceRegionDomain.fingerprint,domain.fingerprint);assert.deepEqual(answer.sourceRegionOrigin,[7,5]);assert.equal(Object.is(answer.data.values[1],-0),true);assert.equal(Number.isNaN(answer.data.values[2]),true);const untouched=await sourceRegionRawResult(Promise.resolve(raw),null);assert.equal(untouched,raw);
});
for(const asynchronous of [false,true])test('automatic D2 provider keeps owned raw lifetime for '+(asynchronous?'strict asynchronous':'ordinary synchronous')+' banks',async()=>{
 let releases=0;const grid=Float32Array.of(1,-0,2),result={metadata:{analysisId:'analysis',resultId:'raw'}},adapter={async runOwned(){return{data:result,release(){}};},readRawOwned(){const answer={data:{rawGrids:[grid]},release(){releases++;}};return asynchronous?Promise.resolve(answer):answer;}},plan={width:16,height:16,cpu:true,jobs:[{id:'d2prl',enabled:true,minimum:500,params:{regions:[],excluded:[],compare:false}}]},provider=createAutomaticD2prlProvider({adapter,image:{},imageId:'source'}),run=await provider.run(plan.jobs[0],{plan}),pending=provider.readRaw(run.value);assert.equal(pending instanceof Promise,asynchronous);const owned=await pending;assert.equal(releases,0);assert.equal(owned.value.result.rawGrids[0],grid);owned.release();assert.equal(releases,1);
});
