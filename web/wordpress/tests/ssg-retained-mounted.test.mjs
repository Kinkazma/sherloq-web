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
  async localizeRetainedParameters(task){calls.push({...task,retainedOnly:true});return{id:task.id,operation:task.operation,status:'ok',surface:{id:'ssg-retained-result-'+calls.length,revision:1,width:640,height:480,format:'rgb8'},data:{width:640,height:480,mask:new Uint8Array(640*480),groups:[],points:new Float64Array(),pairs:new Float64Array(),bases:[],params:task.params},provenance:{params:task.params}};},
  async run(task,hooks){calls.push(task);progress(hooks,{phase:'analysis',fraction:.5,completed:5,total:10});await runGate(task);const failure=fail(task);if(failure)throw failure;if(task.operation==='subimages.detect')return {data:await detect()};return {id:task.id,operation:task.operation,status:'ok',provenance:{params:task.params},data:task.operation==='colors.plots'?{style:task.params,count:3,scale:1}:nativeCloneData?{width:640,height:480,mask:new Uint8Array(640*480),groups:[],points:new Float64Array(),pairs:new Float64Array(),bases:[],params:task.params}:{answer:42},...(nativeCloneData?{selectedGroups:[]}:{}) ,...(task.operation==='colors.plots'?{surface:table}:rasterResult?{surface:rasterResult(task)}:{})};},
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


// Mounted app/workspace contracts use a controlled transport. Scientific/native
// equality is covered separately by the retained-native oracle tests.
test('mounted SSG settings switched from another algorithm use retained-only finals after Calculate; upstream Sigma stays explicit',async()=>{
 const h=environment({sourceSha256:'a'.repeat(64),nativeCloneData:true,rasterResult:()=>({id:'ssg-initial',revision:1,width:640,height:480,format:'rgb8'})});try{const{controller,root}=h.mount('tampering.copyMove.sparse'),$=id=>root.getElementById(id);h.adopt(controller);$('tool-param-algorithm').value='"SSG"';$('tool-param-algorithm').onchange();await h.flush();$('tool-param-maskThreshold').value='.5';$('tool-param-maskThreshold').onchange();await h.flush();assert.equal(h.calls.length,0,'Changing local settings before Calculate must not analyze');await $('task-run').onclick();assert.equal(h.calls.length,1);assert.equal(h.calls[0].params.algorithm,'SSG');assert.equal(h.calls[0].retainedOnly,undefined);
 for(const[field,value]of Object.entries({maskThreshold:.6,minimumArea:.0002,ssimRadius:4,ssimOpening:3,roiRadius:60})){const before=h.calls.length,input=$('tool-param-'+field);input.value=String(value);input.onchange();await h.flush();assert.equal(h.calls.length,before+1,field+' did not commit');assert.equal(h.calls.at(-1).retainedOnly,true,field+' fell through to analysis');assert.equal(h.calls.at(-1).params[field],value);}
 const before=h.calls.length;$('tool-param-salienceSigma').value='.002';$('tool-param-salienceSigma').onchange();await h.flush();assert.equal(h.calls.length,before);assert.match(controller.snapshot().status,/Calculer/);assert.equal(controller.settings().individual['tampering.copyMove.sparse'].salienceSigma,.002);
 }finally{await h.dispose();}
});
