import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptivePreview,reportAdaptivePreviewPresented} from '../sherloq-browser/assets/adaptive-preview.js';
const bounds={key:'test/pixel-family',width:8192,height:4096,maxSide:2048,maxPixels:2048**2};
function control(options={}){let time=1000;const calibrations=new Map(),controller=createAdaptivePreview({calibrations,persist:false,wallNow:()=>time++,now:()=>time,...options});return{controller,calibrations};}
test('warm latency converges within ten frames to the highest admissible integer-sampled resolution',()=>{
 const{controller}=control(),rows=[];for(let i=0;i<10;i++){const plan=controller.plan(bounds),ms=plan.pixels*.00005;rows.push({plan,ms});controller.observe(plan,{milliseconds:ms});}
 const last=rows.at(-1);assert.ok(last.ms<=50);assert.ok(last.ms>=40);assert.equal(last.plan.step,6);assert.ok(Math.ceil(8192/5)*Math.ceil(4096/5)*.00005>50);assert.ok(rows.slice(5).every(r=>r.plan.step===6));
});
test('a fast kernel reaches the admitted ceiling instead of keeping an old fixed grid',()=>{
 const{controller}=control();let plan;for(let i=0;i<8;i++){plan=controller.plan(bounds);controller.observe(plan,{milliseconds:plan.pixels*.000001});}assert.equal(plan.side,2048);assert.equal(plan.step,4);
});
test('one-time initialization is excluded from steady calibration but remains in total metrics',()=>{
 const{controller,calibrations}=control(),plan=controller.plan(bounds),feedback=controller.observe(plan,{milliseconds:2020,setupMilliseconds:2000,cold:true});assert.equal(feedback.calibrationMs,20);assert.equal(feedback.measuredMs,2020);assert.ok(calibrations.get(bounds.key).side>plan.side);
});
test('post-draw measurement replaces the compute sample rather than counting the frame twice',()=>{
 const{controller,calibrations}=control(),plan=controller.plan(bounds);controller.observe(plan,{milliseconds:10});controller.observe(plan,{milliseconds:25,displayMilliseconds:15});assert.equal(calibrations.get(bounds.key).samples,1);assert.equal(calibrations.get(bounds.key).lastMs,25);assert.equal(calibrations.get(bounds.key).overhead,15);
});
test('new owners and distant gestures retain calibration without retaining pixels or source identities',()=>{
 const{controller,calibrations}=control();for(let i=0;i<8;i++){const p=controller.plan(bounds);controller.observe(p,{milliseconds:p.pixels*.00005});}const before=controller.plan(bounds);controller.reset();const next=createAdaptivePreview({calibrations,persist:false,wallNow:()=>1e12}).plan(bounds);assert.equal(next.side,before.side);assert.equal(next.calibrated,true);assert.ok(!JSON.stringify([...calibrations]).includes('sourceIdentity'));
});
test('cross-worker serialized feedback updates the next plan with the painted frame cost',()=>{
 const first=control(),plan=first.controller.plan(bounds),feedback=first.controller.observe(plan,{milliseconds:4}),second=control();const next=second.controller.plan({...bounds,feedback:structuredClone(feedback)});assert.ok(next.side>plan.side);assert.equal(next.calibrated,true);
});
test('severe overshoot and reduced memory bounds reduce resolution promptly',()=>{
 const{controller}=control({initialSide:1024});let plan=controller.plan(bounds);controller.observe(plan,{milliseconds:800});const reduced=controller.plan(bounds);assert.ok(reduced.side<=512);const small=controller.plan({...bounds,maxPixels:1024,maxSide:2048});assert.ok(small.pixels<=1024);assert.ok(small.side<reduced.side);
});
test('admissible planning terminates for thin huge geometries and a single-pixel quota',()=>{
 for(const sampling of ['integer','power-of-two']){const{controller}=control();const plan=controller.plan({...bounds,width:1,height:1e9,maxPixels:1,sampling});assert.equal(plan.pixels,1);assert.equal(plan.width,1);assert.equal(plan.height,1);assert.ok(plan.step>=1e9);}
});
test('power-of-two sampling remains within pixel and dimension bounds',()=>{
 const{controller}=control({initialSide:2048});for(const pixels of [1,25,1000,50000,2048**2]){const p=controller.plan({...bounds,width:9000,height:6000,sampling:'power-of-two',maxPixels:pixels});assert.ok(p.pixels<=pixels);assert.ok(p.width<=2048&&p.height<=2048);assert.equal(Math.log2(p.step)%1,0);}
});
test('a late older paint cannot overwrite a newer calibration',()=>{
 const{controller,calibrations}=control(),old=controller.plan(bounds),next=controller.plan(bounds);controller.observe(next,{milliseconds:50});assert.equal(controller.observe(old,{milliseconds:1}),null);assert.equal(calibrations.get(bounds.key).lastMs,50);
});
test('incompressible display and minimum-resolution overload are reported honestly',()=>{
 const{controller}=control({initialSide:16,minSide:16}),plan=controller.plan(bounds),feedback=controller.observe(plan,{milliseconds:100,displayMilliseconds:80});assert.equal(feedback.overheadExceedsTarget,true);assert.equal(feedback.minimumResolutionExceedsTarget,true);
});
test('calibration storage is bounded independently of gesture or source counts',()=>{
 const{controller,calibrations}=control();for(let i=0;i<200;i++){const p=controller.plan({...bounds,key:'test/family-'+i});controller.observe(p,{milliseconds:10});}assert.equal(calibrations.size,128);assert.equal(calibrations.has('test/family-0'),false);
});
test('invalid bounds and malformed measurements do not poison calibration',()=>{
 const{controller,calibrations}=control();for(const patch of [{width:0},{height:.5},{maxPixels:0},{maxSide:0},{key:''}])assert.throws(()=>controller.plan({...bounds,...patch}),TypeError);const p=controller.plan(bounds);assert.equal(controller.observe(p,{milliseconds:NaN}),null);assert.equal(calibrations.size,0);
});
test('presented metric is serializable and includes asynchronous display delay',()=>{
 const{controller}=control(),p=controller.plan({...bounds,key:'test/painted-frame'}),feedback=reportAdaptivePreviewPresented({adaptivePreview:{token:p.token,milliseconds:20,setupMilliseconds:0,cold:false,pixels:p.pixels}},{presentedAt:p.token.startedAt+42});assert.equal(feedback.measuredMs,42);assert.equal(feedback.calibration.overhead,22);assert.doesNotThrow(()=>structuredClone(feedback));
});
test('one cached result does not inflate the next uncached grid and a slow frame shrinks immediately',()=>{
 const{controller,calibrations}=control({initialSide:256});let p=controller.plan(bounds);controller.observe(p,{milliseconds:45});const warm=controller.plan(bounds);controller.observe(warm,{milliseconds:.1,cached:true});assert.ok(calibrations.get(bounds.key).side<=warm.side*1.05);p=controller.plan(bounds);controller.observe(p,{milliseconds:160});assert.ok(controller.plan(bounds).side<p.side*.8);
});
test('unstable frame cost increases the safety margin before further resolution growth',()=>{
 const{controller}=control({initialSide:128});let p=controller.plan(bounds);controller.observe(p,{milliseconds:25});p=controller.plan(bounds);const result=controller.observe(p,{milliseconds:70});assert.ok(result.safetyMargin>.1);assert.ok(result.safetyMargin<=.2+Number.EPSILON);
});
test('a constant paint delay is a fixed latency cost rather than a per-pixel penalty',()=>{
 const{controller}=control();let plan;for(let i=0;i<10;i++){plan=controller.plan(bounds);controller.observe(plan,{milliseconds:16+plan.pixels*.00001,displayMilliseconds:16});}assert.equal(plan.side,2048);assert.ok(16+plan.pixels*.00001<50);
});
test('compact calibration survives a module reload without storing image identities or pixels',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}});
 try{const one=await import('../sherloq-browser/assets/adaptive-preview.js?calibration-persistence-one'),first=one.createAdaptivePreview();for(let i=0;i<10;i++){const plan=first.plan({...bounds,key:'test/persisted-cost'});first.observe(plan,{milliseconds:16+plan.pixels*.00001,displayMilliseconds:16});}
 const stored=[...values.values()].join('');assert.ok(stored.length<100000);assert.equal(stored.includes('sourceIdentity'),false);assert.equal(stored.includes('Uint8Array'),false);const two=await import('../sherloq-browser/assets/adaptive-preview.js?calibration-persistence-two'),plan=two.createAdaptivePreview({wallNow:()=>1e12}).plan({...bounds,key:'test/persisted-cost'});assert.equal(plan.calibrated,true);assert.equal(plan.priorSamples,10);assert.equal(plan.side,2048);
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});
