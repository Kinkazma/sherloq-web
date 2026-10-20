// Gesture and UI integration only; this does not qualify native ELA calculations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {parseHTML} from 'linkedom';
import {createEnergyUI} from '../sherloq-browser/assets/energy-ui.js';
const assetRoot=process.env.SHERLOQ_TEST_ASSETS?pathToFileURL(process.env.SHERLOQ_TEST_ASSETS+'/'):new URL('../sherloq-browser/assets/',import.meta.url);
const html=await readFile(new URL('panel.html',assetRoot),'utf8');
function fixture(){
 const {document,window}=parseHTML(html),frames=new Map(),timers=new Map(),changes=[],views=[];let seq=0,time=0;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return ([...this.options].find(o=>o.hasAttribute('selected'))?.getAttribute('value')??[...this.options].find(o=>o.hasAttribute('selected'))?.textContent??this.options[0]?.getAttribute('value')??this.options[0]?.textContent??'');},set(v){for(const o of this.options)o.toggleAttribute('selected',(o.getAttribute('value')??o.textContent)===String(v));}});
 window.HTMLElement.prototype.reportValidity=()=>true;window.HTMLElement.prototype.checkValidity=()=>true;
 for(const[key,value]of Object.entries({Option:class{constructor(text,value){const el=document.createElement('option');el.textContent=text;el.value=value;return el;}},requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq;},cancelAnimationFrame:id=>frames.delete(id)}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 const timing={now:()=>time,delay:(fn,ms)=>{timers.set(++seq,{at:time+ms,fn});return seq;},cancelDelay:id=>timers.delete(id)},advance=(ms=120)=>{const until=time+ms;for(;;){const next=[...timers.entries()].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();}time=until;};
 const $=id=>document.getElementById(id),ui=createEnergyUI({$,interactiveControlOptions:timing,t:x=>x,changed:(calculate,options)=>changes.push({calculate,options,bundle:ui.bundle()}),persist(){},viewChanged:options=>views.push({options,bundle:ui.bundle()})});
 const emit=(node,type,properties={})=>node.dispatchEvent(Object.assign(new window.Event(type,{bubbles:true}),properties));
 return{ui,$,document,window,changes,views,emit,set(input,value){input.value=String(value);emit(input,'input');},draw(ms=120){advance(ms);const batch=[...frames.values()];frames.clear();for(const fn of batch)fn();}};
}
test('energy quality holds request current-quality bounded drafts and exactly one final native calculation',()=>{
 const h=fixture(),input=h.$('energy-quality');h.emit(input,'keydown',{key:'ArrowUp'});for(const value of[60,61,62]){h.set(input,value);h.emit(input,'change');h.draw();}assert.equal(h.changes.length,4);assert.equal(h.changes[0].options.intent,true);const previews=h.changes.filter(change=>change.options.preview);assert.equal(previews.length,3);assert.deepEqual(previews.map(change=>change.bundle.quality),[60,61,62]);assert.ok(previews.every(change=>!change.calculate&&change.options.preview.adaptive===true));assert.equal(h.changes.filter(change=>change.options.commit).length,0);h.emit(h.document,'keyup',{key:'ArrowUp'});assert.equal(h.changes.length,5);assert.equal(h.changes.at(-1).calculate,true);assert.equal(h.changes.at(-1).options.commit,true);assert.equal(h.changes.at(-1).bundle.quality,62);assert.equal(h.changes.filter(change=>change.options.commit).length,1);h.emit(input,'change');assert.equal(h.changes.length,5);h.ui.dispose();
});
test('energy block selects a native result directly while minimum holds use adaptive drafts',()=>{
 const h=fixture();for(const[key,value]of[['block',64],['minimum',5]]){const input=h.$('energy-'+key),start=h.changes.length;h.emit(input,'pointerdown',{button:0,pointerId:1});h.set(input,value);h.emit(input,'change');h.draw();assert.equal(h.changes[start].options.intent,true);if(key==='minimum')assert.deepEqual(h.changes[start+1].options.preview,{adaptive:true});else{assert.equal(h.changes[start+1].options.commit,true);assert.equal(h.changes[start+1].options.preview,undefined);}h.emit(h.document,'pointerup',{pointerId:1});assert.equal(h.changes.at(-1).options.commit,true);assert.equal(h.changes.at(-1).options.continuous,key==='minimum');assert.equal(h.changes.filter(change=>change.options.commit&&change.bundle[key]===value).length,1);}h.ui.dispose();
});
test('paired numeric energy score has a draft preview throughout a spinner hold and one native view at release',()=>{
 const h=fixture(),input=h.$('energy-score-threshold-number');h.ui.observePresentation({view:'scores',field:'unified',observedMaxima:{high:10,low:7}});h.emit(input,'pointerdown',{button:0,pointerId:1});for(const value of[1,2,3]){h.set(input,value);h.emit(input,'change');h.draw();}assert.equal(h.views.length,3);assert.ok(h.views.every(event=>event.options?.preview));assert.equal(Number(h.$('energy-score-threshold').value),3);h.emit(h.document,'pointerup',{pointerId:1});assert.equal(h.views.length,4);assert.equal(h.views.at(-1).options,undefined);h.emit(input,'change');assert.equal(h.views.length,4);h.ui.dispose();
});
test('paired score synchronization cannot make an unchanged next click compute again',()=>{
 const h=fixture(),number=h.$('energy-score-threshold-number'),range=h.$('energy-score-threshold');h.ui.observePresentation({view:'scores',field:'unified',observedMaxima:{high:10,low:7}});h.set(number,2);h.emit(number,'change');const count=h.views.length;h.emit(range,'pointerdown',{button:0,pointerId:1});h.emit(h.document,'pointerup',{pointerId:1});assert.equal(h.views.length,count);h.ui.dispose();
});
test('return to the original energy option cancels the parameter draft without recomputation',()=>{
 const h=fixture(),input=h.$('energy-minimum');h.emit(input,'pointerdown',{button:0,pointerId:1});h.set(input,6);h.draw();h.set(input,3);h.emit(h.document,'pointerup',{pointerId:1});assert.equal(h.changes.at(-1).calculate,false);assert.equal(h.changes.at(-1).options.cancel,true);assert.equal(h.changes.filter(change=>change.options.commit).length,0);h.ui.dispose();
});
test('energy invalid trailing number restores the valid option before native commit',()=>{
 const h=fixture(),input=h.$('energy-quality');h.set(input,75);h.set(input,'');h.emit(input,'blur');assert.equal(Number(input.value),75);assert.equal(h.changes.at(-1).bundle.quality,75);assert.equal(h.changes.at(-1).options.commit,true);h.ui.dispose();
});
test('profile selection validates once and resynchronizes untouched numeric controls',()=>{
 const h=fixture(),profile=h.$('energy-profile');profile.value='conservative';h.emit(profile,'change');assert.equal(h.changes.at(-1).options.commit,true);const count=h.changes.length,minimum=h.$('energy-minimum');h.emit(minimum,'pointerdown',{button:0,pointerId:1});h.emit(h.document,'pointerup',{pointerId:1});assert.equal(h.changes.length,count);h.ui.dispose();
});
test('cancelInteraction drops pending score drafts and no obsolete frame is shown',()=>{
 const h=fixture(),input=h.$('energy-score-threshold-number');h.set(input,.4);h.ui.cancelInteraction();h.draw();assert.equal(h.views.length,0);assert.equal(h.ui.interactiveActive,false);h.ui.dispose();
});

