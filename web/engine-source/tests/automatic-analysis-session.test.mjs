import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Budget} from '../src/cache.js';import {createAutomaticAnalysisSession} from '../src/automatic-analysis-session.js';import {automaticAnalysisPlan,automaticSelection} from '../src/automatic-analysis-plan.js';import {composeAutomaticEla} from '../src/automatic-ela.js';import {automaticElaFixture} from './automatic-ela-fixture.js';
const plan=()=>automaticAnalysisPlan({width:67,height:73,complete:true,...automaticSelection(67,73,[])}),delay=()=>new Promise(resolve=>setTimeout(resolve,2));
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('a provider resumes on admission credit while the producer still owns live work',{timeout:3000},async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.filter(j=>['patchmatch','sift'].includes(j.id));const finishPeer=gate(),waiting=gate(),resumed=gate();let returned,attempts=0;
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{
  patchmatch:{async run(){const operation=budget.beginOperation({owner:'patchmatch',id:'continuing-IO'}),held=budget.reserve(budget.limit-budget.total()-20);returned=held.split(40);operation.setState('io');try{await finishPeer.promise;return {value:{done:true},release(){}};}finally{held();returned();operation.release();}}},
  sift:{async run(){attempts++;const release=budget.reserve(40);resumed.resolve();return {value:{done:true},release};}}
 }});
 const work=session.run({onProgress:event=>{if(event.phase==='resource-wait'&&event.stage==='waiting'){assert.equal(event.kind,'policy');waiting.resolve();}}});
 try{await waiting.promise;assert.equal(attempts,1);returned();await resumed.promise;assert.equal(attempts,2);assert.equal(session.snapshot().states.patchmatch,'running');finishPeer.resolve();const state=await work;assert.equal(state.states.sift,'done');assert.equal(state.attempts.sift,2);}
 finally{finishPeer.resolve();await session.dispose();}assert.equal(budget.total(),0);assert.equal(budget.listeners.size,0);assert.equal(budget.resourceSnapshot().pressures.length,0);
});
// These providers exercise lifecycle protocols only, not detector fidelity.
test('memory retry resumes after a peer releases its workspace while the long group still runs',{timeout:2000},async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.filter(j=>['patchmatch','sift','ela'].includes(j.id));
 const dense=gate(),sparse=gate(),waiting=gate(),resumed=gate(),calls=[];
 const session=createAutomaticAnalysisSession({plan:p,budget,maxConcurrent:3,providers:{
  patchmatch:{async run(){const free=budget.reserve(100000);try{await dense.promise;return {value:{},release(){}};}finally{free();}}},
  sift:{async run(){const free=budget.reserve(600000);try{await sparse.promise;return {value:{},release(){}};}finally{free();}}},
  ela:{async run(job,h){calls.push(h.concurrency);const free=budget.reserve(500000);resumed.resolve();return {value:{},release:free};}}
 }});
 const work=session.run({onState:s=>{if(s.states.ela==='waiting-memory')waiting.resolve();}});
 try{await waiting.promise;assert.deepEqual(calls,[3]);sparse.resolve();await resumed.promise;
  assert.equal(session.snapshot().states.patchmatch,'running');assert.deepEqual(calls,[3,2]);dense.resolve();
  const state=await work;assert.ok(Object.values(state.states).every(s=>s==='done'));assert.deepEqual(state.attempts,{patchmatch:1,sift:1,ela:2});
 }finally{dense.resolve();sparse.resolve();await session.dispose();}assert.equal(budget.total(),0);
});
test('persistent memory failure waits for peers and stops after five comparable failures even when alone',{timeout:2000},async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.filter(j=>['patchmatch','sift','ela'].includes(j.id));
 const dense=gate(),sparse=gate(),first=gate(),second=gate(),calls=[];
 const session=createAutomaticAnalysisSession({plan:p,budget,maxConcurrent:3,providers:{
  patchmatch:{async run(){await dense.promise;return {value:{},release(){}};}},
  sift:{async run(){await sparse.promise;return {value:{},release(){}};}},
  ela:{async run(job,h){calls.push(h.concurrency);budget.reserve(2*1024**2);}}
 }});
 const work=session.run({onState:s=>{if(s.states.ela==='waiting-memory')(s.attempts.ela===1?first:second).resolve();}});
 try{await first.promise;await delay();assert.deepEqual(calls,[3]);sparse.resolve();await second.promise;await delay();assert.deepEqual(calls,[3,2]);dense.resolve();
  const state=await work;assert.equal(state.states.ela,'failed');assert.equal(state.errors.ela.code,'MEMORY_LIMIT');assert.deepEqual(calls,[3,2,1,1,1]);
 }finally{dense.resolve();sparse.resolve();await session.dispose();}assert.equal(budget.total(),0);
});
test('real allocation failure waits for a peer and retains already completed scientific results',{timeout:2000},async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.filter(j=>['patchmatch','sift','ela'].includes(j.id));
 const first=gate(),peer=gate(),waiting=gate(),resumed=gate(),calls=[];let completedRuns=0,completedReleased=0;
 const session=createAutomaticAnalysisSession({plan:p,budget,maxConcurrent:3,providers:{
  patchmatch:{async run(job,h){calls.push(h.concurrency);const free=budget.reserve(100000);try{if(h.attempt===1){await first.promise;await new Promise(resolve=>setImmediate(resolve));throw Object.assign(new RangeError('Actual segment allocation refused'),{code:'MEMORY_ALLOCATION'});}resumed.resolve();return {value:{descriptors:'complete'},release(){}};}finally{free();}}},
  sift:{async run(){await peer.promise;return {value:{},release(){}};}},
  ela:{async run(){completedRuns++;return {value:{pixels:new Uint8Array([7,11,13])},release(){completedReleased++;}};}}
 }});
 const work=session.run({onState:s=>{if(s.states.ela==='done')first.resolve();if(s.states.patchmatch==='waiting-memory')waiting.resolve();}});
 try{await waiting.promise;assert.deepEqual(calls,[3]);assert.equal(completedReleased,0);peer.resolve();await resumed.promise;const state=await work;
  assert.equal(state.states.patchmatch,'done');assert.equal(state.errors.patchmatch,undefined);assert.equal(completedRuns,1);assert.deepEqual(calls,[3,1]);
  const results=session.acquireResults();try{assert.deepEqual([...results.values.ela.pixels],[7,11,13]);}finally{await results.release();}
 }finally{first.resolve();peer.resolve();await session.dispose();}assert.equal(completedReleased,1);assert.equal(budget.total(),0);
});
test('persistent allocator refusal stops after bounded peer-settlement retries and preserves its cause',{timeout:2000},async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.filter(j=>['patchmatch','sift','ela'].includes(j.id));
 const peer1=gate(),peer2=gate(),first=gate(),second=gate(),calls=[];
 const session=createAutomaticAnalysisSession({plan:p,budget,maxConcurrent:3,providers:{
  patchmatch:{async run(job,h){calls.push(h.concurrency);throw Object.assign(new RangeError('4 MiB shared bank refused'),{code:'MEMORY_ALLOCATION'});}},
  sift:{async run(){await peer1.promise;return {value:{},release(){}};}},ela:{async run(){await peer2.promise;return {value:{},release(){}};}}
 }});
 const work=session.run({onState:s=>{if(s.states.patchmatch==='waiting-memory')(s.attempts.patchmatch===1?first:second).resolve();}});
 try{await first.promise;assert.deepEqual(calls,[3]);peer1.resolve();await second.promise;assert.deepEqual(calls,[3,2]);peer2.resolve();const state=await work;
  assert.deepEqual(calls,[3,2,1,1,1]);assert.equal(state.states.patchmatch,'failed');assert.equal(state.errors.patchmatch.code,'MEMORY_ALLOCATION');assert.equal(state.errors.patchmatch.message,'4 MiB shared bank refused');assert.equal(state.errors.patchmatch.name,'RangeError');assert.match(state.errors.patchmatch.stack,/4 MiB shared bank refused/);assert.equal(state.errors.patchmatch.details.recovery.loopDetected,true);assert.equal(state.errors.patchmatch.details.recovery.consecutiveFailures,5);assert.equal(state.preflightExecutions,0);
 }finally{peer1.resolve();peer2.resolve();await session.dispose();}assert.equal(budget.total(),0);
});
test('useful parallel admission retries only failed groups; independent view caches retain owned frames',async()=>{
 const budget=new Budget(1024**2),p=plan(),runs={},prepares={},providers=Object.fromEntries(p.jobs.map(j=>[j.id,{async run(job,h){runs[j.id]=(runs[j.id]??0)+1;const temporary=h.budget.reserve(700000);try{await delay();const release=h.budget.reserve(256);return {value:{id:j.id},release};}finally{temporary();}},async prepare(value,f,h){prepares[j.id]=(prepares[j.id]??0)+1;return {value:{entries:[],version:prepares[j.id],minimum:f.d2Minimum},release:h.budget.reserve(128)};}}])),session=createAutomaticAnalysisSession({plan:p,providers,budget,maxConcurrent:2});
 const state=await session.run();assert.ok(Object.values(state.states).every(x=>x==='done'));assert.deepEqual(runs,{patchmatch:1,sift:2,forgeryscope:1,d2prl:1,ela:1});assert.equal(state.preflightExecutions,0);assert.throws(()=>session.run(),{code:'ALREADY_RUN'});
 const first=await session.prepare(),again=await session.prepare();assert.deepEqual(prepares,{patchmatch:1,sift:1,forgeryscope:1,d2prl:1,ela:1});await again.release();
 const distance=await session.prepare({low:20});assert.deepEqual(prepares,{patchmatch:2,sift:2,forgeryscope:2,d2prl:1,ela:1});await distance.release();
 const d2=await session.prepare({low:20,d2Minimum:800});assert.deepEqual(prepares,{patchmatch:2,sift:2,forgeryscope:2,d2prl:2,ela:1});await d2.release();
 const ela=await session.prepare({low:20,d2Minimum:800,elaThreshold:3});assert.equal(prepares.ela,2);assert.equal(runs.d2prl,1);assert.equal(first.groups.d2prl.minimum,500);const borrowed=session.acquireResults();await session.dispose();assert.ok(budget.total()>0,'External owners survive session disposal');assert.equal(first.groups.ela.version,1);await first.release();await first.release();await ela.release();await borrowed.release();await borrowed.release();await session.dispose();assert.equal(budget.total(),0);
});
test('cancel retains completed groups and disposes late provider results; partial inspection remains available',async()=>{
 const budget=new Budget(1024**2),p=plan(),providers={patchmatch:{async run(){return {value:{id:1},release:budget.reserve(100)};},async prepare(){return {value:{entries:[]},release:budget.reserve(100)};}},sift:{async run(){await delay();return {value:{late:true},release:budget.reserve(100)};}}},session=createAutomaticAnalysisSession({plan:p,providers,budget});
 const baseline=budget.total();await assert.rejects(session.run({onState:s=>{if(s.states.patchmatch==='done')session.cancel();}}),{code:'CANCELLED'});assert.equal(session.snapshot().states.patchmatch,'done');assert.equal(session.snapshot().states.sift,'cancelled');assert.equal(budget.total(),baseline+100);const frame=await session.prepare();await frame.release();await session.dispose();assert.equal(budget.total(),0);
});
test('disabled selections invoke no providers; missing engines stay explicit failures',async()=>{
 const p=plan(),disabled=automaticAnalysisPlan({...p,disabled:p.regions.map((_,i)=>i)}),budget=new Budget(1024**2),session=createAutomaticAnalysisSession({plan:disabled,providers:{},budget});assert.ok(Object.values((await session.run()).states).every(x=>x==='no-active-zones'));await session.dispose();
 const unavailable=createAutomaticAnalysisSession({plan:p,providers:{},budget});const result=await unavailable.run();assert.ok(Object.values(result.errors).every(e=>e.code==='ENGINE_UNAVAILABLE'));assert.equal(result.completed.length,0);await unavailable.dispose();assert.equal(budget.total(),0);
});
test('disposing during an asynchronous entry preparation disposes its late owner',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.slice(0,1);let entered,finish;const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>finish=resolve),session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(){return {value:{},release:budget.reserve(100)};},async prepare(){entered();await gate;return {value:{entries:[]},release:budget.reserve(100)};}}}});await session.run();const work=session.prepare();const rejected=assert.rejects(work,{code:'CANCELLED'});await started;const disposing=session.dispose();finish();await rejected;await disposing;assert.equal(budget.total(),0);
});
test('real selected ELA composition stays alive through cached frames and session disposal',async()=>{
 const reference=JSON.parse(await readFile(new URL('./data/automatic-ela-native.json',import.meta.url))),c=reference.cases.find(x=>x.name==='fractional'),wasmBinary=await readFile(new URL('../vendor/clone-entries/clone-entries.wasm',import.meta.url)),budget=new Budget(160*1024**2),p=automaticAnalysisPlan({width:c.width,height:c.height,regions:c.regions,complete:true});p.jobs=p.jobs.filter(j=>j.id==='ela');let preparations=0;const source=automaticElaFixture(c),session=createAutomaticAnalysisSession({plan:p,budget,providers:{ela:{async run(){return {value:source,release:budget.reserve(1024**2)};},async prepare(value,f,h){preparations++;const result=await composeAutomaticEla(value.cells,value.energy,{...h,regions:c.regions,excluded:c.excluded,threshold:f.elaThreshold,minimum:f.elaMinimum,energyThresholds:f.energyThresholds,wasmBinary});return {value:result,release:()=>result.dispose()};}}}});
 await session.run();const first=await session.prepare({elaMinimum:1}),second=await session.prepare({elaMinimum:1});assert.equal(preparations,1);assert.deepEqual(first.entries.map(e=>e.id),c.expected.entries.map(e=>e.id));await session.dispose();const scope=new Uint8Array(c.width*c.height);await first.groups.ela.energy_allowed.readInto(scope);assert.ok(scope.some(Boolean));await first.release();await second.release();assert.equal(budget.total(),0);
});
test('scientific snapshot holds raw and prepared owners and excludes concurrent refilters',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.filter(j=>j.id==='d2prl');let current=0,entered,finish,prepares=0,rawFreed=false;const started=new Promise(r=>entered=r),gate=new Promise(r=>finish=r),session=createAutomaticAnalysisSession({plan:p,budget,providers:{d2prl:{async run(){const free=budget.reserve(100);return {value:{scientific:true},release(){rawFreed=true;free();}};},async prepare(value,f){prepares++;current=f.d2Minimum;return {value:{entries:[],minimum:current},release:budget.reserve(100)};},readRaw(value){return {value:{minimum:current,scientific:value.scientific},release:budget.reserve(100)};}}}});
 await assert.rejects(session.withSnapshot({},()=>assert.fail('Pending jobs cannot export')),{code:'INVALID_INPUT'});await session.run();
 const snapshot=session.withSnapshot({d2Minimum:17},async context=>{assert.equal(context.state.states.d2prl,'done');assert.equal(context.frame.groups.d2prl.minimum,17);entered();await gate;const raw=context.readRaw('d2prl');try{assert.equal(raw.value.minimum,17);assert.equal(raw.value.scientific,true);assert.equal(rawFreed,false);assert.equal(context.results.d2prl.scientific,true);}finally{raw.release();}return 'saved';});
 await started;const filtering=session.prepare({d2Minimum:900});assert.equal(prepares,1);finish();assert.equal(await snapshot,'saved');const frame=await filtering;assert.equal(frame.groups.d2prl.minimum,900);await frame.release();await session.dispose();assert.equal(rawFreed,true);assert.equal(budget.total(),0);
});
test('disposal cancels the snapshot consumer and waits for all of its owners',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.slice(0,1);let entered;const started=new Promise(r=>entered=r),session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(){return {value:{},release:budget.reserve(100)};},async prepare(){return {value:{entries:[]},release:budget.reserve(100)};}}}});await session.run();
 const snapshot=session.withSnapshot({},async({signal})=>{entered();await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));throw Object.assign(new Error('Snapshot cancelled'),{code:'CANCELLED'});});const rejected=assert.rejects(snapshot,{code:'CANCELLED'});await started;await session.dispose();await rejected;assert.equal(budget.total(),0);
});

