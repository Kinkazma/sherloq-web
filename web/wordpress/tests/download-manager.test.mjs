import test from 'node:test';
import assert from 'node:assert/strict';
import {createDownloadManager} from '../sherloq-browser/assets/download-manager.js';
import {downloadSession} from '../sherloq-browser/assets/session-ui.js';
import {mountSessionControls} from '../sherloq-browser/assets/session-ui.js';
import {createSessionLog} from '../sherloq-browser/assets/session-log.js';
import {createDownloadShelf} from '../sherloq-browser/assets/download-shelf.js';
import {parseHTML} from 'linkedom';

function ui({clickError}={}){
 const values=new Map(),anchors=[],snapshots=[],cleaned=[],writes=[];let clock=0,counter=0;
 const body={children:[],append(node){this.children.push(node);node.parent=this;}};
 const document={documentElement:{lang:'fr'},body,createElement(tag){
  const node={tag,hidden:false,click(){if(clickError?.())throw clickError();},remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);},dataset:{},replaceChildren(){},append(){}};if(tag==='a')anchors.push(node);return node;
 },getElementById(){return null;}};
 const urlAPI={createObjectURL(blob){const url='blob:download-'+(++counter);values.set(url,{blob,created:clock});return url;},revokeObjectURL(url){values.delete(url);}};
 const sinkFactory=async()=>{const chunks=[];let aborted=false;return {storage:'opfs',async write(bytes){assert.equal(aborted,false);writes.push(bytes.byteLength);chunks.push(new Blob([bytes]));},async finish(){const blob=new Blob(chunks);return {blob,storage:'opfs',async cleanup(){cleaned.push(blob.size);}};},async abort(){aborted=true;}};};
 const manager=createDownloadManager({document,urlAPI,sinkFactory,memoryBudgetBytes:64,onChange:value=>snapshots.push(value)});
 return {manager,document,urlAPI,values,anchors,snapshots,cleaned,writes,advance(ms){clock+=ms;},async consume(url){const value=values.get(url);assert.ok(value,'The delayed consumer must still resolve the Blob URL.');return new Uint8Array(await value.blob.arrayBuffer());}};
}

test('delayed WebP consumption, retry and a second download retain both complete files until explicit release',async()=>{
 const f=ui(),bytes=Uint8Array.of(82,73,70,70,17,0,0,0,87,69,66,80),original=new Blob([bytes]),first=await f.manager.download(original,'SHERLOQ-ela-energy.webp');
 assert.equal(first.schema,'sherloq.download-lease/1');assert.equal(first.ownsTemporaryFile,true);assert.equal(first.state,'dispatched');assert.equal(first.mime,'image/webp');assert.equal(f.anchors[0].download,first.filename);assert.equal(f.document.body.children.length,0);assert.equal(f.manager.retainedMemoryBytes,0);
 f.advance(65000);assert.deepEqual(await f.consume(first.url),bytes);assert.equal(f.values.get(first.url).blob.type,'image/webp');first.dispatch();assert.equal(f.manager.snapshot()[0].attempts,2);
 const second=await f.manager.download(new Blob([Uint8Array.of(7,8,9)]),'second.png');assert.deepEqual(await f.consume(first.url),bytes);assert.equal(f.manager.retainedFiles,2);assert.equal(f.cleaned.length,0);
 await first.release();assert.equal(f.values.has(first.url),false);assert.equal(f.values.has(second.url),true);assert.equal(f.cleaned.length,1);await first.release();assert.equal(f.cleaned.length,1);await f.manager.dispose();assert.equal(f.cleaned.length,2);assert.equal(f.values.size,0);
});

test('adopting an existing OPFS export does not restage it or impose a download-count cap',async()=>{
 const f=ui();let removed=0;
 for(let i=0;i<12;i++){const artifact={blob:new Blob([new Uint8Array(256)]),storage:'opfs',cleanup:async()=>removed++};await f.manager.download(artifact,'result-'+i+'.npz');}
 assert.equal(f.writes.length,0);assert.equal(f.manager.retainedFiles,12);assert.equal(f.manager.retainedMemoryBytes,0);assert.equal(removed,0);assert.ok(f.manager.snapshot().every(record=>record.mime==='application/zip'));await f.manager.clear();assert.equal(removed,12);assert.equal(f.manager.retainedFiles,0);
});

