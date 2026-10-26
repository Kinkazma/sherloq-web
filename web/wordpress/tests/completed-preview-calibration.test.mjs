import test from 'node:test';
import assert from 'node:assert/strict';
import {createParameterPreviewSession} from '../sherloq-browser/assets/parameter-preview-session.js';
import {createAdaptivePreview,reportAdaptivePreviewComputed,reportAdaptivePreviewPresented} from '../sherloq-browser/assets/adaptive-preview.js';
const drain=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const payload=(plan,milliseconds)=>({metrics:{adaptivePreview:{token:plan.token,milliseconds,pixels:plan.pixels,setupMilliseconds:0,cold:false}}});

test('continuous replacement learns oversized completed cost without displaying obsolete values',async()=>{
 const adaptive=createAdaptivePreview(),plans=[],gates=[],shown=[],observed=[];
 const session=createParameterPreviewSession({preview:event=>{const plan=adaptive.plan({key:'computed-contract/continuous',width:310,height:260});plans.push(plan);return new Promise(resolve=>gates.push({resolve,event,plan}));},computed:answer=>observed.push(reportAdaptivePreviewComputed(answer.metrics)),show:answer=>shown.push(answer),commit:()=>{}});
 session.handle({phase:'begin'});session.handle({phase:'preview',value:0});
 for(let value=1;value<=10;value++){
  session.handle({phase:'preview',value});const gate=gates.at(-1);gate.resolve(payload(gate.plan,10+gate.plan.pixels*.024));await drain();
 }
 assert.equal(shown.length,0,'An obsolete image must never be painted');
 assert.equal(plans.length,11);assert.ok(plans[1].pixels<plans[0].pixels,'The first old response must reduce the next draft');
 assert.ok(10+plans.at(-1).pixels*.024<=50,'The computed-cost model must converge during the hold');
 assert.ok(observed.some(Boolean));const latest=gates.at(-1);latest.resolve(payload(latest.plan,10+latest.plan.pixels*.024));await session.settled();assert.equal(shown.length,1);
 const next=adaptive.plan({key:'computed-contract/continuous',width:310,height:260});assert.equal(next.pixels,plans.at(-1).pixels,'The next gesture reuses completed cost');session.dispose();
});

test('a fast unpainted draft cannot justify increasing resolution',()=>{
 const adaptive=createAdaptivePreview({initialSide:32}),a=adaptive.plan({key:'computed-contract/fast',width:1024,height:768});
 assert.equal(reportAdaptivePreviewComputed(payload(a,2).metrics),null);const b=adaptive.plan({key:'computed-contract/fast',width:1024,height:768});assert.equal(b.pixels,a.pixels);assert.equal(b.token.priorSamples,0);
});

test('cold initialization and cached costs cannot enlarge an unpainted draft',()=>{
 const adaptive=createAdaptivePreview({initialSide:32}),cold=adaptive.plan({key:'computed-contract/cold',width:1024,height:768});
 assert.equal(reportAdaptivePreviewComputed({token:cold.token,milliseconds:200,setupMilliseconds:195,cold:true}),null);
 assert.equal(adaptive.plan({key:'computed-contract/cold',width:1024,height:768}).pixels,cold.pixels);
 const cached=adaptive.plan({key:'computed-contract/cached',width:1024,height:768});
 adaptive.observe(cached,{milliseconds:2});const next=adaptive.plan({key:'computed-contract/cached',width:1024,height:768});
 assert.equal(reportAdaptivePreviewComputed({token:next.token,milliseconds:200,cached:true}),null);
 assert.equal(adaptive.plan({key:'computed-contract/cached',width:1024,height:768}).pixels,next.pixels);
});

test('paint replaces the same computed observation once and an older completion cannot erase it',()=>{
 const adaptive=createAdaptivePreview(),a=adaptive.plan({key:'computed-contract/paint',width:1024,height:768}),answer=payload(a,180);
 const cost=reportAdaptivePreviewComputed(answer.metrics);assert.equal(cost.calibration.samples,1);assert.equal(cost.calibration.painted,false);
 const painted=reportAdaptivePreviewPresented(answer.metrics,{milliseconds:200,displayMilliseconds:20});assert.equal(painted.calibration.samples,1);assert.equal(painted.calibration.painted,true);
 assert.equal(reportAdaptivePreviewComputed(answer.metrics),null);const next=adaptive.plan({key:'computed-contract/paint',width:1024,height:768});assert.equal(next.token.priorCalibration.painted,true);assert.equal(next.token.priorSamples,1);
});

test('a completed draft cannot calibrate after reset, disposal, release or a new hold',async()=>{
 for(const reason of ['source-change','tool-change','dispose','commit','new-hold']){
  let resolve;const observed=[],shown=[],commits=[],session=createParameterPreviewSession({preview:()=>new Promise(r=>resolve=r),computed:r=>observed.push(r),show:r=>shown.push(r),commit:()=>commits.push(1)});
  session.handle({phase:'begin'});session.handle({phase:'preview',value:1});
  if(reason==='dispose')session.dispose();else if(reason==='commit')session.handle({phase:'commit',value:1});else if(reason==='new-hold')session.handle({phase:'begin'});else session.reset(reason);
  resolve({old:true});await drain();await new Promise(r=>setTimeout(r,1));await session.settled();assert.deepEqual(observed,[],reason);assert.deepEqual(shown,[],reason);assert.equal(commits.length,reason==='commit'?1:0,reason);session.dispose();
 }
});

test('measurement does not publish a frame when its callback invalidates the source',async()=>{
 let resolve;const shown=[],session=createParameterPreviewSession({preview:()=>new Promise(r=>resolve=r),computed:()=>session.reset('source-change'),show:r=>shown.push(r),commit:()=>{}});
 session.handle({phase:'begin'});session.handle({phase:'preview'});resolve({currentBeforeMeasurement:true});await session.settled();assert.deepEqual(shown,[]);session.dispose();
});

test('invalid or absent adaptive metrics leave planning unchanged',()=>{
 for(const value of [null,{}, {adaptivePreview:{}},{adaptivePreview:{token:{schema:'adaptive-preview-token/1',targetMs:50},milliseconds:NaN}},{adaptivePreview:{token:{schema:'adaptive-preview-token/1',targetMs:50},milliseconds:200}},{adaptivePreview:{token:{schema:'wrong'},milliseconds:200}}])assert.equal(reportAdaptivePreviewComputed(value),null);
});