test('completed raw planes release RAM under pressure without rerunning their provider or losing export ownership',async()=>{
 const {createSegmentedBytes}=await import('../src/segmented-bytes.js'),budget=new Budget(2*1024**2),p=plan();p.jobs=p.jobs.slice(0,1);let runs=0;const files=new Set();
 const temporarySession={async create(length){const bytes=new Uint8Array(length);files.add(bytes);return {readInto(target,offset){target.set(bytes.subarray(offset,offset+target.length));},write(source,offset){bytes.set(source,offset);},flush(){},dispose(){files.delete(bytes);}};}};
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(){runs++;const store=await createSegmentedBytes(512*1024,{budget,temporarySession,storage:'memory'});store.write(new Uint8Array([4,5,6]),101);return {value:{nested:{store}},release:()=>store.dispose()};}}}});
 const sessionBytes=budget.active;let borrowed;
 try{
  const state=await session.run();assert.equal(state.states.patchmatch,'done');borrowed=session.acquireResults();const store=borrowed.values.patchmatch.nested.store;assert.equal(store.storage,'memory');assert.equal(budget.active,sessionBytes+1024**2,'The live plane adds one shared two-page migration window');
  await budget.reclaim(700*1024);assert.equal(store.storage,'temporary');const bytes=new Uint8Array(3);await store.readInto(bytes,101);assert.deepEqual([...bytes],[4,5,6]);assert.equal(runs,1);
  await session.dispose();assert.equal(files.size,1);await store.readInto(bytes,101);assert.deepEqual([...bytes],[4,5,6]);
 }finally{await borrowed?.release();await session.dispose();}
 assert.equal(budget.total(),0);assert.equal(files.size,0);
});