test('unknown Blob exports are staged with bounded slices rather than a whole-file arrayBuffer copy',async()=>{
 const f=ui(),blob=new Blob([new Uint8Array(2*1024**2+13)]);blob.arrayBuffer=()=>{throw Error('Whole-file copy is forbidden.');};
 const lease=await f.manager.download(blob,'large.webp');assert.deepEqual(f.writes,[1024**2,1024**2,13]);assert.equal(lease.size,blob.size);assert.equal(f.manager.retainedMemoryBytes,0);await f.manager.dispose();
});

test('without OPFS the original Blob is retained against the aggregate available RAM, without another payload copy',async()=>{
 const f=ui(),aborted=[],manager=createDownloadManager({document:f.document,urlAPI:f.urlAPI,memoryBudgetBytes:8,sinkFactory:async()=>({storage:'memory',abort:async()=>aborted.push(true),write(){throw Error('No memory restaging.');}})});
 const original=new Blob([Uint8Array.of(1,2,3,4,5,6)],{type:'image/png'}),first=await manager.download(original,'a.png');assert.equal(f.values.get(first.url).blob,original);assert.equal(manager.retainedMemoryBytes,6);
 let failedCleanup=0;await assert.rejects(manager.download({blob:new Blob([Uint8Array.of(7,8,9)],{type:'image/png'}),cleanup:async()=>failedCleanup++},'b.png'),error=>error.code==='STORAGE_UNAVAILABLE'&&error.details.retainedBytes===6);assert.equal(failedCleanup,1);assert.equal(manager.retainedFiles,1);
 await first.release();assert.equal(manager.retainedMemoryBytes,0);const retry=await manager.download(new Blob([Uint8Array.of(7,8,9)]),'b.png');assert.equal(retry.size,3);await manager.dispose();assert.equal(manager.retainedMemoryBytes,0);assert.equal(aborted.length,3);
});

test('a refused dispatch retains a real ready link and original cause, then retries without encoding again',async()=>{
 const error=Error('Download host declined the click');let refuse=true;const f=ui({clickError:()=>refuse?error:null});
 await assert.rejects(f.manager.download(new Blob([Uint8Array.of(4,5)]),'result.webp'),value=>value===error&&value.downloadLease.state==='ready');
 const record=f.manager.snapshot()[0];assert.equal(record.error.message,error.message);assert.equal(record.state,'ready');assert.equal(f.cleaned.length,0);assert.deepEqual(await f.consume(record.url),Uint8Array.of(4,5));refuse=false;f.manager.dispatch(record.id);assert.equal(f.writes.length,1);assert.equal(f.manager.snapshot()[0].state,'dispatched');await f.manager.dispose();
});

test('cancel before dispatch and dispose during a pending disk write clean resources and never dispatch partial files',async()=>{
 const f=ui(),cancel=new AbortController();cancel.abort();let incomingCleaned=0;await assert.rejects(f.manager.download({blob:new Blob([Uint8Array.of(1)]),cleanup:async()=>incomingCleaned++},'cancel.png',{signal:cancel.signal}),{code:'CANCELLED'});assert.equal(incomingCleaned,1);assert.equal(f.anchors.length,0);
 let unblock,entered,aborted=0;const waiting=new Promise(resolve=>unblock=resolve),started=new Promise(resolve=>entered=resolve),manager=createDownloadManager({document:f.document,urlAPI:f.urlAPI,sinkFactory:async()=>({storage:'opfs',async write(){entered();await waiting;},finish(){throw Error('Cancelled data must not be finalized.');},abort:async()=>aborted++})});
 const pending=manager.download(new Blob([Uint8Array.of(2)]),'pending.webp');await started;const disposal=manager.dispose();unblock();await assert.rejects(pending,{code:'DOWNLOAD_MANAGER_DISPOSED'});await disposal;assert.equal(aborted,1);assert.equal(manager.retainedFiles,0);assert.equal(f.anchors.length,0);
});

test('a signal aborted after dispatch does not silently destroy a completed file offered to the user',async()=>{
 const f=ui(),controller=new AbortController(),lease=await f.manager.download(new Blob([Uint8Array.of(3)]),'result.webp',{signal:controller.signal});controller.abort();f.advance(120000);assert.deepEqual(await f.consume(lease.url),Uint8Array.of(3));assert.equal(f.cleaned.length,0);await f.manager.dispose();
});

