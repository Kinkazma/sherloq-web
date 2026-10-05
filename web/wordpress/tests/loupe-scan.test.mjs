import test from 'node:test';import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createLoupeScan} from '../sherloq-browser/assets/loupe-scan.js';
import {bindSliderReset} from '../sherloq-browser/assets/slider-reset.js';
import {validateLoupeSettings,loupeSweepKey} from '../sherloq-browser/assets/media-settings.js';
function fixture(group,target='gamma'){
 const settings=validateLoupeSettings({enabled:true,sweepSpeed:.5,sweepTarget:target,effects:{[group]:{enabled:true}}}),seen=[],jobs=new Map();let seq=0,clock=0,lastDelay;
 const scan=createLoupeScan({read:()=>settings,write:(g,k,v)=>{settings.effects[g][k]=v;seen.push(v);},now:()=>clock,schedule:(fn,ms)=>{lastDelay=ms;jobs.set(++seq,fn);return seq;},cancel:id=>jobs.delete(id)});
 return{settings,scan,seen,jobs,get delay(){return lastDelay;},elapse:ms=>clock+=ms,step(){scan.presented();scan.presented();assert.equal(jobs.size,1);const [[id,fn]]=jobs;jobs.delete(id);fn();}};
}
test('B visits every rendered level, clipping and gamma value, then restores the factory default',()=>{
 for(const [group,count,first,last,reset]of [['sweep',256,0,255,127],['enhance',101,0,100,20],['adjust',50,1,50,10]]){
  const h=fixture(group);assert.equal(h.scan.start(group),true);assert.equal(h.seen.length,1);assert.equal(h.jobs.size,0,'No advance without a displayed result');while(h.scan.active)h.step();assert.equal(h.seen.length,count+1);assert.equal(h.seen[0],first);assert.equal(h.seen.at(-2),last);assert.equal(h.seen.at(-1),reset);assert.deepEqual(h.seen.slice(0,-1),Array.from({length:count},(_,i)=>first+i));
 }
});
test('B target supports signed and discrete parameters, excludes threshold auto, and cancels without resetting toggles',()=>{
 for(const [key,first,max]of [['brightness',-255,255],['threshold',1,255],['invert',false,true],['equalize',0,5]]){const h=fixture('adjust',key);h.scan.start('adjust');assert.equal(h.seen[0],first);while(h.scan.active)h.step();assert.equal(h.seen.at(-2),max);}
 const h=fixture('sweep');h.scan.start('sweep');h.step();h.settings.effects.sweep.enabled=false;h.scan.observe();assert.equal(h.scan.active,null);assert.equal(h.settings.effects.sweep.position,1);assert.equal(h.settings.effects.sweep.enabled,false);
 const e=fixture('enhance');e.settings.effects.enhance.mode='equalize';assert.equal(e.scan.start('enhance'),false);
 assert.throws(()=>validateLoupeSettings({sweepTarget:'enabled'}));assert.equal(loupeSweepKey({key:'B',code:'KeyX'}),true);assert.equal(loupeSweepKey({key:'b',target:{tagName:'INPUT',type:'range'}}),true);assert.equal(loupeSweepKey({key:'b',target:{tagName:'INPUT',type:'text'}}),false);assert.equal(loupeSweepKey({key:'b',metaKey:true}),false);
});
test('Double click restores the declared default, clamps to current limits and follows normal control events',()=>{
 const {document,window}=parseHTML('<input type="range" min="0" max="100" value="90">'),input=document.querySelector('input'),events=[];for(const name of ['input','change'])input.addEventListener(name,()=>events.push(name));bindSliderReset(input,20);input.dispatchEvent(new window.Event('dblclick',{bubbles:true,cancelable:true}));assert.equal(input.value,'20');assert.deepEqual(events,['input','change']);input.min='30';input.dispatchEvent(new window.Event('dblclick'));assert.equal(input.value,'30');input.disabled=true;input.value='80';input.dispatchEvent(new window.Event('dblclick'));assert.equal(input.value,'80');
});

test('Speed defaults to 2, accelerates without queued frames and can slow below the old pace',()=>{
 assert.equal(validateLoupeSettings({}).sweepSpeed,2);
 const fast=fixture('sweep');fast.settings.sweepSpeed=2;fast.scan.start('sweep');fast.step();assert.equal(fast.seen.at(-1),4);assert.equal(fast.delay,4);
 fast.settings.sweepSpeed=5;fast.step();assert.equal(fast.seen.at(-1),14);assert.equal(fast.delay,1.6);
 while(fast.scan.active)fast.step();assert.equal(fast.seen.at(-2),255);assert.equal(fast.seen.at(-1),127);
 const slow=fixture('sweep');slow.settings.sweepSpeed=.1;slow.scan.start('sweep');slow.elapse(100);slow.step();assert.equal(slow.delay,480);assert.equal(slow.seen.at(-1),1);
 for(const speed of [0,5.1,NaN])assert.throws(()=>validateLoupeSettings({sweepSpeed:speed}));
});
test('B pause resumes for five seconds, expires and invalidates on manual parameter changes',()=>{
 const h=fixture('enhance');h.scan.start('enhance');h.step();h.step();h.scan.start('enhance');assert.equal(h.scan.active,null);assert.equal(h.settings.effects.enhance.percent,2);
 h.elapse(4900);h.scan.start('enhance');assert.equal(h.settings.effects.enhance.percent,2);h.step();assert.equal(h.settings.effects.enhance.percent,3);
 h.scan.start('enhance');h.elapse(5001);h.scan.start('enhance');assert.equal(h.settings.effects.enhance.percent,0);
 h.step();h.scan.start('enhance');h.settings.effects.enhance.percent=40;h.scan.observe();h.scan.start('enhance');assert.equal(h.settings.effects.enhance.percent,0);
 h.step();h.scan.stop();h.scan.start('enhance');assert.equal(h.settings.effects.enhance.percent,0,'Explicit cancellation does not resume');
});
