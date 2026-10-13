// Controller/DOM contracts only. No browser, image decode or scientific run.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {mountAnalysisPanel} from '../sherloq-browser/assets/app.js';
import {toolCatalog} from '../sherloq-browser/assets/tool-catalog.js';
import {CLONE_ALGORITHMS} from '../sherloq-browser/assets/clone-methods.js';
import {readPlotPoints,bindPlotCamera} from '../sherloq-browser/assets/scatter-view.js';
import {bindDocumentResize} from '../sherloq-browser/assets/document-resize.js';
import {loupeDefaults} from '../sherloq-browser/assets/media-settings.js';
const html=await readFile(new URL('../sherloq-browser/assets/panel.html',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(setImmediate);};
function environment({detect=()=>({regions:[]}),fail=()=>null,runGate=async()=>{},exportGate=async()=>{},segmentation={},rasterResult=null}={}){
 const {document,window}=parseHTML('<html><body></body></html>'),timers=new Map(),frames=new Map(),panels=[],calls=[],preparations=[],progressEvents=[],loadedModels=[],engineConfigurations=[],jsonExports=[];let seq=0,progressCallback,progressObserver=()=>{};
 const progress=(hooks,event)=>{progressCallback=hooks?.onProgress;progressEvents.push(event);progressCallback?.(event);progressObserver(event);};
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
 for(const [key,value]of Object.entries({document,window,location:{href:'http://localhost/app.html',hash:''},localStorage:{getItem:()=>null,setItem(){}},navigator:{hardwareConcurrency:8},isSecureContext:true,devicePixelRatio:1,innerWidth:1280,matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>(frames.set(++seq,fn),seq),cancelAnimationFrame:id=>frames.delete(id),setTimeout:fn=>(timers.set(++seq,fn),seq),clearTimeout:id=>timers.delete(id),ResizeObserver:class{observe(){}disconnect(){}},Worker:PreparationWorker,fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0),json:async()=>({assetBase:'./',engineVersion:'test-transport',segmentation})}),Option:class{constructor(text,value){const e=document.createElement('option');e.textContent=text;e.value=value;return e;}}}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(v){for(const o of this.options)o.toggleAttribute('selected',o.value===String(v));}});
 for(const [name,value]of Object.entries({clientWidth:800,clientHeight:600}))Object.defineProperty(window.HTMLElement.prototype,name,{configurable:true,get:()=>value});
 window.HTMLElement.prototype.reportValidity=()=>true;window.HTMLElement.prototype.setPointerCapture=()=>{};window.HTMLElement.prototype.click=()=>{};
 window.HTMLCanvasElement.prototype.getContext=type=>type==='webgl2'?null:canvasContext();
 const table={id:'points',revision:1,format:'float32-table',columns:['R','G','B','H','S','V'],rowCount:3};
 const engineFactory=config=>{engineConfigurations.push(config);let configuredVariant=null;return {
  loadM3Models:async()=>{},
  loadSegmentationModel:async config=>{loadedModels.push(config);configuredVariant=config.variant;},unloadSegmentationModel:async()=>{configuredVariant=null;},loadD2prlModel:async()=>{},
  async loadBlob({id},hooks){progress(hooks,{phase:'decode',fraction:.5});return {id,sha256:'input',surface:{id:'source',revision:1,width:640,height:480,format:'rgb8'}};},
  async run(task,hooks){calls.push(task);progress(hooks,{phase:'analysis',fraction:.5,completed:5,total:10});await runGate(task);const failure=fail(task);if(failure)throw failure;if(task.operation==='subimages.detect')return {data:await detect()};return {id:task.id,operation:task.operation,status:'ok',provenance:{params:task.params},data:task.operation==='colors.plots'?{style:task.params,count:3,scale:1}:{answer:42},...(task.operation==='colors.plots'?{surface:table}:rasterResult?{surface:rasterResult(task)}:{})};},
  async readTable(input,hooks){calls.push({operation:'readTable'});progress(hooks,{phase:'read-table',fraction:.75});return {length:3,data:Float32Array.from({length:18},(_,i)=>i/18)};},
  async exportResultFile(result,options,hooks){jsonExports.push(result);progress(hooks,{phase:'encode-json',fraction:.25});await exportGate();progress(hooks,{phase:'complete',fraction:1});return {id:'export',revision:1,byteLength:2};},
  async readExport(input,hooks){progress(hooks,{phase:'read-export',fraction:1});return {bytes:Uint8Array.of(123,125)};},
  releaseExport:async()=>{},releaseTable:async()=>{},releaseSurface:async()=>{},unload:async()=>{},dispose:async()=>{},capabilities:async()=>({operations:[{id:'ai.clones.segmentation',configuredVariant}]})
 };};
 function mount(id,sourceOnly=false){
  const host=document.createElement('div');document.body.append(host);const root=host.attachShadow({mode:'open'}),parsed=parseHTML(html).document;for(const child of [...parsed.body.children])root.append(document.importNode(child,true));
  const scope={getElementById:id=>root.getElementById(id),querySelectorAll:s=>root.querySelectorAll(s),createElement:t=>document.createElement(t),documentElement:host,addEventListener:(...a)=>root.addEventListener(...a)};
  const controller=mountAnalysisPanel(scope,{managed:true,toolId:id,sourceOnly,visible:()=>false,engineFactory,language:'fr'});panels.push(controller);return {controller,root};
 }
 return {mount,calls,preparations,loadedModels,engineConfigurations,jsonExports,window,progressEvents,get progressCallback(){return progressCallback;},observeProgress:fn=>progressObserver=fn,emitProgress:event=>progressCallback?.(event),adopt(controller){controller.adopt({source:{width:640,height:480,draw(){},close(){},async readPixels({width,height}){return{width,height,data:new Uint8Array(width*height*3)};}},file:new Blob(['transport']),imageId:'shared',hash:'hash',description:'transport'});},async flush(){const batch=[...timers.values()];timers.clear();for(const fn of batch)fn();await settle();},draw(){const batch=[...frames.values()];frames.clear();for(const fn of batch)fn();},async dispose(){await Promise.all(panels.map(c=>c.dispose()));}};
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
  controller.setHighlight(true);assert.equal($('app').classList.contains('highlight-new-features'),true);assert.equal([...$('tool-param-algorithm').options].find(o=>o.value===JSON.stringify('SIFT + G2NN + RANSAC')).dataset.newFeature,'green');assert.equal([...$('tool-param-algorithm').options].find(o=>o.value==='"ALIKED"').dataset.newFeature,'yellow');
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
  const choices=[...$('tool-param-algorithm').options].map(o=>JSON.parse(o.value));assert.equal(choices.length,22);assert.deepEqual(new Set(choices),new Set(CLONE_ALGORITHMS));
  for(const algorithm of choices){$('tool-param-algorithm').value=JSON.stringify(algorithm);$('tool-param-algorithm').onchange();await $('task-run').onclick();const task=h.calls.at(-1),dense=algorithm.includes('PatchMatch');assert.equal(task.operation,dense?'tampering.copyMove.dense':'tampering.copyMove.sparse',algorithm);assert.equal(task.params[dense?'profile':'algorithm'],algorithm);assert.equal($('tool-param-patch').disabled,!dense);if(dense){assert.equal(task.params.iterations,8);assert.equal(task.params.texture,2);assert.equal(task.params.flip,algorithm.endsWith(' + Mirror')||$('tool-param-reflections').checked);}if(algorithm.endsWith(' + Mirror')){assert.equal($('tool-param-reflections').disabled,true);assert.equal(task.params.flip,true);}}
 }finally{await h.dispose();}
});
test('AI subimage action selects only native panels, waits for Calculate, and preserves MGCFDN selection provenance',async()=>{
 let found={coordinates:'original-pixel-centres',boundsConvention:'half-open',regions:[{id:'p1',bounds:[13,21,59,83]},{id:'p2',bounds:[133,23,207,85]}]},failure=false;
 const h=environment({segmentation:{mgcfdn:{model:{identity:'native-model-test'}}},detect:()=>{if(failure)throw Object.assign(Error('detector memory limit'),{code:'MEMORY_LIMIT'});return found;}});
 try{
  const {controller,root}=h.mount('ai.clones.d2prl'),$=id=>root.getElementById(id);h.adopt(controller);
  const method=$('tool-neural-method');method.value='mgcfdn';method.onchange();
  const backend=$('tool-backend');backend.value='webgpu';backend.onchange();
  assert.ok($('task-auto-zones'));assert.equal($('task-auto-zones').hidden,false);assert.match($('task-auto-zones').title,/sans comparaison entre panneaux/);
  await $('task-auto-zones').onclick();await h.flush();
  assert.deepEqual(h.calls.map(c=>c.operation),['subimages.detect']);assert.equal(h.loadedModels.length,0);
  assert.equal($('tool-neural-scope').value,'regions');assert.equal($('zones').children.length,2);assert.doesNotMatch($('zones').textContent,/Enveloppe/);assert.equal($('show-zones').checked,true);assert.equal($('task-zones').getAttribute('aria-pressed'),'true');
  assert.equal(controller.settings().individual.uiOptions.neuralMethod,'mgcfdn');assert.equal(controller.settings().individual.uiOptions.backend,'webgpu');
  await $('task-run').onclick();const task=h.calls.at(-1);
  assert.equal(task.operation,'ai.clones.segmentation');assert.deepEqual(task.params,{variant:'mgcfdn',selectionPresent:true});assert.equal(task.backend,'webgpu');
  assert.deepEqual(task.regions,[{id:'p1',kind:'region',bounds:[13,21,59,83]},{id:'p2',kind:'region',bounds:[133,23,207,85]}]);assert.equal(h.loadedModels.length,1);
  const meta=JSON.parse($('provenance').textContent);assert.equal(meta.ui.subimageSelection.operation,'subimages.detect');assert.deepEqual(meta.ui.requestedRegions,task.regions);assert.equal(meta.ui.subimageSelection.sourceSha256,'hash');assert.equal(meta.ui.selectionPresent,true);assert.equal($('export-report').disabled,false);
  let sessionBlob;const objectURL=URL.createObjectURL;URL.createObjectURL=blob=>(sessionBlob=blob,objectURL(blob));
  try{controller.saveSession();}finally{URL.createObjectURL=objectURL;}
  const saved=JSON.parse(await sessionBlob.text());assert.equal(saved.individual.uiOptions.neuralScope,'regions');assert.equal(saved.individual.uiOptions.neuralMethod,'mgcfdn');assert.equal(saved.regions.length,2);assert.deepEqual(saved.regions.map(r=>r.detection.bounds),task.regions.map(r=>r.bounds));assert.equal(saved.regions[0].detection.sourceSha256,'hash');
  const previous=$('zones').innerHTML;found={regions:[]};await $('task-auto-zones').onclick();assert.equal($('zones').innerHTML,previous);assert.equal($('tool-neural-scope').value,'regions');failure=true;await $('task-auto-zones').onclick();assert.equal($('zones').innerHTML,previous);assert.match(controller.snapshot().status,/mémoire/);
  const attempts=h.calls.length;method.value='forgeryscope-auto';method.onchange();assert.equal($('task-auto-zones').hidden,true);await $('task-auto-zones').onclick();assert.equal(h.calls.length,attempts);
  method.value='mgcfdn';method.onchange();assert.equal($('task-auto-zones').hidden,false);controller.setLanguage('en');assert.equal($('task-auto-zones').textContent,'Detect subimages');assert.match($('task-auto-zones').title,/without cross-panel comparison/);
 }finally{await h.dispose();}
});
test('AI adoption and method/backend/profile/ROI edits prepare tasks; only Calculate runs their exact parameters',async()=>{
 const h=environment({segmentation:{mgcfdn:{model:{identity:'native-mgcf-test'}},'selfdm-map':{model:{identity:'native-selfdm-test'}}},detect:()=>({regions:[{id:'left',bounds:[12,17,80,99]},{id:'right',bounds:[110,17,178,99]}]})});
 try{
  const {controller,root}=h.mount('ai.clones.d2prl'),$=id=>root.getElementById(id);h.adopt(controller);await h.flush();
  assert.equal($('tool-neural-method').value,'d2prl');assert.equal(controller.busy,false);assert.equal($('task-run').disabled,false);assert.match(controller.snapshot().status,/puis cliquez sur Calculer/);assert.equal(h.calls.length,0);assert.equal(h.engineConfigurations.length,0);
  const method=$('tool-neural-method'),backend=$('tool-backend'),scope=$('tool-neural-scope');
  for(const name of ['mgcfdn','selfdm-map','d2prl','mgcfdn']){method.value=name;method.onchange();await h.flush();assert.equal(h.calls.length,0,name);assert.equal(h.loadedModels.length,0,name);}
  backend.value='webgpu';backend.onchange();await h.flush();assert.equal(h.calls.length,0);
  $('compute-profile').value='aggressive';$('compute-profile').onchange();await h.flush();assert.equal(h.calls.length,0);assert.equal(h.engineConfigurations.length,0);
  await $('task-auto-zones').onclick();await h.flush();assert.deepEqual(h.calls.map(t=>t.operation),['subimages.detect']);assert.equal(h.loadedModels.length,0);assert.equal(scope.value,'regions');
  $('task-zones').onclick();await h.flush();assert.equal(h.calls.length,1,'Finishing drawing does not calculate.');
  scope.value='whole';scope.onchange();await h.flush();scope.value='regions';scope.onchange();await h.flush();assert.equal(h.calls.length,1);
  await $('task-run').onclick();const mgcf=h.calls.at(-1);assert.equal(mgcf.operation,'ai.clones.segmentation');assert.deepEqual(mgcf.params,{variant:'mgcfdn',selectionPresent:true});assert.equal(mgcf.backend,'webgpu');assert.deepEqual(mgcf.regions.map(r=>r.bounds),[[12,17,80,99],[110,17,178,99]]);assert.equal(h.engineConfigurations.at(-1).computeProfile,'aggressive');assert.equal(h.loadedModels.length,1);
  method.value='selfdm-map';method.onchange();scope.value='whole';scope.onchange();await h.flush();assert.equal(h.calls.length,2,'Changing the completed method does not start inference.');
  await $('task-run').onclick();assert.equal(h.calls.at(-1).operation,'ai.clones.segmentation');assert.deepEqual(h.calls.at(-1).params,{variant:'selfdm-map',selectionPresent:false});assert.deepEqual(h.calls.at(-1).regions,[]);
  method.value='d2prl';method.onchange();const minimum=$('tool-param-minimum');minimum.value='750';minimum.onchange();scope.value='regions';scope.onchange();$('compute-profile').value='maximum';$('compute-profile').onchange();await h.flush();assert.equal(h.calls.length,3);
  await $('task-run').onclick();assert.equal(h.calls.at(-1).operation,'ai.clones.d2prl');assert.equal(h.calls.at(-1).params.minimum,750);assert.equal(h.calls.at(-1).params.selectionPresent,true);assert.equal(h.calls.at(-1).regions.length,2);assert.equal(h.calls.at(-1).backend,'webgpu');assert.equal(h.engineConfigurations.at(-1).computeProfile,'maximum');
 }finally{await h.dispose();}
});
test('A successful subsequent run preserves the failure diagnostic, method and native cause',async()=>{
 let failed=true;const h=environment({fail:()=>failed?Object.assign(Error('Feature extraction memory allocation failed'),{code:'MEMORY_ALLOCATION',details:{allocationKind:'wasm',maximumHeapBytes:67108864,nativeStatus:-4}}):null});try{
  h.window.HTMLElement.prototype.showModal=function(){this.open=true;};h.window.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.window.Event('close'));};
  const {controller,root}=h.mount('tampering.copyMove.sparse'),$=id=>root.getElementById(id);h.adopt(controller);$('tool-param-algorithm').value='"SIFT"';$('tool-param-algorithm').onchange();await $('task-run').onclick();assert.equal($('task-errors').hidden,false);assert.equal($('task-errors').textContent,'Diagnostic (1)');
  failed=false;await $('task-run').onclick();assert.equal($('task-errors').textContent,'Diagnostic (1)');$('task-errors').onclick();const dialog=root.querySelector('dialog.error-diagnostic'),report=JSON.parse(dialog.querySelector('pre').textContent);assert.equal(report.errors[0].context.algorithm,'SIFT');assert.equal(report.errors[0].error.details.nativeStatus,-4);assert.equal(report.errors[0].context.width,640);assert.match(report.errors[0].error.stack,/Feature extraction/);dialog.close();assert.equal(!!root.querySelector('dialog.error-diagnostic'),false);
 }finally{await h.dispose();}
});

