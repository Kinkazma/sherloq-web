import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML,DOMParser} from 'linkedom';
import {mountWorkspace} from '../sherloq-browser/assets/workspace.js';

const html=await readFile(new URL('../sherloq-browser/assets/app.html',import.meta.url),'utf8');
const panel=await readFile(new URL('../sherloq-browser/assets/panel.html',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
function setup({echoAttention=false,batchGate}={}){
 const {document,window}=parseHTML(html),frames=[],panels=new Map(),hosts=new Map(),calls={loads:0,sourceCloses:0,disposed:[]};let hidden=false,management,batchOptions;
 Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});Object.defineProperty(document,'visibilityState',{get:()=>hidden?'hidden':'visible',configurable:true});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 for(const[key,value]of Object.entries({document,window,DOMParser,location:{hash:'#lang=fr',href:'http://localhost/app.html',origin:'http://localhost'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>(frames.push(fn),frames.length),cancelAnimationFrame(){},confirm:()=>true}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const sharedSource={width:64,height:48,draw(){},close(){calls.sourceCloses++;}};
 const batch={busy:false,canExport:false,open(){},importFiles(){}};
 const workspace=mountWorkspace(document,{
  fetcher:async()=>({ok:true,text:async()=>panel}),
  originalRegionsFactory(){return{ready:Promise.resolve(),serialize:()=>null,serializeOptions:()=>null,snapshot:()=>null,dispose:async()=>{},keydown:()=>false};},
  localManagement:{mount(_document,options){management=options;}},
  async batchFactory(options){batchOptions=options;if(batchGate)await batchGate.promise;return batch;},
  panelFactory(_document,host){
   const id=host.sourceOnly?'original':host.toolId;let file=null,adopted=null;
   const controller={busy:false,importing:false,previewPreparationBusy:false,previewPreparationRetiring:false,attention:[],activations:0,
    async load(value){file=value;calls.loads++;},adopt(value){adopted=value;},
    input(){return adopted??{file,imageId:'shared-source',hash:'a'.repeat(64),source:sharedSource,description:file?.name};},
    snapshot(){return{busy:controller.busy||controller.previewPreparationBusy,status:'ready',progress:0,hasResult:id!=='original',hasReport:false,zoom:100};},
    attentionChanged(){controller.attention.push({active:host.isActive(),allowed:host.previewPreparationAllowed()});if(echoAttention)host.changed();},
    activate(){controller.activations++;},settings(){return{};},applySettings(){},setLanguage(){},setTheme(){},setNavigation(){},setComputeProfile(){},setLoupe(){},setHighlight(){},fit(){},zoomBy(){},
    dispose(){calls.disposed.push(id);},exportImage(){},saveSession(){}};
   panels.set(id,controller);hosts.set(id,host);return controller;
  }
 });
 function flush(){let count=0;while(frames.length){assert.ok(++count<100,'attention notifications must not create an endless render loop');frames.shift()();}}
 return{document,window,workspace,panels,hosts,calls,batch,get management(){return management;},get batchOptions(){return batchOptions;},flush,
  hide(value){hidden=value;document.dispatchEvent(new window.Event('visibilitychange'));},
  async open(){await workspace.openImage(new File(['image transport only'],'attention.png',{type:'image/png'}));flush();},
  async dispose(){window.dispatchEvent(new window.Event('pagehide'));await workspace.closeAll();flush();window.dispatchEvent(new window.Event('pagehide'));}
 };
}

test('only the selected document has attention, even when tile/cascade keep every panel visible',async()=>{
 const h=setup();try{await h.open();await h.workspace.openTool('ela.classic');await h.workspace.openTool('inspection.adjust');h.flush();const source=h.panels.get('original').input().source;
  for(const layout of ['tabs','tile','cascade']){h.document.getElementById('layout-'+layout).onclick();h.workspace.selectDocument('ela.classic');h.flush();assert.equal(h.hosts.get('ela.classic').isActive(),true);assert.equal(h.hosts.get('ela.classic').previewPreparationAllowed(),true);assert.equal(h.hosts.get('inspection.adjust').isActive(),false);if(layout!=='tabs')assert.equal(h.hosts.get('inspection.adjust').visible(),true,'visibility alone is not selection');h.workspace.selectDocument('inspection.adjust');h.flush();assert.equal(h.hosts.get('ela.classic').isActive(),false);assert.equal(h.hosts.get('inspection.adjust').isActive(),true);}
  assert.equal(h.panels.get('original').input().source,source);assert.equal(h.calls.loads,1);assert.equal(h.calls.sourceCloses,0);assert.deepEqual(h.calls.disposed,[]);
 }finally{await h.dispose();}
});

test('repeated changed/render/activate notifications are idempotent and cannot self-inhibit optional warming',async()=>{
 const h=setup({echoAttention:true});try{await h.open();await h.workspace.openTool('ela.classic');h.flush();const c=h.panels.get('ela.classic'),n=c.attention.length,a=c.activations;
  h.hosts.get('ela.classic').changed();h.hosts.get('ela.classic').changed();h.flush();h.workspace.selectDocument('ela.classic');h.flush();assert.ok(c.activations>a);assert.equal(c.attention.length,n);assert.equal(h.hosts.get('ela.classic').previewPreparationAllowed(),true);
 }finally{await h.dispose();}
});

test('native/import/gesture/retirement work in another panel blocks and resumes the selected preparer through status updates',async()=>{
 const h=setup();try{await h.open();await h.workspace.openTool('inspection.adjust');await h.workspace.openTool('ela.classic');h.flush();const other=h.panels.get('inspection.adjust'),host=h.hosts.get('ela.classic'),c=h.panels.get('ela.classic');
  for(const field of ['busy','importing','previewPreparationBusy','previewPreparationRetiring']){const before=c.attention.length;other[field]=true;assert.equal(host.previewPreparationAllowed(),false,'live getter must see work before RAF');h.hosts.get('inspection.adjust').changed();h.flush();assert.deepEqual(c.attention.at(-1),{active:true,allowed:false});assert.equal(c.attention.length,before+1);other[field]=false;h.hosts.get('inspection.adjust').changed();h.flush();assert.deepEqual(c.attention.at(-1),{active:true,allowed:true});assert.equal(c.attention.length,before+2);}
  c.previewPreparationBusy=true;h.hosts.get('ela.classic').changed();h.flush();assert.equal(host.previewPreparationAllowed(),false);c.previewPreparationBusy=false;h.hosts.get('ela.classic').changed();h.flush();assert.equal(host.previewPreparationAllowed(),true);
 }finally{await h.dispose();}
});

test('browser visibility and page lifetime revoke attention, while blur alone does not close source or calculations',async()=>{
 const h=setup();try{await h.open();await h.workspace.openTool('ela.classic');h.flush();const host=h.hosts.get('ela.classic'),c=h.panels.get('ela.classic');const count=c.attention.length;
  h.window.dispatchEvent(new h.window.Event('blur'));h.flush();assert.equal(host.isActive(),true);assert.equal(c.attention.length,count);h.hide(true);assert.equal(host.isActive(),false);assert.deepEqual(c.attention.at(-1),{active:false,allowed:false});h.hide(false);assert.equal(host.isActive(),true);assert.deepEqual(c.attention.at(-1),{active:true,allowed:true});
  h.window.dispatchEvent(new h.window.Event('pagehide'));assert.equal(host.isActive(),false);h.window.dispatchEvent(new h.window.Event('pageshow'));assert.equal(host.isActive(),true);assert.equal(h.calls.sourceCloses,0);assert.deepEqual(h.calls.disposed,[]);
 }finally{await h.dispose();}
});

test('management freeze suspends optional preparation without changing selected source ownership',async()=>{
 const h=setup();try{await h.open();await h.workspace.openTool('ela.classic');h.flush();const host=h.hosts.get('ela.classic');h.management.onFreeze(true);assert.equal(host.isActive(),true);assert.equal(host.previewPreparationAllowed(),false);h.management.onFreeze(false);assert.equal(host.previewPreparationAllowed(),true);assert.equal(h.calls.sourceCloses,0);
 }finally{await h.dispose();}
});

test('closing a panel waits for its retirement acknowledgment before another panel may prepare',async()=>{
 const h=setup(),gate=deferred();try{await h.open();await h.workspace.openTool('ela.classic');await h.workspace.openTool('inspection.adjust');h.workspace.selectDocument('ela.classic');h.flush();const c=h.panels.get('ela.classic'),oldHost=h.hosts.get('ela.classic'),original=h.panels.get('original');c.dispose=()=>gate.promise;
  const closing=h.workspace.closeDocument('ela.classic');h.workspace.selectDocument('inspection.adjust');await tick();h.flush();assert.equal(oldHost.isActive(),false);assert.equal(oldHost.previewPreparationAllowed(),false);assert.deepEqual(c.attention.at(-1),{active:false,allowed:false});assert.equal(h.hosts.get('inspection.adjust').isActive(),true);assert.equal(h.hosts.get('inspection.adjust').previewPreparationAllowed(),false);
  gate.resolve();await closing;h.flush();assert.equal(h.hosts.get('inspection.adjust').previewPreparationAllowed(),true);assert.equal(h.panels.get('original'),original);assert.equal(h.calls.loads,1);assert.equal(h.calls.sourceCloses,0);
 }finally{gate.resolve();await h.dispose();}
});

test('closing the Original view retains its shared source and does not deactivate the selected analysis',async()=>{
 const h=setup();try{await h.open();await h.workspace.openTool('ela.classic');h.flush();const original=h.panels.get('original'),source=original.input().source;await h.workspace.closeDocument('original');h.flush();assert.equal(h.hosts.get('ela.classic').isActive(),true);assert.equal(h.hosts.get('ela.classic').previewPreparationAllowed(),true);assert.equal(original.input().source,source);assert.equal(h.calls.loads,1);assert.deepEqual(h.calls.disposed,[]);assert.equal(h.calls.sourceCloses,0);
 }finally{await h.dispose();}
});

test('batch opening and batch native work block preparation, then status callback resumes it',async()=>{
 const gate=deferred(),h=setup({batchGate:gate});try{await h.open();await h.workspace.openTool('ela.classic');h.flush();const host=h.hosts.get('ela.classic'),opening=h.document.getElementById('batch-open').onclick();await tick();h.flush();assert.equal(host.previewPreparationAllowed(),false);gate.resolve();await opening;h.flush();assert.equal(host.previewPreparationAllowed(),true);h.batch.busy=true;h.batchOptions.onChange();h.flush();assert.equal(host.previewPreparationAllowed(),false);h.batch.busy=false;h.batchOptions.onChange();h.flush();assert.equal(host.previewPreparationAllowed(),true);
 }finally{gate.resolve();await h.dispose();}
});
