import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML,DOMParser} from 'linkedom';

const workspaceURL=new URL('../sherloq-browser/assets/workspace.js',import.meta.url);
let mountWorkspace;
if(process.env.SHERLOQ_BASELINE_WORKSPACE){
 let source=await readFile(process.env.SHERLOQ_BASELINE_WORKSPACE,'utf8');
 source=source.replace(/from (['"])(\.[^'"]+)\1/g,(_all,quote,value)=>'from '+quote+new URL(value,workspaceURL).href+quote).replace(/import\((['"])(\.[^'"]+)\1\)/g,(_all,quote,value)=>'import('+quote+new URL(value,workspaceURL).href+quote+')').replaceAll('import.meta.url',JSON.stringify(workspaceURL.href));
 ({mountWorkspace}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
}else({mountWorkspace}=await import(workspaceURL.href));
const html=await readFile(new URL('../sherloq-browser/assets/app.html',import.meta.url),'utf8'),panel=await readFile(new URL('../sherloq-browser/assets/panel.html',import.meta.url),'utf8');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function gate(){let resolve;const promise=new Promise(value=>resolve=value);return{promise,resolve};}
function environment(){
 const {document,window}=parseHTML(html),controllers=new Map(),events=[],frames=[],saved=new Map();let loans=0;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 for(const [key,value]of Object.entries({document,window,DOMParser,location:{hash:'#lang=fr',href:'http://localhost/app.html',origin:'http://localhost'},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>(frames.push(fn),frames.length),cancelAnimationFrame(){},confirm:()=>true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const sourceSurface={width:100,height:100,draw(){},close(){}},sourceInput={file:null,imageId:'native-parent',hash:'a'.repeat(64),source:sourceSurface};
 const workspace=mountWorkspace(document,{fetcher:async()=>({ok:true,text:async()=>panel}),originalRegionsFactory:()=>({ready:Promise.resolve(),serialize:()=>null,serializeOptions:()=>null,snapshot:()=>null,async dispose(){events.push('regions-dispose');}}),pdfFactory:async()=>{const pdf={busy:false,disposed:false,disposalCalls:0,snapshot:()=>({busy:false,status:'ready',progress:0,zoom:100,hasResult:false,hasReport:false}),setTheme(){},setNavigation(){},setLoupe(){},async dispose(){pdf.disposalCalls++;events.push('start-pdf');await pdf.onDispose?.();pdf.disposed=true;events.push('done-pdf');}};controllers.set('pdf',pdf);return pdf;},panelFactory(_root,{toolId,sourceOnly}){
  const id=sourceOnly?'original':toolId,c={busy:false,disposed:false,disposalCalls:0,loads:0,input:()=>sourceInput,async load(file){c.loads++;sourceInput.file=file;events.push('load-'+id);},adopt(){},snapshot:()=>({busy:false,hasResult:false,hasReport:false,status:'ready',progress:0,zoom:100}),activate(){},settings:()=>({}),applySettings(){},setLanguage(){},setTheme(){},setNavigation(){},setComputeProfile(){},setHighlight(){},setLoupe(){},fit(){},zoomBy(){},async dispose(){c.disposalCalls++;events.push('start-'+id);await c.onDispose?.();if(sourceOnly&&loans)throw Object.assign(Error('Native child credits are still outstanding.'),{code:'BUSY'});c.disposed=true;events.push('done-'+id);}};controllers.set(id,c);return c;
 }});
 return{workspace,controllers,events,document,borrow(id,deferred){loans++;const c=controllers.get(id);assert.ok(c,id+' is open');c.onDispose=async()=>{await deferred.promise;loans--;};},get loans(){return loans;},async cleanup(){await workspace.closeAll();for(const [key,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
}

test('Close all waits for delayed native-child ACKs before disposing Original',async()=>{
 const h=environment(),ack=gate();let closing;
 try{await h.workspace.openImage(new Blob(['first']));await h.workspace.openTool('inspection.histogram');h.borrow('inspection.histogram',ack);closing=h.workspace.closeAll();await turn();assert.equal(h.controllers.get('inspection.histogram').disposalCalls,1);assert.equal(h.controllers.get('original').disposalCalls,0);assert.equal(h.loans,1);assert.equal(h.workspace.state.documents.size,0,'views disappear immediately');ack.resolve();await closing;assert.equal(h.controllers.get('original').disposalCalls,1);assert.equal(h.controllers.get('original').disposed,true);assert.equal(h.loans,0);assert.ok(h.events.indexOf('done-inspection.histogram')<h.events.indexOf('start-original'));}
 finally{ack.resolve();await closing;await h.cleanup();}
});
test('Closing the last analysis retires its hidden Original after the analysis credits return',async()=>{
 const h=environment(),ack=gate();let closing;
 try{await h.workspace.openImage(new Blob(['first']));await h.workspace.openTool('inspection.histogram');h.borrow('inspection.histogram',ack);await h.workspace.closeDocument('original');assert.equal(h.controllers.get('original').disposalCalls,0);closing=h.workspace.closeDocument('inspection.histogram');await turn();assert.equal(h.controllers.get('original').disposalCalls,0);ack.resolve();await closing;assert.equal(h.controllers.get('original').disposed,true);assert.equal(h.loans,0);}
 finally{ack.resolve();await closing;await h.cleanup();}
});
test('ELA, SHERLOQ and histogram children close in parallel; only their parent is deferred',async()=>{
 const h=environment(),ids=['inspection.histogram','ela.classic','inspection.sherloq7c'],acks=ids.map(gate);let closing;
 try{await h.workspace.openImage(new Blob(['first']));for(let i=0;i<ids.length;i++){await h.workspace.openTool(ids[i]);h.borrow(ids[i],acks[i]);}closing=h.workspace.closeAll();await turn();for(const id of ids)assert.equal(h.controllers.get(id).disposalCalls,1,id+' started without waiting for a sibling');assert.equal(h.controllers.get('original').disposalCalls,0);acks[0].resolve();await turn();assert.equal(h.controllers.get('original').disposalCalls,0);acks[1].resolve();acks[2].resolve();await closing;assert.equal(h.controllers.get('original').disposalCalls,1);assert.equal(h.loans,0);assert.equal(h.controllers.get('original').loads,1,'no recomputation or source reload');}
 finally{for(const ack of acks)ack.resolve();await closing;await h.cleanup();}
});
test('A child cleanup failure keeps Original deferred and both owners retryable',async()=>{
 const h=environment();try{await h.workspace.openImage(new Blob(['first']));await h.workspace.openTool('inspection.histogram');const child=h.controllers.get('inspection.histogram'),parent=h.controllers.get('original');let first=true;child.onDispose=async()=>{if(first){first=false;throw Object.assign(Error('Storage close ACK pending'),{code:'STORAGE_BUSY'});}};await h.workspace.closeAll();assert.equal(parent.disposalCalls,0);assert.equal(child.disposalCalls,1);assert.equal(h.workspace.state.documents.size,0);await h.workspace.closeAll();assert.equal(child.disposalCalls,2);assert.equal(parent.disposalCalls,1);assert.equal(parent.disposed,true);}
 finally{await h.cleanup();}
});
test('Replacing the file keeps the preserved Original alive and loads it only after child retirement',async()=>{
 const h=environment(),ack=gate();let replacing;
 try{await h.workspace.openImage(new Blob(['first']));await h.workspace.openTool('inspection.histogram');h.borrow('inspection.histogram',ack);const parent=h.controllers.get('original');replacing=h.workspace.openImage(new Blob(['second']));await turn();assert.equal(parent.loads,1);assert.equal(parent.disposalCalls,0);ack.resolve();await replacing;assert.equal(parent.loads,2);assert.equal(parent.disposalCalls,0);assert.equal(parent.disposed,false);assert.equal(h.loans,0);}
 finally{ack.resolve();await replacing;await h.cleanup();}
});
test('Closing analyses preserves and reuses the same Original controller',async()=>{
 const h=environment(),ack=gate();let closing;
 try{await h.workspace.openImage(new Blob(['first']));await h.workspace.openTool('inspection.histogram');h.borrow('inspection.histogram',ack);const parent=h.controllers.get('original');closing=h.workspace.closeAnalyses();await turn();assert.equal(parent.disposalCalls,0);assert.equal(h.workspace.state.documents.get('original').controller,parent);ack.resolve();await closing;assert.equal(parent.loads,1);assert.equal(parent.disposalCalls,0);assert.equal(h.loans,0);}
 finally{ack.resolve();await closing;await h.cleanup();}
});
test('An analysis already retiring is still a dependency of a concurrent close-all',async()=>{
 const h=environment(),ack=gate();let first,second;
 try{await h.workspace.openImage(new Blob(['first']));await h.workspace.openTool('inspection.histogram');h.borrow('inspection.histogram',ack);first=h.workspace.closeDocument('inspection.histogram');await turn();second=h.workspace.closeAll();await turn();assert.equal(h.controllers.get('inspection.histogram').disposalCalls,1);assert.equal(h.controllers.get('original').disposalCalls,0);ack.resolve();await Promise.all([first,second]);assert.equal(h.controllers.get('original').disposalCalls,1);assert.equal(h.loans,0);}
 finally{ack.resolve();await Promise.all([first,second]);await h.cleanup();}
});
test('An independent PDF retirement does not delay disposal of the image Original',async()=>{
 const h=environment(),ack=gate();let closing;
 try{await h.workspace.openPDF(new File(['%PDF-1.7'],'independent.pdf',{type:'application/pdf'}));await h.workspace.openImage(new Blob(['first']));await h.workspace.openTool('inspection.histogram');h.controllers.get('pdf').onDispose=()=>ack.promise;closing=h.workspace.closeAll();await turn();assert.equal(h.controllers.get('pdf').disposalCalls,1);assert.equal(h.controllers.get('pdf').disposed,false);assert.equal(h.controllers.get('inspection.histogram').disposed,true);assert.equal(h.controllers.get('original').disposed,true);ack.resolve();await closing;assert.equal(h.controllers.get('pdf').disposed,true);}
 finally{ack.resolve();await closing;await h.cleanup();}
});
