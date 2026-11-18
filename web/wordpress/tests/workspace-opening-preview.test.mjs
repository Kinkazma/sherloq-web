import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML,DOMParser} from 'linkedom';
import {mountWorkspace} from '../sherloq-browser/assets/workspace.js';
const html=await readFile(new URL('../sherloq-browser/assets/app.html',import.meta.url),'utf8'),panel=await readFile(new URL('../sherloq-browser/assets/panel.html',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};}
function setup(){
 const {document,window}=parseHTML(html),frames=[],hosts=new Map(),owners=[],calls={loads:0,disposed:0},cleanup=deferred();
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 for(const [key,value] of Object.entries({document,window,DOMParser,location:{hash:'#lang=fr',href:'http://localhost/app.html',origin:'http://localhost'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>(frames.push(fn),frames.length),confirm:()=>true}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const workspace=mountWorkspace(document,{fetcher:async()=>({ok:true,text:async()=>panel}),originalRegionsFactory:()=>({ready:Promise.resolve(),dispose(){},serialize:()=>null,snapshot:()=>null,refresh(){},serializeOptions:()=>({})}),
  openingPreviewFactory(options){const abort=new AbortController(),owner={options,disposals:0,attached:0,ready:options.decodePreview(options.file,{signal:abort.signal}).then(value=>(owner.pixels=value.pixels,true),()=>false),attach(){owner.attached++;return{dispose(){owner.attached--;}};},dispose(){owner.disposals++;abort.abort();return Promise.all([owner.ready,cleanup.promise]);}};owners.push(owner);return owner;},
  panelFactory(_document,host){hosts.set(host.toolId,host);let file=null;return{busy:false,load(value){calls.loads++;file=value;host.onSourcePreview({pixels:{format:'rgb8',width:2,height:2,data:new Uint8Array(12)},sourceWidth:10000,sourceHeight:10000,decoder:'shared-original'},{file,imageId:'original'});},adopt(value){file=value.file;},input:()=>({file,imageId:'original',hash:'a'.repeat(64),source:{width:10000,height:10000}}),snapshot:()=>({busy:false,status:'ready',zoom:100}),settings:()=>({}),setLanguage(){},setTheme(){},setNavigation(){},setComputeProfile(){},activate(){},dispose(){calls.disposed++;}};}
 });return{document,window,workspace,hosts,owners,calls,cleanup,flush(){while(frames.length)frames.shift()();}};
}
test('workspace paints the Original preview from the same decode and retains its ACK on close',async()=>{
 const h=setup();await h.workspace.openImage(new File(['raw'],'source.ARW'));assert.equal(h.calls.loads,1);assert.equal(await h.owners[0].ready,true);assert.equal(h.owners[0].pixels.width,2);
 const closing=h.workspace.closeAll();assert.equal(h.workspace.state.documents.size,0);assert.equal(h.document.querySelectorAll('.opening-image-preview').length,0);await tick();assert.equal(h.owners[0].disposals,1);assert.equal(h.calls.disposed,0,'Original must retain its owner until the preview disposal ACK');h.cleanup.resolve();await closing;assert.equal(h.calls.disposed,1);
});
test('source presentation removes the overlay immediately while cleanup remains asynchronous',async()=>{
 const h=setup(),file=new File(['HDR'],'source.AVIF');await h.workspace.openImage(file);const host=h.hosts.get('original');assert.equal(h.owners[0].attached,1);host.onSourcePresented({imageId:'original',sourceSha256:'a'.repeat(64)});assert.equal(h.owners[0].attached,0);assert.equal(h.document.querySelectorAll('.opening-image-preview').length,0);await tick();assert.equal(h.owners[0].disposals,1);assert.equal(h.calls.disposed,0);
 const closing=h.workspace.closeAll();h.cleanup.resolve();await closing;assert.equal(h.owners[0].disposals,1);assert.equal(h.calls.disposed,1);
});
test('a stale source callback cannot publish into the replacement opening ticket',async()=>{
 const h=setup(),first=new File(['raw A'],'a.ARW'),second=new File(['raw B'],'b.ARW');await h.workspace.openImage(first);const oldHost=h.hosts.get('original');h.cleanup.resolve();await h.workspace.openImage(second);assert.equal(oldHost.onSourcePreview({pixels:{}},{file:first,imageId:'old'}),false);assert.equal(h.calls.loads,2);await h.workspace.closeAll();
});

test('a current prepared tool presentation removes its overlay without retiring the canonical source',async()=>{
 const h=setup();await h.workspace.openImage(new File(['HDR'],'source.TIFF'));await h.workspace.openTool('inspection.magnifier');const host=h.hosts.get('inspection.magnifier');assert.equal(h.owners[0].attached,1);assert.equal(h.document.querySelectorAll('.opening-image-preview').length,1,'the hidden Original has already released its own overlay');
 assert.equal(host.onToolPresented({operation:'inspection.magnifier',imageId:'original',sourceSha256:'a'.repeat(64),resultId:'prepared-result'}),true);assert.equal(h.owners[0].attached,0);assert.equal(h.workspace.state.documents.get('inspection.magnifier').element.querySelector('.opening-image-preview'),null);assert.equal(h.document.querySelectorAll('.opening-image-preview').length,0);assert.equal(h.calls.disposed,0);
 const closing=h.workspace.closeAll();h.cleanup.resolve();await closing;assert.equal(h.owners[0].disposals,1);assert.equal(h.calls.disposed,2);
});

test('tool presentation rejects wrong operation, image and hash and stale opening generations',async()=>{
 const h=setup();await h.workspace.openImage(new File(['A'],'a.TIFF'));await h.workspace.openTool('inspection.magnifier');const host=h.hosts.get('inspection.magnifier'),message={operation:'inspection.magnifier',imageId:'original',sourceSha256:'a'.repeat(64),resultId:'prepared-result'};
 for(const invalid of [{...message,operation:'inspection.adjust'},{...message,imageId:'other-image'},{...message,sourceSha256:'b'.repeat(64)}]){assert.equal(host.onToolPresented(invalid),false);assert.equal(h.owners[0].attached,1);}
 h.cleanup.resolve();await h.workspace.openImage(new File(['B'],'b.TIFF'));const overlays=h.document.querySelectorAll('.opening-image-preview').length;assert.notEqual(host.onToolPresented(message),true);assert.equal(h.document.querySelectorAll('.opening-image-preview').length,overlays);await h.workspace.closeAll();
});
