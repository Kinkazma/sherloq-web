import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptivePreview} from '../sherloq-browser/assets/adaptive-preview.js';
import {createFrequencyPreviewSizing} from '../sherloq-browser/assets/frequency-preview-sizing.js';
const bounds={key:'tiers',sourceIdentity:'a',width:3000,height:2000,maxSide:3000,maxPixels:6000000,sampling:'proportional'};
function fixture(){let time=1000;return createAdaptivePreview({calibrations:new Map(),persist:false,wallNow:()=>time++});}
const note=(s,p,ms,flags={})=>s.observe(p,{milliseconds:ms,displayMilliseconds:0,...flags});
test('two natural frames above300ms gently reduce each axis by10–30%',()=>{
 for(const ms of [301,400,500]){
  const s=fixture(),a=s.plan(bounds);note(s,a,ms);assert.equal(s.plan(bounds).side,a.side);
  const b=s.plan(bounds),f=note(s,b,ms),c=s.plan(bounds);
  assert.equal(f.qualityPolicy.reductionKind,'gentle');assert(c.side>=a.side*.7&&c.side<=a.side*.9);
  assert(c.width*c.height<=6000000);
 }
});
test('a naturally slow pair above500ms authorizes a substantially smaller grid',()=>{
 const s=fixture();for(let i=0;i<2;i++)note(s,s.plan(bounds),2000);
 assert(s.plan(bounds).side<=1500);
});
test('value speed and stale/cancelled frames cannot cause even a gentle reduction',()=>{
 for(const flags of [{stale:true},{cancelled:true},{aborted:true},{presented:false},{cold:true},{cached:true}]){
  const s=fixture();for(let i=0;i<3;i++)note(s,s.plan(bounds),400,flags);
  assert.equal(s.plan(bounds).side,3000);
 }
});
test('the300ms boundary resets consecutive gentle evidence and is not an overload',()=>{
 const s=fixture();for(const ms of [400,300,400])note(s,s.plan(bounds),ms);
 assert.equal(s.plan(bounds).side,3000);note(s,s.plan(bounds),400);assert(s.plan(bounds).side<3000);
});
test('integer1→2 is never used as a gentle reduction; a finer legal grid may shrink gently',()=>{
 const s=fixture(),whole={...bounds,sampling:'integer'};
 for(let i=0;i<3;i++)note(s,s.plan(whole),400);
 assert.equal(s.plan(whole).side,3000);
 const t=fixture(),sampled={...whole,width:12000,height:8000,maxSide:3000};
 for(let i=0;i<2;i++)note(t,t.plan(sampled),400);
 const p=t.plan(sampled);assert.equal(p.step,5);assert.equal(p.side,2400);
});
test('proportional sizing stays within exact side, area and single-pixel admission',()=>{
 for(const shape of [[1,1e9,1],[9000,6000,20000],[3000,2000,6000000]]){
  const s=fixture(),[width,height,maxPixels]=shape,p=s.plan({...bounds,width,height,maxPixels});
  assert(p.pixels<=maxPixels);assert(p.width>0&&p.height>0);assert(p.side<=3000);
 }
});
test('frequency sizing uses the same gentle threshold without changing its integer sampling',()=>{
 const s=createFrequencyPreviewSizing(),args={key:'frequency',identity:'a',environment:'cpu',width:12000,height:8000,maxSide:3000,maxPixels:6000000};
 for(let i=0;i<2;i++){
  const p=s.plan(args);s.observe(p,{milliseconds:400,completed:true,basisWarm:true,pixels:p.pixels,inputWidth:p.width,inputHeight:p.height,outputWidth:p.width,outputHeight:p.height,sourceId:'s'+i,ownerKey:'o'+i});
 }
 const p=s.plan(args);assert.equal(p.step,5);assert.equal(p.width,2400);assert.equal(p.token.prediction.reason,'two-natural-completions-exceed-300ms');
});
test('a rounded480ms request uses legal step5 instead of rejecting excessive step6',()=>{
 for(const milliseconds of [480,499,500]){
  const adaptive=fixture(),args={...bounds,sampling:'integer',width:12000,height:8000};
  for(let i=0;i<2;i++)note(adaptive,adaptive.plan(args),milliseconds);
  assert.equal(adaptive.plan(args).step,5);
  const frequency=createFrequencyPreviewSizing(),fargs={key:'rounded',identity:'a',environment:'cpu',width:12000,height:8000,maxSide:3000,maxPixels:6000000};
  for(let i=0;i<2;i++){const p=frequency.plan(fargs);frequency.observe(p,{milliseconds,completed:true,basisWarm:true,pixels:p.pixels,inputWidth:p.width,inputHeight:p.height,outputWidth:p.width,outputHeight:p.height,sourceId:'s'+i,ownerKey:'o'+i});}
  assert.equal(frequency.plan(fargs).step,5);
 }
});
