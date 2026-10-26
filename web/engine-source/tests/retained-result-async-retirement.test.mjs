import test from 'node:test';
import assert from 'node:assert/strict';
import {retainResult} from '../src/retained-result.js';
import {Budget} from '../src/cache.js';
const fault=()=>Object.freeze(Object.assign(new Error('ACK refused'),{code:'STORAGE_IO'}));
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function original(dispose){return{descriptor:{width:2,height:2,format:'rgb8'},readWindow:async()=>({pixels:{width:2,height:2,format:'rgb8',data:new Uint8Array(12)},release(){}}),dispose};}
test('last lease retries a rejected async parent ACK without dropping its reference twice',async()=>{
 const budget=new Budget(1024),free=budget.reserve(31),error=fault();let calls=0;
 const master=retainResult(original(async()=>{if(++calls===1)throw error;free();})),lease=master.lease();await master.dispose();
 await assert.rejects(lease.dispose(),value=>value===error);assert.equal(budget.active,31);assert.equal(calls,1);
 await lease.dispose();assert.equal(calls,2);assert.equal(budget.active,0);await lease.dispose();await master.dispose();assert.equal(calls,2);
});
test('cache owner retries a rejected last parent ACK, independently of which owner started it',async()=>{
 const budget=new Budget(1024),free=budget.reserve(17),error=fault();let calls=0;
 const master=retainResult(original(async()=>{if(++calls===1)throw error;free();})),lease=master.lease();await master.dispose();
 await assert.rejects(lease.dispose(),value=>value===error);await master.dispose();assert.equal(calls,2);assert.equal(budget.active,0);await lease.dispose();assert.equal(calls,2);
});
test('cache owner and last lease coalesce a suspended async parent ACK',async()=>{
 const ack=deferred();let calls=0;const master=retainResult(original(async()=>{calls++;await ack.promise;})),lease=master.lease();await master.dispose();
 const a=lease.dispose(),b=master.dispose(),c=lease.dispose();assert.equal(a,b);assert.equal(b,c);await turn();assert.equal(calls,1);ack.resolve();await Promise.all([a,b,c]);await master.dispose();assert.equal(calls,1);
});
test('concurrent failed retries keep the parent until one actual successful ACK',async()=>{
 const budget=new Budget(1024),free=budget.reserve(29),error=fault(),ack=deferred();let calls=0;
 const master=retainResult(original(async()=>{calls++;if(calls===1)await ack.promise;else free();}));
 const a=master.dispose(),b=master.dispose();assert.equal(a,b);ack.reject(error);const settled=await Promise.allSettled([a,b]);assert.ok(settled.every(result=>result.reason===error));assert.equal(budget.active,29);
 const c=master.dispose(),d=master.dispose();assert.equal(c,d);await Promise.all([c,d]);assert.equal(calls,2);assert.equal(budget.active,0);
});
test('a still-published UI lease keeps its master live while another lease and the cache close',async()=>{
 let calls=0;const master=retainResult(original(()=>{calls++;})),ui=master.lease(),preview=master.lease();
 await master.dispose();await preview.dispose();await preview.dispose();assert.equal(calls,0);assert.equal((await ui.readWindow()).pixels.data.length,12);await ui.dispose();assert.equal(calls,1);
 assert.throws(()=>master.lease());await assert.rejects(ui.readWindow(),{code:'DISPOSED'});
});
test('a sync parent throw preserves its primary and retry returns the final ACK promise',async()=>{
 const error=fault();let calls=0;const master=retainResult(original(()=>{if(++calls===1)throw error;}));
 assert.throws(()=>master.dispose(),value=>value===error);const retry=master.dispose();assert.equal(typeof retry.then,'function');await retry;assert.equal(master.dispose(),retry);assert.equal(calls,2);
});
