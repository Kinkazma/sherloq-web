import test from 'node:test';
import assert from 'node:assert/strict';
import {bindInteractiveControl} from '../sherloq-browser/assets/interactive-control.js';
function fixture(type='range'){
 const doc=new EventTarget(),win=new EventTarget(),control=new EventTarget(),frames=new Map(),timers=new Map(),commits=[],previews=[];let clock=0,sequence=0;
 Object.assign(doc,{defaultView:win,hidden:false});Object.assign(control,{ownerDocument:doc,type,tagName:'INPUT',value:'10',dataset:{},disabled:false});
 const binding=bindInteractiveControl(control,{read:()=>({valid:control.value!=='',value:Number(control.value)}),commit:e=>commits.push(e),preview:e=>previews.push(e),now:()=>clock,schedule:f=>{frames.set(++sequence,f);return sequence;},cancelScheduled:id=>frames.delete(id),delay:(f,ms)=>{timers.set(++sequence,{f,at:clock+ms});return sequence;},cancelDelay:id=>timers.delete(id)});
 const emit=(target,type,fields={})=>target.dispatchEvent(Object.assign(new Event(type),fields));
 return{doc,win,control,binding,commits,previews,emit,input(n){control.value=String(n);emit(control,'input');},down(){emit(control,'pointerdown',{button:0,pointerId:1,clientX:10,clientY:10});},tick(ms){clock+=ms;for(const[id,t]of timers)if(t.at<=clock){timers.delete(id);t.f();}for(const[id,f]of frames){frames.delete(id);f();}}};
}
test('a range blur while the same pointer is held does not commit until the real global release',()=>{
 const h=fixture();h.down();h.input(20);h.emit(h.control,'blur');assert.equal(h.commits.length,0);assert.equal(h.binding.active,true);h.emit(h.doc,'pointermove',{pointerId:1,clientX:40,clientY:10});h.input(30);h.tick(0);assert.equal(h.previews.length,1);h.emit(h.doc,'pointerup',{pointerId:1});assert.equal(h.commits.length,1);assert.equal(h.commits[0].value,30);assert.equal(h.commits[0].kind,'drag');assert.equal(h.binding.active,false);h.emit(h.control,'change');assert.equal(h.commits.length,1);h.binding.dispose();
});
for(const ending of ['window-blur','visibility','pointercancel','lostpointercapture'])test('held range still finishes on '+ending,()=>{
 const h=fixture();h.down();h.input(20);h.emit(h.control,'blur');if(ending==='window-blur')h.emit(h.win,'blur');else if(ending==='visibility'){h.doc.hidden=true;h.emit(h.doc,'visibilitychange');}else h.emit(ending==='pointercancel'?h.doc:h.control,ending,{pointerId:1});assert.equal(h.commits.length,1);assert.equal(h.commits[0].value,20);assert.equal(h.binding.active,false);h.emit(h.doc,'pointerup',{pointerId:1});assert.equal(h.commits.length,1);h.binding.dispose();
});
test('keyboard-only range editing still commits on control blur',()=>{const h=fixture();h.emit(h.control,'keydown',{key:'ArrowRight'});h.input(11);h.emit(h.control,'blur');assert.equal(h.commits.length,1);assert.equal(h.binding.active,false);h.emit(h.doc,'keyup',{key:'ArrowRight'});assert.equal(h.commits.length,1);h.binding.dispose();});
test('numeric typing blur remains a final commit',()=>{const h=fixture('number');h.input(22);h.emit(h.control,'blur');assert.equal(h.commits.length,1);assert.equal(h.commits[0].value,22);h.binding.dispose();});
test('reset and dispose remove global ends and cannot publish an obsolete native commit',()=>{for(const method of ['reset','dispose']){const h=fixture();h.down();h.input(20);h.emit(h.control,'blur');h.binding[method]();h.emit(h.doc,'pointerup',{pointerId:1});h.emit(h.win,'blur');h.tick(500);assert.equal(h.commits.length,0);assert.equal(h.previews.length,0);h.binding.dispose();}});
test('short range clicks retain native-direct behavior without a proxy',()=>{const h=fixture();h.down();h.input(11);h.tick(20);h.emit(h.doc,'pointerup',{pointerId:1});h.tick(500);assert.equal(h.commits.length,1);assert.equal(h.commits[0].continuous,false);assert.equal(h.previews.length,0);h.binding.dispose();});