test('short repeated energy quality and score clicks never display a proxy',()=>{
 const h=fixture();h.ui.observePresentation({view:'scores',field:'unified',observedMaxima:{high:10,low:7}});const quality=h.$('energy-quality'),score=h.$('energy-score-threshold-number');for(let i=1;i<=5;i++){for(const[input,value]of[[quality,70+i],[score,i/10]]){h.emit(input,'pointerdown',{button:0,pointerId:1});h.set(input,value);h.draw(20);h.emit(h.document,'pointerup',{pointerId:1});h.emit(input,'change');}}h.draw(500);assert.equal(h.changes.filter(change=>change.options.preview).length,0);assert.equal(h.changes.filter(change=>change.options.commit).length,5);assert.equal(h.views.filter(view=>view.options?.preview).length,0);assert.equal(h.views.length,5);h.ui.dispose();
});

for(const id of ['energy-opacity',...['histogramLow','histogramHigh','shadow','highlight'].flatMap(key=>['energy-'+key,'energy-'+key+'-number'])])test(id+' distinguishes a short native click from a continuous preview gesture',()=>{
 const h=fixture(),input=h.$(id),initial=Number(input.value),step=initial+2<=Number(input.max||Infinity)?1:-1;h.emit(input,'pointerdown',{button:0,pointerId:1});h.set(input,initial+step);h.draw(20);h.emit(h.document,'pointerup',{pointerId:1});h.emit(input,'change');assert.equal(h.changes.filter(change=>change.options.preview).length,0);assert.equal(h.views.filter(view=>view.options?.preview).length,0);const initialFinals=id==='energy-opacity'?h.views.length:h.changes.filter(change=>change.options.commit).length;assert.equal(initialFinals,1);h.emit(input,'keydown',{key:'ArrowUp'});h.set(input,initial+step*2);h.draw(120);if(id==='energy-opacity')assert.equal(h.views.filter(view=>view.options?.preview).length,1);else assert.equal(h.changes.filter(change=>change.options.preview).length,1);h.emit(h.document,'keyup',{key:'ArrowUp'});assert.equal(id==='energy-opacity'?h.views.filter(view=>!view.options).length:h.changes.filter(change=>change.options.commit).length,2);h.ui.dispose();
});
