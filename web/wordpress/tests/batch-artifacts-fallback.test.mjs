import test from'node:test';import assert from'node:assert/strict';import{createBatchArtifactStore}from'../sherloq-browser/assets/batch-artifacts.js';
function idb(){return{opens:0,deletes:0,open(){this.opens++;const request={};queueMicrotask(()=>{request.result={createObjectStore(){},close(){}};request.onupgradeneeded();request.onsuccess();});return request;},deleteDatabase(){this.deletes++;const request={};queueMicrotask(()=>request.onsuccess());return request;}};}
function opfs(state={}){
 const children=new Map(),files=new Map();
 return {
  async getDirectoryHandle(name){if(!children.has(name))children.set(name,opfs(state));return children.get(name);},
  async removeEntry(name){children.delete(name);files.delete(name);},
  async getFileHandle(name){
   if(!files.has(name))files.set(name,{blob:new Blob()});const record=files.get(name);
   return {getFile:async()=>record.blob,async createWritable(){let staged;return {async write(blob){if(state.failWrites)throw Error('write failed');staged=blob;},async close(){record.blob=staged;},async abort(){}};}};
  }
 };
}
test('available OPFS stays the primary artifacts backend',async()=>{const alternative=idb(),store=await createBatchArtifactStore({rootFactory:async()=>opfs(),locks:null,indexedDB:alternative});await store.set('a',new Blob(['native'],{type:'image/png'}));assert.equal(store.snapshot().backend,'opfs');assert.equal(await(await store.get('a')).text(),'native');assert.equal(alternative.opens,0);await store.dispose();assert.equal(store.snapshot().files,0);});
test('an OPFS setup UnknownError uses an explicitly reported IDB fallback',async()=>{const alternative=idb(),store=await createBatchArtifactStore({rootFactory:async()=>{throw new DOMException('not supported here','UnknownError');},locks:null,indexedDB:alternative});assert.equal(store.snapshot().backend,'indexeddb');assert.equal(store.snapshot().fallback.from,'opfs');assert.equal(store.snapshot().retainedResultBlobBytes,0);await store.dispose();assert.equal(alternative.opens,1);assert.equal(alternative.deletes,1);});
test('quota at setup is an authoritative error and does not trigger fallback',async()=>{const alternative=idb();await assert.rejects(createBatchArtifactStore({rootFactory:async()=>{throw new DOMException('full','QuotaExceededError');},locks:null,indexedDB:alternative}),{code:'STORAGE_QUOTA'});assert.equal(alternative.opens,0);});
test('an open OPFS store never migrates on a write failure and keeps its old artifact',async()=>{const alternative=idb(),state={},store=await createBatchArtifactStore({rootFactory:async()=>opfs(state),locks:null,indexedDB:alternative});await store.set('a',new Blob(['old']));state.failWrites=true;await assert.rejects(store.set('a',new Blob(['new'])),{code:'STORAGE_IO'});assert.equal(await(await store.get('a')).text(),'old');assert.equal(store.snapshot().files,1);assert.equal(alternative.opens,0);await store.dispose();});
