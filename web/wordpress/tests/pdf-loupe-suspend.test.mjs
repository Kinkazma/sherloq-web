import './helpers/pdf-node-environment.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {createPdfNativeRuntime} from '../sherloq-browser/assets/pdf-native-runtime.js';
import {mountPdfReader} from '../sherloq-browser/assets/pdf-reader.js';
import {effectDefaults} from '../sherloq-browser/assets/loupe-effects-settings.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function runtimeFixture(changed=()=>{}){
 const previousWorker=globalThis.Worker,previousCanvas=globalThis.OffscreenCanvas,workers=[],data={references:1,closed:false,suspends:0,resumes:0,suspendPreparation(){this.suspends++;},resumePreparation(){this.resumes++;},metrics:{nativeDensity:1,retainedNative:true,preparation:'ready'},hasLayers:false,retain(){this.references++;let released=false;return()=>{if(!released){released=true;this.references--;}};},async close(){this.references--;this.closed=true;},async sample({bounds,scale}){assert.equal(this.closed,false);const width=Math.ceil(bounds[2]*scale),height=Math.ceil(bounds[3]*scale);return{pixels:{width,height,format:'rgb8',data:new Uint8Array(width*height*3)}};},finished:async()=>{}};
 let holdBuild=false,rawReleased=0,selectionGate=null;
 globalThis.OffscreenCanvas=class{constructor(width,height){this.width=width;this.height=height;}getContext(){return{createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};}};
 globalThis.Worker=class{constructor(url){this.kind=String(url).includes('pdf-retained-storage-worker')?'storage':'effects';this.messages=[];workers.push(this);}reply(value){queueMicrotask(()=>this.onmessage?.({data:value}));}postMessage(m){this.messages.push(m);if(this.kind==='storage'){this.reply({ticket:m.ticket,result:m.action==='close'?{closed:true,activeBytes:0,retainedBytes:0,cacheBytes:0}:{}});return;}if(m.action==='build'&&!holdBuild)this.reply({ticket:m.ticket,resultId:m.ticket,metrics:{computedTiles:0}});if(m.action==='cancel')this.reply({ticket:m.ticket,error:{code:'CANCELLED',message:'Pending registration cancelled'}});if(m.action==='read')this.reply({ticket:m.ticket,pixels:{width:m.rect.width,height:m.rect.height,format:'rgb8',data:new Uint8Array(m.rect.width*m.rect.height*3)}});if(m.action==='release'&&m.ticket)this.reply({ticket:m.ticket,released:true});if(m.action==='dispose')this.reply({action:'disposed'});}terminate(){this.terminated=true;}};
 const runtime=createPdfNativeRuntime({changed,memoryBudgetBytes:64*1024**2,memoryFactory:({getJob})=>({async get(id){const gate=selectionGate;if(gate)await gate;const job=getJob(id);return{id,job,bitmap:{width:job.width,height:job.height},raw:{owner:id,retain(){},release(){rawReleased++;},draw(){}}};},select(){},invalidate(){},stats:()=>({}),async dispose(){}})});
 runtime.registerPage({id:'page',blob:new Blob(['fixture']),width:256,height:256,placements:[],retainedData:data,retainedLayers:false,renderWindow:async()=>{assert.fail('A retained page must not render PDF operations again');}});
 const effects=structuredClone(effectDefaults);effects.adjust.enabled=true;effects.adjust.brightness=20;
 return{runtime,data,workers,effects,holdSelection(){let resume;selectionGate=new Promise(resolve=>{resume=resolve;});return()=>{selectionGate=null;resume();};},setHold(v){holdBuild=v;},get rawReleased(){return rawReleased;},async close(source){source?.close();await runtime.dispose();globalThis.Worker=previousWorker;globalThis.OffscreenCanvas=previousCanvas;}};
}
test('ready PDF effects suspend and resume the same native result without losing the page or registering a build',async()=>{const h=runtimeFixture();let source;try{source=await h.runtime.selectPage('page');const effect=h.runtime.effectsSurface(h.effects);await tick();assert.equal(effect.metrics.phase,'ready');effect.prepare({left:1,top:1,right:10,bottom:10});await tick();const worker=h.workers.find(w=>w.kind==='effects'),builds=()=>worker.messages.filter(m=>m.action==='build').length;assert.equal(builds(),1);
 for(const cause of ['disabled','all-effects-disabled','original-comparison','cancel']){const count=worker.messages.filter(m=>m.action==='suspend').length;if(cause==='all-effects-disabled')assert.equal(h.runtime.effectsSurface(structuredClone(effectDefaults)),null);else if(cause==='cancel')h.runtime.cancel();else h.runtime.suspendEffects();await tick();assert.ok(worker.messages.filter(m=>m.action==='suspend').length>count,cause);assert.equal(effect.metrics.phase,'ready');assert.equal(h.data.closed,false);const same=h.runtime.effectsSurface(h.effects);assert.equal(same,effect);same.prepare({left:140,top:140,right:150,bottom:150});await tick();assert.equal(same.prepare({left:140,top:140,right:150,bottom:150}),true);assert.equal(builds(),1);assert.equal((await source.readPixels({x:0,y:0,width:1,height:1})).data.length,3);}
 }finally{await h.close(source);}assert.equal(h.data.references,0);assert.ok(h.workers.every(w=>w.terminated));});
