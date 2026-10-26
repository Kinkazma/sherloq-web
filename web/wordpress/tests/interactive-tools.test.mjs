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
import {createIndividualRegionController} from '../sherloq-browser/assets/individual-region-controller.js';
import {createIndividualScientificScope} from '../sherloq-browser/assets/individual-scientific-scope.js';
import {SCIENTIFIC_TEXT_MODEL} from '../sherloq-browser/assets/scientific-text-detector.js';
import {createManualScopeDraft,updateManualScopeZone,applyManualScopeDraft} from '../sherloq-browser/assets/batch-scope-manual.js';
import {getDocumentDownloadShelf} from '../sherloq-browser/assets/download-shelf.js';
const html=await readFile(new URL(import.meta.resolve('../sherloq-browser/assets/panel.html')),'utf8');
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(setImmediate);};
// Transport fixtures isolate mounted UI/controller behavior. Shared-owner
// tests below use the production owner and scientific-scope compiler; injected
// editor/model transports are explicit and never presented as native inference.
function environment({detect=()=>({regions:[]}),fail=()=>null,runGate=async()=>{},exportGate=async()=>{},segmentation={},rasterResult=null,m2Fixture=false,regionControllerFactory=options=>createIndividualRegionController({...options,canEditScope:()=>false,operation:()=> 'inspection.adjust'}),sourceSha256=null,nativeCloneData=false}={}){
 const {document,window}=parseHTML('<html><body></body></html>'),timers=new Map(),frames=new Map(),panels=[],calls=[],preparations=[],progressEvents=[],loadedModels=[],engineConfigurations=[],jsonExports=[];let seq=0,progressCallback,progressObserver=()=>{};
 const progress=(hooks,event)=>{progressCallback=hooks?.onProgress;progressEvents.push(event);progressCallback?.(event);progressObserver(event);};
 const canvasContext=()=>new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]??(()=>{})});
 class PreparationWorker {
  cancelled=new Set();
  async postMessage(message){
   if(m2Fixture&&message.operation){
    const metadata=new TextEncoder().encode(JSON.stringify({metadata:{status:'empty'},provenance:{params:message.args?.params}}));let value={};
    if(message.operation==='initialize')value={windowBytes:4*1024**2};
    if(message.operation==='analyzeBlob'){calls.push({operation:'m2.'+message.args.method,params:structuredClone(message.args.params),backend:message.args.backend});this.metadata=metadata;value={id:1,width:640,height:480,fields:{},metadataBytes:metadata.length};}
    if(message.operation==='readMetadata')value=this.metadata.slice(message.args.offset,message.args.offset+message.args.count);
    this.onmessage?.({data:{id:message.id,value}});return;
   }
   if(message.action==='build'){preparations.push(message);await runGate(message);if(this.disposed||this.cancelled.has(message.ticket)){this.onmessage?.({data:{ticket:message.ticket,error:{code:'CANCELLED',message:'Cancelled'}}});return;}this.onmessage?.({data:{ticket:message.ticket,resultId:message.ticket,preview:{width:3,height:2,data:new Uint8Array(18)},metrics:{}}});}
   if(message.action==='release'){this.onmessage?.({data:{ticket:message.ticket,released:true}});return;}
   if(message.action==='cancel')this.cancelled.add(message.ticket);
   if(message.action==='dispose'){this.disposed=true;this.onmessage?.({data:{action:'disposed'}});}
  }
  terminate(){}
 }
 for(const [key,value]of Object.entries({document,window,location:{href:'http://localhost/app.html',hash:''},localStorage:{getItem:()=>null,setItem(){}},navigator:{hardwareConcurrency:8},isSecureContext:true,devicePixelRatio:1,innerWidth:1280,matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>(frames.set(++seq,fn),seq),cancelAnimationFrame:id=>frames.delete(id),setTimeout:fn=>(timers.set(++seq,fn),seq),clearTimeout:id=>timers.delete(id),ResizeObserver:class{observe(){}disconnect(){}},Worker:PreparationWorker,fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0),json:async()=>({assetBase:'./',engineVersion:'test-transport',segmentation,...(m2Fixture?{providers:{},assets:{}}:{})})}),Option:class{constructor(text,value){const e=document.createElement('option');e.textContent=text;e.value=value;return e;}}}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(v){for(const o of this.options)o.toggleAttribute('selected',o.value===String(v));}});
 for(const [name,value]of Object.entries({clientWidth:800,clientHeight:600}))Object.defineProperty(window.HTMLElement.prototype,name,{configurable:true,get:()=>value});
 window.HTMLElement.prototype.checkValidity=()=>true;window.HTMLElement.prototype.reportValidity=()=>true;window.HTMLElement.prototype.setPointerCapture=()=>{};window.HTMLElement.prototype.click=()=>{};
 window.HTMLCanvasElement.prototype.getContext=type=>type==='webgl2'?null:canvasContext();
 const table={id:'points',revision:1,format:'float32-table',columns:['R','G','B','H','S','V'],rowCount:3};
 const engineFactory=config=>{engineConfigurations.push(config);let configuredVariant=null;return {
  loadM3Models:async()=>{},
  loadSegmentationModel:async config=>{loadedModels.push(config);configuredVariant=config.variant;},unloadSegmentationModel:async()=>{configuredVariant=null;},loadD2prlModel:async()=>{},
  async loadBlob({id},hooks){progress(hooks,{phase:'decode',fraction:.5});return {id,sha256:sourceSha256??'input',surface:{id:'source',revision:1,width:640,height:480,format:'rgb8'}};},
  async run(task,hooks){calls.push(task);progress(hooks,{phase:'analysis',fraction:.5,completed:5,total:10});await runGate(task);const failure=fail(task);if(failure)throw failure;if(task.operation==='subimages.detect')return {data:await detect()};return {id:task.id,operation:task.operation,status:'ok',provenance:{params:task.params},data:task.operation==='colors.plots'?{style:task.params,count:3,scale:1}:nativeCloneData?{groups:[],points:new Float64Array(),pairs:new Float64Array(),bases:[],params:task.params}:{answer:42},...(nativeCloneData?{selectedGroups:[]}:{}) ,...(task.operation==='colors.plots'?{surface:table}:rasterResult?{surface:rasterResult(task)}:{})};},
  async readTable(input,hooks){calls.push({operation:'readTable'});progress(hooks,{phase:'read-table',fraction:.75});return {length:3,data:Float32Array.from({length:18},(_,i)=>i/18)};},
  async exportResultFile(result,options,hooks){jsonExports.push(result);progress(hooks,{phase:'encode-json',fraction:.25});await exportGate();progress(hooks,{phase:'complete',fraction:1});return {id:'export',revision:1,byteLength:2};},
  async readExport(input,hooks){progress(hooks,{phase:'read-export',fraction:1});return {bytes:Uint8Array.of(123,125)};},
  releaseExport:async()=>{},releaseTable:async()=>{},releaseSurface:async()=>{},unload:async()=>{},dispose:async()=>{},capabilities:async()=>({operations:[{id:'ai.clones.segmentation',configuredVariant}],...(m2Fixture?{memory:{budgetBytes:1024**3,retainedBytes:0,cacheBytes:0,knownHeapCapacityBytes:0}}:{})})
 };};
 const shelf=getDocumentDownloadShelf(document);
 function mount(id,sourceOnly=false){
  const host=document.createElement('div');document.body.append(host);const root=host.attachShadow({mode:'open'}),parsed=parseHTML(html).document;for(const child of [...parsed.body.children])root.append(document.importNode(child,true));
  const scope={getElementById:id=>root.getElementById(id),querySelectorAll:s=>root.querySelectorAll(s),createElement:t=>document.createElement(t),documentElement:host,addEventListener:(...a)=>root.addEventListener(...a)};
  const controller=mountAnalysisPanel(scope,{managed:true,toolId:id,sourceOnly,visible:()=>false,engineFactory,language:'fr',regionControllerFactory,download:shelf.download});panels.push(controller);return {controller,root};
 }
 return {mount,calls,preparations,loadedModels,engineConfigurations,jsonExports,window,progressEvents,get progressCallback(){return progressCallback;},observeProgress:fn=>progressObserver=fn,emitProgress:event=>progressCallback?.(event),adopt(controller){controller.adopt({source:{width:640,height:480,draw(){},close(){},async readPixels({width,height}){return{width,height,data:new Uint8Array(width*height*3)};}},file:new Blob(['transport']),imageId:'shared',hash:sourceSha256??'hash',description:'transport'});},async flush(){const batch=[...timers.values()];timers.clear();for(const fn of batch)fn();await settle();},draw(){const batch=[...frames.values()];frames.clear();for(const fn of batch)fn();},async dispose(){await Promise.all(panels.map(c=>c.dispose()));await shelf.dispose();}};
}

