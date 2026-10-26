import test from 'node:test';import assert from 'node:assert/strict';
import {createOriginalSourceRegionsState} from '../src/source-region-geometry.js';
const source={sourceSha256:'a'.repeat(64),width:12,height:10},zone=(id,x=1)=>({id,kind:'acquisition',x0:x,y0:1,x1:8,y1:8});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('replaceZones without a signal has exactly the same fingerprint, revision and undo/redo as an un-aborted signal',async()=>{
 const a=await createOriginalSourceRegionsState(source),b=await createOriginalSourceRegionsState(source),signal=new AbortController().signal;
 for(const zones of[[zone('a')],[zone('b',2)],[]]){await a.replaceZones(zones);await b.replaceZones(zones,{signal});assert.deepEqual(a.serialize(),b.serialize());assert.equal(a.canUndo,b.canUndo);assert.equal(a.canRedo,b.canRedo);}
 await a.undo();await b.undo();assert.deepEqual(a.serialize(),b.serialize());await a.redo();await b.redo();assert.deepEqual(a.serialize(),b.serialize());
});
test('pre-abort and invalid input do not change current, past or future',async()=>{
 const a=await createOriginalSourceRegionsState(source);await a.replaceZones([zone('a')]);await a.replaceZones([zone('b',2)]);const last=a.snapshot();await a.undo();const before=a.snapshot(),controller=new AbortController();controller.abort();
 await assert.rejects(a.replaceZones([zone('c')],{signal:controller.signal}),{code:'CANCELLED'});assert.equal(a.snapshot(),before);assert.equal(a.canRedo,true);
 await assert.rejects(a.replaceZones([{...zone('invalid'),x0:-1}]));assert.equal(a.snapshot(),before);assert.equal(a.canRedo,true);await a.redo();assert.equal(a.snapshot().fingerprint,last.fingerprint);
});
test('abort after the asynchronous digest preserves current, past and future and a new transaction can retry',async()=>{
 const a=await createOriginalSourceRegionsState(source);await a.replaceZones([zone('a')]);await a.replaceZones([zone('b',2)]);const last=a.snapshot();await a.undo();const before=a.snapshot(),controller=new AbortController(),gate=deferred(),entered=deferred(),method=crypto.subtle.digest,digest=method.bind(crypto.subtle);let held=false;
 try{crypto.subtle.digest=function(algorithm,data){if(new TextDecoder().decode(data).includes('held-digest')&&!held){held=true;entered.resolve();return gate.promise.then(()=>digest(algorithm,data));}return digest(algorithm,data);};const pending=a.replaceZones([zone('held-digest')],{signal:controller.signal});await entered.promise;controller.abort();gate.resolve();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(a.snapshot(),before);assert.equal(a.canUndo,true);assert.equal(a.canRedo,true);await a.redo();assert.equal(a.snapshot().fingerprint,last.fingerprint);await a.replaceZones([zone('retry')]);assert.equal(a.snapshot().zones[0].id,'retry');assert.equal(a.canRedo,false);}finally{crypto.subtle.digest=method;gate.resolve();}
});
