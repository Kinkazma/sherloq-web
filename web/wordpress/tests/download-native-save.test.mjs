import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDownloadManager} from '../sherloq-browser/assets/download-manager.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(picker,bytes=new Uint8Array(13)){
 const urls=new Map(),changes=[];let cleaned=0;
 const manager=createDownloadManager({document:{defaultView:{}},showSaveFilePicker:picker,onChange:value=>changes.push(value),urlAPI:{createObjectURL(blob){urls.set('blob:native-save',blob);return 'blob:native-save';},revokeObjectURL(url){urls.delete(url);}},sinkFactory(){throw Error('A prepared OPFS file must not be rendered or staged again.');}});
 const blob=new Blob([bytes],{type:'image/webp'});blob.arrayBuffer=()=>{throw Error('No whole-file read.');};
 const lease=await manager.download({blob,storage:'opfs',cleanup:async()=>cleaned++},'SHERLOQ-ela-energy.webp',{autoDispatch:false});
 return {manager,lease,urls,changes,cleaned:()=>cleaned};
}

test('Save As is called synchronously on the gesture; bounded exact bytes are acknowledged only after close',async()=>{
 const bytes=Uint8Array.from({length:2*1024**2+13},(_,i)=>i%251),closing=deferred(),entered=deferred(),events=[],parts=[];let pickerOptions;
 const f=await fixture(options=>{events.push('picker');pickerOptions=options;return Promise.resolve({async createWritable(options){assert.deepEqual(options,{keepExistingData:false});return {async write(part){events.push('write');assert.ok(part.byteLength<=1024**2);parts.push(new Blob([part]));},async close(){events.push('close');entered.resolve();await closing.promise;},abort(){throw Error('Successful output must not be aborted.');}};}});},bytes);
 assert.equal(f.manager.nativeSaveSupported,true);assert.equal(f.lease.can.nativeSaveSupported,true);const task=f.manager.save(f.lease.id);assert.deepEqual(events,['picker']);assert.equal(pickerOptions.suggestedName,f.lease.filename);assert.deepEqual(pickerOptions.types[0].accept,{'image/webp':['.webp']});
 await entered.promise;assert.equal(f.lease.state,'saving');assert.equal(f.lease.savedAt,undefined);assert.equal(f.manager.snapshot()[0].saveState,'closing');assert.equal(f.cleaned(),0);closing.resolve();const receipt=await task;
 assert.equal(receipt.confirmed,true);assert.equal(receipt.schema,'sherloq.native-file-save/1');assert.equal(receipt.size,bytes.length);assert.equal(f.lease.state,'saved');assert.ok(receipt.savedAt);assert.equal(digest(new Uint8Array(await new Blob(parts).arrayBuffer())),digest(bytes));assert.equal(f.urls.has(f.lease.url),true);await f.manager.dispose();assert.equal(f.cleaned(),1);
});

test('a partial write failure aborts the output, preserves the prepared file and retries it without rendering',async()=>{
 const original=Object.assign(Error('Destination disk write failed'),{code:'FILE_WRITE_FAILED'}),bytes=new Uint8Array(1024**2+13);bytes[0]=19;bytes[bytes.length-1]=29;let pickers=0,aborts=0,closes=0,writes=0;const parts=[];
 const firstPicker=()=>{pickers++;return {createWritable:async()=>({async write(part){writes++;if(pickers===1&&writes===2)throw original;parts.push(new Blob([part]));},async close(){closes++;},async abort(){aborts++;parts.length=0;}})};};
 const h=await fixture(firstPicker,bytes);const url=h.lease.url;await assert.rejects(h.manager.save(h.lease.id),error=>error===original&&error.downloadLease===h.lease);assert.equal(aborts,1);assert.equal(closes,0);assert.equal(h.lease.state,'ready');assert.equal(h.lease.savedAt,undefined);assert.equal(h.cleaned(),0);assert.equal(h.urls.has(url),true);
 const receipt=await h.lease.save();assert.equal(receipt.confirmed,true);assert.equal(pickers,2);assert.equal(closes,1);assert.equal(aborts,1);assert.equal(h.lease.url,url);assert.equal(digest(new Uint8Array(await new Blob(parts).arrayBuffer())),digest(bytes));await h.manager.dispose();assert.equal(h.cleaned(),1);
});

test('cancelling the picker leaves the file available and opens no writable output',async()=>{
 const error=new DOMException('The user cancelled the Save As dialog.','AbortError');
 const f=await fixture(()=>Promise.reject(error));await assert.rejects(f.manager.save(f.lease.id),value=>value===error);assert.equal(f.manager.snapshot()[0].saveState,'cancelled');assert.equal(f.lease.state,'ready');assert.equal(f.lease.savedAt,undefined);assert.equal(f.cleaned(),0);assert.equal(f.urls.has(f.lease.url),true);await f.manager.dispose();
});

test('cancel during a write aborts the destination and retains the source; release waits for its pending write',async()=>{
 const waiting=deferred(),entered=deferred();let aborted=0,closed=0;
 const f=await fixture(()=>({createWritable:async()=>({async write(){entered.resolve();await waiting.promise;},async close(){closed++;},async abort(){aborted++;}})}));
 const signal=new AbortController(),task=f.manager.save(f.lease.id,{signal:signal.signal});await entered.promise;signal.abort();const releasing=f.lease.release();assert.equal(f.cleaned(),0);waiting.resolve();await assert.rejects(task,{code:'CANCELLED'});await releasing;assert.equal(aborted,1);assert.equal(closed,0);assert.equal(f.cleaned(),1);assert.equal(f.urls.size,0);await f.manager.dispose();assert.equal(f.cleaned(),1);
});

test('close failure is not reported as saved and the temporary destination is aborted',async()=>{
 const error=Error('Destination close failed');let aborted=0;
 const f=await fixture(()=>({createWritable:async()=>({write:async()=>{},close:async()=>{throw error;},abort:async()=>aborted++})}));await assert.rejects(f.manager.save(f.lease.id),value=>value===error);assert.equal(aborted,1);assert.equal(f.lease.state,'ready');assert.equal(f.lease.savedAt,undefined);assert.equal(f.manager.snapshot()[0].saveState,'failed');assert.equal(f.cleaned(),0);await f.manager.dispose();
});

test('an unavailable native file writer is feature-detected and never substitutes a claimed save',async()=>{
 const f=await fixture(undefined);assert.equal(f.manager.nativeSaveSupported,false);assert.equal(f.lease.can.nativeSaveSupported,false);await assert.rejects(f.manager.save(f.lease.id),{code:'NATIVE_SAVE_UNAVAILABLE'});assert.equal(f.lease.state,'ready');assert.equal(f.lease.savedAt,undefined);assert.equal(f.urls.has(f.lease.url),true);assert.equal(f.cleaned(),0);await f.manager.dispose();
});
