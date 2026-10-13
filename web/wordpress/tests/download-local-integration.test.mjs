import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createDownloadManager} from '../sherloq-browser/assets/download-manager.js';
import {createDownloadShelf,getDocumentDownloadShelf} from '../sherloq-browser/assets/download-shelf.js';
import {localActivityBusy,localActivityFrozen,setLocalActivityFrozen} from '../sherloq-browser/assets/local-activity.js';
import {registerLocalUpdateClient} from '../sherloq-browser/assets/local-update-core.js';
import {downloadPreferenceBackup} from '../sherloq-browser/assets/preferences-recovery.js';
import {downloadOfflineLauncher} from '../sherloq-browser/assets/offline-launcher-download.js';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const documentFixture=()=>parseHTML('<html lang="fr"><body><aside><footer></footer></aside></body></html>').document;

test('one update probe rejects only active preparation/native writing and not retained ready files',async()=>{
 const document=documentFixture(),prepareEntered=deferred(),prepareGate=deferred(),saveEntered=deferred(),saveGate=deferred();let listener,pickers=0;
 const replies=[],worker={addEventListener(_name,fn){listener=fn;},removeEventListener(){listener=null;}},remove=registerLocalUpdateClient({serviceWorker:worker,canActivate:()=>true}),manager=createDownloadManager({document,showSaveFilePicker:()=>{pickers++;return {createWritable:async()=>({async write(){saveEntered.resolve();await saveGate.promise;},close:async()=>{},abort:async()=>{}})};},sinkFactory:async()=>({storage:'opfs',async write(){prepareEntered.resolve();await prepareGate.promise;},finish:async()=>({blob:new Blob(['exact']),storage:'opfs',cleanup:async()=>{}}),abort:async()=>{}})});
 const probe=async()=>{await listener({data:{type:'local-update-probe'},ports:[{postMessage:value=>replies.push(value)}]});return replies.at(-1);};setLocalActivityFrozen(false);
 try{
  const preparing=manager.download(new Blob(['exact']),'image.webp',{autoDispatch:false});await prepareEntered.promise;assert.equal(localActivityBusy(),true);assert.deepEqual(await probe(),{ready:false});prepareGate.resolve();const lease=await preparing;assert.equal(localActivityBusy(),false);assert.deepEqual(await probe(),{ready:true});assert.equal(localActivityFrozen(),true);await listener({data:{type:'local-update-cancel'}});
  const saving=manager.save(lease.id);assert.equal(pickers,1,'The native picker is invoked before yielding.');assert.equal(localActivityBusy(),true);await saveEntered.promise;assert.deepEqual(await probe(),{ready:false});saveGate.resolve();await saving;assert.equal(localActivityBusy(),false);assert.deepEqual(await probe(),{ready:true});assert.equal(manager.retainedFiles,1);await listener({data:{type:'local-update-cancel'}});
 }finally{prepareGate.resolve();saveGate.resolve();setLocalActivityFrozen(false);await manager.dispose();remove();}
});

test('activation freeze refuses new preparation/save without opening a picker or leaking an incoming artifact',async()=>{
 const document=documentFixture();let incomingCleaned=0,pickers=0;const manager=createDownloadManager({document,showSaveFilePicker:()=>{pickers++;throw Error('Frozen native picker must not open.');}}),lease=await manager.download({blob:new Blob(['prepared']),storage:'opfs'},'existing.png',{autoDispatch:false});
 setLocalActivityFrozen(true);try{
  await assert.rejects(manager.download({blob:new Blob(['next']),storage:'opfs',cleanup:async()=>incomingCleaned++},'next.png'),{code:'LOCAL_FROZEN'});assert.equal(incomingCleaned,1);await assert.rejects(manager.save(lease.id),{code:'LOCAL_FROZEN'});assert.equal(pickers,0);assert.equal(manager.retainedFiles,1);assert.equal(localActivityBusy(),false);
 }finally{setLocalActivityFrozen(false);await manager.dispose();}
});

test('early preference/launcher exports share one shelf, relocate intact to the explicit dock and survive plain helper lookups',async()=>{
 const document=documentFixture(),errors=[],first=getDocumentDownloadShelf(document),backup={schema:'sherloq.preference-backup/1',capturedAt:'synthetic',entries:{'sherloq.custom':{raw:'{"unknown":"preserved"}'}},library:{reconnectRequired:false},issues:[]};
 const returned=await downloadPreferenceBackup(document,backup),html='<!doctype html><title>Verified synthetic launcher</title>';assert.equal(returned.schema,backup.schema);await downloadOfflineLauncher(document,html);assert.equal(first.manager.retainedFiles,2);const before=first.manager.snapshot(),dock=document.querySelector('aside'),moved=createDownloadShelf({document,parent:dock,before:dock.querySelector('footer'),language:()=> 'en',onError:error=>errors.push(error)});
 assert.equal(moved,first);assert.equal(moved.element.parentElement,dock);assert.equal(getDocumentDownloadShelf(document),first);assert.equal(first.element.parentElement,dock);assert.equal(document.querySelectorAll('.download-shelf').length,1);assert.deepEqual(first.manager.snapshot().map(row=>[row.id,row.url]),before.map(row=>[row.id,row.url]));
 const htmlFile=before.find(row=>row.filename==='SHERLOQ.html'),jsonFile=before.find(row=>row.mime==='application/json');assert.equal(await(await fetch(htmlFile.url)).text(),html);const restored=JSON.parse(await(await fetch(jsonFile.url)).text());assert.equal(restored.entries['sherloq.custom'].raw,backup.entries['sherloq.custom'].raw);assert.ok(first.element.querySelector('button[aria-label="Download: SHERLOQ.html"]'));assert.equal(errors.length,0);
 await first.dispose();const replacement=getDocumentDownloadShelf(document);assert.notEqual(replacement,first);assert.equal(replacement.manager.retainedFiles,0);assert.equal(document.querySelectorAll('.download-shelf').length,1);await replacement.dispose();
});
