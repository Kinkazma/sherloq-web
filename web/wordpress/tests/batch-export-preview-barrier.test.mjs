import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBatchUI} from '../sherloq-browser/assets/batch-ui.js';
import {createBatchResultDisplay} from '../sherloq-browser/assets/batch-result-display.js';
import {pairedArchiveFixture,sha} from '../../../tests/fixtures/batch-paired-archive-fixture.mjs';
import {solidPng} from './batch-display-fixture.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
async function harness({blockRender=false,observeResults=false}={}){
 const f=await pairedArchiveFixture(),{document,window}=parseHTML('<html lang="fr"><body></body></html>'),read=deferred(),entered=deferred(),renderRead=deferred(),renderEntered=deferred(),events=[],downloads=[],timers=[],nativeGet=f.model.artifacts.get.bind(f.model.artifacts);let blocked=false,previewCalls=0,loads=0;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 window.HTMLCanvasElement.prototype.getContext=function(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};};
 window.HTMLInputElement.prototype.checkValidity=window.HTMLSelectElement.prototype.checkValidity=()=>true;
 f.model.artifacts.dispose=async()=>{};
 f.model.artifacts.get=async path=>{if(path===f.count+'.npz'&&!blocked){blocked=true;events.push('preview-count-read');entered.resolve();await read.promise;events.push('preview-count-read-settled');}return nativeGet(path);};
 const png=solidPng([40,135,235]),bytes=new Uint8Array(await png.arrayBuffer());
 const service=createBatchResultDisplay({artifacts:f.model.artifacts,toolFactory:async()=>({source:{sha256:sha,surface:{id:'source',width:32,height:8,format:'rgb8'}},async load(){loads++;events.push('render-load');},async readWindow(_surface,rect){return {width:rect.width,height:rect.height,data:new Uint8Array(rect.width*rect.height*3)};},run(){throw Error('No detector run');},analyze(){throw Error('No model inference');},dispose:async()=>events.push('render-disposed')}),dependencies:{geometryFactory:async()=>({async entry(_method,polygons,count,provenance){return {entry:{polygons:polygons.map(side=>side.slice(0,4)),count,provenance},release(){}};},compare:()=>({overlap:0}),dispose(){}}),rasterFactory:()=>({async create(surface,_options,{signal}){signal.throwIfAborted();if(blockRender){renderEntered.resolve();await renderRead.promise;signal.throwIfAborted();}const frame=await surface.readWindow({x:0,y:0,width:32,height:8},{signal});frame.release();return {id:'test-png',revision:1,byteLength:png.size,sha256:'b'.repeat(64)};},async read({offset,length}){return {bytes:bytes.slice(offset,offset+length)};},release:async()=>events.push('render-release')}),sinkFactory:async()=>{const chunks=[];return {write:async bytes=>chunks.push(bytes),finish:async()=>({blob:new Blob(chunks,{type:'image/png'}),cleanup:async()=>events.push('transfer-cleaned')}),abort:async()=>events.push('transfer-aborted')};}}});
 // The report uses pdf-lib; its lazy library bundle also initializes an
 // unused PDF.js DOMMatrix singleton in this browser-UI test environment.
 const oldMatrix=globalThis.DOMMatrix;if(!oldMatrix)globalThis.DOMMatrix=class DOMMatrix{};
 const oldTimeout=globalThis.setTimeout,oldClick=window.HTMLElement.prototype.click,oldObserver=globalThis.IntersectionObserver,observers=[];let heldPreview;
 if(observeResults)globalThis.IntersectionObserver=class {
  constructor(callback){this.callback=callback;this.targets=new Set();observers.push(this);}
  observe(target){this.targets.add(target);}disconnect(){this.targets.clear();}unobserve(target){this.targets.delete(target);}
 };
 globalThis.setTimeout=(callback,delay,...args)=>delay===60000?(timers.push(callback),0):oldTimeout(callback,delay,...args);
 window.HTMLElement.prototype.click=function(){if(this.tagName==='A')downloads.push({name:this.download,url:this.href});else oldClick?.call(this);};
 const ui=await mountBatchUI({document,importerFactory:async()=>f.model,preparationFactory:()=>({prepare:async()=>{},dispose:async()=>{}}),runnerFactory:()=>{throw Error('Export must not construct a batch runner');},resultDisplayFactory:()=>({describe:image=>service.describe(image),async preparePreview(...args){previewCalls++;events.push('prepare-preview');const gate=heldPreview;heldPreview=null;if(gate){gate.signal=args[1].signal;gate.entered.resolve();await gate.ready.promise;}return service.preparePreview(...args);},ensureRendered(...args){events.push('ensure-rendered');return service.ensureRendered(...args);},dispose:()=>service.dispose()})});
 return {ui,f,read,entered,renderRead,renderEntered,events,downloads,previewCalls:()=>previewCalls,loads:()=>loads,holdNextPreview(){heldPreview={ready:deferred(),entered:deferred()};return heldPreview;},visibility(isIntersecting){const target=ui.dialog.querySelector('.batch-final-preview'),observer=[...observers].reverse().find(value=>value.targets.has(target));assert.ok(observer,'The current preview must belong to the live results observer.');observer.callback([{target,isIntersecting}]);},async close(){read.resolve();renderRead.resolve();await ui.dispose();for(const timer of timers)timer();globalThis.setTimeout=oldTimeout;window.HTMLElement.prototype.click=oldClick;if(observeResults){if(oldObserver)globalThis.IntersectionObserver=oldObserver;else delete globalThis.IntersectionObserver;}if(!oldMatrix)delete globalThis.DOMMatrix;}};
}
test('immediate PDF export waits for a cancelled preview count read to settle before using the real result manager',async()=>{
 const h=await harness(),science=JSON.stringify([h.f.model.images[0].runs,h.f.model.images[0].score,h.f.model.images[0].finalDisplay]),npz=h.f.model.artifacts.get(h.f.method+'.npz');
 try{await h.entered.promise;const job=h.ui.exportReport();await flush();assert.equal(h.previewCalls(),1,'Export rerender must not start another preview.');assert.equal(h.loads(),0);assert.equal(h.downloads.length,0);assert.equal(h.events.includes('ensure-rendered'),false,'A cancelled cached promise is still pending until its original read completes.');
  h.read.resolve();await job;assert.equal(h.downloads.length,1,h.ui.dialog.querySelector('.batch-status').textContent+'; '+h.events.join(','));assert.match(h.downloads[0].name,/\.pdf$/);assert.ok(h.events.indexOf('preview-count-read-settled')<h.events.indexOf('ensure-rendered'));assert.equal(h.loads(),1);assert.equal(JSON.stringify([h.f.model.images[0].runs,h.f.model.images[0].score,h.f.model.images[0].finalDisplay]),science);assert.equal(await h.f.model.artifacts.get(h.f.method+'.npz'),await npz);assert.doesNotMatch(h.ui.dialog.querySelector('.batch-status').textContent,/cancelled|annulé/i);
 }finally{await h.close();}
});
test('a genuine Stop during the preview-export barrier preserves results and never starts the final render or a download',async()=>{
 const h=await harness(),science=JSON.stringify([h.f.model.images[0].runs,h.f.model.images[0].score,h.f.model.images[0].finalDisplay]);
 try{await h.entered.promise;const job=h.ui.exportReport();await flush();const stop=[...h.ui.dialog.querySelectorAll('button')].find(button=>button.textContent==='Arrêter');assert.equal(stop.hidden,false);stop.onclick();h.read.resolve();await job;assert.equal(h.downloads.length,0);assert.equal(h.loads(),0);assert.equal(h.events.includes('ensure-rendered'),false);assert.match(h.ui.dialog.querySelector('.batch-status').textContent,/Export arrêté\. Les résultats sont conservés\./);assert.equal(JSON.stringify([h.f.model.images[0].runs,h.f.model.images[0].score,h.f.model.images[0].finalDisplay]),science);
 }finally{await h.close();}
});
test('Stop during the real result manager final render remains an explicit export cancellation and preserves the previous view',async()=>{
 const h=await harness({blockRender:true}),image=h.f.model.images[0],previous=JSON.stringify(image.resultDisplay),originalView=await h.f.model.artifacts.get(image.resultDisplay.files[0]);
 try{await h.entered.promise;const job=h.ui.exportReport();h.read.resolve();await h.renderEntered.promise;assert.equal(h.loads(),1);assert.equal(h.downloads.length,0);const stop=[...h.ui.dialog.querySelectorAll('button')].find(button=>button.textContent==='Arrêter');stop.onclick();h.renderRead.resolve();await job;assert.equal(h.downloads.length,0);assert.equal(JSON.stringify(image.resultDisplay),previous);assert.equal(await h.f.model.artifacts.get(image.resultDisplay.files[0]),originalView);assert.equal(h.events.filter(e=>e==='render-disposed').length,1);assert.match(h.ui.dialog.querySelector('.batch-status').textContent,/Export arrêté\. Les résultats sont conservés\./);
 }finally{await h.close();}
});