test('a suspended pending PDF registration is replaced on reactivation while its original source survives',async()=>{const h=runtimeFixture();let source;try{source=await h.runtime.selectPage('page');h.setHold(true);const pending=h.runtime.effectsSurface(h.effects);assert.equal(pending.metrics.phase,'preparing');h.runtime.suspendEffects();await tick();assert.equal(pending.prepare({left:0,top:0,right:1,bottom:1}),false);assert.equal(h.data.closed,false);assert.equal((await source.readPixels({x:2,y:2,width:1,height:1})).data.length,3);h.setHold(false);const next=h.runtime.effectsSurface(h.effects);assert.notEqual(next,pending);await tick();assert.equal(next.metrics.phase,'ready');next.prepare({left:1,top:1,right:10,bottom:10});await tick();assert.equal(next.prepare({left:1,top:1,right:10,bottom:10}),true);assert.equal(h.workers.filter(w=>w.kind==='effects').flatMap(w=>w.messages).filter(m=>m.action==='build').length,2);}finally{await h.close(source);}assert.equal(h.data.references,0);assert.ok(h.workers.every(w=>w.terminated));});
function readerFixture(){const {document,window}=parseHTML('<html><body><div id="parent"></div></body></html>'),previous={requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame,ResizeObserver:globalThis.ResizeObserver},frames=new Map(),calls={suspend:0,sourceClosed:0,selected:0,prepares:0,draws:0,preparation:[]},states=[];let serial=0,resizeCallback;globalThis.requestAnimationFrame=fn=>{const n=++serial;frames.set(n,fn);return n;};globalThis.cancelAnimationFrame=n=>frames.delete(n);globalThis.ResizeObserver=class{constructor(fn){resizeCallback=fn;}observe(){}disconnect(){}};const source={width:100,height:100,prepare(){calls.prepares++;return true;},draw(){calls.draws++;},close(){calls.sourceClosed++;}},runtime={registerImage(){},registerPage(){},cancel(){},setPreparationActive(value){calls.preparation.push(value);},suspendEffects(){calls.suspend++;},async selectPage(){calls.selected++;return source;},effectsSurface(){return null;},stats:()=>({}),async dispose(){}};let callbacks;const session={state:'ready',select(){},cancel(){},async dispose(){},background:async()=>new Blob(['png'],{type:'image/png'}),async open(){await callbacks.onPage({id:'page',page:1,study:{pages:1},width:100,height:100,images:[],occurrences:[],viewport:{transform:[1,0,0,1,0,0]}},session);}};const effects=structuredClone(effectDefaults);effects.adjust.enabled=true;return{document,window,source,calls,states,effects,frames,resize:()=>resizeCallback?.(),get runtimeChanged(){return runtime.notify;},flush(){let remaining=20;while(frames.size&&remaining--){const tasks=[...frames.values()];frames.clear();for(const fn of tasks)fn();}assert.ok(remaining>0);},options:{document,parent:document.getElementById('parent'),file:new File(['%PDF'],'one.pdf',{type:'application/pdf'}),loupe:{enabled:true,effects},onEffectsState:value=>states.push(value),runtimeFactory:async value=>(runtime.notify=value.changed,runtime),sessionFactory:async value=>(callbacks=value,session)},restore(){Object.assign(globalThis,previous);}};}
test('reader setters suspend effects for disabled loupe, all disabled groups and Original comparison, preserving selected page',async()=>{const h=readerFixture();let reader;try{reader=await mountPdfReader(h.options);await reader.completion;const before=h.calls.suspend,settings={enabled:true,effects:h.effects};reader.setLoupe({...settings,enabled:false});assert.equal(h.calls.suspend,before+1);assert.equal(h.states.at(-1).busy,false);reader.setLoupe(settings);assert.equal(h.states.at(-1).busy,true);reader.setLoupe({...settings,effects:structuredClone(effectDefaults)});assert.equal(h.calls.suspend,before+2);assert.equal(h.states.at(-1).busy,false);reader.setLoupe(settings);reader.setCompareOriginal(true);assert.equal(h.calls.suspend,before+3);assert.equal(h.states.at(-1).busy,false);reader.setCompareOriginal(false);assert.equal(h.states.at(-1).busy,true);assert.equal(reader.selectedPage,1);assert.equal(h.calls.sourceClosed,0);assert.equal(h.calls.selected,1);}finally{await reader?.dispose();h.restore();}assert.equal(h.calls.sourceClosed,1);});

