import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createOriginalSourceRegionsController} from '../sherloq-browser/assets/original-source-regions-controller.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function mount(options={}){const{document}=parseHTML('<html><body><section></section></body></html>');const events=[],parent=document.querySelector('section');const controller=createOriginalSourceRegionsController({document,parent,source:()=>({blob:new Blob(['source']),id:'owner',sourceSha256:'a'.repeat(64),width:12,height:10}),onChange:(value,event)=>events.push({value,event}),...options});return{controller,events};}

test('restored option cancels a proposal already awaiting its zone-commit digest',async()=>{
 const entered=deferred(),gate=deferred(),originalDigest=crypto.subtle.digest,digest=originalDigest.bind(crypto.subtle);let stopped=false;
 const h=mount({detectFactory:async()=>[{id:'late-option',kind:'acquisition',enabled:true,x0:1,y0:1,x1:8,y1:8}]});let proposal;
 try{await h.controller.ready;const before=h.controller.snapshot();crypto.subtle.digest=function(algorithm,data){if(new TextDecoder().decode(data).includes('late-option')&&!stopped){stopped=true;entered.resolve();return gate.promise.then(()=>digest(algorithm,data));}return digest(algorithm,data);};
 proposal=h.controller.detect();await entered.promise;h.controller.restoreOptions({schema:'sherloq.original-region-options/1',excludeTexts:false});gate.resolve();
 await assert.rejects(proposal,{code:'CANCELLED'});assert.equal(h.controller.snapshot(),before);assert.equal(h.controller.serializeOptions().excludeTexts,false);
 }finally{crypto.subtle.digest=originalDigest;gate.resolve();await proposal?.catch(()=>{});await h.controller.dispose();}
});

test('a frozen preparation primary survives an independent cleanup rejection',async()=>{
 const primary=Object.freeze(Object.assign(new Error('preparation failed'),{code:'MODEL_FAILURE'})),cleanup=new Error('cleanup rejected');let disposals=0;
 const h=mount({preparationClientFactory:async()=>({async prepare(){throw primary;},async dispose(){if(++disposals===1)throw cleanup;}})});
 try{await h.controller.ready;const before=h.controller.snapshot();await assert.rejects(h.controller.detect(),e=>e===primary);assert.equal(disposals,1);assert.equal(h.controller.snapshot(),before);assert.equal(h.controller.busy,false);}finally{await h.controller.dispose();}
});

test('failed client ACKs stay owned across concurrent dispose and permit a later explicit retry',async()=>{
 const primary=Object.freeze(new Error('prepare primary')),entered=deferred(),gate=deferred();let disposals=0,live=true;
 const h=mount({preparationClientFactory:async()=>({async prepare(){throw primary;},async dispose(){disposals++;if(disposals===1)throw new Error('first ACK');if(disposals===2){entered.resolve();await gate.promise;throw Object.freeze(new Error('second ACK'));}live=false;}})});
 await h.controller.ready;await assert.rejects(h.controller.detect(),e=>e===primary);assert.equal(disposals,1);assert.equal(live,true);
 const a=h.controller.dispose(),b=h.controller.dispose();assert.equal(a,b);await entered.promise;assert.equal(live,true);gate.resolve();await assert.rejects(a,/second ACK/);assert.equal(disposals,2);assert.equal(live,true);
 await h.controller.dispose();assert.equal(disposals,3);assert.equal(live,false);assert.equal(h.controller.serializeOptions(),null);
});

test('cancel while retrying an old client ACK never creates a new preparation client',async()=>{
 const gate=deferred(),entered=deferred();let disposals=0,factories=0;
 const h=mount({preparationClientFactory:async()=>{factories++;return{async prepare(){throw Error('prepare');},async dispose(){if(++disposals===1)throw Error('first ACK');entered.resolve();await gate.promise;}};}});
 try{await h.controller.ready;await assert.rejects(h.controller.detect());const retry=h.controller.detect();await entered.promise;h.controller.cancel();gate.resolve();await assert.rejects(retry,{code:'CANCELLED'});assert.equal(factories,1);assert.equal(h.controller.busy,false);}finally{gate.resolve();await h.controller.dispose();}
});

test('falsy and primitive preparation primaries survive cleanup errors',async()=>{
 for(const primary of[undefined,null,0,'primary']){let disposals=0,caught=false,failure;const h=mount({preparationClientFactory:async()=>({async prepare(){throw primary;},async dispose(){if(++disposals===1)throw Error('ACK');}})});try{await h.controller.ready;try{await h.controller.detect();}catch(error){caught=true;failure=error;}assert(caught);assert.equal(failure,primary);}finally{await h.controller.dispose();}}
});