test('a lone raw allocator failure resumes at full configured capacity and preserves its output',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.slice(0,1);let calls=0;const events=[];
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(){calls++;if(calls===1)throw new RangeError('Array buffer allocation failed');assert.equal(budget.recovering,true);return {value:{pixels:[2,7]},release:budget.reserve(100)};}}}});
 try{const state=await session.run({onProgress:event=>events.push(structuredClone(event))});assert.equal(state.states.patchmatch,'done');assert.equal(calls,2);assert.equal(budget.recovering,false);assert.equal(events[0].error.cause.name,'RangeError');const held=session.acquireResults();try{assert.deepEqual(held.values.patchmatch.pixels,[2,7]);}finally{await held.release();}}finally{await session.dispose();}assert.equal(budget.total(),0);
});
test('more than five successive incidents with committed high-water progress can finish without a lifetime cap',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.slice(0,1);let calls=0;const completed=[];
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(job,h){calls++;if(completed.length<8){completed.push(completed.length+1);h.onProgress({phase:'stored-rows',completed:completed.length});throw new RangeError('Array buffer allocation failed');}return {value:{rows:completed.slice()},release(){}};}}}});
 try{const state=await session.run();assert.equal(state.states.patchmatch,'done');assert.equal(calls,9);const held=session.acquireResults();try{assert.deepEqual(held.values.patchmatch.rows,[1,2,3,4,5,6,7,8]);}finally{await held.release();}}finally{await session.dispose();}assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});
