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
 let done=false;const pending=connectDependencyWorker(service,expected,{pollMs:10000}).then(()=>done=true);await turn();assert.equal(done,false);assert.deepEqual(registration.waiting.messages,[{type:'dependency-activate-coexist',previousManifest:null}]);
 let responses=0;const probe=source=>{const e=new Event('message');Object.assign(e,{source,data:{type:'dependency-bootstrap-ready'},ports:[{postMessage:()=>responses++}]});service.dispatchEvent(e);};
 probe(service.controller);assert.equal(responses,0);probe(registration.waiting);assert.equal(responses,1);
 service.controller=registration.waiting;service.dispatchEvent(new Event('controllerchange'));await pending;probe(registration.waiting);assert.equal(responses,1);
});
test('the same immutable resources start immediately despite a different UI worker release, without registering or activating another worker',async()=>{
 const {service}=fixture(),hash='a'.repeat(64),target=new URL('https://example.test/assets/dependency-sw.js?manifest='+hash+'&release=new');service.controller=new Worker('https://example.test/assets/dependency-sw.js?manifest='+hash+'&release=old');let registers=0;service.register=async()=>{registers++;throw Error('Existing resource identity needs no replacement');};await connectDependencyWorker(service,target);assert.equal(registers,0);assert.deepEqual(service.controller.messages,[]);
});
test('a newer resource worker receives the predecessor identity and reports activation failures instead of leaving a stuck startup',async()=>{
 const {service,registration}=fixture(),before='a'.repeat(64),after='b'.repeat(64),target=new URL('https://example.test/assets/dependency-sw.js?manifest='+after);service.controller=registration.active=new Worker('https://example.test/assets/dependency-sw.js?manifest='+before);registration.waiting=new Worker(target.href);registration.installing=null;
 const pending=connectDependencyWorker(service,target,{pollMs:10000});await turn();assert.deepEqual(registration.waiting.messages,[{type:'dependency-activate-coexist',previousManifest:before}]);const event=new Event('message');Object.assign(event,{source:registration.waiting,data:{type:'dependency-activation-error',error:'Previous inventory is unavailable'}});service.dispatchEvent(event);await assert.rejects(pending,/Previous inventory is unavailable/);
});
test('failed installation reports an actionable error and can register again',async()=>{
 const {service,registration}=fixture();let attempts=0;service.register=async()=>{if(++attempts===1)throw Error('network');service.controller=registration.installing;return registration;};
 await assert.rejects(connectDependencyWorker(service,expected),/network/);await connectDependencyWorker(service,expected);assert.equal(attempts,2);
});
test('redundant installer does not leave a never-settling bootstrap',async()=>{
 const {service,registration}=fixture();const pending=connectDependencyWorker(service,expected);await turn();registration.installing.state='redundant';registration.installing.dispatchEvent(new Event('statechange'));await assert.rejects(pending,/installation failed/);
});
