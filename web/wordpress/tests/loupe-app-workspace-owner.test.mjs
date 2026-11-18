// Ownership protocol only: actual app bridge, no pixels or numerical engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const path=new URL('../sherloq-browser/assets/app.js',import.meta.url),source=await readFile(path,'utf8');
const start=source.indexOf('async function getLoupeWorkspace('),end=source.indexOf('\nfunction channelHistogramSource(',start);
assert(start>=0&&end>start);
function fixture({parent=true}={}){
 let valid=true,resolveClient;const calls=[],owner={dispose:async()=>{},snapshot:()=>({closed:false})};
 const client={reserveRetainedHistogram(bytes,options){calls.push({bytes,options});options.onOwner(owner);return Promise.resolve(owner.dispose);}};
 const original={imageId:'original-id',hash:'original-sha',isCurrent:()=>valid,getClient:()=>new Promise(resolve=>{resolveClient=resolve;})};
 const context=vm.createContext({destroyed:false,source:{display:{id:'source-raster'}},fileInput:{name:'real-file'},imageId:'original-id',hash:'original-sha',host:{getParentBudgetSource:()=>parent?original:null},ensureIndividualClient:async()=>client,EngineError:class extends Error{constructor(code,message){super(message);this.code=code;}}});
 new vm.Script(source.slice(start,end)+'\nglobalThis.bridge=getLoupeWorkspace;',{filename:path.pathname+'#actual-workspace-bridge'}).runInContext(context);
 return{context,calls,client,owner,original,bridge:context.bridge,resolve(){resolveClient(client);},invalidate(){valid=false;}};
}
test('captured parent receives the real reservation and adopts its owner before acknowledgment',async()=>{
 const h=fixture(),adopted=[],onPeerUnavailable=()=>{};
 const task=h.bridge(512*1024**2,{onOwner:owner=>adopted.push(owner),onPeerUnavailable});assert.equal(h.calls.length,0);h.resolve();const release=await task;
 assert.equal(h.calls[0].bytes,512*1024**2);assert.equal(h.calls[0].options.onPeerUnavailable,onPeerUnavailable);assert.equal(adopted[0],h.owner);assert.equal(release,h.owner.dispose);
});
test('source replacement while the parent is opening cannot fund the new Original through an old capture',async()=>{
 const h=fixture(),task=h.bridge(1,{onOwner(){},onPeerUnavailable(){}});h.context.fileInput={name:'replacement'};h.resolve();await assert.rejects(task,{code:'SOURCE_CHANGED'});assert.equal(h.calls.length,0);
});
test('revoked captured peer cannot be replaced silently by the current panel client',async()=>{
 const h=fixture(),task=h.bridge(1,{onOwner(){},onPeerUnavailable(){}});h.invalidate();h.resolve();await assert.rejects(task,{code:'SOURCE_CHANGED'});assert.equal(h.calls.length,0);
});
test('an obsolete owner is refused before requesting a client',async()=>{
 const h=fixture();h.original.hash='other-sha';await assert.rejects(h.bridge(1,{}),{code:'SOURCE_CHANGED'});assert.equal(h.calls.length,0);
});
test('display replacement for the same Original does not invalidate a useful workspace',async()=>{
 const h=fixture(),task=h.bridge(1,{onOwner(){},onPeerUnavailable(){}});h.context.source={display:{id:'new-display'}};h.resolve();await task;assert.equal(h.calls.length,1);
});
test('a standalone image panel uses its existing client, not another engine',async()=>{
 const h=fixture({parent:false});await h.bridge(1,{onOwner(){},onPeerUnavailable(){}});assert.equal(h.calls.length,1);
});