test('a result reentering the viewport before its cancelled post-export preview settles restarts without another observer event or detector run',async()=>{
 const h=await harness({observeResults:true}),science=JSON.stringify([h.f.model.images[0].runs,h.f.model.images[0].score,h.f.model.images[0].finalDisplay]),npz=await h.f.model.artifacts.get(h.f.method+'.npz');let gate;
 try{
  h.visibility(true);await h.entered.promise;h.read.resolve();for(let n=0;n<15;n++)await flush();await h.ui.exportReport();assert.equal(h.downloads.length,1);assert.equal(h.loads(),1);
  gate=h.holdNextPreview();const before=h.previewCalls();h.visibility(true);await gate.entered.promise;h.visibility(false);assert.equal(gate.signal.aborted,true);h.visibility(true);assert.equal(h.previewCalls(),before+1,'The old owner must finish before a replacement preview starts.');gate.ready.resolve();
  for(let n=0;n<20&&h.ui.dialog.querySelector('.batch-final-preview canvas').hidden;n++)await flush();
  assert.equal(h.previewCalls(),before+2,'A visible cancelled owner restarts exactly once without a further intersection notification.');assert.equal(h.ui.dialog.querySelector('.batch-final-preview canvas').hidden,false);assert.doesNotMatch(h.ui.dialog.querySelector('.batch-final-preview figcaption').textContent,/Préparation|Preparing/);assert.equal(h.loads(),1,'Only the PDF raster render loads the original; previews do not rerun a detector.');assert.equal(JSON.stringify([h.f.model.images[0].runs,h.f.model.images[0].score,h.f.model.images[0].finalDisplay]),science);assert.equal(await h.f.model.artifacts.get(h.f.method+'.npz'),npz);
 }finally{gate?.ready.resolve();await h.close();}
});