test('effect arrivals and loupe settings invalidate only the lens; native page arrivals still repaint the page',async()=>{
 const h=readerFixture();let reader;try{
  reader=await mountPdfReader(h.options);await reader.completion;
  const view=h.options.parent.shadowRoot.querySelector('.pdf-reader-view'),canvas=view.querySelector('canvas');
  Object.defineProperties(view,{clientWidth:{value:400},clientHeight:{value:300}});
  canvas.getContext=()=>({setTransform(){},clearRect(){},save(){},translate(){},scale(){},restore(){}});
  reader.activate();h.flush();assert.ok(h.calls.prepares>0);assert.ok(h.calls.draws>0);const before={...h.calls};
  for(let i=0;i<50;i++)h.runtimeChanged({effectsOnly:true});h.flush();
  assert.equal(h.calls.prepares,before.prepares);assert.equal(h.calls.draws,before.draws);
  reader.setLoupe({enabled:true,effects:h.effects});h.flush();
  assert.equal(h.calls.prepares,before.prepares);assert.equal(h.calls.draws,before.draws);
  h.runtimeChanged();h.flush();assert.equal(h.calls.prepares,before.prepares+1);assert.equal(h.calls.draws,before.draws+1);
 }finally{await reader?.dispose();h.restore();}
});
test('native effect completions are classified separately from raw page notifications',async()=>{
 const changes=[],h=runtimeFixture(value=>changes.push(value));let source;try{
  source=await h.runtime.selectPage('page');changes.length=0;const effect=h.runtime.effectsSurface(h.effects);await tick();
  assert.ok(changes.some(value=>value?.effectsOnly));assert.equal(changes.filter(value=>value===undefined).length,0);
  effect.prepare({left:1,top:1,right:10,bottom:10});await tick();assert.ok(changes.length>1);assert.ok(changes.every(value=>value?.effectsOnly));
 }finally{await h.close(source);}
});