test('Individual calculation progress ends before JSON export progress and late completion messages',async()=>{
 let finishRun,finishExport;const runGate=new Promise(resolve=>finishRun=resolve),exportGate=new Promise(resolve=>finishExport=resolve),h=environment({runGate:()=>runGate,exportGate:()=>exportGate});
 try{
  const {controller,root}=h.mount('inspection.adjust'),progress=root.getElementById('progress');h.adopt(controller);await h.flush();
  assert.equal(controller.busy,true);assert.match(controller.snapshot().status,/analysis.*5\/10/);assert.equal(Number(progress.value),.5);
  finishRun();await settle();const completed=controller.snapshot().status;assert.match(completed,/terminé/);assert.equal(controller.busy,false);assert.equal(Number(progress.value),1);
  const exporting=[...root.querySelectorAll('.tool-exports button')].find(button=>button.textContent==='JSON').onclick();await settle();
  assert.equal(controller.busy,true,'Generic export activity still locks controls');assert.equal(controller.snapshot().status,completed);assert.equal(Number(progress.value),1);
  finishExport();await exporting;assert.equal(controller.busy,false);assert.equal(controller.snapshot().status,completed);assert.equal(Number(progress.value),1);
  assert.deepEqual(h.progressEvents.slice(-3).map(event=>event.phase),['encode-json','complete','read-export'],'The shared transport still receives every export event');
  h.emitProgress({phase:'encode-json/complete',fraction:.2});assert.equal(controller.snapshot().status,completed);assert.equal(Number(progress.value),1);assert.equal(h.calls.length,1,'Export does not start another calculation');
 }finally{finishRun();finishExport();await h.dispose();}
});
test('Plot table reads during result presentation do not become calculation progress',async()=>{
 const h=environment(),seen=[];try{
  const {controller,root}=h.mount('colors.plots');h.observeProgress(event=>seen.push({phase:event.phase,status:controller.snapshot().status,progress:Number(root.getElementById('progress').value)}));h.adopt(controller);await h.flush();
  const reading=seen.find(event=>event.phase==='read-table');assert.ok(reading);assert.equal(reading.progress,.5);assert.doesNotMatch(reading.status,/read-table/);
  assert.match(controller.snapshot().status,/terminé/);assert.equal(Number(root.getElementById('progress').value),1);assert.deepEqual(h.calls.map(call=>call.operation),['colors.plots','readTable']);
 }finally{await h.dispose();}
});
test('A failed calculation and an invalid form cannot leave a live progress display owner',async()=>{
 let fail=true;const h=environment({fail:()=>fail?Object.assign(Error('Allocation refused'),{code:'MEMORY_LIMIT'}):null});try{
  const {controller,root}=h.mount('inspection.adjust');h.adopt(controller);await h.flush();const failed=controller.snapshot().status;
  assert.match(failed,/Erreur/);assert.equal(controller.busy,false);h.emitProgress({phase:'late-complete',fraction:1});assert.equal(controller.snapshot().status,failed);
  fail=false;await root.getElementById('task-run').onclick();assert.match(controller.snapshot().status,/terminé/);
  const completed=controller.snapshot().status,calls=h.calls.length;root.getElementById('tool-form').reportValidity=()=>false;await root.getElementById('task-run').onclick();
  h.emitProgress({phase:'stale-after-validation',fraction:.1});assert.equal(controller.snapshot().status,completed);assert.equal(controller.busy,false);assert.equal(h.calls.length,calls);
 }finally{await h.dispose();}
});
test('Explicit subimage detection retains its own status while the shared client reports progress',async()=>{
 let finish;const gate=new Promise(resolve=>finish=resolve),h=environment({runGate:()=>gate}),seen=[];try{
  const {controller,root}=h.mount('tampering.copyMove.sparse');h.observeProgress(event=>seen.push({phase:event.phase,status:controller.snapshot().status}));h.adopt(controller);
  const detecting=root.getElementById('task-auto-zones').onclick();await settle();assert.equal(controller.busy,true);assert.match(controller.snapshot().status,/Détection des sous-images/);
  assert.ok(seen.some(event=>event.phase==='analysis'));assert.ok(seen.every(event=>!/Calcul en cours/.test(event.status)));
  finish();await detecting;assert.equal(controller.busy,false);assert.match(controller.snapshot().status,/Aucune sous-image/);
 }finally{finish();await h.dispose();}
});
test('A cancelled older computation cannot clear a new progress owner or overwrite its result',async()=>{
 let finishOld,finishNew,runs=0;const oldGate=new Promise(resolve=>finishOld=resolve),newGate=new Promise(resolve=>finishNew=resolve),h=environment({runGate:()=>++runs===1?oldGate:newGate});
 try{
  const {controller,root}=h.mount('inspection.adjust');h.adopt(controller);await h.flush();const oldProgress=h.progressCallback;
  root.getElementById('cancel').onclick();const cancelled=controller.snapshot().status;oldProgress({phase:'stale-after-cancel',fraction:.8});assert.equal(controller.snapshot().status,cancelled);
  const next=root.getElementById('task-run').onclick();finishOld();await settle();assert.equal(controller.busy,true);assert.equal(runs,2);assert.match(controller.snapshot().status,/analysis.*5\/10/);
  const active=controller.snapshot().status;oldProgress({phase:'stale-during-next-run',fraction:1});assert.equal(controller.snapshot().status,active);
  finishNew();await next;assert.equal(controller.busy,false);assert.match(controller.snapshot().status,/terminé/);assert.equal(Number(root.getElementById('progress').value),1);
 }finally{finishOld();finishNew();await h.dispose();}
});