test('replayed provider progress does not evade the five-failure guard and keeps original diagnostics',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.slice(0,1);let calls=0;
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(job,h){calls++;h.onProgress({phase:'rows',completed:20,attempt:h.attempt});throw new RangeError('Array buffer allocation failed');}}}});
 try{const state=await session.run();assert.equal(state.states.patchmatch,'failed');assert.equal(calls,5);assert.equal(state.errors.patchmatch.details.recovery.consecutiveFailures,5);assert.equal(state.errors.patchmatch.details.recovery.loopDetected,true);assert.equal(state.errors.patchmatch.cause.name,'RangeError');assert.match(state.errors.patchmatch.stack,/Array buffer allocation failed/);}finally{await session.dispose();}assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});
test('an exhausted inner recovery loop is terminal to the session instead of five fresh provider starts',async()=>{
 const {runWithResourceRecovery}=await import('../src/resource-recovery.js'),budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.slice(0,1);let starts=0,operations=0;
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(){starts++;await runWithResourceRecovery(async()=>{operations++;throw new RangeError('Array buffer allocation failed');},{budget,wait:async()=>{}});}}}});
 try{const state=await session.run();assert.equal(state.states.patchmatch,'failed');assert.equal(starts,1);assert.equal(operations,5);assert.equal(state.errors.patchmatch.details.recovery.loopDetected,true);}finally{await session.dispose();}assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});