test('changing the selected page suspends retired native preparation and reactivates its retained data on return',async()=>{
 const h=runtimeFixture();let first,second;try{first=await h.runtime.selectPage('page');assert.equal(h.data.resumes,1);assert.equal(h.data.suspends,0);second=await h.runtime.selectPage('page');assert.equal(h.data.suspends,1);assert.equal(h.data.resumes,2);assert.equal(h.data.closed,false);assert.equal((await second.readPixels({x:2,y:2,width:1,height:1})).data.length,3);}finally{first?.close();await h.close(second);}assert.equal(h.data.references,0);
});

test('hidden native readers pause background preparation before selection and resume the same retained source',async()=>{
 const h=runtimeFixture();let source;try{h.runtime.setPreparationActive(false);source=await h.runtime.selectPage('page');assert.equal(h.data.suspends,1);assert.equal(h.data.resumes,0);assert.equal((await source.readPixels({x:2,y:2,width:1,height:1})).data.length,3);assert.equal(h.data.closed,false);h.runtime.setPreparationActive(true);assert.equal(h.data.resumes,1);assert.equal(h.data.closed,false);}finally{await h.close(source);}assert.equal(h.data.references,0);
});
test('reader visibility, zero-size workspace and activation control retained preparation without losing the page',async()=>{
 const h=readerFixture();let reader;try{reader=await mountPdfReader(h.options);await reader.completion;const view=h.options.parent.shadowRoot.querySelector('.pdf-reader-view'),canvas=view.querySelector('canvas');let visible=true,hidden=false;Object.defineProperties(view,{clientWidth:{get:()=>visible?400:0},clientHeight:{get:()=>visible?300:0}});Object.defineProperty(h.document,'hidden',{configurable:true,get:()=>hidden});canvas.getContext=()=>({setTransform(){},clearRect(){},save(){},translate(){},scale(){},restore(){}});reader.activate();h.flush();assert.equal(h.calls.preparation.at(-1),true);const selected=h.calls.selected;visible=false;h.resize();assert.equal(h.calls.preparation.at(-1),false);visible=true;h.resize();h.flush();assert.equal(h.calls.preparation.at(-1),true);hidden=true;h.document.dispatchEvent(new h.window.Event('visibilitychange'));assert.equal(h.calls.preparation.at(-1),false);hidden=false;h.document.dispatchEvent(new h.window.Event('visibilitychange'));assert.equal(h.calls.preparation.at(-1),true);assert.equal(h.calls.selected,selected);assert.equal(h.calls.sourceClosed,0);}finally{await reader?.dispose();h.restore();}
});

test('an activation during asynchronous selection cannot resume the retired page',async()=>{
 const h=runtimeFixture();let first,second;try{first=await h.runtime.selectPage('page');assert.equal(h.data.resumes,1);const resume=h.holdSelection(),pending=h.runtime.selectPage('page');assert.equal(h.data.suspends,1);h.runtime.setPreparationActive(true);assert.equal(h.data.resumes,1);resume();second=await pending;assert.equal(h.data.resumes,2);assert.equal(h.data.closed,false);}finally{first?.close();await h.close(second);}assert.equal(h.data.references,0);
});

test('the PDF main canvas redraws its retained page after 2D restoration without reopening the document',async()=>{
 const h=readerFixture();let reader;try{reader=await mountPdfReader(h.options);await reader.completion;const view=h.options.parent.shadowRoot.querySelector('.pdf-reader-view'),canvas=view.querySelector('canvas');Object.defineProperties(view,{clientWidth:{value:400},clientHeight:{value:300}});canvas.getContext=()=>({setTransform(){},clearRect(){},save(){},translate(){},scale(){},restore(){}});reader.activate();h.flush();const before=h.calls.draws,selected=h.calls.selected;const loss=new h.window.Event('contextlost',{cancelable:true});canvas.dispatchEvent(loss);assert.equal(loss.defaultPrevented,false);reader.activate();h.flush();assert.equal(h.calls.draws,before);canvas.dispatchEvent(new h.window.Event('contextrestored'));h.flush();assert.equal(h.calls.draws,before+1);assert.equal(h.calls.selected,selected);assert.equal(h.calls.sourceClosed,0);}finally{await reader?.dispose();h.restore();}
});