test('calculated Dense result survives automatic panels and tracing with explicit Original/last-result labels and no new analysis',async()=>{
 let failure=false;const surface={id:'dense-saved',revision:1,width:640,height:480,format:'rgb8'};
 const h=environment({rasterResult:()=>surface,detect:()=>({regions:[{id:'a',bounds:[10,10,40,40]},{id:'b',bounds:[70,10,100,40]}]}),fail:task=>failure&&task.operation==='tampering.copyMove.dense'?Object.assign(Error('dense failed'),{code:'INTERNAL'}):null});
 try{
  const {controller,root}=h.mount('tampering.copyMove.sparse'),$=id=>root.getElementById(id);h.adopt(controller);await $('task-run').onclick();
  const layer=$('tool-layer'),saved=layer.value,context=$('tool-presentation-context');assert.equal(controller.snapshot().hasResult,true);assert.equal(layer.hidden,false);assert.equal(context.hidden,false);assert.equal(context.textContent,'Dernier résultat calculé');assert.equal(h.calls.filter(c=>c.operation==='tampering.copyMove.dense').length,1);
  await $('task-auto-zones').onclick();assert.equal($('viewport').classList.contains('drawing'),true);assert.equal($('layer').value,'source');assert.equal(layer.hidden,true);assert.equal(context.textContent,'Image originale · résultat calculé conservé');assert.equal(controller.snapshot().hasResult,true);
  $('task-zones').onclick();await h.flush();assert.equal($('viewport').classList.contains('drawing'),false);assert.equal($('layer').value,'result');assert.equal(layer.hidden,false);assert.equal(layer.value,saved);assert.equal(context.textContent,'Dernier résultat calculé');assert.equal(controller.snapshot().hasResult,true);assert.equal(h.calls.filter(c=>c.operation==='tampering.copyMove.dense').length,1);assert.equal(h.calls.filter(c=>c.operation==='subimages.detect').length,1);
  $('layer').value='source';$('layer').onchange();assert.equal(layer.hidden,true);assert.equal(context.textContent,'Image originale · résultat calculé conservé');$('layer').value='result';$('layer').onchange();assert.equal(layer.hidden,false);controller.setCompareOriginal(true);assert.equal(layer.hidden,true);assert.equal(context.textContent,'Image originale · résultat calculé conservé');controller.setCompareOriginal(false);assert.equal(layer.hidden,false);controller.setLanguage('en');assert.equal(context.textContent,'Last calculated result');controller.setLanguage('fr');
  failure=true;await $('task-run').onclick();assert.equal(controller.snapshot().hasResult,false);assert.equal(layer.hidden,true);assert.equal(context.hidden,true);$('task-zones').onclick();$('task-zones').onclick();await h.flush();assert.equal($('layer').value,'source');assert.equal(controller.snapshot().hasResult,false);assert.equal(context.hidden,true);assert.equal(h.calls.filter(c=>c.operation==='tampering.copyMove.dense').length,2);
 }finally{await h.dispose();}
});

