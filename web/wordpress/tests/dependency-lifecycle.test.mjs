import test from 'node:test';
import assert from 'node:assert/strict';
import {connectDependencyWorker} from '../sherloq-browser/assets/dependency-lifecycle.js';
const expected=new URL('https://example.test/assets/dependency-sw.js?manifest=abc&release=next');
class Worker extends EventTarget {constructor(url=expected.href){super();this.scriptURL=url;this.state='installing';this.messages=[];}postMessage(v){this.messages.push(v);}}
function fixture(){const service=new EventTarget(),registration=new EventTarget();service.controller=null;registration.installing=new Worker();service.register=async()=>registration;return {service,registration};}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('slow initial install completes on late controllerchange without reload or timeout failure',async()=>{
 const {service,registration}=fixture(),statuses=[];let done=false;
 const pending=connectDependencyWorker(service,expected,{onStatus:s=>statuses.push(s),slowAfterMs:1,pollMs:10000}).then(()=>done=true);
 await new Promise(r=>setTimeout(r,15));assert.equal(done,false);assert.ok(statuses.includes('slow'));
 service.controller=registration.installing;service.dispatchEvent(new Event('controllerchange'));await pending;assert.equal(done,true);
});
test('handles controller already acquired before register resolves',async()=>{
 const {service,registration}=fixture();service.register=async()=>{service.controller=registration.installing;return registration;};await connectDependencyWorker(service,expected);
});
test('waits for exact version and only acknowledges activation during bootstrap',async()=>{
 const {service,registration}=fixture();service.controller=new Worker('https://example.test/old.js');registration.waiting=registration.installing;registration.installing=null;
 let done=false;const pending=connectDependencyWorker(service,expected,{pollMs:10000}).then(()=>done=true);await turn();assert.equal(done,false);assert.deepEqual(registration.waiting.messages,[{type:'dependency-activate-when-ready'}]);
 let responses=0;const probe=source=>{const e=new Event('message');Object.assign(e,{source,data:{type:'dependency-bootstrap-ready'},ports:[{postMessage:()=>responses++}]});service.dispatchEvent(e);};
 probe(service.controller);assert.equal(responses,0);probe(registration.waiting);assert.equal(responses,1);
 service.controller=registration.waiting;service.dispatchEvent(new Event('controllerchange'));await pending;probe(registration.waiting);assert.equal(responses,1);
});
test('failed installation reports an actionable error and can register again',async()=>{
 const {service,registration}=fixture();let attempts=0;service.register=async()=>{if(++attempts===1)throw Error('network');service.controller=registration.installing;return registration;};
 await assert.rejects(connectDependencyWorker(service,expected),/network/);await connectDependencyWorker(service,expected);assert.equal(attempts,2);
});
test('redundant installer does not leave a never-settling bootstrap',async()=>{
 const {service,registration}=fixture();const pending=connectDependencyWorker(service,expected);await turn();registration.installing.state='redundant';registration.installing.dispatchEvent(new Event('statechange'));await assert.rejects(pending,/installation failed/);
});