test('recovery does not lower admission of other useful providers or replay their completed results',async()=>{
 const budget=new Budget(1024**2),p=plan(),held=gate(),admitted=gate();let denseCalls=0;const calls={};
 const providers=Object.fromEntries(p.jobs.map(job=>[job.id,{async run(j,h){(calls[j.id]??=[]).push(h.concurrency);if(j.id==='patchmatch'){if(denseCalls++===0)throw new RangeError('Array buffer allocation failed');return {value:{},release(){}};}if(j.id==='sift')await held.promise;if(j.id==='forgeryscope')admitted.resolve();return {value:{},release(){}};}}]));
 const session=createAutomaticAnalysisSession({plan:p,budget,providers,maxConcurrent:2}),work=session.run();
 try{await admitted.promise;assert.equal(session.snapshot().states.sift,'running');assert.deepEqual(calls.forgeryscope,[2],'A failed provider must not permanently reduce the configured admission width');held.resolve();const state=await work;assert.ok(Object.values(state.states).every(value=>value==='done'));assert.equal(calls.sift.length,1);assert.equal(calls.forgeryscope.length,1);assert.equal(calls.patchmatch.length,2);}finally{held.resolve();await session.dispose();}assert.equal(budget.total(),0);
});
test('cancelling a recovery delay releases pressure and never launches the next attempt',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.slice(0,1);let calls=0;
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(){calls++;throw new RangeError('Array buffer allocation failed');}}}});
 try{await assert.rejects(session.run({onProgress:event=>{if(event.phase==='resource-recovery')session.cancel();}}),{code:'CANCELLED'});assert.equal(calls,1);assert.equal(session.snapshot().states.patchmatch,'cancelled');assert.equal(budget.recovering,false);}finally{await session.dispose();}assert.equal(budget.total(),0);
});
test('entry preparation retries preserve scientific raw and the previous display owner until successful replacement',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.slice(0,1);let rawRuns=0,prepares=0,releasedOld=0,rawReleased=0;
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(){rawRuns++;const free=budget.reserve(100);return {value:{scientific:42},release(){rawReleased++;free();}};},async prepare(value,filters){prepares++;assert.equal(value.scientific,42);assert.equal(rawReleased,0);if(filters.low===20&&prepares===2){assert.equal(releasedOld,0);throw new RangeError('Array buffer allocation failed');}const free=budget.reserve(100),old=filters.low===10;return {value:{entries:[],low:filters.low},release(){if(old)releasedOld++;free();}};}}}});
 let old,next;try{await session.run();old=await session.prepare();next=await session.prepare({low:20});assert.equal(prepares,3);assert.equal(rawRuns,1);assert.equal(releasedOld,0);assert.equal(old.groups.patchmatch.low,10);assert.equal(next.groups.patchmatch.low,20);await old.release();old=null;assert.equal(releasedOld,1);}finally{await old?.release();await next?.release();await session.dispose();}assert.equal(rawReleased,1);assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});
