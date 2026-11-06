import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomaticD2PreviewSession} from '../sherloq-browser/assets/automatic-d2-preview-session.js';
const drain=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
const cancelled=()=>Object.assign(Error('Cancelled'),{code:'CANCELLED'});
function clock(){let time=0,id=0;const tasks=new Map();return{now:()=>time,delay:(fn,ms)=>{tasks.set(++id,{fn,at:time+ms});return id;},undelay:key=>tasks.delete(key),advance(ms){time+=ms;for(const [key,task]of [...tasks])if(task.at<=time){tasks.delete(key);task.fn();}},get tasks(){return tasks;}};}
function fixture({show,preview,commit,deferCompute=false}={}){
 const timer=clock(),live={source:{},domain:{},basis:{},context:{},checkpoint:{},current:true},pending=[],frames=[],commits=[],errors=[],guards=[],presentationOwners=[];let running=0,peak=0;
 function event(minimum,{generation=1,gestureEpoch=1,continuous=true,...rest}={}){const capture={...live};return{operation:'analysis.complete',field:'automatic-d2-minimum',generation,gestureEpoch,continuous,controlRequestId:minimum,params:{minimum},view:{mode:'overlay',d2prlMinimum:minimum},extras:{view:'corroboration',opacity:70,algorithm:'D2'},completedPreviewCurrent:()=>live.current&&['source','domain','basis','context','checkpoint'].every(k=>live[k]===capture[k]),finalPreviewCurrent:()=>live.current&&live.source===capture.source&&live.domain===capture.domain&&live.context===capture.context&&live.checkpoint===capture.checkpoint,...rest};}
 function answer(e){return{operation:e.operation,params:{minimum:e.params.minimum},calculatedView:{...e.view},pixels:{format:'rgb8',width:1,height:1,data:Uint8Array.of(1,2,3)},exact:false,provisional:true,approximate:true,exportable:false,metrics:{automaticD2Preview:true,inferences:0,calculatedMinimum:e.params.minimum}};}
 const session=createAutomaticD2PreviewSession({now:timer.now,delay:timer.delay,undelay:timer.undelay,preview:preview??((e,owner)=>{if(!deferCompute)owner.onComputeStart?.();running++;peak=Math.max(peak,running);return new Promise((resolve,reject)=>{const row={event:e,owner,start:()=>owner.onComputeStart?.(),end:()=>owner.onComputeEnd?.(),resolve:result=>{owner.onComputeEnd?.();running--;resolve(result??answer(e));},reject:error=>{owner.onComputeEnd?.();running--;reject(error);}};pending.push(row);owner.signal.addEventListener('abort',()=>row.reject(cancelled()),{once:true});});}),show:show??((result,e,owner)=>{if(owner.isCurrent()){frames.push(result);guards.push(owner.isCurrent);presentationOwners.push(owner);}}),commit:commit??((e,owner)=>{if(owner.isCurrent())commits.push(e.params.minimum);}),error:(e,c)=>errors.push([e,c]),restore:(_e,owner)=>{if(owner.isCurrent())frames.push('restored');}});
 return{timer,live,pending,frames,commits,errors,guards,presentationOwners,event,answer,session,get peak(){return peak;}};
}
test('one active owned completion and one latest successor advance monotonically',async()=>{
 const h=fixture(),e1=h.event(10),e2=h.event(20),e3=h.event(30);h.session.begin(e1);h.session.preview(e1);h.session.preview(e2);h.session.preview(e3);
 assert.equal(h.pending.length,1);assert.equal(h.pending[0].owner.signal.aborted,false);h.pending[0].resolve();await drain();assert.deepEqual(h.frames.map(f=>f.params.minimum),[10]);assert.equal(h.frames[0].metrics.continuousPreview.latestRequestedParameters.minimum,30);assert.equal(h.frames[0].metrics.continuousPreview.policy,'last-completed-same-gesture');assert.deepEqual(h.pending.map(p=>p.event.params.minimum),[10,30]);
 h.pending[1].resolve();await h.session.settled();assert.deepEqual(h.frames.map(f=>f.params.minimum),[10,30]);assert.equal(h.guards[0](),false);assert.equal(h.guards[1](),true);assert.equal(h.peak,1);assert.equal(h.timer.tasks.size,0);h.session.dispose();
});
test('raw same-gesture input preserves its owned flight and replaces the queued intention',async()=>{
 const h=fixture(),e=h.event(10);h.session.begin(e);h.session.preview(e);h.session.preview(h.event(20));h.session.valueChanged(h.event(25));assert.equal(h.pending[0].owner.signal.aborted,false);h.pending[0].resolve();await drain();assert.equal(h.pending.length,1);assert.equal(h.frames[0].metrics.continuousPreview.latestRequestedParameters.minimum,25);h.session.preview(h.event(30));h.pending[1].resolve();await h.session.settled();assert.deepEqual(h.frames.map(f=>f.params.minimum),[10,30]);h.session.dispose();
});
test('same-gesture replacement has a fixed 300ms flight budget, never refreshed per input',async()=>{
 const h=fixture(),e=h.event(10);h.session.begin(e);h.session.preview(e);h.timer.advance(50);h.session.preview(h.event(20));h.timer.advance(240);h.session.valueChanged(h.event(25));h.session.preview(h.event(30));assert.equal(h.pending[0].owner.signal.aborted,false);assert.equal(h.timer.tasks.size,1);h.timer.advance(9);assert.equal(h.pending[0].owner.signal.aborted,false);h.timer.advance(1);assert.equal(h.pending[0].owner.signal.aborted,true);await drain();assert.deepEqual(h.pending.map(p=>p.event.params.minimum),[10,30]);assert.deepEqual(h.frames,[]);h.pending[1].resolve();await h.session.settled();assert.deepEqual(h.frames.map(f=>f.params.minimum),[30]);assert.equal(h.peak,1);assert.deepEqual(h.errors,[]);h.session.dispose();
});
test('a superseded flight completing before its deadline may paint and clears that timer',async()=>{
 const h=fixture(),e=h.event(10);h.session.begin(e);h.session.preview(e);h.timer.advance(100);h.session.preview(h.event(20));h.timer.advance(199);h.pending[0].resolve();await drain();assert.deepEqual(h.frames.map(f=>f.params.minimum),[10]);assert.equal(h.timer.tasks.size,0);h.timer.advance(1000);assert.equal(h.pending[1].owner.signal.aborted,false);h.pending[1].resolve();await h.session.settled();h.session.dispose();
});
test('a replacement after the budget expires cancels promptly rather than restarting its allowance',async()=>{
 const h=fixture(),e=h.event(10);h.session.begin(e);h.session.preview(e);h.timer.advance(400);h.session.preview(h.event(20));assert.equal([...h.timer.tasks.values()][0].at,400);h.timer.advance(0);assert.equal(h.pending[0].owner.signal.aborted,true);await drain();h.pending[1].resolve();await h.session.settled();h.session.dispose();
});
test('live source, domain, result, algorithm context and checkpoint revocation reject completed frames',async()=>{
 for(const key of ['source','domain','basis','context','checkpoint']){const h=fixture(),e=h.event(10);h.session.begin(e);h.session.preview(e);h.live[key]={};h.pending[0].resolve();await h.session.settled();assert.deepEqual(h.frames,[],key);h.session.dispose();}
});
test('other settings, source proof and a different gesture immediately invalidate active work',async()=>{
 for(const change of [e=>e.extras.algorithm='other',e=>e.extras.opacity=30,e=>e.view.mode='map',e=>e.params.radius=3,e=>e.generation++,e=>e.gestureEpoch++,e=>e.operation='analysis.clones',e=>e.completedPreviewCurrent=()=>false]){const h=fixture(),e=h.event(10);h.session.begin(e);h.session.preview(e);const next=h.event(20);change(next);h.session.valueChanged(next);assert.equal(h.pending[0].owner.signal.aborted,true);await h.session.settled();assert.deepEqual(h.frames,[]);h.session.dispose();}
});
test('the mirrored displayed minimum cannot disagree with the calculated parameter',async()=>{
 const h=fixture(),e=h.event(10);h.session.begin(e);h.session.preview(e);const next=h.event(20);next.view.d2prlMinimum=99;h.session.preview(next);assert.equal(h.pending[0].owner.signal.aborted,true);await drain();h.pending[1].resolve();await h.session.settled();assert.deepEqual(h.frames,[]);h.session.dispose();
});
test('release cancels provisional work and commits exactly the last requested value once',async()=>{
 const h=fixture(),checkpoint=h.live.checkpoint,e=h.event(10);h.session.begin(e);h.session.preview(e);h.session.preview(h.event(20));h.session.commit(h.event(25));assert.equal(h.pending[0].owner.signal.aborted,true);await h.session.settled();assert.deepEqual(h.frames,[]);assert.deepEqual(h.commits,[25]);assert.equal(h.live.checkpoint,checkpoint);assert.equal(h.session.pending,false);assert.equal(h.timer.tasks.size,0);h.session.dispose();
});
test('a visible completed frame loses publication ownership at release or cross-gesture change',async()=>{
 for(const end of [h=>h.session.commit(h.event(20)),h=>h.session.begin(h.event(20,{gestureEpoch:2,generation:2})),h=>h.session.reset('source-change')]){const h=fixture(),e=h.event(10);h.session.begin(e);h.session.preview(e);h.pending[0].resolve();await h.session.settled();assert.equal(h.guards[0](),true);end(h);assert.equal(h.guards[0](),false);await h.session.settled();h.session.dispose();}
});
test('native answer contract rejects fabricated exact/exportable values or repeated inference',async()=>{
 for(const change of [{exact:true},{provisional:false},{approximate:false},{exportable:true},{operation:'analysis.clones'},{params:{minimum:20}},{metrics:{inferences:1}},{metrics:{automaticD2Preview:false}},{metrics:{calculatedMinimum:20}}]){const h=fixture(),e=h.event(10);h.session.begin(e);h.session.preview(e);const a=h.answer(e);h.pending[0].resolve({...a,...change,...(change.metrics?{metrics:{...a.metrics,...change.metrics}}:{})});await h.session.settled();assert.deepEqual(h.frames,[],JSON.stringify(change));h.session.dispose();}
});
test('slider reversal is displayed in request order with truthful calculated and latest values',async()=>{
 const h=fixture(),e=h.event(50);h.session.begin(e);h.session.preview(e);h.session.preview(h.event(5));h.pending[0].resolve();await drain();assert.equal(h.frames[0].metrics.continuousPreview.calculatedParameters.minimum,50);assert.equal(h.frames[0].metrics.continuousPreview.latestRequestedParameters.minimum,5);h.pending[1].resolve();await h.session.settled();assert.deepEqual(h.frames.map(f=>f.params.minimum),[50,5]);h.session.dispose();
});
test('legacy untyped raw invalidation stays safe, and cancellation can restore retained native view',async()=>{
 const h=fixture(),e=h.event(10);h.session.begin(e);h.session.preview(e);h.session.valueChanged();assert.equal(h.pending[0].owner.signal.aborted,true);await h.session.settled();h.session.reset('unchanged',{restore:true});await h.session.settled();assert.deepEqual(h.frames,['restored']);assert.equal(h.session.pending,false);h.session.dispose();
});
test('a source reset during asynchronous show revokes its before-paint guard',async()=>{
 let finish,owner;const frames=[];const h=fixture({show:async(_a,_e,o)=>{owner=o;await new Promise(r=>finish=r);if(o.isCurrent())frames.push('paint');}}),e=h.event(10);h.session.begin(e);h.session.preview(e);h.pending[0].resolve();await drain();assert.equal(owner.isCurrent(),true);h.session.reset('source-change');assert.equal(owner.isCurrent(),false);finish();await h.session.settled();assert.deepEqual(frames,[]);h.session.dispose();
});
test('old native finals serialize and cannot overwrite the final of a newer gesture',async()=>{
 const ends=[],published=[];let active=0,peak=0;const h=fixture({commit:async(e,owner)=>{active++;peak=Math.max(peak,active);await new Promise(r=>ends.push(r));if(owner.isCurrent())published.push(e.params.minimum);active--;}});h.session.commit(h.event(10));await drain();h.session.begin(h.event(20,{generation:2,gestureEpoch:2}));h.session.commit(h.event(25,{generation:2,gestureEpoch:2}));assert.equal(ends.length,1);ends[0]();await drain();assert.equal(ends.length,2);ends[1]();await h.session.settled();assert.deepEqual(published,[25]);assert.equal(peak,1);h.session.dispose();
});
test('obsolete cancellation/error paths do not emit a stale UI error',async()=>{
 const h=fixture(),e=h.event(10);h.session.begin(e);h.session.preview(e);h.session.reset('source-change');await h.session.settled();assert.deepEqual(h.errors,[]);h.session.dispose();
});
test('D2 deadline spends only active100ms plus200ms across startup and queue pauses',async()=>{
 const h=fixture({deferCompute:true}),e=h.event(10);h.session.begin(e);h.session.preview(e);h.session.preview(h.event(20));h.timer.advance(600);await drain();assert.equal(h.pending.length,1);assert.equal(h.pending[0].owner.signal.aborted,false,'Startup600ms is not active computation');h.pending[0].start();h.timer.advance(100);h.pending[0].end();h.timer.advance(900);h.session.valueChanged(h.event(25));h.session.preview(h.event(25));assert.equal(h.pending[0].owner.signal.aborted,false,'Queue pause neither spends nor resets the active budget');h.pending[0].start();h.timer.advance(199);assert.equal(h.pending[0].owner.signal.aborted,false);h.timer.advance(1);assert.equal(h.pending[0].owner.signal.aborted,true);await drain();assert.equal(h.pending[1].owner.continuity.misses,0,'Only300ms qualified work is below500ms pressure window');h.pending[1].resolve();await h.session.settled();h.session.dispose();
});
test('D2 continuity becomes visible after two compute deadlines and resets only on a current paint receipt',async()=>{
 const h=fixture(),e=h.event(10);h.session.begin(e);h.session.preview(e);
 for(const minimum of [20,30]){h.session.preview(h.event(minimum));h.timer.advance(300);await drain();}
 assert.equal(h.pending[2].owner.continuity.misses,1);h.pending[2].resolve();await h.session.settled();h.session.preview(h.event(40));assert.equal(h.pending[3].owner.continuity.misses,1,'show returned without a RAF paint receipt');h.pending[3].resolve();await h.session.settled();h.presentationOwners[0].onPresented({presented:true});h.session.preview(h.event(50));assert.equal(h.pending[4].owner.continuity.misses,1,'An older displayed owner cannot reset newer work');h.presentationOwners[1].onPresented({presented:false});h.presentationOwners[1].onPresented({presented:true});h.pending[4].resolve();await h.session.settled();h.session.preview(h.event(60));assert.equal(h.pending[5].owner.continuity.misses,0);h.pending[5].resolve();await h.session.settled();h.session.dispose();
});
