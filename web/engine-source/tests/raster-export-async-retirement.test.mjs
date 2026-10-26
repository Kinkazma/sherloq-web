import test from 'node:test';import assert from 'node:assert/strict';
import{Budget}from'../src/cache.js';import{createRasterExports}from'../src/raster-export.js';
const fault=()=>Object.freeze(Object.assign(new Error('Archive ACK refused'),{code:'STORAGE_IO'})),turn=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function archive(budget,dispose){budget.retain(23);let calls=0,done=false;const value={byteLength:4,sha256:'a'.repeat(64),store:{async readInto(dst){dst.set(Uint8Array.of(1,2,3,4).subarray(0,dst.length));}},async dispose(){if(done)return;calls++;await dispose?.(calls);done=true;budget.retained-=23;}};return{value,get calls(){return calls;}};}
const adopt=(exports,a)=>exports.adopt(a.value,{imageId:'original',operation:'controlled-owner-test',width:2,height:2});
test('adopted archive release retains the actual owner and credit until ACK succeeds',async()=>{
 const budget=new Budget(1024),exports=createRasterExports(budget),error=fault(),a=archive(budget,n=>{if(n===1)throw error;}),descriptor=adopt(exports,a);
 await assert.rejects(exports.release(descriptor.id),e=>e===error);assert.equal(exports.size,1);assert.equal(budget.retained,23);await exports.release(descriptor.id);assert.equal(exports.size,0);assert.equal(a.calls,2);assert.equal(budget.total(),0);
});
test('clear retires independent archives, retains failures and retries only their actual owners',async()=>{
 const budget=new Budget(1024),exports=createRasterExports(budget),error=fault(),a=archive(budget,n=>{if(n===1)throw error;}),b=archive(budget);adopt(exports,a);adopt(exports,b);
 await assert.rejects(exports.clear(),e=>e===error);assert.equal(exports.size,1);assert.equal(a.calls,1);assert.equal(b.calls,1);assert.equal(budget.retained,23);await exports.clear();assert.equal(exports.size,0);assert.equal(a.calls,2);assert.equal(b.calls,1);assert.equal(budget.total(),0);
});
test('release and clear coalesce a suspended archive ACK without early credit or forgotten owner',async()=>{
 const budget=new Budget(1024),exports=createRasterExports(budget),ack=deferred(),a=archive(budget,()=>ack.promise),d=adopt(exports,a);let settled=false;
 const one=exports.release(d.id),two=exports.clear();one.then(()=>settled=true);await turn();assert.equal(settled,false);assert.equal(exports.size,1);assert.equal(a.calls,1);assert.equal(budget.retained,23);ack.resolve();await Promise.all([one,two]);assert.equal(exports.size,0);assert.equal(budget.total(),0);
});
test('concurrent archive ACK rejection is exact and leaves a single retryable owner',async()=>{
 const budget=new Budget(1024),exports=createRasterExports(budget),ack=deferred(),error=fault(),a=archive(budget,n=>{if(n===1)return ack.promise;}),d=adopt(exports,a),one=exports.release(d.id),two=exports.clear();await turn();ack.reject(error);const results=await Promise.allSettled([one,two]);assert.ok(results.every(x=>x.status==='rejected'&&x.reason===error));assert.equal(a.calls,1);assert.equal(exports.size,1);await exports.clear();assert.equal(a.calls,2);assert.equal(budget.total(),0);
});
test('an export being retired cannot be read through a closing store',async()=>{
 const budget=new Budget(1024),exports=createRasterExports(budget),ack=deferred(),a=archive(budget,()=>ack.promise),d=adopt(exports,a),closing=exports.release(d.id);await turn();await assert.rejects(exports.read({exportId:d.id,revision:1,length:4}),e=>e.code==='DISPOSED');ack.resolve();await closing;assert.equal(budget.total(),0);
});
