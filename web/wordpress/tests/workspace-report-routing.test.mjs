import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML,DOMParser} from 'linkedom';
import {mountWorkspace} from '../sherloq-browser/assets/workspace.js';

const html=await readFile(new URL('../sherloq-browser/assets/app.html',import.meta.url),'utf8'),panel=await readFile(new URL('../sherloq-browser/assets/panel.html',import.meta.url),'utf8');
function setup(){
 const {document,window}=parseHTML(html),frames=[],controllers=new Map(),seen=[];let notify;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 for(const [key,value]of Object.entries({document,window,DOMParser,location:{hash:'#lang=fr',href:'http://localhost/app.html',origin:'http://localhost'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>(frames.push(fn),frames.length),confirm:()=>true}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const batch={canExport:true,open(){},exportReport(){seen.push('batch');return Promise.resolve('batch report');}},workspace=mountWorkspace(document,{
  fetcher:async()=>({ok:true,text:async()=>panel}),batchFactory:async options=>{notify=options.onChange;return batch;},
  panelFactory(_,{toolId,sourceOnly}){let input;const id=sourceOnly?'original':toolId,controller={busy:false,hasReport:true,async load(file){input={file,imageId:'fixture',hash:'fixture',source:{width:10,height:10,draw(){},close(){}}};},input:()=>input,adopt:value=>input=value,snapshot:()=>({busy:false,hasReport:controller.hasReport,hasResult:false,status:'ready',progress:0,zoom:100}),exportReport(){seen.push(id);return Promise.resolve('tool report');},activate(){},settings:()=>({}),setHighlight(){},setLoupe(){},setLanguage(){},setTheme(){},setNavigation(){},setComputeProfile(){},dispose(){},fit(){},zoomBy(){}};controllers.set(id,controller);return controller;}
 });
 return {document,workspace,batch,controllers,seen,notify:()=>notify(),flush(){while(frames.length)frames.shift()();}};
}

test('global report activation and routing agree for an empty workspace, an available tool and a loading controller',async()=>{
 const h=setup(),button=h.document.getElementById('export-report');h.flush();assert.equal(button.disabled,true);
 await h.document.getElementById('batch-open').onclick();h.notify();h.flush();assert.equal(button.disabled,false);assert.equal(await button.onclick(),'batch report');assert.deepEqual(h.seen,['batch']);
 await h.workspace.openImage(new Blob(['isolated test transport']));h.flush();assert.equal(button.disabled,false);assert.equal(await button.onclick(),'tool report');assert.deepEqual(h.seen,['batch','original']);
 const entry=h.workspace.state.documents.get('original');entry.loading=true;h.notify();h.flush();assert.equal(button.disabled,false);assert.equal(await button.onclick(),'batch report');assert.deepEqual(h.seen,['batch','original','batch']);
 h.batch.canExport=false;h.notify();h.flush();assert.equal(button.disabled,true);assert.equal(await button.onclick(),undefined);assert.deepEqual(h.seen,['batch','original','batch']);
 await h.workspace.closeAll();h.flush();
});

test('an available tool without a report keeps the existing context policy and a batch availability notification refreshes the menu',async()=>{
 const h=setup(),button=h.document.getElementById('export-report');await h.document.getElementById('batch-open').onclick();await h.workspace.openImage(new Blob(['isolated test transport']));h.controllers.get('original').hasReport=false;h.notify();h.flush();assert.equal(button.disabled,true);assert.equal(await button.onclick(),undefined);assert.deepEqual(h.seen,[]);
 await h.workspace.closeAll();h.batch.canExport=false;h.notify();h.flush();assert.equal(button.disabled,true);h.batch.canExport=true;h.notify();h.flush();assert.equal(button.disabled,false);assert.equal(await button.onclick(),'batch report');assert.deepEqual(h.seen,['batch']);
});