test('a reclaimer allocation failure stays within the same five-failure guard without replaying the provider',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.slice(0,1);let calls=0,reclaims=0;const unregister=budget.registerAsyncReclaimer(async()=>{reclaims++;throw new RangeError('Array buffer allocation failed');});
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(){calls++;throw new RangeError('Array buffer allocation failed');}}}});
 try{const state=await session.run();assert.equal(state.states.patchmatch,'failed');assert.equal(calls,1);assert.equal(reclaims,4);assert.equal(state.errors.patchmatch.details.recovery.consecutiveFailures,5);}finally{unregister();await session.dispose();}assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});
test('unrelated provider defects are terminal immediately with their original stack preserved',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.slice(0,1);let calls=0;const bug=new TypeError('Unexpected result shape');
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(){calls++;throw bug;}}}});
 try{const state=await session.run();assert.equal(state.states.patchmatch,'failed');assert.equal(calls,1);assert.equal(state.errors.patchmatch.name,'TypeError');assert.equal(state.errors.patchmatch.stack,bug.stack);}finally{await session.dispose();}assert.equal(budget.total(),0);
});


test('a suspended provider resumes on backing retirement while an admitted peer continues', {timeout:3000},async()=>{
 const {ExecutionScheduler}=await import('../src/execution-scheduler.js');
 const budget=new Budget(1024**2),scheduler=new ExecutionScheduler(budget,{maxWorkers:2}),p=plan();p.jobs=p.jobs.filter(job=>['patchmatch','d2prl'].includes(job.id));
 const peerStarted=gate(),peerFinished=gate(),waiting=gate(),resumed=gate();let calls=0,hooks;
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{
  patchmatch:{async run(job,h){hooks=h;const lease=await scheduler.acquire({cpu:1,bytes:1024,resourceOwner:'patchmatch'});try{peerStarted.resolve();await peerFinished.promise;return {value:{exact:17},release(){}};}finally{lease.release();}}},
  d2prl:{async run(){await peerStarted.promise;if(++calls===1)throw Object.assign(new RangeError('Array buffer allocation failed'),{details:{requestedBytes:64}});resumed.resolve();return {value:{exact:23},release(){}};}}
 }});
 const events=[],work=session.run({onProgress:event=>{events.push(event);if(event.phase==='resource-wait'&&event.stage==='waiting')waiting.resolve();}});
 try{
  await waiting.promise;hooks.onProgress({phase:'rows',completed:1,total:2});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').commits,0);
  budget.notifyBackingRelease('array-buffer',64);await resumed.promise;assert.equal(session.snapshot().states.patchmatch,'running');peerFinished.resolve();const state=await work;assert.equal(state.states.d2prl,'done');assert.equal(state.attempts.d2prl,2);assert.equal(events.filter(event=>event.phase==='resource-recovery').length,1);
 }finally{peerFinished.resolve();await work;await session.dispose();scheduler.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.resourceProducers.size,0);assert.equal(budget.resourceWaiters.size,0);assert.equal(budget.recovering,false);
});


