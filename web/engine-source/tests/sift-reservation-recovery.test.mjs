import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {SiftPool} from '../src/sift-paged.js';
import {SiftPagedResources} from '../src/sift-paged-resources.js';
const gate=()=>{let resolve;return {promise:new Promise(done=>{resolve=done;}),resolve:value=>resolve(value)};};

test('SIFT retries the whole admitted peak after returning input, waiting for actual peer credit',{timeout:3000},async()=>{
 const budget=new Budget(300),peerCredit=budget.reserve(100),returned=peerCredit.split(56),peer=budget.beginOperation({owner:'peer'}),entered=gate(),events=[],saved=globalThis.Worker;peer.setState('io');let reads=0,computes=0;
 globalThis.Worker=class{terminate(){}postMessage(message){queueMicrotask(()=>{if(message.kind==='init')this.onmessage({data:{ready:true}});else{computes++;this.onmessage({data:{base:message.input.slice()}});}});}};
 const owner={profile:{maxWorkers:1},workers:new Set()},pool=new SiftPool(owner,{budget,heap:128,cost:()=>256,inputBytes:100,provider:'cpu',backend:'cpu',wasm:new Uint8Array(),layers:3,contrast:.04,onProgress:event=>{events.push(structuredClone(event));if(event.phase==='resource-wait'&&event.stage==='waiting')entered.resolve(event);}}),acquire=pool.scheduler.acquire.bind(pool.scheduler);let admissionFault=true;
 // A real Budget refusal at the second admission boundary. The scheduler may
 // reject at this boundary; cleanup returns this tile's input before recovery.
 pool.scheduler.acquire=async request=>{if(request.label==='sift-prepare'&&admissionFault){admissionFault=false;budget.reserve(request.bytes)();}return acquire(request);};
 try{await pool.open(1);const outputs=[],work=pool.run([0],async()=>{reads++;return {kind:'prepare',input:Uint8Array.of(7,8,9)};},async value=>outputs.push([...value.base]));const waiting=await entered.promise;assert.equal(reads,1);assert.equal(computes,0);assert.equal(waiting.requestedBytes,256);assert.equal(budget.total(),100);const error=events.find(e=>e.phase==='resource-recovery').error;assert.deepEqual(error.details.admission,{requestedBytes:156,rollbackBytes:100,retryBytes:256});
  peer.commit();await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,1,'A commit without memory return must not consume another retry');returned();await work;assert.equal(reads,2);assert.equal(computes,1);assert.deepEqual(outputs,[[7,8,9]]);assert.equal(events.filter(e=>e.phase==='resource-recovery').length,1);
 }finally{pool.close();pool.scheduler.acquire=acquire;returned();peerCredit();peer.release();globalThis.Worker=saved;}assert.equal(budget.total(),0);assert.equal(budget.recovering,false);for(const domain of Object.values(budget.resourceSnapshot().domains))assert.equal(domain.reservedBytes,0);
});

test('SIFT cleanup tracks retained heap and extra buffers but excludes published split owners',async()=>{
 const budget=new Budget(1000),scope=budget.beginReservationScope(),heap=scope.track(budget.reserve(128)),workspace=scope.track(budget.reserve(100)),operation=budget.beginOperation({owner:'sift'}),scheduler={async acquire({bytes=0}){const owned=budget.reserve(bytes);return {retainMemory:count=>owned.split(count),release:owned};}},resources=new SiftPagedResources({budget,scheduler,operation,owner:'sift',workspaceBytes:100,memoryReservations:[workspace],reservationScope:scope});
 await resources.message({action:'backing',backingId:1,kind:'array-buffer',bytes:20,label:'published-output'});await resources.message({action:'backing',backingId:2,kind:'array-buffer',bytes:150,label:'temporary-native-output'});const published=resources.retainMemory(20),backing=resources.adoptBacking(1),failure=scope.capture(new EngineError('MEMORY_LIMIT','Next allocation refused',{details:{requestedBytes:300}}));
 resources.close();workspace();heap();scope.close();assert.deepEqual(failure.details.admission,{requestedBytes:300,rollbackBytes:278,retryBytes:578});assert.equal(budget.total(),20);published();backing();operation.release();assert.equal(failure.details.admission.rollbackBytes,278,'Published release must not inflate the old retry demand');assert.equal(budget.total(),0);
});