// The main display can lose an allocation while external layout CSS is still
// arriving. Geometry recovery must not publish a frame or discard a healthy
// previous native frame while its replacement is pending.
function mainCanvasFixture(h){
 const view=h.options.parent.shadowRoot.querySelector('.pdf-reader-view'),canvas=view.querySelector('canvas'),empty=view.querySelector('.pdf-reader-empty');
 const state={width:400,height:300,backingWidth:300,backingHeight:150,lost:false,ready:true,clears:0,failOnResize:false,loseOnDraw:false,writes:[]};
 Object.defineProperties(view,{clientWidth:{get:()=>state.width},clientHeight:{get:()=>state.height}});
 Object.defineProperties(canvas,{width:{configurable:true,get:()=>state.backingWidth,set:value=>{state.backingWidth=value;state.writes.push(['width',value]);if(state.failOnResize)state.lost=true;}},height:{configurable:true,get:()=>state.backingHeight,set:value=>{state.backingHeight=value;state.writes.push(['height',value]);if(state.failOnResize)state.lost=true;}}});
 canvas.getContext=()=>({isContextLost:()=>state.lost,setTransform(){},clearRect(){state.clears++;},save(){},translate(){},scale(){},restore(){}});
 h.source.nativePdf=true;h.source.prepare=()=>{h.calls.prepares++;return state.ready;};h.source.draw=()=>{h.calls.draws++;if(state.loseOnDraw)state.lost=true;};
 return{view,canvas,empty,state};
}

test('a lost oversized PDF display still shrinks to settled layout before waiting for restoration',async()=>{
 const h=readerFixture();h.options.loupe={enabled:false};let reader;try{
  reader=await mountPdfReader(h.options);await reader.completion;const {canvas,state}=mainCanvasFixture(h);
  reader.activate();h.flush();const initial={draws:h.calls.draws,prepares:h.calls.prepares,clears:state.clears,selected:h.calls.selected};
  canvas.width=1770;canvas.height=81750;state.width=320;state.height=240;state.lost=true;
  const loss=new h.window.Event('contextlost',{cancelable:true});canvas.dispatchEvent(loss);reader.activate();h.flush();
  assert.equal(loss.defaultPrevented,false);assert.deepEqual([canvas.width,canvas.height],[320,240]);
  assert.equal(h.calls.draws,initial.draws);assert.equal(h.calls.prepares,initial.prepares);assert.equal(state.clears,initial.clears,'The lost canvas is resized, never advertised as a painted page.');
  state.lost=false;canvas.dispatchEvent(new h.window.Event('contextrestored'));h.flush();
  assert.equal(h.calls.draws,initial.draws+1);assert.equal(h.calls.selected,initial.selected);assert.equal(h.calls.sourceClosed,0);
 }finally{await reader?.dispose();h.restore();}
});

test('a healthy pending native PDF keeps its old backing and pixels until its replacement is ready',async()=>{
 const h=readerFixture();h.options.loupe={enabled:false};let reader;try{
  reader=await mountPdfReader(h.options);await reader.completion;const {canvas,state}=mainCanvasFixture(h);
  reader.activate();h.flush();assert.deepEqual([canvas.width,canvas.height],[400,300]);const initial={draws:h.calls.draws,clears:state.clears,writes:state.writes.length};
  state.width=800;state.height=600;state.ready=false;reader.activate();h.flush();
  assert.deepEqual([canvas.width,canvas.height],[400,300]);assert.equal(state.writes.length,initial.writes);assert.equal(state.clears,initial.clears);assert.equal(h.calls.draws,initial.draws);
  state.ready=true;reader.activate();h.flush();assert.deepEqual([canvas.width,canvas.height],[800,600]);assert.equal(h.calls.draws,initial.draws+1);assert.equal(h.calls.sourceClosed,0);
 }finally{await reader?.dispose();h.restore();}
});

