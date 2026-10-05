// Controller/DOM contracts only. No browser, image decode or scientific run.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {mountAnalysisPanel} from '../sherloq-browser/assets/app.js';
import {toolCatalog} from '../sherloq-browser/assets/tool-catalog.js';
import {readPlotPoints,bindPlotCamera} from '../sherloq-browser/assets/scatter-view.js';
import {bindDocumentResize} from '../sherloq-browser/assets/document-resize.js';
import {loupeDefaults} from '../sherloq-browser/assets/media-settings.js';
const html=await readFile(new URL('../sherloq-browser/assets/panel.html',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(setImmediate);};
function environment({detect=()=>({regions:[]}),fail=()=>null,runGate=async()=>{}}={}){
 const {document,window}=parseHTML('<html><body></body></html>'),timers=new Map(),frames=new Map(),panels=[],calls=[],preparations=[];let seq=0;
 const canvasContext=()=>new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]??(()=>{})});
 class PreparationWorker {
  cancelled=new Set();
  async postMessage(message){
   if(message.action==='build'){preparations.push(message);await runGate(message);if(this.disposed||this.cancelled.has(message.ticket)){this.onmessage?.({data:{ticket:message.ticket,error:{code:'CANCELLED',message:'Cancelled'}}});return;}this.onmessage?.({data:{ticket:message.ticket,resultId:message.ticket,preview:{width:3,height:2,data:new Uint8Array(18)},metrics:{}}});}
   if(message.action==='cancel')this.cancelled.add(message.ticket);
   if(message.action==='dispose'){this.disposed=true;this.onmessage?.({data:{action:'disposed'}});}
  }
  terminate(){}
 }
 for(const [key,value]of Object.entries({document,window,location:{href:'http://localhost/app.html',hash:''},localStorage:{getItem:()=>null,setItem(){}},navigator:{hardwareConcurrency:8},isSecureContext:true,devicePixelRatio:1,innerWidth:1280,matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>(frames.set(++seq,fn),seq),cancelAnimationFrame:id=>frames.delete(id),setTimeout:fn=>(timers.set(++seq,fn),seq),clearTimeout:id=>timers.delete(id),ResizeObserver:class{observe(){}disconnect(){}},Worker:PreparationWorker,fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0),json:async()=>({assetBase:'./',engineVersion:'test-transport'})}),Option:class{constructor(text,value){const e=document.createElement('option');e.textContent=text;e.value=value;return e;}}}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(v){for(const o of this.options)o.toggleAttribute('selected',o.value===String(v));}});
 for(const [name,value]of Object.entries({clientWidth:800,clientHeight:600}))Object.defineProperty(window.HTMLElement.prototype,name,{configurable:true,get:()=>value});
 window.HTMLElement.prototype.reportValidity=()=>true;window.HTMLElement.prototype.setPointerCapture=()=>{};
 window.HTMLCanvasElement.prototype.getContext=type=>type==='webgl2'?null:canvasContext();
 const table={id:'points',revision:1,format:'float32-table',columns:['R','G','B','H','S','V'],rowCount:3};
 const engineFactory=()=>({
  loadM3Models:async()=>{},
  loadBlob:async({id})=>({id,sha256:'input',surface:{id:'source',revision:1,width:640,height:480,format:'rgb8'}}),
  async run(task){calls.push(task);await runGate(task);const failure=fail(task);if(failure)throw failure;if(task.operation==='subimages.detect')return {data:await detect()};return {id:task.id,operation:task.operation,status:'ok',provenance:{params:task.params},data:task.operation==='colors.plots'?{style:task.params,count:3,scale:1}:{answer:42},...(task.operation==='colors.plots'?{surface:table}:{})};},
  async readTable(){calls.push({operation:'readTable'});return {length:3,data:Float32Array.from({length:18},(_,i)=>i/18)};},
  releaseTable:async()=>{},releaseSurface:async()=>{},unload:async()=>{},dispose:async()=>{},capabilities:async()=>({})
 });
 function mount(id,sourceOnly=false){
  const host=document.createElement('div');document.body.append(host);const root=host.attachShadow({mode:'open'}),parsed=parseHTML(html).document;for(const child of [...parsed.body.children])root.append(document.importNode(child,true));
  const scope={getElementById:id=>root.getElementById(id),querySelectorAll:s=>root.querySelectorAll(s),createElement:t=>document.createElement(t),documentElement:host,addEventListener:(...a)=>root.addEventListener(...a)};
  const controller=mountAnalysisPanel(scope,{managed:true,toolId:id,sourceOnly,visible:()=>false,engineFactory,language:'fr'});panels.push(controller);return {controller,root};
 }
 return {mount,calls,preparations,window,adopt(controller){controller.adopt({source:{width:640,height:480,draw(){},close(){},async readPixels({width,height}){return{width,height,data:new Uint8Array(width*height*3)};}},file:new Blob(['transport']),imageId:'shared',hash:'hash',description:'transport'});},async flush(){const batch=[...timers.values()];timers.clear();for(const fn of batch)fn();await settle();},draw(){const batch=[...frames.values()];frames.clear();for(const fn of batch)fn();},async dispose(){await Promise.all(panels.map(c=>c.dispose()));}};
}
test('Every catalogue tool has compact shared controls and no provenance action; ELA has inline tabs',async()=>{
 const h=environment();try{
  for(const id of [...Object.keys(toolCatalog),'ela.classic','composite','analysis.complete','analysis.clones']){
   const {root,controller}=h.mount(id);assert.equal(root.querySelector('[data-i18n="provenance"]'),null,id);assert.equal(root.getElementById('panel-information'),null,id);
   if(toolCatalog[id])assert.ok(root.querySelector('#tool-controls>.tool-actions'),id);
   assert.ok(root.getElementById('task-run').classList.contains('primary'),id);assert.equal(root.getElementById('task-run').parentElement.className,'panel-actions',id);
   await controller.dispose();
  }
  const {root}=h.mount('ela.classic');assert.equal(root.getElementById('ela-tab-classic').getAttribute('aria-selected'),'true');root.getElementById('ela-tab-energy').onclick();assert.equal(root.getElementById('ela-mode').value,'energy');assert.equal(root.getElementById('classic-controls').hidden,true);assert.equal(root.getElementById('ela-tab-energy').getAttribute('aria-selected'),'true');
 }finally{await h.dispose();}
});
test('Opening an individual tool auto-runs once; navigation does not rerun, edits debounce, close cancels pending work',async()=>{
 const h=environment();try{
  const {controller,root}=h.mount('inspection.adjust');h.adopt(controller);assert.equal(h.calls.length,0);await h.flush();assert.equal(h.calls.length,1);assert.equal(h.calls[0].operation,'inspection.adjust');
  controller.activate();controller.setLanguage('en');controller.setTheme('light');await h.flush();assert.equal(h.calls.length,1);
  const input=root.getElementById('tool-param-brightness');input.value='20';input.onchange();input.value='30';input.onchange();await h.flush();assert.equal(h.calls.length,2);assert.equal(h.calls[1].params.brightness,30);
  input.value='40';input.onchange();await controller.dispose();await h.flush();assert.equal(h.calls.length,2);
 }finally{await h.dispose();}
});
test('Original and tools awaiting an auxiliary image do not start incomplete calculations',async()=>{
 const h=environment();try{for(const [id,original]of [['original',true],['comparison.image',false],['noise.prnu',false]]){const {controller}=h.mount(id,original);h.adopt(controller);}await h.flush();assert.equal(h.calls.length,0);}finally{await h.dispose();}
});
test('Enhanced panel shares prepared-image producer when switching L off, without rerunning the analysis engine',async()=>{
 const h=environment();try{
  const {controller,root}=h.mount('inspection.magnifier');controller.setLoupe({...loupeDefaults,enabled:true,zoom:2,unlock:true});h.adopt(controller);await h.flush();assert.equal(h.calls.length,0);assert.equal(controller.snapshot().zoom,120);assert.equal(controller.snapshot().hasReport,false);
  controller.setLoupeEnhancement({mode:'contrast',percent:25,channel:true});await h.flush();assert.equal(h.calls.length,0);assert.equal(root.getElementById('tool-param-mode').value,'"contrast"');assert.equal(root.getElementById('tool-param-percent').value,'25');assert.equal(root.getElementById('tool-param-channel').checked,true);
  await root.getElementById('task-run').onclick();assert.equal(h.calls.length,0);
  controller.setLoupe({...loupeDefaults,enabled:false});await h.flush();assert.equal(h.calls.length,0);assert.equal(h.preparations.length,1);assert.equal(h.preparations[0].effects.enhance.percent,25);assert.equal(controller.snapshot().hasReport,true);
  controller.setLoupe({...loupeDefaults,enabled:true});controller.setLoupeEnhancement({mode:'equalize',percent:50,channel:false});controller.activate();await h.flush();assert.equal(h.calls.length,0);assert.equal(h.preparations.length,1);assert.equal(controller.snapshot().hasReport,false);assert.equal(root.getElementById('layer').value,'source');
 }finally{await h.dispose();}
});
test('Enhanced settings changed during a full run coalesce into one subsequent calculation',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),h=environment({runGate:()=>gate});try{
  const {controller}=h.mount('inspection.magnifier');h.adopt(controller);await h.flush();assert.equal(h.preparations.length,1);assert.equal(h.calls.length,0);assert.equal(controller.busy,true);
  for(const percent of [21,23,27])controller.setLoupeEnhancement({mode:'contrast',percent,channel:true});release();await settle();await h.flush();assert.equal(h.preparations.length,2);assert.equal(h.preparations[1].effects.enhance.percent,27);assert.equal(h.calls.length,0);assert.equal(controller.busy,false);
 }finally{release();await h.dispose();}
});
test('Cloud rotation, zoom, axes and kind reuse points; data wheel bypasses image navigation',async()=>{
 const h=environment();try{
  const {controller,root}=h.mount('colors.plots');h.adopt(controller);await h.flush();h.draw();assert.deepEqual(h.calls.map(x=>x.operation),['colors.plots','readTable']);
  for(const [key,value]of [['kind','"3d"'],['x','0'],['alpha','.5']]){const input=root.getElementById('tool-param-'+key);input.value=value;input.onchange();}
  const canvas=root.querySelector('.scatter-canvas'),event=(type,values)=>{const e=new h.window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,values);canvas.dispatchEvent(e);return e;};
  event('pointerdown',{button:0,pointerId:1,clientX:10,clientY:10});event('pointermove',{pointerId:1,clientX:70,clientY:40});event('pointerup',{pointerId:1});event('wheel',{deltaY:100});h.draw();await h.flush();assert.equal(h.calls.length,2);
  const scroll=new h.window.Event('wheel',{bubbles:true,cancelable:true});Object.assign(scroll,{deltaY:30,deltaX:0});root.querySelector('.plot-data').dispatchEvent(scroll);assert.equal(scroll.defaultPrevented,false);
  assert.equal(root.querySelector('.plot-data').parentElement,root.getElementById('tool-results'));
  root.getElementById('tool-param-scale').value='2';root.getElementById('tool-param-scale').onchange();await h.flush();assert.deepEqual(h.calls.map(x=>x.operation),['colors.plots','readTable','colors.plots','readTable']);
 }finally{await h.dispose();}
});
test('Plot presentation memory is bounded, samples span pages, cancellation publishes nothing',async()=>{
 const read=async(table,offset,length)=>{const n=Math.min(length,table.rowCount-offset);return {length:n,data:Float32Array.from({length:n*6},(_,i)=>offset+Math.floor(i/6))};};
 const points=await readPlotPoints({rowCount:200000},read,{maxPoints:10000});assert.equal(points.count,10000);assert.equal(points.values.byteLength,240000);assert.equal(points.values.at(-1),199980);
 let valid=true;assert.equal(await readPlotPoints({rowCount:10},async(...a)=>{valid=false;return read(...a);},{valid:()=>valid}),null);
});
function target(){const handlers={};return{style:{setProperty(k,v){this[k]=v;}},getBoundingClientRect:()=>({width:500,height:350,left:10,top:10,right:510,bottom:360}),addEventListener:(k,fn)=>handlers[k]=fn,focus(){},setPointerCapture(){},emit(k,values={}){handlers[k]?.({preventDefault(){},stopPropagation(){},...values});}};}
test('3D drag changes both angles; shift drag pans, wheel zooms and release ends motion',()=>{
 const canvas=target(),camera={yaw:0,pitch:0,zoom:1,x:0,y:0};let draws=0;
 bindPlotCamera(canvas,{camera,style:()=>({kind:'3d'}),changed:()=>draws++,reset(){}});
 canvas.emit('pointerdown',{button:0,pointerId:1,clientX:10,clientY:20});canvas.emit('pointermove',{pointerId:1,clientX:40,clientY:60});assert.notEqual(camera.yaw,0);assert.notEqual(camera.pitch,0);canvas.emit('pointerup',{pointerId:1});const before={...camera};canvas.emit('pointermove',{pointerId:1,clientX:100,clientY:100});assert.deepEqual(camera,before);
 canvas.emit('pointerdown',{button:0,shiftKey:true,pointerId:2,clientX:10,clientY:20});canvas.emit('pointermove',{pointerId:2,clientX:40,clientY:60});assert.equal(camera.yaw,before.yaw);assert.equal(camera.x,30);canvas.emit('wheel',{deltaY:-50});assert.ok(camera.zoom>1);assert.equal(draws,3);
});
test('Both cascade and tile resize their own geometry; tabs ignore handles',()=>{
 for(const mode of ['cascade','tile','tabs']){const handle=target(),element=target();let changes=0;bindDocumentResize(handle,element,{layout:()=>mode,desk:()=>({getBoundingClientRect:()=>({width:1000,right:1000})}),changed:()=>changes++});handle.emit('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100});handle.emit('pointermove',{clientX:200,clientY:180});handle.emit('pointerup');assert.equal(changes,mode==='tabs'?0:1);if(mode!=='tabs'){assert.equal(element.style[mode==='tile'?'--tile-width':'--window-width'],'600px');assert.equal(element.style[mode==='tile'?'--tile-height':'--window-height'],'430px');}}
});

test('Clone controls default to visible horizontal biomes, constrain reflections and translate without resetting',async()=>{
 const h=environment();try{
  const {controller,root}=h.mount('tampering.copyMove.sparse'),$=id=>root.getElementById(id),change=(key,value)=>{const c=$('tool-param-'+key);c[c.type==='checkbox'?'checked':'value']=value;c.onchange();};
  assert.equal($('sparse-view-circles').checked,false);assert.equal($('sparse-view-lines').checked,false);assert.equal($('sparse-view-areas').checked,true);assert.equal(root.querySelector('.sparse-filters').closest('details'),null);
  change('algorithm',JSON.stringify('SIFT + G2NN + RANSAC'));assert.equal($('tool-param-reflections').disabled,true);change('algorithm',JSON.stringify('SIFT + G2NN + RANSAC + Panels + Text'));assert.equal($('tool-param-reflections').disabled,false);change('reflections',true);change('algorithm',JSON.stringify('ORB'));assert.equal($('tool-param-reflections').checked,false);assert.equal($('tool-param-reflections').disabled,true);assert.equal($('tool-param-independent').disabled,true);
  change('autoRadius',true);for(const key of ['autoRadius','compact','independent'])assert.ok($('tool-param-'+key).title.length>80);
  const originalSettings=controller.settings().individual;controller.setLanguage('en');assert.match($('tool-param-autoRadius').title,/diagonal/);assert.equal($('task-run').textContent,'Calculate');assert.deepEqual(controller.settings().individual,originalSettings);
  controller.setHighlight(true);assert.equal($('app').classList.contains('highlight-new-features'),true);assert.equal([...$('tool-param-algorithm').options].find(o=>o.value===JSON.stringify('SIFT + G2NN + RANSAC')).dataset.newFeature,'green');assert.equal([...$('tool-param-algorithm').options].find(o=>o.value==='"ALIKED"').dataset.newFeature,'red');
  $('sparse-view-lines').checked=true;$('sparse-view-lines').onchange();assert.equal($('sparse-biomes-only').getAttribute('aria-pressed'),'false');$('sparse-biomes-only').onclick();assert.equal($('sparse-view-lines').checked,false);assert.equal($('sparse-biomes-only').getAttribute('aria-pressed'),'true');assert.equal(h.calls.length,0);
 }finally{await h.dispose();}
});
test('Draw, finish, escape and automatic regions never start clone analysis; Calculate consumes the regions',async()=>{
 let found={regions:[{id:'a',bounds:[10,10,40,40]},{id:'b',bounds:[70,10,100,40]}]},failure=false;
 const h=environment({detect:()=>{if(failure)throw Object.assign(Error('detector memory limit'),{code:'MEMORY_LIMIT'});return found;}});try{
  const {controller,root}=h.mount('tampering.copyMove.sparse'),$=id=>root.getElementById(id);h.adopt(controller);
  $('task-zones').onclick();assert.equal($('viewport').classList.contains('drawing'),true);await h.flush();assert.equal(h.calls.length,0);$('task-zones').onclick();await h.flush();assert.equal(h.calls.length,0);
  await $('task-auto-zones').onclick();assert.deepEqual(h.calls.map(c=>c.operation),['subimages.detect']);assert.equal($('zones').children.length,3);assert.equal($('task-zones').getAttribute('aria-pressed'),'true');await h.flush();assert.equal(h.calls.length,1);
  await $('task-run').onclick();assert.equal(h.calls.at(-1).operation,'tampering.copyMove.dense');assert.equal(h.calls.at(-1).params.regions.length,3);assert.equal(h.calls.at(-1).view.lines,false);assert.equal($('viewport').classList.contains('drawing'),false);assert.equal($('task-run').disabled,false);
  const zoneMarkup=$('zones').innerHTML;found={regions:[]};await $('task-auto-zones').onclick();assert.equal($('zones').innerHTML,zoneMarkup);assert.match(controller.snapshot().status,/précédentes sont conservées/);failure=true;await $('task-auto-zones').onclick();assert.equal($('zones').innerHTML,zoneMarkup);assert.match(controller.snapshot().status,/mémoire/);
  $('task-zones').onclick();$('viewport').onkeydown({target:$('canvas'),key:'Escape'});await h.flush();assert.equal($('viewport').classList.contains('drawing'),false);assert.equal(h.calls.filter(c=>c.operation==='tampering.copyMove.dense').length,1);
 }finally{await h.dispose();}
});

test('All native clone choices route with their own parameters and dense controls',async()=>{
 const h=environment();try{const {root,controller}=h.mount('tampering.copyMove.sparse'),$=id=>root.getElementById(id);h.adopt(controller);
  const choices=[...$('tool-param-algorithm').options].map(o=>JSON.parse(o.value));assert.equal(choices.length,20);assert.equal(choices[5],'PatchMatch Zernike');assert.equal(choices[6],'PatchMatch SIFT');
  for(const algorithm of choices){$('tool-param-algorithm').value=JSON.stringify(algorithm);$('tool-param-algorithm').onchange();await $('task-run').onclick();const task=h.calls.at(-1),dense=algorithm.includes('PatchMatch');assert.equal(task.operation,dense?'tampering.copyMove.dense':'tampering.copyMove.sparse',algorithm);assert.equal(task.params[dense?'profile':'algorithm'],algorithm);assert.equal($('tool-param-patch').disabled,!dense);if(dense){assert.equal(task.params.iterations,8);assert.equal(task.params.texture,2);assert.equal(task.params.flip,algorithm.endsWith(' + Mirror')||$('tool-param-reflections').checked);}if(algorithm.endsWith(' + Mirror')){assert.equal($('tool-param-reflections').disabled,true);assert.equal(task.params.flip,true);}}
 }finally{await h.dispose();}
});
test('A successful subsequent run preserves the failure diagnostic, method and native cause',async()=>{
 let failed=true;const h=environment({fail:()=>failed?Object.assign(Error('Feature extraction memory allocation failed'),{code:'MEMORY_ALLOCATION',details:{allocationKind:'wasm',maximumHeapBytes:67108864,nativeStatus:-4}}):null});try{
  h.window.HTMLElement.prototype.showModal=function(){this.open=true;};h.window.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.window.Event('close'));};
  const {controller,root}=h.mount('tampering.copyMove.sparse'),$=id=>root.getElementById(id);h.adopt(controller);$('tool-param-algorithm').value='"SIFT"';$('tool-param-algorithm').onchange();await $('task-run').onclick();assert.equal($('task-errors').hidden,false);assert.equal($('task-errors').textContent,'Diagnostic (1)');
  failed=false;await $('task-run').onclick();assert.equal($('task-errors').textContent,'Diagnostic (1)');$('task-errors').onclick();const dialog=root.querySelector('dialog.error-diagnostic'),report=JSON.parse(dialog.querySelector('pre').textContent);assert.equal(report.errors[0].context.algorithm,'SIFT');assert.equal(report.errors[0].error.details.nativeStatus,-4);assert.equal(report.errors[0].context.width,640);assert.match(report.errors[0].error.stack,/Feature extraction/);dialog.close();assert.equal(!!root.querySelector('dialog.error-diagnostic'),false);
 }finally{await h.dispose();}
});