test('a provider ignores peer publication until its allocation domain actually retires backing', {timeout:3000},async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.filter(job=>['patchmatch','d2prl'].includes(job.id));
 const started=gate(),finished=gate(),waiting=gate(),resumed=gate();let peer,calls=0,hook;const outputs=[];
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{
  patchmatch:{async run(job,h){hook=h;peer=budget.beginOperation({owner:'patchmatch',id:'field'});peer.setState('io');try{started.resolve();await finished.promise;return {value:{exact:17},release(){outputs.push('patchmatch');}};}finally{peer.release();}}},
  d2prl:{async run(){await started.promise;if(++calls===1)throw Object.assign(new RangeError('Array buffer allocation failed'),{details:{requestedBytes:64}});resumed.resolve();return {value:{exact:23},release(){outputs.push('d2prl');}};}}
 }});
 const events=[],work=session.run({onProgress:event=>{events.push(event);if(event.phase==='resource-wait'&&event.waitStage==='waiting')waiting.resolve();}});
 try{await waiting.promise;hook.onProgress({phase:'rows',completed:2,total:2});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);budget.notifyBackingRelease('array-buffer',64);await resumed.promise;assert.equal(calls,2);assert.equal(session.snapshot().states.patchmatch,'running');assert.equal(peer.closed,false);assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').releasedBytes,64);assert.ok(events.filter(event=>event.phase==='resource-reclaimed').every(event=>event.reclamation.targetedReleasedBytes===0));const commits=budget.resourceProgressSnapshot('d2prl','array-buffer').commits;hook.onProgress({phase:'rows',completed:2,total:2});assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').commits,commits,'Replayed progress cannot manufacture a new publication');finished.resolve();const state=await work;assert.deepEqual(state.attempts,{patchmatch:1,d2prl:2});assert.ok(Object.values(state.states).every(value=>value==='done'));assert.deepEqual(outputs,[]);}finally{finished.resolve();await work;await session.dispose();}assert.deepEqual(outputs.sort(),['d2prl','patchmatch']);assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});

