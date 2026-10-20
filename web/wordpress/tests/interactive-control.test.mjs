import test from 'node:test';
import assert from 'node:assert/strict';
import {bindInteractiveControl} from '../sherloq-browser/assets/interactive-control.js';
function fixture({type='number',value=0}={}){
 const control=new EventTarget(),document=new EventTarget(),window=new EventTarget(),frames=new Map(),timers=new Map(),events=[];let seq=0,time=0,applied=value;
 Object.assign(document,{defaultView:window,hidden:false});Object.assign(control,{ownerDocument:document,tagName:type==='select'?'SELECT':'INPUT',type,value,disabled:false});
 const timing={now:()=>time,delay:(fn,ms)=>{timers.set(++seq,{at:time+ms,fn});return seq;},cancelDelay:id=>timers.delete(id),schedule:fn=>{frames.set(++seq,fn);return seq;},cancelScheduled:id=>frames.delete(id)};
 const binding=bindInteractiveControl(control,{...timing,read:()=>({valid:control.value!==''&&Number.isFinite(Number(control.value)),value:Number(control.value)}),update:v=>{applied=v;},begin:e=>events.push({phase:'begin',...e,applied}),preview:e=>events.push({phase:'preview',...e,applied}),commit:e=>events.push({phase:'commit',...e,applied}),cancel:e=>events.push({phase:'cancel',...e,applied})});
 const emit=(target,type,properties={})=>target.dispatchEvent(Object.assign(new Event(type),properties));
 return{control,document,window,binding,events,frames,timers,emit,set(v){control.value=v;emit(control,'input');},advance(ms){const until=time+ms;for(;;){const next=[...timers.entries()].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();}time=until;},draw(){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();},get applied(){return applied;}};
}
const phases=f=>f.events.map(e=>e.phase);
test('one short spinner click commits native settings without any provisional frame, including a late change',()=>{
 const h=fixture();h.emit(h.control,'pointerdown',{button:0,pointerId:2});h.set(1);h.advance(60);h.draw();h.emit(h.control,'change');assert.deepEqual(phases(h),['begin']);h.emit(h.document,'pointerup',{pointerId:2});h.emit(h.control,'change');h.emit(h.control,'blur');h.advance(200);h.draw();assert.deepEqual(phases(h),['begin','commit']);assert.equal(h.events.at(-1).applied,1);assert.equal(h.events.at(-1).continuous,false);assert.equal(h.events.at(-1).usedPreview,false);assert.equal(h.events.at(-1).kind,'click');assert.equal(h.binding.active,false);
});
test('repeated short spinner clicks never let an old delay publish a proxy',()=>{
 const h=fixture();for(let i=1;i<=12;i++){h.emit(h.control,'pointerdown',{button:0,pointerId:1});h.set(i);h.advance(20);h.draw();h.emit(h.document,'pointerup',{pointerId:1});h.emit(h.control,'change');}h.advance(500);h.draw();assert.equal(h.events.filter(e=>e.phase==='preview').length,0);assert.equal(h.events.filter(e=>e.phase==='commit').length,12);assert.equal(h.timers.size,0);
});
test('a held spinner previews only after 120 ms and keeps one latest rAF frame',()=>{
 const h=fixture();h.emit(h.control,'pointerdown',{button:0,pointerId:1});for(let i=1;i<=20;i++){h.set(i);h.emit(h.control,'change');}h.advance(119);h.draw();assert.deepEqual(phases(h),['begin']);h.advance(1);assert.equal(h.frames.size,1);h.draw();assert.equal(h.events.at(-1).value,20);h.emit(h.document,'pointerup',{pointerId:1});assert.deepEqual(phases(h),['begin','preview','commit']);assert.equal(h.events.at(-1).continuous,true);assert.equal(h.events.at(-1).usedPreview,true);assert.equal(h.events.at(-1).kind,'hold');
});
test('a true range drag permits an immediate provisional frame while a short range click does not',()=>{
 const h=fixture({type:'range'});h.emit(h.control,'pointerdown',{button:0,pointerId:1,clientX:10,clientY:10});h.set(1);h.emit(h.document,'pointermove',{pointerId:1,clientX:12,clientY:10});h.draw();assert.deepEqual(phases(h),['begin']);h.emit(h.document,'pointermove',{pointerId:1,clientX:14,clientY:10});h.draw();assert.deepEqual(phases(h),['begin','preview']);h.emit(h.document,'pointerup',{pointerId:1});assert.equal(h.events.at(-1).kind,'drag');assert.equal(h.events.at(-1).continuous,true);
});
test('short keyboard arrow clicks are native only and held repetition becomes continuous',()=>{
 const h=fixture({type:'range'});h.emit(h.control,'keydown',{key:'ArrowRight'});h.set(1);h.advance(30);h.draw();h.emit(h.document,'keyup',{key:'ArrowRight'});assert.deepEqual(phases(h),['begin','commit']);assert.equal(h.events.at(-1).kind,'keyrelease');h.emit(h.control,'keydown',{key:'ArrowRight'});for(let i=2;i<=6;i++){h.emit(h.control,'keydown',{key:'ArrowRight',repeat:true});h.set(i);h.emit(h.control,'change');}h.advance(120);h.draw();assert.equal(h.events.at(-1).phase,'preview');h.emit(h.document,'keyup',{key:'ArrowRight'});assert.equal(h.events.at(-1).continuous,true);assert.equal(h.events.filter(e=>e.phase==='commit').length,2);
});
test('release before the gated rAF drops the draft and commits once',()=>{
 const h=fixture({type:'range'});h.emit(h.control,'keydown',{key:'ArrowRight'});h.set(1);h.advance(120);assert.equal(h.frames.size,1);h.emit(h.document,'keyup',{key:'ArrowRight'});h.draw();assert.deepEqual(phases(h),['begin','commit']);assert.equal(h.events.at(-1).usedPreview,false);
});
test('only the last held adjustment key ends a gesture',()=>{const h=fixture();h.emit(h.control,'keydown',{key:'ArrowUp'});h.emit(h.control,'keydown',{key:'PageUp'});h.set(3);h.emit(h.document,'keyup',{key:'ArrowUp'});assert.equal(h.binding.active,true);h.emit(h.document,'keyup',{key:'PageUp'});assert.equal(h.events.at(-1).phase,'commit');});
for(const ending of ['blur','window-blur','hidden','pointercancel','lostpointercapture'])test(ending+' finishes once and removes delayed previews',()=>{
 const h=fixture();h.emit(h.control,'pointerdown',{button:0,pointerId:1});h.set(4);if(ending==='hidden'){h.document.hidden=true;h.emit(h.document,'visibilitychange');}else if(ending==='window-blur')h.emit(h.window,'blur');else h.emit(h.control,ending==='blur'?'blur':ending,{pointerId:1});h.advance(200);h.draw();assert.deepEqual(phases(h),['begin','commit']);assert.equal(h.binding.active,false);assert.equal(h.frames.size+h.timers.size,0);h.emit(h.document,'pointerup',{pointerId:1});assert.equal(h.events.length,2);
});
test('unchanged click does not start a draft or native work',()=>{const h=fixture();h.emit(h.control,'pointerdown',{button:0,pointerId:1});h.emit(h.document,'pointerup',{pointerId:1});h.emit(h.control,'change');assert.deepEqual(h.events,[]);assert.equal(h.binding.active,false);});
test('returning to the initial value cancels the continuous gesture without native work',()=>{
 const h=fixture();h.emit(h.control,'pointerdown',{button:0,pointerId:1});h.set(3);h.advance(120);h.draw();h.set(0);h.emit(h.document,'pointerup',{pointerId:1});assert.deepEqual(phases(h),['begin','preview','cancel']);assert.equal(h.events.at(-1).reason,'unchanged');
});
test('second gesture has a new generation and obsolete delayed or frame callbacks cannot display',()=>{
 const h=fixture();h.emit(h.control,'keydown',{key:'ArrowUp'});h.set(1);const staleTimer=[...h.timers.values()][0].fn;h.advance(120);const staleFrame=[...h.frames.values()][0];h.emit(h.document,'keyup',{key:'ArrowUp'});h.emit(h.control,'keydown',{key:'ArrowUp'});h.set(2);staleTimer();staleFrame();h.draw();assert.deepEqual(phases(h),['begin','commit','begin']);h.advance(120);h.draw();assert.equal(h.events.at(-1).phase,'preview');assert.notEqual(h.events[0].generation,h.events[2].generation);h.binding.finish();
});
test('reset cancels the delay and any already captured frame without committing',()=>{
 const h=fixture();h.set(5);const staleTimer=[...h.timers.values()][0].fn;h.advance(120);const staleFrame=[...h.frames.values()][0];h.binding.reset('source-change');staleTimer();staleFrame();h.advance(200);h.draw();assert.deepEqual(phases(h),['begin','cancel']);assert.equal(h.events.at(-1).reason,'source-change');h.binding.dispose();h.set(6);h.emit(h.control,'change');assert.equal(h.events.length,2);
});
test('typing waits for 120 ms quiet time and finalizes valid edits once on Enter',()=>{
 const h=fixture();h.emit(h.control,'beforeinput',{inputType:'insertText'});h.set('');h.advance(200);h.draw();assert.deepEqual(h.events,[]);h.set(1);h.advance(100);h.set(12);h.advance(119);h.draw();assert.deepEqual(phases(h),['begin']);h.advance(1);h.draw();h.emit(h.control,'keydown',{key:'Enter'});h.emit(h.control,'change');assert.deepEqual(phases(h),['begin','preview','commit']);assert.equal(h.events.at(-1).value,12);
});
test('an invalid final edit restores the last valid value before committing',()=>{const h=fixture();h.set(12);h.set('');h.emit(h.control,'blur');assert.equal(h.control.value,12);assert.equal(h.events.at(-1).value,12);assert.equal(h.events.at(-1).phase,'commit');});
for(const type of['select','checkbox'])test(type+' always uses a discrete native final without proxy, even while held',()=>{
 const h=fixture({type});h.emit(h.control,'pointerdown',{button:0,pointerId:1});h.set(2);h.advance(500);h.draw();assert.deepEqual(phases(h),['begin']);h.emit(h.document,'pointerup',{pointerId:1});h.emit(h.control,'change');assert.deepEqual(phases(h),['begin','commit']);assert.equal(h.events.at(-1).applied,2);assert.equal(h.events.at(-1).continuous,false);
});
test('disabled controls or modified keys do not open a gesture',()=>{const h=fixture();h.control.disabled=true;h.emit(h.control,'pointerdown',{button:0});h.set(1);h.emit(h.control,'change');h.control.disabled=false;h.emit(h.control,'keydown',{key:'ArrowUp',ctrlKey:true});assert.deepEqual(h.events,[]);assert.equal(h.binding.active,false);});

test('obsolete gate and rAF callbacks cannot erase the cancellation handle of a newer gesture',()=>{
 const h=fixture();h.emit(h.control,'pointerdown',{button:0,pointerId:1});h.set(1);const oldGate=[...h.timers.values()][0].fn;h.advance(120);const oldFrame=[...h.frames.values()][0];h.emit(h.document,'pointerup',{pointerId:1});h.emit(h.control,'pointerdown',{button:0,pointerId:1});h.set(2);oldGate();assert.equal(h.timers.size,1);h.advance(120);assert.equal(h.frames.size,1);oldFrame();h.emit(h.document,'pointerup',{pointerId:1});assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);h.draw();assert.equal(h.events.filter(event=>event.phase==='preview').length,0);
});