// The shared editor itself is exercised with real pointer/undo/geometry handlers
// in batch-scope-editor.test.mjs. Here the injected modal boundary lets us prove
// mounted-panel ownership, immutable scope transport and explicit Calculate.
function sharedEnvironment(options={}){
 let owner;const configs=[],openings=[],sha='b'.repeat(64);
 const h=environment({...options,sourceSha256:sha,nativeCloneData:true,regionControllerFactory:opts=>(owner=createIndividualRegionController({...opts,scopeEditorFactory:config=>{configs.push(config);return{open:async value=>openings.push(value),dispose:async()=>{}};}}))});
 return{...h,sha,configs,openings,get owner(){return owner;},async scope(rectangles=[{x0:12,y0:17,x1:80,y1:99},{x0:110,y0:17,x1:178,y1:99}]){const scope=await createIndividualScientificScope({width:640,height:480,sourceSha256:sha},{rectangles,excludeTexts:false});await owner.restore({schema:'sherloq.individual-regions/1',sourceSha256:sha,scope,excludeTexts:false});return scope;}};
}
test('Every catalogue tool has compact shared controls and no provenance action; ELA has inline tabs',async()=>{
 const h=environment();try{
  for(const id of [...Object.keys(toolCatalog),'ela.classic','composite','analysis.complete','analysis.clones']){
   const {root,controller}=h.mount(id);assert.equal(root.querySelector('[data-i18n="provenance"]'),null,id);assert.equal(root.getElementById('panel-information'),null,id);
   if(toolCatalog[id])assert.ok(root.querySelector('#tool-controls>.tool-actions'),id);
   assert.ok(root.getElementById('task-run').classList.contains('primary'),id);assert.equal(root.getElementById('task-run').parentElement.className,'panel-actions',id);
   await controller.dispose();
  }
  const {root}=h.mount('ela.classic');assert.equal(root.getElementById('ela-tab-classic').getAttribute('aria-selected'),'true');root.getElementById('ela-tab-energy').onclick();assert.equal(root.getElementById('ela-mode').value,'scores');assert.equal(root.getElementById('classic-controls').hidden,true);assert.equal(root.getElementById('energy-score-controls').hidden,false);assert.equal(root.getElementById('ela-tab-energy').getAttribute('aria-selected'),'true');root.getElementById('ela-tab-biomes').onclick();assert.equal(root.getElementById('ela-mode').value,'biomes');assert.equal(root.getElementById('energy-score-controls').hidden,true);assert.equal(root.getElementById('energy-biome-controls').hidden,false);assert.equal(root.getElementById('ela-tab-biomes').getAttribute('aria-selected'),'true');
 }finally{await h.dispose();}
});
test('the mounted modern individual owner defaults to checked OCR and submits a bound scope without changing edited manual geometry',async()=>{
 const sha='a'.repeat(64),textPolygon=[[30,30],[45,30],[45,34],[30,34]],preparationCalls=[];let owner;
 const h=environment({sourceSha256:sha,nativeCloneData:true,regionControllerFactory:options=>{owner=createIndividualRegionController({...options,preparationClientFactory:async()=>({async prepare(blob,settings){preparationCalls.push({blob,settings});return {width:640,height:480,sourceSha256:sha,panels:null,text:{status:'complete',polygons:[textPolygon],detections:[{polygon:textPolygon,confidence:.9}],metadata:{model:{id:SCIENTIFIC_TEXT_MODEL.id,sha256:SCIENTIFIC_TEXT_MODEL.sha256,bytes:SCIENTIFIC_TEXT_MODEL.bytes},sourceSha256:sha,method:'text-detection-only',originalPixelsModified:false}},provenance:{originalSourceSha256:sha,originalPixelsModified:false}};},async dispose(){}})});return owner;}});
 try{
  const {controller,root}=h.mount('tampering.copyMove.sparse');h.adopt(controller);await h.flush();root.getElementById('tool-param-algorithm').value='"SIFT"';root.getElementById('tool-param-algorithm').onchange();assert.equal(owner.active(),true);assert.equal(root.querySelector('.detection-text-option input').checked,true);assert.equal(h.calls.length,0);
  const image={blob:new Blob(['transport']),sourceSha256:sha,width:640,height:480},initial=await createIndividualScientificScope(image,{rectangles:[{x0:10,y0:20,x1:110,y1:120}],excludeTexts:false,includeEnvelope:false}),draft=createManualScopeDraft({...image,preparation:initial});updateManualScopeZone(draft,'zone-1',{x0:12,y0:24,x1:112,y1:124},{operation:'move'});const manual=await applyManualScopeDraft({...image,preparation:initial},draft),origin=structuredClone(manual.manual.zones[0].originalGeometry);
  await owner.restore({schema:'sherloq.individual-regions/1',sourceSha256:sha,scope:manual,excludeTexts:true});await root.getElementById('task-run').onclick();await settle();
  assert.equal(preparationCalls.length,1);assert.equal(preparationCalls[0].settings.textOnly,true);assert.equal(h.calls.length,1);const task=h.calls[0];assert.equal(task.scientificScope.sourceSha256,sha);assert.equal(task.scientificScope.width,640);assert.equal(task.scientificScope.height,480);assert.deepEqual(task.scientificScope.excluded,[textPolygon,[[0,0],[640,0],[640,24],[0,24]],[[0,24],[12,24],[12,124],[0,124]],[[112,24],[640,24],[640,124],[112,124]],[[0,124],[640,124],[640,480],[0,480]]]);assert.deepEqual(task.params.regions,[[[12,24],[112,24],[112,124],[12,124]]]);assert.deepEqual(owner.scope.manual.zones[0].originalGeometry,origin);assert.equal(owner.scope.text.rawDetection.metadata.model.sha256,SCIENTIFIC_TEXT_MODEL.sha256);assert.equal(root.querySelector('.detection-text-option input').checked,true);
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
test('Cloud rotation, zoom, axes and kind reuse points without the removed data sidebar',async()=>{
 const h=environment();try{
  const {controller,root}=h.mount('colors.plots');h.adopt(controller);await h.flush();h.draw();assert.deepEqual(h.calls.map(x=>x.operation),['colors.plots','readTable']);
  for(const [key,value]of [['kind','"3d"'],['x','0'],['alpha','.5']]){const input=root.getElementById('tool-param-'+key);input.value=value;input.onchange();}
  const canvas=root.querySelector('.scatter-canvas'),event=(type,values)=>{const e=new h.window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,values);canvas.dispatchEvent(e);return e;};
  event('pointerdown',{button:0,pointerId:1,clientX:10,clientY:10});event('pointermove',{pointerId:1,clientX:70,clientY:40});event('pointerup',{pointerId:1});event('wheel',{deltaY:100});h.draw();await h.flush();assert.equal(h.calls.length,2);
  assert.equal(root.querySelector('.plot-data'),null,'The removed data sidebar must not reduce the cloud viewport');
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
 bindPlotCamera(canvas,{camera,style:()=>({kind:'3d'}),changed:()=>draws++,reset(){},getNavigationMode:()=> 'mouse'});
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
test('shared region editing preserves current geometry and starts clone analysis only after Calculate',async()=>{
 const h=sharedEnvironment();try{const{controller,root}=h.mount('tampering.copyMove.sparse'),$=id=>root.getElementById(id);h.adopt(controller);const before=await h.scope();await h.flush();assert.equal(h.calls.length,0);$('task-zones').onclick();await settle();assert.equal(h.openings.at(-1).tool,'select');assert.equal($('viewport').classList.contains('drawing'),false);assert.equal(root.querySelector('.detection-regions-panel'),null);
 const edit=h.configs.at(-1),draft=createManualScopeDraft(edit.image);updateManualScopeZone(draft,draft.zones.find(z=>z.kind==='acquisition').id,{x0:20,y0:20,x1:88,y1:102},{operation:'move'});const changed=await applyManualScopeDraft(edit.image,draft);await edit.onSave(changed);await h.flush();assert.notEqual(h.owner.scope.fingerprint,before.fingerprint);assert.equal(h.calls.length,0,'Saving zones is not a model inference');await $('task-run').onclick();assert.equal(h.calls.length,1);assert.equal(h.calls[0].operation,'tampering.copyMove.dense');assert.deepEqual(h.calls[0].params.regions[0],[[20,20],[88,20],[88,102],[20,102]]);assert.equal(h.calls[0].view.lines,false);assert.equal(controller.busy,false);
 }finally{await h.dispose();}
});

test('All native clone choices route with their own parameters and dense controls',async()=>{
 const h=environment();try{const {root,controller}=h.mount('tampering.copyMove.sparse'),$=id=>root.getElementById(id);h.adopt(controller);
  const choices=[...$('tool-param-algorithm').options].map(o=>JSON.parse(o.value));assert.equal(choices.length,22);assert.deepEqual(new Set(choices),new Set(CLONE_ALGORITHMS));
  for(const algorithm of choices){$('tool-param-algorithm').value=JSON.stringify(algorithm);$('tool-param-algorithm').onchange();await $('task-run').onclick();const task=h.calls.at(-1),dense=algorithm.includes('PatchMatch');assert.equal(task.operation,dense?'tampering.copyMove.dense':'tampering.copyMove.sparse',algorithm);assert.equal(task.params[dense?'profile':'algorithm'],algorithm);assert.equal($('tool-param-patch').disabled,!dense);if(dense){assert.equal(task.params.iterations,8);assert.equal(task.params.texture,2);assert.equal(task.params.flip,algorithm.endsWith(' + Mirror')||$('tool-param-reflections').checked);}if(algorithm.endsWith(' + Mirror')){assert.equal($('tool-param-reflections').disabled,true);assert.equal(task.params.flip,true);}}
 }finally{await h.dispose();}
});
test('MGCFDN receives the shared source-bound acquisition scope and explicit envelope only after Calculate',async()=>{
 const h=sharedEnvironment({segmentation:{mgcfdn:{model:{identity:'controlled-mgcf'}}}});try{const{controller,root}=h.mount('ai.clones.d2prl'),$=id=>root.getElementById(id);h.adopt(controller);$('tool-neural-method').value='mgcfdn';$('tool-neural-method').onchange();$('tool-backend').value='webgpu';$('tool-backend').onchange();const scope=await h.scope();$('task-zones').onclick();await settle();assert.equal(h.calls.length,0);assert.equal(h.loadedModels.length,0);assert.equal(h.openings.at(-1).tool,'select');assert.equal(root.querySelector('.detection-regions-list'),null);
 await $('task-run').onclick();assert.equal(h.calls.length,1);const task=h.calls[0];assert.equal(task.operation,'ai.clones.segmentation');assert.equal(task.params.variant,'mgcfdn');assert.equal(task.params.selectionPresent,true);assert.equal(task.params.scientificScope.fingerprint,scope.fingerprint);assert.equal(task.backend,'webgpu');assert.deepEqual(task.regions.map(r=>r.kind),['region','region','envelope']);assert.deepEqual(task.regions.map(r=>r.bounds),[[12,17,80,99],[110,17,178,99],[12,17,178,99]]);assert.equal(h.loadedModels.length,1);assert.equal(h.owner.scope.fingerprint,scope.fingerprint);assert.equal(controller.settings().individual.uiOptions.neuralMethod,'mgcfdn');
 }finally{await h.dispose();}
});

test('AI method, backend, profile and shared ROI edits remain explicit and preserve current submitted settings',async()=>{
 const h=sharedEnvironment({segmentation:{mgcfdn:{model:{identity:'controlled-mgcf'}},'selfdm-map':{model:{identity:'controlled-selfdm'}}}});try{const{controller,root}=h.mount('ai.clones.d2prl'),$=id=>root.getElementById(id);h.adopt(controller);const scope=await h.scope();await h.flush();for(const name of['mgcfdn','selfdm-map','d2prl','mgcfdn']){$('tool-neural-method').value=name;$('tool-neural-method').onchange();await h.flush();assert.equal(h.calls.length,0,name);assert.equal(h.loadedModels.length,0,name);} $('tool-backend').value='webgpu';$('tool-backend').onchange();$('compute-profile').value='aggressive';$('compute-profile').onchange();$('task-zones').onclick();await settle();assert.equal(h.calls.length,0);assert.equal(h.engineConfigurations.length,0);
 await $('task-run').onclick();assert.equal(h.calls.length,1);assert.equal(h.calls[0].operation,'ai.clones.segmentation');assert.equal(h.calls[0].params.variant,'mgcfdn');assert.equal(h.calls[0].params.scientificScope.fingerprint,scope.fingerprint);assert.equal(h.engineConfigurations.at(-1).computeProfile,'aggressive');$('tool-neural-method').value='d2prl';$('tool-neural-method').onchange();$('tool-param-minimum').value='750';$('tool-param-minimum').onchange();await h.flush();assert.equal(h.calls.length,1);await $('task-run').onclick();assert.equal(h.calls.length,2);assert.equal(h.calls[1].operation,'ai.clones.d2prl');assert.equal(h.calls[1].params.minimum,750);assert.equal(h.calls[1].params.scientificScope.fingerprint,scope.fingerprint);assert.equal(h.calls[1].backend,'webgpu');
 }finally{await h.dispose();}
});

test('shared D2PRL exclusions remain scientific exclusions and never become acquisition jobs',async()=>{
 const h=sharedEnvironment();try{const{controller,root}=h.mount('ai.clones.d2prl'),$=id=>root.getElementById(id);h.adopt(controller);const scope=await h.scope([{x0:20,y0:20,x1:200,y1:160},{x0:40,y0:50,x1:70,y1:90,kind:'exclusion'}]);$('task-zones').onclick();await settle();assert.equal(h.calls.length,0);assert.equal($('viewport').classList.contains('drawing'),false);await $('task-run').onclick();assert.equal(h.calls.length,1);const task=h.calls[0];assert.equal(task.operation,'ai.clones.d2prl');assert.deepEqual(task.regions.map(r=>r.bounds),[[20,20,200,160]]);assert.deepEqual(task.params.scientificScope.excluded,scope.excluded);assert(scope.excluded.some(p=>JSON.stringify(p)===JSON.stringify([[40,50],[70,50],[70,90],[40,90]])));assert.equal(h.owner.scope.fingerprint,scope.fingerprint);
 }finally{await h.dispose();}
});

test('Forgeryscope methods receive the shared native scope without reviving the removed viewport drawing mode',async()=>{
 for(const method of['forgeryscope-microscopy','forgeryscope-overlap','forgeryscope-auto','forgeryscope-duplicate']){const h=sharedEnvironment({m2Fixture:true});try{const{controller,root}=h.mount('ai.clones.d2prl'),$=id=>root.getElementById(id);h.adopt(controller);$('tool-neural-method').value=method;$('tool-neural-method').onchange();const scope=await h.scope([{x0:20,y0:20,x1:200,y1:160,type:'microscopy'},{x0:300,y0:20,x1:480,y1:160,type:'microscopy'}]);$('task-zones').onclick();await h.flush();assert.equal(h.calls.length,0);assert.equal(h.openings.at(-1).tool,'select');assert.equal($('viewport').classList.contains('drawing'),false);await $('task-run').onclick();assert.equal(h.calls.length,1,controller.snapshot().status);const task=h.calls[0];assert.equal(task.operation,'m2.forgeryscope');assert.equal(task.params.profile,method.slice('forgeryscope-'.length));assert.equal(task.params.scientificScope.fingerprint,scope.fingerprint);assert.equal(h.owner.scope.fingerprint,scope.fingerprint);}finally{await h.dispose();}}
});

test('A successful subsequent run preserves the failure diagnostic, method and native cause',async()=>{
 let failed=true;const h=environment({fail:()=>failed?Object.assign(Error('Feature extraction memory allocation failed'),{code:'MEMORY_ALLOCATION',details:{allocationKind:'wasm',maximumHeapBytes:67108864,nativeStatus:-4}}):null});try{
  h.window.HTMLElement.prototype.showModal=function(){this.open=true;};h.window.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.window.Event('close'));};
  const {controller,root}=h.mount('tampering.copyMove.sparse'),$=id=>root.getElementById(id);h.adopt(controller);$('tool-param-algorithm').value='"SIFT"';$('tool-param-algorithm').onchange();await $('task-run').onclick();assert.equal($('task-errors').hidden,false);assert.equal($('task-errors').textContent,'Diagnostic (1)');
  failed=false;await $('task-run').onclick();assert.equal($('task-errors').textContent,'Diagnostic (1)');$('task-errors').onclick();const dialog=root.querySelector('dialog.error-diagnostic'),report=JSON.parse(dialog.querySelector('pre').textContent);assert.equal(report.errors[0].context.algorithm,'SIFT');assert.equal(report.errors[0].error.details.nativeStatus,-4);assert.equal(report.errors[0].context.width,640);assert.match(report.errors[0].error.stack,/Feature extraction/);dialog.close();assert.equal(!!root.querySelector('dialog.error-diagnostic'),false);
 }finally{await h.dispose();}
});

test('calculation progress finishes independently of late transport messages and removed scientific export buttons',async()=>{
 let finishRun;const gate=new Promise(resolve=>finishRun=resolve),h=environment({runGate:()=>gate});try{const{controller,root}=h.mount('inspection.adjust'),progress=root.getElementById('progress');h.adopt(controller);await h.flush();assert.equal(controller.busy,true);assert.match(controller.snapshot().status,/analysis.*5\/10/);assert.equal(Number(progress.value),.5);finishRun();await settle();const completed=controller.snapshot().status;assert.match(completed,/terminé/);assert.equal(controller.busy,false);assert.equal(Number(progress.value),1);assert.equal([...root.querySelectorAll('.tool-exports button')].some(b=>/^(JSON|NPZ)$/.test(b.textContent)),false);for(const phase of['encode-json','complete','read-export','encode-json/complete'])h.emitProgress({phase,fraction:.2});assert.equal(controller.snapshot().status,completed);assert.equal(Number(progress.value),1);assert.equal(h.calls.length,1);assert.equal(h.jsonExports.length,0);assert.equal(typeof controller.exportImage,'function','Standard File export remains the panel entry point');}finally{finishRun();await h.dispose();}
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

test('calculated Dense presentation survives opening and cancelling the shared editor without another analysis',async()=>{
 const surface={id:'dense-saved',revision:1,width:640,height:480,format:'rgb8'},h=sharedEnvironment({rasterResult:()=>surface});try{const{controller,root}=h.mount('tampering.copyMove.sparse'),$=id=>root.getElementById(id);h.adopt(controller);const scope=await h.scope();await $('task-run').onclick();const layer=$('tool-layer'),saved=layer.value,context=$('tool-presentation-context');assert.equal(controller.snapshot().hasResult,true);assert.equal(context.textContent,'Dernier résultat calculé');assert.equal(h.calls.length,1);$('task-zones').onclick();await settle();assert.equal(h.openings.at(-1).tool,'select');assert.equal(h.owner.scope.fingerprint,scope.fingerprint);assert.equal(h.calls.length,1);assert.equal(controller.snapshot().hasResult,true);assert.equal(layer.value,saved);$('layer').value='source';$('layer').onchange();assert.equal(layer.hidden,true);assert.equal(context.textContent,'Image originale · résultat calculé conservé');$('layer').value='result';$('layer').onchange();assert.equal(layer.hidden,false);controller.setCompareOriginal(true);assert.equal(layer.hidden,true);controller.setCompareOriginal(false);assert.equal(layer.hidden,false);assert.equal(h.calls.length,1);assert.equal(root.querySelector('.detection-regions-panel'),null);}finally{await h.dispose();}
});

for(const method of ['dense','mgcfdn'])test('mounted '+method+' panel omits scientific JSON/NPZ actions while preserving the standard File image export entry point',async()=>{
 const surface={id:'retained-'+method,revision:1,width:640,height:480,format:'rgb8'},h=environment({segmentation:{mgcfdn:{model:{identity:'controlled-mgcf'}}},rasterResult:()=>surface});try{const{controller,root}=h.mount(method==='dense'?'tampering.copyMove.sparse':'ai.clones.d2prl'),$=id=>root.getElementById(id);h.adopt(controller);if(method==='mgcfdn'){$('tool-neural-method').value='mgcfdn';$('tool-neural-method').onchange();}await $('task-run').onclick();assert.equal(h.calls.length,1);assert.equal(h.calls[0].operation,method==='dense'?'tampering.copyMove.dense':'ai.clones.segmentation');const labels=[...root.querySelectorAll('.tool-exports button')].map(b=>b.textContent);assert(!labels.some(v=>/JSON|NPZ|couche/i.test(v)));assert.equal(typeof controller.exportImage,'function');assert.deepEqual(controller.exportSize(),{width:640,height:480});assert.equal(h.jsonExports.length,0);assert.equal(h.calls.length,1);}finally{await h.dispose();}
});

// Actual product-owned general scope, separate from the legacy-drawing fixtures.
test('all applicable pixel panels mount the shared editor while documentary evidence keeps its original contract',async()=>{
 const h=environment({sourceSha256:'a'.repeat(64),regionControllerFactory:options=>createIndividualRegionController(options)});try{for(const id of [...Object.keys(toolCatalog),'ela.classic','ela.energy','analysis.complete','analysis.clones']){const{controller,root}=h.mount(id);const expected=!['file.digest','file.hex','file.similarity','metadata.structure','metadata.location','metadata.c2pa','metadata.exiftool'].includes(id);assert.equal(!!root.getElementById('task-zones'),expected,id);assert.equal(root.querySelector('.detection-regions-panel'),null,id);await controller.dispose();}}finally{await h.dispose();}
});
test('adding shared scope editing keeps automatic recalculation for an ordinary pixel tool',async()=>{
 let owner;const h=environment({sourceSha256:'a'.repeat(64),regionControllerFactory:options=>(owner=createIndividualRegionController(options))});try{const{controller,root}=h.mount('inspection.adjust');h.adopt(controller);await h.flush();assert.equal(owner.active(),true);assert.equal(owner.scientificActive(),false);assert.equal(h.calls.length,1);const input=root.getElementById('tool-param-brightness');input.value='20';input.onchange();await h.flush();assert.equal(h.calls.length,2);assert.equal(h.calls[1].params.brightness,20);assert.equal(owner.scope,null,'The user has not requested a local selection or OCR.');}finally{await h.dispose();}
});

test('the shared Modify regions command opens selection mode instead of starting an acquisition drawing gesture',async()=>{const opened=[],configs=[],h=environment({sourceSha256:'a'.repeat(64),regionControllerFactory:options=>createIndividualRegionController({...options,scopeEditorFactory:config=>{configs.push(config);return{open:async value=>opened.push(value),dispose:async()=>{}};}})});try{const{controller,root}=h.mount('inspection.histogram');h.adopt(controller);await h.flush();const calls=h.calls.length;root.getElementById('task-zones').onclick();await settle();assert.equal(opened.at(-1)?.tool,'select');assert.equal(typeof configs.at(-1)?.onDetectAutomatically,'function');assert.equal(typeof configs.at(-1)?.onDetectSubimages,'function');assert.equal(h.calls.length,calls,'Opening the shared editor does not calculate.');}finally{await h.dispose();}});