test('matching domain retirement does not reset an unresolved provider five-failure streak', {timeout:3000},async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.filter(job=>['patchmatch','d2prl'].includes(job.id));
 const started=gate(),finished=gate(),failed=gate();let peer,calls=0,commits=0;
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{
  patchmatch:{async run(){peer=budget.beginOperation({owner:'patchmatch',id:'field'});peer.setState('io');try{started.resolve();await finished.promise;return {value:{exact:17},release(){}};}finally{peer.release();}}},
  d2prl:{async run(){await started.promise;calls++;throw Object.assign(new RangeError('Array buffer allocation failed'),{details:{requestedBytes:64}});}}
 }});
 const work=session.run({onProgress:event=>{if(event.phase==='resource-wait'&&event.waitStage==='waiting'){commits++;peer.commit();budget.notifyBackingRelease('array-buffer',64);}},onState:state=>{if(state.states.d2prl==='failed')failed.resolve(state);}});
 try{const state=await failed.promise;assert.equal(calls,5);assert.equal(commits,4);assert.equal(state.errors.d2prl.details.recovery.consecutiveFailures,5);assert.equal(state.states.patchmatch,'running');assert.equal(peer.closed,false);assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').releasedBytes,256);finished.resolve();assert.equal((await work).states.patchmatch,'done');}finally{finished.resolve();await work;await session.dispose();}assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});


test('explicit resume preserves completed groups and stable checkpoint identities after the terminal guard',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.filter(job=>['patchmatch','sift'].includes(job.id));
 let ready=false,denseRuns=0,siftRuns=0;const keys=[],released=[];
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{
  patchmatch:{async run(){denseRuns++;return {value:{exact:17},release:budget.reserve(20)};}},
  sift:{async run(job,h){siftRuns++;keys.push(h.checkpointKey);if(!ready)throw new RangeError('Array buffer allocation failed');return {value:{exact:23},release:budget.reserve(20)};},releaseCheckpoint(key){released.push(key);}}
 }});
 try{
  const failed=await session.run();assert.equal(failed.states.sift,'failed');assert.equal(siftRuns,5);assert.deepEqual(failed.resumable,['sift']);
  assert.throws(()=>session.resume({groups:['patchmatch']}),{code:'INVALID_INPUT'});
  ready=true;const completed=await session.resume();assert.equal(completed.states.sift,'done');assert.equal(completed.errors.sift,undefined);assert.equal(denseRuns,1);assert.equal(siftRuns,6);assert.equal(new Set(keys).size,1);
  assert.throws(()=>session.resume(),{code:'INVALID_INPUT'});
 }finally{await session.dispose();}
 assert.deepEqual(released,[keys[0]]);assert.equal(budget.total(),0);
});

test('nested recovery attempts remain visible independently from group attempts',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.slice(0,1);const events=[];
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(job,h){h.onProgress({phase:'resource-recovery',attempt:4});return {value:{},release(){}};}}}});
 try{await session.run({onProgress:event=>events.push(event)});assert.equal(events[0].attempt,4);assert.equal(events[0].groupAttempt,1);}finally{await session.dispose();}
});
test('closed dependency graph settles once and remains explicitly resumable with completed peers retained',async()=>{
 const budget=new Budget(1024**2),p=plan();p.jobs=p.jobs.filter(j=>['patchmatch','sift'].includes(j.id));let runs=0,peerRuns=0,checkpoint;
 const session=createAutomaticAnalysisSession({plan:p,budget,providers:{patchmatch:{async run(job,h){runs++;checkpoint??=h.checkpointKey;assert.equal(checkpoint,h.checkpointKey);if(runs===1)throw Object.assign(new Error('Closed CPU dependency component'),{code:'RESOURCE_DEPENDENCY_CYCLE',details:{resumable:true,dependencyCycle:{operations:[{key:1,dependencies:[2]},{key:2,dependencies:[1]}]}}});return {value:{done:true},release(){}};}},sift:{async run(){peerRuns++;return {value:{done:true},release(){}};}}}});
 const state=await session.run();assert.equal(runs,1);assert.equal(state.states.patchmatch,'failed');assert.equal(state.states.sift,'done');assert.deepEqual(state.resumable,['patchmatch']);assert.equal(state.errors.patchmatch.details.dependencyCycle.operations.length,2);
 const resumed=await session.resume();assert.equal(resumed.states.patchmatch,'done');assert.equal(peerRuns,1);await session.dispose();assert.equal(budget.total(),0);
});
