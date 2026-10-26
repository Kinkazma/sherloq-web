// DOM/controller contracts; no model, engine worker or scientific kernel.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';
function fixture(id='ai.sources.safire'){
 const {document,window}=parseHTML('<html><body><section id="analysis-controls"></section><div id="viewport"></div></body></html>'),events=[],settings=[],frames=new Map();let seq=0;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(v){for(const o of this.options)o.toggleAttribute('selected',o.value===String(v));}});
 window.HTMLElement.prototype.getBoundingClientRect=()=>({width:800,height:600,left:0,top:0});window.HTMLElement.prototype.reportValidity=()=>true;window.HTMLElement.prototype.checkValidity=()=>true;
 for(const[key,value]of Object.entries({document,window,Option:class{constructor(text,value){const o=document.createElement('option');o.textContent=text;o.value=value;return o;}},requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq;},cancelAnimationFrame:id=>frames.delete(id),ResizeObserver:class{observe(){}disconnect(){}},devicePixelRatio:1}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 const ui=createToolWorkspace({document,language:()=> 'fr',getClient:async()=>{throw Error('No engine client expected');},run(){throw Error('No calculation expected');},cancel(){},showSurface(){throw Error('No render expected');},download(){},notify(){},onSettings:e=>settings.push(e),onInteractive:e=>events.push(e)});ui.select(id);
 const emit=(target,type,properties={})=>target.dispatchEvent(Object.assign(new window.Event(type,{bubbles:true}),properties)),view=()=>document.getElementById('tool-research-view'),field=key=>document.getElementById('tool-param-'+key),confidence=()=>[...view().options].find(o=>o.value==='confidence');
 return{document,ui,events,settings,frames,emit,view,field,confidence,restore(binary=true,mode='confidence'){ui.restore({'ai.sources.safire':{binary},uiOptions:{researchViews:{'ai.sources.safire':mode}}});},toggle(binary){field('binary').checked=binary;emit(field('binary'),'input');emit(field('binary'),'change');},choose(mode,{finish=true}={}){view().value=mode;emit(view(),'input');if(finish)emit(view(),'change');},close(){ui.dispose();}};
}
test('legacy binary Confidence session displays its effective Map without changing saved preference or native parameters',()=>{
 const h=fixture();try{h.restore();assert.deepEqual(h.ui.view(),{mode:'map'});assert.equal(h.view().value,'map');assert.equal(h.confidence().disabled,true);assert.equal(h.ui.extras.researchViews['ai.sources.safire'],'confidence');assert.equal(h.ui.serialize().uiOptions.researchViews['ai.sources.safire'],'confidence');assert.equal(h.ui.params().binary,true);assert.equal(h.events.length,0);assert.equal(h.settings.length,0);}finally{h.close();}
});
test('nonbinary Confidence remains available and its saved preference is unchanged',()=>{
 const h=fixture();try{h.restore(false);assert.equal(h.view().value,'confidence');assert.equal(!!h.confidence().disabled,false);assert.deepEqual(h.ui.view(),{mode:'confidence'});assert.equal(h.ui.params().binary,false);assert.equal(h.events.length,0);}finally{h.close();}
});
test('binary A/B/A preserves Confidence and emits only each scientific binary intention once',()=>{
 const h=fixture();try{h.restore(false);h.toggle(true);assert.equal(h.view().value,'map');assert.equal(h.confidence().disabled,true);h.toggle(false);assert.equal(h.view().value,'confidence');assert.equal(!!h.confidence().disabled,false);assert.equal(h.ui.extras.researchViews['ai.sources.safire'],'confidence');assert.deepEqual(h.events.map(e=>[e.phase,e.field]),[['begin','binary'],['commit','binary'],['begin','binary'],['commit','binary']]);assert.equal(h.settings.length,0);}finally{h.close();}
});
test('an explicit alternate presentation replaces the latent Confidence preference',()=>{
 const h=fixture();try{h.restore();h.choose('overlay');assert.equal(h.ui.extras.researchViews['ai.sources.safire'],'overlay');assert.equal(h.view().value,'overlay');h.toggle(false);assert.deepEqual(h.ui.view(),{mode:'overlay'});assert.equal(h.view().value,'overlay');const commits=h.events.filter(e=>e.phase==='commit');assert.deepEqual(commits.map(e=>e.field),['view.mode','binary']);assert.equal(commits[0].view.mode,'overlay');}finally{h.close();}
});
test('lock and repeated availability synchronization never emit a presentation cancellation',()=>{
 const h=fixture();try{h.restore();for(let i=0;i<3;i++){h.ui.lock(true,true);assert.equal(h.view().disabled,true);assert.equal(h.confidence().disabled,true);h.ui.lock(false,true);assert.equal(h.view().disabled,false);assert.equal(h.confidence().disabled,true);assert.equal(h.view().value,'map');}assert.equal(h.events.length,0);assert.equal(h.settings.length,0);h.toggle(false);h.ui.lock(true,true);h.ui.lock(false,true);assert.equal(h.view().value,'confidence');assert.equal(!!h.confidence().disabled,false);assert.equal(h.events.filter(e=>e.phase==='cancel').length,0);}finally{h.close();}
});
test('kind and direct parameter updates synchronize availability without adding view events',()=>{
 const h=fixture();try{h.restore(false);h.ui.updateParams({binary:true,kind:'dbscan'});assert.equal(h.view().value,'map');assert.equal(h.confidence().disabled,true);assert.equal(h.field('groups').disabled,true);assert.equal(h.field('eps').disabled,false);assert.equal(h.field('minimum').disabled,false);assert.equal(h.events.length,0);assert.equal(h.settings.length,1);h.ui.updateParams({binary:false,kind:'kmeans'});assert.equal(h.view().value,'confidence');assert.equal(h.field('groups').disabled,false);assert.equal(h.field('eps').disabled,true);assert.equal(h.events.length,0);}finally{h.close();}
});
test('reset restores native defaults and remounts the effective preference without a new view intention',()=>{
 const h=fixture();try{h.restore();const reset=[...h.document.querySelectorAll('button')].find(b=>b.textContent==='Réinitialiser');reset.click();assert.equal(h.ui.params().binary,false);assert.equal(h.view().value,'confidence');assert.equal(!!h.confidence().disabled,false);assert.equal(h.events.length,0);assert.equal(h.settings.length,1);}finally{h.close();}
});
test('FOCAL and AdaIFL retain independent presentation choices and option sets',()=>{
 const h=fixture();try{h.restore();h.ui.select('ai.localization.focal');h.choose('map');assert.deepEqual([...h.view().options].map(o=>o.value),['overlay','map']);h.ui.select('ai.localization.adaifl');h.choose('mask');assert.deepEqual([...h.view().options].map(o=>o.value),['overlay','map','mask']);h.ui.select('ai.sources.safire');assert.equal(h.view().value,'map');assert.equal(h.confidence().disabled,true);h.toggle(false);h.ui.select('ai.localization.focal');assert.equal(h.view().value,'map');h.ui.select('ai.localization.adaifl');assert.equal(h.view().value,'mask');}finally{h.close();}
});
test('a view binding starts from the visible Map, so an unchanged change event is inert',()=>{
 const h=fixture();try{h.restore();h.emit(h.view(),'change');assert.equal(h.events.length,0);h.toggle(false);h.toggle(true);h.events.length=0;h.emit(h.view(),'change');assert.equal(h.events.length,0);assert.equal(h.ui.extras.researchViews['ai.sources.safire'],'confidence');}finally{h.close();}
});
test('restoration discards an obsolete view control generation without stale intentions',()=>{
 const h=fixture();try{h.restore(false);const old=h.view();h.restore(true);h.events.length=0;old.value='overlay';h.emit(old,'input');h.emit(old,'change');for(const f of h.frames.values())f();assert.equal(h.events.length,0);assert.equal(h.view().value,'map');assert.equal(h.ui.extras.researchViews['ai.sources.safire'],'confidence');}finally{h.close();}
});
test('an in-flight Confidence intention is cancelled once when binary makes it unavailable',()=>{
 const h=fixture();try{h.restore(false,'overlay');h.choose('confidence',{finish:false});const old=h.events[0].generation;h.toggle(true);assert.equal(h.view().value,'map');assert.equal(h.confidence().disabled,true);assert.deepEqual(h.events.map(e=>[e.phase,e.field]),[['begin','view.mode'],['cancel','view.mode'],['begin','binary'],['commit','binary']]);const cancelled=h.events.find(e=>e.phase==='cancel');assert.equal(cancelled.reason,'safire-view-availability');assert.equal(cancelled.generation,old);assert(h.events.at(-1).generation>old);const count=h.events.length;h.emit(h.view(),'change');assert.equal(h.events.length,count);assert.equal(h.ui.interactivePending,false);}finally{h.close();}
});
test('an unchanged lock leaves the active valid presentation generation intact until its own change',()=>{
 const h=fixture();try{h.restore(false);h.choose('map',{finish:false});const generation=h.events[0].generation;h.ui.lock(true,true);h.ui.lock(false,true);assert.equal(h.events.length,1);h.emit(h.view(),'change');assert.deepEqual(h.events.map(e=>e.phase),['begin','commit']);assert.equal(h.events[1].generation,generation);assert.equal(h.ui.interactivePending,false);}finally{h.close();}
});