test('loss caused by display resize is checked before drawing or publishing the first PDF frame',async()=>{
 const h=readerFixture();h.options.loupe={enabled:false};let reader;try{
  reader=await mountPdfReader(h.options);await reader.completion;const {canvas,empty,state}=mainCanvasFixture(h);
  state.failOnResize=true;reader.activate();h.flush();
  assert.equal(state.lost,true);assert.equal(h.calls.prepares,1);assert.equal(h.calls.draws,0);assert.equal(state.clears,0);assert.equal(empty.hidden,false);
  state.failOnResize=false;state.lost=false;canvas.dispatchEvent(new h.window.Event('contextrestored'));h.flush();
  assert.equal(h.calls.draws,1);assert.equal(empty.hidden,true);assert.equal(h.calls.selected,1);assert.equal(h.calls.sourceClosed,0);
 }finally{await reader?.dispose();h.restore();}
});

test('a context lost during PDF drawing cannot be marked presented before its retained redraw',async()=>{
 const h=readerFixture();h.options.loupe={enabled:false};let reader;try{
  reader=await mountPdfReader(h.options);await reader.completion;const {canvas,empty,state}=mainCanvasFixture(h);
  state.loseOnDraw=true;reader.activate();h.flush();
  assert.equal(h.calls.draws,1);assert.equal(state.lost,true);assert.equal(empty.hidden,false,'The first failed draw must not publish the page.');
  state.loseOnDraw=false;state.lost=false;canvas.dispatchEvent(new h.window.Event('contextrestored'));h.flush();
  assert.equal(h.calls.draws,2);assert.equal(empty.hidden,true);assert.equal(h.calls.selected,1);assert.equal(h.calls.sourceClosed,0);
 }finally{await reader?.dispose();h.restore();}
});

test('reader shutdown drains a rejected completion and retains native renderer after failed close ACK',async()=>{
 const h=readerFixture(),primary=Object.freeze(Error('error observer failed')),ack=Object.freeze(Error('native renderer ACK refused'));let reader,rendererCloses=0,sessionCloses=0;
 h.options.onEffectsState=value=>{if(value.error)throw primary;};h.options.rendererFactory=()=>({renderPage(){assert.fail('No page was published');},async close(){if(++rendererCloses===1)throw ack;}});
 h.options.sessionFactory=async()=>({state:'failed',cancel(){},async open(){throw Error('import failed');},async dispose(){sessionCloses++;}});
 try{reader=await mountPdfReader(h.options);await assert.rejects(reader.completion,e=>e===primary);await assert.rejects(reader.dispose(),e=>e===ack);assert.equal(rendererCloses,1);assert.equal(sessionCloses,0);await reader.dispose();assert.equal(rendererCloses,2);assert.equal(sessionCloses,1);await reader.dispose();assert.equal(rendererCloses,2);}finally{await reader?.dispose();h.restore();}
});

test('PDF export sizing forwards the intrinsic runtime grid independently of the view and closes to null',async()=>{const h=readerFixture();let reader,runtime;try{reader=await mountPdfReader({...h.options,runtimeFactory:async options=>{runtime=await h.options.runtimeFactory(options);runtime.exportSize=()=>({width:7790,height:11014});return runtime;}});await reader.completion;assert.deepEqual(reader.exportSize(),{width:7790,height:11014});assert.equal(h.source.width,100);await reader.dispose();runtime.exportSize=()=>{throw Error('Closed reader must not query a retired runtime');};assert.equal(reader.exportSize(),null);}finally{await reader?.dispose();h.restore();}});