for(const method of ['dense','mgcfdn'])test('actual panel JSON button names the retained '+method+' operation and leaves native export payload intact',async()=>{
 const h=environment({segmentation:{mgcfdn:{model:{identity:'native-model-test'}}}}),names=[];
 h.window.HTMLElement.prototype.click=function(){if(this.tagName==='A')names.push(this.download);};
 try{
  const id=method==='dense'?'tampering.copyMove.sparse':'ai.clones.d2prl',{controller,root}=h.mount(id),$=name=>root.getElementById(name);h.adopt(controller);
  if(method==='mgcfdn'){$('tool-neural-method').value='mgcfdn';$('tool-neural-method').onchange();}
  await $('task-run').onclick();const submitted=structuredClone(h.calls[0]);await [...root.querySelectorAll('.tool-exports button')].find(button=>button.textContent==='JSON').onclick();
  const operation=method==='dense'?'tampering.copyMove.dense':'ai.clones.segmentation',suffix=method==='dense'?'PatchMatch-Zernike':'mgcfdn';assert.equal(names[0],'SHERLOQ-'+operation+'-'+suffix+'.json');assert.equal(h.jsonExports.length,1);assert.equal(h.jsonExports[0].operation,operation);assert.deepEqual(h.jsonExports[0].provenance.params,submitted.params);assert.deepEqual(h.jsonExports[0].data,{answer:42});assert.equal(h.calls.length,1,'JSON export does not run another detector');
 }finally{await h.dispose();}
});
