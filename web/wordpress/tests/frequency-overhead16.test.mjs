import test from 'node:test';import assert from 'node:assert/strict';
import {createFrequencyPreviewSizing,frequencyPreviewPresented} from '../sherloq-browser/assets/frequency-preview-sizing.js';
const args={key:'pixels/detail.frequency/filter=0/view=low',identity:'sha/domainA',environment:'maximum10/cpu',width:129,height:46};
const note=(s,p,ms)=>s.observe(p,{milliseconds:ms,basisWarm:true,cold:false,cached:false,pixels:p.pixels,inputWidth:p.width,inputHeight:p.height});
test('a real previous frame can add its draw overhead while keeping the newest native model and source identity',()=>{
 const s=createFrequencyPreviewSizing(),a=s.plan(args),fa=note(s,a,12),b=s.plan(args),fb=note(s,b,30),painted=frequencyPreviewPresented({token:a.token,feedback:fa,milliseconds:12},{milliseconds:52,displayMilliseconds:40});
 const c=s.plan({...args,feedback:painted});assert.equal(c.token.priorCalibration.lastId,fb.calibration.lastId);assert.equal(c.token.priorCalibration.grids.length,2,'old feedback cannot replace new native observations');assert.equal(c.token.priorCalibration.displayMs,40);assert.equal(c.token.priorCalibration.lastPaintedId,a.id);assert.equal(c.width,43);assert.equal(c.height,16);
 const d=s.plan({...args,identity:'sha/domainB',feedback:painted});assert.equal(d.calibrated,false);assert.equal(d.token.priorCalibration,null,'old source/domain never teaches a new owner');
 const tiny=s.plan({...args,maxPixels:10});assert.equal(tiny.token.requestedMinimumSide,16);assert.equal(tiny.token.admissionBelowMinimum,true);assert.equal(tiny.token.side,Math.max(tiny.width,tiny.height));
});
