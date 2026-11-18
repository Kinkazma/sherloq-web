import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createLoupeImageCache} from '../sherloq-browser/assets/loupe-full-client.js';
import {validateLoupeEffects} from '../sherloq-browser/assets/loupe-effects-settings.js';
import {equalizationState} from '../sherloq-browser/assets/equalization-menu.js';

// Ownership/transport protocol only. The controlled worker never calculates
// image pixels or replaces an operator. All sources reject scientific reads.
const bytes=512*1024**2,tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const source=()=>({width:512,height:512,readPixels(){assert.fail('No pixel calculation belongs to this ownership protocol.');}});
const effects=(method='sherloq7c',brightness=35)=>{const equalization=equalizationState();equalization.method=method;return validateLoupeEffects({adjust:{enabled:true,brightness},enhance:{enabled:true,mode:'equalize',equalization},sweep:{enabled:false}});};
function fixture(t,{admit,refuse=false,parentNacks=0}={}){
 const previous=globalThis.Worker,workers=[],grants=[],caches=[];let held=0,parentCalls=0;
 globalThis.Worker=class{
  constructor(){this.messages=[];this.terminated=0;workers.push(this);}
  postMessage(m){this.messages.push(m);if(m.action==='build')queueMicrotask(()=>this.onmessage?.({data:{ticket:m.ticket,resultId:m.ticket,metrics:{}}}));if(m.action==='release')queueMicrotask(()=>this.onmessage?.({data:{ticket:m.ticket,released:true}}));}
  acknowledge(){assert.equal(this.messages.filter(m=>m.action==='dispose').length,1);this.onmessage?.({data:{action:'disposed'}});}
  terminate(){this.terminated++;}
 };
 const getWorkspace=async(amount,callbacks)=>{
  assert.equal(amount,bytes);let closed=false,charged=false;
  const originalDispose=async()=>{parentCalls++;assert.equal(callbacks.onPeerUnavailable(),true,'Child must be drained before parent credit retirement.');if(parentNacks-->0)return false;if(!closed){closed=true;if(charged)held-=amount;}};
  const owner={dispose:originalDispose,snapshot:()=>({closed})};grants.push({owner,callbacks});assert.equal(callbacks.onOwner(owner),true);
  if(admit)await admit(grants.length);
  if(refuse)throw Object.assign(Error('Complete workspace cannot be financed.'),{code:'MEMORY_LIMIT'});
  charged=true;held+=amount;return originalDispose;
 };
 t.after(async()=>{for(const w of workers)if(w.messages.some(m=>m.action==='dispose')&&!w.terminated)w.acknowledge();for(const c of caches)await c.dispose().catch(()=>{});globalThis.Worker=previous;});
 return{workers,grants,get held(){return held;},get parentCalls(){return parentCalls;},cache(){const c=createLoupeImageCache({getWorkspace});caches.push(c);return c;}};
}
async function realParentDrain(owner){
 const text=await readFile(new URL('../sherloq-browser/assets/tool-client.js',import.meta.url),'utf8'),match=text.match(/async function closeRetainedHistogramOwners\(\)\{[^\n]+\}/);
 assert.ok(match,'Use the actual client retirement loop, not a copied replacement.');
 return vm.runInNewContext('('+match[0]+')',{retainedHistogramOwners:new Set([owner])})();
}

test('admission precedes the first worker POST and is reused across pointer/parameter requests',async t=>{
 const gate=deferred(),h=fixture(t,{admit:()=>gate.promise}),cache=h.cache(),input=source();cache.ensure(input,effects());await tick();
 assert.equal(h.grants.length,1);assert.equal(h.workers.length,0);
 for(let n=0;n<25;n++)cache.ensure(input,effects());assert.equal(h.grants.length,1);
 gate.resolve();await tick();assert.equal(cache.settled,true);assert.equal(h.held,bytes);assert.equal(h.workers.length,1);
 cache.ensure(input,effects('sherloq7c',36));await tick();assert.equal(h.grants.length,1);assert.equal(h.workers[0].messages.filter(m=>m.action==='build').length,2);
 assert.equal(h.grants[0].callbacks.onPeerUnavailable(),false);await tick();for(let n=0;n<25;n++)cache.ensure(input,effects('sherloq7c',36));assert.equal(h.grants.length,1,'Unavailable Original stays latched at the current parameter key.');
 const closing=cache.dispose();await tick();assert.equal(h.held,bytes);assert.equal(h.parentCalls,0);h.workers[0].acknowledge();await closing;assert.equal(h.held,0);
});

