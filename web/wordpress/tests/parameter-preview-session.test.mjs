import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createParameterPreviewSession} from '../sherloq-browser/assets/parameter-preview-session.js';
const tick=()=>new Promise(r=>setTimeout(r,1));
test('latest draft replaces pending work; final waits and rejects stale frame',async()=>{
 let resolve;const frames=[],commits=[],started=[];
 const session=createParameterPreviewSession({preview:async e=>{started.push(e.value);return await new Promise(r=>resolve=r);},show:r=>frames.push(r),commit:e=>commits.push(e.value)});
 session.handle({phase:'begin'});session.handle({phase:'preview',value:1});session.handle({phase:'preview',value:2});session.handle({phase:'preview',value:3});
 resolve(1);await tick();assert.deepEqual(started,[1,3]);assert.deepEqual(frames,[]);
 session.handle({phase:'commit',value:3});resolve(3);await tick();await session.settled();assert.deepEqual(frames,[]);assert.deepEqual(commits,[3]);assert.equal(session.pending,false);session.dispose();
});
test('single click with no draft commits; a later gesture cancels scheduled final',async()=>{
 const commits=[];const session=createParameterPreviewSession({preview:()=>{},show:()=>{},commit:e=>commits.push(e.value)});
 session.handle({phase:'begin'});session.handle({phase:'commit',value:1});session.handle({phase:'begin'});await tick();assert.deepEqual(commits,[]);assert.equal(session.pending,true);
 session.handle({phase:'commit',value:2});await tick();await session.settled();assert.deepEqual(commits,[2]);assert.equal(session.pending,false);session.dispose();
});
test('source change invalidates a completing draft and never commits',async()=>{
 let resolve;const shown=[],commits=[];const session=createParameterPreviewSession({preview:()=>new Promise(r=>resolve=r),show:r=>shown.push(r),commit:e=>commits.push(e)});
 session.handle({phase:'begin'});session.handle({phase:'preview'});session.reset('source-change');resolve('old');await session.settled();assert.deepEqual(shown,[]);assert.deepEqual(commits,[]);assert.equal(session.pending,false);session.dispose();
});
test('failed final settles and exposes only current error',async()=>{
 const errors=[];const session=createParameterPreviewSession({preview:()=>{},show:()=>{},commit:()=>{throw Error('current');},error:(e,c)=>errors.push([e.message,c.phase])});
 session.handle({phase:'commit',value:1});await tick();await session.settled();assert.deepEqual(errors,[['current','final']]);assert.equal(session.pending,false);session.dispose();
});
test('disposing cancels queued native final',async()=>{
 const commits=[];const session=createParameterPreviewSession({preview:()=>{},show:()=>{},commit:e=>commits.push(e)});session.handle({phase:'commit'});session.dispose();await tick();assert.deepEqual(commits,[]);
});
test('repeated short clicks never request or paint a proxy',async()=>{
 const frames=[],commits=[],timers=new Map();let next=0;
 const session=createParameterPreviewSession({preview:()=>{throw Error('short clicks must not preview');},show:r=>frames.push(r),commit:e=>commits.push(e.value),schedule:(fn,event)=>{assert.equal(event.continuous,false);timers.set(++next,fn);return next;},unschedule:id=>timers.delete(id)});
 for(let value=1;value<=8;value++){session.handle({phase:'begin'});session.handle({phase:'commit',value,continuous:false});}
 assert.equal(timers.size,1);[...timers.values()][0]();await session.settled();assert.deepEqual(frames,[]);assert.deepEqual(commits,[8]);assert.equal(session.pending,false);session.dispose();
});
test('native commit receives held-edit status without scheduling a new proxy',async()=>{
 const commits=[],seen=[];const session=createParameterPreviewSession({preview:()=>{throw Error('commit must not preview');},show:()=>{},commit:e=>commits.push(e.value),schedule:(fn,e)=>{seen.push(e.continuous);return setTimeout(fn,0);}});
 session.handle({phase:'commit',value:9,continuous:true});await tick();await session.settled();assert.deepEqual(seen,[true]);assert.deepEqual(commits,[9]);session.dispose();
});