test('session cleanup transfers to a download lease and has no independent timeout or second cleanup',async()=>{
 const f=ui();let cleaned=0;const timers=[],blob=new Blob(['{"session":"complete","events":[]}'],{type:'application/json'});
 const result=await downloadSession({document:null,log:{id:'complete',length:0,async exportTo(sink){await sink.write(new TextEncoder().encode(await blob.text()));return {session:'complete',eventCount:0};}},sinkFactory:async()=>({async write(){},async finish(){return {blob,storage:'opfs',cleanup:async()=>cleaned++};},abort:async()=>{}}),download:(...args)=>f.manager.download(...args),schedule:callback=>timers.push(callback),emit(){}});
 assert.equal(result.ok,true);assert.equal(result.downloadState,'dispatched');assert.equal(timers.length,0);assert.equal(cleaned,0);f.advance(120000);assert.equal(JSON.parse(new TextDecoder().decode(await f.consume(f.manager.snapshot()[0].url))).session,'complete');await f.manager.dispose();assert.equal(cleaned,1);
});

test('session dispatch failure keeps its ready file instead of running the caller cleanup',async()=>{
 const error=Error('Host temporarily unavailable'),f=ui({clickError:()=>error});let cleaned=0;
 const result=await downloadSession({document:null,log:{id:'s',length:0,async exportTo(){return {session:'s',eventCount:0};}},sinkFactory:async()=>({write:async()=>{},finish:async()=>({blob:new Blob(['{}'],{type:'application/json'}),storage:'opfs',cleanup:async()=>cleaned++}),abort:async()=>{}}),download:(...args)=>f.manager.download(...args),emit(){}});
 assert.equal(result.ok,false);assert.equal(result.error,error);assert.equal(cleaned,0);assert.equal(f.manager.snapshot()[0].state,'ready');await f.manager.dispose();assert.equal(cleaned,1);
});

test('startup session controls bind later workspace downloads without duplicate handlers and keep both menu and banner files visible',async()=>{
 const {document}=parseHTML('<html lang="fr"><body><nav id="file-menu"><div></div></nav></body></html>'),log=createSessionLog({id:'startup-workspace-rebind'}),subscribe=log.subscribe;let subscriptions=0;
 log.subscribe=callback=>{subscriptions++;return subscribe(callback);};
 mountSessionControls(document,{log});const save=document.getElementById('export-session-log');assert.ok(save);
 const shelf=createDownloadShelf({document});mountSessionControls(document,{download:shelf.download,log});mountSessionControls(document,{download:shelf.download,log});
 assert.equal(document.querySelectorAll('#export-session-log').length,1);assert.equal(subscriptions,1);save.click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(shelf.manager.retainedFiles,1);const first=shelf.manager.snapshot()[0],filename='SHERLOQ-session-'+log.id+'.json',downloadButton=shelf.element.querySelector('button[aria-label="Télécharger : '+filename+'"]');assert.ok(downloadButton);assert.equal(first.filename,filename);const report=JSON.parse(await(await fetch(first.url)).text());assert.equal(report.session,log.id);assert.equal(shelf.element.querySelector('.download-shelf-name').title,filename);assert.equal(shelf.element.querySelectorAll('a').length,0);assert.equal(save.disabled,false);downloadButton.click();assert.equal(shelf.manager.snapshot()[0].attempts,2);
 log.append({level:'error',kind:'dependency.wait',key:'model/test.onnx',error:{code:'NETWORK_FAILED',message:'Test-only dependency failure'}});const banner=document.getElementById('dependency-retry'),journal=[...banner.querySelectorAll('button')].find(button=>button.textContent==='Exporter le journal');assert.ok(journal);journal.click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(shelf.manager.retainedFiles,2);assert.equal(shelf.element.querySelectorAll('button[aria-label="Télécharger : '+filename+'"]').length,2);assert.equal(shelf.element.querySelectorAll('a').length,0);assert.equal(subscriptions,1);assert.ok(shelf.manager.snapshot().every(record=>record.mime==='application/json'));await shelf.dispose();assert.equal(shelf.manager.retainedFiles,0);await log.close();
});