test('the actual parent-client retirement loop and cache close join the last fork and child ACK',async t=>{
 const h=fixture(t),cache=h.cache(),lease=await cache.acquire(source(),effects()),fork=lease.freeze();
 const parent=realParentDrain(h.grants[0].owner),closing=cache.dispose();await lease.close();await tick();
 assert.equal(h.parentCalls,0);assert.equal(h.held,bytes);assert.equal(h.workers[0].messages.filter(m=>m.action==='dispose').length,0);
 const last=fork.close();await tick();assert.equal(h.parentCalls,0);assert.equal(h.held,bytes);h.workers[0].acknowledge();await Promise.all([last,parent,closing]);
 assert.equal(h.parentCalls,1);assert.equal(h.held,0);assert.equal(h.workers[0].terminated,1);
});

test('a refused parent retirement keeps its retry owner and does not repeat child destruction',async t=>{
 const h=fixture(t,{parentNacks:1}),cache=h.cache();await (await cache.acquire(source(),effects())).close();const closing=cache.dispose();await tick();h.workers[0].acknowledge();
 const error=await closing.catch(e=>e);assert.equal(error.code,'BUSY');assert.equal(typeof error.cleanupOwner.dispose,'function');assert.equal(h.held,bytes);assert.equal(h.workers[0].terminated,1);
 await error.cleanupOwner.dispose();assert.equal(h.held,0);assert.equal(h.parentCalls,2);assert.equal(h.workers[0].messages.filter(m=>m.action==='dispose').length,1);
});

test('failed admission cannot create a worker or publish an unfunded child bank',async t=>{
 const h=fixture(t,{refuse:true}),cache=h.cache();await assert.rejects(cache.acquire(source(),effects()),e=>e.code==='MEMORY_LIMIT');
 assert.equal(h.grants.length,1);assert.equal(h.workers.length,0);assert.equal(h.held,0);assert.equal(h.parentCalls,1);await cache.dispose();
});

test('demotion from SHERLOQ to CLAHE releases financing after the retained old lease and ACK',async t=>{
 const h=fixture(t),cache=h.cache(),input=source(),old=await cache.acquire(input,effects());cache.ensure(input,effects('clahe'));await tick();
 assert.equal(cache.settled,true);assert.equal(h.workers.length,2);assert.equal(h.workers[1].messages.find(m=>m.action==='build').memoryBudgetBytes,128*1024**2);assert.equal(h.held,bytes);
 const releaseOld=old.close();await tick();h.workers[0].acknowledge();await releaseOld;await tick();assert.equal(h.held,0);
 for(let n=0;n<20;n++)cache.ensure(input,effects('clahe'));assert.equal(h.grants.length,1);
 const closing=cache.dispose();await tick();h.workers[1].acknowledge();await closing;
});

test('effects off retires the financed cache once, and reactivation receives a fresh captured loan',async t=>{
 const h=fixture(t),cache=h.cache(),input=source();await (await cache.acquire(input,effects())).close();for(let n=0;n<10;n++)cache.cancel();await tick();
 assert.equal(h.held,bytes);assert.equal(h.workers[0].messages.filter(m=>m.action==='dispose').length,1);h.workers[0].acknowledge();await tick();assert.equal(h.held,0);
 const again=await cache.acquire(input,effects());assert.equal(h.grants.length,2);assert.equal(h.held,bytes);await again.close();const closing=cache.dispose();await tick();h.workers[1].acknowledge();await closing;assert.equal(h.held,0);
});

test('source replacement during admission cannot POST the retired source to a late child',async t=>{
 const first=deferred(),h=fixture(t,{admit:n=>n===1?first.promise:undefined}),cache=h.cache();cache.ensure(source(),effects());await tick();const next=source();cache.ensure(next,effects());await tick();
 assert.equal(h.grants.length,2);assert.equal(h.workers.length,1);assert.equal(cache.current.source,next);first.resolve();await tick();assert.equal(h.workers.length,1);assert.equal(h.parentCalls,1);assert.equal(h.held,bytes);
 const closing=cache.dispose();await tick();h.workers[0].acknowledge();await closing;assert.equal(h.held,0);
});