const drain=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('a final invalidated while waiting for its preview clears finalRunning',async()=>{
 let resolve;const states=[],commits=[],timers=new Map();let id=0;
 const session=createParameterPreviewSession({preview:()=>new Promise(r=>resolve=r),show:()=>{},commit:event=>commits.push(event.value),state:value=>states.push(value),schedule:fn=>{timers.set(++id,fn);return id;},unschedule:key=>timers.delete(key)});
 session.handle({phase:'begin'});session.handle({phase:'preview',value:1});session.handle({phase:'commit',value:1});const finish=[...timers.values()][0];timers.clear();finish();await drain();assert.equal(states.at(-1).finalRunning,true);session.reset('source-change');resolve({pixels:'old'});await session.settled();assert.deepEqual(commits,[]);assert.equal(session.pending,false);assert.equal(states.at(-1).finalRunning,false);session.dispose();
});
test('replacement during a pending small preview suppresses every stale frame and final',async()=>{
 const pending=[],commits=[],frames=[];const session=createParameterPreviewSession({preview:event=>new Promise(resolve=>pending.push({event,resolve})),show:value=>frames.push(value),commit:event=>commits.push(event.value)});
 session.handle({phase:'begin'});session.handle({phase:'preview',value:1});session.handle({phase:'preview',value:2});pending[0].resolve('old');await drain();session.handle({phase:'commit',value:2});pending[1].resolve('new');await new Promise(resolve=>setTimeout(resolve,1));await session.settled();assert.deepEqual(frames,[]);assert.deepEqual(commits,[2]);session.dispose();
});
function timers(){const callbacks=new Map();let id=0;return{callbacks,schedule:fn=>{callbacks.set(++id,fn);return id;},unschedule:key=>callbacks.delete(key),fire(){const item=callbacks.entries().next().value;if(!item)throw Error('No scheduled final');callbacks.delete(item[0]);item[1]();}};}
test('native finals serialize, and an obsolete native completion cannot publish',async()=>{
 const timer=timers(),started=[],published=[],gates=new Map(),state=[];let running=0,peak=0;
 const session=createParameterPreviewSession({preview:()=>{throw Error('No proxy for a click');},show:()=>{},schedule:timer.schedule,unschedule:timer.unschedule,state:value=>state.push(value),commit:async(event,{isCurrent})=>{running++;peak=Math.max(peak,running);started.push(event.value);await new Promise(resolve=>gates.set(event.value,resolve));if(isCurrent())published.push(event.value);running--;}});
 session.handle({phase:'commit',value:1,continuous:false});timer.fire();await drain();assert.deepEqual(started,[1]);session.handle({phase:'begin'});session.handle({phase:'commit',value:2,continuous:false});timer.fire();await drain();assert.deepEqual(started,[1]);assert.equal(session.pending,true);gates.get(1)();await drain();assert.deepEqual(started,[1,2]);assert.deepEqual(published,[]);gates.get(2)();await session.settled();assert.equal(peak,1);assert.deepEqual(published,[2]);assert.equal(state.at(-1).finalRunning,false);assert.equal(session.pending,false);session.dispose();
});
test('only the latest queued native final starts after an older final settles',async()=>{
 const timer=timers(),started=[],gates=new Map(),published=[];const session=createParameterPreviewSession({preview:()=>null,show:()=>{},schedule:timer.schedule,unschedule:timer.unschedule,commit:async(event,{isCurrent})=>{started.push(event.value);await new Promise(resolve=>gates.set(event.value,resolve));if(isCurrent())published.push(event.value);}});
 session.handle({phase:'commit',value:1});timer.fire();await drain();session.handle({phase:'commit',value:2});timer.fire();await drain();session.handle({phase:'commit',value:3});timer.fire();await drain();gates.get(1)();await drain();assert.deepEqual(started,[1,3]);gates.get(3)();await session.settled();assert.deepEqual(published,[3]);assert.equal(session.pending,false);session.dispose();
});
test('source replacement and disposal invalidate a native publication already in flight',async()=>{
 for(const ending of['reset','dispose']){const timer=timers(),published=[],states=[];let finish;const session=createParameterPreviewSession({preview:()=>null,show:()=>{},schedule:timer.schedule,unschedule:timer.unschedule,state:value=>states.push(value),commit:async(event,{isCurrent})=>{await new Promise(resolve=>finish=resolve);if(isCurrent())published.push(event.value);}});session.handle({phase:'commit',value:1});timer.fire();await drain();if(ending==='reset')session.reset('source-change');else session.dispose();finish();await session.settled();assert.deepEqual(published,[]);assert.equal(states.at(-1).finalRunning,false);assert.equal(session.pending,false);session.dispose();}
});
test('an obsolete native error cannot replace the latest successful final',async()=>{
 const timer=timers(),started=[],errors=[],states=[];let fail;const session=createParameterPreviewSession({preview:()=>null,show:()=>{},schedule:timer.schedule,unschedule:timer.unschedule,state:value=>states.push(value),error:(error,context)=>errors.push([error.message,context.phase]),commit:async event=>{started.push(event.value);if(event.value===1)await new Promise((_,reject)=>fail=reject);}});session.handle({phase:'commit',value:1});timer.fire();await drain();session.handle({phase:'commit',value:2});timer.fire();await drain();fail(Error('obsolete'));await session.settled();assert.deepEqual(started,[1,2]);assert.deepEqual(errors,[]);assert.equal(session.pending,false);assert.equal(states.at(-1).finalRunning,false);session.dispose();
});
test('unchanged gesture resumes an interrupted native replacement and aligns UI, client and export',async()=>{
 const timer=timers(),state={client:0,ui:0,report:0},started=[],pending=[];
 const session=createParameterPreviewSession({preview:()=>{throw Error('No proxy expected');},show:()=>{},schedule:timer.schedule,unschedule:timer.unschedule,commit:async(event,{isCurrent})=>{started.push(event.field);await new Promise(resolve=>pending.push(resolve));state.client=event.params.value;if(isCurrent()){state.ui=state.report=state.client;}}});
 session.handle({phase:'commit',field:'mode',policy:{kind:'retained'},params:{value:1}});timer.fire();await drain();session.handle({phase:'begin'});session.handle({phase:'cancel',reason:'unchanged',field:'scientificMinimum',policy:{kind:'explicit'},params:{value:1}});assert.equal(session.pending,true);timer.fire();pending[0]();await drain();assert.equal(session.pending,true);assert.deepEqual(started,['mode','mode']);assert.equal(state.ui,0);pending[1]();await session.settled();assert.deepEqual(state,{client:1,ui:1,report:1});assert.equal(session.pending,false);session.dispose();
});
test('unchanged gesture restores a scheduled native intention without painting any proxy',async()=>{
 const timer=timers(),commits=[];const session=createParameterPreviewSession({preview:()=>{throw Error('No proxy');},show:()=>{},schedule:timer.schedule,unschedule:timer.unschedule,commit:event=>commits.push(event.params.value)});session.handle({phase:'commit',field:'start',params:{value:7}});session.handle({phase:'begin'});session.handle({phase:'cancel',reason:'unchanged',field:'end',params:{value:7}});assert.equal(timer.callbacks.size,1);timer.fire();await session.settled();assert.deepEqual(commits,[7]);session.dispose();
});
test('source or tool reset clears the interrupted native intention permanently',async()=>{
 for(const reason of['source-change','tool-change']){const timer=timers(),commits=[];const session=createParameterPreviewSession({preview:()=>null,show:()=>{},schedule:timer.schedule,unschedule:timer.unschedule,commit:event=>commits.push(event)});session.handle({phase:'commit',params:{value:1}});session.handle({phase:'begin'});session.reset(reason);session.handle({phase:'cancel',reason:'unchanged',params:{value:1}});assert.equal(timer.callbacks.size,0);assert.deepEqual(commits,[]);assert.equal(session.pending,false);session.dispose();}
});
